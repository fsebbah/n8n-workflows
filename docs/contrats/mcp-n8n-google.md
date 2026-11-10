# Contrat MCP↔n8n — services Google

Généré par `scripts/audit/matrice_contrat_mcp.py` le 2026-11-10 (azy.daily#642 / #645 / #646).

## Socle commun

- MCP appelle `POST {webhook_url}/{webhook_path}`, corps = params de son `param_builder`.
- **Jeton** : MCP émet `oauth_token`. n8n lit `oauth_token || access_token` sur les 5 serveurs, et `google_access_token || oauth_token` sur `google-drive-ocr` et `documents/save`. Aucun `$env`, aucun pull.
- **Routage** : `body.resource` + `body.operation`, tous deux déclarés au schéma.
- **Réponse** : succès → `error`/`error_code` ABSENTS. Échec → présents, code stable (`TOOL_OPERATION_UNKNOWN` 501, `GOOGLE_AUTH_REJECTED` 401, `TOOL_ROUTE_UNKNOWN` 400, `GOOGLE_NOT_FOUND` 404, `GOOGLE_RATE_LIMITED` 429, `GOOGLE_API_ERROR` 502).
- **Les schémas ne déclarent QUE les champs honorés.** Un champ que le nœud ignore est volontairement absent : le déclarer ferait croire à un filtrage qui n'a pas lieu.

### Ce qui a changé le 2026-11-10

**Classroom n'était pas invérifiable — le résolveur de la matrice était faux.** Ses 33 paires
étaient classées « indéterminées, source du nœud hors dépôt ». La source EST dans le dépôt :
le type de nœud vaut `CUSTOM.classroomToolDynamic`, n8n nommant `CUSTOM` le paquet des nœuds
chargés depuis son répertoire custom, et le résolveur découpait sur le point. Corrigé :
**33 SAINES, 0 morte, 0 mal câblée** — le serveur le mieux raccordé des cinq. Son schéma,
écrit à la main, portait trois types que la matrice contredit (`state` boolean → string,
`assigned_grade` et `draft_grade` string → number) ; il est désormais généré.

**Classroom est le SEUL des cinq à accepter le jeton en en-tête.** Son nœud
`Extract Token (RFC-089)` lit, dans cet ordre : en-tête `x-google-access-token`, puis
`body.oauth_token`, puis `body.access_token`, et hisse le résultat à la racine de l'item.
Les quatre autres ne lisent que le corps. Si MCP veut converger sur l'en-tête, c'est une
modification des quatre autres, pas une correction — à décider, pas à supposer.

**Aucun champ du corps ne permet de choisir un compte Google.** `google_account_id` était
déclaré au schéma de Classroom : seul `Extract Token` le recopie, plus aucun nœud ne le lit.
De même, `provider_account_ids` n'est lu par AUCUN workflow du parc. Le compte visé est
déterminé par le jeton, et par lui seul. Fait à verser à #645/#646.

**Agenda : les options dormantes sont exposées.** `event/create` gagne 9 champs et
`event/update` 6 — récurrence, rappels, couleur, visibilité, Google Meet, statut. Le nœud
les lisait déjà ; le workflow ne les posait pas. Deux pièges à connaître côté MCP :
`recurrence` accepte quatre mots (`daily`/`weekly`/`monthly`/`yearly`) que le workflow
traduit en RRULE, ou une règle RFC 5545 brute via `recurrence_rule` ; et les rappels
s'expriment en MINUTES avant le début, le drapeau `use_default_reminders` basculant tout
seul dès qu'un rappel est posé. `event/update` ne lit NI la récurrence NI le Meet.

**Correction silencieuse levée sur `event/update`** : le nœud lit `status` avec le défaut
`confirmed` et le posait à chaque appel. Modifier le lieu d'un événement « provisoire » le
CONFIRMAIT. Le workflow pose désormais `''` (la requête est un PATCH : champ omis = champ
conservé) et expose `status` à qui veut le changer exprès.

### Question ouverte à MCP, et elle est la seule qui nous bloque

Les schémas déclarent `oauth_token` et `access_token`. Si `_build_from_schema` filtre
AVANT que `client.py` n'injecte le jeton, ces déclarations sont indispensables. Si
l'injection a lieu APRÈS le filtrage, elles sont inutiles — et surtout **néfastes** : un
champ déclaré est un champ que le LLM peut POSER. Un contenu hostile lu par l'agent (le
corps d'un courriel rendu par `message/get`, par exemple) pourrait lui faire appeler un
outil Google avec le jeton d'un tiers, et écrire les données de l'utilisateur dans le
compte de l'attaquant.

Nous ne retirons rien tant que ce n'est pas tranché : si l'injection précède le filtrage,
retirer la déclaration casserait les cinq serveurs d'un coup. **Une seule réponse suffit :
l'injection du jeton a-t-elle lieu avant ou après `_build_from_schema` ?** Si c'est après,
nous retirons les deux champs des cinq schémas — sans aucune modification chez vous.

### Le jeton n'est plus déclaré — question tranchée le 2026-11-10

MCP a tracé l'ordre exact : `param_builder.build()` filtre par schéma, **puis**
`client.py:104` fait `body["oauth_token"] = access_token` avec une valeur venue de Redis.
L'injection est donc **après** le filtrage et **hors** schéma : le jeton arrive qu'il soit
déclaré ou non.

Vérifié indépendamment de leur dire, parce qu'un contrat ne se fige pas sur une
description : le 2026-11-09 MCP a appelé `llm-call-messages` (`user-agent
python-httpx/0.28.1`, en-têtes `x-tenant-id`/`x-user-id`/`x-correlation-id`), et le champ
`reasoning` — **absent du registre** — est bien arrivé dans le corps. L'injection hors
schéma est réelle.

`oauth_token`, `access_token` et `google_access_token` sont donc **retirés des cinq
schémas**. Je les avais posés en écrivant « le déclarer permet de l'écraser » : c'était la
mauvaise lecture, pouvoir l'écraser est le danger. Un champ déclaré est un champ que le LLM
peut POSER, et un contenu hostile lu par l'agent — le corps d'un courriel rendu par
`message/get` — pourrait lui faire appeler un outil Google avec le jeton d'un **tiers**,
et écrire les données de l'utilisateur chez l'attaquant.

⚠️ **Les workflows continuent de lire `oauth_token || access_token` dans le corps, et il
ne faut pas y toucher** : c'est le contrat des appelants DIRECTS (chat.api), qui ne passent
pas par le filtre de MCP. Ne plus le déclarer retire au LLM la possibilité de le poser ;
cela n'empêche personne de l'envoyer.

### `resource` : déclaré seulement là où MCP ne le fournit pas

Leurs `STATIC_MAPPINGS` injectent `resource` pour gmail, calendar, contacts et drive —
**pas pour classroom**. Il n'est donc plus déclaré que sur `mcp-classroom`. Même raison que
pour le jeton : inutile ailleurs, et un champ de moins que le LLM peut poser.

### Le canal du jeton reste le CORPS

MCP n'émet que `body["oauth_token"]` — jamais d'en-tête Google, jamais plusieurs noms, par
posture de sécurité. Notre lecture tolérante `oauth_token || access_token` dans le corps
**est** le contrat. Classroom lit en plus l'en-tête `x-google-access-token` (RFC-089) pour
ses appelants directs ; aucune convergence n'est prévue, et les quatre autres serveurs ne
seront pas modifiés pour cela.

### ⚠️ La forme du registre : NE PAS la changer, et voici pourquoi

MCP a signalé que leur `_build_from_schema` attend `parameters.required` et
`parameters.optional` comme des **dicts clés-par-nom**, et prévenu qu'un `required` en
LISTE lèverait une `AttributeError`. Le registre publie, lui, du JSON-Schema :
`parameters: {type, required: [...], properties: {...}}` — mesuré sur les **237** outils,
`required` est une liste dans 237 cas sur 237, et la clé `optional` n'existe nulle part.

**La mesure contredit l'avertissement.** `llm-call-messages` publie exactement cette forme
— `required` en liste de 4 noms, champs sous `properties` — et l'appel MCP du 2026-11-09 a
**réussi**, avec 8 des 13 champs déclarés arrivés, dont les 4 requis. Reformer le registre
en dicts `required`/`optional` aurait donc cassé les **41** schémas déployés, dont le seul
dont on puisse prouver qu'il fonctionne.

Rien n'est changé côté registre. Si MCP durcit son filtre sur la forme attendue, c'est ce
chemin-là qui casse : la question leur est posée.

### Question ouverte, du même type que celle du jeton

Les contrats YouTube déclarent `google_api_key`, `gemini_api_key`, `anthropic_api_key` et
`openai_api_key`. Si MCP les injecte hors schéma comme le jeton OAuth — leur
`plugin_context.api_keys`, cité par `MCP - Transcriber` —, il faut les retirer pour la même
raison. Mais `youtube-extract` n'est pas dans leurs `STATIC_MAPPINGS`, et nous ne savons pas
si l'injection des clés de fournisseur couvre les outils qui n'y sont pas. **Ne pas
déclarer risquerait de rendre l'outil inappelable ; déclarer est une exposition mineure.**
Nous gardons donc la déclaration jusqu'à leur réponse — le choix qui ne casse rien.

## Matrices par service

## `email-imap` — MCP - Email IMAP
0 SAINE(S) · 0 MAL CÂBLÉE(S) · 0 MORTE(S) · 1 INDÉTERMINÉE(S)


**INDÉTERMINÉES** — ne pas déclarer au schéma :
- `—/?` — INDÉTERMINÉ

## `mcp-calendar` — MCP - Google Calendar Server
6 SAINE(S) · 0 MAL CÂBLÉE(S) · 0 MORTE(S) · 0 INDÉTERMINÉE(S)

| resource | operation | champs HONORÉS | listing | champs IGNORÉS |
|---|---|---|---|---|
| `event` | `create` | `add_google_meet`:boolean, `all_day`:boolean, `attendees`:array, `calendar_id`:string, `color_id`:string, `description`:string, `end`:string, `location`:string, `recurrence`:string, `recurrence_count`:integer, `recurrence_rule`:string, `reminder_email`:integer, `reminder_popup`:integer, `start`:string, `summary`:string, `timezone`:string, `use_default_reminders`:boolean, `visibility`:string | liste-seule | — |
| `event` | `get` | `calendar_id`:string, `event_id`:string | liste-seule | — |
| `event` | `getAll` | `calendar_id`:string, `max_results`:integer, `order_by`:string, `query`:string, `single_events`:boolean, `time_max`:string, `time_min`:string | **cherchable** | — |
| `event` | `update` | `all_day`:boolean, `attendees`:array, `calendar_id`:string, `color_id`:string, `description`:string, `end`:string, `event_id`:string, `location`:string, `reminder_email`:integer, `reminder_popup`:integer, `start`:string, `status`:string, `summary`:string, `timezone`:string, `use_default_reminders`:boolean, `visibility`:string | liste-seule | — |
| `event` | `delete` | `calendar_id`:string, `event_id`:string | liste-seule | — |
| `calendar` | `getAll` | — | liste-seule | — |

## `mcp-classroom` — MCP - Google Classroom Server
33 SAINE(S) · 0 MAL CÂBLÉE(S) · 0 MORTE(S) · 0 INDÉTERMINÉE(S)

| resource | operation | champs HONORÉS | listing | champs IGNORÉS |
|---|---|---|---|---|
| `course` | `create` | `description`:string, `name`:string, `owner_id`:string, `room`:string, `section`:string | liste-seule | — |
| `course` | `get` | `course_id`:string | liste-seule | — |
| `course` | `getAll` | `course_state`:string, `limit`:integer, `return_all`:boolean | liste-seule | — |
| `course` | `update` | `course_id`:string, `course_state`:string, `description`:string, `name`:string, `room`:string, `section`:string | liste-seule | — |
| `course` | `delete` | `course_id`:string | liste-seule | — |
| `course` | `archive` | `course_id`:string | liste-seule | — |
| `courseWork` | `create` | `course_id`:string, `description`:string, `due_date`:string, `due_time`:string, `max_points`:number, `state`:string, `title`:string, `topic_id`:string, `work_type`:string | liste-seule | — |
| `courseWork` | `get` | `course_id`:string, `coursework_id`:string | liste-seule | — |
| `courseWork` | `getAll` | `course_id`:string, `limit`:integer, `return_all`:boolean | liste-seule | — |
| `courseWork` | `update` | `course_id`:string, `coursework_id`:string, `description`:string, `due_date`:string, `due_time`:string, `max_points`:number, `state`:string, `title`:string, `topic_id`:string | liste-seule | — |
| `courseWork` | `delete` | `course_id`:string, `coursework_id`:string | liste-seule | — |
| `studentSubmission` | `get` | `course_id`:string, `coursework_id`:string, `submission_id`:string | liste-seule | — |
| `studentSubmission` | `getAll` | `course_id`:string, `coursework_id`:string, `limit`:integer, `return_all`:boolean | liste-seule | — |
| `studentSubmission` | `grade` | `assigned_grade`:number, `course_id`:string, `coursework_id`:string, `draft_grade`:number, `submission_id`:string | liste-seule | — |
| `studentSubmission` | `return` | `course_id`:string, `coursework_id`:string, `submission_id`:string | liste-seule | — |
| `student` | `create` | `course_id`:string, `user_id`:string | liste-seule | — |
| `student` | `get` | `course_id`:string, `user_id`:string | liste-seule | — |
| `student` | `getAll` | `course_id`:string, `limit`:integer, `return_all`:boolean | liste-seule | — |
| `student` | `delete` | `course_id`:string, `user_id`:string | liste-seule | — |
| `teacher` | `create` | `course_id`:string, `user_id`:string | liste-seule | — |
| `teacher` | `get` | `course_id`:string, `user_id`:string | liste-seule | — |
| `teacher` | `getAll` | `course_id`:string, `limit`:integer, `return_all`:boolean | liste-seule | — |
| `teacher` | `delete` | `course_id`:string, `user_id`:string | liste-seule | — |
| `announcement` | `create` | `course_id`:string, `scheduled_time`:string, `state`:string, `text`:string | liste-seule | — |
| `announcement` | `get` | `announcement_id`:string, `course_id`:string | liste-seule | — |
| `announcement` | `getAll` | `course_id`:string, `limit`:integer, `return_all`:boolean | liste-seule | — |
| `announcement` | `update` | `announcement_id`:string, `course_id`:string, `scheduled_time`:string, `state`:string, `text`:string | liste-seule | — |
| `announcement` | `delete` | `announcement_id`:string, `course_id`:string | liste-seule | — |
| `topic` | `create` | `course_id`:string, `name`:string | liste-seule | — |
| `topic` | `get` | `course_id`:string, `topic_id`:string | liste-seule | — |
| `topic` | `getAll` | `course_id`:string, `limit`:integer, `return_all`:boolean | liste-seule | — |
| `topic` | `update` | `course_id`:string, `name`:string, `topic_id`:string | liste-seule | — |
| `topic` | `delete` | `course_id`:string, `topic_id`:string | liste-seule | — |

## `mcp-contacts` — MCP - Google Contacts Server
13 SAINE(S) · 0 MAL CÂBLÉE(S) · 0 MORTE(S) · 0 INDÉTERMINÉE(S)

| resource | operation | champs HONORÉS | listing | champs IGNORÉS |
|---|---|---|---|---|
| `contact` | `create` | `email`:string, `email_type`:string, `family_name`:string, `given_name`:string, `job_title`:string, `notes`:string, `organization`:string, `phone`:string, `phone_type`:string | liste-seule | — |
| `contact` | `get` | `person_fields`:array, `resource_name`:string | liste-seule | — |
| `contact` | `getAll` | `page_size`:integer, `page_token`:string, `person_fields`:array | liste-seule | — |
| `contact` | `update` | `email`:string, `email_type`:string, `family_name`:string, `given_name`:string, `job_title`:string, `notes`:string, `organization`:string, `phone`:string, `phone_type`:string, `resource_name`:string | liste-seule | — |
| `contact` | `delete` | `resource_name`:string | liste-seule | — |
| `contact` | `search` | `page_size`:integer, `person_fields`:array, `query`:string | **cherchable** | — |
| `contactGroup` | `create` | `group_name`:string | liste-seule | — |
| `contactGroup` | `get` | `group_resource_name`:string | liste-seule | — |
| `contactGroup` | `getAll` | `page_size`:integer | liste-seule | — |
| `contactGroup` | `update` | `group_name`:string, `group_resource_name`:string | liste-seule | — |
| `contactGroup` | `delete` | `group_resource_name`:string | liste-seule | — |
| `contactGroup` | `addMembers` | `group_resource_name`:string, `resource_names`:array | liste-seule | — |
| `contactGroup` | `removeMembers` | `group_resource_name`:string, `resource_names`:array | liste-seule | — |

## `mcp-drive` — MCP - Google Drive Server
12 SAINE(S) · 0 MAL CÂBLÉE(S) · 0 MORTE(S) · 0 INDÉTERMINÉE(S)

| resource | operation | champs HONORÉS | listing | champs IGNORÉS |
|---|---|---|---|---|
| `file` | `list` | `folder_id`:string, `max_results`:integer, `query`:string | **cherchable** | — |
| `file` | `get` | `file_id`:string | liste-seule | — |
| `file` | `download` | `file_id`:string | liste-seule | — |
| `file` | `upload` | `content`:string, `mime_type`:string, `name`:string, `parent_id`:string | liste-seule | — |
| `file` | `update` | `file_id`:string, `name`:string | liste-seule | — |
| `file` | `delete` | `file_id`:string | liste-seule | — |
| `file` | `copy` | `file_id`:string, `name`:string, `parent_id`:string | liste-seule | — |
| `file` | `move` | `file_id`:string, `parent_id`:string | liste-seule | — |
| `file` | `share` | `email`:string, `file_id`:string, `role`:string | liste-seule | — |
| `folder` | `create` | `name`:string, `parent_id`:string | liste-seule | — |
| `folder` | `list` | `folder_id`:string, `max_results`:integer | liste-seule | — |
| `folder` | `delete` | `folder_id`:string | liste-seule | — |

## `mcp-gmail` — MCP - Gmail Server (All-in-One)
20 SAINE(S) · 0 MAL CÂBLÉE(S) · 2 MORTE(S) · 0 INDÉTERMINÉE(S)

| resource | operation | champs HONORÉS | listing | champs IGNORÉS |
|---|---|---|---|---|
| `message` | `get` | `message_id`:string | liste-seule | — |
| `message` | `getAll` | `include_full_message`:boolean, `max_results`:integer, `query`:string | **cherchable** | — |
| `message` | `delete` | `message_id`:string | liste-seule | — |
| `message` | `reply` | `body`:string, `message`:string, `message_id`:string, `to`:string | liste-seule | — |
| `message` | `markAsRead` | `message_id`:string | liste-seule | — |
| `message` | `markAsUnread` | `message_id`:string | liste-seule | — |
| `message` | `addLabels` | `label_ids`:array, `message_id`:string | liste-seule | — |
| `message` | `removeLabels` | `label_ids`:array, `message_id`:string | liste-seule | — |
| `label` | `getAll` | — | liste-seule | — |
| `label` | `get` | `label_id`:string | liste-seule | — |
| `label` | `create` | `label_name`:string | liste-seule | — |
| `label` | `delete` | `label_id`:string | liste-seule | — |
| `draft` | `create` | `attachments`:array, `bcc`:string, `body`:string, `cc`:string, `message`:string, `subject`:string, `to`:string | liste-seule | — |
| `draft` | `get` | `draft_id`:string | liste-seule | — |
| `draft` | `getAll` | `max_results`:integer | liste-seule | — |
| `draft` | `delete` | `draft_id`:string | liste-seule | — |
| `thread` | `getAll` | `max_results`:integer | liste-seule | — |
| `thread` | `get` | `thread_id`:string | liste-seule | — |
| `thread` | `addLabels` | `label_ids`:array, `thread_id`:string | liste-seule | — |
| `message` | `send` | `attachments`:array, `bcc`:string, `body`:string, `cc`:string, `subject`:string, `to`:string | liste-seule | — |

**MORTES** — ne pas déclarer au schéma :
- `thread/reply` — MORTE (opération absente du nœud)
- `thread/removeLabels` — MORTE (opération absente du nœud)

---
0 route(s) mal câblée(s) · 2 morte(s)
