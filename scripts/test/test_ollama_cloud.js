#!/usr/bin/env node
/**
 * Branche `ollama-cloud` de LLM - Call Messages (azy.daily#340).
 *
 * Ollama Cloud sert la surface compatible OpenAI — mesuré : POST /v1/chat/completions
 * rend 401 au format d'erreur OpenAI. Le transport est donc celui d'OpenAI, mais
 * l'ÉTIQUETTE reste `ollama-cloud` de bout en bout : `openai` ferait compter
 * l'audit au prix d'OpenAI.
 *
 *   node scripts/test/test_ollama_cloud.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const W = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../workflows/LLM_-_Call_Messages.json'), 'utf8'));
const nd = (n) => W.nodes.find((x) => x.name === n);
const aval = (n) => (W.connections[n]?.main || []).map((l) => l.map((c) => c.node));

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(50)} ${String(JSON.stringify(obtenu)).slice(0, 46)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};

/** Exécute Validate Input dans le bac à sable n8n. */
const V = (body) => {
  const r = vm.runInNewContext(`(function(){${nd('Validate Input').parameters.jsCode}})()`, {
    $input: { first: () => ({ json: { body } }) }, $env: {},
    JSON, String, Number, Array, Object, Date, Math, parseInt, parseFloat, isNaN, Error, RegExp,
  }, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r;
};

console.log('\n1. `ollama-cloud` est accepté, et lui seul');
const BASE = { model: 'gemma4:31b', api_key: 'K', messages: [{ role: 'user', content: 'x' }] };
T('ollama-cloud accepté', 'ollama-cloud', V({ ...BASE, provider: 'ollama-cloud' }).provider);
// ⚠️ `ollama` seul n'est PAS le code retenu : le catalogue dit `ollama-cloud`.
T('« ollama » seul refusé', false, V({ ...BASE, provider: 'ollama' }).valid !== false ? true : false);
T('les quatre historiques marchent toujours',
  ['anthropic', 'openai', 'mistral', 'google'],
  ['anthropic', 'openai', 'mistral', 'google'].map((p) => V({ ...BASE, provider: p }).provider));

console.log('\n2. l’aiguillage');
const sw = nd('Switch Provider').parameters.rules.values;
// + openai-responses et mistral-conversations (azy.daily#281, #361) : l'index 4 ne bouge pas.
T('sept sorties', 7, sw.length);
T('la cinquième est ollama-cloud', 'ollama-cloud', sw[4].outputKey);
T('… et teste la bonne valeur', 'ollama-cloud', sw[4].conditions.conditions[0].rightValue);
T('Switch [4] → Ollama Cloud API', ['Ollama Cloud API'], aval('Switch Provider')[4]);
T('Ollama Cloud API → Format Ollama', [['Format Ollama']], aval('Ollama Cloud API'));
T('Format Ollama rejoint le Merge commun', aval('Format OpenAI'), aval('Format Ollama'));

console.log('\n3. l’appel vise Ollama, pas OpenAI');
const api = nd('Ollama Cloud API').parameters;
T('URL de base', 'https://ollama.com/v1/chat/completions', api.url);
T('authentification Bearer', '=Bearer {{ $json.api_key }}',
  api.headerParameters.parameters.find((h) => h.name === 'Authorization').value);
T('statut réel lisible (fullResponse+neverError)', { fullResponse: true, neverError: true },
  api.options.response.response);
T('onError posé', 'continueRegularOutput', nd('Ollama Cloud API').onError);

console.log('\n4. ⚠️ aucune étiquette `openai` ne survit');
const fmt = nd('Format Ollama').parameters.jsCode;
T('Format Ollama : aucun provider openai', false, /provider:\s*'openai'/.test(fmt));
T('Format Ollama : provider ollama-cloud', true, /provider:\s*'ollama-cloud'/.test(fmt));
T('l’URL OpenAI n’apparaît pas dans la branche', false,
  JSON.stringify(nd('Ollama Cloud API')).includes('api.openai.com'));

console.log('\n5. ⚠️ aucune expression tronquée par un `}}` interne');
const creuse = (v, ou, out) => {
  if (typeof v === 'string') { if (v.startsWith('=')) out.push([ou, v]); }
  else if (Array.isArray(v)) v.forEach((x, i) => creuse(x, `${ou}[${i}]`, out));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => creuse(x, `${ou}.${k}`, out));
};
for (const nom of ['Ollama Cloud API', 'Switch Provider']) {
  const out = []; creuse(nd(nom).parameters, nom, out);
  for (const [ou, v] of out) {
    const corps = v.slice(1); const i = corps.indexOf('{{');
    T(ou.slice(0, 48), false, i >= 0 && corps.slice(i + 2, corps.lastIndexOf('}}')).includes('}}'));
  }
}

console.log('\n6. le corps envoyé : rien n’est fabriqué, tout est relayé');
const corpsDe = (json) => {
  const expr = api.jsonBody.replace(/^=\{\{/, '').replace(/\}\}$/, '');
  return JSON.parse(vm.runInNewContext(`(${expr})`, { $json: json, JSON }, { timeout: 3000 }));
};
let b = corpsDe({ model: 'gemma4:31b', max_tokens: 512, temperature: 0.2,
  messages: [{ role: 'user', content: 'salut' }] });
T('modèle relayé tel quel', 'gemma4:31b', b.model);
T('max_tokens relayé', 512, b.max_tokens);
T('temperature relayée', 0.2, b.temperature);

b = corpsDe({ model: 'm', max_tokens: 8, system: 'SYS', messages: [{ role: 'user', content: 'x' }] });
T('system placé en tête', ['system', 'user'], b.messages.map((m) => m.role));

// ⚠️ La surface étant compatible OpenAI, un bloc image_url traverse SANS conversion.
// C'est ce qui rend la mesure vision une vérification, non un choix de conception.
const img = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } };
b = corpsDe({ model: 'm', max_tokens: 8, messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }, img] }] });
T('bloc image_url traversé intact', img, b.messages[0].content[1]);

b = corpsDe({ model: 'm', max_tokens: 8, messages: [] });
T('temperature omise si absente', false, 'temperature' in b);

console.log('\n7. ⚠️ Format Ollama exécuté — la structure ne suffisait pas');
// Ces contrôles sont nés d'un faux succès mesuré en production le 2026-09-08 :
// une clé volontairement fausse rendait success:true. Les 29 contrôles
// précédents vérifiaient l'URL, le câblage et les étiquettes — aucun n'avait
// jamais FAIT TOURNER le formateur sur une réponse en erreur.
const F = (enveloppe) => vm.runInNewContext(
  `(function(){${nd('Format Ollama').parameters.jsCode}})()`, {
    $input: { first: () => ({ json: enveloppe }) },
    $: () => ({ first: () => ({ json: { model: 'gemma4:31b', startTime: Date.now(), metadata: {} } }) }),
    JSON, String, Number, Object, Array, Date, Math, parseInt, parseFloat, isNaN, Error, RegExp,
  }, { timeout: 5000 });

let r = F({ statusCode: 401, body: { error: { message: 'Unauthorized' } } });
T('401 → échec, pas succès', false, r.success);
T('401 → statut relayé', 401, r.error.http_status);
T('401 → étiquette conservée', 'ollama-cloud', r._trace.provider);

r = F({ statusCode: 404, body: { error: { message: 'model not found' } } });
T('404 → statut relayé', 404, r.error.http_status);

r = F({ statusCode: 200, body: { choices: [{ message: { content: 'bonjour' }, finish_reason: 'stop' }],
        model: 'gemma4:31b', usage: { prompt_tokens: 3, completion_tokens: 2 } } });
T('200 avec texte → succès', true, r.success);
T('… texte rendu', 'bonjour', r.data.text);
T('… modèle réellement servi', 'gemma4:31b', r.meta.model);
T('… étiquette ollama-cloud', 'ollama-cloud', r.meta.provider);

r = F({ statusCode: 200, body: { choices: [] } });
T('200 sans texte → échec explicite', [false, 502], [r.success, r.error.http_status]);

// panne de transport : onError attrape, aucun statusCode n'est émis
r = F({ error: { message: 'Request failed with status code 429 - {"e":1}' } });
T('statut lu dans le message quand absent', 429, r.error.http_status);
r = F({ error: { message: 'socket hang up' } });
T('panne de transport → 502', 502, r.error.http_status);

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
process.exit(ko === 0 ? 0 : 1);
