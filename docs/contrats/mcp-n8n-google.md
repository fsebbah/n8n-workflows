# Contrat MCP↔n8n — services Google

Généré par `scripts/audit/matrice_contrat_mcp.py` le 2026-11-09 (azy.daily#642 / #645 / #646).

## Socle commun

- MCP appelle `POST {webhook_url}/{webhook_path}`, corps = params de son `param_builder`.
- **Jeton** : MCP émet `oauth_token`. n8n lit `oauth_token || access_token` sur les 5 serveurs, et `google_access_token || oauth_token` sur `google-drive-ocr` et `documents/save`. Aucun `$env`, aucun pull.
- **Routage** : `body.resource` + `body.operation`, tous deux déclarés au schéma.
- **Réponse** : succès → `error`/`error_code` ABSENTS. Échec → présents, code stable (`TOOL_OPERATION_UNKNOWN` 501, `GOOGLE_AUTH_REJECTED` 401, `TOOL_ROUTE_UNKNOWN` 400, `GOOGLE_NOT_FOUND` 404, `GOOGLE_RATE_LIMITED` 429, `GOOGLE_API_ERROR` 502).
- **Les schémas ne déclarent QUE les champs honorés.** Un champ que le nœud ignore est volontairement absent : le déclarer ferait croire à un filtrage qui n'a pas lieu.

## Matrices par service

## `email-imap` — MCP - Email IMAP
0 SAINE(S) · 0 MAL CÂBLÉE(S) · 0 MORTE(S) · 1 INDÉTERMINÉE(S)


**INDÉTERMINÉES** — ne pas déclarer au schéma :
- `—/?` — INDÉTERMINÉ

## `mcp-calendar` — MCP - Google Calendar Server
6 SAINE(S) · 0 MAL CÂBLÉE(S) · 0 MORTE(S) · 0 INDÉTERMINÉE(S)

| resource | operation | champs HONORÉS | listing | champs IGNORÉS |
|---|---|---|---|---|
| `event` | `create` | `all_day`:boolean, `attendees`:array, `calendar_id`:string, `description`:string, `end`:string, `location`:string, `start`:string, `summary`:string, `timezone`:string | liste-seule | — |
| `event` | `get` | `calendar_id`:string, `event_id`:string | liste-seule | — |
| `event` | `getAll` | `calendar_id`:string, `max_results`:integer, `order_by`:string, `query`:string, `single_events`:boolean, `time_max`:string, `time_min`:string | **cherchable** | — |
| `event` | `update` | `all_day`:boolean, `attendees`:array, `calendar_id`:string, `description`:string, `end`:string, `event_id`:string, `location`:string, `start`:string, `summary`:string, `timezone`:string | liste-seule | — |
| `event` | `delete` | `calendar_id`:string, `event_id`:string | liste-seule | — |
| `calendar` | `getAll` | — | liste-seule | — |

**Options que le nœud sait lire mais que le corps n'expose pas** (l'opération FONCTIONNE ; ce sont des fonctionnalités dormantes) :
- `event/create` — `addGoogleMeet`, `colorId`, `customRecurrence`, `recurrence`, `recurrenceCount`, `reminderEmail`, `reminderPopup`, `useDefaultReminders`, `visibility`
- `event/update` — `colorId`, `reminderEmail`, `reminderPopup`, `status`, `useDefaultReminders`, `visibility`

## `mcp-classroom` — MCP - Google Classroom Server
0 SAINE(S) · 0 MAL CÂBLÉE(S) · 0 MORTE(S) · 33 INDÉTERMINÉE(S)


**INDÉTERMINÉES** — ne pas déclarer au schéma :
- `course/create` — INDÉTERMINÉ (source du nœud hors dépôt)
- `course/get` — INDÉTERMINÉ (source du nœud hors dépôt)
- `course/getAll` — INDÉTERMINÉ (source du nœud hors dépôt)
- `course/update` — INDÉTERMINÉ (source du nœud hors dépôt)
- `course/delete` — INDÉTERMINÉ (source du nœud hors dépôt)
- `course/archive` — INDÉTERMINÉ (source du nœud hors dépôt)
- `courseWork/create` — INDÉTERMINÉ (source du nœud hors dépôt)
- `courseWork/get` — INDÉTERMINÉ (source du nœud hors dépôt)
- `courseWork/getAll` — INDÉTERMINÉ (source du nœud hors dépôt)
- `courseWork/update` — INDÉTERMINÉ (source du nœud hors dépôt)
- `courseWork/delete` — INDÉTERMINÉ (source du nœud hors dépôt)
- `studentSubmission/get` — INDÉTERMINÉ (source du nœud hors dépôt)
- `studentSubmission/getAll` — INDÉTERMINÉ (source du nœud hors dépôt)
- `studentSubmission/grade` — INDÉTERMINÉ (source du nœud hors dépôt)
- `studentSubmission/return` — INDÉTERMINÉ (source du nœud hors dépôt)
- `student/create` — INDÉTERMINÉ (source du nœud hors dépôt)
- `student/get` — INDÉTERMINÉ (source du nœud hors dépôt)
- `student/getAll` — INDÉTERMINÉ (source du nœud hors dépôt)
- `student/delete` — INDÉTERMINÉ (source du nœud hors dépôt)
- `teacher/create` — INDÉTERMINÉ (source du nœud hors dépôt)
- `teacher/get` — INDÉTERMINÉ (source du nœud hors dépôt)
- `teacher/getAll` — INDÉTERMINÉ (source du nœud hors dépôt)
- `teacher/delete` — INDÉTERMINÉ (source du nœud hors dépôt)
- `announcement/create` — INDÉTERMINÉ (source du nœud hors dépôt)
- `announcement/get` — INDÉTERMINÉ (source du nœud hors dépôt)
- `announcement/getAll` — INDÉTERMINÉ (source du nœud hors dépôt)
- `announcement/update` — INDÉTERMINÉ (source du nœud hors dépôt)
- `announcement/delete` — INDÉTERMINÉ (source du nœud hors dépôt)
- `topic/create` — INDÉTERMINÉ (source du nœud hors dépôt)
- `topic/get` — INDÉTERMINÉ (source du nœud hors dépôt)
- `topic/getAll` — INDÉTERMINÉ (source du nœud hors dépôt)
- `topic/update` — INDÉTERMINÉ (source du nœud hors dépôt)
- `topic/delete` — INDÉTERMINÉ (source du nœud hors dépôt)

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
