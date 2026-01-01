# Unification de l'architecture de traduction Torah

**Date** : 2026-01-01
**Statut** : Validé (après discussion API + Bot + n8n)
**Impact** : API, Bot, n8n

---

## 1. Contexte

Actuellement, deux architectures coexistent pour les traductions :

### Architecture actuelle

```
┌─────────────────────────────────────────────────────────────────┐
│ FLUX 1 : Traduction unitaire (commentaire, texte libre)        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Bot Discord                                                    │
│       │                                                         │
│       ▼                                                         │
│  torah-discord-translate ──► torah-discord-translate-pivot     │
│       │                              │                          │
│       └──────────────┬───────────────┘                          │
│                      ▼                                          │
│          POST /api/translations/save                            │
│                      │                                          │
│                      ▼                                          │
│          Réponse SYNCHRONE au bot                               │
│          (attente 5-15 secondes)                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ FLUX 2 : Traduction de page (12+ segments)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Bot Discord                                                    │
│       │                                                         │
│       ▼                                                         │
│  torah-translate-page (orchestrateur)                           │
│       │                                                         │
│       ├──► POST /api/jobs (crée job)                            │
│       │                                                         │
│       ├──► Appelle torah-translate-page-worker (async)          │
│       │                                                         │
│       ▼                                                         │
│  Réponse IMMÉDIATE { job_id }                                   │
│                                                                 │
│       (en arrière-plan)                                         │
│       │                                                         │
│       ▼                                                         │
│  WORKER : boucle sur segments                                   │
│       │                                                         │
│       ├──► Claude traduit                                       │
│       ├──► GPT vérifie                                          │
│       ├──► POST /api/translations/save                          │
│       └──► PATCH /api/jobs (progress + tokens)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Problèmes identifiés

| Problème | Impact |
|----------|--------|
| Deux flux différents | Maintenance complexe |
| Format tokens incohérent | API doit gérer 2 formats |
| Logique pivot dupliquée | Risque de divergence |
| Traduction unitaire synchrone | Timeout possible si lent |
| Pas de suivi pour traductions unitaires | Pas de retry possible |

---

## 2. Architecture cible

### Flux unifié

```
┌─────────────────────────────────────────────────────────────────┐
│ FLUX UNIQUE : Toutes les traductions                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Bot Discord                                                    │
│       │                                                         │
│       ▼                                                         │
│  torah-discord-translate (point d'entrée unique)                │
│       │                                                         │
│       ├──► Vérifie CACHE                                        │
│       │    └─► Si cache hit → réponse immédiate (pas de job)    │
│       │                                                         │
│       ├──► POST /api/jobs (crée job)                            │
│       │    - job_type: "unit_translation" | "page_translation"  │
│       │    - segments_count: N                                  │
│       │                                                         │
│       ├──► Appelle torah-translate-worker (async)               │
│       │                                                         │
│       ▼                                                         │
│  Réponse IMMÉDIATE { job_id }                                   │
│                                                                 │
│       (en arrière-plan)                                         │
│       │                                                         │
│       ▼                                                         │
│  WORKER UNIFIÉ                                                  │
│       │                                                         │
│       ├──► Détecte si pivot nécessaire                          │
│       │    (source ≠ 'en' AND target ≠ 'en')                    │
│       │                                                         │
│       ├──► Si pivot:                                            │
│       │    - Claude: source → en                                │
│       │    - Claude: en → target                                │
│       │                                                         │
│       ├──► Si direct:                                           │
│       │    - Claude: source → target                            │
│       │                                                         │
│       ├──► GPT vérifie                                          │
│       │                                                         │
│       ├──► POST /api/translations/save                          │
│       │                                                         │
│       └──► PATCH /api/jobs                                      │
│            - status: completed                                  │
│            - tokens: { claude, gpt, total }                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Avantages

| Avantage | Description |
|----------|-------------|
| Architecture unique | Un seul flux à maintenir |
| Format tokens unifié | `{ claude: {...}, gpt: {...}, total: {...} }` |
| Logique pivot centralisée | Dans le worker uniquement |
| Toujours asynchrone | Pas de timeout |
| Suivi universel | Toutes les traductions ont un job_id |
| Retry possible | Si erreur, on peut reprendre |
| Cache optimisé | Réponse immédiate si déjà traduit |

---

## 3. Phases de développement

### Phase 1 : Préparation API

- Modifier le endpoint `POST /api/jobs` pour supporter `job_type: "unit_translation"`
- Modifier le endpoint `PATCH /api/jobs/{id}` pour accepter le format `tokens`
- Modifier le endpoint `GET /api/jobs/{id}` pour retourner `tokens`

### Phase 2 : Worker unifié (n8n)

- Créer `torah-translate-worker` (nouveau worker unifié)
- Intégrer la logique pivot dans le worker
- Supprimer `torah-discord-translate-pivot`
- Modifier `torah-discord-translate` pour utiliser le nouveau flux

### Phase 3 : Adaptation Bot

- Modifier le bot pour toujours utiliser le flux asynchrone
- Implémenter le polling pour toutes les traductions
- Afficher les tokens dans Discord
- Gérer les cas de désaccord Claude/GPT

### Phase 4 : Nettoyage

- Supprimer les anciens workflows
- Mettre à jour la documentation

---

## 4. Spécifications équipe API

### 4.1 Modification `POST /api/jobs`

**Champs :**

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `job_type` | string | Oui | `"unit_translation"` ou `"page_translation"` |
| `traite` | string | Oui | Nom du traité |
| `page` | string | Oui | Référence de la page |
| `target_language` | string | Oui | Code langue cible (fr, en, es...) |
| `segments_count` | number | Oui | Nombre de segments à traduire |
| `metadata` | object | Non | Données contextuelles optionnelles |

**Exemple requête (traduction unitaire) :**
```json
{
  "job_type": "unit_translation",
  "traite": "Berakhot",
  "page": "2a",
  "target_language": "fr",
  "segments_count": 1,
  "metadata": {
    "commentator": "Rashi",
    "text_type": "commentary"
  }
}
```

**Exemple requête (traduction page) :**
```json
{
  "job_type": "page_translation",
  "traite": "Sukkah",
  "page": "47a",
  "target_language": "fr",
  "segments_count": 12
}
```

### 4.2 Modification `PATCH /api/jobs/{id}`

**Nouveau format du champ `tokens` :**

```json
{
  "status": "in_progress",
  "current_segment": 5,
  "translations_saved": 5,
  "tokens": {
    "claude": {
      "input_tokens": 150,
      "output_tokens": 200,
      "total_tokens": 350
    },
    "gpt": {
      "input_tokens": 300,
      "output_tokens": 100,
      "total_tokens": 400
    },
    "total": {
      "input_tokens": 450,
      "output_tokens": 300,
      "total_tokens": 750
    }
  }
}
```

**Comportement attendu :**
- Accumuler les tokens à chaque mise à jour
- `claude.input_tokens += payload.tokens.claude.input_tokens`
- Idem pour tous les champs

### 4.3 Modification `GET /api/jobs/{id}`

**Réponse attendue (job terminé) :**

```json
{
  "job_id": "job_abc123",
  "job_type": "unit_translation",
  "status": "completed",
  "traite": "Berakhot",
  "page": "2a",
  "target_language": "fr",
  "progress": {
    "current": 1,
    "total": 1,
    "percentage": 100
  },
  "duration_seconds": 8,
  "tokens": {
    "claude": {
      "input_tokens": 1800,
      "output_tokens": 2400,
      "total_tokens": 4200
    },
    "gpt": {
      "input_tokens": 3600,
      "output_tokens": 1200,
      "total_tokens": 4800
    },
    "total": {
      "input_tokens": 5400,
      "output_tokens": 3600,
      "total_tokens": 9000
    }
  },
  "metadata": {
    "commentator": "Rashi",
    "text_type": "commentary"
  }
}
```

**Note** : Le champ `translations[]` n'est PAS inclus dans la réponse du job. Les traductions sont récupérées via un endpoint dédié si nécessaire.

---

## 5. Spécifications équipe Bot

### 5.1 Modification du flux de traduction

**Avant :**
```python
# Traduction unitaire (synchrone)
response = requests.post("/webhook/torah-discord-translate", data={...})
translation = response.json()["translation"]["final"]
```

**Après :**
```python
# Toutes les traductions (asynchrone)
response = requests.post("/webhook/torah-discord-translate", data={...})
data = response.json()

# Cas 1: Cache hit (réponse immédiate)
if data.get("cached"):
    translation = data["translation"]["final"]
    return translation

# Cas 2: Nouvelle traduction (polling)
job_id = data["job_id"]
while True:
    status = requests.get(f"/webhook/torah-job-status?job_id={job_id}")
    if status.json()["status"] == "completed":
        break
    await asyncio.sleep(2)  # 2s fixe pour unitaire

# Récupérer la traduction finale
final = requests.get(f"/webhook/torah-translation-result?job_id={job_id}")
translation = final.json()["translation"]["final"]
tokens = final.json()["tokens"]
```

### 5.2 Gestion du cache

| Situation | Réponse n8n | Action Bot |
|-----------|-------------|------------|
| Cache hit | `{ "cached": true, "translation": {...} }` | Afficher immédiatement |
| Cache miss | `{ "job_id": "...", "cached": false }` | Démarrer polling |

**Format cache hit :**
```json
{
  "success": true,
  "cached": true,
  "translation": {
    "original": "טקסט מקורי",
    "final": "Texte traduit depuis le cache",
    "source_language": "he",
    "target_language": "fr"
  },
  "tokens": null
}
```

Affichage suggéré : "📦 Traduction depuis le cache"

### 5.3 Gestion des désaccords Claude/GPT

Si `confidence < 0.9`, n8n renvoie `requires_vote: true` :

```json
{
  "success": true,
  "job_id": "job_abc123",
  "translation": {
    "original": "טקסט מקורי",
    "final": null,
    "claude_translation": "Traduction proposée par Claude",
    "gpt_suggestion": "Suggestion alternative de GPT",
    "source_language": "he",
    "target_language": "fr"
  },
  "verification": {
    "approved": false,
    "confidence": 0.75,
    "notes": "Désaccord sur l'interprétation de...",
    "issues": ["ambiguity"]
  },
  "requires_vote": true
}
```

**Action Bot** : Afficher les 2 traductions + boutons de vote (comportement existant conservé).

**Endpoint votes** : Les votes sont envoyés à l'API (`/api/translations/{id}/vote`), pas à n8n.

### 5.4 Gestion du polling

**Traduction unitaire (~5-15s) :**

| Paramètre | Valeur |
|-----------|--------|
| Intervalle | 2 secondes (fixe) |
| Timeout global | 60 secondes |

**Traduction de page (>60s) :**

| Paramètre | Valeur |
|-----------|--------|
| Intervalle initial | 1 seconde |
| Backoff | ×1.5 |
| Intervalle max | 5 secondes |
| Timeout global | 300 secondes |

### 5.5 Affichage des tokens

**Format suggéré pour Discord :**
```
📊 Tokens utilisés:
├─ Claude: 4,200 (in: 1,800 / out: 2,400)
├─ GPT-4o: 4,800 (in: 3,600 / out: 1,200)
└─ Total: 9,000
```

**Règle** : Si `tokens === null` (cache hit), ne pas afficher cette section.

### 5.6 Messages utilisateur

| État | Message Discord |
|------|-----------------|
| Cache hit | "📦 Traduction depuis le cache" |
| Job créé | "⏳ Traduction en cours..." |
| En progression | "⏳ Traduction: 5/12 segments (42%)" |
| Terminé | "✅ Traduction terminée (8.5s, 9,000 tokens)" |
| Désaccord | "⚖️ Désaccord - Choisissez une traduction:" |
| Erreur | "❌ Erreur: [message]" |

---

## 6. Spécifications équipe n8n

### 6.1 Nouveau worker unifié

**Nom** : `torah-translate-worker`

**Logique :**
```
1. Recevoir job_id + données de traduction
2. Pour chaque segment:
   a. Vérifier le cache
      - Si cache hit: retourner immédiatement
   b. Déterminer si pivot nécessaire (source ≠ 'en' AND target ≠ 'en')
   c. Si pivot:
      - Claude: source → en
      - Claude: en → target
   d. Si direct:
      - Claude: source → target
   e. GPT vérifie
   f. Si confidence >= 0.9:
      - POST /api/translations/save
   g. Si confidence < 0.9:
      - Marquer requires_vote = true
   h. PATCH /api/jobs (progress + tokens)
3. PATCH /api/jobs (status: completed)
4. Retourner résultat final au webhook appelant
```

### 6.2 Format de réponse finale (retournée au Bot)

**Traduction approuvée :**
```json
{
  "success": true,
  "job_id": "job_abc123",
  "translation": {
    "original": "טקסט מקורי",
    "final": "Texte traduit final",
    "source_language": "he",
    "target_language": "fr",
    "intermediate_en": "English intermediate text",
    "pivot_used": true
  },
  "verification": {
    "approved": true,
    "confidence": 0.95,
    "notes": "...",
    "issues": []
  },
  "tokens": {
    "claude": { "input_tokens": 150, "output_tokens": 200, "total_tokens": 350 },
    "gpt": { "input_tokens": 300, "output_tokens": 100, "total_tokens": 400 },
    "total": { "input_tokens": 450, "output_tokens": 300, "total_tokens": 750 }
  },
  "requires_vote": false
}
```

### 6.3 Workflows à supprimer

- `torah-discord-translate-pivot` (logique intégrée au worker)
- `torah-translate-page-worker` (remplacé par worker unifié)

### 6.4 Workflows à modifier

- `torah-discord-translate` : devient orchestrateur simple (vérifie cache + crée job + appelle worker)
- `torah-translate-page` : fusionné avec `torah-discord-translate`

---

## 7. Migration

### Étapes de migration

1. **Déployer API** avec nouveaux endpoints (rétrocompatible)
2. **Déployer worker unifié** (en parallèle des anciens)
3. **Tester** avec quelques traductions
4. **Basculer le bot** vers le nouveau flux
5. **Supprimer** les anciens workflows

### Rollback

En cas de problème :
- Le bot peut revenir à l'ancien flux (endpoints toujours disponibles)
- Les anciens workflows restent actifs pendant la période de transition

---

## 8. Checklist

### API
- [ ] `POST /api/jobs` supporte `job_type: "unit_translation"`
- [ ] `POST /api/jobs` accepte `metadata` optionnel
- [ ] `PATCH /api/jobs/{id}` accepte `tokens: { claude, gpt, total }`
- [ ] `GET /api/jobs/{id}` retourne `tokens` (sans `translations[]`)
- [ ] Tests unitaires mis à jour

### n8n
- [ ] Worker unifié créé avec logique pivot
- [ ] Gestion du cache dans l'orchestrateur
- [ ] `torah-discord-translate` modifié (orchestrateur)
- [ ] Format réponse finale avec `requires_vote`
- [ ] Tests manuels effectués
- [ ] Anciens workflows désactivés

### Bot
- [ ] Gestion cache hit (réponse immédiate)
- [ ] Flux asynchrone implémenté pour toutes les traductions
- [ ] Polling implémenté (2s fixe unitaire, backoff pages)
- [ ] Affichage tokens dans Discord
- [ ] Gestion `requires_vote` pour désaccords
- [ ] Tests effectués

---

## 9. Décisions prises

| Question | Décision | Justification |
|----------|----------|---------------|
| Option synchrone ? | Non | Complexité de maintenance |
| Rétention jobs ? | 7 jours | Suffisant pour debug |
| Webhook vs polling ? | Polling (v1) | Plus simple à implémenter |
| `type` vs `job_type` ? | `job_type` | Évite mot réservé |
| Segments texte ou count ? | `segments_count` | n8n gère les textes |
| `translations[]` dans job ? | Non | Évite duplication |
| `commentator` ? | Dans `metadata` | Optionnel et flexible |
