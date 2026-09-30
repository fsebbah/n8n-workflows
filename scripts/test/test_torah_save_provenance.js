#!/usr/bin/env node
/**
 * torah-save — la provenance de NOTRE modification voyage avec le texte.
 *
 *     node scripts/test/test_torah_save_provenance.js
 *
 * `Parse Input` retire un en-tête markdown parasite en tête de traduction (« # Traduction »,
 * « ## Traduction française »… — 19 formes mesurées sur 117 lignes en base, azy.daily#336). Il
 * calculait déjà `enteteRetiree` et `enteteSuspecte`, et ne les transmettait à personne.
 *
 * Nous livrions donc à torah.api un texte que nous avions MODIFIÉ, sans aucune trace de la
 * modification : une traduction amputée de sa première ligne n'aurait laissé nulle part de quoi
 * remonter jusqu'à nous. C'est de la provenance, et la décision de Franck sur azy.daily#458
 * — « on ne jette rien, on restitue tout » — s'applique à notre propre maillon.
 *
 * Les deux champs partent dans `extra_data`, que torah.api relaie tel quel et persiste en JSONB
 * (confirmé par l'équipe api : `TranslationSaveRequest.extra_data` est `dict | None`).
 *
 * ⚠️ Ils sont TOUJOURS présents, `null` quand il n'y a rien à signaler. Un champ absent est une
 * question — « personne n'a regardé ? » — là où un champ `null` est une réponse.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHIER = path.join(__dirname, '..', '..', 'workflows', 'Torah_Save_Worker.json');
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

/** Exécute `Parse Input` sur un corps de webhook. */
function analyser(corps) {
  const ctx = vm.createContext({ $input: { first: () => ({ json: { body: corps } }) }, console });
  const r = vm.runInContext(`(function () {\n${noeud('Parse Input').parameters.jsCode}\n})()`, ctx);
  return Array.isArray(r) ? r[0].json : r;
}

/** Évalue le corps HTTP envoyé à torah.api, à partir de la sortie de `Parse Input`. */
function corpsEnvoye(sortieParse) {
  const brut = noeud('Save to API').parameters.jsonBody;
  const expr = brut.replace(/^=\{\{/, '').replace(/\}\}$/, '');
  return JSON.parse(vm.runInNewContext(expr, { $json: sortieParse, JSON, Object }));
}

const BASE = { segment_id: 'seg-1', target_language: 'fr', job_id: 'j-1' };

console.log('\ntorah-save — provenance de l\'en-tête retiré\n');

console.log('En-tête reconnu : retiré du texte ET signalé');
{
  const p = analyser({ ...BASE, translation: '# Traduction\n\nBereshit bara Elohim' });
  const c = corpsEnvoye(p);
  verifier('le texte est nettoyé', c.translated_text, 'Bereshit bara Elohim');
  verifier('entete_retiree porte le titre retiré', c.extra_data.entete_retiree, 'Traduction');
  verifier('entete_suspecte reste null', c.extra_data.entete_suspecte, null);
}

console.log('\nEn-tête NON reconnu : laissé en place ET signalé');
{
  const p = analyser({ ...BASE, translation: '# Ki Teitzei\n\nQuand tu sortiras en guerre' });
  const c = corpsEnvoye(p);
  verifier('le texte est intact, en-tête compris',
    c.translated_text, '# Ki Teitzei\n\nQuand tu sortiras en guerre');
  verifier('entete_suspecte porte le titre douteux', c.extra_data.entete_suspecte, 'Ki Teitzei');
  verifier('entete_retiree reste null', c.extra_data.entete_retiree, null);
}

console.log('\nTexte ordinaire : les deux champs existent quand même');
{
  const c = corpsEnvoye(analyser({ ...BASE, translation: 'Au commencement' }));
  verifier('aucun des deux champs ne manque',
    ['entete_retiree', 'entete_suspecte'].every((k) => k in c.extra_data), true);
  verifier('les deux valent null',
    [c.extra_data.entete_retiree, c.extra_data.entete_suspecte], [null, null]);
}

console.log('\nLe `extra_data` de l\'appelant n\'est jamais écrasé');
{
  const c = corpsEnvoye(analyser({ ...BASE, translation: '# Traduction\n\nTexte',
    extra_data: { source: 'batch-42', traite: 'Berakhot' } }));
  verifier('les clés de l\'appelant survivent',
    [c.extra_data.source, c.extra_data.traite], ['batch-42', 'Berakhot']);
  verifier('les nôtres s\'y ajoutent', c.extra_data.entete_retiree, 'Traduction');
}

console.log('\nRien d\'autre n\'a bougé dans le corps envoyé');
{
  const c = corpsEnvoye(analyser({ ...BASE, translation: 'Texte', provider: 'openai',
    model: 'gpt-5', quality_score: 0.9, notes: 'n', issues: ['x'], request_id: 'r-1' }));
  verifier('les 15 autres champs sont transmis',
    [c.segment_id, c.target_language, c.job_id, c.provider, c.model,
     c.quality_score, c.notes, c.issues, c.request_id, c.status],
    ['seg-1', 'fr', 'j-1', 'openai', 'gpt-5', 0.9, 'n', ['x'], 'r-1', 'approved']);
  verifier('le nom des clés reste en snake_case (contrat api)',
    Object.keys(c).filter((k) => /[A-Z]/.test(k)), []);
}

console.log('\nGarde n8n : jamais deux accolades adjacentes dans l\'expression');
{
  const brut = noeud('Save to API').parameters.jsonBody;
  const interieur = brut.slice(brut.indexOf('{{') + 2, brut.lastIndexOf('}}'));
  verifier('aucun `}}` à l\'intérieur du `={{ }}`', interieur.includes('}}'), false);
}

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
