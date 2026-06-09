# Demandes Front → n8n

**Émetteur** : Équipe Frontend 2 (Claude)
**Date** : 2026-06-05
**Statut** : 📤 à transmettre
**Issue front meta** : [#2300 Planification équipes Frontend](https://github.com/fsebbah/azy.front/issues/2300)

---

## Périmètre n8n (rappel — clarification du 2026-06-05)

n8n est l'**orchestrateur de workflows et dispatch multi-LLM** (Claude, OpenAI, Gemini, Ollama) avec fallback automatique. Il gère les automations cross-services et le routage intelligent vers les LLM.

> ⚠ Auparavant, on avait évoqué ces responsabilités côté MCP server (RFC-101 §4-§5). Correction : c'est n8n qui gère ce périmètre.

---

## 1. Pipeline orchestrators v2 — exécution (RFC-101)

**Contexte** : POC orchestrators v2 livré côté front (PR #2289 + #2290). Quand chat.api livrera `POST /api/orchestrators/v2/{id}/execute`, il doit déléguer l'exécution à n8n.

**Demande — workflow n8n** :
1. Reçoit un `OrchestratorV2Draft` (cf. RFC-101 §11.2) avec chaîne de skills + configs + LLM choisis
2. Exécute la chaîne séquentielle (ou DAG futur) :
   - Pour chaque skill : invoque le MCP server avec le LLM configuré
   - Si LLM principal indisponible → bascule sur le fallback (Claude → OpenAI → Gemini → Ollama selon `fallback_models` du skill)
   - Logs intermédiaires (skill name, LLM utilisé effectivement, durée)
3. Callback HTTP vers chat.api pour mettre à jour le statut (`processing` → `awaiting_review` → etc.)
4. Push WS via chat.api vers le front pour les logs temps réel

**Décisions PO à respecter** :
- Précédence LLM (RFC-101 §10.5) : skill default < user pref < session < per-call override
- Mode éco non bloquant : si modalité incompatible → ne pas fallback silencieux, retourner une erreur structurée que chat.api propage au front (`400 model_modality_mismatch`)
- Audit du LLM effectivement utilisé (utile pour facturation et debug)

**Issue front liée** : (mentionnée dans #2300 §5)

---

## 2. Pipeline correction de copies (RFC-099)

**Contexte** : workflow asynchrone déclenché par une nouvelle soumission de copie.

**Demande — workflow n8n** :
1. Trigger : webhook chat.api après `POST /api/grading/submissions` (passe `submission_id`)
2. Récupère les métadonnées (sujet, corrigé, rubric, persona)
3. Exécute la chaîne de Skills Claude :
   ```
   extract_rubric → ingest_submission → split_responses → 
   compare_responses → evaluate_score → compose_feedback
   ```
4. Sélection LLM par skill (cf. RFC-099 §10 + RFC-101 §10) avec fallback automatique
5. À chaque étape : callback HTTP vers chat.api → mise à jour DB + WS push vers front
6. Étape finale : statut `awaiting_review` ; prof valide manuellement avant publication Discord

**Issue front liée** : [#2297](https://github.com/fsebbah/azy.front/issues/2297)

---

## 3. Pipeline Bug report user

**Contexte** : workflow d'analyse de bug remonté par un utilisateur.

**Demande — workflow n8n** :
1. Trigger : webhook chat.api après `POST /api/bug-reports`
2. Récupère screenshot + console + métadonnées
3. Invoque le Skill MCP `analyze_user_bug` (cf. `REQUESTS-MCP-SERVER.md` §3)
4. Crée l'issue GitHub via GitHub API (token org)
5. Callback chat.api avec `issue_url` + `status` → WS push vers user pour notification

**Issues front liées** : [#2295](https://github.com/fsebbah/azy.front/issues/2295) + [#2296](https://github.com/fsebbah/azy.front/issues/2296)

---

## 4. Adapter LLM unifié (à factoriser)

**Demande** : exposer un adapter LLM unique côté n8n qui :
- Prend un `model_id` (claude-sonnet-4-6, claude-opus-4-8, gpt-4o, gemini-2.5-pro, ollama/llama3, etc.)
- Prend un prompt + tools
- Renvoie une réponse structurée
- Gère le fallback automatique si le LLM principal n'est pas disponible

Réutilisable par tous les workflows ci-dessus.

---

## 5. Suivi élèves — pipeline périodique (RFC-100, à anticiper)

**Contexte** : Phase 2 RFC-100. Génération hebdomadaire d'un récap progression élève.

**Demande — workflow n8n** :
1. Trigger cron hebdo
2. Pour chaque élève actif : invoque les skills MCP `aggregate_progress` + `recommend_next_steps`
3. Publication récap dans le channel Discord de l'élève via webhook plugin Discord

**Issue front liée** : [#2294](https://github.com/fsebbah/azy.front/issues/2294)

---

## Format de réponse attendu

Pour chaque workflow, merci d'indiquer :
- ✅ Pris en charge — date estimée
- 🔧 En cours de design
- ❓ Besoin de précisions
- ❌ Hors scope n8n (rediriger ailleurs)

Bien préciser l'**adapter LLM unifié** : déjà existant ou à créer ?
