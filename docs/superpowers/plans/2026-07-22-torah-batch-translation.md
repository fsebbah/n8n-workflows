# Traduction Torah en lot (API Message Batches Claude) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traduire les gros lots (> 50 commentaires) via l'API Message Batches de Claude — soumission unique, poller générique, notification DM Discord — au lieu de la boucle synchrone fragile.

**Architecture:** On étend les deux briques batch **génériques existantes** (soumetteur `Claude_-_Call_With_Skills`, poller `Claude_-_Batch_Poller`) pour supporter **N requêtes par batch** derrière un flag `metadata.multi`, rétro-compatible. La logique métier torah vit dans deux workflows minces : un dispatcher (construit les requêtes de trad, soumet, crée le job) et un callback webhook (sauve par `custom_id`, notifie).

**Tech Stack:** n8n 2.28.7 (Docker, host `llm.local`), workflows JSON, Code nodes JS (sandbox : pas de `require`/`Blob`/`File` ; `this.helpers.httpRequest` OK pour du JSON), API Anthropic Message Batches, torah.api (jobs + translations), Redis XADD service.

## Global Constraints

- **n8n ne lit AUCUNE clé via `$env`** — clés et modèle arrivent par le **payload** (BYOT). `model = body.model`, `api_key = body.api_key`, verbatim. n8n relaie, n'arbitre pas.
- **Pas de valeur hardcodée multi-env** — hôtes/URLs via `$env` (`{{$env.TORAH_API_URL}}`, `{{$env.REDIS_XADD_SERVICE_URL}}`, `{{$env.N8N_WEBHOOK_URL}}`).
- **Sandbox Code node** : jamais de `require`, `Blob`, `File`, `process`. `Buffer`/`Uint8Array`/`TextEncoder` OK. Appels HTTP JSON via `this.helpers.httpRequest` uniquement (jamais de multipart en Code node).
- **Rétro-compatibilité** : les extensions génériques (tâches 1 & 2) ne doivent RIEN changer au comportement actuel quand `metadata.multi` est absent (chantier docs Claude intact).
- **Réimports** : c'est **l'utilisateur** qui lance tous les réimports n8n. Chaque tâche livre un JSON validé hors-ligne + un payload de test ; l'utilisateur réimporte puis teste.
- **Signature GitHub** : commentaires signés « — équipe n8n ».
- **Modèle par défaut LLM** si jamais choisi côté n8n : ne pas en choisir — vient du payload.

## Validation hors-ligne (réutilisée par toutes les tâches)

Script `scratchpad/validate_wf.py` (créé en tâche 0) — vérifie unicité des noms de nodes, intégrité des connexions, et `node --check` sur chaque Code node. Aucune tâche ne commite sans que ce script passe.

---

## File Structure

- `workflows/Claude_-_Call_With_Skills.json` — **modifier** (Validate Input, Create Batch, Prepare Batch Data) : support `requests[]`.
- `workflows/Claude_-_Batch_Poller.json` — **modifier** (Process Results) : support multi-résultats.
- `workflows/Torah_Batch_Dispatcher.json` — **créer** : branche batch (construit requêtes, soumet, crée job).
- `workflows/Torah_Batch_Callback.json` — **créer** : webhook `/torah-translation-callback` (save + DM).
- `workflows/Torah_Router.json` — **modifier** (Parse Input / routing) : N > 50 → dispatcher batch.
- `scratchpad/validate_wf.py` — outil de validation hors-ligne.

---

## Task 0 : Outil de validation hors-ligne

**Files:**
- Create: `/tmp/claude-1000/-storage6-pi6-n8n-workflows/8bc4a286-402f-4112-874e-b005323e28b1/scratchpad/validate_wf.py`

**Interfaces:**
- Produces: `python3 scratchpad/validate_wf.py workflows/X.json` → exit 0 si OK, 1 + message sinon.

- [ ] **Step 1: Écrire le validateur**

```python
import json, sys, subprocess, tempfile, os
def validate(path):
    w = json.load(open(path, encoding='utf-8'))
    names = [n['name'] for n in w['nodes']]
    assert len(names) == len(set(names)), f"noms de nodes dupliqués: {[n for n in names if names.count(n)>1]}"
    nameset = set(names)
    for src, cc in w.get('connections', {}).items():
        assert src in nameset, f"connexion depuis node inconnu: {src}"
        for group in cc.get('main', []):
            for o in group:
                assert o['node'] in nameset, f"connexion vers node inconnu: {o['node']}"
    for n in w['nodes']:
        if n['type'].endswith('.code'):
            src = "void (async()=>{\n" + n['parameters'].get('jsCode','') + "\n});"
            f = tempfile.NamedTemporaryFile('w', suffix='.js', delete=False); f.write(src); f.close()
            r = subprocess.run(['node','--check',f.name], capture_output=True, text=True); os.unlink(f.name)
            assert r.returncode == 0, f"syntaxe JS invalide dans '{n['name']}': {r.stderr[:150]}"
    print(f"OK — {path} ({len(names)} nodes)")
if __name__ == '__main__':
    try: validate(sys.argv[1]); sys.exit(0)
    except AssertionError as e: print("ÉCHEC:", e); sys.exit(1)
```

- [ ] **Step 2: Vérifier qu'il tourne sur un workflow existant**

Run: `python3 scratchpad/validate_wf.py workflows/Claude_-_Batch_Poller.json`
Expected: `OK — workflows/Claude_-_Batch_Poller.json (15 nodes)`

(Pas de commit — outil de scratchpad hors dépôt.)

---

## Task 1 : Soumetteur générique — support `requests[]` (N requêtes)

**Files:**
- Modify: `workflows/Claude_-_Call_With_Skills.json` (nodes `Validate Input`, `Create Batch`, `Prepare Batch Data`)

**Interfaces:**
- Consumes (payload webhook `/claude-call-with-skills`) — **forme actuelle inchangée** : `{model, max_tokens, messages, system?, container?, tools?, correlation_id, callback_url?, redis_channel?, api_key, metadata?}`.
- Produces (nouvelle forme N-requêtes) : `{requests:[{custom_id, params:{model,max_tokens,messages,system?}}], callback_url, redis_channel?, api_key, metadata:{multi:true, ...}}`. Quand `requests[]` est présent, le batch contient N requêtes et `metadata.multi` est forcé à `true`.

- [ ] **Step 1: Lire le contenu actuel des 3 nodes**

Run: `python3 -c "import json; w=json.load(open('workflows/Claude_-_Call_With_Skills.json')); [print('===',n['name'],'===\n',n['parameters'].get('jsCode') or n['parameters'].get('jsonBody')) for n in w['nodes'] if n['name'] in ('Validate Input','Create Batch','Prepare Batch Data')]"`
Expected: affiche le JS de `Validate Input`, `Prepare Batch Data` et le `jsonBody` de `Create Batch`.

- [ ] **Step 2: Appliquer la mutation (support `requests[]`)**

Écrire et exécuter ce script (adapter les `.replace()` au texte réel lu en Step 1 ; les ancres ci-dessous sont les invariants connus) :

```python
import json
p='workflows/Claude_-_Call_With_Skills.json'
w=json.load(open(p,encoding='utf-8')); bn={n['name']:n for n in w['nodes']}

# 1. Create Batch : si body.requests présent → l'utiliser tel quel ; sinon wrap actuel
cb=bn['Create Batch']['parameters']
NEW_BODY = "={{ (() => {\n"\
  "  const data = $json;\n"\
  "  if (Array.isArray(data.requests) && data.requests.length) {\n"\
  "    return JSON.stringify({ requests: data.requests });\n"\
  "  }\n"\
  "  const messageParams = { model: data.model, max_tokens: data.max_tokens, messages: data.messages, container: data.container, tools: data.tools };\n"\
  "  if (data.system) messageParams.system = data.system;\n"\
  "  return JSON.stringify({ requests: [ { custom_id: data.correlation_id, params: messageParams } ] });\n"\
  "})() }}"
cb['jsonBody']=NEW_BODY

# 2. Validate Input : accepter la forme requests[] (bloc ajouté en tête de la validation métier)
vi=bn['Validate Input']['parameters']
inject=("// --- support batch multi-requêtes (requests[]) ---\n"
        "if (Array.isArray(body.requests) && body.requests.length) {\n"
        "  body.metadata = Object.assign({}, body.metadata, { multi: true });\n"
        "  if (!body.correlation_id) body.correlation_id = 'multi-' + (body.metadata.job_id || 'batch');\n"
        "}\n")
# insérer juste après la 1re occurrence de `const body =` (à confirmer au Step 1)
marker="const body ="
line_end=vi['jsCode'].index('\n', vi['jsCode'].index(marker))+1
vi['jsCode']=vi['jsCode'][:line_end]+inject+vi['jsCode'][line_end:]

# 3. Prepare Batch Data : propager metadata.multi dans redis_data (déjà via metadata, vérifier)
#    (metadata est déjà stocké ; multi voyage dedans. Rien à changer si redis_data inclut metadata.)

json.dump(w, open(p,'w',encoding='utf-8'), ensure_ascii=False, indent=2)
print("muté")
```

- [ ] **Step 3: Valider hors-ligne**

Run: `python3 scratchpad/validate_wf.py workflows/Claude_-_Call_With_Skills.json`
Expected: `OK — workflows/Claude_-_Call_With_Skills.json (14 nodes)`

- [ ] **Step 4: Vérifier la rétro-compat (forme 1-message inchangée)**

Run: `python3 -c "import json; w=json.load(open('workflows/Claude_-_Call_With_Skills.json')); b=[n for n in w['nodes'] if n['name']=='Create Batch'][0]['parameters']['jsonBody']; print('requests[]' , 'data.requests' in b); print('fallback single', 'data.correlation_id' in b)"`
Expected: `requests[] True` et `fallback single True` (les deux chemins présents).

- [ ] **Step 5: Commit**

```bash
git add workflows/Claude_-_Call_With_Skills.json
git commit -m "feat(batch): soumetteur générique accepte requests[] (N requêtes) — rétro-compatible

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Payload de test (post-réimport, pour l'utilisateur)**

Après réimport, tester la forme N-requêtes :
```bash
curl -s -X POST "$N8N_WEBHOOK_BASE_URL/claude-call-with-skills" -H 'Content-Type: application/json' -d '{
  "api_key":"<clé>", "callback_url":"https://httpbin.org/post",
  "metadata":{"multi":true,"job_id":"test1"},
  "requests":[
    {"custom_id":"a","params":{"model":"claude-haiku-4-5-20251001","max_tokens":64,"messages":[{"role":"user","content":"Dis bonjour"}]}},
    {"custom_id":"b","params":{"model":"claude-haiku-4-5-20251001","max_tokens":64,"messages":[{"role":"user","content":"Dis merci"}]}}
  ]}'
```
Attendu : `202` + un `batch_id`. Vérifier via `GET api.anthropic.com/v1/messages/batches/{id}` que `request_counts.total == 2`.

---

## Task 2 : Poller générique — support multi-résultats

**Files:**
- Modify: `workflows/Claude_-_Batch_Poller.json` (node `Process Results`)

**Interfaces:**
- Consumes: sortie de `Get Results` (JSONL Anthropic) + `Merge Info` (`batchInfo` avec `metadata`, `correlation_id`, `callback_url`, etc.).
- Produces: quand `batchInfo.metadata.multi` est vrai → objet sortant `{success:true, batch_id, callback_url, redis_id, api_key, multi:true, results:[{custom_id, ok:boolean, text?:string, error?:object}], metadata, _trace}`. Sinon → **exactement** la sortie actuelle (un résultat).

- [ ] **Step 1: Localiser le bloc `find(correlation_id)` dans Process Results**

Run: `python3 -c "import json; w=json.load(open('workflows/Claude_-_Batch_Poller.json')); print([n for n in w['nodes'] if n['name']=='Process Results'][0]['parameters']['jsCode'][:1200])"`
Expected: on voit le parsing JSONL en `results` puis `const ourResult = results.find(r => r && r.custom_id === batchInfo.correlation_id);`.

- [ ] **Step 2: Injecter la branche multi juste après le parsing `results`**

Écrire et exécuter (l'ancre `const ourResult = results.find` est stable ; on insère AVANT elle un court-circuit multi) :

```python
import json
p='workflows/Claude_-_Batch_Poller.json'
w=json.load(open(p,encoding='utf-8')); n=next(x for x in w['nodes'] if x['name']=='Process Results')
c=n['parameters']['jsCode']
anchor="const ourResult = results.find"
assert anchor in c, "ancre find() introuvable — relire le node"
MULTI = (
"// --- mode multi-résultats (batch N requêtes) ---\n"
"if (batchInfo.metadata && batchInfo.metadata.multi) {\n"
"  const out = results.map(r => {\n"
"    const t = r && r.result && r.result.type;\n"
"    if (t === 'succeeded') {\n"
"      const msg = r.result.message || {};\n"
"      const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\\n');\n"
"      return { custom_id: r.custom_id, ok: true, text };\n"
"    }\n"
"    return { custom_id: r && r.custom_id, ok: false, error: (r && r.result && r.result.error) || { code: String(t || 'unknown') } };\n"
"  });\n"
"  return {\n"
"    success: true, multi: true,\n"
"    batch_id: batchInfo.batch_id, correlation_id: batchInfo.correlation_id,\n"
"    callback_url: batchInfo.callback_url, redis_id: batchInfo.redis_id, api_key: batchInfo.api_key,\n"
"    results: out, metadata: batchInfo.metadata,\n"
"    _trace: { batch_id: batchInfo.batch_id, completed_at: new Date().toISOString(), count: out.length, ok: out.filter(x => x.ok).length }\n"
"  };\n"
"}\n"
)
c=c.replace(anchor, MULTI+anchor)
n['parameters']['jsCode']=c
json.dump(w, open(p,'w',encoding='utf-8'), ensure_ascii=False, indent=2)
print("muté")
```

- [ ] **Step 3: Valider hors-ligne**

Run: `python3 scratchpad/validate_wf.py workflows/Claude_-_Batch_Poller.json`
Expected: `OK — workflows/Claude_-_Batch_Poller.json (15 nodes)`

- [ ] **Step 4: Vérifier la rétro-compat (chemin single intact)**

Run: `python3 -c "import json; w=json.load(open('workflows/Claude_-_Batch_Poller.json')); c=[n for n in w['nodes'] if n['name']=='Process Results'][0]['parameters']['jsCode']; print('multi branch', 'metadata.multi' in c); print('single path', 'results.find(r => r && r.custom_id === batchInfo.correlation_id)' in c)"`
Expected: `multi branch True` et `single path True` (le chemin historique existe toujours, après le court-circuit multi).

- [ ] **Step 5: Câbler `results[]` dans la livraison (Publish to Redis)**

Le node `Publish to Redis` publie `content`/`files`. En mode multi, ajouter le champ `results` aux `fields` publiés pour qu'il atteigne le callback. Muter le `jsonBody` de `Publish to Redis` pour inclure `results: JSON.stringify($json.results || [])` et `multi: String($json.multi || false)` dans `fields`. Valider de nouveau (Step 3). Commit inclus ci-dessous.

- [ ] **Step 6: Commit**

```bash
git add workflows/Claude_-_Batch_Poller.json
git commit -m "feat(batch): poller renvoie tous les résultats en mode metadata.multi — rétro-compatible

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 7: Test (post-réimport)** — enchaîné avec le batch de test de la tâche 1 : quand ce batch passe `ended`, le poller doit livrer `results:[{custom_id:'a',ok:true,text:...},{custom_id:'b',...}]` au `callback_url` (visible sur httpbin). Vérifier `count==2`.

---

## Task 3 : `Torah_Batch_Dispatcher` (métier — construit + soumet)

**Files:**
- Create: `workflows/Torah_Batch_Dispatcher.json`

**Interfaces:**
- Consumes (webhook `/torah-translate-batch`) : `{items:[{commentary_id, segment_id, segmentText, sourceLangName, targetLangName, traite, page, metadata:{commentator}}], api_key, model, max_tokens?, project_id, callback_channel_id?}`.
- Produces : `POST {N8N_WEBHOOK_URL}/webhook/claude-call-with-skills` avec `requests[]` + `callback_url` + `metadata.multi`. Répond `{job_id, batch:true, count}`.

- [ ] **Step 1: Écrire le workflow (squelette : Webhook → Validate → Create Job → Build Requests → Submit → Respond)**

Créer le JSON. Node clé `Build Requests` (Code) — réplique le prompt `Claude Direct` de `Torah_Translate_Worker`, `custom_id = commentary_id`, `max_tokens = body.max_tokens || 8192` :

```javascript
const body = $('Validate Input').first().json;
const jobId = $('Create Job').first().json.job_id || $('Create Job').first().json.id;
const model = body.model;                     // du payload, verbatim
const maxTokens = body.max_tokens || 8192;    // headroom : commentaire entier non chunké
const requests = body.items.map(it => {
  const commentator = it.metadata && it.metadata.commentator ? ' - ' + it.metadata.commentator : '';
  const prompt = 'Tu es un expert en textes talmudiques. Le texte source est en ' + it.sourceLangName +
    '. Traduis en ' + it.targetLangName + '.\n\nContexte: ' + it.traite + ' ' + it.page + commentator +
    '\n\nTexte à traduire:\n' + it.segmentText + '\n\nRéponds UNIQUEMENT avec la traduction.';
  return { custom_id: String(it.commentary_id), params: { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] } };
});
// carte custom_id -> segment_id, pour la sauvegarde côté callback
const commentary_map = {};
body.items.forEach(it => { commentary_map[String(it.commentary_id)] = { segment_id: it.segment_id }; });
return {
  api_key: body.api_key,
  callback_url: $env.N8N_WEBHOOK_URL + '/webhook/torah-translation-callback',
  metadata: { multi: true, job_id: jobId, project_id: body.project_id,
              target_lang: body.items[0] && body.items[0].targetLangName,
              callback_channel_id: body.callback_channel_id, commentary_map },
  requests
};
```

`Submit` (HTTP Request) : `POST {{$env.N8N_WEBHOOK_URL}}/webhook/claude-call-with-skills`, body = sortie de `Build Requests`, `onError: continueRegularOutput`, timeout 30000.
`Create Job` (HTTP Request) : `POST {{$env.TORAH_API_URL}}/api/v2/jobs`, header `X-Project-ID: {{$json.project_id}}`, body `{type:'translation-batch', total: {{items.length}}, input:{...}}` (sans la clé, sécurité).

- [ ] **Step 2: Valider hors-ligne**

Run: `python3 scratchpad/validate_wf.py workflows/Torah_Batch_Dispatcher.json`
Expected: `OK — workflows/Torah_Batch_Dispatcher.json (N nodes)`

- [ ] **Step 3: Vérifier le prompt et le modèle-du-payload**

Run: `python3 -c "import json; w=json.load(open('workflows/Torah_Batch_Dispatcher.json')); c=[n for n in w['nodes'] if n['name']=='Build Requests'][0]['parameters']['jsCode']; print('modèle du payload', 'const model = body.model' in c); print('pas de hardcode modèle', 'claude-' not in c); print('custom_id=commentary_id', 'String(it.commentary_id)' in c)"`
Expected: les trois `True`.

- [ ] **Step 4: Commit**

```bash
git add workflows/Torah_Batch_Dispatcher.json
git commit -m "feat(torah): dispatcher batch — construit N requêtes de trad et soumet via le batch générique

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Test (post-réimport)** — POST `/torah-translate-batch` avec 2 items réels + clé BYOT ; attendu `{job_id, batch:true, count:2}`, un job créé côté torah.api, un batch de 2 requêtes chez Anthropic.

---

## Task 4 : `Torah_Batch_Callback` (métier — sauve + notifie)

**Files:**
- Create: `workflows/Torah_Batch_Callback.json`

**Interfaces:**
- Consumes (webhook `/torah-translation-callback`) : la charge livrée par le poller en mode multi — `{batch_id, results:[{custom_id, ok, text?, error?}], metadata:{job_id, project_id, commentary_map, callback_channel_id, target_lang}}`.
- Produces : N appels `POST {TORAH_API_URL}/api/translations/save` ; PATCH job ; un message Discord.

- [ ] **Step 1: Écrire le workflow (squelette calqué sur `TORAH---Document-Callback`)**

Nodes : `Webhook /torah-translation-callback` → `Validate` → `Split Results` (Code : renvoie un item n8n par résultat, en portant `job_id`/`commentary_map`) → `Saved?` (IF `ok`) → `Save Translation` (HTTP `POST {{$env.TORAH_API_URL}}/api/translations/save`) → `Collect` → `Update Job` (PATCH `{{$env.TORAH_API_URL}}/api/v2/jobs/{{job_id}}`) → `Prepare Discord` → `Send Discord` (`https://discord.com/api/v10/channels/{{channel_id}}/messages`) → `Respond`.

`Split Results` (Code) :
```javascript
const p = $input.first().json;
const map = (p.metadata && p.metadata.commentary_map) || {};
return (p.results || []).map(r => ({ json: {
  job_id: p.metadata && p.metadata.job_id,
  project_id: p.metadata && p.metadata.project_id,
  channel_id: p.metadata && p.metadata.callback_channel_id,
  commentary_id: r.custom_id,
  segment_id: (map[r.custom_id] || {}).segment_id,
  ok: r.ok,
  translated_text: r.ok ? r.text : null,
  error: r.ok ? null : r.error
}}));
```

`Save Translation` body : `{{ JSON.stringify({ segment_id: $json.segment_id, commentary_id: $json.commentary_id, translated_text: $json.translated_text }) }}` — `onError: continueRegularOutput` (un échec de save ne doit pas tuer les autres ; il est compté, non silencieux).

`Prepare Discord` (Code) : compte `ok`/`échecs`, compose `✅ Traduction terminée (X ok / Y erreurs)`.

- [ ] **Step 2: Valider hors-ligne**

Run: `python3 scratchpad/validate_wf.py workflows/Torah_Batch_Callback.json`
Expected: `OK — workflows/Torah_Batch_Callback.json (N nodes)`

- [ ] **Step 3: Vérifier le mapping custom_id → segment_id et la non-silence des échecs**

Run: `python3 -c "import json; w=json.load(open('workflows/Torah_Batch_Callback.json')); c=[n for n in w['nodes'] if n['name']=='Split Results'][0]['parameters']['jsCode']; print('map segment_id', 'commentary_map' in c and 'segment_id' in c); print('erreur non nulle', 'error: r.ok ? null : r.error' in c)"`
Expected: les deux `True`.

- [ ] **Step 4: Commit**

```bash
git add workflows/Torah_Batch_Callback.json
git commit -m "feat(torah): callback batch — sauve les traductions par custom_id + DM Discord de fin

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Test (post-réimport)** — POST `/torah-translation-callback` avec une charge simulée `{results:[{custom_id:'c1',ok:true,text:'Hello'},{custom_id:'c2',ok:false,error:{code:'errored'}}], metadata:{job_id:'t',commentary_map:{c1:{segment_id:1},c2:{segment_id:2}}}}` → 1 save, 1 échec compté, DM « 1 ok / 1 erreur ».

---

## Task 5 : Seuil dans `Torah_Router` (N > 50 → batch)

**Files:**
- Modify: `workflows/Torah_Router.json` (node `Parse Input` + connexions)

**Interfaces:**
- Consumes: la requête de traduction entrante (segments/commentaires) déjà parsée par `Parse Input`.
- Produces: si `segments.length > 50` → appel fire-and-forget `POST {{$env.N8N_WEBHOOK_URL}}/webhook/torah-translate-batch` (dispatcher tâche 3) puis réponse `Accepted` + `mode:'batch'` ; sinon → chemin synchrone existant inchangé.

- [ ] **Step 1: Lire `Parse Input` et repérer où brancher le seuil**

Run: `python3 -c "import json; w=json.load(open('workflows/Torah_Router.json')); print([n for n in w['nodes'] if n['name']=='Parse Input'][0]['parameters']['jsCode'][:800])"`
Expected: on voit la construction de `segments` (+ `needsChunk` du #406).

- [ ] **Step 2: Ajouter le drapeau de seuil dans `Parse Input`**

Muter `Parse Input` pour exposer `useBatch = segments.length > 50` dans la sortie, puis ajouter un node IF `Batch ?` et un node HTTP `Dispatch Batch` (`POST {{$env.N8N_WEBHOOK_URL}}/webhook/torah-translate-batch`, timeout 5000, `onError:continueRegularOutput`, fire-and-forget) → `Respond Accepted (batch)`. Le chemin `false` reste la chaîne synchrone actuelle.

```python
import json
p='workflows/Torah_Router.json'
w=json.load(open(p,encoding='utf-8')); n=next(x for x in w['nodes'] if x['name']=='Parse Input')
c=n['parameters']['jsCode']
# ajouter useBatch juste avant le return final (ancre à confirmer au Step 1)
assert 'segments' in c
c=c.replace('return', "const useBatch = (Array.isArray(segments) ? segments.length : 0) > 50;\nreturn", 1)
# NB : inclure useBatch dans l'objet retourné (édition manuelle selon la forme réelle du return)
n['parameters']['jsCode']=c
json.dump(w, open(p,'w',encoding='utf-8'), ensure_ascii=False, indent=2)
print("seuil ajouté — compléter le retour + IF + Dispatch Batch selon la structure réelle")
```

- [ ] **Step 3: Valider hors-ligne**

Run: `python3 scratchpad/validate_wf.py workflows/Torah_Router.json`
Expected: `OK — workflows/Torah_Router.json (N nodes)`

- [ ] **Step 4: Vérifier le seuil et la préservation du chemin sync**

Run: `python3 -c "import json; w=json.load(open('workflows/Torah_Router.json')); c=[n for n in w['nodes'] if n['name']=='Parse Input'][0]['parameters']['jsCode']; print('seuil 50', '> 50' in c); names=[n['name'] for n in w['nodes']]; print('sync intact', 'Loop Segments' in names)"`
Expected: `seuil 50 True`, `sync intact True`.

- [ ] **Step 5: Commit**

```bash
git add workflows/Torah_Router.json
git commit -m "feat(torah): Router bascule en mode batch au-delà de 50 traductions (azy.daily#150)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Test E2E (post-réimport, avec l'utilisateur)** — relancer la trad de 457 commentaires : réponse immédiate `mode:batch` + `job_id`, un batch de 457 chez Anthropic, puis (≤ ~1 h) un DM « ✅ Traduction terminée (X ok / Y erreurs) » et les lignes sauvées. **Aucun watchdog 60s.**

---

## Self-Review (couverture du spec)

- Seuil N > 50 → **Task 5**. Modèle du payload → **Task 3** (Build Requests). Soumission unique / N-requêtes → **Task 1 + 3**. Poller générique multi → **Task 2**. Livraison callback webhook → **Task 2 (Publish) + 4**. Save par custom_id + DM → **Task 4**. Chunking supprimé (commentaire entier) → **Task 3** (une requête/commentaire, `max_tokens 8192`). Rétro-compat docs → **Task 1 & 2** (flag `multi`). Garde-fou anti-double-enqueue → *à ajouter en Task 3 si besoin (flag Redis `torah:job:{id}:batch`)*.
- Point ouvert assumé : le **câblage exact `results[]` → callback** (Task 2 Step 5) dépend de la forme réelle de `Publish to Redis`/du bridge — à ajuster à l'implémentation, testé en Task 2 Step 7.
