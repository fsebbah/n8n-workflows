# Fiche des 110 outils de production — comment elle est faite, et ce qu'une case vide signifie

Généré par `scripts/catalogue/generer_fiche_outils.py` → `fiche-outils-production.csv`.
Schéma des 43 informations arrêté par Franck le 2026-11-10 (`azy.daily#642`).

## La règle qui gouverne ce fichier

**Chaque valeur est déduite du workflow déployé, ou laissée vide. Rien n'est deviné.**

Une case vide dit « je ne sais pas », et c'est une information exploitable. Une case
remplie au jugé est un piège — Franck l'a dit sans détour : *« c'est en devinant le coût
qu'on a affiché 91 crédits pour 0,096 »*.

**Source : l'instance `llm.local`, pas le dépôt.** Ce qui est servi aux clients est ce qui
tourne. Le dépôt peut diverger (mesuré le 2026-11-10 : 255 workflows sur 267 identiques).

**Les 110 outils de la liste sont tous des webhooks n8n actifs** — vérifié, 110/110
appariés sur les 249 chemins actifs de l'instance.

## Ce que je sais remplir, et ce que je ne sais pas

| colonne | rempli | comment c'est déduit |
|---|---|---|
| `execution` | **110/110** | `202` rendu ou `callback_url` lu → `async` |
| `scope` | **110/110** | champs du corps : `guild_id`, `tenant_id`/`project_id`, `user_id`/jeton |
| `result_kind` | **110/110** | **le service appelé**, pas les clés (voir ci-dessous) |
| `livraison` | **110/110** | répondeur binaire, `data:` construite, URL rendue, sinon `inline` |
| `sort_du_perimetre` | **110/110** | hôtes tiers réellement appelés — **60 outils sur 110 en envoient** |
| `irreversible` | 95/110 | opérations d'écriture des nœuds maison, puis verbes HTTP sortants |
| `estimated_time` | 81/110 | **plafond** des `timeout`, jamais une durée observée |
| `requires` | 67/110 | jetons lus, `plugin_context.api_keys.*`, entrées validées |
| `description` | **50/110** | la phrase du pense-bête — **60 outils n'en ont aucune** |
| `limites_entree` | 40/110 | bornes littérales trouvées dans le code |
| `cout` | 34/110 | **l'unité et le fournisseur**, jamais un prix |
| `surfaces` | **0/110** | **volontairement vide** — 231 arbitrations appartiennent à Franck |

## Les quatre colonnes qu'aucune équipe n'avait listées

**`sort_du_perimetre` est la mieux renseignée des quatre, et la plus utile.** Elle est
entièrement mécanique : les hôtes appelés sont dans le code. **60 outils sur 110** envoient
des données hors du périmètre. Les plus fréquents : `api.openai.com` (23), `api.anthropic.com`
(16), `api.mistral.ai` (8), Google (12 hôtes distincts), et un cas à part — `quickchart.io`,
le seul où les données repartent **depuis le poste de l'utilisateur** (`azy.daily#653`).

**`irreversible`** distingue trois états : `oui` avec les opérations d'écriture nommées,
`non` avec sa raison, `à vérifier` quand la cible est une expression. Un POST vers un
service de **génération** (LLM, OCR, image) n'est **pas** compté comme irréversible : c'est
un coût, pas une écriture chez l'utilisateur. Ça ne dit rien de la confidentialité, que
porte `sort_du_perimetre`.

**`cout`** donne l'unité (`1000 jetons`, `page`, `appel`, `caractère`) et le fournisseur.
**Aucun prix** : n8n ne connaît aucun barème, et l'inventer est exactement l'erreur à ne
pas refaire. Le prix appartient à api.

**`limites_entree`** ne porte que des bornes **littérales** trouvées dans le code
(`max_files`, `max_tokens`, `pages_max`, formats cités). 70 outils n'en déclarent aucune —
ce qui ne veut pas dire qu'ils acceptent tout, mais que **rien dans le code ne les borne**.
C'est en soi un résultat.

## Trois pièges mesurés, et pourquoi ils comptent pour vous

**`estimated_time` est un PLAFOND.** C'est la somme des `timeout` des nœuds. `web-search`
plafonne à 243 s et répond peut-être en 2 s. La rétention d'exécutions est de 37 h et la
quasi-totalité de ces outils sont à zéro appel sur 41 jours : **il n'existe aucune
distribution de durées réelles à publier.** Le plafond borne le risque honnêtement ; le
présenter comme une durée observée serait faux.

**`result_kind` vient du SERVICE, pas des clés.** Première version : `pdf-ocr` et
`audio-transcription` ressortaient `image` et `audio` — l'inverse de ce qu'ils rendent —
parce que `image_base64` et `audio_base64` sont leurs **entrées**. Les clés ne distinguent
pas l'entrée de la sortie ; le point d'accès, lui, dit le sens de la transformation : un
OCR produit du texte depuis une image, une génération d'image fait l'inverse.

**Un nœud maison n'a pas d'URL.** `mcp-gmail` ressortait « aucun hôte tiers appelé » alors
qu'il parle à Google à chaque appel, et `irreversible` était vide pour un outil qui sait
envoyer et supprimer des courriels. Les six connecteurs Google, le nœud IMAP, Veo et
Gemini appellent depuis leur TypeScript ; `text-to-speech` appelle OpenAI par le nœud
**natif** `n8n-nodes-base.openAi`. Les trois chemins sont désormais lus. **Dire « non » là
où la réponse est « oui » est bien pire que de laisser vide.**

## Ce que ce fichier ne peut pas contenir

- **`surfaces`** — 231 arbitrations en attente. Le registre publie le champ ; il est rempli
  sur 8 outils sur 239. Le déduire d'un nom serait le décider en cachette.
- **`scopes` OAuth** — le jeton arrive **déjà émis** par chat.api, seul à connaître les
  scopes demandés au consentement. Les remplir au jugé tromperait sur ce que l'outil peut faire.
- **`perd`** (ce que l'extraction abandonne) — demande de comparer entrée et sortie sur un
  vrai document. À mesurer, pas à supposer.
- **`idempotent`** — demande de rejouer le même appel et de comparer.
- **`quota`**, **`droit_usage`** — relèvent des contrats fournisseurs.
- **`enonciation`**, **`differer_vers_historique`** — l'axe vocal est une décision de
  rédaction, pas une propriété du code.

## Et surtout : 60 outils sur 110 n'ont aucune description

C'est le chiffre à regarder avant les 42 autres colonnes. Le script **ne fabrique aucune
prose** : une description auto-générée donnerait l'illusion d'une documentation et serait
validée sans être lue. Front a posé le bon critère — *un outil dont la description ne
permet pas de décider quand l'utiliser ne devrait pas être offert.*

## Régénérer

```bash
cd /storage6/pi6/n8n-workflows
source .env.local && N8N_API_KEY="$N8N_API_KEY" python3 scripts/catalogue/generer_fiche_outils.py
```

La liste des outils de production est dans `outils-production.txt` (une ligne par outil).
Le script affiche le taux de remplissage par colonne : **ce qui est vide est ce qui reste
à décider ou à mesurer.**

## Les quatre colonnes ajoutées après le premier tour (demande de Franck)

Un nom d'hôte n'est pas une réponse. `www.googleapis.com` ne dit pas s'il s'agit de Drive,
de Gmail ou de Maps ; et un appel à **notre** Gotenberg n'est pas une sortie de périmètre,
mais c'est une dépendance que les équipes doivent connaître.

| colonne | ce qu'elle porte | rempli |
|---|---|---|
| `domaine` | le domaine produit, déduit du préfixe du chemin | **110/110** |
| `service_tiers` | le service tiers **nommé** (« Google Drive », « Anthropic (Claude) », « Mathpix (point d'accès UE) »…) | 60/110 |
| `service_heberge` | **nos** services (Gotenberg, torah.api, Qdrant, Redis, chat.api) | 35/110 |
| `appele_par` | « interne » si un autre workflow l'appelle | **1/110** |

### `service_tiers` — nommé, et jamais deviné

Table fermée construite sur les hôtes **réellement mesurés**. Un hôte qu'aucune règle ne
nomme ressort préfixé **`?`** : mieux vaut un nom d'hôte brut signalé qu'un nom de service
inventé. Aujourd'hui : **aucun `?` restant**.

Trois pièges corrigés en vérifiant les lignes nommées par Franck :

- **`generativelanguage.googleapis.com` contient `language.googleapis.com`.** Sans
  lookbehind, `gemini-image` ressortait « Google Cloud Natural Language » — un service
  qu'il n'appelle pas.
- **`www.googleapis.com` est la porte commune de Google**, jamais un service. C'est le
  **chemin** qui décide (`/upload/drive`, `/youtube/v3`, `/customsearch/v1`), et il est
  examiné avant l'hôte. On ne signale la porte commune que si aucun service Google n'a pu
  être nommé — là, c'est une vraie zone d'ombre.
- **`google-searcher` n'appelle pas Google**, il appelle **SerpAPI**, qui interroge Google
  pour nous. C'est SerpAPI qui reçoit la requête, donc c'est lui qui compte pour la
  confidentialité. Nommé « SerpAPI (relais de recherche Google) ».

### `service_heberge` — interne ne veut pas dire sans conséquence

`chat.api` (17 outils), un autre workflow n8n (8), Redis (4), Qdrant (4), torah.api (3),
**Gotenberg (1 — `torah-pdf`, le seul outil qui génère un PDF avec nos propres moyens)**.

### `appele_par` — un seul outil est réellement interne

Mesuré sur les 110 : **`document-job-status` seul** est appelé par un autre workflow
(`Document Translate Worker`). Les 109 autres sont des **points d'entrée** — y compris
`document-translate-worker`, dont le nom dit « worker » alors qu'aucun manager ne l'appelle
et qu'il répond lui-même `202` à l'appelant.

⚠️ **Conséquence à ne pas manquer** : si `document-job-status` est retiré du catalogue au
motif qu'il est « interne », **plus personne ne récupère le résultat d'un job asynchrone**.
Le relais MCP est générique et n'implémente aucun protocole de polling. Soit l'agent peut
l'appeler, soit MCP écrit ce code. C'est une décision, pas une déduction.

### `domaine` — « générique » plutôt que vide

11 outils sur 110 sont déclarés **« générique (aucun domaine produit) »**. Vide se lirait
« on a oublié » ; la bonne information est « il ne dépend d'aucun domaine ». La distinction
change l'arbitrage : un outil générique est exposable partout, un outil de domaine ne vaut
que là où le domaine existe.

⚠️ **`entity-*` n'est PAS propre aux recettes**, contrairement à ce que le nom suggère.
Mesuré dans le code : `validEntityTypes = ['recipe', 'document', 'course', 'quiz',
'flashcard']`, et pour `entity-social-actions` `['recipes', 'translations', 'trainings',
'articles', 'posts']`. Les marquer « recettes » ferait refuser des outils qui servent aussi
les cours et les quiz. Ils sont donc **transverses**.

`games-*` en revanche est bien **échecs / Lichess** (confirmé : `lichess`, `pgn`, `fen`).
