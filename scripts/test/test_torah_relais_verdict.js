#!/usr/bin/env node
/**
 * RELAIS DU VERDICT DE RELECTURE JUSQU'À L'APPELANT — azy.daily#669, point 8.
 *
 * LE DÉFAUT MESURÉ LE 2026-11-15
 * `Torah Router` et `Torah Translate Page` portaient ZÉRO occurrence de
 * `verification`, `divergence` et `verify_skipped`. Le verdict était donc jeté
 * DEUX fois, au même endroit logique : avant la sauvegarde en base
 * (`Prepare Save`) et avant la réponse à l'appelant. Il n'existait que dans la
 * réponse d'un appel DIRECT à /webhook/torah-translate et dans les données
 * d'exécution n8n — rétention ≈ 2,4 jours, purge par NOMBRE (~10 000
 * exécutions, dont 67 % viennent du seul `Claude - Batch Poller`).
 *
 * ⚠️ POURQUOI PAS DANS LA RÉPONSE HTTP
 * `Respond Accepted` est branché sur `Batch?`, EN AMONT de tout le pipeline :
 *     Batch? [1] → Respond Accepted → Needs Job Creation? → … → Loop Segments
 * Il répond AVANT que la moindre traduction ait lieu. C'est un accusé de
 * réception, pas un résultat. Aucun verdict ne peut y figurer, et ce n'est pas
 * un oubli à corriger.
 *
 * Le verdict passe donc par les deux canaux de fin qui existent déjà :
 * le JOB (que l'appelant sonde) et l'ÉVÉNEMENT REDIS de fin.
 *
 * ⚠️ Ce fichier mesure le comportement des nœuds Code, pas le service.
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

// ⚠️ Déréférencement PROTÉGÉ partout. Sans lui, la suite PLANTE au lieu
// d'échouer quand le relais est absent — et un plantage masque tous les
// contrôles suivants au lieu de nommer celui qui casse.
const g = (o) => (o && typeof o === 'object') ? o : {};

const lire = (f) => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const router = lire('Torah_Router.json');

const noeud = (wf, nom) => {
  const n = wf.nodes.find((x) => x.name === nom);
  if (!n) throw new Error(`nœud introuvable : ${nom}`);
  return n;
};
const codeNu = (wf, nom) => (noeud(wf, nom).parameters.jsCode || '')
  .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/**
 * Exécute un nœud Code. `contexte[nom]` peut être UN objet ou UN TABLEAU :
 * `.all()` est nécessaire ici parce que `Prepare Save` rend DEUX items quand il
 * y a un pivot anglais, et que `Calc Progress` doit choisir le bon.
 */
const executer = (wf, nom, entree, contexte) => {
  const items = Array.isArray(entree) ? entree : [entree];
  return new Function('$input', '$', '$env', noeud(wf, nom).parameters.jsCode)(
    { first: () => ({ json: items[0] }), all: () => items.map((j) => ({ json: j })) },
    (n) => {
      if (!(n in (contexte || {}))) throw new Error(`Referenced node is unexecuted: ${n}`);
      const v = contexte[n];
      const tab = Array.isArray(v) ? v : [v];
      return { first: () => ({ json: tab[0] }), all: () => tab.map((j) => ({ json: j })) };
    },
    {}
  )[0].json;
};

const VERDICT = {
  reviewer: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  reviewed_at: '2026-11-15T12:00:00.000Z',
  approved: false, confidence: 0.82,
  issues: [
    { severite: 'sens', extrait: 'עוֹנִין', explication: 'le verbe est « répondre »' },
    { severite: 'style', extrait: 'a', explication: 'b' }
  ],
  issues_ecartees: 1,
  suggestion: 'x'.repeat(2192),   // taille réelle du seul verdict existant
  notes: 'y'.repeat(300)
};

// ═════════════════════════════════════════════════════════════════════════════
// 1 · PREPARE SAVE PORTE LE VERDICT — ET SEULEMENT SUR LA LANGUE CIBLE
// ═════════════════════════════════════════════════════════════════════════════
{
  const loopItem = { jobId: 'j1', index: 0, totalSegments: 3, segment_id: 's1',
    commentary_id: null, source_text: 'ש', targetLanguage: 'fr', metadata: {},
    pipelineType: 'direct', provider: 'anthropic', model: 'claude-sonnet-4-6' };

  // Sans pivot : un seul item.
  const simple = new Function('$input', '$', '$env',
    noeud(router, 'Prepare Save').parameters.jsCode)(
      { first: () => ({ json: { success: true, translation: 'Bonjour',
        provider_utilise: 'anthropic', model_utilise: 'claude-sonnet-4-6',
        verification: VERDICT, verify_skipped: null } }) },
      (n) => ({ first: () => ({ json: { 'Loop Segments': loopItem }[n] }) }),
      {}
    );
  egal('un seul payload sans pivot', simple.length, 1);
  egal('le verdict est porté', g(simple[0].json.verification).approved, false);
  egal('et le motif de saut aussi', simple[0].json.verify_skipped, null);

  // Avec pivot anglais : DEUX items, et le pivot sort EN PREMIER.
  const avecPivot = new Function('$input', '$', '$env',
    noeud(router, 'Prepare Save').parameters.jsCode)(
      { first: () => ({ json: { success: true, translation: 'Bonjour',
        english_pivot: 'Hello', generated_english: true,
        verification: VERDICT, verify_skipped: null } }) },
      (n) => ({ first: () => ({ json: { 'Loop Segments': loopItem }[n] }) }),
      {}
    );
  egal('deux payloads avec pivot', avecPivot.length, 2);
  ok('⚠️ le PIVOT sort en premier', avecPivot[0].json.isEnglishPivot === true,
     `premier = ${avecPivot[0].json.targetLanguage}`);
  egal('⚠️ le pivot anglais NE porte PAS le verdict',
       avecPivot[0].json.verification, undefined);
  egal('la langue cible le porte', g(avecPivot[1].json.verification).approved, false);
  egal('et c\'est bien la cible', avecPivot[1].json.targetLanguage, 'fr');
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · CALC PROGRESS : BILAN COMPACT, ET LE BON ITEM MALGRÉ LE PIVOT
// ═════════════════════════════════════════════════════════════════════════════
{
  const loopItem = { jobId: 'j1', index: 1, totalSegments: 4, segment_id: 's2',
    commentary_id: null, longError: null };
  const sauve = { success: true, translation_id: 'tid-1' };

  // Le pivot est en PREMIER dans Prepare Save : `.first()` prendrait le mauvais.
  const ctx = { 'Loop Segments': loopItem, 'Prepare Save': [
    { isEnglishPivot: true, targetLanguage: 'en', verification: null, verify_skipped: null },
    { targetLanguage: 'fr', verification: VERDICT, verify_skipped: null }
  ]};
  const r = executer(router, 'Calc Progress', sauve, ctx).resultat;

  ok('le bilan existe', r.relecture !== null && r.relecture !== undefined);
  egal('⚠️ le verdict lu est celui de la CIBLE, pas du pivot', g(r.relecture).approved, false);
  egal('confiance conservée', g(r.relecture).confidence, 0.82);
  egal('issues COMPTÉES, pas recopiées', g(r.relecture).issues, 2);
  egal('issues écartées remontées', g(r.relecture).issues_ecartees, 1);
  egal('relecteur résumé en une chaîne', g(r.relecture).reviewer, 'anthropic/claude-sonnet-4-6');

  // ⚠️ Le poids est la raison d'être de ce nœud : aucun texte intégral.
  egal('⚠️ `suggestion` ne remonte PAS', g(r.relecture).suggestion, undefined);
  egal('⚠️ `notes` ne remonte PAS', g(r.relecture).notes, undefined);
  ok('le bilan pèse moins de 300 octets',
     JSON.stringify(g(r.relecture)).length < 300,
     `${JSON.stringify(g(r.relecture)).length} octets`);

  // « Approuvé avec réserves » : le cas visé par Franck.
  const avecReserves = Object.assign({}, VERDICT, { approved: true });
  const rr = executer(router, 'Calc Progress', sauve,
    { 'Loop Segments': loopItem,
      'Prepare Save': [{ targetLanguage: 'fr', verification: avecReserves }] }).resultat;
  egal('⭐ approuvé AVEC réserves est signalé', g(rr.relecture).reserves, true);

  const sansReserve = { reviewer: { provider: 'google', model: 'gemini-2.5-pro' },
    approved: true, confidence: 0.97, issues: [], issues_ecartees: 0,
    suggestion: null, notes: null };
  const rs = executer(router, 'Calc Progress', sauve,
    { 'Loop Segments': loopItem,
      'Prepare Save': [{ targetLanguage: 'fr', verification: sansReserve }] }).resultat;
  egal('approuvé sans réserve → reserves false', g(rs.relecture).reserves, false);

  // Pas de relecture du tout : null, et le motif est conservé.
  const rn = executer(router, 'Calc Progress', sauve,
    { 'Loop Segments': loopItem, 'Prepare Save': [
      { targetLanguage: 'fr', verification: null, verify_skipped: 'aucune_cle_pour_google' }
    ]}).resultat;
  egal('sans verdict → relecture null', rn.relecture, null);
  egal('et le motif de saut est conservé', rn.verify_skipped, 'aucune_cle_pour_google');

  // Le nœud ne doit pas référencer Call Translate Worker : la branche des
  // segments longs le saute, et la référence lèverait.
  ok('⚠️ `Calc Progress` ne référence pas `Call Translate Worker`',
     !/\$\('Call Translate Worker'\)/.test(codeNu(router, 'Calc Progress')));
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · CONCLURE JOB : AGRÉGATION, COMPTAGE DES SAUTS, TRONCATURE
// ═════════════════════════════════════════════════════════════════════════════
{
  const seg = (i, approved, reserves, saut, ecartees) => ({
    index: i, segment_id: `s${i}`, commentary_id: null, ok: true, cause: null, detail: null,
    relecture: approved === null ? null : { approved, confidence: 0.8, issues: reserves ? 2 : 0,
      issues_ecartees: ecartees || 0, reserves: !!reserves, reviewer: 'anthropic/claude-sonnet-4-6' },
    verify_skipped: saut || null
  });
  const items = [
    seg(0, true, false, null, 0),
    seg(1, true, true, null, 1),       // approuvé avec réserves
    seg(2, false, false, null, 0),     // refusé
    seg(3, null, false, 'aucune_cle_pour_google', 0),
    seg(4, null, false, 'aucune_cle_pour_google', 0),
    seg(5, null, false, 'relecteur_avis_sans_verdict', 0)
  ];
  const c = executer(router, 'Conclure Job', items, { 'Parse Input': { jobId: 'job-1' } });

  egal('total', c.total, 6);
  egal('relus', g(c.relecture).relus, 3);
  egal('non relus', g(c.relecture).non_relus, 3);
  egal('approuvés', g(c.relecture).approuves, 2);
  egal('refusés', g(c.relecture).refuses, 1);
  egal('⭐ avec réserves', g(c.relecture).avec_reserves, 1);
  egal('issues écartées cumulées', g(c.relecture).issues_ecartees, 1);
  egal('⚠️ motifs de saut COMPTÉS', g(c.relecture).sauts,
       { aucune_cle_pour_google: 2, relecteur_avis_sans_verdict: 1 });
  egal('avis détaillés : un par segment relu', (g(c.relecture).avis || []).length, 3);
  egal('et aucun texte intégral dans les avis',
       Object.keys(g(g(c.relecture).avis && g(c.relecture).avis[0])).filter((k) => k === 'suggestion' || k === 'notes'), []);

  // Troncature : même règle que `echecs`, vingt au plus.
  const beaucoup = Array.from({ length: 40 }, (_, i) => seg(i, false, false, null, 0));
  const gros = executer(router, 'Conclure Job', beaucoup, { 'Parse Input': { jobId: 'job-2' } });
  egal('40 segments relus sont comptés', g(gros.relecture).relus, 40);
  egal('⚠️ mais 20 avis au plus sont détaillés', (g(gros.relecture).avis || []).length, 20);

  // Le statut du job ne doit PAS dépendre de la relecture : un refus de
  // relecture n'est pas un échec de traduction.
  egal('⚠️ un refus de relecture ne fait pas échouer le job', gros.statut, 'completed');
}

// ═════════════════════════════════════════════════════════════════════════════
// 4 · ÉVÉNEMENT REDIS DE FIN : COMPTEURS, TOUT EN CHAÎNES
// ═════════════════════════════════════════════════════════════════════════════
{
  const conclusion = { jobId: 'job-1', total: 6, ok_count: 6, fail_count: 0, echecs: [],
    relecture: { relus: 3, non_relus: 3, approuves: 2, refuses: 1, avec_reserves: 1,
      issues_ecartees: 1, sauts: { aucune_cle_pour_google: 2 }, avis: [] } };
  const e = executer(router, 'Préparer Fin Sync', conclusion,
    { 'Parse Input': { correlationId: 'corr-1', metadata: {}, jobId: 'job-1' } });
  const f = e.fields;

  egal('relus', f.relus, '3');
  egal('approuvés', f.approuves, '2');
  egal('refusés', f.refuses, '1');
  egal('⭐ avec réserves', f.avec_reserves, '1');
  egal('motifs de saut sérialisés', f.sauts, '{"aucune_cle_pour_google":2}');

  // ⚠️ Ce sont des champs de flux Redis : tout doit être une chaîne.
  for (const [k, v] of Object.entries(f)) {
    ok(`\`${k}\` est une chaîne (champ de flux Redis)`,
       typeof v === 'string' || v === null, `${k} = ${typeof v}`);
  }
  // `mode` reste posé : sans lui, un consommateur qui traite déjà le synchrone
  // en ligne re-débiterait en recevant cet avis (azy.daily#481).
  egal('`mode` est toujours là', f.mode, 'sync');

  // Sans relecture du tout, les compteurs valent zéro, jamais `undefined`.
  const vide = executer(router, 'Préparer Fin Sync',
    { jobId: 'j', total: 2, ok_count: 2, fail_count: 0, echecs: [] },
    { 'Parse Input': { correlationId: null, metadata: {}, jobId: 'j' } });
  egal('sans relecture, relus = "0"', vide.fields.relus, '0');
  egal('et sauts = "{}"', vide.fields.sauts, '{}');
}

// ═════════════════════════════════════════════════════════════════════════════
// 5 · CE QUE LE RELAIS NE DOIT PAS CHANGER
// ═════════════════════════════════════════════════════════════════════════════
{
  // `Respond Accepted` répond AVANT la traduction : il ne doit porter aucun
  // verdict, et personne ne doit croire qu'il en porte un.
  const corps = JSON.stringify(noeud(router, 'Respond Accepted').parameters);
  ok('⚠️ `Respond Accepted` ne prétend PAS porter un verdict',
     !/verification|relecture|divergence/.test(corps));

  // Et le verdict ne doit jamais partir vers /webhook/torah-save avec un
  // `divergence` : l'API refuse les champs inconnus (422, et sur /save-batch
  // c'est TOUT le lot qui tombe).
  ok('⚠️ aucun `divergence` émis par le Router',
     !/divergence:/.test(codeNu(router, 'Calc Progress') + codeNu(router, 'Prepare Save')));
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues === 0 ? 0 : 1);
