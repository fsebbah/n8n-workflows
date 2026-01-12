# Guide: Variables d'environnement dans n8n

## Contexte

Les workflows n8n ont besoin d'acceder a des variables de configuration (URLs d'API, cles, etc.) sans les hardcoder.

## Regles importantes

### 1. `process.env` NE FONCTIONNE PAS dans les Code nodes

```javascript
// NE FONCTIONNE PAS dans un Code node
const apiUrl = process.env.API_URL;  // ReferenceError: process is not defined
```

Les Code nodes s'executent dans un sandbox isole sans acces a `process`.

### 2. `$env.VARIABLE` fonctionne dans les champs Expression

Dans les HTTP Request nodes et autres champs Expression:

```
{{ $env.TORAH_API_URL }}/api/recipes
```

Cela lit les variables d'environnement configurees dans n8n.

## Configuration des variables

### Sur le serveur n8n

Les variables doivent etre definies dans l'environnement ou n8n s'execute:

**Option A: Fichier .env de n8n**
```env
TORAH_API_URL=http://localhost:8000
QDRANT_URL=http://localhost:6333
```

**Option B: Variables systeme**
```bash
export TORAH_API_URL=http://localhost:8000
```

**Option C: Docker Compose**
```yaml
environment:
  - TORAH_API_URL=http://localhost:8000
```

## Variables utilisees

| Variable | Description | Utilisation |
|----------|-------------|-------------|
| `TORAH_API_URL` | URL de l'API backend | 37 workflows (Torah, Recipes, Books, Stripe, Discord) |

### Repartition par projet

| Projet | Nombre de workflows |
|--------|---------------------|
| Torah | 21 |
| Recipes | 5 |
| Books | 5 |
| Stripe | 4 |
| Discord | 2 |

## Pattern recommande

### Pour les URLs d'API (config infrastructure)

Utiliser `$env.VARIABLE` dans les HTTP Request nodes:

```
URL: {{ $env.TORAH_API_URL }}/api/recipes/{{ $json.recipe_id }}
```

### Pour les configs specifiques au plugin (Qdrant, OpenAI)

Le plugin envoie les parametres dans le body de la requete:

```json
{
  "query": "recherche",
  "qdrant_host": "localhost",
  "qdrant_port": 6333,
  "qdrant_collection": "bot-appetit-recipes",
  "openai_api_key": "sk-xxx"
}
```

## Exemple complet

### Workflow: qdrant-save

1. **Validate Input** (Code node) - Valide les params recus du plugin:
   ```javascript
   // Pas d'acces a process.env ici
   const qdrantUrl = `http://${body.qdrant_host}:${body.qdrant_port}`;
   ```

2. **Save to API** (HTTP Request) - Utilise $env pour l'URL backend:
   ```
   URL: {{ $env.TORAH_API_URL }}/api/recipes
   ```

3. **Store in Qdrant** (HTTP Request) - Utilise les params du plugin:
   ```
   URL: {{ $json.qdrant_url }}/collections/{{ $json.qdrant_collection }}/points
   ```

## Resume

| Type de config | Ou la definir | Comment y acceder |
|----------------|---------------|-------------------|
| Infrastructure (API URLs) | Environnement n8n | `$env.VARIABLE` dans HTTP Request |
| Plugin-specific (Qdrant, OpenAI) | Body de la requete | `$json.param` ou `$('Node').json.param` |
