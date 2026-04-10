# RFC-060 : Synchronisation des informations serveur Discord

**Date** : 2026-04-09
**Auteur** : Backend
**Statut** : Draft
**Priorite** : Moyenne
**Equipes concernees** : Plugins Discord, chatbot-core, n8n, Backend, Frontend

---

## 1. Probleme

Les cards serveur Discord dans le dashboard affichent le guild_id brut
au lieu du nom du serveur. Les champs `guild_name`, `guild_icon` et
`member_count` sont NULL dans la table `tenant_discord_servers`.

```json
// Reponse actuelle
{
  "guild_id": "1286607696153546774",
  "guild_name": null,
  "icon_url": null,
  "member_count": null
}

// Reponse attendue
{
  "guild_id": "1286607696153546774",
  "guild_name": "BTS Optique Lyon",
  "icon_url": "https://cdn.discordapp.com/icons/1286607696153546774/abc123.png",
  "member_count": 125
}
```

## 2. Cause racine

L'API backend n'a pas de bot token Discord. Elle ne peut pas appeler
l'API Discord directement. Seuls les plugins et chatbot-core ont le token.

L'endpoint `POST /api/discord/webhook/server-sync` (RFC-053) existe
dans le backend mais personne ne l'appelle.

## 3. Solution

Les plugins Discord et chatbot-core appellent le webhook `server-sync`
pour transmettre les infos du serveur au backend. Les donnees se mettent
a jour naturellement a chaque interaction.

### 3.1 Flow

```
User tape une commande dans le serveur "BTS Optique Lyon"
    |
    v
Plugin / chatbot-core recoit l'event Discord
    | guild.id = "1286607696153546774"
    | guild.name = "BTS Optique Lyon"
    | guild.icon = "abc123def456"
    | guild.memberCount = 125
    |
    v
Plugin appelle n8n webhook "server-sync"
    |
    v
n8n transmet au backend :
    POST /api/discord/webhook/server-sync
    {
      "guild_id": "1286607696153546774",
      "bot_id": "BOT_ID",
      "guild_name": "BTS Optique Lyon",
      "guild_icon": "abc123def456",
      "guild_description": "Serveur de formation BTS",
      "member_count": 125,
      "channel_count": 12,
      "bot_count": 3,
      "sync_source": "plugin",
      "synced_by": "plugin-recipes"
    }
    |
    v
Backend met a jour tenant_discord_servers
    | guild_name = "BTS Optique Lyon"
    | guild_icon = "abc123def456"
    | member_count = 125
    | last_synced_at = NOW()
    |
    v
Frontend affiche "BTS Optique Lyon" avec le logo
```

### 3.2 Quand synchroniser

| Evenement | Declencheur | Frequence |
|-----------|-------------|-----------|
| **Premier demarrage bot** | Bot rejoint un serveur ou redemarre | 1 fois |
| **Premiere commande** | User tape une commande dans un serveur pas encore sync | 1 fois |
| **Changement de nom/icon** | Event Discord `GUILD_UPDATE` | Rare |
| **Cron de refresh** | n8n workflow quotidien | 1x/jour |

### 3.3 Optimisation : ne pas sync a chaque commande

Les plugins doivent cacher localement l'etat du sync pour eviter
un appel reseau a chaque commande :

```javascript
// Dans le plugin
const syncedGuilds = new Set();

async function ensureGuildSynced(guild) {
  if (syncedGuilds.has(guild.id)) return;
  
  // Appeler le webhook server-sync via n8n
  await callN8nWebhook('server-sync', {
    guild_id: guild.id,
    guild_name: guild.name,
    guild_icon: guild.icon,
    member_count: guild.memberCount,
  });
  
  syncedGuilds.add(guild.id);
  
  // Re-sync apres 24h
  setTimeout(() => syncedGuilds.delete(guild.id), 24 * 60 * 60 * 1000);
}

// Dans chaque commande
client.on('interactionCreate', async (interaction) => {
  await ensureGuildSynced(interaction.guild);
  // ... traiter la commande
});
```

---

## 4. Endpoint existant (backend)

L'endpoint existe deja et est deploye :

```
POST /api/discord/webhook/server-sync
Header: X-Service-Token: <BACKEND_SERVICE_TOKEN>

Body:
{
  "guild_id": "1286607696153546774",       // REQUIS
  "bot_id": "BOT_USER_ID",                  // REQUIS
  "guild_name": "BTS Optique Lyon",         // optionnel
  "guild_icon": "abc123def456",             // optionnel (hash Discord)
  "guild_description": "Description",       // optionnel
  "member_count": 125,                      // optionnel
  "channel_count": 12,                      // optionnel
  "bot_count": 3,                           // optionnel
  "sync_source": "plugin",                  // "plugin" ou "bot" ou "cron"
  "synced_by": "plugin-recipes"             // identifiant du service
}
```

**Response :**
```json
{
  "ok": true,
  "guild_id": "1286607696153546774",
  "synced": true
}
```

L'URL de l'icone se construit cote frontend :
```
https://cdn.discordapp.com/icons/{guild_id}/{guild_icon}.png
```

---

## 5. Ce que chaque equipe doit faire

### 5.1 Equipe Plugins (plugin-recipes, plugin-chess, etc.)

**Effort : 0.5 jour par plugin**

Ajouter un appel `server-sync` lors de la premiere interaction dans un serveur.

```javascript
// A ajouter dans chaque plugin
const syncedGuilds = new Set();

async function ensureGuildSynced(guild) {
  if (syncedGuilds.has(guild.id)) return;
  
  try {
    await axios.post(`${N8N_WEBHOOK_URL}/server-sync`, {
      guild_id: guild.id,
      bot_id: client.user.id,
      guild_name: guild.name,
      guild_icon: guild.icon,
      guild_description: guild.description,
      member_count: guild.memberCount,
      channel_count: guild.channels.cache.size,
      sync_source: 'plugin',
      synced_by: 'plugin-recipes', // adapter par plugin
    });
  } catch (e) {
    console.warn('Guild sync failed:', e.message);
  }
  
  syncedGuilds.add(guild.id);
  setTimeout(() => syncedGuilds.delete(guild.id), 24 * 60 * 60 * 1000);
}
```

Appeler `ensureGuildSynced(interaction.guild)` au debut de chaque commande.

### 5.2 Equipe chatbot-core

**Effort : 0.5 jour**

Meme principe. A l'evenement `ready` du bot, sync tous les serveurs :

```javascript
client.on('ready', async () => {
  for (const guild of client.guilds.cache.values()) {
    await ensureGuildSynced(guild);
  }
});
```

Et ecouter `GUILD_UPDATE` pour les changements de nom/icon :

```javascript
client.on('guildUpdate', async (oldGuild, newGuild) => {
  if (oldGuild.name !== newGuild.name || oldGuild.icon !== newGuild.icon) {
    syncedGuilds.delete(newGuild.id);
    await ensureGuildSynced(newGuild);
  }
});
```

### 5.3 Equipe n8n

**Effort : 0.5 jour**

1. **Webhook `server-sync`** : recevoir l'appel des plugins et transmettre
   au backend `POST /api/discord/webhook/server-sync` avec le service token.

2. **Cron quotidien (optionnel)** : pour les guilds qui n'ont pas ete sync
   depuis plus de 7 jours, demander aux bots de re-sync.

### 5.4 Equipe Backend

**Effort : 0.5 jour**

1. **Creer l'endpoint** `GET /api/discord/tenants/{tenant_id}/servers`
   qui retourne la liste des serveurs avec guild_name, icon_url, member_count
   depuis `tenant_discord_servers`.

2. **Construire icon_url** dans la reponse :
   ```python
   icon_url = f"https://cdn.discordapp.com/icons/{guild_id}/{guild_icon}.png" if guild_icon else None
   ```

### 5.5 Equipe Frontend

**Effort : 0 (deja fait)**

Le front gere deja les cas NULL avec des fallbacks (PR #1873).
Des que le backend retourne les donnees, tout s'affiche.

---

## 6. Donnees disponibles dans Discord.js

Pour reference, voici ce que le SDK Discord.js fournit sur un objet Guild :

```javascript
guild.id           // "1286607696153546774"
guild.name         // "BTS Optique Lyon"
guild.icon         // "abc123def456" (hash, ou null)
guild.description  // "Description du serveur" (ou null)
guild.memberCount  // 125
guild.channels.cache.size  // nombre de channels
guild.members.cache.size   // membres en cache (pas fiable)
guild.ownerId      // ID du proprietaire
guild.createdAt    // date de creation
guild.premiumTier  // niveau boost (0-3)
```

---

## 7. Estimation

| Equipe | Tache | Effort |
|--------|-------|--------|
| Plugins (chaque) | Ajouter ensureGuildSynced | 0.5j |
| chatbot-core | Sync au ready + guildUpdate | 0.5j |
| n8n | Webhook server-sync | 0.5j |
| Backend | Endpoint GET servers + icon_url | 0.5j |
| Frontend | Rien (deja gere) | 0 |
| **Total** | | **2 jours** (en parallele) |

---

## 8. Timeline

```
Toutes les equipes en parallele :

Plugins :     [ensureGuildSynced] ■■■■
chatbot-core: [ready + guildUpdate] ■■■■
n8n :         [webhook server-sync] ■■■■
Backend :     [GET servers endpoint] ■■■■

                                    → Test E2E
```

Des que le premier plugin ou bot sync un serveur, le dashboard
s'enrichit automatiquement. Pas de migration, pas de big bang.

---

## 9. Questions

- [ ] Les plugins passent-ils deja par n8n pour toutes les interactions,
      ou certains appellent le backend directement ?
- [ ] chatbot-core a-t-il acces au `BACKEND_SERVICE_TOKEN` ou faut-il
      passer par n8n systematiquement ?
- [ ] Faut-il un mecanisme de rate limiting sur server-sync pour eviter
      que 50 plugins ne sync le meme serveur en meme temps ?
