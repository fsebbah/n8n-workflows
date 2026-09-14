#!/usr/bin/env node
/**
 * Clés BYOT injectées par MCP sous `plugin_context.api_keys.<fournisseur>` — lot B
 * de l'alignement azy.daily#381.
 *
 *     node scripts/test/test_381_cles_plugin_context_lot_b.js
 *     node scripts/test/test_381_cles_plugin_context_lot_b.js --ref b4fa755d   # rejoue sur une révision git
 *     node scripts/test/test_381_cles_plugin_context_lot_b.js --en-ligne       # appels réels Mistral, Anthropic, OpenAI
 *
 * Le contrat
 * ----------
 * L'orchestrateur MCP (`N8nToolExecutor`) injecte les clés système dans le corps,
 * hors des paramètres visibles du LLM : `plugin_context.api_keys.{openai, anthropic,
 * mistral, google}`. Règle commune à tous les outils :
 *   1. la clé EXPLICITE du corps (champ historique de l'outil, et `context.<champ>`
 *      quand il était déjà lu) garde la priorité ;
 *   2. puis `plugin_context.api_keys.<fournisseur>` ;
 *   3. aucun nouveau `$env`, aucune credential n8n (le repli `$env` historique de
 *      Tools Enricher reste EN DERNIER : dette signalée à part) ;
 *   4. la clé ne ressort jamais, ni dans la réponse ni dans `_trace`.
 *
 * Pour chaque workflow et chaque fournisseur : (a) clé explicite seule → utilisée ;
 * (b) plugin_context seule → c'est elle que porte l'appel ; (c) les deux → l'explicite
 * gagne ; (d) aucune → comportement d'erreur de develop conservé ; (e) la clé
 * n'apparaît pas dans la sortie formatée.
 *
 * Le test exécute le JavaScript et résout les expressions extraits du JSON des
 * workflows : c'est le code importé qui est testé, pas une copie. La référence
 * « avant » est le commit AVANT (develop au moment du lot B).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..', '..');
const AVANT = 'b4fa755d';
const iRef = process.argv.indexOf('--ref');
const REF = iRef > 0 ? process.argv[iRef + 1] : null;

function charger(stem, ref = REF) {
  const rel = `workflows/${stem}.json`;
  const brut = ref
    ? execFileSync('git', ['show', `${ref}:${rel}`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
    : fs.readFileSync(path.join(RACINE, rel), 'utf8');
  const W = JSON.parse(brut);
  return { stem, brut, W, nd: n => W.nodes.find(x => x.name === n) };
}
function chargerAvant(stem) {
  try { return charger(stem, AVANT); } catch (e) { return null; }
}

const echecs = [];
let total = 0;
function controle(libelle, obtenu, attendu) {
  total++;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(72)} ${vu && vu.length > 40 ? vu.slice(0, 40) + '…' : vu}`
    + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

/** Bac à sable proche d'un Code node n8n. `noeuds` alimente `$('Nom')`. */
function contexte({ json, noeuds = {}, env = {}, statique, binary } = {}) {
  const item = n => {
    if (!(n in noeuds)) throw new Error(`$('${n}') non fourni par le test`);
    return { json: noeuds[n] };
  };
  const stat = statique || {};
  return {
    $input: { first: () => ({ json }), all: () => [{ json }] },
    $json: json,
    $: n => ({ first: () => item(n), all: () => [item(n)] }),
    $env: env,
    $binary: binary,
    $execution: { id: '381' },
    $getWorkflowStaticData: () => stat,
    console: { log() {} },
  };
}

function execCode(wf, nom, opts) {
  const n = wf.nd(nom);
  if (!n || typeof n.parameters.jsCode !== 'string') return { erreur: `nœud ${nom} absent` };
  try {
    const r = vm.runInNewContext(`(function(){${n.parameters.jsCode}\n})()`, contexte(opts), { timeout: 5000 });
    if (Array.isArray(r)) return r.length ? r[0].json : undefined;
    return r && r.json !== undefined ? r.json : r;
  } catch (e) {
    return { erreur: `${nom} a levé ${e.message}` };
  }
}

/** Résout un paramètre comme n8n : expression seulement s'il commence par « = ». */
function resoudre(valeur, opts) {
  if (typeof valeur !== 'string' || !valeur.startsWith('=')) return valeur;
  const ctx = contexte(opts);
  return valeur.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
    const v = vm.runInNewContext(`(${expr})`, ctx, { timeout: 5000 });
    return v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  });
}
const param = (wf, noeud, nomEnTete) => {
  const n = wf.nd(noeud);
  const h = ((n.parameters.headerParameters || {}).parameters || []).find(x => x.name === nomEnTete);
  return h ? h.value : undefined;
};
const enTete = (wf, noeud, nomEnTete, opts) => resoudre(param(wf, noeud, nomEnTete), opts);
const enTetes = (wf, noeud, opts) => Object.fromEntries(((wf.nd(noeud).parameters.headerParameters || {}).parameters || [])
  .map(h => [h.name, resoudre(h.value, opts)]));

// Clés fictives, toutes distinctes : on sait toujours laquelle a été retenue.
const EXPL = { mistral: 'mst-EXPLICITE-381-aaaa', anthropic: 'sk-ant-EXPLICITE-381-bbbb', openai: 'sk-EXPLICITE-381-cccc', google: 'AIza-EXPLICITE-381-dddd' };
const PLUG = { mistral: 'mst-PLUGIN-381-1111', anthropic: 'sk-ant-PLUGIN-381-2222', openai: 'sk-PLUGIN-381-3333', google: 'AIza-PLUGIN-381-4444' };
const ENV = { anthropic: 'sk-ant-ENV-381-9999', openai: 'sk-ENV-381-8888' };
const plugin = (cles) => ({ plugin_context: { plugin_id: 'p-381', api_keys: cles } });
const toutesCles = [...Object.values(EXPL), ...Object.values(PLUG), ...Object.values(ENV)];
const contientCle = (v, cles = toutesCles) => { const s = JSON.stringify(v === undefined ? null : v); return cles.some(c => s.includes(c)); };

/** Contrôles communs : ni nouveau $env, ni credential, activeVersion intacte. */
function hygiene(wf, av) {
  const compte = (s, re) => (s.match(re) || []).length;
  controle('aucune credential n8n sur les nœuds', wf.W.nodes.filter(n => n.credentials).map(n => n.name), []);
  if (!av) { console.log(`  ⏭  ${AVANT} illisible — comparaisons historiques sautées`); return; }
  // activeVersion peut garder l'instantané d'un ancien nœud (Transcriber : Vertex AI) : on ne l'a pas touché.
  controle(`nombre de blocs credentials identique à ${AVANT}`, compte(wf.brut, /"credentials"\s*:/g), compte(av.brut, /"credentials"\s*:/g));
  controle(`nombre de $env identique à ${AVANT}`, compte(wf.brut, /\$env/g), compte(av.brut, /\$env/g));
  controle(`activeVersion identique à ${AVANT}`, wf.W.activeVersion, av.W.activeVersion);
  controle(`connexions identiques à ${AVANT}`, wf.W.connections, av.W.connections);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1. MCP - Google Drive OCR (mistral)');
{
  const wf = charger('MCP_-_Google_Drive_OCR');
  const av = chargerAvant('MCP_-_Google_Drive_OCR');
  hygiene(wf, av);
  const BASE = { google_access_token: 'ya29.jeton-oauth-381', file_id: 'f1', user_id: 'u1', guild_id: 'g1', user_request: 't' };
  const valider = (w, body) => execCode(w, 'Validate Input', { json: { body } });
  const bearer = (w, body) => enTete(w, 'Mistral OCR API', 'Authorization', { noeuds: { 'Validate Input': valider(w, body) } });

  controle('(a) mistral_api_key seule → Bearer explicite', bearer(wf, { ...BASE, mistral_api_key: EXPL.mistral }), `Bearer ${EXPL.mistral}`);
  controle('(a) context.mistral_api_key seule → Bearer explicite', bearer(wf, { ...BASE, context: { mistral_api_key: EXPL.mistral } }), `Bearer ${EXPL.mistral}`);
  controle('(b) plugin_context.api_keys.mistral seule → Bearer plugin', bearer(wf, { ...BASE, ...plugin({ mistral: PLUG.mistral }) }), `Bearer ${PLUG.mistral}`);
  controle('(c) mistral_api_key + plugin_context → explicite', bearer(wf, { ...BASE, mistral_api_key: EXPL.mistral, ...plugin({ mistral: PLUG.mistral }) }), `Bearer ${EXPL.mistral}`);
  controle('(c) context.mistral_api_key + plugin_context → explicite', bearer(wf, { ...BASE, context: { mistral_api_key: EXPL.mistral }, ...plugin({ mistral: PLUG.mistral }) }), `Bearer ${EXPL.mistral}`);
  controle('(b) plugin_context pour un autre fournisseur → ignoré', bearer(wf, { ...BASE, ...plugin({ openai: PLUG.openai }) }), 'Bearer ');
  const sans = valider(wf, { ...BASE });
  controle('(d) aucune clé → requête toujours valide (clé facultative)', sans.valid, true);
  controle('(d) aucune clé → en-tête « Bearer » vide', bearer(wf, { ...BASE }), 'Bearer ');
  if (av) {
    controle(`(d) aucune clé → sortie Validate Input identique à ${AVANT}`,
      { ...sans, startTime: 0 }, { ...valider(av, { ...BASE }), startTime: 0 });
    for (const n of ['List Drive Files', 'Download File', 'Get File Metadata']) {
      controle(`jeton OAuth : nœud ${n} identique à ${AVANT}`, wf.nd(n).parameters, av.nd(n).parameters);
    }
  }
  controle('jeton OAuth : Download File porte le jeton, pas la clé Mistral',
    enTete(wf, 'Download File', 'Authorization', { noeuds: { 'Validate Input': valider(wf, { ...BASE, ...plugin({ mistral: PLUG.mistral }) }) } }),
    'Bearer ya29.jeton-oauth-381');

  const prev = valider(wf, { ...BASE, ...plugin({ mistral: PLUG.mistral }) });
  const sortie = execCode(wf, 'Format OCR Output', {
    json: { model: 'mistral-ocr-latest', pages: [{ index: 0, markdown: 'texte' }], usage_info: { pages_processed: 1 } },
    noeuds: { 'Validate Input': prev, 'Get File Metadata': { name: 'a.png', mimeType: 'image/png' } },
  });
  controle('(e) Format OCR Output : succès, texte', [sortie.success, sortie.data && sortie.data.text], [true, 'texte']);
  controle('(e) Format OCR Output : clé absente (réponse et _trace)', contientCle(sortie), false);
  const invalide = valider(wf, { google_access_token: 'ya29', ...plugin({ mistral: PLUG.mistral }) });
  controle('(e) requête invalide + clé plugin → Build Error sans la clé',
    [invalide.valid, contientCle(invalide), contientCle(execCode(wf, 'Build Error', { json: invalide }))], [false, false, false]);
  controle('sticky mentionne plugin_context.api_keys.mistral', wf.nd('Documentation').parameters.content.includes('plugin_context.api_keys.mistral'), true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. MCP - Table Extractor (mistral, branches synchrone et asynchrone)');
{
  const wf = charger('MCP_-_Table_Extractor');
  const av = chargerAvant('MCP_-_Table_Extractor');
  hygiene(wf, av);
  const BASE = { data: 'https://exemple.test/t.png', source: 'url', execution_mode: 'online' };
  // Synchrone : le nœud HTTP reçoit l'item du webhook (Has Callback URL? le laisse passer).
  const sync = (w, body) => enTete(w, 'Mistral OCR', 'Authorization', { json: { body } });
  // Asynchrone : Store Job Context → Respond 202 Accepted (qui relaie son entrée) → HTTP.
  const contexteAsync = (w, body) => execCode(w, 'Store Job Context', { noeuds: { Webhook: { body: { ...body, callback_url: 'https://rappel.test/cb' } } } });
  const asyn = (w, body) => enTete(w, 'Mistral OCR (Async)', 'Authorization', { json: contexteAsync(w, body) });

  for (const [branche, f] of [['sync', sync], ['async', asyn]]) {
    controle(`(a) ${branche} : mistral_api_key seule → Bearer explicite`, f(wf, { ...BASE, mistral_api_key: EXPL.mistral }), `Bearer ${EXPL.mistral}`);
    controle(`(b) ${branche} : plugin_context.api_keys.mistral seule → Bearer plugin`, f(wf, { ...BASE, ...plugin({ mistral: PLUG.mistral }) }), `Bearer ${PLUG.mistral}`);
    controle(`(c) ${branche} : les deux → explicite`, f(wf, { ...BASE, mistral_api_key: EXPL.mistral, ...plugin({ mistral: PLUG.mistral }) }), `Bearer ${EXPL.mistral}`);
    controle(`(d) ${branche} : aucune clé → « Bearer » vide`, f(wf, { ...BASE }), 'Bearer ');
    if (av) controle(`(d) ${branche} : aucune clé → même en-tête qu'à ${AVANT}`, f(wf, { ...BASE }), f(av, { ...BASE }));
  }
  if (av) {
    controle(`validation (IF « data ») identique à ${AVANT}`, wf.nd('Validate Input').parameters, av.nd('Validate Input').parameters);
    for (const n of ['Mistral OCR', 'Mistral OCR (Async)']) {
      controle(`${n} : corps JSON identique à ${AVANT}`, wf.nd(n).parameters.jsonBody, av.nd(n).parameters.jsonBody);
    }
  }

  const body = { ...BASE, ...plugin({ mistral: PLUG.mistral }), mistral_api_key: EXPL.mistral };
  const reponse = { id: 'c1', model: 'pixtral-12b-2409', choices: [{ message: { content: '{"tables":[{"id":1,"headers":["a"],"rows":[["1"]]}],"table_count":1}' } }] };
  const erreurN8n = { error: { message: '401 - {"detail":"Unauthorized"}', code: 401, config: { headers: { Authorization: `Bearer ${PLUG.mistral}` } } } };
  for (const [libelle, entree] of [['succès', reponse], ['erreur 401', erreurN8n]]) {
    const s = execCode(wf, 'Parse OCR Response', { json: entree, noeuds: { Webhook: { body } } });
    controle(`(e) sync ${libelle} : Parse OCR Response sans la clé`, [typeof s.success, contientCle(s)], ['boolean', false]);
    const sjc = contexteAsync(wf, body);
    const sa = execCode(wf, 'Parse OCR Response (Async)', { json: entree, noeuds: { 'Store Job Context': sjc } });
    const cb = execCode(wf, 'Prepare Callback', { json: sa, env: {} });
    controle(`(e) async ${libelle} : corps de rappel sans la clé`, [typeof cb.corps_json, contientCle(cb)], ['string', false]);
  }
  controle('(e) 202 Accepted sans la clé', contientCle(resoudre(wf.nd('Respond 202 Accepted').parameters.responseBody, { json: contexteAsync(wf, body) })), false);
  controle('(e) 400 « data manquant » sans la clé', contientCle(resoudre(wf.nd('Error: No Data').parameters.responseBody, { json: { body: { ...body, data: '' } } })), false);
  controle('sticky mentionne plugin_context.api_keys.mistral', wf.nd('API Documentation').parameters.content.includes('plugin_context.api_keys.mistral'), true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3. MCP - PDF Layout Translator (mistral, anthropic, openai)');
{
  const wf = charger('MCP_-_PDF_Layout_Translator');
  const av = chargerAvant('MCP_-_PDF_Layout_Translator');
  hygiene(wf, av);
  const BASE = { file_url: 'https://exemple.test/doc.pdf', user_id: 'u1', guild_id: 'g1', user_request: 't' };
  const EXPLICITES = { mistral_api_key: EXPL.mistral, api_key: EXPL.anthropic, openai_api_key: EXPL.openai };
  const CHAMP = { mistral: 'mistral_api_key', anthropic: 'api_key', openai: 'openai_api_key' };
  const valider = (w, body) => execCode(w, 'Validate Input', { json: { body } });
  /** Ce qui part réellement : en-tête Pixtral, et clés relayées au worker de traduction. */
  function envoye(w, body) {
    const v = valider(w, body);
    if (!v || !v.valid) return { valide: false, v };
    const ej = execCode(w, 'Extract Job ID', { json: { body: { job_id: 'job-api-381' } }, noeuds: { 'Validate Input': v } });
    const prep = execCode(w, 'Extract OCR + Prepare Worker', {
      json: { statusCode: 200, body: { choices: [{ message: { content: 'Texte OCR' } }] } }, noeuds: { 'Extract Job ID': ej },
    });
    const worker = JSON.parse(resoudre(w.nd('Call Torah-Translate-Worker').parameters.jsonBody, { json: prep }));
    return {
      valide: true, v, ej, prep,
      mistral: enTete(w, 'Mistral Pixtral OCR', 'Authorization', { json: ej }).replace(/^Bearer /, ''),
      anthropic: worker.api_key,
      openai: worker.openai_api_key,
    };
  }
  const sans = (f) => { const b = { ...BASE, ...EXPLICITES }; delete b[CHAMP[f]]; return b; };

  for (const f of ['mistral', 'anthropic', 'openai']) {
    const lieu = f === 'mistral' ? 'en-tête Pixtral' : 'clé relayée au worker';
    controle(`(a) ${f} : ${CHAMP[f]} seule → ${lieu} explicite`, envoye(wf, { ...BASE, ...EXPLICITES })[f], EXPL[f]);
    controle(`(b) ${f} : plugin_context seule → ${lieu} plugin`, envoye(wf, { ...sans(f), ...plugin({ [f]: PLUG[f] }) })[f], PLUG[f]);
    controle(`(c) ${f} : les deux → explicite`, envoye(wf, { ...BASE, ...EXPLICITES, ...plugin({ [f]: PLUG[f] }) })[f], EXPL[f]);
    const d = valider(wf, sans(f));
    const msg = (d.errors || []).find(e => e.startsWith(CHAMP[f])) || '';
    controle(`(d) ${f} : aucune clé → invalide`, d.valid, false);
    controle(`(d) ${f} : message garde « ${CHAMP[f]} » et nomme plugin_context.api_keys.${f}`,
      [msg.startsWith(CHAMP[f]), msg.includes(`plugin_context.api_keys.${f}`), msg.endsWith('required')], [true, true, true]);
    if (av) controle(`(d) ${f} : aucune clé → invalide aussi à ${AVANT}`, valider(av, sans(f)).valid, false);
    const be = execCode(wf, 'Build Error', { json: d });
    controle(`(d) ${f} : Build Error VALIDATION_ERROR`, be.error && be.error.code, 'VALIDATION_ERROR');
  }
  controle('(a) anthropic : context.anthropic_api_key reste lu',
    envoye(wf, { ...sans('anthropic'), context: { anthropic_api_key: EXPL.anthropic }, ...plugin({ anthropic: PLUG.anthropic }) }).anthropic, EXPL.anthropic);
  const tout = envoye(wf, { ...BASE, ...plugin({ mistral: PLUG.mistral, anthropic: PLUG.anthropic, openai: PLUG.openai }) });
  controle('(b) les trois clés par plugin_context seules → valide', [tout.valide, tout.mistral, tout.anthropic, tout.openai], [true, PLUG.mistral, PLUG.anthropic, PLUG.openai]);

  if (!tout.valide) controle('(e) chaîne exécutable avec les clés plugin (préalable aux contrôles de sortie)', false, true);
  else {
  const reponse = resoudre(wf.nd('Respond Started').parameters.responseBody, { json: tout.ej, noeuds: { 'Validate Input': tout.v } });
  controle('(e) Respond Started : ACK sans la clé', [JSON.parse(reponse).status, contientCle(reponse)], ['started', false]);
  const echecOcr = execCode(wf, 'Extract OCR + Prepare Worker', { json: { statusCode: 401, body: { message: 'Unauthorized' } }, noeuds: { 'Extract Job ID': tout.ej } });
  controle('(e) Update Job Error (vers torah-api) sans la clé', contientCle(resoudre(wf.nd('Update Job Error').parameters.jsonBody, { json: echecOcr })), false);
  controle('(e) Update Job Success (vers torah-api) sans la clé', contientCle(resoudre(wf.nd('Update Job Success').parameters.jsonBody, { json: tout.prep })), false);
  controle('(e) Log Completion sans la clé', contientCle(execCode(wf, 'Log Completion', { noeuds: { 'Extract OCR + Prepare Worker': tout.prep } })), false);
  }
  const invalide = valider(wf, { ...plugin({ mistral: PLUG.mistral, anthropic: PLUG.anthropic, openai: PLUG.openai }) });
  controle('(e) requête invalide + clés plugin → Build Error sans la clé', [invalide.valid, contientCle(execCode(wf, 'Build Error', { json: invalide }))], [false, false]);
  controle('Create Job ne référence aucune clé', /ApiKey|api_key/i.test(JSON.stringify(wf.nd('Create Job').parameters)), false);
  controle('sticky mentionne plugin_context.api_keys', wf.nd('Documentation').parameters.content.includes('plugin_context.api_keys'), true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n4. MCP - Transcriber (google)');
{
  const wf = charger('MCP_-_Transcriber');
  const av = chargerAvant('MCP_-_Transcriber');
  hygiene(wf, av);
  const BASE = { videoUrl: 'https://www.youtube.com/watch?v=x', provider: 'google', model: 'gemini-3.6-flash' };
  const valider = (w, body, env = {}) => execCode(w, 'Validate Input', { json: { body }, env });
  const cle = (w, body) => enTete(w, 'Transcribe (Gemini)', 'x-goog-api-key', { json: valider(w, body) });

  controle('(a) api_key seule → x-goog-api-key explicite', cle(wf, { ...BASE, api_key: EXPL.google }), EXPL.google);
  controle('(a) context.api_key seule → explicite', cle(wf, { ...BASE, context: { api_key: EXPL.google } }), EXPL.google);
  controle('(a) google_api_key seule → explicite', cle(wf, { ...BASE, google_api_key: EXPL.google }), EXPL.google);
  controle('(b) plugin_context.api_keys.google seule → x-goog-api-key plugin', cle(wf, { ...BASE, ...plugin({ google: PLUG.google }) }), PLUG.google);
  controle('(c) api_key + plugin_context → explicite', cle(wf, { ...BASE, api_key: EXPL.google, ...plugin({ google: PLUG.google }) }), EXPL.google);
  controle('(c) context.api_key + plugin_context → explicite', cle(wf, { ...BASE, context: { api_key: EXPL.google }, ...plugin({ google: PLUG.google }) }), EXPL.google);
  const sans = valider(wf, { ...BASE }, { GEMINI_API_KEY: 'AIza-ENV', GOOGLE_API_KEY: 'AIza-ENV' });
  controle('(d) aucune clé (même avec $env Gemini) → invalide 400', [sans.valide, sans.statut], [false, 400]);
  const msg = (sans.erreurs || []).find(e => /api_key/.test(e)) || '';
  controle('(d) message garde « api_key requise » et nomme plugin_context.api_keys.google',
    [/api_key requise/.test(msg), msg.includes('plugin_context.api_keys.google')], [true, true]);
  if (av) controle(`(d) aucune clé → invalide aussi à ${AVANT}`, valider(av, { ...BASE }).valide, false);
  controle('(d) plugin_context vers un autre fournisseur → invalide', valider(wf, { ...BASE, ...plugin({ openai: PLUG.openai }) }).valide, false);

  const amont = valider(wf, { ...BASE, ...plugin({ google: PLUG.google }) });
  const ok = execCode(wf, 'Format Response', {
    json: { statusCode: 200, body: { modelVersion: 'gemini-3.6-flash', candidates: [{ content: { parts: [{ text: 'bonjour' }] } }], usageMetadata: { totalTokenCount: 3 } } },
    noeuds: { 'Validate Input': amont },
  });
  controle('(e) Format Response succès : transcript, clé absente', [ok.success, ok.transcript, contientCle(ok)], [true, 'bonjour', false]);
  const ko = execCode(wf, 'Format Response', {
    json: { statusCode: 403, body: { error: { code: 403, message: 'API key not valid', status: 'PERMISSION_DENIED' } } },
    noeuds: { 'Validate Input': amont },
  });
  controle('(e) Format Response 403 : statut relayé, clé absente', [ko.statut, contientCle(ko)], [403, false]);
  const invalide = valider(wf, { provider: 'google', ...plugin({ google: PLUG.google }) });
  controle('(e) vidéo absente + clé plugin → Build Error sans la clé', [invalide.valide, contientCle(execCode(wf, 'Build Error', { json: invalide }))], [false, false]);
  controle('sticky mentionne plugin_context.api_keys.google', wf.nd('Documentation').parameters.content.includes('plugin_context.api_keys.google'), true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n5. MCP - Tools Enricher (anthropic, openai ; repli $env historique en dernier)');
{
  const wf = charger('MCP_-_Tools_Enricher');
  const av = chargerAvant('MCP_-_Tools_Enricher');
  hygiene(wf, av);
  const BASE = { user_id: 'u1', guild_id: 'g1', user_request: 't', n8n_api_key: 'n8n-cle-381', dry_run: true };
  const MODELES = { MODEL_ANTHROPIC: 'claude-haiku-4-5-20251001', MODEL_OPENAI: 'gpt-5-mini' };
  const FICTIF = { id: 'w381', name: 'MCP - Fictif', active: true, updatedAt: '2026-09-01T00:00:00Z',
    nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: 'fictif', httpMethod: 'POST' } }] };
  const META = { description: 'Tester un outil', category: 'autre', keywords: ['test'], use_cases: ['Tester'], operations: [{ id: 'op', type: 'READ', verbs_fr: ['lire'], verbs_en: ['read'] }] };

  const valider = (w, body, env = MODELES, statique = {}) => execCode(w, 'Validate Input', { json: { body, headers: {} }, env: { ...MODELES, ...env }, statique });
  /** Chaîne jusqu'aux trois appels fournisseurs ; rend les en-têtes réellement envoyés. */
  function envoye(w, body, env = {}) {
    const statique = {};
    const v = valider(w, body, env, statique);
    if (!v || !v.valid) return { valide: false, v };
    const fw = execCode(w, 'Filter Workflows', { json: { result: { points: [] } }, noeuds: { 'Get Workflows': { data: [FICTIF] }, 'Validate Input': v } });
    const pw = execCode(w, 'Process Workflow', { json: fw, noeuds: { 'Validate Input': v } });
    const pcl = execCode(w, 'Parse Claude', { json: { content: [{ type: 'tool_use', input: META }], usage: {} }, noeuds: { 'Process Workflow': pw } });
    const pg = execCode(w, 'Parse GPT', { json: { choices: [{ message: { content: '{"valid":true,"score":0.9,"corrections":null}' } }] }, noeuds: { 'Parse Claude': pcl } });
    return {
      valide: true, v, pw, pcl, pg, statique,
      anthropic: enTete(w, 'Claude Generate', 'x-api-key', { json: pw }),
      openai: enTete(w, 'GPT Validate', 'Authorization', { json: pcl }).replace(/^Bearer /, ''),
      openaiEmbedding: enTete(w, 'Generate Embedding', 'Authorization', { json: pg }).replace(/^Bearer /, ''),
    };
  }
  const autre = f => (f === 'anthropic' ? 'openai' : 'anthropic');
  const explicite = (f, cle) => ({ api_keys: { [f]: cle } });
  const avecAutre = (f, extra = {}) => {
    const b = { ...BASE, ...extra };
    b.api_keys = { ...(extra.api_keys || {}), [autre(f)]: EXPL[autre(f)] };
    return b;
  };

  for (const f of ['anthropic', 'openai']) {
    const lire = r => (f === 'anthropic' ? r.anthropic : [r.openai, r.openaiEmbedding]);
    const attendu = cle => (f === 'anthropic' ? cle : [cle, cle]);
    controle(`(a) ${f} : api_keys.${f} seule → appel explicite`, lire(envoye(wf, { ...avecAutre(f, explicite(f, EXPL[f])) })), attendu(EXPL[f]));
    controle(`(a) ${f} : context.api_keys.${f} seule → appel explicite`, lire(envoye(wf, { ...avecAutre(f), context: explicite(f, EXPL[f]) })), attendu(EXPL[f]));
    controle(`(b) ${f} : plugin_context.api_keys.${f} seule → appel plugin`, lire(envoye(wf, { ...avecAutre(f), ...plugin({ [f]: PLUG[f] }) })), attendu(PLUG[f]));
    controle(`(c) ${f} : api_keys + plugin_context → explicite`, lire(envoye(wf, { ...avecAutre(f, explicite(f, EXPL[f])), ...plugin({ [f]: PLUG[f] }) })), attendu(EXPL[f]));
    controle(`(c) ${f} : context.api_keys + plugin_context → explicite`, lire(envoye(wf, { ...avecAutre(f), context: explicite(f, EXPL[f]), ...plugin({ [f]: PLUG[f] }) })), attendu(EXPL[f]));
    const envF = { [f === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY']: ENV[f] };
    controle(`(d) ${f} : plugin_context + $env → plugin_context avant $env`, lire(envoye(wf, { ...avecAutre(f), ...plugin({ [f]: PLUG[f] }) }, envF)), attendu(PLUG[f]));
    controle(`(d) ${f} : aucune clé du corps + $env → repli $env conservé`, lire(envoye(wf, { ...avecAutre(f) }, envF)), attendu(ENV[f]));
    if (av) controle(`(d) ${f} : aucune clé du corps + $env → même clé qu'à ${AVANT}`,
      lire(envoye(wf, { ...avecAutre(f) }, envF)), lire(envoye(av, { ...avecAutre(f) }, envF)));
    const d = valider(wf, { ...avecAutre(f) });
    const nomEnv = f === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    const msg = (d.errors || []).find(e => e.includes(nomEnv)) || '';
    controle(`(d) ${f} : ni corps ni $env → invalide`, d.valid, false);
    controle(`(d) ${f} : message garde « Missing ${nomEnv} » et nomme plugin_context.api_keys.${f}`,
      [msg.startsWith(`Missing ${nomEnv}`), msg.includes(`plugin_context.api_keys.${f}`), msg.includes(':')], [true, true, false]);
    if (av) controle(`(d) ${f} : ni corps ni $env → invalide aussi à ${AVANT}`, valider(av, { ...avecAutre(f) }).valid, false);
  }
  if (av) {
    controle(`garde #459 : GPT Validate (corps JSON) identique à ${AVANT}`, wf.nd('GPT Validate').parameters.jsonBody, av.nd('GPT Validate').parameters.jsonBody);
    controle(`n8n et Qdrant : Get Workflows / Get Indexed identiques à ${AVANT}`,
      [wf.nd('Get Workflows').parameters, wf.nd('Get Indexed').parameters], [av.nd('Get Workflows').parameters, av.nd('Get Indexed').parameters]);
  }

  // (e) La sortie formatée : réponse finale, rappel, ACK, erreur de validation.
  const r = envoye(wf, { ...BASE, ...plugin({ anthropic: PLUG.anthropic, openai: PLUG.openai }), api_keys: { anthropic: EXPL.anthropic } });
  if (!r.valide) controle('(e) chaîne exécutable avec une clé plugin (préalable aux contrôles de sortie)', false, true);
  else {
  const pq = execCode(wf, 'Prepare Qdrant', { json: { data: [{ embedding: [0.1, 0.2] }] }, noeuds: { 'Parse GPT': r.pg } });
  const ctxStat = { statique: r.statique };
  execCode(wf, 'Track Result', { json: {}, noeuds: { 'Prepare Qdrant': pq, 'Validate Input': r.v }, ...ctxStat });
  execCode(wf, 'Mark Failed', { json: { ...r.pcl, claude_error: 'Claude API error' }, ...ctxStat });
  const agg = execCode(wf, 'Aggregate Stats', { noeuds: { 'Validate Input': r.v }, ...ctxStat });
  controle('(e) Aggregate Stats : 2 résultats, clé absente (réponse et _trace)',
    [agg.responseBody && agg.responseBody.results.length, contientCle(agg)], [2, false]);
  const cb = execCode(wf, 'Prepare Callback', { json: agg, env: {} });
  controle('(e) Prepare Callback : corps de rappel sans la clé', [typeof cb.corps_json, contientCle(cb)], ['string', false]);
  for (const n of ['Respond Accepted (Async)', 'Respond Accepted (Sync)']) {
    controle(`(e) ${n} sans la clé`, contientCle(resoudre(wf.nd(n).parameters.responseBody, { json: r.v })), false);
  }
  }
  const invalide = valider(wf, { user_id: 'u1', ...plugin({ anthropic: PLUG.anthropic, openai: PLUG.openai }) }, {});
  controle('(e) N8N_API_KEY absente + clés plugin → Build Error sans la clé',
    [invalide.valid, contientCle(execCode(wf, 'Build Error', { json: invalide }))], [false, false]);
  controle('sticky mentionne plugin_context.api_keys', wf.nd('Documentation').parameters.content.includes('plugin_context.api_keys'), true);
}

if (process.argv.includes('--en-ligne')) enLigne().then(conclure, e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
else conclure();

// ─────────────────────────────────────────────────────────────────────────────
/** PNG blanc barré de noir, construit localement (aucune ressource externe). */
function petitPng(l = 64, h = 32) {
  const tableCrc = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = tableCrc[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloc = (type, data) => {
    const t = Buffer.from(type, 'ascii'); const lg = Buffer.alloc(4); lg.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([lg, t, data, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const brut = Buffer.alloc((l * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) {
    brut[y * (l * 3 + 1)] = 0;
    if (y >= 14 && y < 18) for (let x = 8; x < l - 8; x++) brut.fill(0, y * (l * 3 + 1) + 1 + x * 3, y * (l * 3 + 1) + 4 + x * 3);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]).toString('base64');
}

async function enLigne() {
  console.log('\n6. En ligne — la clé ne vient QUE de plugin_context.api_keys (requêtes produites par les workflows)');
  const cles = { mistral: process.env.MISTRAL_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY };
  const secrets = Object.values(cles).filter(Boolean);
  const fuite = v => contientCle(v, secrets);
  const appel = async (libelle, url, headers, corps) => {
    const t0 = Date.now();
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(corps) });
    const j = await r.json().catch(() => ({}));
    const detail = r.ok ? '' : ` — ${String((j.error && (j.error.message || j.error)) || j.message || j.detail || '').slice(0, 120)}`;
    console.log(`     ${libelle} : HTTP ${r.status}, ${Date.now() - t0} ms${detail}`);
    return { statut: r.status, j };
  };
  const b64 = petitPng();

  if (!cles.mistral) console.log('  ⏭  MISTRAL_API_KEY absente — Mistral sauté');
  else {
    { // Google Drive OCR → POST /v1/ocr
      const wf = charger('MCP_-_Google_Drive_OCR');
      const v = execCode(wf, 'Validate Input', { json: { body: { google_access_token: 'ya29.fictif', file_id: 'f1', ...plugin({ mistral: cles.mistral }) } } });
      const opts = { noeuds: { 'Validate Input': v, 'Get File Metadata': { name: 'a.png', mimeType: 'image/png' } }, binary: { data: { data: b64 } } };
      const n = wf.nd('Mistral OCR API').parameters;
      const r = await appel('Google Drive OCR → mistral /v1/ocr', n.url, enTetes(wf, 'Mistral OCR API', opts), JSON.parse(resoudre(n.jsonBody, opts)));
      controle('Google Drive OCR : Mistral OCR rend 200', r.statut, 200);
      const s = execCode(wf, 'Format OCR Output', { json: r.j, noeuds: opts.noeuds });
      controle('Google Drive OCR : sortie formatée sans la clé', fuite(s), false);
    }
    { // Table Extractor (synchrone) → pixtral chat/completions
      const wf = charger('MCP_-_Table_Extractor');
      const body = { data: b64, source: 'base64', ...plugin({ mistral: cles.mistral }) };
      const n = wf.nd('Mistral OCR').parameters;
      const r = await appel('Table Extractor → mistral pixtral-12b-2409', n.url, enTetes(wf, 'Mistral OCR', { json: { body } }), JSON.parse(resoudre(n.jsonBody, { json: { body } })));
      controle('Table Extractor : Mistral rend 200', r.statut, 200);
      const s = execCode(wf, 'Parse OCR Response', { json: r.j, noeuds: { Webhook: { body } } });
      controle('Table Extractor : sortie formatée sans la clé', fuite(s), false);
    }
    { // PDF Layout Translator → pixtral chat/completions (seul appel fournisseur du workflow)
      const wf = charger('MCP_-_PDF_Layout_Translator');
      const v = execCode(wf, 'Validate Input', { json: { body: { file_base64: b64, file_type: 'png',
        ...plugin({ mistral: cles.mistral, anthropic: 'non-utilise-ici', openai: 'non-utilise-ici' }) } } });
      const ej = execCode(wf, 'Extract Job ID', { json: {}, noeuds: { 'Validate Input': v } });
      const n = wf.nd('Mistral Pixtral OCR').parameters;
      const corps = JSON.parse(resoudre(n.jsonBody, { json: ej }));
      const r = await appel('PDF Layout Translator → mistral pixtral-12b-2409', n.url, enTetes(wf, 'Mistral Pixtral OCR', { json: ej }), corps);
      controle('PDF Layout Translator : Mistral rend 200', r.statut, 200);
      const prep = execCode(wf, 'Extract OCR + Prepare Worker', { json: { statusCode: r.statut, body: r.j }, noeuds: { 'Extract Job ID': ej } });
      controle('PDF Layout Translator : Log Completion sans la clé', fuite(execCode(wf, 'Log Completion', { noeuds: { 'Extract OCR + Prepare Worker': prep } })), false);
    }
  }

  if (!cles.anthropic || !cles.openai) { console.log('  ⏭  ANTHROPIC_API_KEY ou OPENAI_API_KEY absente — Tools Enricher sauté'); return; }
  { // Tools Enricher : Claude Generate puis GPT Validate, $env SANS clé (le repli ne peut pas masquer)
    const wf = charger('MCP_-_Tools_Enricher');
    const env = { MODEL_ANTHROPIC: process.env.MODEL_ANTHROPIC || 'claude-haiku-4-5-20251001', MODEL_OPENAI: process.env.MODEL_OPENAI || 'gpt-5-mini' };
    const statique = {};
    const v = execCode(wf, 'Validate Input', { json: { body: { user_id: 'u1', n8n_api_key: 'n8n-fictif', dry_run: true,
      ...plugin({ anthropic: cles.anthropic, openai: cles.openai }) }, headers: {} }, env, statique });
    controle('Tools Enricher : valide sans $env de clé', v.valid, true);
    const FICTIF = { id: 'w381', name: 'MCP - Fictif', active: true, updatedAt: '2026-09-01T00:00:00Z',
      nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: 'fictif', httpMethod: 'POST' } }] };
    const fw = execCode(wf, 'Filter Workflows', { json: { result: { points: [] } }, noeuds: { 'Get Workflows': { data: [FICTIF] }, 'Validate Input': v } });
    const pw = execCode(wf, 'Process Workflow', { json: fw, noeuds: { 'Validate Input': v } });
    const c = wf.nd('Claude Generate').parameters;
    const rc = await appel(`Tools Enricher → anthropic ${env.MODEL_ANTHROPIC}`, c.url, enTetes(wf, 'Claude Generate', { json: pw }), JSON.parse(resoudre(c.jsonBody, { json: pw })));
    controle('Tools Enricher : Anthropic rend 200', rc.statut, 200);
    const pcl = execCode(wf, 'Parse Claude', { json: rc.j, noeuds: { 'Process Workflow': pw } });
    controle('Tools Enricher : tool_use lu', pcl.status, 'claude_ok');
    const g = wf.nd('GPT Validate').parameters;
    const rg = await appel(`Tools Enricher → openai ${env.MODEL_OPENAI}`, g.url, enTetes(wf, 'GPT Validate', { json: pcl }), JSON.parse(resoudre(g.jsonBody, { json: pcl })));
    controle('Tools Enricher : OpenAI rend 200', rg.statut, 200);
    const pg = execCode(wf, 'Parse GPT', { json: rg.j, noeuds: { 'Parse Claude': pcl } });
    const pq = execCode(wf, 'Prepare Qdrant', { json: { data: [{ embedding: [0.1] }] }, noeuds: { 'Parse GPT': pg } });
    execCode(wf, 'Track Result', { json: {}, noeuds: { 'Prepare Qdrant': pq, 'Validate Input': v }, statique });
    const agg = execCode(wf, 'Aggregate Stats', { noeuds: { 'Validate Input': v }, statique });
    console.log(`     statut Parse GPT : ${pg.status}`);
    controle('Tools Enricher : réponse finale sans la clé', [agg.responseBody.results.length, fuite(agg)], [1, false]);
  }
}

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length}/${total} contrôle(s) en échec`); process.exit(1); }
  console.log(`✅ tous les contrôles passent  (${total}/${total})`);
}
