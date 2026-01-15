# RFC-005: Attribution automatique de crédits à l'arrivée d'un membre

**Status:** Draft
**Date:** 2026-01-15
**Auteurs:** Équipes API, Chatbot-Core, n8n

---

## Résumé

Lorsqu'un utilisateur rejoint un serveur Discord, il reçoit automatiquement le plan "marmiton" avec un nombre de crédits configurables. Cette attribution est **idempotente** : un utilisateur qui quitte et revient ne reçoit pas de nouveaux crédits.

---

## Objectifs

1. **Onboarding automatique** : Tout nouveau membre a immédiatement accès aux fonctionnalités de base
2. **Plan gratuit** : Le plan "marmiton" offre un quota limité pour découvrir le service
3. **Idempotence** : Éviter les abus (quitter/rejoindre pour obtenir des crédits)
4. **Non-écrasement** : Ne jamais downgrader un abonné payant

---

## Contrainte critique : Idempotence

> **Un utilisateur qui quitte le serveur et revient NE DOIT PAS recevoir de nouveaux crédits.**

### Scénarios

| Scénario | Action | Résultat |
|----------|--------|----------|
| Nouveau membre (jamais vu) | Créer `user_credits` | ✅ Plan marmiton + X crédits |
| Membre revient (plan free) | Ignorer | ❌ Pas de changement |
| Membre revient (plan payant) | Ignorer | ❌ Pas de changement |
| Abonné actif qui rejoint | Ignorer | ❌ Pas de downgrade |

### Pourquoi c'est important

```
❌ SANS idempotence:

User rejoint    → +10 crédits (total: 10)
User quitte
User rejoint    → +10 crédits (total: 20)  ← ABUS
User quitte
User rejoint    → +10 crédits (total: 30)  ← ABUS
...

✅ AVEC idempotence:

User rejoint    → +10 crédits (total: 10)
User quitte
User rejoint    → Ignoré (total: 10)       ← CORRECT
User quitte
User rejoint    → Ignoré (total: 10)       ← CORRECT
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DISCORD                                         │
│                                                                              │
│                         Event: on_member_join                                │
│                                   │                                          │
└───────────────────────────────────┼──────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CHATBOT-CORE                                       │
│                                                                              │
│  ┌─────────────────┐       ┌─────────────────────┐                          │
│  │ WelcomeService  │       │ MemberJoinService   │  ◄── NOUVEAU             │
│  │ (messages)      │       │ (callback n8n)      │                          │
│  └─────────────────┘       └──────────┬──────────┘                          │
│                                       │                                      │
└───────────────────────────────────────┼──────────────────────────────────────┘
                                        │
                                        │ POST /webhook/member-join
                                        │ {
                                        │   discord_user_id,
                                        │   discord_username,
                                        │   guild_id
                                        │ }
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               n8n                                            │
│                                                                              │
│  Workflow: MEMBERS---On-Join-Grant-Credits                                  │
│                                                                              │
│  ┌──────────────┐    ┌──────────────────────────┐    ┌────────────────┐     │
│  │   Webhook    │───►│  POST /api/webhook/      │───►│   Respond      │     │
│  │   Trigger    │    │  account/init            │    │   200/201      │     │
│  └──────────────┘    └──────────────────────────┘    └────────────────┘     │
│                                                                              │
└───────────────────────────────────────┼──────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               API                                            │
│                                                                              │
│  POST /api/webhook/account/init  ◄── NOUVEAU ENDPOINT                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. Mapper guild_id → project_id                                    │    │
│  │  2. SELECT * FROM user_credits WHERE discord_user_id = ?            │    │
│  │                                                                     │    │
│  │     ┌─────────────────┐          ┌─────────────────┐               │    │
│  │     │  User existe    │          │  User n'existe  │               │    │
│  │     │                 │          │  pas            │               │    │
│  │     │  → 200 OK       │          │  → INSERT       │               │    │
│  │     │  (no change)    │          │  → 201 Created  │               │    │
│  │     └─────────────────┘          └─────────────────┘               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Spécifications par équipe

---

### Équipe API

#### Nouvel endpoint : `POST /api/webhook/account/init`

**Fichier :** `api/routers/webhook_account.py`

**Request :**
```http
POST /api/webhook/account/init
Content-Type: application/json
X-Project-ID: bot-appetit  (optionnel si guild_id fourni)

{
  "discord_user_id": "123456789",
  "discord_username": "john_doe",
  "guild_id": "987654321"
}
```

**Logique :**
```python
@router.post("/webhook/account/init")
async def init_member_credits(request: InitMemberRequest, db: Session):
    """
    Initialise les crédits d'un nouveau membre.
    IDEMPOTENT: Si l'utilisateur existe déjà, ne fait rien.
    """

    # 1. Mapper guild_id → project_id
    project_id = get_project_for_guild(request.guild_id)
    if not project_id:
        raise HTTPException(400, "Unknown guild_id")

    # 2. Vérifier si l'utilisateur existe déjà
    existing = db.query(UserCredits).filter(
        UserCredits.project_id == project_id,
        UserCredits.discord_user_id == request.discord_user_id
    ).first()

    # 3. Si existe → ne rien faire (IDEMPOTENCE)
    if existing:
        return {
            "success": True,
            "status": "already_exists",
            "plan_id": existing.plan_id,
            "credits_remaining": existing.credits_remaining,
            "message": "User already has an account"
        }

    # 4. Si n'existe pas → créer avec plan marmiton
    config = get_project_config(project_id)
    initial_credits = config.get("marmiton_initial_credits", 10)

    new_user = UserCredits(
        project_id=project_id,
        discord_user_id=request.discord_user_id,
        discord_username=request.discord_username,
        user_id=str(uuid.uuid4()),  # Générer UUID
        credits_remaining=initial_credits,
        credits_total=initial_credits,
        plan_id="marmiton",
        subscription_status="free",
        reason="member_join"
    )
    db.add(new_user)
    db.commit()

    return {
        "success": True,
        "status": "created",
        "plan_id": "marmiton",
        "credits_remaining": initial_credits,
        "message": "New member account created"
    }, 201
```

**Responses :**

| Status | Cas | Body |
|--------|-----|------|
| `200 OK` | User existe déjà | `{"status": "already_exists", "plan_id": "..."}` |
| `201 Created` | Nouveau user créé | `{"status": "created", "credits_remaining": 10}` |
| `400 Bad Request` | guild_id inconnu | `{"error": "Unknown guild_id"}` |

**Mapping guild_id → project_id :**

```python
# Table ou config à créer
GUILD_PROJECT_MAPPING = {
    "987654321": "bot-appetit",
    "123456789": "autre-projet",
}

def get_project_for_guild(guild_id: str) -> str | None:
    return GUILD_PROJECT_MAPPING.get(guild_id)
```

**Configuration par projet :**

```python
PROJECT_CONFIG = {
    "bot-appetit": {
        "marmiton_initial_credits": 10,
        "marmiton_plan_id": "marmiton"
    }
}
```

---

### Équipe Chatbot-Core

#### Nouveau service : `MemberJoinService`

**Fichier :** `chatbot_core/services/member_join_service.py`

```python
import aiohttp
import logging
from discord import Member
from discord.ext import commands

logger = logging.getLogger(__name__)


class MemberJoinService:
    """
    Service qui appelle n8n lors de l'arrivée d'un nouveau membre.
    Utilisé pour l'attribution automatique de crédits (RFC-005).
    """

    def __init__(
        self,
        bot: commands.Bot,
        callback_url: str,
        enabled_guilds: list[str] | None = None,  # None = tous
    ):
        self.bot = bot
        self.callback_url = callback_url
        self.enabled_guilds = enabled_guilds
        self._session: aiohttp.ClientSession | None = None

        # Enregistrer l'event listener
        self.bot.add_listener(self.on_member_join, "on_member_join")
        logger.info(f"MemberJoinService initialized with callback: {callback_url}")

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def on_member_join(self, member: Member):
        """Appelé quand un membre rejoint le serveur."""

        # Ignorer les bots
        if member.bot:
            logger.debug(f"Ignoring bot: {member.name}")
            return

        # Vérifier si le guild est activé
        guild_id = str(member.guild.id)
        if self.enabled_guilds and guild_id not in self.enabled_guilds:
            logger.debug(f"Guild {guild_id} not in enabled list")
            return

        # Appeler le callback n8n
        await self._call_callback(member)

    async def _call_callback(self, member: Member):
        """Envoie les infos du membre au webhook n8n."""

        payload = {
            "discord_user_id": str(member.id),
            "discord_username": member.name,
            "guild_id": str(member.guild.id),
            "guild_name": member.guild.name,
            "joined_at": member.joined_at.isoformat() if member.joined_at else None
        }

        try:
            session = await self._get_session()
            async with session.post(
                self.callback_url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status in (200, 201):
                    data = await resp.json()
                    logger.info(
                        f"Member join callback success for {member.name}: "
                        f"status={data.get('status')}"
                    )
                else:
                    text = await resp.text()
                    logger.warning(
                        f"Member join callback failed for {member.name}: "
                        f"status={resp.status}, body={text}"
                    )
        except Exception as e:
            logger.error(f"Member join callback error for {member.name}: {e}")

    async def close(self):
        """Ferme la session HTTP."""
        if self._session and not self._session.closed:
            await self._session.close()
```

**Configuration :**

```python
# Dans le setup du bot
from chatbot_core.services.member_join_service import MemberJoinService

member_join_service = MemberJoinService(
    bot=bot,
    callback_url=os.getenv("N8N_WEBHOOK_BASE_URL") + "/member-join",
    enabled_guilds=["987654321"],  # Optionnel: limiter aux guilds spécifiques
)
```

**Relation avec WelcomeService :**

```
on_member_join
      │
      ├──► WelcomeService
      │    └── Envoie message de bienvenue
      │
      └──► MemberJoinService
           └── Appelle n8n pour attribution crédits
```

Les deux services écoutent le même event mais ont des responsabilités différentes.

---

### Équipe n8n

#### Nouveau workflow : `MEMBERS---On-Join-Grant-Credits`

**Webhook :** `POST /webhook/member-join`

**Flow :**

```
┌─────────────────┐
│ Webhook Trigger │  POST /member-join
│                 │  Body: {discord_user_id, discord_username, guild_id}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate Input  │  Vérifier champs requis
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ POST {{ $env.TORAH_API_URL }}/api/webhook/account/  │
│      init                                           │
│                                                     │
│ Headers: Content-Type: application/json             │
│                                                     │
│ Body: {                                             │
│   "discord_user_id": "{{ $json.discord_user_id }}", │
│   "discord_username": "{{ $json.discord_username }}",│
│   "guild_id": "{{ $json.guild_id }}"                │
│ }                                                   │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Format Response │  Normaliser la réponse
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Respond Webhook │  200 OK
└─────────────────┘
```

**Response format :**

```json
{
  "success": true,
  "status": "created",        // ou "already_exists"
  "plan_id": "marmiton",
  "credits_remaining": 10,
  "discord_user_id": "123456789"
}
```

---

## Configuration

### Variables d'environnement

| Variable | Service | Valeur exemple |
|----------|---------|----------------|
| `N8N_WEBHOOK_BASE_URL` | Chatbot-Core | `http://pi6.local:5678/webhook` |
| `TORAH_API_URL` | n8n | `http://pi6.local:8000` |
| `MARMITON_INITIAL_CREDITS` | API | `10` |

### Mapping Guild → Project

| Guild ID | Project ID | Crédits initiaux |
|----------|------------|------------------|
| `987654321` | `bot-appetit` | `10` |

---

## Cas d'erreur

| Erreur | Cause | Action |
|--------|-------|--------|
| `guild_id` inconnu | Guild non configuré | Log warning, ignorer |
| API timeout | API down | Log error, réessayer plus tard (optionnel) |
| n8n timeout | n8n down | Log error, membre non crédité |

---

## Tests

### Test 1 : Nouveau membre

```bash
# Simuler un membre join
curl -X POST http://pi6.local:5678/webhook/member-join \
  -H "Content-Type: application/json" \
  -d '{
    "discord_user_id": "999888777",
    "discord_username": "test_user",
    "guild_id": "987654321"
  }'

# Attendu: 201 Created, status: "created"
```

### Test 2 : Membre qui revient

```bash
# Même requête que test 1
curl -X POST http://pi6.local:5678/webhook/member-join \
  -H "Content-Type: application/json" \
  -d '{
    "discord_user_id": "999888777",
    "discord_username": "test_user",
    "guild_id": "987654321"
  }'

# Attendu: 200 OK, status: "already_exists"
# Crédits NON modifiés
```

### Test 3 : Abonné payant

```bash
# Créer d'abord un abonné payant via Stripe
# Puis simuler un rejoin

curl -X POST http://pi6.local:5678/webhook/member-join \
  -H "Content-Type: application/json" \
  -d '{
    "discord_user_id": "1455174904323379215",
    "discord_username": "azy0147",
    "guild_id": "987654321"
  }'

# Attendu: 200 OK, status: "already_exists", plan_id: "chef-cuisine"
# Plan NON downgrade
```

---

## Checklist d'implémentation

### Équipe API

- [ ] Créer endpoint `POST /api/webhook/account/init`
- [ ] Implémenter logique idempotente (IF NOT EXISTS)
- [ ] Ajouter mapping `guild_id → project_id`
- [ ] Ajouter config `marmiton_initial_credits` par projet
- [ ] Tests unitaires

### Équipe Chatbot-Core

- [ ] Créer `MemberJoinService`
- [ ] Écouter `on_member_join`
- [ ] Appeler callback n8n avec payload
- [ ] Gérer erreurs (timeout, n8n down)
- [ ] Config `callback_url` via env var

### Équipe n8n

- [ ] Créer workflow `MEMBERS---On-Join-Grant-Credits`
- [ ] Webhook `POST /member-join`
- [ ] Appeler `POST /api/webhook/account/init`
- [ ] Tests manuels

---

## Sécurité

1. **Pas de création de crédits infinis** : L'API vérifie si l'utilisateur existe
2. **Pas de downgrade** : Un abonné payant n'est jamais modifié
3. **Callback interne** : Le webhook n8n n'est accessible qu'en local

---

## Références

- [RFC-004: Private Channels](../issues/RFC-004-PRIVATE-CHANNELS.md) - Pattern callback similaire
- [RFC-003: Branding](../guides/RFC-003-checkout-branding-multi-tenant.md) - Multi-tenant

---

## Historique

| Date | Auteur | Modification |
|------|--------|--------------|
| 2026-01-15 | Équipe n8n | Création du RFC |
