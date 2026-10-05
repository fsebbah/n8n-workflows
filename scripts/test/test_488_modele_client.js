#!/usr/bin/env node
/**
 * OCR : le modèle demandé par l'appelant est respecté sur les DEUX chemins — azy.daily#488.
 *
 *     node scripts/test/test_488_modele_client.js
 *
 * Ce que le test protège
 * ----------------------
 * Règle posée le 2026-10-05 : **on prend toujours ce qu'envoie le client.**
 *
 * `MCP - PDF OCR` l'appliquait (`body.model || ctx.model || défaut`). `MCP - Image OCR`
 * écrivait `model: 'mistral-ocr-latest'` **en dur** dans le corps Mistral : un `model`
 * envoyé par l'appelant y était silencieusement ignoré. chat.api épinglant
 * `mistral-ocr-4-1`, le pin prenait effet sur un PDF et pas sur une image, sans que rien
 * ne le signale.
 *
 *  1. body.model respecté, sur les deux workflows ;
 *  2. context.model respecté (RFC-014), sur les deux ;
 *  3. body.model l'emporte sur context.model ;
 *  4. sans model, le défaut du workflow s'applique ;
 *  5. la valeur atterrit dans `mistralRequest.model`, le corps RÉELLEMENT envoyé à Mistral
 *     (même endroit dans les deux workflows), pas seulement dans une variable intermédiaire ;
 *  6. le modèle demandé est reporté dans la réponse même si Mistral ne le renvoie pas ;
 *  7. non-régression structurelle : plus aucun littéral de modèle dans le corps Mistral,
 *     et les deux workflows portent la MÊME expression — c'est l'asymétrie qui était le défaut.
 *
 * Le test exécute le JavaScript extrait du JSON des workflows : c'est le code importé
 * qui est testé, pas une copie.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
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
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(74)} ${vu && vu.length > 40 ? vu.slice(0, 40) + '…' : vu}`
    + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}
async function section(titre, fn) {
  console.log(`\n${titre}`);
  try { await fn(); } catch (e) { total++; echecs.push(titre); console.log(`  ❌ la section a levé : ${e.stack}`); }
}

async function execCode(wf, nom, item, prev = {}) {
  const src = nd(wf, nom).parameters.jsCode;
  if (typeof src !== 'string') return { erreur: `nœud ${nom} absent` };
  const items = [item];
  try {
    const fn = vm.runInNewContext(`(async function(){${src}\n})`, {
      $input: { first: () => items[0], all: () => items },
      $: n => ({ first: () => ({ json: prev[n] }) }),
      // Fourni par le Code node réel de n8n (mesuré) mais pas par un contexte vm neuf.
      // La déduction de mime lit des octets de signature : sans Buffer elle lèverait ici
      // et nulle part en production.
      Buffer,
    }, { timeout: 5000 });
    const r = await fn.call({
      helpers: { httpRequest: async () => { throw new Error('helpers.httpRequest appelé sans être attendu'); } },
    });
    return Array.isArray(r) ? r[0] : r;
  } catch (e) {
    return { erreur: `${nom} a levé ${e.message}` };
  }
}
const valider = (wf, body) => execCode(wf, 'Validate Input', { json: { body, headers: {}, query: {} } });

const CLE = 'sk-test';
const DEFAUT = 'mistral-ocr-latest';
// Un vrai PNG : signature 89 50 4E 47 0D 0A 1A 0A. La validation image lit les octets,
// un base64 bidon serait refusé avant d'arriver au modèle.
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13]).toString('base64');

/** Corps minimal accepté par chaque workflow, auquel on ajoute le `model` à l'essai. */
const corps = {
  pdf: o => ({ file_url: 'https://b2.test/page.pdf', mistral_api_key: CLE, ...o }),
  img: o => ({ image_base64: PNG, file_type: 'png', mistral_api_key: CLE, ...o }),
};
/**
 * Le modèle effectivement placé dans le corps envoyé à Mistral. Les deux workflows
 * construisent ce corps au même endroit — `mistralRequest` — et c'est lui qui part sur
 * le réseau : lire une variable intermédiaire ne prouverait rien.
 */
const modeleEnvoye = v => (v.mistralRequest || {}).model;

(async () => {
  for (const [cle, wf, nom] of [['pdf', PDF, 'MCP - PDF OCR'], ['img', IMG, 'MCP - Image OCR']]) {
    await section(`${nom} — le client décide`, async () => {
      const v = await valider(wf, corps[cle]());
      controle('corps minimal accepté (sinon le reste ne veut rien dire)', v.valid !== false && !v.erreur, true);

      const b = await valider(wf, corps[cle]({ model: 'mistral-ocr-4-1' }));
      controle('body.model respecté', modeleEnvoye(b), 'mistral-ocr-4-1');

      const c = await valider(wf, corps[cle]({ context: { model: 'mistral-ocr-4-0' } }));
      controle('context.model respecté (RFC-014)', modeleEnvoye(c), 'mistral-ocr-4-0');

      const bc = await valider(wf, corps[cle]({ model: 'mistral-ocr-4-1', context: { model: 'mistral-ocr-4-0' } }));
      controle('body.model prime sur context.model', modeleEnvoye(bc), 'mistral-ocr-4-1');

      controle('sans model, le défaut du workflow', modeleEnvoye(v), DEFAUT);

      // Une graphie inconnue n'est pas filtrée : c'est Mistral qui arbitre, pas nous.
      const libre = await valider(wf, corps[cle]({ model: 'mistral-ocr-2512' }));
      controle('aucune liste blanche de modèles côté n8n', modeleEnvoye(libre), 'mistral-ocr-2512');
    });
  }

  await section('Le modèle demandé est reporté dans la réponse', async () => {
    const v = await valider(IMG, corps.img({ model: 'mistral-ocr-4-1' }));
    controle('ocrModel transporté par Validate Input', v.ocrModel, 'mistral-ocr-4-1');

    const reponse = m => ({ pages: [{ index: 0, markdown: '# t' }], usage_info: { pages_processed: 1 }, ...m });
    const avec = await execCode(IMG, 'Format Response',
      { json: reponse({ model: 'mistral-ocr-4-1' }) }, { 'Validate Input': v });
    controle('Mistral renvoie le nom, on le reprend', (avec.data || {}).model, 'mistral-ocr-4-1');

    // ⚠️ Mistral renvoie le nom demandé verbatim, mais rien ne le garantit : s'il
    // l'omet, la réponse doit rendre ce que NOUS avons demandé, pas un littéral.
    const sans = await execCode(IMG, 'Format Response',
      { json: reponse({}) }, { 'Validate Input': v });
    controle('Mistral omet le modèle, on rend celui demandé', (sans.data || {}).model, 'mistral-ocr-4-1');
  });

  await section('Non-régression structurelle', async () => {
    // Le défaut était un littéral dans le corps Mistral. Qu'il ne revienne pas.
    const corpsMistral = src => {
      const m = /mistralRequest:\s*Object\.assign\(\{([\s\S]{0,200}?)\}/.exec(src || '');
      return m ? m[1] : '';
    };
    const vi = nd(IMG, 'Validate Input').parameters.jsCode;
    controle('image — aucun littéral de modèle dans le corps Mistral',
      /model:\s*'/.test(corpsMistral(vi)), false);
    controle('image — le corps Mistral lit la variable', /model:\s*ocrModel/.test(vi), true);

    // L'asymétrie entre les deux workflows ÉTAIT le défaut : même expression des deux côtés.
    const expr = src => (/const ocrModel = ([^;]+);/.exec(src || '') || [])[1];
    const ePdf = expr(nd(PDF, 'Validate Input').parameters.jsCode);
    const eImg = expr(vi);
    controle('PDF — expression présente', typeof ePdf, 'string');
    controle('image — expression identique à celle du PDF', eImg, ePdf);
    controle('expression attendue', ePdf, `body.model || ctx.model || '${DEFAUT}'`);
  });

  console.log(`\nRésultat : ${total - echecs.length} ok, ${echecs.length} échec(s)`);
  if (echecs.length) { echecs.forEach(e => console.log(`  - ${e}`)); process.exit(1); }
})();
