#!/bin/bash
# Export/Import complet de la base de donnees Torah Solutions
#
# Usage:
#   ./scripts/db_export_import.sh export                    # Export complet (schema + data)
#   ./scripts/db_export_import.sh export --data-only        # Export data uniquement
#   ./scripts/db_export_import.sh export --schema-only      # Export schema uniquement
#   ./scripts/db_export_import.sh export --tables "source_texts commentary_details"  # Tables specifiques
#   ./scripts/db_export_import.sh import backup.sql.gz      # Import depuis un dump
#   ./scripts/db_export_import.sh list                      # Lister les backups existants

set -euo pipefail

# --- Configuration (depuis .env ou variables d'environnement) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Charger .env.local (priorite) puis .env (fallback), en ignorant les lignes malformees
# Convention projet : les variables d'environnement sont dans .env.local
load_env_file() {
    local env_file="$1"
    [ -f "$env_file" ] || return 0
    # Parse ligne par ligne. On ignore:
    #   - lignes vides
    #   - lignes commentaires (#)
    #   - lignes avec espace avant le '=' (malformees pour bash)
    while IFS= read -r line || [ -n "$line" ]; do
        # Strip CR (fichiers Windows)
        line="${line%$'\r'}"
        # Skip blank/commentaire
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        # Accepter seulement KEY=VALUE (KEY = [A-Za-z_][A-Za-z0-9_]*)
        if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
            local key="${BASH_REMATCH[1]}"
            local value="${BASH_REMATCH[2]}"
            # Retirer quotes entourantes si presentes
            if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
                value="${BASH_REMATCH[1]}"
            fi
            export "$key=$value"
        fi
    done < "$env_file"
}

if [ -f "$PROJECT_ROOT/.env.local" ]; then
    load_env_file "$PROJECT_ROOT/.env.local"
elif [ -f "$PROJECT_ROOT/.env" ]; then
    load_env_file "$PROJECT_ROOT/.env"
fi

# --- Configuration SOURCE (lecture, export) ---
# Supporte deux conventions de nommage :
#   1. DATABASE_*        (convention script)
#   2. DB_POSTGRESDB_*   (convention n8n / .env.local)
SRC_HOST="${DATABASE_HOST:-${DB_POSTGRESDB_HOST:-localhost}}"
SRC_PORT="${DATABASE_PORT:-${DB_POSTGRESDB_PORT:-5432}}"
SRC_USER="${DATABASE_USER:-${DB_POSTGRESDB_USER:-}}"
SRC_PASSWORD="${DATABASE_PASSWORD:-${DB_POSTGRESDB_PASSWORD:-}}"
SRC_NAME="${DATABASE_NAME:-${DB_POSTGRESDB_DATABASE:-torah}}"
SRC_SCHEMA="${DATABASE_SCHEMA:-${DB_POSTGRESDB_SCHEMA:-public}}"

# --- Configuration TARGET (ecriture, import) ---
# Si les variables IMPORT_DB_* ne sont pas definies, fallback sur la source
# (= ecrase la base de prod, necessite confirmation). Pour utiliser une base
# de test separee, ajouter dans .env.local :
#   IMPORT_DB_HOST=databases.local
#   IMPORT_DB_PORT=5434
#   IMPORT_DB_USER=import_user
#   IMPORT_DB_PASSWORD=...
#   IMPORT_DB_NAME=torah_test_restore
TGT_HOST="${IMPORT_DB_HOST:-$SRC_HOST}"
TGT_PORT="${IMPORT_DB_PORT:-$SRC_PORT}"
TGT_USER="${IMPORT_DB_USER:-$SRC_USER}"
TGT_PASSWORD="${IMPORT_DB_PASSWORD:-$SRC_PASSWORD}"
TGT_NAME="${IMPORT_DB_NAME:-$SRC_NAME}"

# Repertoire des backups
BACKUP_DIR="${PROJECT_ROOT}/backups/db"
mkdir -p "$BACKUP_DIR"

# Timestamp pour les noms de fichiers
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# --- Fonctions utilitaires ---

log_info() {
    echo "[INFO] $(date '+%H:%M:%S') $1"
}

log_warn() {
    echo "[WARN] $(date '+%H:%M:%S') $1" >&2
}

log_error() {
    echo "[ERROR] $(date '+%H:%M:%S') $1" >&2
}

# Detecte la version majeure du serveur PostgreSQL SOURCE (celui qu'on dumpe).
# pg_dump exige un client >= version serveur.
detect_server_version() {
    local psql_bin="${PSQL:-psql}"
    PGPASSWORD="$SRC_PASSWORD" "$psql_bin" -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" -d "$SRC_NAME" \
        -t -A -c "SHOW server_version_num;" 2>/dev/null | awk '{print int($1/10000)}'
}

# Cherche un binaire PostgreSQL pour une version majeure donnee.
# Ordre de recherche :
#   1. /usr/lib/postgresql/<version>/bin/<tool>  (layout Debian/Ubuntu)
#   2. binaire dans le PATH si sa version correspond
# Retourne le chemin complet ou vide si introuvable.
find_pg_tool() {
    local tool="$1"   # pg_dump | psql | pg_restore
    local wanted="$2" # version majeure souhaitee (ex: 17)
    # 1) Layout Debian multi-version
    if [ -n "$wanted" ] && [ -x "/usr/lib/postgresql/$wanted/bin/$tool" ]; then
        echo "/usr/lib/postgresql/$wanted/bin/$tool"
        return 0
    fi
    # 2) Binaire dans PATH
    local bin
    bin="$(command -v "$tool" 2>/dev/null || true)"
    if [ -n "$bin" ]; then
        # Verifier la version (format: "pg_dump (PostgreSQL) 16.11 ...")
        local v
        v="$("$bin" --version 2>/dev/null | awk '{print $3}' | cut -d. -f1)"
        if [ -z "$wanted" ] || [ "$v" = "$wanted" ]; then
            echo "$bin"
            return 0
        fi
    fi
    # 3) Fallback : plus recente version installee localement
    local latest
    latest="$(ls -d /usr/lib/postgresql/*/bin/"$tool" 2>/dev/null | sort -V | tail -1 || true)"
    [ -n "$latest" ] && echo "$latest" && return 0
    return 1
}

# Variables globales resolues (remplies par check_pg_tools)
PG_DUMP=""
PSQL=""
PG_RESTORE=""

check_pg_tools() {
    # Connexion psql neutre avec n'importe quelle version (on peut toujours SELECT 1)
    local psql_any
    psql_any="$(command -v psql 2>/dev/null || true)"
    if [ -z "$psql_any" ]; then
        log_error "psql non trouve. Installez postgresql-client."
        exit 1
    fi
    PSQL="$psql_any"

    # Detecter version serveur (utilise psql any-version, compatible)
    local server_ver
    server_ver="$(detect_server_version)"
    if [ -z "$server_ver" ]; then
        log_warn "Impossible de detecter la version serveur ; fallback sur binaires PATH."
        server_ver=""
    else
        log_info "Version serveur PostgreSQL detectee: $server_ver"
    fi

    PG_DUMP="$(find_pg_tool pg_dump "$server_ver" || true)"
    PG_RESTORE="$(find_pg_tool pg_restore "$server_ver" || true)"

    if [ -z "$PG_DUMP" ] || [ -z "$PG_RESTORE" ]; then
        log_error "pg_dump/pg_restore non trouve pour version '$server_ver'."
        log_error "Installez postgresql-client-$server_ver : sudo apt-get install postgresql-client-$server_ver"
        exit 1
    fi

    # Verifier compatibilite version client >= version serveur
    if [ -n "$server_ver" ]; then
        local client_ver
        client_ver="$("$PG_DUMP" --version 2>/dev/null | awk '{print $3}' | cut -d. -f1)"
        if [ "$client_ver" -lt "$server_ver" ] 2>/dev/null; then
            log_error "pg_dump version $client_ver trop ancien pour serveur $server_ver."
            log_error "Installez postgresql-client-$server_ver : sudo apt-get install postgresql-client-$server_ver"
            exit 1
        fi
        log_info "pg_dump utilise: $PG_DUMP (version $client_ver)"
    fi
}

# Verifie la connexion a la base SOURCE (prefix SRC_)
check_connection_source() {
    if ! PGPASSWORD="$SRC_PASSWORD" psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" -d "$SRC_NAME" -c "SELECT 1" &>/dev/null; then
        log_error "Impossible de se connecter a la SOURCE: $SRC_NAME@$SRC_HOST:$SRC_PORT (user=$SRC_USER)"
        exit 1
    fi
}

# Verifie la connexion a la base TARGET (prefix TGT_)
check_connection_target() {
    if ! PGPASSWORD="$TGT_PASSWORD" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" -d "$TGT_NAME" -c "SELECT 1" &>/dev/null; then
        log_error "Impossible de se connecter a la TARGET: $TGT_NAME@$TGT_HOST:$TGT_PORT (user=$TGT_USER)"
        log_error "Verifiez les variables IMPORT_DB_* dans .env.local"
        exit 1
    fi
}

# Stats de la base SOURCE (avant export)
get_db_stats_source() {
    PGPASSWORD="$SRC_PASSWORD" psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" -d "$SRC_NAME" -t -A -c "
        SELECT json_build_object(
            'total_tables', (SELECT count(*) FROM pg_tables WHERE schemaname='$SRC_SCHEMA'),
            'total_size', pg_size_pretty(pg_database_size('$SRC_NAME')),
            'total_rows', (
                SELECT sum(n_live_tup)
                FROM pg_stat_user_tables
                WHERE schemaname='$SRC_SCHEMA'
            )
        );
    "
}

# Stats de la base TARGET (apres import)
get_db_stats_target() {
    PGPASSWORD="$TGT_PASSWORD" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" -d "$TGT_NAME" -t -A -c "
        SELECT json_build_object(
            'total_tables', (SELECT count(*) FROM pg_tables WHERE schemaname='$SRC_SCHEMA'),
            'total_size', pg_size_pretty(pg_database_size('$TGT_NAME')),
            'total_rows', (
                SELECT sum(n_live_tup)
                FROM pg_stat_user_tables
                WHERE schemaname='$SRC_SCHEMA'
            )
        );
    "
}

# Vide completement les tables de la base TARGET (DROP + recreate schema).
# Utilise pour garantir un import propre sur une base deja utilisee.
wipe_target_schema() {
    log_warn "Suppression de toutes les tables du schema '$SRC_SCHEMA' sur la TARGET..."
    PGPASSWORD="$TGT_PASSWORD" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" -d "$TGT_NAME" \
        -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS $SRC_SCHEMA CASCADE; CREATE SCHEMA $SRC_SCHEMA;" >/dev/null
    log_info "Schema '$SRC_SCHEMA' recree sur $TGT_NAME@$TGT_HOST:$TGT_PORT"
}

# --- Export ---

do_export() {
    local DATA_ONLY=false
    local SCHEMA_ONLY=false
    local TABLES=""
    local FORMAT="custom"  # custom = pg_dump format (-Fc), compressé et restaurable

    # Parser les options
    shift  # enlever "export"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --data-only)
                DATA_ONLY=true
                shift
                ;;
            --schema-only)
                SCHEMA_ONLY=true
                shift
                ;;
            --tables)
                TABLES="$2"
                shift 2
                ;;
            --sql)
                FORMAT="plain"
                shift
                ;;
            *)
                log_error "Option inconnue: $1"
                exit 1
                ;;
        esac
    done

    check_pg_tools
    check_connection_source

    # Construire le nom du fichier
    local SUFFIX=""
    if [ "$DATA_ONLY" = true ]; then
        SUFFIX="_data"
    elif [ "$SCHEMA_ONLY" = true ]; then
        SUFFIX="_schema"
    fi
    if [ -n "$TABLES" ]; then
        SUFFIX="${SUFFIX}_partial"
    fi

    local EXT="dump"
    if [ "$FORMAT" = "plain" ]; then
        EXT="sql"
    fi

    local DUMP_FILE="${BACKUP_DIR}/${SRC_NAME}_${TIMESTAMP}${SUFFIX}.${EXT}"
    local MANIFEST_FILE="${BACKUP_DIR}/${SRC_NAME}_${TIMESTAMP}${SUFFIX}_manifest.json"

    # Stats avant export
    log_info "=== EXPORT BASE DE DONNEES ==="
    log_info "Base SOURCE: $SRC_NAME@$SRC_HOST:$SRC_PORT (user=$SRC_USER)"
    log_info "Stats: $(get_db_stats_source)"

    # Construire la commande pg_dump
    local PG_DUMP_ARGS=(
        -h "$SRC_HOST"
        -p "$SRC_PORT"
        -U "$SRC_USER"
        -d "$SRC_NAME"
        -n "$SRC_SCHEMA"
        --no-owner
        --no-acl
        --verbose
    )

    if [ "$FORMAT" = "custom" ]; then
        PG_DUMP_ARGS+=(-Fc)
    else
        PG_DUMP_ARGS+=(-Fp)
    fi

    if [ "$DATA_ONLY" = true ]; then
        PG_DUMP_ARGS+=(--data-only)
    elif [ "$SCHEMA_ONLY" = true ]; then
        PG_DUMP_ARGS+=(--schema-only)
    fi

    if [ -n "$TABLES" ]; then
        for table in $TABLES; do
            PG_DUMP_ARGS+=(-t "$SRC_SCHEMA.$table")
        done
    fi

    # Executer pg_dump
    log_info "Export en cours vers $DUMP_FILE ..."
    PGPASSWORD="$SRC_PASSWORD" "$PG_DUMP" "${PG_DUMP_ARGS[@]}" > "$DUMP_FILE" 2>"${DUMP_FILE}.log"

    # Compresser si format SQL plain
    if [ "$FORMAT" = "plain" ]; then
        log_info "Compression..."
        gzip "$DUMP_FILE"
        DUMP_FILE="${DUMP_FILE}.gz"
    fi

    local FILE_SIZE
    FILE_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)

    # Generer le manifeste
    PGPASSWORD="$SRC_PASSWORD" psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" -d "$SRC_NAME" -t -A -c "
        SELECT json_build_object(
            'export_date', now(),
            'database', '$SRC_NAME',
            'host', '$SRC_HOST',
            'file', '$(basename "$DUMP_FILE")',
            'file_size', '$FILE_SIZE',
            'data_only', $DATA_ONLY,
            'schema_only', $SCHEMA_ONLY,
            'tables', (
                SELECT json_agg(json_build_object(
                    'name', tablename,
                    'rows', (SELECT n_live_tup FROM pg_stat_user_tables s WHERE s.relname = tablename)
                ) ORDER BY tablename)
                FROM pg_tables
                WHERE schemaname='$SRC_SCHEMA'
            )
        );
    " | python3 -m json.tool > "$MANIFEST_FILE"

    # Nettoyage du log
    rm -f "${DUMP_FILE%.gz}.log" "${DUMP_FILE}.log"

    log_info "=== EXPORT TERMINE ==="
    log_info "Fichier : $DUMP_FILE ($FILE_SIZE)"
    log_info "Manifeste : $MANIFEST_FILE"
}

# --- Import ---

do_import() {
    # Parse args : $1=import, $2=fichier, options possibles --wipe, --yes
    shift  # on enleve "import"
    local IMPORT_FILE=""
    local WIPE=false
    local AUTO_YES=false
    while [ $# -gt 0 ]; do
        case "$1" in
            --wipe)
                WIPE=true
                shift
                ;;
            --yes|-y)
                AUTO_YES=true
                shift
                ;;
            --*)
                log_error "Option inconnue: $1"
                exit 1
                ;;
            *)
                IMPORT_FILE="$1"
                shift
                ;;
        esac
    done

    if [ -z "$IMPORT_FILE" ]; then
        log_error "Fichier de backup manquant."
        echo "Usage: $0 import <fichier.dump|fichier.sql.gz> [--wipe] [--yes]"
        exit 1
    fi

    if [ ! -f "$IMPORT_FILE" ]; then
        log_error "Fichier non trouve: $IMPORT_FILE"
        exit 1
    fi

    check_pg_tools
    check_connection_target

    log_info "=== IMPORT BASE DE DONNEES ==="
    log_info "Fichier : $IMPORT_FILE"
    log_info "Cible TARGET : $TGT_NAME@$TGT_HOST:$TGT_PORT (user=$TGT_USER)"
    if [ "$WIPE" = true ]; then
        log_warn "--wipe actif : DROP du schema '$SRC_SCHEMA' avant import"
    fi

    # Garde-fou : si target == source, c'est la prod, demander double confirmation
    if [ "$TGT_HOST" = "$SRC_HOST" ] && [ "$TGT_PORT" = "$SRC_PORT" ] && [ "$TGT_NAME" = "$SRC_NAME" ]; then
        log_warn "TARGET = SOURCE (base de prod). Une faute de frappe peut ecraser la prod !"
    fi

    # Demander confirmation (sauf --yes)
    if [ "$AUTO_YES" != true ]; then
        echo ""
        echo "ATTENTION: Cela va ecrire dans '$TGT_NAME'."
        read -r -p "Continuer ? (y/N) " response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log_info "Import annule."
            exit 0
        fi
    fi

    # Option --wipe : vider le schema public avant import
    if [ "$WIPE" = true ]; then
        wipe_target_schema
    fi

    # Detecter le format et executer
    if [[ "$IMPORT_FILE" == *.dump ]]; then
        log_info "Format: pg_dump custom (pg_restore)"
        PGPASSWORD="$TGT_PASSWORD" "$PG_RESTORE" \
            -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" \
            -d "$TGT_NAME" \
            --clean --if-exists \
            --no-owner --no-acl \
            --verbose \
            "$IMPORT_FILE" 2>&1 | tail -20
    elif [[ "$IMPORT_FILE" == *.sql.gz ]]; then
        log_info "Format: SQL compresse (gunzip | psql)"
        gunzip -c "$IMPORT_FILE" | \
            PGPASSWORD="$TGT_PASSWORD" psql \
            -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" \
            -d "$TGT_NAME" \
            --single-transaction \
            -v ON_ERROR_STOP=1 2>&1 | tail -20
    elif [[ "$IMPORT_FILE" == *.sql ]]; then
        log_info "Format: SQL plain (psql)"
        PGPASSWORD="$TGT_PASSWORD" psql \
            -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" \
            -d "$TGT_NAME" \
            --single-transaction \
            -v ON_ERROR_STOP=1 \
            -f "$IMPORT_FILE" 2>&1 | tail -20
    else
        log_error "Format non reconnu. Supportes: .dump, .sql, .sql.gz"
        exit 1
    fi

    log_info "Import termine, execution de ANALYZE sur la target..."
    PGPASSWORD="$TGT_PASSWORD" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" -d "$TGT_NAME" \
        -c "ANALYZE;" >/dev/null 2>&1 || log_warn "ANALYZE a echoue (non bloquant)"

    log_info "=== IMPORT TERMINE ==="
    log_info "Stats TARGET: $(get_db_stats_target)"
    echo ""

    # Verification automatique SOURCE vs TARGET
    verify_import
}

# Compare row counts source vs target pour toutes les tables du schema.
# Retourne 0 si tout matche, 1 sinon. La fonction est appelee a la fin de
# do_import et peut aussi etre invoquee directement via "verify".
verify_import() {
    log_info "=== VERIFICATION POST-IMPORT ==="
    log_info "Source : $SRC_NAME@$SRC_HOST:$SRC_PORT"
    log_info "Target : $TGT_NAME@$TGT_HOST:$TGT_PORT"
    echo ""

    # Recuperer la liste des tables depuis la SOURCE (reference)
    local tables
    tables="$(PGPASSWORD="$SRC_PASSWORD" psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" -d "$SRC_NAME" \
        -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='$SRC_SCHEMA' ORDER BY tablename" 2>/dev/null)"

    if [ -z "$tables" ]; then
        log_error "Impossible de lister les tables de la SOURCE."
        return 1
    fi

    local diff_count=0
    local total_count=0
    local report_file="${BACKUP_DIR}/verify_${TIMESTAMP}.txt"

    printf "  %-35s %12s %12s %8s  %s\n" "TABLE" "SOURCE" "TARGET" "DIFF" "STATUS" | tee "$report_file"
    printf "  %-35s %12s %12s %8s  %s\n" "-----" "------" "------" "----" "------" | tee -a "$report_file"

    while IFS= read -r tbl; do
        [ -z "$tbl" ] && continue
        total_count=$((total_count + 1))

        local src_n tgt_n
        src_n="$(PGPASSWORD="$SRC_PASSWORD" psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" -d "$SRC_NAME" \
            -t -A -c "SELECT COUNT(*) FROM $SRC_SCHEMA.\"$tbl\"" 2>/dev/null || echo "ERR")"
        tgt_n="$(PGPASSWORD="$TGT_PASSWORD" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" -d "$TGT_NAME" \
            -t -A -c "SELECT COUNT(*) FROM $SRC_SCHEMA.\"$tbl\"" 2>/dev/null || echo "MISSING")"

        local status diff
        if [ "$tgt_n" = "MISSING" ]; then
            status="✗ TABLE ABSENTE"
            diff="?"
            diff_count=$((diff_count + 1))
        elif [ "$src_n" = "ERR" ]; then
            status="? SOURCE ERR"
            diff="?"
        elif [ "$src_n" = "$tgt_n" ]; then
            status="✓ OK"
            diff="0"
        else
            diff=$((tgt_n - src_n))
            status="✗ MISMATCH"
            diff_count=$((diff_count + 1))
        fi

        # Formatter les nombres avec des separateurs de milliers (si shell-safe)
        printf "  %-35s %12s %12s %8s  %s\n" "$tbl" "$src_n" "$tgt_n" "$diff" "$status" | tee -a "$report_file"
    done <<< "$tables"

    echo ""
    echo "  Rapport sauvegarde dans : $report_file"
    echo ""

    if [ "$diff_count" -eq 0 ]; then
        log_info "✓ VERIFICATION OK : $total_count tables, row counts identiques entre source et target."
        return 0
    else
        log_error "✗ VERIFICATION ECHOUEE : $diff_count/$total_count tables presentent une divergence."
        return 1
    fi
}

# --- List ---

do_list() {
    log_info "=== BACKUPS DISPONIBLES ==="
    log_info "Repertoire: $BACKUP_DIR"
    echo ""

    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        echo "  (aucun backup)"
        return
    fi

    printf "  %-45s %10s  %s\n" "FICHIER" "TAILLE" "DATE"
    printf "  %-45s %10s  %s\n" "-------" "------" "----"

    for f in "$BACKUP_DIR"/*.dump "$BACKUP_DIR"/*.sql.gz "$BACKUP_DIR"/*.sql; do
        [ -f "$f" ] || continue
        local SIZE
        SIZE=$(du -sh "$f" | cut -f1)
        local DATE
        DATE=$(date -r "$f" '+%Y-%m-%d %H:%M')
        printf "  %-45s %10s  %s\n" "$(basename "$f")" "$SIZE" "$DATE"
    done

    echo ""

    # Afficher les manifestes
    local MANIFESTS=("$BACKUP_DIR"/*_manifest.json)
    if [ -f "${MANIFESTS[0]}" ]; then
        log_info "Manifestes disponibles:"
        for m in "$BACKUP_DIR"/*_manifest.json; do
            [ -f "$m" ] || continue
            echo "  $(basename "$m")"
        done
    fi
}

# --- Main ---

case "${1:-}" in
    export)
        do_export "$@"
        ;;
    import)
        do_import "$@"
        ;;
    list)
        do_list
        ;;
    verify)
        check_pg_tools
        check_connection_source
        check_connection_target
        verify_import
        ;;
    *)
        echo "Usage:"
        echo "  $0 export [--data-only|--schema-only] [--tables \"t1 t2\"] [--sql]"
        echo "  $0 import <fichier.dump|fichier.sql.gz> [--wipe] [--yes]"
        echo "  $0 verify"
        echo "  $0 list"
        echo ""
        echo "Options export:"
        echo "  --data-only     Exporter uniquement les donnees (pas le schema)"
        echo "  --schema-only   Exporter uniquement le schema (pas les donnees)"
        echo "  --tables \"...\"  Exporter uniquement certaines tables"
        echo "  --sql           Format SQL plain (au lieu du format custom pg_dump)"
        echo ""
        echo "Options import:"
        echo "  --wipe          DROP le schema cible avant import (propre mais destructif)"
        echo "  --yes, -y       Ne pas demander confirmation (pour CI/scripts)"
        echo ""
        echo "Variables d'environnement (.env.local):"
        echo "  SOURCE (lecture, export) - deux conventions supportees:"
        echo "    DATABASE_HOST ou DB_POSTGRESDB_HOST"
        echo "    DATABASE_PORT ou DB_POSTGRESDB_PORT"
        echo "    DATABASE_USER ou DB_POSTGRESDB_USER"
        echo "    DATABASE_PASSWORD ou DB_POSTGRESDB_PASSWORD"
        echo "    DATABASE_NAME ou DB_POSTGRESDB_DATABASE"
        echo "  TARGET (ecriture, import) - optionnel, fallback sur SOURCE:"
        echo "    IMPORT_DB_HOST, IMPORT_DB_PORT, IMPORT_DB_USER, IMPORT_DB_PASSWORD, IMPORT_DB_NAME"
        echo ""
        echo "Exemples:"
        echo "  $0 export                                          # Export complet depuis SOURCE"
        echo "  $0 export --tables \"source_texts commentary_details\"  # Tables Torah"
        echo "  $0 export --sql                                    # Format SQL lisible"
        echo "  $0 import backups/db/torah_20260420.dump           # Import vers TARGET"
        echo "  $0 import backups/db/torah_20260420.dump --wipe    # Wipe avant import (propre)"
        echo "  $0 verify                                          # Compare SOURCE vs TARGET"
        echo "  $0 list                                            # Voir les backups"
        exit 1
        ;;
esac
