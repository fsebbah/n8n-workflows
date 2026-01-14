# Configuration des Variables d'Environnement n8n

## Objectif

Remplacer les URLs hardcodées (`localhost`, `127.0.0.1`) par des variables d'environnement configurables.

---

## Variables à configurer

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `TORAH_API_URL` | URL de l'API Torah | `http://pi6.local:3031` |

---

## Étape 1 : Configurer ecosystem.config.js

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'n8n',
    script: 'n8n',
    args: 'start',
    env: {
      N8N_PORT: 5678,
      // ... autres variables n8n ...

      // Variables custom pour les workflows
      TORAH_API_URL: 'http://pi6.local:3031'
    }
  }]
};
```

---

## Étape 2 : Utiliser dans les workflows

Dans les nodes HTTP Request, remplacer :

```
http://localhost:3031/api/translations/save
http://127.0.0.1:3031/api/translations/search
```

Par :

```
{{ $env.TORAH_API_URL }}/api/translations/save
{{ $env.TORAH_API_URL }}/api/translations/search
```

---

## Pattern correct pour les HTTP Request

### A FAIRE (correct)

Directement dans le champ URL du node HTTP Request :

```
={{ $env.TORAH_API_URL }}/api/cart/webhook/{{ $json.data.discord_user_id }}
```

**n8n accède aux variables d'environnement via `$env.VARIABLE_NAME` dans les expressions.**

### A NE PAS FAIRE (incorrect)

Ne pas passer par un Code node pour récupérer la variable :

```javascript
// MAUVAIS - Ne pas faire ça !
const apiBaseUrl = process.env.TORAH_API_URL || 'http://localhost:3031';
return {
  data: {
    api_base_url: apiBaseUrl,
    // ...
  }
};
```

Puis dans HTTP Request :
```
={{ $json.data.api_base_url }}/api/...
```

### Exemples de patterns valides

| Cas | URL |
|-----|-----|
| Simple | `={{ $env.TORAH_API_URL }}/api/products` |
| Avec paramètre | `={{ $env.TORAH_API_URL }}/api/cart/{{ $json.user_id }}` |
| Avec query string | `={{ $env.TORAH_API_URL }}/api/search?q={{ $json.query }}` |
| Référence autre node | `={{ $env.TORAH_API_URL }}/api/user/{{ $('Validate Input').first().json.user_id }}` |

### Pourquoi ce pattern ?

1. **Simplicité** - Pas de code JavaScript supplémentaire
2. **Cohérence** - Même pattern que les autres workflows (Torah, Discord, Stripe)
3. **Lisibilité** - L'URL est visible directement dans le node
4. **Performance** - Pas d'étape intermédiaire

---

## Workflows à mettre à jour

### Torah Discord Translation
- [ ] `Search Cache` : URL cache search
- [ ] `Save to Cache` : URL save

### Torah Validate Text
- [ ] `Search Torah API` : URL search

### Torah Vocalization
- [ ] Vérifier si utilise l'API Torah

---

## Étape 3 : Redémarrer n8n

```bash
pm2 restart n8n
```

---

## Vérification

Après redémarrage, vérifier que la variable est accessible :

1. Créer un workflow de test avec un node Code :
```javascript
return [{ json: { torah_api_url: $env.TORAH_API_URL } }];
```

2. Exécuter et vérifier la valeur retournée

---

## Avantages

1. **Portabilité** : Même workflow fonctionne en dev/prod
2. **Maintenance** : Une seule valeur à changer
3. **Sécurité** : Pas d'URLs hardcodées dans le code
4. **Flexibilité** : Facile de pointer vers un autre serveur

---

*Créé le : 29 décembre 2025*
