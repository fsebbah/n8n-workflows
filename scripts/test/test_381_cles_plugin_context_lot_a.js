#!/usr/bin/env node
/**
 * Clés BYOT injectées par MCP sous `plugin_context.api_keys.<fournisseur>` —
 * alignement azy.daily#381, lot A (4 outils).
 *
 *     node scripts/test/test_381_cles_plugin_context_lot_a.js
 *     node scripts/test/test_381_cles_plugin_context_lot_a.js --en-ligne   # OpenAI + Mistral réels
 *
 * Le contrat
 * ----------
 * L'orchestrateur MCP (`N8nToolExecutor`) injecte les clés de l'utilisateur dans
 * le corps, hors des paramètres visibles du LLM, sous
 * `plugin_context.api_keys.{openai,anthropic,mistral,google}`. Règle déjà en
 * place dans Text Generator / Quiz Generator / Qdrant Search / Entity Search :
 * la clé EXPLICITE du corps garde la priorité, `plugin_context` sert de repli.
 *
 * Ce que le test protège, pour chaque workflow
 * --------------------------------------------
 *  (a) clé explicite seule → envoyée au fournisseur ;
 *  (b) `plugin_context.api_keys.<fournisseur>` seule → envoyée par le nœud HTTP
 *      (en-tête Authorization, ou `?key=` pour Gemini, évalué comme n8n) ;
 *  (c) les deux → la clé explicite gagne ;
 *  (d) aucune → comportement d'erreur actuel conservé, message nommant le repli
 *      quand l'outil valide la présence de la clé ;
 *  (e) la clé ne ressort pas dans la sortie formatée (réponse, `_trace`, rappel).
 *
 * Le test exécute le JavaScript et les expressions extraits des JSON : c'est le
 * code importé qui est testé, pas une copie.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const charger = nom => {
  const brut = fs.readFileSync(path.join(RACINE, 'workflows', `${nom}.json`), 'utf8');
  const w = JSON.parse(brut);
  return { brut, w, nd: n => w.nodes.find(x => x.name === n) || { parameters: {} } };
};

const echecs = [];
let total = 0;
function controle(libelle, obtenu, attendu) {
  total++;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(70)} ${vu && vu.length > 40 ? vu.slice(0, 40) + '…' : vu}`
    + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

/** Un Code node dans un bac à sable proche de n8n ; `$('…')` rend `prev[nom]` (ou `prev` s'il n'est pas indexé). */
function execCode(wf, nom, entree, prev, globaux = {}) {
  const src = wf.nd(nom).parameters.jsCode;
  if (typeof src !== 'string') return { erreur: `nœud ${nom} absent` };
  const items = Array.isArray(entree) ? entree.map(json => ({ json })) : [{ json: entree }];
  try {
    const r = vm.runInNewContext(`(function(){${src}})()`, {
      $input: { first: () => items[0], all: () => items },
      $: n => ({ first: () => ({ json: prev && prev.__parNom ? prev[n] : prev }) }),
      $execution: { id: '381' },
      $env: {},
      ...globaux,
    }, { timeout: 5000 });
    return Array.isArray(r) ? r[0].json : (r && r.json !== undefined ? r.json : r);
  } catch (e) {
    return { erreur: `${nom} a levé ${e.message}` };
  }
}

/** Résout un paramètre comme n8n : expression seulement s'il commence par « = ». */
function resoudre(valeur, json) {
  if (typeof valeur !== 'string' || !valeur.startsWith('=')) return valeur;
  const evaluer = expr => vm.runInNewContext(`(${expr})`, { $json: json, JSON, Object, Array, String, Number, Math, RegExp });
  const seul = valeur.match(/^=\{\{([\s\S]*)\}\}$/);
  if (seul && !seul[1].includes('}}')) return evaluer(seul[1]);
  return valeur.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
    const v = evaluer(expr);
    return typeof v === 'string' ? v : String(JSON.stringify(v));
  });
}

const enTete = (wf, noeud, nom, json) => {
  const h = ((wf.nd(noeud).parameters.headerParameters || {}).parameters || []).find(x => x.name === nom);
  return h ? resoudre(h.value, json) : undefined;
};
const corps = (wf, noeud, json) => JSON.parse(resoudre(wf.nd(noeud).parameters.jsonBody, json));

const CLE = 'sk-explicite-381-CLE-SECRETE-0123456789';
const PC = 'sk-plugin-context-381-SECRETE-9876543210';
const plugin = (cles) => ({ plugin_context: { api_keys: cles } });
const contient = (v, ...cles) => cles.some(c => JSON.stringify(v === undefined ? null : v).includes(c));

/** Garde-fous communs : le repli ne passe ni par $env ni par une credential n8n. */
function sansEnvNiCredential(wf, noeuds) {
  for (const n of noeuds) {
    const nd = wf.nd(n);
    const auth = ((nd.parameters.headerParameters || {}).parameters || []).find(x => x.name === 'Authorization');
    const vues = [auth && auth.value, nd.parameters.url].filter(Boolean).join(' ');
    controle(`${n} : ni $env ni credential pour la clé`,
      [/\$env/.test(vues), 'credentials' in nd, nd.parameters.authentication === 'predefinedCredentialType'], [false, false, false]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1. MCP - Entity - Save (openai → Generate Embedding)');
const ES = charger('MCP_-_Entity_-_Save');
{
  const BASE = { action: 'save', entity_type: 'recipe', data: { title: 'Soupe', tags: ['hiver'] },
    backend_api_url: 'http://api.test', backend_service_token: 'tok', qdrant_host: 'q', qdrant_port: 1, qdrant_collection: 'c' };
  const valider = body => execCode(ES, 'Validate Input', { body });
  // Le nœud HTTP reçoit la sortie de Validate Input étalée par Prepare Save / Process API Save.
  const auth = v => enTete(ES, 'Generate Embedding', 'Authorization', { ...v, entity_id: 'e1', api_success: true });

  const a = valider({ ...BASE, openai_api_key: CLE });
  controle('(a) openai_api_key seule → Bearer <clé explicite>', [a.valid, auth(a) === `Bearer ${CLE}`], [true, true]);
  const actx = valider({ ...BASE, context: { openai_api_key: CLE } });
  controle('(a) context.openai_api_key seule → Bearer <clé explicite>', auth(actx) === `Bearer ${CLE}`, true);
  const b = valider({ ...BASE, ...plugin({ openai: PC }) });
  controle('(b) plugin_context.api_keys.openai seule → Bearer <repli>', [b.valid, auth(b) === `Bearer ${PC}`], [true, true]);
  const bAutre = valider({ ...BASE, ...plugin({ mistral: PC }) });
  controle('(b) plugin_context sans openai → pas de clé', !!bAutre.openai_api_key, false);
  const c = valider({ ...BASE, openai_api_key: CLE, ...plugin({ openai: PC }) });
  controle('(c) les deux → la clé explicite gagne', auth(c) === `Bearer ${CLE}`, true);
  const cctx = valider({ ...BASE, context: { openai_api_key: CLE }, ...plugin({ openai: PC }) });
  controle('(c) context.openai_api_key + plugin_context → explicite', auth(cctx) === `Bearer ${CLE}`, true);
  controle('api_key reste la clé Qdrant, pas la clé OpenAI',
    [valider({ ...BASE, api_key: 'qdrant-k', ...plugin({ openai: PC }) }).qdrant_api_key, auth(b) === 'Bearer qdrant-k'], ['qdrant-k', false]);
  const d = valider({ ...BASE });
  controle('(d) aucune clé → valide comme avant (pas de garde), clé nulle', [d.valid, d.openai_api_key], [true, null]);

  const invalide = valider({ action: 'save', openai_api_key: CLE, ...plugin({ openai: PC }) });
  controle('(e) Build Error (requête invalide) sans clé', [invalide.valid, contient(execCode(ES, 'Build Error', invalide), CLE, PC)], [false, false]);
  const prevSave = { ...b, entity_id: 'e1', qdrant_point_id: 'e1', api_success: true, api_response: { ok: true } };
  const succes = execCode(ES, 'Build Save Success', { status: 'ok' }, prevSave);
  controle('(e) Build Save Success sans clé (réponse et _trace)', [succes.success, contient(succes, CLE, PC)], [true, false]);
  const prep = execCode(ES, 'Prepare Embedding', { error: { message: 'Incorrect API key' } }, prevSave);
  controle('(e) Prepare Embedding ne met pas la clé dans embedding_error', contient(prep.embedding_error, PC), false);
  sansEnvNiCredential(ES, ['Generate Embedding']);
  controle('sticky documente plugin_context.api_keys.openai',
    (ES.nd('Documentation').parameters.content || '').includes('plugin_context.api_keys.openai'), true);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2. MCP - qdrant - Similar (openai → Generate Embedding)');
const QS = charger('MCP_-_qdrant_-_Similar');
{
  const BASE = { entity: { title: 'Soupe', tags: ['hiver'] }, entity_type: 'recipe', qdrant_host: 'q', qdrant_port: 1, qdrant_collection: 'c' };
  const valider = body => execCode(QS, 'Validate Input', { body });
  const auth = v => enTete(QS, 'Generate Embedding', 'Authorization', v);

  const a = valider({ ...BASE, openai_api_key: CLE });
  controle('(a) openai_api_key seule → Bearer <clé explicite>', [a.valid, auth(a) === `Bearer ${CLE}`], [true, true]);
  const b = valider({ ...BASE, ...plugin({ openai: PC }) });
  controle('(b) plugin_context.api_keys.openai seule → valide', b.valid, true);
  controle('(b) plugin_context.api_keys.openai seule → Bearer <repli>', auth(b) === `Bearer ${PC}`, true);
  const c = valider({ ...BASE, openai_api_key: CLE, ...plugin({ openai: PC }) });
  controle('(c) les deux → la clé explicite gagne', auth(c) === `Bearer ${CLE}`, true);
  const d = valider({ ...BASE });
  controle('(d) aucune clé → invalide (400 inchangé)', [d.valid, d.error && d.error.code], [false, 400]);
  controle('(d) message nomme openai_api_key', /openai_api_key/.test(d.error && d.error.message), true);
  controle('(d) message nomme plugin_context.api_keys.openai', /plugin_context\.api_keys\.openai/.test(d.error && d.error.message), true);
  const dAutre = valider({ ...BASE, ...plugin({ mistral: PC }) });
  controle('(d) plugin_context sans openai → invalide', dAutre.valid, false);
  const reponseErreur = resoudre(QS.nd('Error: Validation').parameters.responseBody, valider({ entity_type: 'x', ...plugin({ openai: PC }) }));
  controle('(e) réponse de validation sans clé', [reponseErreur.success, contient(reponseErreur, PC)], [false, false]);
  const prev = { ...b, embedding: [0.1], source_entity: BASE.entity };
  const sortie = execCode(QS, 'Format Output', { result: [{ id: 'x', score: 0.9, payload: { title: 'T' } }] }, prev);
  controle('(e) Format Output sans clé', [sortie.success, contient(sortie, CLE, PC)], [true, false]);
  sansEnvNiCredential(QS, ['Generate Embedding']);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3. MCP - Text Embedder (openai / mistral / google selon le provider)');
const TE = charger('MCP_-_Text_Embedder');
{
  const valider = body => execCode(TE, 'Validate Input', { body });
  const PROVIDERS = [
    // provider demandé, code catalogue, nœud HTTP, lecture de la clé envoyée, nœud de formatage
    { provider: 'openai', code: 'openai', noeud: 'OpenAI Embeddings', format: 'Format OpenAI',
      envoyee: v => enTete(TE, 'OpenAI Embeddings', 'Authorization', v), attendue: k => `Bearer ${k}` },
    { provider: 'mistral', code: 'mistral', noeud: 'Mistral Embeddings', format: 'Format Mistral',
      envoyee: v => enTete(TE, 'Mistral Embeddings', 'Authorization', v), attendue: k => `Bearer ${k}` },
    { provider: 'gemini', code: 'google', noeud: 'Gemini Embeddings', format: 'Format Gemini',
      envoyee: v => new URL(resoudre(TE.nd('Gemini Embeddings').parameters.url, v)).searchParams.get('key'), attendue: k => k },
    { provider: 'google', code: 'google', noeud: 'Gemini Embeddings', format: 'Format Gemini',
      envoyee: v => new URL(resoudre(TE.nd('Gemini Embeddings').parameters.url, v)).searchParams.get('key'), attendue: k => k },
  ];
  for (const p of PROVIDERS) {
    const BASE = { text: ['bonjour'], provider: p.provider };
    const autres = Object.fromEntries(['openai', 'mistral', 'google', 'anthropic'].filter(c => c !== p.code).map(c => [c, `sk-autre-${c}`]));
    const a = valider({ ...BASE, api_key: CLE });
    controle(`${p.provider} (a) api_key seule → envoyée`, [a.valid, a.valid && p.envoyee(a) === p.attendue(CLE)], [true, true]);
    const b = valider({ ...BASE, ...plugin({ [p.code]: PC, ...autres }) });
    controle(`${p.provider} (b) plugin_context.api_keys.${p.code} seule → valide`, b.valid, true);
    controle(`${p.provider} (b) plugin_context.api_keys.${p.code} → envoyée par ${p.noeud}`, b.valid && p.envoyee(b) === p.attendue(PC), true);
    const c = valider({ ...BASE, api_key: CLE, ...plugin({ [p.code]: PC }) });
    controle(`${p.provider} (c) api_key + plugin_context → explicite`, c.valid && p.envoyee(c) === p.attendue(CLE), true);
    const cCtx = valider({ ...BASE, context: { api_key: CLE }, ...plugin({ [p.code]: PC }) });
    controle(`${p.provider} (c) context.api_key + plugin_context → explicite`, cCtx.valid && p.envoyee(cCtx) === p.attendue(CLE), true);
    const d = valider({ ...BASE });
    controle(`${p.provider} (d) aucune clé → invalide`, d.valid, false);
    controle(`${p.provider} (d) message nomme plugin_context.api_keys.${p.code}`,
      (d.errors || []).some(e => e.includes(`plugin_context.api_keys.${p.code}`)), true);
    const dAutres = valider({ ...BASE, ...plugin(autres) });
    controle(`${p.provider} (d) seulement les clés des autres fournisseurs → invalide`, dAutres.valid, false);
    const err = execCode(TE, 'Build Error', valider({ provider: p.provider, ...plugin({ [p.code]: PC }) }));
    controle(`${p.provider} (e) Build Error (texte absent) sans clé`, [err.success, contient(err, PC)], [false, false]);
    const reponse = p.code === 'google'
      ? { embeddings: [{ values: [0.1, 0.2] }] }
      : { data: [{ index: 0, embedding: [0.1, 0.2] }], model: 'm', usage: { total_tokens: 1 } };
    const ok = execCode(TE, p.format, reponse, b);
    controle(`${p.provider} (e) ${p.format} succès sans clé`, [ok.success, contient(ok, PC)], [true, false]);
    const ko = execCode(TE, p.format, { error: { message: 'Unauthorized', code: 401 } }, b);
    controle(`${p.provider} (e) ${p.format} erreur sans clé`, [ko.success, contient(ko, PC)], [false, false]);
  }
  // Seule la clé du fournisseur choisi est acceptée : jamais celle d'un autre
  // (« on ne doit recevoir que l'api key mistral si c'est un embedder mistral »).
  console.log('   — clé d’un autre fournisseur jamais utilisée');
  const OPENAI = 'sk-openai-381-AUTRE-FOURNISSEUR-000000';
  const MISTRAL = 'mistral-381-AUTRE-FOURNISSEUR-111111';
  const GOOGLE = 'AIza-381-AUTRE-FOURNISSEUR-222222';
  const envoi = {
    openai: v => enTete(TE, 'OpenAI Embeddings', 'Authorization', v),
    mistral: v => enTete(TE, 'Mistral Embeddings', 'Authorization', v),
    gemini: v => new URL(resoudre(TE.nd('Gemini Embeddings').parameters.url, v)).searchParams.get('key'),
  };
  const refus = (libelle, body, cleInterdite) => {
    const v = valider({ text: ['x'], ...body });
    const err = execCode(TE, 'Build Error', v);
    controle(`${libelle} → 400`, [v.valid, err.error && err.error.http_status], [false, 400]);
    controle(`${libelle} → clé étrangère ni retenue ni renvoyée`, [v.api_key, contient(v, cleInterdite), contient(err, cleInterdite)], [undefined, false, false]);
  };
  refus('mistral + openai_api_key seule', { provider: 'mistral', openai_api_key: OPENAI }, OPENAI);
  refus('mistral + context.openai_api_key seule', { provider: 'mistral', context: { openai_api_key: OPENAI } }, OPENAI);
  refus('mistral + google_api_key seule', { provider: 'mistral', google_api_key: GOOGLE }, GOOGLE);
  refus('google + openai_api_key seule', { provider: 'google', openai_api_key: OPENAI }, OPENAI);
  refus('gemini + openai_api_key seule', { provider: 'gemini', openai_api_key: OPENAI }, OPENAI);
  refus('google + mistral_api_key seule', { provider: 'google', mistral_api_key: MISTRAL }, MISTRAL);
  refus('openai + mistral_api_key seule', { provider: 'openai', mistral_api_key: MISTRAL }, MISTRAL);
  refus('openai + google_api_key seule', { provider: 'openai', google_api_key: GOOGLE }, GOOGLE);
  refus('openai (défaut) + mistral_api_key seule', { mistral_api_key: MISTRAL }, MISTRAL);

  const mOpPc = valider({ text: ['x'], provider: 'mistral', openai_api_key: OPENAI, ...plugin({ mistral: PC, openai: OPENAI }) });
  controle('mistral + openai_api_key + plugin_context.mistral → clé Mistral envoyée', [mOpPc.valid, envoi.mistral(mOpPc) === `Bearer ${PC}`], [true, true]);
  for (const p of ['google', 'gemini']) {
    const gOpPc = valider({ text: ['x'], provider: p, openai_api_key: OPENAI, ...plugin({ google: PC, openai: OPENAI }) });
    controle(`${p} + openai_api_key + plugin_context.google → clé Google envoyée`, [gOpPc.valid, envoi.gemini(gOpPc) === PC], [true, true]);
  }
  const oMiPc = valider({ text: ['x'], provider: 'openai', mistral_api_key: MISTRAL, ...plugin({ openai: PC }) });
  controle('openai + mistral_api_key + plugin_context.openai → clé OpenAI envoyée', [oMiPc.valid, envoi.openai(oMiPc) === `Bearer ${PC}`], [true, true]);

  // Champ propre au fournisseur : lu, et prioritaire sur plugin_context.
  for (const [provider, champ, cle, lire] of [
    ['openai', 'openai_api_key', OPENAI, v => envoi.openai(v) === `Bearer ${OPENAI}`],
    ['mistral', 'mistral_api_key', MISTRAL, v => envoi.mistral(v) === `Bearer ${MISTRAL}`],
    ['google', 'google_api_key', GOOGLE, v => envoi.gemini(v) === GOOGLE],
    ['gemini', 'gemini_api_key', GOOGLE, v => envoi.gemini(v) === GOOGLE],
  ]) {
    const seul = valider({ text: ['x'], provider, [champ]: cle });
    controle(`${provider} + ${champ} seule → envoyée`, [seul.valid, lire(seul)], [true, true]);
    const ctxSeul = valider({ text: ['x'], provider, context: { [champ]: cle } });
    controle(`${provider} + context.${champ} seule → envoyée`, [ctxSeul.valid, lire(ctxSeul)], [true, true]);
    const avecPc = valider({ text: ['x'], provider, [champ]: cle, ...plugin({ [provider === 'gemini' ? 'google' : provider]: PC }) });
    controle(`${provider} + ${champ} + plugin_context → ${champ} gagne`, lire(avecPc), true);
  }

  // Le message 400 ne cite que les champs du fournisseur choisi.
  const message = provider => ((valider({ text: ['x'], provider }).errors) || []).join(' | ');
  const CHAMPS = ['openai_api_key', 'mistral_api_key', 'google_api_key'];
  for (const [provider, propre, code] of [['openai', 'openai_api_key', 'openai'], ['mistral', 'mistral_api_key', 'mistral'], ['google', 'google_api_key', 'google']]) {
    const m = message(provider);
    controle(`message ${provider} : cite ${propre}, api_key, plugin_context.api_keys.${code}`,
      [m.includes(propre), /\bapi_key\b/.test(m), m.includes(`plugin_context.api_keys.${code}`)], [true, true, true]);
    controle(`message ${provider} : ne cite aucun champ d’un autre fournisseur`,
      CHAMPS.filter(c => c !== propre).concat(provider === 'google' ? [] : ['gemini_api_key']).filter(c => m.includes(c)), []);
  }

  const fournisseurInvalide = valider({ text: 'x', provider: 'cohere', ...plugin({ openai: PC }) });
  controle('provider invalide → toujours invalide, sans clé', [fournisseurInvalide.valid, contient(fournisseurInvalide, PC)], [false, false]);
  sansEnvNiCredential(TE, ['OpenAI Embeddings', 'Mistral Embeddings', 'Gemini Embeddings']);
  controle('aucun $env dans Text Embedder', /\$env/.test(TE.brut), false);
  controle('sticky documente plugin_context.api_keys',
    (TE.nd('Documentation').parameters.content || '').includes('plugin_context.api_keys'), true);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4. MCP - Image Generator (openai → OpenAI Image Generate Sync/Async, hors ligne)');
const IG = charger('MCP_-_Image_Generator');
{
  // Depuis azy.daily#383 (gpt-image), la clé est résolue par `Prepare Image Request`
  // et l'en-tête lit sa sortie ; une clé absente est refusée en 400 avant l'appel.
  const BASE = { prompt: 'Un chat', options: { model: 'gpt-image-1-mini' } };
  const preparer = body => execCode(IG, 'Prepare Image Request', { body, headers: {} });
  // Sync : la sortie de Prepare Image Request. Async : celle de Store Job Context, relayée par Respond 202.
  const itemSync = body => preparer(body);
  const itemAsync = body => execCode(IG, 'Store Job Context', preparer({ ...body, callback_url: 'http://cb.test' }));

  for (const [noeud, item] of [['OpenAI Image Generate (Sync)', itemSync], ['OpenAI Image Generate (Async)', itemAsync]]) {
    const auth = body => enTete(IG, noeud, 'Authorization', item(body));
    controle(`${noeud} (a) openai_api_key seule → Bearer <clé explicite>`, auth({ ...BASE, openai_api_key: CLE }) === `Bearer ${CLE}`, true);
    controle(`${noeud} (a) context.openai_api_key seule → Bearer <clé explicite>`, auth({ ...BASE, context: { openai_api_key: CLE } }) === `Bearer ${CLE}`, true);
    controle(`${noeud} (b) plugin_context.api_keys.openai seule → Bearer <repli>`, auth({ ...BASE, ...plugin({ openai: PC }) }) === `Bearer ${PC}`, true);
    controle(`${noeud} (c) les deux → la clé explicite gagne`, auth({ ...BASE, openai_api_key: CLE, ...plugin({ openai: PC }) }) === `Bearer ${CLE}`, true);
    controle(`${noeud} : clé absente du corps envoyé`, contient(corps(IG, noeud, item({ ...BASE, ...plugin({ openai: PC }) })), PC), false);
  }
  for (const [libelle, body] of [['aucune clé', { ...BASE }], ['plugin_context sans openai', { ...BASE, ...plugin({ mistral: PC }) }]]) {
    const p = preparer(body);
    controle(`(d) ${libelle} → 400 avant l'appel`, [p.valid, p.response && p.response.error.code], [false, 400]);
    controle(`(d) ${libelle} → message nomme plugin_context.api_keys.openai`,
      /plugin_context\.api_keys\.openai/.test(p.response && p.response.error.message), true);
  }
  controle('Valid? aiguille sur la validation de Prepare Image Request',
    IG.nd('Valid?').parameters.conditions.conditions[0].leftValue, '={{ $json.valid }}');

  const bodyPC = { ...BASE, ...plugin({ openai: PC }), openai_api_key: CLE };
  const erreurOpenAI = { error: { message: `401 - ${JSON.stringify({ error: { message: 'Your request was rejected', code: 'content_policy_violation' } })}`,
    config: { headers: { Authorization: `Bearer ${CLE}` } } } };
  const succesImage = { data: [{ b64_json: 'iVBORw0KGgo=' }], usage: { input_tokens: 22, output_tokens: 272 } };
  for (const [libelle, reponse] of [['succès', succesImage], ['erreur', erreurOpenAI]]) {
    const sync = execCode(IG, 'Format Output (Sync)', reponse, { __parNom: true, 'Prepare Image Request': itemSync(bodyPC) });
    controle(`(e) Format Output (Sync) ${libelle} sans clé`, [sync.success, contient(sync, CLE, PC)], [libelle === 'succès', false]);
    const job = itemAsync(bodyPC);
    const asyncOut = execCode(IG, 'Format Output (Async)', reponse, job);
    controle(`(e) Format Output (Async) ${libelle} sans clé`, [asyncOut.success, contient(asyncOut, CLE, PC)], [libelle === 'succès', false]);
    const rappel = execCode(IG, 'Prepare Callback with HMAC', asyncOut, null, { $env: { N8N_WEBHOOK_SECRET: 's' } });
    controle(`(e) corps du rappel (${libelle}) sans clé`, [typeof rappel.corps_json, contient(rappel, CLE, PC)], ['string', false]);
  }
  const accepte = resoudre(IG.nd('Respond 202 Accepted').parameters.responseBody, itemAsync(bodyPC));
  controle('(e) Respond 202 Accepted sans clé', [accepte.status, contient(accepte, CLE, PC)], ['processing', false]);
  const refus = resoudre(IG.nd('Error: Validation').parameters.responseBody, preparer({ openai_api_key: CLE, ...plugin({ openai: PC }) }));
  controle('(e) Error: Validation (prompt absent) sans clé', [refus.success, contient(refus, CLE, PC)], [false, false]);
  sansEnvNiCredential(IG, ['OpenAI Image Generate (Sync)', 'OpenAI Image Generate (Async)']);
  controle('sticky documente plugin_context.api_keys.openai',
    (IG.nd('API Documentation').parameters.content || '').includes('plugin_context.api_keys.openai'), true);
}

if (process.argv.includes('--en-ligne')) enLigne().then(conclure, e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
else conclure();

/**
 * Requêtes réelles construites par les workflows quand la clé ne vient QUE de
 * `plugin_context.api_keys`. DALL-E n'est pas appelé (coût) ; pas de clé Google.
 */
async function enLigne() {
  console.log('\n5. En ligne — clé fournie uniquement par plugin_context.api_keys');
  const { OPENAI_API_KEY: cleOpenAI, MISTRAL_API_KEY: cleMistral } = process.env;
  const envoyer = async (libelle, url, headers, body, cle, formater) => {
    const t0 = Date.now();
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    const sortie = formater ? formater(j) : null;
    const dims = (j.data && j.data[0] && j.data[0].embedding || []).length;
    console.log(`     ${libelle} : HTTP ${r.status}, ${Date.now() - t0} ms, ${dims} dimensions`
      + (r.ok ? '' : `, ${(j.error && j.error.message) || j.message || j.detail || '?'}`));
    controle(`${libelle} : HTTP 200`, r.status, 200);
    if (sortie) controle(`${libelle} : sortie formatée sans clé`, [sortie.success, contient(sortie, cle)], [true, false]);
  };

  if (!cleOpenAI) console.log('  ⏭  OPENAI_API_KEY absente — OpenAI sauté');
  else {
    const es = execCode(ES, 'Validate Input', { body: { action: 'save', entity_type: 'recipe', data: { title: 'Soupe de courge', tags: ['hiver'] },
      backend_api_url: 'http://api.test', ...plugin({ openai: cleOpenAI }) } });
    const esJson = { ...es, entity_id: 'e1', api_success: true };
    await envoyer('Entity Save → OpenAI embeddings', 'https://api.openai.com/v1/embeddings',
      { Authorization: enTete(ES, 'Generate Embedding', 'Authorization', esJson), 'Content-Type': 'application/json' },
      corps(ES, 'Generate Embedding', esJson), cleOpenAI);

    const qs = execCode(QS, 'Validate Input', { body: { entity: { title: 'Soupe de courge' }, entity_type: 'recipe',
      qdrant_host: 'q', qdrant_port: 1, qdrant_collection: 'c', ...plugin({ openai: cleOpenAI }) } });
    if (!qs.valid) throw new Error('qdrant Similar : Validate Input a refusé la requête');
    await envoyer('qdrant Similar → OpenAI embeddings', 'https://api.openai.com/v1/embeddings',
      { Authorization: enTete(QS, 'Generate Embedding', 'Authorization', qs), 'Content-Type': 'application/json' },
      corps(QS, 'Generate Embedding', qs), cleOpenAI);

    const te = execCode(TE, 'Validate Input', { body: { text: ['Soupe de courge'], provider: 'openai', ...plugin({ openai: cleOpenAI }) } });
    if (!te.valid) throw new Error('Text Embedder (openai) : Validate Input a refusé la requête');
    await envoyer('Text Embedder → OpenAI embeddings', TE.nd('OpenAI Embeddings').parameters.url,
      { Authorization: enTete(TE, 'OpenAI Embeddings', 'Authorization', te), 'Content-Type': 'application/json' },
      corps(TE, 'OpenAI Embeddings', te), cleOpenAI, j => execCode(TE, 'Format OpenAI', j, te));
  }

  if (!cleMistral) console.log('  ⏭  MISTRAL_API_KEY absente — Mistral sauté');
  else {
    const te = execCode(TE, 'Validate Input', { body: { text: ['Soupe de courge'], provider: 'mistral', ...plugin({ mistral: cleMistral }) } });
    if (!te.valid) throw new Error('Text Embedder (mistral) : Validate Input a refusé la requête');
    await envoyer('Text Embedder → Mistral embeddings', TE.nd('Mistral Embeddings').parameters.url,
      { Authorization: enTete(TE, 'Mistral Embeddings', 'Authorization', te), 'Content-Type': 'application/json' },
      corps(TE, 'Mistral Embeddings', te), cleMistral, j => execCode(TE, 'Format Mistral', j, te));
  }
  console.log('  ⏭  Gemini non mesuré (pas de clé Google) ; gpt-image non appelé ici (coût, cf. test_383_image_generator.js)');
}

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length}/${total} contrôle(s) en échec`); process.exit(1); }
  console.log(`✅ tous les contrôles passent  (${total}/${total})`);
}
