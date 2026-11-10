#!/usr/bin/env node
/**
 * `email-imap` ne doit plus rendre une boîte VIDE pour une boîte INCONNUE. #645
 *
 * MESURÉ LE 2026-11-10 sur l'instance, avec un serveur qui n'existe pas :
 *     POST /webhook/email-imap  {action:"search", imap_host:"imap.exemple.invalid", …}
 *     → HTTP 200  {"success": true, "data": {"emails": [], "count": 0}}
 *
 * Le service acceptait un mot de passe pour un hôte inexistant et répondait « boîte
 * vide, 0 message non lu ». Un agent relaie cela tel quel : l'utilisateur s'entend dire
 * qu'il n'a pas de courrier, avec aplomb. C'est pire qu'une erreur — rien ne le signale.
 *
 * Les trois actions rendaient des structures FABRIQUÉES, et le code d'origine l'écrivait
 * dans ses commentaires. Il n'y a aucun client IMAP dans cette chaîne, et on ne peut pas
 * en ajouter dans un nœud Code (le bac à sable n8n interdit `require()`). Tant qu'un nœud
 * maison n'existe pas, la seule réponse juste est un refus explicite.
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
const noeud = (n) => wf.nodes.find(x => x.name === n);
const js = noeud('Process IMAP').parameters.jsCode;

/** Exécute le Code node avec un `$()` simulé sur le Webhook. */
function executer(corps) {
  const fn = new Function('$', `${js}`);
  return fn(() => ({ first: () => ({ json: { body: corps } }) }))[0].json;
}

const CREDS = {
  imap_host: 'imap.exemple.invalid',
  imap_user: 'sonde645@example.invalid',
  imap_password: 'MOT-DE-PASSE-BIDON-SONDE-645',
};

// ── 1 · Plus AUCUNE action ne rend de données fabriquées ──────────────────────
for (const action of ['list_folders', 'search', 'fetch_email']) {
  const r = executer({ ...CREDS, action, uid: '1' });
  egal(`${action} → success=false`, r.success, false);
  egal(`${action} → TOOL_NOT_IMPLEMENTED`, r.error.code, 'TOOL_NOT_IMPLEMENTED');
  egal(`${action} → 501`, r.error.http_status, 501);
  egal(`${action} → error_code à la racine (ce que MCP lit)`,
       r.error_code, 'TOOL_NOT_IMPLEMENTED');
  ok(`${action} → aucune donnée de courrier rendue`,
     !('data' in r) || r.data === null, JSON.stringify(r.data));
  // ⚠️ LE contrôle qui compte : plus jamais de liste vide présentée comme un succès.
  ok(`${action} → ne présente PAS une boîte vide comme un résultat`,
     !/"emails":\s*\[\]|"count":\s*0|"folders":\s*\[\]/.test(JSON.stringify(r)),
     JSON.stringify(r));
}

// ── 2 · Le mot de passe n'est NI utilisé, NI renvoyé, NI journalisé ───────────
for (const action of ['list_folders', 'search', 'fetch_email']) {
  const r = executer({ ...CREDS, action, uid: '1' });
  ok(`${action} → le mot de passe n'apparaît pas dans la réponse`,
     !JSON.stringify(r).includes('MOT-DE-PASSE-BIDON'), JSON.stringify(r));
}
ok('le code ne journalise rien (`console`) qui pourrait porter le mot de passe',
   !/console\./.test(js));
ok('le code ne lit même plus `imap_password`', !/imap_password/.test(js),
   'tant qu\'aucun client IMAP n\'existe, le lire ne sert qu\'à le manipuler');

// ── 3 · L'action inconnue reste distincte du non-implémenté ──────────────────
// Deux causes différentes ne doivent pas porter le même code : l'une est une faute de
// l'appelant (400), l'autre un manque chez nous (501).
const ri = executer({ ...CREDS, action: 'tout_supprimer' });
egal('action inconnue → TOOL_ACTION_UNKNOWN', ri.error.code, 'TOOL_ACTION_UNKNOWN');
egal('action inconnue → 400', ri.error.http_status, 400);
ok('action inconnue → cite l\'action reçue', ri.error.message.includes('tout_supprimer'));
const sans = executer({ ...CREDS });
egal('action absente → TOOL_ACTION_UNKNOWN', sans.error.code, 'TOOL_ACTION_UNKNOWN');
ok('action absente → ne plante pas sur `undefined`', sans.error.message.includes('null'),
   sans.error.message);

// ── 4 · Le code HTTP suit le corps, sinon le 501 ressortirait en 200 ─────────
const rep = noeud('Respond');
egal('le répondeur sérialise $json', rep.parameters.responseBody,
     '={{ JSON.stringify($json) }}');
ok('le répondeur prend son code dans `_trace.http_status`',
   String(rep.parameters.options.responseCode).includes('_trace.http_status'),
   String(rep.parameters.options.responseCode));
for (const action of ['search', 'tout_supprimer']) {
  const r = executer({ ...CREDS, action });
  egal(`${action} → _trace.http_status cohérent avec error.http_status`,
       r._trace.http_status, r.error.http_status);
}

// ── 5 · AUCUN InputSchema, et c'est volontaire ───────────────────────────────
// ⚠️ Sans schéma publié, `_build_from_schema` de MCP retire tout — `action` comprise —
// donc aucun agent ne peut appeler ce service. C'est aujourd'hui la seule chose qui
// protège les utilisateurs du mensonge ci-dessus. En déclarer un rendrait au contraire
// `imap_password` posable par un LLM, pour un service qui ne sait rien en faire.
const sticky = wf.nodes.find(n => n.type === 'n8n-nodes-base.stickyNote');
ok('email-imap → AUCUN InputSchema publié (volontaire)',
   !/\*\*InputSchema:\*\*/i.test((sticky && sticky.parameters.content) || ''),
   'déclarer un schéma rendrait `imap_password` posable par un LLM');

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues ? 1 : 0);
