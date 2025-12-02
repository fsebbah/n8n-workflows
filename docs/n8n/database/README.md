# Base de Données des Workflows n8n

Ce dossier contient les fichiers nécessaires pour créer et gérer la base de données SQLite des workflows n8n.

## Structure

```
database/
├── alembic.ini                 # Configuration Alembic
├── import_data.py              # Script d'import des données
├── README.md                   # Ce fichier
└── migrations/
    ├── env.py                  # Configuration environnement Alembic
    ├── script.py.mako          # Template de migration
    └── versions/
        └── 20251202_0001_initial_schema.py  # Migration initiale
```

## Schéma de la Base de Données

```
┌─────────────────┐       ┌─────────────────┐
│   categories    │       │    workflows    │
├─────────────────┤       ├─────────────────┤
│ id              │◀──────│ category_id     │
│ name            │       │ id              │
│ workflows_count │       │ filename        │
└─────────────────┘       │ name            │
                          │ description     │
                          │ nodes_count     │
                          │ meta_category   │
                          │ meta_status     │
                          │ meta_created_at │
                          └────────┬────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ workflow_tags   │    │workflow_node_   │    │  workflows_fts  │
├─────────────────┤    │     types       │    ├─────────────────┤
│ workflow_id     │    ├─────────────────┤    │ (FTS5 search)   │
│ tag_id          │    │ workflow_id     │    │ name            │
└────────┬────────┘    │ node_type_id    │    │ description     │
         │             └────────┬────────┘    └─────────────────┘
         ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│     tags        │    │   node_types    │
├─────────────────┤    ├─────────────────┤
│ id              │    │ id              │
│ name            │    │ name            │
└─────────────────┘    └─────────────────┘
```

## Installation

### Prérequis

```bash
pip install alembic sqlalchemy
```

### Créer la base de données

#### Option 1: Via le script d'import (recommandé)

```bash
cd docs/n8n/database
python import_data.py
```

Options disponibles:
- `--json PATH` : Chemin vers le fichier JSON (défaut: `../workflows-catalog.json`)
- `--db PATH` : Chemin vers la base SQLite (défaut: `./workflows.db`)

#### Option 2: Via Alembic (schéma uniquement)

```bash
cd docs/n8n/database
alembic upgrade head
```

Puis importer les données:
```bash
python import_data.py --db workflows.db
```

## Exemples de Requêtes SQL

### Lister les catégories

```sql
SELECT name, workflows_count
FROM categories
ORDER BY workflows_count DESC
LIMIT 10;
```

### Rechercher des workflows

```sql
-- Par nom de catégorie
SELECT w.name, w.description, w.nodes_count
FROM workflows w
JOIN categories c ON w.category_id = c.id
WHERE c.name = 'Googlesheets';

-- Par nombre de nodes
SELECT name, nodes_count
FROM workflows
WHERE nodes_count > 20
ORDER BY nodes_count DESC;
```

### Recherche full-text

```sql
-- Recherche simple
SELECT w.name, c.name as category
FROM workflows_fts fts
JOIN workflows w ON fts.rowid = w.id
JOIN categories c ON w.category_id = c.id
WHERE workflows_fts MATCH 'email automation';

-- Avec ranking
SELECT w.name, c.name as category, rank
FROM workflows_fts fts
JOIN workflows w ON fts.rowid = w.id
JOIN categories c ON w.category_id = c.id
WHERE workflows_fts MATCH 'google sheets'
ORDER BY rank;
```

### Workflows par type de node

```sql
SELECT w.name, w.nodes_count, c.name as category
FROM workflows w
JOIN workflow_node_types wnt ON w.id = wnt.workflow_id
JOIN node_types nt ON wnt.node_type_id = nt.id
JOIN categories c ON w.category_id = c.id
WHERE nt.name = 'googleSheets';
```

### Types de nodes les plus utilisés

```sql
SELECT nt.name, COUNT(*) as usage_count
FROM node_types nt
JOIN workflow_node_types wnt ON nt.id = wnt.node_type_id
GROUP BY nt.id
ORDER BY usage_count DESC
LIMIT 20;
```

### Workflows avec plusieurs tags

```sql
SELECT w.name, GROUP_CONCAT(t.name, ', ') as tags
FROM workflows w
JOIN workflow_tags wt ON w.id = wt.workflow_id
JOIN tags t ON wt.tag_id = t.id
GROUP BY w.id
HAVING COUNT(t.id) > 1;
```

## Statistiques

Après import complet:

| Métrique | Valeur |
|----------|--------|
| Catégories | 188 |
| Workflows | 2061 |
| Tags uniques | 5 |
| Types de nodes | 419 |
| Taille DB | ~1.8 MB |

## Maintenance

### Reconstruire l'index FTS

```sql
INSERT INTO workflows_fts(workflows_fts) VALUES('rebuild');
```

### Optimiser la base

```sql
VACUUM;
ANALYZE;
```

## Notes

- La base utilise SQLite avec FTS5 pour la recherche full-text
- Les triggers maintiennent automatiquement l'index FTS synchronisé
- Le fichier `workflows.db` n'est pas versionné (généré localement)
