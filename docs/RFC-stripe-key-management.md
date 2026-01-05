# RFC: Gestion des cles Stripe en architecture multi-tenant

**Date:** 2025-01-05
**Mise a jour:** 2025-01-05
**Statut:** En discussion
**Equipes concernees:** Framework Bot Discord, Plugins, Backend n8n

---

## 1. Architecture clarifiee

### 1.1 Modele de deploiement

Le framework bot-discord est une **dependance pip** installee par chaque plugin.
**1 plugin = 1 repo = 1 bot Discord = 1 cle Stripe = 1 deploiement independant**

```
┌─────────────────────────────┐   ┌─────────────────────────────┐
│     Plugin Torah (repo)     │   │     Plugin MCP (repo)       │
├─────────────────────────────┤   ├─────────────────────────────┤
│ requirements.txt:           │   │ requirements.txt:           │
│   discord-bot-framework     │   │   discord-bot-framework     │
│                             │   │                             │
│ .env:                       │   │ .env:                       │
│   PROJECT_ID=torah          │   │   PROJECT_ID=mcp            │
│   DISCORD_TOKEN=token_a     │   │   DISCORD_TOKEN=token_b     │
│   STRIPE_SECRET_KEY=sk_a    │   │   STRIPE_SECRET_KEY=sk_b    │
│   STRIPE_WEBHOOK_SECRET=... │   │   STRIPE_WEBHOOK_SECRET=... │
└──────────────┬──────────────┘   └──────────────┬──────────────┘
               │                                  │
               │         Meme serveur             │
               └──────────────┬───────────────────┘
                              ▼
                    ┌───────────────────┐
                    │        n8n        │
                    │   (workflows      │
                    │    partages)      │
                    └───────────────────┘
```

### 1.2 Principe fondamental: Source unique de verite

**Comme OAuth2:** La cle est stockee a UN SEUL endroit - la configuration du plugin.

- Le plugin possede sa cle Stripe dans son `.env`
- La cle est passee a n8n a chaque requete (comme un Bearer token)
- n8n n'a **pas** de stockage de cles
- Pas de duplication, pas de synchronisation

---

## 2. Les deux flux a considerer

### 2.1 Flux Bot → n8n (commandes Discord)

```
User ──► Bot ──► n8n ──► Stripe API
              │
              └─► Le bot PEUT passer la cle
```

**Exemple:** `/plans`, `/subscribe`, `/account`

Le bot connait la cle (depuis sa config) et peut la transmettre a n8n.

**Implementation proposee:**
```
POST /webhook/discord-get-plans
Headers:
  X-Project-ID: torah
  X-Stripe-Secret-Key: sk_live_xxx    ← Header (pas dans le body)
```

### 2.2 Flux Stripe → n8n (webhooks)

```
Stripe ──────────────────────► n8n /webhook/stripe-events
                                    │
                                    └─► Le bot N'EST PAS dans la boucle
```

**Probleme:** n8n recoit un webhook Stripe mais:
- Ne sait pas quel projet est concerne
- N'a pas le `webhook_secret` pour valider la signature
- Le bot ne peut pas aider (pas dans la boucle)

**C'est le probleme principal de ce RFC.**

---

## 3. Options pour le flux Stripe → n8n

### Option A: Un endpoint webhook par projet

```
Stripe Torah ──► n8n /webhook/stripe-events-torah
Stripe MCP   ──► n8n /webhook/stripe-events-mcp
```

n8n stocke le `webhook_secret` par endpoint (credential ou env var).

| Avantages | Inconvenients |
|-----------|---------------|
| Isolation totale | 1 workflow par projet |
| Simple a debugger | Ne scale pas (5+ projets) |
| webhook_secret par endpoint | Duplication de code |

### Option B: project_id dans metadata Stripe

Configurer Stripe pour inclure `project_id` dans les metadata:

```javascript
// Lors de la creation du checkout (cote bot → n8n)
metadata: {
  project_id: "torah",
  discord_user_id: "123456789"
}
```

Stripe renvoie ces metadata dans les webhooks:

```json
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "metadata": {
        "project_id": "torah"
      }
    }
  }
}
```

n8n peut alors router vers le bon projet.

| Avantages | Inconvenients |
|-----------|---------------|
| 1 seul endpoint webhook | webhook_secret toujours necessaire |
| Metadata inclus par Stripe | Dependance config Stripe correcte |
| Scale bien | Pas de validation signature multi-projet |

### Option C: Stockage des webhook_secrets dans n8n

Contradiction avec "source unique", mais pragmatique:

```
┌─────────────────────────────────────────────────────┐
│                    n8n                               │
│  ┌───────────────────────────────────────────────┐  │
│  │ SQLite: stripe_webhook_secrets                │  │
│  │ ┌────────────┬─────────────────────────────┐  │  │
│  │ │ project_id │ webhook_secret              │  │  │
│  │ ├────────────┼─────────────────────────────┤  │  │
│  │ │ torah      │ whsec_xxx                   │  │  │
│  │ │ mcp        │ whsec_yyy                   │  │  │
│  │ └────────────┴─────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

Le plugin enregistre son `webhook_secret` au demarrage:
```
Plugin ──► n8n POST /admin/register-webhook-secret
           { project_id, webhook_secret }
```

| Avantages | Inconvenients |
|-----------|---------------|
| Validation signature OK | Stockage de secrets cote n8n |
| Scale bien | Sync necessaire si rotation |
| 1 seul endpoint | Deux sources de verite |

### Option D: Credentials n8n par projet (manuel)

Creer manuellement une credential n8n par projet:
- `stripe-webhook-torah`
- `stripe-webhook-mcp`

| Avantages | Inconvenients |
|-----------|---------------|
| Natif n8n, chiffre | Gestion manuelle |
| Pas de code custom | Ne scale pas |
| Securise | Ajout projet = config n8n |

### Option E: Stripe Connect (architecture alternative)

Une seule cle Stripe "platform", chaque projet est un "connected account":

```
┌─────────────────────────────────┐
│    Compte Platform (vous)       │  ← 1 seule cle API
│    sk_platform_xxx              │
└───────────────┬─────────────────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
┌───────┐  ┌───────┐  ┌───────┐
│ Torah │  │  MCP  │  │ Proj X│   ← Connected Accounts
│ acct_ │  │ acct_ │  │ acct_ │      (pas de cles separees)
└───────┘  └───────┘  └───────┘
```

| Avantages | Inconvenients |
|-----------|---------------|
| 1 seule cle a gerer | Setup Stripe Connect |
| Isolation native | Frais Stripe supplementaires |
| Webhooks simplifies | Complexite onboarding |
| Scale infiniment | Overkill pour 5 projets? |

---

## 4. Matrice de decision

| Critere | Option A | Option B | Option C | Option D | Option E |
|---------|----------|----------|----------|----------|----------|
| **Securite** | Bonne | Moyenne | Bonne | Excellente | Excellente |
| **Scalabilite** | Faible | Bonne | Bonne | Faible | Excellente |
| **Source unique** | Oui | Oui | Non | Non | Oui |
| **Validation webhook** | Oui | Non | Oui | Oui | Oui |
| **Effort n8n** | Eleve | Faible | Moyen | Faible | Moyen |
| **Effort plugin** | Faible | Moyen | Moyen | Faible | Eleve |

---

## 5. Responsabilites par composant

### 5.1 Framework Bot Discord (dependance pip)

| Responsabilite | Description |
|----------------|-------------|
| Fournir `N8nClient` | Client HTTP pour appeler n8n |
| Passer `project_id` | Identifiant du projet |
| Passer `stripe_secret_key` | Via header HTTP securise |
| Gerer les erreurs n8n | Retry, timeout, fallback |
| **NE PAS** stocker de cles | Juste transmettre depuis config |

### 5.2 Plugin (utilisateur du framework)

| Responsabilite | Description |
|----------------|-------------|
| Configurer `.env` | `PROJECT_ID`, `STRIPE_SECRET_KEY`, etc. |
| Instancier le bot | Avec la config appropriee |
| Posseder les cles Stripe | Source unique de verite |
| Enregistrer webhook_secret? | Si Option C choisie |

### 5.3 n8n (workflows)

| Responsabilite | Description |
|----------------|-------------|
| Definir les endpoints | `/discord-get-plans`, etc. |
| Recevoir les webhooks Stripe | `/stripe-events` |
| Appeler l'API Stripe | Avec la cle recue |
| Valider les signatures webhook | Avec le secret approprie |
| Mettre a jour PostgreSQL | Subscribers, transactions |
| **Definir le contrat API** | Ce RFC devrait etre cote n8n |

---

## 6. Recommandation

### Court terme (5 projets)

**Option D (Credentials n8n manuelles)** pour les `webhook_secret`:
- Simple, natif n8n
- Securise (chiffrement integre)
- Acceptable pour 5 projets

**Option "Transmission directe"** pour les `stripe_secret_key`:
- Le bot passe la cle via header a chaque requete
- n8n ne stocke pas les cles API
- Source unique dans le plugin

### Long terme (10+ projets)

**Option E (Stripe Connect)** a evaluer:
- Elimine la gestion multi-cles
- Scale naturellement
- Webhooks centralises

---

## 7. Questions pour l'equipe n8n

1. **Validation webhook:** Comment validez-vous actuellement les signatures Stripe?

2. **Stockage:** Acceptez-vous de stocker les `webhook_secret` dans n8n (Option C)?

3. **Credentials manuelles:** Est-ce acceptable de creer 5 credentials Stripe manuellement?

4. **Header vs Body:** Preferez-vous recevoir `stripe_secret_key` en header ou dans le body JSON?

5. **Stripe Connect:** Avez-vous de l'experience avec Stripe Connect?

6. **Ce RFC:** Souhaitez-vous reprendre ce document cote n8n puisque vous definissez l'API?

---

## 8. Questions ouvertes

1. **Rotation des cles:**
   - Procedure si une cle est compromise?
   - Comment synchroniser si Option C?

2. **Environnement test/prod:**
   - `sk_test_` vs `sk_live_` par projet?
   - Endpoints n8n separes ou meme endpoint?

3. **Audit:**
   - Logger les appels avec `stripe_secret_key`?
   - Masquer les cles dans les logs n8n?

4. **TLS:**
   - Communication bot ↔ n8n en HTTPS obligatoire?
   - Certificats auto-signes acceptes (meme serveur)?

---

## 9. Prochaines etapes

- [x] Review par equipe Bot (ce document)
- [ ] Review par equipe n8n
- [ ] Decision sur Option webhook (A/B/C/D)
- [ ] Decision sur transmission stripe_key (Header vs Body)
- [ ] Implementation

**Deadline pour feedback n8n:** [A definir]

---

## 10. Historique

| Date | Modification |
|------|--------------|
| 2025-01-05 | Version initiale |
| 2025-01-05 | Rewrite complet apres analyse equipe Bot |

---

## 11. Reponse equipe n8n (2025-01-05)

### 11.1 Analyse du document

**Points d'accord:**
- Architecture 1 plugin = 1 bot = 1 cle : claire et maintenable
- Principe de source unique pour `stripe_secret_key` : correct
- Transmission via header plutot que body : bonne pratique
- Le flux Stripe → n8n est bien le probleme principal

**Points de challenge:**

| Affirmation | Challenge |
|-------------|-----------|
| "Le bot passe la cle a chaque requete" | Acceptable si HTTPS, mais augmente la surface d'attaque |
| "n8n ne stocke pas de cles" | Contradiction avec Option C qui stocke webhook_secret |
| "Option D pour court terme" | Gestion manuelle = source d'erreurs et oublis |

### 11.2 Reponses aux questions (Section 7)

**Q1. Validation webhook - Comment validez-vous actuellement?**

Actuellement, nous n'avons PAS de validation de signature Stripe.
Les workflows Stripe existants font confiance a l'appelant.
C'est un **risque de securite** a corriger.

**Q2. Stockage webhook_secret dans n8n (Option C)?**

**OUI, acceptable.** Justification:
- Le `webhook_secret` n'est PAS la cle API (ne permet pas d'actions)
- Il sert uniquement a valider l'origine des webhooks
- Stocker ce secret cote n8n est coherent : c'est n8n qui recoit les webhooks
- Ce n'est pas une "duplication" mais une delegation de responsabilite

**Q3. 5 credentials manuelles?**

**NON recommande.** Problemes:
- Erreur humaine lors de l'ajout d'un projet
- Pas de visibilite sur la liste des projets configures
- Difficile a auditer
- Necessite acces admin n8n pour chaque nouveau projet

**Q4. Header vs Body pour stripe_secret_key?**

**HEADER obligatoire.** Raisons:
- `X-Stripe-Secret-Key` en header
- Plus facile a exclure des logs applicatifs
- Separation claire donnees/authentification
- Convention standard (comme `Authorization: Bearer`)

**Q5. Experience Stripe Connect?**

Non, mais pret a explorer pour le long terme si >10 projets.

**Q6. Reprendre ce RFC cote n8n?**

**OUI.** Ce document definit le contrat API n8n.
Il devrait vivre dans le repo n8n-workflows (deja le cas).

### 11.3 Recommandation n8n

**Proposition : Option B + C combinee**

```
┌─────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FLUX 1: Bot → n8n                                              │
│  ─────────────────                                              │
│  Bot passe: X-Project-ID + X-Stripe-Secret-Key (headers)        │
│  n8n: utilise la cle recue, ne stocke rien                      │
│                                                                  │
│  FLUX 2: Stripe → n8n                                           │
│  ─────────────────────                                          │
│  Stripe envoie: webhook avec metadata.project_id (Option B)     │
│  n8n: lookup webhook_secret dans PostgreSQL (Option C)          │
│  n8n: valide signature, route vers le bon projet                │
│                                                                  │
│  INITIALISATION (une fois par projet):                          │
│  ─────────────────────────────────────                          │
│  Plugin → n8n: POST /admin/register-project                     │
│  { project_id, webhook_secret, callback_url? }                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Avantages de cette approche:**
1. `stripe_secret_key` jamais stockee cote n8n (source unique = plugin)
2. `webhook_secret` stocke cote n8n (logique: c'est n8n qui valide)
3. Un seul endpoint webhook Stripe (`/webhook/stripe-events`)
4. Routing dynamique via `metadata.project_id`
5. Scale bien (ajout projet = 1 appel API)

### 11.4 Reponses aux questions ouvertes (Section 8)

**Q1. Rotation des cles**

| Scenario | Procedure |
|----------|-----------|
| Rotation planifiee `stripe_secret_key` | Plugin met a jour son .env, rien a faire cote n8n |
| Rotation planifiee `webhook_secret` | Plugin appelle `/admin/register-project` avec nouveau secret |
| Cle compromise | 1. Revoquer dans Stripe 2. Generer nouvelle cle 3. Mettre a jour config 4. Alerter les equipes |

**Q2. Environnement test/prod**

Proposition:
```
project_id = "torah"       → Production (sk_live_)
project_id = "torah-test"  → Test (sk_test_)
```

Meme endpoint n8n, le plugin decide de son `project_id`.
Permet de tester sans impacter la prod.

**Q3. Audit et logs**

| Element | Action |
|---------|--------|
| `stripe_secret_key` dans header | JAMAIS loggue (exclure X-Stripe-* des logs) |
| `webhook_secret` | JAMAIS loggue |
| `project_id` | Loggue (pour audit) |
| Appels Stripe API | Loggue (sans la cle) |
| Erreurs validation webhook | Loggue avec alerte |

Implementation n8n: configurer les workflows pour masquer les headers sensibles.

**Q4. TLS (HTTPS)**

| Communication | Exigence |
|---------------|----------|
| Bot → n8n (meme serveur) | HTTP acceptable si localhost/reseau prive |
| Bot → n8n (serveurs differents) | **HTTPS obligatoire** |
| Plugin → n8n (init) | HTTPS recommande |
| Stripe → n8n | HTTPS obligatoire (impose par Stripe) |

Pour notre setup actuel (pi6.local, meme reseau):
- HTTP acceptable en interne
- Mais HTTPS recommande si le reseau n'est pas de confiance

### 11.5 Schema de donnees PostgreSQL propose

```sql
-- Table pour les secrets webhook (pas les cles API!)
CREATE TABLE IF NOT EXISTS project_webhooks (
    project_id VARCHAR(50) PRIMARY KEY,
    webhook_secret VARCHAR(255) NOT NULL,  -- whsec_xxx
    display_name VARCHAR(100),
    callback_url VARCHAR(500),             -- URL pour notifier le bot
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour lookup rapide
CREATE INDEX idx_project_webhooks_active ON project_webhooks(active);

-- Note: stripe_secret_key n'est PAS stocke ici
-- Elle est passee par le bot a chaque requete
```

### 11.6 Endpoints n8n a implementer

| Endpoint | Methode | Usage |
|----------|---------|-------|
| `/admin/register-project` | POST | Plugin enregistre son webhook_secret |
| `/admin/unregister-project` | DELETE | Retirer un projet |
| `/webhook/stripe-events` | POST | Reception webhooks Stripe (unique) |
| `/webhook/discord-*` | GET/POST | Endpoints existants (deja OK) |

### 11.7 Decision demandee

**Pour avancer, nous avons besoin de validation sur:**

- [ ] Accord sur Option B+C (metadata + stockage webhook_secret)
- [ ] Accord sur headers pour `stripe_secret_key`
- [ ] Accord sur schema PostgreSQL `project_webhooks`
- [ ] Accord sur HTTP interne / HTTPS externe

**Deadline decision:** [A definir par le projet]

---

## Annexe: Format des headers proposes

```http
POST /webhook/discord-get-plans HTTP/1.1
Host: pi6.local:5678
Content-Type: application/json
X-Project-ID: torah
X-Stripe-Secret-Key: sk_live_xxxxxxxxxxxx

{
  "discord_user_id": "123456789"
}
```

**Pourquoi des headers?**
- Separation donnees/authentification
- Plus facile a filtrer des logs
- Convention standard (comme `Authorization`)
- Pas de risque d'inclure dans les logs de body JSON
