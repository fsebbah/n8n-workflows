#!/usr/bin/env node
/**
 * Plus aucun chemin ne doit finir en « 200 avec un corps vide » — n8n-workflows#467,
 * et la parade de #442 appliquée aux deux webhooks à plus fort trafic.
 *
 *     node scripts/test/test_467_restitution_stripe_guild.js
 *
 * Pourquoi ces deux-là d'abord
 * ----------------------------
 * Mesuré sur 37 relevés quotidiens (2026-10-01 → 11-06), hors Torah ce sont les deux
 * seuls webhooks à porter du trafic réel : `stripe-register-project` 105 exécutions,
 * `server-sync` 89. Les 198 autres outils exposés sont à zéro.
 *
 * Le mécanisme de #467
 * --------------------
 * Un webhook en `responseMode: responseNode` DOIT atteindre un `respondToWebhook`. Si
 * un nœud lève avant, n8n ferme la requête avec **200 et rien dedans** — indiscernable
 * d'un succès sans résultat, et sans trace côté appelant.
 *
 * ⚠️ `onError` seul ne suffit pas : il transforme une interruption en objet d'erreur
 * que le nœud suivant lira comme une réponse. Il faut AUSSI lire le statut réel.
 *
 * Deux défauts ACTIFS trouvés en appliquant la parade
 * ---------------------------------------------------
 * 1 · `Call API Admin` (Stripe) n'avait pas `fullResponse`. Le nœud émettait donc le
 *     corps directement, et `apiResult.statusCode` valait toujours `undefined` :
 *     le test `if (apiResult.statusCode && …)` ne pouvait JAMAIS être vrai. Pire,
 *     `apiResult.body` étant `undefined`, la réponse renvoyait `project_id` et
 *     `display_name` **de la requête** — nous recopiions la demande en la présentant
 *     comme la réponse de l'API, et `environment` était toujours `undefined`.
 *
 * 2 · `Respond Success` (GUILD) calculait `success: $json.ok || $json.synced`. Si le
 *     backend ne rendait ni l'un ni l'autre, le champ valait `undefined` et
 *     **JSON.stringify le supprimait**. L'appelant recevait `{ guild_id, synced: true }`
 *     — sans `success`, avec un `synced: true` écrit en dur qui affirmait la réussite
 *     quoi qu'il arrive.
 *
 * Les deux étaient invisibles : la réponse avait la forme attendue.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const charger = (f) => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const STRIPE = charger('Stripe_-_Register_Project.json');
const GUILD = charger('GUILD_-_Server_Sync.json');
const nd = (wf, nom) => wf.nodes.find((n) => n.name === nom) || { parameters: {} };

let ok = 0;
const echecs = [];
const verifier = (intitule, obtenu, attendu) => {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) { ok += 1; console.log(`  ✓ ${intitule}`); }
  else { echecs.push(intitule); console.log(`  ✗ ${intitule}\n      obtenu  : ${a}\n      attendu : ${b}`); }
};

/** Exécute un Code node. `prev` fournit les sorties des nœuds référencés. */
function execCode(wf, nom, item, prev = {}) {
  const src = nd(wf, nom).parameters.jsCode;
  if (typeof src !== 'string') throw new Error(`nœud ${nom} absent`);
  const r = vm.runInNewContext(`(function(){\n${src}\n})()`, {
    $input: { first: () => ({ json: item }), all: () => [{ json: item }] },
    $: (n) => ({ first: () => ({ json: prev[n] }), item: { json: prev[n] } }),
    JSON, Date, Number, Array, Object, String, parseInt, console,
  }, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : (r.json !== undefined ? r.json : r);
}

/** Résout une expression n8n de `responseCode` sur un item donné. */
function codeHttp(wf, nom, json, prev = {}) {
  const v = (nd(wf, nom).parameters.options || {}).responseCode;
  if (typeof v !== 'string' || !v.startsWith('=')) return v;
  const expr = v.match(/^=\{\{([\s\S]*)\}\}$/)[1];
  return vm.runInNewContext(`(${expr})`, { $json: json, $: (n) => ({ json: prev[n], item: { json: prev[n] } }), Number });
}
/** Résout l'expression `responseBody`, qui est ce que l'appelant reçoit VRAIMENT. */
function corpsRendu(wf, nom, json, prev = {}) {
  const v = nd(wf, nom).parameters.responseBody;
  const expr = v.match(/^=\{\{([\s\S]*)\}\}$/)[1];
  return JSON.parse(vm.runInNewContext(`(${expr})`,
    { $json: json, $: (n) => ({ json: prev[n], item: { json: prev[n] } }), JSON, Number, Array }));
}

/** Sortie d'un nœud HTTP en fullResponse + neverError. */
const reponseHttp = (statut, corps) => ({ statusCode: statut, headers: {}, body: corps });
/** Sortie d'un nœud HTTP tombé en transport, avec onError: continueRegularOutput. */
const panneTransport = (msg) => ({ error: { message: msg } });

const ENTREE_STRIPE = {
  project_id: 'proj-1', display_name: 'Demandé par le client',
  stripe_key: 'sk', webhook_secret: 'wh', tenant_id: 'g-1',
  backend_api_url: 'http://api.local:8000', backend_service_token: 'jeton',
};
const VALIDE_GUILD = { valid: true, guild_id: 'g-1', bot_id: 'b-1' };

(async () => {
  console.log('\n#467 — plus aucun 200 vide sur les deux webhooks à fort trafic\n');

  // ═══════════════════════════ STRIPE ═══════════════════════════
  console.log('Stripe — le nœud HTTP ne peut plus interrompre le workflow');
  {
    const n = nd(STRIPE, 'Call API Admin');
    const opt = ((n.parameters.options || {}).response || {}).response || {};
    verifier('fullResponse activé', opt.fullResponse, true);
    verifier('neverError activé — un 4xx ne lève plus', opt.neverError, true);
    verifier('onError pour le transport', n.onError, 'continueRegularOutput');
    verifier('un timeout est posé', n.parameters.options.timeout, 20000);
    verifier('une seule relance', [n.retryOnFail, n.maxTries], [true, 2]);
  }

  console.log('\n⚠️ Stripe — LE DÉFAUT ACTIF : la réponse recopiait la requête');
  {
    // L'API rend un project_id et un display_name DIFFÉRENTS de la demande, plus un
    // `environment`. Avant le correctif, aucun des trois n'atteignait l'appelant.
    const api = { project_id: 'proj-REEL', display_name: 'Nom normalisé par l\'API', environment: 'live' };
    const r = execCode(STRIPE, 'Format Success', reponseHttp(200, api),
      { 'Validate Input': ENTREE_STRIPE });
    verifier('succès', r.success, true);
    verifier('project_id vient de l\'API, pas de la requête', r.project.project_id, 'proj-REEL');
    verifier('display_name vient de l\'API', r.project.display_name, 'Nom normalisé par l\'API');
    verifier('environment enfin rendu', r.project.environment, 'live');
    verifier('code HTTP 200', codeHttp(STRIPE, 'Respond Success', r), 200);
  }

  console.log('\nStripe — et les replis restent de VRAIS replis');
  {
    const r = execCode(STRIPE, 'Format Success', reponseHttp(201, {}),
      { 'Validate Input': ENTREE_STRIPE });
    verifier('API muette → repli sur la demande', r.project.project_id, 'proj-1');
    // `undefined` disparaîtrait de la réponse JSON ; `null` se voit.
    verifier('environment absent → null, jamais undefined', r.project.environment, null);
    verifier('201 reste un succès', [r.success, codeHttp(STRIPE, 'Respond Success', r)], [true, 200]);
  }

  console.log('\nStripe — une erreur d\'API est RESTITUÉE, avec son statut');
  {
    const r = execCode(STRIPE, 'Format Success',
      reponseHttp(409, { detail: 'project already registered' }),
      { 'Validate Input': ENTREE_STRIPE });
    verifier('échec', r.success, false);
    verifier('statut réel de l\'API', r.error.code, 409);
    verifier('detail de FastAPI relayé', r.error.message, 'project already registered');
    verifier('le code HTTP suit le corps', codeHttp(STRIPE, 'Respond Success', r), 409);

    // `detail` en LISTE : la forme de validation FastAPI.
    const liste = execCode(STRIPE, 'Format Success',
      reponseHttp(422, { detail: [{ msg: 'stripe_key invalide' }, { msg: 'tenant inconnu' }] }),
      { 'Validate Input': ENTREE_STRIPE });
    verifier('detail en liste → messages joints', liste.error.message, 'stripe_key invalide ; tenant inconnu');
    verifier('422 relayé', codeHttp(STRIPE, 'Respond Success', liste), 422);
  }

  console.log('\nStripe — une panne de TRANSPORT ne passe plus pour un succès');
  {
    // Sans statusCode : c'est le cas que `|| 200` faisait basculer en succès.
    const r = execCode(STRIPE, 'Format Success', panneTransport('ECONNREFUSED api.local:8000'),
      { 'Validate Input': ENTREE_STRIPE });
    verifier('échec', r.success, false);
    verifier('502 — la passerelle n\'a pas joint le service', r.error.code, 502);
    verifier('le code HTTP suit', codeHttp(STRIPE, 'Respond Success', r), 502);

    // Statut enfermé dans le message, forme « 404 - {...} » doublement échappée.
    const enferme = execCode(STRIPE, 'Format Success',
      panneTransport('404 - "{\\"detail\\":\\"tenant introuvable\\"}"'),
      { 'Validate Input': ENTREE_STRIPE });
    verifier('statut extrait du message', enferme.error.code, 404);
    verifier('corps JSON désenchâssé du message', enferme.error.message, 'tenant introuvable');
  }

  // ═══════════════════════════ GUILD ═══════════════════════════
  console.log('\nGUILD — la validation ne LÈVE plus, elle répond 400');
  {
    const manque = execCode(GUILD, 'Validate Data', { body: { guild_id: 'g-1' } });
    verifier('verdict au lieu d\'une exception', manque.valid, false);
    verifier('tous les champs manquants sont nommés', manque.errors,
      ['bot_id is required', 'backend_api_url is required', 'backend_service_token is required']);
    verifier('les messages d\'origine sont conservés',
      manque.errors.includes('bot_id is required'), true);
    verifier('400 rendu par Respond Error',
      (nd(GUILD, 'Respond Error').parameters.options || {}).responseCode, 400);
    const corps = corpsRendu(GUILD, 'Respond Error', manque);
    verifier('le corps nomme la cause', corps.error.status, 'VALIDATION_ERROR');
    verifier('et liste les champs', corps.errors.length, 3);

    const complet = execCode(GUILD, 'Validate Data', { body: {
      guild_id: 'g-1', bot_id: 'b-1', backend_api_url: 'http://api.local:8000',
      backend_service_token: 'jeton', member_count: '42', guild_name: 'Azy' } });
    verifier('entrée complète → valid true', complet.valid, true);
    verifier('les entiers sont toujours analysés', complet.member_count, 42);
    verifier('les champs métier sont préservés', complet.guild_name, 'Azy');
  }

  console.log('\nGUILD — le nœud HTTP ne peut plus interrompre');
  {
    const n = nd(GUILD, 'Sync to Backend');
    const opt = ((n.parameters.options || {}).response || {}).response || {};
    verifier('fullResponse activé', opt.fullResponse, true);
    verifier('neverError activé', opt.neverError, true);
    verifier('onError pour le transport', n.onError, 'continueRegularOutput');
  }

  console.log('\n⚠️ GUILD — LE SECOND DÉFAUT ACTIF : `success` pouvait disparaître');
  {
    // Backend qui rend 200 sans `ok` ni `synced` : avant, `success` valait undefined
    // et JSON.stringify le SUPPRIMAIT. L'appelant recevait { guild_id, synced: true }.
    const r = execCode(GUILD, 'Format Réponse', reponseHttp(200, { message: 'mis a jour' }),
      { 'Validate Data': VALIDE_GUILD });
    verifier('success est explicitement true', r.success, true);
    const corps = corpsRendu(GUILD, 'Respond Success', r);
    verifier('et il SURVIT à la sérialisation', 'success' in corps, true);
    verifier('guild_id relayé', corps.guild_id, 'g-1');
    verifier('200', codeHttp(GUILD, 'Respond Success', r), 200);
  }

  console.log('\nGUILD — un refus du backend n\'est plus annoncé « synced »');
  {
    const r = execCode(GUILD, 'Format Réponse',
      reponseHttp(403, { detail: 'guild non autorisee' }), { 'Validate Data': VALIDE_GUILD });
    verifier('échec', r.success, false);
    // C'était le pire : `synced: true` en dur affirmait la réussite d'une synchro ratée.
    verifier('synced dit false, et ne l\'affirme plus', r.synced, false);
    verifier('statut réel', r.error.code, 403);
    verifier('message du backend relayé', r.error.message, 'guild non autorisee');
    verifier('le code HTTP suit', codeHttp(GUILD, 'Respond Success', r), 403);
    const corps = corpsRendu(GUILD, 'Respond Success', r);
    verifier('l\'appelant reçoit success: false', corps.success, false);
    verifier('…et synced: false', corps.synced, false);
  }

  console.log('\nGUILD — panne de transport');
  {
    const r = execCode(GUILD, 'Format Réponse', panneTransport('ETIMEDOUT api.local:8000'),
      { 'Validate Data': VALIDE_GUILD });
    verifier('502', r.error.code, 502);
    verifier('synced false', r.synced, false);
    verifier('statut nommé', r.error.status, 'SYNC_FAILED');
  }

  // ═════════════════════ L'INVARIANT DE #467 ═════════════════════
  console.log('\nL\'invariant : TOUT chemin aboutit à un nœud de réponse');
  {
    for (const [nom, wf] of [['Stripe - Register Project', STRIPE], ['GUILD - Server Sync', GUILD]]) {
      const reponses = new Set(wf.nodes
        .filter((n) => n.type === 'n8n-nodes-base.respondToWebhook').map((n) => n.name));
      const sortantes = (n) => ((wf.connections[n] || {}).main || []).flatMap((s) => (s || []).map((x) => x.node));
      // Un nœud est « couvert » s'il répond, ou si TOUTES ses sorties mènent à un couvert.
      const vu = new Map();
      const couvre = (n, pile = []) => {
        if (reponses.has(n)) return true;
        if (vu.has(n)) return vu.get(n);
        if (pile.includes(n)) return false;          // cycle
        const s = sortantes(n);
        const r = s.length > 0 && s.every((x) => couvre(x, pile.concat(n)));
        vu.set(n, r);
        return r;
      };
      const declencheurs = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook');
      verifier(`${nom} — chaque webhook mène à une réponse`,
        declencheurs.map((d) => sortantes(d.name).every((x) => couvre(x))), declencheurs.map(() => true));
      // Et tout nœud HTTP du chemin doit porter onError : sinon il peut interrompre.
      const http = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
      verifier(`${nom} — aucun appel HTTP sans onError`,
        http.filter((n) => n.onError !== 'continueRegularOutput').map((n) => n.name), []);
    }
  }

  console.log(`\nRésultat : ${ok} ok, ${echecs.length} échec(s)\n`);
  if (echecs.length) { echecs.forEach((e) => console.log(`  - ${e}`)); process.exit(1); }
})();
