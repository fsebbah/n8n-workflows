#!/usr/bin/env node
/**
 * Vocalisation en lot : UN appel /api/vocalization/save-batch au lieu de N appels
 * /api/vocalization/save (chatbot.api#369, décision de Franck du 2026-11-24).
 *
 *     node scripts/test/test_vocalisation_grouper_sauvegardes.js
 *
 * Le test rejoue la chaîne ENTIÈRE du callback sur le JavaScript extrait du JSON —
 * `Validate Input` → `Éclater Résultats` → `Grouper Sauvegardes` → `À Sauvegarder ?`
 * → (réponse HTTP simulée) → `Éclater Sauvegardes` → `Agréger`. C'est le code qui
 * sera importé, pas une copie.
 *
 * Pourquoi ce test est long, et pourquoi il le reste
 * -------------------------------------------------
 * Le passage au lot déplace le point fragile. Avant, un appel par item : la réponse
 * HTTP `i` correspondait à l'item `i`, et `Agréger` pouvait apparier par position.
 * Maintenant il y a UNE réponse pour N items, et le recollage se fait par
 * `per_item_results[].index` dans les `rangs` du lot. Un décalage d'un cran ne lève
 * aucune erreur : il attribue le sort d'une vocalisation à une AUTRE. Rien dans la
 * réponse ne permettrait de s'en apercevoir.
 *
 * D'où les deux contrôles qui comptent le plus ici :
 *   · § 6 — un échec dans le DEUXIÈME lot doit retomber sur le bon custom_id ;
 *   · § 7 — un `per_item_results` INCOMPLET ne doit pas déclarer écrite une ligne
 *            dont personne n'a confirmé l'écriture.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(fs.readFileSync(
  path.join(RACINE, 'workflows', 'Torah_Vocalization_Batch_Callback.json'), 'utf8'));

const code = (nom) => {
  const t = WF.nodes.filter((n) => n.name === nom);
  if (t.length !== 1) throw new Error(`${t.length} nœud(s) « ${nom} »`);
  return t[0].parameters.jsCode;
};

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(56)} ${vu.length > 90 ? vu.slice(0, 90) + '…' : vu}`
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
    $env: { TORAH_API_URL: 'http://api', N8N_WEBHOOK_URL: 'http://x' },
    console, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, Date,
  };
  return env(vm.runInNewContext(`(function(){${src}})()`, ctx));
}

/** `À Sauvegarder ?` : condition `$json.aucun_envoi !== true`. */
const aSauvegarder = (j) => j.aucun_envoi !== true;

/**
 * Rejoue tout le callback. `repondre(lot, i)` simule la réponse HTTP du lot i :
 * rendre un objet `{statusCode, body}`, ou `{error:{message:'500 - …'}}` pour un échec
 * sans statusCode — la forme réelle sous `continueRegularOutput`.
 */
function chaine(corpsWebhook, repondre) {
  const val = executer(code('Validate Input'), { body: corpsWebhook })[0].json;
  if (!val.valid) return { val, refuse: true };

  const eclates = executer(code('Éclater Résultats'), val).map((x) => x.json);
  const groupes = executer(code('Grouper Sauvegardes'), eclates,
    { 'Éclater Résultats': eclates }).map((x) => x.json);

  const versHttp = groupes.filter(aSauvegarder);
  const versEclater = groupes.filter((j) => !aSauvegarder(j));

  const reponses = versHttp.map((lot, i) => repondre(lot, i));
  const entreeEclater = reponses.length ? reponses : versEclater;

  const recolles = executer(code('Éclater Sauvegardes'), entreeEclater,
    { 'Éclater Résultats': eclates, 'Grouper Sauvegardes': versHttp }).map((x) => x.json);

  const agrege = executer(code('Agréger'), recolles,
    { 'Éclater Résultats': eclates })[0].json;

  return { val, eclates, groupes, recolles, agrege };
}

/** Un corps de rappel de lot : n résultats, tous bons sauf ceux listés. */
function rappel(n, options = {}) {
  const { vides = [], tronques = [], rates = [], sansCible = [], texte = 'בְּרֵאשִׁית' } = options;
  const carte = {};
  const results = [];
  for (let i = 0; i < n; i++) {
    const cid = 'c-' + i;
    if (sansCible.indexOf(i) === -1) carte[cid] = { commentary_id: cid, original: 'בראשית' };
    results.push({
      custom_id: cid,
      ok: rates.indexOf(i) === -1,
      error: rates.indexOf(i) !== -1 ? { message: 'refus du modele' } : null,
      text: vides.indexOf(i) !== -1 ? '' : texte,
      stop_reason: tronques.indexOf(i) !== -1 ? 'max_tokens' : 'end_turn',
    });
  }
  return { results, metadata: { job_id: 'job-1', project_id: 'torah',
    model: 'claude-sonnet-4-6', traite: 'Pesachim', page: '22a', carte_items: carte } };
}

/** Réponse 200 avec un per_item_results complet, sauf les index listés en échec. */
const repondreOk = (rates = []) => (lot) => ({
  statusCode: 200,
  body: { total: lot.items.length, saved: lot.items.length - rates.length,
    per_item_results: lot.items.map((_, i) => rates.indexOf(i) !== -1
      ? { index: i, success: false, error: { detail: 'contrainte base' } }
      : { index: i, success: true }) },
});

console.log('\nVocalisation en lot — /api/vocalization/save-batch\n');

console.log('1 · Cas nominal : 3 vocalisations, UN seul appel');
{
  const r = chaine(rappel(3), repondreOk());
  controle('un seul lot construit', r.groupes.length, 1);
  controle('3 items dans le lot', r.groupes[0].items.length, 3);
  controle('rangs du lot', r.groupes[0].rangs, [0, 1, 2]);
  controle('forme de l\'item envoyé', Object.keys(r.groupes[0].items[0]).sort(),
    ['commentary_id', 'segment_id', 'source_text_id', 'vocalized_by', 'vocalized_text']);
  controle('vocalized_by inchangé (forme du synchrone)',
    r.groupes[0].items[0].vocalized_by, 'llm:claude-sonnet-4-6');
  controle('résumé', r.agrege.resume, { total: 3, enregistres: 3, echecs: 0 });
  controle('success', r.agrege.success, true);
  controle('job_id conservé pour clore le job', r.agrege.job_id, 'job-1');
}

console.log('\n2 · Découpage par NOMBRE : 1 001 items → 500 + 500 + 1');
{
  const r = chaine(rappel(1001), repondreOk());
  controle('nombre de lots', r.groupes.length, 3);
  controle('tailles', r.groupes.map((g) => g.items.length), [500, 500, 1]);
  controle('rangs contigus et sans trou',
    r.groupes.reduce((a, g) => a.concat(g.rangs), []).length, 1001);
  controle('tout enregistré', r.agrege.resume, { total: 1001, enregistres: 1001, echecs: 0 });
}

console.log('\n3 · Découpage par TAILLE : des textes longs coupent la tranche plus tôt');
{
  // 8 673 o était le pire item mesuré en production ; on prend plus gros encore
  // pour franchir le plafond avec peu d'items.
  const long = 'אָ'.repeat(60000);
  const r = chaine(rappel(60, { texte: long }), repondreOk());
  controle('plus d\'un lot malgré 60 items < 500', r.groupes.length > 1, true);
  controle('aucune tranche au-delà du plafond',
    r.groupes.every((g) => JSON.stringify(g.items).length < 1200000), true);
  controle('aucun item perdu au découpage',
    r.groupes.reduce((a, g) => a + g.items.length, 0), 60);
  controle('tout enregistré', r.agrege.resume.enregistres, 60);
}

console.log('\n4 · Un item JAMAIS soumis garde sa cause, et n\'est pas un SAVE_FAILED');
{
  const r = chaine(rappel(4, { vides: [1], tronques: [2] }), repondreOk());
  controle('seuls les 2 bons partent', r.groupes[0].items.length, 2);
  controle('aucun corps null envoyé',
    r.groupes[0].items.filter((i) => i === null).length, 0);
  controle('résumé', r.agrege.resume, { total: 4, enregistres: 2, echecs: 2 });
  controle('les causes d\'origine sont conservées',
    r.agrege.echecs.map((e) => e.error.code).sort(),
    ['EMPTY_LLM_RESPONSE', 'GENERATION_TRONQUEE']);
}

console.log('\n5 · Échec par item dans per_item_results → SAVE_FAILED, les autres comptent');
{
  const r = chaine(rappel(3), repondreOk([1]));
  controle('résumé', r.agrege.resume, { total: 3, enregistres: 2, echecs: 1 });
  controle('code', r.agrege.echecs[0].error.code, 'SAVE_FAILED');
  controle('le bon item est désigné', r.agrege.echecs[0].custom_id, 'c-1');
  controle('la cause de l\'API est reportée',
    r.agrege.echecs[0].error.message.indexOf('contrainte base') !== -1, true);
}

console.log('\n6 · ⚠️ RECOLLAGE SUR PLUSIEURS LOTS : l\'échec retombe sur le bon item');
{
  // 501 items ⇒ lot 0 = rangs 0..499, lot 1 = rang 500. Un échec à l'index 0 du
  // lot 1 doit désigner c-500, et SURTOUT PAS c-0.
  const r = chaine(rappel(501), (lot, i) => repondreOk(i === 1 ? [0] : [])(lot));
  controle('deux lots', r.groupes.length, 2);
  controle('rangs du lot 1', r.groupes[1].rangs, [500]);
  controle('un seul échec', r.agrege.resume, { total: 501, enregistres: 500, echecs: 1 });
  controle('c\'est bien c-500, pas c-0', r.agrege.echecs[0].custom_id, 'c-500');
}

console.log('\n7 · ⚠️ per_item_results INCOMPLET : jamais un succès par défaut');
{
  // L'API ne rend le verdict que du premier item : les deux autres sont sans réponse.
  const r = chaine(rappel(3), (lot) => ({
    statusCode: 200,
    body: { total: 3, saved: 1, per_item_results: [{ index: 0, success: true }] },
  }));
  controle('résumé', r.agrege.resume, { total: 3, enregistres: 1, echecs: 2 });
  controle('les deux sans verdict sont des échecs',
    r.agrege.echecs.map((e) => e.custom_id).sort(), ['c-1', 'c-2']);
  // ⚠️ La cause doit distinguer « soumise sans verdict » de « jamais soumise ». La
  // première accuse torah.api (son contrat promet un per_item_results complet), la
  // seconde accuserait notre câblage. Le même libellé pour les deux envoyait le
  // diagnostic sur le mauvais maillon.
  controle('la cause accuse la réponse incomplète, pas notre câblage',
    r.agrege.echecs[0].error.message.indexOf('absente de per_item_results') !== -1, true);
  controle('et ne dit PAS « jamais soumise »',
    r.agrege.echecs[0].error.message.indexOf('jamais soumise'), -1);
}

console.log('\n8 · 200 SANS per_item_results : le lot entier compte pour un échec');
{
  const r = chaine(rappel(3), () => ({ statusCode: 200, body: { total: 3, saved: 3 } }));
  controle('rien n\'est déclaré enregistré', r.agrege.resume,
    { total: 3, enregistres: 0, echecs: 3 });
  controle('success', r.agrege.success, false);
  controle('la cause nomme le défaut',
    r.agrege.echecs[0].error.message.indexOf('per_item_results') !== -1, true);
}

console.log('\n9 · Échec HTTP SANS statusCode (continueRegularOutput) : lu dans le message');
{
  // Deux lots : le premier échoue en 500, le second réussit. Le second doit compter.
  const r = chaine(rappel(501), (lot, i) => i === 0
    ? { error: { message: '500 - {"detail":"base indisponible"}' } }
    : repondreOk()(lot));
  controle('500 items perdus, 1 sauvé', r.agrege.resume,
    { total: 501, enregistres: 1, echecs: 500 });
  controle('la cause nomme le code HTTP',
    r.agrege.echecs[0].error.message.indexOf('HTTP 500') !== -1, true);
  controle('l\'item du lot sain n\'est pas en échec',
    r.agrege.echecs.filter((e) => e.custom_id === 'c-500').length, 0);
}

console.log('\n10 · Sentinelle : rien d\'enregistrable, mais le job est quand même clos');
{
  const r = chaine(rappel(3, { vides: [0, 1, 2] }), () => {
    throw new Error('aucun appel HTTP ne doit partir');
  });
  controle('sentinelle émise', r.groupes.length === 1 && r.groupes[0].aucun_envoi === true, true);
  controle('aucun item à envoyer', r.groupes[0].items === undefined, true);
  controle('résumé', r.agrege.resume, { total: 3, enregistres: 0, echecs: 3 });
  controle('job_id présent pour conclure', r.agrege.job_id, 'job-1');
  controle('success', r.agrege.success, false);
}

console.log('\n11 · Une cible introuvable est remontée, jamais écrite');
{
  const r = chaine(rappel(3, { sansCible: [2] }), repondreOk());
  controle('seuls 2 items partent', r.groupes[0].items.length, 2);
  controle('résumé', r.agrege.resume, { total: 3, enregistres: 2, echecs: 1 });
  controle('code', r.agrege.echecs[0].error.code, 'CIBLE_INTROUVABLE');
}

console.log('\n12 · Non-régression du contrat de sortie (ce que lit Update Job)');
{
  const r = chaine(rappel(2), repondreOk());
  controle('jeu de champs inchangé', Object.keys(r.agrege).sort(),
    ['client_metadata', 'correlation_id', 'echecs', 'job_id', 'page', 'project_id',
     'resume', 'success', 'traite']);
  controle('echecs tronqué à 20',
    chaine(rappel(30, { vides: Array.from({ length: 30 }, (_, i) => i) }),
      () => { throw new Error('pas d\'appel'); }).agrege.echecs.length, 20);
}

console.log(`\n${echecs.length === 0 ? '✅ tout passe' : `❌ ${echecs.length} échec(s) :\n   - ` + echecs.join('\n   - ')}\n`);
process.exit(echecs.length === 0 ? 0 : 1);
