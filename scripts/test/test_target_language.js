#!/usr/bin/env node
/**
 * `target_language` doit traverser « TORAH - Parasha Commentators » (azy.daily#233).
 *
 *     node scripts/test/test_target_language.js
 *     node scripts/test/test_target_language.js --en-ligne
 *
 * Le défaut
 * ---------
 * Le webhook ne relayait pas `target_language`. L'API appliquait donc son défaut,
 * et le champ `untranslated` — celui sur lequel le picker filtre — comptait dans
 * la mauvaise langue. Mesuré sur Shoftim :
 *
 *     (aucun paramètre)      Malbim  untranslated = 0
 *     target_language=fr     Malbim  untranslated = 0
 *     target_language=en     Malbim  untranslated = 151
 *
 * Un picker demandant l'anglais recevait 0 — « rien à faire » — alors que les
 * 151 commentaires y étaient tous à traduire. Aucune erreur, aucun signal.
 *
 * Data déclare le paramètre obligatoire en précisant que le français et l'anglais
 * sont quasi inversés : c'est exactement le cas où un défaut silencieux trompe.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/TORAH_-_Parasha_Commentators.json'), 'utf8'));
const noeud = n => WF.nodes.find(x => x.name === n);

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 52 ? obtenu.slice(0, 52) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(52)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}
function lire(query) {
  const items = [{ json: { query } }];
  const r = vm.runInNewContext(`(function(){${noeud('Lire Paramètres').parameters.jsCode}})()`, {
    $input: { all: () => items, first: () => items[0] },
    console: { log() {} }, JSON, Object, Array, String, Number, encodeURIComponent,
  });
  return Array.isArray(r) ? r[0].json : r.json || r;
}

console.log('\n1. le paramètre traverse');
{
  controle('langue relayée', lire({ name: 'Shoftim', target_language: 'en' }).requete, '?target_language=en');
  controle('absente : aucune query', lire({ name: 'Shoftim' }).requete, '');
  controle('vide : aucune query', lire({ name: 'Shoftim', target_language: '  ' }).requete, '');
  controle('espaces retirés', lire({ name: 'Shoftim', target_language: ' fr ' }).target_language, 'fr');
  controle('nom toujours porté', lire({ name: 'Shoftim', target_language: 'en' }).name, 'Shoftim');
  // Aucune liste blanche : c'est l'API qui connaît les langues valides.
  controle('valeur inconnue transmise, pas filtrée',
    lire({ name: 'Shoftim', target_language: 'zz' }).requete, '?target_language=zz');
  controle('aucune liste de langues en dur',
    /['"](fr|en)['"]/.test(noeud('Lire Paramètres').parameters.jsCode.replace(/\/\/[^\n]*/g, '')), false);
}

console.log('\n2. le nom reste obligatoire, et sans défaut');
{
  const sans = lire({ target_language: 'en' });
  controle('name absent → 400', [sans.valide, sans.erreur.code], [false, 400]);
  // Servir une parasha arbitraire tromperait l'appelant en silence. On teste le
  // COMPORTEMENT, pas la présence d'un nom : « Shoftim » figure légitimement dans
  // le message d'erreur, comme exemple.
  controle('aucun nom émis quand il manque', 'name' in sans, false);
  controle('aucune requête construite non plus', 'requete' in sans, false);
}

console.log('\n3. l’URL construite');
{
  const n = WF.nodes.find(x => String((x.parameters || {}).url || '').includes('/commentators'));
  controle('la query est concaténée', n.parameters.url,
    '={{ $env.TORAH_API_URL }}/api/torah/parashiyot/{{ encodeURIComponent($json.name) }}/commentators{{ $json.requete }}');
}

if (process.argv.includes('--en-ligne')) {
  console.log('\n4. aller-retour réel — le compte change bien avec la langue');
  (async () => {
    const N = 'http://llm.local:5678/webhook';
    const malbim = async q => {
      const d = await (await fetch(`${N}/torah-tanakh-parasha-commentators?name=Shoftim${q}`)).json();
      return (d.commentators || []).find(c => c.commentator === 'Malbim') || {};
    };
    const fr = await malbim('&target_language=fr');
    const en = await malbim('&target_language=en');
    console.log(`     fr : count=${fr.count} untranslated=${fr.untranslated}`);
    console.log(`     en : count=${en.count} untranslated=${en.untranslated}`);
    controle('même nombre de commentaires', fr.count, en.count);
    // Le cœur du défaut : sans relais, les deux rendaient la même valeur.
    controle('untranslated DIFFÈRE selon la langue', fr.untranslated !== en.untranslated, true);
    controle('anglais : tout reste à traduire', en.untranslated, en.count);
    conclure();
  })().catch(e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
} else conclure();

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
  console.log('✅ tous les contrôles passent');
}
