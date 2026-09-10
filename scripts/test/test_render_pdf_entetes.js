#!/usr/bin/env node
/**
 * DOC - Render PDF : les en-têtes du service arrivent jusqu'à l'appelant
 * (azy.daily#355).
 *
 * Mesuré le 2026-09-10 : gotenberg.api émet Content-Disposition et six
 * X-Render-* sur chaque PDF — le guide d'intégration les promet —, mais le
 * webhook n'en relayait AUCUN : le nœud HTTP ne gardait que le binaire, et
 * Respond PDF fixait Content-Type seul. Sans eux, un client ne peut ni dire quel
 * gabarit a servi, ni vérifier la fidélité du rendu sans ouvrir le PDF.
 *
 * Relayer Content-Disposition a exposé un second défaut : sur /render-pdf sans
 * filename, Validate Input fabriquait « undefined_undefined.pdf » (repli propre à
 * l'alias torah).
 *
 *   node scripts/test/test_render_pdf_entetes.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const W = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../workflows/DOC_-_Render_PDF.json'), 'utf8'));
const nd = (n) => W.nodes.find((x) => x.name === n);

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(54)} ${String(JSON.stringify(obtenu)).slice(0, 42)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};

/** Évalue une expression `={{ … }}` comme n8n, pour un $json donné. Une valeur
 *  fixe (sans « = ») est rendue telle quelle, comme n8n le fait. */
const expr = (v, json) => (String(v).startsWith('=')
  ? vm.runInNewContext(`(${v.replace(/^=\{\{/, '').replace(/\}\}$/, '')})`, { $json: json }, { timeout: 2000 })
  : v);

// Les en-têtes tels qu'un PDF de gotenberg.api les porte (noms en minuscules,
// comme n8n les rend) — relevés sur le service le 2026-09-10.
const REPONSE = { statusCode: 200, statusMessage: 'OK', headers: {
  'content-type': 'application/pdf',
  'content-disposition': 'attachment; filename="Darwin.pdf"',
  'x-render-template': 'document',
  'x-render-template-version': '1.0.0',
  'x-render-paragraphes': '4',
  'x-render-commentaires': '0',
  'x-render-caracteres-hebreu': '0',
  'x-render-duree-ms': '3475',
} };

console.log('\n1. le nœud HTTP garde les en-têtes');
const http = nd('gotenberg.api');
const rep = http.parameters.options.response.response;
T('fullResponse activé', true, rep.fullResponse);
T('format fichier conservé, binaire dans « data »', ['file', 'data'], [rep.responseFormat, rep.outputPropertyName]);
// ⚠️ neverError ferait partir un 4xx du service sur la sortie SUCCÈS : un JSON
// d'erreur serait renvoyé comme binaire « application/pdf ».
T('les erreurs HTTP restent des erreurs', false, 'neverError' in rep);
T('sortie d’erreur toujours branchée', 'continueErrorOutput', http.onError);
T('… vers Normalize Error', ['Normalize Error'],
  W.connections['gotenberg.api'].main[1].map((c) => c.node));

console.log('\n2. Respond PDF relaie ce que le service a émis');
const entrees = nd('Respond PDF').parameters.options.responseHeaders.entries;
const noms = entrees.map((e) => e.name);
for (const nom of ['Content-Type', 'Content-Disposition', 'X-Render-Template', 'X-Render-Template-Version',
  'X-Render-Paragraphes', 'X-Render-Commentaires', 'X-Render-Caracteres-Hebreu', 'X-Render-Duree-Ms']) {
  const e = entrees.find((x) => x.name === nom);
  T(`${nom} relayé`, REPONSE.headers[nom.toLowerCase()], e ? expr(e.value, REPONSE) : '(absent)');
}
T('aucun en-tête en double', noms.length, new Set(noms).size);
const ct = entrees.find((x) => x.name === 'Content-Type').value;
T('Content-Type : repli application/pdf si absent', 'application/pdf', expr(ct, { headers: {} }));
T('… et même sans objet headers', 'application/pdf', expr(ct, {}));
T('X-Render-* absent → vide, jamais « undefined »', '',
  expr(entrees.find((x) => x.name === 'X-Render-Template').value, {}));
// Un EPUB, demain, passera par le même nœud : son type doit survivre.
T('Content-Type suit le service (prêt pour epub)', 'application/epub+zip',
  expr(ct, { headers: { 'content-type': 'application/epub+zip' } }));

console.log('\n3. ⚠️ aucune expression tronquée par un `}}` interne');
const tronquees = entrees.filter((e) => {
  const corps = e.value.slice(1); const i = corps.indexOf('{{');
  return i >= 0 && corps.slice(i + 2, corps.lastIndexOf('}}')).includes('}}');
}).map((e) => e.name);
T('aucune', [], tronquees);

console.log('\n4. plus de « undefined_undefined.pdf »');
const V = (entree) => {
  const r = vm.runInNewContext(`(function(){${nd('Validate Input').parameters.jsCode}})()`, {
    $input: { first: () => ({ json: entree }) },
    $env: { GOTENBERG_API_URL: 'http://webs.local:3100' },
  }, { timeout: 3000 });
  return r[0].json;
};
const DOC = { template: 'document', data: { titre: 'x', paragraphes: [{ num: 1, texte: 't' }] } };
let r = V({ webhookUrl: 'http://n8n/webhook/render-pdf', body: DOC });
T('render-pdf sans filename : le service nommera', undefined, r.corps.filename);
T('… et la clé disparaît du corps envoyé', false, 'filename' in JSON.parse(JSON.stringify(r.corps)));
r = V({ webhookUrl: 'http://n8n/webhook/render-pdf', body: { ...DOC, filename: 'Cours.pdf' } });
T('filename fourni : relayé', 'Cours.pdf', r.corps.filename);
r = V({ webhookUrl: 'http://n8n/webhook/torah-pdf',
  body: { data: { massekhet: 'Pesachim', daf: '12b', paragraphes: [] } } });
T('alias torah : repli historique conservé', 'Pesachim_12b.pdf', r.corps.filename);
T('alias torah : gabarit par défaut conservé', 'bavli-visavis', r.corps.template);

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
process.exit(ko === 0 ? 0 : 1);
