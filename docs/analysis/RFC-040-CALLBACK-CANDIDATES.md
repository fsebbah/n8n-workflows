# RFC-040 - Candidats au Pattern Callback

**Date**: 2026-03-16
**Analyse**: Workflows avec loops et/ou appels LLM nécessitant le pattern async callback

---

## Focus: Traduction, Image, Vidéo, Audio (hors Torah)

> Les workflows Torah-xxx sont généralement lancés depuis la CLI, donc exclus de cette analyse.

### 🔴 CALLBACK OBLIGATOIRE (7 workflows)

| Workflow | APIs | Loop | Temps estimé | Usage |
|----------|------|------|--------------|-------|
| **MCP - Speaker Identifier** | AssemblyAI | - | **~11 min** | Transcription audio |
| **MCP Veo Video** | Google AI (Veo) | - | ~2 min | Génération vidéo |
| **MCP - Transcriber** | Google AI | - | ~1.5 min | Transcription vidéo |
| **Recipes - YouTube** | Claude + Google AI | - | ~1.5 min | Extraction recettes YouTube |
| **Document Translate Worker** | Claude + Mistral | Loop Pages | ~1.5 min | Traduction documents |
| **Books Translation Worker** | Claude + GPT | Loop Verses | ~3 min | Traduction livres |
| **Books Commentary Worker** | Claude + GPT | Loop Comments | ~2 min | Commentaires livres |

### 🟠 CALLBACK RECOMMANDÉ (1 workflow)

| Workflow | APIs | Temps estimé | Usage |
|----------|------|--------------|-------|
| MCP - PDF Layout Translator | Claude + Mistral | ~40s | OCR + traduction PDF |

### 🟡 À SURVEILLER (6 workflows)

| Workflow | APIs | Temps estimé |
|----------|------|--------------|
| MCP - Documents Process | Claude + GPT + Mistral | ~17s |
| MCP - Image OCR | Mistral | ~16s |
| MCP - Table Extractor | Mistral | ~16s |
| MCP - Image Generator | DALL-E | ~15s |
| MCP - Google Drive OCR | Mistral | ~12s |
| MCP - Text to Speech | OpenAI TTS | ~5s |

---

## Résumé Exécutif (tous workflows)

| Catégorie | Count | Action |
|-----------|-------|--------|
| 🔴 CRITIQUE | 8 | Callback **obligatoire** |
| 🟠 ÉLEVÉ | 10 | Callback **recommandé** |
| 🟡 MOYEN | 6 | À surveiller |
| 🟢 FAIBLE | 30 | OK (synchrone) |

**Total workflows avec LLM/loops**: 54 sur 213 actifs

---

## 🔴 CRITIQUE - Callback Obligatoire (8 workflows)

Ces workflows combinent **loops + appels LLM** = temps d'exécution très long.

| Workflow | APIs LLM | Loops | Temps estimé | Notes |
|----------|----------|-------|--------------|-------|
| **Torah Translate Worker v2** | Claude | Loop Segments, Loop Chunks | ~20 min | Double boucle imbriquée |
| **Torah Translate Worker (v1)** | Claude, GPT | Loop Segments | ~6 min | Deprecated mais actif |
| **Books Commentary Worker** | Claude, GPT | Loop Commentaries | ~3.5 min | Batch commentaires |
| **Books Translation Worker** | Claude, GPT | Loop Verses | ~3.5 min | Batch versets |
| **Torah Translate Page Worker** | Claude, GPT | Loop Segments | ~3.5 min | Traduction par segment |
| **MCP - Tools Enricher** | Claude, GPT | Split Batches | ~3 min | Enrichissement outils |
| **MCP - Dataset Generator** | Claude, GPT | Loop Categories | ~2 min | ⚠️ **Ciblé par RFC-040** |
| **Document Translate Worker** | Claude | Loop Pages | ~1.5 min | Traduction documents |

### Architecture Callback Requise

```
Client → API → Celery → n8n webhook
                           ↓
                     [Loop + LLM processing]
                           ↓
                     HTTP POST callback_url
```

---

## 🟠 ÉLEVÉ - Callback Recommandé (10 workflows)

Workflows avec loops longs OU transcription audio.

| Workflow | APIs | Loops | Temps estimé | Notes |
|----------|------|-------|--------------|-------|
| COURSE---Expiration-Cron | - | 2 loops | ~50 min | Batch expirations |
| MCP - Bulk URL Processor | - | 2 loops | ~50 min | Traitement URLs |
| LEARNING - Badge Check | - | 1 loop | ~5 min | Vérification badges |
| Torah Batch Translation | - | 1 loop | ~5 min | Orchestrateur |
| Torah Router | - | 1 loop | ~5 min | Routage segments |
| Torah Translation Orchestrator | - | 1 loop | ~5 min | Orchestrateur |
| **MCP - Speaker Identifier** | AssemblyAI | - | ~3 min | Transcription audio |
| SUBSCRIPTION---Reconciliation | - | 1 loop | ~1.5 min | Réconciliation Stripe |
| Torah Vocalization (Nekudot) | GPT | 1 loop | ~50s | Vocalisation hébreu |
| Torah Discord Translation Pivot | Claude, GPT | - | ~34s | Double LLM |

---

## 🟡 MOYEN - À Surveiller (6 workflows)

Temps 10-30s. Peuvent timeout sur connexions lentes.

| Workflow | APIs LLM | Temps estimé |
|----------|----------|--------------|
| LLM - Web Search | Claude, GPT, Mistral | ~25s |
| Torah Translate Simple | Claude | ~24s |
| MCP - LLM Summarizer | Claude, GPT, Mistral | ~17s |
| LEARNING - Generate Worker | Claude | ~16s |
| MCP - Summarizer | Claude | ~16s |
| Recipes - Generate | Claude, GPT | ~13s |

---

## 🟢 FAIBLE - OK Synchrone (30 workflows)

Temps < 10s. Pattern request/response standard OK.

<details>
<summary>Voir la liste complète</summary>

| Workflow | APIs | Temps |
|----------|------|-------|
| MCP - Image Embedder | OpenAI | ~10s |
| MCP - Text Classifier | OpenAI | ~10s |
| SHOPPING---Product-Discovery | OpenAI | ~10s |
| Category Detect | Claude | ~8s |
| Document Structure Extract | Claude | ~8s |
| LEARNING - Evaluate Photo | Claude | ~8s |
| MCP - Documents Process | Claude | ~8s |
| MCP - LLM Intention | Claude | ~8s |
| Recipes - YouTube | Claude | ~8s |
| TORAH - Translate Chapter | Claude | ~8s |
| Torah Chunk Worker | Claude | ~8s |
| Torah Review and Validation | Claude | ~8s |
| MCP - Analyze Message | OpenAI | ~5s |
| MCP - Code Generator | OpenAI | ~5s |
| MCP - Entity Extractor | OpenAI | ~5s |
| MCP - Feedback Analyzer | OpenAI | ~5s |
| MCP - Image Generator | OpenAI | ~5s |
| MCP - Language Detector | OpenAI | ~5s |
| MCP Qdrant - Save | OpenAI | ~5s |
| MCP - Qdrant - Search | OpenAI | ~5s |
| MCP - Quiz Generator | OpenAI | ~5s |
| MCP - Syllabus Generator | OpenAI | ~5s |
| MCP - Text Embedder | OpenAI | ~5s |
| MCP - Text Generator | OpenAI | ~5s |
| MCP - Text to Speech | OpenAI | ~5s |
| MCP - qdrant - Similar | OpenAI | ~5s |
| MCP - Google Drive OCR | Mistral | ~4s |
| MCP - Image OCR | Mistral | ~4s |
| MCP - PDF Layout Translator | Mistral | ~4s |
| MCP - Table Extractor | Mistral | ~4s |

</details>

---

## Plan d'Implémentation Suggéré

### Phase 1 - RFC-040 (En cours)
- [x] Analyse des candidats
- [ ] **MCP - Dataset Generator** - Premier workflow avec callback

### Phase 2 - MCP Tools Critiques
- [ ] MCP - Tools Enricher
- [ ] MCP - Speaker Identifier
- [ ] MCP - Bulk URL Processor

### Phase 3 - Torah Workers
- [ ] Torah Translate Worker v2
- [ ] Torah Translate Page Worker
- [ ] Books Translation Worker
- [ ] Books Commentary Worker

### Phase 4 - Orchestrateurs
- [ ] Torah Translation Orchestrator
- [ ] Torah Batch Translation
- [ ] Document Translate Worker

---

## Notes Techniques

### Temps de Calcul Estimé

Les estimations sont basées sur :
- Claude API : ~8s par appel
- OpenAI API : ~5s par appel
- Mistral API : ~4s par appel
- AssemblyAI : ~60s par minute audio
- Loops : multiplicateur x5-10 selon batch size

### Critères de Sélection

Un workflow nécessite le pattern callback si :
1. **Loop + LLM** = Multiplicateur de temps
2. **Temps total > 30s** = Risque de timeout
3. **Transcription audio** = Toujours asynchrone
4. **Appels LLM multiples** = Cumul des latences

---

## Références

- [RFC-040: Training Dataset API](../rfc/RFC-040-TRAINING-DATASET-APIV2.md)
- [Pattern Callback n8n](../guides/n8n-callback-pattern.md) (à créer)
