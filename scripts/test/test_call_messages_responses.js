#!/usr/bin/env node
/**
 * LLM - Call Messages : surface `responses` et recherche web (azy.daily#281, #361).
 *
 * Deux trous mesurés le 2026-09-10 :
 *   - gpt-5-pro par le dispatch → 404 « only supported in v1/responses » :
 *     le webhook n'appelait que chat/completions ;
 *   - `web_search` n'était lu nulle part — et il ne PEUT pas passer par
 *     chat/completions : OpenAI rend 400 invalid_value (gpt-5.6-terra compris),
 *     Mistral 400 « WebSearchTool connector is not supported ».
 *
 * Les fixtures sont des réponses RÉELLES, capturées le même jour avec les corps
 * exacts que ce workflow envoie (scripts/test/fixtures/call_messages/).
 *
 *   node scripts/test/test_call_messages_responses.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const W = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../workflows/LLM_-_Call_Messages.json'), 'utf8'));
const FX = (nom) => JSON.parse(fs.readFileSync(
  path.resolve(__dirname, 'fixtures/call_messages', nom), 'utf8'));
const nd = (n) => W.nodes.find((x) => x.name === n);
const aval = (n) => (W.connections[n]?.main || []).map((l) => l.map((c) => c.node));

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(54)} ${String(JSON.stringify(obtenu)).slice(0, 42)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};

/** Validate Input dans le bac à sable n8n. */
const V = (body) => {
  const r = vm.runInNewContext(`(function(){${nd('Validate Input').parameters.jsCode}})()`, {
    $input: { first: () => ({ json: { body } }) }, $env: {},
  }, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r;
};
/** Un Code node quelconque, `$('Validate Input')` rendant `prev`. */
const F = (nom, entree, prev) => {
  const r = vm.runInNewContext(`(function(){${nd(nom).parameters.jsCode}})()`, {
    $input: { first: () => ({ json: entree }) },
    $: () => ({ first: () => ({ json: prev }) }),
  }, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r;
};
/** Évalue le jsonBody `={{ … }}` d'un nœud HTTP comme n8n le ferait. */
const corpsDe = (nom, json) => {
  const expr = nd(nom).parameters.jsonBody.replace(/^=\{\{/, '').replace(/\}\}$/, '');
  return JSON.parse(vm.runInNewContext(`(${expr})`, { $json: json }, { timeout: 3000 }));
};
// Les nœuds à fullResponse + neverError émettent cette enveloppe.
const env = (body, statusCode = 200) => ({ statusCode, body, headers: {} });

const BASE = { api_key: 'K', messages: [{ role: 'user', content: 'x' }] };
const PREV = (o) => ({ metadata: { m: 1 }, startTime: Date.now(), ...o });

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1. Validate Input décide la route — et elle vaut provider partout ailleurs');
for (const p of ['anthropic', 'openai', 'mistral', 'google', 'ollama-cloud']) {
  T(`${p} sans recherche ni surface → route ${p}`, p, V({ ...BASE, provider: p, model: 'm' }).route);
}
const vo = (o) => V({ ...BASE, provider: 'openai', model: 'gpt-5-pro', ...o });
T('surface responses → openai-responses', 'openai-responses', vo({ surface: 'responses' }).route);
T('surface RESPONSES (casse) → openai-responses', 'openai-responses', vo({ surface: ' RESPONSES ' }).route);
T('surface dans context → lue aussi', 'openai-responses',
  V({ provider: 'openai', model: 'm', context: { api_key: 'K', messages: BASE.messages, surface: 'responses' } }).route);
T('surface chat_completions → voie historique', 'openai', vo({ surface: 'chat_completions' }).route);
T('surface inconnue → voie historique', 'openai', vo({ surface: 'zzz' }).route);
// ⚠️ la règle ① : l'outil impose son endpoint, la surface n'y peut rien
T('⚠️ web_search sur un modèle chat_completions → responses', 'openai-responses',
  vo({ surface: 'chat_completions', web_search: true }).route);
T('web_search "true" (chaîne) reconnu', true, vo({ web_search: 'true' }).web_search);
T('web_search absent → false', false, vo({}).web_search);
T('web_search false → voie historique', 'openai', vo({ web_search: false }).route);
T('mistral + web_search → conversations', 'mistral-conversations',
  V({ ...BASE, provider: 'mistral', model: 'm', web_search: true }).route);
T('anthropic + web_search → même voie (outil ajouté)', 'anthropic',
  V({ ...BASE, provider: 'anthropic', model: 'm', web_search: true }).route);
T('google + web_search → même voie (outil ajouté)', 'google',
  V({ ...BASE, provider: 'google', model: 'm', web_search: true }).route);
T('surface responses ignorée hors OpenAI', 'anthropic',
  V({ ...BASE, provider: 'anthropic', model: 'm', surface: 'responses' }).route);

console.log('\n2. ⚠️ une recherche impossible rend un 422, jamais un silence');
const r422 = V({ ...BASE, provider: 'ollama-cloud', model: 'gemma4:31b', web_search: true });
T('ollama-cloud + web_search → invalide', false, r422.valid);
T('… statut 422', 422, r422.http_status);
T('… code du contrat', 'web_search_unavailable', r422.error_code);
T('… model_id rendu', 'gemma4:31b', r422.model_id);
T('ollama-cloud sans web_search → inchangé', [true, 'ollama-cloud'],
  [V({ ...BASE, provider: 'ollama-cloud', model: 'm' }).valid, V({ ...BASE, provider: 'ollama-cloud', model: 'm' }).route]);
let be = F('Build Error', r422);
T('Build Error : forme du contrat', { code: 'web_search_unavailable',
  message: "La recherche web n'est pas disponible pour ce modèle.", http_status: 422, model_id: 'gemma4:31b' }, be.error);
be = F('Build Error', V({ provider: 'openai' }));
T('Build Error : validation classique toujours en 400', ['VALIDATION_ERROR', 400], [be.error.code, be.error.http_status]);
T('Respond Error : statut lu, plus de 400 en dur', '={{ $json.error?.http_status || 400 }}',
  nd('Respond Error').parameters.options.responseCode);

console.log('\n3. l’aiguillage');
const sw = nd('Switch Provider').parameters.rules.values;
T('sept sorties, dans cet ordre', ['anthropic', 'openai', 'mistral', 'google', 'ollama-cloud',
  'openai-responses', 'mistral-conversations'], sw.map((r) => r.conditions.conditions[0].rightValue));
T('toutes testent la route', true, sw.every((r) => r.conditions.conditions[0].leftValue === '={{ $json.route }}'));
T('les cinq historiques n’ont pas bougé', ['Anthropic API', 'OpenAI API', 'Mistral API', 'Gemini API', 'Ollama Cloud API'],
  aval('Switch Provider').slice(0, 5).map((l) => l[0]));
T('[5] → OpenAI Responses API', ['OpenAI Responses API'], aval('Switch Provider')[5]);
T('[6] → Mistral Conversations API', ['Mistral Conversations API'], aval('Switch Provider')[6]);
T('OpenAI Responses API → son formatteur', [['Format OpenAI Responses']], aval('OpenAI Responses API'));
T('Mistral Conversations API → son formatteur', [['Format Mistral Conversations']], aval('Mistral Conversations API'));
for (const f of ['Format OpenAI Responses', 'Format Mistral Conversations']) {
  T(`${f} rejoint le Merge commun`, aval('Format OpenAI'), aval(f));
}
for (const [nom, url] of [['OpenAI Responses API', 'https://api.openai.com/v1/responses'],
  ['Mistral Conversations API', 'https://api.mistral.ai/v1/conversations']]) {
  const n = nd(nom);
  T(`${nom} : URL`, url, n.parameters.url);
  T(`${nom} : statut réel lisible`, { fullResponse: true, neverError: true }, n.parameters.options.response.response);
  T(`${nom} : clé BYOT, jamais $env`, '=Bearer {{ $json.api_key }}',
    n.parameters.headerParameters.parameters.find((h) => h.name === 'Authorization').value);
}
T('aucune clé lue dans $env', false, JSON.stringify(W.nodes).includes('$env.'));

console.log('\n4. ⚠️ aucune expression tronquée par un `}}` interne');
const creuse = (v, ou, out) => {
  if (typeof v === 'string') { if (v.startsWith('=')) out.push([ou, v]); }
  else if (Array.isArray(v)) v.forEach((x, i) => creuse(x, `${ou}[${i}]`, out));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => creuse(x, `${ou}.${k}`, out));
};
const expressions = [];
for (const n of W.nodes) creuse(n.parameters, n.name, expressions);
const tronquees = expressions.filter(([, v]) => {
  const corps = v.slice(1); const i = corps.indexOf('{{');
  return i >= 0 && corps.slice(i + 2, corps.lastIndexOf('}}')).includes('}}');
}).map(([ou]) => ou);
T(`${expressions.length} expressions, aucune tronquée`, [], tronquees);

console.log('\n5. les corps envoyés');
const D = { model: 'gpt-5.6-terra', max_tokens: 300, temperature: 0.4, raisonnement: true,
  system: 'SYS', messages: [{ role: 'user', content: 'q' }] };
let b = corpsDe('OpenAI Responses API', { ...D, web_search: true });
T('responses : messages → input', [{ role: 'user', content: 'q' }], b.input);
T('responses : system → instructions', 'SYS', b.instructions);
T('responses : pas de `messages`', false, 'messages' in b);
T('responses : outil web_search', [{ type: 'web_search' }], b.tools);
T('responses : pas de tool_choice forcé', false, 'tool_choice' in b);
T('responses : raisonnement → plancher 1024, sans temperature', [1024, false], [b.max_output_tokens, 'temperature' in b]);
b = corpsDe('OpenAI Responses API', { ...D, raisonnement: false });
T('responses : sans raisonnement → budget et temperature relayés', [300, 0.4], [b.max_output_tokens, b.temperature]);
T('responses : sans web_search → aucun outil', false, 'tools' in b);
const img = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } };
b = corpsDe('OpenAI Responses API', { ...D, messages: [
  { role: 'user', content: [{ type: 'text', text: 'décris' }, img] },
  { role: 'assistant', content: [{ type: 'text', text: 'un chat' }] }] });
T('responses : text → input_text', { type: 'input_text', text: 'décris' }, b.input[0].content[0]);
T('responses : image_url → input_image', { type: 'input_image', image_url: 'data:image/png;base64,AAA' }, b.input[0].content[1]);
T('responses : texte assistant → output_text', 'output_text', b.input[1].content[0].type);

const DA = { model: 'claude-haiku-4-5-20251001', max_tokens: 300, temperature: 0.4, messages: [{ role: 'user', content: 'q' }] };
b = corpsDe('Anthropic API', { ...DA, web_search: true });
T('anthropic : outil web_search_20250305', [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }], b.tools);
T('anthropic : sans web_search → corps inchangé', false, 'tools' in corpsDe('Anthropic API', DA));

const DG = { model: 'gemini-3.6-flash', max_tokens: 300, temperature: 0.4, messages: [{ role: 'user', content: 'q' }] };
T('gemini : outil google_search', [{ google_search: {} }], corpsDe('Gemini API', { ...DG, web_search: true }).tools);
T('gemini : sans web_search → corps inchangé', false, 'tools' in corpsDe('Gemini API', DG));

b = corpsDe('Mistral Conversations API', { model: 'mistral-medium-latest', max_tokens: 300, temperature: 0.4,
  system: 'SYS', messages: [{ role: 'system', content: 'S2' }, { role: 'user', content: 'q' }] });
T('conversations : store:false (aucun agent)', false, b.store);
T('conversations : outil en ligne', [{ type: 'web_search' }], b.tools);
const DOC_MISTRAL = 'You have the ability to perform web searches with `web_search` to find up-to-date information.';
T('conversations : system, messages system, puis la consigne', `SYS\n\nS2\n\n${DOC_MISTRAL}`, b.instructions);
// ⚠️ Sans instructions, Mistral s'arrête souvent après sa recherche (0/6 contre 6/6).
T('conversations : sans system, la consigne part quand même', DOC_MISTRAL,
  corpsDe('Mistral Conversations API', { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'q' }] }).instructions);
T('conversations : inputs sans system', [{ role: 'user', content: 'q' }], b.inputs);
// ⚠️ temperature 0.7 : 7/10 réponses ; sans : 10/10 (mesuré le 2026-09-11).
T('conversations : le budget, jamais de temperature', { max_tokens: 300 }, b.completion_args);

console.log('\n6. les formatteurs, sur les réponses RÉELLES');
// OpenAI /v1/responses + recherche (gpt-5.6-terra)
const fxO = FX('openai_responses_web_search.json');
let r = F('Format OpenAI Responses', env(fxO), PREV({ provider: 'openai', model: 'gpt-5.6-terra', web_search: true }));
T('openai : succès', true, r.success);
T('openai : texte extrait de output[]', true, /Poga/.test(r.data.text));
T('openai : source citée', 1, r.data.sources.length);
T('openai : recherche constatée', [true, 1], [r.meta.search_performed, r.meta.usage.web_search_requests]);
T('openai : usage input/output → prompt/completion', [7786, 118, 7904],
  [r.meta.usage.prompt_tokens, r.meta.usage.completion_tokens, r.meta.usage.total_tokens]);
T('openai : jetons de raisonnement en détail', 70, r.meta.usage.reasoning_tokens);
T('openai : completed → stop', 'stop', r.data.finish_reason);
T('openai : étiquette openai', 'openai', r.meta.provider);

// gpt-5-pro, surface responses, sans recherche
r = F('Format OpenAI Responses', env(FX('openai_responses_gpt5pro.json')), PREV({ provider: 'openai', model: 'gpt-5-pro', web_search: false }));
T('gpt-5-pro : « ok »', [true, 'ok'], [r.success, r.data.text]);
T('gpt-5-pro : aucun champ de recherche sans demande', [false, false], ['sources' in r.data, 'search_performed' in r.meta]);

// les échecs
r = F('Format OpenAI Responses', env({ error: { message: 'This model is only supported in v1/responses and not in v1/chat/completions.',
  type: 'invalid_request_error', code: null } }, 404), PREV({ provider: 'openai', model: 'm' }));
T('openai : 404 relayé avec son statut', [false, 404], [r.success, r.error.http_status]);
T('… et le message du fournisseur', true, /only supported/.test(r.error.message));
r = F('Format OpenAI Responses', env({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
  output: [{ type: 'reasoning' }], error: null, usage: {} }), PREV({ provider: 'openai', model: 'm' }));
T('openai : budget mangé par le raisonnement → 502 explicite', [false, 502, true],
  [r.success, r.error.http_status, /max_output_tokens/.test(r.error.message)]);
r = F('Format OpenAI Responses', { error: { message: 'timeout of 300000ms exceeded' }, code: 'ECONNABORTED' },
  PREV({ provider: 'openai', model: 'm' }));
T('openai : panne de transport → 502', [false, 502], [r.success, r.error.http_status]);

// Anthropic + recherche (claude-haiku-4-5)
const fxA = FX('anthropic_web_search.json');
r = F('Format Anthropic', fxA, PREV({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001', web_search: true }));
T('⚠️ anthropic : texte lu malgré content[0] = server_tool_use', [true, 'server_tool_use', true],
  [r.success, fxA.content[0].type, r.data.text.length > 0]);
const citees = new Set(fxA.content.filter((x) => x.type === 'text')
  .flatMap((x) => (x.citations || []).map((c) => c.url)));
T('anthropic : sources = URL citées, dédoublonnées', [...citees], r.data.sources.map((s) => s.url));
T('anthropic : web_search_requests lu dans usage', 1, r.meta.usage.web_search_requests);
r = F('Format Anthropic', { content: [{ type: 'text', text: 'bon' }, { type: 'text', text: 'jour' }],
  usage: { input_tokens: 3, output_tokens: 2 }, stop_reason: 'end_turn', model: 'c' },
  PREV({ provider: 'anthropic', model: 'c', web_search: false }));
T('anthropic sans recherche : tous les blocs texte', 'bonjour', r.data.text);
T('anthropic sans recherche : forme inchangée', [false, false], ['sources' in r.data, 'search_performed' in r.meta]);
r = F('Format Anthropic', { content: [{ type: 'server_tool_use', name: 'web_search' }], stop_reason: 'pause_turn', usage: {} },
  PREV({ provider: 'anthropic', model: 'c', web_search: true }));
T('anthropic : recherche sans texte → 502, pas un succès vide', [false, 502], [r.success, r.error.http_status]);

// Gemini + recherche (gemini-3.6-flash)
r = F('Format Gemini', FX('gemini_web_search.json'), PREV({ provider: 'google', model: 'gemini-3.6-flash', web_search: true }));
T('gemini : succès', true, r.success);
T('⚠️ gemini : domaine réel, pas la redirection vertexaisearch', ['wikipedia.org', 'total-velo.com'],
  r.data.sources.map((s) => s.domain));
T('gemini : recherche constatée', [true, 1], [r.meta.search_performed, r.meta.usage.web_search_requests]);
r = F('Format Gemini', { candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'STOP' }], usageMetadata: {} },
  PREV({ provider: 'google', model: 'g', web_search: false }));
T('gemini sans recherche : forme inchangée', [true, false], [r.success, 'sources' in r.data]);

// Mistral /v1/conversations + recherche
const fxM = FX('mistral_conversations_web_search.json');
r = F('Format Mistral Conversations', env(fxM), PREV({ provider: 'mistral', model: 'mistral-medium-latest', web_search: true }));
T('mistral : succès, texte recomposé', [true, true], [r.success, /Poga/.test(r.data.text)]);
const refs = new Set(fxM.outputs.filter((o) => o.type === 'message.output')
  .flatMap((o) => o.content.filter((c) => c.type === 'tool_reference').map((c) => c.url)));
T('mistral : sources = tool_reference dédoublonnées', [...refs], r.data.sources.map((s) => s.url));
T('mistral : recherche constatée', [true, 1], [r.meta.search_performed, r.meta.usage.web_search_requests]);
// ⚠️ Mistral compte à part ce que la recherche injecte ; OpenAI et Anthropic le
// comptent dans l'entrée. Replié : entrée → sortie montre ce qui a été consommé.
T('⚠️ mistral : connecteur replié dans l’entrée', [788 + 6900, 60, 7748],
  [r.meta.usage.prompt_tokens, r.meta.usage.completion_tokens, r.meta.usage.total_tokens]);
T('… détail fourni en supplément', 6900, r.meta.usage.connector_tokens);
T('mistral : étiquette mistral', 'mistral', r.meta.provider);
// Réponse réelle du 2026-09-10 : Mistral a cherché, n'a rien rédigé, HTTP 200.
r = F('Format Mistral Conversations', env(FX('mistral_conversations_sans_message.json')), PREV({ provider: 'mistral', model: 'm', web_search: true }));
T('mistral : cherché sans rédiger → erreur qui le dit', [false, 502, 'Mistral a effectue la recherche mais n a pas redige de reponse'],
  [r.success, r.error.http_status, r.error.message]);

console.log('\n7. ⚠️ entrée + sortie = total, chez les quatre (azy.daily#361)');
// Un client affiche « entrée → sortie » : si la somme ne fait pas le total, son
// écran montre un coût qui n'est pas celui consommé.
const sommes = [
  ['openai', F('Format OpenAI Responses', env(fxO), PREV({ provider: 'openai', model: 'm', web_search: true }))],
  ['anthropic', F('Format Anthropic', fxA, PREV({ provider: 'anthropic', model: 'm', web_search: true }))],
  ['google', F('Format Gemini', FX('gemini_web_search.json'), PREV({ provider: 'google', model: 'm', web_search: true }))],
  ['mistral', F('Format Mistral Conversations', env(fxM), PREV({ provider: 'mistral', model: 'm', web_search: true }))],
];
for (const [p, x] of sommes) {
  const u = x.meta.usage;
  T(`${p} : prompt + completion = total`, u.total_tokens, u.prompt_tokens + u.completion_tokens);
}

console.log('\n8. « a cherché, rien retenu » ≠ « n’a pas cherché »');
// La liste vide seule confondrait les deux ; desktop les affiche différemment.
r = F('Format OpenAI Responses', env({ status: 'completed', error: null, usage: {}, output: [
  { type: 'web_search_call', status: 'completed' },
  { type: 'message', content: [{ type: 'output_text', text: 'rien trouvé', annotations: [] }] }] }),
  PREV({ provider: 'openai', model: 'm', web_search: true }));
T('openai : cherché, 0 source → search_performed vrai', [true, 0, 0],
  [r.meta.search_performed, r.data.sources.length, r.meta.sources_count]);
r = F('Format OpenAI Responses', env({ status: 'completed', error: null, usage: {}, output: [
  { type: 'message', content: [{ type: 'output_text', text: 'bonjour', annotations: [] }] }] }),
  PREV({ provider: 'openai', model: 'm', web_search: true }));
T('openai : pas cherché → search_performed faux', [false, 0], [r.meta.search_performed, r.data.sources.length]);
r = F('Format Mistral Conversations', env({ outputs: [{ type: 'tool.execution', name: 'web_search' },
  { type: 'message.output', content: [{ type: 'text', text: 'rien' }] }], usage: {} }),
  PREV({ provider: 'mistral', model: 'm', web_search: true }));
T('mistral : cherché, 0 source → search_performed vrai', [true, 0], [r.meta.search_performed, r.data.sources.length]);

console.log('\n9. le compteur compte la liste — dédoublonnage partout');
const doublon = { type: 'url_citation', title: 'A', url: 'https://a.org/x' };
r = F('Format OpenAI Responses', env({ status: 'completed', error: null, usage: {}, output: [
  { type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text: 't',
    annotations: [doublon, doublon, { type: 'url_citation', title: 'B', url: 'https://b.org/y' }] }] }] }),
  PREV({ provider: 'openai', model: 'm', web_search: true }));
T('openai : 3 citations dont 1 doublon → 2 sources, compteur 2', [2, 2], [r.data.sources.length, r.meta.sources_count]);
r = F('Format Gemini', { candidates: [{ content: { parts: [{ text: 't' }] }, finishReason: 'STOP',
  groundingMetadata: { webSearchQueries: ['q'], groundingChunks: [
    { web: { uri: 'https://vertexaisearch.cloud.google.com/r/1', title: 'a.org' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/r/1', title: 'a.org' } }] } }], usageMetadata: {} },
  PREV({ provider: 'google', model: 'g', web_search: true }));
T('gemini : doublon d’ancrage → 1 source, compteur 1', [1, 1], [r.data.sources.length, r.meta.sources_count]);
r = F('Format Mistral Conversations', env({ message: 'Unauthorized', request_id: 'x' }, 401), PREV({ provider: 'mistral', model: 'm', web_search: true }));
T('mistral : 401 relayé', [false, 401, 'Unauthorized'], [r.success, r.error.http_status, r.error.message]);
r = F('Format Mistral Conversations', env({ object: 'Error', detail: [{ msg: 'bad' }] }, 422), PREV({ provider: 'mistral', model: 'm', web_search: true }));
T('mistral : 422 à détail structuré relayé', [false, 422, true], [r.success, r.error.http_status, /bad/.test(r.error.message)]);

console.log('\n10. ⚠️ un filtre de domaines demandé au dispatch est SIGNALÉ, jamais perdu');
// Contrat proposé par l'api (azy.daily#361) : allowed_domains / blocked_domains relayés
// tels quels sur le dispatch. Pas encore branchés vers les fournisseurs : n8n le dit.
const vd = V({ ...BASE, provider: 'anthropic', model: 'm', web_search: true,
  allowed_domains: [' NASA.gov ', '', 'space.com'], blocked_domains: 'pas-une-liste' });
T('Validate : listes lues, normalisées', [['nasa.gov', 'space.com'], []], [vd.allowed_domains, vd.blocked_domains]);
T('Validate : sans listes → tableaux vides', [[], []],
  [V({ ...BASE, provider: 'openai', model: 'm' }).allowed_domains, V({ ...BASE, provider: 'openai', model: 'm' }).blocked_domains]);
const REP_OK = { success: true, data: { text: 't', sources: [] }, meta: { provider: 'anthropic', search_performed: true, sources_count: 0 } };
let sg = F('Signal filtre domaines', REP_OK, { web_search: true, allowed_domains: ['nasa.gov'], blocked_domains: [] });
T('recherche + liste blanche → signalé', [false, 'DOMAIN_FILTER_NOT_APPLIED'], [sg.meta.domain_filter_applied, sg.meta.warnings?.[0]?.code]);
T('… le reste de meta est conservé', [true, 0], [sg.meta.search_performed, sg.meta.sources_count]);
sg = F('Signal filtre domaines', REP_OK, { web_search: true, allowed_domains: [], blocked_domains: ['facebook.com'] });
T('recherche + liste noire → signalé', false, sg.meta.domain_filter_applied);
sg = F('Signal filtre domaines', REP_OK, { web_search: false, allowed_domains: ['nasa.gov'], blocked_domains: [] });
T('sans recherche : rien à filtrer, réponse intacte', REP_OK, sg);
sg = F('Signal filtre domaines', REP_OK, { web_search: true, allowed_domains: [], blocked_domains: [] });
T('recherche sans liste : réponse intacte', REP_OK, sg);
const REP_KO = { success: false, error: { code: 'X', http_status: 502 } };
T('une erreur passe intacte', REP_KO, F('Signal filtre domaines', REP_KO, { web_search: true, allowed_domains: ['a.org'] }));
T('câblage : Merge → Signal → Respond', [[['Signal filtre domaines']], [['Respond']]], [aval('Merge'), aval('Signal filtre domaines')]);

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
process.exit(ko === 0 ? 0 : 1);
