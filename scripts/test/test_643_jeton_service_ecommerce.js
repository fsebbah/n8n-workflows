#!/usr/bin/env node
/**
 * Jeton de service sur les 12 outils e-commerce — azy.daily#643.
 *
 *     node scripts/test/test_643_jeton_service_ecommerce.js
 *
 * Pourquoi ce lot existe
 * ----------------------
 * api a mesuré que 3 routes e-commerce (cart / checkout / addresses) n'ont AUCUNE
 * authentification, et demandé si nos appels envoyaient déjà un jeton. Mesuré :
 * **13 appels, tous à nu** — `X-Project-ID` et `Content-Type`, rien d'autre. Et le
 * jeton n'arrivait pas non plus par le corps : absence totale dans la chaîne.
 *
 * ⚠️ CE QUE CE LOT CORRIGE D'ABORD, ET POURQUOI C'EST L'ESSENTIEL
 * Les 12 nœuds HTTP portaient `onError: continueErrorOutput` avec leur sortie
 * d'erreur BRANCHÉE NULLE PART. Un échec interrompait le workflow avant tout
 * `respondToWebhook` → n8n fermait la requête avec **200 et un corps vide** (#467).
 *
 * Donc le jour où api exige un jeton, un **401 serait ressorti en « 200 sans rien »**,
 * et l'essai conjoint « est-ce que ça passe ? » aurait répondu **OUI sur un refus**.
 * Il fallait rendre l'échec lisible AVANT de tester, pas après.
 *
 * Les trois décisions de conception que ce test verrouille
 * -------------------------------------------------------
 *  1. le jeton TRANSITE, il n'est pas exigé — l'imposer casserait les 12 avant
 *     qu'api ne l'exige ;
 *  2. AUCUN repli sur `$env` — trois workflows du parc font
 *     `body.backend_service_token || $env.BACKEND_SERVICE_TOKEN`, et ce repli ferait
 *     **mentir l'essai**, qui réussirait même si rien ne traverse la chaîne ;
 *  3. la réponse porte `jeton_transmis` — sans ce témoin, un 401 ne distinguerait pas
 *     « MCP ne l'a pas relayé » de « api l'a refusé ».
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DOSSIER = path.resolve(__dirname, '..', '..', 'workflows');
const CIBLES = ['cart-add', 'cart-apply-coupon', 'cart-checkout', 'cart-clear', 'cart-get',
  'cart-remove', 'cart-remove-coupon', 'cart-update', 'profile-address-add',
  'profile-address-remove', 'profile-address-set-default', 'profile-address-update'];

let ok = 0;
const echecs = [];
const verifier = (intitule, obtenu, attendu) => {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) { ok += 1; console.log(`  ✓ ${intitule}`); }
  else { echecs.push(intitule); console.log(`  ✗ ${intitule}\n      obtenu  : ${a}\n      attendu : ${b}`); }
};

/** Les 12 workflows, indexés par chemin de webhook. */
const parChemin = new Map();
for (const f of fs.readdirSync(DOSSIER).filter((n) => n.endsWith('.json'))) {
  let wf;
  try { wf = JSON.parse(fs.readFileSync(path.join(DOSSIER, f), 'utf8')); } catch (e) { continue; }
  const wh = (wf.nodes || []).find((n) => n.type === 'n8n-nodes-base.webhook');
  if (!wh) continue;
  const p = (wh.parameters || {}).path;
  if (CIBLES.includes(p)) parChemin.set(p, { fichier: f, wf });
}

const noeud = (wf, nom) => wf.nodes.find((n) => n.name === nom);
const noeudHttp = (wf) => wf.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest');
const noeudFormat = (wf) => wf.nodes.find((n) =>
  n.name === 'Format Success Response' || n.name === 'Format Cart Response');

/** Exécute un Code node. */
function exec(src, item, prev = {}) {
  return vm.runInNewContext(`(function(){\n${src}\n})()`, {
    $input: { first: () => ({ json: item }), all: () => [{ json: item }] },
    $: (n) => ({ first: () => ({ json: prev[n] }), item: { json: prev[n] } }),
    JSON, Number, Array, Object, String, parseInt, console,
  }, { timeout: 5000 });
}
/** Résout l'expression `responseCode` d'un respondToWebhook. */
function codeHttp(wf, json) {
  const v = (noeud(wf, 'Respond Success').parameters.options || {}).responseCode;
  if (typeof v !== 'string' || !v.startsWith('=')) return v;
  return vm.runInNewContext(`(${v.match(/^=\{\{([\s\S]*)\}\}$/)[1]})`, { $json: json, Number });
}

const reponse = (statut, corps) => ({ statusCode: statut, headers: {}, body: corps });
const panne = (msg) => ({ error: { message: msg } });

(async () => {
  console.log('\nJeton de service — 12 outils e-commerce (azy.daily#643)\n');

  console.log('Les 12 sont là, et traités à l\'identique');
  {
    verifier('12 workflows localisés', parChemin.size, 12);
    // Le défaut de #488 était une ASYMÉTRIE entre chemins, invisible depuis l'aval.
    // Ici le risque est le même : un seul des 12 oublié resterait à nu sans qu'on le voie.
    const entetes = CIBLES.map((c) => {
      const hp = noeudHttp(parChemin.get(c).wf).parameters.headerParameters.parameters;
      return (hp.find((x) => x.name === 'X-Service-Token') || {}).value;
    });
    verifier('les 12 envoient X-Service-Token, avec la MÊME expression',
      [...new Set(entetes)], ['={{ $json.data.backend_service_token }}']);
    const reglages = CIBLES.map((c) => {
      const n = noeudHttp(parChemin.get(c).wf);
      const r = ((n.parameters.options || {}).response || {}).response || {};
      return `${n.onError}|${r.fullResponse}|${r.neverError}`;
    });
    verifier('les 12 ont le MÊME réglage d\'erreur',
      [...new Set(reglages)], ['continueRegularOutput|true|true']);
  }

  console.log('\n⚠️ AUCUN repli sur $env — sinon l\'essai mentirait');
  {
    // Trois workflows du parc font `body.x || $env.BACKEND_SERVICE_TOKEN`. Ce repli
    // ferait réussir l'essai même si MCP ne relaie rien — donc il est interdit ici.
    // ⚠️ Juger le CODE, pas les commentaires. Ce contrôle a rougi à sa première
    // exécution sur MON PROPRE commentaire, celui qui interdit le repli : il cite
    // `$env.BACKEND_SERVICE_TOKEN` pour l'écarter. Même faux positif que le `let `
    // trouvé dans « complet pour » en analysant le catalogue. Un détecteur qui lit
    // la prose trouve ce que la prose décrit.
    const sansCommentaires = (wf) => wf.nodes
      .filter((n) => n.type === 'n8n-nodes-base.code')
      .map((n) => n.parameters.jsCode.split('\n').map((l) => l.split('//')[0]).join('\n'))
      .join('\n')
      + JSON.stringify(wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.code'));
    const fautifs = CIBLES.filter((c) =>
      /\$env\.[A-Z_]*(SERVICE_TOKEN|TOKEN)/.test(sansCommentaires(parChemin.get(c).wf)));
    verifier('aucun des 12 ne lit un jeton dans $env', fautifs, []);
  }

  console.log('\nLe jeton TRANSITE, il n\'est pas exigé');
  {
    const vi = noeud(parChemin.get('cart-add').wf, 'Validate Input').parameters.jsCode;
    const base = {
      body: { discord_user_id: 'u1', project_id: 'p1',
              items: [{ product_id: 'x', product_snapshot: { name: 'N', price_cents: 1, currency: 'EUR' }, quantity: 1 }] },
    };
    const avec = exec(vi, { ...base, body: { ...base.body, backend_service_token: 'jeton-abc' } });
    verifier('présent → relayé tel quel', avec.data.backend_service_token, 'jeton-abc');
    const sans = exec(vi, base);
    verifier('absent → null, et la validation PASSE quand même',
      [sans.error, sans.data.backend_service_token], [false, null]);
  }

  console.log('\n⚠️ LE CAS DE L\'ESSAI : un 401 est LISIBLE, et dit si on a transmis');
  {
    const wf = parChemin.get('cart-add').wf;
    const fc = noeudFormat(wf).parameters.jsCode;
    const prev = { 'Validate Input': { data: { items: [1], backend_service_token: 'jeton-abc' } } };

    const r = exec(fc, reponse(401, { detail: 'service token required' }), prev);
    verifier('échec explicite', r.success, false);
    verifier('code nommé pour un refus de jeton', r.error.code, 'SERVICE_TOKEN_REJECTED');
    verifier('statut réel conservé', r.error.http_status, 401);
    verifier('message d\'api relayé', r.error.message, 'service token required');
    verifier('témoin : nous AVONS transmis', r.jeton_transmis, true);
    verifier('le code HTTP rendu suit le corps', codeHttp(wf, r), 401);

    // Le cas symétrique : MCP n'a rien relayé. C'est ce que le témoin distingue.
    const sansJeton = { 'Validate Input': { data: { items: [1], backend_service_token: null } } };
    const r2 = exec(fc, reponse(401, { detail: 'service token required' }), sansJeton);
    verifier('témoin : nous n\'avons RIEN transmis', r2.jeton_transmis, false);
    verifier('403 traité comme 401', exec(fc, reponse(403, {}), prev).error.code, 'SERVICE_TOKEN_REJECTED');
  }

  console.log('\nLes autres échecs restent distincts d\'un refus de jeton');
  {
    const fc = noeudFormat(parChemin.get('cart-add').wf).parameters.jsCode;
    const prev = { 'Validate Input': { data: { items: [1], backend_service_token: 'j' } } };
    const r500 = exec(fc, reponse(500, { detail: 'boom' }), prev);
    verifier('500 → API_ERROR, pas SERVICE_TOKEN_REJECTED', r500.error.code, 'API_ERROR');
    verifier('500 conservé', r500.error.http_status, 500);
    // Sans statusCode : c'est le cas que `|| 200` faisait basculer en succès.
    const tr = exec(fc, panne('ECONNREFUSED api.local:8000'), prev);
    verifier('panne de transport → 502', tr.error.http_status, 502);
    const enferme = exec(fc, panne('401 - "{\\"detail\\":\\"nope\\"}"'), prev);
    verifier('statut extrait du message', enferme.error.http_status, 401);
    verifier('…et reconnu comme refus de jeton', enferme.error.code, 'SERVICE_TOKEN_REJECTED');
    verifier('corps désenchâssé du message', enferme.error.message, 'nope');
  }

  console.log('\nLe chemin nominal n\'a pas changé');
  {
    const wf = parChemin.get('cart-add').wf;
    const fc = noeudFormat(wf).parameters.jsCode;
    const prev = { 'Validate Input': { data: { items: [1, 2], backend_service_token: 'j' } } };
    const r = exec(fc, reponse(200, { cart: { total_cents: 1250, item_count: 2 } }), prev);
    verifier('succès', r.success, true);
    verifier('le corps de l\'API est bien lu', r.cart, { total_cents: 1250, item_count: 2 });
    verifier('200 rendu', codeHttp(wf, r), 200);
  }

  console.log('\nL\'invariant de #467 : plus aucun chemin ne finit en 200 vide');
  {
    const sansSortie = [];
    for (const c of CIBLES) {
      const { wf } = parChemin.get(c);
      const http = noeudHttp(wf);
      // Avec continueRegularOutput, l'erreur repart sur la sortie 0 — qui est câblée
      // vers le nœud de format. Il n'y a donc plus de branche morte.
      const sortantes = ((wf.connections[http.name] || {}).main || [])
        .map((s) => (s || []).map((x) => x.node));
      if (!sortantes[0] || sortantes[0].length === 0) sansSortie.push(c);
    }
    verifier('les 12 nœuds HTTP ont leur sortie 0 câblée', sansSortie, []);
    const mauvais = CIBLES.filter((c) => noeudHttp(parChemin.get(c).wf).onError === 'continueErrorOutput');
    verifier('aucun ne garde continueErrorOutput (branche morte)', mauvais, []);
  }

  console.log(`\nRésultat : ${ok} ok, ${echecs.length} échec(s)\n`);
  if (echecs.length) { echecs.forEach((e) => console.log(`  - ${e}`)); process.exit(1); }
})();
