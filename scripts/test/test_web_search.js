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
// Depuis le 2026-09-14, le corps est construit par « Prepare OpenAI Body » : on
// contrôle ce qui PART, pas un texte de nœud.
const corpsOA = (provider) => {
  const v = N('Validate Input', { query: 'q', provider, openai_api_key: 'K' });
  return JSON.parse(N('Prepare OpenAI Body', v).openai_body);
};
const bo = corpsOA('openai');
T('search_context_size dans l’outil', 'medium', bo.tools[0].search_context_size);
T('… et PAS dans tool_choice', false, 'search_context_size' in bo.tool_choice);
T('le forçage de l’outil est conservé', { type: 'web_search' }, bo.tool_choice);
T('modèles mesurés fonctionnels', ['gpt-5.6-terra', 'gpt-5.6-luna'], [bo.model, corpsOA('openai-mini').model]);

console.log('\n6. les outils de recherche portent leur nom actuel');
const so = JSON.stringify(bo) + nd('Prepare OpenAI Body').parameters.jsCode;
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
const DOC_MISTRAL = 'You have the ability to perform web searches with `web_search` to find up-to-date information.';
T('system → instructions (avant la consigne), le reste → inputs', [`S\n\n${DOC_MISTRAL}`, [{ role: 'user', content: 'U' }]], [b.instructions, b.inputs]);
// ⚠️ Sans instructions, Mistral s'arrête souvent après sa recherche sans rédiger :
// mesuré le 2026-09-10, 0/6 sans, 6/6 avec. Elles doivent donc TOUJOURS partir.
T('sans consigne de l’appelant : la phrase de la doc seule', DOC_MISTRAL, PB({ provider: 'mistral', model: 'm', query: 'q' }).instructions);
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

console.log('\n8. ⚠️ une source par URL, et le vrai domaine (azy.daily#361)');
// Mesuré le 2026-09-10 sur l'outil déployé : OpenAI rendait 6 sources pour 4 URL
// (une même page citée deux fois dans le texte) et sources_count comptait les 6 —
// le compteur disait autre chose que la liste affichée. Gemini rendait 10 sources
// toutes au domaine « vertexaisearch.cloud.google.com » : l'URL d'ancrage est une
// redirection, le vrai domaine n'est que dans `title`.
// Les deux fixtures sont les réponses BRUTES des fournisseurs, capturées ce jour-là.
const FXW = (nom) => JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/web_search', nom), 'utf8'));
const NS = (nom, entree, provider) => {
  const r = vm.runInNewContext(`(function(){${nd(nom).parameters.jsCode}})()`, {
    $input: { first: () => ({ json: entree }) },
    $: () => ({ first: () => ({ json: { ...AMONT, provider } }) }),
  }, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r;
};
const premieres = (liste) => { const vu = new Set(); return liste.filter((u) => !vu.has(u) && vu.add(u)); };

const fxOA = FXW('openai_responses_doublons.json');
const citeesOA = fxOA.output.filter((o) => o.type === 'message').flatMap((o) => o.content)
  .flatMap((c) => (c.annotations || []).filter((a) => a.type === 'url_citation').map((a) => a.url));
let rs = NS('Normalize OpenAI', fxOA, 'openai');
T(`openai réel : ${citeesOA.length} citations → une source par URL`, premieres(citeesOA), rs.sources.map((s) => s.url));
T('… des doublons existaient bien dans la réponse', true, citeesOA.length > new Set(citeesOA).size);
rs = NS('Normalize OpenAI', { output: [{ type: 'message', content: [{ type: 'output_text', text: 't', annotations: [
  { type: 'url_citation', url: 'https://a.org/x', title: 'A' },
  { type: 'url_citation', url: 'https://a.org/x', title: 'A bis' },
  { type: 'url_citation', url: 'https://b.org/y', title: 'B' }] }] }], usage: {} }, 'openai');
T('openai : 3 citations dont 1 doublon → 2', ['https://a.org/x', 'https://b.org/y'], rs.sources.map((s) => s.url));
T('… la première occurrence garde son titre', 'A', rs.sources[0].title);

rs = NS('Normalize Claude', { content: [
  { type: 'web_search_tool_result', content: [
    { type: 'web_search_result', url: 'https://a.org/x', title: 'A' },
    { type: 'web_search_result', url: 'https://a.org/x', title: 'A' },
    { type: 'web_search_result', title: 'sans URL' }] },
  { type: 'text', text: 't' }], usage: {} }, 'claude');
T('claude : doublon et source sans URL écartés', ['https://a.org/x'], rs.sources.map((s) => s.url));

const fxG = FXW('gemini_grounding.json');
const chunks = fxG.candidates[0].groundingMetadata.groundingChunks.filter((c) => c.web);
rs = NS('Normalize Gemini', fxG, 'gemini');
T(`gemini réel : aucun domaine vertexaisearch (${chunks.length} ancrages)`, 0,
  rs.sources.filter((s) => /vertexaisearch/.test(s.domain)).length);
const vuG = new Set();
T('… le domaine vient du titre d’ancrage',
  chunks.filter((c) => !vuG.has(c.web.uri) && vuG.add(c.web.uri)).map((c) => c.web.title),
  rs.sources.map((s) => s.domain));
T('… l’URL de redirection reste le lien', true, rs.sources.every((s) => /^https:\/\//.test(s.url)));
rs = NS('Normalize Gemini', { candidates: [{ content: { parts: [{ text: 't' }] }, groundingMetadata: { groundingChunks: [
  { web: { uri: 'https://vertexaisearch.cloud.google.com/r/1', title: 'a.org' } },
  { web: { uri: 'https://vertexaisearch.cloud.google.com/r/1', title: 'a.org' } },
  { web: { uri: 'https://exemple.org/page', title: 'Une page' } }] } }], usageMetadata: {} }, 'gemini');
T('gemini : doublon écarté ; URL directe → domaine de l’URL', ['a.org', 'exemple.org'], rs.sources.map((s) => s.domain));

// Le compteur compte la liste : c'est Format Output qui le pose.
const fo = FO({ normalized: true, provider: 'openai', content: 't', sources: NS('Normalize OpenAI', fxOA, 'openai').sources,
  usage: {}, search_performed: true });
T('Format Output : sources_count = longueur de la liste', fo.data.sources.length, fo.meta.sources_count);
T('… et vaut le nombre d’URL distinctes', new Set(citeesOA).size, fo.meta.sources_count);

console.log('\n9. ⚠️ Mistral a cherché sans rédiger : une erreur qui le dit');
// Réponse réelle du 2026-09-10 : outputs = [tool.execution] seul, HTTP 200.
const SANS_MSG = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/call_messages/mistral_conversations_sans_message.json'), 'utf8'));
let rsm = NM(SANS_MSG, { ...AMONT, provider: 'mistral' });
T('échec signalé, 502', [false, 502], [rsm.normalized, rsm.http_status]);
T('… avec la cause, pas « réponse vide »', 'Mistral a effectue la recherche mais n a pas redige de reponse', rsm.error);
rsm = NM({ outputs: [], usage: {} }, { ...AMONT, provider: 'mistral' });
T('sans recherche ni texte : message générique conservé', 'reponse vide de mistral', rsm.error);

console.log('\n10. ⚠️ le filtre de domaines est APPLIQUÉ chez OpenAI et Claude, signalé ailleurs');
// Constat du 2026-09-11 : les listes étaient acceptées et transmises à personne (#496).
// Mesures : Anthropic le 11/09, OpenAI le 14/09 — un domaine couvre ses sous-domaines.
const VW = (options, o = {}) => N('Validate Input', { query: 'q', provider: 'openai', openai_api_key: 'K', options, ...o });
let vw = VW({ allowed_domains: ['https://www.Flutter.dev/docs', 'flutter.dev', ' '], blocked_domains: ['Reddit.com'] });
T('Validate : normalisées, sans doublon', [['flutter.dev'], ['reddit.com']], [vw.options.allowed_domains, vw.options.blocked_domains]);
T('Validate : filtre effectif', { allowed_domains: ['flutter.dev'], blocked_domains: ['reddit.com'] }, vw.domain_filter);
T('Validate : sans listes → pas de filtre', null, VW({}).domain_filter);
vw = VW({ allowed_domains: ['docs.flutter.dev'], blocked_domains: ['flutter.dev'] });
T('⚠️ tout l’autorisé est bloqué → 422 domain_filter_empty', [false, 422, 'domain_filter_empty'], [vw.valid, vw.http_status, vw.error_code]);
T('… Build Error garde code et statut', ['domain_filter_empty', 422], (() => { const e = N('Build Error', vw).error; return [e.code, e.http_status]; })());
T('une autre erreur reste un 400', [400, 'VALIDATION_ERROR'], (() => { const e = N('Build Error', VW({}, { query: '' })).error; return [e.http_status, e.code]; })());

const PREP = { query: 'Quelle est la version de "Python" ?', model: 'gpt-5.6-luna', options: { search_depth: 'deep', max_results: 3 }, user_request: null };
let ob = JSON.parse(N('Prepare OpenAI Body', { ...PREP, domain_filter: { allowed_domains: ['python.org'], blocked_domains: [] } }).openai_body);
T('⚠️ openai : question à guillemets → JSON valide, intacte', 'Quelle est la version de "Python" ?', ob.input);
T('openai : modèle demandé, recherche imposée', ['gpt-5.6-luna', 'web_search'], [ob.model, ob.tool_choice.type]);
T('openai : deep → search_context_size high', 'high', ob.tools[0].search_context_size);
T('openai : filters.allowed_domains', { allowed_domains: ['python.org'] }, ob.tools[0].filters);
ob = JSON.parse(N('Prepare OpenAI Body', { ...PREP, options: {}, domain_filter: null }).openai_body);
T('openai : sans filtre ni profondeur → medium, pas de filters', ['medium', false], [ob.tools[0].search_context_size, 'filters' in ob.tools[0]]);
T('le nœud HTTP envoie CE corps', '={{ $json.openai_body }}', nd('OpenAI Web Search').parameters.jsonBody);
let cb = JSON.parse(N('Prepare Claude Body', { ...PREP, model: 'c', domain_filter: { allowed_domains: ['flutter.dev'], blocked_domains: ['x.com'] } }).claude_body);
T('claude : la blanche seule (400 si les deux)', [['flutter.dev'], undefined], [cb.tools[0].allowed_domains, cb.tools[0].blocked_domains]);
cb = JSON.parse(N('Prepare Claude Body', { ...PREP, model: 'c', domain_filter: { allowed_domains: [], blocked_domains: ['reddit.com'] } }).claude_body);
T('claude : la noire sinon', ['reddit.com'], cb.tools[0].blocked_domains);

const FOP = (entree, prev) => {
  const r = vm.runInNewContext(`(function(){${nd('Format Output').parameters.jsCode}})()`, {
    $input: { first: () => ({ json: entree }) },
    $: () => ({ first: () => ({ json: { ...AMONT, ...prev } }) }),
  }, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r;
};
const OK_TXT = { normalized: true, provider: 'claude', content: 't', sources: [], usage: {}, search_performed: true };
const FW = { allowed_domains: ['flutter.dev'], blocked_domains: [] };
for (const pt of ['openai', 'claude']) {
  const f = FOP(OK_TXT, { provider: pt, provider_type: pt, domain_filter: FW });
  T(`${pt} : domain_filter_applied true, sans avertissement`, [true, false], [f.meta.domain_filter_applied, 'warnings' in f.meta]);
}
for (const pt of ['gemini', 'mistral']) {
  const f = FOP(OK_TXT, { provider: pt, provider_type: pt, domain_filter: FW });
  T(`${pt} : non appliqué, signalé`, [false, 'DOMAIN_FILTER_NOT_APPLIED'], [f.meta.domain_filter_applied, f.meta.warnings?.[0]?.code]);
}
let fo2 = FOP(OK_TXT, { provider: 'claude-haiku', provider_type: 'claude', domain_filter: { allowed_domains: ['python.org'], blocked_domains: ['bugs.python.org'] } });
T('⚠️ claude : sous-domaine bloqué sous l’autorisé → PARTIAL', ['DOMAIN_FILTER_PARTIAL', ['bugs.python.org']],
  [fo2.meta.warnings?.[0]?.code, fo2.meta.warnings?.[0]?.blocked_domains]);
fo2 = FOP({ ...OK_TXT, structured_data: { tool_name: 'x', data: {} } }, { provider: 'gemini', provider_type: 'gemini', domain_filter: FW });
T('sortie structurée → signalé aussi', 'DOMAIN_FILTER_NOT_APPLIED', fo2.meta.warnings?.[0]?.code);
fo2 = FOP(OK_TXT, { domain_filter: null });
T('sans filtre : forme inchangée', [false, false], ['domain_filter_applied' in fo2.meta, 'warnings' in fo2.meta]);
fo2 = FOP(OK_TXT, {});
T('amont sans domain_filter : forme inchangée', false, 'warnings' in fo2.meta);
const doc = JSON.stringify(nd('Documentation').parameters);
T('la documentation ne prétend plus « Claude only »', false, /Claude only|only works with Claude/.test(doc));
T('… ni « non appliqué » chez tous', false, /NON APPLIQUÉ|transmis à aucun/.test(doc));

console.log('\n11. ⚠️ ce que la sonde du 14/09 a trouvé');
// S6 : 422 dans le corps, 400 sur le fil.
T('Respond Error : statut lu, plus de 400 en dur', '={{ $json.error?.http_status || 400 }}',
  nd('Respond Error').parameters.options.responseCode);
// S9 / S3 : OpenAI a cherché (web_search_call) sans citer d'URL → search_performed était faux.
for (const [fic, n] of [['openai_meteo_sans_citation.json', 1], ['openai_noire_open_page.json', 2]]) {
  const fx = FXW(fic);
  const citations = fx.output.filter((o) => o.type === 'message').flatMap((o) => o.content).flatMap((c) => c.annotations || []);
  T(`${fic.slice(0, 26)} : ${n} recherche(s), 0 citation`, [n, 0], [fx.output.filter((o) => o.type === 'web_search_call').length, citations.length]);
  const ro = NS('Normalize OpenAI', fx, 'openai');
  T('⚠️ … search_performed vrai, 0 source, succès', [true, 0, true], [ro.search_performed, ro.sources.length, ro.normalized]);
}
T('openai sans appel d’outil : search_performed faux', false,
  NS('Normalize OpenAI', { output: [{ type: 'message', content: [{ type: 'output_text', text: '51', annotations: [] }] }], usage: {} }, 'openai').search_performed);
// S10 : annonces de Claude.
const fxC = FXW('claude_meteo_annonces.json');
const annoncesC = fxC.content.filter((b, i) => b.type === 'text' && fxC.content[i + 1]?.type === 'server_tool_use').map((b) => b.text);
let rc = NS('Normalize Claude', fxC, 'claude');
T('claude réel : la fixture contient des annonces', true, annoncesC.length > 0);
T('⚠️ claude : aucune annonce dans la réponse', [], annoncesC.filter((a) => rc.content.includes(a)));
T('… la fin de la réponse est intacte', true, rc.content.endsWith(fxC.content.filter((b) => b.type === 'text').at(-1).text));
T('… recherche constatée, sources lues', [true, true], [rc.search_performed, rc.sources.length > 0]);
rc = NS('Normalize Claude', { content: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result', content: [] },
  { type: 'text', text: 'Rien trouvé.' }], usage: { server_tool_use: { web_search_requests: 1 } } }, 'claude');
T('claude : cherché sans résultat → search_performed vrai', [true, 0, 'Rien trouvé.'], [rc.search_performed, rc.sources.length, rc.content]);
rc = NS('Normalize Claude', { content: [{ type: 'text', text: 'bon' }, { type: 'text', text: 'jour' }], usage: {} }, 'claude');
T('claude sans recherche : tous les blocs, search_performed faux', ['bonjour', false], [rc.content, rc.search_performed]);
// S8 : jetons de recherche Mistral.
const rmc = NM({ ...CONV, usage: { prompt_tokens: 807, completion_tokens: 97, total_tokens: 7552, connector_tokens: 6648 } }, AM);
T('mistral : jetons de recherche comptés en entrée', [7455, 97, 7552], [rmc.usage.input_tokens, rmc.usage.output_tokens, rmc.usage.total_tokens]);

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
process.exit(ko === 0 ? 0 : 1);
