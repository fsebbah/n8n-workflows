Parfait, merci pour la clarification 👍
Je reformule **la contrainte clé**, car elle change vraiment la grille de décision :

> ✅ **Tous les tools sont implémentés dans n8n**
> ✅ **MCP = couche logique / sémantique / décisionnelle (pas d’exécution)**
> ✅ **Phase 1 : ONLINE ONLY (rapidité, fiabilité, APIs)**
> ✅ **Phase 2 : OFFLINE / LOCAL-FIRST (souveraineté, coûts, TRM, Ollama, etc.)**
> 👉 **On choisit donc les services n8n aujourd’hui en anticipant la migration demain**

Je te propose une réponse **opérationnelle**, en 3 niveaux :

1. **Principes de choix online → offline**
2. **Table de choix ONLINE (court terme)**
3. **Table de migration OFFLINE (cible moyen terme)**
4. **Décisions structurantes à prendre dès maintenant (pour ne pas se bloquer)**

---

## 1️⃣ Principes de choix (très importants)

### 🎯 Phase ONLINE (maintenant)

Objectifs :

* Qualité maximale
* APIs stables
* Time-to-market
* Peu d’infra à maintenir

👉 On privilégie :

* OpenAI / Anthropic / AssemblyAI / Mistral API
* n8n nodes natifs ou HTTP simples
* Peu de modèles à gérer

---

### 🏠 Phase OFFLINE (plus tard)

Objectifs :

* Souveraineté
* Coûts maîtrisés
* Multi-tenant local
* TRM + Ollama + Qdrant

👉 On prépare :

* Interfaces interchangeables
* Formats de sortie stables
* Même “contract” de tool (input/output)

⚠️ **Règle clé**

> Le LLM (MCP) ne doit JAMAIS dépendre du fournisseur
> → seulement du **schéma du tool**

---

## 2️⃣ Choix OFFICIELS – PHASE ONLINE (recommandés)

### 🔊 Audio / Voix

| Tool                      | Choix ONLINE n8n | Pourquoi                          |
| ------------------------- | ---------------- | --------------------------------- |
| `transcriber_tool`        | **AssemblyAI**   | Qualité + diarization + stabilité |
| `text_to_speech_tool`     | **ElevenLabs**   | Naturel, voix pro, API simple     |
| `speaker_identifier_tool` | **AssemblyAI**   | Best-in-class online              |

👉 Whisper possible mais AssemblyAI fait tout “out of the box”.

---

### 📄 Documents / OCR

| Tool                   | Choix ONLINE n8n    | Pourquoi                   |
| ---------------------- | ------------------- | -------------------------- |
| `pdf_extractor_tool`   | **Mistral OCR API** | Très bon sur PDF complexes |
| `table_extractor_tool` | **Mathpix**         | Référence pour tableaux    |
| `get_image_ocr_tool`   | **Mistral Vision**  | OCR + compréhension        |

---

### 🧠 NLP / LLM

| Tool                    | Choix ONLINE n8n            | Pourquoi                  |
| ----------------------- | --------------------------- | ------------------------- |
| `text_generator_tool`   | **OpenAI GPT-4.1 / 4o**     | Généraliste fiable        |
| `summarizer_tool`       | **Anthropic Claude Sonnet** | Résumés très propres      |
| `llm_summarizer_tool`   | **Claude Sonnet**           | Idem                      |
| `entity_extractor_tool` | **OpenAI**                  | Structuration JSON fiable |
| `text_classifier_tool`  | **OpenAI**                  | Rapide et robuste         |
| `code_generator_tool`   | **OpenAI**                  | Écosystème mature         |

👉 **Oui, c’est volontairement redondant**
➡️ n8n = exécution, MCP = choix du bon tool

---

### 🔍 Recherche / Web

| Tool                     | Choix ONLINE n8n     | Pourquoi       |
| ------------------------ | -------------------- | -------------- |
| `google_searcher_tool`   | **SerpAPI**          | Simple, stable |
| `youtube_searcher_tool`  | **YouTube API**      | Natif          |
| `news_searcher_tool`     | **NewsAPI**          | Suffisant MVP  |
| `academic_searcher_tool` | **Semantic Scholar** | API propre     |

---

### 🧠 Vector / Mémoire

| Tool                | Choix ONLINE n8n | Pourquoi                |
| ------------------- | ---------------- | ----------------------- |
| `vector_store_tool` | **Qdrant Cloud** | Même API online/offline |

👉 **Décision stratégique clé** :
❌ Pinecone
✅ **Qdrant partout**

---

### 🧩 Intégrations SaaS

| Tool      | Choix ONLINE n8n      |
| --------- | --------------------- |
| LinkedIn  | LinkedIn node         |
| Notion    | Notion node           |
| CSV       | Spreadsheet File node |
| HTML      | HTTP + HTML Extract   |
| Bulk URLs | SplitInBatches        |

---

## 3️⃣ PLAN DE MIGRATION – PHASE OFFLINE (cible)

👉 Même tools, **backend différent**, zéro changement côté MCP.

### 🔊 Audio / Voix (offline)

| Tool                      | Choix OFFLINE         | Remarque        |
| ------------------------- | --------------------- | --------------- |
| `transcriber_tool`        | **faster-whisper**    | GPU ou CPU      |
| `text_to_speech_tool`     | **Piper / Coqui TTS** | Voix locales    |
| `speaker_identifier_tool` | ❌ (optionnel)         | Coûteux offline |

---

### 📄 Documents / OCR (offline)

| Tool                   | Choix OFFLINE         | Remarque     |
| ---------------------- | --------------------- | ------------ |
| `pdf_extractor_tool`   | **unstructured**      | Multi-format |
| `table_extractor_tool` | **PaddleOCR / docTR** | Acceptable   |
| `get_image_ocr_tool`   | **Ollama Vision**     | Local-first  |

---

### 🧠 NLP / LLM (offline)

| Tool             | Choix OFFLINE               |
| ---------------- | --------------------------- |
| Génération texte | **Ollama (Mistral, LLaMA)** |
| Résumé           | **Ollama**                  |
| Classification   | **TRM / small LLM**         |
| NER              | **spaCy / TRM-NER**         |
| Code             | **Code LLM local**          |

👉 **C’est là que vos TRM prennent tout leur sens.**

---

### 🧠 Vector / Mémoire (offline)

| Tool         | Choix OFFLINE    |
| ------------ | ---------------- |
| Vector store | **Qdrant local** |

Zéro migration fonctionnelle si bien fait dès maintenant.

---

## 4️⃣ Décisions STRUCTURANTES à prendre maintenant

Voici les **3 décisions critiques** que je te recommande d’acter tout de suite 👇

---

### 🔒 1. Standardiser les outputs des tools n8n

Exemple :

```json
{
  "success": true,
  "data": {...},
  "meta": {
    "provider": "openai",
    "latency_ms": 423
  }
}
```

➡️ Le MCP ne doit jamais savoir *qui* a répondu.

---

### 🔁 2. Un tool = une capacité, pas un provider

❌ `openai_summarize`
✅ `summarizer_tool`

➡️ Le provider devient une **implémentation n8n**, interchangeable.

---

### 🧠 3. Prévoir dès maintenant le flag `execution_mode`

```json
{
  "execution_mode": "online" | "offline"
}
```

➡️ n8n route vers :

* API externe
* Ollama / service local

---

## 🧠 Conclusion nette

* ✅ **Phase ONLINE : OpenAI / Anthropic / AssemblyAI / Mistral / Qdrant Cloud**
* ✅ **Phase OFFLINE : Ollama / TRM / Qdrant local**
* ✅ **Même liste de tools**
* ✅ **Même schéma**
* ✅ **Zéro dette de migration**


Parfait, on applique **exactement la même méthode**, mais **strictement dans ton cadre** :

* ✅ **Tous les tools sont dans n8n**
* ✅ **Phase 1 : ONLINE**
* ✅ **Phase 2 : OFFLINE**
* ✅ **On tranche, on priorise, on prépare la migration**
* ❌ Pas de débat MCP vs n8n ici → **choix de services derrière les tools n8n**

Je te propose une réponse **décisionnelle**, pas descriptive.

---

# 1️⃣ Grille de décision (rappel rapide)

Pour ces tools “Autres”, on applique 3 critères simples :

1. **Criticité métier**
2. **Dépendance fournisseur**
3. **Facilité de migration online → offline**

Objectif :
👉 **ne PAS créer de dette technique**
👉 **ne PAS sur-complexifier le MVP**

---

# 2️⃣ CHOIX OFFICIELS – PHASE ONLINE (maintenant)

Je reprends **les 12 tools**, avec **le choix que je recommande vraiment**.

---

## 1️⃣ `email_imap_tool`

### ✅ Choix ONLINE

* **IMAP + SMTP nodes natifs n8n**

### Décision

✅ **On valide l’existant**

Pourquoi :

* Standard
* Stable
* Zéro lock-in
* Déjà offline-compatible

👉 **Aucune raison d’aller plus loin (Mautic inutile ici)**

---

## 2️⃣ `docx_extractor_tool`

### ⚠️ Choix ONLINE recommandé

* **docxtemplater + mammoth (Node.js)**
* **PAS Mistral OCR par défaut**

### Décision

🟡 **Workflow dédié à créer**

Pourquoi :

* DOCX ≠ OCR
* OCR = plan B (DOCX scanné)
* docxtemplater = structuré, fiable

👉 ONLINE = **parsing natif DOCX**
👉 OCR seulement si échec

---

## 3️⃣ `graph_builder_tool` ⚠️ POINT IMPORTANT

### ❌ Décision ferme

👉 **Ce tool doit être scindé**

| Nouveau tool           | Rôle                    |
| ---------------------- | ----------------------- |
| `chart_generator_tool` | Graphiques, KPI, charts |
| `knowledge_graph_tool` | Graphe sémantique       |

### Choix ONLINE

* `chart_generator_tool` → **QuickChart (HTTP)**
* `knowledge_graph_tool` → ❌ **HORS SCOPE pour l’instant**

👉 **Tu ne mélanges pas chart ≠ knowledge graph**

---

## 4️⃣ `cost_calculator_tool`

### ✅ Choix ONLINE

* **Function node n8n**

Décision :
✅ OK tel quel
➡️ Tool purement utilitaire

---

## 5️⃣ `usage_tracker_tool`

### ✅ Choix ONLINE

* **n8n execution history + metadata**

Décision :
✅ OK
➡️ Ne surtout PAS sur-ingénierer

---

## 6️⃣ `json_transformer_tool`

### ✅ Choix ONLINE

* **Set / Code node**

Décision :
✅ OK

---

## 7️⃣ `text_embedder_tool`

### ✅ Choix ONLINE

* **OpenAI Embeddings (text-embedding-3-small)**

Décision :
✅ OK
➡️ Très bon ratio qualité / coût

⚠️ Important :

> **NE JAMAIS exposer le provider au MCP**

---

## 8️⃣ `language_detector_tool`

### ✅ Choix ONLINE

* **LLM (OpenAI / Claude)**
* Pas d’API dédiée

Décision :
✅ OK
➡️ Plus simple, plus robuste sur textes courts

---

## 9️⃣ `tokenizer_tool`

### ✅ Choix ONLINE

* **Function node + tiktoken**

Décision :
✅ OK

---

## 🔟 `bulk_cloud_uploader_tool`

### ⚠️ Choix ONLINE

* **S3 / GCS nodes**
* * **SplitInBatches + Loop**

Décision :
🟡 **Workflow dédié à créer**

Pourquoi :

* n8n n’a pas de “bulk natif”
* mais le pattern est clair et stable

---

## 1️⃣1️⃣ `image_embedder_tool`

### ✅ Choix ONLINE

* **OpenAI Vision embeddings**
* ou **CLIP via HTTP**

Décision :
✅ OK
➡️ Tool rarement critique au MVP

---

## 1️⃣2️⃣ `get_pdf_layout_translator_tool`

### ⚠️ Choix ONLINE (complexe)

* **Mathpix (layout)**
* **DeepL (traduction)**
* **Mistral (reformulation optionnelle)**

Décision :
🟡 **Workflow composite n8n**

👉 Mais **valeur ajoutée forte**, donc justifié.

---

# 3️⃣ PLAN DE MIGRATION – PHASE OFFLINE (cible)

Même tools. **Backend différent**.

---

## Mapping ONLINE → OFFLINE

| Tool                  | ONLINE          | OFFLINE                         |
| --------------------- | --------------- | ------------------------------- |
| email_imap            | IMAP/SMTP       | IMAP/SMTP                       |
| docx_extractor        | docxtemplater   | python-docx                     |
| chart_generator       | QuickChart      | Vega-Lite local                 |
| cost_calculator       | Function        | Function                        |
| usage_tracker         | n8n history     | n8n history                     |
| json_transformer      | Set / Code      | Set / Code                      |
| text_embedder         | OpenAI          | local embeddings (MiniLM / TRM) |
| language_detector     | LLM             | fastText                        |
| tokenizer             | tiktoken        | tokenizer local                 |
| bulk_uploader         | S3/GCS          | MinIO                           |
| image_embedder        | OpenAI / CLIP   | CLIP local                      |
| pdf_layout_translator | Mathpix + DeepL | docTR + MarianMT                |

👉 **Zéro changement côté MCP si le schéma est respecté**

---

# 4️⃣ Décisions STRUCTURANTES (à acter maintenant)

### 🔒 1. Renommer `graph_builder_tool`

➡️ **obligatoire**

```text
graph_builder ❌
chart_generator ✅
knowledge_graph (plus tard)
```

---

### 🧱 2. Tous les tools doivent respecter le même contrat

```json
{
  "success": true,
  "data": {...},
  "meta": {
    "provider": "online|offline",
    "engine": "openai|local",
    "duration_ms": 123
  }
}
```

---

### 🔁 3. Prévoir dès maintenant le switch ONLINE / OFFLINE

Même si inutilisé aujourd’hui :

```json
{
  "execution_mode": "online"
}
```

---

# 5️⃣ Conclusion nette (sans langue de bois)

* ✅ **9 tools OK tels quels**
* 🟡 **3 workflows à créer (docx, bulk upload, pdf layout)**
* ❌ **1 tool à renommer / clarifier absolument**
* 🚫 **Aucune dépendance bloquante pour l’offline**
* 🧠 **Architecture propre, saine, scalable**

👉 **Tu es exactement au bon niveau de granularité.**


Exact — et tu as **totalement raison** 👍
Et en fait, c’est même **une excellente décision d’architecture**, pas une contrainte subie.

Je vais reformuler et **acter clairement la décision**, puis en tirer **les conséquences positives** pour la suite.

---

## ✅ Décision actée : `email_imap_tool`

> **IMAP + SMTP nodes natifs n8n uniquement**
> **Configuration fournie par l’utilisateur**
> **Aucune abstraction supplémentaire**

👉 **C’est non négociable et c’est très bien ainsi.**

---

## 🎯 Pourquoi c’est le BON choix (et pas un “on n’a pas le choix”)

### 1️⃣ Standard universel

* IMAP / SMTP = **RFC**
* Gmail, Outlook, Exchange, OVH, Proton, serveurs internes…
* Fonctionne **online ET offline** (LAN, intranet)

👉 Zéro lock-in fournisseur.

---

### 2️⃣ Sécurité & responsabilité claires

* Les identifiants **appartiennent à l’utilisateur**
* Stockés côté n8n (vault / credentials)
* AZY **n’est pas intermédiaire du mail**

👉 Très bon point **RGPD / responsabilité légale**.

---

### 3️⃣ Pas de dette de migration

* IMAP/SMTP aujourd’hui
* IMAP/SMTP demain
* IMAP/SMTP offline

👉 Aucun plan de migration à prévoir.

---

### 4️⃣ Alignement parfait avec MCP

Le MCP ne sait qu’une chose :

```json
{
  "tool": "email_imap",
  "action": "send|search|fetch",
  "params": {...}
}
```

Il **ne sait pas** :

* si c’est Gmail
* si c’est Exchange
* si c’est local ou cloud

👉 **Découplage parfait.**

---

## 🧠 Conséquences d’architecture (importantes)

### ✅ 1. Ce tool sort du débat ONLINE vs OFFLINE

Tu peux littéralement le marquer :

```text
email_imap_tool = TRANSCENDANT
```

➡️ Ni online-only
➡️ Ni offline-only
➡️ **Infrastructure-agnostique**

---

### ✅ 2. Aucun provider fallback nécessaire

❌ Pas de Mautic
❌ Pas de SendGrid
❌ Pas de Gmail API obligatoire

👉 Si un jour vous ajoutez un autre tool (`email_marketing_tool`), ce sera **un autre tool**, pas celui-ci.

---

### ✅ 3. UX claire côté utilisateur

L’UX doit être simple et explicite :

> “Entrez vos paramètres IMAP / SMTP
> (serveur, port, sécurité, identifiants)”

👉 Pas de promesse floue.

---

## 📌 Recommandation pratique n8n (très concrète)

### Structure de workflow `email_imap_tool`

```text
Webhook (tool entry)
 → Switch (action)
   ├── send
   │    └── SMTP Send
   ├── search
   │    └── IMAP Search
   └── fetch
        └── IMAP Read
```

### Format de réponse standardisé

```json
{
  "success": true,
  "data": {
    "message_id": "...",
    "subject": "...",
    "to": ["..."]
  },
  "meta": {
    "protocol": "imap/smtp",
    "user_managed": true
  }
}
```

---

## 🧠 Positionnement clair dans la doc AZY

Je te recommande **d’écrire noir sur blanc** (important pour plus tard) :

> **email_imap_tool**
> Ce tool utilise exclusivement les protocoles standards IMAP et SMTP.
> Les paramètres de connexion sont fournis et gérés par l’utilisateur.
> AZY n’intervient pas comme fournisseur d’email.

👉 Ça t’évite **toute ambiguïté future** (juridique, technique, commerciale).

---

## ✅ Conclusion

* ✔️ Ce n’est **pas une limitation**
* ✔️ C’est **une décision saine, durable, et propre**
* ✔️ Tu peux la considérer comme **définitive**


### `docx_extractor_tool` — pourquoi **pas Mistral OCR par défaut**

Parce que **un DOCX n’a normalement pas besoin d’OCR**.

* **DOCX = texte structuré** (paragraphes, titres, tableaux, styles, champs…). Un parseur (ex: Mammoth / docxtemplater côté Node, ou python-docx côté Python) récupère **le vrai contenu** proprement.
* **OCR = reconstruction depuis une image**. C’est utile si le document est **scanné** (images dans un PDF, ou images dans un DOCX), mais sinon tu perds :

  * la structure (titres, listes, tableaux, notes),
  * la précision (erreurs d’OCR),
  * et tu payes/consommes plus.

Donc ce n’est pas “les autres sont plus performants”, c’est : **le bon outil pour le bon type d’entrée**.

✅ Reco “pro” (et simple dans n8n) : **pipeline avec fallback**

1. **Parse DOCX natif** (mammoth/docxtemplater)
2. Si sortie vide / faible / beaucoup d’images → **OCR** (Mistral OCR/Vision) sur les pages/sections images

Comme ça tu gardes le meilleur des deux : **qualité + coût + robustesse**.

---

### `knowledge_graph_tool` — vous l'avez déjà en n8n avec Gemini

Parfait. Dans ce cas, je ferais juste 2 décisions pour éviter la confusion avec `graph_builder_tool` :

1. **Renommer `graph_builder_tool`** en `chart_generator_tool` (QuickChart, etc.)
2. Garder `knowledge_graph_tool` (Gemini) comme tool séparé

Pourquoi je suis strict là-dessus : un "graph" = deux mondes différents

* **Chart** = visualisation (barres, courbes, KPI)
* **Knowledge graph** = entités + relations + requêtes (RDF/Neo4j-like)

👉 Si tu gardes un seul nom "graph_builder", le LLM va se tromper 1 fois sur 2.

---

# 6️⃣ ANALYSE ET RAPPORT DE SITUATION

> **Date**: 2025-12-15
> **Auteur**: Claude Code

## Vue d'ensemble

### État d'avancement global

| Catégorie | Nb Tools | Statut | Action |
|-----------|----------|--------|--------|
| **Google Services** | 46 | ✅ Implémentés | MCP Gmail/Drive/Calendar/Contacts actifs |
| **Tools couverts** | 14 | ✅ Workflows existants | Mapper vers MCP |
| **Tools à créer** | 13 | 🟡 Définis | Nouveaux workflows à créer |
| **Autres (simples)** | 9 | ✅ Nodes natifs | Configuration minimale |
| **Autres (à créer)** | 3 | 🟡 Complexes | Workflows dédiés |
| **À renommer** | 1 | ❌ Clarification | graph_builder → chart_generator + knowledge_graph |
| **TOTAL** | **85** | | |

### Répartition par effort

```
┌────────────────────────────────────────────────────────────┐
│  ✅ PRÊT (70 tools)                                        │
│  ├── Google Services (46) - déjà en production             │
│  ├── Tools couverts (14) - workflows existants             │
│  └── Autres simples (9) - nodes natifs n8n                 │
│       └── + 1 renommage (graph_builder)                    │
├────────────────────────────────────────────────────────────┤
│  🟡 À CRÉER (16 tools)                                     │
│  ├── Tools à créer (13)                                    │
│  └── Autres complexes (3)                                  │
└────────────────────────────────────────────────────────────┘
```

---

## Décisions structurantes actées

### ✅ 1. Renommage obligatoire

| Ancien nom | Nouveaux noms | Raison |
|------------|---------------|--------|
| `graph_builder_tool` | `chart_generator_tool` | Graphiques visuels (QuickChart) |
| | `knowledge_graph_tool` | Graphe sémantique (Gemini) - **déjà existant** |

### ✅ 2. Choix stratégiques

| Décision | Choix | Impact |
|----------|-------|--------|
| **Vector Store** | Qdrant (pas Pinecone) | Migration OFFLINE sans friction |
| **Email** | IMAP/SMTP user-managed | Zéro lock-in, RGPD compliant |
| **LLM principal** | OpenAI/Anthropic ONLINE | Ollama OFFLINE |
| **Transcription** | AssemblyAI ONLINE | faster-whisper OFFLINE |

### ✅ 3. Contrat de données standardisé

Tous les tools DOIVENT retourner :

```json
{
  "success": true,
  "data": { /* résultat métier */ },
  "meta": {
    "provider": "openai|assemblyai|local",
    "execution_mode": "online|offline",
    "duration_ms": 423
  }
}
```

---

## Priorisation recommandée

### 🔴 Priorité HAUTE (usage fréquent)

| Tool | Raison |
|------|--------|
| `summarizer_tool` | Core feature LLM |
| `transcriber_tool` | Audio/vidéo très demandé |
| `web_scraper_tool` | Recherche web essentielle |
| `pdf_extractor_tool` | Documents omniprésents |
| `text_generator_tool` | Base de toute génération |

### 🟡 Priorité MOYENNE (usage régulier)

| Tool | Raison |
|------|--------|
| `csv_processor_tool` | Data analysis courant |
| `html_extractor_tool` | Scraping complémentaire |
| `news_searcher_tool` | Veille informationnelle |
| `chart_generator_tool` | Reporting visuel |
| `docx_extractor_tool` | Documents bureautiques |

### 🟢 Priorité BASSE (usage ponctuel)

| Tool | Raison |
|------|--------|
| `speaker_identifier_tool` | Niche audio |
| `quiz_generator_tool` | Feature éducation |
| `syllabus_generator_tool` | Feature éducation |
| `academic_searcher_tool` | Recherche spécialisée |
| `image_generator_tool` | Créatif, non critique |
| `bulk_cloud_uploader_tool` | Ops, pas user-facing |

---

## Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| 16 workflows non créés | Haute | Fonctionnalités manquantes | Prioriser par usage |
| Confusion graph_builder | Moyenne | Erreurs LLM | Renommer immédiatement |
| Lock-in provider | Faible | Migration difficile | Contrat standardisé |
| Performance OFFLINE | Moyenne | UX dégradée | Tests comparatifs |

---

## Checklist de validation par tool

Pour chaque tool migré/créé, valider :

- [ ] Workflow n8n créé et fonctionnel
- [ ] Webhook MCP configuré
- [ ] Format de sortie `{success, data, meta}` respecté
- [ ] Flag `execution_mode` supporté
- [ ] Tests unitaires (inputs valides)
- [ ] Tests edge cases (inputs vides, erreurs)
- [ ] Tests de charge (si applicable)
- [ ] Documentation mise à jour
- [ ] Backlog OFFLINE identifié


