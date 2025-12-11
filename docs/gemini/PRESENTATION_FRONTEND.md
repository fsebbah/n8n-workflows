# Intégration Multimodale Gemini - Présentation Frontend

**Auteur** : MCP
**Date** : 2025-12-09
**Audience** : Équipe Frontend
**Document source** : `SYNTHESE_MULTIMODALE_GEMINI.md`

---

## 1. Contexte du Projet

### 1.1 Nouvelles Fonctionnalités pour les Utilisateurs

Nous ajoutons 4 nouvelles capacités multimodales que les utilisateurs pourront utiliser via l'interface :

| Fonctionnalité | Ce que l'utilisateur peut faire |
|----------------|--------------------------------|
| **Analyse Vidéo** | Transcrire une vidéo, identifier qui parle, extraire le texte à l'écran |
| **Génération Vidéo** | Créer une vidéo à partir d'une description textuelle ou d'une image |
| **Génération Image** | Créer des images, extraire des personnages, générer des séquences cohérentes |
| **Graphe de Connaissances** | Extraire les personnages et leurs relations depuis un document |

### 1.2 Architecture Simplifiée

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND  ◄── VOUS ÊTES ICI                 │
│                                                                  │
│  • Interface utilisateur (Chat, formulaires)                    │
│  • Upload de fichiers                                           │
│  • Affichage des résultats (vidéos, images, transcriptions)     │
│  • Protection anti-double-clic                                  │
│  • Feedback de progression                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND API                               │
│                                                                  │
│  • Authentification                                             │
│  • Upload de fichiers                                           │
│  • Historique utilisateur                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              MCP SERVER + N8N + GOOGLE CLOUD                     │
│                    (Invisible pour vous)                         │
│                                                                  │
│  • Traitement IA (Gemini, Veo 3)                                │
│  • Stockage des médias générés                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Point important** : L'utilisateur ne voit jamais n8n ni les détails techniques. Il interagit uniquement via votre interface.

---

## 2. Expérience Utilisateur par Fonctionnalité

### 2.1 Analyse Vidéo

#### Parcours Utilisateur

```
1. L'utilisateur choisit "Analyser une vidéo"
2. Il fournit une source :
   - Upload d'un fichier vidéo
   - URL YouTube
   - Lien Google Drive
3. Il choisit ce qu'il veut :
   □ Transcription
   □ Identification des speakers
   □ Extraction du texte à l'écran (OCR)
4. Il clique sur "Analyser"
5. Attente (30s - 2min selon la durée de la vidéo)
6. Résultat affiché : transcription avec timestamps, noms des speakers
```

#### Exemple de Résultat à Afficher

```
┌─────────────────────────────────────────────────────────────────┐
│  Transcription de "reunion_Q4.mp4"                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  00:00:15 - 00:00:22  │  Alice                                  │
│  "Bonjour à tous, bienvenue dans cette réunion trimestrielle."  │
│                                                                  │
│  00:00:23 - 00:00:35  │  Bob                                    │
│  "Merci Alice. Commençons par les résultats du Q3."             │
│                                                                  │
│  00:00:36 - 00:01:12  │  Alice                                  │
│  "Comme vous pouvez le voir sur ce graphique..."                │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│  Texte détecté à l'écran :                                      │
│  • 00:00:36 : "Résultats Q3 2024" (centre)                      │
│  • 00:00:45 : "+15% vs Q2" (graphique)                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Génération Vidéo (Veo 3)

#### Parcours Utilisateur

```
1. L'utilisateur choisit "Générer une vidéo"
2. Il décrit ce qu'il veut :
   - Texte libre : "Un robot dans un bureau futuriste"
   - OU upload d'une image à animer
3. Options disponibles :
   - Durée : 4s, 6s, 8s
   - Format : 16:9 (paysage), 9:16 (portrait/mobile)
   - Style : Corporate, Social Media, Cinématique
4. ⚠️ Confirmation du coût estimé (~0.20€)
5. Il clique sur "Générer"
6. Attente LONGUE (1-3 minutes) avec feedback de progression
7. Résultat : lecteur vidéo + bouton télécharger
```

#### Point Critique : Temps d'Attente

La génération vidéo prend **1 à 3 minutes**. C'est long pour un utilisateur web.

**Feedback de progression recommandé** :

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│     🎬 Génération de votre vidéo en cours...                    │
│                                                                  │
│     ████████████░░░░░░░░░░░░░░░░░░░░  35%                       │
│                                                                  │
│     Étape : Composition des scènes                              │
│     Temps estimé : ~2 minutes                                   │
│                                                                  │
│     💡 Astuce : Vous pouvez continuer à naviguer,              │
│        nous vous notifierons quand ce sera prêt.                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Génération Image

#### Parcours Utilisateur

```
1. L'utilisateur choisit "Générer une image"
2. Options :
   a) Génération simple : description textuelle → image
   b) Extraction personnage : upload image → personnage isolé
   c) Character Sheet : upload personnage → vues multiples (face/dos)
   d) Scène cohérente : personnage + description → nouvelle scène
3. Il clique sur "Générer"
4. Attente courte (10-30s)
5. Résultat : image(s) affichée(s) + bouton télécharger
```

### 2.4 Graphe de Connaissances

#### Parcours Utilisateur

```
1. L'utilisateur choisit "Extraire un graphe"
2. Il fournit un texte :
   - Copier-coller de texte
   - Upload de fichier (PDF, TXT)
   - URL d'une page web
3. Il clique sur "Extraire"
4. Attente courte (10-30s)
5. Résultat :
   - Liste des entités (personnages, lieux, organisations)
   - Liste des relations
   - Visualisation graphique (optionnel)
```

#### Exemple de Résultat

```
┌─────────────────────────────────────────────────────────────────┐
│  Graphe extrait de "Les Misérables - Chapitre 1"                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PERSONNAGES                    RELATIONS                        │
│  ───────────                    ─────────                        │
│  • Jean Valjean (protagoniste)  Jean Valjean ──protège──> Cosette│
│  • Cosette (enfant)             Jean Valjean ──fuit──> Javert    │
│  • Javert (inspecteur)          Javert ──poursuit──> Jean Valjean│
│  • Fantine (mère de Cosette)    Fantine ──mère de──> Cosette     │
│                                                                  │
│              [Voir la visualisation graphique]                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Vos Responsabilités Clés

### 3.1 Protection Anti-Double-Clic

**C'est CRITIQUE**, surtout pour la génération vidéo (~0.20€/vidéo).

| Action | Implémentation Requise |
|--------|----------------------|
| **Clic sur "Générer"** | Désactiver le bouton immédiatement |
| **Pendant le traitement** | Afficher un loader, bouton grisé |
| **Erreur réseau** | Réactiver le bouton, afficher l'erreur |
| **Succès** | Afficher le résultat, réactiver pour nouvelle génération |

**Pattern recommandé** :

```
[Bouton actif] → Clic → [Bouton désactivé + Loader] → Réponse → [Bouton réactivé]
```

### 3.2 Confirmation pour Opérations Coûteuses

Avant de lancer une génération Veo 3, afficher une confirmation :

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ⚠️ Confirmation                                                │
│                                                                  │
│  Vous allez générer une vidéo de 8 secondes.                    │
│                                                                  │
│  Coût estimé : ~0.20€                                           │
│  Temps estimé : 1-3 minutes                                     │
│                                                                  │
│  Votre prompt :                                                 │
│  "Un robot transformant une entreprise traditionnelle           │
│   en entreprise high-tech..."                                   │
│                                                                  │
│              [Annuler]        [Confirmer et générer]            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Gestion des Fichiers

#### Upload de Fichiers

| Type | Formats Acceptés | Taille Max |
|------|-----------------|------------|
| Vidéo | MP4, WebM, MOV, AVI | À définir (100MB-1GB) |
| Image | PNG, JPG, WebP | 10 MB |
| Document | PDF, TXT | 10 MB |

**Validation côté Frontend** :
- Vérifier le format avant upload
- Vérifier la taille avant upload
- Afficher une erreur claire si invalide

#### Téléchargement des Résultats

Les fichiers générés sont accessibles via une **URL temporaire (24h)**.

**Actions à proposer** :
- Bouton "Télécharger" (téléchargement direct)
- Bouton "Copier le lien" (pour partager)
- Message d'avertissement : "Ce lien expire dans 24h"

---

## 4. Gestion des Erreurs

### 4.1 Messages d'Erreur User-Friendly

Le backend retournera des codes d'erreur techniques. Voici les traductions :

| Code Backend | Message à Afficher |
|--------------|-------------------|
| `QUOTA_EXCEEDED` | "Vous avez atteint votre limite de générations aujourd'hui. Réessayez demain." |
| `CONTENT_FILTERED` | "Ce contenu ne peut pas être généré car il ne respecte pas nos conditions d'utilisation." |
| `TIMEOUT` | "La génération a pris trop de temps. Veuillez réessayer." |
| `INVALID_INPUT` | "Le fichier fourni n'est pas supporté. Formats acceptés : MP4, WebM, MOV." |
| `FILE_TOO_LARGE` | "Le fichier est trop volumineux. Taille maximale : X MB." |
| `NETWORK_ERROR` | "Erreur de connexion. Vérifiez votre connexion internet et réessayez." |
| `UNKNOWN_ERROR` | "Une erreur inattendue s'est produite. Veuillez réessayer." |

### 4.2 États de l'Interface

| État | Affichage |
|------|-----------|
| **Idle** | Formulaire actif, bouton cliquable |
| **Loading** | Formulaire désactivé, loader, message de progression |
| **Success** | Résultat affiché, option pour nouvelle action |
| **Error** | Message d'erreur clair, bouton "Réessayer" |

---

## 5. Historique Utilisateur

### 5.1 Deux Cas

| Utilisateur | Historique Disponible |
|-------------|----------------------|
| **Sans espace stockage** | Non - les fichiers expirent après 7 jours |
| **Avec espace stockage** | Oui - peut voir ses générations passées |

### 5.2 Interface Historique (si espace stockage activé)

```
┌─────────────────────────────────────────────────────────────────┐
│  Mes Générations                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🎬 Vidéo - "Robot corporate"           09/12/2025 10:30        │
│     Durée : 8s │ Coût : 0.20€           [Voir] [Télécharger]    │
│                                                                  │
│  🖼️ Image - "Chat astronaute"           09/12/2025 09:15        │
│     Format : 16:9                        [Voir] [Télécharger]    │
│                                                                  │
│  📝 Transcription - "reunion.mp4"       08/12/2025 14:22        │
│     Durée vidéo : 45min                  [Voir] [Exporter]       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Sources Vidéo Supportées

### 6.1 Les 3 Options

| Source | Comment ça marche |
|--------|-------------------|
| **Upload fichier** | L'utilisateur sélectionne un fichier local |
| **URL YouTube** | L'utilisateur colle un lien YouTube |
| **Google Drive** | L'utilisateur sélectionne un fichier de son Drive (s'il a connecté son compte) |

### 6.2 Interface Suggérée

```
┌─────────────────────────────────────────────────────────────────┐
│  Source de la vidéo                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ○ Uploader un fichier                                          │
│    [Glissez un fichier ici ou cliquez pour sélectionner]        │
│    Formats : MP4, WebM, MOV │ Max : 500 MB                      │
│                                                                  │
│  ○ URL YouTube                                                   │
│    [https://youtube.com/watch?v=...                    ]        │
│                                                                  │
│  ○ Google Drive                                                  │
│    [Sélectionner depuis Drive]                                  │
│    (Nécessite d'avoir connecté votre compte Google)             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Considérations UX Importantes

### 7.1 Temps de Traitement

| Opération | Temps Estimé | Feedback Recommandé |
|-----------|--------------|---------------------|
| Analyse vidéo courte (<5 min) | 30s - 1min | Loader simple |
| Analyse vidéo longue (>30 min) | 2-5 min | Barre de progression |
| Génération vidéo (Veo 3) | 1-3 min | Barre de progression + étapes |
| Génération image | 10-30s | Loader simple |
| Extraction graphe | 10-30s | Loader simple |

### 7.2 Notifications

Pour les opérations longues (>1 min), proposer :
- "Nous vous notifierons quand ce sera prêt"
- Notification navigateur (si autorisé)
- Email (optionnel)

### 7.3 Mode Sombre / Clair

Les résultats (transcriptions, graphes) doivent être lisibles dans les deux modes.

---

## 8. Checklist Frontend

### Avant le Développement

- [ ] Clarifier la taille max des uploads avec l'équipe Backend
- [ ] Définir le design des formulaires avec l'équipe Design
- [ ] Confirmer les formats de fichiers acceptés

### Pendant le Développement

- [ ] Implémenter la protection anti-double-clic sur TOUS les boutons d'action
- [ ] Implémenter la validation des fichiers AVANT upload
- [ ] Implémenter les messages d'erreur user-friendly
- [ ] Implémenter le feedback de progression pour les opérations longues
- [ ] Implémenter la confirmation pour Veo 3

### Avant la Mise en Production

- [ ] Tester avec des fichiers volumineux (limite de taille)
- [ ] Tester les scénarios d'erreur (réseau coupé, timeout)
- [ ] Tester l'accessibilité (lecteurs d'écran)
- [ ] Tester sur mobile (upload, affichage résultats)

---

## 9. Questions pour l'Équipe Frontend

1. **Design** : Avez-vous des maquettes pour ces nouvelles fonctionnalités ?
2. **Notifications** : Quel système de notifications utilisez-vous (toast, modal, autre) ?
3. **Upload** : Quelle librairie d'upload utilisez-vous ?
4. **Vidéo** : Quel lecteur vidéo utilisez-vous pour afficher les résultats ?

---

## 10. Contacts

| Équipe | Sujet |
|--------|-------|
| **Backend API** | Endpoints, formats de données, limites |
| **MCP** | Logique métier, formats de réponse |
| **Design** | Maquettes, UX |

---

*Document de présentation pour l'équipe Frontend.*
*Basé sur la synthèse multimodale Gemini v1.2.*
