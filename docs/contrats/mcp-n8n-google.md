# Contrat MCP↔n8n — services Google

Généré par `scripts/audit/matrice_contrat_mcp.py` le 2026-11-09 (azy.daily#642 / #645).

## Socle commun

- MCP appelle `POST {webhook_url}/{webhook_path}`, corps = params de son `param_builder`.
- **Jeton** : MCP émet `oauth_token`. n8n lit `oauth_token || access_token` sur les 5 serveurs, et `google_access_token || oauth_token` sur `google-drive-ocr` et `documents/save`. Aucun `$env`.
- **Aucun pull de jeton** : il n'existe aucun appel `GET /api/n8n/google/token` dans le parc. Seule exception de forme : `mcp-classroom` accepte aussi l'en-tête `X-Google-Access-Token` (nœud `Extract Token (RFC-089)`), en repli sur le corps. Une seule source de jeton, donc : le corps.
- **Routage** : `body.resource` + `body.operation`. Les deux doivent figurer à l'InputSchema.
- **Réponse** : succès → `error`/`error_code` ABSENTS. Échec → présents, code stable (`TOOL_OPERATION_UNKNOWN` 501, `GOOGLE_AUTH_REJECTED` 401, `TOOL_ROUTE_UNKNOWN` 400, `GOOGLE_NOT_FOUND` 404, `GOOGLE_RATE_LIMITED` 429, `GOOGLE_API_ERROR` 502). Nécessite le réimport de la PR #568.

## Matrices par service

## `email-imap` — MCP - Email IMAP
1 paire(s) saine(s), 0 morte(s), 0 indéterminée(s)

| resource | operation | params requis | params optionnels |
|---|---|---|---|
| `—` | `?` | `action`:string, `imap_host`:string, `imap_password`:string, `imap_user`:string, `uid`:string | `folder`:string, `imap_port`:integer, `search_criteria`:string |

## `mcp-calendar` — MCP - Google Calendar Server
6 paire(s) saine(s), 0 morte(s), 0 indéterminée(s)

| resource | operation | params requis | params optionnels |
|---|---|---|---|
| `event` | `create` | `end`:string, `start`:string, `summary`:string | `all_day`:boolean, `attendees`:array, `calendar_id`:string, `description`:string, `location`:string, `timezone`:string |
| `event` | `get` | `event_id`:string | `calendar_id`:string |
| `event` | `getAll` | `single_events`:boolean | `calendar_id`:string, `max_results`:integer, `order_by`:string, `query`:string, `time_max`:string, `time_min`:string |
| `event` | `update` | `event_id`:string | `all_day`:boolean, `attendees`:array, `calendar_id`:string, `description`:string, `end`:string, `location`:string, `start`:string, `summary`:string, `timezone`:string |
| `event` | `delete` | `event_id`:string | `calendar_id`:string |
| `calendar` | `getAll` | — | — |

## `mcp-classroom` — MCP - Google Classroom Server
0 paire(s) saine(s), 0 morte(s), 33 indéterminée(s)

| resource | operation | params requis | params optionnels |
|---|---|---|---|

**INDÉTERMINÉES** (source du nœud introuvable depuis le dépôt) : `course/create`, `course/get`, `course/getAll`, `course/update`, `course/delete`, `course/archive`, `courseWork/create`, `courseWork/get`, `courseWork/getAll`, `courseWork/update`, `courseWork/delete`, `studentSubmission/get`, `studentSubmission/getAll`, `studentSubmission/grade`, `studentSubmission/return`, `student/create`, `student/get`, `student/getAll`, `student/delete`, `teacher/create`, `teacher/get`, `teacher/getAll`, `teacher/delete`, `announcement/create`, `announcement/get`, `announcement/getAll`, `announcement/update`, `announcement/delete`, `topic/create`, `topic/get`, `topic/getAll`, `topic/update`, `topic/delete`

## `mcp-contacts` — MCP - Google Contacts Server
13 paire(s) saine(s), 0 morte(s), 0 indéterminée(s)

| resource | operation | params requis | params optionnels |
|---|---|---|---|
| `contact` | `create` | — | `email`:string, `email_type`:string, `family_name`:string, `given_name`:string, `job_title`:string, `notes`:string, `organization`:string, `phone`:string, `phone_type`:string |
| `contact` | `get` | `resource_name`:string | `person_fields`:array |
| `contact` | `getAll` | — | `page_size`:integer, `page_token`:string, `person_fields`:array |
| `contact` | `update` | `resource_name`:string | `email`:string, `email_type`:string, `family_name`:string, `given_name`:string, `job_title`:string, `notes`:string, `organization`:string, `phone`:string, `phone_type`:string |
| `contact` | `delete` | `resource_name`:string | — |
| `contact` | `search` | `query`:string | `page_size`:integer, `person_fields`:array |
| `contactGroup` | `create` | `group_name`:string | — |
| `contactGroup` | `get` | `group_resource_name`:string | — |
| `contactGroup` | `getAll` | — | `page_size`:integer |
| `contactGroup` | `update` | `group_name`:string, `group_resource_name`:string | — |
| `contactGroup` | `delete` | `group_resource_name`:string | — |
| `contactGroup` | `addMembers` | `group_resource_name`:string, `resource_names`:array | — |
| `contactGroup` | `removeMembers` | `group_resource_name`:string, `resource_names`:array | — |

## `mcp-drive` — MCP - Google Drive Server
12 paire(s) saine(s), 0 morte(s), 0 indéterminée(s)

| resource | operation | params requis | params optionnels |
|---|---|---|---|
| `file` | `list` | — | `folder_id`:string, `max_results`:integer, `query`:string |
| `file` | `get` | `file_id`:string | — |
| `file` | `download` | `file_id`:string | — |
| `file` | `upload` | `content`:string, `name`:string | `mime_type`:string, `parent_id`:string |
| `file` | `update` | `file_id`:string | `name`:string |
| `file` | `delete` | `file_id`:string | — |
| `file` | `copy` | `file_id`:string | `name`:string, `parent_id`:string |
| `file` | `move` | `file_id`:string, `parent_id`:string | — |
| `file` | `share` | `email`:string, `file_id`:string | `role`:string |
| `folder` | `create` | `name`:string | `parent_id`:string |
| `folder` | `list` | — | `folder_id`:string, `max_results`:integer |
| `folder` | `delete` | `folder_id`:string | — |

## `mcp-gmail` — MCP - Gmail Server (All-in-One)
16 paire(s) saine(s), 6 morte(s), 0 indéterminée(s)

| resource | operation | params requis | params optionnels |
|---|---|---|---|
| `message` | `get` | `message_id`:string | — |
| `message` | `delete` | `message_id`:string | — |
| `message` | `reply` | `message`:string, `message_id`:string | `bcc`:string, `cc`:string |
| `message` | `addLabels` | `label_ids`:array, `message_id`:string | — |
| `message` | `removeLabels` | `label_ids`:array, `message_id`:string | — |
| `label` | `getAll` | — | `return_all`:boolean |
| `label` | `get` | `label_id`:string | — |
| `label` | `create` | `label_name`:string | — |
| `label` | `delete` | `label_id`:string | — |
| `draft` | `create` | `message`:string, `subject`:string | `bcc`:string, `cc`:string |
| `draft` | `get` | `draft_id`:string | — |
| `draft` | `getAll` | — | `include_spam_trash`:boolean, `return_all`:boolean |
| `draft` | `delete` | `draft_id`:string | — |
| `thread` | `getAll` | — | `query`:string, `received_after`:string, `received_before`:string, `return_all`:boolean |
| `thread` | `get` | `thread_id`:string | — |
| `message` | `send` | `body`:string, `subject`:string, `to`:string | `attachments`:array, `bcc`:string, `cc`:string |

**MORTES — ne pas déclarer, ne pas appeler** : `message/getAll`, `message/markAsRead`, `message/markAsUnread`, `thread/reply`, `thread/addLabels`, `thread/removeLabels`
