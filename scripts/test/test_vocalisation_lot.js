#!/usr/bin/env node
/**
 * LOT DE VOCALISATION — au-delà de 10 textes, on soumet un lot.
 *
 * Décision de Franck du 2026-11-24, après azy.daily#706.
 *
 * POURQUOI
 *   Le chemin synchrone traite les items UN PAR UN (`Loop Items` du worker) : sur
 *   la page mesurée, 71 commentaires = 71 appels HTTP successifs, ~1 040 s. Le lot
 *   les soumet en UNE requête, sans timeout, à 50 % du prix.
 *
 * ⚠️ ANTHROPIC SEULEMENT, et ce n'est pas un choix de confort. Les Message Batches
 *   sont propres à Anthropic (JSON pur). Chez OpenAI, le Batch API exige de
 *   TÉLÉVERSER un JSONL par l'API Files puis de passer son `input_file_id` — donc
 *   du multipart, impossible depuis un Code node n8n (Buffer altérés, mesuré).
 *
 * ⚠️ CONSÉQUENCE : le lot vocalise avec un modèle Claude là où le défaut synchrone
 *   est gpt-4o. D'où le contrôle le plus important de ce fichier : l'invite du lot
 *   doit être identique CARACTÈRE POUR CARACTÈRE à celle du chemin synchrone, lue
 *   dans l'autre fichier. C'est le seul moyen de limiter l'écart de rendu à ce qui
 *   vient du modèle lui-même.
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
const g = (o) => (o && typeof o === 'object') ? o : {};

const charger = (f) => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const FACADE    = charger('Torah_Vocalization_(Nekudot).json');
const WORKER    = charger('Torah_Vocalization_Worker.json');
const DISPATCH  = charger('Torah_Vocalization_Batch_Dispatcher.json');
const CALLBACK  = charger('Torah_Vocalization_Batch_Callback.json');
const POLLER    = charger('Claude_-_Batch_Poller.json');

// ⚠️ TOLÉRANT À L'ABSENCE : un nœud manquant doit faire ÉCHOUER en nommant le
// contrôle, pas PLANTER — un plantage masque tous les contrôles suivants.
const noeud = (wf, nom) => wf.nodes.find((x) => x.name === nom) || null;
const executer = (wf, nom, entree, contexte, env) => {
  const n = noeud(wf, nom);
  if (!n) return [{ json: { _noeud_absent: nom } }];
  const items = Array.isArray(entree) ? entree : [entree];
  const sortie = new Function('$input', '$', '$env', n.parameters.jsCode)(
    { first: () => ({ json: items[0] }), all: () => items.map((j) => ({ json: j })) },
    (n2) => {
      if (!(n2 in (contexte || {}))) throw new Error(`Referenced node is unexecuted: ${n2}`);
      const v = contexte[n2];
      const tab = Array.isArray(v) ? v : [v];
      return { first: () => ({ json: tab[0] }), all: () => tab.map((j) => ({ json: j })) };
    },
    env || {}
  );
  // Un Code node peut rendre un objet nu : n8n l'accepte. On normalise.
  return Array.isArray(sortie) ? sortie : [{ json: sortie }];
};

// ═════════════════════════════════════════════════════════════════════════════
// 1 · LE POINT DE BASCULE — ET SES TROIS CONDITIONS
// ═════════════════════════════════════════════════════════════════════════════
{
  const decider = (valide) => executer(FACADE, 'Décider du Chemin',
    { job_id: 'job-1' }, { 'Validate Input': valide })[0].json;
  const base = { itemCount: 11, provider: 'anthropic', projectId: 'proj-1' };

  const d = decider(base);
  egal('11 items chez anthropic → lot', d.chemin, 'batch');
  egal('le job_id traverse', d.job_id, 'job-1');
  egal('le seuil est rendu, pas seulement appliqué', d.seuil, 10);

  egal('10 items → lot (aligné sur la traduction)',
       decider(Object.assign({}, base, { itemCount: 10 })).chemin, 'batch');
  egal('9 items → synchrone',
       decider(Object.assign({}, base, { itemCount: 9 })).chemin, 'sync');
  ok('et le motif nomme le seuil',
     /9 < 10/.test(decider(Object.assign({}, base, { itemCount: 9 })).motif),
     decider(Object.assign({}, base, { itemCount: 9 })).motif);

  // ⚠️ Le défaut du parc est openai : un gros lot openai NE DOIT PAS partir chez
  // Anthropic, faute de quoi la clé de l'appelant serait envoyée au mauvais
  // fournisseur et le lot refusé — après avoir quitté la maison.
  const openai = decider(Object.assign({}, base, { provider: 'openai' }));
  egal('⚠️ 11 items chez openai → synchrone', openai.chemin, 'sync');
  ok('et le motif dit pourquoi', /anthropic/.test(openai.motif), openai.motif);
  egal('provider absent → synchrone',
       decider({ itemCount: 50, projectId: 'p' }).chemin, 'sync');

  // ⚠️ project_id manquant : le dispatcher de lot l'exige, donc un lot partirait
  // pour être refusé et le job resterait `pending` pour toujours.
  const sansProjet = decider(Object.assign({}, base, { projectId: null }));
  egal('⚠️ sans project_id → repli synchrone', sansProjet.chemin, 'sync');
  ok('et le motif le nomme', /project_id/.test(sansProjet.motif), sansProjet.motif);
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · LE CÂBLAGE DE LA FAÇADE — LES DEUX BRANCHES RÉPONDENT
// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ Un chemin terminal SANS nœud de réponse fait EXPIRER l'appelant : la façade
// est en `responseNode`, donc chaque branche doit rejoindre `Respond Created`.
{
  const cx = FACADE.connections;
  egal('Create Job → la décision',
       (g(g(cx['Create Job']).main)[0] || []).map((x) => x.node), ['Décider du Chemin']);
  ok('⚠️ la sortie d\'erreur de Create Job est préservée',
     (g(g(cx['Create Job']).main)[1] || []).map((x) => x.node).length > 0,
     JSON.stringify(g(cx['Create Job']).main));
  egal('vrai → le lot, faux → le worker',
       [(g(g(cx['Lot possible ?']).main)[0] || []).map((x) => x.node),
        (g(g(cx['Lot possible ?']).main)[1] || []).map((x) => x.node)],
       [['Lancer le Lot (async)'], ['Launch Worker (async)']]);
  egal('la branche lot répond',
       (g(g(cx['Lancer le Lot (async)']).main)[0] || []).map((x) => x.node), ['Respond Created']);
  egal('la branche synchrone répond toujours',
       (g(g(cx['Launch Worker (async)']).main)[0] || []).map((x) => x.node), ['Respond Created']);
  // Le lancement est asynchrone : un timeout long rendrait la façade bloquante.
  egal('le lot est lancé sans attendre',
       g(g(noeud(FACADE, 'Lancer le Lot (async)')).parameters).options.timeout, 5000);
  ok('et une panne du dispatcher ne casse pas la réponse',
     g(noeud(FACADE, 'Lancer le Lot (async)')).onError === 'continueRegularOutput');
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · LE CONTRAT D'ENTRÉE DU DISPATCHER
// ═════════════════════════════════════════════════════════════════════════════
{
  const valider = (body) => executer(DISPATCH, 'Validate Input', { body })[0].json;
  const bon = { items: [{ text: 'א', commentary_id: 1 }], api_key: 'sk-ant-X',
                project_id: 'p', provider: 'anthropic' };

  const v = valider(bon);
  ok('un lot conforme passe', v.valid, JSON.stringify(v.errors));
  egal('le modèle par défaut est Claude', v.model, 'claude-haiku-4-5-20251001');

  const refus = (body, motif) => {
    const r = valider(body);
    egal(`refusé — ${motif}`, r.valid, false);
    ok(`  et le motif est nommé (${motif})`, (r.errors || []).some((e) => new RegExp(motif, 'i').test(e)),
       JSON.stringify(r.errors));
  };
  refus(Object.assign({}, bon, { provider: 'openai' }), 'anthropic');
  refus(Object.assign({}, bon, { model: 'gpt-4o' }), 'model');
  refus(Object.assign({}, bon, { api_key: '' }), 'api_key');
  refus(Object.assign({}, bon, { project_id: '' }), 'project_id');
  refus(Object.assign({}, bon, { items: [] }), 'items');
  refus(Object.assign({}, bon, { items: [{ text: '', commentary_id: 1 }] }), 'text');
  // Au moins UN identifiant : sans lui, le résultat est payé puis non rattachable.
  refus(Object.assign({}, bon, { items: [{ text: 'א' }] }), 'commentary_id');

  // ⚠️ PLAFOND PAR ITEM. Au-delà, le budget dépasserait 16 000 jetons et la réponse
  // serait TRONQUÉE : des nekudot manquantes en fin de texte, sans erreur. Le
  // chemin synchrone découpe, le lot refuse — jamais de texte amputé en base.
  refus(Object.assign({}, bon, { items: [{ text: 'א'.repeat(8001), commentary_id: 1 }] }), '8000');
  ok('8 000 caractères pile passent',
     valider(Object.assign({}, bon, { items: [{ text: 'א'.repeat(8000), commentary_id: 1 }] })).valid);

  // Les trois natures d'identifiant sont acceptées (la vocalisation s'enregistre
  // aussi par source_text_id, contrairement à la traduction).
  for (const champ of ['commentary_id', 'source_text_id', 'segment_id']) {
    const it = { text: 'א' }; it[champ] = 7;
    ok(`\`${champ}\` suffit`, valider(Object.assign({}, bon, { items: [it] })).valid, champ);
  }
  // Reprise de job : en créer un second laisserait le premier `pending` à jamais.
  egal('un job fourni est relayé', valider(Object.assign({}, bon, { job_id: 'j-9' })).job_id, 'j-9');
  ok('et il est OMIS, pas posé à null, quand il manque', !('job_id' in valider(bon)),
     JSON.stringify(Object.keys(valider(bon))));
}

// ═════════════════════════════════════════════════════════════════════════════
// 4 · ⚠️ L'INVITE DU LOT EST CELLE DU CHEMIN SYNCHRONE, AU CARACTÈRE PRÈS
// ═════════════════════════════════════════════════════════════════════════════
// LE contrôle de ce fichier. Le lot vocalise avec Claude, le direct avec gpt-4o :
// si les invites divergent EN PLUS du modèle, plus personne ne pourra dire d'où
// vient un écart de nekudot. Lu dans les DEUX fichiers, jamais recopié ici.
{
  const build = () => executer(DISPATCH, 'Build Requests', {}, {
      'Validate Input': { items: [{ text: 'טקסט', commentary_id: 42 }],
                          api_key: 'sk-ant-X', model: 'claude-haiku-4-5-20251001',
                          project_id: 'p', context: { traite: 'Pesachim', page: '22a' } },
      'Résoudre Job': { job_id: 'job-7' } },
      { N8N_WEBHOOK_URL: 'http://llm.local:5678' })[0].json;
  const lot = build();
  const req = lot.requests[0];

  // L'invite du chemin synchrone vit dans une EXPRESSION, pas un Code node.
  const exprSync = String(g(g(noeud(WORKER, 'Vocaliser (LLM)')).parameters).jsonBody);
  const corpsSync = JSON.parse(new Function('$json', 'return (' +
    exprSync.replace(/^=\{\{/, '').replace(/\}\}$/, '') + ');')(
    { text: 'טקסט', provider: 'anthropic', model: 'claude-haiku-4-5-20251001',
      providerCle: 'k', reasoningEffort: null, reasoningConfig: null }));

  egal('⚠️ l\'invite système est IDENTIQUE à celle du direct',
       req.params.system, corpsSync.system);
  egal('⚠️ et la consigne utilisateur aussi',
       req.params.messages[0].content, corpsSync.messages[0].content);
  egal('⚠️ et le budget suit la même formule', req.params.max_tokens, corpsSync.max_tokens);

  // custom_id : sur commentary_id seul, tout item sans lui vaudrait « null » et
  // Anthropic refuserait le LOT ENTIER (« custom_id`s must be unique »).
  egal('custom_id = l\'identifiant de l\'item', req.custom_id, '42');
  egal('le rappel visé est celui de la vocalisation', lot.callback_url,
       'http://llm.local:5678/webhook/torah-vocalization-callback');
  egal('le lot est annoncé multi', lot.metadata.multi, true);
  egal('le job voyage dans la metadata', lot.metadata.job_id, 'job-7');
  egal('la provenance est anthropic', lot.metadata.provider, 'anthropic');
  // La carte dit la NATURE de la cible, et porte le texte d'origine : le callback
  // doit rendre { original, vocalized } sans relire la base.
  egal('la carte rattache par commentary_id', lot.metadata.carte_items['42'].commentary_id, 42);
  egal('et porte le texte source', lot.metadata.carte_items['42'].original, 'טקסט');
  ok('l\'appairage est OMIS quand il n\'est pas demandé', !('correlation_id' in lot),
     JSON.stringify(Object.keys(lot)));

  // Les trois natures, et le plafond du budget.
  const lot3 = executer(DISPATCH, 'Build Requests', {}, {
      'Validate Input': { items: [{ text: 'a', commentary_id: 1 }, { text: 'b', source_text_id: 2 },
                                  { text: 'א'.repeat(9000), segment_id: 3 }],
                          model: 'claude-haiku-4-5-20251001', api_key: 'k', project_id: 'p',
                          context: {}, correlation_id: 'corr-1' },
      'Résoudre Job': { job_id: 'j' } }, { N8N_WEBHOOK_URL: 'http://llm.local:5678' })[0].json;
  egal('un custom_id par item, distincts',
       lot3.requests.map((r) => r.custom_id), ['1', '2', '3']);
  egal('la carte distingue les trois natures',
       [lot3.metadata.carte_items['1'].commentary_id, lot3.metadata.carte_items['2'].source_text_id,
        lot3.metadata.carte_items['3'].segment_id], [1, 2, 3]);
  egal('le budget est plafonné à 16 000', lot3.requests[2].params.max_tokens, 16000);
  egal('l\'appairage demandé est au premier niveau', lot3.correlation_id, 'corr-1');
}

// ═════════════════════════════════════════════════════════════════════════════
// 5 · LE RAPPEL — CE QUI S'ENREGISTRE, ET CE QUI NE S'ENREGISTRE PAS
// ═════════════════════════════════════════════════════════════════════════════
{
  const rappel = (results, carte) => ({ body: { results: results, batch_id: 'msgbatch_x',
    metadata: { multi: true, job_id: 'job-7', project_id: 'p', provider: 'anthropic',
                model: 'claude-haiku-4-5-20251001', traite: 'Pesachim', page: '22a',
                carte_items: carte || { '42': { commentary_id: 42, original: 'טקסט' } } } } });
  const eclater = (results, carte) => {
    const v = executer(CALLBACK, 'Validate Input', rappel(results, carte))[0].json;
    return executer(CALLBACK, 'Éclater Résultats', v).map((x) => x.json);
  };

  const bon = eclater([{ custom_id: '42', ok: true, text: ' טֶקְסְט ', stop_reason: 'end_turn' }]);
  egal('un résultat normal est enregistrable', bon[0].ok, true);
  egal('le texte est rogné', bon[0]._saveData.vocalized_text, 'טֶקְסְט');
  egal('⚠️ `vocalized_by` garde la forme du chemin synchrone',
       bon[0]._saveData.vocalized_by, 'llm:claude-haiku-4-5-20251001');
  egal('les trois identifiants sont présents, à null quand ils ne s\'appliquent pas',
       [bon[0]._saveData.commentary_id, bon[0]._saveData.source_text_id, bon[0]._saveData.segment_id],
       [42, null, null]);
  egal('le texte d\'origine est rendu', bon[0].original, 'טקסט');

  // ⚠️ `stop_reason` ABSENT n'est pas une troncature : si le poller n'est pas encore
  // réimporté, le champ vaut undefined partout. Refuser jetterait un lot déjà payé.
  egal('⚠️ stop_reason absent → on enregistre quand même',
       eclater([{ custom_id: '42', ok: true, text: 'טֶקְסְט' }])[0].ok, true);
  for (const fin of ['end_turn', 'stop_sequence']) {
    egal(`\`${fin}\` est une fin normale chez Anthropic`,
         eclater([{ custom_id: '42', ok: true, text: 'טֶקְסְט', stop_reason: fin }])[0].ok, true);
  }

  // ⚠️ CHAQUE REFUS EST TESTÉ AVEC UN ITEM SAIN À CÔTÉ. Seul, un item non
  // enregistrable fait rendre la SENTINELLE `aucun_envoi` (testée en section 6) et
  // non la liste des items : le contrôle porterait alors sur le mauvais objet et
  // passerait pour la mauvaise raison.
  const CARTE2 = { '42': { commentary_id: 42, original: 'טקסט' },
                   '43': { commentary_id: 43, original: 'אחר' } };
  const SAIN = { custom_id: '43', ok: true, text: 'אַחֵר', stop_reason: 'end_turn' };
  const refus = (r, code, nom) => {
    const items = eclater([r, SAIN], CARTE2);
    const it = items.find((x) => x.custom_id === String(r.custom_id)) || {};
    egal(`${nom} → non enregistré`, it.ok, false);
    egal(`${nom} → code`, g(it.error).code, code);
    egal(`${nom} → rien à écrire`, it._saveData, null);
    // Et l'item sain, lui, part en base : un item fautif n'emporte pas le lot.
    egal(`${nom} → l'item sain reste enregistrable`,
         (items.find((x) => x.custom_id === '43') || {}).ok, true);
  };
  // ⚠️ Un texte tronqué enregistré comme complet = des nekudot manquantes en fin de
  // texte, sans aucune erreur. Même doctrine que `Recoller Vocalisation`.
  refus({ custom_id: '42', ok: true, text: 'טֶ', stop_reason: 'max_tokens' },
        'GENERATION_TRONQUEE', 'tronqué par max_tokens');
  refus({ custom_id: '42', ok: true, text: '   ' }, 'EMPTY_LLM_RESPONSE', 'texte vide');
  refus({ custom_id: '42', ok: false, error: { message: 'boom' } }, 'BATCH_ITEM_FAILED', 'échec Anthropic');
  // Payé, produit, non rattachable : à remonter, jamais à écrire au hasard.
  refus({ custom_id: '999', ok: true, text: 'טֶקְסְט', stop_reason: 'end_turn' },
        'CIBLE_INTROUVABLE', 'custom_id hors carte');

  // Sans carte, un lot entier serait non rattachable : refus bruyant.
  const sansCarte = executer(CALLBACK, 'Validate Input',
    { body: { results: [{ custom_id: '1', ok: true, text: 'x' }], metadata: {} } })[0].json;
  egal('⚠️ metadata.carte_items absente → refus', sansCarte.valid, false);
  ok('et le motif le nomme', (sansCarte.errors || []).some((e) => /carte_items/.test(e)),
     JSON.stringify(sansCarte.errors));
  // metadata sérialisée : cas défensif déjà rencontré sur le callback de traduction.
  const chaine = executer(CALLBACK, 'Validate Input', { body: { results: [{ custom_id: '42', ok: true, text: 'x' }],
    metadata: JSON.stringify({ job_id: 'job-7', carte_items: { '42': { commentary_id: 42 } } }) } })[0].json;
  egal('⚠️ une metadata en CHAÎNE JSON est relue', chaine.valid, true);
  egal('et le job en ressort', chaine.data.job_id, 'job-7');
}

// ═════════════════════════════════════════════════════════════════════════════
// 6 · L'AGRÉGATION — CE QUI EST VRAIMENT EN BASE
// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ Le nœud de sauvegarde porte `continueRegularOutput` : une erreur HTTP ne
// stoppe pas la chaîne et n'émet AUCUN statusCode (azy.daily#442). D'où
// `fullResponse` sur le nœud, et une absence de code traitée comme un ÉCHEC.
{
  const save = noeud(CALLBACK, 'Sauvegarder Vocalisation');
  egal('la sauvegarde vise /api/vocalization/save',
       g(save).parameters.url, '={{ $env.TORAH_API_URL }}/api/vocalization/save');
  egal('⚠️ fullResponse est actif, sinon statusCode est undefined',
       g(save).parameters.options.response.response.fullResponse, true);
  egal('et une écriture refusée n\'arrête pas le lot', g(save).onError, 'continueRegularOutput');

  const prevus = [
    { custom_id: '1', job_id: 'job-7', project_id: 'p', traite: 'T', page: '2a',
      _saveData: { commentary_id: 1 } },
    { custom_id: '2', job_id: 'job-7', _saveData: { commentary_id: 2 } },
    { custom_id: '3', job_id: 'job-7', _saveData: null,
      error: { code: 'GENERATION_TRONQUEE', message: 'tronque' } }];
  const agr = executer(CALLBACK, 'Agréger',
    [{ statusCode: 200 }, { statusCode: 500 }], { 'Éclater Résultats': prevus })[0].json;
  egal('un enregistré sur trois', agr.resume, { total: 3, enregistres: 1, echecs: 2 });
  egal('le succès est partiel mais réel', agr.success, true);
  ok('l\'écriture refusée est nommée',
     agr.echecs.some((e) => g(e.error).code === 'SAVE_FAILED'), JSON.stringify(agr.echecs));
  ok('la troncature aussi',
     agr.echecs.some((e) => g(e.error).code === 'GENERATION_TRONQUEE'), JSON.stringify(agr.echecs));

  // ⚠️ Sans statusCode du tout (le défaut d'azy.daily#442), on compte un ÉCHEC et
  // non un succès : un compteur faussement vert est pire qu'un compteur rouge.
  const sansCode = executer(CALLBACK, 'Agréger', [{ body: {} }, { body: {} }],
    { 'Éclater Résultats': prevus.slice(0, 2) })[0].json;
  egal('⚠️ statusCode absent → échec, jamais succès', sansCode.resume.enregistres, 0);

  // ⚠️ SENTINELLE : si rien n'est enregistrable, la chaîne doit CONTINUER. Un nœud
  // HTTP sans item ne s'exécute pas, et le job resterait « processing » à jamais.
  const vide = executer(CALLBACK, 'Éclater Résultats',
    { data: { job_id: 'job-7', project_id: 'p', carte_items: {},
              results: [{ custom_id: 'x', ok: false, error: { message: 'boom' } }] } })[0].json;
  egal('⚠️ aucun envoi → sentinelle, pas un tableau vide', vide.aucun_envoi, true);
  const agrVide = executer(CALLBACK, 'Agréger', vide, {})[0].json;
  egal('le job est quand même clos', agrVide.job_id, 'job-7');
  egal('et l\'échec est total', agrVide.resume, { total: 1, enregistres: 0, echecs: 1 });
  egal('success est faux', agrVide.success, false);
}

// ═════════════════════════════════════════════════════════════════════════════
// 7 · L'ÉVÉNEMENT, ET LE CANAL QUI FAIT FOI
// ═════════════════════════════════════════════════════════════════════════════
{
  const ev = executer(CALLBACK, 'Préparer Événement',
    { job_id: 'job-7', success: true, traite: 'Pesachim', page: '22a',
      resume: { total: 11, enregistres: 11, echecs: 0 } })[0].json;
  egal('le stream est celui des résultats', ev.stream, 'llm:results:stream');
  egal('l\'événement est nommé', ev.fields.event, 'vocalization_complete');
  // ⚠️ L'appariement de la vocalisation se fait par job_id, pas correlation_id.
  egal('⚠️ apparié par job_id', ev.fields.job_id, 'job-7');
  egal('le mode est annoncé', ev.fields.mode, 'batch');
  // ⚠️ Pas de repli `|| ''` : il publierait du VIDE, qui ressemble à un événement
  // valide et ne s'apparie à rien.
  ok('⚠️ un job_id absent ne publie pas une chaîne vide',
     executer(CALLBACK, 'Préparer Événement', { resume: {} })[0].json.fields.job_id !== '',
     JSON.stringify(executer(CALLBACK, 'Préparer Événement', { resume: {} })[0].json.fields.job_id));
  ok('l\'appairage n\'est ajouté que s\'il existe', !('correlation_id' in ev.fields));

  // ⚠️ L'ORDRE COMPTE : `vocalization_complete` n'a AUCUN consommateur (plugin
  // dispatch-only depuis #514). Le canal qui fait foi est /api/v2/jobs, donc la
  // clôture du job doit précéder la publication.
  const cx = CALLBACK.connections;
  const apresAgreger = (g(g(cx['Agréger']).main)[0] || []).map((x) => x.node);
  ok('la clôture du job est branchée avant l\'événement',
     apresAgreger.indexOf('Job Présent ?') < apresAgreger.indexOf('Préparer Événement'),
     JSON.stringify(apresAgreger));
  egal('les deux branches du job rejoignent la réponse',
       [(g(g(cx['Job Présent ?']).main)[0] || []).map((x) => x.node),
        (g(g(cx['Job Présent ?']).main)[1] || []).map((x) => x.node)],
       [['Update Job'], ['Format Success Response']]);
}

// ═════════════════════════════════════════════════════════════════════════════
// 8 · LE POLLER REMONTE `stop_reason` — SANS QUOI LE GARDE-FOU EST AVEUGLE
// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ Avant azy.daily#706, la branche multi réduisait chaque résultat à
// { custom_id, ok, text } : une réponse tronquée arrivait avec ok: true et un
// texte partiel, enregistrée comme complète. Le callback de TRADUCTION ne lit
// toujours pas ce champ — arbitrage à part, signalé.
{
  const code = String(g(g(noeud(POLLER, 'Process Results')).parameters).jsCode);
  ok('⚠️ le poller remonte stop_reason en mode multi',
     /stop_reason: msg\.stop_reason/.test(code));
  ok('et l\'usage avec', /usage: msg\.usage/.test(code));
  ok('le rappel vise bien le callback_url du lot',
     /callback_url/.test(String(g(g(noeud(POLLER, 'POST Callback')).parameters).url)),
     String(g(g(noeud(POLLER, 'POST Callback')).parameters).url));
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues === 0 ? 0 : 1);
