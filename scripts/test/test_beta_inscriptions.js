#!/usr/bin/env node
/**
 * BÊTA azy.education — inscriptions (webhooks n8n)
 *
 * Trois workflows : Inscription (formulaire → courriel de confirmation), Confirmation
 * (clic sur le lien), Nettoyage (ménage nocturne des demandes jamais confirmées).
 *
 * Le code de validation est extrait DU WORKFLOW livré, pas d'une copie : ce test
 * vérifie ce qui sera importé dans n8n.
 *
 * ⚠️ La table PostgreSQL n'est pas de notre ressort — elle est demandée à l'équipe api.
 * Les requêtes sont donc vérifiées par leur forme, pas exécutées.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', '..', 'workflows');
const charger = (f) => JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));
const noeud = (w, nom) => w.nodes.find((n) => n.name === nom);

let ok = 0;
let ko = 0;
const verifier = (intitule, cond, detail) => {
  if (cond) { ok += 1; console.log(`  ✓ ${intitule}`); }
  else { ko += 1; console.log(`  ✗ ${intitule}${detail ? `\n      ${detail}` : ''}`); }
};

const INSC = charger('BETA_-_Inscription.json');
const CONF = charger('BETA_-_Confirmation.json');
const NETT = charger('BETA_-_Nettoyage.json');

/** Exécute le Code node de validation, tel qu'il est livré. */
function valider(body, headers = {}) {
  const code = noeud(INSC, "Valider l'inscription").parameters.jsCode;
  const ctx = vm.createContext({ $input: { first: () => ({ json: { body, headers } }) } });
  return vm.runInContext(`(function () {\n${code}\n})()`, ctx)[0].json;
}

const CONSENTEMENT = "J'accepte d'être recontacté au sujet de la bêta d'Azy.";
const PARENT = { nom: 'Claire Martin', email: 'claire@exemple.fr', profil: 'parent',
  consentement: true, consentement_texte: CONSENTEMENT, site_web: '' };

console.log('\nBÊTA — inscriptions\n');

console.log('Validation : les trois cas du contrat');
const a = valider({ ...PARENT, email: ' Claire.Martin@Exemple.FR ' }, { 'x-forwarded-for': '82.64.1.1, 10.0.0.1' });
verifier('parent valide → accepté', a.valide === true, JSON.stringify(a));
verifier('adresse normalisée (minuscules, sans espaces)', a.email === 'claire.martin@exemple.fr', a.email);
verifier('texte du consentement conservé mot pour mot', a.consentement_texte === CONSENTEMENT);
verifier('première IP publique retenue pour la preuve', a.ip === '82.64.1.1', a.ip);

const eleve = valider({ ...PARENT, profil: 'eleve' });
verifier('profil « eleve » → refusé CÔTÉ SERVEUR',
  eleve.valide === false && (eleve.erreurs || []).includes('profil_eleve_refuse'), JSON.stringify(eleve.erreurs));
for (const graphie of ['Élève', 'eleve', 'student']) {
  verifier(`profil « ${graphie} » → refusé aussi`,
    (valider({ ...PARENT, profil: graphie }).erreurs || []).includes('profil_eleve_refuse'));
}

const robot = valider({ ...PARENT, site_web: 'http://spam.example' });
verifier('pot de miel rempli → refusé', robot.valide === false);
verifier('… et SILENCIEUX : le robot n’apprend pas qu’il est démasqué', robot.silencieux === true);

console.log('\nValidation : cas limites');
for (const [intitule, corps, attendu] of [
  ['consentement non coché', { ...PARENT, consentement: false }, 'consentement requis'],
  ['texte du consentement absent', { ...PARENT, consentement_texte: undefined }, 'consentement_texte requis'],
  ['adresse sans point', { ...PARENT, email: 'a@b' }, 'email invalide'],
  ['nom vide', { ...PARENT, nom: '  ' }, 'nom requis'],
]) {
  const r = valider(corps);
  verifier(`${intitule} → refus explicite`,
    r.valide === false && (r.erreurs || []).includes(attendu), JSON.stringify(r.erreurs));
}
verifier('profil inventé → refusé', valider({ ...PARENT, profil: 'directeur' }).valide === false);
// Valeurs anglaises : vocabulaire du CHECK en base (équipe api), une seule langue
// traverse la chaîne — les libellés français restent dans la page.
for (const p of ['parent', 'teacher', 'institution']) {
  verifier(`profil « ${p} » accepté`, valider({ ...PARENT, profil: p }).valide === true);
}
verifier('aucun require ni process dans le code livré',
  !/\brequire\s*\(|\bprocess\s*\./.test(noeud(INSC, "Valider l'inscription").parameters.jsCode));

console.log('\nRéponse identique dans tous les cas (personne ne peut sonder les adresses)');
const r202 = noeud(INSC, 'Répondre 202').parameters;
const r400 = noeud(INSC, 'Répondre 400').parameters;
verifier('nouvelle inscription et adresse déjà connue rejoignent la MÊME réponse 202',
  ['Envoyer le courriel', 'Déjà inscrite — ne rien envoyer']
    .every((n) => INSC.connections[n].main[0][0].node === 'Répondre 202'));
verifier('la réponse 202 ne dit rien de l’adresse', r202.responseBody.includes('ok: true')
  && !/email|exist|déjà/i.test(r202.responseBody));
// Le ternaire vit sur le nœud d'erreur : un refus ordinaire rend 400, un robot démasqué
// rend 202 — même code et même corps qu'une inscription acceptée.
verifier('un robot reçoit 202 et le même corps qu’un humain',
  /silencieux \? 202 : 400/.test(String(r400.options.responseCode))
  && /silencieux \?/.test(r400.responseBody), String(r400.options.responseCode));

console.log('\nJeton : seule l’empreinte est écrite');
const insertion = noeud(INSC, 'Enregistrer (en attente)').parameters;
verifier('le jeton est généré par le nœud Crypto, pas par du code',
  noeud(INSC, 'Générer le jeton').parameters.action === 'generate');
verifier('l’empreinte SHA-256 est calculée avant l’insertion',
  noeud(INSC, 'Empreinte du jeton').parameters.type === 'SHA256');
verifier('la requête insère jeton_empreinte et JAMAIS le jeton',
  insertion.query.includes('token_hash') && !/\bjeton\b/.test(insertion.query),
  insertion.query.split('\n')[1]);
// L'unicité porte sur lower(email) : « Test@x.com » et « test@x.com » sont la même
// inscription. Un UNIQUE brut sur email les aurait laissées passer toutes les deux.
verifier('l’insertion ne peut pas créer de doublon, casse comprise',
  insertion.query.includes('ON CONFLICT ((lower(email))) DO NOTHING'), insertion.query);
verifier('la table et les colonnes suivent le schéma de l’api',
  /INSERT INTO beta_signups/.test(insertion.query)
  && ['email', 'name', 'profile', 'consent_text', 'consent_ip', 'token_hash', 'token_expires_at']
       .every((c) => insertion.query.includes(c)), insertion.query);
verifier('le lien du courriel porte le jeton EN CLAIR (la base ne l’a pas)',
  /encodeURIComponent\(jeton\)/.test(noeud(INSC, 'Composer le courriel').parameters.jsCode));
verifier('l’adresse publique vient de $env, pas d’une constante',
  /\$env\.BETA_N8N_PUBLIC_URL/.test(noeud(INSC, 'Composer le courriel').parameters.jsCode));

console.log('\nConfirmation : une seule requête, un seul usage');
const maj = noeud(CONF, 'Confirmer si valide').parameters.query;
for (const [intitule, motif] of [
  ['le jeton doit correspondre', 'token_hash = $1'],
  ['… ne pas avoir déjà servi', 'confirmed_at IS NULL'],
  ['… et ne pas avoir expiré', 'token_expires_at > now()'],
  ['l’empreinte est effacée : lien à usage unique', 'token_hash = NULL'],
]) verifier(intitule, maj.includes(motif), maj);
verifier('les trois conditions sont dans UNE requête (pas de fenêtre lecture/écriture)',
  (maj.match(/UPDATE/g) || []).length === 1 && !maj.includes('SELECT'));
verifier('le jeton reçu est haché avant comparaison',
  noeud(CONF, 'Empreinte du jeton reçu').parameters.type === 'SHA256');
verifier('succès et échec redirigent vers des pages distinctes',
  noeud(CONF, 'Rediriger vers Merci').parameters.redirectURL
  !== noeud(CONF, 'Rediriger vers Lien expiré').parameters.redirectURL);
verifier('les deux URL viennent de $env',
  [noeud(CONF, 'Rediriger vers Merci'), noeud(CONF, 'Rediriger vers Lien expiré')]
    .every((n) => /\$env\.BETA_SITE_URL/.test(n.parameters.redirectURL)));

console.log('\nAlerte Discord : livrée désactivée et anonyme');
const discord = noeud(CONF, 'Alerte Discord (désactivée)');
verifier('désactivée à la livraison', discord.disabled === true);
verifier('n’envoie ni nom ni adresse', /profil/.test(discord.parameters.jsonBody)
  && !/\.email|\.nom|\.name/.test(discord.parameters.jsonBody), discord.parameters.jsonBody);
verifier('une panne Discord ne casse pas la confirmation', discord.onError === 'continueRegularOutput');

console.log('\nNettoyage : la promesse du courriel est tenue');
const suppr = noeud(NETT, 'Effacer les demandes expirées').parameters.query;
verifier('ne supprime QUE les demandes jamais confirmées', suppr.includes('confirmed_at IS NULL'));
verifier('… et seulement après expiration', suppr.includes('token_expires_at < now()'));
verifier('les inscriptions confirmées ne sont jamais touchées', !/DELETE[\s\S]*confirmed_at IS NOT NULL/.test(suppr));
verifier('la trace est anonyme : un compte, pas une adresse',
  !/email/.test(noeud(NETT, 'Journal').parameters.jsCode));

console.log('\nStructure des trois workflows');
for (const [nom, w] of [['Inscription', INSC], ['Confirmation', CONF], ['Nettoyage', NETT]]) {
  const noms = new Set(w.nodes.map((n) => n.name));
  const orphelines = Object.values(w.connections).flatMap((c) => c.main.flat())
    .map((c) => c.node).filter((n) => !noms.has(n));
  verifier(`${nom} : aucune liaison vers un nœud inexistant`, orphelines.length === 0, JSON.stringify(orphelines));
  verifier(`${nom} : livré inactif (à activer après vérification)`, w.active === false);
}

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
