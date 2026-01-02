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
