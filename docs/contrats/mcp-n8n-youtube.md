# Contrat MCP↔n8n — outils YouTube

Généré le 2026-11-10 depuis les `InputSchema` publiés (azy.daily#642 / #645).
Vérifié par `scripts/test/test_645_contrats_youtube.js` (52 contrôles).

## Ce qu'il faut savoir avant de brancher

**Les deux outils publiaient un schéma VIDE, donc ils étaient INAPPELABLES.**
`_build_from_schema` retire tout champ non déclaré. `youtube-searcher` perdait `query`,
son unique champ requis, et rendait « Missing required parameter: query » quelle que soit
la requête. Ce n'est pas qu'ils ne servaient à personne : personne ne POUVAIT les appeler.
Mesure : 0 exécution sur les deux chemins dans la fenêtre de rétention, et aucun appelant
MCP possible par construction.

**`youtube-extract` ajoutait « recette » à toute recherche.** Vestige de son ancien nom
(« Recipes - YouTube ») : `q = {{ query }} recette`. Un client cherchant « tutoriel python »
cherchait « tutoriel python recette ». Retiré — impossible de déclarer `query` honnêtement
autrement. Sa sticky annonçait aussi `POST /webhook/recipes-youtube`, un chemin qui
n'existe pas ; le vrai est `youtube-extract`, et c'est cette sticky que `Build Registry`
publie.

**`youtube-extract` retombait sur `$env.GOOGLE_API_KEY`.** Un client qui oublie sa clé
consommait le quota d'Azy, sans attribution et sans erreur. Retiré : la validation rend
désormais la 400 « google_api_key requis », qui était inatteignable. `MCP - Transcriber`
applique déjà la même règle à sa propre clé. En revanche `$env.N8N_WEBHOOK_URL` et
`$env.N8N_WEBHOOK_SECRET` restent : ce sont une URL de service et le secret HMAC avec
lequel n8n signe son propre rappel — de l'infrastructure d'Azy, qu'aucun appelant ne peut
fournir.

**`youtube-extract` est une chaîne LENTE et synchrone par défaut.** Transcrire puis
extraire dépasse couramment la minute (délais internes : 600 s et 300 s). Pour tout appel
conversationnel, fournir `callback_url` : la réponse est alors un 202 immédiat et le
résultat est POSTé à cette URL, signé par l'en-tête `X-N8N-Signature` (RFC-040).

**Le transcript est rendu même si l'extraction échoue** : `extraction` vaut `null`,
`extraction_erreur` porte le motif, et l'appel reste un succès (n8n-workflows#463). Une
extraction absente n'est donc pas une panne — c'est le cas normal sans consigne.

## Décision en attente de Franck — la clé YouTube partagée

`youtube-searcher` s'authentifie par la credential n8n `googleApi` : **une seule clé pour
tous les clients**. Le quota YouTube Data API est donc commun — un client peut épuiser
celui des autres — et aucun appel n'est attribuable à un utilisateur. C'est la même
entorse à BYOT que le `$env` retiré de `youtube-extract`, rangée dans un autre tiroir.

Nous ne l'avons pas corrigée, parce que la corriger rend `google_api_key` **requis pour
tout appelant** : c'est un changement de contrat client et de qui paie, pas un correctif
technique. `youtube-extract`, lui, est déjà BYOT. Les deux outils sont donc aujourd'hui
sur deux modèles différents, et c'est écrit dans leurs schémas plutôt que tu.

## Non déclarés, volontairement

Déclarer un champ inerte est le même mensonge qu'en omettre un requis, à un cran de
distance : le LLM croit pouvoir s'en servir.

| champ | pourquoi |
|---|---|
| `max_videos` | passé en `maxResults` à Google, mais `Extract Video Info` prend `items[0]` quelle que soit la valeur. Le déclarer promettrait de traiter N vidéos. |
| `execution_mode` (searcher) | seulement recopié dans `meta`. Aucun effet. |
| `transcription.startTime` / `endTime` | acceptés par `MCP - Transcriber`, mais `youtube-extract` ne les lui transmet pas. |

## Schémas publiés

## `youtube-searcher` — MCP - YouTube Searcher

`POST /webhook/youtube-searcher` · **requis** : `query` · 4 champs déclarés

| champ | type | rôle |
|---|---|---|
| `query` | string | termes de recherche, tels qu'on les taperait sur YouTube |
| `type` | string | nature des résultats ; `video` par défaut · `video`, `channel`, `playlist` |
| `max_results` | integer | nombre de résultats, 1 à 50 ; 10 par défaut |
| `order` | string | tri des résultats ; `relevance` par défaut · `relevance`, `date`, `rating`, `viewCount`, `title` |

## `youtube-extract` — YOUTUBE - Transcribe and Extract

`POST /webhook/youtube-extract` · **requis** : aucun champ inconditionnel · 16 champs déclarés

| champ | type | rôle |
|---|---|---|
| `video_url` | string | URL YouTube à traiter. `video_url` OU `query` est requis ; avec une URL, aucune recherche n'a lieu et `google_api_key` devient inutile |
| `query` | string | recherche YouTube quand on n'a pas d'URL ; la première vidéo trouvée est traitée. Exige `google_api_key` |
| `google_api_key` | string | clé YouTube Data API v3, REQUISE avec `query`. BYOT : aucun repli sur l'environnement |
| `transcription` | object | paramètres de transcription. La vidéo n'est jamais téléchargée : Gemini ingère l'URL YouTube nativement. |
| `transcription.provider` | string | `google` est le SEUL fournisseur capable d'ingérer une URL vidéo ; les autres exigeraient un téléchargement que cette chaîne ne fait pas · `google` |
| `transcription.model` | string | modèle de transcription ; `gemini-3.6-flash` par défaut. Reçu, jamais deviné (azy.daily#329) |
| `transcription.api_key` | string | clé du fournisseur de transcription. BYOT : aucun repli sur l'environnement. MCP peut la fournir depuis `plugin_context.api_keys.google` (azy.daily#381) |
| `transcription.content` | string | consigne de transcription ; à défaut, celle induite par `operation` |
| `transcription.operation` | string | nature du travail demandé sur la vidéo ; `transcribe` par défaut · `transcribe`, `identifySpeakers`, `extractOcr`, `analyzeScene`, `extractSlides` |
| `extraction` | object | exploitation du transcript par un LLM. FACULTATIVE : sans elle, le transcript brut est rendu. Un échec d'extraction ne fait pas échouer l'appel (n8n-workflows#463). |
| `extraction.content` | string | la consigne. Les marqueurs `{{transcript}}`, `{{title}}` et `{{url}}` y sont remplacés ; sans marqueur, le transcript est ajouté à la fin. C'est ce champ qui DÉCLENCHE l'extraction |
| `extraction.provider` | string | fournisseur du LLM d'extraction ; `anthropic` par défaut |
| `extraction.model` | string | modèle d'extraction ; `claude-sonnet-4-6` par défaut |
| `extraction.api_key` | string | clé du fournisseur d'extraction. REQUISE dès que `content` est fourni, sans quoi l'appel est refusé en 400 |
| `extraction.max_tokens` | integer | plafond de la réponse d'extraction ; 4096 par défaut |
| `content` | string | raccourci de `extraction.content` |
| `provider` | string | raccourci de `transcription.provider` |
| `model` | string | raccourci de `transcription.model` |
| `gemini_api_key` | string | raccourci de `transcription.api_key` |
| `anthropic_api_key` | string | raccourci de `extraction.api_key` |
| `openai_api_key` | string | raccourci de `extraction.api_key` |
| `language` | string | langue de travail, code court ; `fr` par défaut |
| `prefer_short` | boolean | restreindre la recherche aux vidéos courtes (< 4 min). Sans effet avec `video_url` |
| `callback_url` | string | URL à appeler quand c'est fini. Fournie, l'appel rend 202 immédiatement et le résultat est POSTé ici, signé par l'en-tête `X-N8N-Signature` (RFC-040) |
| `job_id` | string | identifiant de corrélation ; engendré si `callback_url` est fourni sans lui |
| `user_id` | string | identifiant d'appelant, recopié tel quel dans la réponse ; sans effet sur le traitement |
