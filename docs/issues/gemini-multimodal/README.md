# Projet : Custom Nodes Gemini Multimodal

## Vue d'Ensemble

Ce dossier contient les issues détaillées pour le développement des custom nodes n8n intégrant les capacités multimodales de Google AI (Gemini, Veo 3).

## Documentation Obligatoire

> **AVANT DE COMMENCER LE DÉVELOPPEMENT** : Lire attentivement le guide de développement de custom nodes.

| Document | Chemin | Description |
|----------|--------|-------------|
| **Guide Custom Nodes** | [`docs/n8n/CUSTOM_NODE_DEVELOPMENT.md`](../../n8n/CUSTOM_NODE_DEVELOPMENT.md) | Structure, installation, erreurs courantes, checklist |

---

## Phases de Développement

| Phase | Node | Complexité | Durée | Statut |
|-------|------|------------|-------|--------|
| **1** | [n8n-nodes-google-genai-core](./PHASE-1-CORE.md) | ⭐ Simple | 3-4 jours | ⬜ À faire |
| **2** | [n8n-nodes-knowledge-graph](./PHASE-2-KNOWLEDGE-GRAPH.md) | ⭐⭐ Moyen | 4-5 jours | ⬜ À faire |
| **3** | [n8n-nodes-video-transcription](./PHASE-3-VIDEO-TRANSCRIPTION.md) | ⭐⭐ Moyen | 4-5 jours | ⬜ À faire |
| **4** | [n8n-nodes-gemini-image](./PHASE-4-GEMINI-IMAGE.md) | ⭐⭐⭐ Moyen+ | 5-7 jours | ⬜ À faire |
| **5** | [n8n-nodes-veo-video](./PHASE-5-VEO-VIDEO.md) | ⭐⭐⭐⭐ Complexe | 7-10 jours | ⬜ À faire |

**Durée totale estimée** : ~5-6 semaines

---

## Architecture des Dépendances

```
                    ┌─────────────────────────────┐
                    │  n8n-nodes-google-genai-core │
                    │  (Credentials, Client, GCS)  │
                    └──────────────┬──────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ knowledge-graph  │   │video-transcription│   │  gemini-image    │
│    (Phase 2)     │   │    (Phase 3)     │   │    (Phase 4)     │
└──────────────────┘   └──────────────────┘   └────────┬─────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │   veo-video      │
                                              │    (Phase 5)     │
                                              └──────────────────┘
```

---

## Ordre de Développement Recommandé

### Phase 1 : Core (Fondation)
- Pas de logique métier
- Credentials Vertex AI / AI Studio
- Client HTTP wrapper
- Utilitaires GCS, Polling

### Phase 2 : Knowledge Graph (Le plus simple)
- Text in → JSON out
- Pas de binaires
- Pas de polling long
- Valide l'architecture

### Phase 3 : Video Transcription (Multimodal simple)
- URL in → JSON out
- Introduit le multimodal (vidéo)
- Pas de génération de fichiers

### Phase 4 : Gemini Image (Binaires)
- Introduit la gestion des binaires
- Upload GCS
- Prépare les concepts pour Veo

### Phase 5 : Veo Video (Complet)
- Le plus complexe
- Polling long (1-3 min) via Celery
- Presets
- Combine toutes les briques

---

## Structure des Packages

```
custom-nodes/
├── n8n-nodes-google-genai-core/
│   ├── package.json
│   ├── credentials/
│   │   ├── GoogleVertexAiApi.credentials.ts
│   │   └── GoogleAiStudioApi.credentials.ts
│   ├── shared/
│   │   ├── GenAiClient.ts
│   │   ├── GcsUploader.ts
│   │   ├── PollingHelper.ts
│   │   └── types.ts
│   └── index.ts
│
├── n8n-nodes-knowledge-graph/
│   ├── package.json (depends: google-genai-core)
│   └── nodes/KnowledgeGraph/
│
├── n8n-nodes-video-transcription/
│   ├── package.json (depends: google-genai-core)
│   └── nodes/VideoTranscription/
│
├── n8n-nodes-gemini-image/
│   ├── package.json (depends: google-genai-core)
│   └── nodes/GeminiImage/
│
└── n8n-nodes-veo-video/
    ├── package.json (depends: google-genai-core)
    ├── nodes/VeoVideo/
    └── presets/veo-presets.json
```

---

## Liens Utiles

- **Synthèse Projet** : [`docs/gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md`](../../gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md)
- **Guide Custom Nodes** : [`docs/n8n/CUSTOM_NODE_DEVELOPMENT.md`](../../n8n/CUSTOM_NODE_DEVELOPMENT.md)
- **Colabs Source** : `docs/colab/`

---

## Changelog

| Date | Modification |
|------|--------------|
| 2025-12-09 | Création des issues par phase |
