#!/usr/bin/env node
/**
 * Deux workflows ne peuvent pas servir la même paire (méthode, chemin). #646
 *
 * n8n indexe un webhook par **(méthode HTTP, chemin)** : `GET /config/branding` et
 * `PUT /config/branding` coexistent sans se gêner, c'est voulu et le parc s'en sert.
 * Mais deux workflows ACTIFS sur la MÊME paire sont en conflit, et n8n refuse
 * d'activer le second.
 *
 * CE QUE ÇA A COÛTÉ, MESURÉ LE 2026-11-10
 * `Torah Translation Orchestrator` porte `POST /webhook/torah-translate-batch` et son
 * fichier le déclare `active: true`. Or ce chemin a été RÉATTRIBUÉ à `Torah Batch
 * Dispatcher` (PR #409), qui est actif. Le réimport a donc tenté une activation que n8n
 * a refusée — correctement — et le workflow est resté inactif. Le réimport paraissait
 * en échec alors qu'il faisait exactement ce qu'il devait.
 *
 * ⚠️ Ce test porte sur le DÉPÔT, pas sur l'instance : il attrape le conflit avant le
 * réimport, quand il ne coûte qu'une relecture. Sur l'instance, il se manifeste par une
 * activation refusée, et il faut aller lire les journaux pour comprendre.
 *
 * ⚠️ Et il ne regarde QUE les fichiers qui se déclarent actifs. Un workflow
 * `active: false` qui garde son ancien webhook est légitime — c'est précisément l'état
 * dans lequel l'Orchestrator a été remis.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let reussis = 0, echoues = 0;
function ok(nom, condition, detail) {
  if (condition) { reussis++; }
  else { echoues++; console.log(`  ❌ ${nom}` + (detail ? `\n       ${detail}` : '')); }
}

const dossier = path.join(RACINE, 'workflows');
const paires = new Map();   // "MÉTHODE chemin" -> [noms de workflows]
let actifs = 0;

for (const f of fs.readdirSync(dossier).filter(x => x.endsWith('.json'))) {
  let wf;
  try { wf = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8')); }
  catch (e) { ok(`${f} → JSON valide`, false, e.message); continue; }
  // ⚠️ `active` absent (13 fichiers) = on ne sait pas, donc on considère actif :
  // c'est le cas de `Torah Batch Dispatcher`, actif en production. Le traiter comme
  // inactif ferait rater le conflit qu'on cherche.
  if (wf.active === false) continue;
  actifs++;
  for (const n of wf.nodes || []) {
    if (n.type !== 'n8n-nodes-base.webhook') continue;
    const p = (n.parameters || {}).path;
    if (!p) continue;
    const m = ((n.parameters || {}).httpMethod || 'GET').toUpperCase();
    const cle = `${m} ${p}`;
    if (!paires.has(cle)) paires.set(cle, []);
    paires.get(cle).push(wf.name || f);
  }
}

ok('des workflows actifs ont été lus', actifs > 0, `${actifs}`);
console.log(`  (${actifs} fichiers se déclarant actifs · ${paires.size} paires (méthode, chemin))`);

for (const [cle, noms] of [...paires].sort()) {
  const uniques = [...new Set(noms)];
  ok(`paire \`${cle}\` servie par UN SEUL workflow actif`, uniques.length === 1,
     `servie par ${uniques.length} : ${uniques.join(', ')} — n8n refusera d'activer ` +
     'le second, et le réimport paraîtra en échec');
}

// ── Le cas nommément : l'Orchestrator ne doit plus se déclarer actif ─────────
// Un contrôle générique passerait si quelqu'un supprimait le Dispatcher du dépôt.
// Celui-ci vérifie l'état voulu, pas seulement l'absence de collision.
{
  const p = path.join(dossier, 'Torah_Translation_Orchestrator.json');
  if (fs.existsSync(p)) {
    const wf = JSON.parse(fs.readFileSync(p, 'utf8'));
    ok('Torah Translation Orchestrator → `active: false` (le Dispatcher détient son chemin)',
       wf.active === false, `active=${JSON.stringify(wf.active)}`);
  }
  const d = path.join(dossier, 'Torah_Batch_Dispatcher.json');
  if (fs.existsSync(d)) {
    const wf = JSON.parse(fs.readFileSync(d, 'utf8'));
    const w = (wf.nodes || []).find(n => n.type === 'n8n-nodes-base.webhook');
    ok('Torah Batch Dispatcher → porte bien `torah-translate-batch`',
       !!w && (w.parameters || {}).path === 'torah-translate-batch',
       w ? (w.parameters || {}).path : 'aucun webhook');
    // ⚠️ Et il ne doit PAS passer à `active: false` : il est actif en production, et
    // `update_workflow` honore désormais ce drapeau — le poser le désactiverait.
    ok('Torah Batch Dispatcher → ne se déclare PAS inactif', wf.active !== false,
       'il est actif en production ; `active: false` le désactiverait au réimport');
  }
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues ? 1 : 0);
