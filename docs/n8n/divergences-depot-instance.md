# Divergences dépôt ↔ instance

Généré par `scripts/audit/divergences_depot_instance.py` — instance `http://llm.local:5678/api/v1`.

⚠️ L'instance n8n de `host2.local` n'existe plus (port 5678 fermé, décision du 2026-07-09 confirmée le 2026-11-10). Les instances ont partagé la base `prod001.local:5435/n8n` : un workflow modifié depuis l'interface de host2 a donc été écrit dans la base que llm lit. **Rien n'est à refaire de zéro** — le travail divergent existe d'un côté ou de l'autre.

- instance : **2372** workflows, 1328 noms distincts
- dépôt : **267** fichiers comparés
  - identiques au déployé : **255**
  - divergents : **9**
  - absents de l'instance : **3**
  - noms en doublon sur l'instance : **2**

## Divergents

| workflow | nœuds dépôt / instance | dernier commit | updatedAt | à faire |
|---|---|---|---|---|
| `Claude - Call Stream With Skills` | 11 / 11 | 2026-11-10 | 2026-05-15 | dépôt EN AVANCE → à réimporter |
| `DISCORD - Get Credits` | 10 / 10 | 2026-11-10 | 2026-08-16 | dépôt EN AVANCE → à réimporter |
| `MCP - LLM Summarizer` | 14 / 14 | 2026-11-10 | 2026-03-24 | dépôt EN AVANCE → à réimporter |
| `MCP - LLM URL Extractor` | 17 / 17 | 2026-11-10 | 2026-03-29 | dépôt EN AVANCE → à réimporter |
| `MCP - Summarizer` | 10 / 10 | 2026-11-10 | 2026-03-24 | dépôt EN AVANCE → à réimporter |
| `Recipes - Generate` | 11 / 11 | 2026-11-10 | 2026-02-02 | dépôt EN AVANCE → à réimporter |
| `Scriptorium QC Page Review` | 22 / 22 | 2026-11-10 | 2026-05-05 | dépôt EN AVANCE → à réimporter |
| `Stripe - Subscription Renewal` | 15 / 15 | 2026-11-10 | 2026-08-16 | dépôt EN AVANCE → à réimporter |
| `Stripe - Subscription Success` | 11 / 11 | 2026-11-10 | 2026-08-16 | dépôt EN AVANCE → à réimporter |

### Constats d'inspection

Ce que le tableau ne peut pas déduire : si réimporter est SÛR.

- **`Stripe - Subscription Renewal`** — ⛔ **NE PAS réimporter en l'état.** Le fichier du dépôt pose `"{{ $env.API_URL }}/api/subscribers/..."` **sans le préfixe `=`** sur `Get Subscriber` et `Add Credits`. Sans `=`, n8n traite la valeur comme une CHAÎNE LITTÉRALE : l'URL appelée serait littéralement `{{ $env.API_URL }}/...` et le crédit de renouvellement d'abonnement échouerait. L'instance, elle, a bien `=`. C'est le dépôt qui est cassé — exporter depuis llm, pas réimporter.
- **`DISCORD - Get Credits`** — Cosmétique, vérifié : des espaces à l'intérieur des `{{ }}`. Aucun effet.
- **`Stripe - Subscription Success`** — Cosmétique, vérifié : un espace en tête de `jsonBody`. Aucun effet.

⚠️ Remarques décrivant des divergences qui n'existent plus (réimportées depuis ?) : `MCP - Mathpix`, `Torah Translation Orchestrator`.

## Présents au dépôt, absents de l'instance

| workflow | dernier commit |
|---|---|
| `BETA - Confirmation` | 2026-09-28 |
| `BETA - Inscription` | 2026-09-28 |
| `BETA - Nettoyage` | 2026-09-28 |

## Noms en doublon sur l'instance

⚠️ `find_workflow_by_name` ne retient que la copie ACTIVE et refuse de deviner s'il y en a plusieurs — c'est ce qui évite qu'un réimport mette à jour une copie inactive puis l'active.

| workflow | copies | actives |
|---|---|---|
| `MCP - Gmail Server (All-in-One)` | 10 | 1 |
| `MCP - Mathpix` | 2 | 1 |
