#!/usr/bin/env node
/**
 * Paramètres OpenAI selon la famille de modèle — « LLM - Call Messages » et
 * « LLM - Call Stream » (azy.daily#276).
 *
 *     node scripts/test/test_openai_raisonnement.js
 *     node scripts/test/test_openai_raisonnement.js --en-ligne   # appelle vraiment OpenAI
 *
 * Le test exécute le JavaScript extrait du JSON des workflows : c'est le code
 * qui sera importé, pas une copie.
 *
 * Le cas de référence
 * -------------------
 * `vision/describe` sur `gpt-5` échouait systématiquement. Le mobile voyait un
 * 502 `vision_upstream_error` avec `upstream_status: 500`. Mesuré en direct
 * contre l'API OpenAI, le workflow envoyait deux paramètres refusés :
 *
 *     max_tokens        → 400  Unsupported parameter: use 'max_completion_tokens'
 *     temperature: 0.7  → 400  Unsupported value: only the default (1)
 *
 * Ce que le test protège
 * ----------------------
 *  - un modèle de raisonnement reçoit `max_completion_tokens`, JAMAIS
 *    `max_tokens` ni `temperature` — chacun rend un 400 ;
 *  - gpt-4o et consorts gardent les deux paramètres : la correction ne doit pas
 *    casser l'existant ;
 *  - le budget a un PLANCHER. Les jetons de raisonnement se prennent dessus et
 *    n'apparaissent pas dans le texte : à 16 jetons, gpt-5 en consomme 16 à
 *    réfléchir et rend une chaîne VIDE en HTTP 200 — un succès creux, le mode
 *    de panne le plus coûteux à diagnostiquer ;
 *  - un 400 d'OpenAI ressort en 400, pas en 500 : sinon l'appelant cherche une
 *    panne serveur pour une requête malformée (même famille que #442) ;
 *  - le bloc image multimodal traverse INTACT : c'est tout l'objet de
 *    vision/describe.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const MESSAGES = lire('LLM_-_Call_Messages.json');
const STREAM = lire('LLM_-_Call_Stream.json');
const noeud = (wf, n) => wf.nodes.find(x => x.name === n);
const code = (wf, n) => noeud(wf, n).parameters.jsCode;

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 54 ? obtenu.slice(0, 54) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(54)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

function execCode(src, entree, refs = {}) {
  const env = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: n => { const v = env(refs[n]); return { all: () => v, first: () => v[0] }; },
    console: { log() {} }, JSON, Object, Array, String, Number, Math, parseInt, parseFloat, isNaN, RegExp, Date,
  };
  return env(vm.runInNewContext(`(function(){${src}})()`, ctx));
}

/** Évalue l'expression n8n d'un jsonBody, avec $json fourni. */
function execExpr(expression, json) {
  const src = expression.replace(/^=\{\{/, '').replace(/\}\}\s*$/, '');
  return JSON.parse(vm.runInNewContext(`(${src})`, {
    $json: json, JSON, Object, Array, String, Number, Math, RegExp,
  }));
}

const valider = body => execCode(code(MESSAGES, 'Validate Input'), { body })[0].json;
const corpsOpenAI = json => execExpr(noeud(MESSAGES, 'OpenAI API').parameters.jsonBody, json);

const BASE = {
  provider: 'openai', api_key: 'sk-test',
  messages: [{ role: 'user', content: 'bonjour' }],
};

console.log('\n1. détection de la famille de modèle');
{
  for (const m of ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o1', 'o3-mini', 'O4-MINI']) {
    controle(`« ${m} » → raisonnement`, valider({ ...BASE, model: m }).raisonnement, true);
  }
  for (const m of ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-3.5-turbo']) {
    controle(`« ${m} » → classique`, valider({ ...BASE, model: m }).raisonnement, false);
  }
  // Le drapeau ne concerne qu'OpenAI : Anthropic accepte max_tokens sans réserve.
  controle('anthropic non concerné',
    valider({ ...BASE, provider: 'anthropic', model: 'gpt-5' }).raisonnement, false);
}

console.log('\n2. corps envoyé — modèle de raisonnement');
{
  const c = corpsOpenAI(valider({ ...BASE, model: 'gpt-5' }));
  controle('pas de max_tokens', 'max_tokens' in c, false);
  controle('pas de temperature', 'temperature' in c, false);
  controle('max_completion_tokens présent', c.max_completion_tokens, 4096);
  controle('modèle relayé', c.model, 'gpt-5');
  // Plancher : sinon les jetons de raisonnement mangent tout le budget et le
  // texte revient vide, en HTTP 200.
  const petit = corpsOpenAI(valider({ ...BASE, model: 'gpt-5', max_tokens: 16 }));
  controle('budget 16 relevé au plancher', petit.max_completion_tokens, 1024);
  const grand = corpsOpenAI(valider({ ...BASE, model: 'gpt-5', max_tokens: 8000 }));
  controle('budget large respecté', grand.max_completion_tokens, 8000);
}

console.log('\n3. corps envoyé — modèle classique, rien ne change');
{
  const c = corpsOpenAI(valider({ ...BASE, model: 'gpt-4o', max_tokens: 512, temperature: 0.3 }));
  controle('max_tokens conservé', c.max_tokens, 512);
  controle('temperature conservée', c.temperature, 0.3);
  controle('pas de max_completion_tokens', 'max_completion_tokens' in c, false);
}

console.log('\n4. le bloc image traverse intact');
{
  const image = [
    { type: 'text', text: 'Décris cette image.' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
  ];
  const c = corpsOpenAI(valider({ ...BASE, model: 'gpt-5', messages: [{ role: 'user', content: image }] }));
  controle('contenu multimodal non altéré', c.messages[0].content, image);
  const avecSysteme = corpsOpenAI(valider({
    ...BASE, model: 'gpt-5', system: 'Tu es concis.',
    messages: [{ role: 'user', content: image }],
  }));
  controle('system en tête, image ensuite',
    avecSysteme.messages.map(m => m.role), ['system', 'user']);
}

console.log('\n5. le statut réel remonte — un 400 n’est pas un 500');
{
  const formater = rep => execCode(code(MESSAGES, 'Format OpenAI'), rep,
    { 'Validate Input': { model: 'gpt-5', metadata: {}, startTime: Date.now() } })[0].json;

  // Forme émise par onError=continueRegularOutput : pas de statusCode.
  const p400 = formater({ error: {
    message: "400 - {\"error\":{\"message\":\"Unsupported parameter: 'max_tokens'\",\"code\":\"unsupported_parameter\"}}",
    code: 'unsupported_parameter' } });
  controle('400 OpenAI → 400', [p400.success, p400.error.http_status], [false, 400]);
  controle('code d’erreur conservé', p400.error.code, 'unsupported_parameter');

  const p429 = formater({ error: { message: '429 - {"error":{"message":"Rate limit"}}' } });
  controle('429 → 429, pas 500', p429.error.http_status, 429);

  const reseau = formater({ error: { message: 'The connection was aborted', code: 'ECONNABORTED' } });
  controle('panne réseau → 502, jamais un succès', [reseau.success, reseau.error.http_status], [false, 502]);

  const ok = formater({ choices: [{ message: { content: 'Bonjour' }, finish_reason: 'stop' }],
                        model: 'gpt-5-2025-08-07', usage: {} });
  controle('chemin nominal intact', [ok.success, ok.data.text], [true, 'Bonjour']);
}

console.log('\n6. LLM - Call Stream — même contrainte');
{
  const expr = noeud(STREAM, 'OpenAI Stream').parameters.jsonBody;
  const corps = req => execExpr(expr, { stream_request: req });
  const r = corps({ model: 'gpt-5', messages: [{ role: 'user', content: 'x' }], max_tokens: 2048, temperature: 0.7 });
  controle('raisonnement : pas de max_tokens', 'max_tokens' in r, false);
  controle('raisonnement : pas de temperature', 'temperature' in r, false);
  controle('raisonnement : budget porté', r.max_completion_tokens, 2048);
  controle('stream conservé', r.stream, true);
  const c = corps({ model: 'gpt-4o', messages: [{ role: 'user', content: 'x' }], max_tokens: 512, temperature: 0.2 });
  controle('classique : inchangé', [c.max_tokens, c.temperature], [512, 0.2]);
}

if (process.argv.includes('--en-ligne')) {
  console.log('\n7. aller-retour réel contre OpenAI');
  const cle = process.env.OPENAI_API_KEY;
  if (!cle) {
    console.log('  ⏭  OPENAI_API_KEY absente — étape sautée');
    conclure();
  } else {
    (async () => {
      const appel = async corps => {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        return { statut: r.status, corps: await r.json() };
      };
      // Le corps que le workflow produit désormais doit passer.
      const bon = await appel(corpsOpenAI(valider({ ...BASE, model: 'gpt-5',
        messages: [{ role: 'user', content: 'Réponds exactement : ok' }] })));
      controle('corps corrigé accepté', bon.statut, 200);
      controle('texte non vide', (bon.corps.choices?.[0]?.message?.content || '').length > 0, true);

      // Et l'ancien corps doit toujours échouer — sinon le test ne prouve rien.
      const ancien = await appel({ model: 'gpt-5', messages: [{ role: 'user', content: 'x' }],
        max_tokens: 4096, temperature: 0.7 });
      controle('ancien corps toujours refusé', ancien.statut, 400);
      controle('cause nommée par OpenAI', ancien.corps.error?.code, 'unsupported_parameter');
      conclure();
    })().catch(e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
  }
} else conclure();

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
  console.log('✅ tous les contrôles passent');
}
