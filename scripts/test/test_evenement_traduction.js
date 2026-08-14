#!/usr/bin/env node
/**
 * Événement de fin de traduction sur `llm:results:stream` (azy.daily#225).
 *
 *     node scripts/test/test_evenement_traduction.js
 *
 * Le test exécute le JavaScript extrait du JSON des trois workflows concernés,
 * dans un émulateur minimal du contexte n8n.
 *
 * Le besoin
 * ---------
 * Le plugin pollait `torah-job-status` avec 60 s d'inactivité ; un lot de parasha
 * met 2–3 min chez Anthropic. Il lâchait donc avant la fin, alors que les
 * traductions aboutissaient. Il bascule en fire-and-forget et attend un
 * événement Redis.
 *
 * Les deux garanties que ce test verrouille
 * -----------------------------------------
 *  1. **Rien ne change sans `correlation_id`.** Le relais comme la publication y
 *     sont conditionnés. Les cinq payloads d'appelants réels doivent traverser la
 *     chaîne exactement comme avant — c'est vérifié ici par comparaison de bout en
 *     bout, pas par relecture.
 *  2. **L'événement part du callback, jamais du poller.** Le poller publie en
 *     parallèle du callback, donc AVANT `/save-batch` : un événement venu de lui
 *     ferait annoncer « prête » et débiter sur des traductions non persistées.
 *     D'où l'absence délibérée de `redis_channel` dans la soumission — le poller
 *     doit rester sur son canal par job.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const ROUTER = lire('Torah_Router.json');
const DISP = lire('Torah_Batch_Dispatcher.json');
const CB = lire('Torah_Batch_Callback.json');

const noeud = (wf, n) => wf.nodes.find(x => x.name === n);
const code = (wf, n) => noeud(wf, n).parameters.jsCode;

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 58 ? obtenu.slice(0, 58) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(54)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

function exec(src, entree, refs = {}) {
  const env = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: n => { if (!(n in refs)) throw new Error(`nœud « ${n} » non fourni`); const v = env(refs[n]); return { all: () => v, first: () => v[0] }; },
    $env: { N8N_WEBHOOK_URL: 'http://n8n', TORAH_API_URL: 'http://api', REDIS_XADD_SERVICE_URL: 'http://xadd' },
    console: { log() {} }, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, Date,
  };
  return env(vm.runInNewContext(`(function(){${src}})()`, ctx));
}

/** Router.Parse Input → Router.Build Batch Payload → Dispatcher. */
function soumission(payload) {
  const hook = { body: payload, headers: {} };
  const pd = exec(code(ROUTER, 'Parse Input'), hook)[0].json;
  if (!pd.useBatch) return { pd, direct: true };
  const lot = exec(code(ROUTER, 'Build Batch Payload'), {}, { 'Parse Input': pd, 'Webhook Trigger': hook })[0].json;
  const val = exec(code(DISP, 'Validate Input'), { body: lot })[0].json;
  const req = exec(code(DISP, 'Build Requests'), {}, { 'Validate Input': val, 'Create Job': { job_id: 'job-1' } })[0].json;
  return { pd, lot, val, req };
}

const segs = n => Array.from({ length: n }, (_, i) => ({ segment_id: `s${i}`, text: `טקסט ${i}` }));

const SANS = {
  project_id: 'torah', target_language: 'fr', api_key: 'sk-ant-x',
  provider: 'anthropic', model: 'claude-sonnet-4-6', segments: segs(60),
};
const AVEC = Object.assign({}, SANS, {
  correlation_id: 'torah-prepare-abc123',
  metadata: { discord_user_id: 'u1', channel_id: 'c1', message_id: 'm1' },
});

console.log('\n1. sans correlation_id — la chaîne ne bouge pas');
{
  const { val, req } = soumission(SANS);
  controle('aucune clé d’appairage dans la validation',
    ['correlation_id', 'client_metadata'].filter(k => k in val), []);
  controle('aucune clé d’appairage dans la soumission',
    ['correlation_id', 'redis_channel'].filter(k => k in req), []);
  controle('metadata du lot inchangée', Object.keys(req.metadata).sort(),
    ['callback_channel_id', 'commentary_map', 'job_id', 'model', 'multi',
     'project_id', 'provider', 'target_lang', 'target_language']);

  // Le metadata de l'appelant interne ne doit PAS se mettre à circuler.
  const interne = soumission(Object.assign({}, SANS, {
    metadata: { reference: 'Ber 2a', request_id: 'req-1' },
  }));
  controle('metadata de l’appelant interne non relayée',
    'client_metadata' in interne.req.metadata, false);
}

console.log('\n2. avec correlation_id — relais complet, et rien de plus');
{
  const { req } = soumission(AVEC);
  controle('correlation_id au premier niveau', req.correlation_id, 'torah-prepare-abc123');
  controle('correlation_id dans la metadata du lot',
    req.metadata.correlation_id, 'torah-prepare-abc123');
  controle('client_metadata imbriquée, jamais fusionnée',
    req.metadata.client_metadata, { discord_user_id: 'u1', channel_id: 'c1', message_id: 'm1' });
  controle('discord_user_id absent du premier niveau',
    'discord_user_id' in req.metadata, false);
  // Le poller doit rester sur son canal par job : sinon il publierait sur le
  // stream partagé AVANT /save-batch.
  controle('redis_channel volontairement non fixé', 'redis_channel' in req, false);
}

console.log('\n3. réponse de soumission — 202 accepté, 5xx refusé');
{
  const pd = { correlationId: 'torah-prepare-abc123', jobId: 'job-r', totalSegments: 357 };
  const n = (entree) => exec(code(ROUTER, 'Normaliser Réponse'), entree, { 'Parse Input': pd })[0].json;

  const ok = n({ success: true, job_id: 'job-d', batch: true, count: 357,
                 batch_id: 'msgbatch_1', correlation_id: 'torah-prepare-abc123' });
  controle('accepté', ok.accepted, true);
  controle('code HTTP', ok._httpCode, 202);
  controle('correlation_id ré-écho', ok.correlation_id, 'torah-prepare-abc123');
  controle('count', ok.count, 357);
  controle('batch_id conservé', ok.batch_id, 'msgbatch_1');

  const ko = n({ success: false, job_id: 'job-d', batch: true,
                 error: { code: 502, message: 'Soumission impossible — 401', status: 'BATCH_SUBMIT_ERROR' } });
  controle('refusé', ko.accepted, false);
  controle('code HTTP propagé', ko._httpCode, 502);
  controle('message conservé', /401/.test(ko.error.message), true);
  controle('correlation_id présent même en échec', ko.correlation_id, 'torah-prepare-abc123');

  // Dispatch Batch est en onError : un appel raté n'émet pas {statusCode, body}.
  const perdu = n({ error: { message: '502 - {"detail":"bad gateway"}', code: 'ERR_BAD_RESPONSE' } });
  controle('échec réseau → refusé', perdu.accepted, false);
  controle('statut lu dans le message', perdu._httpCode, 502);

  const timeout = n({ error: { message: 'The connection was aborted', code: 'ECONNABORTED' } });
  controle('timeout → 502, jamais un succès', [timeout.accepted, timeout._httpCode], [false, 502]);
}

console.log('\n4. événement — émis seulement si l’appairage a été demandé');
{
  const agg = {
    job_id: 'job-1', total: 357, ok_count: 355, fail_count: 2,
    echecs: [{ index: 12, cause: 'sauvegarde', detail: 'segment_id … not found' }],
  };

  const sans = exec(code(CB, 'Préparer Événement'), agg);
  controle('sans correlation_id : branche arrêtée', sans.length, 0);

  const avec = exec(code(CB, 'Préparer Événement'), Object.assign({}, agg, {
    correlation_id: 'torah-prepare-abc123',
    client_metadata: { discord_user_id: 'u1', channel_id: 'c1', message_id: 'm1' },
  }))[0].json;
  controle('stream', avec.stream, 'llm:results:stream');
  controle('événement distinct de celui du poller', avec.fields.event, 'translation_complete');
  controle('correlation_id', avec.fields.correlation_id, 'torah-prepare-abc123');
  controle('compteurs', [avec.fields.total, avec.fields.ok_count, avec.fields.fail_count],
    ['357', '355', '2']);
  controle('metadata du plugin republiée sous « metadata »',
    JSON.parse(avec.fields.metadata), { discord_user_id: 'u1', channel_id: 'c1', message_id: 'm1' });
  controle('échecs transmis, plafonnés en amont',
    JSON.parse(avec.fields.echecs).length, 1);
  controle('AUCUNE traduction sur le stream',
    ['results', 'content', 'translations'].filter(k => k in avec.fields), []);

  // Lot entièrement en échec : l'événement part quand même, avec le motif.
  const rate = exec(code(CB, 'Préparer Événement'), Object.assign({}, agg, {
    correlation_id: 'torah-prepare-x', ok_count: 0, fail_count: 357,
  }))[0].json;
  controle('tout en échec : success=false', rate.fields.success, 'false');
  controle('code d’erreur', rate.fields.error_code, 'ALL_FAILED');
}

console.log('\n5. garde-fous du nœud de publication');
{
  const pub = noeud(CB, 'Publier Événement');
  controle('URL du service XADD', pub.parameters.url, '={{ $env.REDIS_XADD_SERVICE_URL }}/xadd');
  // Les traductions sont déjà en base : une panne Redis ne doit pas faire échouer
  // le callback, seulement priver de la notification.
  controle('panne Redis sans conséquence sur le callback',
    pub.onError, 'continueRegularOutput');
  controle('branche latérale : aucune suite',
    (CB.connections['Publier Événement'] || { main: [[]] }).main[0].length, 0);
  controle('le chemin principal garde sa première place',
    CB.connections['Aggregate Results'].main[0].map(t => t.node),
    ['Job ID Present?', 'Préparer Événement']);
}

console.log();
if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
console.log('✅ tous les contrôles passent');
