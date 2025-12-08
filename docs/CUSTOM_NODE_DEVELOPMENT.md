# Guide de Développement de Custom Nodes n8n

## Problèmes Rencontrés et Solutions

Ce document résume les problèmes rencontrés lors du développement du node `n8n-nodes-calendar-dynamic` et les solutions appliquées.

---

## 1. Type de Node dans le Workflow JSON

### Problème
Le workflow JSON utilisait `"type": "CUSTOM.calendarToolDynamic"` mais n8n ne reconnaissait pas ce type et affichait :
- Erreur 400 : `Unrecognized node type: CUSTOM.calendarToolDynamic`
- Dans l'UI : icône `?` avec message "Install this node to use it"

### Solution
Le type correct est **`n8n-nodes-calendar-dynamic.calendarToolDynamic`** (format: `<package-name>.<node-name>`).

**Mauvais :**
```json
"type": "CUSTOM.calendarToolDynamic"
```

**Correct :**
```json
"type": "n8n-nodes-calendar-dynamic.calendarToolDynamic"
```

### Comment trouver le bon type ?
1. Créer manuellement un node dans l'UI n8n
2. Sauvegarder le workflow
3. Exporter le workflow via API : `python3 scripts/n8n_api.py export <id> /tmp/export.json`
4. Chercher le champ `"type"` dans le JSON exporté

---

## 2. Installation du Custom Node

### Structure requise
```
~/.n8n/nodes/
├── package.json                    # Doit lister les dépendances
├── node_modules/                   # Créé par npm install
├── n8n-nodes-calendar-dynamic/     # Le custom node
│   ├── dist/                       # Code compilé (npm run build)
│   ├── nodes/
│   │   └── CalendarToolDynamic/
│   │       ├── CalendarToolDynamic.node.ts
│   │       └── calendar.svg
│   ├── package.json
│   └── tsconfig.json
└── n8n-nodes-gmail-dynamic/        # Autre custom node (référence)
```

### Étapes d'installation

1. **Copier le node** dans `~/.n8n/nodes/` :
```bash
cp -r custom-nodes/n8n-nodes-calendar-dynamic ~/.n8n/nodes/
```

2. **Ajouter la dépendance** dans `~/.n8n/nodes/package.json` :
```json
{
  "name": "installed-nodes",
  "private": true,
  "dependencies": {
    "n8n-nodes-calendar-dynamic": "file:./n8n-nodes-calendar-dynamic"
  }
}
```

3. **Installer les dépendances** :
```bash
cd ~/.n8n/nodes && npm install
```

4. **Redémarrer n8n** :
```bash
./scripts/n8n_debug.sh
```

### Vérification du chargement
Dans les logs de démarrage n8n, chercher :
```
Loaded all credentials and nodes from n8n-nodes-calendar-dynamic { "credentials": 0, "nodes": 1 }
```

Si cette ligne n'apparaît pas, le node n'est pas chargé.

---

## 3. Erreur "Access Token Required" à l'activation

### Problème
Le workflow ne peut pas être activé car le champ `accessToken` est `required: true` et n8n valide les champs requis même si une expression est utilisée.

### Solution
Ce n'est PAS un bug - c'est un avertissement normal. Si l'expression est correctement configurée (`={{ $json.body.access_token }}`), le workflow peut quand même être activé.

L'icône d'avertissement orange dans l'UI indique que l'expression ne peut pas être évaluée au moment du design (car il n'y a pas de données d'entrée), mais elle fonctionnera à l'exécution.

---

## 4. npm link vs Copie Directe

### Problème
`npm link` crée un symlink dans `node_modules/` mais cela peut causer des conflits si le dossier existe aussi directement dans `~/.n8n/nodes/`.

### Solution recommandée
**Ne pas utiliser `npm link`**. Utiliser la méthode de copie directe + dépendance file:

```bash
# 1. Copier le node
cp -r custom-nodes/n8n-nodes-calendar-dynamic ~/.n8n/nodes/

# 2. Ajouter dans package.json
# "n8n-nodes-calendar-dynamic": "file:./n8n-nodes-calendar-dynamic"

# 3. npm install
cd ~/.n8n/nodes && npm install
```

---

## 5. Checklist de Déploiement

### Avant le déploiement
- [ ] Le node compile sans erreur (`npm run build`)
- [ ] Le `package.json` du node a la section `n8n` correcte :
  ```json
  "n8n": {
    "n8nNodesApiVersion": 1,
    "nodes": ["dist/nodes/CalendarToolDynamic/CalendarToolDynamic.node.js"]
  }
  ```
- [ ] L'icône SVG existe dans `dist/` après le build

### Déploiement
- [ ] Copier dans `~/.n8n/nodes/`
- [ ] Ajouter la dépendance dans `~/.n8n/nodes/package.json`
- [ ] Exécuter `npm install` dans `~/.n8n/nodes/`
- [ ] Redémarrer n8n

### Vérification
- [ ] Le log montre "Loaded all credentials and nodes from n8n-nodes-xxx"
- [ ] Le node apparaît dans l'UI (recherche par nom)
- [ ] Un workflow peut être créé et activé avec ce node

### Workflow JSON
- [ ] Le type utilise le format `<package-name>.<node-name>` (pas `CUSTOM.xxx`)
- [ ] Les IDs des nodes sont des UUIDs (générés par n8n, pas personnalisés)

---

## 6. Commandes Utiles

### Lister les workflows
```bash
python3 scripts/n8n_api.py list | grep -i "nom"
```

### Exporter un workflow
```bash
python3 scripts/n8n_api.py export <workflow_id> /tmp/export.json
```

### Importer un workflow
```bash
python3 scripts/n8n_api.py import workflows/mcp/MCP_Calendar_Server.json
```

### Activer un workflow
```bash
python3 scripts/n8n_api.py activate <workflow_id>
```

### Supprimer un workflow
```bash
python3 scripts/n8n_api.py delete <workflow_id>
```

### Voir les logs n8n
```bash
./scripts/n8n_debug.sh
# Les logs apparaissent dans la console
```

---

## 7. Différences avec Gmail Dynamic (Référence)

| Aspect | Gmail Dynamic | Calendar Dynamic |
|--------|---------------|------------------|
| Package name | n8n-nodes-gmail-dynamic | n8n-nodes-calendar-dynamic |
| Node name | gmailToolDynamic | calendarToolDynamic |
| Type dans JSON | n8n-nodes-gmail-dynamic.gmailToolDynamic | n8n-nodes-calendar-dynamic.calendarToolDynamic |
| API endpoint | googleapis.com/gmail/v1 | googleapis.com/calendar/v3 |

---

## 8. Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `Unrecognized node type: CUSTOM.xxx` | Mauvais type dans le JSON | Utiliser `<package>.<node>` au lieu de `CUSTOM.xxx` |
| Node non visible dans l'UI | Node pas chargé au démarrage | Vérifier les logs, refaire npm install, redémarrer |
| `?` sur le node dans le workflow | Type incorrect ou node non installé | Recréer le node manuellement dans l'UI |
| Erreur 400 à l'activation | Plusieurs causes possibles | Vérifier le type, vérifier que le node est chargé |
| Avertissement orange sur accessToken | Normal - expression non évaluable au design | Ignorer, le workflow peut être activé |
