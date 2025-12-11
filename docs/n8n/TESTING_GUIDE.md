# Guide de Test des Workflows n8n

Ce document explique comment tester les workflows n8n via les scripts Python fournis.

## Prérequis

1. **n8n en cours d'exécution** :
   ```bash
   ./scripts/n8n_debug.sh start
   ```

2. **Workflows importés et activés** :
   ```bash
   python3 scripts/n8n/n8n_api.py import workflows/<workflow>.json
   python3 scripts/n8n/n8n_api.py activate <workflow_id>
   ```

3. **Dépendances Python** :
   ```bash
   pip install requests
   ```

---

## Test Video Transcription

Script : `scripts/test/test_video_transcription.py`

### Paramètres

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `youtube_url` | URL YouTube (obligatoire) | - |
| `-o, --operation` | Opération à effectuer | `transcribe` |
| `-l, --language` | Langue de sortie | `auto` |
| `-f, --file` | Fichier de sortie | auto-généré |
| `-m, --model` | Modèle Gemini | `gemini-2.5-flash` |
| `-w, --webhook` | URL du webhook | `http://localhost:5678/webhook/video-transcription` |
| `-i, --instructions` | Instructions personnalisées | - |
| `--chunking` | Activer le découpage | `false` |
| `--chunk-duration` | Durée des chunks (min) | `10` |
| `--video-duration` | Durée totale vidéo (min) | requis si chunking |
| `-q, --quiet` | Sortie JSON uniquement | `false` |

### Opérations disponibles

| Opération | Description |
|-----------|-------------|
| `transcribe` | Transcription basique avec timestamps |
| `identifySpeakers` | Transcription avec diarisation des locuteurs |
| `extractOcr` | Extraction du texte visible (OCR) |
| `analyzeScene` | Analyse complète (transcription + locuteurs + OCR + scènes) |

### Exemples

```bash
# Transcription basique
python scripts/test/test_video_transcription.py "https://www.youtube.com/watch?v=VIDEO_ID"

# Identification des locuteurs (qui parle, nom, entreprise, rôle)
python scripts/test/test_video_transcription.py "https://youtu.be/VIDEO_ID" -o identifySpeakers

# Extraction OCR (texte visible à l'écran)
python scripts/test/test_video_transcription.py "https://youtu.be/VIDEO_ID" -o extractOcr

# Analyse complète en français
python scripts/test/test_video_transcription.py "https://www.youtube.com/watch?v=VIDEO_ID" -o analyzeScene -l fr

# Avec fichier de sortie personnalisé
python scripts/test/test_video_transcription.py "https://youtu.be/VIDEO_ID" -f docs/test/mon_transcript.json

# Vidéo longue avec chunking (45 minutes)
python scripts/test/test_video_transcription.py "https://youtu.be/VIDEO_ID" --chunking --video-duration 45

# Avec instructions personnalisées
python scripts/test/test_video_transcription.py "https://youtu.be/VIDEO_ID" -i "Focus on technical terms"
```

### Format de sortie

Le résultat JSON inclut :
- `transcripts` ou `task1_transcripts` : segments de transcription
- `task2_speakers` : informations sur les locuteurs (si `identifySpeakers`)
- `metadata` : informations sur le traitement
- `_execution` : temps d'exécution et timestamp

---

## Test Knowledge Graph

Script : `scripts/test/test_knowledge_graph.py`

### Paramètres

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `document` | Chemin fichier ou URL (obligatoire) | - |
| `-m, --config-mode` | Mode de configuration | `preset` |
| `-p, --preset` | Preset à utiliser | `business` |
| `--config` | Configuration JSON personnalisée | - |
| `-s, --simplify` | Simplifier le graphe | `false` |
| `-a, --analyze` | Générer une analyse | `false` |
| `--max-nodes` | Nombre max de nodes (simplification) | `30` |
| `-l, --language` | Langue d'analyse | `en` |
| `-f, --file` | Fichier de sortie | auto-généré |
| `-w, --webhook` | URL du webhook | `http://localhost:5678/webhook/knowledge-graph` |
| `--base64` | Envoyer en base64 | `false` |
| `-q, --quiet` | Sortie JSON uniquement | `false` |

### Presets disponibles

| Preset | Description | Types d'entités |
|--------|-------------|-----------------|
| `narrative` | Histoires, livres, récits | character, location, event, object |
| `business` | Documents business, rapports | organization, person, metric, concept, risk |
| `technical` | Documentation technique | service, api, database, component, protocol |
| `scientific` | Articles scientifiques | researcher, theory, study, finding, method |
| `legal` | Documents juridiques | law, regulation, party, obligation, right |

### Exemples

```bash
# Extraction basique avec fichier local
python scripts/test/test_knowledge_graph.py /path/to/document.pdf

# Depuis URL avec preset business
python scripts/test/test_knowledge_graph.py "https://example.com/report.pdf" -p business

# Document technique avec simplification
python scripts/test/test_knowledge_graph.py doc.pdf -p technical --simplify --max-nodes 20

# Analyse complète en français
python scripts/test/test_knowledge_graph.py document.pdf --simplify --analyze -l fr

# Configuration personnalisée
python scripts/test/test_knowledge_graph.py document.pdf \
  -m jsonConfig \
  --config '{"entityTypes": ["product", "feature", "user"], "relationTypes": ["has_feature", "used_by"]}'

# Envoi en base64 (pour fichiers locaux)
python scripts/test/test_knowledge_graph.py document.pdf --base64

# Fichier de sortie personnalisé
python scripts/test/test_knowledge_graph.py doc.pdf -f docs/test/mon_graphe.json
```

### Format de sortie

Le résultat JSON inclut :
- `graph` : nodes et edges du graphe
- `metadata` : statistiques et langue détectée
- `simplified` : graphe simplifié (si `--simplify`)
- `analysis` : analyse détaillée (si `--analyze`)
- `_execution` : temps d'exécution et timestamp

---

## Résultats des tests

Les résultats sont sauvegardés dans `docs/test/` par défaut.

### Structure des fichiers de sortie

```
docs/test/
├── transcript_<video_id>_<operation>_<timestamp>.json
├── graph_<document>_<preset>_<timestamp>.json
└── ...
```

### Informations d'exécution

Chaque fichier de résultat inclut un bloc `_execution` :

```json
{
  "_execution": {
    "elapsed_seconds": 45.23,
    "elapsed_formatted": "0m 45s",
    "timestamp": "2025-12-11T19:35:26.123456"
  }
}
```

---

## Dépannage

### Erreur de connexion

```
Error: Cannot connect to n8n webhook. Is the server running?
```

**Solution** : Vérifier que n8n est démarré :
```bash
./scripts/n8n_debug.sh status
```

### Erreur d'authentification

```
Gemini API error: Request had invalid authentication credentials
```

**Solution** : Vérifier les credentials Google Vertex AI dans n8n.

### Timeout

```
Error: Request timeout
```

**Solution** : Pour les vidéos/documents longs, augmenter le timeout ou utiliser le chunking.

### Node non reconnu

```
Unrecognized node type: n8n-nodes-xxx
```

**Solution** : Réinstaller le custom node :
```bash
cp -r custom-nodes/n8n-nodes-xxx ~/.n8n/nodes/
cd ~/.n8n/nodes && npm install
./scripts/n8n_debug.sh restart
```

---

## Voir aussi

- [Knowledge Graph MCP Server API](./knowledge-graph-mcp-server.md)
- [Video Transcription MCP Server API](./video-transcription-mcp-server.md)
- [Custom Node Development](./CUSTOM_NODE_DEVELOPMENT.md)
