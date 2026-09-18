#!/usr/bin/env node
/**
 * OCR : `page_details[]` et `warnings[]` rendus par `pdf-ocr` et `image-ocr` — azy.daily#363.
 *
 *     node scripts/test/test_363_ocr_page_details.js
 *     node --env-file=.env.local scripts/test/test_363_ocr_page_details.js --en-ligne
 *         # 8 appels Mistral réels sur des pages extraites (MISTRAL_API_KEY, pdfseparate, pdfunite) ;
 *         # PDF source dans docs/ (ou OCR_363_DOCS=<dossier>)
 *
 * Ce que le test protège
 * ----------------------
 *  1. structure des deux workflows (ids, noms, connexions, expressions, Code nodes, blocs communs identiques) ;
 *  2. options de requête : extract_header_footer (défaut true), include_blocks, table_format → corps Mistral ;
 *  3. page_details TOUJOURS présent : index, markdown de la page, header, footer, dimensions ;
 *  4. extract_header_footer: false → ancien texte (en-têtes dans le markdown, header/footer null) ;
 *  5. blocks : absents sans include_blocks ; avec, types normalisés, header/footer exclus, bbox convertie ;
 *  6. tables : absentes sans table_format "html" ; avec, lien dans le markdown et tableau dans tables[] ;
 *  7. images jamais rendues ;
 *  8. relance page par page sur un 500 de Mistral, PAGE_FAILED, usage.pages = pages du document ;
 *  9. forme lisible par MCP (lecture de azy.mcp#834 transcrite) : dans `data` ;
 * 10. image-ocr rend la même forme ; 11. chemin Google (réponse construite, non mesuré) ;
 * 12. documentation.
 *
 * Les réponses Mistral sont de VRAIES réponses mesurées le 2026-09-17 (scripts/test/fixtures/ocr_363/).
 * Le test exécute le JavaScript et les expressions extraits du JSON des workflows :
 * c'est le code importé qui est testé, pas une copie.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..', '..');
const FIX = path.join(__dirname, 'fixtures', 'ocr_363');
function charger(fichier) {
  const brut = fs.readFileSync(path.join(RACINE, 'workflows', fichier), 'utf8');
  return { fichier, brut, w: JSON.parse(brut) };
}
const PDF = charger('MCP_-_PDF_OCR.json');
const IMG = charger('MCP_-_Image_OCR.json');
const nd = (wf, nom) => wf.w.nodes.find(x => x.name === nom) || { parameters: {} };

const echecs = [];
let total = 0;
function controle(libelle, obtenu, attendu) {
  total++;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(78)} ${vu && vu.length > 40 ? vu.slice(0, 40) + '…' : vu}`
    + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}
async function section(titre, fn) {
  console.log(`\n${titre}`);
  try { await fn(); } catch (e) { total++; echecs.push(titre); console.log(`  ❌ la section a levé : ${e.stack}`); }
}

/** Un Code node dans un bac à sable proche de n8n : ni require, ni process ; `this.helpers` fourni ; `$('nom')` rend `prev[nom]`. */
async function execCode(wf, nom, item, prev = {}, helpers = null) {
  const src = nd(wf, nom).parameters.jsCode;
  if (typeof src !== 'string') return { erreur: `nœud ${nom} absent` };
  const items = [item];
  try {
    const fn = vm.runInNewContext(`(async function(){${src}\n})`, {
      $input: { first: () => items[0], all: () => items },
      $: n => ({ first: () => ({ json: prev[n] }) }),
    }, { timeout: 5000 });
    const h = helpers || { httpRequest: async () => { throw new Error('helpers.httpRequest appelé sans être attendu'); } };
    const r = await fn.call({ helpers: h });
    return Array.isArray(r) ? r[0] : r;
  } catch (e) {
    return { erreur: `${nom} a levé ${e.message}` };
  }
}

/** Résout un paramètre comme n8n : expression seulement s'il commence par « = ». */
function resoudre(valeur, json, prev = {}) {
  if (typeof valeur !== 'string' || !valeur.startsWith('=')) return valeur;
  const evaluer = expr => vm.runInNewContext(`(${expr})`, { $json: json, $: n => ({ first: () => ({ json: prev[n] }) }), JSON });
  const seul = valeur.match(/^=\{\{([\s\S]*)\}\}$/);
  if (seul && !seul[1].includes('}}')) return evaluer(seul[1]);
  return valeur.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
    const v = evaluer(expr);
    return typeof v === 'string' ? v : String(JSON.stringify(v));
  });
}

const fixture = nom => JSON.parse(fs.readFileSync(path.join(FIX, nom), 'utf8'));
const M = {
  p2: fixture('mistral_shoftim_p2_entetes.json'),
  p2Sans: fixture('mistral_shoftim_p2_sans_entetes.json'),
  p12Html: fixture('mistral_shoftim_p1-2_entetes_html_blocs.json'),
  p1Tableau: fixture('mistral_shoftim_p1_entetes_tableau_markdown.json'),
  tw3: fixture('mistral_wellsprings_p3_entetes_html_blocs.json'),
  doc500: fixture('mistral_shoftim_p2-3_500.json'),
  pages0: fixture('mistral_shoftim_p2-3_pages0.json'),
  pages1: fixture('mistral_shoftim_p2-3_pages1_500.json'),
  horsLimite: fixture('mistral_shoftim_p2-3_pages5_hors_limite.json'),
};
/** Sortie d'un nœud HTTP Request en fullResponse + neverError. */
const reponse = f => ({ statusCode: f.mesure.statut_http, statusMessage: '', headers: { 'content-type': 'application/json' }, body: JSON.parse(JSON.stringify(f.reponse)) });

const CLE = 'mk-test-363-CLE-SECRETE-0123456789abcdef';
const BASE = {
  provider: 'mistral', model: 'mistral-ocr-latest', mime_type: 'application/pdf', tenant_id: 't1',
  file_url: 'https://f003.backblazeb2.test/file/azy-ocr/t1/doc.pdf?Authorization=SIGNATURE',
  mistral_api_key: CLE,
};
const valider = (wf, body) => execCode(wf, 'Validate Input', { json: { body, headers: {}, query: {} } });

/** Lecture de MCP transcrite de azy.mcp#834 (`_normalize_ocr_response`) : data d'abord, premier niveau sinon. */
function lectureMcp(n8n) {
  if (!n8n || n8n.success === false) return { echec: true };
  const d = n8n.data || {};
  const usage = (n8n.meta || {}).usage || {};
  const pd = d.page_details ?? n8n.page_details;
  const w = d.warnings ?? n8n.warnings;
  return {
    markdown: d.text, pages: usage.pages_processed ?? d.page_count,
    page_details: pd === undefined ? null : pd, warnings: w === undefined ? null : w,
    lu_dans: d.page_details !== undefined ? 'data' : (n8n.page_details !== undefined ? 'premier niveau' : null),
  };
}

/** Faux Mistral pour la relance : `parIndex(i, n)` rend la fixture de l'appel n° n (0, 1…) de la page i. */
function fauxMistral(parIndex) {
  const appels = [];
  const vus = {};
  return {
    appels,
    helpers: {
      httpRequest: async opts => {
        appels.push(JSON.parse(JSON.stringify(opts)));
        const i = opts.body && Array.isArray(opts.body.pages) ? opts.body.pages[0] : null;
        vus[i] = (vus[i] || 0) + 1;
        const f = parIndex(i, vus[i] - 1);
        return { statusCode: f.mesure.statut_http, body: JSON.parse(JSON.stringify(f.reponse)) };
      },
    },
  };
}

async function chaineSync(body, sortieHttp, helpers) {
  const v = await valider(PDF, body);
  const corps = v.valid ? JSON.parse(resoudre(nd(PDF, 'Mistral OCR (Sync)').parameters.jsonBody, v)) : null;
  const sortie = await execCode(PDF, 'Normalize Mistral (Sync)', { json: sortieHttp }, { 'Validate Input': v }, helpers);
  const rep = nd(PDF, 'Respond (Sync)').parameters;
  const json = sortie.erreur ? sortie : JSON.parse(resoudre(rep.responseBody, sortie));
  const code = sortie.erreur ? null : resoudre(rep.options.responseCode, sortie);
  return { v, corps, sortie, json, code, mcp: lectureMcp(json) };
}
const pd = r => (((r || {}).json || {}).data || {}).page_details || [];

// ═══════════════════════════════════════════════════════════════════════════
async function hors_ligne() {
  await section('1. Structure', () => {
    for (const wf of [PDF, IMG]) {
      const W = wf.w;
      controle(`${wf.fichier} : JSON indenté à 2 espaces, UTF-8 non échappé`, [wf.brut.startsWith('{\n  "name"'), /\\u00e9/.test(wf.brut)], [true, false]);
      const noms = new Set(W.nodes.map(n => n.name));
      controle(`${wf.fichier} : noms uniques`, noms.size, W.nodes.length);
      controle(`${wf.fichier} : ids uniques`, new Set(W.nodes.map(n => n.id)).size, W.nodes.length);
      const orphelins = Object.entries(W.connections).flatMap(([src, c]) => [src, ...(c.main || []).flat().map(x => x.node)]).filter(n => !noms.has(n));
      controle(`${wf.fichier} : connexions vers des nœuds existants`, [...new Set(orphelins)], []);
      const nu = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, '``');
      for (const n of W.nodes.filter(x => x.parameters.jsCode)) {
        const src = nu(n.parameters.jsCode);
        controle(`${wf.fichier} › ${n.name} : ni require ni process, compile`,
          [/\brequire\s*\(/.test(src), /\bprocess\s*\./.test(src), (() => { try { new vm.Script(`(async function(){${n.parameters.jsCode}\n})`); return true; } catch (e) { return e.message; } })()],
          [false, false, true]);
      }
      const expressions = [];
      const parcourir = v => { if (typeof v === 'string') expressions.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(parcourir); };
      W.nodes.filter(n => !n.type.endsWith('stickyNote') && !n.parameters.jsCode).forEach(n => parcourir(n.parameters));
      controle(`${wf.fichier} : aucune expression ={{ … }} avec « }} » intérieur`, expressions.filter(v => v.startsWith('={{') && /\}\}[\s\S]*\}\}/.test(v)), []);
      controle(`${wf.fichier} : aucune expression {{ }} sans « = » initial`, expressions.filter(v => !v.startsWith('=') && v.includes('{{')), []);
    }
    const mistralHttp = [[PDF, 'Mistral OCR (Sync)'], [PDF, 'Mistral OCR (Async)'], [IMG, 'Mistral OCR']];
    for (const [wf, nom] of mistralHttp) {
      const n = nd(wf, nom);
      controle(`${nom} : fullResponse + neverError (statut 5xx lisible), onError conservé`,
        [((n.parameters.options || {}).response || {}).response, n.onError], [{ fullResponse: true, neverError: true }, 'continueRegularOutput']);
    }
    const bloc = (src, debut, fin) => { const a = (src || '').indexOf(debut); const b = (src || '').indexOf(fin); return a >= 0 && b > a ? src.slice(a, b) : null; };
    const D = ['// ── azy.daily#363 — détail par page', '// ── fin du bloc commun #363 ──'];
    const R = ['// ── azy.daily#363 — relance page par page', '// ── fin du bloc relance #363 ──'];
    const dS = bloc(nd(PDF, 'Normalize Mistral (Sync)').parameters.jsCode, ...D);
    controle('bloc « détail par page » présent', dS !== null, true);
    controle('bloc « détail par page » identique dans les 3 nœuds Mistral',
      [bloc(nd(PDF, 'Normalize Mistral (Async)').parameters.jsCode, ...D), bloc(nd(IMG, 'Format Response').parameters.jsCode, ...D)].map(b => b === dS), [true, true]);
    const rS = bloc(nd(PDF, 'Normalize Mistral (Sync)').parameters.jsCode, ...R);
    controle('bloc « relance » présent et identique dans les 2 normalisations PDF',
      [rS !== null, bloc(nd(PDF, 'Normalize Mistral (Async)').parameters.jsCode, ...R) === rS], [true, true]);
  });

  await section('2. Options de requête → corps envoyé à Mistral', async () => {
    const v = await valider(PDF, BASE);
    controle('sans option : extract_header_footer true, include_blocks false, table_format markdown',
      [v.valid, v.extractHeaderFooter, v.includeBlocks, v.tableFormat], [true, true, false, 'markdown']);
    const corps = b => JSON.parse(resoudre(nd(PDF, 'Mistral OCR (Sync)').parameters.jsonBody, b));
    controle('défaut : extract_header + extract_footer, ni table_format ni include_blocks, pas d\'images', corps(v), {
      model: 'mistral-ocr-latest', document: { type: 'document_url', document_url: BASE.file_url },
      include_image_base64: false, extract_header: true, extract_footer: true,
    });
    const avec = async o => valider(PDF, { ...BASE, ...o });
    const corpsSans = corps(await avec({ extract_header_footer: false }));
    controle('extract_header_footer: false → ni extract_header ni extract_footer', ['extract_header', 'extract_footer'].map(k => k in corpsSans), [false, false]);
    controle('extract_header_footer: "false" (champ de formulaire) → false', (await avec({ extract_header_footer: 'false' })).extractHeaderFooter, false);
    controle('include_blocks: true → include_blocks: true', corps(await avec({ include_blocks: true })).include_blocks, true);
    controle('table_format: "html" → table_format: "html"', corps(await avec({ table_format: 'html' })).table_format, 'html');
    controle('table_format: "markdown" → rien envoyé (mesuré : tableau inline par défaut)', 'table_format' in corps(await avec({ table_format: 'markdown' })), false);
    controle('options lues aussi dans context (RFC-014)', (await valider(PDF, { ...BASE, context: { include_blocks: true, table_format: 'html' } })).tableFormat, 'html');
    const tfFaux = await avec({ table_format: 'pdf' });
    controle('table_format inconnu → invalide, message explicite', [tfFaux.valid, /table_format/.test((tfFaux.errors || []).join())], [false, true]);
    const ehfFaux = await avec({ extract_header_footer: 'peut-être' });
    controle('extract_header_footer illisible → invalide', [ehfFaux.valid, /extract_header_footer/.test((ehfFaux.errors || []).join())], [false, true]);
    const err = await execCode(PDF, 'Build Error', { json: tfFaux });
    controle('entrée invalide → VALIDATION_ERROR 400', [err.error && err.error.code, err.error && err.error.http_status], ['VALIDATION_ERROR', 400]);
    const opts = await avec({ include_blocks: true, table_format: 'html' });
    controle('chemin async : même corps (lu dans Validate Input)',
      JSON.parse(resoudre(nd(PDF, 'Mistral OCR (Async)').parameters.jsonBody, { success: true }, { 'Validate Input': opts })), corps(opts));
    const vi = await valider(IMG, { image_url: 'https://img.test/page.png', mistral_api_key: CLE, include_blocks: true });
    controle('image-ocr : image_url + mêmes options par défaut',
      JSON.parse(resoudre(nd(IMG, 'Mistral OCR').parameters.jsonBody, vi)),
      { model: 'mistral-ocr-latest', document: { type: 'image_url', image_url: 'https://img.test/page.png' }, include_image_base64: false, extract_header: true, extract_footer: true, include_blocks: true });
  });

  await section('3. page_details toujours présent (Shoftim p. 2, options par défaut)', async () => {
    const r = await chaineSync({ ...BASE, extract_header_footer: true }, reponse(M.p2));
    controle('succès 200', [r.json.success, r.code], [true, 200]);
    controle('une entrée, clés exactes du contrat (sans blocks ni tables)', pd(r).map(p => Object.keys(p)),
      [['index', 'markdown', 'header', 'footer', 'page_width', 'page_height', 'dpi']]);
    const p = pd(r)[0] || {};
    controle('index 1 (Mistral compte depuis 0)', p.index, 1);
    controle('header et footer extraits', [p.header, p.footer], ['Aliyah 1\nKI TEITZEI ALIYAH 1 · ÉDITION BILINGUE', 'KI TEITZEI ALIYAH 1-ALIYAH 7\n2 / 21']);
    controle('dimensions de Mistral (mesurées : 721 × 1019, dpi 87)', [p.page_width, p.page_height, p.dpi], [721, 1019, 87]);
    controle('markdown de la page = markdown de Mistral, nettoyé', [p.markdown === M.p2.reponse.pages[0].markdown, /2 \/ 21|ÉDITION BILINGUE|^Aliyah 1$/m.test(p.markdown || 'x 2 / 21')], [true, false]);
    controle('data.text (document) nettoyé lui aussi', /2 \/ 21/.test(r.json.data.text), false);
    controle('warnings vide', r.json.data.warnings, []);
    controle('forme existante inchangée : pages[], page_count, usage', [r.json.data.pages, r.json.data.page_count, r.json.meta.usage],
      [[{ page: 1, markdown: M.p2.reponse.pages[0].markdown, has_images: true }], 1, { pages_processed: 1, doc_size_bytes: 308579 }]);
  });

  await section('4. extract_header_footer: false → ancien texte (Shoftim p. 2 sans option)', async () => {
    const r = await chaineSync({ ...BASE, extract_header_footer: false }, reponse(M.p2Sans));
    const p = pd(r)[0] || {};
    controle('header et footer null', [p.header, p.footer], [null, null]);
    controle('titres courants et « 2 / 21 » restent dans le markdown', [/2 \/ 21/.test(p.markdown), /ÉDITION BILINGUE/.test(p.markdown), /2 \/ 21/.test(r.json.data.text)], [true, true, true]);
  });

  await section('5. blocks', async () => {
    const sans = await chaineSync(BASE, reponse(M.p2));
    controle('sans include_blocks : pas de blocks, alors que Mistral en renvoie 11', ['blocks' in (pd(sans)[0] || {}), M.p2.reponse.pages[0].blocks.length], [false, 11]);
    const r = await chaineSync({ ...BASE, include_blocks: true }, reponse(M.p2));
    const b = (pd(r)[0] || {}).blocks || [];
    controle('types normalisés, header ×2 et footer ×2 exclus, ordre conservé', b.map(x => x.block_type), ['figure', 'title', 'paragraph', 'paragraph', 'paragraph', 'paragraph', 'paragraph']);
    controle('bloc titre = exemple du contrat (bbox deux coins → x, y, largeur, hauteur)', b[1],
      { block_type: 'title', text: '# Ki Teitzei', bbox: { x: 305, y: 171, width: 110, height: 26 }, confidence: null, table_html: null });
    controle('paragraphe = contenu de Mistral, confidence null', [b[2] && b[2].text === M.p2.reponse.pages[0].blocks[4].content, b[2] && b[2].confidence], [true, null]);
    controle('aucun bloc header/footer, clés exactes', [b.some(x => /header|footer/.test(x.block_type)), Object.keys(b[0] || {})], [false, ['block_type', 'text', 'bbox', 'confidence', 'table_html']]);
    const html = await chaineSync({ ...BASE, include_blocks: true, table_format: 'html' }, reponse(M.p12Html));
    const tb = ((pd(html)[0] || {}).blocks || []).find(x => x.block_type === 'table') || {};
    controle('table_format html : bloc table avec table_html = HTML du tableau', [/^<table>/.test(tb.table_html || ''), tb.table_html === M.p12Html.reponse.pages[0].tables[0].content, tb.bbox], [true, true, { x: 143, y: 322, width: 437, height: 245 }]);
    const md = await chaineSync({ ...BASE, include_blocks: true }, reponse(M.p1Tableau));
    const tm = ((pd(md)[0] || {}).blocks || []).find(x => x.block_type === 'table') || {};
    controle('tableau en markdown : table_html null (Mistral ne donne pas de HTML), texte = markdown', [tm.table_html, /^\|/.test(tm.text || '')], [null, true]);
    const tw = await chaineSync({ ...BASE, include_blocks: true, table_format: 'html' }, reponse(M.tw3));
    const bw = (pd(tw)[0] || {}).blocks || [];
    controle('Wellsprings p. 3 (deux colonnes) : 9 blocs, footers exclus, colonne gauche puis droite', [bw.length, bw.map(x => x.block_type).join(), bw.slice(3).map(x => x.bbox && x.bbox.x)],
      [9, 'figure,title,paragraph,paragraph,paragraph,paragraph,paragraph,paragraph,paragraph', [57, 58, 59, 333, 359, 359]]);
    const inconnu = JSON.parse(JSON.stringify(M.p2));
    inconnu.reponse.pages[0].blocks = [{ type: 'marginalia', content: 'note', top_left_x: 1 }, { type: 'equation', content: '$x$', top_left_x: 10, top_left_y: 20, bottom_right_x: 30, bottom_right_y: 25 }];
    const ri = await chaineSync({ ...BASE, include_blocks: true }, reponse(inconnu));
    controle('type inconnu gardé tel quel ; coins incomplets → bbox null ; equation → formula (bloc construit)',
      ((pd(ri)[0] || {}).blocks || []).map(x => [x.block_type, x.bbox]), [['marginalia', null], ['formula', { x: 10, y: 20, width: 20, height: 5 }]]);
  });

  await section('6. tables', async () => {
    const r = await chaineSync({ ...BASE, table_format: 'html' }, reponse(M.p12Html));
    const [p1, p2] = pd(r);
    controle('table_format html : tables[] de la page 1 (id sans « .html », comme le contrat)', (p1 || {}).tables,
      [{ id: 'tbl-0', format: 'html', content: M.p12Html.reponse.pages[0].tables[0].content }]);
    controle('lien [tbl-0.html](tbl-0.html) dans le markdown, tableau absent du texte', [/\[tbl-0\.html\]\(tbl-0\.html\)/.test((p1 || {}).markdown), /\| Aliyah/.test((p1 || {}).markdown)], [true, false]);
    controle('page 2 sans tableau : tables vide', (p2 || {}).tables, []);
    const sans = await chaineSync(BASE, reponse(M.p12Html));
    controle('sans table_format html : pas de tables, même si Mistral en rend', pd(sans).map(p => 'tables' in p), [false, false]);
    const md = await chaineSync(BASE, reponse(M.p1Tableau));
    controle('défaut (markdown) : tableau inline dans le markdown, pas de tables', [/\|  2 \| Aliyah 1  \|/.test((pd(md)[0] || {}).markdown), 'tables' in (pd(md)[0] || {})], [true, false]);
  });

  await section('7. Images jamais rendues', async () => {
    const r = await chaineSync({ ...BASE, include_blocks: true, table_format: 'html' }, reponse(M.p12Html));
    controle('corps : include_image_base64 false par défaut', r.corps.include_image_base64, false);
    controle('page_details sans images ni base64', /image_base64|"images"|data:image/.test(JSON.stringify(pd(r))), false);
    controle('data (texte, pages, détail) sans base64', /base64/.test(JSON.stringify(r.json.data)), false);
  });

  await section('8. Relance page par page (Shoftim p. 2-3 : la p. 3 fait tomber Mistral)', async () => {
    const f = fauxMistral(i => (i === 0 ? M.pages0 : i === 1 ? M.pages1 : M.horsLimite));
    const r = await chaineSync(BASE, reponse(M.doc500), f.helpers);
    controle('document rendu malgré le 500 : succès 200', [r.json.success, r.code], [true, 200]);
    controle('deux pages ; la page en échec est listée, vide', pd(r).map(p => [p.index, p.markdown === '' ? '' : 'texte', p.header, p.page_width]),
      [[1, 'texte', 'Aliyah 1\nKI TEITZEI ALIYAH 1 · ÉDITION BILINGUE', 721], [2, '', null, null]]);
    controle('warnings : PAGE_FAILED:2', r.json.data.warnings, ['PAGE_FAILED:2']);
    controle('usage.pages_processed = pages du document (2), page_count 2', [r.json.meta.usage.pages_processed, r.json.data.page_count], [2, 2]);
    controle('texte du document = la page lue', r.json.data.text.startsWith(M.pages0.reponse.pages[0].markdown), true);
    controle('appels : pages [0] à [3] en parallèle, puis un second essai de [1]', f.appels.map(a => a.body.pages), [[0], [1], [2], [3], [1]]);
    const a0 = f.appels[0] || {};
    controle('chaque appel : mêmes options + pages, POST /v1/ocr, statut lu sans exception',
      [a0.method, a0.url, a0.body && a0.body.extract_header, a0.body && a0.body.document, a0.returnFullResponse, a0.ignoreHttpStatusErrors, a0.json],
      ['POST', 'https://api.mistral.ai/v1/ocr', true, { type: 'document_url', document_url: BASE.file_url }, true, true, true]);
    controle('clé dans l\'en-tête des appels, absente de la réponse', [(a0.headers || {}).Authorization === `Bearer ${CLE}`, JSON.stringify(r.json).includes(CLE)], [true, false]);
    controle('MCP lit 2 pages, le détail et l\'avertissement', [r.mcp.pages, r.mcp.page_details && r.mcp.page_details.length, r.mcp.warnings], [2, 2, ['PAGE_FAILED:2']]);

    const opts = fauxMistral(i => (i === 0 ? M.pages0 : i === 1 ? M.pages1 : M.horsLimite));
    const ro = await chaineSync({ ...BASE, include_blocks: true, table_format: 'html' }, reponse(M.doc500), opts.helpers);
    controle('options respectées après relance ; page en échec : blocks et tables vides', pd(ro).map(p => [p.blocks.length, p.tables.length]), [[7, 0], [0, 0]]);

    const passager = fauxMistral((i, n) => (i === 0 ? M.pages0 : i === 1 ? (n === 0 ? M.pages1 : M.pages0) : M.horsLimite));
    const rp = await chaineSync(BASE, reponse(M.doc500), passager.helpers);
    controle('échec passager rattrapé au second essai : aucun avertissement', [rp.json.data.warnings, pd(rp).map(p => p.index)], [[], [1, 2]]);

    const auDela = fauxMistral((i, n) => (i === 0 ? M.pages0 : i === 1 ? M.pages1 : i === 2 ? (n === 0 ? M.pages1 : M.horsLimite) : M.horsLimite));
    const rd = await chaineSync(BASE, reponse(M.doc500), auDela.helpers);
    controle('échec passager au-delà de la fin : pas de page fantôme', [pd(rd).length, rd.json.data.warnings, rd.json.meta.usage.pages_processed], [2, ['PAGE_FAILED:2'], 2]);

    const panne = fauxMistral(() => M.pages1);
    const rpa = await chaineSync(BASE, reponse(M.doc500), panne.helpers);
    controle('panne (4 pages de suite en 500) : abandon, erreur 500 d\'origine', [rpa.json.success, rpa.code, rpa.json.error && rpa.json.error.code, rpa.json.error && rpa.json.error.message, panne.appels.length],
      [false, 500, 'OCR_API_ERROR', 'Service unavailable.', 4]);
    controle('panne : MCP voit un échec', rpa.mcp.echec, true);

    const r422 = await chaineSync(BASE, { statusCode: 422, body: { object: 'error', message: 'Invalid document', raw_status_code: 422 } });
    controle('4xx : pas de relance, statut relayé', [r422.json.success, r422.code, r422.sortie.erreur], [false, 422, undefined]);
    const rTr = await chaineSync(BASE, { error: { message: 'timeout of 300000ms exceeded', code: 'ECONNABORTED' } });
    controle('erreur de transport : pas de relance', [rTr.json.success, rTr.sortie.erreur], [false, undefined]);

    const va = await valider(PDF, { ...BASE, callback_url: 'https://api.test/rappel' });
    const fa = fauxMistral(i => (i === 0 ? M.pages0 : i === 1 ? M.pages1 : M.horsLimite));
    const sa = await execCode(PDF, 'Normalize Mistral (Async)', { json: reponse(M.doc500) }, { 'Validate Input': va }, fa.helpers);
    const cb = (sa.callbackBody || {}).data || {};
    controle('chemin async : même relance, même forme dans le rappel',
      [sa.callbackBody && sa.callbackBody.status, (cb.page_details || []).length, cb.warnings, sa.callbackBody && sa.callbackBody.meta.usage.pages_processed], ['completed', 2, ['PAGE_FAILED:2'], 2]);
  });

  await section('9. Forme lisible par MCP (lecture azy.mcp#834 transcrite)', async () => {
    const r = await chaineSync({ ...BASE, include_blocks: true, table_format: 'html' }, reponse(M.p12Html));
    controle('page_details et warnings posés dans data (pas au premier niveau)', [r.mcp.lu_dans, 'page_details' in r.json, 'warnings' in r.json], ['data', false, false]);
    controle('MCP : markdown = data.text, pages = 2, détail relayé tel quel', [r.mcp.markdown === r.json.data.text, r.mcp.pages, JSON.stringify(r.mcp.page_details) === JSON.stringify(r.json.data.page_details), r.mcp.warnings], [true, 2, true, []]);
  });

  await section('11. ⚠️ file_data (base64) atteint vraiment Mistral', async () => {
    // Mesuré le 17/09 : document_url n'acceptait que file_url ; avec file_data seul,
    // Mistral recevait un document vide → 422 « OCR_API_ERROR », panne silencieuse.
    // Mistral exige « data:<mime>;base64,… » (base64 nu → 422, document_base64 inconnu).
    const B64 = 'JVBERi0xLjQKJTEyMwo=';
    const doc = v => v.mistralRequest.document;
    const vNu = await valider(PDF, { file_data: B64, mistral_api_key: 'K' });
    controle('base64 nu → document_url en URI data:', doc(vNu).document_url, `data:application/pdf;base64,${B64}`);
    controle('… et fileData reste NU pour le chemin Google', vNu.fileData, B64);
    const vPrefixe = await valider(PDF, { file_data: `data:image/png;base64,${B64}`, mistral_api_key: 'K' });
    controle('préfixe data: déjà présent → mime conservé, base64 non dupliqué',
      [doc(vPrefixe).document_url, vPrefixe.fileData], [`data:image/png;base64,${B64}`, B64]);
    const vMime = await valider(PDF, { file_data: B64, mime_type: 'image/jpeg', mistral_api_key: 'K' });
    controle('mime_type de l’appelant utilisé', doc(vMime).document_url, `data:image/jpeg;base64,${B64}`);
    const vUrl = await valider(PDF, { file_url: 'https://b2.test/a.pdf', file_data: B64, mistral_api_key: 'K' });
    controle('file_url présent → il l’emporte', doc(vUrl).document_url, 'https://b2.test/a.pdf');
    const vRien = await valider(PDF, { mistral_api_key: 'K' });
    controle('ni file_url ni file_data → erreur de validation', [vRien.valid, vRien.errors.some(e => /file_url ou file_data/.test(e))], [false, true]);
    const vEspaces = await valider(PDF, { file_data: `${B64.slice(0, 8)}\n ${B64.slice(8)}`, mistral_api_key: 'K' });
    controle('sauts de ligne du base64 retirés', doc(vEspaces).document_url, `data:application/pdf;base64,${B64}`);
  });

  await section('12. ⚠️ provider « mistralai » (code catalogue chat.api) accepté', async () => {
    // Panne du 18/09 : chat.api envoie le code catalogue « mistralai » depuis le 21/07
    // (chat.api#2743) et MCP en dérive le nom de la clé (`mistralai_api_key`). La version
    // qui tournait l'acceptait ; le réimport a appliqué la validation stricte de git.
    // Vérifié sur l'exécution n8n 918562 du 17/09 08:20 : provider « mistralai », valid: true.
    const vAlias = await valider(PDF, { file_url: 'https://b2.test/a.pdf', provider: 'mistralai', mistralai_api_key: 'K' });
    controle('provider mistralai + mistralai_api_key → valide, ramené à mistral',
      [vAlias.valid, vAlias.provider, !!vAlias.mistralApiKey], [true, 'mistral', true]);
    const vCasse = await valider(PDF, { file_url: 'https://b2.test/a.pdf', provider: '  MistralAI ', mistral_api_key: 'K' });
    controle('casse et espaces tolérés', [vCasse.valid, vCasse.provider], [true, 'mistral']);
    const vPc = await valider(PDF, { file_url: 'https://b2.test/a.pdf', provider: 'mistralai', plugin_context: { api_keys: { mistralai: 'K' } } });
    controle('clé sous plugin_context.api_keys.mistralai → acceptée', vPc.valid, true);
    const vHistorique = await valider(PDF, { file_url: 'https://b2.test/a.pdf', provider: 'mistral', mistral_api_key: 'K' });
    controle('le vocabulaire historique marche toujours', [vHistorique.valid, vHistorique.provider], [true, 'mistral']);
    const vSansCle = await valider(PDF, { file_url: 'https://b2.test/a.pdf', provider: 'mistralai' });
    controle('mistralai sans aucune clé → toujours refusé', [vSansCle.valid, vSansCle.errors.some(e => /mistral_api_key/.test(e))], [false, true]);
    const vInconnu = await valider(PDF, { file_url: 'https://b2.test/a.pdf', provider: 'anthropic', mistral_api_key: 'K' });
    controle('provider inconnu → toujours 400', [vInconnu.valid, vInconnu.errors.some(e => /Invalid provider/.test(e))], [false, true]);
    const vGoogle = await valider(PDF, { file_url: 'gs://seau/a.pdf', provider: 'googleai', googleai_api_key: 'K' });
    controle('alias googleai → google, clé googleai_api_key lue', [vGoogle.valid, vGoogle.provider], [true, 'google']);
    const vImg = await valider(IMG, { image_url: 'https://b2.test/a.png', mistralai_api_key: 'K' });
    controle('image-ocr : clé sous mistralai_api_key → acceptée', vImg.valid, true);
  });

  await section('10. image-ocr rend la même forme', async () => {
    const v = await valider(IMG, { image_url: 'https://img.test/page.png', mistral_api_key: CLE, include_blocks: true, table_format: 'html' });
    const s = await execCode(IMG, 'Format Response', { json: reponse(M.p12Html) }, { 'Validate Input': v });
    const d = s.data || {};
    controle('succès, page_details (index, header/footer, blocks, tables), warnings vide',
      [s.success, (d.page_details || []).map(p => [p.index, p.footer, p.blocks.length, p.tables.length]), d.warnings],
      [true, [[1, 'KI TEITZEI ALIYAH 1-ALIYAH 7\n1 / 21', 4, 1], [2, 'KI TEITZEI ALIYAH 1-ALIYAH 7\n2 / 21', 7, 0]], []]);
    controle('data.pages (Mistral brut) inchangé', JSON.stringify(d.pages) === JSON.stringify(M.p12Html.reponse.pages), true);
    const vd = await valider(IMG, { image_base64: 'iVBORw0KGgo=', mistral_api_key: CLE });
    const sd = await execCode(IMG, 'Format Response', { json: reponse(M.p2) }, { 'Validate Input': vd });
    controle('défaut : ni blocks ni tables', Object.keys((sd.data.page_details || [])[0] || {}), ['index', 'markdown', 'header', 'footer', 'page_width', 'page_height', 'dpi']);
    controle('MCP lirait la même forme', lectureMcp(sd).lu_dans, 'data');
    const se = await execCode(IMG, 'Format Response', { json: reponse(M.doc500) }, { 'Validate Input': vd });
    controle('500 sur une image : erreur relayée, pas de relance', [se.success, se.error && se.error.http_status], [false, 500]);
  });

  await section('11. Chemin Google Vision (réponse CONSTRUITE d\'après la doc Vision, non mesurée)', async () => {
    const v = await valider(PDF, { ...BASE, provider: 'google', google_api_key: 'g', file_data: 'iVBORw0KGgo=', include_blocks: true });
    const vision = { statusCode: 200, body: { responses: [{ fullTextAnnotation: { text: 'Bonjour\nle monde', pages: [{ width: 800, height: 600, property: {} }] } }] } };
    const s = await execCode(PDF, 'Normalize Google (Sync)', { json: vision }, { 'Validate Input': v });
    controle('page_details : index, markdown, header/footer null, dimensions Vision, sans blocks',
      [(s.data || {}).page_details, (s.data || {}).warnings],
      [[{ index: 1, markdown: 'Bonjour\nle monde', header: null, footer: null, page_width: 800, page_height: 600, dpi: null }], []]);
    const sa = await execCode(PDF, 'Normalize Google (Async)', { json: vision }, { 'Validate Input': v });
    controle('async : même détail', JSON.stringify((((sa.callbackBody || {}).data) || {}).page_details) === JSON.stringify((s.data || {}).page_details), true);
  });

  await section('12. Documentation', () => {
    const doc = nd(PDF, 'Documentation').parameters.content || '';
    controle('pdf-ocr : options, page_details, warnings, PAGE_FAILED documentés',
      ['extract_header_footer', 'include_blocks', 'table_format', 'page_details', 'warnings', 'PAGE_FAILED', '#363'].filter(m => !doc.includes(m)), []);
    const di = nd(IMG, 'Documentation').parameters.content || '';
    controle('image-ocr : options et page_details documentés', ['extract_header_footer', 'include_blocks', 'table_format', 'page_details', '#363'].filter(m => !di.includes(m)), []);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
async function en_ligne() {
  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) { console.log('\n❌ MISTRAL_API_KEY absente'); total++; echecs.push('clé'); return; }
  const docs = process.env.OCR_363_DOCS || path.join(RACINE, 'docs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr363-'));
  const shoftim = path.join(docs, 'Shoftim_Aliyah1-Aliyah7.pdf');
  for (const p of [1, 2, 3]) execFileSync('pdfseparate', ['-f', String(p), '-l', String(p), shoftim, path.join(tmp, 'sh-%d.pdf')]);
  execFileSync('pdfunite', [path.join(tmp, 'sh-1.pdf'), path.join(tmp, 'sh-2.pdf'), path.join(tmp, 'sh12.pdf')]);
  execFileSync('pdfunite', [path.join(tmp, 'sh-2.pdf'), path.join(tmp, 'sh-3.pdf'), path.join(tmp, 'sh23.pdf')]);
  const dataUri = f => 'data:application/pdf;base64,' + fs.readFileSync(path.join(tmp, f)).toString('base64');
  const masquer = s => String(s).split(cle).join('***');
  let appels = 0;
  const helpers = {
    httpRequest: async o => {
      appels++;
      const r = await fetch(o.url, { method: o.method, headers: o.headers, body: JSON.stringify(o.body) });
      const t = await r.text();
      let b; try { b = JSON.parse(t); } catch (e) { b = t; }
      return { statusCode: r.status, body: b };
    },
  };
  /** Le nœud HTTP Request (fullResponse + neverError), puis la normalisation réelle. */
  async function essai(fichier, options) {
    const v = await valider(PDF, { ...BASE, file_url: dataUri(fichier), mistral_api_key: cle, ...options });
    const corps = resoudre(nd(PDF, 'Mistral OCR (Sync)').parameters.jsonBody, v);
    appels++;
    const r = await fetch('https://api.mistral.ai/v1/ocr', { method: 'POST', headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' }, body: corps });
    const http = { statusCode: r.status, headers: { 'mistral-correlation-id': r.headers.get('mistral-correlation-id') }, body: JSON.parse(await r.text()) };
    const sortie = await execCode(PDF, 'Normalize Mistral (Sync)', { json: http }, { 'Validate Input': v }, helpers);
    const json = JSON.parse(resoudre(nd(PDF, 'Respond (Sync)').parameters.responseBody, sortie));
    return { premier_statut: r.status, correlation: http.headers['mistral-correlation-id'], json };
  }
  const court = d => JSON.stringify(d, (k, v) => (typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '…' : v));

  console.log('\nEn ligne — Mistral réel, pages extraites');
  const a = await essai('sh-2.pdf', { extract_header_footer: true });
  console.log(`     p. 2 défaut (${a.premier_statut}) : ${masquer(court(a.json.data.page_details))}`);
  const pa = a.json.data.page_details[0];
  controle('en ligne — p. 2 défaut : header/footer extraits, markdown nettoyé', [a.json.success, /2 \/ 21/.test(pa.footer), /2 \/ 21/.test(pa.markdown), 'blocks' in pa], [true, true, false, false]);
  const b = await essai('sh12.pdf', { extract_header_footer: true, include_blocks: true, table_format: 'html' });
  const pb = b.json.data.page_details[0];
  console.log(`     p. 1-2 blocs + html (${b.premier_statut}) : ${masquer(court(pb))}`);
  controle('en ligne — p. 1 : tbl-0 dans tables, lien dans le markdown, bloc table en HTML, pas de header/footer en bloc',
    [pb.tables[0] && pb.tables[0].id, /\[tbl-0\.html\]/.test(pb.markdown), /^<table>/.test((pb.blocks.find(x => x.block_type === 'table') || {}).table_html || ''), pb.blocks.some(x => /header|footer/.test(x.block_type))],
    ['tbl-0', true, true, false]);
  const c = await essai('sh23.pdf', { extract_header_footer: true });
  console.log(`     p. 2-3 (${c.premier_statut}, ${c.correlation}) → relance : warnings ${JSON.stringify(c.json.data.warnings)}, usage ${JSON.stringify(c.json.meta.usage)}, ${JSON.stringify(c.json._trace.service_response.relance_page_par_page)}`);
  controle('en ligne — p. 2-3 : 500 puis relance, document rendu, PAGE_FAILED:2, 2 pages facturées',
    [c.premier_statut, c.json.success, c.json.data.warnings, c.json.meta.usage.pages_processed, c.json.data.page_details[0].markdown.length > 100],
    [500, true, ['PAGE_FAILED:2'], 2, true]);
  controle('en ligne — clé absente des sorties', [a, b, c].some(x => JSON.stringify(x).includes(cle)), false);
  console.log(`     ${appels} appels Mistral`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

(async () => {
  await hors_ligne();
  if (process.argv.includes('--en-ligne')) await en_ligne();
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length}/${total} contrôle(s) en échec`); process.exit(1); }
  console.log(`✅ tous les contrôles passent  (${total}/${total})`);
})();
