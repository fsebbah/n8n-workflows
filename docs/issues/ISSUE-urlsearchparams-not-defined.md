# Issue: URLSearchParams is not defined dans les workflows n8n

**Date:** 2026-01-08
**Status:** EN COURS DE CORRECTION
**Priorite:** Critique (workflows en production impactes)

---

## Contexte

Plusieurs workflows n8n utilisent `URLSearchParams` dans des nodes Code pour construire des requetes `application/x-www-form-urlencoded` vers l'API Stripe. Cette classe JavaScript n'est **pas disponible** dans l'environnement sandbox du task-runner n8n.

---

## Erreur

```
ReferenceError: URLSearchParams is not defined
    at VmCodeWrapper (evalmachine.<anonymous>:5:16)
    at Script.runInContext (node:vm:149:12)
    ...
    at JsTaskRunner.executeTask (.../n8n/node_modules/@n8n/task-runner/dist/js-task-runner/js-task-runner.js:128:26)
```

**Version n8n:** 1.122.4

---

## Cause technique

Le task-runner n8n execute le JavaScript dans un environnement VM isole (`node:vm`) qui n'expose pas toutes les APIs Web standard. `URLSearchParams` fait partie de l'API Web URL et n'est pas disponible dans ce contexte sandbox.

---

## Workflows impactes

| Workflow | ID n8n | Status | Node concerne | Impact |
|----------|--------|--------|---------------|--------|
| DISCORD - Subscribe | `z3ptm83NqfKA1Qed` | Actif | Prepare Stripe Request | **ERREUR EN PROD** |
| Stripe - Subscription Checkout Create | `q36nyuiWrZ0ktCoA` | Actif | Prepare Stripe Request | Va echouer si appele |
| Stripe - subscription-change-plan | Non importe | - | Prepare Update | Va echouer si importe |

### Fichiers dans le repo

```
workflows/Discord/discord-subscribe.json
workflows/Stripe/subscription-checkout-create.json
workflows/Stripe/subscription-change-plan.json
```

---

## Exemple de code problematique

```javascript
// Code node "Prepare Stripe Request" - NE FONCTIONNE PAS
const params = new URLSearchParams();  // <- ERREUR: URLSearchParams is not defined
params.append('mode', 'subscription');
params.append('line_items[0][price]', data.plan_id);
params.append('line_items[0][quantity]', '1');
// ...
return [{ json: { bodyString: params.toString() } }];
```

Puis dans le HTTP Request node:
```json
{
  "contentType": "raw",
  "body": "={{ $json.bodyString }}"
}
```

---

## Solution

Utiliser les **bodyParameters natifs** de n8n avec `contentType: "form-urlencoded"` au lieu de construire manuellement le body dans un Code node.

### Pattern fonctionnel (exemple: Billing Portal)

```json
{
  "parameters": {
    "method": "POST",
    "url": "https://api.stripe.com/v1/checkout/sessions",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Authorization", "value": "=Bearer {{ $json.stripe_key }}" }
      ]
    },
    "sendBody": true,
    "contentType": "form-urlencoded",
    "bodyParameters": {
      "parameters": [
        { "name": "mode", "value": "subscription" },
        { "name": "line_items[0][price]", "value": "={{ $json.plan_id }}" },
        { "name": "line_items[0][quantity]", "value": "1" },
        { "name": "metadata[project_id]", "value": "={{ $json.project_id }}" },
        { "name": "subscription_data[metadata][discord_user_id]", "value": "={{ $json.discord_user_id }}" }
      ]
    }
  }
}
```

### Avantages

1. **Natif n8n** - pas de dependance a des APIs JavaScript specifiques
2. **Plus lisible** - parametres clairement definis
3. **Maintenable** - modification sans toucher au code
4. **Supporte la notation bracket** - `line_items[0][price]`, `metadata[key]`

---

## Plan de correction

### Modifications par workflow

#### 1. DISCORD - Subscribe
- [ ] Supprimer le node "Prepare Stripe Request" (Code)
- [ ] Modifier "Create Stripe Checkout" pour utiliser bodyParameters natifs
- [ ] Mettre a jour "Format Response" pour referencer "Check Project"
- [ ] Mettre a jour les connexions

#### 2. Stripe - Subscription Checkout Create
- [ ] Supprimer le node "Prepare Stripe Request" (Code)
- [ ] Modifier le HTTP Request node pour utiliser bodyParameters natifs
- [ ] Adapter les references dans les nodes suivants

#### 3. Stripe - subscription-change-plan
- [ ] Supprimer le node "Prepare Update" (Code)
- [ ] Modifier le HTTP Request node pour utiliser bodyParameters natifs
- [ ] Adapter les references dans les nodes suivants

---

## Detection

L'erreur a ete detectee via les logs du bot Discord:

```
2026-01-08 12:04:32,638 - framework.services.n8n.base - WARNING - [N8nClient] discord-subscribe returned null response
```

Investigation de l'execution n8n `20947`:
- **Input:** project_id=torah-fun, discord_user_id=1455174904323379215, plan_id=price_1Sl6uKAKscD6pRl5e7CKOstS
- **Last node:** Prepare Stripe Request
- **Error:** URLSearchParams is not defined [line 5]

---

## Autres workflows utilisant URLSearchParams

Une recherche dans le repo montre 7 fichiers utilisant `URLSearchParams`:

```
workflows/Discord/discord-subscribe.json           <- A CORRIGER
workflows/Stripe/subscription-checkout-create.json <- A CORRIGER
workflows/Stripe/subscription-change-plan.json     <- A CORRIGER
workflows/Splitout/1831_Splitout_Code_Automation_Webhook.json
workflows/Code/2034_Code_Webhook_Automate_Webhook.json
workflows/Wait/2042_Wait_Webhook_Automation_Webhook.json
workflows/Wait/1589_Wait_Webhook_Automation_Webhook.json
```

Les 4 derniers sont des workflows importes/exemples et ne sont pas actifs.

---

## References

- [n8n HTTP Request Node Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [Stripe API - Checkout Sessions](https://stripe.com/docs/api/checkout/sessions/create)
- Workflow fonctionnel de reference: `DISCORD - Billing Portal` (1L2jXhpWIVlmFxZf)
