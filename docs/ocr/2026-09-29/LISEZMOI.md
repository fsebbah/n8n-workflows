# OCR du 2026-09-29 — pourquoi `images: []`

Pièces jointes à l'issue azy.daily sur l'extraction d'un document Éduscol (5 pages),
où `page_details[].images` ressort vide alors que la page affichée porte des logos.

| Fichier | Contenu |
|---|---|
| `mistral-brut-page-reperes.json` | la réponse **brute** de Mistral (`mistral-ocr-4-0`) |
| `chat-api-page-details.json` | ce que reçoivent les clients via `POST /api/ocr/extract` |

Les deux sont **abrégés** : les longs markdown sont remplacés par un extrait, et les
13 blocs de la réponse brute par un résumé (nombre, types, un exemple). Rien d'autre
n'est modifié. Les URL signées sont tronquées.

## Ce que ces pièces établissent

1. **`images: []` vient de Mistral, pas de la chaîne.** La réponse brute porte
   `"images": []` **et** son markdown ne contient aucun `![img-…]`. Il n'y a donc rien
   à perdre en aval : le moteur n'a pas détecté de figure sur ces pages.

2. **`blocks: []` côté client est autre chose.** Mistral a rendu **13 blocs** positionnés
   sur cette page — `header`, `title`, `list`, `text`, `footer` — alors que l'appel ne
   demandait pas `include_blocks`. n8n ne les expose que si l'option est demandée : ils
   sont donc payés, reçus, puis écartés.

## Deux hypothèses testées et écartées

Sondes du 29/09 sur le webhook `pdf-ocr` en service, avec `docs/test/mckinsey-graph.pdf` :

| Hypothèse | Mesure | Verdict |
|---|---|---|
| « L'entrée est un PNG, donc pas de figure intégrée » | même page en PDF → 1 figure ; **rendue en PNG (`pdftoppm -r 200`) → 1 figure aussi** | ❌ écartée |
| « `include_images: false` a supprimé les images » | avec l'option absente → 1 figure ; avec `include_images: false` → **1 figure quand même** | ❌ écartée |

Reste l'explication la plus simple : **la détection de figures de Mistral est fonction du
contenu**. Une pleine page de graphique donne une figure ; une page de texte ornée de
logos et de bandeaux n'en donne aucune — vraisemblablement parce que ces éléments sont
vectoriels ou traités comme de la mise en page, pas comme des objets image.

## Le témoin qui trancherait

Rejouer le **PDF d'origine** (pas son rendu PNG) avec `include_blocks: true`, et regarder
deux choses : la présence de `![img-…]` dans le markdown, et l'existence de blocs de type
`figure`. Si les deux sont absents, Mistral ne voit pas ces logos comme des images, et il
n'y a rien à corriger dans la chaîne.
