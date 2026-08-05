# Webhooks parashiot — guide d'intégration et de maintenance

Trois webhooks n8n pour naviguer dans le Tanakh : lister les 54 parashiot, ouvrir l'une d'elles avec ses sept aliyot, afficher son texte.

> **Guide d'intégration lisible** (payloads, erreurs, parcours type) :
> https://claude.ai/code/artifact/d641c7ef-eb9a-483d-a46c-d4094c99126b
>
> Ce fichier-ci couvre en plus ce qu'un intégrateur n'a pas besoin de savoir mais qu'un mainteneur doit connaître : la correspondance workflow ↔ endpoint, les décisions d'implémentation et leurs raisons.

Contrat : [azy.daily#185](https://github.com/fsebbah/azy.daily/issues/185) · Réalisation : [n8n-workflows#414](https://github.com/fsebbah/n8n-workflows/issues/414)

---

## Correspondance

| Webhook | Workflow | Endpoint API |
|---|---|---|
| `torah-tanakh-parashiot-list` | `TORAH_-_Parashiot_List.json` | `GET /api/torah/parashiyot` |
| `torah-tanakh-parasha-get` | `TORAH_-_Parasha_Get.json` | `GET /api/torah/parashiyot/{name}` |
| `torah-tanakh-parasha-content` | `TORAH_-_Parasha_Content.json` | `/aliyot/{index}/segments` ou `/segments` |

Base API : `$env.TORAH_API_URL` — service unique et centralisé (host2), **pas** un backend par tenant. À ne pas confondre avec `BACKEND_API_URL`, qui concerne le backend Discord/guild et voyage dans le body depuis la bascule BYOT (#386, #413).

Les trois sont déclarés dans le Code node `Build Registry` de `Torah_-_Registry.json`, sans quoi ils resteraient invisibles pour MCP.

---

## Pourquoi le préfixe `torah-tanakh-`

`torah-get-page-translations` porte un nom neutre alors qu'il appelle `/api/talmud/page/{traite}/{page}/segments`. Cette ambiguïté a produit une erreur d'analyse dans azy.daily#185, où le plugin croyait lire du Tanakh avec un tool Talmud.

Un préfixe qui désigne un corpus alors que la mécanique est générale finit par être utilisé hors de son domaine, et le nom devient trompeur pour tout le monde. Ici le préfixe dit quel corpus est interrogé.

---

## Décisions d'implémentation

### La casse du nom n'est pas normalisée

L'API attend le nom EN canonique exactement : `Bereshit` répond 200, `bereshit` répond 404.

Capitaliser côté workflow casserait les noms multi-mots (`Lech Lecha`, `V'Zot HaBerachah`) et transformerait une faute de frappe en résultat approximatif. Le choix est donc de **transmettre tel quel et d'enrichir le 404** : le message rappelle la règle et renvoie vers `torah-tanakh-parashiot-list`.

Les noms multi-mots sont en revanche URL-encodés par le workflow.

### L'aliyah est validée avant l'appel

Une aliyah hors de 1..7 est refusée localement avec un message direct. L'API renvoie sinon un **422 dont le `detail` est un tableau d'objets Pydantic**, illisible pour un utilisateur final. Une borne connue et fixe — sept aliyot, toujours — mérite un message clair.

### Le markdown des traductions n'est pas nettoyé

Mesuré sur Bereshit aliyah 1 : **18 traductions sur 31** portent des marques `##` ou `**`, restes de prompt dans le texte stocké en base.

Nettoyer dans le workflow masquerait le défaut à la source et ferait diverger la réponse de celle de l'API. À traiter au rendu, ou en corrigeant les données.

### Les erreurs HTTP doivent être désencapsulées

**Piège coûteux, corrigé en [#422](https://github.com/fsebbah/n8n-workflows/pull/422).** Avec `onError: continueRegularOutput`, un HTTP Request en échec ne produit **pas** `{statusCode, body}` mais l'objet d'erreur axios :

- `input.statusCode` est **absent** — un code qui teste `input.statusCode || 200` retombe sur 200 et exécute la branche succès sur un objet d'erreur ;
- le statut réel est enfoui dans le message, sous la forme `404 - {"detail":…}` ;
- `$json.error.code` vaut `"ERR_BAD_REQUEST"` — une **chaîne**, que n8n refuse comme statut HTTP et transforme en 500 opaque.

Symptômes observés avant correctif : un livre invalide renvoyait `200 {success:true, count:0}` — une erreur déguisée en résultat vide — et une casse incorrecte renvoyait 500.

La parade est celle du node `Normalize Error` de `DOC - Render PDF` : extraire le statut en tête de message, puis la charge JSON, avec un second essai sur la version déséchappée. Le `responseCode` vérifie `Number.isInteger` avant de servir un code.

Le `detail` d'un **422 FastAPI est un tableau** là où les 400 et 404 de l'API portent une chaîne : sans ce tri, la réponse afficherait `[object Object]`.

---

## Formes de réponse

Détail complet dans l'artefact. En résumé :

- **liste** — `{success, count, parashiyot[]}` ; un élément porte `name`, `hebrew_name`, `book`, `order_index`, `global_order`, `sefaria_ref`, `aliases` ;
- **détail** — la parasha à la racine, plus `start_ref`, `end_ref`, `aliyot[7]` et `aliyot_count` ;
- **contenu** — `{success, name, aliyah, segments_count, translated_count, aliyot_boundaries, segments[]}`.

`aliyot_boundaries` n'est peuplé qu'en mode parasha entière ; il donne les intervalles d'index de chaque aliyah pour découper côté client.

### Parité avec le Talmud

Un segment de parasha porte `index`, `hebrew_text` et `translation{translated_text, provider, model, target_language}` — **les mêmes champs qu'un segment de daf**. Le pipeline d'affichage existant fonctionne sans mapping neuf.

S'y ajoutent `chapter`, `verse` et `ref`, propres au Tanakh, à lire uniquement pour afficher la référence du verset.

Les marques massorétiques `{פ}` et `{ס}` sont conservées : le normaliseur les traite comme du contenu, pas comme du balisage. Les retirer à l'affichage est une décision de rendu.

---

## Mesures relevées le 2026-08-05 sur host2

| Appel | Volume | Durée |
|---|---|---|
| liste des 54 | 8 Ko | ~30 ms |
| une aliyah (Bereshit 1) | 34 segments, 21 Ko | ~55 ms |
| parasha entière (Bereshit) | 146 segments, 59 Ko | ~105 ms |

Aucune pagination n'est nécessaire à ces volumes. Le timeout des nœuds HTTP est fixé à 30 s, très au-delà du besoin.

---

## Hors périmètre v1

`/current` et `/by-date` — la parasha de la semaine — sont bloqués par [azy.daily#186](https://github.com/fsebbah/azy.daily/issues/186), le sidecar de calcul du calendrier hébraïque. Un cron hebdomadaire les consommera quand ils existeront : [n8n-workflows#415](https://github.com/fsebbah/n8n-workflows/issues/415).

Rappel : ce calcul ne peut pas se faire côté n8n. La sandbox du Code node interdit `require`, donc `@calj.net/jdates` est hors d'atteinte — c'est l'argument qui a motivé le choix de l'API de garder le calcul de son côté.

---

## Piège de déploiement côté API

Deux fois le 2026-08-05, l'API a annoncé des endpoints « dispo en dev » qui renvoyaient 404. Dans les deux cas le code **était** déployé — `/storage4/torah.api/api` est monté en volume — mais le process FastAPI tournait encore avec la table de routes construite à son démarrage.

Avant de conclure qu'une livraison a échoué, vérifier depuis quand le process tourne :

```bash
docker exec torah-api sh -c "ls -l --time-style=+%F_%H:%M /app/api/routers/torah.py"
docker inspect torah-api --format "{{.State.StartedAt}}"
```

Si le fichier est plus récent que le démarrage, un `docker restart torah-api` suffit.
