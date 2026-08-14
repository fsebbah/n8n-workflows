#!/usr/bin/env node
/**
 * Inventaire des commentateurs d'une parasha (azy.daily#227).
 *
 *     node scripts/test/test_parasha_commentators.js
 *     node scripts/test/test_parasha_commentators.js --en-ligne   # appelle l'API réelle
 *
 * Le besoin
 * ---------
 * Le plugin affichait 5 commentateurs codés en dur là où Shoftim en compte 50.
 * Obtenir l'inventaire depuis le contenu coûterait cher : mesuré, l'aliyah 1 seule
 * sans filtre pèse 884 Ko pour 824 commentaires.
 *
 * Ce que le test verrouille
 * -------------------------
 *  - **aucune réécriture du champ `commentator`**. C'est le point critique :
 *    `?commentators=` compare en égalité STRICTE, sans normalisation, et la base
 *    porte `Torah Temimah on Torah` — pas `Torah Temimah`. Raccourcir un nom
 *    produirait des sélections qui ne rendent rien, sans erreur ;
 *  - `name` obligatoire, sans défaut : servir l'inventaire d'une parasha
 *    arbitraire tromperait l'appelant en silence ;
 *  - un 404 de l'API ressort en 404, pas en 200 ni en 500. Avec
 *    onError=continueRegularOutput, un appel en échec n'émet pas {statusCode, body} :
 *    sans désencapsulage, une parasha inconnue passerait pour un succès vide ;
 *  - un tableau vide n'est PAS une erreur (parasha connue, sans commentaire).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/TORAH_-_Parasha_Commentators.json'), 'utf8'));
const noeud = n => WF.nodes.find(x => x.name === n);
const code = n => noeud(n).parameters.jsCode;

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 56 ? obtenu.slice(0, 56) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(54)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

function exec(src, entree, refs = {}) {
  const env = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: n => { const v = env(refs[n]); return { all: () => v, first: () => v[0], item: v[0] }; },
    console: { log() {} }, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp,
  };
  return env(vm.runInNewContext(`(function(){${src}})()`, ctx));
}

const lire = q => exec(code('Lire Paramètres'), { query: q })[0].json;
const formater = (reponse, params = { name: 'Shoftim' }) =>
  exec(code('Formater Réponse'), reponse, { 'Lire Paramètres': params })[0].json;

console.log('\n1. paramètre — obligatoire, jamais normalisé');
{
  controle('name fourni', lire({ name: 'Shoftim' }), { valide: true, name: 'Shoftim' });
  controle('espaces retirés', lire({ name: '  Shoftim  ' }).name, 'Shoftim');
  const vide = lire({});
  controle('name absent → refus 400', [vide.valide, vide.erreur.code], [false, 400]);
  // Le match API est strict et sensible à la casse ; normaliser masquerait un 404
  // légitime, seul signal disant à l'appelant que son nom est faux.
  controle('casse préservée telle quelle', lire({ name: 'shoftim' }).name, 'shoftim');
}

console.log('\n2. réponse nominale — proxy 1:1, aucune réécriture');
{
  const api = {
    statusCode: 200,
    body: {
      success: true, name: 'Shoftim',
      start_ref: 'Deuteronomy 16:18', end_ref: 'Deuteronomy 21:9', count: 50,
      commentators: [
        { commentator: 'Torah Temimah on Torah', count: 385 },
        { commentator: 'Aderet Eliyahu', count: 321 },
        { commentator: 'Birkat Asher on Torah', count: 163 },
      ],
    },
  };
  const r = formater(api);
  controle('success', r.success, true);
  controle('count', r.count, 50);
  controle('plage remontée', [r.start_ref, r.end_ref], ['Deuteronomy 16:18', 'Deuteronomy 21:9']);

  // LE point du workflow : la clé doit sortir identique, suffixe compris.
  controle('clés à suffixe intactes',
    r.commentators.map(c => c.commentator),
    ['Torah Temimah on Torah', 'Aderet Eliyahu', 'Birkat Asher on Torah']);
  controle('aucun raccourcissement de nom',
    r.commentators.some(c => c.commentator === 'Torah Temimah'), false);
  controle('counts intacts', r.commentators.map(c => c.count), [385, 321, 163]);
  controle('ordre de l’API préservé',
    r.commentators[0].commentator, 'Torah Temimah on Torah');
}

console.log('\n3. cas limites');
{
  const vide = formater({ statusCode: 200,
    body: { success: true, name: 'X', start_ref: 'a', end_ref: 'b', count: 0, commentators: [] } });
  controle('parasha sans commentaire : succès, pas erreur', [vide.success, vide.count], [true, 0]);
  controle('tableau vide', vide.commentators, []);

  // Forme émise par onError=continueRegularOutput : pas de statusCode.
  const p404 = formater({ error: { message: '404 - {"detail":"Parasha not found: Zzz"}', code: 'ERR_BAD_REQUEST' } },
                        { name: 'Zzz' });
  controle('404 API → 404, pas 200', [p404.success, p404.error.code], [false, 404]);
  controle('statut nommé', p404.error.status, 'PARASHA_NOT_FOUND');
  controle('detail de l’API conservé', /Parasha not found/.test(p404.error.message), true);

  const boom = formater({ error: { message: '500 - {"detail":"boom"}', code: 'ERR_BAD_RESPONSE' } });
  controle('500 API → 500', [boom.error.code, boom.error.status], [500, 'API_ERROR']);

  const to = formater({ error: { message: 'The connection was aborted', code: 'ECONNABORTED' } });
  controle('timeout → 502, jamais un succès', [to.success, to.error.code], [false, 502]);
}

console.log('\n4. câblage');
{
  const co = WF.connections;
  controle('webhook', noeud('Webhook Trigger').parameters.path, 'torah-tanakh-parasha-commentators');
  controle('URL cible', noeud('Lister (API)').parameters.url,
    '={{ $env.TORAH_API_URL }}/api/torah/parashiyot/{{ encodeURIComponent($json.name) }}/commentators');
  controle('appel en onError, pour désencapsuler le statut',
    noeud('Lister (API)').onError, 'continueRegularOutput');
  controle('paramètre invalide → réponse dédiée',
    co['Paramètre Valide ?'].main[1].map(t => t.node), ['Répondre Erreur']);
  controle('code HTTP entier imposé',
    noeud('Répondre').parameters.options.responseCode.includes('Number.isInteger'), true);
}

// ---------------------------------------------------------------- en ligne
if (process.argv.includes('--en-ligne')) {
  console.log('\n5. aller-retour réel : clé de l’inventaire → filtre du contenu');
  (async () => {
    const N8N = 'http://llm.local:5678/webhook';
    const inv = await (await fetch(`${N8N}/torah-tanakh-parasha-commentators?name=Shoftim`)).json();
    controle('inventaire servi', inv.success, true);
    controle('au moins 40 commentateurs', (inv.commentators || []).length >= 40, true);

    // La garantie qui justifie l'endpoint : la clé rendue est celle du filtre.
    for (const c of (inv.commentators || []).slice(0, 3)) {
      const u = `${N8N}/torah-tanakh-parasha-content?name=Shoftim&aliyah=1`
              + `&include_commentaries=true&commentators=${encodeURIComponent(c.commentator)}`;
      const j = await (await fetch(u)).json();
      const cles = new Set();
      for (const s of (j.segments || [])) for (const x of (s.commentaries || [])) cles.add(x.commentator);
      controle(`« ${c.commentator} » filtre bien`,
        cles.size === 1 && cles.has(c.commentator), true);
    }
    const ko = await fetch(`${N8N}/torah-tanakh-parasha-commentators?name=Zzz`);
    controle('parasha inconnue → 404', ko.status, 404);
    conclure();
  })().catch(e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
} else conclure();

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
  console.log('✅ tous les contrôles passent');
}
