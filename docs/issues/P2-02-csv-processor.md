# P2-02: csv_processor_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-02 |
| **Nom** | csv_processor_tool |
| **Priorité** | Basse |
| **Statut** | A implémenter |
| **Catégorie** | Data Analysis / Scraping |

## Description

Workflow n8n pour le parsing et la transformation de fichiers CSV. Utilise les nodes natifs n8n avec support DuckDB pour les gros volumes.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Parsing CSV | **n8n Spreadsheet File** | Node natif, robuste |
| Traitement gros fichiers | **DuckDB** | Performant sur gros volumes |
| Fallback | Code node (Papa Parse) | Flexibilité |

## Endpoint

```
POST /webhook/csv-processor
Content-Type: application/json

{
  "source": "url" | "base64",
  "data": "<url_ou_base64>",
  "operation": "parse" | "filter" | "transform" | "aggregate",
  "options": {
    "delimiter": "," | ";" | "\t",
    "has_header": true,
    "encoding": "utf-8"
  },
  "filter": {
    "column": "status",
    "operator": "equals" | "contains" | "gt" | "lt",
    "value": "active"
  },
  "transform": {
    "select_columns": ["col1", "col2"],
    "rename": {"old_name": "new_name"}
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "rows": [...],
    "columns": ["col1", "col2", "col3"],
    "row_count": 150,
    "operation_applied": "filter"
  },
  "meta": {
    "provider": "n8n-native",
    "execution_mode": "online",
    "processing_time_ms": 45
  }
}
```

## Definition of Done

- [ ] Endpoint `POST /webhook/csv-processor`
- [ ] Input: URL CSV ou base64
- [ ] Opérations: parse, filter, transform, aggregate
- [ ] Output: JSON array ou CSV transformé
- [ ] BOM UTF-8 (`\uFEFF`) activé pour Excel
- [ ] Délimiteur `;` pour Excel FR
- [ ] Mode Append si gros volume
- [ ] Tests: CSV standard, CSV avec BOM, délimiteurs variés

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| CSV standard | Fichier UTF-8 avec virgule | Parse OK |
| CSV Excel FR | Fichier avec BOM et point-virgule | Parse OK |
| Gros fichier | > 10k lignes | Stream/pagination |
| Filter | Filtrer par colonne | Résultats filtrés |
| Transform | Renommer colonnes | Colonnes renommées |

## Dépendances

- Aucune API externe requise
- Node n8n: `Spreadsheet File`
- Optionnel: DuckDB pour analytics

## Notes d'implémentation

1. Détecter automatiquement le délimiteur si non spécifié
2. Gérer les encodages (UTF-8, ISO-8859-1, Windows-1252)
3. Supporter les fichiers avec/sans header
4. Limiter la taille des fichiers (configurable, défaut 50MB)

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack Scraping](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-scraping-n8n--phase-2-v2)
- [tools-complementaire.md](../n8n/tools-complementaire.md)
