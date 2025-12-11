# Context Caching pour le Traitement Vidéo avec Gemini

## Le "Game Changer" économique

Sans le **Context Caching**, chaque fois que vous posez une question sur votre vidéo de 1 heure (environ 700k à 1M de tokens), vous payez le traitement de toute la vidéo. Si vous faites 3 appels (1. Extraire les slides, 2. Résumer, 3. Analyser le ton), vous payez 3 fois le prix fort.

Avec le Caching : vous payez le chargement **une fois**, et les questions suivantes coûtent une fraction du prix (environ **4x moins cher** pour le contexte, selon les tarifs actuels).

## Comparaison des coûts

| Scénario | Sans Cache | Avec Cache |
|----------|-----------|------------|
| Vidéo 1h (~800k tokens) | 800k × 3 appels = 2.4M tokens | 800k + (prompt × 3) ≈ 850k tokens |
| Coût Gemini 1.5 Pro | ~$3.00 | ~$0.85 |
| **Économie** | - | **~70%** |

## Workflow avec Context Caching

Ce script montre comment créer un cache pour votre vidéo, puis l'interroger deux fois (Slides + Résumé) sans recharger la vidéo.

```python
import google.generativeai as genai
from google.generativeai import caching
import datetime
import time

# 1. Upload de la vidéo (Standard)
# Astuce : Pour le caching, la vidéo doit avoir fini d'être traitée côté Google
video_file = genai.upload_file(path="ma_conference.mp4")

print(f"Traitement de la vidéo {video_file.name} en cours...")
while video_file.state.name == "PROCESSING":
    time.sleep(10)
    video_file = genai.get_file(video_file.name)
print("Vidéo prête.")

# 2. CRÉATION DU CACHE (C'est ici que ça se joue)
# On définit un cache qui va durer 1 heure (TTL).
# Si votre script plante et relance dans 10 min, il pourra réutiliser ce cache s'il a le nom.
cache = caching.CachedContent.create(
    model="models/gemini-1.5-pro-002",
    display_name="cache_conference_Q3", # Pour le retrouver
    system_instruction="Tu es un assistant expert en analyse de conférences vidéo.",
    contents=[video_file],
    ttl=datetime.timedelta(minutes=60), # Durée de vie du cache
)

print(f"Cache créé avec succès. Expire le : {cache.expire_time}")

# 3. Instanciation du modèle LIÉ au cache
# Notez qu'on utilise 'from_cached_content' au lieu du constructeur classique
cached_model = genai.GenerativeModel.from_cached_content(cached_content=cache)

# --- REQUÊTE 1 : Extraction des Slides (JSON) ---
# Coût : Très faible (uniquement le prompt et la réponse, le contexte vidéo est "gratuit" ici car déjà payé/caché)
print("--- Démarrage Extraction Slides ---")
prompt_slides = """
Extrais la liste des slides visibles au format JSON avec :
timestamp_ms, titre, contenu_ocr.
"""
response_slides = cached_model.generate_content(
    prompt_slides,
    generation_config={"response_mime_type": "application/json"}
)
print(response_slides.text)

# --- REQUÊTE 2 : Analyse du Speaker (Sentiment) ---
# Coût : Encore très faible. On réutilise le même contexte lourd.
print("--- Démarrage Analyse Speaker ---")
prompt_speaker = """
Analyse le ton de l'orateur. Est-il confiant, inquiet, ou neutre ?
Cite des passages temporels pour justifier.
"""
response_speaker = cached_model.generate_content(prompt_speaker)
print(response_speaker.text)

# 4. (Optionnel) Supprimer le cache manuellement si fini avant le TTL pour être propre
# cache.delete()
```

## Les 3 points critiques pour la Production

### 1. Le TTL (Time To Live)

Le paramètre `ttl` est obligatoire.

- **Pourquoi ?** Le stockage du cache est payant (bien que pas cher à l'heure).
- **Stratégie :** Réglez le TTL sur la durée estimée de votre workflow (ex: 20 minutes). Si vous ne le faites pas, le cache expire par défaut après une courte période ou reste actif trop longtemps si mal configuré, ce qui peut engendrer des frais de stockage inutiles.

### 2. Le Modèle Compatible

Le caching fonctionne sur les versions stables et récentes. Utilisez explicitement `gemini-1.5-pro-002` ou `gemini-1.5-flash-002`. Les versions "experimentales" ou trop anciennes peuvent ne pas supporter cette fonction.

### 3. La Rentabilité (Le seuil des 32k)

Google précise que le Context Caching devient rentable si votre contexte dépasse **32 000 tokens** (ce qui est très vite atteint avec de la vidéo : 1 seconde de vidéo ≈ 250-300 tokens).

- Pour une vidéo de 10 minutes, vous êtes déjà largement gagnant.
- Pour une vidéo de 1 heure, c'est indispensable.

## Persistance du Cache entre Sessions

Vous pouvez lancer le script d'upload à 8h00, récupérer l'ID du cache, et lancer le script d'analyse à 14h00 en réutilisant le même cache sans ré-uploader.

### Script 1 : Upload et création du cache (matin)

```python
import google.generativeai as genai
from google.generativeai import caching
import datetime
import time
import json

# Upload vidéo
video_file = genai.upload_file(path="ma_conference.mp4")
while video_file.state.name == "PROCESSING":
    time.sleep(10)
    video_file = genai.get_file(video_file.name)

# Créer le cache avec un TTL de 8 heures
cache = caching.CachedContent.create(
    model="models/gemini-1.5-pro-002",
    display_name="cache_conference_Q3",
    system_instruction="Tu es un assistant expert en analyse de conférences vidéo.",
    contents=[video_file],
    ttl=datetime.timedelta(hours=8),  # Valide jusqu'à 16h00
)

# Sauvegarder l'ID du cache pour réutilisation
cache_info = {
    "cache_name": cache.name,
    "display_name": cache.display_name,
    "expire_time": str(cache.expire_time),
    "video_file_name": video_file.name
}

with open("cache_info.json", "w") as f:
    json.dump(cache_info, f, indent=2)

print(f"Cache créé : {cache.name}")
print(f"Expire le : {cache.expire_time}")
print("Infos sauvegardées dans cache_info.json")
```

### Script 2 : Réutilisation du cache (après-midi)

```python
import google.generativeai as genai
from google.generativeai import caching
import json

# Charger les infos du cache
with open("cache_info.json", "r") as f:
    cache_info = json.load(f)

# Récupérer le cache existant par son nom
cache = caching.CachedContent.get(cache_info["cache_name"])

print(f"Cache récupéré : {cache.display_name}")
print(f"Expire le : {cache.expire_time}")

# Créer le modèle depuis le cache
cached_model = genai.GenerativeModel.from_cached_content(cached_content=cache)

# Faire des requêtes sans repayer le contexte vidéo !
response = cached_model.generate_content(
    "Quels sont les 5 points clés de cette conférence ?"
)
print(response.text)
```

### Lister tous les caches actifs

```python
import google.generativeai as genai
from google.generativeai import caching

# Lister tous les caches
for cache in caching.CachedContent.list():
    print(f"- {cache.display_name} ({cache.name})")
    print(f"  Expire: {cache.expire_time}")
    print(f"  Model: {cache.model}")
    print()
```

## Intégration dans n8n

### Option 1 : Node Code avec cache

```javascript
// Dans un node Code n8n
const cache_name = $json.cache_name; // Récupéré d'un appel précédent

// Appeler l'API avec le cache
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/${cache_name}:generateContent`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${$credentials.googleVertexAi.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Extrais les slides..." }] }]
    })
  }
);
```

### Option 2 : Workflow multi-étapes

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Upload Video │ ──► │ Create Cache │ ──► │ Save Cache ID│
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
        ┌────────────────────────────────────────┘
        │
        ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Load Cache   │ ──► │ Query 1:     │ ──► │ Query 2:     │
│ by ID        │     │ Extract Slides│     │ Analyze Tone │
└──────────────┘     └──────────────┘     └──────────────┘
```

## Coûts détaillés du Caching

| Élément | Coût |
|---------|------|
| Stockage du cache | $1.00 / 1M tokens / heure |
| Input tokens (cache hit) | 75% moins cher que normal |
| Output tokens | Prix normal |

### Exemple de calcul

Vidéo 1h = 800k tokens, 3 requêtes sur 30 minutes :

| Sans Cache | Avec Cache |
|-----------|------------|
| 800k × 3 × $0.00125 = $3.00 | Cache: 800k × $0.001 × 0.5h = $0.40 |
| | Requêtes: 800k × 3 × $0.0003125 = $0.75 |
| | **Total: $1.15** |

**Économie : 62%**

## Bonnes pratiques

1. **Nommer les caches clairement** : `cache_video_{video_id}_{date}`
2. **TTL adapté** : Pas trop court (re-création coûteuse), pas trop long (stockage payant)
3. **Supprimer après usage** : `cache.delete()` si le workflow est terminé
4. **Monitorer les caches actifs** : Script de nettoyage quotidien

## Limitations

- Taille minimum du contexte : 32k tokens (sinon pas rentable)
- TTL maximum : 1 heure par défaut, extensible
- Modèles supportés : gemini-1.5-pro-002, gemini-1.5-flash-002
- Le cache est lié à un projet GCP spécifique

## Voir aussi

- [Documentation Google - Context Caching](https://ai.google.dev/gemini-api/docs/caching)
- [Tarification Gemini](https://ai.google.dev/pricing)
- [Video Understanding Notebook](../colab/Video_understanding.ipynb)
