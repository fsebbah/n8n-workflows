#!/usr/bin/env node
/**
 * Fiabilisation de « LEARNING - Evaluate Photo » — notation d'une photo de plat.
 *
 *     node scripts/test/test_evaluate_photo.js
 *     node scripts/test/test_evaluate_photo.js --en-ligne   # appelle vraiment Anthropic
 *
 * Le test exécute le JavaScript extrait du JSON du workflow.
 *
 * Ce qu'il protège
 * ----------------
 *  - **une note non enregistrée ne peut plus être annoncée enregistrée.** Le nœud
 *    de réponse lisait `apiResponse.id/grade/xp_earned` sans vérifier l'écriture ;
 *    `Save Grade` étant en onError, un 401 rendait `success: true` avec des
 *    `undefined` (même famille qu'azy.daily#150) ;
 *  - un échec du fournisseur ressort avec SA cause — 404 modèle retiré, 401 clé —
 *    et non maquillé en « Failed to parse evaluation » 500 ;
 *  - le schéma est imposé par un outil forcé : plus de JSON cherché dans du texte ;
 *  - la métadonnée porte le modèle RÉELLEMENT servi, pas une constante ;
 *  - l'image passe en URL comme en base64 — une pièce jointe Discord derrière un
 *    jeton n'est pas récupérable par le fournisseur ;
 *  - aucune séquence « }} » dans l'expression, qui la tronquerait en silence.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows/LEARNING_-_Evaluate_Photo.json'), 'utf8'));
const noeud = n => WF.nodes.find(x => x.name === n);

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 50 ? obtenu.slice(0, 50) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(54)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

const CTX = { JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, Date };

function corpsVision(body) {
  const src = noeud('Evaluate Photo with Vision').parameters.jsonBody
    .replace(/^=\{\{/, '').replace(/\}\}\s*$/, '');
  return JSON.parse(vm.runInNewContext(`(${src})`, { $json: { body }, $env: {}, ...CTX }));
}
function execCode(nom, entree, refs = {}) {
  const env = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  return env(vm.runInNewContext(`(function(){${noeud(nom).parameters.jsCode}})()`, {
    $input: { all: () => items, first: () => items[0] },
    $: n => { const v = env(refs[n]); return { all: () => v, first: () => v[0] }; },
    console: { log() {} }, ...CTX,
  }));
}

const IMG64 = 'iVBORw0KGgoAAAANSUhEUg';
const BODY = { submission_id: 'sub-1', guild_id: 'g-1', image_url: 'https://exemple.test/plat.jpg' };

console.log('\n0. syntaxe de l’expression n8n');
{
  const e = noeud('Evaluate Photo with Vision').parameters.jsonBody;
  controle('aucune « }} » interne', /\}\}/.test(e.replace(/\}\}\s*$/, '')), false);
}

console.log('\n1. le corps envoyé au fournisseur');
{
  const c = corpsVision(BODY);
  controle('modèle vivant', c.model, 'claude-sonnet-4-6');
  controle('schéma imposé par un outil forcé', c.tool_choice, { type: 'tool', name: 'rendre_evaluation' });
  controle('l’outil décrit les 5 champs attendus',
    c.tools[0].input_schema.required, ['overall_score', 'criteria', 'feedback', 'improvements', 'highlights']);
  controle('image par URL', c.messages[0].content[0].source, { type: 'url', url: 'https://exemple.test/plat.jpg' });
  controle('critères par défaut dans la consigne',
    /Texture, Couleur, Présentation, Respect de la recette/.test(c.messages[0].content[1].text), true);

  const perso = corpsVision({ ...BODY, criteria: ['Cuisson', 'Assaisonnement'] });
  controle('critères fournis respectés',
    /Critères : Cuisson, Assaisonnement/.test(perso.messages[0].content[1].text), true);

  // Une pièce jointe Discord derrière un jeton n'est pas récupérable par Anthropic.
  const b64 = corpsVision({ ...BODY, image_url: `data:image/png;base64,${IMG64}` });
  controle('image en base64 acceptée',
    b64.messages[0].content[0].source, { type: 'base64', media_type: 'image/png', data: IMG64 });
}

console.log('\n2. lecture du résultat — le chemin nominal');
{
  const rep = { model: 'claude-sonnet-4-6', stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'rendre_evaluation',
    input: { overall_score: 78, criteria: [{ name: 'Texture', score: 80, comment: 'Belle tenue.' }],
             feedback: 'Bon travail.', improvements: ['Dorer davantage'], highlights: ['Couleur homogène'] } }] };
  const r = execCode('Parse Evaluation', rep, { Webhook: { body: BODY } })[0].json;
  controle('succès', r.success, true);
  controle('note portée', r.grade_payload.grade, 78);
  controle('graded_by', r.grade_payload.graded_by, 'ai');
  controle('modèle réellement servi retenu', r.modele_servi, 'claude-sonnet-4-6');
  // On teste l'APPEL, pas la chaîne : le commentaire du nœud mentionne
  // JSON.parse pour expliquer qu'il a été retiré. Chercher le mot attraperait
  // l'explication au lieu du défaut — même piège que « }} » dans une expression.
  const sansCommentaires = noeud('Parse Evaluation').parameters.jsCode
    .replace(/\/\/[^\n]*/g, '');
  controle('plus aucun appel à JSON.parse', /JSON\.parse\s*\(/.test(sansCommentaires), false);
}

console.log('\n3. échec du fournisseur — la cause remonte');
{
  const cas = [
    ['404 modèle retiré', { error: { message: '404 - {"type":"not_found_error"}' } }, 404, 'MODEL_NOT_FOUND'],
    ['401 clé invalide', { error: { message: '401 - {"type":"authentication_error"}' } }, 401, 'AUTH_FAILED'],
    ['panne réseau', { error: { message: 'socket hang up', code: 'ECONNRESET' } }, 502, 'PROVIDER_ERROR'],
  ];
  for (const [lib, rep, code, statut] of cas) {
    const r = execCode('Parse Evaluation', rep, { Webhook: { body: BODY } })[0].json;
    controle(lib, [r.success, r.error.code, r.error.status], [false, code, statut]);
  }
  const sansOutil = execCode('Parse Evaluation',
    { model: 'x', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Voici…' }] },
    { Webhook: { body: BODY } })[0].json;
  controle('réponse non structurée refusée',
    [sansOutil.success, sansOutil.error.status], [false, 'UNSTRUCTURED_RESPONSE']);
}

console.log('\n4. ⚠️ une note non enregistrée n’est PLUS annoncée enregistrée');
{
  const parse = { submission_id: 'sub-1', modele_servi: 'claude-sonnet-4-6',
                  evaluation: { overall_score: 78, feedback: 'Bon travail.' } };
  const ok = execCode('Format Success Response',
    { statusCode: 200, body: { id: 'sub-1', grade: 78, feedback: 'Bon travail.', xp_earned: 40 } },
    { 'Parse Evaluation': parse })[0].json;
  controle('écriture réussie → succès', [ok.success, ok.data.grade, ok.data.xp_earned], [true, 78, 40]);
  controle('modèle réel dans la méta, pas une constante', ok.meta.model, 'claude-sonnet-4-6');

  // Le défaut d'origine : Save Grade en onError émettait un objet d'erreur, et
  // le nœud répondait success:true avec des undefined.
  for (const [lib, rep, code] of [
    ['401 sur l’écriture', { error: { message: '401 - {"detail":"unauthorized"}' } }, 401],
    ['500 sur l’écriture', { error: { message: '500 - {"detail":"boom"}' } }, 500],
    ['réponse sans id', { statusCode: 200, body: { grade: 78 } }, 502],
  ]) {
    const r = execCode('Format Success Response', rep, { 'Parse Evaluation': parse })[0].json;
    controle(lib, [r.success, r.error.code, r.error.status], [false, code, 'GRADE_NOT_SAVED']);
    // L'évaluation a coûté un appel : on la rend quand même.
    controle(`  ${lib} — évaluation rendue quand même`, r.evaluation.overall_score, 78);
  }
  controle('le code HTTP suit le succès',
    noeud('Respond Success').parameters.options.responseCode,
    '={{ $json.success ? 200 : ($json.error?.code || 502) }}');
}

if (process.argv.includes('--en-ligne')) {
  console.log('\n5. aller-retour réel contre Anthropic');
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) { console.log('  ⏭  ANTHROPIC_API_KEY absente'); conclure(); }
  else {
    (async () => {
      const zlib = require('zlib');
      const ch = (t, d) => { const c = Buffer.concat([Buffer.from(t), d]);
        const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(c) : 0);
        return Buffer.concat([l, c, crc]); };
      // image unie 48×48, suffisante pour vérifier la chaîne
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(48, 0); ihdr.writeUInt32BE(48, 4);
      ihdr[8] = 8; ihdr[9] = 2;
      const raw = Buffer.concat(Array.from({ length: 48 }, () =>
        Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: 48 }, () => Buffer.from([200, 140, 60])))])));
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ch('IHDR', ihdr), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]).toString('base64');

      const corps = corpsVision({ ...BODY, image_url: `data:image/png;base64,${png}`, recipe_name: 'Tarte Tatin' });
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(corps) });
      const d = await r.json();
      controle('le corps produit est accepté', r.status, 200);
      const parsed = execCode('Parse Evaluation', d, { Webhook: { body: BODY } })[0].json;
      controle('évaluation structurée lue', parsed.success, true);
      controle('note entre 0 et 100',
        parsed.success && parsed.grade_payload.grade >= 0 && parsed.grade_payload.grade <= 100, true);
      conclure();
    })().catch(e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
  }
} else conclure();

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
  console.log('✅ tous les contrôles passent');
}
