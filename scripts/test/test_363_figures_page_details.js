#!/usr/bin/env node
/**
 * OCR — figures dans page_details[].images (azy.daily#363, décision PO du 21/09)
 *
 * « Ce que n8n renvoie, chat.api le rend, toujours. » chat.api stocke les figures et
 * réécrit les liens du markdown (`](img-0.jpeg)` → `](url signée)`) dès que
 * `page_details[i].images[]` arrive. Le champ n'existait pas : les figures mouraient chez nous.
 *
 * Deux choses, mesurées le 2026-09-23 sur le webhook `pdf-ocr` :
 *   1. Mistral rend `pages[].images[] = {id, top_left_x, top_left_y, bottom_right_x,
 *      bottom_right_y, image_base64 (data-URL), image_annotation}` → relayé VERBATIM ;
 *   2. `include_image_base64` suivait l'option `include_images` de l'appelant, que la route
 *      /api/ocr/extract REFUSE (422, extra="forbid"). Sans défaut à true, images[] serait
 *      toujours vide par la chaîne api — le champ aurait été livré et inutile.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', '..', 'workflows');

let ok = 0;
let ko = 0;

function verifier(intitule, condition, detail) {
  if (condition) {
    ok += 1;
    console.log(`  ✓ ${intitule}`);
  } else {
    ko += 1;
    console.log(`  ✗ ${intitule}${detail ? `\n      ${detail}` : ''}`);
  }
}

const charger = (f) => JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));
const noeud = (w, nom) => w.nodes.find((n) => n.name === nom);

/** La figure telle que Mistral la rend — relevée sur une sonde réelle du 23/09. */
const FIGURE_MISTRAL = {
  id: 'img-0.jpeg',
  top_left_x: 68,
  top_left_y: 71,
  bottom_right_x: 930,
  bottom_right_y: 693,
  image_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGB',
  image_annotation: null,
};

/** Exécute `detailPage363` extrait d'un nœud, sur une page Mistral. */
function detailDe(code, page, options = { includeBlocks: false, tableFormat: 'markdown' }) {
  const debut = code.indexOf('const TYPES_BLOCS_363');
  // Dans pdf-ocr, detailPage363 appelle languesDetectees363, défini dans le bloc détection
  // qui vient APRÈS statutHttp363 : on va jusqu'à sa fin, sinon ReferenceError.
  const marqueur = '// ── fin du bloc détection #363 ──';
  const fin = code.includes(marqueur)
    ? code.indexOf(marqueur) + marqueur.length
    : code.indexOf('// Statut HTTP');
  const bloc = code.slice(debut, fin);
  const ctx = vm.createContext({ console });
  vm.runInContext(`${bloc}\nthis.detail = detailPage363;`, ctx);
  return ctx.detail(page, 0, options);
}

console.log('\nOCR — figures dans page_details[].images\n');

for (const [fichier, noeuds] of [
  ['MCP_-_PDF_OCR.json', ['Normalize Mistral (Sync)', 'Normalize Mistral (Async)']],
  ['MCP_-_Image_OCR.json', ['Format Response']],
]) {
  const w = charger(fichier);
  console.log(fichier);

  for (const nom of noeuds) {
    const code = noeud(w, nom).parameters.jsCode;
    const avec = detailDe(code, { index: 0, markdown: '![img-0.jpeg](img-0.jpeg)', images: [FIGURE_MISTRAL] });
    const sans = detailDe(code, { index: 0, markdown: 'du texte' });

    verifier(`${nom} : la figure est relayée VERBATIM, champ par champ`,
      JSON.stringify(avec.images) === JSON.stringify([FIGURE_MISTRAL]),
      JSON.stringify(avec.images));
    verifier(`${nom} : page sans figure → [] (le champ ne manque jamais)`,
      Array.isArray(sans.images) && sans.images.length === 0, JSON.stringify(sans.images));
    verifier(`${nom} : images non tableau → [] plutôt qu'une exception`,
      JSON.stringify(detailDe(code, { index: 0, images: 'cassé' }).images) === '[]');
    verifier(`${nom} : le reste de la page est intact`,
      avec.index === 1 && avec.markdown === '![img-0.jpeg](img-0.jpeg)' && 'dpi' in avec,
      JSON.stringify(Object.keys(avec)));
  }

  // Le défaut : sans lui, le champ serait livré et vide par la chaîne api.
  const validate = noeud(w, 'Validate Input').parameters.jsCode;
  verifier(`${fichier} : include_images vaut true par défaut`,
    /include_images\s*\?\?\s*ctx\.include_images\s*\?\?\s*true/.test(validate),
    'attendu `??` et non `||` : un false explicite doit rester respecté');
  verifier(`${fichier} : plus de repli sur false`,
    !/include_images\s*\|\|\s*ctx\.include_images\s*\|\|\s*false/.test(validate));
  console.log('');
}

console.log('La trace ne transporte pas les figures une seconde fois');
// Mesuré le 23/09 : 203 Ko de réponse pour un PDF d'une page à une figure, dont la MOITIÉ en
// base64 dupliqué dans _trace.service_response. MCP ne lit pas _trace : trajet doublé pour rien.
{
  const code = noeud(charger('MCP_-_PDF_OCR.json'), 'Normalize Mistral (Sync)').parameters.jsCode;
  const reponse = {
    statusCode: 200,
    body: { model: 'mistral-ocr-latest', usage_info: { pages_processed: 1, doc_size_bytes: 10 },
      pages: [{ index: 0, markdown: '![img-0.jpeg](img-0.jpeg)', images: [FIGURE_MISTRAL] }] },
  };
  const ctx = vm.createContext({
    $input: { first: () => ({ json: reponse }) },
    $: () => ({ first: () => ({ json: { startTime: Date.now(), includeBlocks: false, tableFormat: 'markdown' } }) }),
    console,
  });
  vm.runInContext(`this.executer = (async function () {\n${code}\n});`, ctx);
  module.exports.__attente = ctx.executer.call({ helpers: {} }).then((sortie) => {
    const traceImg = sortie._trace.service_response.pages[0].images[0];
    verifier('_trace : le base64 est remplacé par sa taille',
      /^<base64 retiré: \d+ octets>$/.test(traceImg.image_base64), traceImg.image_base64);
    verifier('_trace : le reste de la figure est conservé (id, coins)',
      traceImg.id === FIGURE_MISTRAL.id && traceImg.top_left_x === 68);
    verifier('data : le vrai base64 est intact, lui',
      sortie.data.page_details[0].images[0].image_base64 === FIGURE_MISTRAL.image_base64);
  });
}

console.log('Branche Google (Vision ne rend pas de figures)');
const pdf = charger('MCP_-_PDF_OCR.json');
for (const nom of ['Normalize Google (Sync)', 'Normalize Google (Async)']) {
  verifier(`${nom} : images présent et vide, pour une forme unique entre fournisseurs`,
    /images:\s*\[\]/.test(noeud(pdf, nom).parameters.jsCode));
}

console.log('\nCohérence entre les deux nœuds PDF');
const [s, a] = ['Normalize Mistral (Sync)', 'Normalize Mistral (Async)']
  .map((n) => noeud(pdf, n).parameters.jsCode)
  .map((c) => c.slice(c.indexOf('function detailPage363'), c.indexOf('// Statut HTTP')));
verifier('sync et async construisent la page de façon identique', s === a);

module.exports.__attente.then(() => {
  console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
  process.exit(ko === 0 ? 0 : 1);
});
