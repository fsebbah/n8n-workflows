# Bêta azy.education — ce qui revient à l'équipe du site

Les trois workflows n8n sont dans `workflows/BETA_-_*.json` de ce dépôt. Ce dossier
ne contient que **ce que l'équipe du site doit intégrer**, plus la configuration Nginx
qui expose le webhook.

| Fichier | Pour qui | Quoi en faire |
|---|---|---|
| `formulaire.html` | site | à insérer dans la page — formulaire + envoi, aucun service extérieur |
| `merci.html` | site | page d'arrivée après confirmation |
| `lien-expire.html` | site | page d'arrivée si le lien a expiré ou a déjà servi |
| `beta-n8n.conf` | infra | expose **uniquement** `/webhook/`, limite à 2 envois/minute/IP |

## Le contrat d'appel

```
POST https://n8n.azy.education/webhook/beta-inscription
Content-Type: application/json

{ "nom": "…", "email": "…", "profil": "parent|teacher|institution",
  "site_web": "",                       ← pot de miel : DOIT rester vide
  "consentement": true,
  "consentement_texte": "le texte exact affiché à la personne" }
```

**La réponse est toujours `202 {"ok": true}`** — adresse nouvelle, adresse déjà inscrite,
ou robot démasqué. Seule une donnée mal formée rend `400` avec la liste des champs fautifs.
L'équipe du site ne doit donc **jamais** afficher « cette adresse est déjà inscrite » :
cette information n'est pas transmise, et c'est volontaire — sinon n'importe qui pourrait
tester des adresses pour savoir qui s'est inscrit.

## Trois pièges à éviter côté site

1. **Ne pas masquer le pot de miel avec `display:none` seul.** Certains robots ignorent
   les champs ainsi masqués, et le piège ne sert plus à rien. La méthode retenue dans
   `formulaire.html` — hors écran, `tabindex="-1"`, `aria-hidden` — le garde actif tout
   en le rendant invisible et non focalisable.

2. **Envoyer le texte du consentement avec la case cochée.** C'est lui qui est conservé
   comme preuve. Si vous modifiez la phrase, changez-la dans le `<span>` : le code la lit
   dans la page, il n'y a rien à synchroniser ailleurs.

3. **Les valeurs du menu sont en anglais, les libellés en français.** `parent`, `teacher`,
   `institution` — c'est le vocabulaire de la contrainte en base, décidé par l'équipe api.
   Ce que voit le visiteur reste « Un parent », « Un enseignant », « Un établissement ».
   Une seule langue traverse la chaîne : aucune table de traduction à maintenir.

4. **Les adresses sont comparées sans tenir compte de la casse.** `Test@x.com` et
   `test@x.com` sont la même inscription — l'unicité porte sur `lower(email)`. Inutile
   de normaliser côté site, c'est fait en base et dans le workflow.

5. **Ne pas ajouter d'option « élève » au menu.** Le serveur la refuse de toute façon,
   mais l'afficher promettrait quelque chose qui ne marchera pas.

## Ce qui n'est pas de notre ressort

- **La table PostgreSQL** : demandée à l'équipe api, qui seule intervient sur la base.
- **Le serveur d'envoi de courriels** pour `azy.education` (Brevo convient). ⚠️ **SPF et
  DKIM doivent être configurés**, sinon les confirmations partent en indésirables et
  personne ne confirme — on croira le formulaire cassé. À vérifier avec `mail-tester.com`
  **avant** d'ouvrir les inscriptions.
- **La durée de conservation des inscriptions confirmées**, à écrire dans la politique de
  confidentialité (proposition : fin de la bêta + 3 mois).
