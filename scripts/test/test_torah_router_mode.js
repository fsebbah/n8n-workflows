#!/usr/bin/env node
/**
 * torah-router — le client lit le MODE dans la réponse, jamais le seuil (azy.daily#225).
 *
 *     node scripts/test/test_torah_router_mode.js
 *
 * `Parse Input` bascule sur la seule taille du lot : `useBatch = segments.length > 50`.
 * Le client n'a aucun moyen de demander l'un ou l'autre, et rien dans la réponse ne lui
 * disait lequel il venait d'obtenir :
 *
 *   ≤ 50 segments → 200, puis suivi par `torah-job-status`
 *   > 50 segments → 202, puis événement `translation_complete` sur `llm:results:stream`
 *
 * plugin-torah a reçu un 202 sur 62 commentaires (Pesachim 17b), l'a pris pour une erreur,
 * et s'apprêtait à migrer TOUT le bouton vers l'event-driven — ce qui aurait fait attendre
 * indéfiniment les pages de 50 commentaires ou moins, puisque AUCUN événement n'est publié
 * pour ce chemin (mesuré : seuls `Torah Batch Callback` et `Claude - Batch Poller` écrivent
 * sur le flux).
 *
 * `mode` rend la frontière lisible. Un client qui rededuirait le seuil de 50 chez lui le
 * verrait dériver sans prévenir ; en lisant `mode`, il suit la décision réelle.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHIER = path.join(__dirname, '..', '..', 'workflows', 'Torah_Router.json');
const wf = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
const noeud = (nom) => wf.nodes.find((n) => n.name === nom);

let ok = 0;
let ko = 0;
const verifier = (intitule, obtenu, attendu) => {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) { ok += 1; console.log(`  ✓ ${intitule}`); }
  else { ko += 1; console.log(`  ✗ ${intitule}\n      obtenu  : ${a}\n      attendu : ${b}`); }
};

const evaluer = (expr, ctx) =>
  vm.runInNewContext(expr.replace(/^=\{\{/, '').replace(/\}\}$/, ''), { ...ctx, JSON, Number, String });

console.log('\ntorah-router — le mode est annoncé dans la réponse\n');

console.log('Seuil : la bascule reste pilotée par la taille, pas par le client');
{
  const code = noeud('Parse Input').parameters.jsCode;
  verifier('useBatch dépend de segments.length > 50',
    /useBatch:\s*\(Array\.isArray\(segments\)\s*&&\s*segments\.length\s*>\s*50\)/.test(code), true);
  verifier('aucun drapeau batch lu dans le corps de la requête',
    /body\.(use_)?batch\b/.test(code), false);
}

console.log('\nChemin synchrone (≤ 50) : 200 et mode "sync"');
{
  const n = noeud('Respond Accepted');
  const corps = JSON.parse(evaluer(n.parameters.responseBody,
    { $json: { jobId: 'j-1', pipelineType: 'segments', totalSegments: 12 } }));
  verifier('code HTTP 200', n.parameters.options.responseCode, 200);
  verifier('mode = sync', corps.mode, 'sync');
  verifier('les champs existants sont intacts',
    [corps.received, corps.job_id, corps.pipeline, corps.segments_count],
    [true, 'j-1', 'segments', 12]);
}

console.log('\nChemin batch (> 50) : mode "batch" sur le succès ET sur l\'échec');
{
  const jsCode = noeud('Normaliser Réponse').parameters.jsCode;
  const lancer = (brut, parse) => {
    const ctx = vm.createContext({
      $input: { first: () => ({ json: brut }) },
      $: (nom) => ({ first: () => ({ json: parse }) }),
      Number, String, console,
    });
    return vm.runInContext(`(function () {\n${jsCode}\n})()`, ctx)[0].json;
  };
  const parse = { correlationId: 'c-1', jobId: 'j-1', totalSegments: 62 };

  const succes = lancer({ statusCode: 202, body: { job_id: 'j-1', correlation_id: 'c-1', count: 62 } }, parse);
  verifier('succès : accepted true, mode batch', [succes.accepted, succes.mode], [true, 'batch']);
  verifier('succès : _httpCode 202', succes._httpCode, 202);
  verifier('succès : correlation_id relayé', succes.correlation_id, 'c-1');

  const echec = lancer({ statusCode: 429, body: { error: { code: 429, message: 'quota' } } }, parse);
  verifier('échec : accepted false, mode batch', [echec.accepted, echec.mode], [false, 'batch']);
  verifier('échec : le code HTTP réel ressort, jamais 202', echec._httpCode, 429);
  verifier('échec : status typé', echec.error.status, 'BATCH_SUBMIT_ERROR');
}

console.log('\n`Respond Batch` laisse passer mode et retire _httpCode');
{
  const n = noeud('Respond Batch');
  const corps = JSON.parse(evaluer(n.parameters.responseBody,
    { $json: { accepted: true, mode: 'batch', job_id: 'j', _httpCode: 202 } }));
  verifier('mode atteint le client', corps.mode, 'batch');
  verifier('_httpCode n\'est pas exposé', '_httpCode' in corps, false);
}

console.log('\nLe commentaire ne généralise plus la dépréciation');
{
  const code = noeud('Normaliser Réponse').parameters.jsCode;
  verifier('la réserve « ce chemin seulement » est écrite', /CE CHEMIN SEULEMENT/.test(code), true);
  verifier('torah-job-status est dit NON déprécié', /PAS déprécié/.test(code), true);
  verifier('le seuil de 50 est documenté', /segments\.length > 50/.test(code), true);
}

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
