#!/usr/bin/env node
/**
 * #462 lot 1 — plus aucun modèle Anthropic retiré dans les appels à api.anthropic.com.
 *
 *     node scripts/test/test_462_modeles_anthropic.js
 *
 * Mesuré le 2026-09-14 avec les corps RÉELS de ces nœuds : `claude-3-5-haiku-20241022`,
 * `claude-3-5-sonnet-20241022` et `claude-3-haiku-20240307` rendent 404 not_found_error.
 * Les quatre nœuds sont en onError=continueRegularOutput : le 404 passait en aval
 * comme une réponse (Subject Detect répondait même success:true avec un repli).
 *
 * Ce que le test protège
 * ----------------------
 *  - le modèle ENVOYÉ, obtenu en évaluant le jsonBody comme n8n (pas en cherchant
 *    une sous-chaîne : `claude-sonnet-4` est un préfixe de `claude-sonnet-4-6`) ;
 *  - aucun `claude-3` n'est plus envoyé vers api.anthropic.com dans ces workflows :
 *    c'est l'URL du nœud qui dit s'il s'agit d'un appel au fournisseur ;
 *  - les autres paramètres envoyés n'ont pas bougé (max_tokens, temperature, forme) ;
 *  - l'étiquette de repli (`_trace.model` quand le fournisseur ne rend pas de modèle,
 *    donc en erreur) ne nomme plus un modèle retiré ;
 *  - la réponse du remplaçant, sous la forme mesurée, est lue par le nœud aval.
 *
 * `activeVersion` est ignoré : c'est l'instantané exporté de la version publiée,
 * que le réimport remplace.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = process.env.WF_RACINE || path.resolve(__dirname, '../../workflows');
const charger = f => JSON.parse(fs.readFileSync(path.join(RACINE, f + '.json'), 'utf8'));

const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(62)} ${String(JSON.stringify(obtenu)).slice(0, 44)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu)}`);
};

const nd = (w, n) => w.nodes.find(x => x.name === n);
/** Évalue le jsonBody `={{ … }}` d'un nœud HTTP comme n8n le ferait. */
const corps = (w, n, $json, $env = {}) => {
  const e = nd(w, n).parameters.jsonBody;
  if (!/^=\{\{[\s\S]*\}\}\s*$/.test(e)) throw new Error(`${n} : jsonBody n'est pas une expression ={{ … }}`);
  const src = e.replace(/^=\{\{/, '').replace(/\}\}\s*$/, '');
  return JSON.parse(vm.runInNewContext(`(${src})`, { $json, $env }, { timeout: 3000 }));
};
/** Un Code node, `$('X')` rendant refs[X]. */
const code = (w, n, entree, refs) => {
  const r = vm.runInNewContext(`(function(){${nd(w, n).parameters.jsCode}})()`, {
    $input: { first: () => ({ json: entree }) },
    $: k => ({ first: () => ({ json: refs[k] }) }),
  }, { timeout: 3000 });
  return Array.isArray(r) ? r[0].json : r.json;
};
/** Nœuds qui appellent réellement Anthropic — décidé par l'URL. */
const appelsAnthropic = w => w.nodes.filter(n => /api\.anthropic\.com/.test(String(n.parameters?.url || '')));
const sansExpressionTronquee = (w, n) => !/\}\}/.test(nd(w, n).parameters.jsonBody.replace(/\}\}\s*$/, ''));

// ─────────────────────────────────────────────────────────────────────────────
const SD = charger('DISCORD_-_Subject_Detect');
const VI = { valid: true, startTime: Date.now(), message: 'Comment calculer la dérivée de x² ?', guild_id: 'g', user_id: 'u',
  available_subjects: ['maths', 'physique', 'francais'], current_subject_slug: 'francais', confidence_threshold: 0.6 };
console.log('\n1. DISCORD - Subject Detect › LLM Classify Subject');
{
  T('appelle api.anthropic.com/v1/messages', 'https://api.anthropic.com/v1/messages', nd(SD, 'LLM Classify Subject').parameters.url);
  T('pas de « }} » interne à l’expression', true, sansExpressionTronquee(SD, 'LLM Classify Subject'));
  const b = corps(SD, 'LLM Classify Subject', VI);
  T('modèle envoyé = remplaçant', HAIKU, b.model);
  T('max_tokens et temperature inchangés', [256, 0.1], [b.max_tokens, b.temperature]);
  T('message de l’étudiant dans le prompt', true, b.messages[0].content.includes('dérivée de x²'));
  // Réponse RÉELLE de claude-haiku-4-5-20251001 au corps ci-dessus (2026-09-14) :
  // un bloc ```json autour de l'objet — Parse LLM Response le gère.
  const rep = { statusCode: 200, headers: {}, body: { model: HAIKU, stop_reason: 'end_turn', usage: { input_tokens: 190, output_tokens: 60 },
    content: [{ type: 'text', text: '```json\n{"subject": "maths", "confidence": 0.98, "reason": "La dérivée est une notion de mathématiques."}\n```' }] } };
  const out = code(SD, 'Parse LLM Response', rep, { 'Validate Input': VI });
  T('aval : matière détectée sans repli', [true, 'maths', false], [out.success, out.data.detected_subject, out.data.fallback_used]);
  const err = code(SD, 'Parse LLM Response',
    { statusCode: 404, headers: {}, body: { type: 'error', error: { type: 'not_found_error', message: 'model: x' } } }, { 'Validate Input': VI });
  T('étiquette de repli en erreur ≠ modèle retiré', HAIKU, err._trace.model);
}

const SR = charger('DISCORD_-_Student_Recap');
const MB = { period: 'week', request_timestamp: Date.now(), history_count: 2, questions_count: 1, subjects_detected: ['maths'],
  topics_detected: [], history: '[2026-09-10] user: Comment dériver x^2 ?', help_requests: '' };
console.log('\n2. DISCORD - Student Recap › Generate Recap (Anthropic)');
{
  T('appelle api.anthropic.com/v1/messages', 'https://api.anthropic.com/v1/messages', nd(SR, 'Generate Recap (Anthropic)').parameters.url);
  T('pas de « }} » interne à l’expression', true, sansExpressionTronquee(SR, 'Generate Recap (Anthropic)'));
  const b = corps(SR, 'Generate Recap (Anthropic)', MB);
  T('modèle envoyé = remplaçant', HAIKU, b.model);
  T('max_tokens inchangé, prompt système présent', [1500, true], [b.max_tokens, /JSON valide/.test(b.system)]);
  // Forme mesurée chez claude-haiku-4-5-20251001 : l'objet enrobé dans ```json.
  const recap = { subjects_covered: ['maths'], main_topics: ['dérivées'], difficulty_areas: [], strengths: ['curiosité'],
    progression_notes: 'Début.', summary: 'Bon travail.', recommendations: ['Continuer'] };
  const out = code(SR, 'Format Response',
    { model: HAIKU, usage: { input_tokens: 300, output_tokens: 200 }, content: [{ type: 'text', text: '```json\n' + JSON.stringify(recap, null, 2) + '\n```' }] },
    { 'Merge Branches': MB });
  T('aval : récapitulatif structuré lu', [true, Object.keys(recap)], [out.success, Object.keys(out.data.recap || {})]);
  const err = code(SR, 'Format Response', { error: { message: '404 - not_found_error' } }, { 'Merge Branches': MB });
  T('étiquette de repli en erreur ≠ modèle retiré', [false, HAIKU], [err.success, err._trace.model]);
}

const CW = charger('Torah_Chunk_Worker');
const PI = { jobId: 'j', text: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים. '.repeat(3), textLength: 90, threshold: 10000, apiKey: 'K', context: {}, needsChunking: true };
console.log('\n3. Torah Chunk Worker › Claude Smart Split');
{
  T('appelle api.anthropic.com/v1/messages', 'https://api.anthropic.com/v1/messages', nd(CW, 'Claude Smart Split').parameters.url);
  T('pas de « }} » interne à l’expression', true, sansExpressionTronquee(CW, 'Claude Smart Split'));
  const b = corps(CW, 'Claude Smart Split', PI);
  T('modèle envoyé = remplaçant', HAIKU, b.model);
  T('max_tokens inchangé, texte dans le prompt', [8192, true], [b.max_tokens, b.messages[0].content.endsWith(PI.text)]);
  const out = code(CW, 'Parse Chunks', { statusCode: 200, headers: {}, body: { model: HAIKU,
    content: [{ type: 'text', text: '{"chunks": [{"index": 0, "text": "א", "char_count": 1}], "total_chunks": 1}' }] } }, { 'Parse Input': PI });
  T('aval : segments lus', [true, 1, 'claude_semantic'], [out.success, out.total_segments, out.method]);
}

const EP = charger('LEARNING_-_Evaluate_Photo');
console.log('\n4. LEARNING - Evaluate Photo › Evaluate Photo with Vision (déjà corrigé le 28/08, 338c8956)');
{
  T('appelle api.anthropic.com/v1/messages', 'https://api.anthropic.com/v1/messages', nd(EP, 'Evaluate Photo with Vision').parameters.url);
  const b = corps(EP, 'Evaluate Photo with Vision', { body: { image_url: 'https://exemple.test/p.jpg' } }, {});
  T('modèle envoyé sans $env = remplaçant', SONNET, b.model);
  T('max_tokens inchangé', 2048, b.max_tokens);
}

console.log('\n5. aucun claude-3 envoyé vers api.anthropic.com (activeVersion ignoré)');
{
  for (const [w, echantillon] of [[SD, VI], [SR, MB], [CW, PI], [EP, { body: { image_url: 'https://exemple.test/p.jpg' } }]]) {
    const appels = appelsAnthropic(w);
    const modeles = appels.map(n => corps(w, n.name, echantillon, {}).model);
    T(`${w.name} : ${appels.length} appel(s) Anthropic, aucun claude-3`, false, modeles.some(m => /^claude-3/.test(m)));
    // Étiquettes comprises : un claude-3 restant dans les nœuds serait un repli qui ment.
    T(`${w.name} : aucun claude-3 dans les nœuds`, false, /claude-3/.test(JSON.stringify(w.nodes)));
  }
}

console.log(`\n${ko ? '❌' : '✅'} ${ok} ok, ${ko} en échec`);
process.exit(ko ? 1 : 0);
