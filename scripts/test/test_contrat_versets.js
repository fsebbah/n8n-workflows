#!/usr/bin/env node
/**
 * Contrat d'entrée d'un lot de VERSETS, de bout en bout : Torah Router →
 * Torah Batch Dispatcher (azy.daily#201).
 *
 *     node scripts/test/test_contrat_versets.js
 *     node scripts/test/test_contrat_versets.js --en-ligne   # vérifie l'énumération job_type
 *
 * Le test exécute le JavaScript extrait du JSON des workflows : c'est le code qui
 * sera importé, pas une copie.
 *
 * Ce qu'il verrouille
 * -------------------
 *  - `job_type` émis est TOUJOURS dans l'énumération de /api/v2/jobs, quelle que
 *    soit la valeur envoyée par l'appelant. « torah_segment » (proposé par le
 *    plugin) et « translation » (ancien défaut du Router) sont tous deux refusés
 *    en 422 — et Create Job étant en onError, l'échec passait inaperçu : aucun
 *    job créé, et la suite du pipeline patchant un job inexistant ;
 *  - un lot de versets ne porte que `segment_id`, un lot de commentaires que
 *    `commentary_id` : le dispatcher refuse le couple ;
 *  - un lot MIXTE ne colle pas le commentateur de l'en-tête aux versets ;
 *  - sans traité ni page, le prompt ne contient pas « Contexte: undefined
 *    undefined » — il omet la ligne ;
 *  - `provider` et `target_language` traversent jusqu'au dispatcher, faute de
 *    quoi /api/translations/save-batch écrit des lignes sans provenance (#443).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const ROUTER = lire('Torah_Router.json');
const DISPATCHER = lire('Torah_Batch_Dispatcher.json');

const code = (wf, nom) => wf.nodes.find(n => n.name === nom).parameters.jsCode;
const expr = (wf, nom) => wf.nodes.find(n => n.name === nom).parameters.jsonBody;

// Énumération renvoyée par /api/v2/jobs (vérifiée en direct, cf. --en-ligne).
const JOB_TYPES = ['torah_page', 'torah_commentary', 'torah_unit', 'torah_vocalization',
                   'pdf_translation', 'pdf_summarize', 'image_ocr', 'image_translation'];

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 64 ? obtenu.slice(0, 64) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(52)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

function executer(src, entree, refs = {}) {
  const env = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: n => { if (!(n in refs)) throw new Error(`nœud « ${n} » non fourni`); const v = env(refs[n]); return { all: () => v, first: () => v[0] }; },
    $env: { N8N_WEBHOOK_URL: 'http://x', TORAH_API_URL: 'http://api' },
    console, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, Date,
  };
  return env(vm.runInNewContext(`(function(){${src}})()`, ctx));
}

/** Rejoue Router.Parse Input → Router.Build Batch Payload → Dispatcher. */
function chaine(payload) {
  const hook = { body: payload, headers: {} };
  const pd = executer(code(ROUTER, 'Parse Input'), hook)[0].json;
  const lot = executer(code(ROUTER, 'Build Batch Payload'), {},
    { 'Parse Input': pd, 'Webhook Trigger': hook })[0].json;
  const val = executer(code(DISPATCHER, 'Validate Input'), { body: lot })[0].json;
  const req = executer(code(DISPATCHER, 'Build Requests'), {},
    { 'Validate Input': val, 'Create Job': { job_id: 'job-1' } })[0].json;
  return { pd, lot, val, req };
}

const VERSETS = {
  project_id: 'torah',
  job_type: 'torah_segment',           // la valeur devinée par le plugin
  target_language: 'fr',
  api_key: 'sk-ant-x',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  segments: [
    { segment_id: 'seg-1', text: 'בְּרֵאשִׁית בָּרָא' },
    { segment_id: 'seg-2', text: 'וְהָאָרֶץ הָיְתָה תֹהוּ' },
  ],
};

console.log('\n1. lot de VERSETS — le payload exact proposé par le plugin');
{
  const { pd, lot, val, req } = chaine(VERSETS);
  controle('job_type émis est dans l’énumération', JOB_TYPES.indexOf(lot.job_type) !== -1, true);
  controle('job_type déduit', lot.job_type, 'torah_unit');
  controle('valeur écartée conservée pour la trace', pd.jobTypeDemande, 'torah_segment');
  controle('validation du dispatcher', val.valid, true);
  controle('clé d’item = segment_id seul', Object.keys(lot.items[0]).sort(),
    ['commentary_id', 'metadata', 'page', 'segmentText', 'sourceLangName', 'segment_id', 'targetLangName', 'traite'].sort());
  controle('commentary_id nul sur un verset', lot.items[0].commentary_id, null);
  controle('aucun commentateur collé au verset', lot.items[0].metadata.commentator, null);
  controle('custom_id = segment_id', req.requests.map(r => r.custom_id), ['seg-1', 'seg-2']);
  controle('carte de nature correcte', req.metadata.commentary_map,
    { 'seg-1': { segment_id: 'seg-1' }, 'seg-2': { segment_id: 'seg-2' } });
  controle('provider relayé', req.metadata.provider, 'anthropic');
  controle('target_language relayé', req.metadata.target_language, 'fr');
  controle('prompt sans « undefined »', /undefined/.test(req.requests[0].params.messages[0].content), false);
  controle('prompt sans ligne Contexte vide', /Contexte:/.test(req.requests[0].params.messages[0].content), false);
}

console.log('\n2. lot de COMMENTAIRES — le flux existant ne change pas');
{
  const cb = Object.assign({}, VERSETS, {
    job_type: 'torah_commentary', commentator: 'Rashi', traite: 'Bereshit', page: '1',
    segments: [{ commentary_id: 'com-1', text: 'טקסט' }, { commentary_id: 'com-2', text: 'טקסט' }],
  });
  const { lot, val, req } = chaine(cb);
  controle('job_type conservé', lot.job_type, 'torah_commentary');
  controle('validation', val.valid, true);
  controle('custom_id = commentary_id', req.requests.map(r => r.custom_id), ['com-1', 'com-2']);
  controle('commentateur porté', lot.items[0].metadata.commentator, 'Rashi');
  controle('contexte dans le prompt',
    /Contexte: Bereshit - 1 - Rashi/.test(req.requests[0].params.messages[0].content), true);
}

console.log('\n3. lot MIXTE — versets et commentaires dans le même appel');
{
  const mx = Object.assign({}, VERSETS, {
    job_type: null, commentator: 'Rashi', traite: 'Bereshit', page: '1',
    segments: [
      { segment_id: 'seg-1', text: 'פסוק' },
      { commentary_id: 'com-1', text: 'פירוש' },
    ],
  });
  const { lot, val, req } = chaine(mx);
  controle('job_type déduit pour un lot mixte', lot.job_type, 'torah_unit');
  controle('validation : exactement un identifiant par item', val.valid, true);
  controle('le verset ne prend PAS le commentateur d’en-tête', lot.items[0].metadata.commentator, null);
  controle('le commentaire le prend', lot.items[1].metadata.commentator, 'Rashi');
  controle('custom_id des deux natures', req.requests.map(r => r.custom_id), ['seg-1', 'com-1']);
  controle('carte : une nature par item', req.metadata.commentary_map,
    { 'seg-1': { segment_id: 'seg-1' }, 'com-1': { commentary_id: 'com-1' } });
  const pVerset = req.requests[0].params.messages[0].content;
  controle('prompt du verset sans commentateur', /Rashi/.test(pVerset), false);
  controle('prompt du commentaire avec commentateur',
    /Rashi/.test(req.requests[1].params.messages[0].content), true);
}

console.log('\n4. inventaire du job — Create Job ne ment plus sur la nature');
{
  const { val } = chaine(VERSETS);
  // L'expression n8n est rejouée telle quelle, avec $json = la sortie de Validate Input.
  const e = expr(DISPATCHER, 'Create Job').replace(/^=\{\{|\}\}$/g, '');
  const corps = JSON.parse(vm.runInNewContext(e, { $json: val, JSON, Object, Array, Boolean }));
  controle('job_type', corps.job_type, 'torah_unit');
  controle('aucun commentary_id fantôme', corps.input.commentary_ids, []);
  controle('les segment_id sont inventoriés', corps.input.segment_ids, ['seg-1', 'seg-2']);
  controle('total', corps.input.total, 2);
}

console.log('\n5. l’appelant peut tout omettre');
{
  const nu = { project_id: 'torah', api_key: 'k',
               segments: [{ segment_id: 's1', text: 'א' }] };
  const { lot, val } = chaine(nu);
  controle('job_type déduit sans rien recevoir', lot.job_type, 'torah_unit');
  controle('dans l’énumération', JOB_TYPES.indexOf(lot.job_type) !== -1, true);
  controle('validation', val.valid, true);
  controle('modèle replié', lot.model, 'claude-sonnet-4-6');
}

// ---------------------------------------------------------------- en ligne
if (process.argv.includes('--en-ligne')) {
  console.log('\n6. l’énumération de /api/v2/jobs, telle que l’API la déclare');
  (async () => {
    const r = await fetch('http://host2.local:3031/api/v2/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-ID': 'torah' },
      body: JSON.stringify({ job_type: '__sonde__', input: {} }),
    });
    const b = await r.json();
    const msg = JSON.stringify(b);
    controle('valeur inconnue refusée', r.status, 422);
    for (const t of JOB_TYPES) controle(`  ${t} déclaré par l’API`, msg.indexOf(`'${t}'`) !== -1, true);
    controle('torah_segment absent de l’énumération', msg.indexOf("'torah_segment'") !== -1, false);
    conclure();
  })().catch(e => { console.log(`  ❌ ${e.message}`); echecs.push('sonde'); conclure(); });
} else conclure();

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
  console.log('✅ tous les contrôles passent');
}
