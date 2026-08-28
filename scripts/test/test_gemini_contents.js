#!/usr/bin/env node
/**
 * Conversion de l'enveloppe OpenAI vers l'enveloppe Gemini — « LLM - Call
 * Messages », nœud « Gemini API ».
 *
 *     node scripts/test/test_gemini_contents.js
 *     node scripts/test/test_gemini_contents.js --en-ligne   # appelle vraiment Gemini
 *
 * Le test évalue l'expression extraite du JSON du workflow : c'est le corps qui
 * sera réellement envoyé.
 *
 * Le cas de référence
 * -------------------
 * `vision/describe` sur `gemini-3.5-flash` rendait :
 *
 *     400 INVALID_ARGUMENT
 *     Invalid JSON payload received. Unknown name "content" at 'contents[0]'
 *
 * Le nœud faisait `contents: data.messages` — un relais brut. Or Gemini n'a pas
 * le schéma d'OpenAI :
 *
 *     OpenAI   { role, content: [ {type:'text',text}, {type:'image_url',…} ] }
 *     Gemini   { role, parts:   [ {text},            {inline_data:{…}}     ] }
 *
 * et « assistant » s'y dit « model ».
 *
 * Ce que le test protège
 * ----------------------
 *  - `content` devient `parts`, jamais l'inverse : c'est la clé qui produisait le 400 ;
 *  - un bloc DÉJÀ natif Gemini (`inline_data`) traverse INTACT — chat.api
 *    construit l'image au format du provider, la retoucher la casserait ;
 *  - un bloc image à la forme OpenAI est converti plutôt que perdu ;
 *  - `assistant` devient `model`, sinon Gemini refuse le rôle ;
 *  - le statut réel remonte : un 400 reste un 400, pas un 500.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/LLM_-_Call_Messages.json'), 'utf8'));
const noeud = n => WF.nodes.find(x => x.name === n);

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 52 ? obtenu.slice(0, 52) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(52)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

/** Évalue l'expression n8n du jsonBody, avec $json fourni. */
function corps(json) {
  const src = noeud('Gemini API').parameters.jsonBody.replace(/^=\{\{/, '').replace(/\}\}\s*$/, '');
  return JSON.parse(vm.runInNewContext(`(${src})`, {
    $json: json, JSON, Object, Array, String, Number, Math, RegExp,
  }));
}

function execCode(nom, entree, refs = {}) {
  const env = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  return env(vm.runInNewContext(`(function(){${noeud(nom).parameters.jsCode}})()`, {
    $input: { all: () => items, first: () => items[0] },
    $: n => { const v = env(refs[n]); return { all: () => v, first: () => v[0] }; },
    console: { log() {} }, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, Date,
  }));
}

const IMAGE_GEMINI = { inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } };
const BASE = { provider: 'google', model: 'gemini-3.5-flash', api_key: 'x',
               max_tokens: 1024, temperature: 0.7, system: null };

console.log('\n1. le cas exact de la panne — vision, bloc natif Gemini');
{
  const c = corps({ ...BASE, messages: [{ role: 'user', content: [
    { type: 'text', text: "Décris cette image en détail pour l'indexation et la recherche (RAG)." },
    IMAGE_GEMINI,
  ] }] });
  controle('la clé est « parts »', 'parts' in c.contents[0], true);
  controle('plus aucune clé « content »', 'content' in c.contents[0], false);
  controle('le texte perd son enveloppe type', c.contents[0].parts[0], { text: "Décris cette image en détail pour l'indexation et la recherche (RAG)." });
  // chat.api construit l'image au format du provider : la retoucher la casserait.
  controle('le bloc image traverse INTACT', c.contents[0].parts[1], IMAGE_GEMINI);
  controle('rôle conservé', c.contents[0].role, 'user');
  controle('generationConfig porté', c.generationConfig, { maxOutputTokens: 1024, temperature: 0.7 });
}

console.log('\n2. les autres formes de contenu');
{
  const chaine = corps({ ...BASE, messages: [{ role: 'user', content: 'Bonjour' }] });
  controle('contenu chaîne → un seul part', chaine.contents[0].parts, [{ text: 'Bonjour' }]);

  const camel = corps({ ...BASE, messages: [{ role: 'user', content: [{ inlineData: { mimeType: 'image/png', data: 'BBBB' } }] }] });
  controle('inlineData camelCase accepté aussi', camel.contents[0].parts[0], { inlineData: { mimeType: 'image/png', data: 'BBBB' } });

  // Repli défensif : un appelant qui enverrait l'image à la forme OpenAI.
  const openai = corps({ ...BASE, messages: [{ role: 'user', content: [
    { type: 'image_url', image_url: { url: 'data:image/webp;base64,CCCC' } },
  ] }] });
  controle('image OpenAI convertie, pas perdue',
    openai.contents[0].parts[0], { inline_data: { mime_type: 'image/webp', data: 'CCCC' } });

  const nu = corps({ ...BASE, messages: [{ role: 'user', content: [{ text: 'déjà natif' }] }] });
  controle('part déjà nu conservé', nu.contents[0].parts[0], { text: 'déjà natif' });
}

console.log('\n3. rôles et instruction système');
{
  const dialogue = corps({ ...BASE, messages: [
    { role: 'user', content: 'question' },
    { role: 'assistant', content: 'réponse' },
    { role: 'user', content: 'suite' },
  ] });
  // Gemini refuse le rôle « assistant » ; il dit « model ».
  controle('assistant → model', dialogue.contents.map(c => c.role), ['user', 'model', 'user']);
  controle('ordre préservé', dialogue.contents.map(c => c.parts[0].text), ['question', 'réponse', 'suite']);

  const sys = corps({ ...BASE, system: 'Tu es concis.', messages: [{ role: 'user', content: 'x' }] });
  controle('system hors de contents', sys.systemInstruction, { parts: [{ text: 'Tu es concis.' }] });
  controle('contents ne contient pas le system', sys.contents.length, 1);
  controle('sans system : champ absent',
    'systemInstruction' in corps({ ...BASE, messages: [{ role: 'user', content: 'x' }] }), false);
}

console.log('\n4. le statut réel remonte — les quatre formatteurs');
{
  const refs = { 'Validate Input': { model: 'gemini-3.5-flash', metadata: {}, startTime: Date.now() } };
  const cas = [
    ['Format Gemini',    { error: { message: '400 - {"error":{"code":400,"status":"INVALID_ARGUMENT"}}', status: 'INVALID_ARGUMENT' } }, 400],
    ['Format Anthropic', { error: { message: '429 - {"type":"rate_limit_error"}', type: 'rate_limit_error' } }, 429],
    ['Format Mistral',   { error: { message: '401 - {"message":"Unauthorized"}' }, message: '401 - x' }, 401],
  ];
  for (const [nom, rep, attendu] of cas) {
    const r = execCode(nom, rep, refs)[0].json;
    controle(`${nom} → ${attendu}`, [r.success, r.error.http_status], [false, attendu]);
  }
  const reseau = execCode('Format Gemini', { error: { message: 'socket hang up', code: 'ECONNRESET' } }, refs)[0].json;
  controle('panne réseau → 502, jamais un succès', [reseau.success, reseau.error.http_status], [false, 502]);

  const ok = execCode('Format Gemini', {
    candidates: [{ content: { parts: [{ text: 'Une image noire.' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  }, refs)[0].json;
  controle('chemin nominal intact', [ok.success, ok.data.text], [true, 'Une image noire.']);
}

if (process.argv.includes('--en-ligne')) {
  console.log('\n5. aller-retour réel contre Gemini');
  const cle = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!cle) { console.log('  ⏭  aucune clé Gemini — étape sautée'); conclure(); }
  else {
    (async () => {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
      const appel = async body => {
        const r = await fetch(url, { method: 'POST',
          headers: { 'x-goog-api-key': cle, 'Content-Type': 'application/json' },
          body: JSON.stringify(body) });
        return { statut: r.status, corps: await r.json() };
      };
      const bon = await appel(corps({ ...BASE, messages: [{ role: 'user', content: 'Réponds exactement : ok' }] }));
      controle('corps corrigé accepté', bon.statut, 200);
      controle('texte rendu', (bon.corps.candidates?.[0]?.content?.parts?.[0]?.text || '').length > 0, true);

      // L'ancienne forme doit toujours échouer — sinon le test ne prouve rien.
      const ancien = await appel({ contents: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] });
      controle('ancienne forme toujours refusée', ancien.statut, 400);
      controle('cause nommée par Google',
        /Unknown name "content"/.test(ancien.corps.error?.message || ''), true);
      conclure();
    })().catch(e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
  }
} else conclure();

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
  console.log('✅ tous les contrôles passent');
}
