#!/usr/bin/env node
/**
 * VOCALISATION TORAH (NEKUDOT) MULTI-FOURNISSEURS — openai | anthropic | google.
 *
 * CE QUE CE FICHIER GARDE, ET POURQUOI IL EXISTE
 * Suite de #579, à la demande de Franck (« Il faut le changer aussi »). Avant :
 *
 *   torah-vocalization         exigeait `openai_api_key`, ne lisait NI `provider`
 *                              NI `model` — un `provider` envoyé là était inerte
 *   GPT-4o Vocalize            api.openai.com + `model: 'gpt-4o'` EN DUR
 *   Extract GPT Response       écrivait `vocalized_by: 'llm:gpt-4o'` en dur
 *
 * ⚠️ LE PIÈGE CENTRAL DE CE PORTAGE, et la raison principale de ce fichier :
 * les trois fournisseurs ne nomment PAS pareil une génération terminée.
 *
 *     OpenAI     'stop'                tronqué → 'length'
 *     Anthropic  'end_turn'            tronqué → 'max_tokens'
 *     Gemini     'STOP' (MAJUSCULES)   tronqué → 'MAX_TOKENS'
 *
 * Le garde-fou d'origine testait `finish_reason !== 'stop'`. Porté tel quel, il
 * aurait déclaré TRONQUÉE chaque réponse d'Anthropic et de Gemini : la
 * vocalisation aurait échoué systématiquement hors OpenAI, en annonçant une
 * troncature inexistante. Un diagnostic faux coûte plus cher qu'une panne franche.
 *
 * ⚠️ Ce fichier mesure le câblage et le comportement des nœuds Code, pas le
 * service. Il ne prouve pas qu'une vocalisation Gemini pose de bonnes voyelles —
 * seule une relecture humaine le dira, et c'est pourquoi le défaut reste gpt-4o.
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
const worker = lire('Torah_Vocalization_Worker.json');
const facade = lire('Torah_Vocalization_(Nekudot).json');
const relais = lire('LLM_-_Call_Messages.json');

const noeud = (wf, nom) => wf.nodes.find((n) => n.name === nom);
const sorties = (wf, nom, i) => ((wf.connections[nom] || {}).main || [])[i] || [];
const codeNu = (wf, nom) => (noeud(wf, nom).parameters.jsCode || '')
  .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/** Exécute un nœud Code avec $input (mono ou multi-items) et $(...) simulés. */
const executer = (wf, nom, entrees, contexte) => {
  const items = Array.isArray(entrees) ? entrees : [entrees];
  const r = new Function('$input', '$', '$env', noeud(wf, nom).parameters.jsCode)(
    { first: () => ({ json: items[0] }), all: () => items.map((j) => ({ json: j })) },
    (n) => {
      if (!(n in (contexte || {}))) throw new Error(`Referenced node is unexecuted: ${n}`);
      return { first: () => ({ json: contexte[n] }) };
    },
    { N8N_WEBHOOK_URL: 'http://llm.local:5678' });
  return Array.isArray(r) ? r.map((x) => x.json) : [r];
};
const corpsHttp = (wf, nom, j, ctx) => {
  const p = noeud(wf, nom).parameters;
  const brut = p.jsonBody !== undefined ? p.jsonBody : p.responseBody;
  const inner = brut.trim().slice(3, -2)
    .replace(/\$env\.([A-Z_]+)/g, 'ENV.$1')
    .replace(/\$\('([^']+)'\)\.first\(\)\.json/g, 'C["$1"]')
    .replace(/\$json/g, 'J');
  return JSON.parse(new Function('J', 'C', 'ENV', `return (${inner});`)(
    j, ctx || {}, { N8N_WEBHOOK_URL: 'http://llm.local:5678' }));
};

// ═════════════════════════════════════════════════════════════════════════════
// 1 · L'APPEL PASSE PAR LE RELAIS, ET LE NŒUD NE MENT PLUS SUR SON NOM
// ═════════════════════════════════════════════════════════════════════════════
{
  const n = noeud(worker, 'Vocaliser (LLM)');
  ok('`Vocaliser (LLM)` existe (« GPT-4o Vocalize » mentait dès qu\'on vise Gemini)', !!n);
  ok('il ne tape plus api.openai.com en dur', !!n && !/api\.openai\.com/.test(n.parameters.url),
     n && n.parameters.url);
  ok('il appelle /webhook/llm-call-messages',
     !!n && /\/webhook\/llm-call-messages$/.test(n.parameters.url));
  ok('il n\'envoie plus d\'en-tête Authorization Bearer',
     !!n && !n.parameters.sendHeaders && !n.parameters.headerParameters);
  ok('il lit le statut HTTP (fullResponse + neverError)',
     !!n && n.parameters.options.response.response.fullResponse === true &&
     n.parameters.options.response.response.neverError === true);
  // retryOnFail couvrait les 429/500 passagers d'OpenAI : il doit survivre.
  ok('`retryOnFail` est conservé', !!n && n.retryOnFail === true);
  egal('`Découper Texte` alimente toujours l\'appel',
       sorties(worker, 'Découper Texte', 0).map((c) => c.node), ['Vocaliser (LLM)']);
  egal('l\'appel alimente toujours `Recoller Vocalisation`',
       sorties(worker, 'Vocaliser (LLM)', 0).map((c) => c.node), ['Recoller Vocalisation']);
  ok('aucun ancien nom « GPT-4o Vocalize » ne subsiste',
     !JSON.stringify(worker.nodes).includes('"GPT-4o Vocalize"') &&
     !JSON.stringify(worker.connections).includes('GPT-4o Vocalize'));
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · VALIDATE INPUT — défaut openai/gpt-4o, et clé par fournisseur
// ═════════════════════════════════════════════════════════════════════════════
// Les DEUX workflows partagent ce nœud : on contrôle les deux, sinon la façade
// accepterait un appel que le worker refuserait, ou l'inverse.
for (const [nom, wf] of [['worker', worker], ['façade', facade]]) {
  // ⚠️ Les deux `Validate Input` se ressemblent mot pour mot… sauf sur la ligne
  // qui compte : la façade lit `$input.first().json`, le worker lit
  // `$('Webhook Trigger').first().json`. Deux nœuds d'apparence identique qui ne
  // prennent PAS leur entrée au même endroit. On fournit donc les deux — sinon
  // l'un lève « Referenced node is unexecuted » et l'autre reçoit un corps vide,
  // ce qui se lit comme une validation qui refuse tout.
  const entree = (body, headers) => ({ body, headers: headers || {} });
  const vi = (body, headers) => executer(wf, 'Validate Input', entree(body, headers),
    { 'Webhook Trigger': entree(body, headers) })[0];

  // (a) RÉTROCOMPATIBILITÉ — le comportement d'hier, à la nekuda près.
  const hier = vi({ text: 'שלום', openai_api_key: 'sk-oai' });
  egal(`[${nom}] sans provider, le défaut est openai`, hier.provider, 'openai');
  egal(`[${nom}] sans model, le défaut est gpt-4o`, hier.model, 'gpt-4o');
  egal(`[${nom}] openai_api_key sert de clé`, hier.providerCle, 'sk-oai');
  egal(`[${nom}] l'appel historique reste valide`, hier.valid, true, JSON.stringify(hier.errors));

  // (b) GOOGLE sans aucune clé OpenAI — le but de la demande de Franck.
  const g = vi({ text: 'שלום', provider: 'google', model: 'gemini-2.5-pro',
                 plugin_context: { api_keys: { google: 'AIza-y' } } });
  egal(`[${nom}] un appel google SANS clé OpenAI est valide`, g.valid, true,
       JSON.stringify(g.errors));
  egal(`[${nom}] la clé google vient de plugin_context`, g.providerCle, 'AIza-y');
  egal(`[${nom}] le modèle gemini est retenu`, g.model, 'gemini-2.5-pro');

  // (c) ERREURS NOMMÉES.
  const sansCle = vi({ text: 'x', provider: 'google' });
  egal(`[${nom}] google sans clé est refusé`, sansCle.valid, false);
  ok(`[${nom}] l'erreur nomme le fournisseur et le champ`,
     sansCle.errors.some((e) => /plugin_context\.api_keys\.google/.test(e)),
     JSON.stringify(sansCle.errors));
  const gem = vi({ text: 'x', provider: 'gemini', openai_api_key: 'k' });
  ok(`[${nom}] « gemini » est refusé en disant « google »`,
     gem.valid === false && gem.errors.some((e) => /google/.test(e)),
     JSON.stringify(gem.errors));
  const rien = vi({ text: 'x' });
  ok(`[${nom}] openai sans clé garde le message historique`,
     rien.errors.some((e) => /"openai_api_key" est requis/.test(e)),
     JSON.stringify(rien.errors));

  // (d) MODE LOT — les champs doivent sortir des DEUX retours, pas d'un seul.
  const lot = vi({ items: [{ text: 'א', commentary_id: 'c1' }], provider: 'anthropic',
                   model: 'claude-sonnet-4-6',
                   plugin_context: { api_keys: { anthropic: 'sk-ant' } } });
  egal(`[${nom}] le retour LOT porte aussi le fournisseur`, lot.provider, 'anthropic');
  egal(`[${nom}] le retour LOT porte aussi le modèle`, lot.model, 'claude-sonnet-4-6');
  egal(`[${nom}] le retour LOT porte aussi la clé`, lot.providerCle, 'sk-ant');
  egal(`[${nom}] et le lot est valide`, lot.valid, true, JSON.stringify(lot.errors));
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · LE CORPS ENVOYÉ AU RELAIS
// ═════════════════════════════════════════════════════════════════════════════
{
  const e3 = { body: { text: 'שלום '.repeat(10), provider: 'google',
    model: 'gemini-2.5-pro', plugin_context: { api_keys: { google: 'AIza-y' } } }, headers: {} };
  const j = executer(worker, 'Validate Input', e3, { 'Webhook Trigger': e3 })[0];
  const corps = corpsHttp(worker, 'Vocaliser (LLM)', j);
  egal('provider transmis', corps.provider, 'google');
  egal('modèle transmis', corps.model, 'gemini-2.5-pro');
  egal('clé DU FOURNISSEUR transmise', corps.api_key, 'AIza-y');
  egal('température conservée', corps.temperature, 0.1);

  // ⚠️ L'invite système doit être dans `system`, PAS en message de rôle system :
  // Anthropic refuse un rôle `system` dans messages[], et Gemini l'aplatit en
  // `user`. Le relais traduit `system` vers la forme de chaque fournisseur.
  ok('l\'invite système est dans le champ `system`',
     typeof corps.system === 'string' && /nekudot/.test(corps.system), String(corps.system).slice(0, 60));
  ok('aucun message de rôle `system` ne subsiste dans messages[]',
     Array.isArray(corps.messages) && corps.messages.every((m) => m.role !== 'system'),
     JSON.stringify((corps.messages || []).map((m) => m.role)));
  egal('un seul message utilisateur', (corps.messages || []).length, 1);
  ok('le texte à vocaliser est bien dans le message',
     /שלום/.test(corps.messages[0].content));
  // max_tokens calibré sur la tranche, pas un littéral.
  ok('max_tokens reste calculé sur la longueur',
     corps.max_tokens >= 1024 && corps.max_tokens <= 16000, String(corps.max_tokens));
}

// ═════════════════════════════════════════════════════════════════════════════
// 4 · ⚠️ LE PIÈGE : « terminé » ne se dit pas pareil chez les trois
// ═════════════════════════════════════════════════════════════════════════════
const env = (texte, fin, meta) => ({ statusCode: 200, body: {
  success: true,
  data: { text: texte, model: (meta || {}).model || 'gpt-4o', finish_reason: fin },
  meta: Object.assign({ provider: 'openai', model: 'gpt-4o',
                        usage: { prompt_tokens: 5, completion_tokens: 7 } }, meta || {}) } });

{
  // Les trois valeurs NORMALES doivent toutes passer.
  for (const [p, fin] of [['OpenAI', 'stop'], ['Anthropic', 'end_turn'],
                          ['Gemini', 'STOP'], ['Anthropic (séquence)', 'stop_sequence']]) {
    const r = executer(worker, 'Recoller Vocalisation', [env('שָׁלוֹם', fin)])[0];
    ok(`${p} · finish_reason « ${fin} » est accepté comme terminé`,
       r.body.success === true, JSON.stringify(r.body.error || {}));
    // Déréférencement protégé : le portage naïf (`finish_reason === 'stop'`) fait
    // échouer ce cas, et un plantage ici masquerait les 100 contrôles suivants.
    egal(`${p} · le texte vocalisé ressort`, ((r.body.data || {}).text), 'שָׁלוֹם');
  }

  // Les valeurs de TRONCATURE doivent toutes être attrapées, dans les trois
  // vocabulaires — c'est le garde-fou d'origine, qui doit survivre au portage.
  for (const [p, fin] of [['OpenAI', 'length'], ['Anthropic', 'max_tokens'],
                          ['Gemini', 'MAX_TOKENS'], ['Gemini (sécurité)', 'SAFETY']]) {
    const r = executer(worker, 'Recoller Vocalisation', [env('שָׁלוֹם', fin)])[0];
    egal(`${p} · finish_reason « ${fin} » est refusé comme tronqué`, r.body.success, false);
    ok(`${p} · et le message dit « tronqué »`,
       /tronqu/.test((r.body.error || {}).message || ''), JSON.stringify(r.body.error));
  }

  // ⚠️ Le contrôle qui aurait attrapé le portage naïf : avec `!== 'stop'`,
  // CE cas-là aurait échoué, et la vocalisation Gemini aurait été impossible.
  const casse = executer(worker, 'Recoller Vocalisation',
    [env('שָׁלוֹם', 'STOP', { provider: 'google', model: 'gemini-2.5-pro' })])[0];
  ok('⚠️ une réponse Gemini NORMALE ne passe pas pour tronquée',
     casse.body.success === true, JSON.stringify(casse.body.error || {}));
  egal('et sa provenance est conservée', (casse.body.meta || {}).provider, 'google');
  egal('et son modèle aussi', (casse.body.meta || {}).model, 'gemini-2.5-pro');
}

// ═════════════════════════════════════════════════════════════════════════════
// 5 · RECOLLER — les trois garde-fous historiques tiennent toujours
// ═════════════════════════════════════════════════════════════════════════════
{
  // Recollage de plusieurs tranches, et cumul des jetons.
  const r = executer(worker, 'Recoller Vocalisation',
    [env('אָ', 'stop'), env('בּ', 'stop'), env('גּ', 'stop')])[0];
  egal('trois tranches sont recollées dans l\'ordre', (r.body.data || {}).text, 'אָ בּ גּ');
  egal('les jetons sont cumulés', (r.body.meta || {}).usage,
       { prompt_tokens: 15, completion_tokens: 21 });
  egal('le nombre de tranches est tracé', r.body._tranches, 3);

  // ⚠️ Une tranche en échec ne doit JAMAIS donner un texte amputé présenté
  // comme complet — c'est le garde-fou le plus important du nœud.
  const ampute = executer(worker, 'Recoller Vocalisation', [
    env('אָ', 'stop'),
    { statusCode: 500, body: { success: false, error: { message: 'quota', http_status: 500 } } },
    env('גּ', 'stop')])[0];
  egal('⚠️ une tranche en échec invalide TOUT le recollage', ampute.body.success, false);
  ok('et le message dit quelle tranche et pourquoi',
     /tranche 2\/3/.test(ampute.body.error.message) && /quota/.test(ampute.body.error.message),
     ampute.body.error.message);
  ok('le texte amputé n\'est PAS rendu', !ampute.body.data);

  // Réponse vide = échec, pas chaîne vide.
  const vide = executer(worker, 'Recoller Vocalisation', [env('   ', 'stop')])[0];
  egal('une tranche vide est un échec', vide.body.success, false);
  ok('et le message le dit', /vide/.test(vide.body.error.message), vide.body.error.message);

  // Erreur de connexion n8n : pas de statusCode, statut enfoui dans le message.
  const connexion = executer(worker, 'Recoller Vocalisation',
    [{ error: { message: '502 - bad gateway' } }])[0];
  egal('une erreur de connexion est un échec', connexion.body.success, false);

  // Et le nœud ne lit plus la forme brute d'OpenAI.
  const c = codeNu(worker, 'Recoller Vocalisation');
  ok('`Recoller` ne lit plus `choices[0].message.content`',
     !/choices/.test(c));
  ok('`Recoller` lit bien `data.text` de l\'enveloppe', /donnees\.text|data\.text/.test(c));
}

// ═════════════════════════════════════════════════════════════════════════════
// 6 · EXTRACT — provenance réelle, et format de `vocalized_by` PRÉSERVÉ
// ═════════════════════════════════════════════════════════════════════════════
{
  const e6 = { body: { text: 'שלום', openai_api_key: 'sk-oai',
    context: { traite: 'Pesachim', page: '22b' } }, headers: {} };
  const vi = executer(worker, 'Validate Input', e6, { 'Webhook Trigger': e6 })[0];
  const recolle = executer(worker, 'Recoller Vocalisation', [env('שָׁלוֹם', 'stop')])[0];
  const r = executer(worker, 'Extract GPT Response', recolle, { 'Validate Input': vi })[0];

  // Déréférencement protégé partout dans ce bloc : si le recollage échoue en
  // amont (cas des contrôles négatifs), `vocalization` et `metadata` sont absents
  // et un plantage masquerait le reste de la suite.
  const voc = r.vocalization || {}, meta = r.metadata || {};
  egal('le texte vocalisé est lu depuis `data.text`', voc.vocalized, 'שָׁלוֹם');
  egal('le texte original est conservé', voc.original, 'שלום');
  egal('les jetons remontent', meta.tokens, { prompt_tokens: 5, completion_tokens: 7 });

  // ⚠️ `vocalized_by` est ÉCRIT EN BASE côté torah.api. Sur le chemin par
  // défaut, il doit valoir EXACTEMENT ce qu'il valait avant — sinon toutes les
  // lignes futures changent de format sans que l'équipe api l'ait demandé.
  egal('⚠️ par défaut, `vocalized_by` vaut toujours « llm:gpt-4o »',
       meta.vocalized_by, 'llm:gpt-4o');
  egal('… et dans _saveData aussi', (r._saveData || {}).vocalized_by, 'llm:gpt-4o');
  egal('le fournisseur réel est exposé', meta.provider, 'openai');

  // Hors défaut, la provenance suit le modèle réellement servi.
  const recolleG = executer(worker, 'Recoller Vocalisation',
    [env('שָׁלוֹם', 'STOP', { provider: 'google', model: 'gemini-2.5-pro' })])[0];
  const rg = executer(worker, 'Extract GPT Response', recolleG, { 'Validate Input': vi })[0];
  const metaG = rg.metadata || {};
  egal('chez google, `vocalized_by` suit le modèle servi',
       metaG.vocalized_by, 'llm:gemini-2.5-pro');
  egal('et le fournisseur est tracé', metaG.provider, 'google');
  egal('et le modèle aussi', metaG.model, 'gemini-2.5-pro');

  // Un recollage en échec doit conclure à l'échec, donc ne RIEN sauvegarder.
  const ko = executer(worker, 'Extract GPT Response',
    { statusCode: 200, body: { success: false, error: { message: 'vocalisation incomplète' } } },
    { 'Validate Input': vi })[0];
  egal('un recollage en échec conclut à l\'échec', ko.success, false);
  ok('et rien n\'est préparé pour la sauvegarde', !ko._saveData);

  // Les messages ne doivent plus parler d'OpenAI quand on appelle Gemini.
  const c = codeNu(worker, 'Extract GPT Response');
  ok('les messages d\'erreur ne nomment plus OpenAI', !/Erreur API OpenAI|connexion OpenAI/.test(c));
  ok('`Extract` ne lit plus `choices[0].message.content`', !/choices/.test(c));
}

// ═════════════════════════════════════════════════════════════════════════════
// 7 · LE LOT ET LA FAÇADE FONT SUIVRE LES CHAMPS
// ═════════════════════════════════════════════════════════════════════════════
{
  for (const nom of ['Prepare Batch Items', 'Process Batch Item']) {
    const c = codeNu(worker, nom);
    ok(`\`${nom}\` porte provider`, /provider: (data|item)\.provider/.test(c));
    ok(`\`${nom}\` porte model`, /model: (data|item)\.model/.test(c));
    ok(`\`${nom}\` porte providerCle`, /providerCle: (data|item)\.providerCle/.test(c));
  }
  // Bout en bout du lot : Validate → Prepare → Process → corps de l'appel.
  const e7 = { body: { items: [{ text: 'א', commentary_id: 'c1' }], provider: 'google',
    model: 'gemini-2.5-pro', plugin_context: { api_keys: { google: 'AIza-y' } },
    context: {} }, headers: {} };
  const vi = executer(facade, 'Validate Input', e7, { 'Webhook Trigger': e7 })[0];
  const prep = executer(worker, 'Prepare Batch Items', vi)[0];
  const proc = executer(worker, 'Process Batch Item', prep)[0];
  egal('le lot conserve le fournisseur jusqu\'à l\'item', proc.provider, 'google');
  egal('… et la clé', proc.providerCle, 'AIza-y');
  const corps = corpsHttp(worker, 'Vocaliser (LLM)', Object.assign({}, proc, { text: 'א' }));
  egal('l\'appel d\'un item de lot part bien chez google', corps.provider, 'google');
  egal('… avec la bonne clé', corps.api_key, 'AIza-y');

  // La façade doit relayer au worker, sinon le choix meurt chez elle.
  const corpsW = corpsHttp(facade, 'Launch Worker (async)', { job_id: 'j' },
    { 'Validate Input': vi });
  egal('la façade relaie provider au worker', corpsW.provider, 'google');
  egal('la façade relaie model au worker', corpsW.model, 'gemini-2.5-pro');
  egal('la façade relaie la clé résolue au worker', corpsW.provider_api_key, 'AIza-y');
  egal('et n\'oublie pas correlation_id (azy.daily#476)', 'correlation_id' in corpsW, true);
}

// ═════════════════════════════════════════════════════════════════════════════
// 8 · AUCUN REPLI D'ENVIRONNEMENT N'EST APPARU
// ═════════════════════════════════════════════════════════════════════════════
// La contrainte BYOT de Franck — « rien en $.env » pour les clés de fournisseur.
{
  for (const [nom, wf] of [['worker', worker], ['façade', facade]]) {
    const brut = JSON.stringify(wf.nodes);
    ok(`[${nom}] aucun $env de clé ou de modèle LLM`,
       !/\$env\.(ANTHROPIC|OPENAI|GOOGLE|GEMINI|MISTRAL|MODEL)[A-Z_]*/.test(brut));
  }
  // Et le relais visé exige bien la clé dans le corps, sans repli.
  ok('le relais reste en BYOT strict',
     /aucun fallback sur env/i.test(noeud(relais, 'Validate Input').parameters.jsCode));
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues ? 1 : 0);
