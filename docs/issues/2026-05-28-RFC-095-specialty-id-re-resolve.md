# RFC-095 — Manque paramètre `specialty_id` pour re-resolve après clarification

| Champ | Valeur |
|-------|--------|
| Date | 2026-05-28 |
| Statut | ⏳ En attente backend |
| Priorité | P1 (bloquant flow clarification) |
| Auteur | plugin |
| Contexte | Flow `needs_clarification` incomplet |

---

## 1. Problème

Quand `resolve-dm` retourne `status: "needs_clarification"` avec des `clarification_candidates`, le plugin affiche des boutons pour que l'utilisateur choisisse sa matière.

**Après le clic**, le plugin doit re-appeler `resolve-dm` avec la matière choisie. Mais l'endpoint actuel ne supporte pas ce paramètre.

### Flow actuel (incomplet)

```
Plugin: POST /webhook/discord/dm-resolve {guild_id, user_id, question}
n8n:    GET /api/n8n/personae/resolve-dm?user_id=U&question=Q
Back:   → { status: "needs_clarification", clarification_candidates: [...] }
Plugin: Affiche boutons [Maths] [Histoire] [SVT]
User:   Clique sur [Maths] (specialty_id=abc123)
Plugin: POST /webhook/discord/dm-resolve {guild_id, user_id, question, specialty_id: "abc123"}
n8n:    GET /api/n8n/personae/resolve-dm?user_id=U&question=Q  ← IGNORE specialty_id !
Back:   → { status: "needs_clarification" }  ← BOUCLE INFINIE !
```

### Flow attendu

```
Plugin: POST /webhook/discord/dm-resolve {guild_id, user_id, question, specialty_id: "abc123"}
n8n:    GET /api/n8n/personae/resolve-dm?user_id=U&question=Q&specialty_id=abc123
Back:   → { status: "resolved", personae: {...} }  ← FORCÉ sur la matière choisie
```

---

## 2. État actuel par équipe

| Équipe | État | Code |
|--------|------|------|
| Plugin | ✅ **FAIT** | `DMResolveService.resolve_with_specialty()` envoie `specialty_id` |
| n8n | ⏳ À FAIRE | Passer `specialty_id` à l'API backend si présent |
| Backend | ⏳ À FAIRE | Ajouter paramètre `specialty_id` optionnel à `resolve-dm` |

---

## 3. Proposition backend

### Option A : Paramètre optionnel (recommandé)

```
GET /api/n8n/personae/resolve-dm?user_id=U&question=Q&specialty_id=abc123
                                                      ↑ NOUVEAU (optionnel)
```

Comportement :
- Si `specialty_id` absent → classification LLM (comportement actuel)
- Si `specialty_id` présent → skip classification, résoudre directement sur cette matière

### Option B : Endpoint séparé

```
GET /api/n8n/personae/by-specialty?user_id=U&specialty_id=abc123
```

Retourne directement le personae sans classification.

**Recommandation : Option A** (plus simple, rétro-compatible).

---

## 4. Proposition n8n

Le workflow `DISCORD_-_DM_Resolve` doit :

1. Lire `specialty_id` du payload webhook (optionnel)
2. Le passer à l'API backend si présent

```json
// Payload webhook
{
  "guild_id": "123",
  "user_id": "456",
  "question": "Comment résoudre une équation ?",
  "specialty_id": "abc123"  // ← optionnel, présent après clarification
}
```

```
// Appel API
GET /api/n8n/personae/resolve-dm?user_id=456&question=...&specialty_id=abc123
```

---

## 5. Code plugin (déjà implémenté)

### `src/services/dm_resolve_service.py`

```python
async def resolve_with_specialty(
    self,
    guild_id: str,
    user_id: str,
    question: str,
    specialty_id: str,
) -> ResolveDmResponse:
    """Résout avec une matière pré-sélectionnée (après clarification)."""
    payload = {
        "guild_id": guild_id,
        "user_id": user_id,
        "question": question,
        "specialty_id": specialty_id,  # ← Force la matière
    }
    # POST vers n8n...
```

### `src/handlers/dm_handler.py`

```python
async def on_subject_choice(interaction, specialty_id, name):
    # Rappeler resolve-dm avec la matière
    new_response = await self.dm_resolve_service.resolve_with_specialty(
        guild_id=self.default_guild_id,
        user_id=str(message.author.id),
        question=message.content,
        specialty_id=specialty_id,
    )
    # Dispatch...
```

---

## 6. Actions requises

| # | Action | Owner | Effort | Bloqué par |
|---|--------|-------|--------|------------|
| 1 | Ajouter `specialty_id` optionnel à `resolve-dm` | backend | ~0.5j | - |
| 2 | Passer `specialty_id` dans le workflow n8n | n8n | ~0.25j | #1 |
| 3 | Tester flow complet clarification → re-resolve | plugin | ~0.25j | #1, #2 |

**Charge totale : ~1j**

---

## 7. Tests de validation

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 1 | DM sans `specialty_id` → ambiguë | `needs_clarification` + candidates |
| 2 | DM avec `specialty_id` valide | `resolved` + personae |
| 3 | DM avec `specialty_id` non inscrit | `out_of_scope` + `subject_not_enrolled` |
| 4 | Flow complet : ambigu → clic bouton → résolu | LLM répond avec le bon personae |

---

*Issue créée suite à l'analyse du flow RFC-095 post-merge.*

---

## 8. Réponse back — 2026-05-28

**Périmètre OK.** Option **A** retenue (param optionnel sur l'endpoint existant). Coût ~0,5j confirmé.

### 8.1 Implémentation prévue

- Route `GET /api/n8n/personae/resolve-dm` : ajout du Query param `specialty_id: UUID | None = None`.
- `DmPersonaeResolver` (`app/services/personae/dm_resolver_service.py`) :
  - Si `specialty_id` **absent** → flow actuel intact (classification MCP via `_classify`).
  - Si `specialty_id` **présent** → **court-circuit du classifier** :
    1. Vérifier que la `Specialty` existe dans le tenant ET `is_active=true`.
    2. Vérifier que l'élève est **enrolled** sur cette `specialty_id` (réutilise `EnrollmentService.list_for_student()` livré en B2).
    3. Composer directement la réponse `resolved` avec cette Specialty.
    4. `pedagogical_context` (P4) est résolu déterministiquement sur la Specialty — inclus gratuitement dans la réponse.
- **Pas** de migration. **Pas** d'appel MCP supplémentaire (skip de `_classify` = économie LLM).
- Tenant-scoped strict, `extra="forbid"` côté schémas.

### 8.2 3 hypothèses tranchées par défaut (à confirmer plugin/n8n)

| # | Sujet | Décision back |
|---|-------|---------------|
| 1 | **`routing_method`** | nouvelle valeur **`"caller_choice"`** (l'utilisateur a cliqué un bouton, l'appelant a tranché). Visible dans audit/logs |
| 2 | **`routing_confidence`** | **`null`** (aucune classification effectuée, plus honnête que `1.0`) |
| 3 | **`specialty_id` invalide** | — UUID inexistant tenant ou Specialty `is_active=false` → **404 typed** `specialty_not_found`<br>— UUID existant + actif mais user pas enrolled → réponse normale `out_of_scope` + `subject_not_enrolled` (cohérent avec §7.3) |

### 8.3 Note rétrocompat

- Le param est **optionnel** (default `None`) → tous les appelants actuels (n8n workflow legacy + smoke tests B4) continuent de fonctionner sans modification.
- Le n8n workflow `DISCORD_-_DM_Resolve` doit être patché (cf. §4 du doc) **après** la livraison back pour que le re-resolve fonctionne — sinon le param sera ignoré par n8n même si présent dans le webhook plugin.
- Le plugin (§5) est déjà prêt.

### 8.4 Tests prévus (mirror §7 du doc)

1. DM sans `specialty_id` → `needs_clarification` (régression : comportement actuel intact)
2. DM avec `specialty_id` valide + user enrolled → `resolved` + `routing_method="caller_choice"` + `routing_confidence=null`
3. DM avec `specialty_id` valide + user **pas** enrolled → `out_of_scope` + `subject_not_enrolled`
4. DM avec `specialty_id` inconnu / inactif → 404 `specialty_not_found`
5. (régression) DM single-subject sans `specialty_id` → `resolved` avec `routing_method="single_subject"`
6. `pedagogical_context` inclus dans la réponse `resolved` quand la Specialty porte `pedagogical_extension` (régression P4)

### 8.5 Ship plan

- Sous-agent en background dès validation des 3 hypothèses §8.2.
- Branche `feature/rfc-095-resolve-dm-specialty-id`.
- PR contenant : extension route + résolveur + 6 tests + doc compagnon front (mise à jour du `docs/guides/RFC-095-API-CONTRACTS.md` §3.1 pour acter le nouveau param).
- **Pas de touche** aux autres tracks en cours.

**→ Plugin / n8n** : OK pour les 3 hypothèses §8.2 ? Si oui je lance ; livraison sous 24h, prête à câbler côté n8n dans la foulée.

---

## 9. Réponse n8n — 2026-05-28

**✅ OK pour les 3 hypothèses §8.2.**

| # | Hypothèse | Réponse n8n |
|---|-----------|-------------|
| 1 | `routing_method="caller_choice"` | ✅ OK — Utile pour audit/logs, n'affecte pas le workflow |
| 2 | `routing_confidence=null` | ✅ OK — Plus honnête que `1.0`, le workflow ne dépend pas de cette valeur |
| 3 | 404 `specialty_not_found` vs `out_of_scope` | ✅ OK — Distinction claire entre erreur technique (404) et résultat métier |

### 9.1 Modification workflow prévue

Le workflow `DISCORD_-_DM_Resolve` sera patché pour :

1. **Extraire `specialty_id`** du payload webhook (optionnel)
2. **Passer à l'API** si présent dans les query params
3. **Gérer le 404** `specialty_not_found` comme erreur (distinct du flow métier)

```
// Validate Input (ajout)
specialty_id: body.specialty_id || null,

// Resolve DM Personae (modification query params)
?user_id=U&question=Q&specialty_id={{ specialty_id si présent }}
```

### 9.2 Gestion des erreurs

| Code HTTP | Situation | Action workflow |
|-----------|-----------|-----------------|
| 200 + `resolved` | Personae trouvé | Dispatch chatbot-core |
| 200 + `needs_clarification` | Ambiguïté | Retourne candidates au plugin |
| 200 + `out_of_scope` | User pas inscrit | Retourne decline_reason au plugin |
| **404** | `specialty_id` invalide/inactif | **Erreur technique** → retourne au plugin avec code erreur |

### 9.3 Charge confirmée

**~0.25j** pour :
- Modification 2 nodes (Validate Input + Resolve DM Personae)
- Ajout branche 404 dans le switch
- Test des 4 cas (§7.2, 7.3, 7.4)

### 9.4 Dépendance

Le patch n8n sera livré **après** le merge backend (branche `feature/rfc-095-resolve-dm-specialty-id`).

**→ Backend** : Go pour lancer ! 🚀
