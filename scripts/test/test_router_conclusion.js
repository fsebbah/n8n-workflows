#!/usr/bin/env node
/**
 * Conclusion d'un job dans « Torah Router » : le statut doit refléter le SORT des
 * segments, pas leur position dans la boucle.
 *
 *     node scripts/test/test_router_conclusion.js
 *
 * Le cas de référence
 * -------------------
 * job_msoutt40emb72j, observé en production : deux segments, clé Anthropic
 * invalide, aucune traduction aboutie — et le job ressortait **completed**.
 *
 * `Is Last?` ne regardait que l'index. Les branches succès (`Call Save Worker`)
 * et échec (`Call Error Handler`) convergeaient toutes deux sur `Calc Progress`,
 * qui ne comptait que la progression : le sort de chaque segment n'était consigné
 * nulle part, et l'appelant qui polle voyait « terminé » sur un job vide.
 *
 * Le test exécute le JavaScript extrait du JSON du workflow, et évalue aussi
 * l'expression n8n du nœud `Set Completed` — c'est elle qui écrit le statut.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/Torah_Router.json'), 'utf8'));
const noeud = nom => WF.nodes.find(n => n.name === nom);
const code = nom => noeud(nom).parameters.jsCode;

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(52)} ${JSON.stringify(obtenu)}` +
              (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

function executer(src, entree, refs = {}) {
  const env = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: n => { if (!(n in refs)) throw new Error(`nœud « ${n} » non fourni`); const v = env(refs[n]); return { all: () => v, first: () => v[0] }; },
    console, JSON, Object, Array, String, Number, Math, parseInt, isNaN,
  };
  return env(vm.runInNewContext(`(function(){${src}})()`, ctx));
}

/** Rejoue un tour de boucle : Calc Progress → Consigner Résultat. */
function tour(index, total, amont, seg = {}) {
  const loopItem = Object.assign({
    index, totalSegments: total, jobId: 'job-test',
    segment_id: `seg-${index}`, commentary_id: null,
  }, seg);
  const cp = executer(code('Calc Progress'), amont, { 'Loop Segments': loopItem })[0].json;
  const cr = executer(code('Consigner Résultat'), { statusCode: 200 }, { 'Calc Progress': cp })[0].json;
  return { cp, cr };
}

/** Rejoue la sortie « done » : Conclure Job, puis l'expression de Set Completed. */
function conclure(records) {
  const cj = executer(code('Conclure Job'), records, { 'Parse Input': { jobId: 'job-test' } })[0].json;
  const e = noeud('Set Completed').parameters.jsonBody.replace(/^=\{\{|\}\}$/g, '');
  const corps = JSON.parse(vm.runInNewContext(e, { $json: cj, JSON, Object, Array }));
  return { cj, corps };
}

const SAVE_OK = { success: true, translation_id: 't-1', mode: 'segment' };
const SAVE_KO = { success: false, error: { code: 'SAVE_ERROR', message: 'Failed to save translation' } };
const ERREUR = { success: true, job_id: 'job-test', error_logged: true, redis_key: 'job_errors:job-test' };
// Forme émise par un nœud HTTP en échec sous onError=continueRegularOutput.
const RESEAU = { error: { message: '502 - {"detail":"bad gateway"}', code: 'ERR_BAD_RESPONSE' } };

console.log('\n1. verdict par segment — les quatre formes reçues');
{
  controle('sauvegarde confirmée → ok', tour(0, 4, SAVE_OK).cr.ok, true);
  controle('torah-error a journalisé → traduction', tour(1, 4, ERREUR).cr.cause, 'traduction');
  controle('torah-save a refusé → sauvegarde', tour(2, 4, SAVE_KO).cr.cause, 'sauvegarde');
  controle('détail de l’API conservé', tour(2, 4, SAVE_KO).cr.detail, 'Failed to save translation');
  controle('échec réseau du save → sauvegarde', tour(3, 4, RESEAU).cr.cause, 'sauvegarde');
  controle('réponse absente → jamais un succès', tour(3, 4, {}).cr.ok, false);
  controle('progression toujours calculée', tour(2, 4, SAVE_OK).cp.percentage, 75);
  controle('identifiant du segment consigné', tour(1, 4, SAVE_OK).cr.segment_id, 'seg-1');
  controle('un commentaire est consigné comme tel',
    tour(0, 1, SAVE_OK, { segment_id: null, commentary_id: 'com-9' }).cr.commentary_id, 'com-9');
}

console.log('\n2. le cas observé — 2 segments, aucune traduction aboutie');
{
  const recs = [tour(0, 2, ERREUR).cr, tour(1, 2, ERREUR).cr];
  const { cj, corps } = conclure(recs);
  controle('statut', corps.status, 'failed');
  controle('ok_count', cj.ok_count, 0);
  controle('fail_count', cj.fail_count, 2);
  controle('cause remontée', corps.output.echecs.map(e => e.cause), ['traduction', 'traduction']);
  controle('erreur portée sur le job', /2 segment\(s\) en erreur/.test(corps.error.message), true);
}

console.log('\n3. tout réussit');
{
  const recs = [0, 1, 2].map(i => tour(i, 3, SAVE_OK).cr);
  const { corps } = conclure(recs);
  controle('statut', corps.status, 'completed');
  controle('ok_count', corps.output.ok_count, 3);
  controle('aucune erreur sur le job', corps.error, null);
  controle('progression à 100 %', corps.progress.percentage, 100);
}

console.log('\n4. succès partiel — completed, mais le détail est là');
{
  const recs = [tour(0, 3, SAVE_OK).cr, tour(1, 3, ERREUR).cr, tour(2, 3, SAVE_KO).cr];
  const { corps } = conclure(recs);
  controle('statut reste completed', corps.status, 'completed');
  controle('ok_count', corps.output.ok_count, 1);
  controle('fail_count', corps.output.fail_count, 2);
  controle('les deux causes distinguées',
    corps.output.echecs.map(e => e.cause), ['traduction', 'sauvegarde']);
  controle('index conservés pour retraiter', corps.output.echecs.map(e => e.index), [1, 2]);
}

console.log('\n5. bornes');
{
  // Ordre d'arrivée quelconque : la boucle n'est pas garantie ordonnée.
  const recs = [tour(2, 3, SAVE_OK).cr, tour(0, 3, ERREUR).cr, tour(1, 3, SAVE_OK).cr];
  const { corps } = conclure(recs);
  controle('bilan indépendant de l’ordre', [corps.output.ok_count, corps.output.fail_count], [2, 1]);
  controle('échecs triés par index', corps.output.echecs.map(e => e.index), [0]);

  // Plus de 20 échecs : le job ne doit pas enfler.
  const gros = Array.from({ length: 30 }, (_, i) => tour(i, 30, ERREUR).cr);
  const c2 = conclure(gros).corps;
  controle('fail_count complet', c2.output.fail_count, 30);
  controle('détail plafonné à 20', c2.output.echecs.length, 20);
  controle('statut', c2.status, 'failed');
}

console.log();
if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
console.log('✅ tous les contrôles passent');
