#!/usr/bin/env node
/**
 * Le garde-fou HMAC de « RAG - Ingest » doit être ATTEIGNABLE.
 *
 *     node scripts/test/test_hmac_atteignable.js
 *
 * Le défaut
 * ---------
 * `Verify HMAC` porte une branche défensive :
 *
 *     if (!computed) return { hmac_valid: false, http_code: 500, … };
 *
 * Elle ne pouvait jamais s'exécuter. Le nœud Crypto n'avait pas d'`onError` :
 * quand le secret manque, `createHmac(undefined)` LÈVE et interrompt le
 * workflow avant ce nœud. Ni `Verify HMAC` ni `Respond HMAC Error` n'étaient
 * atteints, et l'appelant recevait **200 avec un corps vide**.
 *
 * Constaté en production le 2026-08-30 :
 *     TypeError at prepareSecretKey (node:internal/crypto/keys:913:11)
 *
 * On croyait être protégé : le code de secours existait, il était inatteignable.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/RAG_-_Ingest_(RFC-099).json'), 'utf8'));
const noeud = n => WF.nodes.find(x => x.name === n);

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(56)} ${JSON.stringify(obtenu)}`
    + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}
function verif(entree) {
  const items = [{ json: entree }];
  return vm.runInNewContext(`(function(){${noeud('Verify HMAC').parameters.jsCode}})()`, {
    $input: { all: () => items, first: () => items[0] },
    console: { log() {} }, JSON, Object, Array, String, Number, Math, RegExp,
  });
}

console.log('\n1. le nœud Crypto laisse passer son échec');
{
  // Sans onError, le nœud lève et TOUT le reste du workflow est sauté —
  // y compris le répondeur d'erreur. C'est la seule ligne qui rend le
  // garde-fou ci-dessous atteignable.
  controle('Compute HMAC · onError', noeud('Compute HMAC').onError, 'continueRegularOutput');
  controle('le secret vient de $env',
    /\$env\.N8N_RAG_WEBHOOK_SECRET/.test(String(noeud('Compute HMAC').parameters.secret)), true);
}

console.log('\n2. la branche défensive s’exécute vraiment');
{
  const sig = 'a'.repeat(64);
  // Le cas qui ne pouvait pas arriver : le nœud Crypto a échoué, pas de signature.
  const r = verif({ computed_signature: '', headers: { 'x-webhook-signature': `sha256=${sig}` }, body: {} });
  controle('secret absent → refus explicite', [r.hmac_valid, r.http_code], [false, 500]);
  controle('la cause est nommée', /N8N_RAG_WEBHOOK_SECRET/.test(r.error), true);

  controle('signature correcte toujours acceptée',
    verif({ computed_signature: sig, headers: { 'x-webhook-signature': `sha256=${sig}` }, body: {} }).hmac_valid, true);
  controle('en-tête absent → 401',
    verif({ computed_signature: sig, headers: {}, body: {} }).http_code, 401);
  controle('signature erronée → 401',
    verif({ computed_signature: sig, headers: { 'x-webhook-signature': 'sha256=' + 'b'.repeat(64) }, body: {} }).http_code, 401);
}

console.log('\n3. le chemin d’erreur mène bien à une réponse');
{
  const conn = WF.connections;
  const sorties = (conn['HMAC Valid?'] || {}).main || [];
  const faux = (sorties[1] || []).map(c => c.node);
  controle('la branche « invalide » va au répondeur', faux, ['Respond HMAC Error']);
  const r = noeud('Respond HMAC Error').parameters.options.responseCode;
  controle('le code HTTP suit la cause', r, '={{ $json.http_code || 401 }}');
}

console.log();
if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
console.log('✅ tous les contrôles passent');
