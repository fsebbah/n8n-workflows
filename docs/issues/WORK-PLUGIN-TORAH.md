# Travail Équipe plugin-torah

**Source:** RFC-016 + RFC-017
**Date:** 2026-01-22
**Priorité globale:** 🔴 Haute (Phase 2 - Adaptation plugins)

---

## Résumé

L'équipe plugin-torah doit migrer vers l'endpoint de polling autoritaire, implémenter l'annulation serveur via `cancel_url`, et afficher les crédits lors de l'annulation.

---

## Actions à réaliser

| # | Action | Priorité | Dépendances |
|---|--------|----------|-------------|
| 1 | Migrer polling vers `/api/v2/jobs/{id}` | 🔴 Haute | chatbot-core: Action 1 |
| 2 | Passer `cancel_url` au PollingService | 🔴 Haute | n8n: Action 1, chatbot-core: Action 3 |
| 3 | Afficher crédits à l'annulation | 🟡 Moyenne | Action 2 |
| 4 | Utiliser DocumentWorkflowService pour mentions | 🟡 Moyenne | chatbot-core: Action 5 |

---

## Action 1 : Migrer polling vers /api/v2/jobs/{id}

### Contexte

| Ancien endpoint (déprécié) | Nouvel endpoint (autoritaire) |
|---------------------------|------------------------------|
| `GET /webhook/torah-job-status?job_id=...` | `GET /api/v2/jobs/{job_id}` |

### Impact

Si le plugin utilise `DocumentTranslationClient` de chatbot-core, la migration est **automatique** après mise à jour de chatbot-core.

### Vérification

```python
# Vérifier que le plugin utilise DocumentTranslationClient
from chatbot_core.services.n8n import DocumentTranslationClient

client = DocumentTranslationClient(n8n_client, api_url=API_URL)
# Le polling utilisera automatiquement /api/v2/jobs/{id}
```

### Si appel direct (legacy)

```python
# AVANT - À SUPPRIMER
async def check_job_status(job_id: str):
    response = await n8n_client.get(
        "/webhook/torah-job-status",
        params={"job_id": job_id}
    )
    return response

# APRÈS - Utiliser chatbot-core
from chatbot_core.services.n8n import DocumentTranslationClient

client = DocumentTranslationClient(n8n_client, api_url=API_URL)
status = await client.get_job_status(job_id)
```

---

## Action 2 : Passer cancel_url au PollingService

### Contexte

Actuellement, le bouton Stop arrête uniquement le polling côté client. Le job continue sur le serveur, gaspillant des tokens.

### Fichiers à modifier

```
views/translate_views.py (ou équivalent)
```

### Avant

```python
# translate_views.py
class TranslateView(discord.ui.View):
    async def start_translation(self, interaction, document):
        # Démarrer la traduction
        job = await self.client.start_translation(document)

        # Polling sans cancel_url
        polling_service = PollingService(
            status_url=f"{API_URL}/api/v2/jobs/{job.job_id}"
        )

        self.polling_service = polling_service
        result = await polling_service.poll()
        # ...

    @discord.ui.button(label="Stop", style=discord.ButtonStyle.danger)
    async def stop_button(self, interaction, button):
        # Arrête uniquement le polling local
        await self.polling_service.cancel()
        await interaction.response.edit_message(
            content="Annulé",
            view=None
        )
```

### Après

```python
# translate_views.py
class TranslateView(discord.ui.View):
    async def start_translation(self, interaction, document):
        # Démarrer la traduction
        job = await self.client.start_translation(document)

        # Polling AVEC cancel_url
        polling_service = PollingService(
            status_url=f"{API_URL}/api/v2/jobs/{job.job_id}",
            cancel_url=f"{WEBHOOK_URL}/webhook/document-cancel",  # ← NOUVEAU
            cancel_params={                                        # ← NOUVEAU
                "job_id": job.job_id,
                "user_id": str(interaction.user.id),
                "reason": "user_requested"
            }
        )

        self.polling_service = polling_service
        self.job_id = job.job_id
        result = await polling_service.poll()
        # ...

    @discord.ui.button(label="Stop", style=discord.ButtonStyle.danger)
    async def stop_button(self, interaction, button):
        # Annule ET notifie le serveur
        result = await self.polling_service.cancel()

        # Afficher les crédits (voir Action 3)
        if result.data and result.data.get("credits_consumed"):
            await self._show_cancellation_summary(interaction, result.data)
        else:
            await interaction.response.edit_message(
                content="Traitement annulé.",
                view=None
            )
```

### Configuration requise

```python
# config.py ou .env
API_URL = os.getenv("API_URL", "http://pi6.local:3031")
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "http://pi6.local:5678")
```

---

## Action 3 : Afficher crédits à l'annulation

### Contexte

Quand l'utilisateur annule, afficher :
- Segments traités vs total
- Crédits/tokens consommés
- Crédits/tokens économisés

### Implémentation

```python
# translate_views.py
class TranslateView(discord.ui.View):

    async def _show_cancellation_summary(
        self,
        interaction: discord.Interaction,
        data: dict
    ):
        """Afficher le résumé après annulation."""
        credits_consumed = data.get("credits_consumed", {})
        credits_saved = data.get("credits_saved", {})

        # Extraire les valeurs
        segments_completed = credits_consumed.get("segments_completed", 0)
        segments_total = credits_consumed.get("segments_total", "?")
        cost_consumed = credits_consumed.get("cost_usd", 0)
        cost_saved = credits_saved.get("cost_usd", 0)
        tokens_consumed = credits_consumed.get("total_tokens", 0)
        tokens_saved = credits_saved.get("tokens_not_used", 0)

        # Créer l'embed
        embed = discord.Embed(
            title="🛑 Traitement annulé",
            color=0xE74C3C  # Rouge
        )

        embed.add_field(
            name="📊 Progression",
            value=f"{segments_completed}/{segments_total} segments",
            inline=True
        )

        embed.add_field(
            name="💰 Consommé",
            value=f"{cost_consumed:.3f} $\n({tokens_consumed:,} tokens)",
            inline=True
        )

        embed.add_field(
            name="💚 Économisé",
            value=f"{cost_saved:.3f} $\n({tokens_saved:,} tokens)",
            inline=True
        )

        # Message optionnel
        message = data.get("message")
        if message:
            embed.set_footer(text=message)

        await interaction.response.edit_message(embed=embed, view=None)
```

### Exemple d'affichage Discord

```
┌─────────────────────────────────────────────────────────────────┐
│  🛑 Traitement annulé                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 Progression     💰 Consommé        💚 Économisé             │
│  5/15 segments      0.015 $            0.030 $                  │
│                     (9,000 tokens)     (18,000 tokens)          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Job annulé. 5/15 segments traités.                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Action 4 : Utiliser DocumentWorkflowService pour mentions

### Contexte

Pour les mentions `@Bot` avec fichiers, utiliser le flux conversationnel complet RFC-016.

### Prérequis

- chatbot-core doit avoir implémenté `DocumentWorkflowService`
- Priorité : 🟡 Moyenne (peut attendre)

### Implémentation future

```python
# handlers/mention_handler.py
from chatbot_core.services import DocumentWorkflowService

class DocumentMentionHandler:
    def __init__(self, workflow_service: DocumentWorkflowService):
        self.workflow = workflow_service

    async def handle_mention(self, message: discord.Message):
        # Extraire le contexte
        context = self._build_context(message)

        # 1. Analyser l'intention via MCP-LLM-Intention
        intent = await self.workflow.analyze_intent(
            query=message.content,
            history=self._get_history(message.channel),
            context=context,
            user={"id": str(message.author.id)}
        )

        # 2. Si proposition d'actions
        if intent.type == "action_proposal":
            # Afficher les boutons
            view = ActionProposalView(
                actions=intent.proposed_actions,
                workflow=self.workflow,
                user_id=str(message.author.id)
            )
            await message.reply(
                content=intent.message,
                view=view
            )

        # 3. Si simple message
        else:
            await message.reply(content=intent.message)
```

---

## Checklist finale

### Phase 1 (Priorité haute)

- [ ] Vérifier que le plugin utilise `DocumentTranslationClient`
- [ ] Mettre à jour chatbot-core vers version avec nouveau polling
- [ ] Ajouter `cancel_url` et `cancel_params` aux appels PollingService
- [ ] Tester annulation avec notification serveur

### Phase 2 (Priorité moyenne)

- [ ] Implémenter `_show_cancellation_summary()`
- [ ] Tester affichage des crédits dans Discord
- [ ] Vérifier le format des données retournées

### Phase 3 (Priorité basse - Future)

- [ ] Migrer vers `DocumentWorkflowService` pour mentions
- [ ] Implémenter `ActionProposalView` avec boutons
- [ ] Intégrer le flux conversationnel complet

---

## Tests à effectuer

### Test annulation manuelle

1. Lancer une traduction de document (15+ pages)
2. Attendre 2-3 segments traduits
3. Cliquer sur "Stop"
4. Vérifier :
   - [ ] Le serveur reçoit la demande d'annulation
   - [ ] Le job passe en status "cancelled"
   - [ ] L'embed affiche les crédits consommés/économisés
   - [ ] Les segments déjà traduits sont sauvegardés

### Test polling

1. Lancer une traduction
2. Vérifier que le polling utilise `/api/v2/jobs/{id}`
3. Vérifier que la progression s'affiche correctement

---

## Variables d'environnement

```bash
# .env
API_URL=http://pi6.local:3031
WEBHOOK_URL=http://pi6.local:5678
```

---

## Contact

Pour questions sur ces spécifications :
- RFC-016 : Architecture globale
- RFC-017 : Détails job lifecycle
- WORK-CHATBOT-CORE.md : Dépendances chatbot-core
