#!/usr/bin/env node
/**
 * LLM - Web Search : l'échec amont ne doit plus sortir en succès.
 *
 * Mesuré le 2026-09-08 : une clé volontairement fausse rendait
 *   success: true, data.content: "", sources: []
 * l'erreur n'étant visible que dans `_trace.service_response`.
 *
 * ⚠️ Le try/catch des normalisateurs n'y pouvait rien : Gemini rend
 * { error: {...} } et non { candidates: [...] }, donc `input.candidates?.[0]`
 * vaut undefined sans lever. On ne décide pas d'un échec sur la présence
 * d'un champ.
 *
 *   node scripts/test/test_web_search.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const W = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../workflows/LLM_-_Web_Search.json'), 'utf8'));
const nd = (n) => W.nodes.find((x) => x.name === n);
// ⚠️ on inspecte ce qu'on LIVRE : `activeVersion` est la photographie de la
// version encore déployée et porte légitimement les anciens modèles.
const livre = JSON.stringify({ nodes: W.nodes, connections: W.connections });

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(52)} ${String(JSON.stringify(obtenu)).slice(0, 44)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};

const AMONT = { provider: 'gemini', query: 'q', startTime: Date.now(), user_id: null, guild_id: null, user_request: null };
const N = (nom, entree) => {
  const r = vm.runInNewContext(`(function(){${nd(nom).parameters.jsCode}})()`, {
    $input: { first: () => ({ json: entree }) },
    $: () => ({ first: () => ({ json: AMONT }) }),
    JSON, String, Number, Object, Array, Date, Math, parseInt, parseFloat, isNaN, Error, RegExp,
  }, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r;
};

console.log('\n1. ⚠️ l’échec amont est détecté — les quatre normalisateurs');
for (const nom of ['Normalize OpenAI', 'Normalize Claude', 'Normalize Gemini', 'Normalize Mistral']) {
  // la forme exacte mesurée : le fournisseur rend son erreur, pas ses résultats
  let r = N(nom, { error: { message: '401 - {"error":{"message":"Invalid key"}}' } });
  T(`${nom} : échec signalé`.slice(0, 50), false, r.normalized);
  T(`${nom} : statut lu dans le message`.slice(0, 50), 401, r.http_status);

  r = N(nom, { statusCode: 429, body: { error: { message: 'rate limited' } } });
  T(`${nom} : statusCode prioritaire`.slice(0, 50), 429, r.http_status);
}

console.log('\n2. un contenu vide n’est pas un succès');
let r = N('Normalize Gemini', { candidates: [{ content: { parts: [] } }] });
T('Gemini : réponse vide refusée', false, r.normalized);
T('… avec un statut explicite', 502, r.http_status);

console.log('\n2 bis. ⚠️ Normalize OpenAI lit la forme /v1/responses');
// Le nœud appelle /v1/responses, qui rend `output[]`. Le normalisateur lisait
// `choices[0].message` — la forme de chat/completions. D'où un texte vide, donc
// un succès à contenu vide avant la garde. Forme mesurée le 2026-09-08.
const REP = { output: [{ type: 'web_search_call' }, { type: 'message', content: [
  { type: 'output_text', text: 'REPONSE', annotations: [
    { type: 'url_citation', url: 'https://exemple.org/a', title: 'A' },
    { type: 'url_citation', url: 'https://exemple.org/b', title: 'B' }] }] }],
  usage: { input_tokens: 7843, output_tokens: 136, total_tokens: 7979 } };
let ro = N('Normalize OpenAI', REP);
T('texte extrait de output[]', 'REPONSE', ro.content);
T('sources extraites des annotations', 2, (ro.sources || []).length);
T('usage lu en input_tokens', 7843, ro.usage?.input_tokens);
// ⚠️ `output_text` n'existe PAS dans la réponse : il faut parcourir output[].
T('ne dépend pas de output_text', true, !JSON.stringify(REP).includes('"output_text":"'));
// la forme chat/completions reste tolérée
ro = N('Normalize OpenAI', { choices: [{ message: { content: 'X', annotations: [] } }],
  usage: { prompt_tokens: 5, completion_tokens: 2 } });
T('forme chat/completions encore lue', ['X', 5], [ro.content, ro.usage?.input_tokens]);

console.log('\n3. le cas nominal passe toujours');
r = N('Normalize Gemini', { candidates: [{ content: { parts: [{ text: 'Paris' }] },
      groundingMetadata: { groundingChunks: [] } }], usageMetadata: { promptTokenCount: 3 } });
T('Gemini : contenu rendu', [true, 'Paris'], [r.normalized, r.content]);

console.log('\n4. Format Output relaie le vrai statut');
const FO = (entree) => {
  const r = vm.runInNewContext(`(function(){${nd('Format Output').parameters.jsCode}})()`, {
    $input: { first: () => ({ json: entree }) },
    $: () => ({ first: () => ({ json: AMONT }) }),
    JSON, String, Number, Object, Array, Date, Math, parseInt, parseFloat, isNaN, Error, RegExp,
  }, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r;
};
r = FO({ normalized: false, provider: 'gemini', error: 'Invalid key', http_status: 401 });
T('401 relayé, pas un 500 forfaitaire', [false, 401], [r.success, r.error?.http_status]);
r = FO({ normalized: false, provider: 'gemini', error: 'boum' });
T('sans statut connu → 500', 500, r.error?.http_status);

console.log('\n5. plus aucun modèle retiré dans ce qu’on livre');
for (const m of ['gemini-2.5-flash', 'gpt-4o-search-preview', 'gpt-4o-mini-search-preview']) {
  T(`${m} absent`, false, livre.includes(m));
}
T('gemini-3.6-flash présent', true, livre.includes('gemini-3.6-flash'));
T('gpt-5.6-terra présent', true, livre.includes('gpt-5.6-terra'));
T('gpt-5.6-luna présent (variante économique)', true, livre.includes('gpt-5.6-luna'));
// gpt-5.4 fut mon premier remplaçant ; le PO a désigné gpt-5.6-terra.
T('gpt-5.4 remplacé', false, livre.includes('gpt-5.4'));

console.log('\n5 bis. ⚠️ le corps OpenAI a la forme MESURÉE valide');
// Mesuré le 2026-09-08 : `tool_choice.search_context_size` rend 400
// « Unknown parameter ». Le paramètre appartient à la DÉFINITION de l'outil.
// Le remplacement de modèle seul n'aurait rien réparé : la branche serait
// passée d'un 404 à un 400.
const bo = nd('OpenAI Web Search').parameters.jsonBody;
T('search_context_size dans l’outil', true,
  /"type":\s*"web_search",\s*"search_context_size"/.test(bo));
T('… et PAS dans tool_choice', false, /tool_choice[^}]*search_context_size/.test(bo));
T('le forçage de l’outil est conservé', true, /"tool_choice":\s*\{\s*"type":\s*"web_search"\s*\}/.test(bo));
T('modèles mesurés fonctionnels', true, bo.includes('gpt-5.6-terra') && bo.includes('gpt-5.6-luna'));

console.log('\n6. les outils de recherche portent leur nom actuel');
const so = JSON.stringify(nd('OpenAI Web Search').parameters);
T('OpenAI : outil web_search', true, so.includes('web_search') && !so.includes('web_search_preview'));
const sg = JSON.stringify(nd('Gemini Web Search').parameters);
T('Gemini : google_search', true, sg.includes('google_search'));
// mesuré : google_search_retrieval rend 400 « is not supported »
T('Gemini : pas google_search_retrieval', false, sg.includes('google_search_retrieval'));

console.log('\n7. ⚠️ Mistral passe par /v1/conversations, sans créer d’agent');
// Mesuré le 2026-09-10 : POST /v1/agents CRÉAIT un agent à chaque appel et ne
// posait jamais la question → 502 « réponse vide de mistral ». azy.daily#361.
const pm = nd('Mistral Web Search').parameters;
T('URL /v1/conversations', 'https://api.mistral.ai/v1/conversations', pm.url);
T('plus aucun POST /v1/agents', false, livre.includes('api.mistral.ai/v1/agents'));
T('le corps préparé est enfin envoyé', '={{ $json.mistral_body }}', pm.jsonBody);
T('plus d’agent nommé en dur', false, livre.includes('Recipe Search Agent'));

const PB = (entree) => JSON.parse(vm.runInNewContext(
  `(function(){${nd('Prepare Mistral Body').parameters.jsCode}})()`,
  { $input: { first: () => ({ json: entree }) } }, { timeout: 5000 })[0].json.mistral_body);
let b = PB({ provider: 'mistral', model: 'mistral-medium-2505', query: 'q' });
T('store:false (aucune ressource laissée)', false, b.store);
T('outil web_search en ligne', [{ type: 'web_search' }], b.tools);
T('modèle venu de la requête', 'mistral-medium-2505', b.model);
b = PB({ provider: 'mistral-premium', model: 'm', query: 'q' });
T('premium → web_search_premium', 'web_search_premium', b.tools[0].type);
b = PB({ provider: 'mistral', model: 'm', query: 'q',
  messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }] });
T('system → instructions, le reste → inputs', ['S', [{ role: 'user', content: 'U' }]], [b.instructions, b.inputs]);
const SCH = { name: 'fiche', input_schema: { type: 'object', properties: { v: { type: 'string' } } } };
b = PB({ provider: 'mistral', model: 'm', query: 'q', output_schema: SCH });
// ⚠️ mesuré : web_search + fonction de sortie → le modèle appelle la fonction
// SANS chercher et invente la réponse. response_format laisse la recherche se faire.
T('sortie structurée : aucune fonction dans tools', [{ type: 'web_search' }], b.tools);
T('… mais response_format json_schema', ['json_schema', 'fiche'],
  [b.completion_args.response_format?.type, b.completion_args.response_format?.json_schema?.name]);
T('plus de tool_choice "any" (422 mesuré)', undefined, b.completion_args.tool_choice);

// forme exacte mesurée le 2026-09-10
const CONV = { outputs: [{ type: 'tool.execution', name: 'web_search' }, { type: 'message.output', content: [
  { type: 'text', text: 'Le vainqueur est ' },
  { type: 'tool_reference', tool: 'web_search', title: 'A', url: 'https://a.org/x' },
  { type: 'text', text: 'Pogačar.' },
  { type: 'tool_reference', tool: 'web_search', title: 'A bis', url: 'https://a.org/x' },
  { type: 'tool_reference', tool: 'web_search', title: 'B', url: 'https://b.org/y' }] }],
  usage: { prompt_tokens: 774, completion_tokens: 129, total_tokens: 7807 } };
const AM = { ...AMONT, provider: 'mistral' };
const NM = (entree, amont) => {
  const r = vm.runInNewContext(`(function(){${nd('Normalize Mistral').parameters.jsCode}})()`, {
    $input: { first: () => ({ json: entree }) },
    $: () => ({ first: () => ({ json: amont }) }),
  }, { timeout: 5000 });
  return r[0].json;
};
let rm = NM(CONV, AM);
T('texte recomposé des morceaux', 'Le vainqueur est Pogačar.', rm.content);
T('sources dédoublonnées par URL', ['https://a.org/x', 'https://b.org/y'], rm.sources.map((s) => s.url));
T('recherche constatée', true, rm.search_performed);
T('usage lu', [774, 129], [rm.usage.input_tokens, rm.usage.output_tokens]);
rm = NM({ outputs: [{ type: 'message.output', content: 'texte simple' }] }, AM);
T('content en chaîne toléré', 'texte simple', rm.content);
rm = NM({ outputs: [{ type: 'message.output', content: [{ type: 'text',
  text: '{"vainqueur": "Tadej {P}ogačar", "annee": 2026}. \n\nLe vainqueur du Tour…' }] }] },
  { ...AM, output_schema: SCH });
T('JSON de tête extrait malgré la prose', { vainqueur: 'Tadej {P}ogačar', annee: 2026 }, rm.structured_data?.data);
T('… sous le nom du schéma', 'fiche', rm.structured_data?.tool_name);
rm = NM({ outputs: [{ type: 'message.output', content: [{ type: 'text', text: 'pas de json' }] }] },
  { ...AM, output_schema: SCH });
T('sans JSON : texte livré, pas de données', [true, null], [rm.normalized, rm.structured_data]);
// la réponse de l'ancien POST /v1/agents : un agent créé, aucune réponse
rm = NM({ object: 'agent', id: 'ag_x', name: 'Recipe Search Agent' }, AM);
T('« agent créé » sans réponse = échec 502', [false, 502], [rm.normalized, rm.http_status]);

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
process.exit(ko === 0 ? 0 : 1);
