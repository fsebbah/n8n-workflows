# RFC-055: NotebookLM Integration

**Status**: Draft
**Created**: 2026-04-05
**Author**: Claude
**Related**: RFC-054 (RAG Sources Processing)

## 1. Résumé

Cette RFC explore l'intégration de NotebookLM dans notre écosystème pour permettre aux utilisateurs Discord de :
- Créer des notebooks et y ajouter des sources
- Poser des questions sur leurs documents
- Générer des présentations, vidéos, rapports, Audio Overviews

## 2. Contexte

NotebookLM est un outil Google basé sur Gemini qui permet de :
- Importer des sources (PDF, documents, URLs, audio, vidéo)
- Poser des questions avec des réponses sourcées et citées
- Générer des "Audio Overviews" (podcasts IA)
- Créer des rapports, infographies, flashcards, présentations, vidéos

## 3. Deux Méthodes d'Accès

### 3.1 API Enterprise Officielle

**Fonctionne comme Gmail API, Drive API, Sheets API, etc.**

```
┌─────────────────────────────────────────────────────────────────┐
│                     Google Cloud Console                         │
│                                                                  │
│  1. Activer l'API NotebookLM Enterprise                          │
│  2. Créer un Service Account                                     │
│  3. Télécharger la clé JSON                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Token Bearer (auto-renouvelé par les librairies Google)         │
│                                                                  │
│  curl -H "Authorization: Bearer $TOKEN" \                        │
│       https://us-discoveryengine.googleapis.com/v1alpha/...      │
└─────────────────────────────────────────────────────────────────┘
```

**Avantages** :
- API REST standard, documentée, supportée par Google
- Authentification Service Account (comme toutes les APIs Google Cloud)
- Stable, conforme (HIPAA, VPC-SC, CMEK)

**Inconvénients** :
- Requiert licence Gemini Enterprise (~$30/user/mois)
- **Fonctionnalités limitées** : pas de query, pas de Studio (slides, vidéo, etc.)

#### Fonctionnalités Disponibles

| Action | Disponible | Endpoint |
|--------|------------|----------|
| Créer un notebook | ✅ | `notebooks.create` |
| Ajouter des sources | ✅ | `notebooks.sources.batchCreate` |
| Uploader un fichier | ✅ | `notebooks.sources.uploadFile` |
| Générer Audio Overview | ✅ | `notebooks.audioOverviews.create` |
| Partager un notebook | ✅ | `notebooks.share` |
| **Poser une question** | ❌ | Non exposé |
| **Créer une présentation** | ❌ | Non exposé |
| **Créer une vidéo** | ❌ | Non exposé |
| **Créer un rapport** | ❌ | Non exposé |

---

### 3.2 API Interne (via MCP non-officiel)

#### C'est quoi `batchexecute` ?

Google utilise un protocole interne appelé `batchexecute` pour faire communiquer leurs sites web avec leurs serveurs. Ce protocole est utilisé par :
- Google Photos
- Google Maps
- Google Drive
- Gmail (partiellement)
- **NotebookLM**

**C'est l'API que le site web NotebookLM utilise quand vous cliquez sur les boutons.**

```
┌─────────────────────────────────────────────────────────────────┐
│                    notebooklm.google.com                         │
│                                                                  │
│   ┌─────────────────┐         ┌───────────────────────────────┐ │
│   │  Interface Web  │         │  API interne batchexecute     │ │
│   │  (JavaScript)   │────────▶│  (usage interne Google)       │ │
│   └─────────────────┘         └───────────────────────────────┘ │
│          ▲                                 ▲                    │
│          │                                 │                    │
│    Utilisateur                        MCP non-officiel          │
│    dans Chrome                        (reverse-engineering)     │
└─────────────────────────────────────────────────────────────────┘
```

| Aspect | Détail |
|--------|--------|
| Qui l'a créé ? | Google (pour leur propre site web) |
| Documenté ? | ❌ Non |
| Supporté ? | ❌ Non |
| Autorisé ? | Zone grise (probablement contre les ToS) |
| Stable ? | Peut changer sans préavis |

#### Comment l'utiliser ?

**Étape 1 : Une seule fois - Récupérer les cookies**

```
Ouvrir Chrome → Se connecter à notebooklm.google.com → Extraire les cookies
```

Les cookies nécessaires : `SID`, `HSID`, `SSID`, `APISID`, `SAPISID`

Cette étape se fait **une seule fois** (puis à chaque expiration, ~1 semaine).

**Étape 2 : Utilisation depuis Discord/n8n (sans Chrome)**

```
┌─────────────────┐
│  Discord Bot    │
│  "/notebook     │
│   slides IA"    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  n8n Workflow   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  HTTP POST vers notebooklm.google.com/_/LabsTailwindUi/data/... │
│                                                                  │
│  Headers:                                                        │
│    Cookie: SID=xxx; HSID=xxx; SSID=xxx; ...                     │
│                                                                  │
│  Body:                                                           │
│    {"rpcid": "R7cb6c", "type": 8, "notebook_id": "..."}         │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Présentation   │
│  créée ! ✅     │
└─────────────────┘
```

**Pas besoin de Chrome pour créer la présentation.** On envoie des requêtes HTTP normales avec les cookies extraits précédemment.

#### Fonctionnalités Disponibles (TOUTES)

| Action | Disponible | RPC ID |
|--------|------------|--------|
| Créer un notebook | ✅ | `CCqFvf` |
| Ajouter des sources | ✅ | `izAoDd` |
| Générer Audio Overview | ✅ | `R7cb6c` (type=1) |
| **Poser une question** | ✅ | `rCu4Hb` |
| **Créer une présentation** | ✅ | `R7cb6c` (type=8) |
| **Créer une vidéo** | ✅ | `R7cb6c` (type=3) |
| **Créer un rapport** | ✅ | `R7cb6c` (type=2) |
| **Créer des flashcards** | ✅ | `R7cb6c` (type=4) |
| **Créer une infographie** | ✅ | `R7cb6c` (type=7) |

---

### 3.3 Comparaison des Deux Méthodes

| Critère | API Enterprise | API Interne (MCP) |
|---------|----------------|-------------------|
| **Query (poser questions)** | ❌ | ✅ |
| **Slides/Vidéo/Rapport** | ❌ | ✅ |
| Audio Overview | ✅ | ✅ |
| Créer notebook | ✅ | ✅ |
| Ajouter sources | ✅ | ✅ |
| Licence requise | ~$30/user/mois | Gratuit |
| Activation Google Cloud | ✅ Oui | ❌ Non |
| Documentée | ✅ | ❌ |
| Stable | ✅ | ❌ Peut casser |
| Auth | Service Account | Cookies de session |
| Refresh auth | Automatique | Manuel (~1 semaine) |

---

## 4. Architecture Proposée

### Option A : API Enterprise (fonctionnalités limitées)

```
Discord Bot → n8n → API Enterprise → Notebooks + Audio Overviews uniquement
```

### Option B : API Interne via MCP (toutes fonctionnalités)

```
┌──────────────────────────────────────────────────────────────────┐
│                        SETUP (une fois)                           │
│                                                                   │
│  Admin se connecte à notebooklm.google.com → Extrait cookies     │
│  Cookies stockés dans n8n credentials ou variable d'environnement │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     UTILISATION (quotidienne)                     │
│                                                                   │
│  Utilisateur Discord                                              │
│       │                                                           │
│       ▼                                                           │
│  "/notebook slides Intelligence Artificielle"                     │
│       │                                                           │
│       ▼                                                           │
│  n8n Workflow                                                     │
│       │                                                           │
│       ▼                                                           │
│  HTTP Request + Cookies → notebooklm.google.com/batchexecute     │
│       │                                                           │
│       ▼                                                           │
│  Présentation créée → Lien renvoyé à l'utilisateur               │
└──────────────────────────────────────────────────────────────────┘
```

### Automatisation du Refresh des Cookies

Possibilité d'automatiser avec Playwright/Puppeteer :
1. Script qui se connecte à Google avec email/mot de passe
2. Extrait automatiquement les cookies
3. Les stocke pour n8n
4. Planifié chaque semaine via cron

---

## 5. Cas d'Usage avec API Interne

### Commandes Discord Possibles

| Commande | Action | Possible ? |
|----------|--------|------------|
| `/notebook create "Titre"` | Créer un notebook | ✅ |
| `/notebook add <url>` | Ajouter une source URL | ✅ |
| `/notebook upload` | Uploader un fichier | ✅ |
| `/notebook query "Question"` | Poser une question | ✅ |
| `/notebook slides` | Créer une présentation | ✅ |
| `/notebook video` | Créer une vidéo | ✅ |
| `/notebook report` | Créer un rapport | ✅ |
| `/notebook audio` | Créer un Audio Overview | ✅ |
| `/notebook link` | Obtenir le lien | ✅ |

**Toutes les fonctionnalités de NotebookLM sont accessibles via l'API interne.**

---

## 6. Questions Ouvertes

### Choix de l'API

1. **Quelle API utiliser ?**
   - [ ] API Enterprise (stable mais limitée, payante)
   - [ ] API Interne (complète mais non-officielle, gratuite)

2. **Si API Interne : acceptons-nous les risques ?**
   - [ ] Cookies à rafraîchir manuellement ou automatiser avec Playwright
   - [ ] API peut casser si Google change le site
   - [ ] Zone grise au niveau ToS

### Organisation

3. **Comment organiser les notebooks ?**
   - [ ] Un notebook par utilisateur Discord
   - [ ] Un notebook par sujet/projet
   - [ ] Un notebook partagé par serveur

4. **Où stocker les métadonnées (user → notebook_id) ?**
   - [ ] PostgreSQL
   - [ ] Redis

---

## 7. Estimation des Coûts

| Option | Coût |
|--------|------|
| API Enterprise | ~$30/user/mois |
| API Interne | Gratuit (tier personnel) |
| API Interne + NotebookLM Plus | ~$10/mois (limites augmentées) |

---

## 8. Implémentation Proposée

### Si on choisit l'API Interne

**Phase 1 : Setup (1 jour)**
1. Créer un compte Google dédié pour le bot
2. Se connecter à notebooklm.google.com
3. Extraire les cookies
4. Configurer dans n8n

**Phase 2 : Prototype (1 semaine)**
1. Workflow n8n : créer notebook + ajouter source + query
2. Tester la création de slides/vidéo/rapport
3. Intégrer avec Discord

**Phase 3 : Automatisation (optionnel)**
1. Script Playwright pour auto-refresh des cookies
2. Planification cron hebdomadaire

---

## 9. Références

### Documentation Officielle Google
- [NotebookLM Enterprise API - Notebooks](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks)
- [NotebookLM Enterprise API - Sources](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks-sources)
- [NotebookLM Enterprise API - Audio Overview](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-audio-overview)

### API Interne (reverse-engineering)
- [notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) - MCP server qui utilise l'API interne
- Analysé dans `.untracked/notebooklm-mcp-cli/` pour comprendre les RPC IDs

---

## 10. Décision

**À compléter après discussion d'équipe**

### Option recommandée

- [ ] **API Interne** : Toutes les fonctionnalités, gratuit, mais non-officiel
- [ ] **API Enterprise** : Stable mais limitée, payante
- [ ] **Reporter** : Attendre que l'API Enterprise expose query/studio

### Si API Interne choisie, risques acceptés

- [ ] Maintenance si Google change l'API
- [ ] Refresh manuel des cookies (ou automatisation Playwright)
- [ ] Zone grise ToS
