# Fiche des outils de production — comment elle est faite, et ce qu'une case vide signifie

Générée par `scripts/catalogue/generer_fiche_outils.py` → `fiche-outils-production.csv`.
**109 outils · 59 colonnes.** Schéma arrêté par Franck le 2026-11-10 (`azy.daily#642`).

## La règle qui gouverne ce fichier

**Chaque valeur est déduite du workflow déployé, ou laissée vide. Rien n'est deviné.**

Une case vide dit « je ne sais pas », et c'est exploitable. Une case remplie au jugé est un
piège : *« c'est en devinant le coût qu'on a affiché 91 crédits pour 0,096 »*.

**Source : l'instance `llm.local`, pas le dépôt.** Ce qui est servi aux clients est ce qui
tourne. Le dépôt peut diverger (mesuré le 2026-11-10 : 255 workflows sur 267 identiques).

Les 109 outils de la liste de production sont **tous des webhooks n8n actifs** — vérifié,
109/109 appariés sur les 249 chemins actifs de l'instance. (Le 110ᵉ, `documents/estimate`,
a été archivé — voir la fin de ce document.)

## Taux de remplissage

| colonne | rempli | comment c'est déduit |
|---|---|---|
| `execution` | **109/109** | rend `202`, ou lit `callback_url` → `async` |
| `portee` | **109/109** | champs du corps : `guild_id`, `tenant_id`/`project_id`, `user_id`/jeton |
| `type_resultat` | **109/109** | **le service appelé**, pas les noms de clés (voir plus bas) |
| `livraison` | **109/109** | répondeur binaire, `data:` construite, URL rendue, sinon `inline` |
| `sort_du_perimetre` | **109/109** | hôtes tiers réellement appelés — **60 outils sur 109 en sortent** |
| `irreversible` | **109/109** | opérations d'écriture des nœuds maison, puis verbes sortants |
| `domaine` | **109/109** | domaine produit, déduit du préfixe du chemin |
| `valeurs_autorisees` | 46/109 | les listes de valeurs déclarées dans le code |
| `entrees_exigees` | 84/109 | messages de validation, **cités mot pour mot** |
| `champs_entree` / `cles_sortie` | ~109 | champs du corps lus / clés posées par les répondeurs |
| `duree_estimee` | 81/109 | **un plafond** tiré des `timeout`, jamais une durée observée |
| `prealables` | 66/109 | jetons lus, `plugin_context.api_keys.*`, entrées validées |
| `service_tiers` | 60/109 | le tiers **nommé** (pas un nom d'hôte) |
| `service_heberge` | 35/109 | **nos** services (Gotenberg, torah.api, Qdrant, Redis, chat.api) |
| `description` | **49/109** | la phrase du pense-bête — **60 outils n'en ont aucune** |
| `limites_entree` | 39/109 | bornes littérales trouvées dans le code |
| `cout` | 34/109 | **l'unité et le fournisseur**, jamais un prix |
| `appele_par` | **1/109** | `interne` si un autre workflow l'appelle |
| `surfaces` | **0/109** | **volontairement vide** — 231 arbitrations appartiennent à Franck |

## Les quatre colonnes qu'aucune équipe n'avait listées

**`sort_du_perimetre` est la mieux renseignée des quatre, et la plus utile.** Entièrement
mécanique : les hôtes appelés sont dans le code. **60 outils sur 109 envoient des données
hors du périmètre.** Les plus fréquents : OpenAI (23), Anthropic (16), Mistral (8), Google
(12 hôtes distincts), Mathpix UE (2) — et un cas à part, **QuickChart**, le seul où les
données repartent **depuis le poste de l'utilisateur** (`azy.daily#653`).

**`irreversible`** distingue `oui` avec les opérations nommées, `non` avec sa raison, et
`à vérifier`. Trois choses n'y comptent **pas** comme des écritures, et c'est délibéré :
un appel à un service de **génération** (LLM, OCR, image) consomme du quota sans rien
laisser ; une **consultation en POST** (`:lookup`, `:analyze`, `/embeddings`) reste une
lecture ; un POST vers le **`callback_url` de l'appelant** est une livraison. Cela ne dit
rien de la confidentialité — c'est `sort_du_perimetre` qui la porte.

**`cout`** donne l'unité (`par millier de jetons`, `page`, `appel`, `caractère`) et le
fournisseur. **Aucun prix** : n8n ne détient aucun barème, et l'inventer est exactement
l'erreur à ne pas refaire. La tarification appartient à chat.api.

**`limites_entree`** ne porte que des bornes **littérales** du code (`max_files`,
`max_tokens`, `pages_max`, formats cités). 70 outils n'en déclarent aucune — ce qui ne veut
pas dire qu'ils acceptent tout, mais que **rien dans le code ne les borne**. C'est en soi
un résultat.

## Nommer les services, et séparer tiers / hébergé

Un nom d'hôte n'est pas une réponse : `www.googleapis.com` ne dit pas s'il s'agit de Drive,
de Gmail ou de Maps. Et un appel à **notre** Gotenberg n'est pas une sortie de périmètre,
mais c'est une dépendance que les équipes doivent connaître.

- **`service_tiers`** — table fermée bâtie sur les hôtes **réellement mesurés**. Un hôte
  qu'aucune règle ne nomme ressort préfixé **`?`** : mieux vaut un nom d'hôte brut signalé
  qu'un nom de service inventé. Aujourd'hui : **aucun `?` restant.**
- **`service_heberge`** — chat.api (17 outils), un autre workflow n8n (8), Redis (4),
  Qdrant (4), torah.api (3), **Gotenberg (1 — `torah-pdf`, le seul outil qui génère un PDF
  avec nos propres moyens).**

Trois pièges corrigés en vérifiant des lignes nommées :

- **`generativelanguage.googleapis.com` contient `language.googleapis.com`.** Sans garde,
  `gemini-image` ressortait « Google Cloud Natural Language » — un service qu'il n'appelle
  pas.
- **`www.googleapis.com` est la porte commune de Google**, jamais un service : c'est le
  **chemin** qui décide (`/upload/drive`, `/youtube/v3`, `/customsearch/v1`), examiné avant
  l'hôte.
- **`google-searcher` n'appelle pas Google**, il appelle **SerpAPI**, qui interroge Google
  pour nous. C'est SerpAPI qui reçoit la requête, donc lui qui compte pour la
  confidentialité.

## Les colonnes de précision

- **`valeurs_autorisees`** — les listes déclarées dans le code. C'est l'information qui
  manquait : dire qu'`entity-rating` accepte cinq types d'entités sans les **nommer**, ou
  taire qu'`entity-social-actions` est limité à **trois projets** (`bot-appetit`,
  `torah-bot`, `torah-fun`), fait passer un outil borné pour un outil générique.
  ⚠️ **L'absence de liste est une information aussi** : `entity-list` ne valide que la
  *présence* de `entity_type`, jamais sa valeur, là où `entity-rating` la restreint à cinq.
  Deux outils de la même famille, deux contrats différents.
- **`entrees_exigees`** — les messages de validation, **cités mot pour mot depuis le
  code**, dans la langue qu'il emploie. Les traduire ferait croire à un message que
  l'appelant ne recevra jamais. C'est la seule colonne qui n'est pas en français partout.
- **`champs_entree` / `cles_sortie`** — le contrat d'entrée et de sortie observable.
- **`points_appeles`** — les points d'accès exacts, expressions neutralisées, plus les
  opérations des nœuds maison (`node op: event/create`). Plus précis qu'un hôte.

## Trois pièges mesurés, et pourquoi ils comptent

**`duree_estimee` est un PLAFOND.** Somme des `timeout` du chemin. `web-search` plafonne à
243 s et répond peut-être en 2 s. La rétention d'exécutions est de 37 h et ces outils sont
presque tous à **zéro appel sur 41 jours** : il n'existe **aucune distribution de durées
réelles à publier**. Le plafond borne le risque honnêtement.

**`type_resultat` vient du SERVICE, pas des clés.** Première version : `pdf-ocr` et
`audio-transcription` ressortaient `image` et `audio` — l'inverse de ce qu'ils rendent —
parce que `image_base64` et `audio_base64` sont leurs **entrées**. Les noms de clés ne
distinguent pas l'entrée de la sortie ; le point d'accès, lui, dit le sens de la
transformation.

**Un nœud maison n'a pas d'URL.** `mcp-gmail` ressortait « aucun hôte tiers appelé » alors
qu'il parle à Google à chaque appel, et `irreversible` était **vide** pour un outil qui
sait envoyer et supprimer des courriels. **Dire « non » là où la réponse est « oui » est
bien pire que de laisser vide.** Trois chemins sont désormais lus : les nœuds
`*ToolDynamic`, les nœuds **natifs** d'intégration (`n8n-nodes-base.openAi` pour
`text-to-speech`), et les `https://` cités dans les nœuds Code.

## Ce que ce fichier ne peut pas contenir

- **`surfaces`** — 231 arbitrations en attente. Le registre publie le champ ; il est rempli
  sur 8 outils sur 239. Le déduire d'un nom serait le décider en cachette.
- **`scopes_oauth`** — le jeton arrive **déjà émis** par chat.api, seul à connaître les
  scopes consentis. Les remplir au jugé tromperait sur ce que l'outil peut faire.
- **`perd`** (ce que l'extraction abandonne) — demande de comparer entrée et sortie sur un
  vrai document. À mesurer, pas à supposer.
- **`idempotent`** — demande de rejouer le même appel et de comparer.
- **`quota`, `droit_usage`** — relèvent des contrats fournisseurs.
- **`enonciation`, `differer_vers_historique`** — l'axe vocal est une décision de
  rédaction, pas une propriété du code.

## Et surtout : 60 outils sur 109 n'ont aucune description

C'est le chiffre à regarder avant les 58 autres colonnes. Le script **ne fabrique aucune
prose** : une description auto-générée aurait l'allure d'une documentation et serait validée
sans être lue. Front a posé le bon critère — *un outil dont la description ne permet pas de
décider quand l'utiliser ne devrait pas être offert.*

## `documents/estimate` — retiré de la liste et archivé

Mesuré avant de l'archiver : son estimation est une **constante par type de fichier**.

```js
if (isImage)              { estimatedPages = 1; estimatedTokens = 500;  }
else if (fileType==='pdf'){ estimatedPages = 5; estimatedTokens = 2500; }
else                      { estimatedPages = 3; estimatedTokens = 1500; }
```

Il reçoit `file_base64` / `file_url` et **ne les lit jamais** : un PDF de 200 pages et un
PDF d'une page sont facturés à l'identique. Il portait de plus une grille tarifaire **en
dur** (`base: 5, per_1k_tokens: 1.0, per_page: 2, ocr_bonus: 3, max: 50`), doublon de ce
qui appartient à chat.api. **0 exécution sur 41 jours.** Désactivé puis archivé par l'API ;
son webhook rend désormais 404.

⚠️ Et **`active: false` a été posé dans le fichier du dépôt**. L'archivage sur l'instance
ne protège de rien tout seul : `batch_reimport` active par défaut, et `update_workflow`
n'honore `active: false` que s'il est **explicite**. Sans ce drapeau, le prochain réimport
l'aurait ressuscité, grille tarifaire comprise.

## Régénérer

```bash
cd /storage6/pi6/n8n-workflows
source .env.local && N8N_API_KEY="$N8N_API_KEY" python3 scripts/catalogue/generer_fiche_outils.py
```

La liste d'entrée est `outils-production.txt` (un outil par ligne). Le script affiche le
taux de remplissage par colonne : **ce qui est vide est ce qui reste à décider ou à
mesurer.**
