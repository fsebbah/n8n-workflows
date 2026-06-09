# Demandes Front → MCP server

**Émetteur** : Équipe Frontend 2 (Claude)
**Date** : 2026-06-05
**Statut** : 📤 à transmettre
**Issue front meta** : [#2300 Planification équipes Frontend](https://github.com/fsebbah/azy.front/issues/2300)

---

## Périmètre MCP (rappel)

Le MCP server exécute les **Skills Claude** (RFC-085 — définitions déclaratives YAML) et expose les **tools** bas niveau (pdf_extract, ocr, gmail_send, etc.). L'orchestration multi-LLM et les workflows sont côté **n8n** (cf. `REQUESTS-N8N.md`).

---

## 1. Skills Claude pour Correction de copies (RFC-099 §5.3)

**Demande** : créer 6 Skills Claude réutilisables (format RFC-085 YAML/Markdown).

| Skill | Description | LLM type attendu | Tools nécessaires |
|---|---|---|---|
| `extract_rubric` | Extrait critères évaluation depuis sujet + corrigé modèle | text + vision (Claude Sonnet/Opus) | `pdf_extract`, `claude_vision_analyze` |
| `ingest_submission` | OCR copie scannée → texte structuré + identification questions | vision (Claude Opus pour précision) | `image_ocr`, `claude_vision_analyze` |
| `split_responses` | Segmente la copie par question selon la rubric | text | `text_segmentation`, `regex_match` |
| `compare_responses` | Compare réponse élève vs réponse attendue, par question | text (Claude Sonnet) | `text_similarity`, `claude_reasoning` |
| `evaluate_score` | Note + critères structurés selon rubric | text | `rubric_apply`, `score_aggregate` |
| `compose_feedback` | Génère feedback pédagogique en français avec ton persona (RFC-081) | text (Sonnet/Opus + persona prompt) | `persona_prompt_inject`, `markdown_format` |

**Issue front liée** : [#2297](https://github.com/fsebbah/azy.front/issues/2297) (Phase 1 grading)

---

## 2. Tools bas niveau à exposer (pour les skills ci-dessus)

| Tool | Description |
|---|---|
| `pdf_extract` | Extrait texte d'un PDF (avec layout + tableaux) |
| `image_ocr` | OCR sur image (incluant écriture manuscrite) |
| `claude_vision_analyze` | Wrapper d'appel vision LLM avec output structuré |
| `text_segmentation` | Découpe un texte selon une structure attendue |
| `score_aggregate` | Agrège scores selon rubric pondérée |
| `persona_prompt_inject` | Injecte un persona enseignant (RFC-081) dans un prompt LLM |
| `markdown_format` | Formate un texte en markdown structuré |

Plusieurs de ces tools existent peut-être déjà — à confirmer.

---

## 3. Skills Claude pour Bug report user (#2295 + #2296)

**Demande** : 1 Skill Claude pour analyser un bug report et produire une issue GitHub structurée.

| Skill | Description | Tools nécessaires |
|---|---|---|
| `analyze_user_bug` | Reçoit screenshot + console + métadonnées → identifie type de bug, sévérité, composant impacté, propose un titre + body markdown formaté pour issue GitHub | `image_analyze`, `text_classify`, `markdown_format` |

---

## 4. Catalogue Skills exposé côté API (RFC-101 §11.1)

Le front a besoin d'un catalogue exposé pour brancher la vue Orchestrators v2 (catalogue multi-sources Anthropic + local + tenant).

**Demande** :
- Maintenir le catalogue Skills (Anthropic + custom internes Azy)
- Exposer via endpoint chat.api `GET /api/skills/catalog/anthropic` (chat.api proxy MCP)
- Shape : aligné RFC-101 §11.1 (id, name, description, source, category, default_model, allowed_modalities, inputs, outputs)

---

## 5. Suivi des travaux / RFC-100 (anticipé)

À prévoir 3 Skills Claude pour Phase 2 :
- `extract_competencies` (depuis une rubric ou un cours)
- `aggregate_progress` (cumule scores par compétence sur un historique)
- `recommend_next_steps` (suggère exercices ciblés selon points faibles)

**Issue front liée** : [#2294](https://github.com/fsebbah/azy.front/issues/2294)

---

## Format de réponse attendu

Pour chaque skill / tool, merci d'indiquer :
- ✅ Existe déjà (path skill MCP)
- 🔧 À créer — effort estimé
- ❓ Besoin de précisions
- ❌ Hors scope MCP (rediriger vers n8n / chat.api)

Les Skills Claude créés peuvent être versionnés dans `mcp-server/skills/` selon votre convention. Format YAML frontmatter aligné repo `anthropics/skills`.
