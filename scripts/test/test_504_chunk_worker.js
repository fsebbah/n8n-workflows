#!/usr/bin/env node
/**
 * #504 — Torah Chunk Worker : le modèle ne recopie plus le texte, il rend des points de coupe.
 *
 *     node scripts/test/test_504_chunk_worker.js
 *     WF_RACINE=/chemin/vers/develop/workflows node scripts/test/test_504_chunk_worker.js   # avant
 *
 * Défauts mesurés sur develop (2026-09-14) : 10 523 caractères envoyés → 10 510 rendus ;
 * 11 390 caractères vocalisés → sortie tronquée à 8 192 jetons → PARSE_ERROR ;
 * `text.substring(0, 50000)` : la fin d'un texte plus long n'est jamais découpée ;
 * les échecs sortent en HTTP 200.
 *
 * Ce que le test protège
 * ----------------------
 *  - INVARIANT : segments.map(s => s.text).join('') === texte, char_count === text.length,
 *    index consécutifs, aucun segment > 8 000 — sur de l'hébreu vocalisé et non vocalisé
 *    de 10 500, 30 000 et 120 000 caractères ;
 *  - le repli déterministe (JSON invalide, coupes non croissantes / hors bornes / trop longues,
 *    erreur Anthropic, appel échoué), signalé par `method` ;
 *  - le cas court, la clé BYOT obligatoire, le contrat de réponse, les statuts HTTP ;
 *  - la compatibilité avec Torah_Router (Prepare Segments, Pre-Translate Long).
 *
 * Le pipeline est rejoué nœud par nœud dans `vm`, comme n8n : Parse Input → Needs Chunking?
 * → (Prepare Split →) corps de Claude Smart Split → modèle simulé → Parse Chunks → statut.
 * Le même fichier tourne sur develop (pas de Prepare Split : ancien corps, ancien modèle
 * « recopieur » idéal) pour montrer l'échec avant correctif.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = process.env.WF_RACINE || path.resolve(__dirname, '../../workflows');
const W = JSON.parse(fs.readFileSync(path.join(RACINE, 'Torah_Chunk_Worker.json'), 'utf8'));
const ROUTER = JSON.parse(fs.readFileSync(path.join(RACINE, 'Torah_Router.json'), 'utf8'));
const nd = (n, w = W) => w.nodes.find((x) => x.name === n);
const NOUVEAU = !!nd('Prepare Split');
const MAX = 8000;

let ok = 0, ko = 0;
const T = (nom, attendu, obtenu) => {
  const bon = JSON.stringify(attendu) === JSON.stringify(obtenu);
  bon ? ok++ : ko++;
  console.log(`  ${bon ? '✅' : '❌'} ${nom.padEnd(66)} ${String(JSON.stringify(obtenu)).slice(0, 40)}`);
  if (!bon) console.log(`     attendu : ${JSON.stringify(attendu).slice(0, 200)}`);
};

// ── Corpus hébreu ────────────────────────────────────────────────────────────
// Échantillons bavli-visavis (gotenberg.api) : Guemara vocalisée, commentaires non vocalisés.
// Steinsaltz exclu. Repli embarqué (Genèse 1, Rachi) si les échantillons sont absents.
const ECH = process.env.HEBREU_SAMPLES || '/storage6/pi6/gotenberg.api/templates/bavli-visavis';
const voc = [], com = [];
for (const f of ['sample.json', 'sample-multi.json', 'sample-commentaire-long.json']) {
  const p = path.join(ECH, f);
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const page of (d.pages || [d])) for (const para of page.paragraphes) {
    voc.push(para.hebreu);
    for (const c of para.commentaires || []) if (c.auteur !== 'Steinsaltz') com.push([c.auteur, c.hebreu]);
  }
}
if (!voc.length) {
  voc.push('בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃ וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ וְחֹשֶׁךְ עַל־פְּנֵי תְהוֹם וְרוּחַ אֱלֹהִים מְרַחֶפֶת עַל־פְּנֵי הַמָּיִם׃',
    'וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר וַיְהִי־אוֹר׃ וַיַּרְא אֱלֹהִים אֶת־הָאוֹר כִּי־טוֹב וַיַּבְדֵּל אֱלֹהִים בֵּין הָאוֹר וּבֵין הַחֹשֶׁךְ׃');
  com.push(['Rashi', 'בראשית ברא - אין המקרא הזה אומר אלא דורשני, כמו שדרשוהו רבותינו ז"ל בשביל התורה שנקראת ראשית דרכו:'],
    ['Rashi', 'ויבדל - אף בזה צריכים אנו לדברי אגדה, ראהו שאינו כדאי להשתמש בו רשעים והבדילו לצדיקים לעתיד לבא, ע"כ.']);
}
/** Texte de `taille` caractères. `page` : sauts de ligne / <b>auteur</b> … <br> ; `ligne` : un seul bloc. */
function corpus(taille, vocalise, style = 'page') {
  let s = '', i = 0;
  while (s.length < taille) {
    if (vocalise) s += voc[i % voc.length] + (style === 'ligne' ? ' ' : (i % 4 === 3 ? '\n\n' : ' '));
    else { const [a, h] = com[i % com.length]; s += style === 'ligne' ? h + ' ' : `<b>${a}</b> ${h}<br>\n`; }
    i++;
  }
  return s.slice(0, taille);
}

// ── Rejeu n8n ────────────────────────────────────────────────────────────────
/** Code node : `$input.first()` = entree, `$('X').first().json` = refs[X]. */
const code = (nom, entree, refs = {}) => {
  const r = vm.runInNewContext(`(function(){${nd(nom).parameters.jsCode}})()`, {
    $input: { first: () => ({ json: entree }), all: () => [{ json: entree }] },
    $: (k) => ({ first: () => ({ json: refs[k] }) }),
  }, { timeout: 20000 });
  return Array.isArray(r) ? r[0].json : r.json;
};
/** Expression `={{ … }}` évaluée comme n8n. */
const expr = (v, $json) => vm.runInNewContext(`(${v.replace(/^=\{\{/, '').replace(/\}\}\s*$/, '')})`, { $json }, { timeout: 3000 });
const corps = ($json) => JSON.parse(expr(nd('Claude Smart Split').parameters.jsonBody, $json));
/** Statut HTTP rendu à l'appelant. */
function statut(sortie) {
  if (nd('Webhook Trigger').parameters.responseMode !== 'responseNode') return 200;   // lastNode : toujours 200
  const r = W.nodes.find((n) => n.type === 'n8n-nodes-base.respondToWebhook');
  return Number(expr(r.parameters.options.responseCode, sortie));
}
const env = (body, statusCode = 200) => ({ statusCode, headers: {}, body });
const texteModele = (t, stop = 'end_turn') => env({ type: 'message', model: 'claude-haiku-4-5-20251001', stop_reason: stop,
  content: [{ type: 'text', text: t }], usage: { input_tokens: 1, output_tokens: 1 } });

/** Modèle « idéal » : nouveau corps → débuts d'unités (paquets ≤ 7 000) ; ancien corps → recopie parfaite. */
function modeleIdeal(req) {
  const prompt = req.messages[0].content;
  if (NOUVEAU) {
    const fins = [...prompt.matchAll(/^#(\d+) fin=(\d+) \|/gm)].map((m) => Number(m[2]));
    const debuts = [0]; let base = 0;
    for (let k = 0; k < fins.length - 1; k++) {
      if (fins[k + 1] - base > 7000) { debuts.push(k + 1); base = fins[k]; }
    }
    return texteModele(JSON.stringify({ debuts }));
  }
  const recu = prompt.split('TEXTE À DÉCOUPER:\n')[1] || '';
  const chunks = [];
  for (let i = 0; i < recu.length; i += MAX) chunks.push({ index: chunks.length, text: recu.slice(i, i + MAX), char_count: Math.min(MAX, recu.length - i) });
  return texteModele(JSON.stringify({ chunks, total_chunks: chunks.length }));
}

/** Tout le worker pour un corps de requête. */
function worker(body, modele = modeleIdeal, avant = null) {
  const pi = code('Parse Input', { body });
  const refs = { 'Parse Input': pi };
  if (pi.needsChunking !== true) return { sortie: pi, statut: statut(pi), appels: 0 };
  let req;
  if (NOUVEAU) { refs['Prepare Split'] = code('Prepare Split', pi, refs); if (avant) avant(refs); req = corps(refs['Prepare Split']); }
  else req = corps(pi);
  const sortie = code('Parse Chunks', modele(req), refs);
  return { sortie, statut: statut(sortie), appels: 1, req, prep: refs['Prepare Split'] };
}
const K = { api_key: 'sk-ant-test' };
function invariant(texte, s) {
  const segs = (s && s.segments) || [];
  return {
    succes: s && s.success === true,
    identique: segs.map((x) => x.text).join('') === texte,
    char_count: segs.every((x) => x.char_count === (x.text || '').length),
    index: segs.every((x, k) => x.index === k),
    max8000: segs.length > 0 && segs.every((x) => x.char_count <= MAX),
  };
}
const INV_OK = { succes: true, identique: true, char_count: true, index: true, max8000: true };
/** Un bloc qui lève compte comme un échec (sur develop, les sorties n'ont pas de segments). */
const garde = (fn) => { try { fn(); } catch (e) { ko++; console.log(`  ❌ exception : ${e.message}`); } };
let finRouter = null;

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\nStructure testée : ${NOUVEAU ? 'points de coupe (#504)' : 'recopie (develop)'} — ${RACINE}`);

console.log('\n1. Invariant sur de l’hébreu réel, texte ENTIER traité (modèle idéal)');
for (const vocalise of [true, false]) {
  for (const taille of [10500, 30000, 120000]) {
    const texte = corpus(taille, vocalise);
    const r = worker({ ...K, text: texte });
    const lib = `${vocalise ? 'vocalisé' : 'non vocalisé'} ${taille}`;
    T(`${lib} : invariant complet`, INV_OK, invariant(texte, r.sortie));
    T(`${lib} : method claude_boundaries, statut 200`, ['claude_boundaries', 200], [r.sortie.method, r.statut]);
    if (NOUVEAU && taille === 120000) {
      const n = r.prep.total_unites;
      T(`${lib} : le prompt couvre toutes les unités, jusqu'à la fin`, true, r.req.messages[0].content.includes(`#${n - 1} fin=${taille} |`));
      console.log(`     ${n} unités, ${r.sortie.total_segments} segments, prompt ${r.req.messages[0].content.length} car. pour ${taille}`);
    }
  }
}
for (const [taille, vocalise] of [[30000, true], [30000, false]]) {
  const texte = corpus(taille, vocalise, 'ligne');
  T(`bloc sans saut de ligne ${taille} ${vocalise ? 'vocalisé' : 'non vocalisé'} : invariant`, INV_OK, invariant(texte, worker({ ...K, text: texte }).sortie));
}

console.log('\n2. Repli déterministe — toujours l’invariant, signalé par `method`');
const T30 = corpus(30000, false);
const cas = {
  'JSON invalide': [() => texteModele('Voici les coupes : 0, 4, 9'), 'json_invalide'],
  'réponse tronquée (max_tokens)': [() => texteModele('{"debuts": [0, 4, 1', 'max_tokens'), 'reponse_tronquee'],
  'coupes non croissantes': [() => texteModele('{"debuts": [0, 9, 4]}'), 'coupes_non_croissantes'],
  'coupes en double': [() => texteModele('{"debuts": [0, 4, 4]}'), 'coupes_non_croissantes'],
  'coupes hors bornes': [() => texteModele('{"debuts": [0, 4, 99999]}'), 'coupes_hors_bornes'],
  'coupe négative': [() => texteModele('{"debuts": [-1, 4]}'), 'coupes_hors_bornes'],
  'coupe non entière': [() => texteModele('{"debuts": [0, 4.5]}'), 'coupes_non_entieres'],
  'segment > 8 000 (un seul début)': [() => texteModele('{"debuts": [0]}'), 'segment_trop_long'],
  'aucune coupe': [() => texteModele('{"debuts": []}'), 'coupes_absentes'],
  'réponse vide': [() => texteModele(''), 'reponse_vide'],
  'erreur Anthropic 401': [() => env({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401), 'erreur_anthropic_401'],
  'erreur Anthropic 529': [() => env({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 529), 'erreur_anthropic_529'],
  'appel échoué (réseau, onError)': [() => ({ error: { message: 'ECONNRESET' } }), 'appel_echoue'],
};
for (const [nom, [modele, raison]] of Object.entries(cas)) {
  const r = worker({ ...K, text: T30 }, modele);
  T(`${nom} : invariant + repli`, [INV_OK, 'deterministic_fallback', raison, 200],
    [invariant(T30, r.sortie), r.sortie.method, r.sortie.fallback_reason, r.statut]);
}
garde(() => {
  const r = worker({ ...K, text: T30 }, (req) => texteModele('```json\n' + modeleIdeal(req).body.content[0].text + '\n```'));
  T('débuts valides dans un bloc ```json → acceptés', [true, 'claude_boundaries'], [invariant(T30, r.sortie).identique, r.sortie.method]);
  const r2 = worker({ ...K, text: T30 }, (req) => { const b = modeleIdeal(req); const d = JSON.parse(b.body.content[0].text).debuts.slice(1); b.body.content[0].text = JSON.stringify({ debuts: d }); return b; });
  T('0 initial omis → ajouté, pas un repli', [INV_OK, 'claude_boundaries'], [invariant(T30, r2.sortie), r2.sortie.method]);
});
garde(() => { // les débuts rendus sont des coupes AUTORISÉES ; le workflow garde le plus lointain qui tient
  const numeros = (req) => [...req.messages[0].content.matchAll(/^#(\d+) fin=/gm)].map((m) => Number(m[1]));
  const r = worker({ ...K, text: T30 }, (req) => texteModele(JSON.stringify({ debuts: numeros(req) })));
  T('toutes les unités proposées → segments ≤ 8 000, pas de miettes', [INV_OK, 'claude_boundaries', true],
    [invariant(T30, r.sortie), r.sortie.method, r.sortie.segments.slice(0, -1).every((s) => s.char_count >= 4000)]);
  let proposes = [];
  const r2 = worker({ ...K, text: T30 }, (req) => { proposes = numeros(req).filter((k) => k % 2 === 0); return texteModele(JSON.stringify({ debuts: proposes })); });
  const coupes = []; let pos = 0;
  for (const s of r2.sortie.segments.slice(0, -1)) { pos += s.char_count; coupes.push(pos); }
  T('coupes prises UNIQUEMENT parmi les débuts proposés', [INV_OK, 'claude_boundaries', true],
    [invariant(T30, r2.sortie), r2.sortie.method, coupes.length > 0 && coupes.every((c) => proposes.some((k) => r2.prep.bornes[k] === c))]);
  const r3 = worker({ ...K, text: T30 }, (req) => { const b = modeleIdeal(req); const d = JSON.parse(b.body.content[0].text).debuts; b.body.content[0].text = JSON.stringify({ debuts: d.filter((_, i) => i !== 2) }); return b; });
  T('débuts trop espacés (écart > 8 000) → repli', ['deterministic_fallback', 'segment_trop_long', true],
    [r3.sortie.method, r3.sortie.fallback_reason, invariant(T30, r3.sortie).identique]);
});
garde(() => { // qualité du repli : sur une page de commentaires, les coupes tombent sur <br> / <b>
  const r = worker({ ...K, text: T30 }, () => texteModele('{'));
  const fins = r.sortie.segments.slice(0, -1).map((s) => s.text);
  T('repli : chaque coupe tombe après un <br> (avant un <b>)', true, fins.length > 0 && fins.every((t) => /<br>\s*$/.test(t)));
  T('repli : segments d’au moins 4 000 car. (sauf le dernier)', true, r.sortie.segments.slice(0, -1).every((s) => s.char_count >= 4000));
});

console.log('\n3. Unités sans frontière');
garde(() => {
  const mots = voc.join(' ').replace(/[.:;?!׃,\n]/g, '');
  let t = ''; while (t.length < 20000) t += mots + ' ';
  t = t.slice(0, 20000);
  const r = worker({ ...K, text: t }, () => texteModele('x'));
  T('20 000 car. sans ponctuation : invariant', INV_OK, invariant(t, r.sortie));
  T('… coupé sur la dernière espace possible', true, r.sortie.segments.slice(0, -1).every((s) => /\s$/.test(s.text) && s.char_count > MAX - 100));
  const a = 'א'.repeat(20000);
  const r2 = worker({ ...K, text: a }, () => texteModele('x'));
  T('20 000 car. sans aucune espace : invariant, coupes nettes à 8 000', [INV_OK, [8000, 8000, 4000]], [invariant(a, r2.sortie), r2.sortie.segments.map((s) => s.char_count)]);
  const img = ('<img src="data:x. y: z" alt="a. b"> ' + voc[0] + ' ').repeat(200).slice(0, 25000);
  const r3 = worker({ ...K, text: img });
  let coupeDansBalise = false, pos = 0;
  for (const s of r3.sortie.segments.slice(0, -1)) {
    pos += s.char_count;
    const avant = img.slice(0, pos);
    if (avant.lastIndexOf('<') > avant.lastIndexOf('>')) coupeDansBalise = true;
  }
  T('<img> : invariant, aucune coupe à l’intérieur d’une balise', [INV_OK, false], [invariant(img, r3.sortie), coupeDansBalise]);
  const crlf = corpus(12000, true).replace(/\n/g, '\r\n');
  T('CRLF : invariant', INV_OK, invariant(crlf, worker({ ...K, text: crlf }).sortie));
  const emoji = '😀'.repeat(6000);
  const r4 = worker({ ...K, text: emoji }, () => texteModele('x'));
  T('paires UTF-16 jamais séparées', [true, true], [invariant(emoji, r4.sortie).identique,
    r4.sortie.segments.every((s) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(s.text))]);
});

console.log('\n4. L’invariant est vérifié DANS le workflow : cassé → échec explicite, jamais un succès');
garde(() => { if (NOUVEAU) {
  const r = worker({ ...K, text: T30 }, modeleIdeal, (refs) => { refs['Prepare Split'] = { ...refs['Prepare Split'], bornes: refs['Prepare Split'].bornes.slice(0, -1) }; });
  T('bornes tronquées → INVARIANT_VIOLATION, statut 500', [false, 'INVARIANT_VIOLATION', 500], [r.sortie.success, r.sortie.error && r.sortie.error.code, r.statut]);
} else {
  const texte = corpus(10523, true);
  const perte = (req) => { const b = modeleIdeal(req); const j = JSON.parse(b.body.content[0].text); j.chunks[0].text = j.chunks[0].text.slice(13); b.body.content[0].text = JSON.stringify(j); return b; };
  const r = worker({ ...K, text: texte }, perte);
  T('13 caractères perdus par la recopie → échec explicite', false, r.sortie.success);
} });
garde(() => {
  const texte = corpus(11390, true);
  const r = worker({ ...K, text: texte }, NOUVEAU ? modeleIdeal : () => texteModele('{"chunks": [{"index": 0, "text": "אֶלָּא', 'max_tokens'));
  T('11 390 car. vocalisés (sortie plafonnée sur develop) → succès', INV_OK, invariant(texte, r.sortie));
});

console.log('\n5. Cas court, clé BYOT, contrat, statuts');
garde(() => {
  const court = corpus(500, true);
  const r = worker({ ...K, text: court });
  T('texte court : réponse inchangée, aucun appel', [{ success: true, needsChunking: false, segments: [{ index: 0, text: court, char_count: 500 }], total_segments: 1 }, 0, 200],
    [r.sortie, r.appels, r.statut]);
  const seuil = corpus(12000, false);
  T('threshold 20 000 respecté → cas court', [false, 1], [worker({ ...K, text: seuil, threshold: 20000 }).sortie.needsChunking, worker({ ...K, text: seuil, threshold: 20000 }).sortie.total_segments]);
  const sansCle = worker({ text: T30 });
  T('clé absente → MISSING_API_KEY, statut 400', [false, 'MISSING_API_KEY', 0, 400], [sansCle.sortie.success, sansCle.sortie.error.code, sansCle.appels, sansCle.statut]);
  const courtSansCle = worker({ text: court });
  T('clé absente sur texte court → toujours refusé', [false, 'MISSING_API_KEY'], [courtSansCle.sortie.success, courtSansCle.sortie.error.code]);
  const sansTexte = worker({ ...K });
  T('texte absent → MISSING_TEXT, statut 400', [false, 'MISSING_TEXT', 400], [sansTexte.sortie.success, sansTexte.sortie.error.code, sansTexte.statut]);
  const r2 = worker({ ...K, text: T30 });
  T('contrat : clés de la réponse', ['success', 'segments', 'total_segments', 'method'], Object.keys(r2.sortie));
  T('contrat : clés d’un segment', ['index', 'text', 'char_count'], Object.keys(r2.sortie.segments[0]));
  T('contrat : total_segments = segments.length', r2.sortie.segments.length, r2.sortie.total_segments);
  if (NOUVEAU) {
    const b = r2.req;
    T('corps : modèle, max_tokens, sortie JSON contrainte', ['claude-haiku-4-5-20251001', 4096, 'json_schema'], [b.model, b.max_tokens, b.output_config.format.type]);
    T('corps : le texte n’est pas envoyé en entier (extraits)', true, b.messages[0].content.length < T30.length);
    const h = nd('Claude Smart Split').parameters;
    T('clé BYOT lue du corps, jamais $env', ['={{ $json.apiKey }}', false],
      [h.headerParameters.parameters.find((x) => x.name === 'x-api-key').value, JSON.stringify(W.nodes).includes('$env')]);
    T('HTTP : statut réel lisible (fullResponse + neverError)', { fullResponse: true, neverError: true }, h.options.response.response);
  }
});

console.log('\n6. Câblage et expressions');
garde(() => {
  const aval = (n) => (W.connections[n]?.main || []).map((l) => l.map((c) => c.node));
  T('Needs Chunking? : vrai → Prepare Split, faux → Respond', [['Prepare Split'], ['Respond']], aval('Needs Chunking?'));
  T('Prepare Split → Claude Smart Split → Parse Chunks → Respond', [[['Claude Smart Split']], [['Parse Chunks']], [['Respond']]],
    [aval('Prepare Split'), aval('Claude Smart Split'), aval('Parse Chunks')]);
  T('webhook en responseNode', 'responseNode', nd('Webhook Trigger').parameters.responseMode);
  T('noms et ids uniques', [true, true], [new Set(W.nodes.map((n) => n.name)).size === W.nodes.length, new Set(W.nodes.map((n) => n.id)).size === W.nodes.length]);
  const cibles = Object.values(W.connections).flatMap((c) => c.main.flat().map((x) => x.node));
  T('toutes les connexions visent un nœud existant', true, cibles.every((c) => !!nd(c)));
  const exprs = [];
  const creuse = (v) => { if (typeof v === 'string') { if (v.startsWith('=')) exprs.push(v); } else if (v && typeof v === 'object') Object.values(v).forEach(creuse); };
  W.nodes.forEach((n) => creuse(n.parameters));
  T(`${exprs.length} expressions, aucune tronquée par un « }} » interne`, [], exprs.filter((v) => { const i = v.indexOf('{{'); return i >= 0 && v.slice(i + 2, v.lastIndexOf('}}')).includes('}}'); }));
});

console.log('\n7. Compatibilité Torah_Router (nœuds réels)');
garde(() => {
  // Prepare Segments (après Call Chunk Worker, HTTP onError=continueRegularOutput)
  const PI = { segments: [{ index: 0, text: T30, segment_id: 's1', source_text: T30, char_count: T30.length }], jobId: 'j', apiKey: 'k' };
  const prepSeg = (chunk) => vm.runInNewContext(`(function(){${nd('Prepare Segments', ROUTER).parameters.jsCode}})()`, {
    $input: { first: () => ({ json: chunk }) }, $: () => ({ first: () => ({ json: PI }) }),
  }).map((i) => i.json);
  const ok200 = worker({ ...K, text: T30 }).sortie;
  const items = prepSeg(ok200);
  T('Prepare Segments : un item par segment, textes dans l’ordre', [ok200.total_segments, T30], [items.length, items.map((i) => i.text).join('')]);
  // Un non-2xx lève dans le nœud HTTP → onError=continueRegularOutput émet { error } sans segments.
  T('Prepare Segments : échec (400/500 → { error }) → segment d’origine, comme success:false', [1, T30.length],
    [prepSeg({ error: { message: '400 - MISSING_API_KEY' } }).length, prepSeg({ error: { message: 'x' } })[0].text.length]);

  // Pre-Translate Long : helpers.httpRequest lève sur non-2xx.
  const preTranslate = async (seg, torahChunk) => {
    const src = nd('Pre-Translate Long', ROUTER).parameters.jsCode;
    const traductions = [];
    const ctx = { helpers: { httpRequest: async ({ url, body }) => {
      if (url.endsWith('/torah-chunk')) {
        const r = torahChunk(body);
        if (r.statut < 200 || r.statut >= 300) throw new Error(`Request failed with status code ${r.statut}`);
        return r.sortie;
      }
      traductions.push(body.text);
      return { success: true, translation: `[${body.text.length}]` };
    } } };
    const fn = vm.runInNewContext(`(async function(){${src}})`, { $input: { all: () => [{ json: seg }] }, $env: {} });
    const out = await fn.call(ctx);
    return { out: out[0].json, traductions };
  };
  const SEG = { needsChunk: true, text: T30, jobId: 'j', segment_id: 's', chunkThreshold: 10000, apiKey: 'k' };
  const tolerant = (b) => worker({ api_key: b.api_key, text: b.text, threshold: b.threshold });
  finRouter = Promise.all([
    preTranslate(SEG, tolerant),
    preTranslate({ ...SEG, apiKey: undefined }, tolerant),
  ]).then(([a, b]) => {
    T('Pre-Translate Long : chaque segment traduit, dans l’ordre, réassemblé', [null, T30, a.traductions.length],
      [a.out.longError, a.traductions.join(''), a.out.chunksReassembled]);
    T('Pre-Translate Long : 400 (clé absente) → chunk_failed, comme success:false', ['chunk_failed', null], [b.out.longError, b.out.translation]);
  });
});
Promise.resolve(finRouter).catch((e) => { ko++; console.log(`  ❌ exception : ${e.message}`); }).then(() => {
  console.log(`\n${ko ? '❌' : '✅'} ${ok} ok, ${ko} en échec`);
  process.exit(ko ? 1 : 0);
});
