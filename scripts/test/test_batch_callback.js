#!/usr/bin/env node
/**
 * Non-régression de la chaîne de sauvegarde de « Torah Batch Callback », après
 * le passage de N appels /api/translations/save à des appels groupés
 * /api/translations/save-batch (azy.daily#201).
 *
 *     node scripts/test/test_batch_callback.js
 *     node scripts/test/test_batch_callback.js --en-ligne   # + sonde du contrat réel
 *
 * Le test EXÉCUTE le JavaScript extrait du JSON du workflow, dans un émulateur
 * minimal du contexte n8n ($input, $('Nom'), $env). Il porte donc sur ce qui sera
 * importé, pas sur une copie susceptible de diverger. Écrit en JS et non en
 * Python — comme les Code nodes eux-mêmes — pour que le code testé soit le code
 * versionné, sans transposition.
 *
 * Ce qu'il protège
 * ----------------
 *  - le compte final distingue un échec de TRADUCTION d'un échec de SAUVEGARDE ;
 *    les confondre effacerait la cause et rendrait le retraitement impossible ;
 *  - /save-batch répond HTTP 200 même quand des items échouent : le verdict est
 *    dans per_item_results[i], jamais dans le code HTTP ;
 *  - un lot entièrement perdu (timeout, 500) ne doit pas passer pour sauvegardé —
 *    c'est le mode de défaillance de onError=continueRegularOutput (#442) ;
 *  - un lot dont AUCUNE traduction n'a abouti doit quand même conclure le job :
 *    sans l'item sentinelle, l'aval ne s'exécuterait pas du tout ;
 *  - le recollage par rang survit au découpage en plusieurs lots.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(
  fs.readFileSync(path.join(RACINE, 'workflows/Torah_Batch_Callback.json'), 'utf8')
);
const NOEUD = Object.fromEntries(WF.nodes.map(n => [n.name, n]));

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(50)} ${JSON.stringify(obtenu)}` +
              (ok ? '' : `  (attendu : ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

/** Exécute un Code node avec les sorties déjà produites en amont. */
function executer(nom, entree, sorties) {
  const code = NOEUD[nom].parameters.jsCode;
  const enveloppe = v => (Array.isArray(v) ? v : [v]).map(
    x => (x && x.json !== undefined ? x : { json: x })
  );
  const items = enveloppe(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: n => {
      if (!(n in sorties)) throw new Error(`nœud « ${n} » non produit`);
      const v = enveloppe(sorties[n]);
      return { all: () => v, first: () => v[0] };
    },
    $env: { TORAH_API_URL: 'http://host2.local:3031' },
    console,
    JSON, Object, Array, String, Number, Math, parseInt, isNaN,
  };
  const res = vm.runInNewContext(`(function(){${code}})()`, ctx);
  return enveloppe(res);
}

/** Rejoue la chaîne Validate → … → Aggregate avec une réponse /save-batch scriptée. */
function chaine(callback, repondre) {
  const s = {};
  s['Validate Input'] = executer('Validate Input', { body: callback }, s);
  s['Split Results'] = executer('Split Results', s['Validate Input'], s);
  s['Grouper Sauvegardes'] = executer('Grouper Sauvegardes', s['Split Results'], s);

  // Nœud « À Sauvegarder ? » : aiguillage booléen, reproduit ici.
  const lots = s['Grouper Sauvegardes'].filter(i => i.json.aucun_envoi === false);
  const sentinelles = s['Grouper Sauvegardes'].filter(i => i.json.aucun_envoi === true);

  // Nœud « Save Batch » : une sortie par lot, dans le même ordre.
  const reponses = lots.map((lot, i) => ({ json: repondre(lot.json, i) }));

  s['Éclater Sauvegardes'] = executer(
    'Éclater Sauvegardes', lots.length ? reponses : sentinelles, s
  );
  s['Aggregate Results'] = executer('Aggregate Results', s['Éclater Sauvegardes'], s);
  return s;
}

/** Fabrique un callback réaliste : n versets + m commentaires. */
function fabriquer(nbVersets, nbCommentaires, echouees = []) {
  const results = [];
  const map = {};
  const ajoute = (id, cle) => {
    map[id] = { [cle]: id };
    results.push(
      echouees.includes(id)
        ? { custom_id: id, ok: false, error: 'overloaded_error' }
        : { custom_id: id, ok: true, text: `traduction de ${id}` }
    );
  };
  for (let i = 0; i < nbVersets; i++) ajoute(`seg-${i}`, 'segment_id');
  for (let i = 0; i < nbCommentaires; i++) ajoute(`com-${i}`, 'commentary_id');
  return {
    batch_id: 'msgbatch_test',
    results,
    metadata: {
      multi: true, job_id: 'job-test', project_id: 'torah',
      target_lang: 'français', target_language: 'fr',
      provider: 'anthropic', model: 'claude-sonnet-4-6',
      callback_channel_id: null, commentary_map: map,
    },
  };
}

const toutOk = lot => ({
  statusCode: 200,
  body: {
    success: true, total: lot.items.length, saved: lot.items.length, failed: 0,
    per_item_results: lot.items.map((_, i) => ({ index: i, success: true, result: {}, error: null })),
  },
});

// ---------------------------------------------------------------- scénarios

console.log('\n1. lot mixte 100 versets + 150 commentaires, tout réussit');
{
  const s = chaine(fabriquer(100, 150), toutOk);
  const g = s['Grouper Sauvegardes'].map(i => i.json);
  const a = s['Aggregate Results'][0].json;
  controle('un seul lot (250 ≤ 500)', g.length, 1);
  controle('250 items dans le lot', g[0].items.length, 250);
  controle('un verset porte segment_id seul',
    Object.keys(g[0].items[0]).sort(),
    ['model', 'provider', 'segment_id', 'target_language', 'translated_text']);
  controle('un commentaire porte commentary_id seul',
    Object.keys(g[0].items[249]).sort(),
    ['commentary_id', 'model', 'provider', 'target_language', 'translated_text']);
  controle('total', a.total, 250);
  controle('ok_count', a.ok_count, 250);
  controle('fail_count', a.fail_count, 0);
}

console.log('\n2. 1 200 items : découpage en lots et recollage par rang');
{
  const s = chaine(fabriquer(600, 600), toutOk);
  const g = s['Grouper Sauvegardes'].map(i => i.json);
  const a = s['Aggregate Results'][0].json;
  controle('3 lots de 500/500/200', g.map(l => l.items.length), [500, 500, 200]);
  controle('rangs couverts sans trou',
    g.flatMap(l => l.rangs).sort((x, y) => x - y).every((r, i) => r === i), true);
  controle('ok_count', a.ok_count, 1200);
  controle('fail_count', a.fail_count, 0);
}

console.log('\n3. 10 traductions en échec — la cause ne doit pas devenir « sauvegarde »');
{
  const rates = Array.from({ length: 10 }, (_, i) => `com-${i}`);
  const s = chaine(fabriquer(100, 150, rates), toutOk);
  const a = s['Aggregate Results'][0].json;
  controle('240 envoyés à l’écriture', s['Grouper Sauvegardes'][0].json.items.length, 240);
  controle('ok_count', a.ok_count, 240);
  controle('fail_count', a.fail_count, 10);
  controle('cause identifiée « traduction »',
    a.echecs.every(e => e.cause === 'traduction'), true);
}

console.log('\n4. per_item_results signale 3 échecs — HTTP 200 ne suffit pas');
{
  const s = chaine(fabriquer(100, 150), lot => ({
    statusCode: 200,
    body: {
      success: true, total: lot.items.length, saved: lot.items.length - 3, failed: 3,
      per_item_results: lot.items.map((_, i) => i < 3
        ? { index: i, success: false, result: null,
            error: { status_code: 404, detail: `segment_id ${i} not found` } }
        : { index: i, success: true, result: {}, error: null }),
    },
  }));
  const a = s['Aggregate Results'][0].json;
  controle('ok_count', a.ok_count, 247);
  controle('fail_count', a.fail_count, 3);
  controle('cause identifiée « sauvegarde »',
    a.echecs.every(e => e.cause === 'sauvegarde'), true);
  controle('détail de l’API conservé',
    /not found/.test(a.echecs[0].detail), true);
}

console.log('\n5. lot entièrement perdu (onError) — ne doit pas passer pour sauvegardé');
{
  const s = chaine(fabriquer(100, 150), () => ({
    error: { message: '500 - {"detail":"boom"}', code: 'ERR_BAD_RESPONSE' },
  }));
  const a = s['Aggregate Results'][0].json;
  controle('ok_count', a.ok_count, 0);
  controle('fail_count', a.fail_count, 250);
  controle('motif porte le code HTTP', /HTTP 500/.test(a.echecs[0].detail), true);
}

console.log('\n6. timeout sans code lisible');
{
  const s = chaine(fabriquer(50, 0), () => ({
    error: { message: 'The connection was aborted', code: 'ECONNABORTED' },
  }));
  const a = s['Aggregate Results'][0].json;
  controle('ok_count', a.ok_count, 0);
  controle('fail_count', a.fail_count, 50);
  controle('motif porte 502', /HTTP 502/.test(a.echecs[0].detail), true);
}

console.log('\n7. aucune traduction n’a abouti — le job doit conclure quand même');
{
  const tous = Array.from({ length: 30 }, (_, i) => `seg-${i}`);
  const s = chaine(fabriquer(30, 0, tous), () => {
    throw new Error('/save-batch ne doit pas être appelé avec items: []');
  });
  const g = s['Grouper Sauvegardes'].map(i => i.json);
  const a = s['Aggregate Results'][0].json;
  controle('un item sentinelle émis', g.length === 1 && g[0].aucun_envoi === true, true);
  controle('aucun appel HTTP', g[0].items === undefined, true);
  controle('total conservé', a.total, 30);
  controle('fail_count', a.fail_count, 30);
  controle('job_id présent pour conclure', a.job_id, 'job-test');
}

console.log('\n8. provenance absente — les champs optionnels sont omis, jamais inventés');
{
  const cb = fabriquer(2, 0);
  delete cb.metadata.target_language;
  delete cb.metadata.provider;
  delete cb.metadata.model;
  const s = chaine(cb, toutOk);
  controle('item réduit à l’essentiel',
    Object.keys(s['Grouper Sauvegardes'][0].json.items[0]).sort(),
    ['segment_id', 'translated_text']);
}

// ---------------------------------------------------------------- en ligne
if (process.argv.includes('--en-ligne')) {
  console.log('\n9. sonde du contrat réel sur host2 (identifiants inexistants)');
  const cb = fabriquer(2, 1);
  const s = {};
  s['Validate Input'] = executer('Validate Input', { body: cb }, s);
  s['Split Results'] = executer('Split Results', s['Validate Input'], s);
  s['Grouper Sauvegardes'] = executer('Grouper Sauvegardes', s['Split Results'], s);
  const charge = { items: s['Grouper Sauvegardes'][0].json.items };

  (async () => {
    const r = await fetch('http://host2.local:3031/api/translations/save-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(charge),
    });
    const corps = await r.json();
    controle('HTTP', r.status, 200);
    controle('per_item_results présent', Array.isArray(corps.per_item_results), true);
    controle('un verdict par item', (corps.per_item_results || []).length, 3);
    // Identifiants inexistants : l'API doit les refuser un par un, pas rejeter
    // le lot. C'est la garantie d'isolation sur laquelle repose le retraitement.
    controle('refus isolés, pas de rejet global',
      (corps.per_item_results || []).every(x => x.success === false && x.error), true);
    conclure();
  })().catch(e => { console.log(`  ❌ sonde injoignable : ${e.message}`); echecs.push('sonde'); conclure(); });
} else {
  conclure();
}

function conclure() {
  console.log();
  if (echecs.length) {
    console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`);
    process.exit(1);
  }
  console.log('✅ tous les contrôles passent');
}
