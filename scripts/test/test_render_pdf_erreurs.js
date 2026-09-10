#!/usr/bin/env node
/**
 * DOC - Render PDF : un refus de Validate Input garde son message et son code.
 *
 * n8n ne transmet d'une erreur de Code node que ce qui suit le DERNIER « : »,
 * suffixé de « [line N] ». Trois sorties mesurées le 2026-09-10 sur l'instance :
 *
 *   « payload invalide : un objet "data" est attendu »
 *       → « un objet "data" est attendu [line 24] »         → 502 au lieu de 400
 *   « … Templates disponibles : GET http://webs.local:3100/templates »
 *       → « 3100/templates [line 27] »                       → 400 par chance
 *   « payload invalide : format "docx" inconnu (formats : pdf, epub) »
 *       → « pdf, epub) [line 48] »                           → 502 au lieu de 400
 *
 * Le test reproduit cette troncature, vérifie d'abord qu'elle redonne EXACTEMENT
 * les trois sorties mesurées, puis fait passer chaque refus actuel par elle.
 *
 *   node scripts/test/test_render_pdf_erreurs.js
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
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(56)} ${String(JSON.stringify(obtenu)).slice(0, 40)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};

/** Ce que n8n fait d'une erreur levée dans un Code node (règle mesurée). */
const n8n = (message, ligne) => ({ error: {
  message: `${message.slice(message.lastIndexOf(':') + 1).trim()} [line ${ligne}]` } });

const code = (nom, entree, env) => vm.runInNewContext(
  `(function(){${nd(nom).parameters.jsCode}})()`,
  { $input: { first: () => ({ json: entree }) }, $env: env }, { timeout: 3000 });
const refus = (nom, entree, env = { GOTENBERG_API_URL: 'http://webs.local:3100' }) => {
  try { code(nom, entree, env); return null; } catch (e) { return e.message; }
};
const NE = (item) => code('Normalize Error', item, {})[0].json;

console.log('\n1. la troncature simulée redonne les trois sorties mesurées');
T('données absentes', 'un objet "data" est attendu [line 24]',
  n8n('payload invalide : un objet "data" est attendu', 24).error.message);
T('gabarit absent', '3100/templates [line 27]',
  n8n('champ requis manquant : "template" (obligatoire sur /webhook/render-pdf). Templates disponibles : GET http://webs.local:3100/templates', 27).error.message);
T('format inconnu', 'pdf, epub) [line 48]',
  n8n('payload invalide : format "docx" inconnu (formats : pdf, epub)', 48).error.message);

console.log('\n2. chaque refus actuel traverse n8n intact');
const GEN = 'http://n8n/webhook/render-pdf';
const cas = [
  ['données absentes', 'Validate Input', { webhookUrl: GEN, body: { template: 'document' } }, undefined, 'INVALID_DATA', 400, /un objet "data" est attendu/],
  ['gabarit absent', 'Validate Input', { webhookUrl: GEN, body: { data: {} } }, undefined, 'INVALID_DATA', 400, /pdf-templates/],
  ['format inconnu', 'Validate Input', { webhookUrl: GEN, body: { template: 'document', data: {}, format: 'docx' } }, undefined, 'UNSUPPORTED_OUTPUT', 400, /"docx" inconnu/],
  ['format piégé (deux-points)', 'Validate Input', { webhookUrl: GEN, body: { template: 'document', data: {}, format: 'a:b' } }, undefined, 'UNSUPPORTED_OUTPUT', 400, /inconnu/],
  ['configuration absente', 'Validate Input', { webhookUrl: GEN, body: { template: 'document', data: {} } }, {}, 'CONFIG_MISSING', 500, /GOTENBERG_API_URL/],
  ['catalogue sans configuration', 'Préparer catalogue', {}, {}, 'CONFIG_MISSING', 500, /GOTENBERG_API_URL/],
];
for (const [lib, noeud, entree, env, codeAttendu, statut, motif] of cas) {
  const message = refus(noeud, entree, env);
  T(`${lib} : refusé`, true, message !== null);
  if (message === null) continue;
  T(`… sans aucun « : »`, false, message.includes(':'));
  const r = NE(n8n(message, 12));
  T(`… ${codeAttendu} ${statut} après n8n`, [codeAttendu, statut], [r.error_code, r.http_status]);
  T(`… message complet, sans « [line N] »`, [true, false], [motif.test(r.error), /\[line \d+\]/.test(r.error)]);
}

console.log('\n3. un refus du service n’est pas touché');
const r = NE({ error: { message: '400 - "{\\"success\\":false,\\"error\\":\\"paragraphes[0].texte manquant\\",\\"error_code\\":\\"INVALID_DATA\\"}"' } });
T('INVALID_DATA 400, message du service', ['INVALID_DATA', 400, 'paragraphes[0].texte manquant'],
  [r.error_code, r.http_status, r.error]);

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
process.exit(ko === 0 ? 0 : 1);
