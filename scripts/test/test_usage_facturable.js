#!/usr/bin/env node
/**
 * Le champ `usage` doit porter de quoi facturer juste (azy.daily#287, #295 §2.4-2.5).
 *
 *     node scripts/test/test_usage_facturable.js
 *     node scripts/test/test_usage_facturable.js --en-ligne   # appelle les 4 fournisseurs
 *
 * Ce qui était perdu
 * ------------------
 * Les quatre formatteurs réduisaient la réponse du fournisseur à
 * `{prompt, completion, total}` — trois champs sur huit chez Anthropic. Or :
 *
 *  - les jetons LUS en cache sont facturés 0,1× et ceux ÉCRITS 1,25×. Les
 *    jeter faisait surfacturer la lecture et ignorer l'écriture. La voie
 *    dispatch EST facturée — `vision/describe` et `skills` (azy.daily#295) ;
 *  - chez Google, `promptTokenCount + candidatesTokenCount ≠ totalTokenCount`,
 *    l'écart étant `thoughtsTokenCount` — mesuré 2 + 7 contre 188. Nous
 *    publiions une somme fausse.
 *
 * Conventions arrêtées avec l'API
 * -------------------------------
 *  - le triplet historique est CONSERVÉ, les champs sont AJOUTÉS ;
 *  - `completion_tokens` inclut le raisonnement — chez Google comme chez OpenAI ;
 *  - `reasoning_tokens` vient EN SUPPLÉMENT, jamais à la place ;
 *  - les champs sont toujours PRÉSENTS, à 0 : un champ absent et un champ nul
 *    ne se distinguent pas en aval.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/LLM_-_Call_Messages.json'), 'utf8'));
const noeud = n => WF.nodes.find(x => x.name === n);

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 46 ? obtenu.slice(0, 46) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(54)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}
function exec(nom, entree) {
  const items = [{ json: entree }];
  return vm.runInNewContext(`(function(){${noeud(nom).parameters.jsCode}})()`, {
    $input: { all: () => items, first: () => items[0] },
    $: () => ({ first: () => ({ json: { model: 'm', metadata: {}, startTime: Date.now() } }) }),
    console: { log() {} }, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, Date,
  });
}
const CHAMPS = ['prompt_tokens', 'completion_tokens', 'total_tokens',
                'cache_read_input_tokens', 'cache_creation_input_tokens', 'reasoning_tokens'];

console.log('\n1. les six champs sont TOUJOURS présents');
{
  // Un fournisseur qui ne rend aucun détail ne doit pas produire un objet troué :
  // en aval, un champ absent et un champ nul ne se distinguent pas.
  const cas = [
    ['Format Anthropic', { content: [{ text: 'x' }], usage: { input_tokens: 5, output_tokens: 3 } }],
    ['Format OpenAI', { choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } }],
    ['Format Mistral', { choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } }],
    ['Format Gemini', { candidates: [{ content: { parts: [{ text: 'x' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 } }],
  ];
  for (const [nom, rep] of cas) {
    const u = exec(nom, rep).meta.usage;
    controle(`${nom} — six champs`, Object.keys(u).sort(), [...CHAMPS].sort());
    controle(`  ${nom} — aucun undefined`, Object.values(u).every(v => typeof v === 'number'), true);
  }
}

console.log('\n2. Anthropic — le cache remonte, dans les deux sens');
{
  const u = exec('Format Anthropic', { content: [{ text: 'x' }], usage: {
    input_tokens: 1200, output_tokens: 40,
    cache_read_input_tokens: 900,        // facturé 0,1×
    cache_creation_input_tokens: 300,    // facturé 1,25×
  } }).meta.usage;
  controle('lecture de cache', u.cache_read_input_tokens, 900);
  controle('écriture de cache', u.cache_creation_input_tokens, 300);
  controle('le triplet est inchangé', [u.prompt_tokens, u.completion_tokens, u.total_tokens], [1200, 40, 1240]);
}

console.log('\n3. OpenAI et Mistral — le cache est dans prompt_tokens_details');
{
  for (const nom of ['Format OpenAI', 'Format Mistral']) {
    const u = exec(nom, { choices: [{ message: { content: 'x' } }], usage: {
      prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050,
      prompt_tokens_details: { cached_tokens: 800 },
      completion_tokens_details: { reasoning_tokens: 20 },
    } }).meta.usage;
    controle(`${nom} — cache lu`, u.cache_read_input_tokens, 800);
    controle(`${nom} — pas d’écriture de cache chez eux`, u.cache_creation_input_tokens, 0);
  }
  // Chez OpenAI le raisonnement est DÉJÀ dans completion_tokens : le détail
  // est informatif, on ne doit surtout pas l'additionner une seconde fois.
  const u = exec('Format OpenAI', { choices: [{ message: { content: 'x' } }], usage: {
    prompt_tokens: 10, completion_tokens: 200, total_tokens: 210,
    completion_tokens_details: { reasoning_tokens: 180 },
  } }).meta.usage;
  controle('raisonnement en supplément, pas ajouté', [u.completion_tokens, u.reasoning_tokens], [200, 180]);
  controle('la somme reste juste', u.prompt_tokens + u.completion_tokens, u.total_tokens);
}

console.log('\n4. ⚠️ Gemini — la somme redevient juste');
{
  // Le cas mesuré qui a motivé la convention : 2 + 7 = 9, mais le total vaut 188.
  const u = exec('Format Gemini', { candidates: [{ content: { parts: [{ text: 'x' }] } }], usageMetadata: {
    promptTokenCount: 2, candidatesTokenCount: 7, totalTokenCount: 188, thoughtsTokenCount: 179,
  } }).meta.usage;
  controle('completion inclut la pensée', u.completion_tokens, 186);
  controle('prompt + completion = total', u.prompt_tokens + u.completion_tokens, u.total_tokens);
  controle('le détail est fourni en plus', u.reasoning_tokens, 179);

  // Second cas mesuré : 14 + 328 + 510 = 852.
  const v = exec('Format Gemini', { candidates: [{ content: { parts: [{ text: 'x' }] } }], usageMetadata: {
    promptTokenCount: 14, candidatesTokenCount: 328, totalTokenCount: 852, thoughtsTokenCount: 510,
  } }).meta.usage;
  controle('second cas mesuré', v.prompt_tokens + v.completion_tokens, v.total_tokens);

  // Sans pensée, rien ne change.
  const w = exec('Format Gemini', { candidates: [{ content: { parts: [{ text: 'x' }] } }], usageMetadata: {
    promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8,
  } }).meta.usage;
  controle('sans pensée : comportement inchangé', [w.completion_tokens, w.reasoning_tokens], [3, 0]);
}

console.log('\n5. le chemin d’erreur ne fabrique pas de faux usage');
{
  const r = exec('Format Anthropic', { error: { message: '401 - {"type":"authentication_error"}' } });
  controle('échec : pas de meta.usage', r.meta, undefined);
  controle('échec : success false', r.success, false);
}

if (process.argv.includes('--en-ligne')) {
  console.log('\n6. contre les quatre fournisseurs');
  (async () => {
    const oa = process.env.OPENAI_API_KEY, an = process.env.ANTHROPIC_API_KEY;
    const mi = process.env.MISTRAL_API_KEY, go = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const j = async (url, body, headers) => (await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).json();
    const msg = [{ role: 'user', content: 'ok' }];

    if (an) {
      const d = await j('https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-4-5-20251001', max_tokens: 16, messages: msg },
        { 'x-api-key': an, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
      const u = exec('Format Anthropic', d).meta.usage;
      controle('Anthropic — six champs numériques', Object.values(u).every(v => typeof v === 'number'), true);
    }
    if (oa) {
      const d = await j('https://api.openai.com/v1/chat/completions',
        { model: 'gpt-4o-mini', max_tokens: 16, messages: msg },
        { Authorization: `Bearer ${oa}`, 'Content-Type': 'application/json' });
      const u = exec('Format OpenAI', d).meta.usage;
      controle('OpenAI — somme juste', u.prompt_tokens + u.completion_tokens, u.total_tokens);
    }
    if (mi) {
      const d = await j('https://api.mistral.ai/v1/chat/completions',
        { model: 'mistral-medium-2505', max_tokens: 16, messages: msg },
        { Authorization: `Bearer ${mi}`, 'Content-Type': 'application/json' });
      const u = exec('Format Mistral', d).meta.usage;
      controle('Mistral — somme juste', u.prompt_tokens + u.completion_tokens, u.total_tokens);
    }
    if (go) {
      // Une question qui déclenche du raisonnement, sinon thoughtsTokenCount reste bas.
      const d = await j('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
        { contents: [{ role: 'user', parts: [{ text: 'Combien font 17x23 ? Explique.' }] }],
          generationConfig: { maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 1024 } } },
        { 'x-goog-api-key': go, 'Content-Type': 'application/json' });
      const u = exec('Format Gemini', d).meta.usage;
      console.log(`     Gemini brut : prompt=${d.usageMetadata.promptTokenCount} candidates=${d.usageMetadata.candidatesTokenCount} thoughts=${d.usageMetadata.thoughtsTokenCount} total=${d.usageMetadata.totalTokenCount}`);
      controle('Gemini — somme juste sur un cas RÉEL', u.prompt_tokens + u.completion_tokens, u.total_tokens);
      controle('Gemini — raisonnement non nul', u.reasoning_tokens > 0, true);
    }
    conclure();
  })().catch(e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
} else conclure();

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
  console.log('✅ tous les contrôles passent');
}
