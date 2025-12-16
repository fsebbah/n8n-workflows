# P2-01: speaker_identifier_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-01 |
| **Nom** | speaker_identifier_tool |
| **Priorité** | Moyenne |
| **Statut** | A implémenter |
| **Catégorie** | Audio / Vocal |

## Description

Workflow n8n pour l'identification et la séparation des locuteurs dans un fichier audio (diarization). Utilise AssemblyAI comme provider principal avec support Whisper + pyannote comme alternative.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Provider principal | **AssemblyAI** | Diarization native, haute qualité |
| Alternative | Whisper + pyannote.audio | Open source, self-hosted |
| Transcription | AssemblyAI / Whisper | Incluse dans le processus |

## Endpoint

```
POST /webhook/speaker-identifier
Content-Type: application/json

{
  "source": "url" | "base64",
  "data": "<url_ou_base64_audio>",
  "options": {
    "speakers_expected": 2,
    "language": "fr" | "en" | "auto",
    "include_transcription": true,
    "include_timestamps": true,
    "min_speakers": 1,
    "max_speakers": 10
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "speakers": [
      {
        "id": "speaker_1",
        "label": "Speaker A",
        "total_speaking_time_ms": 45000,
        "percentage": 60
      },
      {
        "id": "speaker_2",
        "label": "Speaker B",
        "total_speaking_time_ms": 30000,
        "percentage": 40
      }
    ],
    "utterances": [
      {
        "speaker": "speaker_1",
        "text": "Bonjour, je suis ravi de vous accueillir aujourd'hui.",
        "start_ms": 0,
        "end_ms": 3500,
        "confidence": 0.95
      },
      {
        "speaker": "speaker_2",
        "text": "Merci beaucoup pour cette invitation.",
        "start_ms": 3800,
        "end_ms": 6200,
        "confidence": 0.92
      }
    ],
    "transcript_full": "Speaker A: Bonjour, je suis ravi...\nSpeaker B: Merci beaucoup...",
    "audio_duration_ms": 75000,
    "num_speakers_detected": 2
  },
  "meta": {
    "provider": "assemblyai",
    "execution_mode": "online",
    "processing_time_ms": 8500
  }
}
```

## Workflow Architecture

```
[Input Audio URL/Base64]
      │
      ▼
[IF] base64 ?
      │
      ├── OUI → [Upload to temp storage] → URL
      │
      └── NON → [Continue]
      │
      ▼
[HTTP Request] → AssemblyAI Transcribe API
      │
      ├── speaker_labels: true
      │
      ▼
[Poll] → Wait for completion (status: completed)
      │
      ▼
[Code Node] → Format speakers & utterances
      │
      ▼
[Output]
```

## AssemblyAI API Flow

```
1. POST /v2/transcript
   {
     "audio_url": "https://...",
     "speaker_labels": true,
     "speakers_expected": 2,
     "language_code": "fr"
   }

2. GET /v2/transcript/{id}
   → Poll until status == "completed"

3. Response includes:
   - utterances[] with speaker labels
   - words[] with speaker attribution
```

## Definition of Done

- [ ] Endpoint `POST /webhook/speaker-identifier`
- [ ] Support URL audio et base64
- [ ] Diarization avec labels speaker_1, speaker_2, etc.
- [ ] Transcription incluse avec attribution par locuteur
- [ ] Timestamps pour chaque segment
- [ ] Statistiques par locuteur (temps de parole, %)
- [ ] Support multilingue (FR, EN, auto-detect)
- [ ] Gestion audio long (> 1h) avec polling
- [ ] Tests: 2 locuteurs, audio long, langues différentes

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| 2 locuteurs | Interview simple | 2 speakers identifiés |
| 3+ locuteurs | Réunion | N speakers détectés |
| Mono-locuteur | Podcast solo | 1 speaker |
| Audio long | > 30 min | Polling OK |
| Chevauchement | Parole simultanée | Géré correctement |
| Faible qualité | Audio bruité | Résultat dégradé gracieusement |

## Dépendances

- **AssemblyAI API** - API Key requise
- Variables d'environnement:
  - `ASSEMBLYAI_API_KEY`

## Tarification AssemblyAI

| Feature | Prix |
|---------|------|
| Transcription | $0.00025/sec (~$0.90/h) |
| Speaker Labels | Inclus |
| Language Detection | Inclus |

## Alternative: Whisper + pyannote

Pour un déploiement self-hosted:

```python
# pyannote.audio pour diarization
from pyannote.audio import Pipeline

pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")
diarization = pipeline("audio.wav")

# Whisper pour transcription
import whisper
model = whisper.load_model("large-v3")
result = model.transcribe("audio.wav")
```

**Avantages**: Pas de coût API, données restent locales
**Inconvénients**: Nécessite GPU, plus complexe à déployer

## Notes d'implémentation

1. Uploader base64 vers S3/MinIO pour obtenir URL
2. Polling avec backoff exponentiel (start: 5s, max: 30s)
3. Timeout global: 30 min pour audio long
4. Cache les résultats (TTL 24h, clé = hash audio)
5. Normaliser les labels (Speaker A, B, C...)
6. Option export SRT/VTT avec locuteurs

## Formats audio supportés

| Format | Support |
|--------|---------|
| MP3 | ✅ |
| WAV | ✅ |
| M4A | ✅ |
| FLAC | ✅ |
| OGG | ✅ |
| WebM | ✅ |

## Références

- [TOOLS_WORKFLOWS_MAPPING.md](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md)
- [AssemblyAI Documentation](https://www.assemblyai.com/docs)
- [pyannote.audio](https://github.com/pyannote/pyannote-audio)
