#!/usr/bin/env node
/**
 * `email-imap` : le CÂBLAGE du workflow. #645 #646
 *
 * HISTOIRE DE CE FICHIER, PARCE QU'ELLE EXPLIQUE SA FORME
 * Version 1 (matin du 2026-11-10) : vérifiait que les trois actions rendaient
 * `501 TOOL_NOT_IMPLEMENTED`. Le service rendait jusque-là
 * `HTTP 200 {"success":true,"emails":[],"count":0}` pour `imap.exemple.invalid` — un hôte
 * qui NE RÉSOUT PAS. Une boîte vide FABRIQUÉE, relayée par l'agent en « vous n'avez pas de
 * courrier ». Pire qu'une erreur : rien ne la signale.
 *
 * Version 2 (celle-ci, après-midi) : le nœud maison `EmailImapToolDynamic` existe, les
 * trois actions sont réelles, et asserter le 501 reviendrait à interdire le correctif. Ce
 * fichier vérifie donc le CÂBLAGE — routage, enveloppe, codes HTTP, absence de secret au
 * schéma. Le NŒUD, lui, est couvert par `test_646_email_imap_dynamic.js`, qui mesure
 * qu'un hôte inexistant LÈVE au lieu de rendre une boîte vide.
 *
 * ⚠️ Ce qu'aucun des deux ne couvre : un vrai serveur IMAP. Il faudra un compte de test
 * pour vérifier qu'une recherche rend les BONS messages. Tant qu'il n'existe pas, on sait
 * que les échecs échouent — pas que les succès réussissent.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let reussis = 0, echoues = 0;
function ok(nom, condition, detail) {
  if (condition) { reussis++; }
  else { echoues++; console.log(`  ❌ ${nom}` + (detail ? `\n       ${detail}` : '')); }
}
const egal = (nom, a, b) => ok(nom, a === b,
  `attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);

const wf = JSON.parse(fs.readFileSync(
  path.join(RACINE, 'workflows', 'MCP_-_Email_IMAP.json'), 'utf8'));
const noeud = (n) => wf.nodes.find((x) => x.name === n);
/** Exécute un nœud Code avec un `$input` simulé. */
const executer = (nom, json) =>
  new Function('$input', noeud(nom).parameters.jsCode)(
    { first: () => ({ json }) })[0].json;

// ── 1 · LE DÉFAUT D'ORIGINE EST STRUCTURELLEMENT IMPOSSIBLE ──────────────────
// Plus aucun nœud ne fabrique de données de courrier : elles ne peuvent venir que du
// nœud IMAP, qui les tient d'une vraie connexion ou lève.
{
  const fabricants = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code'
    && /"?emails"?\s*:\s*\[\s*\]|"?folders"?\s*:\s*\[\s*\]|count\s*:\s*0/
      .test((n.parameters || {}).jsCode || ''));
  ok('aucun nœud Code ne fabrique de liste de courrier vide',
     fabricants.length === 0, fabricants.map((n) => n.name).join(', '));
  const nonImplemente = wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote'
    && /TOOL_NOT_IMPLEMENTED/.test(JSON.stringify(n.parameters || {})));
  ok('aucun nœud exécutable ne rend plus 501',
     nonImplemente.length === 0, nonImplemente.map((n) => n.name).join(', '));
}

// ── 2 · Les trois actions sont routées, et le repli est la DERNIÈRE sortie ───
{
  const sw = noeud('Router action');
  ok('`Router action` existe et est un Switch', sw && sw.type === 'n8n-nodes-base.switch');
  const regles = sw.parameters.rules.values;
  egal('3 règles de routage', regles.length, 3);
  egal('une sortie de repli est déclarée',
       sw.parameters.options.fallbackOutput, 'extra');
  const sorties = wf.connections['Router action'].main;
  egal('4 sorties câblées (3 règles + 1 repli)', sorties.length, 4);
  // ⚠️ La sortie de repli est TOUJOURS la dernière. L'insérer au milieu enverrait
  // `search` vers « Route inconnue » — et le test de forme passerait quand même.
  egal('le repli est la DERNIÈRE sortie', sorties[3][0].node, 'Route inconnue');
  const attendues = ['list_folders', 'search', 'fetch_email'];
  regles.forEach((r, i) => {
    egal(`règle ${i} teste \`${attendues[i]}\``,
         r.conditions.conditions[0].rightValue, attendues[i]);
    ok(`règle ${i} lit \`body.action\``,
       String(r.conditions.conditions[0].leftValue).includes('$json.body.action'));
    // Et elle doit viser le nœud qui porte CETTE opération.
    const cible = noeud(sorties[i][0].node);
    egal(`règle ${i} → nœud portant \`operation: ${attendues[i]}\``,
         cible.parameters.operation, attendues[i]);
  });
}

// ── 3 · Les identifiants portent les noms d'API ──────────────────────────────
// api stocke `provider_settings.imap = {server, port, use_ssl}` + `credentials =
// {username, password}` (`imap_adapter.py:446-462`, chiffré au repos). Renommer en
// host/secure/user recréerait une couche de traduction des deux côtés.
{
  const attendus = {
    imap_server: 'imap_server', imap_port: 'imap_port', imap_use_ssl: 'imap_use_ssl',
    imap_username: 'imap_username', imap_password: 'imap_password',
  };
  for (const nom of ['listFolders', 'searchEmails', 'fetchEmail']) {
    const p = noeud(nom).parameters;
    for (const [param, champ] of Object.entries(attendus)) {
      ok(`${nom} · \`${param}\` lit \`body.${champ}\``,
         String(p[param]).includes(`$json.body.${champ}`), String(p[param]));
    }
    ok(`${nom} → onError capte l'erreur (sinon le webhook ne répond jamais)`,
       noeud(nom).onError === 'continueRegularOutput', String(noeud(nom).onError));
  }
}

// ── 4 · L'enveloppe de réponse ───────────────────────────────────────────────
// ⚠️ SUR SUCCÈS, NI `error` NI `error_code` : MCP discrimine sur la PRÉSENCE de la clé,
// pas sur sa valeur. Poser `error: null` fait lire un échec (mesuré sur Classroom).
{
  const succes = executer('Qualifier la réponse', { folders: [{ path: 'INBOX' }], count: 1 });
  egal('succès → success=true', succes.success, true);
  ok('succès → AUCUNE clé `error`', !('error' in succes), JSON.stringify(succes));
  ok('succès → AUCUNE clé `error_code`', !('error_code' in succes));
  egal('succès → 200', succes._trace.http_status, 200);
  ok('succès → la donnée du nœud est sous `data`', succes.data.count === 1);

  const refus = executer('Qualifier la réponse',
    { error: 'Invalid credentials', auth_failed: true, imap_code: 'AUTHENTICATIONFAILED' });
  egal('refus d\'authentification → 401', refus._trace.http_status, 401);
  egal('refus d\'authentification → IMAP_AUTH_REJECTED', refus.error_code, 'IMAP_AUTH_REJECTED');
  egal('refus → success=false', refus.success, false);

  const panne = executer('Qualifier la réponse', { error: 'ENOTFOUND imap.exemple.invalid' });
  egal('hôte injoignable → 502', panne._trace.http_status, 502);
  egal('hôte injoignable → IMAP_UPSTREAM_ERROR', panne.error_code, 'IMAP_UPSTREAM_ERROR');
  // Les deux causes ne doivent PAS porter le même code : l'une se corrige en changeant
  // le mot de passe, l'autre en changeant d'hôte.
  ok('refus et panne ne portent pas le même code',
     refus.error_code !== panne.error_code);
}

// ── 5 · L'action inconnue reste distincte de l'action absente ────────────────
{
  const ri = executer('Route inconnue', { body: { action: 'tout_supprimer' } });
  egal('action inconnue → TOOL_ROUTE_UNKNOWN', ri.error_code, 'TOOL_ROUTE_UNKNOWN');
  egal('action inconnue → 400', ri._trace.http_status, 400);
  ok('action inconnue → cite l\'action reçue', ri.error.message.includes('tout_supprimer'));
  ok('action inconnue → énumère les actions valides',
     ['list_folders', 'search', 'fetch_email'].every((a) => ri.error.message.includes(a)));
  const vide = executer('Route inconnue', { body: {} });
  ok('action absente → ne plante pas sur `undefined`', vide.error_code === 'TOOL_ROUTE_UNKNOWN');
  // Et l'absence d'action est attrapée AVANT, par `Validate Input` → 400 BAD_REQUEST.
  const na = noeud('Error: No Action');
  egal('`Error: No Action` rend 400', na.parameters.options.responseCode, 400);
  ok('`Error: No Action` énumère les actions', /list_folders/.test(na.parameters.responseBody));
}

// ── 6 · Le code HTTP suit le corps, sinon un 401 ressortirait en 200 ────────
{
  const rep = noeud('Respond');
  egal('le répondeur sérialise $json', rep.parameters.responseBody,
       '={{ JSON.stringify($json) }}');
  ok('le répondeur prend son code dans `_trace.http_status`',
     String(rep.parameters.options.responseCode).includes('_trace.http_status'),
     String(rep.parameters.options.responseCode));
  // Les deux branches qui aboutissent au répondeur doivent poser ce champ.
  for (const src of ['Qualifier la réponse', 'Route inconnue']) {
    ok(`\`${src}\` aboutit au répondeur`,
       (wf.connections[src].main[0] || []).some((c) => c.node === 'Respond'));
    ok(`\`${src}\` pose \`_trace.http_status\``,
       /_trace:\s*\{\s*http_status/.test(noeud(src).parameters.jsCode));
  }
}

// ── 7 · Les identifiants n'entrent dans AUCUN schéma publié ─────────────────
// Mesuré par MCP : un champ déclaré au schéma est un champ que le LLM remplit, et le
// registre est publié sans authentification puis vectorisé dans Qdrant. Un mot de passe
// de boîte ne périme pas et autorise aussi l'envoi — contrairement à un jeton OAuth.
{
  const fuite = [];
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.stickyNote')) {
    for (const bloc of ((n.parameters || {}).content || '').match(/```json\s*([\s\S]*?)```/g) || []) {
      let o;
      try { o = JSON.parse(bloc.replace(/```json|```/g, '').trim()); } catch { continue; }
      const props = o?.properties ?? o?.inputSchema?.properties;
      if (props) {
        for (const cle of Object.keys(props)) {
          if (/^imap_/.test(cle)) fuite.push(`${n.name}:${cle}`);
        }
      }
    }
  }
  ok('aucun InputSchema publié ne déclare un champ `imap_*`',
     fuite.length === 0, fuite.join(', '));
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues ? 1 : 0);
