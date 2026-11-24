#!/usr/bin/env node
/**
 * `vocalization_complete` : les DEUX émetteurs parlent le MÊME dialecte.
 *
 *     node scripts/test/test_evenement_vocalisation_dialecte.js
 *
 * Deux workflows publient cet événement, sur le même stream, sous le même nom :
 *   · `Torah_Vocalization_Worker`         → `Préparer Fin Vocalisation`  (synchrone)
 *   · `Torah_Vocalization_Batch_Callback` → `Préparer Événement`         (lot)
 *
 * Le défaut que ce test verrouille
 * --------------------------------
 * Les deux jeux de champs avaient DIVERGÉ sans que rien ne le signale. Le synchrone
 * publiait `ok_count` / `fail_count` / `error_code` / `error_message` ; le lot
 * publiait `enregistres` / `echecs`, et AUCUN `error_code`.
 *
 * ⚠️ Un consommateur ne peut pas distinguer les deux à l'avance : il route sur
 * `event`, qui est identique dans les deux cas. Un écouteur écrit sur les noms du
 * chemin synchrone — ce que le commentaire du worker lui recommande explicitement —
 * lisait donc `undefined` sur TOUT événement de lot. Aucune erreur, aucune trace :
 * juste « 0 vocalisé » affiché à l'utilisateur, ou une exception chez lui.
 *
 * Personne ne l'a vu parce que chaque émetteur était testé contre SON contrat, jamais
 * contre son homologue. Même défaut, même remède que `test_481_event_sync.js` sur les
 * chemins de TRADUCTION.
 *
 * Ce test ne compare pas des valeurs : il compare des JEUX DE CLÉS. C'est la seule
 * chose qu'un consommateur voit avant de lire quoi que ce soit.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const lire = (f) => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const WORKER = lire('Torah_Vocalization_Worker.json');
const CALLBACK = lire('Torah_Vocalization_Batch_Callback.json');

const code = (wf, nom) => {
  const t = wf.nodes.filter((n) => n.name === nom);
  if (t.length !== 1) throw new Error(`${t.length} nœud(s) « ${nom} »`);
  return t[0].parameters.jsCode;
};

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(54)} ${vu.length > 95 ? vu.slice(0, 95) + '…' : vu}`
    + (ok ? '' : `\n       attendu : ${JSON.stringify(attendu)}`));
  if (!ok) echecs.push(libelle);
}

function executer(src, entree, refs = {}) {
  const env = (v) => (Array.isArray(v) ? v : [v]).map((x) => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: (n) => {
      if (!(n in refs)) throw new Error(`nœud « ${n} » non fourni`);
      const v = env(refs[n]);
      return { all: () => v, first: () => v[0] };
    },
    $env: { TORAH_API_URL: 'http://api' },
    console, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, Date,
  };
  return env(vm.runInNewContext(`(function(){${src}})()`, ctx));
}

/** Événement du chemin SYNCHRONE. */
function evSynchrone({ total = 3, erreurs = 0 } = {}) {
  return executer(code(WORKER, 'Préparer Fin Vocalisation'),
    { success: erreurs === 0 },
    { 'Merge Batch Results': { summary: { total: total, errors: erreurs } },
      'Validate Input': { job_id: 'job-1' } })[0].json;
}

/** Idem, mais avec un correlation_id fourni par l'appelant. */
function evSynchroneAvecCorrelation() {
  return executer(code(WORKER, 'Préparer Fin Vocalisation'),
    { success: true },
    { 'Merge Batch Results': { summary: { total: 2, errors: 0 } },
      'Validate Input': { correlation_id: 'corr-7', job_id: 'job-1' } })[0].json;
}

/** Événement du chemin LOT. */
function evLot({ total = 3, echecsN = 0, correlation = null } = {}) {
  return executer(code(CALLBACK, 'Préparer Événement'), {
    job_id: 'job-1', success: total - echecsN > 0, traite: 'Pesachim', page: '22a',
    correlation_id: correlation,
    resume: { total: total, enregistres: total - echecsN, echecs: echecsN },
  })[0].json;
}

console.log('\nvocalization_complete — un seul dialecte pour deux émetteurs\n');

console.log('1 · Les deux publient sur le même canal, sous le même nom');
{
  const s = evSynchrone(), l = evLot();
  controle('même stream', [s.stream, l.stream],
    ['llm:results:stream', 'llm:results:stream']);
  controle('même nom d\'événement', [s.fields.event, l.fields.event],
    ['vocalization_complete', 'vocalization_complete']);
}

console.log('\n2 · ⚠️ LE JEU COMMUN : tout champ du synchrone existe aussi sur le lot');
{
  // C'est LE contrôle du fichier. Un consommateur route sur `event`, identique dans
  // les deux cas : il ne peut donc lire que des champs présents des deux côtés.
  const s = Object.keys(evSynchrone().fields).sort();
  const l = Object.keys(evLot().fields);
  const manquants = s.filter((k) => l.indexOf(k) === -1);
  controle('aucun champ du synchrone absent du lot', manquants, []);
  // Et réciproquement : tout ce que le lot porte EN PLUS est voulu, pas accidentel.
  //   · `enregistres` / `echecs` : ses noms historiques, CONSERVÉS pour qu'aucun
  //     lecteur existant ne casse — ils doublent `ok_count` / `fail_count` ;
  //   · `mode` / `traite` / `page` : du contexte que le synchrone n'a pas (voir § 6).
  // Si cette liste change, c'est qu'un champ est apparu sans décision.
  const enPlus = l.filter((k) => s.indexOf(k) === -1).sort();
  controle('ce que le lot porte en plus est voulu', enPlus,
    ['echecs', 'enregistres', 'mode', 'page', 'traite']);
  // ⚠️ `correlation_id` est ABSENT DES DEUX quand l'appelant n'en fournit pas, et c'est
  // le bon comportement — voir § 7. Il l'était côté lot ; côté synchrone il partait
  // TOUJOURS, avec la valeur `undefined`, qu'un XADD écrit « undefined » : une valeur
  // non vide qui ressemble à un identifiant et ne s'apparie à rien.
  controle('correlation_id absent des deux quand il manque',
    [('correlation_id' in evSynchrone().fields), ('correlation_id' in evLot().fields)],
    [false, false]);
}

console.log('\n3 · Les compteurs portent les DEUX noms, et les mêmes valeurs');
{
  const l = evLot({ total: 10, echecsN: 3 });
  controle('ok_count présent', l.fields.ok_count, '7');
  controle('fail_count présent', l.fields.fail_count, '3');
  controle('enregistres conservé (aucun lecteur cassé)', l.fields.enregistres, '7');
  controle('echecs conservé', l.fields.echecs, '3');
  controle('ok_count === enregistres', l.fields.ok_count === l.fields.enregistres, true);
  controle('fail_count === echecs', l.fields.fail_count === l.fields.echecs, true);
}

console.log('\n4 · ⚠️ error_code : une CHAÎNE VIDE, jamais une clé absente');
{
  // Un flux Redis n'a ni null ni clé absente utilisable : une clé qui manque se lit
  // comme « personne n'a regardé », là où le vide dit « rien à signaler ».
  const ok = evLot({ total: 5, echecsN: 0 }).fields;
  controle('succès total → clé présente', 'error_code' in ok, true);
  controle('succès total → valeur vide', ok.error_code, '');
  controle('succès total → message vide', ok.error_message, '');

  const partiel = evLot({ total: 5, echecsN: 2 }).fields;
  controle('échec partiel → PAS d\'ALL_FAILED', partiel.error_code, '');
  controle('échec partiel → le message compte', partiel.error_message, '2 item(s) en erreur');

  const tout = evLot({ total: 5, echecsN: 5 }).fields;
  controle('tout en échec → ALL_FAILED', tout.error_code, 'ALL_FAILED');
  controle('et success est faux (chaîne, pas booléen)', tout.success, 'false');
}

console.log('\n5 · La même règle vaut sur le chemin synchrone (non-régression)');
{
  const ok = evSynchrone({ total: 4, erreurs: 0 }).fields;
  controle('succès → error_code vide, présent', [('error_code' in ok), ok.error_code], [true, '']);
  const tout = evSynchrone({ total: 4, erreurs: 4 }).fields;
  controle('tout en échec → ALL_FAILED', tout.error_code, 'ALL_FAILED');
}

console.log('\n6 · Ce qui reste PROPRE à chaque chemin, et ne doit pas servir d\'erreur');
{
  const l = evLot().fields, s = evSynchrone().fields;
  controle('`mode` n\'existe que sur le lot', [l.mode, s.mode === undefined], ['batch', true]);
  controle('`traite`/`page` n\'existent que sur le lot',
    [l.traite, s.traite === undefined], ['Pesachim', true]);
  // ⚠️ Donc l'ABSENCE de `mode` veut dire « synchrone », pas « défaut ».
  controle('le lot s\'annonce explicitement', l.mode, 'batch');
}

console.log('\n7 · ⚠️ Aucun repli qui publierait du VIDE trompeur');
{
  // Un `|| ''` sur le job_id publierait une chaîne vide, qui ressemble à un événement
  // valide et ne s'apparie à rien. L'appariement se fait par job_id, pas correlation_id.
  controle('job_id du lot n\'est jamais la chaîne vide', evLot().fields.job_id !== '', true);
  controle('correlation_id du lot n\'est ajouté que s\'il existe',
    'correlation_id' in evLot().fields, false);
  controle('et il est présent quand il existe',
    evLot({ correlation: 'corr-9' }).fields.correlation_id, 'corr-9');
  // ⚠️ La même règle côté SYNCHRONE, qui est le chemin réellement en service.
  controle('⚠️ le synchrone ne publie plus `undefined`',
    'correlation_id' in evSynchrone().fields, false);
  controle('et il le publie quand il existe',
    evSynchroneAvecCorrelation().fields.correlation_id, 'corr-7');
}

console.log(`\n${echecs.length === 0 ? '✅ tout passe' : `❌ ${echecs.length} échec(s) :\n   - ` + echecs.join('\n   - ')}\n`);
process.exit(echecs.length === 0 ? 0 : 1);
