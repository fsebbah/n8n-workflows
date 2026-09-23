#!/usr/bin/env node
/**
 * AUDIO - Transcription : le workflow `audio-transcription` du contrat de chaîne — azy.daily#296.
 *
 *     node scripts/test/test_296_audio_transcription.js
 *     node --env-file=.env.local scripts/test/test_296_audio_transcription.js --en-ligne
 *         # 7 appels réels courts (MISTRAL_API_KEY, OPENAI_API_KEY), fixture de 7 s
 *
 * Ce que le test protège
 * ----------------------
 *  1. structure : nom sans préfixe « MCP - », webhook, ids et noms uniques,
 *     connexions valides, Code nodes sans require/process ;
 *  2. validation : entrée invalide → 400 SYNCHRONE { accepted: false }, aucun rappel ;
 *  3. câblage : le 202 part AVANT tout nœud lent (téléchargement, transcription, rappel) ;
 *  4. corps fournisseur : Mistral en file_url (multipart sans fichier), OpenAI en
 *     multipart binaire, response_format selon le modèle, nom de fichier corrigé ;
 *  5. refus avant appel : taille (OpenAI), durée (gpt-4o-*-transcribe), échec de téléchargement ;
 *  6. correspondance de CHAQUE code d'erreur à partir des vrais messages mesurés le 17/09 ;
 *  7. forme exacte des deux rappels, usage.duration_seconds omis quand absent ;
 *  8. signature calculée sur le corps réellement envoyé, secret absent → arrêt explicite ;
 *  9. la clé n'apparaît dans AUCUNE sortie ;
 * 10. documentation.
 *
 * Le test exécute le JavaScript et les expressions extraits du JSON du workflow :
 * c'est le code importé qui est testé, pas une copie.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..', '..');
const FICHIER = path.join(RACINE, 'workflows', 'AUDIO_-_Transcription.json');
const BRUT = fs.readFileSync(FICHIER, 'utf8');
const W = JSON.parse(BRUT);
const nd = n => W.nodes.find(x => x.name === n) || { parameters: {} };

const V_REQ = 'Valider la requête';
const PREP = 'Préparer le fichier OpenAI';
const RAPPEL = 'Construire le rappel';
const MISTRAL = 'Mistral — transcrire (file_url)';
const TELECH = 'OpenAI — télécharger audio_url';
const OPENAI = 'OpenAI — transcrire (multipart)';

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
function section(titre, fn) {
  console.log(`\n${titre}`);
  try { fn(); } catch (e) { total++; echecs.push(titre); console.log(`  ❌ la section a levé : ${e.stack}`); }
}

/** Un Code node dans un bac à sable proche de n8n (ni require, ni process) ; `$('nom')` rend `prev[nom]`. */
function execCode(nom, item, prev = {}) {
  const src = nd(nom).parameters.jsCode;
  if (typeof src !== 'string') return { erreur: `nœud ${nom} absent` };
  const items = [item];
  try {
    const r = vm.runInNewContext(`(function(){${src}})()`, {
      $input: { first: () => items[0], all: () => items },
      $: n => ({ first: () => ({ json: prev[n] }) }),
    }, { timeout: 5000 });
    return Array.isArray(r) ? r[0] : r;
  } catch (e) {
    return { erreur: `${nom} a levé ${e.message}` };
  }
}

/** Résout un paramètre comme n8n : expression seulement s'il commence par « = ». */
function resoudre(valeur, json, env = {}) {
  if (typeof valeur !== 'string' || !valeur.startsWith('=')) return valeur;
  const evaluer = expr => vm.runInNewContext(`(${expr})`, { $json: json, $env: env, JSON, Object, Array, String, Number, Math });
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
/** Les champs multipart tels que n8n les résout : [[nom, valeur | {binaire}]]. */
const champsMultipart = (noeud, json) => ((nd(noeud).parameters.bodyParameters || {}).parameters || [])
  .map(p => [p.name, p.parameterType === 'formBinaryData' ? { binaire: p.inputDataFieldName } : resoudre(p.value, json)]);
const siCondition = (noeud, json, env) => {
  const c = nd(noeud).parameters.conditions.conditions[0];
  return resoudre(c.leftValue, json, env) === c.rightValue;
};

const CLE = 'sk-test-296-CLE-SECRETE-0123456789abcdef';
const contient = (v, ...cles) => cles.some(c => JSON.stringify(v === undefined ? null : v).includes(c));
const SORTIES = []; // toutes les sorties produites, pour le contrôle final « clé absente »
const garder = v => { SORTIES.push(v); return v; };

const BASE = {
  job_id: 'job-296',
  callback_url: 'https://api.test/api/v1/webhooks/transcription-callback?tenant_id=t1&job_id=job-296',
  audio_url: 'https://f003.backblazeb2.test/file/azy-audio/t1/reunion.ogg?Authorization=3_20260917_SIGNATURE',
  mime_type: 'audio/ogg',
  filename: 'reunion.ogg',
  size_bytes: 14680064,
  provider: 'mistralai',
  model: 'voxtral-mini-2602',
  api_key: CLE,
  language: 'fr',
  duration_seconds: 3540,
};
const valider = body => garder(execCode(V_REQ, { json: { body, headers: {}, query: {} } })).json;
const rappel = (req, json) => {
  const s = garder(execCode(RAPPEL, { json }, { [V_REQ]: req }));
  if (s.erreur) return { erreur: s.erreur };
  return { ...s.json, corps: JSON.parse(s.json.corps_json) };
};
/** Réponse d'un nœud HTTP en fullResponse + neverError. JSON → body ; texte → data (mesuré : 401 OpenAI en text/plain). */
const reponse = (statut, corps, type = 'application/json') => type.includes('json')
  ? { statusCode: statut, statusMessage: '', headers: { 'content-type': type }, body: typeof corps === 'string' ? JSON.parse(corps) : corps }
  : { statusCode: statut, statusMessage: '', headers: { 'content-type': type }, data: corps };

// ─── Réponses MESURÉES le 2026-09-17 (corps tels que reçus ; URL signée Azure remplacée) ───
const M = {
  mistral_ok: '{"model":"voxtral-mini-2602","text":"Bonjour, ceci est un essai de transcription pour la réunion de jeudi. Nous parlerons du budget et du calendrier.","language":null,"segments":[],"usage":{"prompt_audio_seconds":7,"prompt_tokens":5,"total_tokens":406,"completion_tokens":26,"prompt_tokens_details":{"cached_tokens":0,"audio_tokens":375},"service_tier":"standard"},"finish_reason":null}',
  openai_whisper_ok: '{"task":"transcribe","language":"french","duration":7.0,"text":"Bonjour. Ceci est un essai de transcription pour la réunion de jeudi. Nous parlerons du budget et du calendrier.","segments":[],"usage":{"type":"duration","seconds":7}}',
  mistral_401: '{"detail":"Invalid API Key"}\n',
  openai_401: '{\n  "error": {\n    "message": "Incorrect API key provided: sk-proj-**************************************0000. You can find your API key at https://platform.openai.com/account/api-keys.",\n    "type": "invalid_request_error",\n    "code": "invalid_api_key",\n    "param": null\n  },\n  "status": 401\n}',
  openai_413: '{"error":{"message":"413: Maximum content size limit (26214400) exceeded (26438978 bytes read)","type":"server_error","param":null,"code":null},"usage":{"type":"duration","seconds":0}}',
  openai_format: '{"error":{"message":"Invalid file format. Supported formats: [\'flac\', \'m4a\', \'mp3\', \'mp4\', \'mpeg\', \'mpga\', \'oga\', \'ogg\', \'wav\', \'webm\']","type":"invalid_request_error","param":null,"code":null},"usage":{"type":"duration","seconds":0}}',
  mistral_non_audio: '{"object":"error","message":"Audio input could not be decoded. ","type":"invalid_request_file","param":null,"code":"3310","raw_status_code":400}',
  mistral_url_html: '{"object":"error","message":"Audio from \'https://www.example.com/\' could not be decoded. ","type":"invalid_request_file","param":null,"code":"3310","raw_status_code":400}',
  mistral_url_403: '{"object":"error","message":"File could not be fetched from url \'https://stockage.test/fine-tune/f7e0.ogg?se=2026-09-17T15%3A19%3A30Z&sp=r&sv=2026-02-06&sr=b&sig=AAAAdHWZmoAGpt2Fkxui4dhnPWn%2FYiHV3XOBNbYROIs%3D\'","type":"invalid_request_file","param":null,"code":"3310","raw_status_code":400}',
  mistral_url_404: '{"object":"error","message":"File could not be fetched from url \'https://upload.wikimedia.org/wikipedia/commons/0/00/Inexistant_azy_296.ogg\'","type":"invalid_request_file","param":null,"code":"3310","raw_status_code":400}',
  mistral_json_422: '{"object":"error","message":"Invalid request, make sure the request is formatted as a multipart/form-data request.","type":"invalid_request_error","param":null,"code":null,"raw_status_code":422}',
  mistral_modele: '{"object":"error","message":"Invalid model: voxtral-inexistant-296","type":"invalid_model","param":null,"code":"1500","raw_status_code":400}',
  openai_modele: '{\n    "error": {\n        "message": "The model `whisper-inexistant-296` does not exist or you do not have access to it.",\n        "type": "invalid_request_error",\n        "param": null,\n        "code": "model_not_found"\n    }\n}\n',
  openai_verbose_incompatible: '{\n  "error": {\n    "message": "response_format \'verbose_json\' is not compatible with model \'gpt-4o-mini-transcribe-api-ev3\'. Use \'json\' or \'text\' instead.",\n    "type": "invalid_request_error",\n    "param": "response_format",\n    "code": "unsupported_value"\n  }\n}',
  gpt4o_1500: '{\n  "error": {\n    "message": "audio duration 1500.0 seconds is longer than 1400 seconds which is the maximum for this model",\n    "type": "invalid_request_error",\n    "param": null,\n    "code": "invalid_value"\n  }\n}',
  gpt4o_mini_1500: '{\n  "error": {\n    "message": "Total number of tokens in instructions + audio is too large for this model",\n    "type": "invalid_request_error",\n    "param": null,\n    "code": "input_too_large"\n  }\n}',
  gpt4o_mini_3600: '{\n  "error": {\n    "message": "Audio file might be corrupted or unsupported",\n    "type": "invalid_request_error",\n    "param": "file",\n    "code": "invalid_value"\n  }\n}',
};

// ═══════════════════════════════════════════════════════════════════════════
section('1. Structure', () => {
  controle('nom « AUDIO - Transcription »', W.name, 'AUDIO - Transcription');
  controle('pas de préfixe « MCP - » (le registre MCP le publierait)', /^MCP/.test(W.name), false);
  controle('fichier AUDIO_-_Transcription.json', path.basename(FICHIER), 'AUDIO_-_Transcription.json');
  controle('JSON indenté à 2 espaces, UTF-8 non échappé', [BRUT.startsWith('{\n  "name"'), /\\u00e9/.test(BRUT), BRUT.includes('requête')], [true, false, true]);
  const wh = nd('Webhook');
  controle('webhook POST /audio-transcription, réponse par nœud',
    [wh.parameters.httpMethod, wh.parameters.path, wh.parameters.responseMode], ['POST', 'audio-transcription', 'responseNode']);
  controle('webhookId défini', typeof wh.webhookId === 'string' && wh.webhookId.length > 0, true);
  const autres = fs.readdirSync(path.join(RACINE, 'workflows')).filter(f => f.endsWith('.json') && f !== 'AUDIO_-_Transcription.json')
    .filter(f => { const t = fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'); return t.includes('"path": "audio-transcription"') || t.includes(`"webhookId": "${wh.webhookId}"`); });
  controle('path et webhookId uniques dans le dépôt', autres, []);
  const noms = new Set(W.nodes.map(n => n.name));
  controle('noms uniques', noms.size, W.nodes.length);
  controle('ids uniques', new Set(W.nodes.map(n => n.id)).size, W.nodes.length);
  const orphelins = Object.entries(W.connections).flatMap(([src, c]) => [src, ...(c.main || []).flat().map(x => x.node)]).filter(n => !noms.has(n));
  controle('connexions : tous les nœuds existent', [...new Set(orphelins)], []);
  const nonRelies = W.nodes.filter(n => !n.type.endsWith('stickyNote') && n.name !== 'Webhook')
    .filter(n => !Object.values(W.connections).some(c => (c.main || []).flat().some(x => x.node === n.name))).map(n => n.name);
  controle('aucun nœud isolé', nonRelies, []);
  const nu = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, '``');
  for (const n of W.nodes.filter(x => x.parameters.jsCode)) {
    const src = nu(n.parameters.jsCode);
    controle(`${n.name} : ni require ni process, compile`,
      [/\brequire\s*\(/.test(src), /\bprocess\s*\./.test(src), (() => { try { new vm.Script(`(function(){${n.parameters.jsCode}})`); return true; } catch (e) { return e.message; } })()],
      [false, false, true]);
  }
  const avecEnv = W.nodes.filter(n => /\$env/.test(JSON.stringify(n.parameters)) && !n.type.endsWith('stickyNote')).map(n => n.name).sort();
  // azy.daily#421 : deux $env s'ajoutent sur la branche whisper-local, et la distinction
  // est celle qui compte — les clés des FOURNISSEURS restent interdites en $env (BYOT, elles
  // arrivent dans le corps), tandis que l'adresse d'un service d'infrastructure unique et le
  // jeton d'accès à ce service n'ont pas d'autre endroit où vivre.
  controle('$env : secret HMAC, adresse et jeton du moteur local — jamais une clé fournisseur', avecEnv,
    ['Secret configuré ?', 'Signer le rappel', 'whisper-local — soumettre']);
  controle('aucune clé de fournisseur en $env',
    /\$env\.[A-Z_]*(API_KEY|OPENAI|MISTRAL|ANTHROPIC|GOOGLE)/.test(JSON.stringify(W.nodes)), false);
  const expressions = [];
  const parcourir = v => { if (typeof v === 'string') expressions.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(parcourir); };
  W.nodes.filter(n => !n.type.endsWith('stickyNote')).forEach(n => parcourir(n.parameters));
  controle('aucune expression ={{ … }} avec « }} » intérieur',
    expressions.filter(v => v.startsWith('={{') && /\}\}[\s\S]*\}\}/.test(v)), []);
  controle('aucune expression {{ }} sans « = » initial',
    expressions.filter(v => !v.startsWith('=') && v.includes('{{')), []);
  controle('aucune credential n8n', W.nodes.filter(n => n.credentials).map(n => n.name), []);
});

section('2. Validation : 400 synchrone, aucun rappel', () => {
  const ok = valider(BASE);
  controle('entrée complète → valide', ok.valide, true);
  controle('réponse 202 = { accepted: true, job_id }', ok.reponse, { accepted: true, job_id: 'job-296' });
  const cas = [
    ['job_id absent', { job_id: undefined }, 'job_id'],
    ['callback_url absent', { callback_url: undefined }, 'callback_url'],
    ['callback_url en http', { callback_url: 'http://api.test/rappel' }, 'callback_url'],
    ['audio_url absent', { audio_url: '' }, 'audio_url'],
    ['audio_url en http', { audio_url: 'http://b2.test/a.ogg' }, 'audio_url'],
    ['audio_url non URL', { audio_url: 'reunion.ogg' }, 'audio_url'],
    ['mime_type absent', { mime_type: undefined }, 'mime_type'],
    ['filename absent', { filename: '  ' }, 'filename'],
    ['size_bytes = 0', { size_bytes: 0 }, 'size_bytes'],
    ['size_bytes = 1.5', { size_bytes: 1.5 }, 'size_bytes'],
    ['provider absent', { provider: undefined }, 'provider'],
    ['provider = mistral', { provider: 'mistral' }, 'provider'],
    ['provider = anthropic', { provider: 'anthropic' }, 'provider'],
    ['model absent', { model: undefined }, 'model'],
    ['api_key absente', { api_key: undefined }, 'api_key'],
    ['language = 42', { language: 42 }, 'language'],
    ['duration_seconds = -3', { duration_seconds: -3 }, 'duration_seconds'],
    ['duration_seconds = "long"', { duration_seconds: 'long' }, 'duration_seconds'],
  ];
  for (const [libelle, extra, champ] of cas) {
    const v = valider({ ...BASE, ...extra });
    const r = v.reponse || {};
    controle(`${libelle} → 400 { accepted: false }, champ ${champ}`,
      [v.valide, r.accepted, r.error && r.error.code, r.error && r.error.http_status, r.error && r.error.fields.includes(champ)],
      [false, false, 'invalid_request', 400, true]);
  }
  const vide = execCode(V_REQ, { json: { headers: {} } }).json;
  controle('corps absent → 400, les 8 champs requis nommés (size_bytes facultatif)', [vide.valide, vide.reponse.error.fields.length], [false, 8]);
  controle('language et duration_seconds absents ou null → valide',
    [valider({ ...BASE, language: undefined, duration_seconds: undefined }).valide, valider({ ...BASE, language: null, duration_seconds: null }).valide], [true, true]);
  controle('size_bytes absent ou null → valide, size_bytes null (demande api 17/09)',
    [valider({ ...BASE, size_bytes: undefined }).valide, valider({ ...BASE, size_bytes: null }).size_bytes], [true, null]);
  controle('size_bytes et duration_seconds en chaîne de chiffres → acceptés',
    [valider({ ...BASE, size_bytes: '1024', duration_seconds: '12.5' }).size_bytes, valider({ ...BASE, size_bytes: '1024', duration_seconds: '12.5' }).duration_seconds], [1024, 12.5]);
  controle('URL signée avec requête sans chemin → acceptée', valider({ ...BASE, audio_url: 'https://b2.test?sig=1' }).valide, true);
  const invalide = valider({ ...BASE, provider: 'x' });
  controle('réponse 400 : job_id repris, clé absente', [invalide.reponse.job_id, contient(invalide, CLE)], ['job-296', false]);
  const r400 = nd('Répondre 400');
  controle('Répondre 400 : code 400, corps = $json.reponse',
    [r400.parameters.options.responseCode, resoudre(r400.parameters.responseBody, invalide)], [400, invalide.reponse]);
  controle('Répondre 400 : aucun nœud en aval (pas de rappel)', (W.connections['Répondre 400'] || { main: [] }).main.flat().length, 0);
  controle('Requête valide ? : vrai → 202, faux → 400',
    [siCondition('Requête valide ?', ok), siCondition('Requête valide ?', invalide)], [true, false]);
});

section('3. Câblage : le 202 part AVANT tout travail lent', () => {
  const aval = nom => ((W.connections[nom] || {}).main || []).map(s => (s || []).map(c => c.node));
  controle('Webhook → Valider la requête', aval('Webhook'), [[V_REQ]]);
  controle('Valider → Requête valide ?', aval(V_REQ), [['Requête valide ?']]);
  controle('Requête valide ? → Répondre 202 | Répondre 400', aval('Requête valide ?'), [['Répondre 202'], ['Répondre 400']]);
  controle('Répondre 202 → Refus avant appel ?', aval('Répondre 202'), [['Refus avant appel ?']]);
  // Le fournisseur local est testé AVANT le choix Mistral/OpenAI : sa branche ne transcrit pas.
  controle('Refus avant appel ? → Construire le rappel | whisper-local ?', aval('Refus avant appel ?'), [[RAPPEL], ['whisper-local ?']]);
  controle('whisper-local ? → soumettre | Mistral ?', aval('whisper-local ?'), [['whisper-local — soumettre'], ['Mistral ?']]);
  controle('Job accepté ? → fin (le moteur rappelle) | rappel d\'échec', aval('Job accepté ?'),
    [['Terminé — le moteur rappellera'], ["Construire le rappel d'échec local"]]);
  controle('le rappel d\'échec local rejoint la signature commune', aval("Construire le rappel d'échec local"), [['Secret configuré ?']]);
  controle('Mistral ? → Mistral file_url | OpenAI télécharger', aval('Mistral ?'), [[MISTRAL], [TELECH]]);
  controle('Mistral → Construire le rappel', aval(MISTRAL), [[RAPPEL]]);
  controle('Télécharger → Préparer le fichier → Fichier refusé ?', [aval(TELECH), aval(PREP)], [[[PREP]], [['Fichier refusé ?']]]);
  controle('Fichier refusé ? → Construire le rappel | OpenAI transcrire', aval('Fichier refusé ?'), [[RAPPEL], [OPENAI]]);
  controle('OpenAI transcrire → Construire le rappel', aval(OPENAI), [[RAPPEL]]);
  controle('Construire → Secret configuré ? → Signer | Erreur', [aval(RAPPEL), aval('Secret configuré ?')],
    [[['Secret configuré ?']], [['Signer le rappel'], ['Erreur — secret absent']]]);
  controle('Signer → Envoyer le rappel', aval('Signer le rappel'), [['Envoyer le rappel']]);
  // Aucun chemin Webhook → nœud lent qui évite « Répondre 202 »
  const lents = W.nodes.filter(n => n.type.endsWith('httpRequest') || n.type.endsWith('crypto')).map(n => n.name);
  const vus = new Set();
  const pile = ['Webhook'];
  while (pile.length) {
    const n = pile.pop();
    if (vus.has(n) || n === 'Répondre 202') continue;
    vus.add(n);
    aval(n).flat().forEach(x => pile.push(x));
  }
  controle('aucun nœud lent atteignable sans passer par Répondre 202', lents.filter(n => vus.has(n)), []);
  const r202 = nd('Répondre 202');
  const ok = valider(BASE);
  controle('Répondre 202 : code 202, corps { accepted: true, job_id }',
    [r202.parameters.options.responseCode, resoudre(r202.parameters.responseBody, ok)], [202, { accepted: true, job_id: 'job-296' }]);
  controle('Refus avant appel ? : faux sans refus, vrai avec',
    [siCondition('Refus avant appel ?', ok), siCondition('Refus avant appel ?', valider({ ...BASE, provider: 'openai', model: 'gpt-4o-transcribe', duration_seconds: 3600 }))], [false, true]);
  controle('Mistral ? : mistralai → vrai, openai → faux',
    [siCondition('Mistral ?', ok), siCondition('Mistral ?', valider({ ...BASE, provider: 'openai', model: 'whisper-1' }))], [true, false]);
});

section('4. Corps envoyés, fournisseur par fournisseur', () => {
  const mi = valider(BASE);
  const m = nd(MISTRAL);
  controle('Mistral : POST /v1/audio/transcriptions', [m.parameters.method, m.parameters.url], ['POST', 'https://api.mistral.ai/v1/audio/transcriptions']);
  controle('Mistral : multipart (un corps JSON est refusé en 422 — mesuré)', m.parameters.contentType, 'multipart-form-data');
  controle('Mistral : champs model, file_url = audio_url, language — AUCUN fichier',
    champsMultipart(MISTRAL, mi), [['model', 'voxtral-mini-2602'], ['file_url', BASE.audio_url], ['language', 'fr']]);
  controle('Mistral : language vide quand absent (mesuré accepté)',
    champsMultipart(MISTRAL, valider({ ...BASE, language: undefined }))[2], ['language', '']);
  controle('Mistral : Authorization Bearer <clé>', enTete(MISTRAL, 'Authorization', mi) === `Bearer ${CLE}`, true);

  const oa = valider({ ...BASE, provider: 'openai', model: 'whisper-1', size_bytes: 21140 });
  const t = nd(TELECH);
  controle('OpenAI : téléchargement GET audio_url, en fichier « data »',
    [t.parameters.method, resoudre(t.parameters.url, oa), t.parameters.options.response.response.responseFormat, t.parameters.options.response.response.outputPropertyName],
    ['GET', BASE.audio_url, 'file', 'data']);
  controle('OpenAI : téléchargement sans en-tête (URL signée seule)', t.parameters.sendHeaders === true, false);
  const o = nd(OPENAI);
  controle('OpenAI : POST /v1/audio/transcriptions en multipart', [o.parameters.method, o.parameters.url, o.parameters.contentType],
    ['POST', 'https://api.openai.com/v1/audio/transcriptions', 'multipart-form-data']);
  const prep = execCode(PREP, { json: { statusCode: 200, statusMessage: 'OK', headers: { 'content-length': '21140' } },
    binary: { data: { data: 'T2dnUw==', mimeType: 'application/octet-stream', fileName: 'reunion', bytes: 21140 } } }, { [V_REQ]: oa });
  controle('OpenAI : champs file (binaire), model, response_format verbose_json, language',
    champsMultipart(OPENAI, prep.json), [['file', { binaire: 'file' }], ['model', 'whisper-1'], ['response_format', 'verbose_json'], ['language', 'fr']]);
  controle('OpenAI : Authorization Bearer <clé>', enTete(OPENAI, 'Authorization', prep.json) === `Bearer ${CLE}`, true);
  controle('Préparer : binaire « file » = octets téléchargés, sans copie de contenu',
    [prep.binary.file.data, prep.binary.file.bytes], ['T2dnUw==', 21140]);
  controle('Préparer : fileName et mimeType corrigés', [prep.binary.file.fileName, prep.binary.file.mimeType, prep.binary.file.fileExtension], ['reunion.ogg', 'audio/ogg', 'ogg']);
  controle('Préparer : pas de binaire « data » résiduel', Object.keys(prep.binary), ['file']);
  controle('Fichier refusé ? : faux quand le fichier est prêt', siCondition('Fichier refusé ?', prep.json), false);
  const rf = m => valider({ ...BASE, provider: 'openai', model: m }).response_format;
  controle('response_format : whisper-1 → verbose_json ; gpt-4o-* → json (verbose_json refusé, mesuré)',
    [rf('whisper-1'), rf('gpt-4o-transcribe'), rf('gpt-4o-mini-transcribe-2025-12-15')], ['verbose_json', 'json', 'json']);
  controle('Mistral : response_format non utilisé', mi.response_format, null);
  const nom = (filename, mime_type) => valider({ ...BASE, filename, mime_type }).nom_fichier;
  controle('nom : .ogg gardé', nom('reunion.ogg', 'audio/ogg'), 'reunion.ogg');
  controle('nom : .opus → .ogg (OpenAI refuse .opus — mesuré)', nom('reunion.opus', 'audio/opus'), 'reunion.ogg');
  controle('nom : .bin + audio/ogg → .ogg (OpenAI refuse .bin — mesuré)', nom('reunion.bin', 'audio/ogg'), 'reunion.ogg');
  controle('nom : sans extension + audio/webm → .webm', nom('reunion', 'audio/webm'), 'reunion.webm');
  controle('nom : .m4a gardé, audio/x-m4a', nom('Note vocale.m4a', 'audio/x-m4a'), 'Note vocale.m4a');
  controle('nom : mime avec paramètres (audio/ogg; codecs=opus)', nom('a.opus', 'audio/ogg; codecs=opus'), 'a.ogg');
  controle('nom : chemin et guillemets retirés', nom('dossier/"a".mp3', 'audio/mpeg'), '_a_.mp3');
  controle('nom : extension et mime inconnus → inchangé', nom('a.xyz', 'application/x-inconnu'), 'a.xyz');
  for (const n of [MISTRAL, TELECH, OPENAI]) {
    const p = nd(n);
    controle(`${n} : fullResponse + neverError, onError continueRegularOutput`,
      [p.parameters.options.response.response.fullResponse, p.parameters.options.response.response.neverError, p.onError], [true, true, 'continueRegularOutput']);
  }
  controle('délais : transcription ≥ 15 min (20), téléchargement 10 min',
    [nd(MISTRAL).parameters.options.timeout >= 900000, nd(OPENAI).parameters.options.timeout >= 900000, nd(MISTRAL).parameters.options.timeout, nd(TELECH).parameters.options.timeout],
    [true, true, 1200000, 600000]);
});

section('5. Refus avant appel', () => {
  const refus = extra => valider({ ...BASE, ...extra }).echec;
  controle('OpenAI, size_bytes 26 214 400 → file_too_large 413',
    [refus({ provider: 'openai', model: 'whisper-1', size_bytes: 26214400 }).code, refus({ provider: 'openai', model: 'whisper-1', size_bytes: 26214400 }).http_status], ['file_too_large', 413]);
  controle('OpenAI, 26 214 400 − 16 384 octets → accepté (marge multipart)', refus({ provider: 'openai', model: 'whisper-1', size_bytes: 26214400 - 16384 }), null);
  controle('OpenAI, 1 octet de plus → file_too_large', refus({ provider: 'openai', model: 'whisper-1', size_bytes: 26214400 - 16383 }).code, 'file_too_large');
  controle('Mistral, 60 Mo → aucun refus (> 57 Mo acceptés, #301)', refus({ size_bytes: 60000000 }), null);
  controle('OpenAI sans size_bytes → aucun refus avant appel (vérifié après téléchargement)', refus({ provider: 'openai', model: 'whisper-1', size_bytes: undefined }), null);
  controle('gpt-4o-transcribe, 1 500 s → audio_too_long 400',
    [refus({ provider: 'openai', model: 'gpt-4o-transcribe', duration_seconds: 1500, size_bytes: 1000 }).code, refus({ provider: 'openai', model: 'gpt-4o-transcribe', duration_seconds: 1500, size_bytes: 1000 }).http_status], ['audio_too_long', 400]);
  controle('gpt-4o-mini-transcribe-2025-12-15, 1 401 s → audio_too_long', refus({ provider: 'openai', model: 'gpt-4o-mini-transcribe-2025-12-15', duration_seconds: 1401, size_bytes: 1000 }).code, 'audio_too_long');
  controle('gpt-4o-transcribe, 1 400 s pile → accepté', refus({ provider: 'openai', model: 'gpt-4o-transcribe', duration_seconds: 1400, size_bytes: 1000 }), null);
  controle('gpt-4o-transcribe, durée inconnue → accepté (on tente)', refus({ provider: 'openai', model: 'gpt-4o-transcribe', duration_seconds: undefined, size_bytes: 1000 }), null);
  controle('whisper-1, 7 200 s → accepté (aucune limite connue)', refus({ provider: 'openai', model: 'whisper-1', duration_seconds: 7200, size_bytes: 1000 }), null);
  controle('voxtral-mini-2602, 7 200 s → accepté', refus({ duration_seconds: 7200 }), null);
  controle('gpt-4o-transcribe-diarize → pas de limite supposée (non mesuré)', valider({ ...BASE, provider: 'openai', model: 'gpt-4o-transcribe-diarize' }).limite_duree_s, null);
  controle('durée ET taille dépassées → audio_too_long d’abord (la compression n’y peut rien)',
    refus({ provider: 'openai', model: 'gpt-4o-transcribe', duration_seconds: 3600, size_bytes: 30000000 }).code, 'audio_too_long');

  const oa = valider({ ...BASE, provider: 'openai', model: 'whisper-1', size_bytes: 1000 });
  const prep = (json, binary) => garder(execCode(PREP, { json, binary }, { [V_REQ]: oa })).json;
  const BIN = { data: { data: 'T2dnUw==', mimeType: 'audio/ogg', fileName: 'x', bytes: 1000 } };
  const tel403 = prep({ statusCode: 403, statusMessage: 'Forbidden', headers: {} }, BIN);
  controle('téléchargement 403 (URL expirée) → audio_fetch_failed 403', [tel403.echec.code, tel403.echec.http_status], ['audio_fetch_failed', 403]);
  controle('téléchargement 404 → audio_fetch_failed 404', [prep({ statusCode: 404, headers: {} }, BIN).echec.code, prep({ statusCode: 404, headers: {} }, BIN).echec.http_status], ['audio_fetch_failed', 404]);
  const telDelai = prep({ error: { message: 'timeout of 600000ms exceeded', code: 'ECONNABORTED' } });
  controle('téléchargement délai dépassé → audio_fetch_failed, http_status null', [telDelai.echec.code, telDelai.echec.http_status], ['audio_fetch_failed', null]);
  controle('téléchargement DNS → http_status null', prep({ error: { message: 'getaddrinfo ENOTFOUND b2.test', code: 'ENOTFOUND' } }).echec.http_status, null);
  const telGros = prep({ statusCode: 200, headers: { 'content-length': '26300000' } }, BIN);
  controle('taille téléchargée 26,3 Mo (size_bytes mentait) → file_too_large 413', [telGros.echec.code, telGros.echec.http_status], ['file_too_large', 413]);
  controle('taille téléchargée par bytes si pas de content-length', prep({ statusCode: 200, headers: {} }, { data: { ...BIN.data, bytes: 26300000 } }).echec.code, 'file_too_large');
  controle('fichier vide → audio_unreadable (relancer ne le remplira pas)', prep({ statusCode: 200, headers: { 'content-length': '0' } }, BIN).echec.code, 'audio_unreadable');
  controle('200 sans binaire → audio_fetch_failed', prep({ statusCode: 200, headers: {} }).echec.code, 'audio_fetch_failed');
  controle('Fichier refusé ? : vrai sur échec de téléchargement', siCondition('Fichier refusé ?', tel403), true);
  controle('URL signée masquée dans le message de téléchargement',
    prep({ error: { message: `connect ECONNREFUSED ${BASE.audio_url}`, code: 'ECONNREFUSED' } }).echec.provider_message.includes('SIGNATURE'), false);
  // Le refus avant appel devient bien un rappel d'échec
  const req = valider({ ...BASE, provider: 'openai', model: 'gpt-4o-transcribe', duration_seconds: 3600 });
  const r = rappel(req, req);
  controle('refus avant appel → rappel { success: false, audio_too_long, 400 }',
    [r.corps.success, r.corps.error.code, r.corps.error.http_status], [false, 'audio_too_long', 400]);
  const r2 = rappel(oa, tel403);
  controle('échec de téléchargement → rappel audio_fetch_failed 403', [r2.corps.error.code, r2.corps.error.http_status], ['audio_fetch_failed', 403]);
});

section('6. Correspondance des erreurs — messages MESURÉS', () => {
  const mi = valider(BASE);
  const oaW = valider({ ...BASE, provider: 'openai', model: 'whisper-1', size_bytes: 1000 });
  const oa4o = (duree, modele = 'gpt-4o-transcribe') => valider({ ...BASE, provider: 'openai', model: modele, size_bytes: 1000, duration_seconds: duree });
  const cas = [
    ['Mistral 401 « Invalid API Key »', mi, reponse(401, M.mistral_401), 'provider_auth', 401, 'Invalid API Key'],
    ['OpenAI 401 en text/plain « Incorrect API key provided »', oaW, reponse(401, M.openai_401, 'text/plain'), 'provider_auth', 401, 'Incorrect API key provided'],
    ['OpenAI 413 « Maximum content size limit »', oaW, reponse(413, M.openai_413), 'file_too_large', 413, 'Maximum content size limit (26214400)'],
    ['OpenAI 400 « Invalid file format »', oaW, reponse(400, M.openai_format), 'unsupported_format', 400, 'Invalid file format'],
    ['Mistral 400 « Audio input could not be decoded »', mi, reponse(400, M.mistral_non_audio), 'audio_unreadable', 400, 'could not be decoded'],
    ['Mistral 400 file_url HTML « could not be decoded »', mi, reponse(400, M.mistral_url_html), 'audio_unreadable', 400, "Audio from 'https://www.example.com/'"],
    ['Mistral 400 file_url 403 « File could not be fetched »', mi, reponse(400, M.mistral_url_403), 'audio_fetch_failed', 400, 'File could not be fetched from url'],
    ['Mistral 400 file_url 404 « File could not be fetched »', mi, reponse(400, M.mistral_url_404), 'audio_fetch_failed', 400, 'Inexistant_azy_296.ogg'],
    ['Mistral 422 corps JSON refusé', mi, reponse(422, M.mistral_json_422), 'internal_error', 422, 'multipart/form-data'],
    ['Mistral 400 « Invalid model »', mi, reponse(400, M.mistral_modele), 'internal_error', 400, 'Invalid model'],
    ['OpenAI 404 « model_not_found »', oaW, reponse(404, M.openai_modele), 'internal_error', 404, 'does not exist'],
    ['OpenAI 400 verbose_json incompatible', oa4o(undefined, 'gpt-4o-mini-transcribe'), reponse(400, M.openai_verbose_incompatible), 'internal_error', 400, 'verbose_json'],
    ['gpt-4o-transcribe 1 500 s « longer than 1400 seconds »', oa4o(undefined), reponse(400, M.gpt4o_1500), 'audio_too_long', 400, 'longer than 1400 seconds'],
    ['gpt-4o-mini 1 500 s « too large for this model »', oa4o(undefined, 'gpt-4o-mini-transcribe'), reponse(400, M.gpt4o_mini_1500), 'audio_too_long', 400, 'too large for this model'],
    ['« might be corrupted », durée 3 600 s connue > 1 400', oa4o(3600, 'gpt-4o-mini-transcribe'), reponse(400, M.gpt4o_mini_3600), 'audio_too_long', 400, 'might be corrupted'],
    ['« might be corrupted », durée inconnue', oa4o(undefined, 'gpt-4o-mini-transcribe'), reponse(400, M.gpt4o_mini_3600), 'audio_unreadable', 400, 'might be corrupted'],
    ['« might be corrupted », durée 600 s sous la limite', oa4o(600), reponse(400, M.gpt4o_mini_3600), 'audio_unreadable', 400, 'might be corrupted'],
    ['« might be corrupted » sur whisper-1 (aucune limite), 3 600 s', valider({ ...BASE, provider: 'openai', model: 'whisper-1', size_bytes: 1000, duration_seconds: 3600 }), reponse(400, M.gpt4o_mini_3600), 'audio_unreadable', 400, 'might be corrupted'],
    // Non mesurables sans provoquer la panne : formes documentées des fournisseurs
    ['429 (non mesuré)', oaW, reponse(429, { error: { message: 'Rate limit reached', type: 'requests', code: 'rate_limit_exceeded' } }), 'provider_unavailable', 429, 'Rate limit'],
    ['503 (non mesuré)', mi, reponse(503, { object: 'error', message: 'Service unavailable', type: 'service_unavailable' }), 'provider_unavailable', 503, 'Service unavailable'],
    ['500 corps HTML (non mesuré)', mi, reponse(500, '<html>Internal Server Error</html>', 'text/html'), 'provider_unavailable', 500, 'Internal Server Error'],
  ];
  for (const [libelle, req, entree, code, statut, extrait] of cas) {
    const r = rappel(req, entree);
    const e = (r.corps || {}).error || {};
    controle(`${libelle} → ${code}`, [r.corps && r.corps.success, e.code, e.http_status], [false, code, statut]);
    controle(`${libelle} : provider_message = texte du fournisseur`, String(e.provider_message).includes(extrait), true);
  }
  // Sans réponse du fournisseur : onError=continueRegularOutput
  const delai = rappel(mi, { error: { message: 'timeout of 1200000ms exceeded', code: 'ECONNABORTED', name: 'AxiosError' } });
  controle('délai dépassé → provider_unavailable, http_status null', [delai.corps.error.code, delai.corps.error.http_status], ['provider_unavailable', null]);
  const dns = rappel(mi, { error: { message: 'getaddrinfo EAI_AGAIN api.mistral.ai', code: 'EAI_AGAIN' } });
  controle('panne réseau → provider_unavailable, http_status null', [dns.corps.error.code, dns.corps.error.http_status], ['provider_unavailable', null]);
  const enfoui = rappel(oaW, { error: { message: `401 - ${JSON.stringify(M.openai_401)}`, code: 'ERR_BAD_REQUEST',
    options: { headers: { Authorization: `Bearer ${CLE}` } } } });
  controle('statut enfoui « 401 - {...} » (onError) → provider_auth 401', [enfoui.corps.error.code, enfoui.corps.error.http_status], ['provider_auth', 401]);
  controle('statut enfoui : message OpenAI extrait', enfoui.corps.error.provider_message.startsWith('Incorrect API key provided'), true);
  const conseil429 = rappel(oaW, { error: { message: "Try spacing your requests out using the batching settings under 'Options'" } });
  controle('429 dont n8n a remplacé le message → provider_unavailable 429', [conseil429.corps.error.code, conseil429.corps.error.http_status], ['provider_unavailable', 429]);
  const erreurObjet = rappel(mi, { error: { message: 'Request failed', statusCode: 413, error: { message: 'Request Entity Too Large' } } });
  controle('statusCode porté par l’objet d’erreur → utilisé', [erreurObjet.corps.error.code, erreurObjet.corps.error.http_status], ['file_too_large', 413]);
  const cite = rappel(mi, reponse(400, { object: 'error', message: `Invalid key ${CLE} for model` }));
  controle('fournisseur qui cite la clé → masquée', [cite.corps.error.provider_message.includes(CLE), cite.corps.error.provider_message.includes('[clé masquée]')], [false, true]);
  const url = rappel(mi, reponse(400, M.mistral_url_403));
  controle('URL signée citée par Mistral → requête masquée',
    [url.corps.error.provider_message.includes('sig='), url.corps.error.provider_message.includes('https://stockage.test/fine-tune/f7e0.ogg?[paramètres masqués]')], [false, true]);
  const codes = new Set(['file_too_large', 'unsupported_format', 'audio_unreadable', 'audio_too_long', 'provider_unavailable', 'provider_auth', 'audio_fetch_failed', 'internal_error']);
  controle('les 8 codes de la liste fermée sont atteints, et eux seuls',
    [...new Set(SORTIES.map(s => { try { return JSON.parse(s.json.corps_json).error.code; } catch (e) { return undefined; } }).filter(Boolean))].sort(),
    [...codes].sort());
});

section('7. Forme exacte des rappels', () => {
  const mi = valider(BASE);
  const ok = rappel(mi, reponse(200, M.mistral_ok));
  controle('succès Mistral : callback_url', ok.callback_url, BASE.callback_url);
  controle('succès Mistral : corps exact', ok.corps, {
    success: true, job_id: 'job-296',
    data: { text: 'Bonjour, ceci est un essai de transcription pour la réunion de jeudi. Nous parlerons du budget et du calendrier.', language: 'fr' },
    meta: { provider: 'mistralai', model: 'voxtral-mini-2602', usage: { duration_seconds: 7 } },
  });
  controle('succès Mistral : ordre des clés', ok.corps_json.slice(0, 40), '{"success":true,"job_id":"job-296","data');
  const sansLangue = rappel(valider({ ...BASE, language: undefined }), reponse(200, M.mistral_ok));
  controle('Mistral rend language null, aucune langue demandée → null', sansLangue.corps.data.language, null);
  const oaW = valider({ ...BASE, provider: 'openai', model: 'whisper-1', size_bytes: 21140, language: undefined });
  const w = rappel(oaW, reponse(200, M.openai_whisper_ok));
  controle('succès OpenAI whisper-1 : corps exact (french → fr, duration 7)', w.corps, {
    success: true, job_id: 'job-296',
    data: { text: 'Bonjour. Ceci est un essai de transcription pour la réunion de jeudi. Nous parlerons du budget et du calendrier.', language: 'fr' },
    meta: { provider: 'openai', model: 'whisper-1', usage: { duration_seconds: 7 } },
  });
  const tronque = rappel(oaW, reponse(200, { task: 'transcribe', language: 'french', duration: 1.9900000095367432, text: 'Bonjour, ceci est un essai de transmission.' }));
  controle('durée fractionnaire gardée telle quelle', tronque.corps.meta.usage.duration_seconds, 1.9900000095367432);
  const o4 = valider({ ...BASE, provider: 'openai', model: 'gpt-4o-transcribe', size_bytes: 1000 });
  const t4 = rappel(o4, reponse(200, { text: 'Bonjour.', usage: { type: 'tokens', input_tokens: 14, output_tokens: 45, total_tokens: 59 } }));
  controle('gpt-4o (usage au jeton) : usage.duration_seconds OMIS', [t4.corps.meta.usage, 'duration_seconds' in t4.corps.meta.usage, t4.corps_json.includes('duration_seconds')], [{}, false, false]);
  const mSans = rappel(mi, reponse(200, { text: 'x', language: null }));
  controle('Mistral sans usage : duration_seconds OMIS', 'duration_seconds' in mSans.corps.meta.usage, false);
  const whisperJson = rappel(oaW, reponse(200, { text: 'x', usage: { type: 'duration', seconds: 12 } }));
  controle('OpenAI json (sans duration) mais usage.seconds → 12', whisperJson.corps.meta.usage.duration_seconds, 12);
  const vide = rappel(mi, reponse(200, { model: 'voxtral-mini-2602', text: '', language: null, usage: { prompt_audio_seconds: 5 } }));
  controle('texte vide (voxtral sur du bruit, #301) → succès, text ""', [vide.corps.success, vide.corps.data.text], [true, '']);
  const sansText = rappel(mi, reponse(200, { model: 'voxtral-mini-2602' }));
  controle('200 sans champ text → internal_error', [sansText.corps.success, sansText.corps.error.code], [false, 'internal_error']);
  const codeIso = rappel(valider({ ...BASE, language: 'de' }), reponse(200, { text: 'x', language: 'en', usage: { prompt_audio_seconds: 1 } }));
  controle('langue rendue par le fournisseur prime sur la demandée', codeIso.corps.data.language, 'en');
  const ko = rappel(mi, reponse(401, M.mistral_401));
  controle('échec : corps exact', ko.corps, { success: false, job_id: 'job-296', error: { code: 'provider_auth', http_status: 401, provider_message: 'Invalid API Key' } });
  controle('échec : ni data ni meta', ['data' in ko.corps, 'meta' in ko.corps], [false, false]);
  controle('corps_json ≡ JSON.stringify(JSON.parse(corps_json)) (n8n le ré-sérialise)',
    [ok, w, ko].every(r => JSON.stringify(JSON.parse(r.corps_json)) === r.corps_json), true);
  controle('sortie de Construire : callback_url, job_id, corps_json seulement', Object.keys(ok).filter(k => k !== 'corps').sort(), ['callback_url', 'corps_json', 'job_id']);
});

section('8. Signature du corps envoyé', () => {
  const mi = valider(BASE);
  const sortie = rappel(mi, reponse(200, M.mistral_ok));
  delete sortie.corps;
  const SECRET = 'secret-de-test-296';
  const env = { N8N_WEBHOOK_SECRET: SECRET };
  const s = nd('Signer le rappel');
  controle('Crypto : hmac SHA256 hex → signature',
    [s.type, s.parameters.action, s.parameters.type, s.parameters.encoding, s.parameters.dataPropertyName], ['n8n-nodes-base.crypto', 'hmac', 'SHA256', 'hex', 'signature']);
  controle('Crypto : signe corps_json, secret $env.N8N_WEBHOOK_SECRET sans repli',
    [s.parameters.value, s.parameters.secret], ['={{ $json.corps_json }}', '={{ $env.N8N_WEBHOOK_SECRET }}']);
  const signe = { ...sortie, signature: crypto.createHmac('sha256', resoudre(s.parameters.secret, sortie, env)).update(resoudre(s.parameters.value, sortie, env)).digest('hex') };
  const e = nd('Envoyer le rappel');
  controle('Envoyer : POST callback_url', [e.parameters.method, resoudre(e.parameters.url, signe)], ['POST', BASE.callback_url]);
  controle('Envoyer : jsonBody = ={{ $json.corps_json }}', e.parameters.jsonBody, '={{ $json.corps_json }}');
  // n8n : JSON.parse du jsonBody, puis axios le ré-sérialise → c'est CE texte qui part.
  const envoye = JSON.stringify(JSON.parse(resoudre(e.parameters.jsonBody, signe)));
  controle('corps envoyé = corps signé, octet pour octet', envoye, sortie.corps_json);
  controle('X-N8N-Signature = HMAC-SHA256(corps envoyé, secret)', enTete('Envoyer le rappel', 'X-N8N-Signature', signe),
    crypto.createHmac('sha256', SECRET).update(envoye).digest('hex'));
  controle('Content-Type application/json', enTete('Envoyer le rappel', 'Content-Type', signe), 'application/json');
  controle('Envoyer : 3 essais espacés de 5 s, délai 30 s', [e.retryOnFail, e.maxTries, e.waitBetweenTries, e.parameters.options.timeout], [true, 3, 5000, 30000]);
  controle('Secret configuré ? : vrai avec secret, faux sans', [siCondition('Secret configuré ?', sortie, env), siCondition('Secret configuré ?', sortie, {}), siCondition('Secret configuré ?', sortie, { N8N_WEBHOOK_SECRET: '' })], [true, false, false]);
  const err = nd('Erreur — secret absent');
  controle('secret absent → Stop and Error explicite, aucun envoi', [err.type, (W.connections['Erreur — secret absent'] || { main: [] }).main.flat().length], ['n8n-nodes-base.stopAndError', 0]);
  controle('message d’arrêt : nomme la variable et le job', resoudre(err.parameters.errorMessage, sortie).includes('N8N_WEBHOOK_SECRET') && resoudre(err.parameters.errorMessage, sortie).includes('job-296'), true);
  const accents = rappel(mi, reponse(200, { text: 'Émile a dit « ça coûte 3 € » —  fin\n', usage: { prompt_audio_seconds: 2 } }));
  controle('accents, guillemets, U+2028 : ré-sérialisation identique', JSON.stringify(JSON.parse(accents.corps_json)) === accents.corps_json, true);
});

section('9. La clé ne sort jamais', () => {
  // Seuls détenteurs légitimes : le champ json.api_key des items INTERNES (Valider, Préparer),
  // lu par l'en-tête Authorization. Hors ce champ, la clé ne doit apparaître nulle part.
  const sansChampCle = s => (s && s.json ? { ...s, json: { ...s.json, api_key: undefined } } : s);
  controle(`aucune sortie ne contient la clé hors json.api_key interne (${SORTIES.length} sorties)`,
    SORTIES.filter(s => contient(sansChampCle(s), CLE)).length, 0);
  controle('témoin : la clé est bien présente dans json.api_key interne', SORTIES.some(s => s && s.json && s.json.api_key === CLE), true);
  const rappels = SORTIES.filter(s => s && s.json && s.json.corps_json);
  controle(`aucun corps de rappel ne contient la clé (${rappels.length} rappels)`, rappels.filter(s => contient(s, CLE)).length, 0);
  const reponses = SORTIES.filter(s => s && s.json && s.json.reponse).map(s => s.json.reponse);
  controle(`aucune réponse 202/400 ne contient la clé (${reponses.length})`, reponses.filter(r => contient(r, CLE)).length, 0);
  const echecsPrep = SORTIES.filter(s => s && s.json && s.json.echec).map(s => s.json.echec);
  controle(`aucun échec avant appel ne contient la clé (${echecsPrep.length})`, echecsPrep.filter(r => contient(r, CLE)).length, 0);
  const wf = JSON.stringify({ nodes: W.nodes, connections: W.connections });
  controle('aucune clé en dur dans le workflow', /sk-[A-Za-z0-9_-]{20,}/.test(wf), false);
});

section('10. Documentation', () => {
  const doc = W.nodes.filter(n => n.type.endsWith('stickyNote')).map(n => n.parameters.content || '').join('\n');
  for (const mot of ['azy.daily#296', '/webhook/audio-transcription', '202', '400', 'accepted', 'X-N8N-Signature', 'N8N_WEBHOOK_SECRET',
    'file_url', 'verbose_json', 'duration_seconds', 'prompt_audio_seconds', 'Omis', '1 400 s', '26 214 400',
    'file_too_large', 'unsupported_format', 'audio_unreadable', 'audio_too_long', 'provider_unavailable', 'provider_auth', 'audio_fetch_failed', 'internal_error',
    'provider_message', '20 min', 'Secret absent']) {
    controle(`sticky mentionne ${mot}`, doc.includes(mot), true);
  }
});

if (process.argv.includes('--en-ligne')) enLigne().then(conclure, e => { console.log(`  ❌ ${e.stack}`); echecs.push('en ligne'); conclure(); });
else conclure();

/**
 * Appels réels, fixture de 7 s en français (scripts/test/fixtures/audio_296/parole_fr.ogg).
 * Le multipart est construit avec la bibliothèque `form-data` que n8n utilise (HTTP Request 4.2),
 * à partir des champs RÉSOLUS du workflow ; la réponse passe dans « Construire le rappel ».
 * L'URL signée est obtenue de l'API Files de Mistral (fichier supprimé à la fin).
 */
async function enLigne() {
  console.log('\n11. En ligne');
  const MI = process.env.MISTRAL_API_KEY;
  const OA = process.env.OPENAI_API_KEY;
  if (!MI || !OA) { console.log('  ⏭  MISTRAL_API_KEY ou OPENAI_API_KEY absente — étape sautée'); return; }
  let FormDataN8n = null;
  for (const p of [path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'n8n', 'node_modules', 'form-data'), 'form-data']) {
    try { FormDataN8n = require(p); break; } catch (e) { /* suivant */ }
  }
  console.log(`     multipart : ${FormDataN8n ? 'form-data (bibliothèque de n8n)' : 'FormData natif (form-data introuvable)'}`);
  const audio = fs.readFileSync(path.join(__dirname, 'fixtures', 'audio_296', 'parole_fr.ogg'));
  const masquer = s => [MI, OA].reduce((t, k) => t.split(k).join('[CLÉ]'), String(s));

  /** Envoie les champs résolus d'un nœud multipart ; rend la forme n8n fullResponse. */
  async function envoyer(noeud, json, binaire) {
    const champs = champsMultipart(noeud, json);
    let body, headers = { Authorization: enTete(noeud, 'Authorization', json) };
    if (FormDataN8n) {
      const f = new FormDataN8n();
      for (const [nom, v] of champs) {
        if (v && v.binaire) f.append(nom, binaire.octets, { filename: binaire.fileName, contentType: binaire.mimeType });
        else f.append(nom, v);
      }
      body = f.getBuffer();
      headers = { ...headers, ...f.getHeaders() };
    } else {
      body = new FormData();
      for (const [nom, v] of champs) {
        if (v && v.binaire) body.append(nom, new Blob([binaire.octets], { type: binaire.mimeType }), binaire.fileName);
        else body.append(nom, v);
      }
    }
    const r = await fetch(nd(noeud).parameters.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(120000) });
    const texte = await r.text();
    const type = r.headers.get('content-type') || '';
    return type.includes('json') ? reponse(r.status, texte ? JSON.parse(texte) : {}, type) : reponse(r.status, texte, type);
  }

  // URL signée : API Files de Mistral
  const fu = new FormData();
  fu.append('purpose', 'audio');
  fu.append('file', new Blob([audio], { type: 'audio/ogg' }), 'parole_fr.ogg');
  const up = await (await fetch('https://api.mistral.ai/v1/files', { method: 'POST', headers: { Authorization: `Bearer ${MI}` }, body: fu })).json();
  const signee = (await (await fetch(`https://api.mistral.ai/v1/files/${up.id}/url?expiry=1`, { headers: { Authorization: `Bearer ${MI}` } })).json()).url;
  try {
    const corpsBase = { ...BASE, audio_url: signee, size_bytes: audio.length, duration_seconds: 7 };

    const mi = valider({ ...corpsBase, api_key: MI });
    const rM = rappel(mi, await envoyer(MISTRAL, mi));
    console.log(`     Mistral file_url : ${masquer(rM.corps_json)}`);
    controle('en ligne — Mistral file_url : succès, « budget », fr, durée', [rM.corps.success, /budget/i.test((rM.corps.data || {}).text), (rM.corps.data || {}).language, typeof ((rM.corps.meta || {}).usage || {}).duration_seconds], [true, true, 'fr', 'number']);

    const miFaux = valider({ ...corpsBase, api_key: 'cle-volontairement-fausse-296-0000000000' });
    const rMF = rappel(miFaux, await envoyer(MISTRAL, miFaux));
    controle('en ligne — Mistral clé fausse → provider_auth 401', [rMF.corps.error && rMF.corps.error.code, rMF.corps.error && rMF.corps.error.http_status], ['provider_auth', 401]);

    const alteree = signee.replace(/sig=([^&]{4})/, 'sig=AAAA');
    const miAlt = valider({ ...corpsBase, api_key: MI, audio_url: alteree });
    const rMA = rappel(miAlt, await envoyer(MISTRAL, miAlt));
    console.log(`     Mistral URL altérée : ${masquer(rMA.corps_json)}`);
    controle('en ligne — Mistral URL signée altérée → audio_fetch_failed, requête masquée', [rMA.corps.error && rMA.corps.error.code, /sig=/.test(rMA.corps_json)], ['audio_fetch_failed', false]);

    // OpenAI : vrai téléchargement de l'URL signée, puis Préparer le fichier (nom « .opus » corrigé)
    const oa = valider({ ...corpsBase, provider: 'openai', model: 'whisper-1', api_key: OA, filename: 'parole.opus', mime_type: 'audio/ogg' });
    const tel = await fetch(resoudre(nd(TELECH).parameters.url, oa));
    const octets = Buffer.from(await tel.arrayBuffer());
    const prep = execCode(PREP, { json: { statusCode: tel.status, statusMessage: tel.statusText, headers: { 'content-length': tel.headers.get('content-length') } },
      binary: { data: { data: '(octets)', mimeType: tel.headers.get('content-type'), fileName: 'f7e0.ogg', bytes: octets.length } } }, { [V_REQ]: oa });
    controle('en ligne — téléchargement 200, fichier prêt « parole.ogg »', [tel.status, prep.json.echec, prep.binary && prep.binary.file.fileName], [200, null, 'parole.ogg']);
    const bin = { octets, fileName: prep.binary.file.fileName, mimeType: prep.binary.file.mimeType };
    const rO = rappel(oa, await envoyer(OPENAI, prep.json, bin));
    console.log(`     OpenAI whisper-1 : ${masquer(rO.corps_json)}`);
    controle('en ligne — OpenAI whisper-1 : succès, « budget », fr, durée ≈ 7', [rO.corps.success, /budget/i.test((rO.corps.data || {}).text), (rO.corps.data || {}).language, Math.round(((rO.corps.meta || {}).usage || {}).duration_seconds)], [true, true, 'fr', 7]);

    const oaFaux = { ...prep.json, api_key: 'sk-proj-cle-volontairement-fausse-296-000000000000' };
    const rOF = rappel({ ...oa, api_key: oaFaux.api_key }, await envoyer(OPENAI, oaFaux, bin));
    controle('en ligne — OpenAI clé fausse → provider_auth 401, clé absente', [rOF.corps.error && rOF.corps.error.code, rOF.corps.error && rOF.corps.error.http_status, rOF.corps_json.includes(oaFaux.api_key)], ['provider_auth', 401, false]);

    const texte = { octets: Buffer.from('Ceci est un fichier texte, pas un audio.\n'.repeat(50)), fileName: 'parole.ogg', mimeType: 'audio/ogg' };
    const rON = rappel(oa, await envoyer(OPENAI, prep.json, texte));
    console.log(`     OpenAI non audio : ${masquer(rON.corps_json)}`);
    controle('en ligne — OpenAI non audio → unsupported_format 400', [rON.corps.error && rON.corps.error.code, rON.corps.error && rON.corps.error.http_status], ['unsupported_format', 400]);
    controle('en ligne — aucune vraie clé dans les rappels', [rM, rMF, rMA, rO, rOF, rON].some(r => r.corps_json.includes(MI) || r.corps_json.includes(OA)), false);
  } finally {
    const d = await fetch(`https://api.mistral.ai/v1/files/${up.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${MI}` } });
    console.log(`     fichier Mistral supprimé : HTTP ${d.status}`);
  }
}

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length}/${total} contrôle(s) en échec`); process.exit(1); }
  console.log(`✅ tous les contrôles passent  (${total}/${total})`);
}
