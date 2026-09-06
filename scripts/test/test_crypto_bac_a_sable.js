#!/usr/bin/env node
/**
 * Contrôles des 11 workflows repris pour n8n-workflows#476.
 *
 * Chaque nœud Code est exécuté dans un bac à sable SANS `require`, `Buffer`
 * ni `process` — celui de n8n. C'est ce bac à sable qui faisait lever
 * `Module 'crypto' is disallowed` (exécution 855886) et qui empêchait ces
 * onze workflows d'émettre le moindre rappel.
 *
 *   node scripts/test/test_crypto_bac_a_sable.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '../..');
const STEMS = [
  'Books_Commentary_Worker', 'Books_Translation_Worker', 'Document_Translate_Worker',
  'LLM_-_URL_Extractor', 'MCP_-_Documents_Process', 'MCP_-_Image_Generator',
  'MCP_-_Lichess_Auth_Start', 'MCP_-_Lichess_Auth_Callback', 'MCP_-_Table_Extractor',
  'MCP_-_Tools_Enricher', 'MCP_Veo_Video',
];
const WF = {};
for (const s of STEMS) WF[s] = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', s + '.json'), 'utf8'));

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(58)} ${String(JSON.stringify(obtenu)).slice(0, 46)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};

/** Retire commentaires et chaînes : ne restent que les références effectives. */
const nu = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
  .replace(/`(?:[^`\\]|\\.)*`/g, '``');

const codes = (s) => WF[s].nodes.filter((n) => n.parameters && n.parameters.jsCode);
const cryptos = (s) => WF[s].nodes.filter((n) => n.type.endsWith('.crypto'));
const aval = (s, nom) => (WF[s].connections[nom]?.main || []).flat().map((c) => c.node);

// ══════════════════════════════════════════════════════════
console.log('\n1. le bac à sable n8n : ni require, ni Buffer, ni process');
for (const s of STEMS) {
  for (const n of codes(s)) {
    const src = nu(n.parameters.jsCode);
    let souci = null;
    if (/\brequire\s*\(/.test(src)) souci = 'require()';
    else if (/\bBuffer\s*[.(]/.test(src)) souci = 'Buffer';
    else if (/\bprocess\s*\./.test(src)) souci = 'process.';
    else if (/\b(?:btoa|atob)\s*\(/.test(src)) souci = 'btoa/atob';
    else { try { new vm.Script(`(function(){${n.parameters.jsCode}})`); } catch (e) { souci = e.message.slice(0, 40); } }
    T(`${s.slice(0, 24)}/${n.name}`.slice(0, 56), null, souci);
  }
}

console.log('\n2. le repli « default-secret » a disparu');
// On inspecte ce qu'on LIVRE (nœuds + câblage), pas `activeVersion`, qui est la
// photographie de la version encore déployée et porte donc légitimement l'ancien
// repli. Le script de réimport l'écarte à l'écriture.
const livre = (s) => JSON.stringify({ nodes: WF[s].nodes, connections: WF[s].connections });
for (const s of STEMS) T(s, false, livre(s).includes('default-secret'));

console.log('\n3. la chaîne signée EST la chaîne envoyée');
for (const s of STEMS) {
  for (const c of cryptos(s).filter((x) => x.parameters.action === 'hmac')) {
    T(`${s.slice(0, 22)}/${c.name} signe corps_json`.slice(0, 56),
      '={{ $json.corps_json }}', c.parameters.value);
    T(`${s.slice(0, 22)}/${c.name} secret sans repli`.slice(0, 56),
      '={{ $env.N8N_WEBHOOK_SECRET }}', c.parameters.secret);
    for (const nom of aval(s, c.name)) {
      const e = WF[s].nodes.find((n) => n.name === nom);
      T(`${s.slice(0, 22)}/${nom} envoie corps_json`.slice(0, 56),
        '={{ $json.corps_json }}', e.parameters.jsonBody);
    }
  }
}

console.log('\n4. tout nœud émettant corps_json est suivi d’un Crypto');
for (const s of STEMS) {
  for (const n of codes(s)) {
    if (!/corps_json\s*[:,}]/.test(nu(n.parameters.jsCode))) continue;
    const suite = aval(s, n.name).map((x) => WF[s].nodes.find((y) => y.name === x));
    T(`${s.slice(0, 26)}/${n.name}`.slice(0, 56), true,
      suite.some((x) => x && x.type.endsWith('.crypto')));
  }
}

// ══════════════════════════════════════════════════════════
console.log('\n5. base64url en JS pur : identique à Buffer, et réversible');
const extraire = (s, nom) => WF[s].nodes.find((n) => n.name === nom).parameters.jsCode;
// Les aides base64url sont EXTRAITES du workflow et évaluées telles quelles :
// on éprouve le code qui partira en production, pas une copie.
// ⚠️ `const` dans un vm crée une liaison lexicale, jamais une propriété du
// contexte : il faut renvoyer les fonctions explicitement.
const aides = (s, nom) => {
  const bloc = extraire(s, nom).split('const body =')[0];
  return vm.runInNewContext(`${bloc}\n({ b64urlEncode, b64urlDecode })`,
    { String, Array, Object, JSON, Math, Date, Error, parseInt, isNaN }, { timeout: 5000 });
};
const { b64urlEncode } = aides('MCP_-_Lichess_Auth_Start', 'Validate & Prepare');
const { b64urlDecode } = aides('MCP_-_Lichess_Auth_Callback', 'Validate Callback');

const CAS = ['a', 'ab', 'abc', 'abcd', '', 'héllo çà €uro', '日本語',
  JSON.stringify({ tenant_id: 't1', user_id: 'u1', ts: 1757000000000, nonce: 'k3j2h1' })];
for (const c of CAS) {
  T(`encode ≡ Buffer  ${JSON.stringify(c.slice(0, 18))}`.slice(0, 56),
    Buffer.from(c, 'utf8').toString('base64url'), b64urlEncode(c));
  T(`aller-retour     ${JSON.stringify(c.slice(0, 18))}`.slice(0, 56), c, b64urlDecode(b64urlEncode(c)));
}
T('décode un state produit par Buffer', { a: 1 },
  JSON.parse(b64urlDecode(Buffer.from(JSON.stringify({ a: 1 })).toString('base64url'))));

console.log('\n6. Lichess : le PKCE est engendré par n8n, plus par crypto');
const start = WF['MCP_-_Lichess_Auth_Start'];
const gen = start.nodes.find((n) => n.name === 'Generate Verifier');
T('code_verifier engendré par le nœud Crypto', 'generate', gen?.parameters.action);
T('… en hexadécimal (jeu de caractères PKCE valide)', 'hex', gen?.parameters.encodingType);
T('… 32 octets → 64 caractères, dans [43,128]', true,
  gen?.parameters.stringLength * 2 >= 43 && gen?.parameters.stringLength * 2 <= 128);
const hash = start.nodes.find((n) => n.name === 'Hash Challenge');
T('challenge = SHA256 du verifier', ['SHA256', '={{ $json.code_verifier }}', 'base64'],
  [hash?.parameters.type, hash?.parameters.value, hash?.parameters.encoding]);
T('câblage Valid? → Generate → Hash → Finalise → Store', true,
  aval('MCP_-_Lichess_Auth_Start', 'Valid?')[0] === 'Generate Verifier'
  && aval('MCP_-_Lichess_Auth_Start', 'Generate Verifier')[0] === 'Hash Challenge'
  && aval('MCP_-_Lichess_Auth_Start', 'Hash Challenge')[0] === 'Finalise PKCE'
  && aval('MCP_-_Lichess_Auth_Start', 'Finalise PKCE')[0] === 'Store Pending Auth');

// la conversion base64 → base64url du challenge
const ctxF = { $input: { first: () => ({ json: { code_challenge_b64: 'a+b/c==' } }) }, String, Object };
const f = vm.runInNewContext(`(function(){${extraire('MCP_-_Lichess_Auth_Start', 'Finalise PKCE')}})()`, ctxF);
T('challenge converti en base64url', 'a-b_c', f[0].json.code_challenge);

console.log('\n7. le job_id est engendré sans randomUUID');
for (const s of STEMS) {
  for (const n of codes(s)) {
    if (!/randomUUID|nouvelId/.test(n.parameters.jsCode)) continue;
    T(`${s.slice(0, 30)}/${n.name}`.slice(0, 56), false, /crypto\.randomUUID/.test(nu(n.parameters.jsCode)));
  }
}

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
process.exit(ko === 0 ? 0 : 1);
