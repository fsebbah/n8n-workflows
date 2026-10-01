#!/usr/bin/env node
/**
 * Un événement de fin sur le chemin SYNCHRONE du Router (azy.daily#481).
 *
 *     node scripts/test/test_481_event_sync.js
 *
 * Le chemin synchrone répondait 200 puis travaillait **sans jamais dire qu'il avait fini**.
 * Le client ne pouvait que sonder `torah-job-status`, ce qui ne survit pas à la fenêtre
 * Discord de quinze minutes. L'« interaction expirée » qu'observait plugin-torah venait de
 * là — pas de la durée du traitement : mesuré 5 min 22 s pour 54 items, soit un tiers de
 * marge sous la fenêtre.
 *
 * La forme est VOLONTAIREMENT identique à celle du chemin batch, au champ près. Deux
 * dialectes pour un même fait obligeraient le client à savoir par quel chemin son travail
 * est passé — or il s'en fiche : il apparie par `correlation_id`. Le contrôle « forme
 * identique au chemin batch » est là pour empêcher les deux de diverger plus tard.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0;
let ko = 0;
const verifier = (intitule, obtenu, attendu) => {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) { ok += 1; console.log(`  ✓ ${intitule}`); }
  else { ko += 1; console.log(`  ✗ ${intitule}\n      obtenu  : ${a}\n      attendu : ${b}`); }
};
const charger = (f) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'workflows', f), 'utf8'));
const noeud = (wf, nom) => wf.nodes.find((n) => n.name === nom);

const ROUTER = charger('Torah_Router.json');

console.log('\nazy.daily#481 — événement de fin sur le chemin synchrone\n');

console.log('Câblage : inséré entre Set Completed et Done, sans rien court-circuiter');
{
  const c = ROUTER.connections;
  verifier('Set Completed → Préparer Fin Sync',
    c['Set Completed'].main[0].map((x) => x.node), ['Préparer Fin Sync']);
  verifier('Préparer Fin Sync → Publier Fin Sync',
    c['Préparer Fin Sync'].main[0].map((x) => x.node), ['Publier Fin Sync']);
  verifier('Publier Fin Sync → Done (le terminal est préservé)',
    c['Publier Fin Sync'].main[0].map((x) => x.node), ['Done']);
  const pub = noeud(ROUTER, 'Publier Fin Sync');
  verifier('retryOnFail dès l\'origine', [pub.retryOnFail, pub.maxTries], [true, 3]);
  verifier('onError : un avis perdu ne fait pas échouer un job déjà terminé',
    pub.onError, 'continueRegularOutput');
}

const lancer = (conclure, parse) => {
  const ctx = vm.createContext({
    $input: { first: () => ({ json: conclure }) },
    $: () => ({ first: () => ({ json: parse }) }),
    Date, Number, String, JSON, console,
  });
  const r = vm.runInContext(
    `(function () {\n${noeud(ROUTER, 'Préparer Fin Sync').parameters.jsCode}\n})()`, ctx);
  return (Array.isArray(r) ? r[0].json : r);
};
const PARSE = { correlationId: 'torah-trad-sync1', jobId: 'job_z',
                metadata: { discord_user_id: '42', unit_cost: 1 } };

console.log('\nContenu : tout réussi');
{
  const e = lancer({ jobId: 'job_z', statut: 'completed', total: 12, ok_count: 12,
                     fail_count: 0, echecs: [] }, PARSE);
  verifier('flux et événement', [e.stream, e.fields.event],
    ['llm:results:stream', 'translation_complete']);
  verifier('compteurs justes, en chaînes',
    [e.fields.total, e.fields.ok_count, e.fields.fail_count], ['12', '12', '0']);
  verifier('correlation_id relayé', e.fields.correlation_id, 'torah-trad-sync1');
  verifier('metadata du client encodée en JSON',
    JSON.parse(e.fields.metadata).discord_user_id, '42');
  verifier('tous les champs sont des chaînes',
    Object.values(e.fields).every((v) => typeof v === 'string'), true);
}

console.log('\nContenu : échecs partiels et total');
{
  const partiel = lancer({ jobId: 'j', total: 12, ok_count: 1, fail_count: 11,
                           echecs: Array.from({ length: 30 }, (_, i) => i) }, PARSE);
  verifier('11 échecs sur 12 : success reste "true" — d\'où ok_count/fail_count',
    [partiel.fields.success, partiel.fields.ok_count], ['true', '1']);
  verifier('echecs tronqué à 20, comme le chemin batch',
    JSON.parse(partiel.fields.echecs).length, 20);
  verifier('pas d\'ALL_FAILED sur un échec partiel', partiel.fields.error_code, '');

  const tout = lancer({ jobId: 'j', total: 12, ok_count: 0, fail_count: 12, echecs: [] }, PARSE);
  verifier('tout en échec → ALL_FAILED et success "false"',
    [tout.fields.error_code, tout.fields.success], ['ALL_FAILED', 'false']);
}

console.log('\nAbsences : aucune valeur inventée');
{
  const e = lancer({ jobId: 'j', total: 0, ok_count: 0, fail_count: 0 }, { jobId: 'j' });
  verifier('correlation_id absent → null, jamais une chaîne vide trompeuse',
    e.fields.correlation_id, null);
  verifier('metadata absente → objet vide, le champ ne manque jamais',
    e.fields.metadata, '{}');
  verifier('echecs absent → liste vide', e.fields.echecs, '[]');
}

console.log('\nLes deux chemins parlent le MÊME dialecte');
{
  const cb = charger('Torah_Batch_Callback.json');
  const champsBatch = (noeud(cb, 'Préparer Événement').parameters.jsCode
    .match(/^\s{4}(\w+):/gm) || []).map((s) => s.trim().replace(':', '')).sort();
  const e = lancer({ jobId: 'j', total: 1, ok_count: 1, fail_count: 0, echecs: [] }, PARSE);
  const champsSync = Object.keys(e.fields).sort();
  verifier('jeu de champs identique au chemin batch', champsSync, champsBatch);
}

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
