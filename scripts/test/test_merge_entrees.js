#!/usr/bin/env node
/**
 * Aucun raccordement ne doit viser une entrée de Merge inexistante.
 *
 * ⚠️ Le défaut est TOTALEMENT silencieux : la donnée entre dans une entrée
 * fantôme, le Merge n'émet jamais, le nœud de réponse n'est pas atteint, et
 * n8n ferme la requête sur un HTTP 200 à corps VIDE — en marquant l'exécution
 * `success`. Rien dans le journal ne signale quoi que ce soit.
 *
 * Mesuré le 2026-09-08 sur MCP - Text Embedder (azy.daily#347) : `Format
 * Gemini` entrait sur l'entrée 2 d'un Merge qui n'en déclarait que 2.
 *
 *   node scripts/test/test_merge_entrees.js
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../../workflows');
let fautes = 0, merges = 0, fichiers = 0;

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
  let w;
  try { w = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { continue; }
  const decl = {};
  for (const n of w.nodes || []) {
    if (n.type && n.type.endsWith('.merge')) decl[n.name] = (n.parameters || {}).numberInputs ?? 2;
  }
  if (!Object.keys(decl).length) continue;
  fichiers++; merges += Object.keys(decl).length;
  for (const [src, o] of Object.entries(w.connections || {})) {
    for (const lst of o.main || []) {
      for (const c of lst || []) {
        if (!(c.node in decl)) continue;
        const i = c.index || 0;
        if (i >= decl[c.node]) {
          fautes++;
          console.log(`  ❌ ${f.slice(0, -5)}`);
          console.log(`       ${src} → ${c.node} entrée ${i}, mais le Merge n'en déclare que ${decl[c.node]}`);
        }
      }
    }
  }
}

console.log(`\n  ${fichiers} workflow(s), ${merges} nœud(s) Merge inspectés`);
console.log(fautes === 0
  ? '✅ aucune entrée fantôme'
  : `❌ ${fautes} raccordement(s) vers une entrée inexistante`);
process.exit(fautes === 0 ? 0 : 1);
