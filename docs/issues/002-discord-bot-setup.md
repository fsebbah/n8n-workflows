# Issue #002: Création d'un Bot Discord pour recherche interactive

**Date**: 2024-12-28
**Statut**: TODO
**Priorité**: Moyenne
**Projet**: Torah Translation Workflows
**Dépend de**: Issue #001 (Webhook Discord)

---

## Description

Créer un bot Discord qui permet aux utilisateurs de demander des commentaires talmudiques en langage naturel directement dans un channel Discord.

**Exemple d'utilisation:**
```
Utilisateur: "Souccah 28b Rashi"
Bot: 📚 Rashi sur Sukkah 28b
     ─────────────────────
     1. "פירוש ראשון..."
     2. "פירוש שני..."
```

---

## Différence Webhook vs Bot

| Webhook | Bot |
|---------|-----|
| Envoie des messages uniquement | Peut lire ET envoyer des messages |
| Pas besoin de serveur | Nécessite un token et des permissions |
| Déclenché par appel HTTP | Déclenché par événements Discord |
| Simple à configurer | Plus complexe mais plus puissant |

---

## Guide de création du Bot Discord

### Étape 1: Créer l'application Discord

1. Aller sur https://discord.com/developers/applications
2. Cliquer sur **"New Application"**
3. Nom: `Torah Commentary Bot`
4. Cliquer sur **"Create"**

### Étape 2: Configurer le Bot

1. Dans le menu gauche, cliquer sur **"Bot"**
2. Cliquer sur **"Add Bot"** → **"Yes, do it!"**
3. Configurer:
   - **Username**: `Torah Commentary Bot`
   - **Icon**: (optionnel) ajouter une icône
4. **IMPORTANT**: Dans "Privileged Gateway Intents", activer:
   - ✅ **MESSAGE CONTENT INTENT** (pour lire les messages)
   - ✅ **SERVER MEMBERS INTENT** (optionnel)

### Étape 3: Récupérer le Token

1. Dans la section **"Bot"**, cliquer sur **"Reset Token"**
2. **Copier et sauvegarder le token** (il ne sera plus visible après)
3. Format: `MTQ1NDg3MjcwMTMzMTE3NzYwNg.XXXXXX.XXXXXXXXXXXXXXXX`

⚠️ **ATTENTION**: Ne jamais partager ce token ! Il donne un accès total au bot.

### Étape 4: Configurer les permissions

1. Aller dans **"OAuth2"** → **"URL Generator"**
2. Cocher les scopes:
   - ✅ `bot`
   - ✅ `applications.commands` (pour les slash commands)
3. Cocher les permissions bot:
   - ✅ `Read Messages/View Channels`
   - ✅ `Send Messages`
   - ✅ `Embed Links`
   - ✅ `Read Message History`
   - ✅ `Use Slash Commands`
4. Copier l'URL générée

### Étape 5: Inviter le bot sur le serveur

1. Ouvrir l'URL générée dans un navigateur
2. Sélectionner le serveur Discord cible
3. Cliquer sur **"Authorize"**
4. Compléter le captcha

### Étape 6: Configurer dans n8n

#### Option A: Credential n8n (recommandé)
1. Dans n8n: **Settings** → **Credentials** → **Add Credential**
2. Type: **Discord Bot API**
3. Coller le **Bot Token**
4. Sauvegarder

#### Option B: Variable d'environnement
```bash
# Dans .env de n8n
DISCORD_BOT_TOKEN=MTQ1NDg3MjcwMTMzMTE3NzYwNg.XXXXXX.XXXXXXXXXXXXXXXX
```

---

## Architecture du workflow n8n

```
┌─────────────────────────────────────────────────────────────────┐
│ Discord Trigger                                                  │
│ - Event: Message Create                                          │
│ - Channel: #torah-bot (ou tous)                                  │
│ - Filtre: messages commençant par "!" ou mentionnant le bot     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LLM - Extraction d'intention                                     │
│ Prompt: "Extrais la référence talmudique et le commentateur     │
│          du message suivant: {message}"                          │
│ Output: { traite, page, commentator, action }                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ HTTP Request - API Backend                                       │
│ GET http://pi6.local:3031/api/talmud/text/{traite}/{page}       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Code - Filtrer et formater                                       │
│ - Filtrer par commentateur                                       │
│ - Formater pour Discord (embeds)                                 │
│ - Limiter à 2000 caractères                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Discord - Send Message                                           │
│ - Répondre dans le même channel                                  │
│ - Utiliser des embeds pour le formatage                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Exemples de requêtes supportées

| Message utilisateur | Interprétation |
|---------------------|----------------|
| `Sukkah 28b Rashi` | Traité: Sukkah, Page: 28b, Commentateur: Rashi |
| `!rashi souccah 10a` | Traité: Sukkah, Page: 10a, Commentateur: Rashi |
| `Berakhot 2a tous les commentaires` | Traité: Berakhot, Page: 2a, Tous commentateurs |
| `@Torah Bot Pesachim 5b Tosafot` | Traité: Pesachim, Page: 5b, Commentateur: Tosafot |

---

## Tâches

- [ ] Créer l'application Discord Developer
- [ ] Configurer le bot avec les permissions
- [ ] Récupérer et sauvegarder le token
- [ ] Inviter le bot sur le serveur
- [ ] Ajouter le token dans n8n credentials
- [ ] Créer le workflow n8n
- [ ] Tester avec des requêtes simples
- [ ] Ajouter la gestion d'erreurs

---

## Sécurité

- Ne jamais commiter le token dans le code
- Utiliser les credentials n8n ou variables d'environnement
- Limiter les permissions au minimum nécessaire
- Restreindre le bot à des channels spécifiques si possible

---

## Liens utiles

- [Discord Developer Portal](https://discord.com/developers/applications)
- [Discord.js Guide](https://discordjs.guide/)
- [n8n Discord Node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discord/)
- [Discord API Documentation](https://discord.com/developers/docs/intro)
