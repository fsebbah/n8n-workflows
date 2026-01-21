# Migration /api/jobs → /api/v2/jobs

## Contexte
L'API `/api/jobs` a été remplacée par `/api/v2/jobs` (PR #241).
Les workflows n8n doivent être mis à jour.

---

## Workflows à modifier

### 1. MCP---PDF-Layout-Translator.json

| Ligne | Noeud à identifier | Modification |
|-------|-------------------|--------------|
| 73 | `POST /api/jobs` (Create Job) | → `/api/v2/jobs` |
| 231 | `PATCH /api/jobs/{id}` (Update Job) | → `/api/v2/jobs/{id}` |

---

### 2. Torah-Translate-Worker.json

| Ligne | Noeud à identifier | Modification |
|-------|-------------------|--------------|
| 6 | Sticky Note (documentation) | Mettre à jour le texte |
| 78 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |
| 437 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |

---

### 3. Torah-Translate-Page-Worker.json

| Ligne | Noeud à identifier | Modification |
|-------|-------------------|--------------|
| 6 | Sticky Note (documentation) | Mettre à jour le texte |
| 78 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |
| 312 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |
| 346 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |

---

### 4. Torah-Translate-Page.json

| Ligne | Noeud à identifier | Modification |
|-------|-------------------|--------------|
| 259 | `POST /api/jobs` (Create Job) | → `/api/v2/jobs` |

---

### 5. Torah-Discord-Translation-v2-Unified.json

| Ligne | Noeud à identifier | Modification |
|-------|-------------------|--------------|
| 198 | `POST /api/jobs` (Create Job) | → `/api/v2/jobs` |

---

### 6. Books-Translate-Commentaries.json

| Ligne | Noeud à identifier | Modification |
|-------|-------------------|--------------|
| 162 | `POST /api/jobs` (Create Job) | → `/api/v2/jobs` |

---

### 7. Books-Translation-Manager.json

| Ligne | Noeud à identifier | Modification |
|-------|-------------------|--------------|
| 6 | Sticky Note (documentation) | Mettre à jour le texte |
| 162 | `POST /api/jobs` (Create Job) | → `/api/v2/jobs` |

---

### 8. Books-Translation-Worker.json

| Ligne | Noeud à identifier | Modification |
|-------|-------------------|--------------|
| 6 | Sticky Note (documentation) | Mettre à jour le texte |
| 78 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |
| 312 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |
| 359 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |

---

### 9. Books-Commentary-Worker.json

| Ligne | Noeud à identifier | Modification |
|-------|-------------------|--------------|
| 6 | Sticky Note (documentation) | Mettre à jour le texte |
| 78 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |
| 312 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |
| 359 | `PATCH /api/jobs/{id}` | → `/api/v2/jobs/{id}` |

---

## Résumé

| Workflow | POST | PATCH | Doc |
|----------|------|-------|-----|
| MCP---PDF-Layout-Translator | 1 | 1 | - |
| Torah-Translate-Worker | - | 2 | 1 |
| Torah-Translate-Page-Worker | - | 3 | 1 |
| Torah-Translate-Page | 1 | - | - |
| Torah-Discord-Translation-v2-Unified | 1 | - | - |
| Books-Translate-Commentaries | 1 | - | - |
| Books-Translation-Manager | 1 | - | 1 |
| Books-Translation-Worker | - | 3 | 1 |
| Books-Commentary-Worker | - | 3 | 1 |
| **TOTAL** | **5** | **12** | **5** |

---

## Commande pour corriger automatiquement

```bash
# Remplacer /api/jobs par /api/v2/jobs dans tous les fichiers
cd /home/fsebb/n8n-workflows/workflows

# URLs (pas la doc)
find . -name "*.json" -exec sed -i 's|/api/jobs/|/api/v2/jobs/|g' {} \;
find . -name "*.json" -exec sed -i 's|/api/jobs"|/api/v2/jobs"|g' {} \;

# Documentation (optionnel)
find . -name "*.json" -exec sed -i 's|PATCH /api/jobs|PATCH /api/v2/jobs|g' {} \;
find . -name "*.json" -exec sed -i 's|POST /api/jobs|POST /api/v2/jobs|g' {} \;
```

---

## Après migration

1. Ré-importer les workflows modifiés dans n8n
2. Activer les workflows
3. Tester avec un job de traduction
