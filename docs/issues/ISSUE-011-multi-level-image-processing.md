# ISSUE-011: Multi-level Processing Pipeline (azy.mcp)

**Date**: 2026-03-23
**Status**: Open - POC en cours
**Component**: azy.mcp (composant)
**Priority**: High

---

## Problème général

Quand un utilisateur envoie une demande avec un document/image, le système doit pouvoir :
1. **Analyser** le type de contenu (texte structuré, photo, document PDF, etc.)
2. **Décider** quelle(s) action(s) effectuer
3. **Chaîner** plusieurs étapes si nécessaire

Actuellement, le LLM choisit UN tool et l'exécute. Il n'y a pas de mécanisme pour :
- Enchaîner plusieurs tools en séquence
- Faire un fallback intelligent si le premier tool échoue
- Combiner les résultats de plusieurs tools

## Cas d'usage concrets

### Cas 1 : Photo de plat (pas de texte)
```
User: [photo d'un gâteau] "quelle est la recette ?"

Pipeline actuel:
1. extract_recipe → OCR échoue (pas de texte) → FIN avec erreur

Pipeline souhaité:
1. extract_recipe → OCR échoue (pas de texte)
2. identify_dish → "gâteau au chocolat"
3. search_recipe("gâteau au chocolat") → recette trouvée → SUCCESS
```

### Cas 2 : Document PDF multi-pages
```
User: [PDF de 10 pages] "extrais les recettes de ce livre"

Pipeline actuel:
1. extract_recipe → traite page 1 uniquement → FIN

Pipeline souhaité:
1. analyze_document → "PDF, 10 pages, 5 recettes détectées"
2. Pour chaque recette: extract_recipe → résultat partiel
3. combine_results → 5 recettes structurées → SUCCESS
```

### Cas 3 : Requête ambiguë avec image
```
User: [photo de recette manuscrite] "les beignets mille fruits"

Pipeline actuel:
1. LLM voit "beignets mille fruits" → search_recipe → résultat web (IGNORE l'image)

Pipeline souhaité:
1. Détecter image jointe → priorité extraction
2. extract_recipe → recette extraite
3. OU si user veut comparer: extract + search → comparaison
```

## Architecture proposée

### Option A : Tool Chaining dans azy.mcp

```python
class ConversationManager:
    async def process_with_pipeline(self, message, context):
        # Le LLM retourne un plan d'actions
        plan = await self._create_execution_plan(message, context)

        # Exécution séquentielle avec contexte partagé
        results = []
        for step in plan.steps:
            result = await self._execute_step(step, context, results)
            if result.is_terminal:
                break
            results.append(result)

        return self._combine_results(results)
```

### Option B : Meta-tool "orchestrator"

```yaml
tools:
  - name: orchestrator.analyze_and_process
    description: "Analyse le contenu et détermine le meilleur pipeline"
    steps:
      - analyze_content_type
      - select_appropriate_tools
      - execute_pipeline
      - combine_results
```

### Option C : Fallback chains dans tool definitions

```python
RECIPE_TOOLS = [
    {
        "name": "recipes.extract_recipe",
        "fallback_chain": [
            "vision.identify_dish",
            "mcp-recipes.search"
        ],
        "fallback_condition": "no_structured_content"
    }
]
```

---

## Analyse équipe n8n (2026-03-23)

### Webhooks existants utilisables

| Webhook | Rôle dans ISSUE-011 | Statut |
|---------|---------------------|--------|
| `MCP-PDF-OCR` | Extraction texte (multi-provider: mistral, google, mathpix) | ✅ Prêt |
| `MCP-Image-OCR` | OCR image simple | ✅ Prêt |
| `MCP-Script-Detector` | Pré-analyse contenu (détecte alphabet) | ✅ Prêt |
| `MCP-Gemini-Image` | Génération d'images (pas analyse) | ❌ Pas adapté |
| `LLM-Request-Validator` | Valide requête + détecte fichiers joints | ✅ Prêt |
| `MCP-LLM-Intention` | Choix d'action | ⚠️ Mono-action |

### Challenges identifiés

1. **Pas de "Content Analyzer" unifié** - `MCP-Script-Detector` détecte l'alphabet, pas le TYPE de contenu
2. **Pas de vision "identify dish"** - Manque un tool pour identifier le contenu d'une photo
3. **Orchestration mono-étape** - `MCP-LLM-Intention` retourne UNE action, pas un plan
4. **Pas de combinaison de résultats** - Cas 2 (PDF multi-pages) non couvert

### Solutions proposées par l'équipe n8n

| Solution | Description | Avantage | Inconvénient |
|----------|-------------|----------|--------------|
| **A. MCP-Content-Analyzer** | Nouveau webhook d'analyse | Un seul appel Vision | Nouveau webhook |
| **B. Enrichir MCP-LLM-Intention** | Retourner un plan multi-étapes | Pas de nouveau webhook | Complexité prompt |
| **C. MCP-Pipeline-Executor** | Exécuter une séquence de tools | Logique dans n8n | Workflow complexe |
| **D. Fallback chains** | Config dans tools definitions | Déclaratif | Logique dans client |

### Recommandation : Solution hybride (1 appel LLM)

Au lieu de 2 appels séquentiels (Content-Analyzer → LLM-Intention), **fusionner en 1 appel** :

```
Image + Requête → MCP-Content-Analyzer (Vision LLM)
                        │
                        ▼
                  {
                    "content_type": "food_photo",
                    "has_text": false,
                    "detected_items": ["chocolate cake"],
                    "recommended_pipeline": [
                      { "tool": "vision.identify_dish", "reason": "no text detected" },
                      { "tool": "recipes.search", "input_from": "step_1.result" }
                    ],
                    "confidence": 0.92
                  }
```

**Avantage** : 1 appel LLM au lieu de 2, latence réduite.

---

## POC : MCP-Content-Analyzer

### Objectif
Tester si un seul appel Vision LLM peut :
1. Analyser le type de contenu
2. Proposer un pipeline d'exécution adapté

### Webhook de test
```
POST /webhook/content-analyzer

Input:
{
  "image_url": "https://...",        // ou image_data (base64)
  "user_request": "quelle est la recette ?",
  "domain": "recipes",               // contexte métier
  "available_tools": [               // tools disponibles
    "ocr.extract_text",
    "vision.identify_dish",
    "recipes.search",
    "recipes.extract_recipe"
  ]
}

Output:
{
  "success": true,
  "analysis": {
    "content_type": "food_photo" | "handwritten_recipe" | "printed_recipe" | "cookbook_pdf" | "unknown",
    "has_text": boolean,
    "text_type": "handwritten" | "printed" | "none",
    "detected_items": ["chocolate cake", "frosting"],
    "language": "fr" | "en" | null
  },
  "pipeline": [
    { "step": 1, "tool": "vision.identify_dish", "reason": "Photo sans texte, identifier le plat" },
    { "step": 2, "tool": "recipes.search", "input": "$step_1.dish_name", "reason": "Chercher la recette" }
  ],
  "confidence": 0.92,
  "meta": {
    "model": "gpt-4o",
    "processing_time_ms": 1234
  }
}
```

### Critères de succès du POC
- [ ] Cas 1 (photo gâteau) : retourne `["identify_dish", "search"]`
- [ ] Cas 2 (PDF recette) : retourne `["ocr.extract_text", "extract_recipe"]`
- [ ] Cas 3 (photo manuscrite) : retourne `["ocr.extract_text"]` avec `text_type: "handwritten"`
- [ ] Latence < 3s pour une image standard

---

## Review équipe azy.mcp (2026-03-23)

### Points positifs de la proposition n8n

| Aspect | Commentaire |
|--------|-------------|
| Inventaire webhooks | ✅ Clarté sur ce qui existe vs ce qui manque |
| Solution 1 appel LLM | ✅ Évite la latence de 2 appels séquentiels |
| Spécification POC | ✅ Input/Output bien définis |
| Notation `$step_1.result` | ✅ Proche du `$ref` recommandé |

### Questions à clarifier

#### Q1: Qui EXÉCUTE le pipeline ?

Le POC `MCP-Content-Analyzer` retourne un **plan**, mais qui l'exécute ?

```
MCP-Content-Analyzer → { pipeline: [...] }
                              │
                              ▼
                           ???
```

| Option | Exécuteur | Avantage | Inconvénient |
|--------|-----------|----------|--------------|
| A | **azy.mcp** | Contexte conversation, Langfuse déjà en place | Logique dans le composant |
| B | **n8n** (MCP-Pipeline-Executor) | Logique centralisée n8n | Nouveau webhook, latence |
| C | **chatbot-core** | Proche du client | Couplage fort, pas multi-plateforme |

**Recommandation : Option A (azy.mcp)** car :
- A déjà le contexte de conversation
- Gère déjà les appels aux tools MCP
- `trace_callback` Langfuse est en place (RFC-046)
- Multi-plateforme (Discord, API, web)

---

#### Q2: Qui fournit `available_tools` ?

Le POC input contient :
```json
"available_tools": ["ocr.extract_text", "vision.identify_dish", ...]
```

Qui construit cette liste ?

| Option | Source | Avantage | Inconvénient |
|--------|--------|----------|--------------|
| A | Plugin déclare | Déclaratif, extensible | Chaque plugin doit déclarer |
| B | azy.mcp construit | Centralisé | Logique de filtrage complexe |
| C | Analyzer connaît tout | Simple | Couplage fort, maintenance |

**Recommandation : Option A (Plugin déclare)**

Chaque plugin déclare ses tools analysables dans sa config :
```python
# Dans plugin-recipes/config.py
ANALYZABLE_TOOLS = {
    "domain": "recipes",
    "tools": ["recipes.extract_recipe", "recipes.search"],
    "vision_tools": ["vision.identify_dish"]
}
```

---

#### Q3: Gestion des erreurs dans le pipeline

Le POC définit le happy path. Que se passe-t-il si :
- `identify_dish` ne reconnaît rien (`confidence < 0.5`) ?
- Le tool du step 1 timeout ?
- Step 2 échoue mais step 1 a réussi ?

**Recommandation : Ajouter `on_fail` dans le pipeline output**

```json
{
  "pipeline": [
    {
      "step": 1,
      "tool": "vision.identify_dish",
      "on_fail": "abort"  // abort | skip | fallback
    },
    {
      "step": 2,
      "tool": "recipes.search",
      "input": "$step_1.dish_name",
      "on_fail": "skip"
    }
  ]
}
```

**Stratégie par défaut : Fail-fast avec résultats partiels**

```python
class PipelineResult:
    success: bool      # True si au moins 1 step réussi
    partial: bool      # True si certains steps ont échoué
    results: list[StepResult]
    errors: list[StepError]
    warnings: list[str]
```

---

#### Q4: Format des conditions (enum vs string libre)

Le pipeline peut avoir des conditions : `"condition": "if_step_1_fails"`

**Recommandation : Enum fini** (pas de string libre)

```python
class StepCondition(Enum):
    ALWAYS = "always"
    IF_PREVIOUS_FAILS = "if_previous_fails"
    IF_PREVIOUS_SUCCEEDS = "if_previous_succeeds"
    IF_NO_TEXT_DETECTED = "if_no_text_detected"
    IF_CONFIDENCE_BELOW = "if_confidence_below"  # + threshold param
```

**Justification** : String libre = le LLM peut inventer des conditions non-gérées. Enum = validation stricte, comportement prévisible.

---

#### Q5: Cas multi-pages (Cas 2) - Scope

Le Cas 2 (PDF multi-pages) nécessite du **parallel processing**, pas du chaining séquentiel :

```
PDF 10 pages → split → [page1, page2, ...page10]
                           │
                           ▼
              asyncio.gather(*[extract(p) for p in pages])
                           │
                           ▼
                    combine_results()
```

**Recommandation : Issue séparée (ISSUE-012)**

Ce n'est pas du pipeline chaining mais du map-reduce. Complexité différente.

---

### Décisions & Recommandations

| # | Question | Recommandation | Responsable |
|---|----------|----------------|-------------|
| Q1 | Qui exécute le pipeline ? | **azy.mcp** | équipe azy.mcp |
| Q2 | Qui fournit `available_tools` ? | **Plugin déclare** | équipe plugins |
| Q3 | Gestion erreurs | **on_fail enum + PipelineResult** | équipe azy.mcp |
| Q4 | Format conditions | **Enum fini (StepCondition)** | équipe azy.mcp |
| Q5 | Cas multi-pages | **Issue séparée (ISSUE-012)** | à créer |

---

### Proposition d'implémentation azy.mcp

```python
# src/mcp_server/pipelines/executor.py

from enum import Enum
from dataclasses import dataclass

class OnFail(Enum):
    ABORT = "abort"
    SKIP = "skip"
    FALLBACK = "fallback"

class StepCondition(Enum):
    ALWAYS = "always"
    IF_PREVIOUS_FAILS = "if_previous_fails"
    IF_PREVIOUS_SUCCEEDS = "if_previous_succeeds"

@dataclass
class PipelineStep:
    step: int
    tool: str
    input_ref: str | None = None  # "$step_1.dish_name"
    on_fail: OnFail = OnFail.ABORT
    condition: StepCondition = StepCondition.ALWAYS

@dataclass
class PipelineResult:
    success: bool
    partial: bool
    results: list[dict]
    errors: list[dict]

class PipelineExecutor:
    """Exécute un pipeline retourné par MCP-Content-Analyzer."""

    def __init__(self, tool_registry, trace_callback=None):
        self.tool_registry = tool_registry
        self.trace_callback = trace_callback

    async def execute(self, pipeline: list[PipelineStep], context: dict) -> PipelineResult:
        results = []
        errors = []
        step_outputs = {}  # Pour $ref resolution

        for step in pipeline:
            # Check condition
            if not self._should_execute(step, results):
                continue

            # Resolve input references
            params = self._resolve_refs(step.input_ref, step_outputs)

            # Execute with tracing
            if self.trace_callback:
                self.trace_callback.start_span(f"step_{step.step}_{step.tool}")

            try:
                result = await self.tool_registry.call(step.tool, params)
                step_outputs[f"step_{step.step}"] = result
                results.append({"step": step.step, "tool": step.tool, "result": result})
            except Exception as e:
                if step.on_fail == OnFail.ABORT:
                    errors.append({"step": step.step, "error": str(e)})
                    break
                elif step.on_fail == OnFail.SKIP:
                    errors.append({"step": step.step, "error": str(e), "skipped": True})
                    continue
            finally:
                if self.trace_callback:
                    self.trace_callback.end_span()

        return PipelineResult(
            success=len(results) > 0,
            partial=len(errors) > 0 and len(results) > 0,
            results=results,
            errors=errors
        )
```

---

## Réponse équipe n8n (2026-03-23)

### Accord sur les décisions Q1-Q5

| Question | Recommandation azy.mcp | Avis n8n |
|----------|------------------------|----------|
| **Q1** Qui exécute le pipeline ? | azy.mcp | ✅ D'accord - contexte conversation + Langfuse déjà en place |
| **Q2** Qui fournit `available_tools` ? | Plugin déclare | ✅ D'accord - extensible, chaque plugin connaît ses capacités |
| **Q3** Gestion erreurs | on_fail enum | ✅ D'accord - `abort/skip/fallback` couvre les cas |
| **Q4** Format conditions | Enum fini | ✅ D'accord - évite les conditions inventées par le LLM |
| **Q5** PDF multi-pages | Issue séparée | ✅ D'accord - map-reduce ≠ chaining séquentiel |

### Impact sur le POC n8n

La décision Q1 **simplifie le scope du POC** :

```
Avant (pensé) : MCP-Content-Analyzer → Plan → Execute → Result
Après (décidé) : MCP-Content-Analyzer → Plan (seulement)
                                          ↓
                               azy.mcp PipelineExecutor
```

**Le webhook n8n retourne uniquement le plan** - azy.mcp l'exécute.

### Points de vigilance technique

1. **Notation `$step_1.result`**
   - azy.mcp devra implémenter `_resolve_refs()` pour parser ces références
   - La notation est proche de `$ref` JSON mais customisée
   - Suggestion : documenter la grammaire exacte (regex pattern)

2. **Tool registry unifiée**
   - `self.tool_registry.call(step.tool, params)` suppose une registry unifiée
   - Les tools MCP (n8n webhooks) et tools locaux doivent cohabiter
   - Question : comment distinguer `recipes.search` (local) de `mcp.pdf_ocr` (webhook) ?

3. **Latence cumulée**
   - Pipeline de 3 steps = 3 appels séquentiels
   - Si chaque tool est un webhook n8n → latence réseau × 3
   - Recommandation : monitorer via Langfuse spans

4. **Timeout global**
   - Non mentionné dans `PipelineExecutor`
   - Un pipeline de 5 steps avec timeout 30s chacun = 2min30 max
   - Suggestion : ajouter `max_pipeline_duration` dans le contexte

### Ajustement du POC n8n

Le POC `MCP-Content-Analyzer` doit respecter le format `on_fail` :

```json
{
  "success": true,
  "analysis": { ... },
  "pipeline": [
    {
      "step": 1,
      "tool": "vision.identify_dish",
      "on_fail": "abort",
      "reason": "Photo sans texte, identifier le plat"
    },
    {
      "step": 2,
      "tool": "recipes.search",
      "input": "$step_1.dish_name",
      "on_fail": "skip",
      "reason": "Chercher la recette correspondante"
    }
  ],
  "confidence": 0.92
}
```

### Prêt à créer le POC

L'équipe n8n est prête à créer le webhook `MCP-Content-Analyzer` sur ce périmètre restreint (analyse + plan, sans exécution).

---

## Impact

- **azy.mcp** : Ajouter `PipelineExecutor` pour exécuter les plans
- **plugins** : Déclarer `ANALYZABLE_TOOLS` dans leur config
- **n8n** : Créer `MCP-Content-Analyzer` (POC) - retourne le plan uniquement
- **LLM prompt** : Pas de changement (le plan vient de MCP-Content-Analyzer)

## Questions ouvertes (plugin-recipes)

### Observabilité Langfuse : Propagation des traces

**Préoccupation** : Si azy.mcp exécute le `PipelineExecutor`, les plugins auront-ils accès aux traces détaillées ?

```
Trace attendue (vue plugin) :
├── Span: "recipes-conversation" (plugin-recipes)
│   ├── Span: "content_analysis" (appel MCP-Content-Analyzer)
│   └── Span: "pipeline_execution" (PipelineExecutor dans azy.mcp)
│       ├── Span: "step_1_identify_dish" ← VISIBLE ?
│       ├── Span: "step_2_search_recipe" ← VISIBLE ?
│       └── Span: "combine_results"      ← VISIBLE ?
```

**Questions pour l'équipe azy.mcp** :

| # | Question | Réponse attendue |
|---|----------|------------------|
| L1 | Le `trace_callback` est-il passé de plugin → azy.mcp ? | Oui / Non / À implémenter |
| L2 | Les spans du pipeline sont-ils rattachés au `root_span` du plugin ? | Oui / Non |
| L3 | Le plugin peut-il accéder aux `step_outputs` intermédiaires ? | Via callback / Via result |
| L4 | Y a-t-il un `trace_id` dans le contexte pour corrélation ? | Oui / Non |

---

### Décision équipe n8n : Option C (Metadata dans response)

**Problème** : Comment tracer les raisonnements dans les webhooks n8n ?

| Option | Description | Avantage | Inconvénient |
|--------|-------------|----------|--------------|
| A. Pass trace context | azy.mcp envoie trace_id + parent_span_id | Traces liées | Webhook doit appeler Langfuse API |
| B. Langfuse node n8n | Node custom n8n pour Langfuse | Intégré n8n | Développement node |
| **C. Metadata response** | Webhook retourne raisonnements dans `_trace` | **Simple** | azy.mcp doit logger après |
| D. HTTP callback | Webhook POST vers Langfuse directement | Indépendant | Config API key dans n8n |

**Décision : Option C** ✅

Le webhook retourne ses décisions dans un champ `_trace` :

```json
{
  "success": true,
  "analysis": { ... },
  "pipeline": [ ... ],
  "_trace": {
    "reasoning": [
      { "step": "detect_content", "result": "no_text_detected", "confidence": 0.95 },
      { "step": "classify_image", "result": "food_photo", "model": "gpt-4o" },
      { "step": "select_pipeline", "decision": "identify_then_search", "reason": "photo sans texte" }
    ],
    "model": "gpt-4o",
    "tokens": { "input": 1250, "output": 180 },
    "latency_ms": 1834
  }
}
```

**Implémentation côté azy.mcp** :

```python
# Dans PipelineExecutor
if self.trace_callback and "_trace" in analyzer_response:
    self.trace_callback.log_metadata(
        name="content_analyzer_reasoning",
        metadata=analyzer_response["_trace"]
    )
```

**Avantages** :
- ✅ Pas de config Langfuse dans n8n - credentials restent côté azy.mcp
- ✅ Traces liées - le raisonnement apparaît dans le span du pipeline
- ✅ Flexible - chaque webhook décide ce qu'il expose dans `_trace`

---

### Résumé Langfuse

```
Plugin                     azy.mcp                      n8n webhook
   │                          │                              │
   │  context + trace_id      │                              │
   ├─────────────────────────►│                              │
   │                          │  POST /content-analyzer      │
   │                          ├─────────────────────────────►│
   │                          │                              │
   │                          │  { analysis, pipeline,       │
   │                          │    _trace: { reasoning } }   │
   │                          │◄─────────────────────────────┤
   │                          │                              │
   │                          │  log_metadata(_trace)        │
   │                          │  ──► Langfuse                │
   │                          │                              │
   │  PipelineResult          │                              │
   │◄─────────────────────────┤                              │
```

---

## Prochaines étapes

1. [ ] **POC n8n** : Créer `MCP-Content-Analyzer` webhook avec `_trace` (équipe n8n)
2. [ ] **Test POC** : Valider sur les 3 cas d'usage
3. [x] **Décision orchestration** : azy.mcp exécute le pipeline ✅
4. [x] **Décision Langfuse** : Option C - `_trace` dans response, azy.mcp log ✅
5. [ ] **Implémentation** : `PipelineExecutor` dans azy.mcp (avec `log_metadata(_trace)`)
6. [ ] **Clarifier L1-L4** : trace_callback plugin → azy.mcp (équipe azy.mcp)
7. [ ] **ISSUE-012** : Créer issue séparée pour PDF multi-pages (parallel)

## Références

- RFC-050: Conversation Architecture
- RFC-043: LLM-first Tool Selection
- RFC-048: Discord Education Architecture (M5 auto-détection matière)
- [LangChain Agents](https://docs.langchain.com/docs/components/agents/)
- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)
