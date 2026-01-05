# RFC: Gestion des cles Stripe en architecture multi-tenant

**Date:** 2025-01-05
**Statut:** En discussion
**Equipes concernees:** Bot Discord, Plugin Torah, Backend n8n

---

## Contexte

L'architecture actuelle implique trois composants :

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Plugin    │     │  Bot Discord│     │    n8n      │
│   (Torah)   │     │  (generique)│     │  (workflows)│
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                   │
      │ stripe_secret_key  │ project_id        │ Stripe API
      │ (config locale)    │ (seul parametre)  │ (necessite la cle)
```

**Probleme:** Le bot appelle n8n avec uniquement `project_id`, mais n8n doit appeler l'API Stripe qui necessite la `stripe_secret_key` specifique au projet.

**Question centrale:** Ou stocker la cle Stripe et comment la transmettre a n8n ?

---

## Options proposees

### Option A : Le bot transmet la cle

```
Bot → n8n : { project_id, stripe_secret_key }
```

| Avantages | Inconvenients |
|-----------|---------------|
| Simple a implementer | Cle en transit a chaque requete |
| Pas de stockage cote n8n | Bot doit stocker les cles (securite) |
| | Exposition via logs/debug |

**Questions pour l'equipe Bot:**
- Le bot a-t-il acces aux cles Stripe de chaque projet ?
- Comment le bot obtiendrait-il ces cles ?
- Etes-vous a l'aise avec la responsabilite de gerer ces secrets ?

---

### Option B : Stockage PostgreSQL (table projects)

```sql
CREATE TABLE projects (
  project_id VARCHAR PRIMARY KEY,
  display_name VARCHAR,
  stripe_secret_key VARCHAR,  -- Chiffre ?
  stripe_webhook_secret VARCHAR,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP
);
```

```
Plugin → n8n : POST /register-project { project_id, stripe_secret_key }
Bot → n8n : GET /get-plans?project_id=torah
n8n : SELECT stripe_secret_key FROM projects WHERE project_id = 'torah'
n8n → Stripe API
```

| Avantages | Inconvenients |
|-----------|---------------|
| Cle jamais en transit apres init | Necessite workflow d'enregistrement |
| Bot n'a jamais acces aux cles | Sync a maintenir si cle change |
| Centralise et auditable | Stockage sensible en DB |

**Questions pour l'equipe Plugin:**
- Le plugin peut-il appeler un endpoint d'init au demarrage ?
- Qui gere le cycle de vie des cles (rotation, revocation) ?
- Preferez-vous un enregistrement manuel (admin) ou automatique ?

---

### Option C : Credentials n8n par projet

Creer une credential n8n par projet : `stripe-torah`, `stripe-mcp`, etc.

```
n8n : Utilise la credential correspondant au project_id
```

| Avantages | Inconvenients |
|-----------|---------------|
| Natif n8n, securise | Pas dynamique (code dur) |
| Chiffrement integre | Ajout manuel pour chaque projet |
| | Ne scale pas bien |

**Questions pour l'equipe Backend:**
- Combien de projets sont prevus ?
- La gestion manuelle des credentials est-elle acceptable ?

---

### Option D : Le plugin appelle n8n directement

```
User → Bot : /plans
Bot → Plugin : get_plans()
Plugin → n8n : { project_id, stripe_secret_key }
n8n → Stripe API
Plugin → Bot : plans
Bot → User : affiche plans
```

| Avantages | Inconvenients |
|-----------|---------------|
| Plugin garde le controle des cles | Architecture plus complexe |
| Pas de stockage externe | Latence supplementaire |
| | Bot devient passif (proxy) |

**Questions pour les deux equipes:**
- Cette complexite est-elle justifiee ?
- Le bot doit-il rester l'orchestrateur principal ?

---

### Option E : Variables d'environnement n8n

```
STRIPE_KEY_TORAH=sk_live_xxx
STRIPE_KEY_MCP=sk_live_yyy
```

```javascript
// Dans n8n Code node
const key = process.env[`STRIPE_KEY_${projectId.toUpperCase()}`];
```

| Avantages | Inconvenients |
|-----------|---------------|
| Simple, pas de DB | Redemarrage n8n si ajout projet |
| Securise (env vars) | Ne scale pas |
| | Gestion manuelle |

---

## Matrice de decision

| Critere | Option A | Option B | Option C | Option D | Option E |
|---------|----------|----------|----------|----------|----------|
| Securite | Faible | Bonne | Excellente | Bonne | Bonne |
| Scalabilite | Bonne | Excellente | Faible | Moyenne | Faible |
| Simplicite | Excellente | Moyenne | Moyenne | Faible | Bonne |
| Maintenance | Faible | Moyenne | Elevee | Elevee | Moyenne |
| Autonomie Bot | Oui | Oui | Oui | Non | Oui |

---

## Recommandation initiale

**Option B (PostgreSQL)** semble offrir le meilleur equilibre :
- Securite correcte (cle stockee cote serveur)
- Scalabilite (ajout de projets sans code)
- Le bot reste simple (envoie juste `project_id`)

Avec un workflow `discord-register-project` appele :
- Soit par le plugin au demarrage
- Soit manuellement par un admin via UI/script

---

## Questions ouvertes

1. **Chiffrement des cles en DB ?**
   - Faut-il chiffrer `stripe_secret_key` dans PostgreSQL ?
   - Qui gere la cle de chiffrement ?

2. **Rotation des cles ?**
   - Quelle procedure si une cle Stripe est compromise ?
   - Notification automatique aux equipes ?

3. **Environnement de test ?**
   - Cles `sk_test_` vs `sk_live_` par projet ?
   - Comment gerer les deux environnements ?

4. **Audit et logs ?**
   - Faut-il logger les acces aux cles ?
   - Retention des logs ?

---

## Prochaines etapes

- [ ] Review par equipe Bot
- [ ] Review par equipe Plugin
- [ ] Decision architecturale
- [ ] Implementation de la solution choisie

**Deadline pour feedback:** [A definir]

---

## Commentaires

### Equipe Bot
_[A completer]_

### Equipe Plugin
_[A completer]_

### Equipe Backend
_[A completer]_
