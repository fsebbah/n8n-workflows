#!/usr/bin/env node
/**
 * MCP - Text Generator : BYOT et statut réel — n8n-workflows#503.
 *
 *     node scripts/test/test_503_text_generator.js
 *     node scripts/test/test_503_text_generator.js --en-ligne   # appelle vraiment OpenAI (OPENAI_API_KEY)
 *
 * Le cas de référence (mesuré le 2026-09-14)
 * ------------------------------------------
 * `POST /webhook/text-generator` rendait 500 à CHAQUE appel :
 *
 *     Credential with ID "openai-credentials" does not exist for type "openAiApi"
 *
 * Le nœud `OpenAI Generate` s'authentifiait par une credential n8n inexistante.
 * Régression : la version du 29/06 était en BYOT (clé dans le corps).
 *
 * Ce que le test protège
 * ----------------------
 *  - la clé est lue dans le corps (openai_api_key, context.openai_api_key,
 *    plugin_context.api_keys.openai, api_key) ; absente → 400 de validation ;
 *  - l'en-tête Authorization est construit depuis la sortie de Validate Input,
 *    le nœud HTTP ne porte plus AUCUNE credential, le workflow aucun `$env` ;
 *  - le modèle est libre (gpt-5 n'est plus refusé avant l'appel) et la garde
 *    « modèle de raisonnement » (#459) reste intacte ;
 *  - Format Output relaie le statut amont (400/401/429), 502 sans statut ;
 *  - la clé ne ressort JAMAIS : ni dans la réponse du webhook, ni dans `_trace`.
 *
 * Le test exécute le JavaScript extrait du JSON du workflow : c'est le code
 * importé qui est testé, pas une copie.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const BRUT = fs.readFileSync(path.join(RACINE, 'workflows', 'MCP_-_Text_Generator.json'), 'utf8');
const W = JSON.parse(BRUT);
const nd = n => W.nodes.find(x => x.name === n) || { parameters: {} };

const echecs = [];
let total = 0;
function controle(libelle, obtenu, attendu) {
  total++;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(62)} ${vu && vu.length > 46 ? vu.slice(0, 46) + '…' : vu}`
    + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

/** Un Code node dans un bac à sable proche de n8n, `$('Validate Input')` rendant `prev`. */
function execCode(nom, entree, prev) {
  const src = nd(nom).parameters.jsCode;
  if (typeof src !== 'string') return { erreur: `nœud ${nom} absent` };
  try {
    const r = vm.runInNewContext(`(function(){${src}})()`, {
      $input: { first: () => ({ json: entree }), all: () => [{ json: entree }] },
      $: () => ({ first: () => ({ json: prev }) }),
    }, { timeout: 5000 });
    return Array.isArray(r) ? r[0].json : (r && r.json !== undefined ? r.json : r);
  } catch (e) {
    // Un Code node qui lève fait échouer l'exécution n8n : on le compte comme un échec, sans arrêter le test.
    return { erreur: `${nom} a levé ${e.message}` };
  }
}

/**
 * Résout un paramètre comme n8n : expression seulement s'il commence par « = »,
 * chaque segment `{{ … }}` évalué avec `$json`.
 */
function resoudre(valeur, json) {
  if (typeof valeur !== 'string' || !valeur.startsWith('=')) return valeur;
  return valeur.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
    const v = vm.runInNewContext(`(${expr})`, { $json: json, JSON, Object, Array, String, Number, Math, RegExp });
    return typeof v === 'string' ? v : JSON.stringify(v);
  });
}

const valider = body => execCode('Validate Input', { body });
const http = nd('OpenAI Generate');
const enTete = (json, nom) => {
  const h = ((http.parameters.headerParameters || {}).parameters || []).find(x => x.name === nom);
  return h ? resoudre(h.value, json) : undefined;
};
const corps = json => JSON.parse(resoudre(http.parameters.jsonBody, json));
const formater = (entree, prev) => execCode('Format Output', entree, prev);
/** Code HTTP rendu par le nœud Respond, évalué sur la sortie de Format Output. */
const statutRespond = json => Number(resoudre(nd('Respond').parameters.options.responseCode, json));

const CLE = 'sk-test-503-CLE-SECRETE-0123456789abcdef';
const BASE = { prompt: 'Réponds exactement : ok', user_id: 'u1', guild_id: 'g1', user_request: 'test' };

/** L'objet qu'émet n8n en onError=continueRegularOutput : pas de statusCode, statut enfoui dans le message. */
const erreurN8n = (statut, corpsOpenAI, cle = CLE) => ({
  error: {
    message: `${statut} - ${JSON.stringify(corpsOpenAI)}`,
    name: 'AxiosError',
    code: 'ERR_BAD_REQUEST',
    // Pire cas : l'objet d'erreur embarque la requête, en-têtes compris.
    config: { headers: { Authorization: `Bearer ${cle}` }, url: 'https://api.openai.com/v1/chat/completions' },
  },
});
const contientCle = (v, cle = CLE) => JSON.stringify(v).includes(cle);

console.log('\n1. Validate Input — la clé vient du corps (BYOT)');
{
  const champs = {
    'openai_api_key': { openai_api_key: CLE },
    'context.openai_api_key': { context: { openai_api_key: CLE } },
    'plugin_context.api_keys.openai': { plugin_context: { api_keys: { openai: CLE } } },
    'api_key': { api_key: CLE },
  };
  for (const [nom, extra] of Object.entries(champs)) {
    const v = valider({ ...BASE, ...extra });
    controle(`clé par ${nom} → valide`, [v.valid, v.openaiApiKey === CLE], [true, true]);
  }
  controle('openai_api_key prime sur api_key',
    valider({ ...BASE, openai_api_key: CLE, api_key: 'sk-autre-cle-000000' }).openaiApiKey === CLE, true);
  controle('clé entourée d’espaces → rognée',
    valider({ ...BASE, openai_api_key: `  ${CLE} ` }).openaiApiKey === CLE, true);

  const sans = valider({ ...BASE });
  controle('clé absente → invalide', sans.valid, false);
  controle('clé absente → erreur nommant openai_api_key',
    (sans.errors || []).some(e => /openai_api_key/.test(e)), true);
  controle('clé vide (espaces) → invalide', valider({ ...BASE, openai_api_key: '   ' }).valid, false);
  const err = execCode('Build Error', sans);
  controle('clé absente → Build Error en 400', [err.success, err.error && err.error.http_status], [false, 400]);

  // Requête invalide pour une autre raison, clé fournie : la clé ne doit pas fuir.
  const invalideAvecCle = valider({ openai_api_key: CLE, user_id: 'u1' });
  controle('prompt absent + clé → invalide', invalideAvecCle.valid, false);
  controle('sortie invalide sans la clé', contientCle(invalideAvecCle), false);
  controle('Build Error sans la clé', contientCle(execCode('Build Error', invalideAvecCle)), false);
}

console.log('\n2. Validate Input — modèle libre');
{
  for (const m of ['gpt-5', 'gpt-5.6-luna', 'o3-mini', 'gpt-4.1', 'gpt-4o-mini']) {
    const v = valider({ ...BASE, openai_api_key: CLE, model: m });
    controle(`« ${m} » accepté et relayé`, [v.valid, v.model], [true, m]);
  }
  controle('modèle absent → gpt-4o (défaut actuel)', valider({ ...BASE, openai_api_key: CLE }).model, 'gpt-4o');
  controle('context.model lu', valider({ ...BASE, openai_api_key: CLE, context: { model: 'gpt-5' } }).model, 'gpt-5');
  controle('modèle non chaîne (42) → invalide', valider({ ...BASE, openai_api_key: CLE, model: 42 }).valid, false);
  controle('modèle blanc → invalide', valider({ ...BASE, openai_api_key: CLE, model: '   ' }).valid, false);
}

console.log('\n3. Nœud OpenAI Generate — ni credential, ni $env');
{
  controle('pas de paramètre authentication', 'authentication' in http.parameters, false);
  controle('pas de nodeCredentialType', 'nodeCredentialType' in http.parameters, false);
  controle('pas de bloc credentials', 'credentials' in http, false);
  controle('aucun $env dans le workflow', /\$env/.test(BRUT), false);
  controle('onError continueRegularOutput conservé', http.onError, 'continueRegularOutput');
  const v = valider({ ...BASE, openai_api_key: CLE });
  controle('Authorization = Bearer <clé de Validate Input>', enTete(v, 'Authorization') === `Bearer ${CLE}`, true);
  controle('Authorization est une expression (« = »)',
    String((((http.parameters.headerParameters || {}).parameters || []).find(x => x.name === 'Authorization') || {}).value).startsWith('='), true);
  controle('Content-Type conservé', enTete(v, 'Content-Type'), 'application/json');
}

console.log('\n4. Corps envoyé — garde #459 intacte, clé absente');
{
  const g5 = corps(valider({ ...BASE, openai_api_key: CLE, model: 'gpt-5', max_tokens: 16 }));
  controle('gpt-5 : ni max_tokens ni temperature', ['max_tokens' in g5, 'temperature' in g5], [false, false]);
  controle('gpt-5 : max_completion_tokens au plancher', g5.max_completion_tokens, 1024);
  const g4 = corps(valider({ ...BASE, openai_api_key: CLE, model: 'gpt-4o', max_tokens: 512, temperature: 0.3 }));
  controle('gpt-4o : max_tokens et temperature', [g4.max_tokens, g4.temperature, 'max_completion_tokens' in g4], [512, 0.3, false]);
  controle('gpt-4o : messages system + user', g4.messages.map(m => m.role), ['system', 'user']);
  controle('clé absente du corps', contientCle(g4) || contientCle(g5), false);
  const guillemets = corps(valider({ ...BASE, openai_api_key: CLE, prompt: 'Dis "bonjour" \\ fin' }));
  controle('prompt avec guillemets : JSON valide', guillemets.messages[1].content.includes('"bonjour"'), true);
}

console.log('\n5. Format Output — statut réel, clé masquée');
{
  const prev = valider({ ...BASE, openai_api_key: CLE, model: 'gpt-4o-mini' });
  const cas = [
    [400, { error: { message: "Unsupported parameter: 'max_tokens'", type: 'invalid_request_error', code: 'unsupported_parameter' } }],
    [401, { error: { message: 'Incorrect API key provided: sk-test-***cdef.', type: 'invalid_request_error', code: 'invalid_api_key' } }],
    [429, { error: { message: 'Rate limit reached', type: 'requests', code: 'rate_limit_exceeded' } }],
  ];
  for (const [statut, corpsErr] of cas) {
    const s = formater(erreurN8n(statut, corpsErr), prev);
    controle(`${statut} relayé (error.http_status)`, [s.success, s.error && s.error.http_status], [false, statut]);
    controle(`${statut} : code HTTP du Respond`, statutRespond(s), statut);
    controle(`${statut} : message OpenAI lisible`, s.error && s.error.message, corpsErr.error.message);
    controle(`${statut} : clé absente de la réponse et de _trace`, contientCle(s), false);
  }
  // Message d'erreur OpenAI qui recopierait la clé en clair : masquée quand même.
  const echo = formater(erreurN8n(401, { error: { message: `Incorrect API key provided: ${CLE}` } }), prev);
  controle('clé recopiée par l’amont → masquée', [echo.error.http_status, contientCle(echo)], [401, false]);

  const reseau = formater({ error: { message: 'getaddrinfo ENOTFOUND api.openai.com', code: 'ENOTFOUND',
    config: { headers: { Authorization: `Bearer ${CLE}` } } } }, prev);
  controle('panne réseau sans statut → 502', [reseau.success, reseau.error.http_status, statutRespond(reseau)], [false, 502, 502]);
  controle('panne réseau : clé absente', contientCle(reseau), false);
  const delai = formater({ error: { message: 'timeout of 120000ms exceeded', code: 'ECONNABORTED' } }, prev);
  controle('délai dépassé → 502', delai.error.http_status, 502);

  const ok = formater({
    id: 'chatcmpl-1', model: 'gpt-4o-mini-2024-07-18',
    choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 },
  }, prev);
  controle('succès : texte, modèle, finish_reason', [ok.success, ok.data.text, ok.data.model, ok.data.finish_reason],
    [true, 'ok', 'gpt-4o-mini-2024-07-18', 'stop']);
  controle('succès : usage', ok.meta.usage.total_tokens, 13);
  controle('succès : code HTTP du Respond', statutRespond(ok), 200);
  controle('succès : _trace conservé', [ok._trace.llm_response, ok._trace.provider], ['ok', 'openai']);
  controle('succès : clé absente de la réponse et de _trace', contientCle(ok), false);
}

console.log('\n6. Documentation');
{
  const doc = nd('Documentation').parameters.content || '';
  for (const champ of ['openai_api_key', 'context.openai_api_key', 'plugin_context.api_keys.openai', 'api_key']) {
    controle(`sticky mentionne ${champ}`, doc.includes(champ), true);
  }
  controle('sticky documente les statuts (400, 401, 429, 502)', ['400', '401', '429', '502'].every(s => doc.includes(s)), true);
  controle('sticky ne fige plus la liste de modèles', /gpt-4-turbo/.test(doc), false);
}

if (process.argv.includes('--en-ligne')) enLigne().then(conclure, e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
else conclure();

async function enLigne() {
  console.log('\n7. Aller-retour réel contre OpenAI (corps et en-tête produits par le workflow)');
  const cle = process.env.OPENAI_API_KEY;
  if (!cle) { console.log('  ⏭  OPENAI_API_KEY absente — étape sautée'); return; }
  const appel = async (body, faussecle) => {
    const v = valider({ ...BASE, prompt: 'Réponds exactement : ok', openai_api_key: faussecle || cle, ...body });
    if (!v.valid) throw new Error('Validate Input a refusé la requête');
    const t0 = Date.now();
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: enTete(v, 'Authorization'), 'Content-Type': enTete(v, 'Content-Type') },
      body: JSON.stringify(corps(v)),
    });
    const j = await r.json().catch(() => ({}));
    // Ce que n8n transmet à Format Output : la réponse telle quelle en succès,
    // l'objet d'erreur (statut dans le message) en continueRegularOutput.
    const entree = r.ok ? j : erreurN8n(r.status, j, faussecle || cle);
    return { statut: r.status, ms: Date.now() - t0, sortie: formater(entree, v), cle: faussecle || cle };
  };
  for (const m of ['gpt-4o-mini', 'gpt-5.6-luna']) {
    const r = await appel({ model: m, max_tokens: 64 });
    const texte = (r.sortie.data && r.sortie.data.text) || '';
    console.log(`     ${m} : HTTP ${r.statut}, ${r.ms} ms, ${texte.length} car., ` +
      `${r.sortie.meta ? r.sortie.meta.usage.completion_tokens : '?'} jetons` +
      (r.sortie.error ? `, ${r.sortie.error.message}` : ''));
    controle(`${m} : HTTP 200`, r.statut, 200);
    controle(`${m} : texte non vide`, texte.length > 0, true);
    controle(`${m} : Respond rendrait 200`, statutRespond(r.sortie), 200);
    controle(`${m} : clé absente de la sortie`, contientCle(r.sortie, r.cle), false);
  }
  const faux = await appel({ model: 'gpt-4o-mini' }, 'sk-proj-cle-volontairement-fausse-503-0000000000');
  console.log(`     clé fausse : HTTP ${faux.statut}, sortie http_status ${faux.sortie.error && faux.sortie.error.http_status}, ` +
    `« ${faux.sortie.error && faux.sortie.error.message} »`);
  controle('clé fausse : OpenAI rend 401', faux.statut, 401);
  controle('clé fausse : Format Output → http_status 401', faux.sortie.error && faux.sortie.error.http_status, 401);
  controle('clé fausse : Respond rendrait 401', statutRespond(faux.sortie), 401);
  controle('clé fausse : clé absente de la sortie', contientCle(faux.sortie, faux.cle), false);
}

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length}/${total} contrôle(s) en échec`); process.exit(1); }
  console.log(`✅ tous les contrôles passent  (${total}/${total})`);
}
