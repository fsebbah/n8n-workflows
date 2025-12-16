# P2-12: image_generator_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-12 |
| **Nom** | image_generator_tool |
| **Priorité** | Moyenne |
| **Statut** | A implémenter |
| **Catégorie** | IA / Visual Media |

## Description

Workflow n8n pour la génération d'images via IA. Utilise OpenAI DALL-E 3 comme provider principal avec possibilité d'extension vers d'autres providers (Stable Diffusion, Midjourney API).

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Provider principal | **OpenAI DALL-E 3** | Qualité, API stable |
| Alternative | Stable Diffusion API | Open source, self-hosted |
| Node n8n | OpenAI node | Intégration native |

## Endpoint

```
POST /webhook/image-generator
Content-Type: application/json

{
  "prompt": "A serene landscape with mountains at sunset, digital art style",
  "options": {
    "provider": "openai" | "stability" | "auto",
    "model": "dall-e-3" | "dall-e-2",
    "size": "1024x1024" | "1792x1024" | "1024x1792",
    "quality": "standard" | "hd",
    "style": "vivid" | "natural",
    "n": 1,
    "response_format": "url" | "b64_json"
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "images": [
      {
        "url": "https://oaidalleapiprodscus.blob.core.windows.net/...",
        "b64_json": null,
        "revised_prompt": "A breathtaking serene landscape featuring majestic mountains...",
        "size": "1024x1024"
      }
    ],
    "prompt_original": "A serene landscape with mountains at sunset...",
    "prompt_revised": "A breathtaking serene landscape..."
  },
  "meta": {
    "provider": "openai",
    "model": "dall-e-3",
    "execution_mode": "online",
    "cost_estimate_usd": 0.04
  }
}
```

## Tailles supportées (DALL-E 3)

| Taille | Aspect Ratio | Usage |
|--------|--------------|-------|
| 1024x1024 | 1:1 | Standard, avatars |
| 1792x1024 | 16:9 | Paysage, bannières |
| 1024x1792 | 9:16 | Portrait, stories |

## Tarification DALL-E 3

| Qualité | Taille | Prix/image |
|---------|--------|------------|
| Standard | 1024x1024 | $0.04 |
| Standard | 1792x1024 | $0.08 |
| HD | 1024x1024 | $0.08 |
| HD | 1792x1024 | $0.12 |

## Definition of Done

- [ ] Endpoint `POST /webhook/image-generator`
- [ ] Support DALL-E 3 et DALL-E 2
- [ ] Toutes tailles supportées
- [ ] Qualité standard et HD
- [ ] Styles vivid et natural
- [ ] Retour URL ou base64
- [ ] Prompt révisé retourné
- [ ] Estimation coût incluse
- [ ] Tests: génération basique, différentes tailles, HD

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Basique | Prompt simple, 1024x1024 | Image générée |
| Paysage | 1792x1024 | Format correct |
| Portrait | 1024x1792 | Format correct |
| HD | quality=hd | Meilleure qualité |
| Base64 | response_format=b64_json | Données base64 |
| Prompt révisé | Prompt ambigu | revised_prompt différent |
| Erreur contenu | Prompt interdit | Erreur gracieuse |

## Dépendances

- **OpenAI API** - API Key requise
- **Node n8n** - OpenAI node (optionnel)
- Variables d'environnement:
  - `OPENAI_API_KEY`

## Prompt Engineering Tips

```
✅ BON:
- "A detailed oil painting of a cat wearing a crown, renaissance style"
- "Minimalist logo design for a tech startup, clean lines, blue and white"

❌ ÉVITER:
- "Generate an image" (redondant)
- Prompts trop courts sans contexte
- Demandes de célébrités ou personnes réelles
```

## Notes d'implémentation

1. Valider le prompt avant envoi (longueur, contenu)
2. Stocker les URLs temporaires (expiration ~1h)
3. Option téléchargement + stockage S3/local
4. Logger les coûts pour suivi budget
5. Cache désactivé (chaque génération unique)

## Content Policy

OpenAI applique des filtres de contenu. Erreurs possibles:
- `content_policy_violation`: Contenu interdit
- `rate_limit_exceeded`: Trop de requêtes

Gérer ces erreurs avec messages explicites.

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack IA & Contenu](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-ia--contenu--phase-2-p2-04-à-p2-13)
- [tools-complementaire.md](../n8n/tools-complementaire.md)
- [OpenAI DALL-E API](https://platform.openai.com/docs/guides/images)
