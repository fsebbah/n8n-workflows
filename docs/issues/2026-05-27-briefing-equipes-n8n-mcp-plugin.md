# Briefing équipes — n8n / MCP / plugin Discord (RFC-095 + RFC-096)

> Date : 2026-05-27 · Émetteur : back · But : donner à chaque équipe **ce qu'elle doit lire, ses tasks pressenties, les décisions qu'elle doit rendre**, pour chiffrer et se prononcer avant le runtime DM (Phase 1) et l'extension pédagogique.
> Contexte global : `docs/issues/2026-05-27-personae-roadmap-phases.md`.

## Socle déjà figé (commun aux 3 équipes)
- **Identité élève = `discord_user_id`** (snowflake, string). Pas de Firebase UID. `guild_id → tenant_id` via l'existant `GET /api/n8n/tenants/resolve`.
- **Contrat runtime figé** : `docs/guides/RFC-095-API-CONTRACTS.md` §3.1 (`resolve-dm`, discriminateur `status`).
- **B3 (`resolve-dm`) est en cours de build** côté back. Le contrat ne bougera pas ; seules restent ouvertes les décisions listées plus bas (additives).

---

## 1. Équipe n8n / chatbot-core

### À lire
`RFC-095-API-CONTRACTS.md` §0 + §3.1 · `RFC-095-DM-IDENTITY-RESOLUTION.md` §7 (flux cible) + §11 · `RFC-095-PERSONAE-MULTI-LEVELS.md` §9bis.1.

### Tes tasks pressenties
1. **Flux DM en 2 appels** :
   - `GET /api/n8n/tenants/resolve?guild_id=G&user_id=D` → `{tenant_id, package, models}` *(existant)*.
   - `GET /api/n8n/personae/resolve-dm?user_id=D&question=Q` + header `X-Tenant-ID: T` → `ResolveDmResponse` *(B3)*.
2. **Brancher selon `status`** :
   - `resolved` → dispatch LLM avec `personae.system_prompt` + `llm_params` + `rag_source_ids` + `models`.
   - `out_of_scope` → afficher le message de décline (pas d'appel LLM sur le fond).
   - `needs_clarification` → relayer la demande de précision (liste `clarification_candidates`), puis re-appeler `resolve-dm`.
3. Rester « bête » : **le routing/classification est fait côté back**, pas dans n8n.

### Décisions à rendre
- Le contrat `resolve-dm` §3.1 te convient-il tel quel ? (params, 3 statuts, payload).
- OK pour la séquence 2 appels (tenant puis personae) ? Ou tu préfères un endpoint « fat » unique `(guild_id, discord_user_id, question)` ?
- Charge estimée.

---

## 2. Équipe MCP / azy-mcp

### À lire
`RFC-095-PERSONAE-MULTI-LEVELS.md` §9bis.3 + Q5bis · `RFC-096-PERSONAE-PEDAGOGIQUE.md` §4 (RAG par mode), §6 (LLM judge), §3.3.4 (corpus typé), §15.2 (seed Eduscol).

### Tes tasks pressenties
1. **RFC-095 — classification du routing (Q5bis)** : `resolve-dm` appelle un **classifieur LLM cheap via MCP** (`MCPHTTPDispatch.post_dispatch`). Nouvelle catégorie d'appel courte : 1 question + N matières candidates → `specialty_id` + confiance. À cadrer : **modèle** (Haiku-class par défaut), **quota**, **audit**.
2. **RFC-096 — RAG piloté par mode pédagogique** (§4) : le retrieval Qdrant pondéré par le mode actif (types de chunks). Extension du grain de scoping.
3. **RFC-096 — split IA Discipline/Niveau** (P3) : appel LLM « Histoire 3ème » → `{discipline, level}`.
4. **RFC-096 — LLM judge / golden dataset** (§6, post-V1) : évaluation pédagogique automatisée.

### Décisions à rendre
- **Q5bis** : la classification passe bien par MCP (cohérent « tout LLM via MCP ») ? Modèle / quota / audit pour cette catégorie ?
- Le filtrage RAG par mode (§4) est-il réaliste sur votre stack Qdrant actuelle ?
- Charge estimée (classification V1 vs RAG-par-mode + judge plus tard).

---

## 3. Équipe plugin Discord

### À lire
`RFC-095-PERSONAE-MULTI-LEVELS.md` §9bis.2 · `RFC-095-DM-IDENTITY-RESOLUTION.md` §7 + §8 + §9 · `RFC-096-PERSONAE-PEDAGOGIQUE.md` §5.3 (transparence routage).

### Tes tasks pressenties
1. **Captation DM** : récupérer `(guild_id, discord_user_id, question)` et déclencher le flux n8n.
2. **Rendu des 3 statuts** : réponse normale (`resolved`) · message de décline (`out_of_scope`) · **demande de précision** (`needs_clarification`) — potentiellement des **boutons** Discord pour choisir la matière.
3. **Transparence routage (RFC-096 §5.3)** : afficher *« Matière détectée : X »* avec un bouton **[Changer]** (correction en 1 clic) — améliore le routing + pédagogique.
4. **Inscription élève** : UX pour qu'un élève s'inscrive à ses matières (commande slash ? menu ?) **OU** inscription pilotée par l'admin (déjà dispo back : `GET /api/owner/students`, `GET/PUT/DELETE /students/{id}/enrollments`). À trancher : voie élève, voie admin, ou les deux.
5. **Élève inconnu / non inscrit** : `resolve-dm` renvoie `out_of_scope` → inviter à s'inscrire / se vérifier (RFC-067).

### Décisions à rendre
- UX inscription : élève (Discord) et/ou admin ? Quel mécanisme Discord (commande, menu, réaction) ?
- OK pour gérer les boutons de précision + le « [Changer] matière » ?
- Charge estimée.

---

## 4. Décisions back encore ouvertes qui vous impactent (additives)

Ces choix par défaut ont été pris pour ne pas bloquer le build B3 ; ils sont **additifs** (révisables sans casser le contrat). Donnez votre avis :

| Sujet | Défaut back V1 | Impacte |
|---|---|---|
| **Mono-bot vs multi-bot** | Mono-tuteur : l'expert est dérivé de la matière routée (`expert_specialties`). | plugin + n8n (faut-il passer un `bot_application_id` ?) |
| **Élève non vérifié** | `out_of_scope` (décline) ; l'invite à se vérifier est côté plugin. | plugin |
| **Q5bis classification** | via MCP (`MCPHTTPDispatch`). | MCP |

## 5. Grille de sign-off

| Équipe | Position (✅ OK / ⚠️ réserves / ❌ bloquant) | Charge estimée | Remarques |
|---|---|---|---|
| n8n / chatbot-core | ⏳ | | |
| MCP / azy-mcp | ⏳ | | |
| plugin Discord | ⏳ | | |
