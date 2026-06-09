# Webhooks Registry

Ce fichier documente tous les webhooks actifs disponibles dans n8n.

## Génération

Le registry est généré depuis la base de données PostgreSQL avec :

```bash
python3 scripts/n8n/n8n_api.py export-webhooks-registry [output_file] [--simple]
```

**Options** :
- `output_file` : Chemin du fichier JSON (défaut: `docs/webhooks-registry.json`)
- `--simple` : Format simple (sans documentation complète)

**Exemples** :
```bash
# Export complet (défaut)
python3 scripts/n8n/n8n_api.py export-webhooks-registry

# Export simple
python3 scripts/n8n/n8n_api.py export-webhooks-registry --simple

# Custom output
python3 scripts/n8n/n8n_api.py export-webhooks-registry docs/webhooks.json
```

## Format JSON

```json
{
  "version": "1.0",
  "generated_at": "2026-06-09T...",
  "total_webhooks": 196,
  "excluded_torah": 35,
  "categories": {
    "MCP Tools": [
      {
        "name": "MCP - Analyze Message",
        "path": "analyze-message",
        "full_url": "http://pi6.local:5678/webhook/analyze-message",
        "method": "POST",
        "category": "MCP Tools",
        "description": "Analyse complète d'un message",
        "workflow_id": "EiNGvM8j4KMcheed"
      }
    ]
  }
}
```

## Catégories

| Catégorie | Description |
|-----------|-------------|
| **MCP Tools** | Outils MCP (Model Context Protocol) |
| **Discord** | Webhooks Discord (guild, DM, mentions, etc.) |
| **Claude / LLM** | Appels Claude et autres LLM |
| **YouTube** | Traitement vidéos YouTube |
| **Document Processing** | Traitement PDF, Word, etc. |
| **Testing / Utilities** | Outils de test et utilitaires |
| **Other** | Autres webhooks non catégorisés |

## Exclusions

- **Workflows Torah** : Exclus du registry (35 workflows)
- **Workflows inactifs** : Non inclus

## Utilisation

### Rechercher un webhook

```bash
# Par nom
jq '.categories[] | .[] | select(.name | contains("DM"))' docs/webhooks-registry.json

# Par path
jq '.categories[] | .[] | select(.path == "discord/dm-resolve")' docs/webhooks-registry.json

# Tous les webhooks d'une catégorie
jq '.categories."MCP Tools"' docs/webhooks-registry.json
```

### Lister les catégories

```bash
jq '.categories | keys' docs/webhooks-registry.json
```

### Compter les webhooks par catégorie

```bash
jq '.categories | to_entries | map({category: .key, count: (.value | length)})' docs/webhooks-registry.json
```

## Mise à jour

Pour mettre à jour le registry après avoir modifié des workflows :

```bash
# Re-générer le registry
python3 scripts/n8n/n8n_api.py export-webhooks-registry

# Committer les changements
git add docs/webhooks-registry.json
git commit -m "docs: update webhooks registry"
```

## Statistiques actuelles

- **Total webhooks actifs** : 196
- **Workflows exclus (Torah)** : 35
- **Catégories** : 7

### Répartition

```
MCP Tools:             87 webhooks
Other:                 76 webhooks
Discord:               26 webhooks
Document Processing:    3 webhooks
Claude / LLM:           2 webhooks
Testing / Utilities:    1 webhook
YouTube:                1 webhook
```
