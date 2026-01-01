# Unification de l'architecture de traduction Torah

**Date** : 2026-01-01
**Statut** : Proposition
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
│       ├──► POST /api/jobs (crée job)                            │
│       │    - type: "single" | "page"                            │
│       │    - segments: [...]                                    │
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

---

## 3. Phases de développement

### Phase 1 : Préparation API
**Durée estimée** : À définir par l'équipe API

- Modifier le endpoint `POST /api/jobs` pour supporter les traductions unitaires
- Modifier le endpoint `PATCH /api/jobs/{id}` pour accepter le format `tokens`
- Modifier le endpoint `GET /api/jobs/{id}` pour retourner `tokens`

### Phase 2 : Worker unifié (n8n)
**Durée estimée** : À définir par l'équipe n8n

- Créer `torah-translate-worker` (nouveau worker unifié)
- Intégrer la logique pivot dans le worker
- Supprimer `torah-discord-translate-pivot`
- Modifier `torah-discord-translate` pour utiliser le nouveau flux

### Phase 3 : Adaptation Bot
**Durée estimée** : À définir par l'équipe Bot

- Modifier le bot pour toujours utiliser le flux asynchrone
- Implémenter le polling pour toutes les traductions
- Afficher les tokens dans Discord

### Phase 4 : Nettoyage
- Supprimer les anciens workflows
- Mettre à jour la documentation

---

## 4. Spécifications équipe API

### 4.1 Modification `POST /api/jobs`

**Nouveau champ requis :**

| Champ | Type | Description |
|-------|------|-------------|
| `type` | string | `"single"` ou `"page"` |
| `segments` | array | Liste des textes à traduire (1 pour single, N pour page) |

**Exemple requête (traduction unitaire) :**
```json
{
  "type": "single",
  "traite": "Berakhot",
  "page": "2a",
  "commentator": "Rashi",
  "target_language": "fr",
  "segments": ["texte du commentaire à traduire"]
}
```

**Exemple requête (traduction page) :**
```json
{
  "type": "page",
  "traite": "Sukkah",
  "page": "47a",
  "target_language": "fr",
  "segments": ["segment 1", "segment 2", "...", "segment 12"]
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
  "type": "single",
  "status": "completed",
  "traite": "Berakhot",
  "page": "2a",
  "commentator": "Rashi",
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
  "translations": [
    {
      "segment_index": 0,
      "translated_text": "...",
      "status": "approved"
    }
  ]
}
```

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
job_id = response.json()["job_id"]

# Polling
while True:
    status = requests.get(f"/webhook/torah-job-status?job_id={job_id}")
    if status.json()["status"] == "completed":
        break
    await asyncio.sleep(2)

translation = status.json()["translations"][0]["translated_text"]
tokens = status.json()["tokens"]
```

### 5.2 Affichage des tokens

**Format suggéré pour Discord :**
```
📊 Tokens utilisés:
├─ Claude: 4,200 (in: 1,800 / out: 2,400)
├─ GPT-4o: 4,800 (in: 3,600 / out: 1,200)
└─ Total: 9,000
```

### 5.3 Gestion du polling

| Paramètre | Valeur suggérée |
|-----------|-----------------|
| Intervalle initial | 1 seconde |
| Intervalle max | 5 secondes |
| Timeout global | 120 secondes |
| Backoff | Exponentiel (×1.5) |

### 5.4 Messages utilisateur

| État | Message Discord |
|------|-----------------|
| Job créé | "⏳ Traduction en cours..." |
| En progression | "⏳ Traduction: 5/12 segments (42%)" |
| Terminé | "✅ Traduction terminée (8.5s, 9,000 tokens)" |
| Erreur | "❌ Erreur: [message]" |

---

## 6. Spécifications équipe n8n

### 6.1 Nouveau worker unifié

**Nom** : `torah-translate-worker`

**Logique :**
```
1. Recevoir job_id + segments
2. Pour chaque segment:
   a. Déterminer si pivot nécessaire (source ≠ 'en' AND target ≠ 'en')
   b. Si pivot:
      - Claude: source → en
      - Claude: en → target
   c. Si direct:
      - Claude: source → target
   d. GPT vérifie
   e. POST /api/translations/save
   f. PATCH /api/jobs (progress + tokens)
3. PATCH /api/jobs (status: completed)
```

### 6.2 Workflows à supprimer

- `torah-discord-translate-pivot` (logique intégrée au worker)
- `torah-translate-page-worker` (remplacé par worker unifié)

### 6.3 Workflows à modifier

- `torah-discord-translate` : devient orchestrateur simple (crée job + appelle worker)
- `torah-translate-page` : peut être fusionné avec `torah-discord-translate`

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
- [ ] `POST /api/jobs` supporte `type: "single"`
- [ ] `PATCH /api/jobs/{id}` accepte `tokens: { claude, gpt, total }`
- [ ] `GET /api/jobs/{id}` retourne `tokens` et `translations`
- [ ] Tests unitaires mis à jour

### n8n
- [ ] Worker unifié créé avec logique pivot
- [ ] `torah-discord-translate` modifié (orchestrateur)
- [ ] Tests manuels effectués
- [ ] Anciens workflows désactivés

### Bot
- [ ] Flux asynchrone implémenté pour toutes les traductions
- [ ] Polling implémenté
- [ ] Affichage tokens dans Discord
- [ ] Tests effectués

---

## 9. Questions ouvertes

1. Faut-il garder une option "synchrone" pour les cas simples ?
2. Quelle durée de rétention pour les jobs terminés ?
3. Faut-il notifier le bot via webhook au lieu du polling ?
