#!/usr/bin/env node
/**
 * MCP - Image Generator : migration DALL-E → gpt-image — azy.daily#383.
 *
 *     node scripts/test/test_383_image_generator.js
 *     node scripts/test/test_383_image_generator.js --en-ligne   # UN appel génératif réel + un appel en 401 (OPENAI_API_KEY)
 *
 * Le cas de référence (mesuré le 2026-09-14)
 * ------------------------------------------
 * `POST /webhook/image-generator` envoyait `model: dall-e-3` par défaut :
 *
 *     HTTP 400 « The model 'dall-e-3' does not exist »
 *
 * OpenAI ne sert plus que la famille `gpt-image`. Elle refuse `quality: standard`,
 * `style` et `response_format`, et rend `data[].b64_json` (≈ 2,3 Mo de texte pour
 * un PNG 1024×1024 en qualité basse) avec un `usage` au jeton. De plus, le corps
 * était un JSON écrit en dur (`"prompt": "{{ $json.body.prompt }}"`) : un
 * guillemet dans le prompt cassait la requête.
 *
 * Ce que le test protège
 * ----------------------
 *  1. le corps est construit par un Code node puis `JSON.stringify` : guillemets
 *     et sauts de ligne arrivent intacts, les nœuds HTTP n'insèrent plus rien ;
 *  2. paramètres gpt-image : défauts, correspondances standard→medium, hd→high,
 *     1792x1024→1536x1024, 1024x1792→1024x1536 ; ni `style` ni `response_format` ;
 *  3. valeur hors liste → 400 de validation explicite, sans appel ;
 *  4. clé BYOT (openai_api_key, context.openai_api_key, plugin_context.api_keys.openai),
 *     absente → 400 ; aucune credential, aucun `$env` hors le secret HMAC ;
 *  5. réponse synchrone : images base64 + mime_type, `usage` du fournisseur tel quel,
 *     plus de table de prix ; la clé ne ressort jamais ;
 *  6. erreurs OpenAI 400/401/429 relayées avec leur statut, 502 sans statut ;
 *  7. rappel asynchrone : même contrat, `job_id`/`status`, erreur avec son statut ;
 *  8. câblage : le 202 part AVANT l'appel lent ; délai 180 s ;
 *  9. documentation à jour.
 *
 * Le test exécute le JavaScript et les expressions extraits du JSON du workflow :
 * c'est le code importé qui est testé, pas une copie.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const BRUT = fs.readFileSync(path.join(RACINE, 'workflows', 'MCP_-_Image_Generator.json'), 'utf8');
const W = JSON.parse(BRUT);
const nd = n => W.nodes.find(x => x.name === n) || { parameters: {} };

const PREPARE = 'Prepare Image Request';
const HTTP_SYNC = 'OpenAI Image Generate (Sync)';
const HTTP_ASYNC = 'OpenAI Image Generate (Async)';

const echecs = [];
let total = 0;
function controle(libelle, obtenu, attendu) {
  total++;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(66)} ${vu && vu.length > 40 ? vu.slice(0, 40) + '…' : vu}`
    + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}
/** Une section qui lève (nœud absent sur develop…) compte comme un échec, sans arrêter le test. */
function section(titre, fn) {
  console.log(`\n${titre}`);
  try { fn(); } catch (e) { total++; echecs.push(titre); console.log(`  ❌ la section a levé : ${e.message}`); }
}

/** Un Code node dans un bac à sable proche de n8n ; `$('nom')` rend `prev[nom]`. */
function execCode(nom, entree, prev = {}, globaux = {}) {
  const src = nd(nom).parameters.jsCode;
  if (typeof src !== 'string') return { erreur: `nœud ${nom} absent` };
  const items = [{ json: entree }];
  try {
    const r = vm.runInNewContext(`(function(){${src}})()`, {
      $input: { first: () => items[0], all: () => items },
      $: n => ({ first: () => ({ json: prev[n] }) }),
      $execution: { id: '383' },
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

const enTete = (noeud, nom, json) => {
  const h = ((nd(noeud).parameters.headerParameters || {}).parameters || []).find(x => x.name === nom);
  return h ? resoudre(h.value, json) : undefined;
};
/** Le corps que le nœud HTTP enverrait, tel que n8n le résout. */
const corpsEnvoye = (noeud, json) => {
  const v = resoudre(nd(noeud).parameters.jsonBody, json);
  return typeof v === 'string' ? JSON.parse(v) : v;
};

const CLE = 'sk-test-383-CLE-SECRETE-0123456789abcdef';
const PC = 'sk-plugin-context-383-SECRETE-9876543210';
const contient = (v, ...cles) => cles.some(c => JSON.stringify(v === undefined ? null : v).includes(c));

const preparer = body => execCode(PREPARE, { body, headers: {} });
/** La sortie de Store Job Context, relayée par Respond 202 jusqu'au nœud HTTP asynchrone. */
const jobContexte = body => execCode('Store Job Context', preparer({ ...body, callback_url: 'http://cb.test/rappel' }));
const statutRespond = json => Number(resoudre(nd('Respond (Sync)').parameters.options.responseCode, json));

/** L'objet qu'émet n8n en onError=continueRegularOutput : pas de statusCode, statut enfoui dans le message. */
const erreurN8n = (statut, corpsOpenAI, cle = CLE) => ({
  error: {
    message: `${statut} - ${JSON.stringify(corpsOpenAI)}`,
    name: 'AxiosError',
    code: 'ERR_BAD_REQUEST',
    // Pire cas : l'objet d'erreur embarque la requête, en-têtes compris.
    config: { headers: { Authorization: `Bearer ${cle}` }, url: 'https://api.openai.com/v1/images/generations' },
  },
});

// Un PNG 1×1 réel, en base64.
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const USAGE = { input_tokens: 22, input_tokens_details: { image_tokens: 0, text_tokens: 22 }, output_tokens: 272, total_tokens: 294 };
const REPONSE_OK = { created: 1757836800, background: 'opaque', output_format: 'png', quality: 'low', size: '1024x1024',
  data: [{ b64_json: PNG_1X1 }], usage: USAGE };

const BASE = { prompt: 'Un chat', openai_api_key: CLE };

// ═══════════════════════════════════════════════════════════════════════════
section('1. Corps construit proprement (guillemets, sauts de ligne)', () => {
  const prompt = 'Un panneau qui dit "Shalom" \\ et l\'apostrophe\nligne 2\t{{ pas une expression }}';
  const p = preparer({ ...BASE, prompt });
  controle('requête valide', p.valid, true);
  controle('image_body est une chaîne JSON', typeof p.image_body, 'string');
  const corps = JSON.parse(p.image_body);
  controle('prompt intact après JSON.parse', corps.prompt, prompt);
  for (const noeud of [HTTP_SYNC, HTTP_ASYNC]) {
    controle(`${noeud} : jsonBody = ={{ $json.image_body }}`, nd(noeud).parameters.jsonBody, '={{ $json.image_body }}');
    controle(`${noeud} : corps envoyé = corps construit`, corpsEnvoye(noeud, noeud === HTTP_SYNC ? p : jobContexte({ ...BASE, prompt })), corps);
    controle(`${noeud} : URL images/generations`, nd(noeud).parameters.url, 'https://api.openai.com/v1/images/generations');
  }
  controle('défauts : modèle, n, size, quality', [corps.model, corps.n, corps.size, corps.quality], ['gpt-image-1-mini', 1, '1024x1024', 'auto']);
  const ancien = JSON.parse(preparer({ ...BASE, options: { style: 'vivid', response_format: 'url' }, style: 'natural', response_format: 'b64_json' }).image_body);
  controle('ni style ni response_format envoyés', ['style' in ancien, 'response_format' in ancien], [false, false]);
  controle('champs facultatifs absents par défaut',
    ['output_format' in corps, 'output_compression' in corps, 'background' in corps], [false, false, false]);
  controle('options.model prime sur model',
    JSON.parse(preparer({ ...BASE, model: 'gpt-image-1', options: { model: 'gpt-image-2-2026-04-21' } }).image_body).model, 'gpt-image-2-2026-04-21');
  controle('model à la racine lu', JSON.parse(preparer({ ...BASE, model: 'gpt-image-1.5' }).image_body).model, 'gpt-image-1.5');
  const complet = JSON.parse(preparer({ ...BASE, options: { n: 2, output_format: 'webp', output_compression: 80, background: 'transparent' } }).image_body);
  controle('n, output_format, output_compression, background transmis',
    [complet.n, complet.output_format, complet.output_compression, complet.background], [2, 'webp', 80, 'transparent']);
  controle('clé absente du corps', contient(corps, CLE), false);
});

section('2. Correspondances quality / size', () => {
  const q = v => JSON.parse(preparer({ ...BASE, options: { quality: v } }).image_body).quality;
  const s = v => JSON.parse(preparer({ ...BASE, options: { size: v } }).image_body).size;
  controle('quality standard → medium', q('standard'), 'medium');
  controle('quality hd → high', q('hd'), 'high');
  for (const v of ['low', 'medium', 'high', 'auto']) controle(`quality ${v} → ${v}`, q(v), v);
  controle('size 1792x1024 → 1536x1024', s('1792x1024'), '1536x1024');
  controle('size 1024x1792 → 1024x1536', s('1024x1792'), '1024x1536');
  for (const v of ['1024x1024', '1536x1024', '1024x1536', 'auto']) controle(`size ${v} → ${v}`, s(v), v);
  controle('quality à la racine lue', JSON.parse(preparer({ ...BASE, quality: 'hd' }).image_body).quality, 'high');
  const p = preparer({ ...BASE, options: { quality: 'hd', size: '1792x1024' } });
  controle('valeurs normalisées exposées (quality, size)', [p.quality, p.size], ['high', '1536x1024']);
});

section('3. Valeurs invalides → 400 explicite, sans appel', () => {
  const cas = [
    ['quality ultra', { options: { quality: 'ultra' } }, 'quality'],
    ['size 512x512', { options: { size: '512x512' } }, 'size'],
    ['output_format gif', { options: { output_format: 'gif' } }, 'output_format'],
    ['background bleu', { options: { background: 'bleu' } }, 'background'],
    ['output_compression 101', { options: { output_compression: 101 } }, 'output_compression'],
    ['n = 0', { options: { n: 0 } }, 'n'],
    ['n = 11', { options: { n: 11 } }, 'n'],
    ['n = "deux"', { options: { n: 'deux' } }, 'n'],
    ['model = 42', { model: 42 }, 'model'],
    ['prompt absent', { prompt: undefined }, 'prompt'],
    ['prompt blanc', { prompt: '   ' }, 'prompt'],
  ];
  for (const [libelle, extra, champ] of cas) {
    const p = preparer({ ...BASE, ...extra });
    const r = p.response || {};
    controle(`${libelle} → invalide, 400`, [p.valid, r.success, r.error && r.error.code], [false, false, 400]);
    controle(`${libelle} → message nomme ${champ}`, new RegExp(`\\b${champ}\\b`).test(r.error && r.error.message), true);
    controle(`${libelle} → aucun corps à envoyer`, 'image_body' in p, false);
  }
  const err = nd('Error: Validation');
  controle('Error: Validation répond 400', Number(resoudre(err.parameters.options && err.parameters.options.responseCode, {})), 400);
  const invalide = preparer({ ...BASE, ...{ plugin_context: { api_keys: { openai: PC } } }, options: { quality: 'ultra' } });
  const rendu = resoudre(err.parameters.responseBody, invalide);
  controle('réponse de validation : forme et pas de clé', [rendu.success, rendu.error.code, contient(rendu, CLE, PC)], [false, 400, false]);
  controle('Valid? teste $json.valid', nd('Valid?').parameters.conditions && nd('Valid?').parameters.conditions.conditions[0].leftValue, '={{ $json.valid }}');
});

section('4. Clé BYOT : trois sources, absente → 400', () => {
  const sources = {
    'openai_api_key': { openai_api_key: CLE },
    'context.openai_api_key': { context: { openai_api_key: CLE } },
    'plugin_context.api_keys.openai': { plugin_context: { api_keys: { openai: CLE } } },
  };
  for (const [nom, extra] of Object.entries(sources)) {
    const body = { prompt: 'Un chat', ...extra };
    controle(`${nom} → Sync : Bearer <clé>`, enTete(HTTP_SYNC, 'Authorization', preparer(body)) === `Bearer ${CLE}`, true);
    controle(`${nom} → Async : Bearer <clé>`, enTete(HTTP_ASYNC, 'Authorization', jobContexte(body)) === `Bearer ${CLE}`, true);
  }
  const priorite = preparer({ prompt: 'x', openai_api_key: CLE, context: { openai_api_key: 'sk-ctx-000000000' }, plugin_context: { api_keys: { openai: PC } } });
  controle('openai_api_key prime sur context et plugin_context', enTete(HTTP_SYNC, 'Authorization', priorite) === `Bearer ${CLE}`, true);
  const ctxPrime = preparer({ prompt: 'x', context: { openai_api_key: CLE }, plugin_context: { api_keys: { openai: PC } } });
  controle('context.openai_api_key prime sur plugin_context', enTete(HTTP_SYNC, 'Authorization', ctxPrime) === `Bearer ${CLE}`, true);
  controle('clé entourée d’espaces → rognée', enTete(HTTP_SYNC, 'Authorization', preparer({ prompt: 'x', openai_api_key: ` ${CLE} ` })) === `Bearer ${CLE}`, true);

  for (const [libelle, body] of [
    ['aucune clé', { prompt: 'x' }],
    ['clé blanche', { prompt: 'x', openai_api_key: '   ' }],
    ['plugin_context sans openai', { prompt: 'x', plugin_context: { api_keys: { mistral: PC } } }],
  ]) {
    const p = preparer(body);
    controle(`${libelle} → invalide, 400`, [p.valid, p.response && p.response.error.code], [false, 400]);
    controle(`${libelle} → message nomme openai_api_key et le repli`,
      /openai_api_key/.test(p.response && p.response.error.message) && /plugin_context\.api_keys\.openai/.test(p.response.error.message), true);
  }
  for (const noeud of [HTTP_SYNC, HTTP_ASYNC]) {
    const h = nd(noeud);
    const auth = ((h.parameters.headerParameters || {}).parameters || []).find(x => x.name === 'Authorization') || {};
    controle(`${noeud} : ni credential ni $env`,
      ['credentials' in h, /\$env/.test(auth.value || ''), h.parameters.authentication === 'predefinedCredentialType'], [false, false, false]);
  }
  const avecEnv = W.nodes.filter(n => /\$env/.test(JSON.stringify(n.parameters))).map(n => n.name).sort();
  controle('$env seulement pour le secret HMAC', avecEnv, ['Prepare Callback with HMAC', 'Sign Callback']);
});

section('5. Réponse synchrone : images base64, usage tel quel, pas de clé', () => {
  const prev = preparer({ ...BASE, plugin_context: { api_keys: { openai: PC } }, options: { quality: 'low' } });
  const s = execCode('Format Output (Sync)', REPONSE_OK, { [PREPARE]: prev });
  controle('success', s.success, true);
  controle('data.images = [{ b64_json, mime_type }]', s.data && s.data.images, [{ b64_json: PNG_1X1, mime_type: 'image/png' }]);
  controle('data.model, size, quality, output_format',
    s.data && [s.data.model, s.data.size, s.data.quality, s.data.output_format], ['gpt-image-1-mini', '1024x1024', 'low', 'png']);
  controle('meta.usage = usage du fournisseur tel quel', s.meta && s.meta.usage, USAGE);
  controle('plus de usage à la racine', 'usage' in s, false);
  controle('meta.provider = openai', s.meta && s.meta.provider, 'openai');
  controle('plus de cost_estimate ni de prompt_revised', /cost_estimate|revised_prompt|prompt_revised/.test(JSON.stringify(s)), false);
  controle('Respond (Sync) rend 200', statutRespond(s), 200);
  controle('clé absente de la réponse', contient(s, CLE, PC), false);
  controle('Respond (Sync) rend $json', resoudre(nd('Respond (Sync)').parameters.responseBody, s), s);

  const jpeg = execCode('Format Output (Sync)', { ...REPONSE_OK, output_format: 'jpeg' },
    { [PREPARE]: preparer({ ...BASE, options: { output_format: 'jpeg' } }) });
  controle('output_format jpeg → mime_type image/jpeg', jpeg.data && jpeg.data.images[0].mime_type, 'image/jpeg');
  const deux = execCode('Format Output (Sync)', { ...REPONSE_OK, data: [{ b64_json: 'QQ==' }, { b64_json: 'Qg==' }] }, { [PREPARE]: prev });
  controle('n = 2 → deux images', deux.data && deux.data.images.length, 2);
  const vide = execCode('Format Output (Sync)', { created: 1, data: [] }, { [PREPARE]: prev });
  controle('réponse sans image → échec 502', [vide.success, vide.error && vide.error.http_status, statutRespond(vide)], [false, 502, 502]);

  const livre = JSON.stringify({ nodes: W.nodes.filter(n => !n.type.endsWith('stickyNote')), connections: W.connections });
  controle('table de prix DALL-E supprimée', /PRICING|cost_estimate/.test(livre), false);
  controle('plus aucun modèle dall-e dans les nœuds', /['"]dall-e/i.test(livre), false);
});

section('6. Erreurs OpenAI relayées avec leur statut', () => {
  const prev = preparer({ ...BASE });
  const cas = [
    [400, { error: { message: "Invalid value: 'standard'. Supported values are: 'low', 'medium', 'high', and 'auto'.", type: 'invalid_request_error', param: 'quality', code: 'invalid_value' } }],
    [401, { error: { message: 'Incorrect API key provided: sk-test-***cdef.', type: 'invalid_request_error', code: 'invalid_api_key' } }],
    [429, { error: { message: 'Rate limit reached for gpt-image-1-mini', type: 'requests', code: 'rate_limit_exceeded' } }],
  ];
  for (const [statut, corpsErr] of cas) {
    const s = execCode('Format Output (Sync)', erreurN8n(statut, corpsErr), { [PREPARE]: prev });
    controle(`${statut} relayé (error.code, error.http_status)`, [s.success, s.error && s.error.code, s.error && s.error.http_status], [false, statut, statut]);
    controle(`${statut} : Respond (Sync) rend ${statut}`, statutRespond(s), statut);
    controle(`${statut} : message OpenAI lisible`, s.error && s.error.message, corpsErr.error.message);
    controle(`${statut} : clé absente`, contient(s, CLE), false);
  }
  const echo = execCode('Format Output (Sync)', erreurN8n(401, { error: { message: `Incorrect API key provided: ${CLE}` } }), { [PREPARE]: prev });
  controle('clé recopiée par l’amont → masquée', [echo.error && echo.error.http_status, contient(echo, CLE)], [401, false]);
  const reseau = execCode('Format Output (Sync)', { error: { message: 'getaddrinfo ENOTFOUND api.openai.com', code: 'ENOTFOUND',
    config: { headers: { Authorization: `Bearer ${CLE}` } } } }, { [PREPARE]: prev });
  controle('panne réseau → 502', [reseau.success, reseau.error && reseau.error.http_status, statutRespond(reseau)], [false, 502, 502]);
  controle('panne réseau : clé absente', contient(reseau, CLE), false);
  const delai = execCode('Format Output (Sync)', { error: { message: 'timeout of 180000ms exceeded', code: 'ECONNABORTED' } }, { [PREPARE]: prev });
  controle('délai dépassé → 502', delai.error && delai.error.http_status, 502);
});

section('7. Rappel asynchrone : forme, statut, pas de clé', () => {
  const job = jobContexte({ ...BASE, job_id: 'job-383', plugin_context: { api_keys: { openai: PC } } });
  controle('Store Job Context : job_id et callback_url', job.job_context && [job.job_context.job_id, job.job_context.callback_url], ['job-383', 'http://cb.test/rappel']);
  const auto = jobContexte({ ...BASE });
  controle('job_id engendré sans randomUUID', /^job_383_/.test(auto.job_context && auto.job_context.job_id), true);
  const accepte = resoudre(nd('Respond 202 Accepted').parameters.responseBody, job);
  controle('Respond 202 : job_id, processing, pas de clé', [accepte.job_id, accepte.status, contient(accepte, CLE, PC)], ['job-383', 'processing', false]);

  const rappel = sortie => execCode('Prepare Callback with HMAC', sortie, {}, { $env: { N8N_WEBHOOK_SECRET: 's' } });
  const ok = execCode('Format Output (Async)', REPONSE_OK, { 'Store Job Context': job });
  const rOk = rappel(ok);
  const corpsOk = JSON.parse(rOk.corps_json || 'null') || {};
  controle('succès : callback_url', rOk.callback_url, 'http://cb.test/rappel');
  controle('succès : success, job_id, status', [corpsOk.success, corpsOk.job_id, corpsOk.status], [true, 'job-383', 'completed']);
  controle('succès : images et meta.usage tel quel', [corpsOk.data && corpsOk.data.images, corpsOk.meta && corpsOk.meta.usage],
    [[{ b64_json: PNG_1X1, mime_type: 'image/png' }], USAGE]);
  controle('succès : data.model/size/quality/output_format',
    corpsOk.data && [corpsOk.data.model, corpsOk.data.size, corpsOk.data.quality, corpsOk.data.output_format],
    ['gpt-image-1-mini', '1024x1024', 'low', 'png']);
  controle('succès : meta.provider openai', corpsOk.meta && corpsOk.meta.provider, 'openai');
  controle('succès : rappel sans clé ni job_context', [contient(rOk, CLE, PC), 'job_context' in corpsOk], [false, false]);
  controle('succès : callback_body ≡ corps_json', JSON.stringify(rOk.callback_body), rOk.corps_json);

  for (const statut of [401, 429]) {
    const ko = execCode('Format Output (Async)', erreurN8n(statut, { error: { message: `erreur ${statut}`, type: 'x' } }, PC), { 'Store Job Context': job });
    const corpsKo = JSON.parse(rappel(ko).corps_json || 'null') || {};
    controle(`${statut} : rappel en échec avec le statut`,
      [corpsKo.success, corpsKo.job_id, corpsKo.status, corpsKo.error && corpsKo.error.http_status, corpsKo.error && corpsKo.error.message],
      [false, 'job-383', 'failed', statut, `erreur ${statut}`]);
    controle(`${statut} : rappel sans clé`, contient(rappel(ko), CLE, PC), false);
  }
});

section('8. Câblage, délais, identifiants', () => {
  const aval = nom => ((W.connections[nom] || {}).main || []).map(sortie => (sortie || []).map(c => c.node));
  controle('Webhook → Prepare Image Request', aval('Webhook'), [[PREPARE]]);
  controle('Prepare Image Request → Valid?', aval(PREPARE), [['Valid?']]);
  controle('Valid? → Has Callback URL? | Error: Validation', aval('Valid?'), [['Has Callback URL?'], ['Error: Validation']]);
  controle('Has Callback URL? → Store Job Context | HTTP (Sync)', aval('Has Callback URL?'), [['Store Job Context'], [HTTP_SYNC]]);
  controle('Has Callback URL? teste $json.callback_url', nd('Has Callback URL?').parameters.conditions.conditions[0].leftValue, '={{ $json.callback_url }}');
  controle('Store Job Context → Respond 202 Accepted', aval('Store Job Context'), [['Respond 202 Accepted']]);
  controle('Respond 202 Accepted → HTTP (Async) : le 202 part AVANT', aval('Respond 202 Accepted'), [[HTTP_ASYNC]]);
  controle('HTTP (Async) → Format Output (Async)', aval(HTTP_ASYNC), [['Format Output (Async)']]);
  controle('Format Output (Async) → Prepare Callback with HMAC', aval('Format Output (Async)'), [['Prepare Callback with HMAC']]);
  controle('Prepare Callback → Sign Callback → Send Callback',
    [aval('Prepare Callback with HMAC'), aval('Sign Callback')], [[['Sign Callback']], [['Send Callback']]]);
  controle('HTTP (Sync) → Format Output (Sync) → Respond (Sync)',
    [aval(HTTP_SYNC), aval('Format Output (Sync)')], [[['Format Output (Sync)']], [['Respond (Sync)']]]);

  const noms = new Set(W.nodes.map(n => n.name));
  const orphelins = Object.entries(W.connections).flatMap(([src, c]) =>
    [src, ...(c.main || []).flat().map(x => x.node)]).filter(n => !noms.has(n));
  controle('connexions : tous les nœuds existent', [...new Set(orphelins)], []);
  controle('noms uniques', noms.size, W.nodes.length);
  controle('ids uniques', new Set(W.nodes.map(n => n.id)).size, W.nodes.length);
  controle('anciens nœuds retirés', ['Validate Input', 'Error: No Prompt', 'DALL-E Generate (Sync)', 'DALL-E Generate (Async)'].filter(n => noms.has(n)), []);
  for (const noeud of [HTTP_SYNC, HTTP_ASYNC]) {
    const h = nd(noeud);
    controle(`${noeud} : délai 180 s, onError continueRegularOutput`, [h.parameters.options && h.parameters.options.timeout, h.onError], [180000, 'continueRegularOutput']);
  }
  controle('Respond (Sync) : responseCode en expression', String(nd('Respond (Sync)').parameters.options.responseCode).startsWith('='), true);
  const expr = W.nodes.flatMap(n => Object.values(n.parameters).concat(Object.values(n.parameters.options || {})))
    .filter(v => typeof v === 'string' && v.startsWith('={{') && /\}\}[\s\S]*\}\}/.test(v));
  controle('aucune expression ={{ … }} avec « }} » intérieur', expr, []);
});

section('9. Documentation', () => {
  const doc = W.nodes.filter(n => n.type.endsWith('stickyNote')).map(n => n.parameters.content || '').join('\n');
  for (const mot of ['gpt-image-1-mini', 'low', 'medium', 'high', 'auto', '1536x1024', 'b64_json', 'mime_type', 'usage',
    'openai_api_key', 'context.openai_api_key', 'plugin_context.api_keys.openai', 'azy.daily#383', '401', '429', '502']) {
    controle(`sticky mentionne ${mot}`, doc.includes(mot), true);
  }
  controle('plus de tarif DALL-E par image', /Pricing \(DALL-E|\$0\.04/.test(doc), false);
});

if (process.argv.includes('--en-ligne')) enLigne().then(conclure, e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
else conclure();

/**
 * UN SEUL appel génératif réel (gpt-image-1-mini, low, 1024x1024), plus un appel
 * en clé fausse (401, gratuit). Corps et en-tête produits par le workflow ; la
 * vraie réponse passe dans Format Output (Sync).
 */
async function enLigne() {
  console.log('\n10. En ligne — corps du workflow envoyé à OpenAI');
  const cle = process.env.OPENAI_API_KEY;
  if (!cle) { console.log('  ⏭  OPENAI_API_KEY absente — étape sautée'); return; }
  const appel = async (cleUtilisee, extra) => {
    const p = preparer({ prompt: 'Un panneau en bois qui dit "Shalom", style aquarelle', plugin_context: { api_keys: { openai: cleUtilisee } },
      options: { model: 'gpt-image-1-mini', quality: 'low', size: '1024x1024' }, ...extra });
    if (!p.valid) throw new Error('Prepare Image Request a refusé la requête');
    const t0 = Date.now();
    const r = await fetch(nd(HTTP_SYNC).parameters.url, {
      method: 'POST',
      headers: { Authorization: enTete(HTTP_SYNC, 'Authorization', p), 'Content-Type': enTete(HTTP_SYNC, 'Content-Type', p) },
      body: JSON.stringify(corpsEnvoye(HTTP_SYNC, p)),
      signal: AbortSignal.timeout(180000),
    });
    const texte = await r.text();
    let j = {};
    try { j = JSON.parse(texte); } catch (e) { j = {}; }
    const entree = r.ok ? j : erreurN8n(r.status, j, cleUtilisee);
    return { statut: r.status, ms: Date.now() - t0, octets: texte.length, sortie: execCode('Format Output (Sync)', entree, { [PREPARE]: p }), cle: cleUtilisee };
  };

  const faux = await appel('sk-proj-cle-volontairement-fausse-383-0000000000');
  console.log(`     clé fausse : HTTP ${faux.statut}, ${faux.ms} ms, http_status ${faux.sortie.error && faux.sortie.error.http_status}, `
    + `« ${faux.sortie.error && faux.sortie.error.message} »`);
  controle('clé fausse : OpenAI rend 401', faux.statut, 401);
  controle('clé fausse : Format Output → http_status 401, Respond 401', [faux.sortie.error && faux.sortie.error.http_status, statutRespond(faux.sortie)], [401, 401]);
  controle('clé fausse : clé absente de la sortie', contient(faux.sortie, faux.cle), false);

  const vrai = await appel(cle);
  const s = vrai.sortie;
  const b64 = (s.data && s.data.images && s.data.images[0] && s.data.images[0].b64_json) || '';
  const png = Buffer.from(b64, 'base64');
  console.log(`     génération : HTTP ${vrai.statut}, ${vrai.ms} ms, réponse ${(vrai.octets / 1e6).toFixed(2)} Mo, base64 ${(b64.length / 1e6).toFixed(2)} Mo `
    + `(${png.length} octets), usage ${JSON.stringify(s.meta && s.meta.usage)}` + (s.error ? `, erreur « ${s.error.message} »` : ''));
  controle('génération : HTTP 200', vrai.statut, 200);
  controle('génération : success', s.success, true);
  controle('génération : base64 décodable, en-tête PNG', png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  controle('génération : mime_type image/png', s.data && s.data.images[0].mime_type, 'image/png');
  controle('génération : usage présent (input_tokens, output_tokens)',
    [typeof (s.meta && s.meta.usage && s.meta.usage.input_tokens), typeof (s.meta && s.meta.usage && s.meta.usage.output_tokens)], ['number', 'number']);
  controle('génération : Respond rendrait 200', statutRespond(s), 200);
  controle('génération : clé absente de la sortie', contient(s, cle), false);
}

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length}/${total} contrôle(s) en échec`); process.exit(1); }
  console.log(`✅ tous les contrôles passent  (${total}/${total})`);
}
