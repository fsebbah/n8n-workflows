#!/bin/bash
#
# Script de merge séquentiel Phase 1
#
# Flow pour chaque PR:
#   1. Checkout branche feature
#   2. Rebase sur develop (sauf PR #1)
#   3. Push --force-with-lease
#   4. Merge PR (squash)
#   5. Update develop local
#   6. Passer à la PR suivante
#
# Usage: ./scripts/merge-phase1.sh [--dry-run]
#

set -e

# Configuration
BASE_BRANCH="develop"

# PRs dans l'ordre (numéro PR -> branche)
PR_ORDER=(
    "70:feat/p1-01-transcriber-tool"
    "71:feat/p1-02-text-to-speech-tool"
    "72:feat/p1-03-linkedin-tool"
    "73:feat/p1-04-pdf-extractor-tool"
    "74:feat/p1-05-entity-extractor-tool"
    "75:feat/p1-06-summarizer-tool"
    "76:feat/p1-07-text-generator-tool"
    "77:feat/p1-08-code-generator-tool"
    "78:feat/p1-09-youtube-searcher-tool"
    "79:feat/p1-10-google-searcher-tool"
    "80:feat/p1-11-vector-store-tool"
    "81:feat/p1-12-get-image-ocr-tool"
    "82:feat/p1-13-llm-summarizer-tool"
    "83:feat/p1-14-text-classifier-tool"
)

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Flags
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo -e "${YELLOW}   MODE DRY-RUN - Aucune modification   ${NC}"
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo ""
fi

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

log_cmd() {
    echo -e "${BLUE}  \$ $1${NC}"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
}

# Exécuter une commande (ou l'afficher en dry-run)
run_cmd() {
    log_cmd "$*"
    if ! $DRY_RUN; then
        eval "$@"
    fi
}

# Vérifier l'état d'une PR
get_pr_state() {
    gh pr view "$1" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN"
}

# Traiter une PR
process_pr() {
    local pr_number=$1
    local branch=$2
    local index=$3
    local total=${#PR_ORDER[@]}

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  PR #$pr_number ($index/$total) - $branch${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Vérifier si déjà mergée
    local state=$(get_pr_state "$pr_number")
    if [[ "$state" == "MERGED" ]]; then
        log_skip "PR #$pr_number déjà mergée"
        return 0
    fi

    if [[ "$state" == "CLOSED" ]]; then
        log_error "PR #$pr_number fermée (non mergée)"
        return 1
    fi

    # ÉTAPE 1: Checkout de la branche feature
    log_step "1/5 - Checkout branche feature"
    run_cmd "git fetch origin"
    run_cmd "git checkout $branch"
    run_cmd "git pull origin $branch --rebase 2>/dev/null || true"

    # ÉTAPE 2: Rebase sur develop (sauf pour la première PR si develop n'a pas changé)
    log_step "2/5 - Rebase sur $BASE_BRANCH"
    if $DRY_RUN; then
        log_cmd "git rebase origin/$BASE_BRANCH"
    else
        if git rebase "origin/$BASE_BRANCH"; then
            log_success "Rebase OK"
        else
            log_error "Conflit de rebase sur $branch"
            git rebase --abort 2>/dev/null || true
            echo ""
            echo -e "${RED}ACTION REQUISE: Résoudre manuellement le conflit${NC}"
            echo "  1. git checkout $branch"
            echo "  2. git rebase origin/$BASE_BRANCH"
            echo "  3. Résoudre les conflits"
            echo "  4. git rebase --continue"
            echo "  5. git push --force-with-lease"
            echo "  6. Relancer ce script"
            return 1
        fi
    fi

    # ÉTAPE 3: Push force de la branche rebasée
    log_step "3/5 - Push branche rebasée"
    run_cmd "git push --force-with-lease origin $branch"

    # ÉTAPE 4: Merge de la PR
    log_step "4/5 - Merge PR #$pr_number (squash)"
    if $DRY_RUN; then
        log_cmd "gh pr merge $pr_number --squash --delete-branch"
    else
        if gh pr merge "$pr_number" --squash --delete-branch; then
            log_success "PR #$pr_number mergée"
        else
            log_error "Échec du merge de PR #$pr_number"
            return 1
        fi
    fi

    # ÉTAPE 5: Mettre à jour develop local
    log_step "5/5 - Update $BASE_BRANCH local"
    run_cmd "git checkout $BASE_BRANCH"
    run_cmd "git pull origin $BASE_BRANCH"

    log_success "PR #$pr_number traitée avec succès"

    # Pause pour éviter rate limits GitHub
    if ! $DRY_RUN; then
        echo ""
        echo -e "${YELLOW}Pause 3s avant la PR suivante...${NC}"
        sleep 3
    fi

    return 0
}

# Main
main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         MERGE SÉQUENTIEL PHASE 1 - 14 PRs                     ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Flow pour chaque PR:"
    echo "  1. git checkout <branch>"
    echo "  2. git rebase origin/develop"
    echo "  3. git push --force-with-lease"
    echo "  4. gh pr merge --squash --delete-branch"
    echo "  5. git checkout develop && git pull"
    echo ""

    # Vérifications
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) non installé"
        exit 1
    fi

    # Sauvegarder branche actuelle
    local start_branch=$(git branch --show-current)

    # S'assurer que develop est à jour
    log_step "Préparation: mise à jour de $BASE_BRANCH"
    run_cmd "git fetch origin"
    run_cmd "git checkout $BASE_BRANCH"
    run_cmd "git pull origin $BASE_BRANCH"

    # Compteurs
    local merged=0
    local skipped=0
    local failed=0
    local index=0

    # Traiter chaque PR
    for entry in "${PR_ORDER[@]}"; do
        index=$((index + 1))
        local pr_number="${entry%%:*}"
        local branch="${entry#*:}"

        if process_pr "$pr_number" "$branch" "$index"; then
            state=$(get_pr_state "$pr_number")
            if [[ "$state" == "MERGED" ]]; then
                ((merged++))
            fi
        else
            ((failed++))
            log_error "Arrêt suite à l'échec de PR #$pr_number"
            break
        fi
    done

    # Résumé final
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                         RÉSUMÉ                                 ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "  PRs traitées:  ${GREEN}$merged${NC} / ${#PR_ORDER[@]}"
    echo -e "  Échecs:        ${RED}$failed${NC}"
    echo ""

    if [[ $failed -eq 0 ]]; then
        log_success "Phase 1 complétée avec succès!"
        echo ""
        echo "Toutes les branches ont été mergées dans $BASE_BRANCH"
    else
        log_error "Phase 1 incomplète"
    fi

    return $failed
}

main "$@"
