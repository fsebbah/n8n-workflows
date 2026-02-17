# RFC-034 : Branding et Configuration Serveur Discord

**Date:** 2026-02-12
**Statut:** Draft
**Auteur:** Équipe plugin-recipes
**Équipes concernées:** Vue.js UI, api-backend
**Dernière mise à jour:** 2026-02-13

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Contexte et objectifs](#2-contexte-et-objectifs)
3. [Architecture multi-tenant](#3-architecture-multi-tenant)
4. [Éléments de branding](#4-éléments-de-branding)
   - 4.1 [Identité visuelle](#41-identité-visuelle)
   - 4.2 [Messages et ton](#42-messages-et-ton)
   - 4.3 [Templates prédéfinis](#43-templates-prédéfinis)
5. [Modèle de données](#5-modèle-de-données)
6. [Interfaces de configuration](#6-interfaces-de-configuration)
   - 6.1 [Dashboard Web (Vue.js)](#61-dashboard-web-vuejs)
   - 6.2 [Commandes Discord](#62-commandes-discord)
7. [API Backend](#7-api-backend)
8. [Workflow de configuration](#8-workflow-de-configuration)
9. [Permissions et rôles](#9-permissions-et-rôles)
10. [Questions ouvertes](#10-questions-ouvertes)
11. [Annexes](#11-annexes)

---

## 1. Résumé exécutif

Cette RFC définit le système de branding permettant aux administrateurs Discord de personnaliser l'apparence et le ton du bot sur leur serveur.

**Scope:**
- Personnalisation **par serveur Discord** (guild)
- Support **multi-tenant** via "RoomModels" (salles de cours / espaces d'apprentissage)
- Configuration via **Dashboard Web** et **Commandes Discord**
- Éléments configurables: **Visuel + Textuel** uniquement

**Hors scope:**
- Configuration du comportement du plugin (features, rate limiting, etc.)
- Paramètres métier spécifiques au plugin

---

## 2. Contexte et objectifs

### 2.1 État actuel - Fichiers de branding existants

Le plugin dispose déjà d'une structure de configuration YAML pour le branding:

| Fichier | Contenu | Statut |
|---------|---------|--------|
| `config/branding.yaml` | Identité visuelle (nom, emoji, couleur, footer) | ✅ Existant |
| `config/prompts/responses.yaml` | Messages génériques (salutations, aide, erreurs) | ✅ Existant |
| `config/prompts/scope.yaml` | Identité bot (rôle, ton, qualités) | ✅ Existant |
| `config/templates/server_templates.yaml` | Templates visuels prédéfinis | ✅ Existant |

**Ce qui manque:** Personnalisation **par serveur** et **par salle de cours** (actuellement config globale uniquement).

### 2.2 Objectifs

| Objectif | Description |
|----------|-------------|
| Personnalisation | Chaque serveur peut avoir son propre branding |
| Multi-tenant | Un serveur peut héberger plusieurs "salles de cours" avec branding distinct |
| Accessibilité | Config via Web ET Discord |

### 2.3 Non-goals (hors scope)

Cette RFC ne couvre **pas** :

| Hors scope | Raison |
|------------|--------|
| Features toggles (OCR, search, etc.) | Relève de la config plugin, pas du branding |
| Rate limiting | Relève de la config plugin |
| Paramètres métier (portions, scores, etc.) | Relève de la config plugin |
| Gestion des utilisateurs finaux | Géré par Discord directement |
| Récupération du branding par le plugin | Phase ultérieure |

---

## 3. Architecture multi-tenant

### 3.1 Concepts

Un serveur Discord peut contenir plusieurs **RoomModels** (salles de cours), chacun avec son propre branding.

```
┌─────────────────────────────────────────────────────────────┐
│                      Discord Server (Guild)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ RoomModel A │    │ RoomModel B │    │ RoomModel C │     │
│  │"Salle Démo" │    │"Formation"  │    │"Masterclass"│     │
│  │             │    │             │    │             │     │
│  │ #demo       │    │ #formation  │    │ #masterclass│     │
│  │ #pratique   │    │ #exercices  │    │ #avancé     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Hiérarchie de configuration

```
Global (défaut)
    └── Guild (serveur)
            └── RoomModel (salle de cours)
                    └── Channel (optionnel)
```

**Résolution:** Channel → RoomModel → Guild → Global

### 3.3 Qu'est-ce qu'un RoomModel ?

Un **RoomModel** représente un espace d'apprentissage ou une unité pédagogique au sein d'un serveur Discord. Il peut correspondre à :
- Une **catégorie Discord** avec ses channels
- Un **ensemble de channels** regroupés thématiquement
- Une **formation** ou un **cours** spécifique

Chaque RoomModel possède son propre branding (couleurs, messages, ton).

---

## 4. Éléments de branding

> **Note:** Seuls les éléments visuels et textuels sont dans le scope du branding.
> La configuration du comportement (features, rate limiting) est gérée par le plugin.

### 4.1 Identité visuelle

**Source actuelle:** `config/branding.yaml`

| Élément | Clé YAML | Description | Exemple |
|---------|----------|-------------|---------|
| Nom du bot | `bot.name` | Nom affiché du bot | "Mon Assistant" |
| Emoji | `bot.emoji` | Emoji principal | "🎓" |
| Couleur principale | `bot.color` | Couleur des embeds | `#5865F2` |
| Description | `bot.description` | Description courte | "Votre assistant pédagogique" |
| URL Logo | `urls.logo` | Logo personnalisé | https://cdn.../logo.png |
| URL Banner | `urls.banner` | Bannière | https://cdn.../banner.png |
| Footer texte | `footer.text` | Pied de page embeds | "{bot_name} - À votre service" |
| Footer icône | `footer.icon_url` | Icône pied de page | https://cdn.../icon.png |

**Emojis par catégorie** (`emojis.*`):

| Clé | Usage | Défaut |
|-----|-------|--------|
| `success` | Actions réussies | ✅ |
| `error` | Erreurs | ❌ |
| `warning` | Avertissements | ⚠️ |
| `info` | Informations | ℹ️ |
| `loading` | Chargement | ⏳ |

### 4.2 Messages et ton

**Source actuelle:** `config/prompts/responses.yaml` + `config/prompts/scope.yaml`

**Messages génériques** (branding):

| Élément | Clé YAML | Description | Éditable UI |
|---------|----------|-------------|-------------|
| Salutations | `messages.greetings[]` | Liste (random) | ✅ Textarea multi-lignes |
| Message aide | `messages.help` | Markdown | ✅ Éditeur Markdown |
| Mention vide | `messages.empty_mention` | Texte | ✅ Input |
| Erreur générique | `messages.errors.generic` | Texte | ✅ Input |
| Hors scope | `scope.out_of_scope_message` | Markdown | ✅ Éditeur Markdown |

**Identité et ton** (branding):

| Élément | Clé YAML | Description | Éditable UI |
|---------|----------|-------------|-------------|
| Rôle | `scope.identity.role` | Définition du persona | ✅ Textarea |
| Qualités | `scope.identity.qualities[]` | Liste traits personnalité | ✅ Tags input |
| Limitations | `scope.identity.limitations[]` | Garde-fous du bot | ✅ Tags input (**min 1 requis**) |
| Mission | `scope.mission` | Mission du bot | ✅ Textarea |

> **Note sécurité :** Les `limitations` sont éditables mais **obligatoires**.
> L'admin doit définir au moins une limitation (garde-fou de sécurité).
> Exemples : "ne remplace pas un expert", "peut faire des erreurs", etc.

**Variables disponibles dans les messages:**

| Variable | Description | Exemple |
|----------|-------------|---------|
| `{bot_name}` | Nom du bot (brandé) | "Mon Assistant" |
| `{name}` | Nom d'affichage utilisateur | "Jean" |
| `{username}` | Handle Discord | "jean#1234" |
| `{guild}` | Nom du serveur | "Mon Serveur" |
| `{channel}` | Nom du channel | "général" |

### 4.3 Templates prédéfinis

**Source actuelle:** `config/templates/server_templates.yaml`

Templates visuels prêts à l'emploi:

| Template | Couleur primaire | Style | Usage |
|----------|-----------------|-------|-------|
| `education` | #5865F2 (Discord blurple) | modern | Établissements éducatifs |
| `community` | #57F287 (vert) | modern | Communautés |
| `professional` | #5865F2 | minimal | Organisations/entreprises |
| `dark` | #2F3136 | modern | Thème sombre élégant |
| `minimal` | #FFFFFF | minimal | Design épuré |

**Structure d'un template:**

```yaml
template_name:
  name: "Nom affichage"
  description: "Description"
  primary_color: "#XXXXXX"
  secondary_color: "#XXXXXX"
  accent_color: "#XXXXXX"
  error_color: "#XXXXXX"
  embed_style: "modern" | "classic" | "minimal"
  footer_text: "Texte footer"
```

**Styles d'embed disponibles:**

| Style | Thumbnail | Timestamp | Footer icon |
|-------|-----------|-----------|-------------|
| `modern` | Droite | ✅ | ✅ |
| `classic` | Droite | ✅ | ❌ |
| `minimal` | Aucun | ❌ | ❌ |

---

## 5. Modèle de données

### 5.1 Entités principales

```
┌─────────────────────────────────────────────────────────────┐
│                        GuildConfig                          │
├─────────────────────────────────────────────────────────────┤
│ guild_id: string (PK)                                       │
│ default_room_id: uuid (FK → RoomModel)                      │
│ created_at: datetime                                        │
│ updated_at: datetime                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 1:N
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        RoomModel                            │
├─────────────────────────────────────────────────────────────┤
│ id: uuid (PK)                                               │
│ guild_id: string (FK → GuildConfig)                         │
│ name: string                    # "Salle Formation"         │
│ description: string             # Description optionnelle   │
│ is_default: boolean                                         │
│ visual_config: JSONB            # Section 4.1               │
│ messages_config: JSONB          # Section 4.2               │
│ created_at: datetime                                        │
│ updated_at: datetime                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 1:N
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ChannelRoomMapping                      │
├─────────────────────────────────────────────────────────────┤
│ channel_id: string (PK)                                     │
│ room_id: uuid (FK → RoomModel)                              │
│ guild_id: string (FK → GuildConfig)                         │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Stockage

| Donnée | Stockage | Raison |
|--------|----------|--------|
| Config complète | PostgreSQL (JSONB) | Persistance, validation, requêtes |
| Config active | Redis (cache) | Performance, accès fréquent |
| Assets (images) | S3 / CDN | Stockage fichiers |

---

## 6. Interfaces de configuration

### 6.1 Dashboard Web (Vue.js)

#### 6.1.1 Écrans requis

| Écran | Description | Priorité |
|-------|-------------|----------|
| **Dashboard** | Vue d'ensemble du serveur | P0 |
| **Branding > Visuel** | Couleurs, avatar, logos | P0 |
| **Branding > Messages** | Édition des messages | P0 |
| **Branding > Ton** | Persona et qualités | P1 |
| **Salles de cours** | Gestion des RoomModels | P1 |
| **Channels** | Mapping channels/rooms | P1 |
| **Preview** | Aperçu en temps réel | P1 |

#### 6.1.2 Wireframe Identité visuelle

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo] Dashboard                   [Serveur: Mon Serveur ▼]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌─────────────────────────────────────────┐ │
│  │ Navigation   │  │                                         │ │
│  │              │  │  Branding > Identité visuelle           │ │
│  │ ○ Dashboard  │  │                                         │ │
│  │              │  │  ┌─────────────────┐  ┌──────────────┐  │ │
│  │ ▼ Branding   │  │  │                 │  │ Preview      │  │ │
│  │   • Visuel   │  │  │  Avatar         │  │              │  │ │
│  │   • Messages │  │  │  [Upload]       │  │  ┌────────┐  │  │ │
│  │   • Ton      │  │  │                 │  │  │ Embed  │  │  │ │
│  │              │  │  └─────────────────┘  │  │ Preview│  │  │ │
│  │ ○ Salles     │  │                       │  │        │  │  │ │
│  │ ○ Channels   │  │  Couleur principale   │  └────────┘  │  │ │
│  │              │  │  [#5865F2] [picker]   │              │  │ │
│  └──────────────┘  │                       │              │  │ │
│                    │  Couleur succès       │              │  │ │
│                    │  [#57F287] [picker]   │              │  │ │
│                    │                       │              │  │ │
│                    │  [Sauvegarder]        │              │  │ │
│                    └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

> **Note Preview:** Le panneau "Preview" est rendu **côté client** (Vue.js).
> Les couleurs et textes sont appliqués localement en temps réel, sans appel API.
> Cela offre une réactivité immédiate lors de l'édition.

#### 6.1.3 Wireframe Messages

```
┌─────────────────────────────────────────────────────────────────┐
│  Branding > Messages                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Salutations (une par ligne, sélection aléatoire)               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Bonjour {name} ! Comment puis-je t'aider ?                 │ │
│  │ Salut {name} ! Je suis là pour toi.                        │ │
│  │ Hello {name} ! Prêt à apprendre ?                          │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│  Variables: {name}, {bot_name}, {guild}        [+ Ajouter]      │
│                                                                 │
│  Message d'aide                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Je suis **{bot_name}**, votre assistant !                  │ │
│  │                                                            │ │
│  │ **Ce que je peux faire :**                                 │ │
│  │ • Répondre à vos questions                                 │ │
│  │ • Vous guider dans votre apprentissage                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│  Supporte Markdown                                              │
│                                                                 │
│  Message hors-sujet                                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Je ne peux pas vous aider sur ce sujet.                    │ │
│  │ N'hésitez pas à me poser d'autres questions !              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [Réinitialiser par défaut]              [Sauvegarder]          │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.1.4 Wireframe Salles de cours

```
┌─────────────────────────────────────────────────────────────────┐
│  Salles de cours (RoomModels)                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ⭐ Salle par défaut                              [Éditer]  │ │
│  │    Branding appliqué aux channels non mappés               │ │
│  │    Channels: tous les autres                               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 📚 Formation Niveau 1                            [Éditer]  │ │
│  │    Couleur: #E67E22 | Style: modern                        │ │
│  │    Channels: #niveau1, #exercices-n1, #questions-n1        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🎓 Masterclass                                   [Éditer]  │ │
│  │    Couleur: #9B59B6 | Style: minimal                       │ │
│  │    Channels: #masterclass, #avancé                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [+ Créer une nouvelle salle]                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Commandes Discord

#### 6.2.1 Commandes admin (branding uniquement)

| Commande | Description | Exemple |
|----------|-------------|---------|
| `/branding view` | Voir le branding actuel | `/branding view` |
| `/branding color <type> <hex>` | Changer une couleur | `/branding color primary #5865F2` |
| `/branding message <type> <text>` | Changer un message | `/branding message greeting "Salut!"` |
| `/branding name <name>` | Changer le nom du bot | `/branding name "Mon Bot"` |
| `/branding reset` | Réinitialiser branding | `/branding reset` |
| `/branding export` | Exporter en JSON (fichier) | `/branding export` |
| `/branding import` | Importer depuis fichier JSON joint | `/branding import` + fichier .json |
| `/room list` | Lister les salles | `/room list` |
| `/room create <name>` | Créer une salle | `/room create "Formation"` |
| `/room assign <channel> <room>` | Assigner channel | `/room assign #cours Formation` |

> **Note Discord :** `/branding import` accepte un **fichier JSON en pièce jointe**
> (limite Discord 2000 caractères insuffisante pour un branding complet).

#### 6.2.2 Permissions requises

| Commande | Permission Discord requise |
|----------|---------------------------|
| `/branding view` | Manage Server |
| `/branding *` (modification) | Administrator |
| `/room *` | Administrator |

---

## 7. API Backend

### 7.1 Endpoints Branding

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/guilds/{guild_id}/branding` | Récupérer branding guild |
| `PUT` | `/api/guilds/{guild_id}/branding` | Mettre à jour branding |
| `PATCH` | `/api/guilds/{guild_id}/branding` | Mise à jour partielle |
| `DELETE` | `/api/guilds/{guild_id}/branding` | Réinitialiser (défaut) |
| `GET` | `/api/guilds/{guild_id}/branding/export` | Export portable (JSON + métadonnées) |
| `POST` | `/api/guilds/{guild_id}/branding/import` | Importer branding depuis JSON |

> **Export vs GET branding :**
> - `GET /branding` : retourne la config brute pour édition
> - `GET /branding/export` : retourne un JSON portable avec métadonnées (version, date, guild source) pour import sur un autre serveur

### 7.2 Endpoints RoomModels

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/guilds/{guild_id}/rooms` | Lister les RoomModels |
| `POST` | `/api/guilds/{guild_id}/rooms` | Créer un RoomModel |
| `GET` | `/api/guilds/{guild_id}/rooms/{id}` | Détail d'un RoomModel |
| `PUT` | `/api/guilds/{guild_id}/rooms/{id}` | Modifier un RoomModel |
| `DELETE` | `/api/guilds/{guild_id}/rooms/{id}` | Supprimer un RoomModel |
| `POST` | `/api/guilds/{guild_id}/rooms/{id}/channels` | Assigner channels |

### 7.3 Authentification

- OAuth2 Discord pour dashboard web
- Vérification rôle "Administrator" ou "Manage Server"
- Token JWT pour API calls

### 7.4 Validation des payloads

Les payloads `visual_config` et `messages_config` sont validés par **JSON Schema** :

| Champ | Validation |
|-------|------------|
| `bot.color` | Format hex couleur (`^#[0-9A-Fa-f]{6}$`) |
| `bot.name` | String non vide, max 32 caractères |
| `emojis.*` | Emoji valide ou string courte |
| `urls.*` | URL valide (https) ou null |
| `messages.greetings[]` | Array non vide, min 1 élément |
| `scope.identity.limitations[]` | **Array non vide, min 1 élément** (requis) |

**Comportement :**
- Clés inconnues : rejetées (erreur 400)
- Valeurs invalides : rejetées avec message explicite
- Import : validation complète avant application

---

## 8. Workflow de configuration

### 8.1 Première configuration (onboarding)

```
1. Admin invite le bot sur son serveur
         │
         ▼
2. Bot envoie message de bienvenue avec lien dashboard
         │
         ▼
3. Admin clique sur le lien → OAuth Discord
         │
         ▼
4. Dashboard affiche wizard de configuration
   ┌─────────────────────────────────────┐
   │ Étape 1/3: Identité                │
   │ • Nom du bot sur ce serveur        │
   │ • Avatar personnalisé (optionnel)  │
   ├─────────────────────────────────────┤
   │ Étape 2/3: Couleurs                │
   │ • Palette de couleurs              │
   │ • Choix d'un template (optionnel)  │
   ├─────────────────────────────────────┤
   │ Étape 3/3: Messages                │
   │ • Personnaliser les salutations    │
   │ • Message d'aide                   │
   └─────────────────────────────────────┘
         │
         ▼
5. Config sauvegardée → Bot utilise nouveau branding
```

### 8.2 Synchronisation config

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Dashboard  │────▶│  API        │────▶│  PostgreSQL │
│  (Vue.js)   │     │  Backend    │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                          │ Pub/Sub
                          ▼
                   ┌─────────────┐     ┌ ─ ─ ─ ─ ─ ─ ┐
                   │   Redis     │ - - ▶   Plugin
                   │   (cache)   │     │ (à venir)   │
                   └─────────────┘     └ ─ ─ ─ ─ ─ ─ ┘
```

**Invalidation cache:** Quand branding change → Redis PUBLISH → Plugin notifié (phase ultérieure)

---

## 9. Permissions et rôles

### 9.1 Rôles dashboard

| Rôle | Permissions |
|------|-------------|
| **Owner** | Tout (y compris suppression RoomModels) |
| **Admin** | Modifier branding, créer RoomModels |
| **Moderator** | Voir branding, modifier messages |
| **Viewer** | Voir branding uniquement |

### 9.2 Mapping Discord → Dashboard

| Permission Discord | Rôle Dashboard |
|-------------------|----------------|
| Server Owner | Owner |
| Administrator | Admin |
| Manage Server | Moderator |
| Autres | Viewer (si invité) |

---

## 10. Questions ouvertes

| # | Question | Options | Décision |
|---|----------|---------|----------|
| 1 | Stockage des avatars/images custom ? | S3 / Cloudinary / Discord CDN | ? |
| 2 | Limite de RoomModels par serveur ? | 1 / 3 / 5 / illimité | ? |
| 3 | Versioning des configs (rollback) ? | Oui / Non | ? |
| 4 | Audit log des changements ? | Oui / Non | ? |

### Décisions prises

| Question | Décision |
|----------|----------|
| Export/Import entre serveurs | ✅ Oui - via `/branding export` + `/branding import` (fichier JSON) |
| Limitations éditables | ✅ Oui - mais min 1 requis (garde-fou obligatoire) |

---

## 11. Annexes

### A. Configuration existante - `config/branding.yaml`

```yaml
# Identite visuelle du bot
bot:
  name: "Mon Assistant"
  emoji: "🎓"
  color: "#5865F2"
  description: "Votre assistant pédagogique"
  version: "1.0.0"

# Emojis par categorie
emojis:
  success: "✅"
  error: "❌"
  warning: "⚠️"
  info: "ℹ️"
  loading: "⏳"

# URLs (optionnel)
urls:
  logo: null
  banner: null
  website: null
  support: null

# Footer des embeds Discord
footer:
  text: "{bot_name} - À votre service"
  icon_url: null
```

### B. Messages génériques - `config/prompts/responses.yaml` (extrait)

```yaml
# Messages utilisateur (branding uniquement)
messages:
  # Salutations (selection aleatoire)
  greetings:
    - "Bonjour ! Je suis **{bot_name}**, votre assistant."
    - "Salut ! Comment puis-je vous aider aujourd'hui ?"
    - "Hello ! Je suis là pour vous accompagner."

  # Message d'aide
  help: |
    Je suis **{bot_name}**, votre assistant !

    N'hésitez pas à me poser vos questions.

  # Mention vide (@Bot sans texte)
  empty_mention: >
    Vous m'avez mentionné mais sans message.
    Comment puis-je vous aider ?

  # Erreurs generiques
  errors:
    generic: "Désolé, je n'ai pas pu traiter votre demande."
```

### C. Identité et ton - `config/prompts/scope.yaml` (extrait)

```yaml
scope:
  # Identite du bot (branding)
  identity:
    role: "Tu es {bot_name}, un assistant pédagogique bienveillant."
    qualities:
      - "patient et pédagogue"
      - "clair dans ses explications"
      - "encourageant"
    limitations:
      - "ne remplace pas un formateur humain"
      - "peut faire des erreurs"

  # Mission
  mission: >
    Accompagner les apprenants dans leur parcours
    et répondre à leurs questions.

  # Message quand hors scope
  out_of_scope_message: |
    Je ne suis pas en mesure de vous aider sur ce sujet.
    N'hésitez pas à me poser d'autres questions !
```

### D. Templates visuels - `config/templates/server_templates.yaml` (extrait)

```yaml
templates:
  education:
    name: "Education"
    description: "Template pour etablissements educatifs"
    primary_color: "#5865F2"
    secondary_color: "#99AAB5"
    accent_color: "#57F287"
    error_color: "#ED4245"
    embed_style: "modern"
    footer_text: "Plateforme educative"

  professional:
    name: "Professionnel"
    description: "Template pour organisations"
    primary_color: "#5865F2"
    secondary_color: "#2F3136"
    accent_color: "#EB459E"
    error_color: "#ED4245"
    embed_style: "minimal"
    footer_text: "Organisation professionnelle"

embed_styles:
  modern:
    thumbnail_position: "right"
    show_timestamp: true
    show_footer_icon: true

  minimal:
    thumbnail_position: "none"
    show_timestamp: false
    show_footer_icon: false
```

### E. Variables de template

| Variable | Description | Exemple |
|----------|-------------|---------|
| `{bot_name}` | Nom du bot (brandé) | "Mon Assistant" |
| `{name}` | Nom d'affichage utilisateur | "Jean" |
| `{username}` | Handle Discord | "jean#1234" |
| `{guild}` | Nom du serveur | "Mon Serveur" |
| `{channel}` | Nom du channel | "général" |

### F. Palette de couleurs suggérées

| Thème | Primary | Success | Error | Warning | Info |
|-------|---------|---------|-------|---------|------|
| **Discord** | #5865F2 | #57F287 | #ED4245 | #FEE75C | #5865F2 |
| **Ocean** | #0077B6 | #06D6A0 | #EF476F | #FFD166 | #118AB2 |
| **Forest** | #2D6A4F | #40916C | #D62828 | #F77F00 | #003049 |
| **Sunset** | #E63946 | #52B788 | #9D0208 | #F4A261 | #457B9D |
| **Lavender** | #7B2CBF | #06D6A0 | #E63946 | #F4A261 | #5390D9 |

---

## Changelog

| Date | Auteur | Modification |
|------|--------|--------------|
| 2026-02-12 | plugin-recipes | Création du draft |
| 2026-02-13 | plugin-recipes | Refocus sur branding uniquement (retrait features/behavior) |
| 2026-02-13 | plugin-recipes | Renommage Brand → RoomModel |
| 2026-02-13 | plugin-recipes | Ajout import, note preview client-side, diagramme plugin futur |
| 2026-02-13 | plugin-recipes | Clarifications: validation JSON Schema, import fichier, limitations requises |
