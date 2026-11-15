#!/usr/bin/env node
/**
 * TRADUCTION TORAH MULTI-FOURNISSEURS — anthropic | openai | google.
 *
 * CE QUE CE FICHIER GARDE, ET POURQUOI IL EXISTE
 * Mesuré le 2026-11-14 sur les JSON de `develop`, à la demande de plugin-torah
 * (CLI batch admin, Franck veut pouvoir viser Gemini) :
 *
 *   torah-translate-page   ne lisait NI `model` NI `provider` — jetés en silence,
 *                          sans 400, sans trace
 *   torah-router           lisait les deux, mais `provider` n'orientait aucun appel
 *   torah-translate        (= Torah Translate Simple, PAS Torah Translate Worker)
 *                          tapait api.anthropic.com EN DUR dans ses 3 nœuds
 *   torah-vocalization     gpt-4o en dur — hors de ce correctif, assumé
 *
 *   et AUCUN $env de modèle ou de clé LLM dans les 43 workflows Torah : les
 *   défauts sont littéraux dans les nœuds Code.
 *
 * ⚠️ Ce fichier mesure le CÂBLAGE et le comportement des nœuds Code, pas le
 * service : il ne prouve pas qu'une traduction Gemini aboutit, seulement que le
 * fournisseur choisi atteint le relais et que le lot ne part plus chez Anthropic
 * avec un modèle qui n'y existe pas. La preuve en service se lit sur une
 * exécution réelle.
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
const simple     = lire('Torah_Translate_Simple.json');
const router     = lire('Torah_Router.json');
const page       = lire('Torah_Translate_Page.json');
const dispatcher = lire('Torah_Batch_Dispatcher.json');
const relais     = lire('LLM_-_Call_Messages.json');

const noeud = (wf, nom) => wf.nodes.find((n) => n.name === nom);
const sorties = (wf, nom, i) => ((wf.connections[nom] || {}).main || [])[i] || [];
/** Le code d'un nœud, commentaires retirés : une référence en commentaire ne s'exécute pas. */
const codeNu = (wf, nom) => (noeud(wf, nom).parameters.jsCode || '')
  .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const executer = (wf, nom, entree, contexte) => {
  const r = new Function('$input', '$', '$env', noeud(wf, nom).parameters.jsCode)(
    { first: () => ({ json: entree }), all: () => [{ json: entree }] },
    (n) => {
      if (!(n in (contexte || {}))) throw new Error(`Referenced node is unexecuted: ${n}`);
      return { first: () => ({ json: contexte[n] }) };
    },
    { N8N_WEBHOOK_URL: 'http://llm.local:5678' });
  return Array.isArray(r) ? r[0].json : r;
};
/**
 * Évalue le corps `={{ JSON.stringify({...}) }}` d'un nœud avec un $json donné.
 * `jsonBody` sur un httpRequest, `responseBody` sur un respondToWebhook — deux
 * noms de champ pour la même expression, et confondre les deux fait planter la
 * suite entière au chargement plutôt qu'échouer sur un contrôle.
 */
const corpsHttp = (wf, nom, j) => {
  const p = noeud(wf, nom).parameters;
  const brut = p.jsonBody !== undefined ? p.jsonBody : p.responseBody;
  if (brut === undefined) throw new Error(`ni jsonBody ni responseBody sur ${nom}`);
  const jb = brut.trim();
  const inner = jb.slice(3, -2).replace(/\$env\.([A-Z_]+)/g, 'ENV.$1').replace(/\$json/g, 'J');
  return JSON.parse(new Function('J', 'ENV', `return (${inner});`)(j, { N8N_WEBHOOK_URL: 'x' }));
};

// ═════════════════════════════════════════════════════════════════════════════
// 1 · LE RELAIS EST LA CIBLE, ET SON CONTRAT EST CELUI QU'ON CROIT
// ═════════════════════════════════════════════════════════════════════════════
// Sans ce bloc, tout le reste pourrait viser une énumération qui a changé chez
// le relais sans que personne ici ne le sache.
{
  const c = codeNu(relais, 'Validate Input');
  ok('le relais accepte bien `google`', /'google'/.test(c));
  ok('le relais N\'accepte PAS `gemini` — c\'est `google`, et c\'est le piège',
     !/'gemini'/.test(c));
  for (const p of ['anthropic', 'openai', 'google']) {
    ok(`le relais accepte \`${p}\``, new RegExp(`'${p}'`).test(c));
  }
  // La clé est dans le CORPS, jamais en en-tête côté appelant.
  ok('le relais exige `api_key` dans le corps, sans repli d\'environnement',
     /body\.api_key/.test(c) && /aucun fallback sur env/i.test(
       noeud(relais, 'Validate Input').parameters.jsCode));
  // L'enveloppe de sortie : le texte est en data.text, et NULLE PART ailleurs.
  const fmt = noeud(relais, 'Format Gemini').parameters.jsCode;
  ok('l\'enveloppe du relais rend le texte en `data.text`', /data:\s*\{\s*text:/.test(fmt));
  ok('l\'enveloppe du relais rend la provenance en `meta.provider`',
     /meta:\s*\{\s*provider:/.test(fmt));
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · TORAH TRANSLATE SIMPLE — les 3 appels passent par le relais
// ═════════════════════════════════════════════════════════════════════════════
const TRADUCTEURS = ['Traduire Structuré (LLM)', 'Traduire Direct (LLM)', 'Traduire Repli (LLM)'];
{
  for (const nom of TRADUCTEURS) {
    const n = noeud(simple, nom);
    ok(`\`${nom}\` existe (nœud renommé — « Claude … » mentait dès qu'on vise Gemini)`, !!n);
    if (!n) continue;
    ok(`\`${nom}\` ne tape plus api.anthropic.com en dur`,
       !/api\.anthropic\.com/.test(n.parameters.url), n.parameters.url);
    ok(`\`${nom}\` appelle /webhook/llm-call-messages`,
       /\/webhook\/llm-call-messages$/.test(n.parameters.url), n.parameters.url);
    // Les en-têtes de fournisseur n'ont plus rien à faire ici : les garder
    // enverrait une clé Anthropic dans un appel Gemini.
    ok(`\`${nom}\` n'envoie plus d'en-tête de fournisseur`,
       !n.parameters.sendHeaders && !n.parameters.headerParameters);
    // Sans neverError, onError=continueRegularOutput avale le statut et une
    // erreur du relais devient indistinguable d'une réponse vide (#442).
    ok(`\`${nom}\` lit le statut HTTP (fullResponse + neverError)`,
       n.parameters.options.response.response.fullResponse === true &&
       n.parameters.options.response.response.neverError === true);
  }
  // Le câblage ne doit pas avoir bougé d'un fil par le renommage.
  egal('`Needs Structured?` vrai → Traduire Structuré',
       sorties(simple, 'Needs Structured?', 0).map((c) => c.node), ['Traduire Structuré (LLM)']);
  egal('`Needs Structured?` faux → Traduire Direct',
       sorties(simple, 'Needs Structured?', 1).map((c) => c.node), ['Traduire Direct (LLM)']);
  egal('`Needs Fallback?` vrai → Traduire Repli',
       sorties(simple, 'Needs Fallback?', 0).map((c) => c.node), ['Traduire Repli (LLM)']);
  for (const [t, e] of [['Traduire Structuré (LLM)', 'Extract Structured'],
                        ['Traduire Direct (LLM)', 'Extract Direct'],
                        ['Traduire Repli (LLM)', 'Extract Fallback']]) {
    egal(`\`${t}\` → \`${e}\``, sorties(simple, t, 0).map((c) => c.node), [e]);
  }
  ok('aucun ancien nom « Claude … » ne subsiste',
     !JSON.stringify(simple.nodes).includes('"Claude Structured"') &&
     !JSON.stringify(simple.connections).includes('Claude Direct'));
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · PARSE INPUT — résolution du fournisseur et de SA clé
// ═════════════════════════════════════════════════════════════════════════════
const pi = (body) => executer(simple, 'Parse Input', { body });
{
  // (a) RÉTROCOMPATIBILITÉ — un appelant d'hier ne change rien à son appel.
  const hier = pi({ text: 'שלום', api_key: 'sk-ant-x' });
  egal('sans `provider`, le fournisseur vaut anthropic', hier.provider, 'anthropic');
  egal('sans `provider`, `api_key` sert de clé', hier.providerCle, 'sk-ant-x');
  egal('sans `model`, le défaut historique est conservé', hier.model, 'claude-sonnet-4-6');

  // (b) GOOGLE par plugin_context — le chemin que plugin-torah utilisera.
  const g = pi({ text: 'שלום', api_key: 'sk-ant-x', provider: 'google',
                 model: 'gemini-2.5-pro',
                 plugin_context: { api_keys: { google: 'AIza-y' } } });
  egal('provider google est retenu', g.provider, 'google');
  egal('la clé google vient de plugin_context', g.providerCle, 'AIza-y');
  ok('⚠️ la clé Anthropic n\'est PAS utilisée pour un appel google',
     g.providerCle !== 'sk-ant-x');
  egal('le modèle gemini est transmis verbatim', g.model, 'gemini-2.5-pro');

  // (c) provider_api_key passe devant tout le reste.
  const d = pi({ text: 'x', api_key: 'sk-ant-x', provider: 'openai',
                 provider_api_key: 'sk-oai-z',
                 plugin_context: { api_keys: { openai: 'ignoree' } } });
  egal('`provider_api_key` est prioritaire', d.providerCle, 'sk-oai-z');

  // (d) ERREURS NOMMÉES — le but est qu'un appelant sache QUEL champ corriger.
  const sansCle = pi({ text: 'x', provider: 'google' });
  egal('google sans aucune clé est refusé', sansCle.success, false);
  egal('le code nomme le fournisseur manquant', sansCle.error.code, 'MISSING_PROVIDER_API_KEY');
  ok('le message nomme le champ à fournir',
     /plugin_context\.api_keys\.google/.test(sansCle.error.message), sansCle.error.message);
  // Mémoire n8n : un deux-points tronque le message analysé en aval.
  ok('aucun deux-points dans le message d\'erreur', !sansCle.error.message.includes(':'));

  const gemini = pi({ text: 'x', api_key: 'k', provider: 'gemini' });
  egal('`gemini` est refusé — l\'énumération dit `google`', gemini.error.code, 'INVALID_PROVIDER');
  ok('le message DIT que Gemini s\'appelle google',
     /google/.test(gemini.error.message), gemini.error.message);

  const sansRien = pi({ text: 'x' });
  egal('anthropic sans clé garde le code historique', sansRien.error.code, 'MISSING_API_KEY');
}

// ═════════════════════════════════════════════════════════════════════════════
// 4 · LE CORPS ENVOYÉ AU RELAIS EST CELUI QUE LE RELAIS EXIGE
// ═════════════════════════════════════════════════════════════════════════════
{
  const j = pi({ text: 'שלום', provider: 'google', model: 'gemini-2.5-pro',
                 target_language: 'fr',
                 plugin_context: { api_keys: { google: 'AIza-y' } } });
  for (const nom of TRADUCTEURS) {
    const corps = corpsHttp(simple, nom, j);
    egal(`\`${nom}\` envoie provider=google`, corps.provider, 'google');
    egal(`\`${nom}\` envoie le modèle demandé`, corps.model, 'gemini-2.5-pro');
    egal(`\`${nom}\` envoie la clé DU FOURNISSEUR`, corps.api_key, 'AIza-y');
    ok(`\`${nom}\` garde la forme messages[] attendue par le relais`,
       Array.isArray(corps.messages) && corps.messages.length === 1 &&
       corps.messages[0].role === 'user' && typeof corps.messages[0].content === 'string' &&
       corps.messages[0].content.length > 20);
    egal(`\`${nom}\` conserve max_tokens`, corps.max_tokens, 8192);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 5 · LES EXTRACT LISENT L'ENVELOPPE, PAS LA RÉPONSE BRUTE D'ANTHROPIC
// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ C'est ici que le portage se joue. `body.content[0].text` aurait rendu VIDE
// en silence pour tout fournisseur — une panne sans erreur.
{
  const base = pi({ text: 'שלום', api_key: 'k', target_language: 'fr' });
  const enveloppe = (texte) => ({
    statusCode: 200,
    body: { success: true, data: { text: texte, model: 'gemini-2.5-pro', finish_reason: 'STOP' },
            meta: { provider: 'google', model: 'gemini-2.5-pro',
                    usage: { prompt_tokens: 11, completion_tokens: 22 } } },
  });

  const direct = executer(simple, 'Extract Direct', enveloppe('Bonjour'), { 'Parse Input': base });
  egal('Extract Direct lit `data.text`', direct.translation, 'Bonjour');
  egal('Extract Direct remonte les jetons du relais', direct.tokens,
       { input_tokens: 11, output_tokens: 22 });
  egal('Extract Direct expose la provenance RÉELLE', direct.provider_utilise, 'google');
  egal('Extract Direct expose le modèle RÉELLEMENT servi', direct.model_utilise, 'gemini-2.5-pro');

  // Un texte absent doit se SIGNALER, pas passer pour une traduction vide.
  const vide = executer(simple, 'Extract Direct',
    { statusCode: 200, body: { success: true, data: {}, meta: {} } }, { 'Parse Input': base });
  egal('une enveloppe sans texte est une erreur nommée', vide.error.code, 'EMPTY_RESPONSE');

  // Erreur du relais : le statut HTTP réel doit survivre jusqu'à l'appelant.
  const ko = executer(simple, 'Extract Direct',
    { statusCode: 400, body: { success: false,
        error: { code: 'INVALID_PROVIDER', message: 'provider invalide', http_status: 400 } } },
    { 'Parse Input': base });
  egal('une erreur du relais est rendue en échec', ko.success, false);
  egal('le code d\'erreur du relais est conservé', ko.error.code, 'INVALID_PROVIDER');
  ok('le statut HTTP réel est visible dans le message',
     /\[http 400\]/.test(ko.error.message), ko.error.message);

  // Structuré : la sortie JSON attendue est lue depuis data.text, et l'échec
  // bascule bien vers le repli au lieu de casser.
  const struct = executer(simple, 'Extract Structured',
    enveloppe(JSON.stringify({ english_pivot: 'Hello', translation: 'Bonjour' })),
    { 'Parse Input': base });
  egal('Extract Structured lit le JSON depuis `data.text`', struct.translation, 'Bonjour');
  egal('Extract Structured garde le pivot anglais', struct.english_pivot, 'Hello');
  egal('Extract Structured expose la provenance', struct.provider_utilise, 'google');

  const basculeRepli = executer(simple, 'Extract Structured',
    { statusCode: 500, body: { success: false, error: { message: 'boom', http_status: 500 } } },
    { 'Parse Input': base });
  egal('une erreur en structuré bascule sur le repli', basculeRepli.fallbackToDirectTranslation, true);

  const repli = executer(simple, 'Extract Fallback', enveloppe('Bonjour'),
    { 'Extract Structured': basculeRepli });
  egal('Extract Fallback lit `data.text`', repli.translation, 'Bonjour');
  egal('Extract Fallback expose la provenance', repli.provider_utilise, 'google');

  // Et aucun des trois ne doit plus lire la forme brute d'Anthropic.
  for (const n of ['Extract Direct', 'Extract Structured', 'Extract Fallback']) {
    ok(`\`${n}\` ne lit plus \`content[0].text\``,
       !/content\?\.\[0\]\?\.text/.test(codeNu(simple, n)));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 6 · LA VÉRIFICATION LISAIT TROIS CLÉS QUI N'EXISTENT PAS
// ═════════════════════════════════════════════════════════════════════════════
// Défaut trouvé le 2026-11-14 : `Appliquer Vérification` lisait
// `brut.content || brut.text || brut.message`. L'enveloppe du relais n'a aucune
// de ces clés au premier niveau — la relecture retombait TOUJOURS sur
// `relecteur_reponse_vide`, sans jamais rendre d'avis ni d'erreur.
{
  const avis = { approved: false, confidence: 0.6,
                 issues: [{ severite: 'sens', extrait: 'x', explication: 'y' }],
                 suggestion: 'Shalom', notes: 'n' };
  const prec = { success: true, translation: 'Bonjour',
                 _verify: { provider: 'google', model: 'gemini-2.5-pro' } };
  const r = executer(simple, 'Appliquer Vérification',
    { statusCode: 200, body: { success: true, data: { text: JSON.stringify(avis) }, meta: {} } },
    { 'Préparer Vérification': prec });

  ok('la relecture rend enfin un avis', r.verification !== null,
     `verify_skipped = ${r.verify_skipped}`);
  egal('aucun saut n\'est déclaré', r.verify_skipped, null);
  // Déréférencement protégé : sans avis, ces contrôles DOIVENT échouer en les
  // nommant, pas faire planter la suite — un plantage masque les 130 suivants.
  const v = r.verification || {};
  egal('le désaccord du relecteur est conservé', v.approved, false);
  egal('la suggestion n\'est gardée QUE sur désaccord', v.suggestion, 'Shalom');
  egal('⚠️ la traduction livrée n\'est JAMAIS remplacée', r.translation, 'Bonjour');
  egal('le fournisseur du relecteur est tracé', v.provider, 'google');

  // Et un relecteur approbateur ne doit pas laisser de suggestion.
  const okAvis = executer(simple, 'Appliquer Vérification',
    { statusCode: 200, body: { success: true,
        data: { text: JSON.stringify({ approved: true, confidence: 0.9 }) }, meta: {} } },
    { 'Préparer Vérification': prec });
  egal('sur approbation, aucune suggestion', (okAvis.verification || {}).suggestion, null);

  // Le chemin d'échec reste tolérant : pas d'avis, mais la traduction sort.
  const illisible = executer(simple, 'Appliquer Vérification',
    { statusCode: 200, body: { success: true, data: { text: 'pas du json' }, meta: {} } },
    { 'Préparer Vérification': prec });
  egal('un avis illisible ne casse pas la traduction', illisible.translation, 'Bonjour');
  egal('et il se signale', illisible.verify_skipped, 'relecteur_json_illisible');
}

// ═════════════════════════════════════════════════════════════════════════════
// 6 bis · UN VERDICT MUET N'EST PAS UNE APPROBATION  (azy.daily#669, point 7)
// ═════════════════════════════════════════════════════════════════════════════
// Défaut trouvé le 2026-11-15 : `const approuve = avis.approved !== false;`
// traitait un JSON valide SANS clé `approved` comme une approbation. Le relecteur
// n'avait rien dit et nous enregistrions son accord.
//
// ⚠️ Ce défaut est INVISIBLE depuis torah.api. Leur `review.approved` est
// désormais obligatoire et `StrictBool`, mais leur validation ne voit que la
// valeur reçue : un `true` fabriqué ici leur arrive impeccable. Le seul endroit
// où l'information « pas de verdict » existe encore est ce nœud.
//
// Ces contrôles sont ROUGES sur l'ancien code — vérifié en le remettant.
{
  const prec = { success: true, translation: 'Bonjour',
                 _verify: { provider: 'anthropic', model: 'claude-sonnet-4-6' } };
  const rendre = (avis) => executer(simple, 'Appliquer Vérification',
    { statusCode: 200, body: { success: true, data: { text: JSON.stringify(avis) }, meta: {} } },
    { 'Préparer Vérification': prec });

  // Les quatre formes qui passaient pour une approbation.
  for (const [nom, avis] of [
    ['clé absente',        { confidence: 0.9, notes: 'rien dit' }],
    ['approved null',      { approved: null, confidence: 0.9 }],
    ['approved "true"',    { approved: 'true', confidence: 0.9 }],
    ['approved 1',         { approved: 1, confidence: 0.9 }],
  ]) {
    const r = rendre(avis);
    egal(`⚠️ ${nom} → AUCUN verdict`, r.verification, null);
    egal(`⚠️ ${nom} → motif explicite`, r.verify_skipped, 'relecteur_avis_sans_verdict');
    egal(`${nom} → la traduction sort intacte`, r.translation, 'Bonjour');
  }

  // Et les deux seules formes acceptées le restent, inchangées.
  const vrai = rendre({ approved: true, confidence: 0.95 });
  egal('approved true reste un verdict', (vrai.verification || {}).approved, true);
  egal('approved true → divergence false', (vrai.verification || {}).divergence, false);
  egal('approved true → aucun saut', vrai.verify_skipped, null);

  const faux = rendre({ approved: false, confidence: 0.4, suggestion: 'Shalom' });
  egal('approved false reste un verdict', (faux.verification || {}).approved, false);
  egal('approved false → divergence true', (faux.verification || {}).divergence, true);
  egal('approved false → suggestion conservée', (faux.verification || {}).suggestion, 'Shalom');

  // `approved` ne doit JAMAIS sortir autrement que booléen strict.
  for (const r of [vrai, faux]) {
    ok('`approved` est un booléen strict',
       typeof (r.verification || {}).approved === 'boolean');
  }

  // Le code ne doit plus porter la forme optimiste.
  //
  // ⚠️ PIÈGE RENCONTRÉ EN ÉCRIVANT CE TEST : chercher la sous-chaîne
  // `avis.approved !== false` échoue, parce que le GARDE-FOU STRICT la contient
  // dans sa seconde moitié (`… !== true && avis.approved !== false`). Une
  // assertion négative sur une sous-chaîne ne distingue pas le défaut de son
  // correctif. On vise donc l'AFFECTATION, qui est le défaut réel.
  const codeVerdict = codeNu(simple, 'Appliquer Vérification');
  ok('⚠️ l\'affectation optimiste a disparu',
     !/const\s+approuve\s*=\s*avis\.approved\s*!==\s*false/.test(codeVerdict));
  ok('le garde-fou strict est présent',
     /avis\.approved\s*!==\s*true\s*&&\s*avis\.approved\s*!==\s*false/.test(codeVerdict));
  ok('et il rend un motif nommé',
     /relecteur_avis_sans_verdict/.test(codeVerdict));
}

// ═════════════════════════════════════════════════════════════════════════════
// 7 · LE LOT RESTE ANTHROPIC — ET LE DIT
// ═════════════════════════════════════════════════════════════════════════════
// Les Message Batches sont propres à Anthropic, et c'est d'eux que vient la
// remise de 50 % qui justifie le seuil de dix. Hors Anthropic, on reprend la
// branche directe : plus lente, jamais fausse.
const rpi = (body) => executer(router, 'Parse Input', { body });
const segs = (n) => Array.from({ length: n }, (_, i) => ({ text: 'ש'.repeat(20), index: i }));
{
  const a12 = rpi({ segments: segs(12), api_key: 'k', job_type: 'torah_page' });
  egal('12 segments chez anthropic → lot', a12.useBatch, true);
  egal('et rien n\'est écarté', a12.lotEcarte, null);

  const g12 = rpi({ segments: segs(12), api_key: 'k', provider: 'google',
                    model: 'gemini-2.5-pro', job_type: 'torah_page' });
  egal('⚠️ 12 segments chez google → PAS de lot', g12.useBatch, false);
  ok('et la raison est consignée', /lot_indisponible_pour_google/.test(g12.lotEcarte || ''),
     String(g12.lotEcarte));
  egal('le fournisseur traverse quand même', g12.provider, 'google');

  const o12 = rpi({ segments: segs(12), api_key: 'k', provider: 'openai', job_type: 'torah_page' });
  egal('12 segments chez openai → PAS de lot', o12.useBatch, false);

  // Le seuil lui-même ne bouge pas : c'est une décision de Franck (azy.daily#481).
  egal('9 segments chez anthropic → toujours pas de lot',
       rpi({ segments: segs(9), api_key: 'k', job_type: 'torah_page' }).useBatch, false);
  egal('10 segments chez anthropic → lot (le seuil reste `>= 10`)',
       rpi({ segments: segs(10), api_key: 'k', job_type: 'torah_page' }).useBatch, true);

  // Aucun recâblage : `Batch?` teste toujours le même champ.
  ok('`Batch?` continue de tester `useBatch`',
     /useBatch/.test(JSON.stringify(noeud(router, 'Batch?').parameters)));

  // ── Le client doit POUVOIR lire la raison ───────────────────────────────────
  // J'avais annoncé `lotEcarte` à plugin-torah comme lisible ; il ne l'était pas.
  // `Respond Accepted` ne rendait que cinq champs. Un champ qu'on consigne sans
  // le rendre n'informe personne.
  const corps = corpsHttp(router, 'Respond Accepted', g12);
  egal('la réponse directe porte `lot_ecarte`', corps.lot_ecarte,
       'lot_indisponible_pour_google');
  egal('la réponse directe porte le fournisseur', corps.provider, 'google');
  egal('le contrat historique est intact', corps.mode, 'sync');
  egal('… et le job_id reste rendu', corps.job_id, g12.jobId);
  // Omis plutôt que posé à null : un lot anthropic normal ne doit pas porter le champ.
  ok('`lot_ecarte` est ABSENT quand rien n\'est écarté',
     !('lot_ecarte' in corpsHttp(router, 'Respond Accepted', a12)));

  // ── Le commentaire du seuil ne doit PLUS mentir ─────────────────────────────
  // Ce bloc annonçait `> 50` quand le code disait `>= 10` : faux sur la valeur ET
  // sur l'opérateur, et c'est de là que plugin-torah tirait son « ≤ 50 ».
  // Deuxième fois que ce commentaire coûte du temps à une autre équipe.
  const docSeuil = noeud(router, 'Normaliser Réponse').parameters.jsCode;
  ok('le commentaire du seuil n\'annonce plus « > 50 »',
     !/segments\.length > 50/.test(docSeuil));
  ok('le commentaire du seuil porte la condition RÉELLE',
     />= SEUIL_BATCH_481/.test(docSeuil) && /provider === 'anthropic'/.test(docSeuil));
  ok('le commentaire documente le troisième cas (≥ 10 hors anthropic)',
     /lot_ecarte/.test(docSeuil));
}

// ═════════════════════════════════════════════════════════════════════════════
// 8 · LE ROUTER FAIT SUIVRE LE FOURNISSEUR JUSQU'AU TRADUCTEUR
// ═════════════════════════════════════════════════════════════════════════════
{
  const entree = rpi({ segments: segs(3), api_key: 'k', provider: 'google',
                       model: 'gemini-2.5-pro', job_type: 'torah_page',
                       plugin_context: { api_keys: { google: 'AIza-y' } },
                       verify_provider: 'anthropic', verify_model: 'claude-sonnet-4-6' });
  egal('le Router retient plugin_context', entree.pluginContext.api_keys.google, 'AIza-y');
  egal('le Router retient la consigne de relecture',
       entree.relecture, { verify_provider: 'anthropic', verify_model: 'claude-sonnet-4-6' });

  for (const nom of ['Prepare Segments', 'Prepare Segments Direct']) {
    const c = codeNu(router, nom);
    ok(`\`${nom}\` porte pluginContext`, /pluginContext: input\.pluginContext/.test(c));
    ok(`\`${nom}\` porte relecture`, /relecture: input\.relecture/.test(c));
    ok(`\`${nom}\` porte toujours provider`, /provider: input\.provider/.test(c));
  }

  const corps = corpsHttp(router, 'Call Translate Worker', {
    jobId: 'j', segment_id: 's', text: 't', sourceLanguage: 'he', targetLanguage: 'fr',
    apiKey: 'k', model: 'gemini-2.5-pro', provider: 'google',
    pluginContext: { api_keys: { google: 'AIza-y' } },
    relecture: { verify_provider: 'anthropic' },
    traite: 'Pesachim', page: '22b', metadata: {},
  });
  egal('`Call Translate Worker` envoie le provider', corps.provider, 'google');
  egal('… et plugin_context', corps.plugin_context.api_keys.google, 'AIza-y');
  egal('… et la consigne de relecture', corps.verify_provider, 'anthropic');
  egal('… et le modèle', corps.model, 'gemini-2.5-pro');

  // Segment long : les morceaux doivent partir chez le MÊME fournisseur, sinon
  // une page se traduirait à deux modèles sans que rien ne le dise.
  const c = codeNu(router, 'Pre-Translate Long');
  ok('`Pre-Translate Long` envoie provider sur chaque morceau',
     /provider: seg\.provider/.test(c));
  ok('`Pre-Translate Long` envoie plugin_context', /plugin_context: seg\.pluginContext/.test(c));
}

// ═════════════════════════════════════════════════════════════════════════════
// 9 · LA PROVENANCE ENREGISTRÉE EST CELLE QUI A SERVI
// ═════════════════════════════════════════════════════════════════════════════
{
  const loop = { jobId: 'j', index: 0, totalSegments: 1, segment_id: 's',
                 source_text: 'ש', targetLanguage: 'fr',
                 model: 'gemini-2.5-pro', provider: 'google', metadata: {} };
  // Cas normal : le traducteur dit ce qu'il a servi, on l'enregistre.
  const r = executer(router, 'Prepare Save',
    { translation: 'Bonjour', success: true, provider_utilise: 'google',
      model_utilise: 'gemini-2.5-pro-002' },
    { 'Loop Segments': loop });
  egal('le modèle SERVI est enregistré, pas le demandé', r.model, 'gemini-2.5-pro-002');
  egal('le fournisseur servi est enregistré', r.provider, 'google');

  // Repli : un segment long réassemblé n'a pas de provenance — on retombe sur
  // la demande, et surtout pas sur un littéral.
  const long = executer(router, 'Prepare Save', {},
    { 'Loop Segments': { ...loop, preTranslated: true, translation: 'Bonjour' } });
  egal('sans provenance, on retombe sur le modèle demandé', long.model, 'gemini-2.5-pro');
  egal('sans provenance, on retombe sur le fournisseur demandé', long.provider, 'google');

  // ⚠️ `claude-sonnet-4` est un modèle MORT (404 confirmé, n8n-workflows#462).
  const jb = noeud(router, 'Call Save Worker').parameters.jsonBody;
  ok('`Call Save Worker` ne porte plus le modèle mort `claude-sonnet-4`',
     !/claude-sonnet-4'/.test(jb), jb.slice(0, 200));
}

// ═════════════════════════════════════════════════════════════════════════════
// 10 · TORAH TRANSLATE PAGE — le choix n'est plus jeté en silence
// ═════════════════════════════════════════════════════════════════════════════
const vpage = (body, headers) => executer(page, 'Validate Input', { body, headers: headers || {} });
{
  const g = vpage({ traite: 'Pesachim', page: '22b', job_type: 'torah_page',
                    provider: 'google', model: 'gemini-2.5-pro',
                    plugin_context: { api_keys: { google: 'AIza-y' } },
                    project_id: 'p', verify_provider: 'anthropic' });
  egal('la page accepte un appel google sans clé Anthropic NI clé OpenAI', g.valid, true,
       JSON.stringify(g.errors));
  egal('le provider est retenu', g.provider, 'google');
  egal('le modèle est retenu', g.model, 'gemini-2.5-pro');
  egal('plugin_context est retenu', g.pluginContext.api_keys.google, 'AIza-y');
  egal('la consigne de relecture est retenue', g.relecture, { verify_provider: 'anthropic' });

  // Rétrocompatibilité : l'appel d'hier reste valide au caractère près.
  const hier = vpage({ traite: 'Pesachim', page: '22b', job_type: 'torah_page',
                       api_key: 'sk-ant-x', openai_api_key: 'sk-oai', project_id: 'p' });
  egal('l\'appel historique reste valide', hier.valid, true, JSON.stringify(hier.errors));
  egal('et son fournisseur reste anthropic', hier.provider, 'anthropic');

  // Une clé manquante POUR LE FOURNISSEUR CHOISI est refusée, en le nommant.
  const sansCle = vpage({ traite: 'P', page: '1a', job_type: 'torah_page',
                          provider: 'google', project_id: 'p' });
  egal('google sans clé est refusé', sansCle.valid, false);
  ok('et l\'erreur nomme le fournisseur',
     sansCle.errors.some((e) => /google/.test(e)), JSON.stringify(sansCle.errors));
  // openai_api_key n'est consommé par AUCUN nœud de ce chemin : il ne doit plus
  // bloquer un appelant qui ne traduit pas avec OpenAI.
  ok('`openai_api_key` n\'est plus exigé',
     !sansCle.errors.some((e) => /openai_api_key/.test(e)), JSON.stringify(sansCle.errors));

  // Et le relais jusqu'au Router.
  const c = codeNu(page, 'Prepare Worker Payload');
  ok('`provider` est relayé au Router', /provider: data\.provider/.test(c));
  ok('`model` est relayé au Router', /model: data\.model/.test(c));
  ok('`plugin_context` est relayé au Router', /plugin_context: data\.pluginContext/.test(c));
  // Omis plutôt que posé à null, sinon le défaut du Router serait écrasé par du vide.
  ok('`model` est OMIS quand l\'appelant n\'en envoie pas',
     /\.\.\.\(data\.model \? \{ model: data\.model \} : \{\}\)/.test(c));
}

// ═════════════════════════════════════════════════════════════════════════════
// 11 · LE DISPATCHER REFUSE AU LIEU DE SOUMETTRE À L'AVEUGLE
// ═════════════════════════════════════════════════════════════════════════════
// Le Router ne lui envoie plus que du anthropic : ce contrôle attrape les appels
// DIRECTS à /webhook/torah-translate-batch, qui existent.
{
  const dpi = (body) => executer(dispatcher, 'Validate Input', { body });
  // `segmentText`, pas `text` : contrat du dispatcher, vérifié sur son code.
  const base = { items: [{ commentary_id: 'c1', segmentText: 'ש' }], api_key: 'k',
                 project_id: 'p', model: 'claude-sonnet-4-6' };

  egal('un lot anthropic reste accepté', dpi({ ...base }).valid, true);
  egal('un lot sans provider reste accepté (provenance déduite)',
       dpi({ ...base, provider: null }).valid, true);

  const g = dpi({ ...base, provider: 'google', model: 'gemini-2.5-pro' });
  egal('⚠️ un lot google est REFUSÉ', g.valid, false);
  ok('et l\'erreur dit où aller', g.errors.some((e) => /torah-router/.test(e)),
     JSON.stringify(g.errors));
  ok('aucun deux-points dans l\'erreur du dispatcher',
     g.errors.every((e) => !e.includes(':')), JSON.stringify(g.errors));

  // Le transport est bien celui qu'on dit : Anthropic, et rien d'autre.
  const submit = noeud(dispatcher, 'Submit').parameters.url;
  ok('`Submit` passe par claude-call-with-skills', /claude-call-with-skills/.test(submit));
}

// ═════════════════════════════════════════════════════════════════════════════
// 12 · LA VOCALISATION A SUIVI — ET LE TEST QUI LE DISAIT EST TOMBÉ COMME PRÉVU
// ═════════════════════════════════════════════════════════════════════════════
// Ce bloc portait un CONSTAT : « la vocalisation reste chez gpt-4o en dur ».
// Il n'était pas un objectif, il documentait la limite — et il a échoué dès que
// la limite est tombée, forçant à relire ce fichier. C'est exactement ce qu'on
// lui demandait, et la raison d'écrire des constats plutôt que de ne rien écrire.
//
// La vocalisation est désormais multi-fournisseurs elle aussi. Elle a sa propre
// suite, parce que son piège lui est propre (les trois fournisseurs ne nomment
// pas pareil une génération terminée) :
//     scripts/test/test_torah_vocalisation_multi_provider.js
{
  const voc = lire('Torah_Vocalization_Worker.json');
  ok('la vocalisation est passée au relais elle aussi',
     !voc.nodes.some((x) => x.name === 'GPT-4o Vocalize') &&
     voc.nodes.some((x) => x.name === 'Vocaliser (LLM)'));
  const n = voc.nodes.find((x) => x.name === 'Vocaliser (LLM)');
  ok('et elle ne tape plus api.openai.com en dur',
     !!n && !/api\.openai\.com/.test(n.parameters.url));
  // ⚠️ Son défaut doit RESTER openai/gpt-4o : l'invite est calibrée pour lui, et
  // c'est sur la pose des voyelles qu'un changement de modèle se voit le plus vite.
  const vi = (voc.nodes.find((x) => x.name === 'Validate Input').parameters.jsCode || '');
  ok('⚠️ le défaut de la vocalisation reste openai + gpt-4o',
     /body\.provider \|\| 'openai'/.test(vi) && /body\.model \|\| 'gpt-4o'/.test(vi));
  // Et aucun $env de clé ou de modèle LLM ne doit réapparaître dans la chaîne.
  for (const f of ['Torah_Translate_Simple', 'Torah_Router', 'Torah_Translate_Page']) {
    const brut = JSON.stringify(lire(f + '.json').nodes);
    ok(`\`${f}\` n'introduit aucun repli d'environnement sur une clé LLM`,
       !/\$env\.(ANTHROPIC|OPENAI|GOOGLE|GEMINI|MISTRAL|MODEL)[A-Z_]*/.test(brut));
  }
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues ? 1 : 0);
