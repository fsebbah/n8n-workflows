#!/usr/bin/env node
/**
 * Les 3 crons GUILD doivent résoudre leur backend sans appelant.
 *
 *     node scripts/test/test_crons_guild.js
 *
 * Le défaut d'origine
 * -------------------
 * `GUILD - Credits Expire Cron` échouait chaque heure sur
 *
 *     Credential with ID "backend-service-token" does not exist for type "httpHeaderAuth"
 *
 * Deux causes empilées, la première masquant la seconde :
 *
 *  1. le credential n'existe pas — la base n8n contient six credentials, aucun
 *     nommé « Backend » ;
 *  2. l'URL était `{{ $json.backend_api_url }}`, convention BYOT (#386, #413)
 *     qui suppose un CORPS de requête. Sur les 20 workflows qui la suivent,
 *     17 sont déclenchés par webhook ; ces 3 crons, déclenchés par schedule,
 *     n'ont aucun appelant — `backend_api_url` valait toujours `undefined`.
 *
 * Corriger le credential seul aurait déplacé l'erreur vers `undefined/api/…`.
 *
 * Ce que le test verrouille
 * -------------------------
 *  - aucun credential n8n n'est requis (rien à créer à la main sur chaque
 *    instance — c'est ce qui a produit 9 identifiants fantômes, #416) ;
 *  - une variable d'environnement manquante fait échouer le cron AVEC SON NOM,
 *    au lieu d'appeler une URL malformée ;
 *  - l'URL finale se compose bien depuis l'environnement de l'instance.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const CRONS = [
  ['GUILD_-_Credits_Expire_Cron.json', 'Call Expire Endpoint', '/api/ecommerce/admin/guilds/cron/expire-batches'],
  ['GUILD_-_Credits_Renew_Cron.json', 'Call Renew Endpoint', '/api/ecommerce/admin/guilds/cron/renew-due'],
  ['GUILD_-_Server_Sync_Cron.json', 'Refresh Stale Guilds', '/api/discord/admin/guilds/cron/refresh-stale'],
];

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 60 ? obtenu.slice(0, 60) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(50)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

/** Exécute le Code node de garde avec l'environnement donné. */
function garde(src, env) {
  const ctx = { $env: env, $input: { first: () => ({ json: {} }) }, JSON, Object, Array, String, Error, RegExp };
  return vm.runInNewContext(`(function(){${src}})()`, ctx);
}

for (const [fichier, nomHttp, chemin] of CRONS) {
  const wf = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', fichier), 'utf8'));
  const noeud = n => wf.nodes.find(x => x.name === n);
  const http = noeud(nomHttp);
  console.log(`\n${fichier}`);

  // --- plus aucun credential n8n
  const creds = wf.nodes.flatMap(n => Object.keys(n.credentials || {}));
  controle('aucun credential n8n requis', creds, []);
  controle('jeton en en-tête explicite',
    http.parameters.headerParameters.parameters[0],
    { name: 'X-Service-Token', value: '={{ $env.BACKEND_SERVICE_TOKEN }}' });

  // --- le déclencheur passe par la garde
  const trigger = wf.nodes.find(n => n.type.includes('scheduleTrigger'));
  controle('déclencheur → Vérifier Configuration',
    wf.connections[trigger.name].main[0].map(t => t.node), ['Vérifier Configuration']);
  controle('garde → appel HTTP',
    wf.connections['Vérifier Configuration'].main[0].map(t => t.node), [nomHttp]);

  const src = noeud('Vérifier Configuration').parameters.jsCode;

  // --- configuration complète : l'URL se compose
  const ok = garde(src, { BACKEND_API_URL: 'https://api.exemple.test/', BACKEND_SERVICE_TOKEN: 'jeton' });
  const base = ok[0].json.backend_api_url;
  controle('barre oblique finale retirée', base, 'https://api.exemple.test');
  controle('URL finale', base + chemin, 'https://api.exemple.test' + chemin);
  controle('expression du nœud lit bien cette sortie',
    http.parameters.url, '={{ $json.backend_api_url }}' + chemin);

  // --- variable manquante : échec nommé, pas d'appel vers undefined
  for (const [libelle, env, attendu] of [
    ['URL absente', { BACKEND_SERVICE_TOKEN: 'j' }, 'BACKEND_API_URL'],
    ['jeton absent', { BACKEND_API_URL: 'https://x' }, 'BACKEND_SERVICE_TOKEN'],
    ['les deux absentes', {}, 'BACKEND_API_URL, BACKEND_SERVICE_TOKEN'],
    ['URL vide', { BACKEND_API_URL: '   ', BACKEND_SERVICE_TOKEN: 'j' }, 'BACKEND_API_URL'],
  ]) {
    let msg = null;
    try { garde(src, env); } catch (e) { msg = e.message; }
    controle(`${libelle} → échec nommé`, msg !== null && msg.includes(attendu), true);
  }
}

console.log();
if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
console.log('✅ tous les contrôles passent');
