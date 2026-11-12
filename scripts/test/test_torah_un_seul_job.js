#!/usr/bin/env node
/**
 * UN SEUL JOB DE BOUT EN BOUT sur le chemin batch Torah.
 *
 * CE QUE CE FICHIER GARDE, ET POURQUOI IL EXISTE
 * Mesuré le 2026-11-12 sur Pesachim 21b, 11 segments (exécutions n8n 1270981,
 * 1270983, 1270984, 1271054 sur llm.local) :
 *
 *   torah-translate-page  crée le job A 8b08d597-603f-45fb-abc9-57a6e2ac8763
 *                         et le rend au plugin, qui le sonde
 *   torah-router          reçoit le job A, prend la branche `Batch?`, et ne
 *                         touche à AUCUN job : Set Processing, Update Progress
 *                         et Set Completed sont tous de l'autre côté du switch
 *   torah-translate-batch crée le job B dc965bfc-9c8c-4cf7-a3d2-86d66646ad39
 *   callback              écrit les traductions, conclut le job B
 *
 * Résultat vérifié côté torah-api : job A `pending`, updated_at == created_at.
 * Le travail était fait, la barre de progression du plugin restait à 0/11 pour
 * toujours. Deux jobs pour une demande.
 *
 * ⚠️ Ce fichier mesure le CÂBLAGE, pas le comportement en service : il ne
 * prouve pas qu'un lot réel aboutit, seulement qu'un job fourni est repris au
 * lieu d'être doublé. La preuve en service se lit sur une exécution réelle —
 * un seul identifiant de job du dispatch jusqu'au callback.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let reussis = 0, echoues = 0;
function ok(nom, condition, detail) {
  if (condition) { reussis++; }
  else { echoues++; console.log(`  ❌ ${nom}` + (detail ? `\n       ${detail}` : '')); }
}
const egal = (nom, a, b) => ok(nom, JSON.stringify(a) === JSON.stringify(b),
  `attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);

const lire = (f) => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const dispatcher = lire('Torah_Batch_Dispatcher.json');
const router = lire('Torah_Router.json');
const page = lire('Torah_Translate_Page.json');

const noeud = (wf, nom) => wf.nodes.find((n) => n.name === nom);
const sorties = (wf, nom, i) => ((wf.connections[nom] || {}).main || [])[i] || [];
/** Le code d'un nœud, commentaires retirés : une référence en commentaire ne s'exécute pas. */
const codeNu = (wf, nom) => (noeud(wf, nom).parameters.jsCode || '')
  .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
/**
 * Exécute un nœud Code avec un `$input` et un `$(...)` simulés.
 * Un nœud Code peut rendre soit `[{json}]`, soit l'objet nu : on normalise,
 * sinon le test lit `undefined` sur tous les champs sans rien signaler.
 */
const executer = (wf, nom, entree, contexte) => {
  const r = new Function('$input', '$', '$env', noeud(wf, nom).parameters.jsCode)(
    { first: () => ({ json: entree }), all: () => [{ json: entree }] },
    (n) => {
      if (!(n in contexte)) throw new Error(`Referenced node is unexecuted: ${n}`);
      return { first: () => ({ json: contexte[n] }) };
    },
    { N8N_WEBHOOK_URL: 'http://llm.local:5678' });
  return Array.isArray(r) ? r[0].json : r;
};

// ── 1 · LE FAIT STRUCTUREL QUI A CAUSÉ LA PANNE RESTE VRAI ───────────────────
// On ne le corrige pas, on le CONSTATE : la branche batch du Router ne gère
// aucun job, et c'est précisément pourquoi le job doit être relayé plus loin.
// Si quelqu'un câble un jour la gestion de job sur cette branche, ce test
// échoue — et il faudra alors rouvrir la question du relais.
{
  const atteignables = new Set();
  const marcher = (n) => {
    if (atteignables.has(n)) return;
    atteignables.add(n);
    ((router.connections[n] || {}).main || []).forEach((o) => (o || []).forEach((c) => marcher(c.node)));
  };
  sorties(router, 'Batch?', 0).forEach((c) => marcher(c.node));
  for (const gestion of ['Set Processing', 'Update Progress', 'Set Completed', 'Conclure Job']) {
    ok(`branche batch : \`${gestion}\` reste inatteignable (constat, pas un objectif)`,
       !atteignables.has(gestion));
  }
  ok('branche batch : elle passe bien par le dispatcher',
     atteignables.has('Dispatch Batch'));
}

// ── 2 · LE ROUTER RELAIE LE JOB REÇU, ET SEULEMENT S'IL EXISTE ───────────────
{
  const pdBase = {
    segments: [{ index: 0, text: 'שלום', segment_id: 'seg-1', commentary_id: null }],
    sourceLanguage: 'he', targetLanguage: 'fr', jobType: 'torah_page',
    apiKey: 'sk-faux', model: 'claude-sonnet-4-6', provider: 'anthropic',
    projectId: 'torah-fun', correlationId: null, metadata: {},
  };
  const construire = (pd) => executer(router, 'Build Batch Payload', {},
    { 'Parse Input': pd, 'Webhook Trigger': { body: {} } });

  const fourni = construire({ ...pdBase, jobId: 'job-A', jobIdProvided: true });
  egal('job fourni → relayé au dispatcher', fourni.job_id, 'job-A');

  // Le jobId fabriqué par Parse Input (`job_<ts><rand>`) n'existe pas dans
  // /api/v2/jobs : le relayer ferait PATCHer un job absent. On aurait remplacé
  // un job jamais conclu par un job jamais créé.
  const absent = construire({ ...pdBase, jobId: 'job_mwdbkhs552ihxt', jobIdProvided: false });
  ok('job NON fourni → aucun job_id relayé', !('job_id' in absent),
     JSON.stringify(absent.job_id));

  // Et le projet suit, sinon le PATCH de statut cherche le job dans `default`.
  egal('project_id relayé', fourni.project_id, 'torah-fun');
}

// ── 3 · LE DISPATCHER REPREND LE JOB FOURNI AU LIEU D'EN CRÉER UN SECOND ─────
{
  egal('`Input Valid?` entre maintenant dans le switch de reprise',
       sorties(dispatcher, 'Input Valid?', 0).map((c) => c.node), ['Job déjà créé ?']);
  egal('job fourni → on saute Create Job',
       sorties(dispatcher, 'Job déjà créé ?', 0).map((c) => c.node), ['Résoudre Job']);
  egal('pas de job fourni → on le crée',
       sorties(dispatcher, 'Job déjà créé ?', 1).map((c) => c.node), ['Create Job']);
  egal('Create Job rejoint la même résolution',
       sorties(dispatcher, 'Create Job', 0).map((c) => c.node), ['Résoudre Job']);
  // ⚠️ La sortie d'erreur de Create Job ne doit pas être avalée au passage :
  // un lot soumis sans job est un travail facturé et introuvable.
  egal('la sortie d\'erreur de Create Job est préservée',
       sorties(dispatcher, 'Create Job', 1).map((c) => c.node), ['Erreur Création Job']);
  egal('la résolution alimente Build Requests',
       sorties(dispatcher, 'Résoudre Job', 0).map((c) => c.node), ['Build Requests']);

  const sw = noeud(dispatcher, 'Job déjà créé ?');
  ok('le switch de reprise teste la présence de `job_id`',
     String(sw.parameters.conditions.conditions[0].leftValue).includes('!!$json.job_id'),
     String(sw.parameters.conditions.conditions[0].leftValue));
}

// ── 4 · PLUS AUCUNE RÉFÉRENCE EXÉCUTABLE À `Create Job` EN AVAL ──────────────
// Sur la branche « job fourni », ce nœud n'a pas tourné : n8n lève
// « Referenced node is unexecuted » et le lot ne part jamais. C'est le piège
// exact qu'un test de câblage attrape et qu'une relecture laisse passer.
{
  for (const nom of ['Build Requests', 'Format Response', 'Erreur Soumission']) {
    ok(`\`${nom}\` ne référence plus \`Create Job\``,
       !codeNu(dispatcher, nom).includes("$('Create Job')"));
    ok(`\`${nom}\` lit \`Résoudre Job\``,
       codeNu(dispatcher, nom).includes("$('Résoudre Job')"));
  }
  for (const nom of ['Set Processing', 'Marquer Job Failed']) {
    const p = noeud(dispatcher, nom).parameters;
    ok(`\`${nom}\` PATCHe le job résolu`,
       p.url.includes("$('Résoudre Job').first().json.job_id")
       && !p.url.includes("$('Create Job')"), p.url);
    // Le job peut vivre ailleurs que dans `default` : Torah Translate Page
    // travaille en `torah-fun`. Sans l'en-tête, le PATCH peut ne pas le trouver.
    const h = p.headerParameters.parameters.find((x) => x.name === 'X-Project-ID');
    ok(`\`${nom}\` porte l'en-tête X-Project-ID`, !!h
       && h.value.includes("$('Résoudre Job').first().json.project_id"),
       JSON.stringify(p.headerParameters.parameters));
  }
}

// ── 5 · `Résoudre Job` rend le bon identifiant sur LES DEUX branches ─────────
{
  const valide = { valid: true, project_id: 'torah-fun', items: [{ segment_id: 's1' }] };

  // Branche « job fourni » : Create Job n'a pas tourné, et le simulateur lève
  // si on le référence — comme n8n le ferait.
  const repris = executer(dispatcher, 'Résoudre Job',
    { ...valide, job_id: 'job-A' }, { 'Validate Input': { ...valide, job_id: 'job-A' } });
  egal('branche fournie → job_id de l\'appelant', repris.job_id, 'job-A');
  egal('branche fournie → marquée comme non créée ici', repris.job_cree_ici, false);
  egal('branche fournie → le payload validé est conservé', repris.project_id, 'torah-fun');

  // Branche « job créé ici » : $json porte la réponse de POST /api/v2/jobs.
  const cree = executer(dispatcher, 'Résoudre Job',
    { job_id: 'job-B', status: 'pending' }, { 'Validate Input': valide });
  egal('branche créée → job_id de l\'API', cree.job_id, 'job-B');
  egal('branche créée → marquée comme créée ici', cree.job_cree_ici, true);
  egal('branche créée → le payload validé est conservé', cree.items, valide.items);

  // Variante : certaines réponses d'API rendent `id` et non `job_id`.
  const creeId = executer(dispatcher, 'Résoudre Job',
    { id: 'job-C' }, { 'Validate Input': valide });
  egal('branche créée → replie sur `id`', creeId.job_id, 'job-C');
}

// ── 6 · `Validate Input` lit le job_id, et reste silencieux sans lui ─────────
{
  const c = codeNu(dispatcher, 'Validate Input');
  ok('`Validate Input` lit `body.job_id`', /body\.job_id/.test(c));
  // Omis plutôt que posé à null : la sortie reste identique au caractère près
  // pour tout appelant qui n'en fournit pas — même convention que correlation_id.
  ok('`job_id` est OMIS quand il est absent, pas posé à null',
     /\.\.\.\(jobId \? \{ job_id: jobId \} : \{\}\)/.test(c));
}

// ── 7 · TORAH TRANSLATE PAGE : le projet et l'appairage partent au Router ────
{
  const c = codeNu(page, 'Prepare Worker Payload');
  ok('`project_id` est relayé au Router', /project_id: data\.projectId/.test(c));
  // Déjà présent (azy.daily#476) : on garde le contrôle, parce que c'est la
  // seconde prise du plugin. Mesuré vide le 2026-11-12 — non pas perdu ici,
  // mais jamais fourni par l'appelant.
  ok('`correlation_id` est relayé au Router', /correlation_id: data\.correlationId/.test(c));
  ok('`job_id` est relayé au Router', /job_id: data\.jobId/.test(c));

  // Le nom portait un `= ` parasite : n8n lit un `=` de tête comme une
  // expression, d'où un nom d'en-tête commençant par une espace.
  const h = noeud(page, 'Create Job (API)').parameters.headerParameters.parameters;
  egal('l\'en-tête de projet porte un nom propre', h[0].name, 'X-Project-ID');
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues ? 1 : 0);
