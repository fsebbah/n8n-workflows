#!/bin/bash

# ✅ Fonction d'aide
usage() {
  echo "Usage: $0 [-f fichier] [-d dossier] [-l label1,label2,...]"
  echo "  -f    Fichier markdown unique à traiter"
  echo "  -d    Dossier contenant plusieurs fichiers .md"
  echo "  -l    Labels à ajouter (séparés par des virgules, optionnel)"
  echo "        Exemple: -l 'enhancement,PI5S5,Refactorisation'"
  exit 1
}

# 📝 Fonction pour créer une issue avec gestion des fichiers trop longs
create_issue_safe() {
  local filepath="$1"
  local title="$2"
  local labels="$3"

  # Vérifier la taille du fichier (65536 caractères = limite GitHub)
  # On utilise 40000 comme limite de sécurité (bien en dessous de 65536)
  # pour éviter les problèmes avec le formatage markdown et les métadonnées
  local file_size=$(wc -c < "$filepath")
  local max_size=40000  # Marge de sécurité importante

  if [ "$file_size" -gt "$max_size" ]; then
    echo "⚠️ Fichier trop volumineux ($file_size caractères, max: $max_size)"
    echo "📦 Découpage du contenu en plusieurs parties..."

    # Créer fichiers temporaires
    local main_file=$(mktemp)
    local extra_file=$(mktemp)

    # Diviser le fichier en deux parties (60% / 40%)
    local split_line=$(($(wc -l < "$filepath") * 60 / 100))
    head -n "$split_line" "$filepath" > "$main_file"
    echo -e "\n\n---\n**Suite du contenu dans le premier commentaire ci-dessous** ⬇️" >> "$main_file"
    tail -n +"$((split_line + 1))" "$filepath" > "$extra_file"

    # Créer l'issue avec la première partie
    if [ -n "$labels" ]; then
      issue_url=$(gh issue create --title "$title" --body-file "$main_file" --label "$labels" 2>&1)
    else
      issue_url=$(gh issue create --title "$title" --body-file "$main_file" 2>&1)
    fi

    local create_status=$?

    # Vérifier si la création a réussi
    if [ $create_status -eq 0 ]; then
      echo "✅ Issue créée: $issue_url"

      # Extraire le numéro d'issue
      issue_number=$(echo "$issue_url" | grep -oP '\d+$')

      if [ -n "$issue_number" ]; then
        # Ajouter la suite en commentaire
        echo "💬 Ajout de la suite en commentaire..."
        gh issue comment "$issue_number" --body-file "$extra_file"

        if [ $? -eq 0 ]; then
          echo "✅ Commentaire ajouté avec succès"
        else
          echo "⚠️ Échec de l'ajout du commentaire, mais l'issue a été créée"
        fi
      fi
    else
      echo "❌ Échec de la création de l'issue"
      rm "$main_file" "$extra_file"
      return 1
    fi

    # Nettoyer les fichiers temporaires
    rm "$main_file" "$extra_file"
    return $create_status
  else
    # Fichier de taille normale
    if [ -n "$labels" ]; then
      gh issue create --title "$title" --body-file "$filepath" --label "$labels"
    else
      gh issue create --title "$title" --body-file "$filepath"
    fi
    return $?
  fi
}

# 🔍 Analyse des options
LABELS=""
while getopts ":f:d:l:" opt; do
  case $opt in
    f) FILE="$OPTARG" ;;
    d) DIR="$OPTARG" ;;
    l) LABELS="$OPTARG" ;;
    *) usage ;;
  esac
done

# 📁 Traitement d'un fichier unique
if [ -n "$FILE" ]; then
  if [ ! -f "$FILE" ]; then
    echo "❌ Fichier introuvable: $FILE"
    exit 1
  fi
  filename=$(basename -- "$FILE")
  title="${filename%.*}"
  echo "📌 Création de l'issue: \"$title\" depuis \"$FILE\""

  # Créer l'issue avec gestion des erreurs
  if create_issue_safe "$FILE" "$title" "$LABELS"; then
    echo "🗑️ Suppression du fichier: $FILE"
    rm "$FILE"
    exit 0
  else
    echo "❌ Échec de la création de l'issue"
    echo "💾 Le fichier a été conservé: $FILE"
    exit 1
  fi
fi

# 📂 Traitement d'un dossier
if [ -n "$DIR" ]; then
  if [ ! -d "$DIR" ]; then
    echo "❌ Dossier introuvable: $DIR"
    exit 1
  fi

  success_count=0
  error_count=0

  for filepath in "$DIR"/*.md; do
    [ -e "$filepath" ] || continue
    filename=$(basename -- "$filepath")
    title="${filename%.*}"
    echo "📌 Création de l'issue: \"$title\" depuis \"$filepath\""

    if [ -n "$LABELS" ]; then
      echo "🏷️ Ajout des labels: $LABELS"
    fi

    # Créer l'issue avec gestion des erreurs
    if create_issue_safe "$filepath" "$title" "$LABELS"; then
      echo "🗑️ Suppression du fichier: $filepath"
      rm "$filepath"
      ((success_count++))
    else
      echo "❌ Échec de la création de l'issue pour: $filepath"
      echo "💾 Le fichier a été conservé"
      ((error_count++))
    fi
    echo ""
  done

  echo "📊 Résumé: $success_count issue(s) créée(s), $error_count erreur(s)"
  exit 0
fi

# ⚠️ Si aucun argument n'est fourni, utiliser le dossier par défaut
DEFAULT_DIR="./docs/issues_backend"
echo "ℹ️ Aucun argument fourni. Utilisation du dossier par défaut: $DEFAULT_DIR"

success_count=0
error_count=0

for filepath in "$DEFAULT_DIR"/*.md; do
  [ -e "$filepath" ] || continue
  filename=$(basename -- "$filepath")
  title="${filename%.*}"
  echo "📌 Création de l'issue: \"$title\" depuis \"$filepath\""

  if [ -n "$LABELS" ]; then
    echo "🏷️ Ajout des labels: $LABELS"
  fi

  # Créer l'issue avec gestion des erreurs
  if create_issue_safe "$filepath" "$title" "$LABELS"; then
    echo "🗑️ Suppression du fichier: $filepath"
    rm "$filepath"
    ((success_count++))
  else
    echo "❌ Échec de la création de l'issue pour: $filepath"
    echo "💾 Le fichier a été conservé"
    ((error_count++))
  fi
  echo ""
done

echo "📊 Résumé: $success_count issue(s) créée(s), $error_count erreur(s)"

