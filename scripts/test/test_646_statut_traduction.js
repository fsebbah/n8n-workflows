#!/usr/bin/env node
/**
 * Une traduction entièrement ratée ne doit pas se dire « completed ». #646
 *
 * MESURÉ LE 2026-11-10 sur llm, avec une clé Anthropic volontairement fausse :
 *     POST /webhook/document-translate-worker  (2 pages)
 *     → 202, puis GET document-job-status → status: "completed", error: null
 *        usage: { pages_translated: 0, pages_failed: 2 }
 *        full_translation: "Bonjour le monde.\n\n--- Page Break ---\n\nDeuxieme page."
 *
 * `full_translation` portait le texte FRANÇAIS D'ORIGINE, présenté comme la traduction
 * anglaise. Un client lisant ce champ — le champ évident — affiche le document non
 * traduit, et rien ne le prévient.
 *
 * ⚠️ CE QUI N'EST PAS EN CAUSE : `Extract Translation` recopie délibérément le texte
 * source pour une page en échec, « pour ne pas trouer le document ». C'est juste pour un
 * échec PARTIEL — sur 35 pages, mieux vaut une page en langue source qu'un trou. Le
 * défaut était l'absence de SIGNAL, pas le repli.
 *
 * ⚠️ TROIS CONSOMMATEURS, TROIS ENDROITS. Le client qui interroge `document-job-status`
 * lit `Mark Complete` ; celui qui relit `document-result-get` lit `Store Result` ; le
 * callback lit `Finalize`. Corriger un seul laisserait les deux autres mentir — c'est
 * pour ça que ce test vérifie les trois.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let reussis = 0, echoues = 0;
function ok(nom, condition, detail) {
  if (condition) { reussis++; }
  else { echoues++; console.log(`  ❌ ${nom}` + (detail ? `\n       ${detail}` : '')); }
}

const wf = JSON.parse(fs.readFileSync(
  path.join(RACINE, 'workflows', 'Document_Translate_Worker.json'), 'utf8'));
const noeud = (n) => wf.nodes.find((x) => x.name === n);

// ── 1 · Le verdict, évalué sur les trois cas ─────────────────────────────────
// On extrait la règle du code de `Finalize` et on l'exécute, plutôt que de la recopier :
// une copie dans le test dériverait du code sans que rien ne le signale.
{
  const js = noeud('Finalize').parameters.jsCode;
  const regle = js.match(/const verdict = ([\s\S]*?);\n/);
  ok('`Finalize` porte la règle du verdict', !!regle);
  if (regle) {
    const juger = new Function('traduites', 'echouees',
      `return ${regle[1].replace(/\/\/[^\n]*/g, '')};`);
    ok('0 traduite / 2 échouées → `failed`', juger(0, 2) === 'failed', juger(0, 2));
    ok('1 traduite / 1 échouée → `partial`', juger(1, 1) === 'partial', juger(1, 1));
    ok('2 traduites / 0 échouée → `completed`', juger(2, 0) === 'completed', juger(2, 0));
    // ⚠️ Le cas limite qui compte : un document VIDE n'est pas un échec de traduction.
    // Sans le `&& echouees > 0`, zéro page sur zéro ressortirait « failed ».
    ok('0 traduite / 0 échouée → `completed` (document vide, pas un échec)',
       juger(0, 0) === 'completed', juger(0, 0));
  }
  for (const attendu of ['translationStatus: verdict', 'pages: pagesAnnotees',
                         'fullTranslationIsSource', 'translated: !p.error']) {
    ok(`\`Finalize\` expose « ${attendu} »`, js.includes(attendu));
  }
  // `success` ne doit PAS suivre le verdict : il signifie « la chaîne est allée au bout »
  // et c'est lui que suit `Store Result`. Les confondre enverrait un document raté dans
  // la branche d'erreur de stockage.
  ok('`success` reste indépendant du verdict de traduction',
     /success: true,/.test(js) && !/success: verdict/.test(js));
}

// ── 2 · `Mark Complete` ne doit plus poster 'completed' en dur ──────────────
{
  const body = noeud('Mark Complete').parameters.jsonBody;
  ok('`Mark Complete` ne poste plus `status: \'completed\'` en dur',
     !/status: 'completed'(?!\s*:)/.test(body) || /\?\s*'failed'\s*:\s*'completed'/.test(body),
     body.slice(0, 160));
  ok('`Mark Complete` poste `failed` quand le verdict est `failed`',
     /translationStatus === 'failed' \? 'failed' : 'completed'/.test(body));
  ok('`Mark Complete` joint un bloc `error` dans ce cas',
     /ALL_PAGES_FAILED/.test(body),
     'sans code d\'erreur, le client ne peut pas distinguer les causes d\'échec');
  ok('`Mark Complete` remonte `translation_status` dans `output`',
     /translation_status:/.test(body));
}

// ── 3 · `Store Result` : ce que le client RELIT doit porter le verdict ──────
{
  const body = noeud('Store Result').parameters.jsonBody;
  for (const champ of ['translation_status', 'pages_translated', 'pages_failed',
                       'full_translation_is_source']) {
    ok(`\`Store Result\` porte \`${champ}\``, body.includes(champ));
  }
  // Et il doit toujours porter le texte : le retirer casserait les clients existants.
  ok('`Store Result` porte toujours `full_translation`',
     body.includes('full_translation:'));
}

// ── 4 · email-imap : les données d'exécution ne doivent PAS être conservées ──
// Mesuré le 2026-11-10 : avec la persistance active, le mot de passe arrivait en clair
// dans TROIS nœuds (`Webhook`, `Validate Input`, `Router action`), lisibles via
// `GET /executions/<id>?includeData=true`. n8n enregistre le corps de la requête
// entrante ; aucun nettoyage applicatif ne peut l'empêcher.
{
  const imap = JSON.parse(fs.readFileSync(
    path.join(RACINE, 'workflows', 'MCP_-_Email_IMAP.json'), 'utf8'));
  const s = imap.settings || {};
  ok('email-imap → `saveDataSuccessExecution: none`', s.saveDataSuccessExecution === 'none',
     String(s.saveDataSuccessExecution));
  ok('email-imap → `saveDataErrorExecution: none`', s.saveDataErrorExecution === 'none',
     String(s.saveDataErrorExecution));
  ok('email-imap → `saveManualExecutions: false`', s.saveManualExecutions === false,
     String(s.saveManualExecutions));
  // ⚠️ Ces clés doivent rester dans la liste blanche d'écriture de `n8n_api.py`, sinon
  // le réimport les jetterait en silence et la fuite reviendrait sans que rien ne bouge
  // dans le dépôt.
  const api = fs.readFileSync(path.join(RACINE, 'scripts/n8n/n8n_api.py'), 'utf8');
  for (const cle of ['saveDataSuccessExecution', 'saveDataErrorExecution', 'saveManualExecutions']) {
    ok(`\`${cle}\` est dans la liste blanche d'écriture de n8n_api.py`, api.includes(`'${cle}'`),
       'hors liste blanche, le réglage serait jeté au réimport et la fuite reviendrait');
  }
  // Et la raison doit rester écrite : un réglage sans justification se fait annuler par
  // le premier qui veut déboguer.
  const sticky = imap.nodes.find((n) => n.type === 'n8n-nodes-base.stickyNote');
  ok('la raison du non-enregistrement est documentée dans le pense-bête',
     /NE SONT PAS conservées/.test((sticky || {}).parameters?.content || ''));
}


// ── 5 · `document-job-status` : lecture échouée ≠ job en échec ──────────────
// MESURÉ LE 2026-11-10, juste après avoir appris à `Mark Complete` à écrire 'failed' :
//     GET /webhook/document-job-status?job_id=…
//     → {"success":false,"status":null,"error":{"code":200,
//        "message":"Aucune page traduite : …","status":"JOB_NOT_FOUND"}}
// Le message était le NÔTRE — le job avait donc bien été lu — mais la réponse disait
// `status: null` et JOB_NOT_FOUND, c'est-à-dire « je ne trouve pas ce job ».
// Cause : `if (code >= 400 || !data || data.error)` confondait l'échec de la LECTURE
// avec un job qui PORTE une erreur. Le défaut existait depuis le début et restait
// invisible : aucun job ne portait d'`error` avant ce correctif. Corriger un maillon
// révèle les hypothèses du suivant.
{
  const js = JSON.parse(fs.readFileSync(
    path.join(RACINE, 'workflows', 'DOCUMENT_-_Job_Status.json'), 'utf8'));
  const n = (nom) => js.nodes.find((x) => x.name === nom).parameters.jsCode;
  const ex = n('Examiner Statut');
  ok('`Examiner Statut` ne confond plus lecture échouée et job en échec',
     !ex.includes('|| !data || data.error)'),
     'un job `status: failed` ressortirait en JOB_NOT_FOUND avec status: null');
  ok('`Examiner Statut` reconnaît un job `failed`', ex.includes("data.status === 'failed'"));
  ok('`Examiner Statut` conserve `status`, `progress` et `output` d\'un job en échec',
     /status: data\.status \|\| 'failed'/.test(ex) && /progress: data\.progress/.test(ex)
     && /output: data\.output/.test(ex));
  ok('`Examiner Statut` relaie le code sémantique du job, pas JOB_NOT_FOUND',
     /status: data\?\.error\?\.code \|\| 'JOB_FAILED'/.test(ex));

  const ec = n('En Cours');
  // ⚠️ MCP discrimine sur la PRÉSENCE de la clé `error`, pas sur sa valeur : poser
  // `error: null` sur un job sain le faisait lire comme un échec. Même défaut que le
  // `Respond Success` de Classroom (#645).
  ok('`En Cours` ne pose plus `error: null` inconditionnellement',
     !/error: j\.error \|\| null/.test(ec) && /if \(j\.error\) reponse\.error/.test(ec));
  ok('`En Cours` conserve `output` (translation_status, pages_translated, pages_failed)',
     /output: j\.output/.test(ec),
     'sans lui, « failed » ne dit pas combien de pages ont échoué');
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues ? 1 : 0);
