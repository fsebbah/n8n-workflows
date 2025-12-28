# Issue #001: Configuration Webhook Discord pour notifications traduction

**Date**: 2024-12-28
**Statut**: TODO
**Priorité**: Haute
**Projet**: Torah Translation Workflows

---

## Description

Configurer un webhook Discord pour recevoir les notifications du pipeline de traduction Torah. Ce webhook sera utilisé par les workflows n8n pour notifier :
- Démarrage d'un batch de traduction
- Progression (page X/Y traduite)
- Alertes qualité (traductions avec score < seuil)
- Demandes de validation humaine
- Fin de traduction + lien PDF

---

## Guide de configuration

### 1. Créer le webhook dans Discord

1. Ouvrir Discord et aller dans le serveur cible
2. Clic droit sur le channel de notifications → **Modifier le salon**
3. Onglet **Intégrations** → **Webhooks** → **Nouveau webhook**
4. Configurer :
   - **Nom**: `Torah Translator Bot`
   - **Avatar**: (optionnel) icône du projet
5. **Copier l'URL du webhook**

### 2. Format de l'URL

```
https://discord.com/api/webhooks/{webhook_id}/{webhook_token}
```

### 3. Tester le webhook

```bash
curl -X POST "https://discord.com/api/webhooks/VOTRE_ID/VOTRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test webhook Torah Translator",
    "embeds": [{
      "title": "Test de notification",
      "description": "Si vous voyez ce message, le webhook fonctionne !",
      "color": 5814783
    }]
  }'
```

### 4. Configuration dans n8n

#### Option A: Variable d'environnement (recommandé)
```bash
# Dans .env de n8n
DISCORD_TORAH_WEBHOOK=https://discord.com/api/webhooks/...
```

#### Option B: Credential n8n
1. Settings → Credentials → Add Credential
2. Type: Discord Webhook
3. Sauvegarder l'URL

### 5. Utilisation dans les workflows

```json
{
  "type": "n8n-nodes-base.discord",
  "parameters": {
    "webhookUri": "={{ $env.DISCORD_TORAH_WEBHOOK }}",
    "text": "{{ $json.message }}",
    "options": {
      "embeds": [{
        "title": "{{ $json.title }}",
        "description": "{{ $json.description }}",
        "color": "{{ $json.color }}"
      }]
    }
  }
}
```

---

## Types de notifications à implémenter

| Type | Couleur | Exemple |
|------|---------|---------|
| Démarrage | Bleu (3447003) | "Traduction lancée: Sukkah 2a-10b" |
| Progression | Gris (9807270) | "Page 5/50 traduite - Score: 0.94" |
| Succès | Vert (5763719) | "Traduction terminée !" |
| Alerte qualité | Orange (15105570) | "Score faible: 0.72 - Révision requise" |
| Erreur | Rouge (15548997) | "Erreur API: timeout" |
| Validation | Violet (10181046) | "Validation requise pour Sukkah 3a" |

---

## Exemple de message enrichi (embed)

```json
{
  "embeds": [{
    "title": "Traduction terminée",
    "description": "Sukkah 2a-10b traduit avec succès",
    "color": 5763719,
    "fields": [
      {"name": "Pages", "value": "50", "inline": true},
      {"name": "Commentaires", "value": "1,234", "inline": true},
      {"name": "Score moyen", "value": "0.91", "inline": true},
      {"name": "Temps", "value": "45 min", "inline": true}
    ],
    "footer": {"text": "Torah Translator | Claude 3.5 + GPT-4o"},
    "timestamp": "2024-12-28T12:00:00.000Z"
  }]
}
```

---

## Tâches

- [ ] Créer le channel Discord dédié
- [ ] Créer le webhook
- [ ] Tester avec curl
- [ ] Ajouter l'URL dans les variables d'environnement n8n
- [ ] Créer le workflow de notification de base
- [ ] Tester l'intégration complète

---

## Liens utiles

- [Documentation Discord Webhooks](https://discord.com/developers/docs/resources/webhook)
- [n8n Discord Node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discord/)
- [Embed Visualizer](https://leovoel.github.io/embed-visualizer/)
