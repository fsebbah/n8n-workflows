#!/usr/bin/env node
/**
 * LLM - Call Messages : raisonnement (azy.daily#365) et niveau de service (azy.daily#378).
 *
 * Contrat api du 14/09 : chat.api résout au catalogue le fragment fournisseur
 * `reasoning_config` et le niveau `reasoning_effort` ; il relaie `service_tier`.
 * n8n les place dans le corps et renvoie le niveau SERVI dans l'usage.
 *
 * « Tel quel » ne tient pas partout — mesuré le 2026-09-14 :
 *   /v1/responses + reasoning_effort au premier niveau   → 400 (moved to reasoning.effort)
 *   Anthropic thinking enabled|adaptive + temperature    → 400
 *   Anthropic thinking enabled, max_tokens ≤ budget      → 400
 *   Mistral /v1/conversations + reasoning_effort en tête → 422 extra_forbidden
 *
 *   node scripts/test/test_dispatch_reasoning_service_tier.js
 *   node scripts/test/test_dispatch_reasoning_service_tier.js --en-ligne   (clés dans l'environnement)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const W = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../workflows/LLM_-_Call_Messages.json'), 'utf8'));
const nd = (n) => W.nodes.find((x) => x.name === n);

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(58)} ${String(JSON.stringify(obtenu)).slice(0, 40)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};
const V = (body) => {
  const r = vm.runInNewContext(`(function(){${nd('Validate Input').parameters.jsCode}})()`, {
    $input: { first: () => ({ json: { body } }) }, $env: {},
  }, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r;
};
const F = (nom, entree, prev) => {
  const r = vm.runInNewContext(`(function(){${nd(nom).parameters.jsCode}})()`, {
    $input: { first: () => ({ json: entree }) },
    $: () => ({ first: () => ({ json: prev }) }),
  }, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r;
};
const corpsDe = (nom, json) => {
  const expr = nd(nom).parameters.jsonBody.replace(/^=\{\{/, '').replace(/\}\}$/, '');
  return JSON.parse(vm.runInNewContext(`(${expr})`, { $json: json }, { timeout: 3000 }));
};
const BASE = { api_key: 'K', messages: [{ role: 'user', content: 'Combien font 17 fois 23 ? Réponds juste le nombre.' }], max_tokens: 1500 };
// Ce que Validate Input rend, pour un corps d'appel donné.
const D = (o) => V({ ...BASE, ...o });

console.log('\n1. Validate Input lit les trois champs, sans rien inventer');
let v = D({ provider: 'openai', model: 'gpt-4.1-mini' });
T('rien envoyé → trois null', [null, null, null], [v.reasoning_config, v.reasoning_effort, v.service_tier]);
v = D({ provider: 'openai', model: 'gpt-5.6-luna', reasoning_config: { reasoning_effort: 'none' }, reasoning_effort: ' none ', service_tier: 'flex' });
T('fragment, niveau et tier lus', [{ reasoning_effort: 'none' }, 'none', 'flex'], [v.reasoning_config, v.reasoning_effort, v.service_tier]);
v = D({ provider: 'openai', model: 'm', context: { reasoning_config: { reasoning_effort: 'low' }, service_tier: 'priority' } });
T('lus aussi dans context', [{ reasoning_effort: 'low' }, 'priority'], [v.reasoning_config, v.service_tier]);
v = D({ provider: 'openai', model: 'm', reasoning_config: ['pas', 'un', 'objet'] });
T('fragment qui n’est pas un objet → 400', [false, true], [v.valid, v.errors.some((e) => /reasoning_config/.test(e))]);

console.log('\n2. ⚠️ la capacité du modèle ne se lit plus dans `reasoning: false`');
v = D({ provider: 'openai', model: 'gpt-5.6-luna', reasoning: false, reasoning_config: { reasoning_effort: 'none' } });
T('gpt-5.6 + reasoning:false → modèle qui raisonne', true, v.raisonnement);
let c = corpsDe('OpenAI API', v);
T('… max_completion_tokens, ni max_tokens ni temperature', [true, false, false],
  ['max_completion_tokens' in c, 'max_tokens' in c, 'temperature' in c]);
T('gpt-5.6 + reasoning:false SANS fragment → raisonne (nommage)', true,
  D({ provider: 'openai', model: 'gpt-5.6-luna', reasoning: false }).raisonnement);
T('nom inconnu + fragment du catalogue → raisonne', true,
  D({ provider: 'openai', model: 'modele-maison', reasoning_config: { reasoning_effort: 'low' } }).raisonnement);
T('nom inconnu + reasoning:true → raisonne (parole de l’appelant)', true,
  D({ provider: 'openai', model: 'modele-maison', reasoning: true }).raisonnement);
v = D({ provider: 'openai', model: 'gpt-4.1-mini', reasoning: false });
// azy.daily#411 : sans temperature dans la requête, le corps n'en porte plus — nous n'en
// inventons plus (un 0.7 maison faisait tomber claude-opus-4-8 et claude-sonnet-5 en 400).
T('gpt-4.1-mini + reasoning:false → corps classique, sans temperature inventée', [false, true, false],
  [v.raisonnement, 'max_tokens' in corpsDe('OpenAI API', v), 'temperature' in corpsDe('OpenAI API', v)]);
T('… mais une temperature demandée est transmise', 0.2,
  corpsDe('OpenAI API', D({ provider: 'openai', model: 'gpt-4.1-mini', temperature: 0.2 })).temperature);

console.log('\n3. OpenAI chat/completions : fragment tel quel, tier relayé');
c = corpsDe('OpenAI API', D({ provider: 'openai', model: 'gpt-5.6-luna', reasoning_config: { reasoning_effort: 'none' }, service_tier: 'flex' }));
T('reasoning_effort au premier niveau, service_tier', ['none', 'flex'], [c.reasoning_effort, c.service_tier]);
c = corpsDe('OpenAI API', D({ provider: 'openai', model: 'gpt-5.6-luna', reasoning_effort: 'low' }));
T('niveau en clair seul → reasoning_effort', 'low', c.reasoning_effort);
c = corpsDe('OpenAI API', D({ provider: 'openai', model: 'gpt-5.6-luna', reasoning_config: { reasoning_effort: 'none' }, reasoning_effort: 'high' }));
T('le fragment prime sur le niveau en clair', 'none', c.reasoning_effort);
c = corpsDe('OpenAI API', D({ provider: 'openai', model: 'gpt-4.1-mini' }));
T('rien envoyé → corps inchangé', [false, false], ['reasoning_effort' in c, 'service_tier' in c]);

console.log('\n4. ⚠️ OpenAI /v1/responses : le niveau passe dans reasoning.effort');
c = corpsDe('OpenAI Responses API', D({ provider: 'openai', model: 'gpt-5-pro', surface: 'responses', reasoning_config: { reasoning_effort: 'none' }, service_tier: 'priority' }));
T('reasoning.effort, jamais reasoning_effort en tête', [{ effort: 'none' }, false], [c.reasoning, 'reasoning_effort' in c]);
T('service_tier relayé', 'priority', c.service_tier);
c = corpsDe('OpenAI Responses API', D({ provider: 'openai', model: 'gpt-5.6-luna', web_search: true, reasoning_effort: 'low' }));
T('niveau en clair + recherche → reasoning.effort, outil gardé', [{ effort: 'low' }, 'web_search'], [c.reasoning, c.tools[0].type]);
c = corpsDe('OpenAI Responses API', D({ provider: 'openai', model: 'gpt-5-pro', surface: 'responses' }));
T('rien envoyé → pas de reasoning ni de service_tier', [false, false], ['reasoning' in c, 'service_tier' in c]);

console.log('\n5. ⚠️ Anthropic : thinking tel quel, contraintes appliquées');
c = corpsDe('Anthropic API', D({ provider: 'anthropic', model: 'claude-sonnet-5', reasoning_config: { thinking: { type: 'disabled' } }, service_tier: 'flex' }));
// azy.daily#411 : cette attente disait « temperature gardée » — c'est elle qui a produit la
// panne du 22/09 (vision/describe en 502). Mesuré ce jour : claude-sonnet-5 + temperature 0.7
// → 400 « `temperature` is deprecated for this model. », thinking disabled ou pas. La famille
// Claude 5 refuse tout paramètre d'échantillonnage ; les 4.x l'acceptent encore (ligne suivante).
T('disabled : thinking posé, temperature RETIRÉE (Claude 5), pas de tier', [{ type: 'disabled' }, false, false], [c.thinking, 'temperature' in c, 'service_tier' in c]);
c = corpsDe('Anthropic API', D({ provider: 'anthropic', model: 'claude-sonnet-4-6', reasoning_config: { thinking: { type: 'adaptive' }, output_config: { effort: 'low' } } }));
T('adaptive : temperature retirée, output_config gardé', [false, { effort: 'low' }, 1500], ['temperature' in c, c.output_config, c.max_tokens]);
c = corpsDe('Anthropic API', D({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001', reasoning_config: { thinking: { type: 'enabled', budget_tokens: 4096 } } }));
T('enabled + budget : max_tokens = réponse + budget, sans temperature', [5596, false], [c.max_tokens, 'temperature' in c]);
c = corpsDe('Anthropic API', D({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }));
// azy.daily#411 : plus de temperature par défaut ; le fournisseur applique la sienne.
T('rien envoyé → corps inchangé, sans temperature', [false, false, 1500], ['thinking' in c, 'temperature' in c, c.max_tokens]);

console.log('\n6. Gemini et Mistral');
c = corpsDe('Gemini API', D({ provider: 'google', model: 'gemini-3.5-flash', reasoning_config: { thinkingConfig: { thinkingBudget: 0 } }, service_tier: 'flex' }));
T('gemini : thinkingConfig DANS generationConfig', [{ thinkingBudget: 0 }, false, false],
  [c.generationConfig.thinkingConfig, 'thinkingConfig' in c, 'service_tier' in c]);
c = corpsDe('Mistral API', D({ provider: 'mistral', model: 'mistral-medium-3-5', reasoning_config: { reasoning_effort: 'none' }, service_tier: 'flex' }));
T('mistral chat : reasoning_effort en tête, pas de tier', ['none', false, 1500], [c.reasoning_effort, 'service_tier' in c, c.max_tokens]);
c = corpsDe('Mistral Conversations API', D({ provider: 'mistral', model: 'mistral-medium-3-5', web_search: true, reasoning_effort: 'high' }));
T('⚠️ mistral conversations : dans completion_args', [{ max_tokens: 1500, reasoning_effort: 'high' }, false],
  [c.completion_args, 'reasoning_effort' in c]);
c = corpsDe('Ollama Cloud API', D({ provider: 'ollama-cloud', model: 'gemma4:31b', reasoning_config: { reasoning_effort: 'low' }, service_tier: 'flex' }));
T('ollama-cloud : aucun des deux champs', [false, false], ['reasoning_effort' in c, 'service_tier' in c]);

console.log('\n7. le niveau SERVI revient dans l’usage');
const PREV = { metadata: {}, startTime: Date.now(), model: 'gpt-5.6-luna', web_search: false };
let r = F('Format OpenAI', { model: 'gpt-5.6-luna', service_tier: 'flex', choices: [{ message: { content: '391' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } }, PREV);
T('chat/completions : usage.service_tier = flex', 'flex', r.meta.usage.service_tier);
r = F('Format OpenAI', { model: 'gpt-5.6-luna', choices: [{ message: { content: '391' } }], usage: {} }, PREV);
T('… absent de la réponse → absent de l’usage', false, 'service_tier' in r.meta.usage);
r = F('Format OpenAI Responses', { statusCode: 200, headers: {}, body: { status: 'completed', service_tier: 'default', model: 'gpt-5-pro',
  output: [{ type: 'message', content: [{ type: 'output_text', text: '391', annotations: [] }] }], usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 } } }, PREV);
T('responses : usage.service_tier = default (auto servi en default)', 'default', r.meta.usage.service_tier);

console.log('\n8. flex = traitement différé : délai d’attente long');
T('chat/completions : 15 min si flex, 2 min sinon', "={{ $json.service_tier === 'flex' ? 900000 : 120000 }}", nd('OpenAI API').parameters.options.timeout);
T('responses : 15 min si flex, 5 min sinon', "={{ $json.service_tier === 'flex' ? 900000 : 300000 }}", nd('OpenAI Responses API').parameters.options.timeout);

async function enLigne() {
  console.log('\n9. en ligne : les corps PRODUITS passent chez les fournisseurs');
  const appels = [
    ['openai chat gpt-5.6-luna, reasoning:false, fragment none, flex', 'https://api.openai.com/v1/chat/completions', 'OpenAI API',
      { provider: 'openai', model: 'gpt-5.6-luna', reasoning: false, reasoning_config: { reasoning_effort: 'none' }, service_tier: 'flex' },
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, (b) => [b.service_tier, !!b.choices?.[0]?.message?.content]],
    ['openai responses gpt-5.6-luna, fragment none, priority', 'https://api.openai.com/v1/responses', 'OpenAI Responses API',
      { provider: 'openai', model: 'gpt-5.6-luna', surface: 'responses', reasoning_config: { reasoning_effort: 'none' }, service_tier: 'priority' },
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, (b) => [b.service_tier, b.status]],
    ['anthropic haiku 4.5 enabled budget 4096, max_tokens 1500', 'https://api.anthropic.com/v1/messages', 'Anthropic API',
      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', reasoning_config: { thinking: { type: 'enabled', budget_tokens: 4096 } } },
      { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, (b) => (b.content || []).map((x) => x.type)],
    ['anthropic sonnet 4.6 adaptive + effort low', 'https://api.anthropic.com/v1/messages', 'Anthropic API',
      { provider: 'anthropic', model: 'claude-sonnet-4-6', reasoning_config: { thinking: { type: 'adaptive' }, output_config: { effort: 'low' } } },
      { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, (b) => (b.content || []).map((x) => x.type)],
    ['mistral conversations, reasoning_effort high', 'https://api.mistral.ai/v1/conversations', 'Mistral Conversations API',
      { provider: 'mistral', model: 'mistral-medium-3-5', web_search: true, reasoning_effort: 'high' },
      { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }, (b) => (b.outputs || []).map((x) => x.type)],
  ];
  for (const [nom, url, noeud, entree, entetes, lire] of appels) {
    const corps = corpsDe(noeud, D(entree));
    const rep = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...entetes }, body: JSON.stringify(corps) });
    const b = await rep.json().catch(() => ({}));
    T(`${nom}`.slice(0, 58), 200, rep.status);
    console.log(`     → ${JSON.stringify(rep.status === 200 ? lire(b) : b).slice(0, 180)}`);
  }
}

(async () => {
  if (process.argv.includes('--en-ligne')) await enLigne();
  console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
  process.exit(ko === 0 ? 0 : 1);
})();
