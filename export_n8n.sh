#!/bin/bash
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
