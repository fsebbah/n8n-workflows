# RFC-008b: Réponse équipe n8n - Admin Config Screens

**Date:** 2026-01-15
**En réponse à:** RFC-008-ADMIN-CONFIG-SCREENS.md
**Auteur:** Équipe n8n

---

## Résumé

Analyse du RFC-008 Admin Config Screens du point de vue de l'équipe n8n. Ce document valide l'architecture proposée et détaille le plan d'implémentation des workflows.

---

## Évaluation globale

| Aspect | Note | Commentaire |
|--------|------|-------------|
| Architecture | ✅ Excellent | Pattern cohérent avec RFC-007 |
| Specs chatbot-core | ✅ Excellent | UI/UX bien documentée |
| Specs n8n | ✅ Clair | 4 workflows simples à créer |
| Specs API | ✅ Complet | Endpoints bien définis |
| Sécurité | ✅ Bon | Validation URLs, domaines whitelist |

---

## Points validés

### 1. Centralisation via n8n

Tous les appels API passent par n8n - pas d'appels directs depuis chatbot-core.

```
chatbot-core → n8n → API
     ↑                 │
     └─────────────────┘
```

**Avantages:**
- Point unique d'orchestration
- Mapping `guild_id → project_id` centralisé
- Logging et monitoring unifiés
- Cohérence avec RFC-007 (Mention Service)

### 2. Table `guild_branding` existante

**Recommandation:** Étendre la table existante (RFC-003) plutôt que créer une nouvelle.

Champs à ajouter:
```sql
-- Nouveaux champs à ajouter à guild_branding
ALTER TABLE guild_branding ADD COLUMN IF NOT EXISTS tagline VARCHAR(100);
ALTER TABLE guild_branding ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE guild_branding ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE guild_branding ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE guild_branding ADD COLUMN IF NOT EXISTS support_url TEXT;
ALTER TABLE guild_branding ADD COLUMN IF NOT EXISTS version VARCHAR(20);
```

### 3. Nouvelle table `guild_help_config`

La structure JSONB proposée est OK pour v1:

```sql
CREATE TABLE guild_help_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(50) NOT NULL,
    guild_id VARCHAR(50) NOT NULL,
    categories JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uix_guild_help UNIQUE(project_id, guild_id)
);
```

---

## Plan de travail n8n

### Workflows à créer

| Workflow | Type | Description |
|----------|------|-------------|
| `CONFIG---On-Branding-Update` | Webhook | Recevoir PUT branding depuis chatbot-core |
| `CONFIG---On-Help-Update` | Webhook | Recevoir PUT help config depuis chatbot-core |
| `CONFIG---Get-Branding` | Webhook | Retourner branding pour un guild |
| `CONFIG---Get-Help` | Webhook | Retourner help config pour un guild |

### Architecture des workflows

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONFIG---On-Branding-Update                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Webhook    │    │ Get Project  │    │  PUT API     │       │
│  │ PUT /config/ │───►│   Mapping    │───►│  /branding   │       │
│  │   branding   │    │              │    │              │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                  │               │
│                                                  ▼               │
│                                          ┌──────────────┐       │
│                                          │   Respond    │       │
│                                          │   Success    │       │
│                                          └──────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Détail: CONFIG---On-Branding-Update

```
Webhook Trigger (PUT /config/branding)
    │
    ▼
Validate Input
    │ - guild_id requis
    │ - Au moins un champ à modifier
    │
    ▼
Get Project Mapping
    │ GET /api/branding/guild/{guild_id}
    │ → project_id
    │
    ▼
Has Project?
    ├─ Non → Respond 400 "Guild non configuré"
    │
    └─ Oui ▼
        PUT API Branding
            │ PUT /api/config/branding
            │ Headers: X-Project-ID
            │ Body: { guild_id, name, tagline, ... }
            │
            ▼
        Respond Success
            │ { success: true, message: "Branding updated" }
```

### Détail: CONFIG---Get-Branding

```
Webhook Trigger (GET /config/branding?guild_id=xxx)
    │
    ▼
Validate Input
    │ - guild_id requis (query param)
    │
    ▼
Get Project Mapping
    │ GET /api/branding/guild/{guild_id}
    │ → project_id
    │
    ▼
Has Project?
    ├─ Non → Respond 400 "Guild non configuré"
    │
    └─ Oui ▼
        GET API Branding
            │ GET /api/config/branding?guild_id=xxx
            │ Headers: X-Project-ID
            │
            ▼
        Respond Success
            │ { success: true, data: { name, tagline, ... } }
```

### Patterns identiques pour Help

- `CONFIG---On-Help-Update`: Même pattern que Branding-Update
- `CONFIG---Get-Help`: Même pattern que Get-Branding

---

## Endpoints n8n (webhooks)

| Méthode | Path | Description |
|---------|------|-------------|
| `PUT` | `/webhook/config/branding` | Mettre à jour branding |
| `GET` | `/webhook/config/branding` | Récupérer branding |
| `PUT` | `/webhook/config/help` | Mettre à jour help config |
| `GET` | `/webhook/config/help` | Récupérer help config |
| `POST` | `/webhook/config/help/reset` | Reset help aux défauts |

---

## Réponses aux questions §13

### Question 1: Workflows existants ?

**Réponse:** Non, pas de workflows branding existants. À créer selon le plan ci-dessus.

### Question 2: Cache Redis ?

**Réponse:** Recommandé pour v2.

Pour v1: pas de cache, appels directs à l'API.

Pour v2:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  chatbot    │────►│    n8n      │────►│   Redis     │
│    core     │     │             │     │   Cache     │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │                    │
                          │ Cache miss         │
                          ▼                    │
                   ┌─────────────┐             │
                   │    API      │◄────────────┘
                   └─────────────┘      Update cache
```

Clés Redis proposées:
- `config:branding:{project_id}:{guild_id}`
- `config:help:{project_id}:{guild_id}`

TTL: 5 minutes (config change peu fréquemment)

---

## Dépendances

### Bloquant pour n8n

| Dépendance | Équipe | Status | Impact |
|------------|--------|--------|--------|
| `PUT /api/config/branding` | API | À créer | Workflow Update |
| `GET /api/config/branding` | API | À créer | Workflow Get |
| `PUT /api/config/help` | API | À créer | Workflow Update |
| `GET /api/config/help` | API | À créer | Workflow Get |
| Migration table | API | À faire | Nouveaux champs branding |

### Non bloquant

| Item | Équipe | Note |
|------|--------|------|
| ConfigService | chatbot-core | Peut avancer en parallèle |
| Views/Modals | chatbot-core | Indépendant |
| Plugin config | Plugin | Après chatbot-core |

---

## Estimation effort n8n

| Workflow | Effort | Complexité |
|----------|--------|------------|
| `CONFIG---On-Branding-Update` | S | Simple |
| `CONFIG---Get-Branding` | S | Simple |
| `CONFIG---On-Help-Update` | S | Simple |
| `CONFIG---Get-Help` | S | Simple |
| `CONFIG---Help-Reset` | S | Simple |
| **Total** | **~2h** | Patterns identiques RFC-007 |

---

## Checklist avant implémentation

### n8n

- [ ] Endpoints API créés et testés
- [ ] Migration table `guild_branding` effectuée
- [ ] Table `guild_help_config` créée

### API

- [ ] `PUT /api/config/branding`
- [ ] `GET /api/config/branding`
- [ ] `PUT /api/config/help`
- [ ] `GET /api/config/help`
- [ ] `POST /api/config/help/reset`

### chatbot-core

- [ ] ConfigService avec URLs n8n configurées

---

## Conclusion

Le RFC-008 est bien structuré et cohérent avec l'architecture existante (RFC-007).

**Points clés:**
1. ✅ Tous les appels passent par n8n (pas d'appels directs API)
2. ✅ Réutilisation table `guild_branding` existante
3. ✅ 5 workflows simples à créer (~2h de travail)
4. ⏳ Cache Redis en v2

**Prêt à démarrer** dès que les endpoints API sont disponibles.

---

## Historique

| Date | Auteur | Modification |
|------|--------|--------------|
| 2026-01-15 | Équipe n8n | Création du document de réponse |
