#!/usr/bin/env bash
# =============================================================================
# Import des trois webhooks de la bêta azy.education
#
#   ./scripts/n8n/import-beta.sh --essai   # n'écrit rien, montre ce qui serait fait
#   ./scripts/n8n/import-beta.sh           # crée les trois workflows dans n8n
#
# CRÉATION, pas réimport : ces workflows n'existent pas encore dans n8n, donc
# `batch-reimport` sait pourtant les créer — mais il les ACTIVERAIT dans la foulée
# (`activate_after=True` en dur, aucune option pour l'en empêcher). Or ils doivent
# rester inactifs tant que la table n'existe pas. On passe donc par
# `n8n_api.py import`, qui fait un POST /workflows en retirant `active`.
#
# ⚠️ POST /workflows CRÉE sans vérifier : un second passage produirait des
# doublons silencieux, avec deux workflows répondant au même chemin de webhook.
# D'où le refus explicite ci-dessous si un workflow du même nom existe déjà.
#
# ⚠️ Les trois arrivent INACTIFS — n8n_api.py retire `active` à l'import, et
# c'est voulu : ils écrivent dans la table `beta_signups`, qui n'existe pas
# encore (portée par l'équipe api, azy.daily#450). Un formulaire qui accepte
# une inscription puis la perd est pire qu'un formulaire fermé.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

ESSAI=0
[ "${1:-}" = "--essai" ] || [ "${1:-}" = "--dry-run" ] && ESSAI=1

WORKFLOWS=(BETA_-_Inscription BETA_-_Confirmation BETA_-_Nettoyage)
API="python3 scripts/n8n/n8n_api.py"

# La détection réutilise `find_workflow_by_name` de n8n_api.py, qui PAGINE : l'API rend
# 100 workflows par page, et un simple GET manquait les existants au-delà — c'est ce qui
# avait déjà produit des doublons et des conflits 409 sur les webhooks (commentaire du
# dépôt). ⚠️ Ne pas utiliser `n8n_api.py search` ici : il ne trouve rien, même pour un
# workflow présent. Ni `find-by-webhook` : sans psycopg2 installé, il répond « non
# trouvé » au lieu d'échouer — un faux négatif qui créerait le doublon qu'on veut éviter.
echo "→ Vérification préalable : aucun de ces workflows ne doit déjà exister"
DEJA=0
for w in "${WORKFLOWS[@]}"; do
  nom="${w//_/ }"                      # BETA_-_Inscription → BETA - Inscription
  if python3 -c "
import sys; sys.path.insert(0, 'scripts/n8n')
import n8n_api
sys.exit(0 if n8n_api.find_workflow_by_name('$nom') else 1)
" 2>/dev/null; then
    echo "   ❌ « $nom » existe déjà dans n8n — import refusé pour éviter un doublon"
    DEJA=1
  else
    echo "   ✓ « $nom » absent, import possible"
  fi
done

if [ "$DEJA" -eq 1 ]; then
  echo
  echo "Un ou plusieurs workflows existent déjà. Deux voies :"
  echo "  • mise à jour :  $API update <id> workflows/<FICHIER>.json"
  echo "  • suppression puis import :  $API delete <id>  puis relancer ce script"
  exit 1
fi

echo
for w in "${WORKFLOWS[@]}"; do
  if [ "$ESSAI" -eq 1 ]; then
    echo "→ [essai] $API import workflows/$w.json"
  else
    echo "→ import de $w"
    $API import "workflows/$w.json"
  fi
done

if [ "$ESSAI" -eq 1 ]; then
  echo
  echo "Essai terminé — rien n'a été écrit dans n8n."
  exit 0
fi

echo
echo "→ Vérification après import"
python3 -c "
import sys; sys.path.insert(0, 'scripts/n8n')
import n8n_api
for nom in ['BETA - Inscription', 'BETA - Confirmation', 'BETA - Nettoyage']:
    w = n8n_api.find_workflow_by_name(nom)
    if not w:
        print(f'   ⚠️ « {nom} » introuvable après import')
    else:
        etat = 'ACTIF ⚠️' if w.get('active') else 'inactif ✓'
        print(f'   ✓ « {nom} » (id {w[\"id\"]}) — {etat}')
"

cat <<'FIN'

─────────────────────────────────────────────────────────────────────────────
Les trois workflows sont importés et INACTIFS. Ne les activez pas encore.

Avant activation, trois conditions :
  1. la table `beta_signups` existe        (équipe api, azy.daily#450)
  2. l'identifiant PostgreSQL est créé     (rôle dédié, équipe infra)
     puis sélectionné dans chaque nœud Postgres des trois workflows
  3. l'identifiant SMTP est créé et sélectionné dans « Envoyer le courriel »
     (et SPF/DKIM configurés sur azy.education, sinon les confirmations
      partent en indésirables et personne ne confirme)

Les nœuds portent « REMPLACER » comme identifiant : c'est un repère, il faut
choisir la vraie credential dans la liste déroulante de chaque nœud.

Activation ensuite, workflow par workflow :
  python3 scripts/n8n/n8n_api.py activate <id>

Essai de bout en bout après activation :
  curl -X POST https://n8n.azy.education/webhook/beta-inscription \
    -H 'Content-Type: application/json' \
    -d '{"nom":"Essai","email":"vous@exemple.fr","profil":"parent","site_web":"",
         "consentement":true,"consentement_texte":"Texte affiché sur la page"}'
  → 202 {"ok":true}, puis un courriel avec le lien de confirmation
─────────────────────────────────────────────────────────────────────────────
FIN
