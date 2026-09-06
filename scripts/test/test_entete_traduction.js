#!/usr/bin/env node
/**
 * Retrait de l'en-tête markdown parasite en tête de traduction (azy.daily#336).
 *
 * Les 13 consignes disent déjà « Réponds UNIQUEMENT avec la traduction » ;
 * 19 formes différentes l'ont débordée sur 117 lignes mesurées en base.
 * Une consigne est une demande, pas une garantie.
 *
 * ⚠️ La fonction est DUPLIQUÉE dans deux workflows (n8n n'a pas de module
 * partagé). Ce test vérifie d'abord qu'elles ne divergent pas.
 *
 *   node scripts/test/test_entete_traduction.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '../..');
const CIBLES = [
  ['Torah_Batch_Callback', 'Grouper Sauvegardes'],
  ['Torah_Save_Worker', 'Parse Input'],
];
const WF = {};
for (const [s] of CIBLES) WF[s] = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', s + '.json'), 'utf8'));

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(50)} ${String(JSON.stringify(obtenu)).slice(0, 48)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};
const code = (s, n) => WF[s].nodes.find((x) => x.name === n).parameters.jsCode;
const nu = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');

/** Extrait la fonction du nœud et la rend appelable — on éprouve le code livré. */
const aide = (s, n) => {
  const src = code(s, n);
  const d = src.indexOf('const sansEntete');
  const f = src.indexOf('\n};', d) + 3;
  return vm.runInNewContext(`${src.slice(d, f)}\nsansEntete`,
    { String, RegExp, Object }, { timeout: 3000 });
};

console.log('\n1. le bac à sable : ni require, ni Buffer, ni process');
for (const [s, n] of CIBLES) {
  const src = nu(code(s, n));
  T(`${s.slice(0, 22)}/${n}`.slice(0, 48), null,
    /\brequire\s*\(/.test(src) ? 'require()' : /\bBuffer\s*[.(]/.test(src) ? 'Buffer'
      : /\bprocess\s*\./.test(src) ? 'process.' : null);
}

console.log('\n2. les deux copies de la fonction ne divergent pas');
const [A, B] = CIBLES.map(([s, n]) => aide(s, n));
const SONDES = ['# Traduction\n\nabc', 'texte nu', '## Traduction française\n\nx',
  '# Deutéronome 17:16 - Commentaire\n\ny', '# Traduction', '', null];
let divergences = 0;
for (const p of SONDES) {
  if (JSON.stringify(A(p)) !== JSON.stringify(B(p))) divergences++;
}
T('comportement identique sur 7 sondes', 0, divergences);

console.log('\n3. les 19 formes mesurées en base sont retirées');
const OBSERVEES = [
  '# Traduction', '## Traduction française', '# Ki Teitzei - Traduction',
  '# Traduction - Ki Teitzei', '# Traduction - Deutéronome, Shoftim',
  '# Traduction du passage', '# Traduction du texte hébreu',
  '# Traduction - Ki Teitzei [228]', '# Traduction de Kי Teitzei [152]',
];
for (const titre of OBSERVEES) {
  const r = A(`${titre}\n\nLe contenu réel de la traduction.`);
  T(`retiré : ${titre}`.slice(0, 48), 'Le contenu réel de la traduction.', r.texte);
}

console.log('\n4. ⚠️ l’ambigu est signalé, jamais coupé');
const amb = A('# Deutéronome 17:16 - Commentaire\n\nLe commentaire lui-même.');
T('texte intact', '# Deutéronome 17:16 - Commentaire\n\nLe commentaire lui-même.', amb.texte);
T('rien retiré', null, amb.retiree);
T('mais signalé', '# Deutéronome 17:16 - Commentaire'.replace(/^#+\s*/, ''), amb.suspecte);

console.log('\n5. les cas limites');
T('aucun en-tête : texte intact', 'Simple texte.', A('Simple texte.').texte);
T('en-tête seul : on ne vide JAMAIS', '# Traduction', A('# Traduction').texte);
T('en-tête + vide : on ne vide JAMAIS', '# Traduction\n\n', A('# Traduction\n\n').texte);
T('sans ligne blanche entre les deux', 'abc', A('# Traduction\nabc').texte);
T('h6 accepté', 'abc', A('###### Traduction\n\nabc').texte);
T('# sans espace n’est pas un titre ATX', '#Traduction\n\nabc', A('#Traduction\n\nabc').texte);
T('en-tête en 2e ligne : intact', 'x\n# Traduction\n\ny', A('x\n# Traduction\n\ny').texte);
T('null toléré', '', A(null).texte);
T('anglais aussi', 'abc', A('## Translation\n\nabc').texte);
T('espaces avant le dièse', 'abc', A('  # Traduction\n\nabc').texte);
T('un seul en-tête retiré, pas deux', '# Traduction\n\nabc',
  A('# Traduction\n\n# Traduction\n\nabc').texte);

console.log('\n6. le nettoyage est bien branché sur les DEUX chemins');
for (const [s, n] of CIBLES) T(`${s.slice(0, 26)} appelle sansEntete`.slice(0, 48), true,
  /sansEntete\s*\(/.test(nu(code(s, n)).replace('const sansEntete', '')));

// bout en bout sur le nœud synchrone
const pi = vm.runInNewContext(`(function(){${code('Torah_Save_Worker', 'Parse Input')}})()`, {
  $input: { first: () => ({ json: { body: {
    translation: '## Traduction française\n\nAu commencement.',
    segment_id: 's1', job_id: 'j1' } } }) },
  String, RegExp, Object, JSON, Array, Date, Number,
}, { timeout: 3000 });
T('Save Worker : traduction nettoyée', 'Au commencement.', pi[0].json.translation);
T('Save Worker : en-tête tracée', 'Traduction française', pi[0].json.enteteRetiree);

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
process.exit(ko === 0 ? 0 : 1);
