# RFC-035 : Documentation des Prompts

**Date:** 2026-02-13
**Statut:** Draft
**Auteur:** Équipe plugin-recipes
**Équipes concernées:** Vue.js UI, api-backend, plugin-recipes, n8n, chatbot-core
**Dernière mise à jour:** 2026-02-13

---

## Table des matières

1. [Résumé](#1-résumé)
2. [Architecture des prompts](#2-architecture-des-prompts)
3. [Prompts utilisateur (Discord)](#3-prompts-utilisateur-discord)
4. [Prompts LLM (Génération)](#4-prompts-llm-génération)
5. [Prompts de scope (Identité)](#5-prompts-de-scope-identité)
6. [Templates de messages](#6-templates-de-messages)
7. [Variables disponibles](#7-variables-disponibles)
8. [Fichiers sources](#8-fichiers-sources)
9. [Prompts chatbot-core (analyse)](#9-prompts-chatbot-core-analyse)
10. [Proposition d'externalisation](#10-proposition-dexternalisation-chatbot-core)

---

## 1. Résumé

Ce document référence **tous les prompts et messages** utilisés par le plugin Bot Appetit:

| Catégorie | Fichier source | Usage |
|-----------|----------------|-------|
| Messages utilisateur | `config/prompts/responses.yaml` | Réponses Discord |
| Identité bot | `config/prompts/scope.yaml` | Persona et limites |
| Branding | `config/branding.yaml` | Visuel et footer |
| Learning prompts | `config/prompts/responses.yaml` | Génération cours/quiz |
| Commandes | `src/branding.py` | Aide et descriptions |

---

## 2. Architecture des prompts

```
config/
├── branding.yaml              # Identité visuelle
├── prompts/
│   ├── responses.yaml         # Messages Discord
│   └── scope.yaml             # Persona LLM
├── learning.yaml              # Config apprentissage
├── badges.yaml                # Définition badges
└── templates/
    └── server_templates.yaml  # Templates serveur
```

**Chargement:** Via `PromptManager` de chatbot-core (v0.7.0+)

```python
from chatbot_core.services import PromptManager

pm = PromptManager(config_dir)
pm.load()
greeting = pm.get_random_message("messages.greetings")
```

---

## 3. Prompts utilisateur (Discord)

**Source:** `config/prompts/responses.yaml`

### 3.1 Salutations

```yaml
messages:
  greetings:
    - "Salut ! Je suis **{bot_name}**, ton assistant culinaire. Tape `/help` pour voir ce que je sais faire !"
    - "Bonjour ! Comment puis-je t'aider en cuisine aujourd'hui ?"
    - "Hello ! Pret a cuisiner ? `/recette` pour commencer !"
```

| Variable | Description |
|----------|-------------|
| `{bot_name}` | Nom du bot (depuis branding) |

**Usage:** Sélection aléatoire à chaque salutation.

---

### 3.2 Message d'aide

```yaml
messages:
  help: |
    Je suis **{bot_name}**, ton assistant culinaire intelligent !

    **Ce que je sais faire :**
    - **Rechercher des recettes** : `/recette pizza`, `/websearch ramen`
    - **Extraire des recettes YouTube** : `/youtube tiramisu`
    - **Trouver par ingredients** : `/ingredients poulet, citron`
    - **Suggestions aleatoires** : `/suggestion dessert`
    - **Gerer ta liste de courses** : `/liste show`, `/liste add`
    - **Programmer des timers** : `/timer 15 pates`
    - **Sauvegarder tes favoris** : `/sauvegarder`, `/favoris`

    Tape `/help` pour la liste complete des commandes !
```

---

### 3.3 Mention vide

```yaml
messages:
  empty_mention: >
    Tu m'as mentionne mais tu n'as rien dit !
    Pose-moi une question culinaire ou tape `/help` pour voir mes commandes.
```

**Trigger:** Quand l'utilisateur fait `@Bot` sans texte.

---

### 3.4 Messages d'erreur

```yaml
messages:
  errors:
    generic: "Oups, je n'ai pas pu traiter ta demande. Essaie une commande comme `/recette` ou `/help` !"
    rate_limit: "Doucement {user_name} ! Tu m'as deja parle plusieurs fois. Reessaie dans {cooldown}s."
    search_failed: "Erreur lors de la recherche. Reessaie plus tard."
    no_results: "Desole, je n'ai pas trouve de resultat pour **{query}**."
```

| Variable | Description |
|----------|-------------|
| `{user_name}` | Nom d'affichage utilisateur |
| `{cooldown}` | Temps restant en secondes |
| `{query}` | Recherche de l'utilisateur |

---

### 3.5 Recherche web

```yaml
messages:
  web_search:
    searching: "🔍 Pas de recette pour **{query}** en base, je cherche sur le web..."
    found_saved: "✅ **{title}** trouvee sur le web et sauvegardee !"
    found_not_saved: "✅ **{title}** trouvee sur le web."
    not_found: "Desole, je n'ai pas trouve de recette pour **{query}** sur le web."
```

| Variable | Description |
|----------|-------------|
| `{query}` | Termes de recherche |
| `{title}` | Titre de la recette trouvée |

---

### 3.6 Proposition de recherche web (avec boutons)

```yaml
messages:
  propose_web_search:
    with_match: >
      J'ai trouve **{best_match}** ({score}% de correspondance)
      mais ce n'est pas exactement ce que tu cherches.
    no_match: "Pas de recette pour **{query}** en base."
    reformulation: "🔍 J'ai compris : *\"{reformulation}\"*"
    ask_action: "Que veux-tu faire ?"
```

| Variable | Description |
|----------|-------------|
| `{best_match}` | Meilleur résultat Qdrant |
| `{score}` | Score de correspondance (0-100) |
| `{reformulation}` | Query reformulée par le LLM |

---

### 3.7 OCR Images

```yaml
messages:
  ocr:
    extracted: "**{title}** extraite de l'image !"
    saved: "Sauvegardee en base."
    not_saved: "(Non sauvegardee)"
    error: "Je n'ai pas pu lire cette image : {error}"
```

| Variable | Description |
|----------|-------------|
| `{title}` | Titre extrait de la recette |
| `{error}` | Message d'erreur OCR |

---

## 4. Prompts LLM (Génération)

**Source:** `config/prompts/responses.yaml` section `learning:`

### 4.1 Génération de cours

```yaml
learning:
  generate_course: |
    Tu es un chef cuisinier expert et formateur.
    Génère un cours complet sur le sujet suivant: {topic}

    Le cours doit être adapté au niveau: {level}
    Langue: {language}

    Structure du cours:
    1. Introduction et objectifs
    2. Matériel et ingrédients nécessaires
    3. Techniques de base à maîtriser
    4. Étapes détaillées avec explications
    5. Conseils et astuces de chef
    6. Erreurs courantes à éviter
    7. Exercices pratiques suggérés

    Sois pédagogue, précis et engageant.
```

| Variable | Description | Valeurs |
|----------|-------------|---------|
| `{topic}` | Sujet du cours | "cuisine écossaise", "sauces mères" |
| `{level}` | Niveau | "debutant", "intermediaire", "avance" |
| `{language}` | Langue | "fr", "en" |

**Webhook:** `learning-generate-course`

---

### 4.2 Génération de quiz

```yaml
learning:
  generate_quiz: |
    Tu es un formateur culinaire expert.
    Génère un quiz de {num_questions} questions sur le sujet: {topic}

    Niveau: {level}
    Langue: {language}

    Format de chaque question:
    - Question claire et précise
    - 4 options de réponse (A, B, C, D)
    - La bonne réponse identifiée
    - Une explication de pourquoi c'est la bonne réponse

    Les questions doivent tester la compréhension, pas juste la mémorisation.
```

| Variable | Description | Valeurs |
|----------|-------------|---------|
| `{topic}` | Sujet du quiz | "pâtisserie", "sauces" |
| `{num_questions}` | Nombre de questions | 5, 10, 20 |
| `{level}` | Niveau | "debutant", "intermediaire", "avance" |
| `{language}` | Langue | "fr", "en" |

**Webhook:** `learning-generate-quiz`

---

### 4.3 Fallback

```yaml
learning:
  fallback: "Génère du contenu pédagogique sur: {topic}"
```

Utilisé si le template spécifique n'est pas trouvé.

---

## 5. Prompts de scope (Identité)

**Source:** `config/prompts/scope.yaml`

### 5.1 Identité du bot

```yaml
scope:
  identity:
    role: "Tu es {bot_name}, un assistant cuisine passionne et expert."
    qualities:
      - "passionne de cuisine du monde entier"
      - "precis dans les quantites et temps de cuisson"
      - "creatif pour les substitutions d'ingredients"
      - "patient pour expliquer les techniques"
      - "encourageant pour les debutants"
    limitations:
      - "pas un medecin ou nutritionniste certifie"
      - "pas un expert en allergies alimentaires graves"
      - "pas capable de diagnostiquer des problemes de sante"
```

---

### 5.2 Mission

```yaml
scope:
  mission: >
    Aider les utilisateurs a decouvrir, creer et personnaliser des recettes
    adaptees a leurs gouts, leur niveau et leurs ingredients disponibles.
```

---

### 5.3 Périmètre - Ce que le bot PEUT faire

```yaml
scope:
  can:
    - "proposer des recettes selon les ingredients ou envies"
    - "suggerer des alternatives d'ingredients"
    - "expliquer des techniques culinaires"
    - "aider a planifier des repas de la semaine"
    - "convertir des unites de mesure"
    - "adapter les quantites selon le nombre de personnes"
    - "recommander des accords mets-vins basiques"
    - "donner des astuces de conservation"
    - "expliquer l'origine des plats"
```

---

### 5.4 Périmètre - Ce que le bot NE PEUT PAS faire

```yaml
scope:
  cannot:
    - "donner des conseils medicaux ou nutritionnels therapeutiques"
    - "prescrire des regimes pour maladies specifiques"
    - "garantir l'absence d'allergenes (toujours verifier les etiquettes)"
    - "remplacer l'avis d'un professionnel de sante"
    - "repondre a des questions sans rapport avec la cuisine"
```

---

### 5.5 Garde-fous (sujets à refuser)

```yaml
scope:
  guardrails:
    - "Conseils medicaux et nutritionnels therapeutiques"
    - "Regimes pour maladies (diabete, insuffisance renale, etc.)"
    - "Garanties sur les allergenes"
    - "Sujets non lies a la cuisine (politique, actualites, etc.)"
```

---

### 5.6 Message hors scope

```yaml
scope:
  out_of_scope_message: |
    Je suis **{bot_name}**, specialise en cuisine !
    Pose-moi des questions sur les recettes, ingredients ou techniques culinaires.
    Tape `/help` pour voir mes commandes.
```

---

### 5.7 Politique d'incertitude

```yaml
scope:
  uncertainty_policy: >
    Si tu n'es pas sur d'une information (temps de cuisson, temperature),
    indique-le clairement et suggere de verifier.
```

---

### 5.8 Exemple few-shot

```yaml
scope:
  examples:
    - input: "Comment faire une bechamel ?"
      output: |
        La bechamel est une sauce blanche de base ! Voici la recette:

        **Ingredients** (pour 500ml):
        - 50g de beurre
        - 50g de farine
        - 500ml de lait
        - Sel, poivre, muscade

        **Etapes**:
        1. Faire fondre le beurre
        2. Ajouter la farine, melanger 2 min
        3. Verser le lait progressivement en fouettant
        4. Cuire 10 min en remuant
        5. Assaisonner
```

---

## 6. Templates de messages

### 6.1 Branding - Footer embeds

**Source:** `config/branding.yaml`

```yaml
footer:
  text: "{bot_name} - Ton assistant culinaire"
  icon_url: null
```

---

### 6.2 Emojis standardisés

```yaml
emojis:
  success: "✅"
  error: "❌"
  warning: "⚠️"
  search: "🔍"
  loading: "⏳"
  recipe: "🍽️"
  ingredient: "🥕"
  timer: "⏱️"
  favorite: "⭐"
  shopping: "🛒"
  credits: "💳"
  chef: "👨‍🍳"
```

**Usage:** `{emojis.success}` dans les templates.

---

### 6.3 Niveaux culinaires (Learning)

**Source:** `config/learning.yaml`

| Niveau | Titre | Emoji | XP requis |
|--------|-------|-------|-----------|
| 1 | Commis | 🥄 | 0 |
| 2 | Apprenti | 🍴 | 100 |
| 3 | Cuisinier | 🍳 | 300 |
| 4 | Chef de partie | 👨‍🍳 | 600 |
| 5 | Sous-chef | 🎖️ | 1000 |
| 6 | Chef | 👨‍🍳 | 1500 |
| 7 | Chef exécutif | 🏅 | 2500 |
| 8 | Maître cuisinier | 🥇 | 4000 |
| 9 | Grand Chef | 🏆 | 6000 |
| 10 | Chef étoilé | ⭐ | 10000 |

---

### 6.4 Badges (extraits)

**Source:** `config/badges.yaml`

| ID | Nom | Emoji | XP | Condition |
|----|-----|-------|-----|-----------|
| `first_step` | Premier pas | 🥄 | 10 | 1 leçon |
| `on_fire` | En feu | 🔥 | 50 | Streak 7 jours |
| `perfectionist` | Perfectionniste | 💯 | 30 | Quiz 100% |
| `sauce_master` | Maître des sauces | 👨‍🍳 | 150 | Parcours sauces |
| `legend` | Légende | 💎 | 500 | Niveau 10 |

**Total:** 29 badges définis dans 9 catégories.

---

## 7. Variables disponibles

### 7.1 Variables globales

| Variable | Source | Description |
|----------|--------|-------------|
| `{bot_name}` | `config/branding.yaml` | Nom du bot |
| `{bot_emoji}` | `config/branding.yaml` | Emoji principal |

### 7.2 Variables utilisateur

| Variable | Source | Description |
|----------|--------|-------------|
| `{user_name}` | Discord | Nom d'affichage |
| `{user_id}` | Discord | ID utilisateur |
| `{username}` | Discord | Username#discriminator |

### 7.3 Variables contextuelles

| Variable | Source | Description |
|----------|--------|-------------|
| `{query}` | Input | Recherche utilisateur |
| `{title}` | Résultat | Titre recette |
| `{score}` | Qdrant | Score correspondance |
| `{cooldown}` | Rate limit | Temps restant |
| `{error}` | Exception | Message d'erreur |

### 7.4 Variables learning

| Variable | Source | Description |
|----------|--------|-------------|
| `{topic}` | Input | Sujet du cours/quiz |
| `{level}` | Input | Niveau (debutant/intermediaire/avance) |
| `{language}` | Config | Langue (fr/en) |
| `{num_questions}` | Input | Nombre de questions quiz |

---

## 8. Fichiers sources

### 8.1 Chemins des fichiers

```
plugin-recipes/
├── config/
│   ├── branding.yaml              # Identité visuelle
│   ├── badges.yaml                # 29 badges définis
│   ├── learning.yaml              # Config XP, niveaux, quiz
│   ├── plugin.yaml                # Features, rate limit
│   ├── prompts/
│   │   ├── responses.yaml         # Messages Discord + Learning
│   │   └── scope.yaml             # Persona LLM
│   └── templates/
│       └── server_templates.yaml  # 6 templates serveur
└── src/
    ├── branding.py                # Commandes /help
    ├── mentions.py                # Handlers messages
    └── tools/
        └── executor.py            # Prompts learning
```

### 8.2 Accès programmatique

```python
# Via PromptManager
from chatbot_core.services import PromptManager

pm = PromptManager(Path("config"))
pm.load()

# Messages
greeting = pm.get_random_message("messages.greetings")
help_msg = pm.get_message("messages.help")
error = pm.get_message("messages.errors.generic")

# Scope
scope = pm.get_scope_config()
out_of_scope = pm.get_out_of_scope_message()

# Branding
branding = pm.get_branding()
```

### 8.3 Dans executor.py (Learning)

```python
# Chargement des prompts learning
def _load_learning_prompts() -> dict[str, str]:
    config_path = Path(__file__).parent.parent.parent / "config/prompts/responses.yaml"
    # ... charge depuis YAML
    return {
        "learning-generate-course": "...",
        "learning-generate-quiz": "...",
    }

# Usage
prompt_template = learning_prompts.get(tool, "")
prompt = prompt_template.format(
    topic=topic,
    level=level,
    language=language,
    num_questions=num_questions,
)
```

---

## 9. Prompts chatbot-core (analyse)

**Auteur:** Équipe chatbot-core
**Date analyse:** 2026-02-13

Cette section documente les prompts et messages **hardcodés** dans le core framework, distincts des prompts configurables par les plugins.

---

### 9.1 System Prompts LLM

#### 9.1.1 Assemblage modulaire (`services/scope.py:96-168`)

Le `ScopeConfig` assemble les prompts système en 8 sections avec labels FR hardcodés :

```python
# Labels de section hardcodés (FR uniquement)
"## Identité"
"## Mission"
"## Périmètre fonctionnel"
"Tu peux :"           # Line 123
"Tu ne dois pas :"    # Line 129
"## Processus interne"
"Processus de réponse :"  # Line 136
"## Contrat de sortie"
"## Politique d'incertitude"
"## Garde-fous"       # Line 154
"## Exemples"
```

#### 9.1.2 Legacy prompt assembly (`core/config_types.py:81-140`)

Ancienne méthode `to_prompt()` avec labels différents :

```python
"Tu es:"              # Line 99
"Limitations:"        # Line 105
"Mission: {self.mission}"  # Line 111
"Tu PEUX:"            # Line 115
"Tu NE PEUX PAS:"     # Line 121
"Sujets à refuser:"   # Line 127
"Exemples:"           # Line 133
"Utilisateur: {input_text}\nAssistant: {output_text}"  # Lines 137-138
```

**⚠️ Problème:** Deux systèmes coexistent avec labels différents.

---

### 9.2 Messages utilisateur par défaut

#### 9.2.1 MentionConfig (`services/mention.py:137-138`)

```python
rate_limit_message = "Doucement ! Réessaie dans {cooldown}s."
error_message = "Désolé, je n'ai pas pu traiter ta demande."
```

#### 9.2.2 Message hors-scope (`core/config_types.py:153`)

```python
# Fallback si aucun message configuré
"Je suis {bot_name}, je ne peux pas répondre à cette question."
```

#### 9.2.3 Command templates (`discord_ui/command_templates.py:38-47`)

```python
class CommandMessages:
    service_not_configured = "Le service n'est pas configuré."
    insufficient_credits = "Credits insuffisants"
    insufficient_credits_detail = "Tu as besoin de **{required}** credit(s) mais tu n'en as que **{remaining}**."
    not_subscribed = "Pas encore inscrit"
    not_subscribed_detail = "Utilise `/subscribe` pour t'inscrire!"
    service_unavailable = "Service temporairement indisponible."
    error_title = "Erreur"
```

**Footer embed (Line 249):**
```python
"Utilise /subscribe pour obtenir plus de credits"
```

---

### 9.3 Placeholders UI (Modals Discord)

#### 9.3.1 ScopeIdentityModal (`discord_ui/config/scope.py:345-389`)

```python
# Placeholders d'exemple dans les modals de configuration
"Ex: Tu es BOT-APPETIT, un assistant cuisine du quotidien."
"pragmatique\nrapide\nbienveillant\norienté solution"
"un chef gastronomique\nun nutritionniste médical\nun conseiller financier"
```

#### 9.3.2 ScopeMissionModal (`discord_ui/config/scope.py:391-424`)

```python
"Aider à trouver des recettes simples et rapides."
"Je suis spécialisé en cuisine !"
```

#### 9.3.3 Autres modals

| Modal | Fichier:Ligne | Placeholder |
|-------|---------------|-------------|
| ScopeScopeModal | scope.py:432 | `"proposer une recette\nsuggérer des alternatives"` |
| ScopeProcessModal | scope.py:468 | `"1. Identifier l'intention\n2. Vérifier..."` |
| ScopeUncertaintyModal | scope.py:531 | `"Pose UNE question avant de répondre."` |
| ScopeGuardrailsModal | scope.py:557 | `"Conseils médicaux\nDonnées personnelles"` |
| ScopeExamplesModal | scope.py:583 | `"J'ai des oeufs, que faire ?"` |
| BrandingScopeModal | branding.py:553 | `"Tu es un assistant spécialisé en X."` |

---

### 9.4 Intent Clarification Templates

#### 9.4.1 Domaines par défaut (`intent/config.py:102-109`)

```python
clarification_templates: dict[str, tuple[str, str, str]] = {
    "recipes": ("📖", "Recette", "Voir les ingrédients et étapes"),
    "courses": ("🎓", "Cours", "Suivre la formation vidéo"),
    "shopping": ("🛒", "Liste", "Ajouter à la liste de courses"),
    "account": ("👤", "Compte", "Gérer votre abonnement"),
}
```

#### 9.4.2 Fallback (`intent/resolver.py:340`)

```python
"Accéder à {domain}"  # Si domaine non trouvé dans templates
```

---

### 9.5 Exemples d'aide intégrés (`services/scope.py:362-660`)

Fonction `get_default_scope_help()` avec exemples complets FR/EN :

**Français (Lines 367-512):**
```python
"Tu es BOT-APPETIT, un assistant cuisine du quotidien..."
"pragmatique\nrapide\nbienveillant\norienté solution"
"Transformer une demande utilisateur en solution cuisine simple..."
"Je suis spécialisé en cuisine ! Pose-moi des questions sur les recettes..."
"Si une information essentielle manque, pose UNE seule question courte..."
"J'ai des œufs et des tomates, pas beaucoup de temps."
```

**Anglais (Lines 513-658):**
```python
"You are BOT-APPETIT, a daily cooking assistant..."
"pragmatic\nfast\nfriendly\nsolution-oriented"
"Transform a user request into a simple cooking solution..."
"I specialize in cooking! Ask me about recipes..."
```

---

### 9.6 Autres messages hardcodés

| Service | Fichier | Message |
|---------|---------|---------|
| Document | document_service.py | `"Tu ne peux pas annuler ce job."` |
| Document | document_workflow.py | `"Tu as déjà {pending_count} document(s) en cours..."` |
| Document | document_workflow.py | `"✅ Tu peux maintenant soumettre de nouveaux documents."` |
| Rating | rating_view.py | `"Tu as donne **{stars}** a ce {entity_name}."` |
| Comments | comments_view.py | `"Tu n'as pas de commentaire sur cette page."` |
| Slash | slash_commands.py | `"Tu es maintenant sur le plan **{plan['name']}**!"` |
| Slash | slash_commands.py | `"Tu n'as pas la permission de supprimer des messages."` |

---

### 9.7 Synthèse et recommandations

#### Problèmes identifiés

| Problème | Impact | Fichiers concernés |
|----------|--------|-------------------|
| **Double système de scope** | Incohérence des labels | `scope.py` vs `config_types.py` |
| **French-only hardcoded** | Pas d'i18n possible | Tous les fichiers |
| **Pas de fichiers template** | Prompts dans le code Python | N/A |
| **Placeholders = exemples réels** | Confusion BOT-APPETIT partout | `discord_ui/config/*.py` |

#### Recommandations

1. **Externaliser les labels** dans un fichier `chatbot_core/config/labels.yaml`
2. **Unifier** le système de scope (déprécier `config_types.to_prompt()`)
3. **Ajouter i18n** via `{label.identity}` au lieu de `"## Identité"` hardcodé
4. **Séparer les exemples** des placeholders UI (référencer plugin-recipes)

---

## Changelog

| Date | Auteur | Modification |
|------|--------|--------------|
| 2026-02-13 | plugin-recipes | Création du document |
| 2026-02-13 | chatbot-core | Ajout section 9 - Analyse prompts hardcodés core |
| 2026-02-13 | chatbot-core | Ajout section 10 - Proposition externalisation |

---

## 10. Proposition d'externalisation (chatbot-core)

### 10.1 Catégorisation des prompts à externaliser

| Catégorie | Fichiers source | Criticité | Source proposée |
|-----------|-----------------|-----------|-----------------|
| **A. Labels système** | `scope.py` (assemblage) | Haute | `labels.yaml` |
| **B. Placeholders UI** | `discord_ui/config/*.py` | Moyenne | `placeholders.yaml` |
| **C. Messages erreur** | `command_templates.py` | Haute | `responses.yaml` |
| **D. Intent templates** | `intent/config.py` | Moyenne | `intent.yaml` ou DB |
| **E. Aide scope** | `scope.py:362-660` | Basse | Documentation |

---

### 10.2 Architecture proposée

```
Plugin (plugin-recipes)                    chatbot-core
========================                   ============

config/
├── branding.yaml
├── prompts/
│   ├── scope.yaml
│   ├── responses.yaml      ──────────►   PromptManager.get_message()
│   └── labels.yaml (NEW)   ──────────►   PromptManager.get_label()
├── ui/
│   └── placeholders.yaml (NEW) ──────►   PromptManager.get_placeholder()
└── intent.yaml (NEW)       ──────────►   IntentConfig.clarification_templates

                    OU

Database (api-backend)
======================
prompts table
├── guild_id
├── category (label|placeholder|message|intent)
├── key
├── value
└── language
                            ──────────►   PromptManager.load_from_db()
```

---

### 10.3 Détail par catégorie

#### A. Labels système (`labels.yaml`)

Labels utilisés pour assembler les prompts LLM. Permettrait le support i18n.

```yaml
# config/prompts/labels.yaml
labels:
  scope_assembly:
    identity_section: "## Identité"
    mission_section: "## Mission"
    scope_section: "## Périmètre fonctionnel"
    can_do: "Tu peux :"
    cannot_do: "Tu ne dois pas :"
    process_section: "## Processus interne"
    process_steps: "Processus de réponse :"
    contract_section: "## Contrat de sortie"
    uncertainty_section: "## Politique d'incertitude"
    guardrails_section: "## Garde-fous"
    examples_section: "## Exemples"
    user_label: "Utilisateur"
    assistant_label: "Assistant"
```

**Impact code (`scope.py`):**
```python
# Avant (hardcodé)
sections.append("## Identité")
sections.append("Tu peux :")

# Après (externalisé)
sections.append(self.labels.get("identity_section", "## Identité"))
sections.append(self.labels.get("can_do", "Tu peux :"))
```

---

#### B. Placeholders UI (`placeholders.yaml`)

Exemples affichés dans les modals de configuration Discord.

```yaml
# config/ui/placeholders.yaml
placeholders:
  scope_identity:
    role: "Ex: Tu es {bot_name}, un assistant spécialisé en {domain}."
    qualities: "professionnel\nprécis\nbienveillant"
    limitations: "un expert certifié\nun conseiller juridique"
  scope_mission:
    mission: "Aider les utilisateurs à {main_goal}."
    out_of_scope: "Je suis spécialisé en {domain} ! Pose-moi des questions sur ce sujet."
  scope_perimeter:
    can_do: "répondre aux questions sur {domain}\ndonner des conseils pratiques"
    cannot_do: "donner des conseils médicaux\ntraiter des données personnelles"
  scope_process:
    steps: "1. Identifier l'intention\n2. Vérifier le périmètre\n3. Répondre"
  scope_examples:
    input: "Comment faire X ?"
    output: "Voici comment faire X : ..."
```

**Impact code (`discord_ui/config/scope.py`):**
```python
# Avant (hardcodé BOT-APPETIT)
placeholder="Ex: Tu es BOT-APPETIT, un assistant cuisine du quotidien."

# Après (externalisé)
placeholder=self.prompt_manager.get_placeholder(
    "scope_identity.role",
    bot_name=self.bot_name,
    domain=self.domain
)
```

---

#### C. Messages d'erreur (dans `responses.yaml`)

Déjà supporté par le système actuel, juste besoin d'ajouter les clés.

```yaml
# config/prompts/responses.yaml (ajouts)
messages:
  system:
    service_not_configured: "Le service n'est pas configuré."
    service_unavailable: "Service temporairement indisponible."
  credits:
    insufficient: "Crédits insuffisants"
    insufficient_detail: "Tu as besoin de **{required}** crédit(s) mais tu n'en as que **{remaining}**."
    get_more: "Utilise /subscribe pour obtenir plus de crédits"
  subscription:
    not_subscribed: "Pas encore inscrit"
    not_subscribed_detail: "Utilise `/subscribe` pour t'inscrire!"
    success: "Tu es maintenant sur le plan **{plan_name}**!"
```

**Impact code (`command_templates.py`):**
```python
# Avant (hardcodé)
class CommandMessages:
    SERVICE_NOT_CONFIGURED = "Le service n'est pas configure."

# Après (injecté via PromptManager)
class CommandMessages:
    def __init__(self, prompt_manager: PromptManager):
        self.pm = prompt_manager

    @property
    def SERVICE_NOT_CONFIGURED(self) -> str:
        return self.pm.get_message("messages.system.service_not_configured")
```

---

#### D. Intent templates (`intent.yaml` ou DB)

Templates de clarification pour la résolution d'intention.

```yaml
# config/intent.yaml
intent:
  clarification_templates:
    recipes:
      emoji: "📖"
      label: "Recette"
      description: "Voir les ingrédients et étapes"
    courses:
      emoji: "🎓"
      label: "Cours"
      description: "Suivre la formation vidéo"
    shopping:
      emoji: "🛒"
      label: "Liste"
      description: "Ajouter à la liste de courses"
    account:
      emoji: "👤"
      label: "Compte"
      description: "Gérer votre abonnement"
  fallback_description: "Accéder à {domain}"
```

---

### 10.4 Architecture DB + Redis

**Décision:** Les prompts seront stockés en base de données avec cache Redis.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   api-backend   │     │      Redis      │     │  chatbot-core   │
│   (PostgreSQL)  │     │    (Cache)      │     │    (Plugin)     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  prompts table        │  prompts:{guild_id}   │
         │                       │  TTL: 5 min           │
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     PromptProvider      │
                    │  (nouveau service)      │
                    │                         │
                    │  1. Check Redis cache   │
                    │  2. If miss → fetch DB  │
                    │  3. Store in Redis      │
                    │  4. Return prompts      │
                    └─────────────────────────┘
```

---

### 10.5 Schéma base de données

```sql
-- Table principale des prompts
CREATE TABLE prompts (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    language VARCHAR(5) DEFAULT 'fr',
    is_default BOOLEAN DEFAULT FALSE,  -- TRUE pour les defaults système
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(guild_id, category, key, language)
);

-- Defaults système (guild_id = 0)
-- Prompts personnalisés par guild (guild_id = discord_guild_id)

CREATE INDEX idx_prompts_guild_category ON prompts(guild_id, category);
CREATE INDEX idx_prompts_lookup ON prompts(guild_id, category, key, language);

-- Catégories:
-- 'label'       : Labels d'assemblage prompt ("## Identité", "Tu peux :")
-- 'placeholder' : Placeholders UI modals
-- 'message'     : Messages utilisateur (erreurs, succès, etc.)
-- 'intent'      : Templates clarification intent
-- 'scope'       : Prompts système LLM (identity, mission, etc.)
```

---

### 10.6 Structure Redis

```
# Clé par guild + catégorie
prompts:{guild_id}:labels      → Hash { key: value, ... }
prompts:{guild_id}:messages    → Hash { key: value, ... }
prompts:{guild_id}:placeholders → Hash { key: value, ... }
prompts:{guild_id}:intent      → Hash { key: value, ... }
prompts:{guild_id}:scope       → Hash { key: value, ... }

# TTL: 300 secondes (5 min)
# Invalidation: sur update via API

# Exemple
prompts:123456789:labels → {
    "scope_assembly.identity_section": "## Identité",
    "scope_assembly.can_do": "Tu peux :",
    ...
}
```

---

### 10.7 PromptProvider (nouveau service chatbot-core)

```python
# chatbot_core/services/prompt_provider.py

from __future__ import annotations
import json
import logging
from typing import Any

from chatbot_core.services.redis import RedisService

logger = logging.getLogger(__name__)

CACHE_TTL = 300  # 5 minutes
CACHE_PREFIX = "prompts"


class PromptProvider:
    """
    Fournit les prompts depuis Redis/DB avec fallback.

    Fallback chain:
    1. Redis cache (guild-specific)
    2. DB (guild-specific)
    3. Redis cache (defaults, guild_id=0)
    4. DB (defaults, guild_id=0)
    5. Hardcoded defaults (dernier recours)
    """

    def __init__(
        self,
        redis: RedisService,
        db_client: Any,  # APIClient ou DB directe
        guild_id: int,
        language: str = "fr",
    ):
        self.redis = redis
        self.db = db_client
        self.guild_id = guild_id
        self.language = language
        self._defaults = self._load_hardcoded_defaults()

    async def get_label(self, key: str, **kwargs) -> str:
        """Get a label with variable substitution."""
        value = await self._get("labels", key)
        return value.format(**kwargs) if kwargs else value

    async def get_message(self, key: str, **kwargs) -> str:
        """Get a user message with variable substitution."""
        value = await self._get("messages", key)
        return value.format(**kwargs) if kwargs else value

    async def get_placeholder(self, key: str, **kwargs) -> str:
        """Get a UI placeholder with variable substitution."""
        value = await self._get("placeholders", key)
        return value.format(**kwargs) if kwargs else value

    async def get_intent_template(self, domain: str) -> tuple[str, str, str]:
        """Get intent clarification template (emoji, label, description)."""
        value = await self._get("intent", domain)
        if isinstance(value, dict):
            return (value["emoji"], value["label"], value["description"])
        return ("❓", domain, f"Accéder à {domain}")

    async def get_all(self, category: str) -> dict[str, Any]:
        """Get all prompts for a category (for bulk operations)."""
        cache_key = f"{CACHE_PREFIX}:{self.guild_id}:{category}"

        # Try cache
        cached = await self.redis.hgetall(cache_key)
        if cached:
            return {k: json.loads(v) for k, v in cached.items()}

        # Fetch from DB and cache
        data = await self._fetch_from_db(category)
        if data:
            await self._cache_category(category, data)
        return data

    async def invalidate(self, category: str | None = None):
        """Invalidate cache (called after DB update)."""
        if category:
            await self.redis.delete(f"{CACHE_PREFIX}:{self.guild_id}:{category}")
        else:
            # Invalidate all categories
            for cat in ["labels", "messages", "placeholders", "intent", "scope"]:
                await self.redis.delete(f"{CACHE_PREFIX}:{self.guild_id}:{cat}")

    async def _get(self, category: str, key: str) -> str:
        """Internal: get single value with fallback chain."""
        cache_key = f"{CACHE_PREFIX}:{self.guild_id}:{category}"

        # 1. Try guild cache
        value = await self.redis.hget(cache_key, key)
        if value:
            return value

        # 2. Try guild DB (and populate cache)
        all_data = await self.get_all(category)
        if key in all_data:
            return all_data[key]

        # 3. Try defaults (guild_id=0)
        default_cache_key = f"{CACHE_PREFIX}:0:{category}"
        value = await self.redis.hget(default_cache_key, key)
        if value:
            return value

        # 4. Hardcoded default
        return self._defaults.get(category, {}).get(key, f"[{category}.{key}]")

    async def _fetch_from_db(self, category: str) -> dict[str, Any]:
        """Fetch all prompts for category from DB."""
        # Via API backend
        response = await self.db.get(
            f"/prompts/{self.guild_id}",
            params={"category": category, "language": self.language}
        )
        return response.get("data", {})

    async def _cache_category(self, category: str, data: dict[str, Any]):
        """Cache category data in Redis."""
        cache_key = f"{CACHE_PREFIX}:{self.guild_id}:{category}"
        if data:
            await self.redis.hset(cache_key, mapping={
                k: json.dumps(v) if not isinstance(v, str) else v
                for k, v in data.items()
            })
            await self.redis.expire(cache_key, CACHE_TTL)

    def _load_hardcoded_defaults(self) -> dict[str, dict[str, str]]:
        """Hardcoded defaults as last resort."""
        return {
            "labels": {
                "scope_assembly.identity_section": "## Identité",
                "scope_assembly.mission_section": "## Mission",
                "scope_assembly.can_do": "Tu peux :",
                "scope_assembly.cannot_do": "Tu ne dois pas :",
                # ... etc
            },
            "messages": {
                "system.service_unavailable": "Service temporairement indisponible.",
                "credits.insufficient": "Crédits insuffisants",
                # ... etc
            },
            "placeholders": {
                "scope_identity.role": "Ex: Tu es un assistant spécialisé.",
                # ... etc (sans BOT-APPETIT!)
            },
        }
```

---

### 10.8 Chargement au démarrage du plugin

```python
# plugin-recipes/src/bot.py

from chatbot_core.services import PromptProvider
from chatbot_core.services.redis import RedisService

class RecipesBot:
    async def setup_hook(self):
        # Connexions
        self.redis = RedisService(redis_url=config.REDIS_URL)
        self.api_client = APIClient(base_url=config.API_URL)

        # Initialiser le PromptProvider
        self.prompts = PromptProvider(
            redis=self.redis,
            db_client=self.api_client,
            guild_id=self.guild_id,
            language="fr",
        )

        # Précharger les catégories critiques (optionnel, warm-up)
        await self.prompts.get_all("labels")
        await self.prompts.get_all("messages")

        # Injection dans les services qui en ont besoin
        self.scope_service = ScopeService(prompts=self.prompts)
        self.command_messages = CommandMessages(prompts=self.prompts)
```

---

### 10.9 API Backend endpoints

```python
# api-backend/routes/prompts.py

@router.get("/prompts/{guild_id}")
async def get_prompts(
    guild_id: int,
    category: str | None = None,
    language: str = "fr",
):
    """Get prompts for a guild (with fallback to defaults)."""
    # Fetch guild-specific
    query = select(Prompt).where(
        Prompt.guild_id == guild_id,
        Prompt.language == language,
    )
    if category:
        query = query.where(Prompt.category == category)

    results = await db.execute(query)
    prompts = {p.key: p.value for p in results.scalars()}

    # Merge with defaults (guild_id=0) for missing keys
    if guild_id != 0:
        defaults = await get_prompts(0, category, language)
        prompts = {**defaults["data"], **prompts}

    return {"data": prompts}


@router.put("/prompts/{guild_id}")
async def update_prompt(
    guild_id: int,
    body: PromptUpdate,
):
    """Update a prompt and invalidate Redis cache."""
    # Upsert in DB
    await db.execute(
        insert(Prompt)
        .values(
            guild_id=guild_id,
            category=body.category,
            key=body.key,
            value=body.value,
            language=body.language,
        )
        .on_conflict_do_update(
            index_elements=["guild_id", "category", "key", "language"],
            set_={"value": body.value, "updated_at": func.now()},
        )
    )

    # Invalidate Redis cache via pub/sub ou direct
    await redis.publish(
        "prompt_invalidate",
        json.dumps({"guild_id": guild_id, "category": body.category})
    )

    return {"status": "ok"}
```

---

### 10.10 Plan d'implémentation révisé

| Phase | Tâche | Équipe | Livrable |
|-------|-------|--------|----------|
| **1** | Créer table `prompts` + migration | api-backend | Schema DB |
| **1** | Script seed defaults (guild_id=0) | api-backend | Données initiales |
| **2** | Créer `PromptProvider` service | chatbot-core | Nouveau service |
| **2** | Endpoints API `/prompts` | api-backend | REST API |
| **3** | Migrer `scope.py` → utilise PromptProvider | chatbot-core | Labels externalisés |
| **3** | Migrer `command_templates.py` | chatbot-core | Messages externalisés |
| **4** | Migrer `discord_ui/config/*.py` | chatbot-core | Placeholders externalisés |
| **4** | Migrer `intent/config.py` | chatbot-core | Intent templates |
| **5** | UI admin pour éditer prompts | Vue.js UI | Interface CRUD |
| **5** | Intégration plugin-recipes | plugin-recipes | Test end-to-end |

---

### 10.11 Données initiales (seed)

Script pour peupler la table avec les defaults extraits du code actuel :

```python
# api-backend/scripts/seed_prompts.py

DEFAULTS = [
    # Labels
    ("label", "scope_assembly.identity_section", "## Identité"),
    ("label", "scope_assembly.mission_section", "## Mission"),
    ("label", "scope_assembly.scope_section", "## Périmètre fonctionnel"),
    ("label", "scope_assembly.can_do", "Tu peux :"),
    ("label", "scope_assembly.cannot_do", "Tu ne dois pas :"),
    ("label", "scope_assembly.process_section", "## Processus interne"),
    ("label", "scope_assembly.guardrails_section", "## Garde-fous"),
    ("label", "scope_assembly.examples_section", "## Exemples"),

    # Messages
    ("message", "system.service_not_configured", "Le service n'est pas configuré."),
    ("message", "system.service_unavailable", "Service temporairement indisponible."),
    ("message", "credits.insufficient", "Crédits insuffisants"),
    ("message", "credits.insufficient_detail", "Tu as besoin de **{required}** crédit(s) mais tu n'en as que **{remaining}**."),
    ("message", "subscription.not_subscribed", "Pas encore inscrit"),
    ("message", "subscription.not_subscribed_detail", "Utilise `/subscribe` pour t'inscrire!"),
    ("message", "mention.rate_limit", "Doucement ! Réessaie dans {cooldown}s."),
    ("message", "mention.error", "Désolé, je n'ai pas pu traiter ta demande."),
    ("message", "scope.out_of_scope", "Je suis {bot_name}, je ne peux pas répondre à cette question."),

    # Placeholders (génériques, sans BOT-APPETIT!)
    ("placeholder", "scope_identity.role", "Ex: Tu es {bot_name}, un assistant spécialisé."),
    ("placeholder", "scope_identity.qualities", "professionnel\nprécis\nbienveillant"),
    ("placeholder", "scope_identity.limitations", "un expert certifié\nun conseiller juridique"),
    ("placeholder", "scope_mission.mission", "Aider les utilisateurs à accomplir leur objectif."),
    ("placeholder", "scope_mission.out_of_scope", "Je suis spécialisé dans ce domaine !"),
    ("placeholder", "scope_perimeter.can_do", "répondre aux questions\ndonner des conseils"),
    ("placeholder", "scope_perimeter.cannot_do", "donner des conseils médicaux\ntraiter des données sensibles"),

    # Intent
    ("intent", "fallback_description", "Accéder à {domain}"),
]

async def seed_defaults():
    for category, key, value in DEFAULTS:
        await db.execute(
            insert(Prompt).values(
                guild_id=0,  # Default
                category=category,
                key=key,
                value=value,
                language="fr",
                is_default=True,
            ).on_conflict_do_nothing()
        )
```
