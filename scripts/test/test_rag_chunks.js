#!/usr/bin/env node
/**
 * Bascule de l'ingestion RAG : n8n livre des chunks, MCP embarque et écrit
 * (azy.daily#223).
 *
 *     node scripts/test/test_rag_chunks.js
 *
 * Ce que remplaçait le nœud supprimé
 * ----------------------------------
 * `Embed + Upsert Qdrant` appelait OpenAI en dur (`text-embedding-3-small`),
 * créait la collection, et fabriquait ses identifiants de point en
 * `${source_id}_chunk_${index}` — que Qdrant refuse :
 *
 *     HTTP 400 — value src_abc_chunk_0 is not a valid point ID,
 *                valid values are either an unsigned integer or a UUID
 *
 * Chaque upsert échouait, trois tentatives, puis `throw`. **Aucun point n'a
 * jamais été écrit** : la base ne contenait aucune collection `tenant_*`.
 *
 * Ce que le test verrouille
 * -------------------------
 *  - une configuration incomplète échoue EN LA NOMMANT : un embedder absent ferait
 *    écrire dans le mauvais espace vectoriel, ce qui ne se voit qu'à l'usage —
 *    la recherche ne rend rien, sans qu'aucune erreur n'ait été levée ;
 *  - `prune_from` n'est posé que sur la DERNIÈRE tranche. La purge est en queue :
 *    purger d'abord laisserait une ingestion interrompue amputée, et servie comme
 *    complète au retrieval ;
 *  - une tranche perdue fait échouer l'ingestion entière. Avec
 *    onError=continueRegularOutput, un appel raté n'émet pas {statusCode, body} :
 *    sans lecture du statut réel, elle passerait pour indexée.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/RAG_-_Ingest_(RFC-099).json'), 'utf8'));
const noeud = n => WF.nodes.find(x => x.name === n);
const code = n => noeud(n).parameters.jsCode;

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 56 ? obtenu.slice(0, 56) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(54)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

function exec(src, entree, refs = {}, env = {}) {
  const enrobe = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = enrobe(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: n => {
      if (!(n in refs)) throw new Error(`nœud « ${n} » non fourni`);
      const v = enrobe(refs[n]);
      return { all: () => v, first: () => v[0], item: v[0] };
    },
    $env: env,
    console: { log() {} }, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, Date, Error,
  };
  return enrobe(vm.runInNewContext(`(function(){${src}})()`, ctx));
}

const PAYLOAD = {
  source_id: 'src_1', tenant_id: 't1', guild_id: 'g1', bot_id: 'b1', scope_id: 'sc1',
  active: true, file_type: 'pdf', url: 'https://exemple.test/doc.pdf',
  callback_urls: { progress: 'https://api/cb/pg', complete: 'https://api/cb/ok', error: 'https://api/cb/ko' },
  mcp_api_url: 'https://mcp.test/',
  service_token: 'svc-abc',
  embedding_provider: 'mistral', embedding_model: 'mistral-embed',
  embedding_dims: 1024, embedding_api_key: 'sk-mistral',
  openai_api_key: 'sk-oai',
};
const valider = p =>
  exec(code('Validate Payload'), {}, { 'Verify HMAC': { body: p } })[0].json;

console.log('\n1. contrat d’entrée — ce qui manque est nommé');
{
  const ok = valider(PAYLOAD);
  controle('payload complet accepté', ok.valid, true);
  controle('barre oblique finale retirée de l’URL MCP', ok.mcp_api_url, 'https://mcp.test');
  controle('embedder porté', ok.embedding,
    { provider: 'mistral', model: 'mistral-embed', dims: 1024, api_key: 'sk-mistral' });
  controle('openai_api_key conservé pour l’extraction', ok.openai_api_key, 'sk-oai');
  controle('plus aucune config Qdrant', 'qdrant' in ok, false);

  // Plusieurs serveurs MCP existent : aucun défaut d'environnement n'est possible,
  // sinon un appelant distrait enverrait ses documents dans la mauvaise base.
  const sansUrl = Object.assign({}, PAYLOAD); delete sansUrl.mcp_api_url;
  const r0 = valider(sansUrl);
  controle('URL MCP absente → refus nommé',
    r0.valid === false && (r0.errors || []).some(e => /mcp_api_url requis dans le payload/.test(e)), true);
  controle('aucun repli d’environnement dans le code',
    code('Validate Payload').includes('$env.MCP_API_URL'), false);

  for (const [champ, motif] of [
    ['service_token', /service_token/],
    ['embedding_provider', /embedding_provider/],
    ['embedding_model', /embedding_model/],
    ['embedding_dims', /embedding_dims/],
    ['embedding_api_key', /embedding_api_key/],
  ]) {
    const p = Object.assign({}, PAYLOAD); delete p[champ];
    const r = valider(p);
    controle(`${champ} absent → refus nommé`,
      r.valid === false && (r.errors || []).some(e => motif.test(e)), true);
  }
}

console.log('\n2. découpage en tranches et purge en queue');
{
  const ctx = Object.assign({}, valider(PAYLOAD), {
    chunks: Array.from({ length: 625 }, (_, i) => ({ index: i, text: `chunk ${i}`, char_count: 9 })),
    chunk_count: 625,
    tags: { subject: 'maths', authority_role: 'officiel' },
    start_time: 0,
  });
  const tr = exec(code('Préparer Tranches'), {}, { 'Tag Content': ctx }).map(i => i.json);

  controle('4 tranches de 200/200/200/25', tr.map(t => t._taille), [200, 200, 200, 25]);
  controle('tous les index couverts, sans trou ni doublon',
    tr.flatMap(t => t.charge.chunks.map(c => c.index)).every((v, i) => v === i), true);
  controle('chunk réduit à {index, text}',
    Object.keys(tr[0].charge.chunks[0]).sort(), ['index', 'text']);
  controle('tags au niveau requête, pas par chunk',
    tr[0].charge.tags, { subject: 'maths', authority_role: 'officiel' });
  controle('embedder sur chaque tranche',
    tr.every(t => t.charge.embedding_provider === 'mistral' && t.charge.embedding_dims === 1024), true);

  // La purge est en QUEUE : purger d'abord laisserait une ingestion interrompue
  // amputée et servie comme complète.
  controle('prune_from absent des tranches 1 à 3',
    tr.slice(0, 3).some(t => 'prune_from' in t.charge), false);
  controle('prune_from sur la dernière seulement', tr[3].charge.prune_from, 625);
  controle('URL cible', tr[0].url, 'https://mcp.test/api/rag/chunks');
  controle('jeton porté pour l’en-tête Bearer', tr[0].service_token, 'svc-abc');

  const petit = exec(code('Préparer Tranches'), {}, {
    'Tag Content': Object.assign({}, ctx, {
      chunks: [{ index: 0, text: 'a' }], chunk_count: 1 }),
  }).map(i => i.json);
  controle('document d’un seul chunk : une tranche qui purge',
    [petit.length, petit[0].charge.prune_from], [1, 1]);
}

console.log('\n3. vérification de l’envoi — une tranche perdue vaut échec');
{
  const ctx = Object.assign({}, valider(PAYLOAD), {
    chunks: Array.from({ length: 250 }, (_, i) => ({ index: i, text: 'x' })),
    chunk_count: 250, tags: {}, start_time: 0,
  });
  const lots = exec(code('Préparer Tranches'), {}, { 'Tag Content': ctx });
  const verif = (reponses) => exec(code('Vérifier Envoi'), reponses,
    { 'Préparer Tranches': lots, 'Tag Content': ctx })[0].json;

  const ok = (n) => ({ statusCode: 200, body: { success: true, indexed: n, collection: 'tenant_t1_mistral_1024' } });
  const r = verif([ok(200), ok(50)]);
  controle('total indexé', r.chunks_indexed, 250);
  controle('collection remontée', r.qdrant_collection, 'tenant_t1_mistral_1024');
  controle('nombre de tranches', r.tranches, 2);

  const attrape = (reponses) => { try { verif(reponses); return null; } catch (e) { return e.message; } };

  controle('MCP refuse une tranche → échec global',
    /Indexation incomplète \(200\/250/.test(
      attrape([ok(200), { statusCode: 200, body: { success: false, error: { message: 'embedder inconnu' } } }])), true);

  // Forme émise par onError=continueRegularOutput : pas de statusCode.
  // Le message porte l'erreur d'origine, pas un « HTTP 502 » générique : c'est ce
  // qui permet de savoir POURQUOI la tranche a échoué, pas seulement qu'elle a échoué.
  const perdue = attrape([ok(200), { error: { message: '502 - {"detail":"bad gateway"}', code: 'ERR_BAD_RESPONSE' } }]);
  controle('tranche perdue (onError) → échec global',
    /Indexation incomplète \(200\/250/.test(perdue), true);
  controle('  └ tranche nommée et cause conservée',
    /tranche 2\/2 : 502 - .*bad gateway/.test(perdue), true);

  controle('timeout → échec, jamais un succès',
    attrape([ok(200), { error: { message: 'The connection was aborted', code: 'ECONNABORTED' } }]) !== null, true);
}

console.log('\n4. câblage et garde-fous');
{
  const co = WF.connections;
  controle('nœud d’écriture Qdrant supprimé',
    WF.nodes.some(n => n.name === 'Embed + Upsert Qdrant'), false);
  controle('plus aucun appel d’embedding en dur',
    JSON.stringify(WF).includes('api.openai.com/v1/embeddings'), false);
  controle('succès → callback de complétion',
    co['Vérifier Envoi'].main[0].map(t => t.node), ['Prepare Callback Complete']);
  controle('échec → callback d’erreur',
    co['Vérifier Envoi'].main[1].map(t => t.node), ['Prepare Callback Error']);
  const http = noeud('Envoyer Chunks (MCP)');
  controle('réessai par tranche', [http.retryOnFail, http.maxTries], [true, 3]);
  controle('chaque tranche produit un item', http.onError, 'continueRegularOutput');
  controle('jeton en en-tête Bearer',
    http.parameters.headerParameters.parameters[0].value, '=Bearer {{ $json.service_token }}');
  controle('Prepare Callback Complete lit le nouveau nœud',
    code('Prepare Callback Complete').includes("$('Vérifier Envoi')"), true);
}

console.log();
if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
console.log('✅ tous les contrôles passent');
