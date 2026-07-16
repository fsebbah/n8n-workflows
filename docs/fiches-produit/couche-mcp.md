# 🧠 Couche MCP — synthèse pour les fiches produit

> **Statut** : brouillon · 2026-07 · **rédigé par l'équipe MCP** (réponse à azy.daily#84)
> **Public** : produit, avant-vente, marketing, rédacteurs des fiches produit.
> **Objet** : fournir, produit par produit, **le volet « couche MCP »** des fiches — *ce que MCP apporte* en langage produit, avec le mécanisme réel et un **niveau de maturité honnête** (pour ne rien survendre).

## MCP en une phrase
La couche Azy qui **exécute réellement l'intelligence artificielle** : elle appelle les modèles chez les fournisseurs, retrouve les bons passages dans les bases de connaissances, et exécute les skills — pendant que `chat.api` orchestre, sécurise et facture. **MCP ne stocke jamais de données métier** ni de clé : il reçoit un contexte déjà résolu et l'exécute.

> **Chaîne type** : front → `chat.api` (orchestration, crédits, audit) → **MCP** (exécution IA / retrieval / skills) → n8n (appels fournisseurs, traitements lourds) → fournisseur IA.

---

## 1. Chat IA cloud — *exécution des modèles + temps réel*

**Ce que MCP apporte**
- **Fait tourner l'appel au modèle** et pousse la réponse **au fil de l'eau** (par paquets), relayée par `chat.api` en streaming vers l'utilisateur.
- **Multi-fournisseurs** : OpenAI, Anthropic, Mistral — le bon fournisseur/modèle est choisi par `chat.api` et exécuté par MCP, **sans que la clé ne soit jamais exposée** (elle est fournie par requête et n'est pas conservée).
- **Facturation juste** : MCP remonte la **consommation exacte** (tokens entrée/sortie) qui permet à `chat.api` de réconcilier les crédits au réel.
- **Assurance du modèle** : MCP **signale un écart** si le fournisseur renvoie un autre modèle que celui demandé (traçabilité anti-substitution).
- **Deux régimes** : réponse directe (*raw*) ou **chaîne d'étapes** (*agentic*, pour les tâches qui demandent plusieurs passes).
- **Modèles « raisonnement » (GPT-5…)** : MCP émet un **signal de phase** — « réflexion en cours… » puis « génération » — pour supprimer le silence pendant que le modèle réfléchit.

**Maturité**
- ✅ **Livré** : exécution multi-fournisseurs, streaming par paquets, remontée d'usage, assurance modèle, modes raw + agentic, **signal de phase « reasoning » (Tier 1, #83)**.
- 🚧 **Roadmap** : réglage fin du raisonnement (effort/verbosité) et **résumés de raisonnement** (Tier 2, conditionné à l'API Responses OpenAI + cadrage facturation).

**À ne pas survendre**
- Fournisseurs branchés = **3** (OpenAI / Anthropic / Mistral). **La génération vidéo (Veo) et Gemini ne sont pas dans le périmètre MCP** aujourd'hui.
- Le multimodal côté MCP couvre **vision / OCR / audio** (analyse), pas la génération de médias.

---

## 2. RAG — base de connaissances — *le moteur de recherche*

**Ce que MCP apporte**
- **Retrouve les passages pertinents** dans la base de l'organisation à partir de la question (recherche vectorielle).
- **Cloisonnement fort par corpus** : le filtre par corpus (`scope_id`) et l'organisation viennent d'une **source fiable** (jamais du contenu envoyé) → une organisation ne voit jamais le corpus d'une autre. **Fail-closed** : sans périmètre autorisé, **aucun** résultat n'est renvoyé (pas de fuite par défaut).
- **Filtres de catégorie** : affinage par niveau, matière, notions, type de document, rôle d'autorité, tags.
- **Traçabilité par passage** : chaque extrait remonte **son titre, son identifiant de source, son type**, et son **rôle d'autorité** (prof vs élève) pour arbitrer les conflits de contenu.
- **Relais d'ingestion** : MCP transmet les dépôts au pipeline n8n de façon **signée** (référence de fichier, jamais le contenu brut).

**Maturité**
- ✅ **Livré** : retrieval par corpus (isolation dure + fail-closed), filtres de catégorie, traçabilité fine, relais d'ingestion, alignement d'embeddings avec l'indexation (`text-embedding-3-small`).
- 🚧 **En cours de spécification** : OCR avancé (PDF scannés / manuscrits) et double backend (cloud web / on-device mobile & desktop) — RFC-107.

**À ne pas survendre**
- Dépôt **un fichier par appel** (le « multi-documents » = plusieurs sources rattachées au **même** corpus).
- Pas encore : purge RGPD des extraits déjà vectorisés, partage/délégation de corpus, harnais d'évaluation de pertinence.

---

## 3. Skills & orchestration — *l'exécuteur des automatisations cloud*

**Ce que MCP apporte**
- **Exécute les skills publics (cloud)** et tient la **source de vérité du catalogue** : miroir des **skills natifs Anthropic** + **skills métier maison** (format RFC-085).
- **Interpose la clé API** côté serveur — l'agent local (sur le poste de l'utilisateur) n'y a jamais accès ; il orchestre les skills locaux et **repasse par le serveur** pour toute étape IA.
- Pour l'appel au modèle, MCP passe la main à n8n → fournisseur.

**Maturité**
- ✅ **Livré** : moteur de skills (définition / résolution / exécution), exposition du catalogue (natifs + custom), exécution cloud.
- 🚧 **Roadmap** : **chaînage multi-étapes** et **déclenchement programmé/autonome** de jobs ; synchronisation automatique du catalogue vers `chat.api` (V2).

---

## 4. Experts & Personae — *exécution de la personae résolue*

**Ce que MCP apporte**
- MCP **n'intervient pas dans la composition** de la personae (c'est `chat.api` qui compose Expert × Spécialité × Style au moment de la requête). MCP **exécute** l'appel avec la personae **déjà résolue** qu'on lui passe (prompt système, réglages du style).
- L'appel LLM de **classification de routage** (par élève) peut transiter par MCP, car `chat.api` n'a pas de client d'inférence direct.

**Maturité**
- ✅ **Livré** : exécution avec le contexte de personae fourni.
- 🚧 **V2** : un canal « expert via MCP » dédié (non exposé aujourd'hui).

---

## 5. Formation — *les skills de correction de copies*

**Ce que MCP apporte**
- **Héberge et exécute (cloud) les skills de correction de copies** et les opérations de synchronisation Google Classroom.
- Correction en plusieurs skills composables : extraction de barème, lecture de copie (OCR), segmentation par question, comparaison à l'attendu, notation structurée, feedback pédagogique.
- **Le professeur valide toujours** les notes et corrections (humain dans la boucle, par conception).

**Maturité**
- 🚧 **En construction** : les skills de correction sont **cadrés mais pas encore livrés**. Décisions actées qui débloquent : **OCR de copie = Mistral OCR 4** (RFC-107), **personae/style = modèle v4** (RFC-081).
- ⚠️ **À formuler au conditionnel** dans une plaquette : la lecture de copie (vision) **ne fonctionne pas en mode « éco »** ; le **chaînage automatique** des skills est à venir (aujourd'hui chaque skill est lançable seul).

---

## 6. Plateforme socle — *rôle MCP limité*

- MCP est **hors du chemin** de la synchronisation mobile, de la 2FA et de l'audit (ce sont des sujets `chat.api`). Sa seule contribution transverse : la **surface d'exécution du streaming de chat** (cf. §1).

---

## 🧭 Matrice de maturité (couche MCP)

| Produit | Livré ✅ | En cours / Roadmap 🚧 |
|---|---|---|
| Chat IA cloud | Exécution multi-fournisseurs, streaming, usage, assurance modèle, raw+agentic, **signal reasoning (Tier 1)** | Réglage effort/verbosité + résumés de raisonnement (Tier 2) |
| RAG | Retrieval par corpus (isolation + fail-closed), filtres, traçabilité, relais ingestion | OCR avancé + double backend (RFC-107) |
| Skills & orchestration | Moteur skills, catalogue (natifs+custom), exécution cloud | Chaînage multi-étapes, déclenchement programmé, sync catalogue V2 |
| Experts & Personae | Exécution avec personae résolue | Canal « expert via MCP » (V2) |
| Formation | — (socle skills réutilisé) | Skills de correction (cadrés, non livrés) |

**Périmètre exclu (à ne pas annoncer)** : génération vidéo (Veo), Gemini, purge RGPD des vecteurs, partage de corpus inter-utilisateurs.

---

## 🔧 Références techniques
> *Pour les rédacteurs — ne pas mettre dans une plaquette commerciale.*

- **Exécution LLM** : `POST /api/llm/stream/init` (modes `raw|agentic`, frames WS `chat.stream`), usage exposé via `GET /api/llm/stream/{cid}`. BYOT (provider/model/clé par requête, clé non conservée). Fournisseurs : `openai`, `anthropic`, `mistral` (`_build_chat_model`). Signal reasoning : frames `{type:"status", state:"reasoning"|"generating"}` (azy.daily#83, RFC-086).
- **RAG** : retrieval `POST /api/rag/query` (Qdrant, `must` = `tenant_id` + `scope_id ∈ X-Scope-Ids` + `active`, fail-closed ; whitelist filtres `{subject, level, notions, doc_type, origin, authority_role, tags}` ; embeddings `text-embedding-3-small`/1536). Relais ingestion `POST /api/rag/ingest` (file-ref → n8n, HMAC). Réf : RFC-099 / RFC-106 / RFC-107.
- **Skills** : moteur `src/mcp_server/skills/` (RFC-085) ; catalogue via `/api/skills` + miroir Anthropic (`GET /v1/skills`). Réf : RFC-085, RFC-101.
- **Multimodal** : outils vision / OCR / audio (`src/mcp_server/tools/`, `POST /api/process`). Gemini/Veo **non branchés**.
