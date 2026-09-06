#!/usr/bin/env node
/**
 * Contrôles des 3 workflows Recipes (n8n-workflows#478, azy.daily#334).
 *
 * Ils levaient sur `process is not defined` dans leur PREMIER nœud — donc
 * HTTP 200 avec un corps vide, indiscernable d'un succès (exéc. 864746).
 *
 *   node scripts/test/test_recipes_backend_url.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '../..');
const STEMS = ['Recipes_-_Shopping', 'Recipes_-_Timer', 'Recipes_-_Timer_Notify'];
const WF = {};
for (const s of STEMS) WF[s] = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', s + '.json'), 'utf8'));

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(54)} ${String(JSON.stringify(obtenu)).slice(0, 44)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};
const nu = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
const livre = (s) => JSON.stringify({ nodes: WF[s].nodes, connections: WF[s].connections });

/** Exécute Validate Input dans un bac à sable SANS process ni require. */
const V = (s, body) => {
  const code = WF[s].nodes.find((n) => n.name === 'Validate Input').parameters.jsCode;
  const ctx = {
    $input: { first: () => ({ json: { body } }) },
    $env: { API_BASE_URL: 'PIÈGE', DISCORD_BOT_TOKEN: 'PIÈGE' },
    JSON, String, Number, Array, Object, Date, Math, parseInt, parseFloat, isNaN, Error,
  };
  const r = vm.runInNewContext(`(function(){${code}})()`, ctx, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r.json || r;
};

console.log('\n1. le bac à sable : ni process, ni require');
for (const s of STEMS) {
  for (const n of WF[s].nodes.filter((x) => x.parameters && x.parameters.jsCode)) {
    const src = nu(n.parameters.jsCode);
    T(`${s.slice(0, 22)}/${n.name}`.slice(0, 52), null,
      /\bprocess\s*\./.test(src) ? 'process.' : /\brequire\s*\(/.test(src) ? 'require()' : null);
  }
}

console.log('\n2. l’ancien nom de champ a disparu');
for (const s of STEMS) T(s, false, livre(s).includes('api_base_url') && !livre(s).includes('backend_api_url'));
for (const s of STEMS) T(`${s} : plus d’URL codée en dur`, false, livre(s).includes('api.torah.solutions'));

console.log('\n3. l’adresse vient de l’appelant, et de lui seul');
const BASE = { user_id: 'u1', action: 'get', label: 'x', duration_minutes: 5, timer_id: 't1', name: 'n' };
for (const s of ['Recipes_-_Shopping', 'Recipes_-_Timer']) {
  T(`${s.slice(0, 20)} : corps → accepté`, 'https://back',
    V(s, { ...BASE, backend_api_url: 'https://back' }).backend_api_url);
  T(`${s.slice(0, 20)} : enveloppe context → acceptée`, 'https://ctx',
    V(s, { ...BASE, context: { backend_api_url: 'https://ctx' } }).backend_api_url);
  T(`${s.slice(0, 20)} : le corps l’emporte`, 'https://back',
    V(s, { ...BASE, backend_api_url: 'https://back', context: { backend_api_url: 'https://ctx' } }).backend_api_url);
  T(`${s.slice(0, 20)} : absente → refus`, false, V(s, BASE).valid);
  T(`${s.slice(0, 20)} : … et refus nommé`, true,
    /backend_api_url/.test(String(V(s, BASE).error?.message)));
  // ⚠️ le bac à sable du test EXPOSE $env : si un repli renaissait, ce contrôle rougirait.
  T(`${s.slice(0, 20)} : aucun repli sur $env`, false, V(s, BASE).valid);
  T(`${s.slice(0, 20)} : espaces retirés`, 'https://b',
    V(s, { ...BASE, backend_api_url: '  https://b  ' }).backend_api_url);
}

console.log('\n4. ⚠️ backend_api_url est l’ORIGINE : le /api doit être dans le chemin');
for (const s of ['Recipes_-_Shopping', 'Recipes_-_Timer']) {
  for (const n of WF[s].nodes) {
    const u = n.parameters?.url;
    if (typeof u !== 'string' || !u.includes('backend_api_url')) continue;
    const apres = u.slice(u.indexOf('}}') + 2);
    T(`${s.slice(0, 18)}/${n.name}`.slice(0, 52), true, apres.startsWith('/api/'));
  }
}

console.log('\n5. Timer Notify : le jeton aussi vient de l’appelant');
const N = { discord_user_id: 'd1', label: 'x' };
T('jeton fourni → accepté', 'JETON', V('Recipes_-_Timer_Notify', { ...N, discord_bot_token: 'JETON' }).discord_bot_token);
T('jeton absent → refus', false, V('Recipes_-_Timer_Notify', N).valid);
T('… malgré $env.DISCORD_BOT_TOKEN posé', false, V('Recipes_-_Timer_Notify', N).valid);
T('… refus nommé', true, /discord_bot_token/.test(String(V('Recipes_-_Timer_Notify', N).error?.message)));

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
process.exit(ko === 0 ? 0 : 1);
