# RFC-067 — Flow de vérification email par DM Discord

**Date** : 2026-04-15 (màj 2026-04-16)
**Statut** : Draft — Clarifié
**Auteur** : Franck Sebbah + Claude
**Prerequis** : RFC-061 (Groups/Students), RFC-062 (Branding Scope)
**Equipes** : chatbot-core, Backend API, n8n
**Priorite** : Haute — bloquant pour l'onboarding élèves

**Changements clés (2026-04-16)** :
- Le DM est le canal de communication unique bot ↔ étudiant
- Pas de création de channel serveur personnel à l'inscription
- Le DM supporte : fichiers (PDF/vidéo/audio), boutons, quiz, context menu, RAG/AI

---

## 1. Objectif

Permettre la **vérification d'identité des nouveaux membres** d'un serveur Discord **entièrement par DM privé**, sans channel public, sans bouton, sans intervention manuelle de l'admin.

Le flow :
1. L'admin pré-inscrit les étudiants (email) dans un groupe via l'interface web
2. L'étudiant rejoint le serveur Discord (via lien d'invitation)
3. Le bot envoie un **DM de bienvenue** avec les instructions
4. L'étudiant **répond au DM** avec son adresse email
5. Le bot vérifie l'email → accès accordé ou erreur

### 1.1 Le DM comme channel privé

**Point clé** : Dans un DM Discord, le bot reçoit **tous les messages** sans nécessiter de @mention, prefix, ou slash command. L'étudiant tape simplement son email et envoie.

```python
# Le bot reçoit TOUT message dans un DMChannel
if isinstance(message.channel, discord.DMChannel):
    email = message.content.strip()  # Pas de parsing complexe
```

**Conséquence** : Le DM lui-même EST le channel privé de conversation bot ↔ étudiant. Il n'est **pas nécessaire** de créer un channel serveur supplémentaire pour cette communication.

### 1.2 Capacités complètes du DM

Le DM Discord supporte **toutes les fonctionnalités** nécessaires à l'interaction pédagogique :

| Fonctionnalité | Support DM | Exemple d'usage |
|----------------|------------|-----------------|
| **Fichiers PDF** | ✅ | Envoi de recettes, documents cours |
| **Vidéos** | ✅ | Tutoriels, techniques culinaires |
| **Audio** | ✅ | Instructions vocales |
| **Images** | ✅ | Photos de plats, étapes |
| **Embeds riches** | ✅ | Recettes formatées (ingrédients, étapes) |
| **Boutons** | ✅ | "📥 Télécharger", "✅ Compris" |
| **Select menus** | ✅ | Choix multiples, quiz |
| **Quiz interactifs** | ✅ | QCM avec boutons A/B/C |
| **Slash commands** | ✅ | `/recette tarte-citron` |
| **Context menu** | ✅ | Clic-droit → Apps → "Analyser" |
| **Questions libres** | ✅ | L'étudiant pose des questions, le bot répond (RAG/AI) |
| **Threads** | ❌ | Non supporté (mais non nécessaire en 1-on-1) |

**Conclusion** : Aucun besoin de créer un channel serveur personnel. Le DM couvre 100% des cas d'usage pédagogiques bot ↔ étudiant.

### 1.3 Quand créer un channel serveur ?

Un channel serveur personnel n'est nécessaire **que** si des **tiers** (profs, admins) doivent voir/participer à la conversation. Ce cas est **hors scope** de cette RFC et sera traité séparément si besoin.

---

## 2. Prérequis — Ce qui existe déjà

| Composant | Statut | Référence |
|---|---|---|
| Table `discord_students` (email, group_id, status) | ✅ Déployé | RFC-061 |
| Endpoint `GET /groups/{id}` (liste étudiants pré-inscrits) | ✅ Déployé | RFC-061 |
| Endpoint `PUT /discord-settings` (méthode DM, messages) | ✅ Déployé | RFC-061/062 |
| Frontend — configuration DM (messages, toggles, AI improve) | ✅ Déployé | Sessions récentes |
| Bot envoie Welcome DM au `on_member_join` | ❓ À vérifier | — |
| Bot écoute les réponses DM (`on_message` DMChannel) | ❌ **À implémenter** | Cette RFC |
| Bot assigne les rôles Discord | ❓ À vérifier | — |
| ~~Bot crée les channels personnels~~ | ❌ Supprimé | Le DM suffit (section 1.2) |

---

## 3. Flow détaillé

### 3.1 Préparation (admin via interface web)

```
Admin ouvre le dashboard serveur
    ↓
Crée un groupe (ex: "Promo 2026 — Cuisine")
    ↓
Importe les étudiants (CSV ou un par un) avec emails
    ↓  
    emails stockés dans discord_students (status = 'pending')
    ↓
Configure les settings serveur :
    - welcome_enabled = true
    - verification_enabled = true
    - verification_method = 'dm'
    - Messages personnalisés (welcome, success, error, relance)
    ↓
Génère un lien d'invitation Discord pour le groupe
    ↓
Envoie le lien aux étudiants (par email, par la plateforme, etc.)
```

### 3.2 Arrivée d'un nouveau membre

```
Étudiant clique sur le lien d'invitation → rejoint le serveur Discord
    ↓
Event Discord : GUILD_MEMBER_ADD
    ↓
Le bot (chatbot-core ou plugin) reçoit l'event
    ↓
Vérifie : ce guild a-t-il welcome_enabled + verification_method = 'dm' ?
    ↓  
    OUI → Étape 3.3
    NON → Ne rien faire (ou welcome sans vérif si welcome_enabled seul)
```

### 3.3 Envoi du Welcome DM

```
Bot construit l'embed DM :
    - Titre : welcome_title (ex: "Bienvenue sur {server} !")
    - Message : welcome_message (ex: "Salut {user} ! Réponds avec ton email...")
    - Couleur : welcome_color (int → hex pour l'embed)
    - Thumbnail : welcome_thumbnail_url (ou icône serveur en fallback)
    - Footer : welcome_footer_text
    ↓
Substitution des variables :
    {user} → mention du membre (<@123456>)
    {server} → nom du serveur Discord
    ↓
Bot envoie le DM via Discord API :
    POST /users/@me/channels (ouvre le DM)
    POST /channels/{dm_channel_id}/messages (envoie l'embed)
    ↓
Bot stocke en mémoire/Redis :
    pending_verifications[user_id] = {
        guild_id: "1458...",
        dm_channel_id: "xxx",
        sent_at: timestamp,
        attempts: 0
    }
```

### 3.4 Réception de la réponse email

```
Étudiant répond au DM : "jean.dupont@ecole.fr"
    ↓
Event Discord : MESSAGE_CREATE (dans DMChannel)
    ↓
Bot reçoit le message :
    - Vérifie que c'est un DM (pas un message de channel)
    - Vérifie que l'auteur est dans pending_verifications
    - Extrait l'email du message (trim, lowercase)
    ↓
Bot appelle le backend :
    GET /api/ecommerce/admin/guilds/{guild_id}/students/verify?email=jean.dupont@ecole.fr
    OU
    POST /api/ecommerce/admin/guilds/{guild_id}/students/verify-email
    Body: { "discord_user_id": "123...", "email": "jean.dupont@ecole.fr" }
```

### 3.5 Vérification côté backend

```
Backend reçoit la demande de vérification
    ↓
Cherche dans discord_students :
    WHERE guild_id = :guild_id
    AND LOWER(email) = LOWER(:email)
    AND status IN ('pending', 'invited', 'email_failed')
    ↓
TROUVÉ :
    ↓
    Met à jour :
        student.discord_user_id = discord_user_id
        student.status = 'registered' (ou 'discord_linked')
        student.verified_at = NOW()
    ↓
    Retourne au bot :
        { "verified": true, "student": {...}, "group": {...},
          "roles_to_assign": ["role_id_1"], 
          "create_personal_channel": true,
          "personal_channel_category_id": "xxx" }
    ↓
PAS TROUVÉ :
    ↓
    Retourne :
        { "verified": false, "reason": "email_not_found" }
```

### 3.6 Actions post-vérification (bot)

```
Si verified = true :
    ↓
    1. Assigner le rôle vérifié au membre :
       PUT /guilds/{guild_id}/members/{user_id}/roles/{role_id}
    ↓
    2. Callback au backend :
       POST /api/discord/webhook/student-verified
       Body: {
           "guild_id": "...",
           "student_id": "uuid-...",
           "discord_user_id": "123...",
           "verified_at": "ISO..."
       }
    ↓
    3. Envoyer DM succès :
       verification_success_message (configurable)
       "✅ Email vérifié ! Tu as maintenant accès au serveur."
    ↓
    4. Nettoyer pending_verifications[user_id]
    ↓
    NOTE : Pas de création de channel serveur personnel.
           Le DM reste le canal de communication bot ↔ étudiant (voir section 1.2).
    ↓
Si verified = false :
    ↓
    1. Envoyer DM erreur :
       verification_error_message (configurable)
       "❌ Email non reconnu. Vérifie que tu utilises bien l'adresse
        fournie par ton école et réessaie."
    ↓
    2. Incrémenter attempts dans pending_verifications
    ↓
    3. Si attempts >= 3 :
       "Tu as atteint le nombre maximum de tentatives.
        Contacte ton administrateur."
```

---

## 4. Endpoints backend nécessaires

### 4.1 Vérification email (NOUVEAU)

```
POST /api/ecommerce/admin/guilds/{guild_id}/students/verify-email
Header: X-Service-Token: <token> (appel bot→backend, pas user)
```

**Body** :
```json
{
    "discord_user_id": "123456789",
    "email": "jean.dupont@ecole.fr"
}
```

**Réponse (vérifié)** :
```json
{
    "verified": true,
    "student": {
        "id": "uuid-...",
        "email": "jean.dupont@ecole.fr",
        "firstname": "Jean",
        "lastname": "Dupont"
    },
    "group": {
        "id": "uuid-...",
        "name": "Promo 2026 — Cuisine"
    },
    "roles_to_assign": ["333..."]
}
```

**Réponse (non vérifié)** :
```json
{
    "verified": false,
    "reason": "email_not_found"
}
```

**Réponse (déjà vérifié)** :
```json
{
    "verified": false,
    "reason": "already_verified",
    "existing_discord_user_id": "456..."
}
```

### 4.2 Callback student vérifié (NOUVEAU)

```
POST /api/discord/webhook/student-verified
Header: X-Service-Token: <token>
```

**Body** :
```json
{
    "guild_id": "1458...",
    "student_id": "uuid-...",
    "discord_user_id": "123...",
    "verified_at": "2026-04-15T18:30:00Z"
}
```

Met à jour `discord_students` :
- `discord_user_id` = confirmé
- `status` = `'active'`
- `verified_at` = timestamp

> **Note** : Pas de `discord_channel_id` — le DM est le canal de communication (voir section 1.2).

### 4.3 Endpoints existants (inchangés)

| Endpoint | Usage dans ce flow |
|---|---|
| `GET /discord-settings` | Bot lit la config (méthode DM, messages) |
| `GET /groups` | Bot connaît les groupes et leurs configs |
| `POST /webhook/server-sync` | Bot sync les infos serveur (RFC-060) |

---

## 5. Implémentation chatbot-core

### 5.1 Intents Discord requis

```python
intents = discord.Intents.default()
intents.members = True          # GUILD_MEMBER_ADD events
intents.message_content = True  # lire le contenu des DMs
intents.dm_messages = True      # recevoir les DMs
```

**Important** : `message_content` et `members` sont des **intents privilégiés**. Ils doivent être activés dans le [Discord Developer Portal](https://discord.com/developers/applications) → Bot → Privileged Gateway Intents.

### 5.2 Architecture du flow dans le bot

```python
# ─── State : vérifications en attente ─────────────
# Clé: discord_user_id → infos de la demande
# Peut être Redis pour multi-instance ou dict local pour mono-instance
pending_verifications: dict[int, PendingVerification] = {}

@dataclass
class PendingVerification:
    guild_id: str
    dm_channel_id: int
    sent_at: datetime
    attempts: int = 0
    max_attempts: int = 3

# ─── Event : nouveau membre ──────────────────────
@bot.event
async def on_member_join(member: discord.Member):
    guild = member.guild
    
    # Récupérer les settings Discord de cette guild
    settings = await api.get_discord_settings(guild.id)
    
    if not settings or not settings.get('welcome_enabled'):
        return
    
    # Construire et envoyer le Welcome DM
    embed = build_welcome_embed(settings, member, guild)
    
    try:
        dm = await member.send(embed=embed)
    except discord.Forbidden:
        # L'utilisateur a désactivé les DMs
        logger.warning(f"Cannot send DM to {member.id} (DMs disabled)")
        return
    
    # Si vérification DM activée, enregistrer en attente
    if settings.get('verification_enabled') and settings.get('verification_method') == 'dm':
        pending_verifications[member.id] = PendingVerification(
            guild_id=str(guild.id),
            dm_channel_id=dm.channel.id,
            sent_at=datetime.utcnow()
        )

# ─── Event : message reçu (DM) ──────────────────
@bot.event
async def on_message(message: discord.Message):
    # Ignorer les bots
    if message.author.bot:
        return
    
    # Uniquement les DMs
    if not isinstance(message.channel, discord.DMChannel):
        return
    
    # Vérifier si ce user a une vérification en attente
    pending = pending_verifications.get(message.author.id)
    if not pending:
        return
    
    # Extraire l'email
    email = message.content.strip().lower()
    
    # Validation basique du format email
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        await message.reply("Cela ne ressemble pas à une adresse email. Réessaie avec ton email complet.")
        return
    
    # Appeler le backend pour vérifier
    result = await api.verify_student_email(pending.guild_id, str(message.author.id), email)
    
    if result.get('verified'):
        student = result['student']
        guild = bot.get_guild(int(pending.guild_id))
        member = guild.get_member(message.author.id)

        if not member:
            member = await guild.fetch_member(message.author.id)

        # 1. Assigner les rôles
        for role_id in result.get('roles_to_assign', []):
            role = guild.get_role(int(role_id))
            if role:
                await member.add_roles(role, reason=f"Email vérifié: {email}")

        # 2. Callback au backend
        await api.student_verified_callback(
            guild_id=pending.guild_id,
            student_id=student['id'],
            discord_user_id=str(message.author.id)
        )

        # 3. DM succès — le DM reste le canal de communication
        settings = await api.get_discord_settings(int(pending.guild_id))
        success_msg = settings.get('verification_success_message', '✅ Email vérifié !')
        await message.reply(success_msg)

        # 4. Nettoyer
        del pending_verifications[message.author.id]

        # NOTE: Pas de création de channel serveur.
        # Le DM reste le canal de communication bot ↔ étudiant (voir section 1.2)
    
    else:
        reason = result.get('reason', 'unknown')
        settings = await api.get_discord_settings(int(pending.guild_id))
        
        if reason == 'already_verified':
            await message.reply("Cet email est déjà associé à un autre compte Discord.")
        else:
            pending.attempts += 1
            if pending.attempts >= pending.max_attempts:
                await message.reply(
                    "Tu as atteint le nombre maximum de tentatives. "
                    "Contacte ton administrateur pour obtenir de l'aide."
                )
                del pending_verifications[message.author.id]
            else:
                error_msg = settings.get('verification_error_message', '❌ Email non reconnu.')
                await message.reply(error_msg)

# ─── Helper : construire l'embed de bienvenue ────
def build_welcome_embed(settings: dict, member: discord.Member, guild: discord.Guild) -> discord.Embed:
    title = (settings.get('welcome_title') or 'Bienvenue !')
    title = title.replace('{server}', guild.name)
    
    message = (settings.get('welcome_message') or '')
    message = message.replace('{user}', member.mention)
    message = message.replace('{server}', guild.name)
    
    color = settings.get('welcome_color', 0x5865F2)
    
    embed = discord.Embed(
        title=title,
        description=message,
        color=color
    )
    
    thumbnail_url = settings.get('welcome_thumbnail_url')
    if thumbnail_url:
        embed.set_thumbnail(url=thumbnail_url)
    elif guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    
    footer_text = settings.get('welcome_footer_text')
    if footer_text:
        embed.set_footer(text=footer_text)
    
    return embed

```

> **Note** : Le helper `create_personal_channel` a été supprimé — le DM est le canal de communication (voir section 1.2).

### 5.3 Gestion du timeout (relance + action)

```python
# Boucle périodique (toutes les heures)
@tasks.loop(hours=1)
async def check_verification_timeouts():
    now = datetime.utcnow()
    
    for user_id, pending in list(pending_verifications.items()):
        settings = await api.get_discord_settings(int(pending.guild_id))
        
        timeout_hours = settings.get('verification_timeout_hours', 24)
        reminder_hours = settings.get('verification_reminder_hours', 6)
        timeout_action = settings.get('timeout_action', 'remind')
        
        elapsed_hours = (now - pending.sent_at).total_seconds() / 3600
        
        # Relance après reminder_hours
        if elapsed_hours >= reminder_hours and not pending.reminded:
            user = bot.get_user(user_id)
            if user:
                retry_msg = settings.get('verification_retry_message', '🔄 Réessaie !')
                try:
                    await user.send(retry_msg)
                except discord.Forbidden:
                    pass
                pending.reminded = True
        
        # Timeout atteint
        if elapsed_hours >= timeout_hours:
            guild = bot.get_guild(int(pending.guild_id))
            member = guild.get_member(user_id) if guild else None
            
            if timeout_action == 'kick' and member:
                try:
                    await member.kick(reason="Vérification email non complétée")
                except discord.Forbidden:
                    pass
            elif timeout_action == 'remind' and member:
                user = bot.get_user(user_id)
                if user:
                    try:
                        await user.send("⏰ Ta vérification a expiré. Contacte l'admin.")
                    except discord.Forbidden:
                        pass
            
            # Cleanup
            del pending_verifications[user_id]
```

---

## 6. Gestion multi-guild

### Problème

Le bot est dans **plusieurs serveurs**. Quand il reçoit un DM, il ne sait pas à quel serveur rattacher la vérification.

### Solution

Le dict `pending_verifications` stocke le `guild_id` au moment de l'envoi du Welcome DM (`on_member_join`). Quand le DM arrive, on sait déjà à quel guild il est rattaché.

**Cas limite** : un étudiant est invité sur 2 serveurs en même temps. Solution : stocker une **liste** de pendings par user_id, et au moment de la vérification, chercher l'email dans tous les guilds pendants. Le premier match gagne.

```python
# Structure multi-guild
pending_verifications: dict[int, list[PendingVerification]] = {}
```

---

## 7. Persistance des pending_verifications

### Mono-instance (simple)

Dict Python en mémoire. Perdu au redémarrage du bot → les étudiants devront ré-envoyer leur email (pas grave, le welcome DM reste dans l'historique Discord).

### Multi-instance (recommandé pour production)

Redis Hash :
```
HSET pending_verification:{user_id} guild_id "1458..."
HSET pending_verification:{user_id} sent_at "2026-04-15T18:00:00Z"
HSET pending_verification:{user_id} attempts 0
EXPIRE pending_verification:{user_id} 172800  # 48h
```

Avantages :
- Survit aux redémarrages du bot
- Partagé entre instances (si le bot tourne en cluster)
- TTL automatique (cleanup sans boucle)

---

## 8. Sécurité

| Risque | Mitigation |
|---|---|
| Spam d'emails en DM | `max_attempts = 3`, puis blocage |
| Email brute force | Rate limit : 1 tentative / 10s par user |
| Usurpation d'email | L'email doit exister dans `discord_students` (pré-inscrit par l'admin). Pas d'auto-inscription. |
| DM désactivé par le membre | `try/except discord.Forbidden` → log, pas de crash. L'admin voit le statut "pending" sur le dashboard. |
| Bot redémarré pendant vérification | Si Redis : les pendings survivent. Si dict mémoire : perdu, étudiant répond → bot ignore (pas dans pending). Pas grave : l'étudiant peut quitter et re-rejoindre le serveur → nouveau Welcome DM. |

---

## 9. Estimation

| Équipe | Tâche | Effort |
|---|---|---|
| **chatbot-core** | `on_member_join` + Welcome DM (embed builder) | 1j |
| **chatbot-core** | `on_message` DM listener + vérification email | 1.5j |
| **chatbot-core** | Assignation rôle post-vérification | 0.5j |
| **chatbot-core** | Timeout loop + relance/kick | 0.5j |
| **chatbot-core** | Persistance Redis (multi-instance) | 0.5j |
| **Backend API** | `POST /students/verify-email` | 0.5j |
| **Backend API** | `POST /webhook/student-verified` | 0.5j |
| **n8n** | Vérifier que relay webhook est câblé (si plugin passe par n8n) | 0.25j |
| **Frontend** | ✅ Déjà fait (configuration UI messages) | 0 |
| **Tests E2E** | Scénarios complets (happy path + erreur + timeout) | 1j |
| **Total** | | **6.25j** |

> **Note** : Pas de création de channel personnel — le DM couvre tous les besoins (voir section 1.2).

---

## 10. Intents et permissions requises

### 10.1 Intents Discord (Developer Portal)

Dans [discord.com/developers](https://discord.com/developers/applications) → Application → Bot → **Privileged Gateway Intents** :

| Intent | Type | Requis | Usage |
|--------|------|--------|-------|
| `SERVER MEMBERS INTENT` | Privileged | ✅ | `on_member_join` event |
| `MESSAGE CONTENT INTENT` | Privileged | ✅ | Lire le contenu des DMs |

> **Note** : Ces intents privileged sont généralement activés par défaut dans les applications existantes, mais doivent être vérifiés.

### 10.2 Intents dans le code bot (chatbot-core)

```python
intents = discord.Intents.default()
intents.members = True           # GUILD_MEMBERS — on_member_join
intents.message_content = True   # MESSAGE_CONTENT — lire les DMs
intents.dm_messages = True       # DIRECT_MESSAGES — recevoir les DMs
```

### 10.3 Events à implémenter (chatbot-core)

| Event | Description | Statut |
|-------|-------------|--------|
| `on_member_join` | Déclenché quand un membre rejoint le serveur | ❓ À vérifier |
| `on_message` | Filtrer `isinstance(channel, DMChannel)` pour les DMs | ❓ À vérifier |

### 10.4 Permissions du bot dans le serveur

- [x] `MANAGE_ROLES` — pour assigner le rôle vérifié
- [x] `SEND_MESSAGES` — pour envoyer dans les channels serveur (annonces, etc.)
- [x] `VIEW_CHANNEL` — pour voir les channels serveur
- [x] `CREATE_INSTANT_INVITE` — pour les invitations

> **Note** : `MANAGE_CHANNELS` n'est plus requis — pas de création de channel personnel.

---

## 11. Questions pour les équipes

### Pour chatbot-core

1. Le bot écoute-t-il déjà `on_member_join` ? Si oui, quelles actions sont déjà exécutées ?

   **Réponse** : Oui, `on_member_join` existe déjà dans plusieurs composants :
   - `MemberJoinService` (`chatbot_core/services/member_join_service.py`) — service principal de gestion
   - `WelcomeService` (`chatbot_core/services/welcome_service.py`) — messages de bienvenue
   - `StudentVerificationMixin` — mixin pour la vérification étudiante

   Point d'extension disponible pour le flow de vérification DM.

2. Les intents `GUILD_MEMBERS` et `MESSAGE_CONTENT` sont-ils activés dans le Developer Portal ?

   **Réponse** : Dans le code (`chatbot_core/bot/intents.py`), `message_content=True` est activé par défaut.
   ⚠️ **`members` n'est PAS explicitement activé** — à ajouter pour recevoir `on_member_join`.

   Pour le Developer Portal : à vérifier manuellement que les Privileged Gateway Intents sont cochés.

3. Préférez-vous dict mémoire ou Redis pour les pending_verifications ?

   **Réponse** : **Redis** — infrastructure Redis déjà en place :
   - `BaseRedisService` avec retry automatique, health checks, serialization JSON
   - `DMListener` utilise déjà Redis Streams avec Consumer Groups pour la livraison fiable des DMs
   - Pattern établi pour la persistance multi-instance

   Structure suggérée : `pending_verification:{user_id}` avec TTL automatique (48h).

4. Le bot tourne-t-il en mono-instance ou multi-instance ?

   **Réponse** : **Multi-instance** — l'architecture existante le supporte :
   - Redis Streams avec Consumer Groups (DMListener)
   - BaseRedisService partagé entre instances
   - ResyncSubscriber utilise Redis Pub/Sub pour la communication inter-instances

### Pour Backend API

1. L'endpoint `POST /students/verify-email` peut-il être appelé par le bot directement (avec un service token) ou doit-il passer par n8n ?
2. Le callback `POST /webhook/student-verified` existe-t-il déjà sous une forme similaire ?

### Pour n8n

1. Le flow `on_member_join` → Welcome DM passe-t-il par n8n ou est-il direct bot → Discord API ?
2. Si le bot appelle directement le backend (service token), n8n est-il même impliqué dans ce flow ?

---

## 12. Schéma récapitulatif

```
                    DISCORD                           BACKEND
                    ───────                           ───────
Étudiant rejoint
    │
    ▼
GUILD_MEMBER_ADD ──→ Bot : on_member_join
                         │
                         ├──→ GET /discord-settings
                         │    (config welcome + verif)
                         │
                         ├──→ Envoie Welcome DM (embed + boutons)
                         │
                         └──→ Stocke pending_verification[user_id]
                              {guild_id, sent_at, attempts}

Étudiant répond
au DM avec email
    │
    ▼
MESSAGE_CREATE ────→ Bot : on_message (DMChannel)
                         │
                         ├──→ POST /students/verify-email
                         │    Body: {discord_user_id, email}
                         │
                         │    ← { verified: true/false, ... }
                         │
                    Si verified:
                         ├──→ PUT /guilds/{}/members/{}/roles/{} (Discord API)
                         ├──→ POST /webhook/student-verified (Backend callback)
                         └──→ DM succès

                    Si not verified:
                         └──→ DM erreur + attempts++

                    ════════════════════════════════════════
                    Le DM reste le canal de communication
                    bot ↔ étudiant pour la suite :
                    - Envoi de recettes (PDF, vidéo)
                    - Quiz interactifs (boutons)
                    - Questions/réponses (RAG/AI)
                    - Context menu (clic-droit → Apps)
                    ════════════════════════════════════════

Timeout (boucle)
    │
    ▼
check_timeouts ────→ Bot vérifie pending_verifications
                         │
                         ├── reminder_hours atteint → DM relance
                         └── timeout_hours atteint → kick / remind / rien
```

---

## 13. Checklist de vérification pré-implémentation

Avant d'implémenter ce flow, vérifier les points suivants :

### Discord Developer Portal
- [ ] `SERVER MEMBERS INTENT` activé (Privileged Gateway Intents)
- [ ] `MESSAGE CONTENT INTENT` activé (Privileged Gateway Intents)

### Code chatbot-core
- [ ] Intents configurés : `members=True`, `message_content=True`, `dm_messages=True`
- [ ] Event `on_member_join` implémenté ou point d'extension disponible
- [ ] Event `on_message` avec filtre `DMChannel` implémenté ou point d'extension disponible

### Backend API
- [ ] Endpoint `POST /students/verify-email` à créer
- [ ] Endpoint `POST /webhook/student-verified` à créer

### Configuration serveur (par admin via UI)
- [ ] `welcome_enabled = true`
- [ ] `verification_enabled = true`
- [ ] `verification_method = 'dm'`
- [ ] Messages personnalisés configurés (welcome, success, error)

### Contraintes utilisateur
- [ ] L'étudiant doit avoir les DMs activés (sinon `discord.Forbidden` côté bot)

---

## 14. Références

- RFC-061 : Discord Groups / Students / Channels
- RFC-062 : Branding Scope Clarification (settings welcome/verif)
- RFC-060 : Guild Info Sync (webhook server-sync pattern)
- Discord.py docs : [Intents](https://discordpy.readthedocs.io/en/stable/intents.html)
- Discord API : [Create DM](https://discord.com/developers/docs/resources/user#create-dm), [Create Guild Channel](https://discord.com/developers/docs/resources/guild#create-guild-channel)
