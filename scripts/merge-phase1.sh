#!/bin/bash
#
# Script de merge séquentiel Phase 1
# Merge les 14 PRs dans l'ordre avec rebase automatique
#
# Usage: ./scripts/merge-phase1.sh [--dry-run]
#

set -e

# Configuration
REPO="fsebbah/n8n-workflows"
BASE_BRANCH="develop"

# PRs dans l'ordre (numéro PR -> branche)
declare -A PRS=(
    [70]="feat/p1-01-transcriber-tool"
    [71]="feat/p1-02-text-to-speech-tool"
    [72]="feat/p1-03-linkedin-tool"
    [73]="feat/p1-04-pdf-extractor-tool"
    [74]="feat/p1-05-entity-extractor-tool"
    [75]="feat/p1-06-summarizer-tool"
    [76]="feat/p1-07-text-generator-tool"
    [77]="feat/p1-08-code-generator-tool"
    [78]="feat/p1-09-youtube-searcher-tool"
    [79]="feat/p1-10-google-searcher-tool"
    [80]="feat/p1-11-vector-store-tool"
    [81]="feat/p1-12-get-image-ocr-tool"
    [82]="feat/p1-13-llm-summarizer-tool"
    [83]="feat/p1-14-text-classifier-tool"
)

# Ordre de merge
PR_ORDER=(70 71 72 73 74 75 76 77 78 79 80 81 82 83)

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}Mode dry-run activé - aucune modification ne sera effectuée${NC}"
fi

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Vérifier que gh est installé et authentifié
check_prerequisites() {
    log_info "Vérification des prérequis..."

    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) n'est pas installé"
        exit 1
    fi

    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI n'est pas authentifié. Lancez 'gh auth login'"
        exit 1
    fi

    log_success "Prérequis OK"
}

# Récupérer l'état d'une PR
get_pr_state() {
    local pr_number=$1
    gh pr view $pr_number --json state --jq '.state' 2>/dev/null || echo "UNKNOWN"
}

# Vérifier si une PR est mergeable
is_pr_mergeable() {
    local pr_number=$1
    local mergeable=$(gh pr view $pr_number --json mergeable --jq '.mergeable' 2>/dev/null)
    [[ "$mergeable" == "MERGEABLE" ]]
}

# Rebase une branche sur develop
rebase_branch() {
    local branch=$1
    log_info "Rebase de $branch sur $BASE_BRANCH..."

    if $DRY_RUN; then
        log_warning "[DRY-RUN] git fetch origin && git checkout $branch && git rebase origin/$BASE_BRANCH && git push --force-with-lease"
        return 0
    fi

    git fetch origin
    git checkout "$branch"

    if git rebase "origin/$BASE_BRANCH"; then
        git push --force-with-lease origin "$branch"
        log_success "Rebase de $branch terminé"
        return 0
    else
        log_error "Conflit lors du rebase de $branch"
        git rebase --abort
        return 1
    fi
}

# Merger une PR
merge_pr() {
    local pr_number=$1
    local branch=${PRS[$pr_number]}

    log_info "=========================================="
    log_info "Traitement PR #$pr_number ($branch)"
    log_info "=========================================="

    # Vérifier l'état de la PR
    local state=$(get_pr_state $pr_number)

    if [[ "$state" == "MERGED" ]]; then
        log_warning "PR #$pr_number déjà mergée, passage à la suivante"
        return 0
    fi

    if [[ "$state" == "CLOSED" ]]; then
        log_error "PR #$pr_number est fermée (non mergée)"
        return 1
    fi

    # Rebase si nécessaire
    if ! is_pr_mergeable $pr_number; then
        log_warning "PR #$pr_number n'est pas mergeable, tentative de rebase..."
        if ! rebase_branch "$branch"; then
            log_error "Impossible de rebase $branch"
            return 1
        fi
    fi

    # Merger la PR
    log_info "Merge de PR #$pr_number..."

    if $DRY_RUN; then
        log_warning "[DRY-RUN] gh pr merge $pr_number --squash --delete-branch"
        return 0
    fi

    if gh pr merge $pr_number --squash --delete-branch; then
        log_success "PR #$pr_number mergée avec succès"

        # Mettre à jour develop local
        git fetch origin
        git checkout $BASE_BRANCH
        git pull origin $BASE_BRANCH

        return 0
    else
        log_error "Échec du merge de PR #$pr_number"
        return 1
    fi
}

# Fonction principale
main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          MERGE SÉQUENTIEL PHASE 1 (14 PRs)                ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""

    check_prerequisites

    # Sauvegarder la branche actuelle
    local current_branch=$(git branch --show-current)
    log_info "Branche actuelle: $current_branch"

    # Mettre à jour develop
    log_info "Mise à jour de $BASE_BRANCH..."
    git fetch origin
    git checkout $BASE_BRANCH
    git pull origin $BASE_BRANCH

    # Compteurs
    local merged=0
    local failed=0
    local skipped=0

    # Merger chaque PR dans l'ordre
    for pr_number in "${PR_ORDER[@]}"; do
        if merge_pr $pr_number; then
            ((merged++))
        else
            state=$(get_pr_state $pr_number)
            if [[ "$state" == "MERGED" ]]; then
                ((skipped++))
            else
                ((failed++))
                log_error "Arrêt du script suite à l'échec de PR #$pr_number"
                break
            fi
        fi

        # Pause entre les merges pour éviter les rate limits
        if ! $DRY_RUN; then
            sleep 2
        fi
    done

    # Résumé
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                        RÉSUMÉ                              ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    log_info "PRs mergées:  $merged"
    log_info "PRs skippées: $skipped"
    log_info "PRs échouées: $failed"
    echo ""

    # Retourner à la branche initiale
    if [[ "$current_branch" != "$BASE_BRANCH" ]] && git rev-parse --verify "$current_branch" &>/dev/null; then
        git checkout "$current_branch" 2>/dev/null || true
    fi

    if [[ $failed -eq 0 ]]; then
        log_success "Phase 1 complétée avec succès!"
        return 0
    else
        log_error "Phase 1 incomplète - vérifiez les erreurs ci-dessus"
        return 1
    fi
}

# Exécution
main "$@"
