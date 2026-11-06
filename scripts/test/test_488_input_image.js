#!/usr/bin/env node
/**
 * OCR : l'avertissement `INPUT_IMAGE` et le repère des `bbox` — azy.daily#488.
 *
 *     node scripts/test/test_488_input_image.js
 *
 * Deux engagements pris devant l'équipe desktop le 2026-10-02 / 10-05, tenus ici.
 *
 * 1 · `INPUT_IMAGE` — l'avertissement qui voyage avec le résultat
 * ---------------------------------------------------------------
 * Position de desktop, retenue : « un avertissement qui voyage avec le résultat survit à
 * nos deux chaînes, là où une détection côté client se perd au premier refactor ».
 *
 * Ce qu'il dit : l'entrée est une image, donc **aucune couche texte ne peut exister**.
 * Ce qu'il ne dit pas : qu'un PDF a ou n'a pas de couche texte — nous ne la testons pas.
 * Le test vérifie donc aussi l'ABSENCE de l'avertissement sur un PDF : un avertissement
 * qui s'allume tout le temps ne renseigne sur rien.
 *
 * 2 · Le repère des `bbox` — un contrat qui n'existait que dans une mesure
 * ------------------------------------------------------------------------
 * Une `bbox` est dans le repère des `page_width`/`page_height` du MÊME objet, celui de la
 * rastérisation que Mistral fait à ~87 dpi. Croiser ces blocs avec un rendu client à
 * 144 dpi (facteur 1,654) **a supprimé le titre principal d'un markdown**, sans aucun
 * signal : le fichier restait plausible.
 *
 * Un commentaire ne s'exécute pas, donc il ne se teste pas par le comportement. Mais il
 * peut disparaître à la première réécriture du nœud, et le contrat disparaîtrait avec lui.
 * Ces contrôles exigent sa présence dans LES TROIS nœuds qui produisent la donnée — c'est
 * un bloc dupliqué, et une documentation présente dans deux copies sur trois est pire
 * qu'absente : elle laisse croire qu'on l'a lue.
 *
 * Le test exécute le JavaScript extrait du JSON des workflows : c'est le code importé qui
 * est testé, pas une copie.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const charger = f => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const PDF = charger('MCP_-_PDF_OCR.json');
const IMG = charger('MCP_-_Image_OCR.json');
const nd = (wf, nom) => wf.nodes.find(x => x.name === nom) || { parameters: {} };
const code = (wf, nom) => nd(wf, nom).parameters.jsCode || '';

const echecs = [];
let total = 0;
function controle(libelle, obtenu, attendu) {
  total++;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(72)} ${vu && vu.length > 42 ? vu.slice(0, 42) + '…' : vu}`
    + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}
async function section(titre, fn) {
  console.log(`\n${titre}`);
  try { await fn(); } catch (e) { total++; echecs.push(titre); console.log(`  ❌ la section a levé : ${e.stack}`); }
}

async function execCode(wf, nom, item, prev = {}, reponseHttp) {
  const src = code(wf, nom);
  if (!src) return { erreur: `nœud ${nom} absent` };
  try {
    const fn = vm.runInNewContext(`(async function(){${src}\n})`, {
      $input: { first: () => item, all: () => [item] },
      $: n => ({ first: () => ({ json: prev[n] }) }),
      // Fourni par le Code node réel de n8n (mesuré) mais pas par un contexte vm neuf.
      Buffer, console,
    }, { timeout: 5000 });
    return await fn.call({
      helpers: {
        httpRequest: async () => {
          if (reponseHttp) return reponseHttp;
          throw new Error('helpers.httpRequest appelé sans être attendu');
        },
      },
    });
  } catch (e) {
    return { erreur: `${nom} a levé ${e.message}` };
  }
}
const valider = (wf, body) => execCode(wf, 'Validate Input', { json: { body, headers: {}, query: {} } });

const CLE = 'sk-test';
// Un vrai PNG : signature 89 50 4E 47. La déduction de mime lit les octets ; un base64
// bidon serait refusé avant d'arriver à l'avertissement.
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13]).toString('base64');
const PDF_B64 = Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1').toString('base64');

/** Réponse Mistral minimale, avec une page portant des dimensions et un bloc. */
const REPONSE_MISTRAL = {
  statusCode: 200,
  body: {
    model: 'mistral-ocr-latest',
    pages: [{
      index: 0,
      markdown: '# Titre',
      dimensions: { width: 720, height: 1018, dpi: 87 },
      blocks: [{ type: 'text', content: 'Titre', top_left_x: 10, top_left_y: 20, bottom_right_x: 110, bottom_right_y: 70 }],
      images: [], tables: [],
    }],
    usage_info: { pages_processed: 1, doc_size_bytes: 1234 },
  },
};

(async () => {
  // ─────────────────────────────────────────────────────────────────────────
  await section('PDF OCR — l\'avertissement est calculé à la validation', async () => {
    const parUrl = await valider(PDF, { file_url: 'https://b2.test/scan.png', mistral_api_key: CLE });
    controle('file_url en .png → INPUT_IMAGE', parUrl.avertissementsEntree, ['INPUT_IMAGE']);

    const majuscules = await valider(PDF, { file_url: 'https://b2.test/SCAN.JPEG', mistral_api_key: CLE });
    controle('extension insensible à la casse', majuscules.avertissementsEntree, ['INPUT_IMAGE']);

    const avecQuery = await valider(PDF, { file_url: 'https://b2.test/a.jpg?sig=abc&x=1', mistral_api_key: CLE });
    controle('extension suivie d\'une chaîne de requête', avecQuery.avertissementsEntree, ['INPUT_IMAGE']);

    const mime = await valider(PDF, { file_data: PNG, mistral_api_key: CLE });
    controle('base64 PNG sans mime_type → déduit, puis averti', mime.avertissementsEntree, ['INPUT_IMAGE']);

    const mimeDonne = await valider(PDF, { file_data: PNG, mime_type: 'image/png', mistral_api_key: CLE });
    controle('mime_type fourni par le client', mimeDonne.avertissementsEntree, ['INPUT_IMAGE']);
  });

  // ─────────────────────────────────────────────────────────────────────────
  await section('…et il ne s\'allume PAS sur un PDF — sinon il ne dirait rien', async () => {
    const pdfUrl = await valider(PDF, { file_url: 'https://b2.test/page.pdf', mistral_api_key: CLE });
    controle('file_url en .pdf → aucun avertissement', pdfUrl.avertissementsEntree, []);

    const pdfData = await valider(PDF, { file_data: PDF_B64, mistral_api_key: CLE });
    controle('base64 %PDF → aucun avertissement', pdfData.avertissementsEntree, []);

    // ⚠️ Le mime PRIME sur l'extension : une URL sans extension parlante, ou trompeuse,
    // ne doit pas contredire un type explicite.
    const mimeContreUrl = await valider(PDF,
      { file_url: 'https://b2.test/scan.png', mime_type: 'application/pdf', mistral_api_key: CLE });
    controle('mime_type application/pdf l\'emporte sur une URL .png', mimeContreUrl.avertissementsEntree, []);

    const sansIndice = await valider(PDF, { file_url: 'https://b2.test/download?id=42', mistral_api_key: CLE });
    controle('URL sans extension → on ne devine pas', sansIndice.avertissementsEntree, []);
  });

  // ─────────────────────────────────────────────────────────────────────────
  await section('L\'avertissement arrive VRAIMENT dans data.warnings', async () => {
    const v = await valider(PDF, { file_url: 'https://b2.test/scan.png', mistral_api_key: CLE });
    const r = await execCode(PDF, 'Normalize Mistral (Sync)',
      { json: REPONSE_MISTRAL }, { 'Validate Input': v });
    controle('Normalize Mistral (Sync) le reporte', (r.data || {}).warnings, ['INPUT_IMAGE']);

    // ⚠️ Le chemin async n'a PAS la même forme de sortie : il enveloppe tout dans
    // `callbackBody`, qui part en POST vers callback_url. Lire `.data` directement y
    // rendrait `undefined` — et un test qui lit au mauvais endroit « passe » dès qu'on
    // compare à undefined. Les deux accesseurs sont donc écrits séparément, exprès.
    const ra = await execCode(PDF, 'Normalize Mistral (Async)',
      { json: REPONSE_MISTRAL }, { 'Validate Input': v });
    controle('Normalize Mistral (Async) idem, dans callbackBody',
      ((ra.callbackBody || {}).data || {}).warnings, ['INPUT_IMAGE']);
    controle('le chemin async enveloppe bien dans callbackBody',
      typeof ra.callbackBody, 'object');

    const vPdf = await valider(PDF, { file_url: 'https://b2.test/page.pdf', mistral_api_key: CLE });
    const rPdf = await execCode(PDF, 'Normalize Mistral (Sync)',
      { json: REPONSE_MISTRAL }, { 'Validate Input': vPdf });
    controle('un PDF ressort sans avertissement', (rPdf.data || {}).warnings, []);
  });

  // ─────────────────────────────────────────────────────────────────────────
  await section('Chemin image — inconditionnel, et c\'est voulu', async () => {
    controle('Format Response pose INPUT_IMAGE en dur',
      /warnings: \['INPUT_IMAGE'\]/.test(code(IMG, 'Format Response')), true);
    // Ce webhook n'accepte que des images : la condition serait toujours vraie.
    controle('aucune condition inutile autour',
      /entreeEstImage/.test(code(IMG, 'Format Response')), false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  await section('Non-régression structurelle de l\'avertissement', async () => {
    // Le défaut de #488 était une ASYMÉTRIE entre les deux chemins, invisible depuis
    // l'aval. On exige donc la même source dans les quatre normalisations PDF.
    for (const nom of ['Normalize Mistral (Sync)', 'Normalize Mistral (Async)',
                       'Normalize Google (Sync)', 'Normalize Google (Async)']) {
      controle(`${nom} lit avertissementsEntree`,
        /avertissementsEntree/.test(code(PDF, nom)), true);
    }
    // Et la relance page par page ne doit pas ÉCRASER l'avertissement d'entrée.
    for (const nom of ['Normalize Mistral (Sync)', 'Normalize Mistral (Async)']) {
      controle(`${nom} concatène, n'écrase pas`,
        /warnings = warnings\.concat\(relance\.warnings\)/.test(code(PDF, nom)), true);
      controle(`${nom} — plus aucune affectation nue`,
        /warnings = relance\.warnings;/.test(code(PDF, nom)), false);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  await section('Le repère des bbox est documenté là où la donnée est produite', async () => {
    // Les trois nœuds portent le bloc commun #363 qui produit page_details[] et bbox.
    const porteurs = [
      ['MCP - PDF OCR / Normalize Mistral (Sync)', code(PDF, 'Normalize Mistral (Sync)')],
      ['MCP - PDF OCR / Normalize Mistral (Async)', code(PDF, 'Normalize Mistral (Async)')],
      ['MCP - Image OCR / Format Response', code(IMG, 'Format Response')],
    ];
    for (const [nom, src] of porteurs) {
      controle(`${nom} — repère documenté`, /LE REPÈRE DES bbox/.test(src), true);
      // Les deux chiffres sont ce qui rend la mise en garde vérifiable plutôt que vague.
      controle(`${nom} — les dimensions mesurées y sont`,
        /720 × 1018/.test(src) && /1191 × 1684/.test(src), true);
      controle(`${nom} — la conséquence constatée y est`,
        /disparaît purement du markdown/.test(src), true);
    }
    // Un bloc dupliqué doit l'être à l'identique : une variante serait une divergence
    // de contrat selon le fournisseur appelé.
    const extrait = src => (src.match(/⚠️⚠️ LE REPÈRE DES bbox[\s\S]*?contrat qui manquait\./) || [''])[0];
    const ref = extrait(porteurs[0][1]);
    controle('le bloc est non vide', ref.length > 400, true);
    controle('identique dans les trois nœuds',
      porteurs.every(([, src]) => extrait(src) === ref), true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  await section('…et la bbox produite est bien dans ce repère', async () => {
    const v = await valider(PDF, { file_url: 'https://b2.test/page.pdf', mistral_api_key: CLE, include_blocks: true });
    const r = await execCode(PDF, 'Normalize Mistral (Sync)', { json: REPONSE_MISTRAL }, { 'Validate Input': v });
    const page = ((r.data || {}).page_details || [])[0] || {};
    controle('page_width vient des dimensions de la réponse', page.page_width, 720);
    controle('page_height idem', page.page_height, 1018);
    controle('dpi idem', page.dpi, 87);
    const b = (page.blocks || [])[0] || {};
    // Deux coins → { x, y, width, height }, en pixels de CE repère.
    controle('bbox convertie en x/y/width/height', b.bbox, { x: 10, y: 20, width: 100, height: 50 });
  });

  console.log(`\nRésultat : ${total - echecs.length} ok, ${echecs.length} échec(s)`);
  if (echecs.length) { echecs.forEach(e => console.log(`  - ${e}`)); process.exit(1); }
})();
