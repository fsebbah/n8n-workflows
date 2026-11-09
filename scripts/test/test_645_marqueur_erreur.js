#!/usr/bin/env node
/**
 * azy.daily#645 — le « 200 à corps vide » doit cesser d'être ambigu.
 *
 * Trois causes très différentes produisaient la même réponse vide sur
 * `mcp-gmail` et `mcp-calendar` : une route morte, un refus de Google, une paire
 * resource/operation non routée. MCP nous a dit ce que ce vide devenait chez eux :
 * `_normalize_response` le traduisait en `success=True, data=[]`, soit « boîte vide ».
 *
 * Cette suite vérifie que chacune des trois ressort désormais avec un code stable,
 * et surtout qu'elles ne se confondent pas entre elles.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let reussis = 0, echoues = 0;

function ok(nom, condition, detail) {
  if (condition) { reussis++; }
  else { echoues++; console.log(`  ❌ ${nom}` + (detail ? `\n       ${detail}` : '')); }
}
function egal(nom, obtenu, attendu) {
  ok(nom, obtenu === attendu, `attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`);
}

function charger(fichier) {
  return JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', fichier), 'utf8'));
}
function code(wf, nom) {
  const n = wf.nodes.find(x => x.name === nom);
  if (!n) throw new Error(`nœud ${nom} absent`);
  return n.parameters.jsCode;
}
/** Exécute un Code node avec un `$input` simulé. */
function executer(js, entree) {
  const fn = new Function('$input', `${js}`);
  return fn({ first: () => ({ json: entree }) });
}

const CAS = [
  ['MCP_-_Gmail_Server_(All-in-One).json', 22],
  ['MCP_-_Google_Calendar_Server.json', 6],
];

for (const [fichier, nbRegles] of CAS) {
  console.log(`\n=== ${fichier} ===`);
  const wf = charger(fichier);
  const q = code(wf, 'Qualifier la réponse');
  const ri = code(wf, 'Route inconnue');

  // ── 1 · Le succès reste un succès, et `data` n'est pas altéré ──────────────
  // C'est ce qui permet de comparer Google en direct et Google via n8n : si nous
  // retouchions `data`, la comparaison de la sonde #645 ne prouverait plus rien.
  const reponseGoogle = { kind: 'calendar#calendarList', items: [{ id: 'a@b.c', accessRole: 'owner' }] };
  const r1 = executer(q, reponseGoogle);
  egal('succès → success=true', r1.success, true);
  egal('succès → error=null', r1.error, null);
  egal('succès → http_status 200', r1._trace.http_status, 200);
  ok('succès → data rendu INTACT',
     JSON.stringify(r1.data) === JSON.stringify(reponseGoogle),
     JSON.stringify(r1.data));

  // ── 2 · Route morte : un défaut de câblage CHEZ NOUS, pas un refus de Google ──
  for (const msg of ['Unknown message operation: getAll',
                     'Unknown thread operation: reply',
                     'Unknown label operation: foo']) {
    const r = executer(q, { error: msg });
    egal(`route morte « ${msg.slice(0, 32)}… » → code`, r.error.code, 'TOOL_OPERATION_UNKNOWN');
    egal(`route morte « ${msg.slice(0, 32)}… » → 501`, r.error.http_status, 501);
    egal(`route morte → success=false`, r.success, false);
    ok('route morte → message d\'origine conservé', r.error.message === msg);
  }

  // ── 3 · Refus de Google, sous ses trois formes rencontrées ────────────────
  for (const msg of ['Authorization failed - please check your credentials',
                     '401 - {"error":{"message":"Invalid Credentials"}}',
                     'The request failed with 403 Forbidden']) {
    const r = executer(q, { error: msg });
    egal(`refus « ${msg.slice(0, 26)}… » → code`, r.error.code, 'GOOGLE_AUTH_REJECTED');
    egal(`refus « ${msg.slice(0, 26)}… » → 401`, r.error.http_status, 401);
  }
  // ⚠️ Le message rendu sur un refus ne doit PAS recopier la réponse de Google :
  // n8n stocke le jeton en clair dans les erreurs, et le recopier le publierait.
  const rRefus = executer(q, { error: '401 - {"error":"ya29.SECRET"}' });
  ok('refus → le message ne recopie pas la réponse brute',
     !rRefus.error.message.includes('ya29.'), rRefus.error.message);

  // ── 4 · L'ORDRE de reconnaissance, qui est le vrai piège ──────────────────
  // Un message peut contenir « Unknown … operation » ET un code HTTP. Le classer
  // en erreur d'API ferait chercher la panne chez Google au lieu de chez nous.
  const melange = executer(q, { error: 'Unknown message operation: getAll (401 context)' });
  egal('« Unknown … » l\'emporte sur un 401 présent dans le même message',
       melange.error.code, 'TOOL_OPERATION_UNKNOWN');

  // ── 5 · Les autres classes ────────────────────────────────────────────────
  egal('404 → GOOGLE_NOT_FOUND',
       executer(q, { error: '404 - not found' }).error.code, 'GOOGLE_NOT_FOUND');
  egal('429 → GOOGLE_RATE_LIMITED',
       executer(q, { error: '429 rate limit exceeded' }).error.code, 'GOOGLE_RATE_LIMITED');
  egal('quota → GOOGLE_RATE_LIMITED',
       executer(q, { error: 'Quota exceeded for quota metric' }).error.code, 'GOOGLE_RATE_LIMITED');
  egal('autre → GOOGLE_API_ERROR',
       executer(q, { error: 'socket hang up' }).error.code, 'GOOGLE_API_ERROR');
  egal('autre → 502',
       executer(q, { error: 'socket hang up' }).error.http_status, 502);

  // ── 6 · Paire non routée : la cause que le passthrough de MCP peut déclencher ──
  const brutRepli = executer(ri, {
    headers: { 'content-type': 'application/json' },
    body: { access_token: 'ya29.CECI-EST-UN-SECRET', resource: 'message', operation: 'inventee' },
  });
  ok('repli → marqué _route_inconnue', brutRepli._route_inconnue === true);
  ok('repli → cite resource et operation',
     brutRepli._message.includes('message') && brutRepli._message.includes('inventee'),
     brutRepli._message);
  // ⚠️ LE contrôle qui compte : le nœud de repli ne doit RIEN recopier du corps,
  // qui porte le jeton OAuth. Un écho du corps publierait le jeton dans la réponse.
  ok('repli → NE RECOPIE PAS le jeton',
     !JSON.stringify(brutRepli).includes('ya29.'), JSON.stringify(brutRepli));

  const rRepli = executer(q, brutRepli);
  egal('repli → TOOL_ROUTE_UNKNOWN', rRepli.error.code, 'TOOL_ROUTE_UNKNOWN');
  egal('repli → 400', rRepli.error.http_status, 400);
  ok('repli qualifié → ne porte toujours pas le jeton',
     !JSON.stringify(rRepli).includes('ya29.'));

  // ── 7 · `JSON.stringify` et les clés indéfinies ───────────────────────────
  // ⚠️ `JSON.stringify` LAISSE TOMBER les clés valant `undefined` : c'est ainsi que
  // GUILD - Server Sync avait perdu son champ `success`. Le répondeur sérialise
  // `$json`, donc toute clé indéfinie DISPARAÎTRAIT de la réponse.
  for (const [etiquette, entree] of [['succès', reponseGoogle],
                                     ['échec', { error: 'Unknown message operation: x' }]]) {
    const r = executer(q, entree);
    const serialise = JSON.parse(JSON.stringify(r));
    ok(`${etiquette} → « success » survit à la sérialisation`, 'success' in serialise);
    ok(`${etiquette} → « error » survit à la sérialisation`, 'error' in serialise);
    ok(`${etiquette} → « data » survit à la sérialisation`, 'data' in serialise);
    ok(`${etiquette} → « _trace.http_status » survit`,
       serialise._trace && typeof serialise._trace.http_status === 'number');
  }

  // ── 8 · Le câblage ────────────────────────────────────────────────────────
  const dynamiques = wf.nodes.filter(n => n.type.includes('Dynamic'));
  egal(`${dynamiques.length} nœuds dynamiques armés`,
       dynamiques.filter(n => n.onError === 'continueRegularOutput').length, dynamiques.length);
  egal('nombre de nœuds dynamiques', dynamiques.length, nbRegles);

  const repondeurs = wf.nodes.filter(n => n.type === 'n8n-nodes-base.respondToWebhook');
  egal('un seul répondeur', repondeurs.length, 1);
  const rep = repondeurs[0];
  egal('le corps rendu est $json sérialisé',
       rep.parameters.responseBody, '={{ JSON.stringify($json) }}');
  ok('le code HTTP suit le corps au lieu d\'être 200 en dur',
     String(rep.parameters.options.responseCode).includes('$json.error'),
     String(rep.parameters.options.responseCode));

  // Plus AUCUN nœud ne doit viser le répondeur en direct : tout passe par la
  // qualification, sinon un chemin oublié rendrait encore un corps non qualifié.
  let directs = 0;
  for (const [source, sorties] of Object.entries(wf.connections)) {
    if (source === 'Qualifier la réponse') continue;
    for (const liste of sorties.main || []) {
      for (const lien of liste || []) if (lien.node === rep.name) directs++;
    }
  }
  egal('aucun nœud ne vise le répondeur en direct', directs, 0);
  ok('la qualification alimente le répondeur',
     (wf.connections['Qualifier la réponse'].main[0] || []).some(l => l.node === rep.name));

  const sw = wf.nodes.find(n => n.type === 'n8n-nodes-base.switch');
  egal('le Switch porte une sortie de repli', sw.parameters.options.fallbackOutput, 'extra');
  const sortiesSw = wf.connections[sw.name].main;
  egal('le Switch a une sortie de plus que de règles', sortiesSw.length, nbRegles + 1);
  ok('la sortie de repli est câblée sur « Route inconnue »',
     (sortiesSw[nbRegles] || []).some(l => l.node === 'Route inconnue'),
     JSON.stringify(sortiesSw[nbRegles]));

  // Les 22 (ou 6) règles gardent chacune sa cible : un détournement ne doit pas
  // avoir déplacé une route vers la qualification au lieu de son nœud.
  let reglesCablees = 0;
  for (let i = 0; i < nbRegles; i++) {
    const cible = (sortiesSw[i] || [])[0];
    if (cible && wf.nodes.find(n => n.name === cible.node && n.type.includes('Dynamic'))) reglesCablees++;
  }
  egal('chaque règle vise toujours son nœud dynamique', reglesCablees, nbRegles);

  // ── 9 · Aucun `$env` n'a été introduit : le jeton reste en BYOT ───────────
  const toutLeJs = wf.nodes.filter(n => n.parameters && n.parameters.jsCode)
                           .map(n => n.parameters.jsCode).join('\n')
                           .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  ok('aucun $env introduit dans le code ajouté', !toutLeJs.includes('$env'));
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues ? 1 : 0);
