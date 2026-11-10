#!/usr/bin/env node
/**
 * Résidence des données : les points d'accès qui DOIVENT rester européens. #646
 *
 * POURQUOI CE TEST EXISTE
 * Le 2026-11-10, l'inventaire dépôt ↔ instance a révélé que `MCP - Mathpix` appelait
 * `eu.api.mathpix.com` **sur l'instance** et `api.mathpix.com` **dans le dépôt**. Un
 * réimport « de rattrapage » aurait donc déplacé l'OCR hors de l'UE — silencieusement,
 * et sans qu'aucun test ne s'en aperçoive, puisque les deux points d'accès se comportent
 * exactement pareil (vérifié : identifiants bidon → 401 identique sur les deux).
 *
 * C'est précisément ce qui rend ce défaut dangereux : il n'y a AUCUN signal fonctionnel.
 * Franck a tranché le choix européen ; ce test est ce qui l'empêche de se perdre au
 * prochain export, réimport ou copier-coller.
 *
 * ⚠️ On lit `wf.nodes`, jamais le fichier sérialisé : 250 des workflows du dépôt portent
 * un `activeVersion`, instantané périmé qui ferait passer le contrôle à tort.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let reussis = 0, echoues = 0;
function ok(nom, condition, detail) {
  if (condition) { reussis++; }
  else { echoues++; console.log(`  ❌ ${nom}` + (detail ? `\n       ${detail}` : '')); }
}

// fichier → { hôte attendu, hôte interdit, motif }
const EXIGENCES = {
  'MCP_-_Mathpix.json': {
    attendu: 'eu.api.mathpix.com',
    interdit: 'api.mathpix.com',
    motif: 'OCR de copies d\'élèves — décision de Franck du 2026-11-10',
  },
};

for (const [fichier, ex] of Object.entries(EXIGENCES)) {
  const p = path.join(RACINE, 'workflows', fichier);
  ok(`${fichier} → présent`, fs.existsSync(p));
  if (!fs.existsSync(p)) continue;
  const wf = JSON.parse(fs.readFileSync(p, 'utf8'));
  const urls = [];
  for (const n of wf.nodes || []) {
    const u = (n.parameters || {}).url;
    if (typeof u === 'string' && u.includes(ex.interdit)) urls.push([n.name, u]);
  }
  ok(`${fichier} → au moins une URL vers ${ex.interdit.split('.').slice(-2).join('.')}`,
     urls.length > 0, 'aucune URL trouvée : le test ne vérifie plus rien');
  for (const [nom, u] of urls) {
    ok(`${fichier} · ${nom} → point d'accès EUROPÉEN (${ex.motif})`,
       u.includes(ex.attendu),
       `obtenu ${u} — ce changement ne produit AUCUN signal fonctionnel, ` +
       'les deux points d\'accès répondant à l\'identique');
  }
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues ? 1 : 0);
