#!/bin/bash
# Export de TOUS les workflows par la CLI n8n, renommés par nom de workflow.
#
# ⚠️ Ne pas confondre avec les trois exporteurs par l'API — `scripts/export_workflows.sh`,
# `scripts/n8n/export_all_active.py`, `scripts/n8n/export_snapshot.py`. Celui-ci appelle
# `n8n export:workflow`, donc il ne fonctionne QUE depuis l'intérieur du conteneur n8n
# (llm.local) ; les autres passent par l'API et tournent depuis n'importe où. Et il exporte
# tout, actifs comme inactifs, là où `export_all_active.py` filtre.
#
# ⚠️ Il écrit DIRECTEMENT dans `workflows/`, le dossier suivi par git : un export écrase
# les fichiers du dépôt. Vérifier `git status` après, jamais avant.
mkdir -p workflows

# Export avec les IDs
n8n export:workflow --all --backup --output=workflows/

# Renommer chaque fichier avec le nom du workflow
for file in workflows/*.json; do
  name=$(jq -r '.name' "$file" | tr ' /' '_-' | tr -cd '[:alnum:]_-')
  if [ -n "$name" ]; then
    mv "$file" "workflows/${name}.json"
    echo "✓ $file → workflows/${name}.json"
  fi
done
