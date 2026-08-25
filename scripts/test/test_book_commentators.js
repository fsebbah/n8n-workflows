#!/usr/bin/env node
/**
 * Inventaire des commentateurs d'une page de corpus « livre » (azy.daily#234)
 * et relais du paramètre `include` sur `torah-corpus` (azy.daily#249).
 *
 *     node scripts/test/test_book_commentators.js
 *     node scripts/test/test_book_commentators.js --en-ligne
 *
 * Le test exécute le JavaScript extrait du JSON des workflows.
 *
 * Ce qu'il verrouille
 * -------------------
 *  - **aucune réécriture du champ `commentator`** : `?commentators=` compare en
 *    égalité STRICTE, un nom d'affichage raccourci rend zéro sans erreur ;
 *  - `traite` ET `page` obligatoires — une page de Bavli ne s'identifie pas
 *    autrement, et servir une page arbitraire tromperait l'appelant ;
 *  - un 404 de l'API ressort en 404, pas en 200 ni en 500 : avec
 *    onError=continueRegularOutput, un appel en échec n'émet pas
 *    {statusCode, body} ;
 *  - `include` est relayé TEL QUEL sur torah-corpus, sans liste blanche locale
 *    qui divergerait de celle de l'API.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const BOOK = lire('TORAH_-_Book_Commentators.json');
const CORPUS = lire('Torah_Corpus.json');
const noeud = (wf, n) => wf.nodes.find(x => x.name === n);
const code = (wf, n) => noeud(wf, n).parameters.jsCode;

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 56 ? obtenu.slice(0, 56) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(52)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

function exec(src, entree, refs = {}) {
  const env = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: n => { const v = env(refs[n]); return { all: () => v, first: () => v[0], item: v[0] }; },
    console: { log() {} }, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, encodeURIComponent,
  };
  return env(vm.runInNewContext(`(function(){${src}})()`, ctx));
}

const lireP = q => exec(code(BOOK, 'Lire Paramètres'), { query: q })[0].json;
const formater = (rep, p = { traite: 'Berakhot', page: '2a', segment_num: null }) =>
  exec(code(BOOK, 'Formater Réponse'), rep, { 'Lire Paramètres': p })[0].json;

console.log('\n1. paramètres — les deux sont obligatoires');
{
  controle('traite + page', lireP({ traite: 'Berakhot', page: '2a' }).valide, true);
  const sansPage = lireP({ traite: 'Berakhot' });
  controle('page absente → 400 nommé',
    [sansPage.valide, /page/.test(sansPage.erreur.message)], [false, true]);
  const rien = lireP({});
  controle('les deux absents → tous deux nommés',
    /traite, page/.test(rien.erreur.message), true);
  controle('espaces retirés', lireP({ traite: ' Berakhot ', page: ' 2a ' }).traite, 'Berakhot');
  // Le match API est strict : normaliser masquerait un 404 légitime.
  controle('casse préservée', lireP({ traite: 'berakhot', page: '2A' }).traite, 'berakhot');
  controle('segment_num optionnel, omis',
    lireP({ traite: 'B', page: '2a' }).requete, '');
  controle('segment_num relayé en query',
    lireP({ traite: 'B', page: '2a', segment_num: 3 }).requete, '?segment_num=3');
}

console.log('\n2. réponse nominale — proxy 1:1, aucune réécriture');
{
  const api = {
    statusCode: 200,
    body: {
      success: true, traite: 'Berakhot', page: '2a', segment_num: null,
      corpus: 'Bavli', count: 22, total_commentaries: 136,
      commentators: [
        { commentator: 'Tzelach', count: 21 },
        { commentator: 'Meiri', count: 17 },
        { commentator: 'Rashi', count: 17 },
      ],
    },
  };
  const r = formater(api);
  controle('corpus remonté', r.corpus, 'Bavli');
  controle('count et total', [r.count, r.total_commentaries], [22, 136]);
  controle('clés intactes', r.commentators.map(c => c.commentator),
    ['Tzelach', 'Meiri', 'Rashi']);
  controle('ordre de l’API préservé', r.commentators[0].count, 21);
}

console.log('\n3. cas limites');
{
  const vide = formater({ statusCode: 200,
    body: { success: true, traite: 'X', page: '2a', count: 0, commentators: [] } });
  controle('page sans commentaire : succès', [vide.success, vide.count], [true, 0]);

  // Forme émise par onError=continueRegularOutput : pas de statusCode.
  const p404 = formater({ error: { message: '404 - {"detail":"Page not found"}', code: 'ERR_BAD_REQUEST' } });
  controle('404 API → 404, pas 200', [p404.success, p404.error.code], [false, 404]);
  controle('statut nommé', p404.error.status, 'PAGE_NOT_FOUND');
  const to = formater({ error: { message: 'The connection was aborted', code: 'ECONNABORTED' } });
  controle('timeout → 502, jamais un succès', [to.success, to.error.code], [false, 502]);
}

console.log('\n4. torah-corpus — include relayé tel quel');
{
  const lireC = q => exec(code(CORPUS, 'Lire Paramètres'), { query: q })[0].json;
  controle('sans include : aucune query', lireC({}).requete, '');
  controle('include relayé', lireC({ include: 'counts,status' }).requete,
    '?include=counts%2Cstatus');
  // Aucune liste blanche locale : c'est l'API qui connaît les valeurs valides, et
  // la dupliquer ici créerait deux sources de vérité.
  controle('valeur inconnue transmise, pas filtrée',
    lireC({ include: 'counts,progress' }).requete, '?include=counts%2Cprogress');
  controle('URL construite depuis la query',
    noeud(CORPUS, 'Get Corpus (API)').parameters.url,
    '={{ $env.TORAH_API_URL }}/api/corpus{{ $json.requete }}');
}

if (process.argv.includes('--en-ligne')) {
  console.log('\n5. aller-retour réel');
  (async () => {
    const N = 'http://llm.local:5678/webhook';
    const inv = await (await fetch(`${N}/torah-book-commentators?traite=Berakhot&page=2a`)).json();
    controle('inventaire servi', inv.success, true);
    controle('corpus déduit par l’API', inv.corpus, 'Bavli');
    controle('au moins 15 commentateurs', (inv.commentators || []).length >= 15, true);
    const ko = await fetch(`${N}/torah-book-commentators?traite=Zzz&page=2a`);
    controle('page inconnue → 4xx', ko.status >= 400 && ko.status < 500, true);
    const c = await (await fetch(`${N}/torah-corpus?include=counts,status`)).json();
    const t = (c.corpus || []).find(x => x.name === 'Bavli') || {};
    controle('counts servis par torah-corpus', !!t.counts, true);
    controle('status servi', !!t.status, true);
    controle('progress arrive AVEC status', !!t.progress, true);
    conclure();
  })().catch(e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
} else conclure();

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
  console.log('✅ tous les contrôles passent');
}
