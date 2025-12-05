# MCP Registry

Le fichier `mcp-registry.json` à la racine du projet définit les services n8n disponibles pour MCP.

## Structure

```json
{
  "version": "1.0",
  "n8n": {
    "host": "pi6.local",
    "port": 5678,
    "protocol": "http"
  },
  "services": {
    "<service_name>": {
      "name": "Human readable name",
      "webhook_path": "/webhook/<path>",
      "description": "Service description",
      "operations": { ... },
      "auth": { ... }
    }
  }
}
```

## Utilisation par MCP

### Construire l'URL du webhook

```python
import json

with open('mcp-registry.json') as f:
    registry = json.load(f)

n8n = registry['n8n']
base_url = f"{n8n['protocol']}://{n8n['host']}:{n8n['port']}"

gmail = registry['services']['gmail']
webhook_url = f"{base_url}{gmail['webhook_path']}"
# => http://pi6.local:5678/webhook/mcp-gmail
```

### Appeler une opération

```python
import requests

def call_gmail(access_token: str, resource: str, operation: str, **params):
    payload = {
        "access_token": access_token,
        "resource": resource,
        "operation": operation,
        **params
    }
    response = requests.post(webhook_url, json=payload)
    return response.json()

# Exemples
labels = call_gmail(token, "label", "getAll")
call_gmail(token, "message", "send", to="test@example.com", subject="Hello", body="World")
```

## Ajouter un nouveau service

1. Créer le workflow n8n avec un webhook path unique
2. Ajouter l'entrée dans `mcp-registry.json`
3. Documenter les opérations et paramètres

## Paramètres

- `param` : Paramètre requis
- `param?` : Paramètre optionnel
