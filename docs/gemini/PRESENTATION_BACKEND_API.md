# Intégration Multimodale Gemini - Présentation Backend API

**Auteur** : MCP
**Date** : 2025-12-09
**Audience** : Équipe Backend API
**Document source** : `SYNTHESE_MULTIMODALE_GEMINI.md`

---

## 1. Contexte du Projet

### 1.1 Objectif

Intégrer les capacités multimodales de Google AI (Gemini, Veo 3) dans la plateforme. Ces nouvelles fonctionnalités permettront aux utilisateurs de :

- **Analyser des vidéos** : transcription, identification des speakers, OCR
- **Générer des vidéos** : à partir de texte ou d'images (Veo 3)
- **Générer des images** : cohérentes avec personnages récurrents
- **Extraire des connaissances** : graphes d'entités et relations depuis des documents

### 1.2 Architecture Globale

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│              (Interface utilisateur, Chat, API)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API  ◄── VOUS ÊTES ICI              │
│                                                                  │
│  • Authentification utilisateur (Token MCP)                     │
│  • Gestion des espaces de stockage utilisateur                  │
│  • Historique des générations                                   │
│  • Upload de fichiers                                           │
│  • Facturation                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MCP SERVER                                │
│                                                                  │
│  • Sélection intelligente d'outils (Tool Selector)              │
│  • Wrappers pour les 4 nouveaux domaines                        │
│  • Appels vers n8n (backend d'exécution invisible)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    N8N + GOOGLE CLOUD APIs                       │
│                                                                  │
│  • Gemini 2.5 Flash (analyse, extraction)                       │
│  • Veo 3.1 (génération vidéo)                                   │
│  • Google Cloud Storage (stockage médias)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Ce Qui Vous Concerne

### 2.1 Vos Responsabilités

| Domaine | Responsabilité Backend API |
|---------|---------------------------|
| **Authentification** | Gérer les tokens MCP, identifier les utilisateurs |
| **Upload fichiers** | Recevoir les fichiers, valider, stocker temporairement |
| **Espace stockage** | Gérer l'activation/désactivation par utilisateur |
| **Historique** | Stocker les métadonnées des générations passées |
| **Facturation** | Tracker les consommations, facturer l'utilisateur |
| **Logs/Audit** | Surveiller les anomalies, détecter les abus |

### 2.2 Ce Qui N'est PAS Votre Responsabilité

| Domaine | Responsable |
|---------|-------------|
| Appels aux APIs Google (Gemini, Veo 3) | MCP Server + n8n |
| Sélection des outils selon la requête | MCP Server (Tool Selector) |
| Génération des URLs signées GCS | MCP Server |
| Logique métier des presets | MCP Server |
| Protection anti-double-clic | Frontend |

---

## 3. Points de Décision Requis

### 3.1 Taille Maximum des Uploads

Les utilisateurs pourront uploader des vidéos pour analyse. Quelle taille maximale ?

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **100 MB** | Léger, rapide | Limite les vidéos longues |
| **500 MB** | Bon compromis | Charge serveur modérée |
| **1 GB** | Vidéos HD longues | Charge serveur élevée |

**Question** : Quelle limite souhaitez-vous implémenter ?

**Considérations** :
- Une vidéo 1080p de 5 minutes ≈ 300-500 MB
- Une vidéo 720p de 10 minutes ≈ 200-400 MB

### 3.2 Stockage Temporaire des Uploads

Quand un utilisateur uploade une vidéo pour analyse :

1. Où stocker temporairement le fichier ?
2. Combien de temps avant suppression automatique ?
3. Quel système de nommage pour éviter les collisions ?

**Suggestion** : `{user_id}/{timestamp}_{uuid}.{ext}` avec TTL de 24h

### 3.3 Identification Utilisateur

Le MCP Server a besoin d'identifier l'utilisateur pour :
- Isoler ses fichiers sur GCS (`{user_id}/...`)
- Associer l'historique à son compte
- Facturer correctement

**Question** : Comment le `user_id` est-il transmis au MCP Server ?
- Header HTTP ?
- Token JWT décodé ?
- Paramètre de requête ?

---

## 4. Flux de Données Détaillés

### 4.1 Flux Upload Vidéo pour Analyse

```
UTILISATEUR                 FRONTEND                 BACKEND API              MCP SERVER
    │                           │                         │                        │
    │  Sélectionne vidéo        │                         │                        │
    │ ─────────────────────────>│                         │                        │
    │                           │                         │                        │
    │                           │  POST /upload           │                        │
    │                           │  (multipart/form-data)  │                        │
    │                           │ ───────────────────────>│                        │
    │                           │                         │                        │
    │                           │                         │  Valide taille/format  │
    │                           │                         │  Stocke temporairement │
    │                           │                         │  Retourne file_id      │
    │                           │                         │                        │
    │                           │  { file_id: "abc123" }  │                        │
    │                           │ <───────────────────────│                        │
    │                           │                         │                        │
    │                           │  POST /mcp/analyze      │                        │
    │                           │  { file_id, user_id }   │                        │
    │                           │ ───────────────────────────────────────────────>│
    │                           │                         │                        │
    │                           │                         │                        │  Traitement
    │                           │                         │                        │  (Gemini API)
    │                           │                         │                        │
    │                           │  { transcripts, ... }   │                        │
    │                           │ <───────────────────────────────────────────────│
    │                           │                         │                        │
    │  Affiche résultat         │                         │                        │
    │ <─────────────────────────│                         │                        │
```

### 4.2 Flux Génération Vidéo (Veo 3)

```
UTILISATEUR                 FRONTEND                 BACKEND API              MCP SERVER
    │                           │                         │                        │
    │  "Génère une vidéo..."    │                         │                        │
    │ ─────────────────────────>│                         │                        │
    │                           │                         │                        │
    │                           │  POST /mcp/generate     │                        │
    │                           │  { prompt, user_id }    │                        │
    │                           │ ───────────────────────────────────────────────>│
    │                           │                         │                        │
    │                           │                         │                        │  Génération
    │                           │                         │                        │  (1-3 min)
    │                           │                         │                        │
    │                           │  { video_url (signée) } │                        │
    │                           │ <───────────────────────────────────────────────│
    │                           │                         │                        │
    │                           │  Log génération         │                        │
    │                           │  pour facturation       │                        │
    │                           │ ───────────────────────>│                        │
    │                           │                         │  Stocke métadonnées    │
    │                           │                         │  si espace activé      │
    │                           │                         │                        │
    │  Affiche vidéo            │                         │                        │
    │ <─────────────────────────│                         │                        │
```

---

## 5. Gestion des Espaces de Stockage

### 5.1 Deux Types d'Utilisateurs

| Type | Espace stockage | Rétention fichiers | Historique |
|------|-----------------|-------------------|------------|
| **Sans stockage** | Non activé | 7 jours puis suppression | Non |
| **Avec stockage** | Activé | Selon forfait (30j, 90j, illimité) | Oui |

### 5.2 Ce Que le Backend API Doit Gérer

**Pour les utilisateurs SANS espace stockage** :
- Les fichiers générés sont sur GCS avec TTL 7 jours
- Pas besoin de stocker de métadonnées côté backend
- URL signée valide 24h, l'utilisateur doit télécharger rapidement

**Pour les utilisateurs AVEC espace stockage** :
- Stocker les métadonnées de chaque génération :
  ```
  {
    "id": "gen_123",
    "user_id": "user_456",
    "type": "video_generation",
    "prompt": "Un chat jouant du piano",
    "gcs_path": "user_456/videos/gen_123.mp4",
    "created_at": "2025-12-09T10:30:00Z",
    "cost": 0.20,
    "status": "completed"
  }
  ```
- Permettre de lister les générations passées
- Permettre de régénérer une nouvelle URL signée
- Permettre de supprimer un fichier

---

## 6. Facturation

### 6.1 Modèle de Facturation

| Service | Coût Estimé | Unité |
|---------|-------------|-------|
| Gemini 2.5 Flash (analyse) | ~$0.075 | par million de tokens |
| Gemini Flash Image | ~$0.02 | par image |
| Veo 3.1 (vidéo 8s) | ~$0.20 | par vidéo |
| GCS Storage | ~$0.02 | par GB/mois |

### 6.2 Ce Que le Backend API Doit Tracker

Pour chaque opération, le MCP Server retournera :
- Type d'opération
- Coût estimé
- Tokens consommés (si applicable)

**Le Backend API doit** :
1. Recevoir ces informations
2. Les associer à l'utilisateur
3. Agréger pour la facturation mensuelle

### 6.3 Pas de Quota Artificiel

**Décision validée** : Pas de quota par utilisateur. La facturation directe s'applique.

**Cependant**, le Backend API doit surveiller les anomalies :
- Pic soudain de consommation d'un utilisateur
- Patterns suspects (1000 requêtes en 1 minute)

---

## 7. Logs et Surveillance

### 7.1 Logs Recommandés

| Événement | Données à Logger |
|-----------|------------------|
| Upload fichier | user_id, file_size, file_type, timestamp |
| Demande génération | user_id, operation_type, prompt (tronqué), timestamp |
| Génération terminée | user_id, operation_type, cost, duration_ms |
| Erreur | user_id, error_code, error_message, timestamp |

### 7.2 Alertes Recommandées

| Condition | Action |
|-----------|--------|
| Utilisateur > $50/jour | Notification équipe |
| Taux d'erreur > 10% | Alerte technique |
| > 100 requêtes/min même user | Potentiel abus, investigation |

---

## 8. Questions pour l'Équipe Backend API

### Questions Bloquantes

1. **Taille max upload vidéo** : 100MB, 500MB, ou 1GB ?
2. **Format user_id** : Comment est transmis l'identifiant utilisateur ?
3. **Stockage temporaire uploads** : Quelle solution (S3, GCS, local) ?

### Questions Non-Bloquantes

4. **Historique** : Quelle base de données pour les métadonnées (PostgreSQL, MongoDB, autre) ?
5. **Alertes** : Quel système d'alerting utilisez-vous (Datadog, Prometheus, autre) ?

---

## 9. Prochaines Étapes

| Étape | Action | Responsable |
|-------|--------|-------------|
| 1 | Répondre aux questions bloquantes | Backend API |
| 2 | Définir le contrat d'API (endpoints, formats) | Backend API + MCP |
| 3 | Implémenter l'endpoint d'upload | Backend API |
| 4 | Implémenter la gestion des espaces stockage | Backend API |
| 5 | Intégrer avec le MCP Server | MCP + Backend API |

---

## 10. Contacts

| Équipe | Sujet |
|--------|-------|
| **MCP** | Intégration, format des requêtes/réponses |
| **n8n** | Workflows d'exécution (interne) |
| **Frontend** | Contraintes d'upload, UX |

---

*Document de présentation pour l'équipe Backend API.*
*Basé sur la synthèse multimodale Gemini v1.2.*
