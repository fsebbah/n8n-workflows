#!/usr/bin/env node
/**
 * Frappeur de jetons éphémères pour l'API Realtime (azy.daily#281).
 *
 *     node scripts/test/test_realtime_jeton.js
 *     node scripts/test/test_realtime_jeton.js --en-ligne   # frappe un vrai jeton
 *
 * Le test exécute le JavaScript extrait du JSON du workflow.
 *
 * Pourquoi ce webhook existe
 * --------------------------
 * L'API Realtime est un WebSocket bidirectionnel : n8n ne peut pas la porter.
 * Mais la SESSION s'ouvre avec un jeton éphémère frappé en REST — ça, un nœud
 * HTTP le fait. n8n porte donc l'authentification, jamais le flux audio.
 *
 * Ce que le test protège
 * ----------------------
 *  - **la clé SYSTÈME est engagée.** Sans signature HMAC, l'URL suffirait à
 *    ouvrir des sessions facturées sur notre compte : le contrôle vérifie qu'une
 *    requête non signée est refusée avant d'atteindre OpenAI ;
 *  - **OpenAI ne valide PAS le modèle** — mesuré : « modele-invente-42 » rend 200
 *    et un jeton. La liste blanche est donc la seule barrière, et elle n'a aucun
 *    repli : sans `REALTIME_MODELS`, le webhook refuse au lieu de tout permettre ;
 *  - la durée est bornée — un jeton à longue vie annule l'intérêt d'un jeton
 *    éphémère ;
 *  - la charge OpenAI est rendue TELLE QUELLE, sans enveloppe maison : le client
 *    parle ensuite à OpenAI, il a besoin de leur forme ;
 *  - un 200 sans jeton n'est pas présenté comme un succès.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/REALTIME_-_Client_Secret.json'), 'utf8'));
const noeud = n => WF.nodes.find(x => x.name === n);

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 48 ? obtenu.slice(0, 48) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(52)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

function exec(nom, entree, env = {}) {
  const enrobe = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = enrobe(entree);
  return enrobe(vm.runInNewContext(`(function(){${noeud(nom).parameters.jsCode}})()`, {
    $input: { all: () => items, first: () => items[0] },
    $env: env, console: { log() {} },
    JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, Date,
  }));
}

const ENV = { REALTIME_MODELS: 'gpt-realtime-2.1-mini,gpt-realtime-1.5' };
const lire = (body, env = ENV) => exec('Lire Paramètres', { body }, env)[0].json;
const verif = entree => exec('Verify HMAC', entree)[0].json;
const formater = rep => exec('Formater Réponse', rep)[0].json;

console.log('\n1. signature — la clé système est engagée');
{
  const sig = 'a'.repeat(64);
  controle('signature correcte acceptée',
    verif({ computed_signature: sig, headers: { 'x-webhook-signature': `sha256=${sig}` }, body: {} }).hmac_valid, true);
  controle('en-tête absent → 401',
    [verif({ computed_signature: sig, headers: {}, body: {} }).hmac_valid,
     verif({ computed_signature: sig, headers: {}, body: {} }).http_code], [false, 401]);
  controle('signature erronée → 401',
    verif({ computed_signature: sig, headers: { 'x-webhook-signature': 'sha256=' + 'b'.repeat(64) }, body: {} }).http_code, 401);
  // Un secret absent ne doit pas laisser passer : c'est un 500, pas un blanc-seing.
  controle('secret non configuré → 500, pas un passage',
    [verif({ computed_signature: '', headers: { 'x-webhook-signature': `sha256=${sig}` }, body: {} }).hmac_valid,
     verif({ computed_signature: '', headers: { 'x-webhook-signature': `sha256=${sig}` }, body: {} }).http_code], [false, 500]);
  controle('casse de l’en-tête tolérée',
    verif({ computed_signature: sig, headers: { 'X-Webhook-Signature': `SHA256=${sig.toUpperCase()}` }, body: {} }).hmac_valid, true);
}

console.log('\n2. modèle — OpenAI ne le valide pas, nous si');
{
  controle('modèle autorisé', lire({ model: 'gpt-realtime-2.1-mini' }).valide, true);
  const inconnu = lire({ model: 'modele-invente-42' });
  controle('modèle inconnu refusé', [inconnu.valide, inconnu.erreur.code, inconnu.erreur.status],
    [false, 422, 'MODEL_NOT_ALLOWED']);
  controle('la liste autorisée est rendue à l’appelant', inconnu.erreur.allowed,
    ['gpt-realtime-2.1-mini', 'gpt-realtime-1.5']);
  // gpt-4o existe chez OpenAI et frappe un jeton — mais n'est pas un modèle temps réel.
  controle('modèle existant mais non temps réel refusé', lire({ model: 'gpt-4o' }).valide, false);
  const sansModele = lire({});
  controle('model absent → 400', [sansModele.valide, sansModele.erreur.code], [false, 400]);

  // Aucun repli : une liste absente ferait de ce webhook un distributeur ouvert.
  const sansListe = lire({ model: 'gpt-realtime-2.1-mini' }, {});
  controle('REALTIME_MODELS absent → refus, pas ouverture',
    [sansListe.valide, sansListe.erreur.code, sansListe.erreur.status], [false, 503, 'NOT_CONFIGURED']);
  controle('aucun repli en dur dans le code',
    /gpt-realtime/.test(noeud('Lire Paramètres').parameters.jsCode), false);
}

console.log('\n3. durée — bornée dans les deux sens');
{
  controle('défaut 600 s', lire({ model: 'gpt-realtime-1.5' }).secondes, 600);
  controle('valeur respectée', lire({ model: 'gpt-realtime-1.5', expires_after_seconds: 120 }).secondes, 120);
  controle('plafond à 1800 s', lire({ model: 'gpt-realtime-1.5', expires_after_seconds: 999999 }).secondes, 1800);
  controle('valeur absurde → défaut', lire({ model: 'gpt-realtime-1.5', expires_after_seconds: -5 }).secondes, 600);
  controle('valeur non numérique → défaut', lire({ model: 'gpt-realtime-1.5', expires_after_seconds: 'x' }).secondes, 600);
}

console.log('\n4. réponse — la charge OpenAI telle quelle');
{
  const brut = { value: 'ek_abc', expires_at: 1787932571, session: { id: 'sess_1', type: 'realtime', model: 'gpt-realtime-2.1-mini' } };
  controle('relais sans enveloppe maison', formater({ statusCode: 200, body: brut }), brut);
  controle('aucun champ ajouté', Object.keys(formater({ statusCode: 200, body: brut })), ['value', 'expires_at', 'session']);

  // Forme émise par onError=continueRegularOutput : pas de statusCode.
  const r401 = formater({ error: { message: '401 - {"error":{"message":"Incorrect API key"}}' } });
  controle('401 → 401, pas 500', [r401.success, r401.error.code, r401.error.status], [false, 401, 'MINT_FAILED']);
  const reseau = formater({ error: { message: 'socket hang up', code: 'ECONNRESET' } });
  controle('panne réseau → 502', [reseau.success, reseau.error.code], [false, 502]);
  // Le pire cas : accepté, mais rien à donner au client.
  const vide = formater({ statusCode: 200, body: { session: { id: 'sess_1' } } });
  controle('200 sans jeton n’est pas un succès',
    [vide.success, vide.error.code, vide.error.status], [false, 502, 'NO_TOKEN']);
}

console.log('\n5. câblage');
{
  controle('webhook en POST', noeud('Webhook').parameters.httpMethod, 'POST');
  controle('chemin', noeud('Webhook').parameters.path, 'realtime-client-secret');
  controle('HMAC calculé sur le corps', noeud('Compute HMAC').parameters.value, '={{ JSON.stringify($json.body) }}');
  controle('clé système, jamais le payload',
    /\$env\.OPENAI_API_KEY/.test(JSON.stringify(noeud('Frapper Jeton').parameters)), true);
  controle('appel en onError pour lire le vrai statut', noeud('Frapper Jeton').onError, 'continueRegularOutput');
  const e = noeud('Frapper Jeton').parameters.jsonBody;
  controle('aucune « }} » interne', /\}\}/.test(e.replace(/\}\}\s*$/, '')), false);
}

if (process.argv.includes('--en-ligne')) {
  console.log('\n6. frappe réelle');
  const cle = process.env.OPENAI_API_KEY;
  if (!cle) { console.log('  ⏭  OPENAI_API_KEY absente'); conclure(); }
  else {
    (async () => {
      const p = lire({ model: 'gpt-realtime-2.1-mini', expires_after_seconds: 600 });
      const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: p.secondes },
                               session: { type: 'realtime', model: p.model } }),
      });
      const d = await r.json();
      const f = formater({ statusCode: r.status, body: d });
      controle('jeton frappé', r.status, 200);
      controle('préfixe du jeton', String(f.value || '').slice(0, 3), 'ek_');
      controle('durée ≈ 600 s', Math.abs((f.expires_at - Math.floor(Date.now() / 1000)) - 600) < 30, true);
      controle('session identifiée', String(f.session?.id || '').slice(0, 5), 'sess_');

      // Le contrôle qui justifie la liste blanche : OpenAI accepte n'importe quoi.
      const absurde = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: { type: 'realtime', model: 'modele-invente-42' } }),
      });
      controle('OpenAI frappe pour un modèle inventé — d’où la liste', absurde.status, 200);
      conclure();
    })().catch(e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
  }
} else conclure();

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
  console.log('✅ tous les contrôles passent');
}
