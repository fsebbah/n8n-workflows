# Issue #021 - Outils de Traduction Multi-LLM avec Validation

## Contexte

Créer un ensemble d'outils MCP pour la traduction de textes utilisant plusieurs LLM, avec des mécanismes de validation, révision et comparaison des résultats.

## Objectifs

1. **Traduction multi-modèles** : Utiliser plusieurs LLM pour traduire le même texte
2. **Validation croisée** : Comparer les traductions pour détecter les divergences
3. **Révision automatique** : Améliorer les traductions via un processus itératif
4. **Scoring qualité** : Évaluer la qualité des traductions

---

## Phases d'Implémentation

Le projet est découpé en 5 phases progressives :

| Phase | Issue | Description | Estimation |
|-------|-------|-------------|------------|
| **Phase 1** | [ISSUE_022](./ISSUE_022_TRANSLATE_PHASE1_CORE.md) | Core Node (translate, detect) | ~3h30 |
| **Phase 2** | [ISSUE_023](./ISSUE_023_TRANSLATE_PHASE2_MULTI_LLM.md) | Multi-LLM & Consensus | ~8h30 |
| **Phase 3** | [ISSUE_024](./ISSUE_024_TRANSLATE_PHASE3_VALIDATION.md) | Validation & Scoring | ~8h |
| **Phase 4** | [ISSUE_025](./ISSUE_025_TRANSLATE_PHASE4_REVISION.md) | Revision & Improvement | ~10h |
| **Phase 5** | [ISSUE_026](./ISSUE_026_TRANSLATE_PHASE5_MODES.md) | Specialized Modes | ~14h |
| | | **Total estimé** | **~44h** |

### Dépendances entre phases

```
Phase 1 (Core)
    ↓
Phase 2 (Multi-LLM)
    ↓
Phase 3 (Validation)
    ↓
Phase 4 (Revision)
    ↓
Phase 5 (Modes)
```

### Résumé par phase

**Phase 1 - Core Node**
- Opérations : `translate`, `detect`
- Provider : OpenAI uniquement
- Workflow MCP basique

**Phase 2 - Multi-LLM**
- Providers : OpenAI, Anthropic, Mistral
- Opérations : `translateMulti`, `compare`
- Algorithmes de consensus

**Phase 3 - Validation**
- Opérations : `validate`, `backTranslate`, `check`, `score`
- Vérification qualité et éléments spécifiques

**Phase 4 - Revision**
- Opérations : `revise`, `improve`, `merge`, `applyGlossary`
- Amélioration itérative

**Phase 5 - Modes**
- Modes : document, ui, email, technical, marketing
- Prompts et post-processing spécialisés

---

## Architecture Proposée

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MCP Translation Server                                │
│                     POST /webhook/mcp-translate                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ROUTER                                          │
│         resource: translation | validation | revision | comparison           │
└─────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │                    │
         ▼                    ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ Translation │      │ Validation  │      │  Revision   │      │ Comparison  │
│             │      │             │      │             │      │             │
│ • translate │      │ • validate  │      │ • revise    │      │ • compare   │
│ • batch     │      │ • score     │      │ • improve   │      │ • rank      │
│ • detect    │      │ • check     │      │ • merge     │      │ • consensus │
└─────────────┘      └─────────────┘      └─────────────┘      └─────────────┘
```

---

## Ressources et Opérations

### 1. Translation Resource

#### `translate` - Traduire un texte

Traduit un texte source vers une langue cible en utilisant un ou plusieurs LLM.

**Request:**
```json
{
  "resource": "translation",
  "operation": "translate",
  "text": "Hello, how are you today?",
  "source_lang": "en",
  "target_lang": "fr",
  "models": ["openai", "anthropic", "mistral"],
  "options": {
    "tone": "formal",
    "domain": "general",
    "preserve_formatting": true
  }
}
```

**Response:**
```json
{
  "source": {
    "text": "Hello, how are you today?",
    "lang": "en",
    "detected_lang": "en",
    "confidence": 0.99
  },
  "translations": [
    {
      "model": "openai",
      "model_version": "gpt-4o",
      "text": "Bonjour, comment allez-vous aujourd'hui ?",
      "lang": "fr",
      "processing_time_ms": 450,
      "tokens_used": 28
    },
    {
      "model": "anthropic",
      "model_version": "claude-3-5-sonnet",
      "text": "Bonjour, comment allez-vous aujourd'hui ?",
      "lang": "fr",
      "processing_time_ms": 380,
      "tokens_used": 32
    },
    {
      "model": "mistral",
      "model_version": "mistral-large",
      "text": "Bonjour, comment vas-tu aujourd'hui ?",
      "lang": "fr",
      "processing_time_ms": 320,
      "tokens_used": 25
    }
  ],
  "consensus": {
    "text": "Bonjour, comment allez-vous aujourd'hui ?",
    "agreement_score": 0.67,
    "divergences": ["tutoiement vs vouvoiement"]
  }
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Texte à traduire |
| `source_lang` | string | No | Langue source (auto-détection si omis) |
| `target_lang` | string | Yes | Langue cible (code ISO 639-1) |
| `models` | array | No | LLM à utiliser (default: ["openai"]) |
| `options.tone` | string | No | formal, informal, neutral |
| `options.domain` | string | No | general, legal, medical, technical, marketing |
| `options.preserve_formatting` | boolean | No | Conserver le formatage (default: true) |
| `options.glossary` | object | No | Termes à traduire de manière spécifique |

---

#### `batch` - Traduction par lot

Traduit plusieurs textes en une seule requête.

**Request:**
```json
{
  "resource": "translation",
  "operation": "batch",
  "items": [
    { "id": "1", "text": "Hello" },
    { "id": "2", "text": "Goodbye" },
    { "id": "3", "text": "Thank you" }
  ],
  "source_lang": "en",
  "target_lang": "fr",
  "model": "openai"
}
```

**Response:**
```json
{
  "results": [
    { "id": "1", "source": "Hello", "translation": "Bonjour" },
    { "id": "2", "source": "Goodbye", "translation": "Au revoir" },
    { "id": "3", "source": "Thank you", "translation": "Merci" }
  ],
  "stats": {
    "total": 3,
    "success": 3,
    "failed": 0,
    "total_tokens": 45,
    "processing_time_ms": 890
  }
}
```

---

#### `detect` - Détecter la langue

Détecte la langue d'un texte.

**Request:**
```json
{
  "resource": "translation",
  "operation": "detect",
  "text": "Bonjour, comment ça va ?"
}
```

**Response:**
```json
{
  "detected_lang": "fr",
  "confidence": 0.98,
  "alternatives": [
    { "lang": "fr", "confidence": 0.98 },
    { "lang": "ca", "confidence": 0.02 }
  ]
}
```

---

### 2. Validation Resource

#### `validate` - Valider une traduction

Vérifie la qualité d'une traduction existante.

**Request:**
```json
{
  "resource": "validation",
  "operation": "validate",
  "source_text": "The quick brown fox jumps over the lazy dog.",
  "source_lang": "en",
  "translation": "Le renard brun rapide saute par-dessus le chien paresseux.",
  "target_lang": "fr",
  "checks": ["accuracy", "fluency", "terminology", "style"]
}
```

**Response:**
```json
{
  "valid": true,
  "overall_score": 0.85,
  "checks": {
    "accuracy": {
      "score": 0.90,
      "issues": [],
      "status": "pass"
    },
    "fluency": {
      "score": 0.80,
      "issues": [
        {
          "type": "word_order",
          "severity": "minor",
          "description": "L'ordre des adjectifs pourrait être amélioré",
          "suggestion": "Le rapide renard brun"
        }
      ],
      "status": "warning"
    },
    "terminology": {
      "score": 0.85,
      "issues": [],
      "status": "pass"
    },
    "style": {
      "score": 0.85,
      "issues": [],
      "status": "pass"
    }
  },
  "back_translation": "The quick brown fox jumps over the lazy dog.",
  "semantic_similarity": 0.95
}
```

**Checks disponibles:**

| Check | Description |
|-------|-------------|
| `accuracy` | Fidélité au sens original |
| `fluency` | Naturel et lisibilité |
| `terminology` | Cohérence terminologique |
| `style` | Respect du ton et registre |
| `grammar` | Correction grammaticale |
| `completeness` | Aucune omission ou ajout |

---

#### `score` - Scorer une traduction (BLEU, METEOR, etc.)

Calcule des métriques de qualité automatiques.

**Request:**
```json
{
  "resource": "validation",
  "operation": "score",
  "reference": "Le renard brun rapide saute par-dessus le chien paresseux.",
  "candidate": "Le rapide renard brun saute au-dessus du chien fainéant.",
  "metrics": ["bleu", "meteor", "ter", "comet"]
}
```

**Response:**
```json
{
  "scores": {
    "bleu": 0.65,
    "meteor": 0.78,
    "ter": 0.25,
    "comet": 0.82
  },
  "interpretation": {
    "quality": "good",
    "recommendation": "La traduction est acceptable avec quelques variations lexicales"
  }
}
```

---

#### `check` - Vérifications spécifiques

Effectue des vérifications ciblées (nombres, dates, noms propres, etc.).

**Request:**
```json
{
  "resource": "validation",
  "operation": "check",
  "source_text": "The meeting is on January 15, 2025 at 3:00 PM with John Smith.",
  "translation": "La réunion est le 15 janvier 2025 à 15h00 avec Jean Dupont.",
  "check_types": ["numbers", "dates", "proper_nouns", "urls", "emails"]
}
```

**Response:**
```json
{
  "issues": [
    {
      "type": "proper_noun",
      "severity": "warning",
      "source": "John Smith",
      "translation": "Jean Dupont",
      "expected": "John Smith",
      "message": "Les noms propres ne doivent généralement pas être traduits"
    }
  ],
  "verified": {
    "numbers": { "status": "pass", "found": [] },
    "dates": { "status": "pass", "found": ["January 15, 2025 → 15 janvier 2025"] },
    "proper_nouns": { "status": "warning", "found": ["John Smith → Jean Dupont"] },
    "urls": { "status": "pass", "found": [] },
    "emails": { "status": "pass", "found": [] }
  }
}
```

---

### 3. Revision Resource

#### `revise` - Réviser une traduction

Améliore une traduction existante en corrigeant les problèmes identifiés.

**Request:**
```json
{
  "resource": "revision",
  "operation": "revise",
  "source_text": "Please ensure all safety protocols are followed.",
  "source_lang": "en",
  "translation": "S'il vous plaît, assurez que tous les protocoles de sécurité sont suivis.",
  "target_lang": "fr",
  "feedback": [
    "Manque le verbe 'vous' après 'assurez'",
    "Ton trop formel pour le contexte"
  ],
  "model": "anthropic"
}
```

**Response:**
```json
{
  "original_translation": "S'il vous plaît, assurez que tous les protocoles de sécurité sont suivis.",
  "revised_translation": "Veuillez vous assurer que tous les protocoles de sécurité sont respectés.",
  "changes": [
    {
      "type": "grammar",
      "original": "assurez que",
      "revised": "vous assurer que",
      "reason": "Ajout du pronom réfléchi manquant"
    },
    {
      "type": "style",
      "original": "S'il vous plaît",
      "revised": "Veuillez",
      "reason": "Forme plus concise et professionnelle"
    },
    {
      "type": "vocabulary",
      "original": "sont suivis",
      "revised": "sont respectés",
      "reason": "Terme plus approprié pour les protocoles"
    }
  ],
  "improvement_score": 0.15
}
```

---

#### `improve` - Amélioration itérative

Améliore une traduction via plusieurs passes jusqu'à atteindre un seuil de qualité.

**Request:**
```json
{
  "resource": "revision",
  "operation": "improve",
  "source_text": "The system encountered an unexpected error.",
  "translation": "Le système a rencontré une erreur inattendue.",
  "target_lang": "fr",
  "target_score": 0.90,
  "max_iterations": 3,
  "focus": ["fluency", "terminology"]
}
```

**Response:**
```json
{
  "iterations": [
    {
      "iteration": 1,
      "translation": "Le système a rencontré une erreur inattendue.",
      "score": 0.82,
      "changes": []
    },
    {
      "iteration": 2,
      "translation": "Une erreur inattendue s'est produite dans le système.",
      "score": 0.88,
      "changes": ["Restructuration pour plus de naturel"]
    },
    {
      "iteration": 3,
      "translation": "Le système a rencontré une erreur imprévue.",
      "score": 0.91,
      "changes": ["inattendue → imprévue (terme technique préféré)"]
    }
  ],
  "final_translation": "Le système a rencontré une erreur imprévue.",
  "final_score": 0.91,
  "target_reached": true
}
```

---

#### `merge` - Fusionner plusieurs traductions

Combine les meilleures parties de plusieurs traductions.

**Request:**
```json
{
  "resource": "revision",
  "operation": "merge",
  "source_text": "Welcome to our platform. We hope you enjoy your experience.",
  "translations": [
    {
      "model": "openai",
      "text": "Bienvenue sur notre plateforme. Nous espérons que vous apprécierez votre expérience."
    },
    {
      "model": "anthropic",
      "text": "Bienvenue sur notre plateforme. Nous espérons que votre expérience sera agréable."
    },
    {
      "model": "mistral",
      "text": "Bienvenue sur notre plate-forme. Nous espérons que vous profiterez de votre expérience."
    }
  ],
  "target_lang": "fr"
}
```

**Response:**
```json
{
  "merged_translation": "Bienvenue sur notre plateforme. Nous espérons que votre expérience sera agréable.",
  "sources": {
    "sentence_1": { "model": "openai", "text": "Bienvenue sur notre plateforme." },
    "sentence_2": { "model": "anthropic", "text": "Nous espérons que votre expérience sera agréable." }
  },
  "reasoning": "Phrase 1 de OpenAI (orthographe correcte de 'plateforme'), Phrase 2 d'Anthropic (formulation plus naturelle)",
  "quality_score": 0.92
}
```

---

### 4. Comparison Resource

#### `compare` - Comparer des traductions

Compare plusieurs traductions d'un même texte.

**Request:**
```json
{
  "resource": "comparison",
  "operation": "compare",
  "source_text": "Artificial intelligence is transforming industries worldwide.",
  "source_lang": "en",
  "translations": [
    { "id": "t1", "text": "L'intelligence artificielle transforme les industries à travers le monde.", "model": "openai" },
    { "id": "t2", "text": "L'intelligence artificielle est en train de transformer les industries dans le monde entier.", "model": "anthropic" },
    { "id": "t3", "text": "L'IA transforme les industries partout dans le monde.", "model": "mistral" }
  ],
  "target_lang": "fr"
}
```

**Response:**
```json
{
  "comparison": {
    "semantic_similarity_matrix": [
      [1.00, 0.95, 0.88],
      [0.95, 1.00, 0.85],
      [0.88, 0.85, 1.00]
    ],
    "key_differences": [
      {
        "aspect": "terminology",
        "variations": ["intelligence artificielle", "intelligence artificielle", "IA"],
        "note": "t3 utilise l'abréviation"
      },
      {
        "aspect": "tense",
        "variations": ["transforme", "est en train de transformer", "transforme"],
        "note": "t2 utilise le présent progressif"
      },
      {
        "aspect": "expression",
        "variations": ["à travers le monde", "dans le monde entier", "partout dans le monde"],
        "note": "Trois formulations équivalentes"
      }
    ]
  },
  "scores": {
    "t1": { "accuracy": 0.90, "fluency": 0.88, "overall": 0.89 },
    "t2": { "accuracy": 0.92, "fluency": 0.85, "overall": 0.88 },
    "t3": { "accuracy": 0.85, "fluency": 0.90, "overall": 0.87 }
  }
}
```

---

#### `rank` - Classer des traductions

Classe plusieurs traductions par qualité.

**Request:**
```json
{
  "resource": "comparison",
  "operation": "rank",
  "source_text": "Please contact customer support for assistance.",
  "translations": [
    { "id": "a", "text": "Veuillez contacter le support client pour obtenir de l'aide." },
    { "id": "b", "text": "Contactez le service clientèle pour assistance." },
    { "id": "c", "text": "Merci de contacter le support pour de l'aide." }
  ],
  "target_lang": "fr",
  "criteria": ["accuracy", "fluency", "formality"]
}
```

**Response:**
```json
{
  "ranking": [
    {
      "rank": 1,
      "id": "a",
      "text": "Veuillez contacter le support client pour obtenir de l'aide.",
      "scores": { "accuracy": 0.95, "fluency": 0.90, "formality": 0.92 },
      "overall": 0.92
    },
    {
      "rank": 2,
      "id": "b",
      "text": "Contactez le service clientèle pour assistance.",
      "scores": { "accuracy": 0.88, "fluency": 0.85, "formality": 0.88 },
      "overall": 0.87
    },
    {
      "rank": 3,
      "id": "c",
      "text": "Merci de contacter le support pour de l'aide.",
      "scores": { "accuracy": 0.80, "fluency": 0.88, "formality": 0.75 },
      "overall": 0.81
    }
  ],
  "analysis": {
    "best": "a",
    "reason": "Traduction complète et formelle, respecte le ton professionnel"
  }
}
```

---

#### `consensus` - Générer un consensus

Génère une traduction consensuelle à partir de plusieurs versions.

**Request:**
```json
{
  "resource": "comparison",
  "operation": "consensus",
  "source_text": "Error: File not found",
  "translations": [
    { "text": "Erreur : Fichier non trouvé", "weight": 1.0 },
    { "text": "Erreur : Fichier introuvable", "weight": 1.2 },
    { "text": "Erreur: Le fichier n'a pas été trouvé", "weight": 0.8 }
  ],
  "target_lang": "fr",
  "strategy": "weighted_vote"
}
```

**Response:**
```json
{
  "consensus_translation": "Erreur : Fichier introuvable",
  "confidence": 0.85,
  "strategy_used": "weighted_vote",
  "voting_details": {
    "Erreur : Fichier introuvable": { "votes": 1, "weight": 1.2, "final_score": 1.2 },
    "Erreur : Fichier non trouvé": { "votes": 1, "weight": 1.0, "final_score": 1.0 },
    "Erreur: Le fichier n'a pas été trouvé": { "votes": 1, "weight": 0.8, "final_score": 0.8 }
  },
  "alternatives": [
    { "text": "Erreur : Fichier non trouvé", "confidence": 0.80 }
  ]
}
```

---

## Configuration des Modèles LLM

### Modèles Supportés

| Provider | Modèles | Forces |
|----------|---------|--------|
| **OpenAI** | gpt-4o, gpt-4o-mini | Polyvalent, bonne qualité générale |
| **Anthropic** | claude-3-5-sonnet, claude-3-haiku | Excellent pour le contexte, nuances |
| **Mistral** | mistral-large, mistral-medium | Bon pour les langues européennes |
| **Google** | gemini-pro | Multilingue, rapide |
| **DeepL** | deepl-api | Spécialisé traduction |
| **Local** | llama, mixtral | Confidentialité, coût |

### Configuration par défaut

```json
{
  "models": {
    "openai": {
      "model": "gpt-4o-mini",
      "temperature": 0.3,
      "max_tokens": 4096
    },
    "anthropic": {
      "model": "claude-3-5-sonnet-20241022",
      "temperature": 0.3,
      "max_tokens": 4096
    },
    "mistral": {
      "model": "mistral-large-latest",
      "temperature": 0.3,
      "max_tokens": 4096
    }
  },
  "default_model": "openai",
  "fallback_models": ["anthropic", "mistral"]
}
```

---

## Modes de Traduction

Le paramètre `mode` ajuste automatiquement le comportement de la traduction selon le contexte.

### Modes disponibles

| Mode | Description | Paramètres auto-ajustés |
|------|-------------|------------------------|
| `document` | Documents longs (PDF, Word, articles) | Cohérence terminologique, glossaire persistant, contexte étendu |
| `ui` | Interface utilisateur (boutons, labels) | Contraintes de longueur, cohérence absolue, format clé/valeur |
| `email` | Emails et communication | Ton adapté, formatage préservé, signatures ignorées |
| `technical` | Documentation technique, API | Code non traduit, Markdown préservé, terminologie technique |
| `marketing` | Contenu commercial | Adaptation culturelle, ton persuasif, longueur flexible |

### Exemple avec mode

```json
{
  "resource": "translation",
  "operation": "translate",
  "text": "Click here to subscribe",
  "target_lang": "fr",
  "mode": "ui",
  "models": ["openai", "anthropic"]
}
```

### Détail des modes

#### Mode `document`
- **Contexte** : Traduction de documents longs nécessitant cohérence
- **Caractéristiques** :
  - Glossaire persistant sur tout le document
  - Traduction par sections avec mémoire du contexte
  - Même terme source = même traduction cible
  - Support des chapitres et références croisées
- **Prompt système** : Focus sur fidélité et cohérence terminologique
- **Température** : 0.2 (très conservateur)
- **Post-traitement** : Vérification de cohérence terminologique

```json
{
  "mode": "document",
  "options": {
    "glossary": {
      "software": "logiciel",
      "user": "utilisateur"
    },
    "preserve_structure": true,
    "chapter_context": true
  }
}
```

#### Mode `ui`
- **Contexte** : Traduction d'interfaces utilisateur
- **Caractéristiques** :
  - Textes courts (max 50 caractères recommandé)
  - Contraintes de longueur strictes
  - Format JSON clé/valeur supporté
  - Cohérence absolue entre écrans
- **Prompt système** : Concision, clarté, action
- **Température** : 0.1 (très déterministe)
- **Post-traitement** : Vérification longueur, suppression ponctuation superflue

```json
{
  "mode": "ui",
  "options": {
    "max_length": 30,
    "format": "json_kv",
    "context": "mobile_app"
  }
}
```

**Exemple batch UI :**
```json
{
  "resource": "translation",
  "operation": "batch",
  "mode": "ui",
  "items": [
    { "key": "btn.submit", "text": "Submit" },
    { "key": "btn.cancel", "text": "Cancel" },
    { "key": "label.email", "text": "Email address" },
    { "key": "error.required", "text": "This field is required" }
  ],
  "target_lang": "fr"
}
```

**Réponse :**
```json
{
  "results": [
    { "key": "btn.submit", "source": "Submit", "translation": "Envoyer" },
    { "key": "btn.cancel", "source": "Cancel", "translation": "Annuler" },
    { "key": "label.email", "source": "Email address", "translation": "Adresse e-mail" },
    { "key": "error.required", "source": "This field is required", "translation": "Ce champ est requis" }
  ]
}
```

#### Mode `email`
- **Contexte** : Traduction de correspondance
- **Caractéristiques** :
  - Détection automatique du ton (formel/informel)
  - Préservation du formatage (listes, paragraphes)
  - Gestion des signatures et formules de politesse
  - Adaptation des conventions culturelles
- **Prompt système** : Naturel, approprié au contexte
- **Température** : 0.3
- **Post-traitement** : Vérification salutations/signatures

```json
{
  "mode": "email",
  "options": {
    "tone": "formal",
    "preserve_signature": true,
    "adapt_greeting": true
  }
}
```

**Exemple :**
```json
{
  "text": "Hi John,\n\nPlease find attached the report.\n\nBest regards,\nMary",
  "mode": "email",
  "target_lang": "fr",
  "options": { "tone": "formal" }
}
```

**Réponse :**
```json
{
  "translation": "Bonjour Jean,\n\nVeuillez trouver ci-joint le rapport.\n\nCordialement,\nMary",
  "adaptations": [
    { "type": "greeting", "source": "Hi John", "target": "Bonjour Jean" },
    { "type": "closing", "source": "Best regards", "target": "Cordialement" }
  ]
}
```

#### Mode `technical`
- **Contexte** : Documentation technique, API, code
- **Caractéristiques** :
  - Code et exemples non traduits
  - Markdown/HTML préservé
  - Terminologie technique respectée
  - Liens et références maintenus
- **Prompt système** : Précision technique, clarté
- **Température** : 0.2
- **Post-traitement** : Vérification code intact, liens valides

```json
{
  "mode": "technical",
  "options": {
    "preserve_code_blocks": true,
    "preserve_urls": true,
    "domain": "software"
  }
}
```

**Exemple :**
```json
{
  "text": "Use the `translate()` function to convert text:\n\n```python\nresult = translate(text, target='fr')\n```\n\nSee [documentation](https://docs.example.com) for details.",
  "mode": "technical",
  "target_lang": "fr"
}
```

**Réponse :**
```json
{
  "translation": "Utilisez la fonction `translate()` pour convertir du texte :\n\n```python\nresult = translate(text, target='fr')\n```\n\nConsultez la [documentation](https://docs.example.com) pour plus de détails.",
  "preserved": {
    "code_blocks": 1,
    "inline_code": 1,
    "urls": 1
  }
}
```

#### Mode `marketing`
- **Contexte** : Contenu commercial, publicité
- **Caractéristiques** :
  - Adaptation culturelle (pas juste traduction)
  - Ton persuasif et engageant
  - Longueur flexible (peut être plus court ou plus long)
  - Jeux de mots et expressions adaptés
- **Prompt système** : Impact, persuasion, culture cible
- **Température** : 0.5 (plus créatif)
- **Post-traitement** : Score d'impact, alternatives créatives

```json
{
  "mode": "marketing",
  "options": {
    "brand_voice": "friendly",
    "target_audience": "young_professionals",
    "allow_adaptation": true
  }
}
```

**Exemple :**
```json
{
  "text": "Get more done. Stress less.",
  "mode": "marketing",
  "target_lang": "fr"
}
```

**Réponse :**
```json
{
  "translation": "Faites plus. Stressez moins.",
  "alternatives": [
    "Accomplissez davantage. Respirez.",
    "Plus productif. Plus serein.",
    "Travaillez mieux. Vivez mieux."
  ],
  "adaptation_notes": "Maintien du parallélisme et du rythme court"
}
```

---

## Cas d'Usage Concrets

### 1. Traduction Simple

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-translate \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "translation",
    "operation": "translate",
    "text": "Hello world",
    "target_lang": "fr"
  }'
```

### 2. Traduction Multi-LLM avec Validation

```bash
# Étape 1: Traduire avec plusieurs modèles
curl -X POST .../mcp-translate -d '{
  "resource": "translation",
  "operation": "translate",
  "text": "...",
  "target_lang": "fr",
  "models": ["openai", "anthropic", "mistral"]
}'

# Étape 2: Valider et scorer
curl -X POST .../mcp-translate -d '{
  "resource": "validation",
  "operation": "validate",
  "source_text": "...",
  "translation": "...",
  "checks": ["accuracy", "fluency"]
}'

# Étape 3: Réviser si nécessaire
curl -X POST .../mcp-translate -d '{
  "resource": "revision",
  "operation": "revise",
  "source_text": "...",
  "translation": "...",
  "feedback": ["..."]
}'
```

### 3. Pipeline de Traduction Professionnelle

```
Source Text
    │
    ▼
[Detect Language] ──► Auto-détection
    │
    ▼
[Translate Multi-LLM] ──► 3 traductions
    │
    ▼
[Compare & Rank] ──► Classement qualité
    │
    ▼
[Merge Best Parts] ──► Traduction optimale
    │
    ▼
[Validate] ──► Vérification finale
    │
    ▼
[Human Review] ──► Validation humaine (optionnel)
    │
    ▼
Final Translation
```

---

## Langues Supportées

### Tier 1 (Excellente qualité)
- `en` - English
- `fr` - Français
- `es` - Español
- `de` - Deutsch
- `it` - Italiano
- `pt` - Português
- `zh` - 中文
- `ja` - 日本語
- `ko` - 한국어

### Tier 2 (Bonne qualité)
- `ru` - Русский
- `ar` - العربية
- `nl` - Nederlands
- `pl` - Polski
- `tr` - Türkçe
- `vi` - Tiếng Việt
- `th` - ไทย
- `he` - עברית

### Tier 3 (Qualité variable)
- Autres langues ISO 639-1

---

## Implémentation Technique

### Structure du Custom Node

```
custom-nodes/
└── n8n-nodes-translate-dynamic/
    ├── package.json
    ├── tsconfig.json
    └── nodes/
        └── TranslateToolDynamic/
            ├── TranslateToolDynamic.node.ts
            └── translate.svg
```

### Dépendances

```json
{
  "dependencies": {
    "openai": "^4.x",
    "@anthropic-ai/sdk": "^0.x",
    "@mistralai/mistralai": "^1.x"
  }
}
```

### Workflow MCP

```
Webhook ──► Router ──► [Translation Nodes] ──► Response
                           │
                           ├── TranslateNode (multi-model)
                           ├── ValidateNode
                           ├── ReviseNode
                           └── CompareNode
```

---

## Métriques et Monitoring

### KPIs à suivre

| Métrique | Description |
|----------|-------------|
| Tokens utilisés | Coût par traduction |
| Temps de réponse | Latence par modèle |
| Score qualité | BLEU/COMET moyen |
| Taux de révision | % nécessitant révision |
| Consensus rate | % d'accord entre modèles |

### Logging

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "operation": "translate",
  "source_lang": "en",
  "target_lang": "fr",
  "models_used": ["openai", "anthropic"],
  "tokens_total": 156,
  "processing_time_ms": 1250,
  "quality_score": 0.89,
  "consensus_achieved": true
}
```

---

## Prérequis et Configuration

### Clés API Requises

| Provider | Variable d'environnement | Obligatoire | Obtenir |
|----------|-------------------------|-------------|---------|
| OpenAI | `OPENAI_API_KEY` | Oui (défaut) | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic | `ANTHROPIC_API_KEY` | Recommandé | [console.anthropic.com](https://console.anthropic.com/) |
| Mistral | `MISTRAL_API_KEY` | Optionnel | [console.mistral.ai](https://console.mistral.ai/) |

### Configuration n8n

Ajouter les clés dans les variables d'environnement n8n :

```bash
# ~/.bashrc ou fichier de config n8n
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export MISTRAL_API_KEY="..."
```

Ou via le fichier `.env` de n8n :

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=...
```

### Alternative : Clés passées dynamiquement

Les clés peuvent aussi être passées dans le body de la requête :

```json
{
  "resource": "translation",
  "operation": "translate",
  "text": "Hello",
  "target_lang": "fr",
  "api_keys": {
    "openai": "sk-...",
    "anthropic": "sk-ant-..."
  }
}
```

---

## Prochaines Étapes

1. [ ] Créer le custom node `n8n-nodes-translate-dynamic`
2. [ ] Implémenter les opérations de base (translate, detect)
3. [ ] Ajouter le support des modes (document, ui, email, technical, marketing)
4. [ ] Ajouter la validation et le scoring
5. [ ] Implémenter la révision et le merge
6. [ ] Créer le workflow MCP
7. [ ] Écrire la documentation API finale
8. [ ] Tests avec plusieurs langues
9. [ ] Optimisation des prompts par modèle et par mode

---

## Références

- [BLEU Score](https://en.wikipedia.org/wiki/BLEU)
- [COMET Metrics](https://github.com/Unbabel/COMET)
- [Google Translation API](https://cloud.google.com/translate)
- [DeepL API](https://www.deepl.com/docs-api)
