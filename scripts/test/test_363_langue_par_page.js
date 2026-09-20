#!/usr/bin/env node
/**
 * PDF OCR — detected_languages par page sur la branche Mistral (azy.daily#363)
 *
 * Google Vision remplit nativement `data.pages[].detected_languages`
 * ([{ languageCode, confidence }]). Mistral /v1/ocr ne rend aucune langue : on la déduit
 * du texte, sans appel réseau ni crédit, pour rendre le MÊME champ au MÊME endroit.
 *
 * Le sandbox des Code nodes n8n interdit require(), donc ni `franc` ni `cld3` : la
 * détection est écrite à la main (écriture Unicode, puis mots-outils pour les langues
 * latines). Ce test exécute le vrai bloc extrait du workflow, pas une copie.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHIER = path.join(__dirname, '..', '..', 'workflows', 'MCP_-_PDF_OCR.json');
const DEBUT = '// ── azy.daily#363 — détection de langue par page (début du bloc détection) ──';
const FIN = '// ── fin du bloc détection #363 ──';

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

const workflow = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
const noeuds = workflow.nodes.filter((n) => /^Normalize Mistral \((Sync|Async)\)$/.test(n.name));

console.log('\nPDF OCR — detected_languages par page (Mistral)\n');

console.log('Présence dans le workflow');
verifier('les deux nœuds Mistral existent (sync et async)', noeuds.length === 2,
  `trouvés : ${noeuds.map((n) => n.name).join(', ')}`);

const blocs = noeuds.map((n) => {
  const c = n.parameters.jsCode;
  const d = c.indexOf(DEBUT);
  const f = c.indexOf(FIN);
  return d >= 0 && f > d ? c.slice(d, f + FIN.length) : null;
});
verifier('chaque nœud porte le bloc de détection', blocs.every(Boolean));
verifier('les deux nœuds portent un bloc IDENTIQUE (pas de dérive entre sync et async)',
  blocs[0] !== null && blocs[0] === blocs[1]);
verifier('le champ est ajouté à data.pages[] (là où Google le met)',
  noeuds.every((n) => /detected_languages:\s*languesDetectees363\(p\.markdown\)/.test(n.parameters.jsCode)));

const noeudsGoogle = workflow.nodes.filter((n) => /^Normalize Google \((Sync|Async)\)$/.test(n.name));
verifier('la branche Google publie AUSSI le champ dans page_details[], depuis sa source native',
  noeudsGoogle.length === 2
  && noeudsGoogle.every((n) => (n.parameters.jsCode.match(
    /detected_languages:\s*\(annotation\.pages\?\.\[0\]\?\.property\?\.detectedLanguages/g) || []).length === 2),
  'attendu : une fois dans pages[], une fois dans page_details[], dans chacun des deux nœuds');

if (!blocs[0]) {
  console.log('\nRésultat : bloc introuvable, arrêt\n');
  process.exit(1);
}

const contexte = vm.createContext({});
vm.runInContext(`${blocs[0]}\nthis.detecter = languesDetectees363;`, contexte);
const detecter = contexte.detecter;

/** Renvoie le code de langue dominant, ou null. */
const dominante = (t) => (detecter(t)[0] || {}).languageCode || null;
const codes = (t) => detecter(t).map((l) => l.languageCode);

const FR = `L'Assemblée nationale a adopté cette proposition de loi qui vise à renforcer
les droits des usagers dans les services publics. Les députés ont voté pour ce texte
avec une large majorité, mais les sénateurs devront encore se prononcer sur ses effets.`;
const EN = `The committee has reviewed the report and concluded that the proposed changes
are consistent with the regulation which was adopted last year. This document describes
the methods that were used for the analysis of the data from all the member states.`;
const HE = `בראשית ברא אלהים את השמים ואת הארץ והארץ היתה תהו ובהו וחשך על פני תהום
ורוח אלהים מרחפת על פני המים ויאמר אלהים יהי אור ויהי אור וירא אלהים את האור כי טוב`;
const AR = `في هذا التقرير نستعرض النتائج التي توصلت إليها اللجنة بشأن المشروع الجديد
وقد تم اعتماد هذه التوصيات من قبل جميع الأعضاء في الاجتماع الأخير الذي عقد الشهر الماضي`;
const JA = `この報告書では、委員会が検討した結果について説明します。新しい制度は来年から
適用される予定であり、関係者の意見を踏まえて内容が決定されました。`;
const ZH = `本报告介绍了委员会审议的结果。新的制度将从明年开始实施，相关内容根据各方意见确定。`;
const DE = `Der Ausschuss hat den Bericht geprüft und ist zu dem Ergebnis gekommen, dass die
vorgeschlagenen Änderungen mit der Verordnung vereinbar sind, die im letzten Jahr
verabschiedet wurde und für alle Mitgliedstaaten nicht ohne Bedeutung ist.`;

console.log('\nLangues sur une page pleine');
for (const [intitule, texte, attendu] of [
  ['français', FR, 'fr'],
  ['anglais', EN, 'en'],
  ['allemand', DE, 'de'],
  ['hébreu', HE, 'he'],
  ['arabe', AR, 'ar'],
  ['japonais', JA, 'ja'],
  ['chinois', ZH, 'zh'],
]) {
  verifier(`${intitule} → ${attendu}`, dominante(texte) === attendu,
    `obtenu : ${JSON.stringify(detecter(texte))}`);
}

console.log('\nPièges traités dans le code');
verifier('le japonais ne ressort PAS aussi en chinois (les kanji sont des idéogrammes partagés)',
  !codes(JA).includes('zh'), `obtenu : ${JSON.stringify(codes(JA))}`);

const MIXTE = `${HE}\n\nTraduction française du passage ci-dessus, avec les commentaires
qui accompagnent le texte et les notes que les lecteurs trouveront dans cette édition.`;
const cMixte = codes(MIXTE);
verifier('page bilingue hébreu + français → les deux langues sont rendues',
  cMixte.includes('he') && cMixte.includes('fr'), `obtenu : ${JSON.stringify(detecter(MIXTE))}`);

const BRUIT = `![diagram-of-the-water-cycle-in-english.png](img-3.jpeg)
${FR}`;
verifier('un nom de fichier anglais dans une image ne fausse pas la langue',
  dominante(BRUIT) === 'fr', `obtenu : ${JSON.stringify(detecter(BRUIT))}`);

const TABLE = `<table><tr><td>Dupont</td><td>Martin</td><td>Durand</td></tr>
<tr><td>12,50</td><td>18,00</td><td>7,25</td></tr><tr><td>Bernard</td><td>Petit</td>
<td>Moreau</td></tr><tr><td>Leroy</td><td>Roux</td><td>Fournier</td></tr></table>`;
verifier('alphabet latin sans mot-outil (table de noms) → und, pas une langue inventée',
  dominante(TABLE) === 'und', `obtenu : ${JSON.stringify(detecter(TABLE))}`);

console.log('\nCas limites');
for (const [intitule, entree] of [
  ['page vide', ''],
  ['page nulle (relance échouée : markdown vide)', null],
  ['texte trop court pour être honnête', 'Bonjour'],
  ['page de numérotation seule', '— 42 —'],
]) {
  const r = detecter(entree);
  verifier(`${intitule} → aucune langue`, Array.isArray(r) && r.length === 0,
    `obtenu : ${JSON.stringify(r)}`);
}

console.log('\nForme du champ (contrat Google Vision)');
const echantillon = detecter(FR);
verifier('tableau d\'objets { languageCode, confidence, source }',
  echantillon.every((l) => typeof l.languageCode === 'string' && typeof l.confidence === 'number'
    && typeof l.source === 'string'), JSON.stringify(echantillon));
verifier('source = script_heuristic sur la branche Mistral (front #363 : la valeur porte sa provenance)',
  echantillon.every((l) => l.source === 'script_heuristic'), JSON.stringify(echantillon));
verifier('la branche Google marque source = engine (valeur du moteur, pas la nôtre)',
  noeudsGoogle.every((n) => /source:\s*'engine'/.test(n.parameters.jsCode)));
verifier('confidence dans [0, 1]',
  echantillon.every((l) => l.confidence >= 0 && l.confidence <= 1), JSON.stringify(echantillon));
const triMixte = detecter(MIXTE).map((l) => l.confidence);
verifier('langues triées par confiance décroissante',
  triMixte.every((v, i) => i === 0 || triMixte[i - 1] >= v), JSON.stringify(detecter(MIXTE)));

/* ------------------------------------------- Le nœud entier, pas seulement la fonction */
/**
 * Exécute `Normalize Mistral (Sync)` sur une fausse réponse 200 de Mistral : la fonction
 * peut être juste et le champ ne jamais atteindre la réponse. Aucun réseau : la relance
 * page par page n'est déclenchée que sur un 5xx.
 */
async function verifierNoeudEntier() {
  console.log('\nSortie complète du nœud (fausse réponse Mistral 200)');
  const code = noeuds.find((n) => n.name === 'Normalize Mistral (Sync)').parameters.jsCode;
  const reponse = {
    statusCode: 200,
    body: {
      model: 'mistral-ocr-latest',
      usage_info: { pages_processed: 2, doc_size_bytes: 1234 },
      pages: [
        { index: 0, markdown: FR, dimensions: { width: 1700, height: 2200, dpi: 200 } },
        { index: 1, markdown: EN, dimensions: { width: 1700, height: 2200, dpi: 200 } },
      ],
    },
  };
  const ctx = vm.createContext({
    $input: { first: () => ({ json: reponse }) },
    $: () => ({
      first: () => ({
        json: {
          startTime: Date.now(), user_id: 'u', guild_id: 'g', user_request: 'r',
          fileUrl: 'http://exemple/f.pdf', includeBlocks: false, tableFormat: 'markdown',
        },
      }),
    }),
    console,
  });
  vm.runInContext(`this.executer = (async function () {\n${code}\n});`, ctx);
  const r = await ctx.executer.call({ helpers: {} });

  verifier('la réponse reste un succès', r.success === true);
  verifier('page 1 (français) → fr', r.data.pages[0].detected_languages[0]?.languageCode === 'fr',
    JSON.stringify(r.data.pages[0].detected_languages));
  verifier('page 2 (anglais) → en', r.data.pages[1].detected_languages[0]?.languageCode === 'en',
    JSON.stringify(r.data.pages[1].detected_languages));
  // chat.api ne construit page_details[] QUE depuis la clé `page_details` (ocr_service.py),
  // et MCP relaie cette liste verbatim (ocr_routes.py : page_details: Optional[list]).
  // data.pages[] ne traverse donc jamais la frontière : sans ce champ ici, aucun client ne le voit.
  verifier('page_details[] porte le champ, en fin d\'objet (contrat #363 étendu, pas cassé)',
    JSON.stringify(Object.keys(r.data.page_details[0]))
      === JSON.stringify(['index', 'markdown', 'header', 'footer', 'page_width', 'page_height', 'dpi',
        'detected_languages']),
    JSON.stringify(Object.keys(r.data.page_details[0])));
  verifier('même valeur dans page_details[] et dans pages[] (une seule vérité)',
    JSON.stringify(r.data.page_details[0].detected_languages)
      === JSON.stringify(r.data.pages[0].detected_languages),
    `${JSON.stringify(r.data.page_details[0].detected_languages)} vs ${JSON.stringify(r.data.pages[0].detected_languages)}`);
  verifier('meta.usage intact', r.meta.usage.pages_processed === 2 && r.meta.usage.doc_size_bytes === 1234);
}

verifierNoeudEntier()
  .catch((e) => { ko += 1; console.log(`  ✗ exception : ${e.message}`); })
  .then(() => {
    console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
    process.exit(ko === 0 ? 0 : 1);
  });
