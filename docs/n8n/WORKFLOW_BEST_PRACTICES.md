# Bonnes Pratiques pour Créer des Workflows n8n

> Guide complet pour la conception, le développement et la maintenance de workflows n8n robustes et maintenables.

## Table des Matières

1. [Structure d'un Workflow](#structure-dun-workflow)
2. [Conception et Architecture](#conception-et-architecture)
3. [Gestion des Données](#gestion-des-données)
4. [Gestion des Erreurs](#gestion-des-erreurs)
5. [Sécurité et Credentials](#sécurité-et-credentials)
6. [Performance et Optimisation](#performance-et-optimisation)
7. [Tests et Débogage](#tests-et-débogage)
8. [Documentation et Maintenance](#documentation-et-maintenance)
9. [Import/Export de Workflows](#importexport-de-workflows)
10. [Pièges Courants à Éviter](#pièges-courants-à-éviter)

---

## Structure d'un Workflow

### Format JSON Minimal

Un workflow n8n valide doit contenir ces propriétés essentielles :

```json
{
  "name": "Nom du Workflow",
  "nodes": [],
  "connections": {},
  "settings": {
    "executionOrder": "v1"
  }
}
```

**Important :** Évitez d'ajouter des propriétés non standard comme `active`, `versionId`, `meta`, `tags` lors de la création manuelle - elles peuvent causer des erreurs d'import (erreur 400).

### Structure d'un Node

```json
{
  "id": "unique-node-id",
  "name": "Nom Explicite du Node",
  "type": "n8n-nodes-base.typeNode",
  "typeVersion": 1,
  "position": [x, y],
  "parameters": {
    // Paramètres spécifiques
  }
}
```

### Conventions de Nommage

| Élément | Convention | Exemple |
|---------|------------|---------|
| Workflow | Préfixe + Description | `MCP - Google Calendar Server` |
| Node | Action + Cible | `fetchUserData`, `sendNotification` |
| Node ID | kebab-case descriptif | `webhook-calendar`, `route-operation` |

---

## Conception et Architecture

### Patterns Recommandés

#### 1. Pipeline Linéaire
```
Trigger → Transform → Action → Response
```
**Usage :** Opérations simples, APIs REST

#### 2. Routage Conditionnel
```
Trigger → Switch/If → [Branch A, Branch B, ...] → Response
```
**Usage :** MCP Servers, traitement différencié

#### 3. Fan-out / Fan-in
```
Trigger → Split → [API 1, API 2, API 3] → Merge → Store
```
**Usage :** Appels parallèles, agrégation de données

#### 4. Boucle de Validation
```
Form → Validate → [Success → Continue, Fail → Retry Form]
```
**Usage :** OTP, validation multi-étapes

### Règles d'Or

1. **Un workflow = Une responsabilité**
   - Évitez les workflows "monolithiques"
   - Découpez en sous-workflows si > 15-20 nodes

2. **Flux de données clair**
   - De gauche à droite
   - De haut en bas pour les branches
   - Évitez les croisements de connexions

3. **Nœud de sortie unique**
   - Toutes les branches doivent converger vers un seul `Respond to Webhook`
   - Facilite le débogage et la maintenance

---

## Gestion des Données

### Expressions n8n

| Expression | Description | Exemple |
|------------|-------------|---------|
| `{{ $json.field }}` | Champ du node précédent | `{{ $json.email }}` |
| `{{ $json.body.field }}` | Champ du body webhook | `{{ $json.body.access_token }}` |
| `{{ $json.field \|\| 'default' }}` | Valeur par défaut | `{{ $json.name \|\| 'Anonymous' }}` |
| `{{ $node["Name"].json }}` | Données d'un node nommé | `{{ $node["Webhook"].json.body }}` |

### Transformation de Données

```javascript
// Normalisation email
"={{ $json.email.trim().toLowerCase() }}"

// Valeur conditionnelle
"={{ $json.priority > 5 ? 'high' : 'normal' }}"

// Array vers string
"={{ Array.isArray($json.items) ? $json.items.join(',') : $json.items }}"

// Valeur booléenne sécurisée
"={{ $json.enabled === true || $json.enabled === 'true' }}"
```

### Bonnes Pratiques Données

1. **Toujours valider les entrées**
   ```javascript
   "={{ $json.body.email || '' }}"  // Évite undefined
   ```

2. **Utiliser des valeurs par défaut explicites**
   ```javascript
   "={{ $json.body.max_results || 100 }}"
   ```

3. **Gérer les tableaux vs chaînes**
   ```javascript
   "={{ Array.isArray($json.body.attendees) ? $json.body.attendees.join(',') : ($json.body.attendees || '') }}"
   ```

---

## Gestion des Erreurs

### Stratégies de Gestion

#### 1. Error Workflow Global
Configurer un workflow dédié aux erreurs dans Settings → Error Workflow

#### 2. Try/Catch avec Error Trigger
```
[Error Trigger] → [Log Error] → [Send Alert]
```

#### 3. Retry Automatique
Dans les settings du workflow :
```json
{
  "retryOnFail": true,
  "retryCount": 3,
  "retryDelay": 1000
}
```

### Validation Préventive

```json
{
  "type": "n8n-nodes-base.if",
  "parameters": {
    "conditions": {
      "conditions": [
        {
          "leftValue": "={{ $json.body.access_token }}",
          "rightValue": "",
          "operator": { "operation": "notEquals" }
        }
      ]
    }
  }
}
```

### Réponses d'Erreur Standardisées

```json
{
  "error": {
    "code": 400,
    "message": "Description de l'erreur",
    "status": "BAD_REQUEST"
  }
}
```

---

## Sécurité et Credentials

### Règles Impératives

1. **JAMAIS de credentials en dur dans le workflow**
   ```json
   // MAUVAIS
   "apiKey": "sk-xxx-actual-key"

   // BON - Utiliser les credentials n8n
   "credentials": {
     "apiKeyAuth": { "id": "xxx", "name": "My API Key" }
   }
   ```

2. **Tokens OAuth passés dynamiquement**
   ```json
   "accessToken": "={{ $json.body.access_token }}"
   ```

3. **Valider les tokens avant utilisation**
   - Vérifier que le token n'est pas vide
   - Gérer les erreurs 401/403 de manière appropriée

### Webhooks Sécurisés

1. **Utiliser HTTPS** (configuré au niveau n8n)
2. **Valider l'origine des requêtes** si nécessaire
3. **Limiter les méthodes HTTP acceptées**
   ```json
   "httpMethod": "POST"  // Pas de GET pour les webhooks sensibles
   ```

---

## Performance et Optimisation

### Limiter les Données

1. **Pagination**
   ```json
   "maxResults": "={{ $json.body.max_results || 100 }}"
   ```

2. **Sélection de champs**
   - Ne récupérer que les champs nécessaires
   - Utiliser les paramètres `fields` des APIs quand disponibles

### Éviter les Boucles Coûteuses

```javascript
// MAUVAIS - Appel API dans une boucle
for (const item of items) {
  await fetchData(item);  // N appels séquentiels
}

// BON - Batch ou parallélisation
await fetchBatch(items);  // 1 appel
```

### Timeout et Limites

```json
{
  "settings": {
    "executionTimeout": 300,  // 5 minutes max
    "maxNodes": 100
  }
}
```

---

## Tests et Débogage

### Méthodes de Test

1. **Exécution Manuelle**
   - Tester chaque branche individuellement
   - Vérifier les données à chaque étape

2. **Pin Data**
   - Épingler des données de test sur les nodes trigger
   - Permet de tester sans déclencher réellement

3. **Logs de Débogage**
   ```bash
   # Démarrer n8n en mode debug
   ./scripts/n8n_debug.sh
   ```

### Vérification des Workflows

```bash
# Lister les workflows
python3 scripts/n8n_api.py list

# Exporter pour inspection
python3 scripts/n8n_api.py export <id> /tmp/workflow.json

# Importer après modifications
python3 scripts/n8n_api.py import workflow.json
```

### Points de Contrôle

- [ ] Le workflow s'active sans erreur
- [ ] Toutes les branches retournent une réponse
- [ ] Les valeurs par défaut sont définies
- [ ] Les erreurs sont gérées gracieusement

---

## Documentation et Maintenance

### Documentation Inline

Utiliser les **Sticky Notes** pour documenter :

```json
{
  "type": "n8n-nodes-base.stickyNote",
  "parameters": {
    "color": 6,
    "width": 200,
    "height": 150,
    "content": "## USAGE\n\nEndpoint: POST /webhook/xxx\n\nRequired: access_token"
  }
}
```

### Couleurs des Sticky Notes

| Color | Usage Recommandé |
|-------|------------------|
| 1 (Jaune) | Notes générales |
| 2 (Vert) | Success paths |
| 3 (Bleu) | Information |
| 4 (Rouge) | Warnings, erreurs |
| 5 (Orange) | Configuration |
| 6 (Violet) | Documentation API |

### Versioning

1. **Stocker les workflows dans Git**
   ```
   workflows/
   ├── mcp/
   │   ├── MCP_Calendar_Server.json
   │   └── MCP_Drive_Server.json
   └── automations/
       └── email_processor.json
   ```

2. **Commits descriptifs**
   ```
   feat(calendar): add Google Meet support
   fix(drive): handle empty folder listing
   ```

---

## Import/Export de Workflows

### Format d'Export

Le format minimal pour l'import via API :

```json
{
  "name": "Workflow Name",
  "nodes": [...],
  "connections": {...},
  "settings": { "executionOrder": "v1" }
}
```

### Propriétés à Éviter à l'Import

Ces propriétés causent l'erreur 400 `must NOT have additional properties` :

- `active`
- `versionId`
- `meta`
- `tags`
- `id` (sera généré automatiquement)

### Script d'Import

```bash
# Import simple
python3 scripts/n8n_api.py import workflow.json

# Vérifier le résultat
python3 scripts/n8n_api.py list | grep "Workflow Name"
```

### Migration entre Environnements

1. Exporter le workflow source
2. Supprimer les propriétés non portables (`id`, `versionId`, etc.)
3. Mettre à jour les références de credentials
4. Importer dans l'environnement cible

---

## Pièges Courants à Éviter

### 1. Erreurs de Type de Node

| Problème | Cause | Solution |
|----------|-------|----------|
| `Unrecognized node type` | Type incorrect | Format: `package.nodeName` |
| Node avec `?` | Node non installé | Vérifier installation et redémarrer |
| `CUSTOM.xxx` | Ancien format | Utiliser `n8n-nodes-xxx.nodeName` |

### 2. Erreurs d'Expression

```javascript
// MAUVAIS - Peut crasher si body est undefined
"={{ $json.body.field }}"

// BON - Accès sécurisé
"={{ $json.body?.field || '' }}"
// ou
"={{ ($json.body && $json.body.field) || '' }}"
```

### 3. Connexions Manquantes

Vérifier que :
- Toutes les sorties de Switch sont connectées
- Toutes les branches convergent vers Response
- Pas de nodes "orphelins"

### 4. Problèmes de Credentials

| Symptôme | Cause | Solution |
|----------|-------|----------|
| Icône orange | Expression non évaluable | Normal si expression dynamique |
| Erreur 401 | Token expiré/invalide | Vérifier le token source |
| Credential non trouvé | ID différent | Recréer la référence |

### 5. Problèmes de Position

```json
// Positions doivent être des tableaux [x, y]
"position": [200, 300]  // Correct
"position": {"x": 200, "y": 300}  // Incorrect
```

### 6. Webhook Response Mode

Pour les workflows MCP (webhook → response) :

```json
{
  "parameters": {
    "httpMethod": "POST",
    "path": "mcp-xxx",
    "responseMode": "responseNode"  // IMPORTANT
  }
}
```

Sans `responseMode: "responseNode"`, la réponse sera envoyée immédiatement après le webhook.

---

## Checklist de Validation

### Avant Déploiement

- [ ] Workflow s'active sans erreur
- [ ] Tous les nodes sont connectés
- [ ] Valeurs par défaut définies
- [ ] Gestion des cas d'erreur
- [ ] Documentation (Sticky Notes)
- [ ] Tests manuels effectués

### Structure JSON

- [ ] Propriétés minimales uniquement (`name`, `nodes`, `connections`, `settings`)
- [ ] IDs de nodes uniques
- [ ] Types de nodes au format `package.nodeName`
- [ ] Positions valides `[x, y]`

### Sécurité

- [ ] Pas de credentials en dur
- [ ] Tokens passés dynamiquement
- [ ] Validation des entrées
- [ ] Méthodes HTTP appropriées

---

## Ressources

- [Documentation n8n officielle](https://docs.n8n.io/)
- [Guide Custom Nodes](./CUSTOM_NODE_DEVELOPMENT.md)
- [Exemples de Workflows](./exemples-workflows.md)
- [API Documentation MCP](../mcp/)
