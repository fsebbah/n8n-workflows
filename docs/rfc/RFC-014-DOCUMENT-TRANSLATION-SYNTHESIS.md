# RFC-014: Traduction et Synthèse de Documents

**Status:** Draft
**Date:** 2026-01-19
**Author:** Équipe Framework
**Version:** 2.1.0

---

## Résumé

Permettre aux utilisateurs Discord de soumettre des documents (PDF, images, DOCX, etc.) pour en obtenir une traduction ou une synthèse. Le traitement est entièrement délégué à n8n, avec un système de devis en crédits avant traitement.

---

## Problème

Actuellement, les utilisateurs ne peuvent pas :

1. **Soumettre des documents** pour traitement automatisé
2. **Obtenir une traduction** de documents dans une langue cible
3. **Obtenir une synthèse** de documents longs en différents formats
4. **Connaître le coût** avant de lancer le traitement

### Cas d'usage

| Situation | Besoin |
|-----------|--------|
| Document en anglais | Traduction vers le français |
| Rapport de 20 pages | Synthèse en points clés |
| Facture scannée | OCR + import en base de gestion |
| Présentation PPTX | Résumé exécutif |
| Photo d'un document | Extraction texte + traduction |
| Document complexe | Génération d'une infographie avec Gemini |

> **Note :** Ces exemples ne sont pas exhaustifs. Le système est conçu pour être extensible à d'autres types de traitements.

---

## Solution proposée

### Parcours utilisateur

```
1. Utilisateur : @Bot "traduis ce document" + fichier(s) joint(s)

2. Bot analyse la demande :
   ├── Éléments fournis ? (langue cible, format synthèse, etc.)
   └── Éléments manquants ?

3. Si éléments manquants → Dialogue interactif :
   Bot : "Dans quelle langue veux-tu la traduction ?"
   User : "En anglais"
   Bot : "Quel format de synthèse ?" (si synthèse demandée)
   etc.

4. Bot envoie à n8n pour estimation du coût

5. Bot présente le devis :
   "Ton document (12 pages) coûtera 45 crédits.
    Tu as actuellement 30 crédits."

   [Acheter des crédits] [Annuler]

   OU si assez de crédits :
   [Confirmer] [Annuler]

6. Traitement n8n (peut être long)
   └── Si traitement long : Message "Traitement en cours..."
       puis notification DM à l'utilisateur quand terminé

7. Réponse avec le résultat
   └── Option : Sauvegarder dans Google Drive (sur demande)
```

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DISCORD                                         │
│  @Bot "traduis ce document" + fichier.pdf                                   │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CHATBOT-CORE                                       │
│                                                                              │
│  DocumentService                                                             │
│  ├── Valide le format (PDF, DOCX, images, etc.)                             │
│  ├── Refuse les formats non supportés                                       │
│  ├── Transmet la demande à n8n (avec contexte plugin)                       │
│  ├── Affiche les questions retournées par n8n (si paramètres manquants)     │
│  ├── Affiche le devis (crédits)                                             │
│  ├── Gère l'achat de crédits si insuffisants                                │
│  └── Affiche le résultat / envoie DM si traitement long                     │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               N8N                                            │
│                                                                              │
│  Webhooks :                                                                  │
│  ├── documents/validate  → Valide les paramètres, retourne les manquants    │
│  ├── documents/estimate  → Calcul du coût en tokens/crédits                 │
│  ├── documents/process   → Traitement (OCR + traduction/synthèse)           │
│  └── documents/save      → Sauvegarde Google Drive (optionnel)              │
│                                                                              │
│  Responsabilités :                                                           │
│  ├── Validation des paramètres selon contexte plugin                        │
│  ├── Détection des éléments manquants ou erronés                            │
│  ├── Extraction texte (OCR si nécessaire)                                   │
│  ├── Détection langue source (peut être multiple)                           │
│  ├── Traitement IA (traduction / synthèse / autres)                         │
│  ├── Gestion documents longs (chunking sémantique)                          │
│  ├── Calcul coût en tokens → conversion crédits                             │
│  ├── Score de confiance OCR                                                 │
│  └── Sauvegarde Google Drive                                                │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SERVICES EXTERNES                                   │
│                                                                              │
│  ├── OCR : Mistral / Tesseract / Mathpix                                    │
│  ├── LLM : GPT-4 / Claude / Gemini                                          │
│  └── Stockage : Google Drive                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Validation des paramètres (côté n8n)

La détection des paramètres manquants est gérée **côté n8n** via un workflow de validation :

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Workflow : documents/validate                                               │
│                                                                              │
│  Entrée :                                                                    │
│  ├── Contexte plugin (types de traitements disponibles)                     │
│  ├── Paramètres fournis par l'utilisateur                                   │
│  └── Document(s) joint(s)                                                   │
│                                                                              │
│  Traitement :                                                                │
│  ├── Vérifie les paramètres obligatoires selon le type de traitement        │
│  ├── Valide les valeurs (langue existante, format valide, etc.)             │
│  └── Détecte les erreurs ou incohérences                                    │
│                                                                              │
│  Sortie :                                                                    │
│  ├── Si OK : { valid: true, can_proceed: true }                             │
│  └── Si manquant/erroné : { valid: false, missing: [...], errors: [...] }   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Avantages :**
- Chaque plugin peut définir ses propres types de traitements et paramètres obligatoires
- Traitements standards disponibles pour tous (traduction, synthèse)
- Traitements spécifiques par plugin (import base de gestion, génération infographie, etc.)
- Signalement immédiat des paramètres erronés ou incomplets

---

## Formats de fichiers supportés

| Format | Extensions | Supporté | Notes |
|--------|------------|----------|-------|
| PDF | .pdf | ✅ | Texte natif ou scanné (OCR) |
| Images | .png, .jpg, .jpeg, .webp | ✅ | OCR requis |
| Word | .docx | ✅ | Si n8n gère l'extraction |
| Excel | .xlsx, .csv | ✅ | Si n8n gère l'extraction |
| PowerPoint | .pptx | ✅ | Si n8n gère l'extraction |
| Markdown | .md | ✅ | Texte direct |
| **Autres** | * | ❌ | Refusés avec message explicite |

### Limites Discord

| Type de compte | Limite upload |
|----------------|---------------|
| Discord gratuit | 25 MB par fichier |
| Discord Nitro Basic | 50 MB par fichier |
| Discord Nitro | 500 MB par fichier |

### Limite documents (v1)

- **Maximum 10 pages** pour la v1
- Documents plus longs : message explicatif + suggestion de découper

---

## Paramètres obligatoires

### Pour la traduction

| Paramètre | Obligatoire | Collecte |
|-----------|-------------|----------|
| Document(s) | ✅ | Attachment Discord |
| Langue cible | ✅ | Dialogue si non précisé |
| Langue source | ❌ | Détection automatique (n8n) |

**Note :** La langue source peut être multiple dans un même document. Gestion côté n8n.

### Pour la synthèse

| Paramètre | Obligatoire | Collecte |
|-----------|-------------|----------|
| Document(s) | ✅ | Attachment Discord |
| Format de synthèse | ✅ | Dialogue si non précisé |
| Langue de sortie | ❌ | Défaut = langue source |
| Focus particulier | ❌ | Optionnel via dialogue |

---

## Formats de synthèse

5 formats proposés à l'utilisateur :

| Format | Description | Cas d'usage |
|--------|-------------|-------------|
| **Résumé express** | 2-3 phrases maximum. L'essentiel en 30 secondes de lecture. | Aperçu rapide |
| **Points clés** | Liste à puces des informations importantes. Idéal pour scanner rapidement. | Réunions, décisions |
| **Résumé structuré** | Plusieurs paragraphes organisés par thème. Lecture complète en 2-3 minutes. | Compréhension approfondie |
| **Plan détaillé** | Structure hiérarchique du document avec sous-points. | Comprendre l'organisation |
| **Extraction ciblée** | L'utilisateur précise ce qu'il cherche (ex: "aspects juridiques"). Synthèse focalisée. | Recherche spécifique |

---

## Gestion des langues

| Aspect | Comportement |
|--------|--------------|
| Langue source | Détection automatique par n8n |
| Multi-langues source | Géré par n8n (ex: contrat FR/EN) |
| Langue cible | Saisie libre par l'utilisateur (pas de liste fixe) |
| Langue synthèse | Par défaut = langue source, sinon sur demande |

---

## Gestion des crédits

### Calcul

1. n8n estime le coût en **tokens** (basé sur le document)
2. Conversion tokens → crédits selon règle à définir
3. Présentation du devis à l'utilisateur **avant** traitement

### Règle de conversion

> **À définir après premiers tests**
>
> Exemple : 1000 tokens = X crédits

### Flow crédits

```
1. Estimation n8n : "Ce document coûtera ~2500 tokens"
2. Conversion : 2500 tokens = 25 crédits
3. Vérification solde utilisateur
4. Si solde ≥ 25 : [Confirmer] [Annuler]
5. Si solde < 25 : "Tu as 15 crédits, il t'en manque 10"
                   [Acheter des crédits] [Annuler]
```

---

## Qualité OCR

### Score de confiance

n8n retourne toujours un score de confiance OCR dans la réponse.

| Confiance | Comportement |
|-----------|--------------|
| ≥ 80% | Traitement normal |
| < 80% | Avertissement : "Qualité de reconnaissance moyenne, le résultat peut contenir des erreurs" |

### Correction assistée (v2 - à étudier)

**Concept :** Pour les documents avec OCR incertain, retourner le texte avec des annotations/commentaires signalant les passages incertains.

| Format | Type d'annotation |
|--------|-------------------|
| PDF | Commentaires PDF natifs |
| DOCX | Commentaires Word / Mode révision |
| Markdown | `<!-- OCR incertain: "texte" -->` ou `[?texte?]` |

**Flow proposé :**
1. n8n fait l'OCR
2. Ajoute des commentaires sur les passages incertains
3. Retourne le fichier annoté
4. Utilisateur corrige dans son outil habituel
5. Renvoie le fichier corrigé
6. Traitement final

> **⚠️ À étudier côté n8n** : Faisabilité technique de l'ajout de commentaires programmatiquement dans PDF/DOCX/MD.

---

## Gestion des documents longs

### Problème

Les documents volumineux posent plusieurs défis :
- Temps de traitement long
- Dépassement du contexte LLM
- Perte de cohérence entre les sections

### Timeout Discord

| Étape | Délai |
|-------|-------|
| Réponse initiale | 3 secondes |
| Avec defer | 15 minutes |

**Solution :** Utiliser `@with_defer` puis éditer le message ou envoyer un DM.

### Notification utilisateur

| Situation | Action |
|-----------|--------|
| Traitement rapide | Réponse dans le salon |
| Traitement long | Message dans le salon "Traitement en cours..." puis **DM** quand terminé |

L'utilisateur est prévenu **dans le salon** que le traitement sera long et qu'il recevra un DM à la fin.

### Préservation de la structure (défi majeur)

> **⚠️ Point critique** : Les essais de traitement de documents longs ont révélé des difficultés à **préserver la structure du document en sortie**. De plus, les textes avec en-têtes et pieds de page posent problème : le texte se retrouve parfois mélangé.

#### Problèmes identifiés

| Problème | Description |
|----------|-------------|
| Perte de structure | La mise en forme (titres, paragraphes, listes) n'est pas préservée en sortie |
| En-têtes/pieds de page | Le texte des headers/footers se mélange au contenu principal |
| Chunking naïf | Découpage par tokens → coupe au milieu des phrases/idées |
| Perte de hiérarchie | Le LLM ne sait plus qu'un paragraphe appartient à une section |

#### Pistes de solutions (à soumettre à n8n)

**A. Chunking sémantique**
- Découper par sections/chapitres (détecter les titres)
- Garder les paragraphes entiers
- Préserver les listes complètes

**B. Contexte hiérarchique**
```
Pour chaque chunk, envoyer au LLM :
1. Le plan général du document (titres de toutes les sections)
2. La section actuelle avec son contexte parent
3. Un résumé des sections précédentes
```

**C. Map-Reduce avec fusion intelligente**
```
Phase 1 (Map) : Traiter chaque section indépendamment
Phase 2 (Reduce) : Fusionner en préservant la cohérence
```

**D. Deux passes**
```
Passe 1 : Analyse structurelle → créer un "squelette"
Passe 2 : Traitement avec le squelette en contexte
```

**D bis. Révision et correction (textes complexes)**

Pour les documents complexes ou exigeant une qualité élevée, proposer à l'utilisateur d'ajouter des passes supplémentaires :

```
Passe 1 : Traitement initial (traduction/synthèse)
Passe 2 : Révision par un second LLM (vérification cohérence, style)
Passe 3 : Correction finale (orthographe, grammaire, mise en forme)
```

> **Note :** Chaque passe supplémentaire augmente le coût. L'utilisateur doit être informé du surcoût avant de choisir cette option.

| Option | Passes | Coût estimé |
|--------|--------|-------------|
| Standard | 1 | Base |
| Avec révision | 2 | Base × 1.5 |
| Avec révision + correction | 3 | Base × 2 |

**E. Glossaire pour traduction**
- Maintenir un glossaire des termes traduits
- Assurer la cohérence ("API" reste "API" partout)

---

## Sécurité et confidentialité

### Mesures

| Mesure | Description |
|--------|-------------|
| Pas de stockage local | Fichier traité en mémoire, supprimé après |
| URLs éphémères | URLs Discord expirent après ~24h |
| Logs minimaux | Ne pas logger le contenu, seulement métadonnées |
| HTTPS obligatoire | Chiffrement en transit vers n8n |
| Limite journalière | Par utilisateur (à définir) |

### Google Drive

- Sauvegarde **sur demande uniquement** (pas automatique)
- L'utilisateur choisit de sauvegarder dans son Drive
- Lien retourné dans la réponse

### Avertissement utilisateur

> "Ne soumettez pas de documents confidentiels ou sensibles."

---

## Intégration avec l'existant

### MentionService (RFC-007)

Le traitement de documents s'intègre dans le `MentionService` existant :

```
User: @Bot "traduis ce document" + fichier.pdf
           │
           ▼
MentionService.on_message()
           │
           ├── Détecte intent = "document_processing"
           │
           └── Délègue à DocumentService
```

### Mémoire conversationnelle (RFC-011)

Le dialogue pour collecter les paramètres utilise la mémoire conversationnelle :

```
User: @Bot traduis ce doc
Bot: Dans quelle langue ? 🧵 abc123

User: @Bot [abc123] en anglais
Bot: (comprend le contexte) OK, traitement...
```

---

## Webhooks n8n

### 1. `documents/validate`

**Request :**
```json
{
  "file_url": "https://cdn.discord.com/attachments/.../file.pdf",
  "file_type": "pdf",
  "action": "translate",
  "params": {
    "target_language": "en"
  },
  "guild_id": "123456789",
  "user_id": "987654321",
  "plugin_context": {
    "available_actions": ["translate", "summarize", "import_invoice"],
    "required_params": {
      "translate": ["target_language"],
      "summarize": ["format"],
      "import_invoice": ["database_type"]
    }
  }
}
```

**Response (valide) :**
```json
{
  "valid": true,
  "can_proceed": true
}
```

**Response (manquant/erreur) :**
```json
{
  "valid": false,
  "missing": ["target_language"],
  "errors": [],
  "questions": [
    {
      "param": "target_language",
      "question": "Dans quelle langue veux-tu la traduction ?",
      "type": "text"
    }
  ]
}
```

### 2. `documents/estimate`

**Request :**
```json
{
  "file_url": "https://cdn.discord.com/attachments/.../file.pdf",
  "file_type": "pdf",
  "action": "translate",
  "target_language": "en",
  "guild_id": "123456789",
  "user_id": "987654321"
}
```

**Response :**
```json
{
  "success": true,
  "estimated_tokens": 2500,
  "estimated_credits": 25,
  "page_count": 8,
  "detected_language": "fr",
  "ocr_required": false
}
```

### 3. `documents/process`

**Request :**
```json
{
  "file_url": "https://cdn.discord.com/attachments/.../file.pdf",
  "file_type": "pdf",
  "action": "translate",
  "target_language": "en",
  "guild_id": "123456789",
  "user_id": "987654321",
  "confirmed": true
}
```

**Response :**
```json
{
  "success": true,
  "result": "Translated text content...",
  "tokens_used": 2450,
  "credits_consumed": 24,
  "ocr_confidence": 0.95,
  "processing_time_ms": 15000
}
```

### 4. `documents/save` (optionnel)

**Request :**
```json
{
  "content": "Translated text...",
  "filename": "document_translated.txt",
  "user_id": "987654321",
  "guild_id": "123456789"
}
```

**Response :**
```json
{
  "success": true,
  "drive_url": "https://drive.google.com/file/d/xxx/view"
}
```

---

## Responsabilités par équipe

### Équipe chatbot-core (Framework)

| Composant | Responsabilité |
|-----------|----------------|
| `DocumentService` | Orchestration du flow de traitement |
| `DocumentConfig` | Configuration (formats acceptés, limites, etc.) |
| Validation format | Vérifier type MIME, refuser formats non supportés |
| Transmission à n8n | Envoyer la demande avec contexte plugin |
| Affichage questions | Présenter les questions retournées par n8n (paramètres manquants) |
| Affichage devis | Présenter le coût en crédits |
| Gestion crédits | Vérifier solde, proposer achat si insuffisant |
| Notification DM | Envoyer le résultat en DM si traitement long |
| Intégration MentionService | Détecter intent "document_processing" |

> **Note :** La validation des paramètres obligatoires et la détection des erreurs sont gérées côté **n8n**, pas chatbot-core.

### Équipe n8n

| Webhook | Responsabilité |
|---------|----------------|
| `documents/validate` | Valider les paramètres, retourner les manquants/erreurs |
| `documents/estimate` | Estimer le coût (tokens, pages, OCR requis) |
| `documents/process` | Traitement complet (OCR + IA) |
| `documents/save` | Sauvegarde Google Drive |

| Traitement | Responsabilité |
|------------|----------------|
| Validation paramètres | Selon contexte plugin, signaler erreurs/manquants |
| Extraction texte | PDF, DOCX, XLSX, PPTX, images, MD |
| OCR | Mistral / Tesseract / Mathpix |
| Détection langue | Source (peut être multiple) |
| Traduction | LLM avec préservation structure |
| Synthèse | LLM avec 5 formats proposés |
| Traitements spécifiques | Import base de gestion, génération infographie, etc. |
| Chunking sémantique | Préservation de la structure pour docs longs |
| Score confiance OCR | Retourner dans chaque réponse |
| Calcul coût | Tokens → crédits |
| Révision/Correction | Passes supplémentaires pour qualité élevée (v2) |
| Correction assistée | Ajout commentaires sur passages incertains (v2) |
| Batch documents longs | Traitement par lots avec notification |

### Équipe API

| Composant | Responsabilité |
|-----------|----------------|
| Crédits | Vérification solde, débit après traitement |
| Achat crédits | Flow existant |
| (Optionnel) Logs | Stockage métadonnées des traitements |

### Équipe Plugins

| Tâche | Responsabilité |
|-------|----------------|
| Configuration | Activer/désactiver le traitement de documents |
| Personnalisation | Messages, limites spécifiques au plugin |
| Webhooks | URL n8n spécifique (si différent du défaut) |

> **Note :** Normalement tout passe par chatbot-core. Les plugins n'ont pas de webhooks spécifiques pour v1.

---

## Questions en suspens

### Pour l'équipe n8n

| # | Question | Contexte |
|---|----------|----------|
| 1 | **Workflow validation** : Pouvez-vous implémenter un workflow `documents/validate` qui reçoit un contexte plugin (actions disponibles, paramètres requis) et retourne les paramètres manquants/erronés ? | Validation paramètres |
| 2 | **Traitements par plugin** : Comment gérer les traitements standards (traduction, synthèse) vs les traitements spécifiques par plugin (import facture, génération infographie) ? | Extensibilité |
| 3 | **Extraction texte** : Pouvez-vous extraire le texte de PDF, DOCX, XLSX, PPTX, images, MD ? | Formats supportés |
| 4 | **Correction assistée** : Est-il faisable d'ajouter des commentaires programmatiquement dans PDF/DOCX pour signaler les passages OCR incertains ? | Qualité OCR |
| 5 | **Préservation structure** : Quelle stratégie pour garder la structure du document en sortie ? Les en-têtes/pieds de page se mélangent actuellement au contenu. | Documents longs |
| 6 | **Multi-langues** : Comment gérer un document avec plusieurs langues sources ? | Détection langue |
| 7 | **Batch** : Comment notifier chatbot-core quand un traitement long est terminé ? (callback ? polling ?) | Documents volumineux |
| 8 | **Révision/Correction** : Est-il envisageable d'implémenter des passes supplémentaires (révision, correction) pour les textes complexes ? | Qualité haute |
| 9 | **Google Drive** : Avez-vous déjà une intégration Google Drive fonctionnelle ? | Sauvegarde |

### Pour l'équipe API

| # | Question | Contexte |
|---|----------|----------|
| 1 | **Conversion tokens → crédits** : Quelle règle appliquer ? | Après premiers tests |
| 2 | **Logs traitements** : Faut-il stocker les métadonnées des traitements (comme mention_logs) ? | Analytics |

### Pour l'équipe Plugins

| # | Question | Contexte |
|---|----------|----------|
| 1 | **Besoins spécifiques** : Y a-t-il des besoins particuliers pour certains plugins ? | Personnalisation |

### Décisions à prendre ensemble

| # | Décision | Options |
|---|----------|---------|
| 1 | **Limite journalière** | X pages/jour ? X crédits/jour ? Pas de limite ? |
| 2 | **Limite taille document** | 10 pages v1 ? 20 pages ? Configurable ? |
| 3 | **Notification traitement long** | DM uniquement ? DM + salon ? Configurable ? |

---

## Plan de travail

### Phase 1 : Fondations (parallélisable)

#### chatbot-core

| # | Tâche | Effort | Dépendance |
|---|-------|--------|------------|
| 1.1 | `DocumentConfig` dataclass | S | - |
| 1.2 | `DocumentContext` dataclass | S | - |
| 1.3 | `DocumentResult` dataclass | S | - |
| 1.4 | Validation formats (MIME type) | M | - |
| 1.5 | `DocumentService` (orchestration) | L | 1.1-1.4 |
| 1.6 | Affichage questions (retournées par n8n) | M | 1.5, RFC-011 |
| 1.7 | Affichage devis + confirmation | M | 1.5 |
| 1.8 | Notification DM (traitement long) | M | 1.5 |
| 1.9 | Intégration MentionService | M | 1.5, RFC-007 |
| 1.10 | Tests unitaires | M | 1.5-1.9 |

#### n8n

| # | Tâche | Effort | Dépendance |
|---|-------|--------|------------|
| 2.1 | Webhook `documents/validate` (validation paramètres) | M | - |
| 2.2 | Webhook `documents/estimate` | M | - |
| 2.3 | Extraction texte PDF | M | - |
| 2.4 | Extraction texte DOCX/XLSX/PPTX | M | - |
| 2.5 | OCR images | M | - |
| 2.6 | Détection langue | S | 2.3-2.5 |
| 2.7 | Traduction (LLM) | M | 2.6 |
| 2.8 | Synthèse 5 formats (LLM) | M | 2.6 |
| 2.9 | Calcul coût tokens | S | 2.3-2.5 |
| 2.10 | Webhook `documents/process` | L | 2.1-2.9 |
| 2.11 | Score confiance OCR | S | 2.5 |
| 2.12 | Webhook `documents/save` (Google Drive) | M | - |
| 2.13 | Tests workflows | M | 2.1-2.12 |

#### API

| # | Tâche | Effort | Dépendance |
|---|-------|--------|------------|
| 3.1 | Endpoint vérification crédits (si pas existant) | S | - |
| 3.2 | Endpoint débit crédits (si pas existant) | S | - |
| 3.3 | (Optionnel) Table `document_logs` | M | - |

### Phase 2 : Intégration

| # | Tâche | Équipes | Effort |
|---|-------|---------|--------|
| 4.1 | Connecter chatbot-core → n8n `/estimate` | chatbot-core + n8n | M |
| 4.2 | Connecter chatbot-core → n8n `/process` | chatbot-core + n8n | M |
| 4.3 | Connecter chatbot-core → API crédits | chatbot-core + API | S |
| 4.4 | Connecter n8n → Google Drive | n8n | M |
| 4.5 | Tests E2E | Tous | L |

### Phase 3 : Évolutions (v2)

| # | Tâche | Priorité |
|---|-------|----------|
| 5.1 | Préservation structure (chunking sémantique) | P1 |
| 5.2 | Révision/Correction multi-passes | P2 |
| 5.3 | Correction assistée (commentaires OCR) | P2 |
| 5.4 | Documents > 10 pages (batch) | P2 |
| 5.5 | Q&A sur document (RAG) | P3 |
| 5.6 | Export PDF du résultat | P3 |
| 5.7 | Extraction données structurées (JSON) | P3 |
| 5.8 | Génération infographie (Gemini) | P3 |

---

## Risques identifiés

| Risque | Impact | Mitigation |
|--------|--------|------------|
| OCR de mauvaise qualité | Résultat inutilisable | Score confiance + avertissement utilisateur |
| Temps traitement long | UX dégradée | Notification DM + message "en cours" |
| Coût LLM élevé | Budget | Devis avant traitement + plafond |
| Perte contexte docs longs | Résultat incohérent | Limiter à 10 pages v1, itérer sur chunking |
| Formats non supportés par n8n | Fonctionnalité réduite | Valider avec n8n avant dev |
| Abus (spam documents) | Surcharge | Limite journalière + crédits |

---

## Réponse équipe n8n

**Date :** 2026-01-19
**Auteur :** Équipe n8n

---

### 1. Points de concordance - Ce qui existe déjà

L'analyse de l'infrastructure n8n actuelle révèle une **excellente couverture** des besoins exprimés. Voici les workflows **actifs** qui répondent directement à cette RFC :

| Besoin RFC | Workflow existant | Webhook | Status |
|------------|-------------------|---------|--------|
| OCR images | `MCP - Image OCR` | `/webhook/image-ocr` | ✅ Actif |
| OCR Google Drive | `MCP - Google Drive OCR` | `/webhook/google-drive-ocr` | ✅ Actif |
| Extraction tableaux | `MCP - Table Extractor` | `/webhook/table-extractor` | ✅ Actif |
| OCR mathématiques | `MCP - Mathpix` | `/webhook/mathpix` | ✅ Actif |
| Traduction + préservation mise en page | `MCP - PDF Layout Translator` | `/webhook/pdf-layout-translator` | ✅ Actif |
| Registre des outils | `MCP - Registry` | `/webhook/mcp-registry` | ✅ Actif |

#### Capacités techniques déjà opérationnelles

| Capacité | Implémentation | Notes |
|----------|----------------|-------|
| **OCR Mistral** | `mistral-ocr-latest` via API | Endpoint dédié `/v1/ocr` |
| **OCR Vision** | `pixtral-12b-2409` | Pour extraction structurée (PDF Layout Translator) |
| **OCR Mathpix** | API Mathpix | LaTeX, AsciiMath, MathML |
| **Préservation structure** | Prompts structurés | Headers, listes, tableaux markdown, formules LaTeX |
| **Score confiance OCR** | Retourné dans les réponses | Via `usage` et métadonnées Mistral |
| **Google Drive** | OAuth2 intégré | List + Download + Upload |
| **Gestion erreurs** | Validation entrées | Codes HTTP 400/500 avec messages explicites |

---

### 2. Réponses aux questions

#### Question 1 : Workflow `documents/validate`

> **Réponse : OUI, faisable**

Nous avons déjà un pattern de validation dans nos workflows (ex: `MCP - Image OCR` ligne 24-52). Le workflow `MCP - Registry` peut servir de base pour un système de validation dynamique selon le contexte plugin.

**Proposition d'implémentation :**
```
Entrée : { action, params, plugin_context }
        ↓
Switch par action (translate, summarize, custom)
        ↓
Vérification paramètres requis selon plugin_context.required_params[action]
        ↓
Sortie : { valid, missing[], errors[], questions[] }
```

**Effort estimé :** M (Medium)

---

#### Question 2 : Traitements par plugin

> **Réponse : Architecture extensible via contexte**

**Proposition :**

| Type | Gestion |
|------|---------|
| **Standards** (translate, summarize) | Workflows génériques, disponibles pour tous |
| **Spécifiques** (import_invoice, infographie) | Routage via `plugin_context.custom_actions` vers webhooks dédiés |

Le workflow `documents/process` peut agir comme **routeur** :
```
Si action ∈ ["translate", "summarize"] → traitement interne
Sinon → déléguer à webhook plugin (si défini dans plugin_context.webhook_url)
```

---

#### Question 3 : Extraction texte multi-formats

> **Réponse : Partiellement couvert, extensions nécessaires**

| Format | Status | Solution |
|--------|--------|----------|
| **PDF** | ✅ Opérationnel | Mistral OCR (natif ou scanné) |
| **Images** | ✅ Opérationnel | Mistral OCR / Mathpix |
| **DOCX** | ⚠️ À implémenter | Node `mammoth` ou extraction XML |
| **XLSX** | ⚠️ À implémenter | Node `xlsx` / SheetJS |
| **PPTX** | ⚠️ À implémenter | Extraction XML + images |
| **MD** | ✅ Trivial | Lecture directe |

**Effort pour DOCX/XLSX/PPTX :** M chacun (nodes npm existants)

---

#### Question 4 : Correction assistée (commentaires OCR incertains)

> **Réponse : Faisable avec nuances**

| Format | Faisabilité | Méthode |
|--------|-------------|---------|
| **PDF** | ❌ Difficile | Librairies limitées pour ajout commentaires programmatiques |
| **DOCX** | ✅ Faisable | Via `docx` npm - commentaires Word natifs |
| **Markdown** | ✅ Simple | `<!-- OCR incertain: "texte" -->` ou `[?texte?]` |

**Recommandation v1 :**
- Retourner les passages incertains dans un champ `uncertain_segments[]` de la réponse
- Laisser chatbot-core présenter ces incertitudes à l'utilisateur
- Reporter la génération de fichiers annotés à v2

---

#### Question 5 : Préservation structure

> **Réponse : Stratégie déjà implémentée dans `pdf-layout-translator`**

Notre workflow utilise un prompt structuré qui préserve :
- Headers et titres
- Paragraphes
- Listes (à puces et numérotées)
- Tableaux (format markdown)
- Formules mathématiques (LaTeX `$inline$` et `$$display$$`)

**Extrait du prompt actuel :**
```
Extract all text content from this PDF page. Preserve the structure including:
- Headers and titles
- Paragraphs
- Lists (bulleted and numbered)
- Tables (in markdown format)
- Math formulas (in LaTeX format: $inline$ or $$display$$)
```

**Pour les documents longs (problème en-têtes/pieds de page) :**

| Piste | Proposition |
|-------|-------------|
| **Chunking sémantique** | Pré-analyse avec prompt "détecte la structure" puis traitement par section |
| **Filtrage headers/footers** | Prompt additionnel : "Ignore les éléments répétés en haut/bas de chaque page" |
| **Map-Reduce** | Phase 1 = OCR par page, Phase 2 = fusion avec contexte global |

**Recommandation :** Option B (contexte hiérarchique) + D (deux passes) semblent les plus prometteuses

---

#### Question 6 : Documents multi-langues

> **Réponse : Géré nativement par les LLM**

Les modèles Mistral et GPT-4 détectent automatiquement les langues. Pour un document FR/EN :
```json
{
  "detected_languages": ["fr", "en"],
  "primary_language": "fr",
  "confidence": 0.92
}
```

**Pas de développement spécifique requis.**

---

#### Question 7 : Notification traitement long (callback vs polling)

> **Réponse : Callback webhook recommandé**

| Méthode | Avantages | Inconvénients |
|---------|-----------|---------------|
| **Callback** | Notification immédiate, pas de charge polling | chatbot-core doit exposer un endpoint |
| **Polling** | Simple à implémenter | Latence, charge serveur |

**Proposition :**
```
1. chatbot-core envoie: { ..., callback_url: "https://api.../document-ready" }
2. n8n traite en async
3. n8n POST vers callback_url avec le résultat
```

**Alternative :** File Redis/RabbitMQ si callback impossible

---

#### Question 8 : Révision/Correction multi-passes

> **Réponse : OUI, faisable**

Pipeline proposé :
```
Passe 1 : Mistral OCR → texte brut
Passe 2 : GPT-4 révision (cohérence, style)
Passe 3 : Claude correction (orthographe, grammaire)
```

**Déjà partiellement implémenté** dans `pdf-layout-translator` (OCR Mistral → Traduction GPT-4o).

| Option | Passes | Multiplicateur coût |
|--------|--------|---------------------|
| Standard | 1 | ×1 |
| Avec révision | 2 | ×1.5 |
| Avec révision + correction | 3 | ×2 |

---

#### Question 9 : Google Drive

> **Réponse : OUI, intégration fonctionnelle**

Le workflow `MCP - Google Drive OCR` implémente déjà :
- Authentification OAuth2
- Listage de fichiers/dossiers
- Téléchargement de fichiers
- **Upload à ajouter** pour la sauvegarde (effort : S)

---

### 3. Points de vigilance et contradictions

#### ⚠️ Limite 10 pages : Conservatrice mais sage

La limite de 10 pages pour v1 est **appropriée**. Nos tests montrent :
- Mistral OCR : ~3-5 sec/page
- 10 pages = 30-50 sec de traitement OCR seul
- + traduction/synthèse = potentiellement > 2 min

**Recommandation :** Maintenir 10 pages v1, prévoir batch v2

---

#### ⚠️ Timeout Discord vs réalité

| Scénario | Temps estimé | Timeout Discord |
|----------|--------------|-----------------|
| OCR 10 pages | 30-50 sec | ✅ OK |
| OCR + traduction 10 pages | 2-4 min | ✅ OK (avec defer) |
| Document complexe + révision | 5-10 min | ⚠️ Limite |

**Recommandation :** Passage systématique en DM pour traitements > 5 pages

---

#### ⚠️ Coûts API OCR

| Provider | Coût estimé | Usage recommandé |
|----------|-------------|------------------|
| **Mistral OCR** | ~0.001$/page | Standard (texte, images) |
| **Mathpix** | ~0.01$/requête | Formules mathématiques uniquement |
| **Tesseract** | Gratuit | Fallback low-cost (qualité moindre) |

**Recommandation :** Router vers le provider adapté selon le contenu détecté

---

#### ⚠️ Webhook `/documents/validate` : Attention à la latence

Chaque appel de validation = 1 round-trip réseau. Pour un dialogue multi-questions :
```
User → Bot → n8n (validate) → Bot → User → Bot → n8n (validate) → ...
```

**Proposition alternative :** Retourner TOUTES les questions manquantes en une fois, pas une par une.

---

### 4. Synthèse et engagement

#### Ce que l'équipe n8n peut livrer pour v1

| Webhook | Effort | Pré-requis |
|---------|--------|------------|
| `documents/validate` | M | Spec contexte plugin |
| `documents/estimate` | S | Règle tokens→crédits |
| `documents/process` | L | Intègre workflows existants |
| `documents/save` | S | Endpoint callback chatbot-core |

#### Ce qui nécessite du développement

| Tâche | Effort |
|-------|--------|
| Extraction DOCX | M |
| Extraction XLSX | M |
| Extraction PPTX | M |
| Chunking sémantique docs longs | L |
| Upload Google Drive (actuellement download only) | S |

#### Prochaines étapes proposées

1. **Immédiat** : Fournir les specs détaillées des webhooks existants (OpenAPI/JSON Schema)
2. **Court terme** : Implémenter `documents/validate` et `documents/estimate`
3. **Moyen terme** : Unifier les workflows OCR existants sous `documents/process`
4. **v2** : Chunking sémantique, révision multi-passes, annotations OCR

---

### 5. Questions pour l'équipe Framework

| # | Question |
|---|----------|
| 1 | Le callback webhook est-il acceptable ? Si oui, quel format d'endpoint côté chatbot-core ? |
| 2 | Comment sera transmise la clé API Mistral ? (actuellement passée dans le body de chaque requête) |
| 3 | Le `plugin_context` sera-t-il standardisé ? (format JSON Schema ?) |
| 4 | Pour les traitements spécifiques par plugin, chatbot-core routera-t-il vers des webhooks différents ou tout passe par `documents/process` ? |

---

**L'équipe n8n valide cette RFC et s'engage à supporter cette fonctionnalité.**

---

## Réponse équipe API

**Date :** 2026-01-19
**Auteur :** Équipe API

---

### 1. Points de concordance - Infrastructure existante

L'analyse de l'infrastructure API révèle une **base solide** pour supporter cette RFC. Voici ce qui existe déjà :

#### Système de crédits opérationnel

| Composant | Fichier | Status |
|-----------|---------|--------|
| **Modèle `user_credits`** | `models/credits/user_credit.py` | ✅ Actif |
| **Audit `user_credit_logs`** | `models/credits/user_credit_log.py` | ✅ Actif |
| **Endpoint vérification** | `GET /subscription/credits/{discord_user_id}` | ✅ Actif |
| **Endpoint débit** | `POST /webhook/account/debit` | ✅ Actif |
| **Endpoint crédit** | `POST /webhook/account/credit` | ✅ Actif |
| **Protection idempotence** | Via `stripe_session_id` dans metadata | ✅ Actif |
| **Logs mention** | MongoDB collection `mention_logs` | ✅ Actif |

#### Endpoints crédits déjà disponibles

```
GET  /webhook/account                → Solde + résumé usage
POST /webhook/account/debit          → Débiter des crédits
POST /webhook/account/credit         → Créditer (upsert)
POST /webhook/account/set            → Définir valeur exacte
GET  /webhook/account/logs           → Audit trail
POST /webhook/account/init           → Init nouveau membre (RFC-006)
```

**Conclusion :** Les tâches 3.1 et 3.2 du plan de travail (endpoints vérification et débit) sont **déjà implémentées**.

---

### 2. Réponses aux questions

#### Question 1 : Conversion tokens → crédits

> **Quelle règle appliquer ?**

Le RFC-007b propose trois options. Pour le traitement de documents, nous recommandons **l'Option C (Hybride)** adaptée :

**Formule proposée pour documents :**

```python
def calculate_document_credits(
    action: str,
    tokens_used: int,
    page_count: int,
    ocr_required: bool
) -> int:
    """
    Calcule le coût en crédits pour un traitement de document.

    Formule: base + (tokens/1000 * rate) + (pages * page_rate) + ocr_bonus
    Plafond: max_credits
    """
    CONFIG = {
        "translate": {
            "base": 5,
            "per_1k_tokens": 1.0,
            "per_page": 2,
            "ocr_bonus": 3,
            "max": 50
        },
        "summarize": {
            "base": 3,
            "per_1k_tokens": 0.5,
            "per_page": 1,
            "ocr_bonus": 3,
            "max": 30
        }
    }

    config = CONFIG.get(action, CONFIG["translate"])

    base = config["base"]
    token_cost = (tokens_used / 1000) * config["per_1k_tokens"]
    page_cost = page_count * config["per_page"]
    ocr_cost = config["ocr_bonus"] if ocr_required else 0

    total = base + token_cost + page_cost + ocr_cost
    return min(int(math.ceil(total)), config["max"])
```

**Exemples de calcul :**

| Document | Pages | Tokens | OCR | Base | Token | Page | OCR | Total | Plafond | **Crédits** |
|----------|-------|--------|-----|------|-------|------|-----|-------|---------|-------------|
| PDF texte natif (traduction) | 5 | 3000 | Non | 5 | 3.0 | 10 | 0 | 18 | 50 | **18** |
| PDF scanné (traduction) | 5 | 3000 | Oui | 5 | 3.0 | 10 | 3 | 21 | 50 | **21** |
| Image (traduction) | 1 | 500 | Oui | 5 | 0.5 | 2 | 3 | 10.5 | 50 | **11** |
| PDF 10 pages (synthèse) | 10 | 8000 | Non | 3 | 4.0 | 10 | 0 | 17 | 30 | **17** |
| Doc complexe (synthèse) | 10 | 15000 | Oui | 3 | 7.5 | 10 | 3 | 23.5 | 30 | **24** |

**Justification :**
- **Base** : Coût minimum incompressible (infrastructure, appel API)
- **per_1k_tokens** : Reflète le coût LLM réel
- **per_page** : Pénalise documents longs (plus de contexte = plus cher)
- **ocr_bonus** : L'OCR consomme des ressources supplémentaires (Mistral OCR, Mathpix)
- **Plafond** : Protection contre les surprises (documents très longs)

**Proposition de table `project_document_costs` :**

```sql
CREATE TABLE project_document_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,  -- 'translate', 'summarize', etc.
    base_credits INTEGER NOT NULL DEFAULT 5,
    per_1k_tokens DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    per_page INTEGER NOT NULL DEFAULT 2,
    ocr_bonus INTEGER NOT NULL DEFAULT 3,
    max_credits INTEGER NOT NULL DEFAULT 50,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(project_id, action)
);
```

---

#### Question 2 : Logs traitements

> **Faut-il stocker les métadonnées des traitements (comme mention_logs) ?**

**Réponse : OUI, fortement recommandé**

Nous proposons une collection MongoDB `document_logs` (cohérent avec `mention_logs`) :

**Structure proposée :**

```json
{
  "_id": "ObjectId",
  "project_id": "bot-appetit",
  "guild_id": "123456789",
  "user_id": "987654321",
  "timestamp": "2026-01-19T14:30:00Z",

  // Document info
  "document": {
    "filename": "rapport.pdf",
    "file_type": "pdf",
    "page_count": 8,
    "file_size_bytes": 1234567,
    "ocr_required": true,
    "ocr_confidence": 0.92,
    "detected_languages": ["fr", "en"]
  },

  // Processing info
  "processing": {
    "action": "translate",
    "target_language": "en",
    "format": null,  // Pour synthèse
    "quality_option": "standard",  // standard | revision | revision_correction
    "tokens_used": 3500,
    "processing_time_ms": 45000,
    "n8n_workflow_id": "abc123"
  },

  // Credits info
  "credits": {
    "estimated": 25,
    "consumed": 24,
    "user_balance_before": 100,
    "user_balance_after": 76
  },

  // Result info
  "result": {
    "success": true,
    "error_code": null,
    "error_message": null,
    "output_type": "text",  // text | file | drive_url
    "drive_url": null
  },

  // Metadata
  "metadata": {
    "request_id": "uuid-v4",
    "client_version": "1.0.0"
  }
}
```

**Endpoints proposés :**

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `POST /document/log` | POST | Créer un log de traitement |
| `GET /document/logs` | GET | Récupérer logs (filtres: project_id, user_id, action, date_range) |
| `GET /document/stats` | GET | Statistiques agrégées (par action, par jour, par projet) |
| `GET /document/stats/costs` | GET | Analyse des coûts (tokens moyens, crédits moyens par type) |

**Bénéfices :**
- Analytics : comprendre l'usage par type de document/action
- Debugging : tracer les erreurs de traitement
- Facturation : audit trail complet des consommations
- Optimisation : identifier les documents coûteux pour ajuster les tarifs

---

### 3. Points de vigilance et contradictions

#### ⚠️ Attention : Cohérence du devis vs consommation réelle

La RFC propose un système de **devis avant traitement**. Cela implique :

1. **Estimation n8n** → Devis présenté à l'utilisateur
2. **Traitement réel** → Peut consommer plus ou moins que l'estimation

**Problème potentiel :**
```
Estimation : 25 crédits
User accepte (solde: 30 crédits)
Traitement réel : 35 crédits  ← Que faire ?
```

**Proposition :**

| Stratégie | Description | Recommandation |
|-----------|-------------|----------------|
| **Débiter l'estimation** | User paie le devis, même si réel différent | ⭐ Recommandé v1 |
| **Débiter le réel** | User paie le réel (peut dépasser solde) | Risqué UX |
| **Débiter min(estimation, réel)** | Favorable user, risque perte | Non recommandé |
| **Réservation + ajustement** | Réserver estimation, ajuster après | Complexe |

**Recommandation v1 :** Débiter l'estimation (devis accepté = engagement). Si le traitement consomme moins, on "offre" la différence. Si plus, on absorbe la perte (faible % des cas si estimation correcte).

---

#### ⚠️ Atomicité du débit

Le flow actuel de `/webhook/account/debit` est **atomique** et inclut une vérification de solde :

```python
# Extrait de webhook_account.py
if user.credits_remaining < amount:
    raise HTTPException(402, "Insufficient credits")

user.credits_remaining -= amount
# ... log + commit
```

**Point d'attention :** Pour les traitements longs, le débit doit avoir lieu **APRÈS confirmation utilisateur** mais **AVANT traitement n8n**. Sinon, risque de traitement non facturé si l'utilisateur quitte.

**Flow recommandé :**
```
1. User confirme le devis
2. API débite immédiatement (POST /webhook/account/debit)
3. n8n démarre le traitement (async)
4. Si traitement échoue → REFUND (POST /webhook/account/credit avec raison "refund_failed_processing")
```

---

#### ⚠️ Limitation v1 : Pas d'achat de crédits intégré au flow

La RFC mentionne `[Acheter des crédits]` si solde insuffisant. Actuellement :
- **Stripe webhooks** gèrent les achats de crédits
- **Pas de flow inline** depuis Discord

**Options :**

| Option | Effort | Description |
|--------|--------|-------------|
| A. Lien Stripe externe | S | Bouton → redirect vers page Stripe |
| B. Flow inline Discord | L | Interaction Discord → Checkout Stripe → Callback |
| C. Reporter à v2 | 0 | Juste message "Achetez des crédits sur [lien]" |

**Recommandation v1 :** Option A (lien externe). Le flow inline est complexe et peut être ajouté en v2.

---

#### ⚠️ Pas de table `document_logs` SQL prévue

La RFC mentionne optionnellement une table SQL `document_logs`. Nous recommandons **MongoDB** pour cohérence avec `mention_logs` et flexibilité du schéma (documents variés = champs variés).

**Argument :** Les logs de traitement ont des structures variables (translate vs summarize vs custom). MongoDB permet d'ajouter des champs sans migration.

---

### 4. Synthèse et engagement

#### Ce que l'équipe API peut livrer pour v1

| Composant | Status | Effort | Notes |
|-----------|--------|--------|-------|
| Vérification solde | ✅ Existe | 0 | `GET /webhook/account` |
| Débit crédits | ✅ Existe | 0 | `POST /webhook/account/debit` |
| Collection `document_logs` | À créer | S | MongoDB, similaire à mention_logs |
| Endpoint `POST /document/log` | À créer | S | Logging traitement |
| Endpoint `GET /document/logs` | À créer | S | Récupération logs |
| Endpoint `GET /document/stats` | À créer | M | Statistiques |
| Table `project_document_costs` | À créer | M | Tarification par action |

**Effort total v1 :** ~M (Medium) - la plupart de l'infrastructure existe déjà.

#### Ce qui est déjà prêt

| Tâche RFC | Status |
|-----------|--------|
| 3.1 Endpoint vérification crédits | ✅ Déjà implémenté |
| 3.2 Endpoint débit crédits | ✅ Déjà implémenté |
| 3.3 Table document_logs | ⏳ À faire (MongoDB) |

#### Prochaines étapes proposées

1. **Immédiat** : Valider la formule de conversion tokens → crédits avec l'équipe n8n
2. **Court terme** : Créer la collection `document_logs` MongoDB + endpoints
3. **Moyen terme** : Implémenter `project_document_costs` pour tarification flexible
4. **v2** : Flow d'achat de crédits inline, statistiques avancées

---

### 5. Questions pour les autres équipes

#### Pour l'équipe Framework (chatbot-core)

| # | Question |
|---|----------|
| 1 | Le débit doit-il être fait par chatbot-core ou par n8n via l'API ? (Recommandation : chatbot-core après confirmation user) |
| 2 | Comment gérer un refund si le traitement n8n échoue ? (Callback → crédit automatique ?) |
| 3 | Les `document_logs` doivent-ils être envoyés par chatbot-core ou n8n ? |

#### Pour l'équipe n8n

| # | Question |
|---|----------|
| 1 | L'estimation de tokens est-elle fiable à ±20% ? (important pour la stratégie de débit) |
| 2 | Pouvez-vous retourner un `estimated_tokens` avant traitement ? |
| 3 | En cas d'échec, un code d'erreur standardisé pour déclencher le refund ? |

---

### 6. Décisions proposées pour les questions communes

| # | Décision RFC | Proposition API |
|---|--------------|-----------------|
| 1 | Limite journalière | **50 pages/jour** par utilisateur (évite abus, ajustable par projet) |
| 2 | Limite taille document | **10 pages v1** (validé, cohérent avec timeout Discord) |
| 3 | Notification traitement long | **DM uniquement** (moins intrusif, l'utilisateur a déjà vu le devis dans le salon) |

---

### 7. Réponses aux questions complémentaires de l'équipe n8n

Suite aux questions de l'équipe n8n concernant l'implication de l'équipe API, voici nos réponses :

#### Question 1 : Callback webhook - Qui débite les crédits ?

> **Le débit des crédits se fait-il via un endpoint API existant ? Ou chatbot-core a-t-il un accès direct à la DB crédits ?**

**Réponse : Via endpoint API existant**

| Composant | Accès DB crédits | Méthode |
|-----------|------------------|---------|
| chatbot-core | ❌ Non | Appelle `POST /webhook/account/debit` |
| n8n | ❌ Non | Peut appeler `POST /webhook/account/debit` si besoin |
| API | ✅ Oui | Seul composant avec accès direct |

**Flow recommandé :**
```
1. User confirme devis dans Discord
2. chatbot-core → POST /webhook/account/debit (API)
3. API débite + log → retourne succès
4. chatbot-core → n8n /documents/process
5. n8n traite (async)
6. n8n → callback chatbot-core avec résultat
7. Si échec : chatbot-core → POST /webhook/account/credit (refund)
```

**Avantage :** Centralisation de la logique crédits dans l'API, audit trail complet.

---

#### Question 2a : Où sont stockées les clés API externes ?

> **Où sont stockées les clés API externes (Mistral, OpenAI, Mathpix) ?**

**Réponse : Les clés sont gérées par les plugins**

Comme indiqué par l'équipe n8n, **les clés API sont passées par les plugins**. L'architecture actuelle :

| Niveau | Stockage | Responsabilité |
|--------|----------|----------------|
| **API centrale** | Variables d'environnement (`config/settings.py`) | Clés partagées (fallback) |
| **Plugins** | Configuration plugin | Clés spécifiques au plugin |
| **n8n** | Credentials n8n natifs | Orchestration des appels |

**Structure existante dans l'API (`config/settings.py`) :**
```python
class APISettings(BaseSettings):
    openai_api_key: str | None = Field(default=None, env="OPENAI_API_KEY")
    mistral_api_key: str | None = Field(default=None, env="MISTRAL_API_KEY")
    anthropic_api_key: str | None = Field(default=None, env="ANTHROPIC_API_KEY")
    # ... autres providers
```

**Conclusion :** L'API ne gère pas les clés pour les plugins. Chaque plugin passe sa propre clé dans le `plugin_context` envoyé à n8n.

---

#### Question 2b : Qui supporte le coût des appels API ?

> **Qui paie les appels Mistral/OpenAI ? (mutualisé ou refacturé ?)**

**Réponse : Modèle par plugin (pas mutualisé)**

| Modèle | Description | Status |
|--------|-------------|--------|
| **Par plugin** | Chaque plugin utilise sa propre clé API | ✅ Actuel |
| **Mutualisé** | Une clé centrale, coûts répartis | ❌ Non implémenté |
| **Par utilisateur** | Chaque user sa clé | ❌ Hors scope |

**Implication pour la RFC :**
- Le plugin passe sa clé API dans la requête à n8n
- Les crédits utilisateur servent à **couvrir le coût du plugin** (marge incluse)
- Le plugin owner paie directement Mistral/OpenAI avec sa clé
- Les crédits = revenu pour le plugin owner

**Formule économique :**
```
Coût réel API (payé par plugin owner) : ~$0.001/page OCR
Crédits facturés à l'utilisateur : ~2-5 crédits/page
Marge plugin = Crédits × valeur_crédit - Coût_API
```

---

#### Question 2c : Endpoint pour récupérer une clé ?

> **Existe-t-il un endpoint `GET /credentials/{provider}` pour récupérer une clé ?**

**Réponse : Non, et ce n'est pas nécessaire**

| Endpoint | Existe | Justification |
|----------|--------|---------------|
| `GET /credentials/{provider}` | ❌ Non | Clés passées par plugins, pas stockées centralement |
| `GET /api/config/{project_id}` | ✅ Oui | Retourne config projet (sans secrets) |

**Architecture actuelle :**
```
Plugin (chatbot-core) possède sa clé API
        ↓
Envoie dans plugin_context à n8n
        ↓
n8n utilise la clé pour appeler Mistral/OpenAI
```

**Pas besoin d'endpoint credentials** car :
1. Les clés ne transitent pas par l'API
2. Chaque plugin gère ses propres secrets
3. Moins de surface d'attaque (pas de stockage centralisé)

---

#### Question 2d : Règle de conversion tokens → crédits

> **La conversion tokens → crédits est-elle gérée par l'API ?**

**Réponse : OUI, définie et calculée par l'API**

La formule proposée (section 2, Question 1) sera implémentée côté API :

```python
# API calcule les crédits à partir des données n8n
def calculate_document_credits(action, tokens_used, page_count, ocr_required) -> int:
    # Formule hybride : base + tokens + pages + OCR
    # Voir section 2.1 pour le détail
```

**Flow de calcul :**
```
1. n8n /documents/estimate → retourne { estimated_tokens, page_count, ocr_required }
2. chatbot-core envoie ces données à l'API (ou calcule localement avec la même formule)
3. API/chatbot-core applique la formule → crédits estimés
4. Devis présenté à l'utilisateur
```

**Option d'implémentation :**

| Option | Calcul par | Avantage |
|--------|------------|----------|
| A. API endpoint dédié | `POST /credits/estimate` | Centralisation, cohérence |
| B. Formule partagée | chatbot-core + API | Moins de latence |
| **C. n8n retourne directement** | n8n calcule avec config | Simplicité |

**Recommandation :** Option C - n8n reçoit la config de tarification dans le `plugin_context` et retourne directement `estimated_credits` en plus de `estimated_tokens`.

---

#### Synthèse des réponses

| Question n8n | Réponse API |
|--------------|-------------|
| Callback - qui débite ? | chatbot-core via `POST /webhook/account/debit` |
| Stockage clés API | Par plugin (pas centralisé) |
| Qui paie les appels ? | Plugin owner (sa clé, son budget) |
| Endpoint credentials ? | Non nécessaire |
| Conversion tokens→crédits | API définit la formule, n8n peut calculer |

---

**L'équipe API valide cette RFC et confirme que l'infrastructure existante peut la supporter avec un effort minimal.**

---

## Réponse équipe n8n (suite) - Retour sur propositions API

**Date :** 2026-01-19
**Auteur :** Équipe n8n

---

### 1. Points validés sans réserve

#### ✅ Flow de débit/refund

Le flow proposé par l'équipe API est **validé** :

```
User confirme → chatbot-core débite via API → n8n traite → callback → refund si échec
```

**Accord total.** La centralisation du débit dans l'API garantit l'intégrité des crédits et un audit trail complet.

---

#### ✅ Modèle économique par plugin

```
Plugin owner paie Mistral/OpenAI avec sa clé
Crédits utilisateur = revenu plugin owner
```

**Accord total.** C'est un modèle SaaS classique et viable. Le plugin owner a intérêt à optimiser ses appels API.

---

#### ✅ Stratégie "débiter l'estimation"

| Scénario | Comportement |
|----------|--------------|
| Estimation : 25, Réel : 22 | User paie 25, bonus gratuit |
| Estimation : 25, Réel : 28 | User paie 25, plugin absorbe |

**Accord total.** Simple, prévisible, et les écarts seront marginaux si l'estimation est correcte (±15%).

---

#### ✅ Formule de calcul des crédits

```python
credits = base + (tokens/1000 * rate) + (pages * page_rate) + ocr_bonus
```

**Accord total.** La formule est bien calibrée avec le plafond (max) qui protège l'utilisateur.

---

#### ✅ Décisions communes

| Décision | Proposition API | Validation n8n |
|----------|-----------------|----------------|
| Limite journalière | 50 pages/jour | ✅ Raisonnable |
| Limite document | 10 pages v1 | ✅ Cohérent avec nos tests de performance |
| Notification | DM uniquement | ✅ Moins intrusif |

---

### 2. Points nécessitant clarification

#### ⚠️ Option C : Config pricing dans `plugin_context`

L'API recommande que n8n calcule les crédits avec la config reçue dans `plugin_context`.

**Question pour l'équipe Framework :**

Le `plugin_context` contiendra-t-il la config pricing complète ?

```json
{
  "plugin_context": {
    "plugin_id": "bot-appetit",
    "pricing": {
      "translate": {
        "base": 5,
        "per_1k_tokens": 1.0,
        "per_page": 2,
        "ocr_bonus": 3,
        "max": 50
      },
      "summarize": {
        "base": 3,
        "per_1k_tokens": 0.5,
        "per_page": 1,
        "ocr_bonus": 3,
        "max": 30
      }
    }
  }
}
```

**Préférence n8n :** Config dans le `plugin_context` (évite un round-trip supplémentaire vers l'API).

---

#### ⚠️ Format du callback chatbot-core

Le flow mentionne "n8n → callback chatbot-core avec résultat" mais le format n'est pas spécifié.

**Proposition n8n pour l'endpoint :**

```
POST https://chatbot-core.example.com/webhooks/document-result
```

**Payload succès :**

```json
{
  "job_id": "uuid-job",
  "request_id": "uuid-request",
  "user_id": "987654321",
  "guild_id": "123456789",
  "channel_id": "456789123",

  "success": true,
  "result": {
    "text": "Translated content...",
    "output_type": "text",
    "word_count": 1250
  },

  "metrics": {
    "tokens_used": 2450,
    "processing_time_ms": 15000,
    "ocr_confidence": 0.95,
    "pages_processed": 8
  },

  "error": null
}
```

**Payload échec :**

```json
{
  "job_id": "uuid-job",
  "request_id": "uuid-request",
  "user_id": "987654321",
  "guild_id": "123456789",
  "channel_id": "456789123",

  "success": false,
  "result": null,

  "metrics": {
    "tokens_used": 500,
    "processing_time_ms": 5000,
    "pages_processed": 2
  },

  "error": {
    "code": "OCR_FAILED",
    "message": "Unable to extract text: image too blurry",
    "retriable": true,
    "refund_recommended": true,
    "refund_percentage": 100
  }
}
```

**Question pour l'équipe Framework :** Ce format est-il acceptable ?

---

### 3. Réponses aux questions de l'équipe API

#### Question API 1 : Fiabilité estimation tokens (±20%)

> **L'estimation de tokens est-elle fiable à ±20% ?**

**Réponse : OUI, avec précisions**

| Scénario | Précision estimation | Notes |
|----------|---------------------|-------|
| PDF texte natif | ±5% | Comptage direct des caractères |
| PDF scanné (OCR) | ±15% | Dépend qualité scan |
| Images | ±20% | Variabilité du contenu extrait |
| Documents mixtes | ±15% | Moyenne pondérée |

**Méthode d'estimation n8n :**

```
1. Télécharger le document (HEAD + GET partiel si volumineux)
2. Si PDF natif → extraire texte avec pdf-parse → compter tokens
3. Si image/scan → OCR rapide sur 1ère page → extrapoler × nb_pages
4. Appliquer marge de sécurité (+10%)
5. Retourner estimation
```

**Engagement n8n :** Précision **±15% dans 90% des cas**.

---

#### Question API 2 : Retourner `estimated_tokens` avant traitement

> **Pouvez-vous retourner un `estimated_tokens` avant traitement ?**

**Réponse : OUI**

Le webhook `/documents/estimate` retournera :

```json
{
  "success": true,
  "estimation": {
    "tokens": 2500,
    "pages": 8,
    "ocr_required": true,
    "ocr_confidence_preview": 0.85,
    "detected_language": "fr"
  },
  "credits": {
    "estimated": 25,
    "breakdown": {
      "base": 5,
      "tokens": 2.5,
      "pages": 16,
      "ocr": 3
    },
    "max_possible": 50
  },
  "warnings": [
    "OCR confidence may vary on full document"
  ]
}
```

**Note :** Si `plugin_context.pricing` est fourni, n8n calculera directement `credits.estimated`. Sinon, seuls `tokens` et `pages` seront retournés.

---

#### Question API 3 : Codes d'erreur standardisés pour refund

> **En cas d'échec, un code d'erreur standardisé pour déclencher le refund ?**

**Réponse : OUI - Proposition de codes standardisés**

| Code | Description | Refund | % |
|------|-------------|--------|---|
| `SUCCESS` | Traitement réussi | ❌ Non | 0% |
| `PARTIAL_SUCCESS` | Traitement partiel (ex: 5/8 pages) | ⚠️ Partiel | 50% |
| `OCR_FAILED` | Échec extraction texte | ✅ Oui | 100% |
| `OCR_LOW_CONFIDENCE` | Qualité OCR < 50% | ⚠️ Partiel | 50% |
| `LLM_ERROR` | Erreur API LLM (OpenAI, Mistral, etc.) | ✅ Oui | 100% |
| `LLM_RATE_LIMITED` | Rate limit API atteint | ✅ Oui | 100% |
| `TIMEOUT` | Dépassement délai (>10 min) | ✅ Oui | 100% |
| `INVALID_FORMAT` | Format fichier non supporté | ✅ Oui | 100% |
| `FILE_TOO_LARGE` | Document > limite (10 pages v1) | ✅ Oui | 100% |
| `FILE_CORRUPTED` | Fichier illisible/corrompu | ✅ Oui | 100% |
| `LANGUAGE_UNSUPPORTED` | Langue non supportée | ✅ Oui | 100% |
| `USER_CANCELLED` | Annulé par utilisateur | ✅ Oui | 100% |
| `INTERNAL_ERROR` | Erreur interne n8n | ✅ Oui | 100% |

**Structure d'erreur standardisée :**

```json
{
  "error": {
    "code": "OCR_FAILED",
    "message": "Unable to extract text: image resolution too low (< 150 DPI)",
    "details": {
      "page": 3,
      "detected_dpi": 72,
      "minimum_dpi": 150
    },
    "retriable": true,
    "suggestion": "Please upload a higher resolution scan",
    "refund": {
      "recommended": true,
      "percentage": 100,
      "reason": "Processing failed before completion"
    }
  }
}
```

**Logique de refund côté chatbot-core :**

```python
if response.error and response.error.refund.recommended:
    refund_amount = int(estimated_credits * response.error.refund.percentage / 100)
    await api_client.credit_account(
        user_id=user_id,
        amount=refund_amount,
        reason=f"refund_{response.error.code.lower()}",
        metadata={"job_id": job_id, "error_code": response.error.code}
    )
```

---

### 4. Synthèse des accords inter-équipes

| Point | API | n8n | Status |
|-------|-----|-----|--------|
| Flow débit/refund | ✅ | ✅ | **Validé** |
| Modèle par plugin | ✅ | ✅ | **Validé** |
| Stratégie estimation | ✅ | ✅ | **Validé** |
| Formule crédits | ✅ | ✅ | **Validé** |
| Décisions communes | ✅ | ✅ | **Validé** |
| Précision estimation | Demandé | ±15% | **Validé** |
| `estimated_tokens` | Demandé | OUI | **Validé** |
| Codes erreur refund | Demandé | Proposé | **En attente validation API** |
| Config pricing dans plugin_context | Recommandé | Préféré | **En attente validation Framework** |
| Format callback | Non spécifié | Proposé | **En attente validation Framework** |

---

### 5. Questions résiduelles pour l'équipe Framework

| # | Question | Contexte |
|---|----------|----------|
| 1 | Le `plugin_context` contiendra-t-il la config `pricing` pour chaque action ? | Calcul crédits côté n8n |
| 2 | Quel endpoint pour le callback de résultat ? Format proposé acceptable ? | Notification traitement terminé |
| 3 | Qui génère le `job_id` ? chatbot-core ou n8n ? | Traçabilité |
| 4 | En cas de refund, chatbot-core gère-t-il automatiquement ou faut-il une validation manuelle ? | UX refund |

---

**L'équipe n8n confirme son accord avec les propositions de l'équipe API et attend les clarifications de l'équipe Framework.**

---

## Validation équipe API (suite)

**Date :** 2026-01-19
**Auteur :** Équipe API

---

### Validation des propositions n8n

#### ✅ Codes d'erreur standardisés pour refund

**Validé sans réserve.** La table des codes d'erreur est exhaustive et bien pensée.

| Aspect | Validation |
|--------|------------|
| Codes proposés | ✅ Complets et explicites |
| Pourcentages refund | ✅ Logique (100% échec, 50% partiel) |
| Structure JSON `error` | ✅ Compatible avec notre logging |
| Champ `retriable` | ✅ Utile pour UX (proposer retry) |

**Ajout recommandé pour `document_logs` MongoDB :**

```json
{
  "refund": {
    "applied": true,
    "amount": 25,
    "error_code": "OCR_FAILED",
    "timestamp": "2026-01-19T15:30:00Z"
  }
}
```

---

#### ✅ Précision estimation ±15%

**Validé.** ±15% dans 90% des cas est acceptable pour notre stratégie "débiter l'estimation".

| Écart max | Impact sur marge plugin |
|-----------|------------------------|
| +15% (sous-estimation) | Plugin absorbe ~4 crédits sur 25 |
| -15% (sur-estimation) | User reçoit bonus implicite |

**Acceptable économiquement** si la marge plugin est calibrée à ≥20%.

---

#### ✅ Format réponse `/documents/estimate`

**Validé.** Le format proposé contient toutes les informations nécessaires :

```json
{
  "estimation": { "tokens", "pages", "ocr_required", "ocr_confidence_preview", "detected_language" },
  "credits": { "estimated", "breakdown", "max_possible" },
  "warnings": []
}
```

**Point positif :** Le `breakdown` permet d'expliquer le calcul à l'utilisateur si besoin.

---

#### ✅ Format callback (validation partielle)

Le format proposé est **compatible avec l'API** pour les aspects crédits/logging :

| Champ | Utilisation API |
|-------|-----------------|
| `metrics.tokens_used` | Stockage dans `document_logs` |
| `error.code` | Déclenchement logique refund |
| `error.refund.percentage` | Calcul montant refund |

**Note :** La validation complète du format (endpoint, authentification) revient à l'équipe Framework.

---

### Mise à jour de la synthèse des accords

| Point | API | n8n | Status |
|-------|-----|-----|--------|
| Flow débit/refund | ✅ | ✅ | **Validé** |
| Modèle par plugin | ✅ | ✅ | **Validé** |
| Stratégie estimation | ✅ | ✅ | **Validé** |
| Formule crédits | ✅ | ✅ | **Validé** |
| Décisions communes | ✅ | ✅ | **Validé** |
| Précision estimation ±15% | ✅ | ✅ | **Validé** |
| `estimated_tokens` | ✅ | ✅ | **Validé** |
| Codes erreur refund | ✅ | ✅ | **Validé** |
| Config pricing dans plugin_context | ✅ | ✅ | **En attente Framework** |
| Format callback | ⚠️ Partiel | ✅ | **En attente Framework** |

---

### Prochaines étapes côté API

Avec les accords API ↔ n8n maintenant **complets**, l'équipe API peut préparer :

| Tâche | Effort | Dépendance |
|-------|--------|------------|
| Collection `document_logs` avec champ `refund` | S | Aucune |
| Endpoint `POST /document/log` | S | Collection |
| Endpoint `GET /document/logs` avec filtre `refund` | S | Collection |
| Enum `DocumentErrorCode` dans les schemas | S | Aucune |

**Effort total :** S-M (peut démarrer immédiatement)

---

**L'équipe API valide les propositions de l'équipe n8n. Tous les points techniques API ↔ n8n sont désormais accordés. En attente des réponses de l'équipe Framework pour finaliser l'architecture complète.**

---

## Réponse équipe chatbot-core (Framework)

**Date :** 2026-01-19
**Auteur :** Équipe chatbot-core

---

### 1. Points de concordance

L'équipe chatbot-core **valide les propositions des équipes n8n et API**. Voici les points d'accord :

#### ✅ Architecture globale validée

| Point | Validation |
|-------|------------|
| Traitement 100% côté n8n | ✅ Conforme à la philosophie du framework |
| chatbot-core = orchestrateur | ✅ Cohérent avec MentionService (RFC-007) |
| Validation paramètres par n8n | ✅ Simplifie chatbot-core |
| Mémoire conversationnelle (RFC-011) | ✅ Réutilisable pour le dialogue |

#### ✅ Flow débit/refund validé

```
User confirme → chatbot-core débite via API → n8n traite → callback → refund si échec
```

**Accord total.** C'est exactement le pattern que nous recommandons :
- chatbot-core garde le contrôle du flow utilisateur
- L'API reste la source de vérité pour les crédits
- Le callback permet une UX asynchrone fluide

#### ✅ Modèle économique par plugin

```
Plugin owner possède sa clé API → paie Mistral/OpenAI
Crédits utilisateur → revenu pour le plugin owner
```

**Accord total.** C'est le modèle le plus flexible et scalable. Chaque plugin peut ainsi définir sa propre stratégie de marge.

#### ✅ Stratégie "débiter l'estimation"

**Accord total.** Simple pour l'utilisateur, prévisible, et les écarts seront absorbés par le plugin owner si bien calibré.

#### ✅ Décisions communes validées

| Décision | Proposition | Validation chatbot-core |
|----------|-------------|------------------------|
| Limite journalière | 50 pages/jour | ✅ Raisonnable pour v1 |
| Limite document | 10 pages v1 | ✅ Cohérent avec timeout Discord |
| Notification | DM uniquement si long | ✅ Moins intrusif |

#### ✅ Codes d'erreur et structure refund

La table des codes d'erreur proposée par n8n est **excellente** :
- Exhaustive (couvre tous les cas)
- Le champ `retriable` permet de proposer un retry à l'utilisateur
- Le `refund_percentage` permet un refund partiel (cas `PARTIAL_SUCCESS`)

#### ✅ Format réponse `/documents/estimate`

Le format avec `breakdown` est **très apprécié** :
- Permet d'expliquer le devis à l'utilisateur
- Transparent sur la composition du coût

---

### 2. Réponses aux questions

#### Question n8n 1 : Callback webhook acceptable ?

> **Réponse : OUI, callback webhook accepté**

chatbot-core exposera un endpoint interne pour recevoir les callbacks de n8n.

**Endpoint proposé :**

```
POST /internal/webhooks/document-result
```

**Note importante :** Cet endpoint n'est **pas exposé sur Internet**. Il sera accessible uniquement depuis le réseau interne (n8n → chatbot-core sur le même réseau Docker/K8s).

**Sécurité :**

| Mesure | Implémentation |
|--------|----------------|
| Réseau interne | Endpoint accessible uniquement depuis n8n |
| Signature HMAC | Optionnel v1, recommandé v2 |
| Validation `job_id` | Le job_id doit correspondre à un job en attente |

**Format callback accepté :** Le format proposé par n8n est **validé** :

```json
{
  "job_id": "uuid-job",
  "request_id": "uuid-request",
  "user_id": "987654321",
  "guild_id": "123456789",
  "channel_id": "456789123",
  "success": true,
  "result": { ... },
  "metrics": { ... },
  "error": { ... }
}
```

**Ajout requis** : Le champ `conversation_id` pour pouvoir envoyer le DM avec le bon contexte conversationnel (RFC-011) :

```json
{
  "job_id": "uuid-job",
  "conversation_id": "abc123xy",  // ← Ajout requis
  ...
}
```

---

#### Question n8n 2 : Transmission clé API Mistral

> **Réponse : Via `plugin_context.api_keys`**

La clé API sera transmise par le plugin dans le `plugin_context` :

```json
{
  "plugin_context": {
    "plugin_id": "bot-appetit",
    "api_keys": {
      "mistral": "sk-xxx...",
      "openai": "sk-xxx...",
      "mathpix": "app-id:app-key"
    }
  }
}
```

**Sécurité :**
- Les clés transitent en HTTPS
- n8n ne stocke pas les clés (utilisation immédiate)
- Les clés sont gérées par le plugin owner (pas de stockage centralisé)

**Alternative envisageable (v2) :** n8n pourrait utiliser ses credentials natifs avec un mapping `plugin_id → credential_id`. Mais pour v1, le passage via `plugin_context` est plus simple.

---

#### Question n8n 3 : `plugin_context` standardisé ?

> **Réponse : OUI, JSON Schema standardisé**

Le `plugin_context` sera défini par un JSON Schema. Voici la structure complète :

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["plugin_id"],
  "properties": {
    "plugin_id": {
      "type": "string",
      "description": "Identifiant unique du plugin"
    },
    "api_keys": {
      "type": "object",
      "properties": {
        "mistral": { "type": "string" },
        "openai": { "type": "string" },
        "anthropic": { "type": "string" },
        "mathpix": { "type": "string" }
      }
    },
    "pricing": {
      "type": "object",
      "description": "Config tarification par action",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "base": { "type": "integer" },
          "per_1k_tokens": { "type": "number" },
          "per_page": { "type": "integer" },
          "ocr_bonus": { "type": "integer" },
          "max": { "type": "integer" }
        }
      }
    },
    "available_actions": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Actions disponibles pour ce plugin"
    },
    "required_params": {
      "type": "object",
      "description": "Paramètres requis par action",
      "additionalProperties": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "custom_actions": {
      "type": "object",
      "description": "Actions spécifiques avec webhook dédié",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "webhook_url": { "type": "string" },
          "required_params": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    },
    "limits": {
      "type": "object",
      "properties": {
        "max_pages": { "type": "integer", "default": 10 },
        "max_file_size_mb": { "type": "integer", "default": 25 },
        "daily_pages_limit": { "type": "integer", "default": 50 }
      }
    }
  }
}
```

**Exemple concret pour Bot Appetit :**

```json
{
  "plugin_context": {
    "plugin_id": "bot-appetit",
    "api_keys": {
      "mistral": "sk-xxx..."
    },
    "pricing": {
      "translate": {
        "base": 5,
        "per_1k_tokens": 1.0,
        "per_page": 2,
        "ocr_bonus": 3,
        "max": 50
      },
      "summarize": {
        "base": 3,
        "per_1k_tokens": 0.5,
        "per_page": 1,
        "ocr_bonus": 3,
        "max": 30
      }
    },
    "available_actions": ["translate", "summarize"],
    "required_params": {
      "translate": ["target_language"],
      "summarize": ["format"]
    },
    "limits": {
      "max_pages": 10,
      "daily_pages_limit": 50
    }
  }
}
```

---

#### Question n8n 4 : Routage traitements spécifiques

> **Réponse : Tout passe par `documents/process`, qui route en interne**

**Architecture retenue :**

```
chatbot-core → n8n /documents/process
                      ↓
              Switch par action
                      ↓
    ┌─────────────────┼─────────────────┐
    ↓                 ↓                 ↓
translate        summarize        custom_action
(interne)        (interne)        (webhook plugin)
```

**Avantages :**
- Un seul point d'entrée pour chatbot-core
- n8n gère le routage (plus flexible)
- Les webhooks custom sont définis dans `plugin_context.custom_actions`

**Pour les actions custom :**

```json
{
  "plugin_context": {
    "custom_actions": {
      "import_invoice": {
        "webhook_url": "https://plugin-comptable.example.com/import",
        "required_params": ["database_type", "company_id"]
      },
      "generate_infographic": {
        "webhook_url": "https://n8n.local/webhook/gemini-infographic",
        "required_params": ["style", "output_format"]
      }
    }
  }
}
```

n8n routera automatiquement vers le webhook spécifié si l'action n'est pas standard.

---

#### Question API 1 : Qui fait le débit ?

> **Réponse : chatbot-core, après confirmation utilisateur**

**Flow validé :**

```
1. User clique [Confirmer]
2. chatbot-core → POST /webhook/account/debit (API)
3. Si succès → chatbot-core → n8n /documents/process
4. Si échec (solde insuffisant) → Message erreur à l'utilisateur
```

**Avantage :** chatbot-core contrôle le moment exact du débit, évite les race conditions.

---

#### Question API 2 : Gestion du refund

> **Réponse : Refund automatique par chatbot-core**

Quand chatbot-core reçoit le callback avec une erreur :

```python
async def handle_document_callback(self, payload: dict):
    if not payload["success"] and payload["error"]["refund"]["recommended"]:
        # Calcul du montant de refund
        refund_amount = int(
            self.estimated_credits * payload["error"]["refund"]["percentage"] / 100
        )

        # Appel API pour créditer
        await self.api_client.credit_account(
            user_id=payload["user_id"],
            amount=refund_amount,
            reason=f"refund_{payload['error']['code'].lower()}",
            metadata={
                "job_id": payload["job_id"],
                "error_code": payload["error"]["code"],
                "original_debit": self.estimated_credits
            }
        )

        # Notifier l'utilisateur
        await self.notify_user_refund(payload, refund_amount)
```

**Pas de validation manuelle** pour v1 (trop complexe). Le refund est automatique basé sur `error.refund.recommended`.

**Point d'attention :** Logger tous les refunds dans `document_logs` pour audit.

---

#### Question API 3 : Qui envoie les `document_logs` ?

> **Réponse : chatbot-core, après réception du callback**

chatbot-core a toutes les informations nécessaires :
- Contexte utilisateur (guild_id, user_id, channel_id)
- Estimation initiale
- Résultat du callback (metrics, error, etc.)
- Solde avant/après

**Flow :**

```
n8n callback → chatbot-core
                    ↓
         chatbot-core → POST /document/log (API)
```

**Structure envoyée par chatbot-core :**

```json
{
  "project_id": "bot-appetit",
  "guild_id": "123456789",
  "user_id": "987654321",
  "document": {
    "filename": "rapport.pdf",
    "file_type": "pdf",
    "page_count": 8
  },
  "processing": {
    "action": "translate",
    "target_language": "en",
    "tokens_used": 2450,
    "processing_time_ms": 15000
  },
  "credits": {
    "estimated": 25,
    "consumed": 25,
    "user_balance_before": 100,
    "user_balance_after": 75
  },
  "result": {
    "success": true,
    "error_code": null
  },
  "refund": null
}
```

---

#### Question n8n résiduelle 1 : Config `pricing` dans `plugin_context` ?

> **Réponse : OUI**

La config `pricing` sera incluse dans le `plugin_context`. Voir le JSON Schema complet ci-dessus.

**Avantage :** n8n peut calculer directement `estimated_credits` sans round-trip supplémentaire.

---

#### Question n8n résiduelle 2 : Format callback ?

> **Réponse : Format proposé accepté avec ajout `conversation_id`**

Voir réponse à la question n8n 1.

---

#### Question n8n résiduelle 3 : Qui génère le `job_id` ?

> **Réponse : chatbot-core génère le `job_id`**

**Justification :**
- chatbot-core doit tracker le job en attente
- Le job_id est créé AVANT l'appel à n8n
- n8n retourne le même job_id dans le callback

**Flow :**

```
1. chatbot-core génère job_id = uuid4()
2. chatbot-core stocke job_id + contexte en mémoire (ou Redis)
3. chatbot-core → n8n /documents/process avec job_id
4. n8n traite... (async)
5. n8n → callback avec le même job_id
6. chatbot-core retrouve le contexte via job_id
7. chatbot-core notifie l'utilisateur
```

**Format job_id :** UUID v4 (ex: `550e8400-e29b-41d4-a716-446655440000`)

---

#### Question n8n résiduelle 4 : Refund automatique ou manuel ?

> **Réponse : Automatique**

Voir réponse à la question API 2. Le refund est automatique basé sur `error.refund.recommended`.

---

### 3. Points de vigilance et contradictions

#### ⚠️ Attention : Latence du flow `/documents/validate`

L'équipe n8n a raison de souligner le risque de latence si on fait plusieurs round-trips pour collecter les paramètres.

**Solution adoptée :** Retourner TOUTES les questions manquantes en une fois.

**Flow optimisé :**

```
1. User: @Bot traduis ce doc
2. chatbot-core → n8n /documents/validate
3. n8n retourne: { valid: false, questions: [Q1, Q2, Q3] }
4. chatbot-core présente TOUTES les questions à l'utilisateur (via buttons/select)
5. User répond à tout en une fois
6. chatbot-core → n8n /documents/validate (avec toutes les réponses)
7. n8n retourne: { valid: true }
8. Suite du flow...
```

**Alternative UX :** Si trop de questions (>3), utiliser un modal Discord qui collecte tout en une fois.

---

#### ⚠️ Attention : Stockage des jobs en attente

Pour supporter le callback asynchrone, chatbot-core doit stocker les jobs en attente.

**Options :**

| Option | Avantage | Inconvénient |
|--------|----------|--------------|
| Mémoire | Simple | Perdu si restart |
| Redis | Persistant, partagé | Dépendance supplémentaire |
| MongoDB | Persistant | Overhead pour petits volumes |

**Recommandation v1 :** Redis (déjà utilisé pour RFC-011 mémoire conversationnelle)

**Structure Redis :**

```
Key: document_job:{job_id}
TTL: 1 heure
Value: {
  "user_id": "987654321",
  "guild_id": "123456789",
  "channel_id": "456789123",
  "conversation_id": "abc123xy",
  "estimated_credits": 25,
  "action": "translate",
  "created_at": "2026-01-19T14:30:00Z"
}
```

---

#### ⚠️ Attention : Timeout des jobs

Que faire si n8n ne rappelle jamais (crash, timeout) ?

**Solution :** Job expiration avec notification utilisateur.

```python
# Tâche périodique (cron ou background task)
async def check_expired_jobs():
    expired_jobs = await redis.get_expired_jobs("document_job:*", max_age_minutes=15)

    for job in expired_jobs:
        # Refund automatique
        await api_client.credit_account(
            user_id=job["user_id"],
            amount=job["estimated_credits"],
            reason="refund_job_timeout"
        )

        # Notifier l'utilisateur
        await notify_user(
            user_id=job["user_id"],
            message="Le traitement a expiré. Tes crédits ont été remboursés."
        )

        # Supprimer le job
        await redis.delete(f"document_job:{job['job_id']}")
```

---

#### ⚠️ Contradiction mineure : Achat de crédits inline

La RFC mentionne un bouton `[Acheter des crédits]`. L'équipe API recommande Option A (lien externe).

**Position chatbot-core :** D'accord avec Option A pour v1.

**Implémentation :**

```python
# Si crédits insuffisants
if user_balance < estimated_credits:
    content = Content(title="Crédits insuffisants")
    content.add(Section.text(
        f"Ce traitement coûte {estimated_credits} crédits.\n"
        f"Tu as actuellement {user_balance} crédits."
    ))
    content.add_action_row(ActionRow([
        Action(
            id="buy_credits",
            label="Acheter des crédits",
            style=ActionStyle.LINK,
            url=f"https://stripe.example.com/checkout?user_id={user_id}"
        ),
        Action(id="cancel", label="Annuler", style=ActionStyle.SECONDARY)
    ]))
```

---

### 4. Synthèse des accords finaux

| Point | n8n | API | chatbot-core | Status |
|-------|-----|-----|--------------|--------|
| Flow débit/refund | ✅ | ✅ | ✅ | **Validé** |
| Modèle par plugin | ✅ | ✅ | ✅ | **Validé** |
| Stratégie estimation | ✅ | ✅ | ✅ | **Validé** |
| Formule crédits | ✅ | ✅ | ✅ | **Validé** |
| Décisions communes | ✅ | ✅ | ✅ | **Validé** |
| Précision estimation ±15% | ✅ | ✅ | ✅ | **Validé** |
| Codes erreur refund | ✅ | ✅ | ✅ | **Validé** |
| Config pricing dans plugin_context | ✅ | ✅ | ✅ | **Validé** |
| Format callback | ✅ | ✅ | ✅ (+conversation_id) | **Validé** |
| Endpoint callback | Proposé | - | Défini | **Validé** |
| Génération job_id | - | - | chatbot-core | **Validé** |
| Refund automatique | - | - | Oui | **Validé** |
| Envoi document_logs | - | - | chatbot-core | **Validé** |

---

### 5. Prochaines étapes côté chatbot-core

| Tâche | Effort | Dépendance |
|-------|--------|------------|
| `DocumentConfig` dataclass | S | - |
| `DocumentContext` dataclass | S | - |
| `DocumentResult` dataclass | S | - |
| `PluginContext` dataclass (JSON Schema) | M | - |
| `DocumentService` orchestration | L | Config + n8n specs |
| Endpoint callback `/internal/webhooks/document-result` | M | - |
| Stockage jobs Redis | M | Redis existant (RFC-011) |
| Intégration MentionService | M | DocumentService |
| Gestion refund automatique | M | API endpoints |
| Tests unitaires | M | Tout |

**Effort total v1 :** L (Large) - nouvelle fonctionnalité complète

---

### 6. Questions pour l'équipe Plugins

Avant de finaliser, nous avons besoin de retours de l'équipe Plugins :

| # | Question | Contexte |
|---|----------|----------|
| 1 | Quels plugins ont besoin de cette fonctionnalité en priorité ? | Priorisation |
| 2 | Y a-t-il des actions custom spécifiques à prévoir ? (import facture, etc.) | Extensibilité |
| 3 | Les limites par défaut (10 pages, 50 pages/jour) sont-elles acceptables ? | Configuration |
| 4 | Avez-vous des clés API Mistral/OpenAI à fournir ? | Intégration |

---

**L'équipe chatbot-core valide cette RFC. Tous les points techniques sont désormais accordés entre les 3 équipes. En attente des retours de l'équipe Plugins pour finaliser les priorités.**

---

## Validation finale équipe n8n

**Date :** 2026-01-19
**Auteur :** Équipe n8n

---

### ✅ Accord total avec la réponse chatbot-core

L'équipe n8n **valide intégralement** la réponse de l'équipe chatbot-core.

#### Points validés

| Point | Réponse chatbot-core | Validation n8n |
|-------|---------------------|----------------|
| Endpoint callback `/internal/webhooks/document-result` | Réseau interne sécurisé | ✅ Parfait |
| Format callback avec `conversation_id` | Ajout requis | ✅ Sera inclus |
| Clés API via `plugin_context.api_keys` | Transmission dans le contexte | ✅ Conforme à l'existant |
| JSON Schema `plugin_context` | Schéma complet fourni | ✅ Excellent, implémentable |
| Routage via `documents/process` | n8n route en interne | ✅ Préférence confirmée |
| Génération `job_id` par chatbot-core | UUID v4 | ✅ On le retourne tel quel |
| Refund automatique | Basé sur `error.refund.recommended` | ✅ Parfait |
| Retour de toutes les questions en une fois | Optimisation latence | ✅ Accord total |
| Stockage jobs Redis avec TTL | 1h max, vérification 15 min | ✅ Cohérent |
| Timeout jobs avec refund auto | Tâche périodique | ✅ Bonne pratique |

---

### Points mineurs - Décisions acceptées

#### 1. Transmission du `conversation_id` → ✅ Accepté

n8n accepte de recevoir `conversation_id` dans la requête et de le retourner dans le callback. Format attendu :

```json
{
  "job_id": "uuid",
  "conversation_id": "abc123xy",
  ...
}
```

**Décision :** Pas de question, n8n s'adapte.

#### 2. Timeout jobs → ✅ Accepté (15 min fixe pour v1)

n8n accepte le timeout de **15 minutes** proposé par chatbot-core. Ajustement si nécessaire après retours terrain.

**Décision :** Pas de modification, on itère en v2 si besoin.

---

### Engagements n8n pour l'implémentation

| Webhook | Engagement | Priorité |
|---------|------------|----------|
| `/documents/validate` | Retourne TOUTES les questions manquantes en une fois | P1 |
| `/documents/estimate` | Retourne `estimated_credits` si `pricing` fourni dans `plugin_context` | P1 |
| `/documents/process` | Accepte `job_id` et `conversation_id`, les retourne dans le callback | P1 |
| `/documents/process` | Route vers `custom_actions[action].webhook_url` si action non standard | P1 |
| `/documents/save` | Sauvegarde Google Drive sur demande | P2 |
| Callback | Format validé avec `conversation_id`, codes erreur standardisés | P1 |

---

### Synthèse des accords inter-équipes

| Point technique | n8n | API | chatbot-core | Status |
|-----------------|-----|-----|--------------|--------|
| Architecture globale | ✅ | ✅ | ✅ | **VALIDÉ** |
| Flow débit/refund | ✅ | ✅ | ✅ | **VALIDÉ** |
| Modèle économique par plugin | ✅ | ✅ | ✅ | **VALIDÉ** |
| Stratégie "débiter l'estimation" | ✅ | ✅ | ✅ | **VALIDÉ** |
| Formule calcul crédits | ✅ | ✅ | ✅ | **VALIDÉ** |
| Décisions communes (limites) | ✅ | ✅ | ✅ | **VALIDÉ** |
| Précision estimation ±15% | ✅ | ✅ | ✅ | **VALIDÉ** |
| Codes erreur refund | ✅ | ✅ | ✅ | **VALIDÉ** |
| `plugin_context` JSON Schema | ✅ | ✅ | ✅ | **VALIDÉ** |
| Format callback | ✅ | ✅ | ✅ | **VALIDÉ** |
| Endpoint callback interne | ✅ | - | ✅ | **VALIDÉ** |
| Génération `job_id` | ✅ | - | ✅ | **VALIDÉ** |
| Refund automatique | ✅ | ✅ | ✅ | **VALIDÉ** |
| Envoi `document_logs` | - | ✅ | ✅ | **VALIDÉ** |
| Stockage jobs Redis | - | - | ✅ | **VALIDÉ** |
| Timeout avec refund | - | ✅ | ✅ | **VALIDÉ** |

---

### Prochaines étapes équipe n8n

| # | Tâche | Effort | Dépendance |
|---|-------|--------|------------|
| 1 | Créer workflow `documents/validate` avec schéma `plugin_context` | M | JSON Schema fourni |
| 2 | Créer workflow `documents/estimate` avec calcul crédits | M | Formule API |
| 3 | Unifier workflows OCR existants sous `documents/process` | L | - |
| 4 | Implémenter routage `custom_actions` | M | - |
| 5 | Ajouter `conversation_id` au format de réponse | S | - |
| 6 | Implémenter callback vers endpoint chatbot-core | M | Endpoint défini |
| 7 | Tests d'intégration avec chatbot-core | M | Endpoints déployés |

---

**L'équipe n8n valide cette RFC dans son intégralité. Aucune question ouverte.**

**Tous les points techniques sont accordés. Les ajustements mineurs se feront au fil de l'implémentation.**

**✅ RFC bouclée côté n8n.**

---

## Réponse équipe plugin recipes

**Date :** 2026-01-19
**Auteur :** Équipe plugin recipes (Bot Appetit)

---

### 1. Points de concordance

L'équipe plugin recipes **valide cette RFC audacieuse** et salue le travail collaboratif exemplaire entre les équipes n8n, API et chatbot-core. Voici nos points d'accord :

#### ✅ Architecture 100% n8n : Cohérente avec notre philosophie

Notre plugin suit exactement le même pattern depuis le début :

| Pattern RFC-014 | Pattern plugin recipes |
|-----------------|----------------------|
| chatbot-core → n8n → API | Plugin Discord → n8n → API |
| Clés API dans `plugin_context` | Clés API dans chaque requête |
| Traitement asynchrone avec callback | Timers avec notification DM |

**Cette RFC s'inscrit parfaitement dans notre architecture existante.**

#### ✅ Gestion des clés API par plugin

Notre plugin possède déjà toutes les clés nécessaires :

```python
# src/config.py - Clés déjà configurées
mistral_api_key: str = ""      # MISTRAL_API_KEY
google_api_key: str = ""       # GOOGLE_API_KEY
openai_api_key: str = ""       # OPENAI_API_KEY (hérité de BaseConfig)
anthropic_api_key: str = ""    # ANTHROPIC_API_KEY (hérité de BaseConfig)
```

**Le modèle "plugin owner paie ses appels API, crédits = revenu" est validé et déjà notre pratique.**

#### ✅ Format de réponse standardisé

Notre format actuel est compatible :

```json
// Notre format actuel
{
  "success": true,
  "data": { ... },
  "meta": {
    "provider": "anthropic|openai|qdrant",
    "model": "claude-sonnet-4-20250514",
    "tokens_used": 1250
  }
}
```

**Migration vers le format RFC-014 : effort minimal.**

#### ✅ Notification DM pour traitements longs

Nous avons déjà ce pattern pour les timers de cuisson :

```
Celery (15 min) → n8n /recipes-timer-notify → Discord DM
```

**Le pattern callback + DM est validé et éprouvé chez nous.**

---

### 2. Réponses aux questions

#### Question 1 : Priorité de la fonctionnalité pour notre plugin

> **Réponse : HAUTE PRIORITÉ**

| Cas d'usage recipes | Type de traitement | Intérêt |
|--------------------|--------------------|---------|
| **Livre de recettes PDF** | OCR + extraction | ⭐⭐⭐⭐⭐ |
| **Recette manuscrite photographiée** | OCR image | ⭐⭐⭐⭐⭐ |
| **Menu de restaurant (image)** | OCR + traduction | ⭐⭐⭐⭐ |
| **Fiche technique culinaire** | Synthèse points clés | ⭐⭐⭐⭐ |
| **Recette en langue étrangère** | Traduction | ⭐⭐⭐⭐⭐ |
| **Vidéo YouTube avec sous-titres PDF** | OCR + extraction | ⭐⭐⭐ |

**Exemple concret de parcours utilisateur :**

```
User: @Bot "extrais les recettes de ce livre" + livre-cuisine.pdf (8 pages)

Bot: "J'ai détecté 8 pages avec 12 recettes.
     Ce traitement coûtera 20 crédits.
     Tu as 45 crédits."
     [Extraire les recettes] [Annuler]

User: [Extraire les recettes]

Bot: "Traitement en cours... Tu recevras un DM quand ce sera prêt."

--- 2 min plus tard ---

DM: "J'ai extrait 12 recettes de ton livre !
     • Tarte aux pommes (p.2)
     • Coq au vin (p.4)
     • ..."
     [Sauvegarder toutes] [Voir détails] [Ignorer]
```

**Cette fonctionnalité sera un différenciateur majeur pour notre plugin.**

---

#### Question 2 : Actions custom spécifiques

> **Réponse : OUI, 3 actions custom proposées**

| Action custom | Description | Paramètres requis |
|--------------|-------------|-------------------|
| `extract_recipes` | Extraire recettes structurées d'un document | `output_format` (json/list) |
| `convert_units` | Convertir unités (US→métrique, etc.) | `target_system` (metric/imperial) |
| `nutritional_analysis` | Analyser valeurs nutritionnelles | `servings`, `detail_level` |

**Structure `custom_actions` proposée pour plugin recipes :**

```json
{
  "plugin_context": {
    "plugin_id": "bot-appetit",
    "custom_actions": {
      "extract_recipes": {
        "webhook_url": "https://n8n.local/webhook/recipes-extract-from-document",
        "required_params": ["output_format"],
        "description": "Extraire les recettes d'un document (livre, magazine, etc.)"
      },
      "convert_units": {
        "webhook_url": "https://n8n.local/webhook/recipes-convert-units",
        "required_params": ["target_system"],
        "description": "Convertir les unités de mesure"
      },
      "nutritional_analysis": {
        "webhook_url": "https://n8n.local/webhook/recipes-nutritional",
        "required_params": ["servings"],
        "description": "Analyse nutritionnelle détaillée"
      }
    }
  }
}
```

**Note :** Ces webhooks sont à créer côté n8n (effort M chacun). Nous pouvons les développer après la v1 des actions standards.

---

#### Question 3 : Limites par défaut (10 pages, 50 pages/jour)

> **Réponse : ACCEPTABLES avec ajustements suggérés**

| Limite | Proposition RFC | Position plugin recipes | Justification |
|--------|-----------------|------------------------|---------------|
| **10 pages/document** | ✅ | ✅ Acceptable | Un livre de recettes = rarement > 10 pages d'intérêt |
| **50 pages/jour** | ✅ | ⚠️ Suggère 30 pages/jour | Utilisateurs cuisine = usage modéré |

**Justification pour 30 pages/jour :**
- Nos utilisateurs cuisinent 1-2 recettes/jour max
- Un livre de recettes traité = ~8 pages = ~4 jours d'extraction possible
- Évite l'abus tout en permettant un usage raisonnable

**Alternative acceptable :** Garder 50 pages/jour et ajuster selon métriques terrain.

**Limites spécifiques pour `extract_recipes` :**

| Paramètre | Valeur suggérée | Justification |
|-----------|-----------------|---------------|
| `max_recipes_per_document` | 20 | Évite les livres entiers |
| `min_confidence_recipe` | 0.7 | Qualité des extractions |

---

#### Question 4 : Clés API disponibles

> **Réponse : OUI, toutes les clés sont disponibles**

| Provider | Clé disponible | Usage principal |
|----------|---------------|-----------------|
| **Mistral** | ✅ `MISTRAL_API_KEY` | OCR (recommandé RFC-014) |
| **OpenAI** | ✅ `OPENAI_API_KEY` | Embeddings Qdrant, traduction |
| **Anthropic** | ✅ `ANTHROPIC_API_KEY` | Génération recettes, synthèse |
| **Google** | ✅ `GOOGLE_API_KEY` | YouTube, recherche web |
| **Mathpix** | ❌ Non configuré | À ajouter si besoin (formules) |

**Structure `api_keys` pour plugin recipes :**

```json
{
  "plugin_context": {
    "api_keys": {
      "mistral": "${MISTRAL_API_KEY}",
      "openai": "${OPENAI_API_KEY}",
      "anthropic": "${ANTHROPIC_API_KEY}",
      "google": "${GOOGLE_API_KEY}"
    }
  }
}
```

**Note :** Mathpix non nécessaire pour les recettes (pas de formules mathématiques).

---

### 3. Points de vigilance et suggestions

#### ⚠️ OCR de recettes : Cas particuliers

Les recettes présentent des défis OCR spécifiques :

| Défi | Exemple | Solution suggérée |
|------|---------|-------------------|
| **Unités de mesure** | "½ c. à s." mal lu | Glossaire culinaire post-OCR |
| **Fractions** | "1/4 tasse" | Regex de normalisation |
| **Abréviations** | "tbsp", "tsp", "oz" | Dictionnaire d'expansion |
| **Mise en page colonnes** | Ingrédients à gauche, étapes à droite | Détection layout avant OCR |

**Proposition :** Ajouter un mode `recipe_optimized: true` dans les options qui active ces post-traitements.

---

#### ⚠️ Préservation structure recettes

Pour les recettes, la structure est CRITIQUE :

```markdown
## Ingrédients (doit rester groupé)
- 200g farine
- 3 œufs
- 100g sucre

## Préparation (ordre des étapes = crucial)
1. Préchauffer le four
2. Mélanger les ingrédients secs
3. Incorporer les œufs
```

**Suggestion :** Pour `action: extract_recipes`, retourner du JSON structuré plutôt que du texte libre :

```json
{
  "recipes": [
    {
      "title": "Gâteau au chocolat",
      "ingredients": [...],
      "steps": [...],
      "metadata": {
        "page": 3,
        "ocr_confidence": 0.92
      }
    }
  ]
}
```

---

#### ⚠️ Coût pour extraction de recettes

L'extraction de recettes nécessite plus de tokens qu'une simple traduction (structuration JSON).

**Suggestion de pricing pour `extract_recipes` :**

```json
{
  "pricing": {
    "extract_recipes": {
      "base": 8,
      "per_1k_tokens": 1.5,
      "per_page": 3,
      "ocr_bonus": 3,
      "max": 60
    }
  }
}
```

**Justification :** Extraction + structuration JSON = ~50% plus de tokens que traduction simple.

---

### 4. Synthèse et engagement

#### Ce que l'équipe plugin recipes peut livrer

| Tâche | Effort | Dépendance |
|-------|--------|------------|
| Configuration `plugin_context` avec clés API | S | JSON Schema validé |
| Intégration du flow document dans le plugin | M | DocumentService chatbot-core |
| Commande `/extraire <document>` | M | Webhooks n8n prêts |
| Affichage résultats extraction recettes | M | Format réponse défini |
| Tests utilisateurs | M | Tout |

**Effort total plugin recipes v1 :** M (Medium)

#### Actions custom à développer (v2)

| Action | Priorité | Effort |
|--------|----------|--------|
| `extract_recipes` | P1 | M |
| `convert_units` | P2 | S |
| `nutritional_analysis` | P3 | M |

---

### 5. Questions de clarification

| # | Question | Destinataire |
|---|----------|--------------|
| 1 | Le JSON Schema `plugin_context` sera-t-il versionné ? (pour migrations futures) | chatbot-core |
| 2 | Peut-on avoir un mode `preview` qui retourne le texte extrait AVANT la structuration ? (pour debug) | n8n |
| 3 | Les `custom_actions` peuvent-elles retourner des fichiers (PDF généré, JSON exporté) ? | n8n |
| 4 | Y a-t-il une limite de taille pour le champ `result.text` du callback ? | chatbot-core |

---

### 6. Conclusion

**L'équipe plugin recipes valide cette RFC avec enthousiasme.**

Cette fonctionnalité répond à un besoin réel de nos utilisateurs :
- Digitaliser leurs livres de recettes
- Traduire des recettes étrangères
- Extraire des recettes de magazines/photos

**Points forts de la RFC :**
- Architecture cohérente avec l'existant
- Extensibilité via `custom_actions`
- Système de crédits transparent
- Codes d'erreur exhaustifs pour le refund

**La RFC est audacieuse, mais réalisable. Nous sommes prêts à contribuer.**

---

**L'équipe plugin recipes valide cette RFC et s'engage à implémenter les intégrations nécessaires dès que chatbot-core et n8n seront prêts.**

---

## Réponse équipe plugin Torah

**Date :** 2026-01-19
**Auteur :** Équipe plugin Torah (Torah-Fun)

---

### 1. Points de concordance

L'équipe plugin Torah **valide cette RFC audacieuse** et reconnaît l'excellence du travail collaboratif. Cette RFC répond à un besoin critique pour notre plugin spécialisé dans les textes judaïques.

#### ✅ Architecture n8n : Déjà notre ADN

Notre plugin délègue **100% des traitements à n8n** depuis sa création :

| Service Torah existant | Pattern n8n | Concordance RFC |
|----------------------|-------------|-----------------|
| `SegmentTranslationService` | POST webhook + polling | ✅ Identique |
| `PageTranslationService` | Job async + callback progress | ✅ Identique |
| `VocalizationService` | POST webhook synchrone | ✅ Compatible |
| `TorahN8NClient` | Client spécialisé avec crédits | ✅ Prêt |

**Nous n'avons aucune modification architecturale à faire.**

#### ✅ Système de crédits : Opérationnel

Notre système de crédits est **identique** à celui proposé :

```python
# src/services/n8n_client.py - Déjà implémenté
@requires_credits(cost=5)  # Décorateur framework
async def translate_page(...):
    # Débit automatique via TorahN8NClient.debit_credits()
```

| Action Torah | Coût actuel | RFC-014 compatible |
|-------------|-------------|-------------------|
| Traduction segment | 1 crédit | ✅ |
| Traduction page | 5 crédits | ✅ |
| Vocalisation (nekudot) | 1 crédit | ✅ |

**Le modèle économique "plugin owner paie API, crédits = revenu" est déjà notre pratique.**

#### ✅ Polling asynchrone avec callbacks

Notre `PageTranslationService` utilise **exactement** le pattern prévu :

```python
# Pattern existant dans page_translation.py
async def translate_with_polling(
    traite: str,
    page: str,
    on_progress: ProgressCallback  # ← Callback progression
) -> JobProgress:
    # 1. POST vers n8n → reçoit job_id
    # 2. Polling GET status avec job_id
    # 3. on_progress(current, total, percentage)
    # 4. Retour JobProgress.status = completed|failed
```

**La RFC formalise ce que nous faisons déjà.**

#### ✅ Accord avec plugin recipes sur les fondamentaux

Nous partageons les mêmes validations que l'équipe recipes :
- Format callback proposé par n8n : **validé**
- Codes d'erreur avec refund : **validé**
- Notification DM pour traitements longs : **validé**
- JSON Schema `plugin_context` : **validé**

---

### 2. Réponses aux questions

#### Question 1 : Priorité de la fonctionnalité

> **Réponse : PRIORITÉ CRITIQUE**

Le plugin Torah a des besoins **uniques et urgents** en traitement de documents :

| Cas d'usage Torah | Type de traitement | Intérêt | Spécificité |
|------------------|-------------------|---------|-------------|
| **Manuscrit Talmudique scanné** | OCR hébreu ancien | ⭐⭐⭐⭐⭐ | Écriture sans voyelles |
| **Page de Guemara photographiée** | OCR + structuration | ⭐⭐⭐⭐⭐ | Texte principal + commentaires |
| **Commentaire de Rashi (PDF)** | OCR + traduction | ⭐⭐⭐⭐⭐ | Écriture Rashi spéciale |
| **Sidour (livre de prières)** | OCR + vocalisation | ⭐⭐⭐⭐ | Ajout des nekudot |
| **Texte hébraïque moderne** | Traduction | ⭐⭐⭐⭐ | Standard |
| **Article académique biblique** | Synthèse | ⭐⭐⭐⭐ | Multi-langues (hébreu/anglais) |

**Exemple de parcours utilisateur Torah :**

```
User: @TorahBot "traduis ce manuscrit" + page_talmud.jpg

Bot: "J'ai détecté une page de Talmud (Sukkah).
     Le texte est en hébreu sans voyelles.

     Options :
     • Traduction seule : 15 crédits
     • Traduction + vocalisation : 20 crédits

     Tu as 50 crédits."
     [Traduction seule] [Traduction + vocalisation] [Annuler]

User: [Traduction + vocalisation]

Bot: "Traitement en cours... (OCR qualité estimée : 85%)
     Tu recevras un DM quand ce sera prêt."

--- 3 min plus tard ---

DM: "📜 Traduction terminée !

     **Texte original (vocalisé) :**
     שָׁלוֹם עֲלֵיכֶם רַבִּי וּמוֹרִי...

     **Traduction française :**
     Paix sur vous, mon Rabbi et maître...

     ⚠️ Confiance OCR : 85% - 2 passages incertains signalés"
     [Voir texte complet] [Sauvegarder] [Signaler erreur]
```

**Cette fonctionnalité est essentielle pour démocratiser l'accès aux textes judaïques anciens.**

---

#### Question 2 : Actions custom spécifiques

> **Réponse : OUI, 4 actions custom critiques**

**Nos besoins diffèrent fondamentalement de recipes** en raison de la nature des textes judaïques :

| Action custom | Description | Paramètres requis | Spécificité |
|--------------|-------------|-------------------|-------------|
| `vocalize_text` | Ajouter les voyelles hébraïques (nekudot) | `vocalization_style` | **Unique Torah** |
| `extract_talmud_structure` | Extraire texte principal + commentaires | `commentators[]` | **Unique Torah** |
| `summarize_commentaries` | Synthèse des commentateurs sur un passage | `focus`, `commentators[]` | **Unique Torah** |
| `translate_with_pivot` | Traduction via pivot anglais (qualité+) | `target_language`, `use_pivot` | Partagé mais critique |

**Structure `custom_actions` pour plugin Torah :**

```json
{
  "plugin_context": {
    "plugin_id": "torah-fun",
    "custom_actions": {
      "vocalize_text": {
        "webhook_url": "https://n8n.local/webhook/torah-vocalize",
        "required_params": ["vocalization_style"],
        "description": "Ajouter les nekudot (voyelles hébraïques) au texte",
        "options": {
          "vocalization_style": ["standard", "ashkenazi", "sephardi", "yemenite"]
        }
      },
      "extract_talmud_structure": {
        "webhook_url": "https://n8n.local/webhook/torah-extract-structure",
        "required_params": [],
        "optional_params": ["commentators"],
        "description": "Extraire la structure d'une page de Talmud",
        "options": {
          "commentators": ["rashi", "tosafot", "ramban", "rashba", "ritva", "meiri"]
        }
      },
      "summarize_commentaries": {
        "webhook_url": "https://n8n.local/webhook/torah-summarize-commentaries",
        "required_params": ["commentators"],
        "description": "Synthèse comparative des commentateurs",
        "options": {
          "focus": ["pshat", "drash", "halacha", "aggada"]
        }
      },
      "translate_with_pivot": {
        "webhook_url": "https://n8n.local/webhook/torah-translate-pivot",
        "required_params": ["target_language"],
        "description": "Traduction via pivot anglais pour qualité optimale"
      }
    }
  }
}
```

**Justification du pivot anglais :**

Notre expérience montre que la traduction **Hébreu → Anglais → Français** est supérieure à **Hébreu → Français** direct :

| Méthode | Qualité moyenne | Erreurs théologiques |
|---------|-----------------|---------------------|
| Direct hébreu→français | 75% | Fréquentes |
| Pivot hébreu→anglais→français | 92% | Rares |

**Ce pattern est déjà implémenté dans notre `SegmentTranslationService`.**

---

#### Question 3 : Limites par défaut

> **Réponse : ACCEPTABLES avec ajustements critiques**

| Limite | Proposition RFC | Position Torah | Justification |
|--------|-----------------|---------------|---------------|
| **10 pages/document** | ✅ | ⚠️ **Demande 15 pages** | Une page de Talmud = 2 côtés (recto/verso) = beaucoup de texte |
| **50 pages/jour** | ✅ | ✅ Acceptable | Étude quotidienne = "Daf Yomi" = 1 page/jour |

**Justification pour 15 pages :**

Une page de Talmud (appelée "daf") a **deux faces** (amoud a et amoud b). Un chapitre typique = 5-8 daf = 10-16 faces. La limite de 10 pages empêcherait de traiter un chapitre complet.

**Limites spécifiques suggérées pour Torah :**

| Paramètre | Valeur | Justification |
|-----------|--------|---------------|
| `max_pages_talmud` | 15 | Chapitre complet |
| `max_pages_sidour` | 20 | Section de prières |
| `min_ocr_confidence_ancient` | 0.70 | Manuscrits = qualité variable |
| `min_ocr_confidence_modern` | 0.85 | Imprimés modernes |

---

#### Question 4 : Clés API disponibles

> **Réponse : OUI, toutes les clés critiques sont disponibles**

| Provider | Clé disponible | Usage Torah principal |
|----------|---------------|----------------------|
| **OpenAI** | ✅ `OPENAI_API_KEY` | GPT-4o vocalisation, embeddings Qdrant |
| **Anthropic** | ✅ `ANTHROPIC_API_KEY` | Claude traduction (modèle principal) |
| **Mistral** | ⚠️ À configurer | OCR (recommandé RFC-014) |
| **Google** | ✅ `GOOGLE_API_KEY` | Gemini recherche web |
| **Mathpix** | ❌ Non nécessaire | Pas de formules mathématiques |

**Structure `api_keys` pour plugin Torah :**

```json
{
  "plugin_context": {
    "api_keys": {
      "openai": "${OPENAI_API_KEY}",
      "anthropic": "${ANTHROPIC_API_KEY}",
      "mistral": "${MISTRAL_API_KEY}",
      "google": "${GOOGLE_API_KEY}"
    }
  }
}
```

**Note importante :** Nous devons ajouter `MISTRAL_API_KEY` à notre configuration pour bénéficier de l'OCR Mistral recommandé.

---

### 3. Points de vigilance et contradictions

#### 🔴 CRITIQUE : OCR pour hébreu ancien

La RFC ne mentionne pas les défis spécifiques de l'OCR hébreu ancien :

| Défi | Exemple | Impact | Solution suggérée |
|------|---------|--------|-------------------|
| **Écriture sans voyelles** | שלום (pas שָׁלוֹם) | Ambiguïté lexicale | Vocalisation post-OCR obligatoire |
| **Écriture Rashi** | Police cursive médiévale | OCR difficile | Modèle entraîné spécifique |
| **Ligatures hébraïques** | אלהים avec ligature | Caractères mal séparés | Normalisation Unicode |
| **Araméen mélangé** | Guemara = hébreu + araméen | Détection langue | Multi-langue dans même document |
| **Taamim (cantillation)** | ֑֒֓֔֕ etc. | Rarement préservés | Option `preserve_taamim: true` |

**Proposition d'ajout au format de requête :**

```json
{
  "action": "translate",
  "options": {
    "hebrew_mode": "ancient",      // ancient | modern | mixed
    "vocalize_output": true,       // Ajouter nekudot au résultat
    "preserve_taamim": false,      // Préserver signes cantillation
    "detect_rashi_script": true,   // Détecter écriture Rashi
    "aramaic_aware": true          // Détecter passages araméens
  }
}
```

**Question pour équipe n8n :** Mistral OCR gère-t-il l'écriture Rashi et les ligatures hébraïques ? Sinon, faut-il un fallback vers un modèle spécialisé ?

---

#### ⚠️ Préservation structure Talmud

La structure d'une page de Talmud est **hiérarchique et complexe** :

```
┌─────────────────────────────────────────────────────────────┐
│                      PAGE DE TALMUD                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              TEXTE PRINCIPAL (centre)                │   │
│  │     Mishna (hébreu) + Guemara (araméen)             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐                    ┌──────────────┐      │
│  │    RASHI     │                    │   TOSAFOT    │      │
│  │   (gauche)   │                    │   (droite)   │      │
│  │              │                    │              │      │
│  │ Commentaire  │                    │ Critiques    │      │
│  │  principal   │                    │  et ajouts   │      │
│  └──────────────┘                    └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

**Le chunking naïf détruirait cette structure.**

**Proposition pour `extract_talmud_structure` :**

```json
{
  "result": {
    "page_reference": "Sukkah 28a",
    "structure": {
      "mishna": {
        "hebrew": "...",
        "translation": "...",
        "segments": [...]
      },
      "gemara": {
        "aramaic": "...",
        "translation": "...",
        "segments": [...]
      },
      "commentaries": {
        "rashi": {
          "text": "...",
          "references": ["mishna:1", "gemara:3"]
        },
        "tosafot": {
          "text": "...",
          "references": ["rashi:2"]
        }
      }
    },
    "ocr_confidence": {
      "mishna": 0.95,
      "gemara": 0.88,
      "rashi": 0.72,      // Écriture cursive = moins fiable
      "tosafot": 0.85
    }
  }
}
```

---

#### ⚠️ Score OCR différencié

Pour les manuscrits anciens, le seuil de 80% (RFC-014) est **trop strict** :

| Type de document | Score OCR typique | Seuil recommandé |
|-----------------|-------------------|------------------|
| PDF moderne | 95-99% | 80% (RFC) ✅ |
| Imprimé XIXe siècle | 85-92% | 75% |
| Manuscrit médiéval | 65-80% | 60% |
| Écriture Rashi | 60-75% | 55% |

**Proposition : Seuil configurable par `plugin_context`**

```json
{
  "plugin_context": {
    "ocr_thresholds": {
      "confidence_warning": 0.60,    // Avertissement (au lieu de 0.80)
      "confidence_reject": 0.40      // Rejet automatique
    }
  }
}
```

---

#### ⚠️ Coût pour textes complexes

Les textes judaïques nécessitent **plus de passes** qu'un document standard :

| Traitement | Passes | Justification |
|------------|--------|---------------|
| Document standard | 1 | OCR → traduction |
| Texte hébreu moderne | 2 | OCR → vocalisation → traduction |
| Page de Talmud | 3 | OCR → structuration → vocalisation → traduction |
| Manuscrit ancien | 4 | OCR → correction manuelle → vocalisation → traduction |

**Proposition de pricing pour Torah :**

```json
{
  "pricing": {
    "translate": {
      "base": 5,
      "per_1k_tokens": 1.0,
      "per_page": 2,
      "ocr_bonus": 3,
      "hebrew_ancient_bonus": 5,    // ← Ajout
      "vocalization_bonus": 2,      // ← Ajout
      "max": 60                     // ← Augmenté
    },
    "extract_talmud_structure": {
      "base": 10,
      "per_1k_tokens": 1.5,
      "per_page": 4,
      "ocr_bonus": 5,
      "max": 80
    },
    "summarize_commentaries": {
      "base": 8,
      "per_1k_tokens": 1.0,
      "per_commentator": 3,
      "max": 50
    }
  }
}
```

---

### 4. Comparaison avec plugin recipes

| Aspect | Plugin recipes | Plugin Torah | Complexité relative |
|--------|---------------|--------------|---------------------|
| Langues | Multilingue standard | Hébreu + Araméen + scripts anciens | Torah ++++ |
| Structure document | Recettes (ingrédients + étapes) | Talmud (texte + commentaires hiérarchiques) | Torah +++ |
| OCR | Standard avec unités | Hébreu ancien, écriture Rashi | Torah ++++ |
| Post-traitement | Normalisation unités | Vocalisation (nekudot) | Torah ++ |
| Actions custom | 3 | 4 | Similaire |
| Limite pages | 10 suffisant | 15 nécessaire | Torah + |

**Conclusion : Le plugin Torah a des besoins OCR significativement plus complexes.**

---

### 5. Synthèse et engagement

#### Ce que l'équipe plugin Torah peut livrer

| Tâche | Effort | Dépendance |
|-------|--------|------------|
| Configuration `plugin_context` avec clés API | S | JSON Schema validé |
| Ajout `MISTRAL_API_KEY` à la config | S | - |
| Intégration du flow document dans le plugin | M | DocumentService chatbot-core |
| Commande `/ocr <document>` | M | Webhooks n8n prêts |
| Commande `/traduire-document` | M | Webhooks n8n prêts |
| Mapping langues hébreu/araméen | S | - |
| Tests sur manuscrits anciens | L | OCR Mistral hébreu validé |

**Effort total plugin Torah v1 :** L (Large) - complexité hébreu ancien

#### Actions custom à développer (v2)

| Action | Priorité | Effort | Dépendance |
|--------|----------|--------|------------|
| `vocalize_text` | P1 | M | Webhook existant, à adapter |
| `extract_talmud_structure` | P1 | L | Nouveau workflow n8n |
| `translate_with_pivot` | P2 | S | Logique existante |
| `summarize_commentaries` | P3 | M | Dépend de structure |

---

### 6. Questions de clarification

| # | Question | Destinataire |
|---|----------|--------------|
| 1 | Mistral OCR supporte-t-il l'écriture Rashi (cursive hébraïque médiévale) ? | n8n |
| 2 | Peut-on avoir un mode `hebrew_ancient: true` qui ajuste automatiquement les seuils OCR ? | n8n |
| 3 | Le `plugin_context.ocr_thresholds` est-il acceptable pour personnaliser les seuils ? | chatbot-core |
| 4 | Peut-on chaîner automatiquement OCR → vocalisation → traduction en une seule requête ? | n8n |
| 5 | Existe-t-il un modèle OCR spécialisé pour l'araméen (Guemara) ? | n8n |

---

### 7. Conclusion

**L'équipe plugin Torah valide cette RFC avec enthousiasme malgré nos besoins spécifiques.**

Cette fonctionnalité répond à un besoin **missionnaire** :
- Démocratiser l'accès aux textes judaïques anciens
- Permettre l'étude du Talmud aux non-hébraïsants
- Préserver le patrimoine textuel juif via la digitalisation

**Points forts de la RFC :**
- Architecture n8n = notre ADN
- Extensibilité via `custom_actions` = critique pour nos besoins
- Système de crédits = déjà opérationnel chez nous
- Callback asynchrone = pattern déjà maîtrisé

**Points à renforcer :**
- Support OCR hébreu ancien (écriture Rashi, manuscrits)
- Vocalisation automatique post-OCR
- Seuils OCR configurables par plugin
- Limite 15 pages pour Talmud

**La RFC est audacieuse, et nous sommes audacieux. Nous sommes prêts.**

---

**L'équipe plugin Torah valide cette RFC et s'engage à être pilote pour les cas d'usage hébreu/araméen dès que l'infrastructure sera prête.**

---

## Réponse chatbot-core : Clarifications finales

**Date :** 2026-01-19
**Auteur :** Équipe chatbot-core (Framework)

---

### Réponses aux questions des plugins

#### Question Recipes 1 : Versioning du JSON Schema `plugin_context`

> **Réponse : OUI, versioning léger**

Le `plugin_context` inclura un champ `schema_version` optionnel :

```json
{
  "plugin_context": {
    "schema_version": "1.0",
    "plugin_id": "bot-appetit",
    ...
  }
}
```

**Règles de compatibilité :**
- Ajout de champs optionnels = pas de bump version
- Modification de champs existants = bump version mineure
- chatbot-core acceptera les contextes sans `schema_version` (défaut = "1.0")

**Pas de migration automatique prévue v1.** Les plugins devront adapter manuellement si breaking change (rare).

---

#### Question Recipes 4 : Limite de taille `result.text`

> **Réponse : 100 Ko max, chunking si nécessaire**

| Limite | Valeur | Justification |
|--------|--------|---------------|
| `result.text` | 100 Ko | Limite Discord embed + mémoire raisonnable |
| `result.file_url` | Illimité | Pour documents volumineux |

**Comportement si dépassement :**

```json
{
  "result": {
    "text": "[Texte tronqué - voir fichier complet]",
    "text_truncated": true,
    "file_url": "https://cdn.example.com/results/abc123.txt"
  }
}
```

**Les `custom_actions` peuvent retourner des fichiers** via `result.file_url`. chatbot-core affichera un lien de téléchargement.

---

#### Question Torah 3 : `ocr_thresholds` dans `plugin_context`

> **Réponse : OUI, accepté**

Le JSON Schema `plugin_context` intègre `ocr_thresholds` :

```json
{
  "plugin_context": {
    "ocr_thresholds": {
      "confidence_warning": 0.60,
      "confidence_reject": 0.40
    }
  }
}
```

**Valeurs par défaut (si non spécifié) :**

| Seuil | Défaut | Torah suggéré | Recipes suggéré |
|-------|--------|---------------|-----------------|
| `confidence_warning` | 0.80 | 0.60 | 0.70 |
| `confidence_reject` | 0.50 | 0.40 | 0.50 |

**chatbot-core transmet ces seuils à n8n.** C'est n8n qui applique la logique warning/reject.

---

### Décisions sur les ajustements demandés

#### Limite pages : 10 standard, configurable par plugin

> **Décision : Configurable via `plugin_context.limits`**

```json
{
  "plugin_context": {
    "limits": {
      "max_pages": 15,          // Torah: 15, Recipes: 10
      "max_file_size_mb": 25,
      "daily_pages_limit": 50
    }
  }
}
```

**Chaque plugin définit ses propres limites.** chatbot-core applique les limites du `plugin_context` reçu.

| Plugin | `max_pages` | Justification |
|--------|-------------|---------------|
| Recipes | 10 | Livres de recettes = pages ciblées |
| Torah | 15 | Chapitres Talmud = 10-16 faces |
| Défaut | 10 | Raisonnable pour v1 |

---

#### Pricing bonus hébreu : Délégué à n8n/API

> **Décision : chatbot-core ne calcule pas les crédits**

Les bonus `hebrew_ancient_bonus`, `vocalization_bonus` sont gérés par n8n dans la formule d'estimation. chatbot-core affiche simplement le devis retourné par `/documents/estimate`.

**Pas de modification chatbot-core nécessaire.**

---

### Synthèse des accords finaux inter-équipes

| Point | Status | Responsable |
|-------|--------|-------------|
| Schema versioning | ✅ `schema_version: "1.0"` | chatbot-core |
| Limite `result.text` | ✅ 100 Ko + `file_url` fallback | chatbot-core |
| Seuils OCR configurables | ✅ `ocr_thresholds` dans schema | chatbot-core → n8n |
| Limite pages configurable | ✅ `limits.max_pages` par plugin | chatbot-core |
| Retour fichiers custom_actions | ✅ Via `result.file_url` | n8n → chatbot-core |
| Pricing bonus hébreu | ✅ Géré par n8n/API | n8n + API |

---

### Questions résiduelles pour n8n

Les 6 questions des plugins vers n8n restent ouvertes. Nous recommandons une **réponse pragmatique** :

| Question | Proposition chatbot-core |
|----------|-------------------------|
| Mode `preview` (debug) | Optionnel v2, pas bloquant |
| Retour fichiers | ✅ Supporté via `file_url` |
| OCR Rashi | Test empirique, fallback si échec |
| Mode `hebrew_ancient` | Optionnel v2, seuils manuels v1 |
| Chaînage OCR→vocalisation→traduction | Workflow n8n interne, transparent pour chatbot-core |
| OCR araméen | Test empirique avec Mistral |

**Recommandation : Ne pas bloquer la RFC pour ces détails. Ajuster au fur et à mesure des retours terrain.**

---

### Conclusion

**L'équipe chatbot-core considère la RFC prête pour implémentation.**

Tous les points techniques sont résolus. Les ajustements mineurs (OCR hébreu, mode preview) seront affinés lors des tests d'intégration.

**Prochaine étape : Transmission à n8n et API pour validation finale et clôture.**

---

## Réponse finale équipe n8n - Clôture

**Date :** 2026-01-19
**Auteur :** Équipe n8n

---

### Réponses aux 6 questions des plugins

L'équipe n8n valide les propositions pragmatiques de chatbot-core et fournit les réponses définitives :

| # | Question | Réponse n8n | Status |
|---|----------|-------------|--------|
| 1 | **Mode `preview`** (texte brut avant structuration) | ✅ Accepté. Paramètre `preview: true` retournera le texte OCR brut. Implémentation v2. | Optionnel |
| 2 | **Retour fichiers** dans `custom_actions` | ✅ Supporté via `result.file_url` ou `result.file_base64`. | Prêt |
| 3 | **OCR Rashi** (écriture cursive hébraïque) | ⚠️ Test empirique. Mistral OCR supporte l'hébreu moderne. Pour Rashi/manuscrits, ajuster `ocr_confidence_threshold` à 0.6 et tester. Fallback manuel si < 50%. | Test requis |
| 4 | **Mode `hebrew_ancient`** | ✅ Accepté. Équivalent à `ocr_thresholds.confidence_threshold: 0.6` + post-traitement spécialisé. Implémentation v2. | Optionnel |
| 5 | **Chaînage OCR→vocalisation→traduction** | ✅ Faisable. Workflow n8n interne avec 3 étapes séquentielles. Transparent pour chatbot-core. | Prêt |
| 6 | **OCR araméen** (Guemara) | ⚠️ Test empirique. Mistral traite l'araméen comme "hébreu ancien". Qualité variable, seuil 0.5 recommandé. | Test requis |

---

### Position n8n sur les points spécifiques

#### Plugin recipes

| Point | Réponse |
|-------|---------|
| `extract_recipes` | ✅ Workflow dédié à créer. Retour JSON structuré. |
| `convert_units` | ✅ Simple post-traitement LLM. |
| `nutritional_analysis` | ✅ Appel API nutrition externe + LLM. |
| Pricing custom | ✅ `pricing.extract_recipes` accepté dans `plugin_context`. |

#### Plugin Torah

| Point | Réponse |
|-------|---------|
| `vocalize_text` | ✅ Workflow existant adaptable. |
| `extract_talmud_structure` | ⚠️ Complexe. Effort L. À prioriser v2. |
| Limite 15 pages | ✅ Configurable via `limits.max_pages: 15`. |
| `ocr_thresholds` | ✅ Passé dans `plugin_context`, utilisé par n8n. |

---

### Synthèse finale

| Équipe | Status RFC |
|--------|------------|
| n8n | ✅ **VALIDÉ - Clôturé** |
| API | ✅ **VALIDÉ** (attente confirmation finale) |
| chatbot-core | ✅ **VALIDÉ** |
| plugin recipes | ✅ **VALIDÉ** |
| plugin Torah | ✅ **VALIDÉ** |

---

### Engagement final n8n

**L'équipe n8n s'engage à :**

1. Implémenter les 4 webhooks core (`validate`, `estimate`, `process`, `save`) en **priorité P1**
2. Supporter les `custom_actions` avec routage dynamique
3. Accepter `plugin_context` avec `api_keys`, `pricing`, `ocr_thresholds`, `limits`
4. Retourner `conversation_id` et `job_id` dans tous les callbacks
5. Utiliser les codes d'erreur standardisés avec `refund.recommended`
6. Tester empiriquement OCR hébreu/araméen et documenter les résultats

**Les ajustements mineurs (mode preview, hebrew_ancient, OCR spécialisé) seront implémentés en v2 selon retours terrain.**

---

**✅ RFC CLÔTURÉE côté n8n.**

**Aucune question ouverte. Prêt pour implémentation.**

---

## Références

- [RFC-007: Mention Service](./RFC-007-MENTION-SERVICE.md) - Gestion des @Bot
- [RFC-011: Mémoire Conversationnelle](./RFC-011-LLM-MEMORY.md) - Dialogue multi-tours
- [DocumentClient n8n](../api/document-client.md) - Client existant pour OCR/PDF
- [RFC-007b: Modèle de consommation de crédits](./RFC-007b-RESPONSE-API-CREDITS.md) - Architecture crédits

---

## Historique

| Date | Version | Auteur | Modification |
|------|---------|--------|--------------|
| 2026-01-19 | 1.0.0 | Équipe Framework | Création initiale |
| 2026-01-19 | 1.1.0 | Équipe Framework | Ajout validation côté n8n, traitements par plugin, révision/correction multi-passes, correction problèmes structure |
| 2026-01-19 | 1.2.0 | Équipe n8n | Réponse équipe n8n : concordances, réponses aux questions, points de vigilance |
| 2026-01-19 | 1.3.0 | Équipe API | Réponse équipe API : infrastructure existante, formule tokens→crédits, logs MongoDB, points de vigilance débit/refund |
| 2026-01-19 | 1.3.1 | Équipe API | Réponses aux questions complémentaires n8n : callback, clés API, facturation, conversion crédits |
| 2026-01-19 | 1.4.0 | Équipe n8n | Retour sur propositions API : validation accords, réponses aux questions API (estimation ±15%, codes erreur refund), format callback proposé |
| 2026-01-19 | 1.5.0 | Équipe API | Validation finale : codes erreur, précision ±15%, format estimate - Accords API↔n8n complets |
| 2026-01-19 | 1.6.0 | Équipe chatbot-core | Réponse framework : validation des accords, réponses aux questions (callback endpoint, plugin_context JSON Schema, job tracking Redis), points de vigilance (latence, timeout), questions équipe Plugins |
| 2026-01-19 | 1.7.0 | Équipe n8n | Validation finale : accord total avec chatbot-core, engagements d'implémentation, synthèse des accords inter-équipes - RFC prête pour équipe Plugins |
| 2026-01-19 | 1.8.0 | Équipe plugin recipes | Réponse plugin recipes : validation RFC, cas d'usage recettes (OCR livres, traduction), 3 actions custom proposées (extract_recipes, convert_units, nutritional_analysis), clés API disponibles, points de vigilance OCR culinaire |
| 2026-01-19 | 1.9.0 | Équipe plugin Torah | Réponse plugin Torah : validation RFC, besoins spécifiques hébreu/araméen (OCR Rashi, manuscrits anciens, nekudot), 4 actions custom (vocalize_text, extract_talmud_structure, summarize_commentaries, translate_with_pivot), demande 15 pages/doc, seuils OCR configurables, pricing adapté textes complexes |
| 2026-01-19 | 2.0.0 | Équipe chatbot-core | Clarifications finales : versioning schema_version, limite result.text 100Ko + file_url, ocr_thresholds accepté, limites configurables par plugin, recommandation clôture RFC - Prêt pour validation n8n/API |
| 2026-01-19 | 2.1.0 | Équipe n8n | **Clôture n8n** : réponses aux 6 questions plugins, validation positions recipes/Torah, engagements d'implémentation - RFC clôturée côté n8n |
