# Demandes Front → Back chat.api

**Émetteur** : Équipe Frontend 2 (Claude)
**Date** : 2026-06-05
**Statut** : 📤 à transmettre
**Issue front meta** : [#2300 Planification équipes Frontend](https://github.com/fsebbah/azy.front/issues/2300)

---

## 1. Bug report user — endpoint + worker

**Contexte** : réactivation du chantier `bug report user` (cf. specs `docs/issues/2026-06-01-bug-report-user-spec.md` + `2026-06-01-bug-report-back-spec.md`).

**Demande** :
- `POST /api/bug-reports` : reçoit screenshot DOM (base64) + console buffer + métadonnées (URL, user, tenant, viewport, route)
- Worker async (Celery) qui invoque un agent Claude pour analyser le bug → créer une issue GitHub (label `bug-from-user`) → retourner `issue_url` et `status`
- WebSocket push : notifier le user quand l'issue GitHub a été créée
- Vue admin endpoints : `GET /api/bug-reports` (liste + filtres sévérité/état/période) + `GET /api/bug-reports/{id}` (détail)

**Issues front liées** : [#2295](https://github.com/fsebbah/azy.front/issues/2295) (E1 capture) + [#2296](https://github.com/fsebbah/azy.front/issues/2296) (E2 form/API/admin)

**Effort estimé back** : à votre cadrage

---

## 2. Endpoints Correction de copies (RFC-099 §6)

**Contexte** : Phase 1 du module Correction de copies. Voir la RFC pour le shape complet.

**Demande — Contrôles** :
- `POST/GET/PATCH /api/grading/controls`
- `POST /api/grading/controls/{id}/subject` (multipart PDF)
- `POST /api/grading/controls/{id}/reference` (multipart PDF)
- `POST /api/grading/controls/{id}/rubric` (JSON ou PDF)
- `GET /api/grading/controls/{id}/grading-progress` (compteurs)

**Demande — Soumissions** :
- `POST /api/grading/submissions` (multipart photo + control_id + student_id) → `202 + execution_id`
- `GET /api/grading/submissions/{id}` → état + résultats si dispo
- `POST /api/grading/submissions/{id}/validate` (action approve/reject)
- `POST /api/grading/submissions/{id}/publish` → publication vers Discord
- `GET /api/grading/submissions/{id}/annotated-pdf` → signed URL Backblaze

**Demande — Endpoints mobile optimisés** (RFC-099 §6.3) :
- `/api/grading/mobile/controls` (paginé + ETag)
- `/api/grading/mobile/controls/{id}/students` (statut par élève)
- `/api/grading/mobile/submissions/upload` (multipart optimisé compression + retry)
- `/api/grading/mobile/sync-queue` (reprise uploads après offline)

**Tables PostgreSQL** : 5 tables `gradings_*` (cf. RFC-099 §5.2)

**Storage Backblaze B2** : bucket `azy-grading-{tenant_id}` (région EU), structure §5.1, signed URLs, retention 5 ans configurable, RGPD.

**Workflow async** : queue Celery `execute_grading_pipeline(submission_id)` qui appelle le MCP server. WebSocket push à chaque transition de statut.

**Issue front liée** : [#2297](https://github.com/fsebbah/azy.front/issues/2297)

**Effort estimé back** : ~10-12j (RFC-099 §13.1)

---

## 3. Endpoints Orchestrators v2 (RFC-101 §11.2)

**Contexte** : POC v2 livré côté front (PR #2289 + #2290). Maintenant attente du back pour brancher.

**Demande — CRUD** :
- `POST /api/orchestrators/v2/save` (body : `OrchestratorV2Draft` — RFC-101 §11.2)
- `GET /api/orchestrators/v2/{id}` + `PATCH` + `DELETE`
- `GET /api/orchestrators/v2` (liste + filtres search/limit/status)

**Demande — Exécution** :
- `POST /api/orchestrators/v2/{id}/execute` → `202 + execution_id`
- `GET /api/orchestrators/v2/executions/{exec_id}` → état + outputs
- WS `/api/orchestrators/v2/executions/{exec_id}/logs` → stream temps réel

**Demande — Validation** :
- Sur erreur modalité LLM incompatible avec skill : retour `400 model_modality_mismatch` + liste modèles compatibles (cf. RFC-101 §10.6)
- Tolérer champs supplémentaires (extras) dans le payload

**Issue front liée** : (mentionnée dans #2300 §5.2)

---

## 4. Endpoints catalogue Personae

**Contexte** : Cards Personae catalogue browsable.

**Demande** :
- `GET /api/personae/catalog/public` (vetted, accessible tous tenants)
- `GET /api/personae/catalog/tenant` (partagés dans le tenant, RBAC `personae:read`)
- `POST /api/personae/{id}/adopt` → clone le persona vers le user appelant

**Issue front liée** : [#2298](https://github.com/fsebbah/azy.front/issues/2298) — actuellement bloquée

---

## 5. Endpoints catalogues skills (RFC-101 §11.1)

**Contexte** : élargir le catalogue front (actuellement 17 Anthropic Skills statiques) avec sources multiples.

**Demande** :
- `GET /api/skills/catalog/anthropic` (optionnel — front a JSON statique)
- `GET /api/skills/catalog/tenant` (skills publiés par le tenant, RBAC)
- `GET /api/skills/catalog/local` (proxy vers Azy Local Agent — RFC-085 §3)
- `GET /api/skills/catalog/community` (futur, marketplace)

**Shape commun** : aligné RFC-101 §11.1 (id, name, description, source, category, icon, default_model, allowed_modalities, inputs, outputs).

**Issue front liée** : (mentionnée dans #2300)

**Priorité** : `tenant` + `local` en Phase 2 ; `community` en Phase 3.

---

## 6. RFC-100 — Suivi des travaux et progression élèves (à cadrer)

**Contexte** : RFC-100 en rédaction côté front (E2). Endpoints back à définir une fois la RFC validée.

**Anticipé** :
- Tables `student_progress_*` (compétences vues, scores agrégés, alertes)
- Endpoints CRUD + endpoints aggregations niveau classe / élève / cohorte
- Webhook Discord pour récap périodique

**Issue front liée** : [#2294](https://github.com/fsebbah/azy.front/issues/2294)

**Effort estimé back** : ~5-7j (à confirmer après RFC validée)

---

## Format de réponse attendu

Pour chaque demande, merci d'indiquer :
- ✅ Pris en charge — date estimée
- ⏳ Pris en compte — à planifier
- ❓ Besoin de précisions (lesquelles)
- ❌ Hors scope ou refusé (motif)

Les réponses peuvent être ajoutées en commentaire sur les issues front correspondantes ou directement dans ce doc en PR.
