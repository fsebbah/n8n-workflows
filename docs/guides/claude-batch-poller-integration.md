# Guide d'intégration : Claude Batch Poller

**Date:** 2026-05-20
**Version:** 1.0.0
**Audience:** Équipes plugin (Torah, Discord, etc.)

---

## Vue d'ensemble

Le **Claude Batch Poller** est un workflow n8n qui gère les requêtes asynchrones vers l'API Anthropic Batch. Il permet d'envoyer des requêtes longues (génération de documents, exports PDF, etc.) sans bloquer l'utilisateur.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Plugin         │     │  n8n Workflows  │     │  Anthropic API  │
│  (Torah, etc.)  │     │                 │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. Soumet batch       │                       │
         │ ──────────────────────>                       │
         │                       │ 2. Crée batch         │
         │                       │ ──────────────────────>
         │                       │                       │
         │                       │ 3. batch_id           │
         │                       │ <──────────────────────
         │                       │                       │
         │                       │ 4. Poll status        │
         │                       │ ──────────────────────>
         │                       │ (toutes les 30s)      │
         │                       │                       │
         │                       │ 5. Résultats          │
         │                       │ <──────────────────────
         │                       │                       │
         │ 6. XADD Redis Stream  │                       │
         │ <──────────────────────                       │
         │                       │                       │
         ▼                       │                       │
┌─────────────────┐              │                       │
│  Redis Stream   │              │                       │
│  (résultats)    │              │                       │
└─────────────────┘              │                       │
```

---

## Configuration Redis

### Paramètres de connexion

| Paramètre | Valeur |
|-----------|--------|
| **Host** | `host3.local` |
| **Port** | `6380` |
| **Database** | `5` (DB notification) |
| **Stream par défaut** | `llm:results:stream` |

> **Important:** Utilisez la DB `5` pour recevoir les résultats du Batch Poller.

### Stream personnalisé

Vous pouvez spécifier un stream personnalisé via les metadata lors de la soumission :

```json
{
  "metadata": {
    "redis_channel": "torah:export:results"
  }
}
```

Le Batch Poller publiera alors sur `torah:export:results` au lieu de `llm:results:stream`.

---

## Comment identifier ses messages

Quand plusieurs plugins partagent le même système, comment chaque plugin sait-il que le message lui est destiné ?

### Stratégie recommandée : Stream dédié par plugin

Chaque plugin utilise son propre stream via `redis_channel` dans les metadata :

```
┌─────────────────┐     ┌─────────────────────────────┐
│  Plugin Torah   │ ──► │ torah:export:results        │  ← Seul Torah écoute ici
└─────────────────┘     └─────────────────────────────┘

┌─────────────────┐     ┌─────────────────────────────┐
│  Plugin Discord │ ──► │ discord:batch:results       │  ← Seul Discord écoute ici
└─────────────────┘     └─────────────────────────────┘

┌─────────────────┐     ┌─────────────────────────────┐
│  Autre plugin   │ ──► │ llm:results:stream          │  ← Stream par défaut
└─────────────────┘     └─────────────────────────────┘
```

**Avantages :**
- Isolation totale entre plugins
- Pas de risque de traiter le message d'un autre plugin
- Chaque listener ne reçoit que ses propres messages

**Implémentation :**

```json
{
  "metadata": {
    "redis_channel": "mon-plugin:results",
    "correlation_id": "unique-uuid-per-request"
  }
}
```

### Stratégies alternatives

#### Option 2 : Filtrage par `correlation_id`

Si plusieurs plugins partagent le même stream, le plugin génère un UUID unique à la soumission et le stocke :

```python
# À la soumission
import uuid
correlation_id = f"torah-export-{uuid.uuid4().hex[:12]}"
store_pending_request(correlation_id, user_id, channel_id)

# À la réception
def on_message(msg):
    correlation_id = msg['correlation_id']
    pending = get_pending_request(correlation_id)  # Lookup en DB/Redis
    if pending:
        # C'est notre message !
        process_result(msg, pending)
```

#### Option 3 : Filtrage par metadata

Inclure un identifiant de plugin dans les metadata :

```json
{
  "metadata": {
    "plugin": "torah",
    "request_type": "export_pdf"
  }
}
```

```python
def on_message(msg):
    metadata = json.loads(msg['metadata'])
    if metadata.get('plugin') != 'torah':
        return  # Pas pour nous, ignorer
    process_result(msg)
```

### Recommandation finale

| Cas d'usage | Stratégie recommandée |
|-------------|----------------------|
| Plugin unique ou isolé | **Stream dédié** (`redis_channel`) |
| Plusieurs plugins, même équipe | Stream dédié OU filtrage par `correlation_id` |
| Plugin générique/partagé | Filtrage par `correlation_id` avec stockage |

> **Important :** Le `correlation_id` est **toujours** retourné dans le message de résultat. Utilisez-le pour retrouver le contexte de la requête originale (user_id, channel_id, etc.).

---

## Soumettre un batch

### Endpoint

```
POST /api/llm/batch
```

### Payload requis

```json
{
  "messages": [
    {"role": "user", "content": "Votre prompt..."}
  ],
  "model": "claude-sonnet-4-20250514",
  "metadata": {
    "redis_channel": "votre:stream:results",
    "discord_user_id": "123456789",
    "channel_id": "987654321",
    "guild_id": "111222333",
    "request_type": "export_pdf",
    "custom_data": "any-value-you-need"
  }
}
```

### Champs metadata importants

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| `redis_channel` | Non | Stream Redis où publier les résultats (défaut: `llm:results:stream`) |
| `discord_user_id` | Recommandé | ID Discord pour envoyer le DM |
| `channel_id` | Recommandé | Channel Discord d'origine |
| `guild_id` | Recommandé | Serveur Discord |
| `request_type` | Non | Type de requête pour votre logique métier |

> **Note:** Toutes les metadata sont retournées dans le message de résultat.

---

## Recevoir les résultats

### Format du message Redis

Le Batch Poller publie via `XADD` un message avec ces champs :

```json
{
  "event": "batch_completed",
  "success": "true",
  "correlation_id": "uuid-unique-de-la-requete",
  "batch_id": "msgbatch_01L1bQQS2Ld7EVtEqUAzFo6V",
  "content": "[{\"type\":\"text\",\"text\":\"La réponse de Claude...\"}]",
  "files": "[{\"file_id\":\"...\",\"filename\":\"doc.pdf\",\"download_url\":\"...\"}]",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "usage": "{\"input_tokens\":150,\"output_tokens\":1200}",
  "stop_reason": "end_turn",
  "metadata": "{\"discord_user_id\":\"123456789\",\"channel_id\":\"987654321\",...}",
  "error": "null",
  "completed_at": "2026-05-20T18:30:00.000Z"
}
```

> **Note:** Les champs `content`, `files`, `usage`, `metadata`, et `error` sont des **strings JSON** à parser.

### Exemple de listener Python

```python
import redis
import json

# Connexion Redis - DB 5 !
r = redis.Redis(
    host='host3.local',
    port=6380,
    db=5,  # Important: DB notification
    decode_responses=True
)

# Nom de votre stream (celui passé dans redis_channel)
STREAM_NAME = 'torah:export:results'
GROUP_NAME = 'torah-plugin'
CONSUMER_NAME = 'worker-1'

# Créer le consumer group (une seule fois)
try:
    r.xgroup_create(STREAM_NAME, GROUP_NAME, id='0', mkstream=True)
    print(f"Consumer group '{GROUP_NAME}' créé")
except redis.ResponseError as e:
    if "BUSYGROUP" in str(e):
        print(f"Consumer group '{GROUP_NAME}' existe déjà")
    else:
        raise

# Boucle d'écoute
while True:
    try:
        messages = r.xreadgroup(
            groupname=GROUP_NAME,
            consumername=CONSUMER_NAME,
            streams={STREAM_NAME: '>'},
            count=10,
            block=5000  # 5 secondes
        )

        for stream, entries in messages:
            for msg_id, fields in entries:
                print(f"Message reçu: {msg_id}")

                # Vérifier le type d'événement
                event = fields.get('event')
                if event != 'batch_completed':
                    r.xack(STREAM_NAME, GROUP_NAME, msg_id)
                    continue

                # Parser les champs JSON
                success = fields.get('success') == 'true'
                correlation_id = fields.get('correlation_id')
                content = json.loads(fields.get('content', '[]'))
                files = json.loads(fields.get('files', '[]'))
                metadata = json.loads(fields.get('metadata', '{}'))
                error = json.loads(fields.get('error', 'null'))

                # Extraire les infos Discord
                discord_user_id = metadata.get('discord_user_id')
                channel_id = metadata.get('channel_id')

                if success:
                    # Extraire le texte de la réponse
                    text = ''
                    for block in content:
                        if block.get('type') == 'text':
                            text += block.get('text', '')

                    # Envoyer le DM Discord
                    # send_discord_dm(discord_user_id, text, files)
                    print(f"Succès pour {discord_user_id}: {text[:100]}...")
                else:
                    # Gérer l'erreur
                    error_msg = error.get('message', 'Erreur inconnue') if error else 'Erreur inconnue'
                    # send_discord_dm(discord_user_id, f"Erreur: {error_msg}")
                    print(f"Erreur pour {discord_user_id}: {error_msg}")

                # ACK le message (marquer comme traité)
                r.xack(STREAM_NAME, GROUP_NAME, msg_id)

    except redis.ConnectionError as e:
        print(f"Connexion Redis perdue: {e}")
        time.sleep(5)
    except Exception as e:
        print(f"Erreur: {e}")
        time.sleep(1)
```

### Exemple de listener Node.js

```javascript
const Redis = require('ioredis');

const redis = new Redis({
  host: 'host3.local',
  port: 6380,
  db: 5  // Important: DB notification
});

const STREAM_NAME = 'torah:export:results';
const GROUP_NAME = 'torah-plugin';
const CONSUMER_NAME = 'worker-1';

async function setupConsumerGroup() {
  try {
    await redis.xgroup('CREATE', STREAM_NAME, GROUP_NAME, '0', 'MKSTREAM');
    console.log(`Consumer group '${GROUP_NAME}' créé`);
  } catch (err) {
    if (err.message.includes('BUSYGROUP')) {
      console.log(`Consumer group '${GROUP_NAME}' existe déjà`);
    } else {
      throw err;
    }
  }
}

async function listen() {
  await setupConsumerGroup();

  while (true) {
    try {
      const results = await redis.xreadgroup(
        'GROUP', GROUP_NAME, CONSUMER_NAME,
        'COUNT', 10,
        'BLOCK', 5000,
        'STREAMS', STREAM_NAME, '>'
      );

      if (!results) continue;

      for (const [stream, messages] of results) {
        for (const [msgId, fields] of messages) {
          // Convertir le tableau plat en objet
          const data = {};
          for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1];
          }

          if (data.event !== 'batch_completed') {
            await redis.xack(STREAM_NAME, GROUP_NAME, msgId);
            continue;
          }

          const success = data.success === 'true';
          const content = JSON.parse(data.content || '[]');
          const files = JSON.parse(data.files || '[]');
          const metadata = JSON.parse(data.metadata || '{}');
          const error = JSON.parse(data.error || 'null');

          const discordUserId = metadata.discord_user_id;

          if (success) {
            const text = content
              .filter(b => b.type === 'text')
              .map(b => b.text)
              .join('');

            // await sendDiscordDM(discordUserId, text, files);
            console.log(`Succès pour ${discordUserId}: ${text.slice(0, 100)}...`);
          } else {
            const errorMsg = error?.message || 'Erreur inconnue';
            // await sendDiscordDM(discordUserId, `Erreur: ${errorMsg}`);
            console.log(`Erreur pour ${discordUserId}: ${errorMsg}`);
          }

          await redis.xack(STREAM_NAME, GROUP_NAME, msgId);
        }
      }
    } catch (err) {
      console.error('Erreur:', err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

listen();
```

---

## Gestion des fichiers

Si le batch génère des fichiers (PDF, images, etc.), ils sont listés dans le champ `files` :

```json
[
  {
    "file_id": "file-abc123",
    "filename": "export.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 125000,
    "download_url": "https://api.anthropic.com/v1/files/file-abc123/content"
  }
]
```

### Télécharger un fichier

```python
import requests

def download_file(file_info, api_key):
    response = requests.get(
        file_info['download_url'],
        headers={
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01'
        }
    )

    if response.ok:
        with open(file_info['filename'], 'wb') as f:
            f.write(response.content)
        return True
    return False
```

---

## Rétention des messages

| Paramètre | Valeur |
|-----------|--------|
| **MAXLEN** | ~5000 messages |
| **TTL** | Aucun (pas d'expiration temporelle) |

Les messages restent dans le stream jusqu'à ce que 5000 nouveaux messages arrivent. Avec un consumer group, les messages ACK sont marqués comme traités mais restent dans le stream.

---

## Gestion des erreurs

### Types d'erreur possibles

| Code | Description |
|------|-------------|
| `RESULT_NOT_FOUND` | Le correlation_id n'a pas été trouvé dans les résultats |
| `BATCH_ERROR` | Erreur pendant le traitement du batch |
| `BATCH_EXPIRED` | Le batch a expiré avant d'être traité |
| `BATCH_CANCELED` | Le batch a été annulé |
| `NO_RESULTS` | Pas de résultats retournés |

### Exemple de structure d'erreur

```json
{
  "success": "false",
  "error": "{\"code\":\"BATCH_ERROR\",\"message\":\"Rate limit exceeded\"}"
}
```

---

## Debugging

### Vérifier le stream Redis

```bash
# Lister les derniers messages
redis-cli -h host3.local -p 6380 -n 5 XRANGE torah:export:results - + COUNT 10

# Voir les infos du stream
redis-cli -h host3.local -p 6380 -n 5 XINFO STREAM torah:export:results

# Voir les consumer groups
redis-cli -h host3.local -p 6380 -n 5 XINFO GROUPS torah:export:results

# Voir les consumers d'un groupe
redis-cli -h host3.local -p 6380 -n 5 XINFO CONSUMERS torah:export:results torah-plugin
```

### Vérifier les logs n8n

Le workflow `Claude - Batch Poller` s'exécute toutes les 30 secondes. Vérifiez les exécutions dans l'interface n8n :

```
http://pi6.local:5678/workflow/SAFKGY8tUkEzXWZ0/executions
```

---

## Checklist d'intégration

- [ ] Connexion Redis sur `host3.local:6380` DB `5`
- [ ] Stream configuré (par défaut ou personnalisé via `redis_channel`)
- [ ] Consumer group créé
- [ ] Listener qui parse les champs JSON (content, files, metadata, error)
- [ ] Gestion des cas d'erreur (`success: "false"`)
- [ ] ACK des messages après traitement
- [ ] Téléchargement des fichiers si nécessaire

---

---

## Implémentation Plugin Torah

Cette section documente l'implémentation spécifique du plugin Torah Discord.

### Configuration

Ajouter dans `.env.local` :

```bash
# Redis pour Claude Batch Poller (exports async)
REDIS_NOTIFICATION_CLAUDE_BATCH_POLLER=redis://host3.local:6380/5
```

Le plugin lit cette variable via `config.redis_notification_claude_batch_poller`.

### Architecture du plugin

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Plugin Torah                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ExportView                          ExportResultListener            │
│  (src/discord_ui/views/show_views.py)    (src/services/export_listener.py)  │
│                                                                      │
│  ┌─────────────────────┐            ┌─────────────────────┐         │
│  │ Bouton "Export"     │            │ Écoute Redis Stream │         │
│  │                     │            │ (XREADGROUP)        │         │
│  │ 1. Vérifie crédits  │            │                     │         │
│  │ 2. Envoie webhook   │            │ Quand message reçu: │         │
│  │    n8n avec metadata│            │ 1. Parse JSON       │         │
│  │ 3. Affiche "⏳"     │            │ 2. Télécharge fichier│         │
│  └─────────┬───────────┘            │ 3. Envoie DM        │         │
│            │                        │ 4. Edit message     │         │
│            │                        └──────────┬──────────┘         │
│            │                                   │                     │
└────────────┼───────────────────────────────────┼─────────────────────┘
             │                                   │
             ▼                                   ▼
     ┌───────────────┐                  ┌───────────────┐
     │  Webhook n8n  │                  │ Redis Stream  │
     │  torah-export │                  │ torah:export: │
     └───────────────┘                  │ results       │
                                        └───────────────┘
```

### Service ExportResultListener

Le listener est démarré automatiquement dans `main.py` si `REDIS_NOTIFICATION_CLAUDE_BATCH_POLLER` est configuré :

```python
# main.py (extrait)
export_redis_url = config.redis_notification_claude_batch_poller
if export_redis_url:
    from src.services.export_listener import ExportResultListener, set_export_listener
    bot.export_listener = ExportResultListener(
        bot=bot,
        redis_url=export_redis_url,
    )
    await bot.export_listener.start()
```

Le listener utilise **XREADGROUP** avec un consumer group pour garantir le traitement :

- **Consumer group** : `torah-plugin`
- **Consumer name** : `export-listener`
- **Comportement au démarrage** : Lit d'abord les messages **pending** (non-ACK) puis les nouveaux
- **ACK** : Les messages sont ACK après traitement réussi

```python
# Fonctionnement interne (simplifié)
# 1. Créer le consumer group au démarrage
await redis.xgroup_create(stream, "torah-plugin", id="0", mkstream=True)

# 2. Lire les messages pending puis les nouveaux
results = await redis.xreadgroup(
    groupname="torah-plugin",
    consumername="export-listener",
    streams={stream: "0"},  # "0" = pending, ">" = nouveaux
    block=5000,
    count=10,
)

# 3. ACK après traitement réussi
await redis.xack(stream, "torah-plugin", msg_id)
```

> **Avantage** : Si le bot redémarre, les messages non-ACK seront retraités automatiquement.

### Format des metadata envoyées

Lors de la soumission d'un export, le plugin envoie ces metadata :

```python
# src/discord_ui/views/show_views.py - ExportView
payload = {
    "project_id": guild_id,
    "source_type": "talmud_page",
    "source_data": {
        "traite": self.traite,
        "page": self.page,
        "include_commentaries": self.include_commentaries,
        "segments": talmud_data.get("segments", []),
    },
    "output": {
        "format": format_value,  # "docx" ou "pdf"
        "skills": [{"type": "anthropic", "skill_id": format_value}]
    },
    "redis_channel": "torah:export:results",
    "correlation_id": correlation_id,
    "metadata": {
        "discord_channel_id": str(interaction.channel_id),
        "discord_message_id": str(pending_msg.id),
        "user_id": user_id,
        "guild_id": guild_id,
        "traite": self.traite,
        "page": self.page,
        "format": format_value,
        "include_commentaries": self.include_commentaries,
    }
}
```

### Gestion des fichiers

Le listener supporte **3 formats** de fichiers (dans l'ordre de priorité) :

| Format | Champ | Description |
|--------|-------|-------------|
| Base64 inline | `files[].data` | Contenu encodé en base64 (préféré) |
| Base64 legacy | `files[].content_base64` | Ancien format base64 |
| URL | `files[].download_url` | URL à télécharger (utilisé par Anthropic) |

```python
# src/services/export_listener.py - _get_discord_file()
async def _get_discord_file(self, file_info: dict) -> discord.File | None:
    # 1. Format n8n v2.0: "data" contient le base64
    if "data" in file_info:
        content = base64.b64decode(file_info["data"])
        return discord.File(io.BytesIO(content), filename=filename)

    # 2. Fallback: ancien format avec content_base64
    if "content_base64" in file_info:
        content = base64.b64decode(file_info["content_base64"])
        return discord.File(io.BytesIO(content), filename=filename)

    # 3. Fallback: URL de téléchargement
    if "download_url" in file_info:
        return await self._download_file(file_info["download_url"], filename)
```

> **Note**: Les URLs Anthropic nécessitent une authentification. Le téléchargement peut échouer si le header `x-api-key` n'est pas fourni. TODO: Ajouter support pour authentification.

### Flux complet d'un export

```
1. Utilisateur clique "📥 Export" sur une page Talmud
   │
2. ExportView vérifie les crédits (1 crédit requis)
   │
3. ExportView envoie webhook "torah-export" à n8n
   │  payload: { source_data, output, redis_channel, metadata }
   │
4. ExportView affiche message "⏳ Document en cours..."
   │  (stocke message_id dans metadata pour edit futur)
   │
5. n8n crée batch Anthropic + stocke dans Redis pending
   │
6. Claude - Batch Poller poll le batch jusqu'à "ended"
   │
7. Batch Poller publie sur torah:export:results via XADD
   │  { event: "batch_completed", files: [...], metadata: {...} }
   │
8. ExportResultListener reçoit le message (XREADGROUP)
   │
9. Listener parse le message et télécharge le fichier
   │
10. Listener envoie DM à l'utilisateur avec le fichier
    │
11. Listener edit le message original "✅ Document généré !"
```

### Logs de debugging

```bash
# Vérifier que le listener tourne
docker logs torah-bot 2>&1 | grep -i "ExportListener"

# Sortie attendue:
# [ExportListener] Connecte a Redis: redis://host3.local:6380/5
# [ExportListener] Ecoute du stream: torah:export:results
# [ExportListener] Demarrage de la boucle d'ecoute XREADGROUP

# Surveiller en temps réel
docker logs -f torah-bot 2>&1 | grep -i "Export"

# Quand un résultat arrive:
# [ExportListener] Batch complete recu: torah-export-abc123
# [ExportListener] Fichier telecharge: 125000 bytes
# [ExportListener] torah-export-abc123: DM envoye a User#1234
# [ExportListener] torah-export-abc123: Message original edite
```

### Erreurs courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `Export Result Listener demarre` absent des logs | `REDIS_NOTIFICATION_CLAUDE_BATCH_POLLER` non configuré | Ajouter dans `.env.local` |
| `Erreur connexion Redis` | Redis inaccessible | Vérifier `host3.local:6380` |
| `User XXX non trouve` | User a quitté ou bot n'a pas accès | Normal, DM impossible |
| `DM bloques pour User` | User a bloqué les DMs | Fichier joint au message original |
| `Erreur telechargement` | URL Anthropic expirée ou auth manquante | Vérifier TTL batch (24h) |

### Checklist spécifique Torah

- [x] Variable `REDIS_NOTIFICATION_CLAUDE_BATCH_POLLER` dans `.env.local`
- [x] `ExportResultListener` démarré (vérifier logs)
- [x] Stream `torah:export:results` utilisé (via `redis_channel` dans metadata)
- [x] Metadata incluent `user_id`, `discord_channel_id`, `discord_message_id`
- [x] Gestion des 3 formats de fichiers (data, content_base64, download_url)
- [ ] TODO: Support authentification pour download_url Anthropic

---

## Création du bouton Export (Guide développeur)

Cette section documente comment créer un bouton d'export avec livraison async via Redis.

### Architecture des composants

```
src/
├── discord_ui/views/
│   └── show_views.py          # ExportView + ExportFormatSelect
└── services/
    ├── export_service.py      # ExportService (formatage contenu + prompt)
    └── export_listener.py     # ExportResultListener (XREADGROUP)
```

### 1. Créer le Select de format (`ExportFormatSelect`)

```python
# src/discord_ui/views/show_views.py

class ExportFormatSelect(discord.ui.Select):
    """Select dropdown pour choisir le format d'export."""

    def __init__(self):
        options = [
            discord.SelectOption(
                label="DOCX",
                value="docx",
                description="Document Word (modifiable)",
                emoji="📝",
                default=True  # DOCX par défaut
            ),
            discord.SelectOption(
                label="PDF",
                value="pdf",
                description="Document PDF (lecture seule)",
                emoji="📄"
            ),
        ]
        super().__init__(
            placeholder="Format...",
            min_values=1,
            max_values=1,
            options=options,
            row=0  # Première ligne
        )

    async def callback(self, interaction: discord.Interaction):
        """Acknowledge sans action (format lu au clic Generate)."""
        await interaction.response.defer()
```

### 2. Créer la View d'export (`ExportView`)

```python
# src/discord_ui/views/show_views.py

CREDIT_COST_EXPORT = 1  # Coût en crédits

class ExportView(discord.ui.View):
    """View pour configurer et lancer l'export."""

    def __init__(
        self,
        talmud_data: dict,
        traite: str,
        page: str,
        api_key: str = None,
        n8n_client: Any = None,
    ):
        super().__init__(timeout=120)
        self.talmud_data = talmud_data
        self.traite = traite
        self.page = page
        self.api_key = api_key
        self.n8n_client = n8n_client
        self.include_commentaries = False

        # Ajouter le Select format (row 0)
        self.format_select = ExportFormatSelect()
        self.add_item(self.format_select)

    @discord.ui.button(label="☐ Inclure commentaires", style=discord.ButtonStyle.secondary, row=1)
    async def toggle_commentaries(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Toggle l'inclusion des commentaires."""
        self.include_commentaries = not self.include_commentaries
        if self.include_commentaries:
            button.label = "☑ Inclure commentaires"
            button.style = discord.ButtonStyle.primary
        else:
            button.label = "☐ Inclure commentaires"
            button.style = discord.ButtonStyle.secondary
        await interaction.response.edit_message(view=self)

    @discord.ui.button(label="📥 Generer (1 credit)", style=discord.ButtonStyle.success, row=2)
    async def generate(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Lance l'export en mode async via Redis."""
        # Voir section suivante
        pass
```

### 3. Implémenter le bouton Generate

```python
@discord.ui.button(label="📥 Generer (1 credit)", style=discord.ButtonStyle.success, row=2)
async def generate(self, interaction: discord.Interaction, button: discord.ui.Button):
    """Lance l'export en mode async via Redis."""
    import uuid
    import httpx
    from src.services.export_service import ExportService

    # 1. Récupérer le format sélectionné
    format_value = self.format_select.values[0] if self.format_select.values else "docx"

    await interaction.response.defer(thinking=True)

    user_id = str(interaction.user.id)
    guild_id = str(interaction.guild_id) if interaction.guild_id else None

    # 2. Vérifier les crédits
    if self.n8n_client:
        credits_result = await self.n8n_client.get_credits(user_id, project_id=guild_id)
        credits_remaining = credits_result.get("credits_remaining", 0)
        if credits_remaining < CREDIT_COST_EXPORT:
            embed = discord.Embed(
                title="Credits insuffisants",
                description=f"Il vous faut **{CREDIT_COST_EXPORT}** credit(s).",
                color=discord.Color.red(),
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return

    # 3. Générer correlation_id unique
    correlation_id = f"torah-export-{uuid.uuid4().hex[:12]}"

    # 4. Envoyer message "en cours" (sera édité par le listener)
    embed = discord.Embed(
        title="⏳ Generation en cours...",
        description=f"**{self.traite} {self.page}** - Format: {format_value.upper()}",
        color=discord.Color.blue(),
    )
    embed.set_footer(text="Vous recevrez un DM quand le document sera pret (5-10 min)")
    pending_msg = await interaction.followup.send(embed=embed)

    # 5. Préparer le contenu pour Claude
    export_service = ExportService(api_key=self.api_key, n8n_base_url=n8n_base_url)
    content = export_service._format_page_content(
        self.talmud_data, self.traite, self.page, self.include_commentaries
    )
    prompt = export_service._build_prompt(content, format_value, self.include_commentaries)

    # 6. Construire le payload (format CLAUDE-SKILLS-API-GUIDE v2.0)
    payload = {
        "api_key": self.api_key,
        "model": "claude-sonnet-4-20250514",
        "messages": [{"role": "user", "content": prompt}],
        "container": {
            "skills": [{"type": "anthropic", "skill_id": format_value}]
        },
        "redis_channel": "torah:export:results",  # Stream pour le listener
        "correlation_id": correlation_id,
        "metadata": {
            "discord_channel_id": str(interaction.channel_id),
            "discord_message_id": str(pending_msg.id),  # Pour éditer plus tard
            "user_id": user_id,
            "guild_id": guild_id,
            "traite": self.traite,
            "page": self.page,
            "format": format_value,
            "include_commentaries": self.include_commentaries,
        }
    }

    # 7. Envoyer au webhook n8n
    webhook_url = f"{n8n_base_url}/webhook/claude-call-with-skills"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(webhook_url, json=payload)
        if response.status_code not in (200, 202):
            # Gérer erreur...
            return

    # 8. Débiter les crédits
    await self.n8n_client.debit_credits(user_id, CREDIT_COST_EXPORT, "export_page", project_id=guild_id)

    # Le listener Redis s'occupera du reste (DM + edit message)
```

### 4. Créer le service d'export (`ExportService`)

```python
# src/services/export_service.py

class ExportService:
    """Formate le contenu et construit le prompt pour Claude."""

    def __init__(self, api_key: str = None, n8n_base_url: str = None):
        self.api_key = api_key
        self.n8n_base_url = n8n_base_url.rstrip("/") if n8n_base_url else None

    def _format_page_content(
        self,
        talmud_data: dict,
        traite: str,
        page: str,
        include_commentaries: bool = True,
    ) -> str:
        """Formate les données en texte structuré pour Claude."""
        lines = [f"# {traite} {page}", "", "## Texte de la page", ""]

        for segment in talmud_data.get('segments', []):
            lines.append(f"### § {segment.get('index', 0)}")
            lines.append(f"**Hébreu:** {segment.get('text', '')}")
            lines.append(f"**Traduction:** {segment.get('translation', '')}")
            lines.append("")

        if include_commentaries:
            lines.extend(["---", "", "## Commentaires", ""])
            # ... formater les commentaires

        return "\n".join(lines)

    def _build_prompt(
        self,
        content: str,
        format: str,  # "pdf" ou "docx"
        include_commentaries: bool,
    ) -> str:
        """Construit le prompt pour Claude avec instructions de mise en page."""
        format_name = "PDF" if format == "pdf" else "Word (DOCX)"

        return f"""Crée un document {format_name} professionnel à partir du contenu suivant.

INSTRUCTIONS DE MISE EN PAGE:
1. Titre principal centré avec le nom du traité et la page
2. Le texte hébreu doit être aligné à droite (RTL)
3. Les traductions en français alignées à gauche
4. Chaque paragraphe (§) clairement séparé
5. Police lisible, taille 11-12pt
{"6. Section Commentaires séparée" if include_commentaries else ""}

CONTENU À FORMATER:

{content}

Génère le document avec une mise en page soignée."""
```

### 5. Créer le listener Redis (`ExportResultListener`)

Voir la section [Service ExportResultListener](#service-exportresultlistener) ci-dessus.

Points clés :
- Utilise **XREADGROUP** avec consumer group
- Traite les messages **pending** au démarrage
- **ACK** après traitement réussi
- Envoie **DM** à l'utilisateur
- **Édite** le message original

### 6. Intégrer dans main.py

```python
# main.py

@bot.event
async def on_ready():
    # ... autres initialisations ...

    # Démarrer le listener d'export
    export_redis_url = config.redis_notification_claude_batch_poller
    if export_redis_url:
        from src.services.export_listener import ExportResultListener, set_export_listener

        bot.export_listener = ExportResultListener(
            bot=bot,
            redis_url=export_redis_url,
        )
        await bot.export_listener.start()
        set_export_listener(bot.export_listener)
        logger.info(f"Export Result Listener démarré")
```

### 7. Afficher le bouton Export

```python
# Dans votre commande /show ou équivalent

@app_commands.command(name="export", description="Exporter la page en document")
async def export_command(self, interaction: discord.Interaction):
    # Charger les données de la page
    talmud_data = await self.load_page_data(traite, page)

    # Créer et afficher la view
    view = ExportView(
        talmud_data=talmud_data,
        traite=traite,
        page=page,
        api_key=self.config.anthropic_api_key,
        n8n_client=self.n8n_client,
    )

    embed = discord.Embed(
        title=f"📥 Export {traite} {page}",
        description="Configurez votre export :",
        color=discord.Color.blue(),
    )

    await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
```

### Résumé du flux complet

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Utilisateur clique "📥 Export"                                            │
│    └─> ExportView affichée avec Select (DOCX/PDF) + Toggle commentaires     │
│                                                                              │
│ 2. Utilisateur sélectionne format et clique "📥 Generer (1 credit)"         │
│    └─> Vérifie crédits                                                       │
│    └─> Génère correlation_id                                                 │
│    └─> Envoie message "⏳ En cours..." (stocke message_id)                   │
│    └─> POST webhook n8n avec payload + metadata                              │
│    └─> Débite 1 crédit                                                       │
│                                                                              │
│ 3. Webhook n8n crée batch Anthropic                                          │
│    └─> Claude génère le document avec Skills                                 │
│    └─> Batch Poller poll jusqu'à "ended"                                     │
│                                                                              │
│ 4. Batch Poller publie sur Redis Stream (XADD)                               │
│    └─> Stream: torah:export:results                                          │
│    └─> Contient: fichier base64 + metadata                                   │
│                                                                              │
│ 5. ExportResultListener reçoit le message (XREADGROUP)                       │
│    └─> Parse JSON (files, metadata)                                          │
│    └─> Décode fichier base64                                                 │
│    └─> Envoie DM à l'utilisateur avec le fichier                             │
│    └─> Édite le message original "✅ Document généré !"                      │
│    └─> ACK le message                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Contact

Pour toute question sur l'intégration :
- **Équipe n8n** : Workflows et configuration Redis
- **Équipe plugin Torah** : Implémentation Discord et listener
- **Workflow ID** : `SAFKGY8tUkEzXWZ0`
- **Service** : `redis-xadd-service` sur host2:8765
