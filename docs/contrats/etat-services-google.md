# État des services Google dans n8n — avant bascule

Mesuré le 2026-11-09 sur `llm.local:5678` (seule instance n8n du parc : `host2`,
`prod001`, `webs` ne répondent pas sur 5678). Demandé par api pour `azy.daily#645`.

## Lecture rapide

| service | webhook | actif | schéma **en service** | schéma après PR #568 | paires saines | défauts |
|---|---|---|---|---|---|---|
| Gmail | `mcp-gmail` | oui | **VIDE** | déclaré | 16 | 6 routes mortes |
| Agenda | `mcp-calendar` | oui | **VIDE** | déclaré | 6 | `calendarList` non filtré |
| Drive | `mcp-drive` | oui | **VIDE** | déclaré | 12 | `file/list`, pas `getAll` |
| Contacts | `mcp-contacts` | oui | **VIDE** | déclaré | 13 | `resource` obligatoire |
| Classroom | `mcp-classroom` | oui | **VIDE** | déclaré | **0 certifiée** | nœud absent du dépôt |
| YouTube recherche | `youtube-searcher` | oui | **VIDE** | **VIDE** | n/a | credential PARTAGÉ |
| YouTube extraction | `youtube-extract` | oui | **VIDE** | **VIDE** | n/a | — |
| Drive OCR | `google-drive-ocr` | oui | 9 params | 9 params | n/a | — |
| Documents Save | `documents/save` | oui | **VIDE** | **VIDE** | n/a | — |

**Un schéma vide rend l'outil inappelable par MCP** : le `_build_from_schema` de MCP
retire tout champ non déclaré, donc `operation` — et tous les params — sont supprimés
avant d'atteindre n8n. Ce n'est pas « aucune exécution observée », c'est **aucune
exécution possible**.

## Dernière exécution réelle

**Aucune**, sur les 9 chemins, pour les deux horizons dont je dispose :

- fenêtre de rétention des exécutions n8n : depuis `2026-11-08T19:58:35Z`
  (6250 exécutions retenues) — zéro, hors mes essais de diagnostic ;
- relevé des exécutions cumulées (26 outils à trafic sur 237) — aucun des 9 n'y figure.

## Jeton OAuth : une seule source, trois noms

| qui | nom du champ |
|---|---|
| MCP émet | `oauth_token` |
| les 5 serveurs lisaient | `access_token` |
| `google-drive-ocr`, `documents/save` lisent | `google_access_token` |

Après PR #568 : lecture tolérante `oauth_token || access_token` sur les 5 serveurs,
`google_access_token || oauth_token` sur les deux autres. **Aucun `$env`**, aucun
pull : il n'existe aucun appel `GET /api/n8n/google/token` dans le parc. Seule
exception de forme, `mcp-classroom` accepte aussi l'en-tête `X-Google-Access-Token`
(nœud `Extract Token (RFC-089)`), en repli sur le corps.

## Par service — ce qui n'est pas dans le tableau

### Gmail — `mcp-gmail`
**6 routes mortes**, indépendantes du jeton : `message/getAll`, `message/markAsRead`,
`message/markAsUnread`, `thread/reply`, `thread/addLabels`, `thread/removeLabels`.
Le `Switch` les route, mais le nœud ne les implémente pas et lève
`Unknown <resource> operation: <op>` avant tout appel réseau (exécutions 1237725
à 1237730). **`message/getAll` est celle qui listerait une boîte entière : elle n'a
jamais rien rendu.** Pour lister une boîte : `thread/getAll` puis `thread/get`.

⚠️ **Piège de réimport** : 10 exemplaires de ce workflow existent, 9 inactifs, et le
premier rendu par l'API est inactif. Un réimport par nom visait donc un exemplaire
mort **et l'activait**, mettant deux workflows actifs sur le chemin. Corrigé dans
#568 (`find_workflow_by_name` vise l'actif). `MCP - Mathpix` est dans le même cas.

### Agenda — `mcp-calendar`
Ses 6 routes sont saines. **Le point de `#645`** : nous appelons
`GET /users/me/calendarList` **sans aucun paramètre** — ni `minAccessRole`, ni
`showHidden`, ni `showDeleted`. Google rend donc la liste entière, y compris les
entrées invisibles dans l'interface du propriétaire (`selected: false`,
`hidden: true`) et tous les rôles jusqu'à `freeBusyReader`. Un agenda peut être
légitimement dans la liste Google d'un utilisateur et invisible pour lui. Si vous
voulez un filtre, dites-nous lequel : c'est une ligne à ajouter.

### Drive — `mcp-drive`
12 paires saines. L'opération de listage s'appelle **`file/list`**, pas `file/getAll`.
`resource` doit être déclaré : le défaut statique de MCP vaut `file`, donc sans lui
les 3 routes `folder` sont inatteignables.

### Contacts — `mcp-contacts`
13 paires saines. `resource` **obligatoire** : le défaut MCP vaut `contact`, donc sans
lui les 7 routes `contactGroup` sont inatteignables.

### Classroom — `mcp-classroom`
**Je ne certifie rien.** Le workflow route 33 paires (`course`, `courseWork`,
`studentSubmission`, `student`, `teacher`, `announcement`, `topic`), mais son nœud
porte le type `CUSTOM.classroomToolDynamic` — ce paquet n'existe dans aucun dossier
de `custom-nodes/`, il n'est installé que dans le conteneur. Impossible de vérifier
d'ici quelles opérations il implémente.

Méthode pour certifier, en attente du feu vert de Franck : appeler les 33 routes avec
un jeton **volontairement faux**. Une route morte lève `Unknown … operation` sans
toucher Google ; une route saine échoue en `401`. L'essai est donc sans effet, y
compris sur les opérations qui écriraient.

### YouTube recherche — `youtube-searcher`
Schéma **vide**, et **non corrigé** par #568. Champs lus dans le corps : `query`,
`type`, `order`, `max_results`, `execution_mode`.

⚠️ **Il n'utilise pas BYOT** : il porte un credential n8n `googleApi`, donc **une clé
partagée pour tous les utilisateurs**. Acceptable pour une recherche YouTube (donnée
publique), mais à savoir dans un dossier d'isolation de données : ce chemin n'est pas
par utilisateur.

### YouTube extraction — `youtube-extract`
Schéma **vide**, et **non corrigé** par #568. Il lit ses champs dans `body.context.*`
**ou** `body.*`, sous plusieurs noms acceptés :
`video_url` / `videoUrl` / `url`, `query` / `q`, `google_api_key` / `youtube_api_key`,
`gemini_api_key`, `openai_api_key`, `anthropic_api_key`, `provider`, `model`,
`language`, `operation`, `content` / `prompt`, `callback_url`, `job_id`, `user_id`.
Entièrement BYOT. Un `video_url` **ou** un `query` est requis.

## Ce qui reste à décider

1. **`youtube-searcher` et `youtube-extract`** : faut-il leur écrire un InputSchema ?
   Sans lui, ils sont inappelables par MCP, exactement comme les 5 autres l'étaient.
   Je ne l'ai pas fait : ils n'étaient pas dans le périmètre tranché.
2. **`classroom`** : feu vert pour les 33 appels à jeton faux.
3. **`email-imap`** : non réparé, et ce n'est pas un service Google. Son schéma
   exigerait de déclarer `imap_password` comme champ passable par un agent. MCP
   soutient ce refus.
4. **`mcp-google-maps`** : ni `$env`, ni credential n8n, ni clé lue dans le corps.
   Je n'ai pas localisé sa source de clé. À creuser si ce service entre dans la bascule.
