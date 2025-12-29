# Issue: API /translations/search ne supporte pas source_text

**Date**: 2025-12-29
**Priorité**: Haute
**Composant**: Torah API - `/api/translations/search`

## Contexte

Le workflow n8n "Torah Discord Translation" permet de traduire des textes libres (sans référence talmudique). Ces traductions sont sauvegardées avec un `text_hash` (SHA256 du texte source) pour le cache.

## Problème

### Comportement actuel

1. **Sauvegarde** (`POST /api/translations/save`) : Fonctionne correctement
   - Reçoit `source_text` dans le body
   - Calcule le `text_hash` côté serveur
   - Sauvegarde dans `free_translations` avec le hash

2. **Recherche** (`GET /api/translations/search`) : Ne fonctionne PAS
   - Reçoit `source_text` en query param
   - **Ne calcule PAS le hash**
   - Retourne `400 Bad Request` ou `found: false`

### Logs observés

```
13:31:30 GET /api/translations/search?source_text=הָעוֹשֶׂה... → 400 Bad Request
13:31:40 POST /api/translations/save → 200 OK (hash calculé côté serveur)
13:32:40 GET /api/translations/search?source_text=הָעוֹשֶׂה... → 400 Bad Request (même texte!)
13:33:48 GET /api/translations/search?text_hash=2f6ea4c2... → 200 OK (avec hash explicite)
```

### Pourquoi n8n ne peut pas calculer le hash

n8n bloque le module `crypto` pour des raisons de sécurité :
```
Error: Module 'crypto' is disallowed in Code node
```

## Solution demandée

Modifier l'endpoint `GET /api/translations/search` pour :

1. Si `source_text` est fourni (et pas de `text_hash`) :
   - Calculer le SHA256 du `source_text`
   - Chercher dans `free_translations` par ce hash

### Pseudo-code

```python
@router.get("/api/translations/search")
async def search_translation(
    source_text: Optional[str] = None,
    text_hash: Optional[str] = None,
    # ... autres params
):
    # Si source_text fourni, calculer le hash
    if source_text and not text_hash:
        text_hash = hashlib.sha256(source_text.encode('utf-8')).hexdigest()

    # Chercher par text_hash dans free_translations
    if text_hash:
        result = await db.query(
            "SELECT * FROM free_translations WHERE text_hash = $1",
            text_hash
        )
        if result:
            return {"found": True, ...}

    # ... reste de la logique existante
```

## Test de validation

```bash
# 1. Sauvegarder une traduction libre
curl -X POST "http://pi6.local:3031/api/translations/save" \
  -H "Content-Type: application/json" \
  -d '{"source_text": "שלום עולם", "translated_text": "Bonjour monde", "target_language": "fr", "provider": "test", "model": "test"}'

# 2. Rechercher par source_text (devrait fonctionner après le fix)
curl "http://pi6.local:3031/api/translations/search?source_text=%D7%A9%D7%9C%D7%95%D7%9D%20%D7%A2%D7%95%D7%9C%D7%9D&target_language=fr"
# Attendu: {"found": true, ...}
```

## Impact

Sans ce fix :
- Chaque traduction libre est retraduite à chaque demande
- Coût API Claude/GPT-4o multiplié
- Latence utilisateur augmentée
- Cache inutile pour les traductions libres

## Fichiers concernés (Torah API)

- `api/routers/translation_optimized.py` - fonction `search_translation`
