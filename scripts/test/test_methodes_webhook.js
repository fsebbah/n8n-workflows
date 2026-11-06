#!/usr/bin/env node
/**
 * Aucun webhook ne doit déclarer sa méthode comme une EXPRESSION n8n.
 *
 *     node scripts/test/test_methodes_webhook.js
 *
 * `Torah Result Store` déclarait `httpMethod: "=POST"`. Le `=` est le préfixe
 * d'expression de n8n : la valeur est évaluée au lieu d'être lue littéralement.
 *
 * En exécution c'est inoffensif — `=POST` s'évalue en la chaîne `POST`, et
 * `POST /webhook/torah-result-store` répond bien 200 (mesuré le 2026-11-06).
 *
 * ⚠️ Mais le REGISTRE publie `method` verbatim depuis ce champ :
 *
 *     webhookNode.parameters?.httpMethod || "POST"
 *
 * MCP recevait donc `method: "=POST"` pour cet outil, et un consommateur qui se
 * sert de ce champ pour émettre sa requête échouerait. Un défaut invisible depuis
 * n8n, visible seulement depuis le catalogue — et le catalogue sert à bâtir les
 * allowlists de personas (azy.daily#631).
 *
 * Le contrôle est sur TOUT le dépôt, pas sur ce seul workflow : c'était la seule
 * occurrence, et ce test est ce qui garantit qu'elle le reste.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DOSSIER = path.resolve(__dirname, '..', '..', 'workflows');
const VERBES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

let fichiers = 0;
let webhooks = 0;
const fautifs = [];

for (const f of fs.readdirSync(DOSSIER).filter((n) => n.endsWith('.json'))) {
  let wf;
  try { wf = JSON.parse(fs.readFileSync(path.join(DOSSIER, f), 'utf8')); }
  catch (e) { continue; }
  fichiers += 1;
  for (const n of wf.nodes || []) {
    if (n.type !== 'n8n-nodes-base.webhook') continue;
    webhooks += 1;
    const m = (n.parameters || {}).httpMethod;
    // `undefined` est légitime : n8n applique POST par défaut, et le registre aussi.
    if (m === undefined || m === null) continue;
    if (typeof m !== 'string') { fautifs.push([f, n.name, JSON.stringify(m), 'pas une chaîne']); continue; }
    if (m.startsWith('=')) { fautifs.push([f, n.name, m, 'expression n8n — le registre la publierait verbatim']); continue; }
    if (!VERBES.includes(m)) { fautifs.push([f, n.name, m, 'verbe HTTP inconnu']); }
  }
}

console.log(`\nMéthodes des webhooks — ${webhooks} webhook(s) dans ${fichiers} fichier(s)\n`);
if (fautifs.length === 0) {
  console.log('  ✓ toutes les méthodes sont des verbes HTTP littéraux');
  console.log('  ✓ aucune expression n8n (préfixe « = ») dans un httpMethod\n');
  process.exit(0);
}
for (const [f, noeud, valeur, pourquoi] of fautifs) {
  console.log(`  ✗ ${f} / ${noeud} : ${JSON.stringify(valeur)} — ${pourquoi}`);
}
console.log(`\n${fautifs.length} méthode(s) fautive(s)\n`);
process.exit(1);
