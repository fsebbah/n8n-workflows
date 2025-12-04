# Estimation de Charge - Équipe n8n

**Date:** 2025-12-04
**Version:** 1.0

---

## Résumé Exécutif

| Métrique | Valeur |
|----------|--------|
| **Total workflows à créer** | 85 |
| **Workflows Phase 1-2 (prioritaires)** | 11 |
| **Estimation Phase 1-2** | 3-5 jours |
| **Estimation totale** | 15-25 jours |

---

## Décomposition par Phase

### Phase 1 : Test & Validation (1 workflow)

| Workflow | Complexité | Effort | Notes |
|----------|------------|--------|-------|
| Test Echo | 🟢 Simple | 2h | Validation communication |

**Total Phase 1 :** 2h

---

### Phase 2 : Gmail (5 workflows)

| Workflow | Complexité | Effort | Notes |
|----------|------------|--------|-------|
| Gmail Analyze Daily | 🔴 Complexe | 4h | Loop + LLM + parsing |
| Gmail Read Email | 🟢 Simple | 1h | GET message |
| Gmail Send Email | 🟡 Moyen | 2h | POST + attachments |
| Gmail Search | 🟡 Moyen | 2h | Query builder |
| Gmail List Labels | 🟢 Simple | 1h | GET labels |

**Total Phase 2 :** 10h (~1.5 jours)

---

### Phase 3 : Drive (5 workflows)

| Workflow | Complexité | Effort | Notes |
|----------|------------|--------|-------|
| Drive List Files | 🟢 Simple | 1h | GET files |
| Drive Search Files | 🟡 Moyen | 2h | Query + filters |
| Drive Upload File | 🔴 Complexe | 4h | Multipart upload |
| Drive Download File | 🟡 Moyen | 2h | Binary handling |
| Drive Create Folder | 🟢 Simple | 1h | POST folder |

**Total Phase 3 :** 10h (~1.5 jours)

---

### Phase 4 : Calendar (5 workflows prioritaires)

| Workflow | Complexité | Effort | Notes |
|----------|------------|--------|-------|
| Calendar Create Event | 🟡 Moyen | 2h | POST event |
| Calendar List Events | 🟢 Simple | 1h | GET events |
| Calendar Update Event | 🟡 Moyen | 2h | PATCH event |
| Calendar Delete Event | 🟢 Simple | 1h | DELETE event |
| Calendar Free/Busy | 🟡 Moyen | 2h | freebusy query |

**Total Phase 4 :** 8h (~1 jour)

---

### Phase 5+ : Autres workflows (70+)

| Catégorie | Nb workflows | Effort estimé |
|-----------|--------------|---------------|
| Google Contacts | 2 | 3h |
| Audio/Vocal | 3 | 6h |
| Documents (PDF, DOCX) | 7 | 14h |
| LLM/AI | 6 | 6h |
| Research | 4 | 8h |
| Visual Media | 3 | 6h |
| Autres | 45 | 45h |

**Total Phase 5+ :** ~88h (~11-15 jours)

---

## Planning Proposé

```
Semaine 1
├── Jour 1-2: Phase 1 (Test) + Phase 2 (Gmail - 3 premiers)
├── Jour 3-4: Phase 2 (Gmail - fin) + Phase 3 (Drive - début)
└── Jour 5: Phase 3 (Drive - fin)

Semaine 2
├── Jour 1-2: Phase 4 (Calendar)
├── Jour 3-5: Phase 5 (Quick wins - nodes natifs)
└──

Semaine 3-4
└── Phase 5+ (workflows restants)
```

---

## Complexité par Type de Workflow

### 🟢 Simple (1-2h)
- GET simple (list, read)
- DELETE
- Pas de transformation de données

### 🟡 Moyen (2-3h)
- POST/PATCH avec body structuré
- Query parameters complexes
- Transformation de données basique

### 🔴 Complexe (4h+)
- Loop sur plusieurs items
- Upload/Download binaire
- Intégration LLM
- Parsing complexe (emails, PDF)

---

## Risques et Dépendances

### Risques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Token OAuth invalide | 🔴 Bloquant | Tests avec tokens réels |
| Timeout workflows longs | 🟡 Moyen | Pagination, limites |
| API rate limiting | 🟡 Moyen | Delays, retry logic |
| Format réponse non standard | 🟢 Faible | Validation avec MCP |

### Dépendances

1. **MCP Server** - Doit fournir tokens de test
2. **Environnement** - pi6.local doit être accessible
3. **Credentials LLM** - Pour workflows avec résumé

---

## Livrables par Phase

### Phase 1
- [ ] Workflow `test/echo` créé et testé
- [ ] Documentation input/output
- [ ] Validation avec équipe MCP

### Phase 2
- [ ] 5 workflows Gmail créés
- [ ] Tests avec tokens réels
- [ ] Documentation API Gmail

### Phase 3-4
- [ ] 10 workflows Drive/Calendar
- [ ] Tests end-to-end
- [ ] Métriques performance

### Phase 5+
- [ ] 70 workflows restants
- [ ] Documentation complète
- [ ] Runbook opérationnel

---

## Ressources Nécessaires

| Ressource | Besoin |
|-----------|--------|
| Accès n8n (pi6.local:5678) | ✅ Disponible |
| Tokens OAuth test | ⏳ À demander à MCP |
| Clé API OpenAI/Claude | ⏳ À clarifier |
| Documentation Gmail API | ✅ Disponible |

---

## Conclusion

**Recommandation :** Commencer par Phase 1-2 (Gmail) pour valider l'architecture, puis itérer.

| Phase | Effort | Livrable |
|-------|--------|----------|
| Phase 1-2 | 3-5 jours | 6 workflows Gmail + Test |
| Phase 3-4 | 3-4 jours | 10 workflows Drive/Calendar |
| Phase 5+ | 10-15 jours | 69 workflows restants |
| **Total** | **16-24 jours** | **85 workflows** |
