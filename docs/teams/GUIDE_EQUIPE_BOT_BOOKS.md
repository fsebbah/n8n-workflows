# Guide Équipe Bot - Traduction Books API

Guide d'intégration Discord pour la traduction des livres (Second Temple, Breslov, Tanakh, etc.).

---

## 1. Architecture

```
Utilisateur Discord
       │
       ▼
  Bot Discord ◄────────────────────────┐
       │                               │
       │ POST /webhook/books-translate │ GET /webhook/books-job-status
       ▼                               │
     n8n                               │
       │                               │
       ├── Claude (traduction)         │
       ├── GPT-4o (vérification)       │
       └── API Books (sauvegarde) ─────┘
```

---

## 2. Endpoints n8n disponibles

### 2.1 Lancer une traduction

**POST** `http://pi6.local:5678/webhook/books-translate`

#### Request

```json
{
  "project": "Second Temple",
  "text_name": "The Book of Maccabees II",
  "chapter": 3,
  "target_language": "fr",
  "api_key": "sk-ant-xxx",
  "openai_api_key": "sk-xxx"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `project` | string | Non | Nom du projet (informatif) |
| `text_name` | string | **Oui** | Nom exact du livre |
| `chapter` | integer | **Oui** | Numéro du chapitre |
| `target_language` | string | Non | Langue cible (défaut: `fr`) |
| `api_key` | string | **Oui** | Clé API Anthropic |
| `openai_api_key` | string | Non | Clé API OpenAI (pour vérification) |

#### Response - Succès (200)

```json
{
  "success": true,
  "job_id": "job_m5k2x8hj9f",
  "status": "started",
  "text_name": "The Book of Maccabees II",
  "chapter": 3,
  "verses_count": 41,
  "verses_to_translate": 28,
  "estimated_seconds": 140
}
```

#### Response - Déjà traduit (200)

```json
{
  "success": true,
  "alreadyComplete": true,
  "message": "Tous les versets sont déjà traduits",
  "text_name": "The Book of Maccabees II",
  "chapter": 3,
  "versesCount": 41,
  "versesToTranslate": 0
}
```

#### Response - Erreur (400/404)

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Le champ \"chapter\" est requis",
    "status": "BAD_REQUEST"
  }
}
```

---

### 2.2 Vérifier le statut d'un job

**GET** `http://pi6.local:5678/webhook/books-job-status?job_id=<job_id>`

#### Response - En cours

```json
{
  "success": true,
  "job_id": "job_m5k2x8hj9f",
  "status": "in_progress",
  "job_type": "books_translation",
  "text_name": "The Book of Maccabees II",
  "chapter": 3,
  "current_verse": 15,
  "total_verses": 28,
  "translations_saved": 14,
  "progress_percent": 50.0,
  "tokens": {
    "claude": { "total_tokens": 8500 },
    "gpt": { "total_tokens": 6200 },
    "total": { "total_tokens": 14700 }
  }
}
```

#### Response - Terminé

```json
{
  "success": true,
  "job_id": "job_m5k2x8hj9f",
  "status": "completed",
  "job_type": "books_translation",
  "text_name": "The Book of Maccabees II",
  "chapter": 3,
  "total_verses": 28,
  "translations_saved": 28,
  "progress_percent": 100,
  "tokens": {
    "total": { "total_tokens": 42000 }
  }
}
```

#### Statuts possibles

| Statut | Description |
|--------|-------------|
| `started` | Job créé, worker lancé |
| `in_progress` | Traduction en cours |
| `completed` | Tous les versets traduits |
| `failed` | Erreur fatale |

---

## 3. Implémentation Bot Discord

### 3.1 Commandes suggérées

| Commande | Description |
|----------|-------------|
| `/books-translate <text> <chapter>` | Lance traduction d'un chapitre |
| `/books-status <job_id>` | Vérifie statut d'un job |
| `/books-list [project]` | Liste livres disponibles (optionnel) |

### 3.2 Exemple Python

```python
import aiohttp
import asyncio

N8N_URL = "http://pi6.local:5678"
ANTHROPIC_KEY = "sk-ant-xxx"
OPENAI_KEY = "sk-xxx"

async def translate_chapter(text_name: str, chapter: int) -> dict:
    """Lance la traduction d'un chapitre."""
    async with aiohttp.ClientSession() as session:
        payload = {
            "text_name": text_name,
            "chapter": chapter,
            "api_key": ANTHROPIC_KEY,
            "openai_api_key": OPENAI_KEY
        }
        async with session.post(
            f"{N8N_URL}/webhook/books-translate",
            json=payload
        ) as resp:
            return await resp.json()

async def get_job_status(job_id: str) -> dict:
    """Récupère le statut d'un job."""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{N8N_URL}/webhook/books-job-status",
            params={"job_id": job_id}
        ) as resp:
            return await resp.json()

async def wait_for_completion(job_id: str, poll_interval: int = 5) -> dict:
    """Attend la fin d'un job avec polling."""
    while True:
        status = await get_job_status(job_id)

        if not status.get("success"):
            return status

        if status["status"] == "completed":
            return status

        if status["status"] == "failed":
            return status

        await asyncio.sleep(poll_interval)
```

### 3.3 Exemple commande Discord.py

```python
import discord
from discord import app_commands

@app_commands.command(name="books-translate", description="Traduit un chapitre")
@app_commands.describe(
    text_name="Nom du livre (ex: The Book of Maccabees II)",
    chapter="Numéro du chapitre"
)
async def books_translate(
    interaction: discord.Interaction,
    text_name: str,
    chapter: int
):
    await interaction.response.defer()

    # Lancer la traduction
    result = await translate_chapter(text_name, chapter)

    if not result.get("success"):
        error = result.get("error", {})
        await interaction.followup.send(
            f"❌ Erreur: {error.get('message', 'Erreur inconnue')}"
        )
        return

    # Vérifier si déjà traduit
    if result.get("alreadyComplete"):
        await interaction.followup.send(
            f"✅ **{text_name}** chapitre {chapter} est déjà entièrement traduit!"
        )
        return

    job_id = result["job_id"]
    verses_to_translate = result["verses_to_translate"]
    estimated = result.get("estimated_seconds", 0)

    # Message initial
    message = await interaction.followup.send(
        f"🚀 **Traduction lancée!**\n"
        f"📖 {text_name} - Chapitre {chapter}\n"
        f"📝 {verses_to_translate} versets à traduire\n"
        f"⏱️ Temps estimé: ~{estimated // 60}min {estimated % 60}s\n"
        f"🔖 Job ID: `{job_id}`"
    )

    # Polling avec mise à jour du message
    while True:
        await asyncio.sleep(10)
        status = await get_job_status(job_id)

        if status["status"] == "completed":
            tokens = status.get("tokens", {}).get("total", {})
            await message.edit(content=(
                f"✅ **Traduction terminée!**\n"
                f"📖 {text_name} - Chapitre {chapter}\n"
                f"📝 {status['translations_saved']} versets traduits\n"
                f"🔢 Tokens utilisés: {tokens.get('total_tokens', 'N/A'):,}"
            ))
            break

        elif status["status"] == "failed":
            await message.edit(content=(
                f"❌ **Traduction échouée**\n"
                f"📖 {text_name} - Chapitre {chapter}\n"
                f"Erreur: {status.get('error', 'Inconnue')}"
            ))
            break

        else:
            progress = status.get("progress_percent", 0)
            saved = status.get("translations_saved", 0)
            current = status.get("current_verse", 0)
            await message.edit(content=(
                f"⏳ **Traduction en cours...**\n"
                f"📖 {text_name} - Chapitre {chapter}\n"
                f"📊 Progression: {progress:.1f}%\n"
                f"📝 Verset {current}/{verses_to_translate}\n"
                f"💾 {saved} versets sauvegardés\n"
                f"🔖 Job ID: `{job_id}`"
            ))
```

---

## 4. Noms des livres disponibles

### Second Temple

| Nom exact | Chapitres |
|-----------|-----------|
| `The Book of Maccabees I` | 16 |
| `The Book of Maccabees II` | 15 |
| `Book of Jubilees` | 50 |
| `Book of Enoch` | 108 |
| `Wisdom of Solomon` | 19 |
| `Sirach` | 51 |

### Breslov

| Nom exact | Format |
|-----------|--------|
| `Likutey Moharan` | chapitre:verset |
| `Chayei Moharan` | chapitre seul |
| `Sippurei Maasiyot` | chapitre seul |

> **Note:** Pour la liste complète, appeler `GET /api/books/project/{project}/texts`

---

## 5. Gestion des erreurs

### Erreurs courantes

| Code | Message | Cause | Solution |
|------|---------|-------|----------|
| 400 | `Le champ "text_name" est requis` | Paramètre manquant | Vérifier payload |
| 400 | `Le champ "chapter" est requis` | Chapitre non spécifié | Ajouter chapter |
| 404 | `Chapitre non trouvé` | Livre/chapitre inexistant | Vérifier nom exact |
| 404 | `Job non trouvé` | job_id invalide | Vérifier job_id |

### Gestion des timeouts

```python
# Timeout recommandé pour le polling
POLL_INTERVAL = 10  # secondes
MAX_POLL_TIME = 600  # 10 minutes max

async def wait_with_timeout(job_id: str):
    start = time.time()
    while time.time() - start < MAX_POLL_TIME:
        status = await get_job_status(job_id)
        if status["status"] in ("completed", "failed"):
            return status
        await asyncio.sleep(POLL_INTERVAL)

    return {"status": "timeout", "message": "Délai dépassé"}
```

---

## 6. Bonnes pratiques

### Qualité de traduction

1. **Toujours spécifier le chapitre** - La traduction chapitre par chapitre garantit le contexte
2. **Un chapitre à la fois** - Ne pas lancer plusieurs traductions simultanées du même livre
3. **Vérifier avant de traduire** - Utiliser `alreadyComplete` pour éviter les doublons

### Performance

1. **Polling raisonnable** - Intervalle de 10 secondes minimum
2. **Timeout** - Limiter à 10 minutes max par chapitre
3. **Mise à jour UI** - Éditer le message plutôt que d'en envoyer plusieurs

### Expérience utilisateur

1. **Feedback immédiat** - Confirmer le lancement du job
2. **Progression visible** - Afficher le pourcentage et les versets
3. **Résumé final** - Tokens utilisés, temps total

---

## 7. Variables d'environnement

```bash
# Bot Discord
N8N_WEBHOOK_URL=http://pi6.local:5678
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx

# Optionnel
BOOKS_POLL_INTERVAL=10
BOOKS_MAX_POLL_TIME=600
```

---

## 8. Checklist d'implémentation

- [ ] Commande `/books-translate <text> <chapter>`
- [ ] Commande `/books-status <job_id>`
- [ ] Polling avec mise à jour du message
- [ ] Gestion `alreadyComplete`
- [ ] Gestion des erreurs
- [ ] Timeout sur le polling
- [ ] Affichage tokens utilisés

---

## 9. Support

**Fichiers de référence :**
- Workflows : `workflows/Books/books-*.json`
- API Books : `docs/issues/BOOKS_API.md`

**En cas de problème :**
1. Vérifier que les workflows sont actifs dans n8n
2. Tester manuellement avec curl
3. Vérifier les logs n8n

```bash
# Test manuel
curl -X POST http://pi6.local:5678/webhook/books-translate \
  -H "Content-Type: application/json" \
  -d '{
    "text_name": "The Book of Maccabees II",
    "chapter": 1,
    "api_key": "sk-ant-xxx"
  }'
```
