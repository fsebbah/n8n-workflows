#!/usr/bin/env node
/**
 * TORAH VERIFY — relecture de traductions déjà faites (azy.daily#669, point 1).
 *
 * CE QUE CE FICHIER GARDE, ET POURQUOI LE WORKFLOW EXISTE
 *
 * Le chemin lot ne relisait RIEN : `Torah_Batch_Dispatcher` et
 * `Torah_Batch_Callback` portaient ZÉRO occurrence de `verify`. Et le lot part
 * dès 10 segments (`SEUIL_BATCH_481`), donc les vraies pages de Talmud
 * n'étaient jamais relues — l'UI du plugin affichait « 0/11 » lors de #578.
 *
 * ⚠️ Relire DANS le callback était impossible proprement : il est déclenché
 * après la fin du lot (jusqu'à 24 h chez Anthropic) par le `Claude - Batch
 * Poller` partagé. La clé du relecteur devrait survivre jusque-là, donc être
 * stockée dans le metadata du lot — une clé BYOT AU REPOS dans une
 * infrastructure partagée. Le dispatcher évite déjà ça : `Build Requests`
 * envoie `api_key` au soumetteur À CÔTÉ de `metadata`, jamais dedans.
 *
 * Ce workflow prend donc la relecture APRÈS COUP, clé dans le corps.
 *
 * ⚠️ Mesure le comportement des nœuds Code, pas le service.
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
// Déréférencement protégé : un plantage masquerait tous les contrôles suivants.
const g = (o) => (o && typeof o === 'object') ? o : {};

const wf = JSON.parse(fs.readFileSync(
  path.join(RACINE, 'workflows', 'Torah_Verify.json'), 'utf8'));
const noeud = (nom) => {
  const n = wf.nodes.find((x) => x.name === nom);
  if (!n) throw new Error(`nœud introuvable : ${nom}`);
  return n;
};
const codeNu = (nom) => (noeud(nom).parameters.jsCode || '')
  .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/** Exécute un nœud Code. `contexte[nom]` peut être un objet ou un tableau. */
const executer = (nom, entree, contexte) => {
  const items = Array.isArray(entree) ? entree : [entree];
  return new Function('$input', '$', '$env', noeud(nom).parameters.jsCode)(
    { first: () => ({ json: items[0] }), all: () => items.map((j) => ({ json: j })) },
    (n) => {
      if (!(n in (contexte || {}))) throw new Error(`Referenced node is unexecuted: ${n}`);
      const v = contexte[n];
      const tab = Array.isArray(v) ? v : [v];
      return { first: () => ({ json: tab[0] }), all: () => tab.map((j) => ({ json: j })) };
    },
    {}
  );
};
const valider = (body) => executer('Validate Input', { body }).map((i) => i.json);
const enveloppe = (avis) => ({ statusCode: 200,
  body: { success: true, data: { text: JSON.stringify(avis) }, meta: {} } });

const SEG = {
  segment_id: 's1', source_text: 'שֶׁעוֹנִין עָלָיו', translation: 'sur lequel on répond',
  source_language: 'he', target_language: 'fr'
};

// ═════════════════════════════════════════════════════════════════════════════
// 1 · VALIDATION — ET LA CLÉ QUI NE TRAVERSE JAMAIS LES FOURNISSEURS
// ═════════════════════════════════════════════════════════════════════════════
{
  egal('sans segments → 400', g(valider({}) [0].erreur).code, 400);
  ok('et le message le nomme',
     /segments/.test(g(valider({}) [0].erreur).message));

  const gemini = valider({ segments: [SEG], verify_provider: 'gemini',
                           verify_api_key: 'k' })[0];
  egal('⚠️ `gemini` est refusé', g(gemini.erreur).code, 400);
  ok('et le message dit que Gemini se nomme `google`',
     /google/.test(g(gemini.erreur).message), g(gemini.erreur).message);

  const sansCle = valider({ segments: [SEG], verify_provider: 'google' })[0];
  egal('google sans clé → 400', g(sansCle.erreur).code, 400);
  ok('et le motif nomme le fournisseur',
     /google/.test(g(sansCle.erreur).message));

  // ⚠️ La clé de traduction ne doit JAMAIS partir chez un autre fournisseur.
  const fuite = valider({ segments: [SEG], verify_provider: 'openai',
                          api_key: 'sk-ant-SECRET' })[0];
  egal('⚠️ `api_key` anthropic NE sert PAS pour openai', g(fuite.erreur).code, 400);

  const anthro = valider({ segments: [SEG], api_key: 'sk-ant-X' })[0];
  egal('mais elle sert pour anthropic', anthro.valide, true);
  egal('et le défaut est anthropic', anthro.verify_provider, 'anthropic');
  egal('modèle par défaut', anthro.verify_model, 'claude-sonnet-4-6');

  const trousseau = valider({ segments: [SEG], verify_provider: 'google',
    plugin_context: { api_keys: { google: 'AIza-X' } } })[0];
  egal('le trousseau `plugin_context` est lu', trousseau.valide, true);
  egal('et le fournisseur est retenu', trousseau.verify_provider, 'google');

  // La clé ne doit pas se retrouver ailleurs que dans `_verify.api_key`.
  const sansApiKey = JSON.stringify(Object.assign({}, trousseau, { _verify: null }));
  ok('⚠️ la clé n\'apparaît nulle part hors `_verify`',
     !/AIza-X/.test(sansApiKey), sansApiKey.slice(0, 200));
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · TOUS LES SEGMENTS SONT RENDUS, MÊME NON RELISIBLES
// ═════════════════════════════════════════════════════════════════════════════
{
  const items = valider({ segments: [
    SEG,
    { segment_id: 's2', source_text: 'ש' },                      // pas de traduction
    { segment_id: 's3', translation: 'bonjour' },                // pas de source
    { commentary_id: 'c4', source_text: 'ש', translated_text: 'x' }  // noms alternatifs
  ], api_key: 'sk-ant-X' });

  egal('un item par segment envoyé', items.length, 4);
  egal('le relisible porte `_verify`', !!items[0]._verify, true);
  egal('⚠️ sans traduction → motif nommé', items[1].verify_skipped, 'traduction_absente');
  egal('⚠️ sans source → motif nommé', items[2].verify_skipped, 'source_absente');
  egal('les deux sont marqués non relisibles',
       [items[1].relisible, items[2].relisible], [false, false]);
  egal('`translated_text` est accepté comme `translation`', items[3].relisible, true);
  egal('et `commentary_id` est conservé', items[3].commentary_id, 'c4');

  // L'invite doit contenir l'original ET la traduction, jamais la clé.
  const corps = items[0]._verify.messages[0].content;
  ok('l\'original est dans l\'invite', corps.indexOf('שֶׁעוֹנִין') >= 0);
  ok('la traduction aussi', corps.indexOf('sur lequel on répond') >= 0);
  ok('⚠️ la clé n\'est PAS dans l\'invite', corps.indexOf('sk-ant-X') === -1);
  ok('l\'invite système exige `approved`',
     /OBLIGATOIRE|approved/.test(items[0]._verify.system));
  egal('température 0', items[0]._verify.temperature, 0);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · LE VERDICT : MÊMES RÈGLES QUE TORAH TRANSLATE SIMPLE
// ═════════════════════════════════════════════════════════════════════════════
{
  const demandes = valider({ segments: [SEG], api_key: 'sk-ant-X' });
  const rendre = (rep) => executer('Appliquer Verdict', rep,
    { 'Validate Input': demandes })[0].json;

  const bon = rendre(enveloppe({ approved: false, confidence: 0.82,
    issues: [{ severite: 'sens', extrait: 'עוֹנִין', explication: 'le verbe' }],
    suggestion: 'mieux', notes: 'n' }));
  egal('le verdict est rendu', g(bon.verification).approved, false);
  egal('confiance', g(bon.verification).confidence, 0.82);
  egal('relecteur imbriqué', g(g(bon.verification).reviewer).provider, 'anthropic');
  ok('`reviewed_at` horodaté',
     /^\d{4}-\d{2}-\d{2}T/.test(g(bon.verification).reviewed_at));
  egal('suggestion conservée', g(bon.verification).suggestion, 'mieux');
  egal('aucun saut', bon.verify_skipped, null);

  // ⚠️ Forme STRICTEMENT `review` : api refuse les champs inconnus (422), et
  // sur /save-batch un seul item invalide fait tomber LE LOT ENTIER.
  egal('⚠️ pas de `divergence` émis', g(bon.verification).divergence, undefined);
  egal('les clés sont exactement celles de `review`',
       Object.keys(g(bon.verification)).sort(),
       ['approved', 'confidence', 'issues', 'issues_ecartees', 'notes',
        'reviewed_at', 'reviewer', 'suggestion'].sort());

  // ⚠️ Un verdict muet n'est PAS une approbation.
  for (const [nom, avis] of [
    ['clé absente',     { confidence: 0.9 }],
    ['approved null',   { approved: null }],
    ['approved "true"', { approved: 'true' }],
    ['approved 1',      { approved: 1 }],
  ]) {
    const r = rendre(enveloppe(avis));
    egal(`⚠️ ${nom} → aucun verdict`, r.verification, null);
    egal(`⚠️ ${nom} → motif explicite`, r.verify_skipped, 'relecteur_avis_sans_verdict');
  }

  // Approuvé AVEC réserves : l'état recherché par Franck.
  const reserves = rendre(enveloppe({ approved: true, confidence: 0.82,
    issues: [{ severite: 'sens', extrait: 'a', explication: 'b' }],
    suggestion: 'quelques précisions' }));
  egal('⭐ approuvé', g(reserves.verification).approved, true);
  egal('⭐ ET la suggestion est gardée',
       g(reserves.verification).suggestion, 'quelques précisions');

  // Normalisation avant envoi.
  const sale = rendre(enveloppe({ approved: true, confidence: 95, issues: [
    { severite: 'grammar', extrait: 'a', explication: 'b' },
    { severite: 'SENS', extrait: 'c', explication: 'd' },
    { severite: 'sens', extrait: 42, explication: 'e' },
    'chaîne nue'
  ] }));
  egal('`confidence: 95` → null', g(sale.verification).confidence, null);
  egal('2 issues écartées', g(sale.verification).issues_ecartees, 2);
  egal('sévérité hors jeu → `forme`', g(g(sale.verification).issues)[0].severite, 'forme');
  egal('capitales normalisées', g(g(sale.verification).issues)[1].severite, 'sens');

  // Les chemins d'échec, tous nommés.
  egal('HTTP 500 → motif', rendre({ statusCode: 500, body: {} }).verify_skipped,
       'relecteur_http_500');
  egal('réponse vide → motif',
       rendre({ statusCode: 200, body: { success: true, data: {} } }).verify_skipped,
       'relecteur_reponse_vide');
  egal('JSON illisible → motif',
       rendre({ statusCode: 200, body: { success: true, data: { text: 'pas du json' } } })
         .verify_skipped, 'relecteur_json_illisible');

  // Un JSON entouré de texte ou de balises doit être récupéré.
  const balises = rendre({ statusCode: 200, body: { success: true, data: {
    text: '```json\n{"approved": true, "confidence": 0.9}\n```' } } });
  egal('les balises de code sont retirées', g(balises.verification).approved, true);

  // ⚠️ Un segment non relisible ignore la réponse du relais.
  const nonRelisible = valider({ segments: [{ segment_id: 's9', source_text: 'ש' }],
                                 api_key: 'sk-ant-X' });
  const ignore = executer('Appliquer Verdict',
    enveloppe({ approved: true, confidence: 1 }),
    { 'Validate Input': nonRelisible })[0].json;
  egal('⚠️ non relisible → la réponse du relais est IGNORÉE', ignore.verification, null);
  egal('et le motif d\'origine est conservé', ignore.verify_skipped, 'traduction_absente');
}

// ═════════════════════════════════════════════════════════════════════════════
// 4 · RECOLLAGE PAR INDEX — LE VERDICT SUR LE BON SEGMENT
// ═════════════════════════════════════════════════════════════════════════════
{
  const demandes = valider({ segments: [
    { segment_id: 'a', source_text: 'ש', translation: 'un' },
    { segment_id: 'b', source_text: 'ש' },                        // non relisible
    { segment_id: 'c', source_text: 'ש', translation: 'trois' }
  ], api_key: 'sk-ant-X' });

  const reponses = [
    enveloppe({ approved: true, confidence: 0.9 }),
    { statusCode: 400, body: { success: false } },                // le corps bidon
    enveloppe({ approved: false, confidence: 0.3, suggestion: 'autre' })
  ];
  const r = executer('Appliquer Verdict', reponses,
    { 'Validate Input': demandes }).map((i) => i.json);

  egal('trois verdicts rendus', r.length, 3);
  egal('l\'ordre des segments est conservé',
       r.map((x) => x.segment_id), ['a', 'b', 'c']);
  egal('⚠️ le verdict de `a` est bien le premier', g(r[0].verification).approved, true);
  egal('⚠️ `b` reste non relu malgré le 400 du corps bidon', r[1].verification, null);
  egal('et son motif est celui d\'origine', r[1].verify_skipped, 'traduction_absente');
  egal('⚠️ le verdict de `c` est bien le troisième', g(r[2].verification).approved, false);
  egal('et sa suggestion lui appartient', g(r[2].verification).suggestion, 'autre');
}

// ═════════════════════════════════════════════════════════════════════════════
// 5 · L'AGRÉGAT RENDU À L'APPELANT
// ═════════════════════════════════════════════════════════════════════════════
{
  const demandes = valider({ segments: [SEG], api_key: 'sk-ant-X',
                             job_id: 'job-9', correlation_id: 'corr-9' });
  const v = (approved, issues, suggestion) => ({
    segment_id: 'x', commentary_id: null, verify_skipped: null,
    verification: { reviewer: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      reviewed_at: '2026-11-15T12:00:00.000Z', approved, confidence: 0.8,
      issues: issues || [], issues_ecartees: 1, suggestion: suggestion || null, notes: null }
  });
  const items = [
    v(true, [], null),                                              // approuvé net
    v(true, [{ severite: 'sens', extrait: 'a', explication: 'b' }], null),  // réserves
    v(true, [], 'mieux'),                                           // réserves (suggestion)
    v(false, [], 'autre'),                                          // refusé
    { segment_id: 'y', commentary_id: null, verification: null,
      verify_skipped: 'traduction_absente' },
    { segment_id: 'z', commentary_id: null, verification: null,
      verify_skipped: 'relecteur_avis_sans_verdict' }
  ];
  const a = executer('Agréger', items,
    { 'Validate Input': demandes,
      'Webhook Trigger': { body: { job_id: 'job-9', correlation_id: 'corr-9' } } })[0].json;

  egal('succès', a.success, true);
  egal('job relayé', a.job_id, 'job-9');
  egal('appairage relayé', a.correlation_id, 'corr-9');
  egal('relecteur résumé', a.reviewer, 'anthropic/claude-sonnet-4-6');
  egal('total', a.total, 6);
  egal('relus', a.relus, 4);
  egal('non relus', a.non_relus, 2);
  egal('approuvés', a.approuves, 3);
  egal('refusés', a.refuses, 1);
  egal('⭐ avec réserves (issues OU suggestion)', a.avec_reserves, 2);
  egal('issues écartées cumulées', a.issues_ecartees, 4);
  egal('motifs de saut comptés', a.sauts,
       { traduction_absente: 1, relecteur_avis_sans_verdict: 1 });
  egal('tous les verdicts sont rendus', a.verdicts.length, 6);

  // ⚠️ Ici, et ICI SEULEMENT, le texte intégral est rendu : c'est une réponse
  // synchrone demandée par l'appelant, pas une charge de job via Redis.
  ok('le texte intégral est présent dans la réponse',
     a.verdicts.some((x) => g(x.verification).suggestion));
}

// ═════════════════════════════════════════════════════════════════════════════
// 6 · CONTRAT DU WORKFLOW, ET CE QU'IL NE DOIT PAS FAIRE
// ═════════════════════════════════════════════════════════════════════════════
{
  const webhook = wf.nodes.find((n) => n.type.endsWith('webhook'));
  egal('chemin du webhook', webhook.parameters.path, 'torah-verify');
  egal('méthode POST', webhook.parameters.httpMethod, 'POST');
  egal('réponse par le dernier nœud', webhook.parameters.responseMode, 'lastNode');
  egal('workflow actif', wf.active, true);

  const relais = wf.nodes.find((n) => n.name === 'Vérifier (LLM)');
  ok('la relecture passe par `llm-call-messages`',
     /llm-call-messages/.test(relais.parameters.url));
  egal('neverError, pour qu\'aucun item ne disparaisse',
       relais.parameters.options.response.response.neverError, true);
  egal('fullResponse, pour lire le statut HTTP',
       relais.parameters.options.response.response.fullResponse, true);

  // ⚠️ Ce workflow ne persiste RIEN : la mise en base est le point 3.
  const tout = JSON.stringify(wf.nodes.filter((n) => !n.type.endsWith('stickyNote')));
  ok('⚠️ aucun appel à /api/translations/save', !/translations\/save/.test(tout));
  ok('⚠️ aucun appel à torah-save', !/torah-save/.test(tout));
  ok('⚠️ aucun $env de clé LLM',
     !/\$env\.(ANTHROPIC|OPENAI|GOOGLE|GEMINI|MISTRAL)[A-Z_]*/.test(tout));
  ok('⚠️ aucun `divergence` émis', !/divergence:/.test(codeNu('Appliquer Verdict')));

  // Le seul $env admis est l'adresse d'infrastructure du relais.
  const envs = (tout.match(/\$env\.[A-Z0-9_]+/g) || []);
  egal('un seul $env, et c\'est une URL d\'infra',
       [...new Set(envs)], ['$env.N8N_WEBHOOK_URL']);
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues === 0 ? 0 : 1);
