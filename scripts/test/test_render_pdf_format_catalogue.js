#!/usr/bin/env node
/**
 * DOC - Render PDF : aiguillage `format` et webhook de catalogue (azy.daily#355).
 *
 * Le service sait produire de l'EPUB (`POST /render/epub`) et publie son
 * catalogue (`GET /templates`) — mesuré le 2026-09-10 —, mais n8n n'appelait que
 * `/render/pdf` et n'exposait aucune liste. L'api a donné son feu vert pour
 * relayer les deux.
 *
 * Ce que le test protège :
 *   - un format inconnu est REFUSÉ, jamais ramené à « pdf » (desktop, point c) ;
 *   - le refus porte le code du service, UNSUPPORTED_OUTPUT, quel que soit le
 *     maillon qui refuse ;
 *   - le catalogue est relayé VERBATIM, statut compris.
 *
 *   node scripts/test/test_render_pdf_format_catalogue.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const W = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../workflows/DOC_-_Render_PDF.json'), 'utf8'));
const nd = (n) => W.nodes.find((x) => x.name === n);
const aval = (n) => (W.connections[n]?.main || []).map((l) => l.map((c) => c.node));

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(56)} ${String(JSON.stringify(obtenu)).slice(0, 40)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};

const ENV = { GOTENBERG_API_URL: 'http://webs.local:3100/' };
const code = (nom, entree, env = ENV) => vm.runInNewContext(
  `(function(){${nd(nom).parameters.jsCode}})()`,
  { $input: { first: () => ({ json: entree }) }, $env: env }, { timeout: 3000 });
const lance = (nom, entree, env) => {
  try { return { ok: true, sortie: code(nom, entree, env)[0].json }; } catch (e) { return { ok: false, erreur: e.message }; }
};
const expr = (v, json) => (String(v).startsWith('=')
  ? vm.runInNewContext(`(${v.replace(/^=\{\{/, '').replace(/\}\}$/, '')})`, { $json: json }, { timeout: 2000 })
  : v);

const GEN = 'http://n8n/webhook/render-pdf';
const DOC = { template: 'document', data: { titre: 'x', paragraphes: [{ num: 1, texte: 't' }] } };

console.log('\n1. l’aiguillage `format`');
let r = lance('Validate Input', { webhookUrl: GEN, body: DOC });
T('sans format → /render/pdf', 'http://webs.local:3100/render/pdf', r.sortie.url);
r = lance('Validate Input', { webhookUrl: GEN, body: { ...DOC, format: 'epub' } });
T('format epub → /render/epub', 'http://webs.local:3100/render/epub', r.sortie.url);
r = lance('Validate Input', { webhookUrl: GEN, body: { ...DOC, format: ' EPUB ' } });
T('casse et espaces tolérés', 'http://webs.local:3100/render/epub', r.sortie.url);
r = lance('Validate Input', { webhookUrl: GEN, body: { ...DOC, format: 'docx' } });
T('⚠️ format inconnu → refusé, pas de repli sur pdf', false, r.ok);
T('… le message nomme le format et la liste', true, /"docx" inconnu \(formats : pdf, epub\)/.test(r.erreur));
r = lance('Validate Input', { webhookUrl: 'http://n8n/webhook/torah-pdf',
  body: { format: 'epub', data: { massekhet: 'Pesachim', daf: '12b', paragraphes: [] } } });
T('alias torah : l’extension suit le format', 'Pesachim_12b.epub', r.sortie.corps.filename);
r = lance('Validate Input', { webhookUrl: 'http://n8n/webhook/torah-pdf',
  body: { data: { massekhet: 'Pesachim', daf: '12b', paragraphes: [] } } });
T('alias torah sans format : inchangé', 'Pesachim_12b.pdf', r.sortie.corps.filename);
T('le format n’est pas envoyé au service (il est dans l’URL)', false, 'format' in r.sortie.corps);

console.log('\n2. un seul code de refus, quel que soit le maillon');
const NE = (item) => code('Normalize Error', item)[0].json;
let e = NE({ error: { message: 'Error: payload invalide : format "docx" inconnu (formats : pdf, epub)' } });
T('refus n8n → UNSUPPORTED_OUTPUT 400', ['UNSUPPORTED_OUTPUT', 400], [e.error_code, e.http_status]);
// forme exacte d'un refus du service, telle que n8n l'emballe
e = NE({ error: { message: '400 - "{\\"success\\":false,\\"error\\":\\"template \'transcription\' ne produit pas de epub (sorties déclarées : pdf)\\",\\"error_code\\":\\"UNSUPPORTED_OUTPUT\\"}"' } });
T('refus du service → UNSUPPORTED_OUTPUT 400, relayé', ['UNSUPPORTED_OUTPUT', 400], [e.error_code, e.http_status]);
e = NE({ error: { message: 'Error: champ requis manquant : "template" (obligatoire sur /webhook/render-pdf).' } });
T('régression : champ requis → INVALID_DATA 400', ['INVALID_DATA', 400], [e.error_code, e.http_status]);
e = NE({ error: { message: "Error: GOTENBERG_API_URL absent ou invalide dans l'environnement n8n." } });
T('régression : configuration → CONFIG_MISSING 500', ['CONFIG_MISSING', 500], [e.error_code, e.http_status]);

console.log('\n3. le catalogue');
const wh = nd('Webhook (catalogue)');
T('GET /webhook/pdf-templates', ['GET', 'pdf-templates', 'responseNode'],
  [wh.parameters.httpMethod, wh.parameters.path, wh.parameters.responseMode]);
T('identifiant de webhook propre', true,
  !wh.webhookId || wh.webhookId !== nd('Webhook (générique)').webhookId);
T('chaîne : webhook → préparer → service → réponse',
  [[['Préparer catalogue']], [['Catalogue gotenberg.api'], ['Normalize Error']], [['Respond Catalogue'], ['Normalize Error']]],
  [aval('Webhook (catalogue)'), aval('Préparer catalogue'), aval('Catalogue gotenberg.api')]);
r = lance('Préparer catalogue', {});
T('URL du service, sans double barre', 'http://webs.local:3100/templates', r.sortie.url);
r = lance('Préparer catalogue', {}, {});
T('configuration absente → erreur explicite', [false, true], [r.ok, /GOTENBERG_API_URL/.test(r.erreur || '')]);
const opt = nd('Catalogue gotenberg.api').parameters;
T('appel GET, statut et corps relayés (fullResponse+neverError)', ['GET', true, true],
  [opt.method, opt.options.response.response.fullResponse, opt.options.response.response.neverError]);
T('une panne de transport part en erreur', 'continueErrorOutput', nd('Catalogue gotenberg.api').onError);
const rc = nd('Respond Catalogue').parameters;
const LISTE = { templates: [{ nom: 'document', version: '1.0.0', sorties: ['epub', 'pdf'] }] };
T('corps relayé verbatim', JSON.stringify(LISTE), expr(rc.responseBody, { statusCode: 200, body: LISTE }));
T('statut relayé verbatim (ex. 503)', 503, expr(rc.options.responseCode, { statusCode: 503, body: {} }));
T('sans statut → 502', 502, expr(rc.options.responseCode, {}));

console.log('\n4. ⚠️ aucune expression tronquée par un `}}` interne');
const expressions = [];
const creuse = (v, ou) => {
  if (typeof v === 'string') { if (v.startsWith('=')) expressions.push([ou, v]); }
  else if (Array.isArray(v)) v.forEach((x, i) => creuse(x, `${ou}[${i}]`));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => creuse(x, `${ou}.${k}`));
};
for (const n of W.nodes) creuse(n.parameters, n.name);
T(`${expressions.length} expressions, aucune tronquée`, [], expressions.filter(([, v]) => {
  const corps = v.slice(1); const i = corps.indexOf('{{');
  return i >= 0 && corps.slice(i + 2, corps.lastIndexOf('}}')).includes('}}');
}).map(([ou]) => ou));

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
process.exit(ko === 0 ? 0 : 1);
