#!/usr/bin/env node
/**
 * Contrôles de MCP - Transcriber et YOUTUBE - Transcribe and Extract.
 *
 * Le JS testé est EXTRAIT des workflows JSON et exécuté dans un bac à sable
 * qui reproduit celui de n8n : ni `require`, ni `process`. C'est ce bac à
 * sable qui a fait échouer Recipes - YouTube (exécution 855886,
 * « Module 'crypto' is disallowed »).
 *
 *   node scripts/test/test_youtube_transcribe.js
 *   node scripts/test/test_youtube_transcribe.js --en-ligne
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '../..');
const WF = {
  transcriber: JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/MCP_-_Transcriber.json'), 'utf8')),
  youtube: JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/YOUTUBE_-_Transcribe_and_Extract.json'), 'utf8')),
};

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  const vu = JSON.stringify(obtenu);
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(52)} ${vu === undefined ? '' : vu.slice(0, 62)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};

const noeud = (wf, nom) => {
  const n = WF[wf].nodes.find((x) => x.name === nom);
  if (!n) throw new Error(`nœud absent : ${wf}/${nom}`);
  return n;
};

/** Exécute un nœud Code dans un bac à sable SANS require ni process. */
function execCode(wf, nom, entree, precedents = {}, env = {}) {
  const code = noeud(wf, nom).parameters.jsCode;
  const ctx = {
    $input: { first: () => ({ json: entree }), all: () => [{ json: entree }] },
    $: (n) => {
      if (!(n in precedents)) throw new Error(`nœud amont non fourni au test : ${n}`);
      return { first: () => ({ json: precedents[n] }) };
    },
    $env: env,
    $execution: { id: '4242' },
    JSON, Date, Math, String, Number, Array, Object, parseInt, parseFloat, isNaN, RegExp, Error,
    console: { log() {} },
  };
  const r = vm.runInNewContext(`(function(){${code}})()`, ctx, { timeout: 5000 });
  return Array.isArray(r) ? r[0].json : r;
}

const codesDe = (wf) => WF[wf].nodes.filter((n) => n.type.endsWith('.code'));
const exprDe = (wf) => {
  const out = [];
  const creuse = (v, ou) => {
    if (typeof v === 'string') { if (v.startsWith('=')) out.push([ou, v]); }
    else if (Array.isArray(v)) v.forEach((x, i) => creuse(x, `${ou}[${i}]`));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => creuse(x, `${ou}.${k}`));
  };
  WF[wf].nodes.forEach((n) => creuse(n.parameters, n.name));
  return out;
};

// ══════════════════════════════════════════════════════════════
console.log('\n1. le bac à sable n8n (ni require, ni process)');
for (const wf of ['transcriber', 'youtube']) {
  for (const n of codesDe(wf)) {
    let souci = null;
    try {
      // On compile ET on exécute avec un contexte volontairement dépourvu de
      // require/process : toute référence lève, comme dans n8n.
      vm.runInNewContext(`(function(){${n.parameters.jsCode}})`, {}, { timeout: 5000 });
      const src = n.parameters.jsCode;
      // référence effective (pas une occurrence en commentaire ni en chaîne)
      const nu = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
                    .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
      if (/\brequire\s*\(/.test(nu)) souci = 'require()';
      else if (/\bprocess\s*\./.test(nu)) souci = 'process.';
    } catch (e) { souci = e.message.slice(0, 40); }
    T(`${wf}/${n.name} : aucun interdit`, null, souci);
  }
}

console.log('\n2. aucune expression tronquée par un "}}" interne');
for (const wf of ['transcriber', 'youtube']) {
  for (const [ou, v] of exprDe(wf)) {
    const corps = v.slice(1);
    const i = corps.indexOf('{{');
    const interne = i >= 0 && corps.slice(i + 2, corps.lastIndexOf('}}')).includes('}}');
    T(`${wf}/${ou}`.slice(0, 50), false, interne);
  }
}

console.log('\n3. aucun modèle Gemini retiré (mesuré 404 le 2026-09-04)');
const MORTS = /gemini-(?:1\.0|1\.5|2\.0|2\.5-flash)/;
for (const wf of ['transcriber', 'youtube']) {
  // On teste ce qu'on LIVRE (nœuds + câblage), pas `activeVersion`, qui est la
  // photographie de la version encore déployée — elle porte légitimement l'ancien
  // modèle, et le script de réimport l'écarte à l'écriture.
  const livre = JSON.stringify({ nodes: WF[wf].nodes, connections: WF[wf].connections });
  T(`${wf} : pas de Gemini mort`, false, MORTS.test(livre));
}

// ══════════════════════════════════════════════════════════════
console.log('\n3 bis. tout nœud de réponse porte un code HTTP explicite');
for (const wf of ['transcriber', 'youtube']) {
  for (const n of WF[wf].nodes.filter((x) => x.type.endsWith('respondToWebhook'))) {
    // Sans responseCode, n8n rend 200 quoi que dise le corps : un échec
    // sort alors en succès. C'est la forme douce du défaut #467.
    T(`${wf}/${n.name} : code défini`, true, n.parameters?.options?.responseCode !== undefined);
  }
}

console.log('\n3 ter. aucun nœud de réponse ne perd de champ en route');
// Le gabarit d'un respondToWebhook peut énumérer une liste blanche de champs.
// C'est invisible dans les nœuds Code — le workflow calcule tout, et la sortie
// en jette la moitié. Vu sur `Respond (Sync)`, qui traînait une liste héritée
// de l'époque des recettes : { success, data, error, meta }.
for (const wf of ['transcriber', 'youtube']) {
  for (const n of WF[wf].nodes.filter((x) => x.type.endsWith('respondToWebhook'))) {
    const tpl = String(n.parameters?.responseBody || '');
    const sonde = { success: true, statut: 200, transcript: 'T', extraction: { a: 1 },
                    extraction_erreur: null, video: { id: 'v' }, error: { code: 1 }, meta: { m: 1 } };
    let rendu = null;
    try {
      const corps = tpl.replace(/^=/, '').replace(/^\{\{/, '').replace(/\}\}$/, '');
      const v = vm.runInNewContext(`(${corps})`, { $json: sonde, JSON }, { timeout: 2000 });
      rendu = typeof v === 'string' ? JSON.parse(v) : v;
    } catch (e) { rendu = { __erreur: e.message }; }
    const perdus = Object.keys(sonde).filter((k) => sonde[k] !== null && !(k in (rendu || {})));
    T(`${wf}/${n.name} : aucun champ perdu`, [], perdus);
  }
}

console.log('\n4. MCP - Transcriber : le quatuor est reçu, pas deviné');
// La clé est désormais obligatoire dans le corps : les sondes en fournissent
// une par défaut. Pour éprouver son absence, passer explicitement api_key: null.
const V = (body, env = {}) =>
  execCode('transcriber', 'Validate Input', { body: { api_key: 'CLE-APPEL', ...body } }, {}, env);

let r = V({ videoUrl: 'https://www.youtube.com/watch?v=X' });
T('provider par défaut', 'google', r.provider);
T('modèle par défaut vivant', 'gemini-3.6-flash', r.model);
// La clé vient de l'appelant. Un repli sur $env contournerait la facturation
// de l'api, qui débite sur la clé qu'elle injecte (azy.daily#330).
T('aucun repli sur l’environnement', false,
  V({ videoUrl: 'u', api_key: null }, { GEMINI_API_KEY: 'CLE-ENV' }).valide);

r = V({ videoUrl: 'u', provider: 'google', model: 'gemini-3.8-flash', api_key: 'CLE-APPEL' });
T('la requête est la seule source de clé', 'CLE-APPEL', r.api_key);
T('modèle relayé tel quel', 'gemini-3.8-flash', r.model);
T('clé de la requête l’emporte', 'CLE-APPEL', r.api_key);

r = V({ videoUrl: 'u', model: 'modele-inconnu-xyz' });
T('modèle inconnu transmis, pas filtré', 'modele-inconnu-xyz', r.model);

r = V({ videoUrl: 'u', content: 'Fais-moi un compte rendu de réunion.' });
T('content reçu devient la consigne', true, r.corps.contents[0].parts[1].text.startsWith('Fais-moi un compte rendu'));

r = V({ videoUrl: 'u' });
T('sans content : consigne par défaut', true, /Transcris/.test(r.corps.contents[0].parts[1].text));

r = V({ videoUrl: 'u', operation: 'extractOcr' });
T('la consigne suit l’opération', true, /texte visible/.test(r.corps.contents[0].parts[1].text));

console.log('\n5. MCP - Transcriber : la vidéo et son bornage');
r = V({ videoUrl: 'https://www.youtube.com/watch?v=ABC' });
T('URL passée en file_data', 'https://www.youtube.com/watch?v=ABC', r.corps.contents[0].parts[0].file_data.file_uri);
T('aucun bornage sans demande', undefined, r.corps.contents[0].parts[0].video_metadata);

r = V({ videoUrl: 'u', startTime: '00:08', endTime: 42 });
T('bornage début converti en secondes', 8, r.corps.contents[0].parts[0].video_metadata.start_offset.seconds);
T('bornage fin numérique accepté', 42, r.corps.contents[0].parts[0].video_metadata.end_offset.seconds);

r = V({ videoBase64: 'QUJD', videoMimeType: 'video/webm' });
T('base64 passé en inline_data', 'video/webm', r.corps.contents[0].parts[0].inline_data.mime_type);
T('pas de bornage sur du base64', undefined, r.corps.contents[0].parts[0].video_metadata);

console.log('\n6. MCP - Transcriber : les refus');
T('sans vidéo → 400', [false, 400], [V({}).valide, V({}).statut]);
T('sans clé → invalide', false, V({ videoUrl: 'u', api_key: null }).valide);
T('sans clé : erreur explicite', true,
  /api_key requise/.test(String(V({ videoUrl: 'u', api_key: null }).erreurs)));
T('provider non-google refusé', false, V({ videoUrl: 'u', provider: 'openai' }).valide);

console.log('\n7. MCP - Transcriber : le vrai statut est lu (#442)');
const amont = { provider: 'google', model: 'm', operation: 'transcribe', langue: 'fr', debut_ms: 0 };
const F = (e) => execCode('transcriber', 'Format Response', e, { 'Validate Input': amont });

r = F({ statusCode: 200, body: { candidates: [{ content: { parts: [{ text: 'bonjour' }] } }],
        usageMetadata: { promptTokenCount: 1693, candidatesTokenCount: 2, totalTokenCount: 1788,
          thoughtsTokenCount: 93, promptTokensDetails: [{ modality: 'VIDEO', tokenCount: 1676 }] } } });
T('succès : transcript rendu', 'bonjour', r.transcript);
T('model = celui réellement servi', 'm', r.model);
T('model_requested conservé', 'm', r.model_requested);

// Un alias est résolu par Google en une version concrète : le contrôle de
// facturation en aval doit voir cette version, pas l'alias qu'il a envoyé.
const rAlias = F({ statusCode: 200, modelVersion: 'ignoré-au-mauvais-niveau',
  body: { modelVersion: 'gemini-3.8-flash',
          candidates: [{ content: { parts: [{ text: 'x' }] } }], usageMetadata: {} } });
T('alias résolu : model = version servie', 'gemini-3.8-flash', rAlias.model);
T('alias résolu : demande conservée', 'm', rAlias.model_requested);
T('reasoning compté dans completion', 95, r.usage.completion_tokens);
T('jetons vidéo isolés', 1676, r.usage.prompt_tokens_by_modality.video);

r = F({ statusCode: 404, body: { error: { message: 'modèle introuvable', status: 'NOT_FOUND' } } });
T('404 amont → échec, pas 200 vide', [false, 404], [r.success, r.statut]);

r = F({ error: { message: 'Request failed with status code 429 - {"e":1}' } });
T('statut lu dans le message quand absent', 429, r.statut);

r = F({ error: { message: 'socket hang up' } });
T('panne de transport → 502', 502, r.statut);

r = F({ statusCode: 200, body: { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] } });
T('200 sans texte → échec explicite', [false, 502], [r.success, r.statut]);

// ══════════════════════════════════════════════════════════════
console.log('\n8. YOUTUBE : généralisation (content paramétré)');
const Y = (body, env = {}) => execCode('youtube', 'Validate Input', { body }, {}, env);

r = Y({ video_url: 'https://youtu.be/X' });
T('URL directe acceptée sans query', true, r.valid);
T('sans extraction demandée', false, r.extraction.demandee);
T('aucune clé YouTube exigée sur URL directe', true, r.valid);

r = Y({ query: 'gateau' });
T('query sans google_api_key → refus', false, r.valid);
r = Y({ query: 'gateau', google_api_key: 'G' });
T('query avec clé → accepté', true, r.valid);

r = Y({ video_url: 'u', extraction: { content: 'Résume.', api_key: 'A' } });
T('extraction demandée si content fourni', true, r.extraction.demandee);
T('provider extraction par défaut', 'anthropic', r.extraction.provider);
T('modèle extraction vivant', 'claude-sonnet-4-6', r.extraction.model);
r = Y({ video_url: 'u', extraction: { content: 'Résume.' } });
T('content sans clé → refus', false, r.valid);

r = Y({ video_url: 'u', extraction: { content: 'c', api_key: 'A', provider: 'openai', model: 'gpt-5.4' } });
T('provider extraction relayé', 'openai', r.extraction.provider);
T('modèle extraction relayé', 'gpt-5.4', r.extraction.model);

r = Y({ video_url: 'u', callback_url: 'https://cb' });
T('job_id engendré sans require()', true, /^job_4242_/.test(r.job_id));
r = Y({ video_url: 'u' });
T('pas de job_id sans callback', null, r.job_id);

r = Y({ video_url: 'u' }, { N8N_WEBHOOK_URL: 'http://n8n:5678' });
T('webhook lu via $env', 'http://n8n:5678', r.n8n_webhook_url);

console.log('\n9. YOUTUBE : le transcript survit à l’échec de l’extraction (#463)');
const infoV = { video: { title: 'T' }, video_url: 'u', language: 'fr',
  extraction: { demandee: true, provider: 'anthropic', model: 'm', api_key: 'A', content: 'Résume : {{transcript}}', max_tokens: 10 },
  transcription: { provider: 'google', model: 'g' }, job_id: null, callback_url: null, user_id: null };

let p = execCode('youtube', 'Prepare Extraction',
  { statusCode: 200, body: { transcript: 'TEXTE', usage: { total_tokens: 9 } } },
  { 'Extract Video Info': infoV });
T('transcript extrait de la réponse', 'TEXTE', p.transcript);
T('gabarit {{transcript}} substitué', true, p.llm_corps.messages[0].content.includes('TEXTE'));
T('extraction lancée', true, p.faire_extraction);

let // Forme réelle de LLM - Call Messages, relevée sur l'exécution 856047 :
// le texte est dans data.text, pas dans content ni text.
f = execCode('youtube', 'Format Output',
  { statusCode: 200, body: { success: true, data: { text: '{"vu": true}', model: 'm' } } },
  { 'Prepare Extraction': p });
T('extraction lue dans data.text', { vu: true }, f.extraction);
T('… sans erreur inventée', null, f.extraction_erreur);

f = execCode('youtube', 'Format Output',
  { statusCode: 200, body: { success: true, data: { text: 'texte libre, pas du JSON' } } },
  { 'Prepare Extraction': p });
T('réponse non-JSON rendue telle quelle', { text: 'texte libre, pas du JSON' }, f.extraction);

f = execCode('youtube', 'Format Output', { statusCode: 500, body: { error: { message: 'llm mort' } } },
  { 'Prepare Extraction': p });
T('extraction en échec : succès maintenu', true, f.success);
T('… et le transcript est rendu', 'TEXTE', f.transcript);
T('… avec l’erreur d’extraction nommée', true, /llm mort/.test(f.extraction_erreur || ''));

p = execCode('youtube', 'Prepare Extraction', { statusCode: 502, body: { error: { message: 'gemini mort' } } },
  { 'Extract Video Info': infoV });
T('transcription en échec détectée', true, p.transcription_echec);
T('extraction non lancée si pas de transcript', false, p.faire_extraction);
f = execCode('youtube', 'Format Output', {}, { 'Prepare Extraction': p });
T('échec de transcription → success:false', [false, 502], [f.success, f.statut]);

console.log(`\n${ko === 0 ? '✅ tous les contrôles passent' : `❌ ${ko} contrôle(s) en échec`}  (${ok}/${ok + ko})`);
if (!process.argv.includes('--en-ligne')) process.exit(ko === 0 ? 0 : 1);

// ══════════════════════════════════════════════════════════════
(async () => {
  console.log('\n══ mode en ligne ══');
  const base = process.env.N8N_WEBHOOK_BASE_URL || 'http://llm.local:5678/webhook';
  const V19 = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const post = async (chemin, corps) => {
    const t0 = Date.now();
    const rep = await fetch(`${base}/${chemin}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    });
    const txt = await rep.text();
    let j = null; try { j = JSON.parse(txt); } catch (_) {}
    return { statut: rep.status, octets: txt.length, json: j, ms: Date.now() - t0 };
  };

  let dur = 0;
  const exige = (nom, cond, vu) => {
    console.log(`     ${cond ? '✅' : '❌'} ${nom}${vu === undefined ? '' : ` : ${vu}`}`);
    if (!cond) dur++;
  };

  let e = await post('video-transcription', { videoUrl: V19, endTime: 10, content: 'Réponds uniquement : OK' });
  console.log(`  transcriber      HTTP ${e.statut}  ${e.octets} octets  ${e.ms} ms`);
  exige('corps non vide (défaut #467)', e.octets > 0);
  exige('succès réel, pas seulement une réponse', e.json?.success === true,
        e.json?.success === true ? 'ok' : String(e.json?.error?.message).slice(0, 70));
  exige('un transcript est rendu', !!e.json?.transcript, JSON.stringify(String(e.json?.transcript).slice(0, 30)));
  exige('les jetons vidéo sont isolés', typeof e.json?.usage?.prompt_tokens_by_modality?.video === 'number',
        e.json?.usage?.prompt_tokens_by_modality?.video);
  exige('le bornage a réduit la facture (< 1676)',
        (e.json?.usage?.prompt_tokens_by_modality?.video || 1e9) < 1676);

  e = await post('video-transcription', { videoUrl: V19, model: 'modele-qui-nexiste-pas' });
  console.log(`  modèle inexistant HTTP ${e.statut}`);
  exige('échec annoncé, pas de faux succès', e.json?.success === false);
  exige('le code HTTP suit le corps', e.statut >= 400, e.statut);

  e = await post('youtube-extract', { video_url: V19, transcription: { content: 'Réponds : OK' } });
  console.log(`  youtube-extract  HTTP ${e.statut}  ${e.octets} octets`);
  exige('succès réel', e.json?.success === true,
        e.json?.success === true ? 'ok' : String(e.json?.error?.message).slice(0, 70));
  exige('transcript rendu', !!e.json?.transcript);
  exige('le code HTTP suit le corps', e.json?.success === true ? e.statut === 200 : e.statut >= 400, e.statut);

  console.log(dur === 0
    ? '\n✅ chaîne en ligne vérifiée'
    : `\n❌ ${dur} exigence(s) non tenue(s) — la chaîne n'est PAS vérifiée`);
  process.exit(dur === 0 ? 0 : 1);
})();
