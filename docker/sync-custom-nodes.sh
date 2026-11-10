#!/bin/bash
# Build les custom nodes DEPUIS CE DÉPÔT et les pousse vers llm, puis redéploie llm.
# Usage : ./docker/sync-custom-nodes.sh   (depuis la racine du dépôt n8n-workflows)
#
# ── host2.local A ÉTÉ RETIRÉ DE CE CIRCUIT (2026-11-10, décision de Franck) ──────
# Ce script copiait `host2.local:/storage4/n8n/custom-nodes` vers llm, puis redéployait
# DEUX n8n : host2 (« staging ») et llm. Or **l'instance n8n de host2 n'existe plus** —
# décision du 2026-07-09, confirmée le 2026-11-10. Mesuré depuis pi6 : `host2.local`
# résout (192.168.1.171) et ses ports 22 et 3031 répondent, mais **5678 est fermé**.
# Continuer à redéployer un n8n inexistant ne pouvait que masquer des erreurs, et faire
# de host2 la « source de vérité » des nœuds entretenait un détour sans raison.
#
# La source est désormais CE DÉPÔT, buildé sur place :
#   • `npm run build` est lancé ici, donc ce qui part vers llm est TOUJOURS fraîchement
#     compilé, que le `dist/` soit dans un commit ou non ;
#
# ⚠️ CORRECTION DU 2026-11-10 (après-midi) : la version précédente de ce commentaire
#    affirmait que « le `dist/` de chaque paquet est suivi par git ». MESURÉ, c'est
#    FAUX pour 11 paquets sur 13 — `git ls-files 'custom-nodes/*/dist/*'` n'en rend que
#    6 fichiers, tous de `n8n-nodes-classroom-dynamic`. La règle `dist/` du .gitignore
#    racine s'applique bien aux autres ; seul classroom échappe, ses fichiers ayant été
#    indexés avant. J'avais généralisé depuis le seul paquet que je venais de corriger.
#    Conséquence pratique : le garde-fou ci-dessous ne peut détecter un dist périmé QUE
#    pour classroom. Pour les autres, la seule garantie est le build fait ici — et c'est
#    suffisant, à condition de ne jamais pousser depuis un dépôt non à jour ;
#   • `npm run build` reproduit le `dist/` du commit à l'octet près (tsc 5.3.3) ;
#   • les nœuds buildés ne requièrent, à l'exécution, que `n8n-workflow` — fourni par
#     n8n — et `n8n-nodes-google-genai-core`, interne au dépôt.
# Un `git pull` suivi de ce script suffit donc, sans passer par aucune autre machine.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$RACINE/custom-nodes"
DST_HOST=fsebb@llm.local
DST_DIR=/storage4/n8n-workflows/custom-nodes-built

[ -d "$SRC_DIR" ] || { echo "❌ $SRC_DIR introuvable"; exit 1; }

# ── 1 · Builder, pour ne jamais pousser un dist périmé ───────────────────────────
# ⚠️ C'est l'étape qui a coûté 11 routes Classroom le 2026-11-10 : corriger le `.ts`
# sans reconstruire ne change RIEN sur l'instance, le paquet déclarant `main: dist/…`.
echo "→ build des paquets qui ont un script de build"
for pkg in "$SRC_DIR"/*/package.json; do
  [ -f "$pkg" ] || continue
  d="$(dirname "$pkg")"
  python3 -c "import json,sys; sys.exit(0 if 'build' in (json.load(open('$pkg')).get('scripts') or {}) else 1)" || continue
  echo "   • $(basename "$d")"
  ( cd "$d" && npm run build >/dev/null ) || { echo "❌ build échoué : $(basename "$d")"; exit 1; }
done

# ⚠️ Un build qui modifie un `dist/` SUIVI signifie que le commit n'était pas à jour.
# On le signale plutôt que de pousser en silence quelque chose qui n'est dans aucun commit.
if ! git -C "$RACINE" diff --quiet -- 'custom-nodes/*/dist'; then
  echo "⚠️  le build a modifié un dist suivi par git — ce qui part vers llm n'est"
  echo "    PAS ce que porte le commit. Vérifier puis committer :"
  git -C "$RACINE" --no-pager diff --stat -- 'custom-nodes/*/dist'
  read -p "    Pousser quand même ? [y/N] " -r ok
  [[ "$ok" =~ ^[yY]$ ]] || exit 1
fi

# ── 2 · Pousser vers llm ─────────────────────────────────────────────────────────
echo "→ envoi $SRC_DIR → ${DST_HOST}:${DST_DIR}"
tar czf - -C "$(dirname "$SRC_DIR")" "$(basename "$SRC_DIR")" \
  | ssh -o BatchMode=yes "$DST_HOST" \
      "mkdir -p $DST_DIR && tar xzf - -C $DST_DIR --strip-components=1"
N=$(ssh -o BatchMode=yes "$DST_HOST" "find $DST_DIR -name '*.node.js' | wc -l")
echo "✅ envoi OK — $N fichiers .node.js sur llm"

# ── 3 · Redéployer llm, et llm SEUL ──────────────────────────────────────────────
# ⚠️ n8n ne recharge pas un nœud personnalisé à chaud : sans redéploiement, le
# conteneur continue de servir l'ancien code et rien ne le signale.
read -p "Redéployer n8n sur llm maintenant ? [y/N] " -r ok
if [[ "$ok" =~ ^[yY]$ ]]; then
  ssh -o BatchMode=yes "$DST_HOST" 'cd /storage4/n8n-workflows/docker && ./deploy.sh'
  echo "✅ llm redéployé"
else
  echo "ℹ️  envoi fait ; redéploiement à lancer : ssh $DST_HOST 'cd /storage4/n8n-workflows/docker && ./deploy.sh'"
fi
