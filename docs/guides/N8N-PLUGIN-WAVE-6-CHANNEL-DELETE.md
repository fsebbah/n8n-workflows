# Guide n8n / Plugin — Webhook CHANNEL_DELETE (Wave 6)

**Date** : 2026-04-14
**De** : Equipe backend
**Pour** : Equipe n8n + Equipe chatbot-core / plugin-recipes
**Backend PR** : #2254 (merged)

---

## Contexte

Quand un channel Discord est supprime, le backend doit etre notifie pour nettoyer la DB :
- Les groupes (promotions) qui referençaient ce channel perdent le lien (`discord_channel_id = NULL`)
- Les etudiants verifies dans ces groupes passent en statut `suspended`

Aujourd'hui, si un channel est supprime dans Discord, la DB garde des references mortes.

---

## Ce qui est pret cote backend

L'endpoint est **deploye et fonctionnel** :

```
POST /api/discord/webhook/channel-delete
```

**Auth** : `X-Service-Token` avec scope `discord:write`

**Body :**
```json
{
  "guild_id": "123456789",
  "channel_id": "111222333",
  "channel_name": "physique-generale",
  "deleted_by": "admin_user_id"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `guild_id` | string | Oui | Discord guild snowflake |
| `channel_id` | string | Oui | ID du channel supprime |
| `channel_name` | string | Non | Nom du channel (pour les logs) |
| `deleted_by` | string | Non | ID de l'utilisateur qui a supprime (pour audit) |

**Reponse (200) :**
```json
{
  "success": true,
  "guild_id": "123456789",
  "channel_id": "111222333",
  "groups_affected": 1,
  "students_suspended": 12
}
```

**Reponse (404)** si le guild_id ne correspond a aucun tenant.

---

## Ce qui doit etre implemente

**Un listener Discord doit detecter l'evenement `CHANNEL_DELETE` et appeler ce webhook.**

### Option A — Plugin Discord (recommandee)

Le plugin ecoute directement l'event Discord via discord.py :

```python
@bot.event
async def on_guild_channel_delete(channel):
    """Notifie le backend quand un channel est supprime."""
    await http_client.post(
        f"{BACKEND_URL}/api/discord/webhook/channel-delete",
        headers={
            "X-Service-Token": SERVICE_TOKEN,
        },
        json={
            "guild_id": str(channel.guild.id),
            "channel_id": str(channel.id),
            "channel_name": channel.name,
        },
    )
```

**Avantage** : le plugin recoit deja tous les events Discord, pas besoin de workflow intermediaire.

### Option B — Workflow n8n

Un workflow n8n qui :
1. Ecoute l'event Discord `CHANNEL_DELETE` (via Discord trigger node)
2. Extrait `guild_id`, `channel_id`, `channel_name`
3. Appelle `POST /api/discord/webhook/channel-delete` avec `X-Service-Token`

**Avantage** : centralise les webhooks dans n8n.
**Inconvenient** : ajoute un intermediaire, latence supplementaire.

---

## Decision requise

**Qui implemente le listener ?**

| | Plugin | n8n |
|---|---|---|
| Effort | ~0.25j (1 event handler) | ~0.5j (workflow + test) |
| Latence | Immediate | +1-2s (n8n relay) |
| Fiabilite | Meme process que le bot | Depend de n8n uptime |
| Coherence | Deja le pattern pour `server-sync` | Deja le pattern pour d'autres webhooks |

A valider entre les deux equipes. Le backend est pret dans les deux cas.

---

## Test

Pour tester sans supprimer un vrai channel Discord :

```bash
curl -X POST https://api.example.com/api/discord/webhook/channel-delete \
  -H "X-Service-Token: votre_token" \
  -H "Content-Type: application/json" \
  -d '{
    "guild_id": "VOTRE_GUILD_ID",
    "channel_id": "UN_CHANNEL_ID_EXISTANT",
    "channel_name": "test-channel"
  }'
```

Verifier que la reponse retourne `groups_affected` et `students_suspended`.

---

## References

- Backend : `app/api_routes/discord_group/webhook_routes.py` (endpoint `webhook_channel_delete`)
- Service : `app/services/discord_group/group_service.py` (methode `handle_channel_deleted`)
- Schema : `app/schemas/discord_group/webhook_schemas.py` (`ChannelDeleteWebhook`)
