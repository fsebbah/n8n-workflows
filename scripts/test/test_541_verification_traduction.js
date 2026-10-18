#!/usr/bin/env node
/**
 * Vérification de traduction dans `torah-translate` — azy.daily#541.
 *
 *     node scripts/test/test_541_verification_traduction.js
 *
 * Ce que le test protège
 * ----------------------
 * L'invariant tient en une phrase : **la vérification annote, elle ne substitue
 * jamais.** `translation` sort de `Appliquer Vérification` exactement comme elle
 * y est entrée, dans TOUTES les branches — approuvée, désapprouvée, relecteur en
 * erreur, JSON illisible.
 *
 * Pourquoi cet invariant plutôt qu'un seuil : une divergence peut être minuscule
 * en caractères et décisive en sens (le sens d'un terme, une négation, une
 * portée). Aucun calcul local — longueur, similarité — ne mesure le sens, donc un
 * seuil se tromperait dans les deux directions. Le désaccord est conservé et
 * rendu visible (`suggestion`, `issues`, `divergence`), pas arbitré.
 *
 *  1. Parse Input : défauts, réutilisation de la clé de traduction, désactivation ;
 *  2. Préparer Vérification : converge les 3 sorties, saute proprement, construit l'invite ;
 *  3. Appliquer Vérification : les 4 branches, et `translation` intacte dans chacune ;
 *  4. analyse tolérante : balises de code, texte autour, JSON nu ;
 *  5. non-régression STRUCTURELLE : aucun nœud ne promeut `suggestion` en `translation`.
 *
 * Le JavaScript est extrait du JSON du workflow : c'est le code importé qui est testé.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const W = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', 'Torah_Translate_Simple.json'), 'utf8'));
const nd = (nom) => W.nodes.find((n) => n.name === nom) || { parameters: {} };

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
function section(titre, fn) {
  console.log(`\n${titre}`);
  try { fn(); } catch (e) { total++; echecs.push(titre); console.log(`  ❌ la section a levé : ${e.stack}`); }
}

/** Exécute le jsCode d'un nœud. `prev` fournit ce que `$('Nom')` doit rendre. */
function exec(nom, item, prev = {}) {
  const src = nd(nom).parameters.jsCode;
  if (typeof src !== 'string') throw new Error(`nœud ${nom} sans jsCode`);
  const items = [item];
  const fn = vm.runInNewContext(`(function(){${src}\n})`, {
    $input: { first: () => items[0], all: () => items },
    $: (n) => ({ first: () => ({ json: prev[n] }) }),
    Buffer, JSON, Array, Object, String, Number,
  }, { timeout: 5000 });
  const r = fn();
  return Array.isArray(r) ? r[0].json : r;
}

const CLE_TRAD = 'sk-ant-trad';
const corpsMin = (o = {}) => ({ text: 'טקסט מקורי', api_key: CLE_TRAD, ...o });
const parse = (o = {}) => exec('Parse Input', { json: { body: corpsMin(o) } });

// ───────────────────────────────────────────────────────────────────────────────
section('1 · Parse Input — configuration de la vérification', () => {
  const d = parse();
  controle('active par défaut', d.verifyActive, true);
  controle('fournisseur par défaut anthropic', d.verifyProvider, 'anthropic');
  controle('modèle de relecture par défaut', d.verifyModel, 'claude-sonnet-4-6');
  controle('réutilise la clé de traduction si même fournisseur', d.verifyCle, CLE_TRAD);
  controle('aucun saut', d.verifySautee, null);

  const off = parse({ verify: false });
  controle('verify:false désactive', off.verifyActive, false);
  controle('motif du saut lisible', off.verifySautee, 'desactivee_par_appelant');

  // Changer de fournisseur sans donner sa clé ne doit pas envoyer la clé Anthropic
  // à OpenAI : la vérification est sautée, et le motif le dit.
  const autre = parse({ verify_provider: 'openai', verify_model: 'gpt-4o' });
  controle('autre fournisseur sans clé → sauté', autre.verifyActive, false);
  controle('motif nomme le fournisseur', autre.verifySautee, 'aucune_cle_pour_openai');
  controle('la clé de traduction NE fuit PAS vers un autre fournisseur', autre.verifyCle, null);

  const avecCle = parse({ verify_provider: 'google', verify_model: 'gemini-2.0-flash', verify_api_key: 'k-goog' });
  controle('clé explicite acceptée (Gemini)', [avecCle.verifyActive, avecCle.verifyProvider], [true, 'google']);

  const byot = parse({ verify_provider: 'openai', plugin_context: { api_keys: { openai: 'sk-oa' } } });
  controle('clé lue dans plugin_context (BYOT)', [byot.verifyActive, byot.verifyCle], [true, 'sk-oa']);
});

// ───────────────────────────────────────────────────────────────────────────────
const PD = parse();
const RESULTAT = { success: true, translation: 'la traduction de Claude', method: 'direct' };

section('2 · Préparer Vérification — convergence et saut propre', () => {
  const p = exec('Préparer Vérification', { json: RESULTAT }, { 'Parse Input': PD });
  controle('traduction conservée telle quelle', p.translation, RESULTAT.translation);
  controle('vérification armée', p.verifyActive, true);
  controle('fournisseur et modèle transmis', [p._verify.provider, p._verify.model],
    ['anthropic', 'claude-sonnet-4-6']);
  controle('température 0 pour une relecture', p._verify.temperature, 0);
  controle('clé transmise au relecteur', p._verify.api_key, CLE_TRAD);
  controle("l'original est dans l'invite", p._verify.messages[0].content.includes('טקסט מקורי'), true);
  controle("la traduction est dans l'invite", p._verify.messages[0].content.includes(RESULTAT.translation), true);
  controle("l'instruction demande les écarts de SENS", /ecarts de SENS/.test(p._verify.system), true);
  controle("l'instruction interdit la substitution", /ne la remplaces pas/.test(p._verify.system), true);

  const avecPivot = exec('Préparer Vérification',
    { json: { ...RESULTAT, english_pivot: 'the english pivot' } }, { 'Parse Input': PD });
  controle('le pivot anglais est joint quand il existe',
    avecPivot._verify.messages[0].content.includes('the english pivot'), true);

  const echec = exec('Préparer Vérification',
    { json: { success: false, error: { code: 'CLAUDE_ERROR' } } }, { 'Parse Input': PD });
  controle('une traduction en échec ne se vérifie pas', echec.verify_skipped, 'traduction_absente');
  controle('et rien n\'est inventé', echec.verification, null);

  const inactif = exec('Préparer Vérification', { json: RESULTAT },
    { 'Parse Input': parse({ verify: false }) });
  controle('vérification désactivée → sautée', inactif.verify_skipped, 'desactivee_par_appelant');
  controle('traduction intacte malgré le saut', inactif.translation, RESULTAT.translation);
});

// ───────────────────────────────────────────────────────────────────────────────
const PREC = exec('Préparer Vérification', { json: RESULTAT }, { 'Parse Input': PD });
const reponse = (contenu, code = 200) => ({ json: { statusCode: code, body: { content: contenu } } });
const appliquer = (contenu, code = 200) =>
  exec('Appliquer Vérification', reponse(contenu, code), { 'Préparer Vérification': PREC });

section('3 · Appliquer Vérification — `translation` intacte dans les 4 branches', () => {
  const ok = appliquer('{"approved": true, "confidence": 0.95, "issues": [], "notes": "fidèle"}');
  controle('approuvé — translation intacte', ok.translation, RESULTAT.translation);
  controle('approuvé — approved true', ok.verification.approved, true);
  controle('approuvé — aucune divergence', ok.verification.divergence, false);
  controle('approuvé — aucune suggestion conservée', ok.verification.suggestion, null);
  controle('approuvé — confiance remontée', ok.verification.confidence, 0.95);
  controle('approuvé — fournisseur tracé', ok.verification.model, 'claude-sonnet-4-6');

  // Le cas qui motive tout le dispositif : un écart de SENS sur deux mots.
  const ko = appliquer(JSON.stringify({
    approved: false, confidence: 0.55,
    issues: [{ severite: 'sens', extrait: 'il est permis', explication: 'le texte dit « il est interdit »' }],
    suggestion: 'la traduction du relecteur', notes: 'négation inversée',
  }));
  controle('DÉSAPPROUVÉ — translation TOUJOURS intacte', ko.translation, RESULTAT.translation);
  controle('désapprouvé — divergence signalée', ko.verification.divergence, true);
  controle('désapprouvé — suggestion CONSERVÉE, pas promue', ko.verification.suggestion,
    'la traduction du relecteur');
  controle('désapprouvé — écart de sens restitué', ko.verification.issues[0].severite, 'sens');
  controle('désapprouvé — la suggestion n\'est PAS dans translation',
    ko.translation.includes('relecteur'), false);

  const err = appliquer('peu importe', 503);
  controle('relecteur en erreur — translation intacte', err.translation, RESULTAT.translation);
  controle('relecteur en erreur — aucun avis inventé', err.verification, null);
  controle('relecteur en erreur — motif lisible', err.verify_skipped, 'relecteur_http_503');

  const illisible = appliquer('je ne réponds pas en JSON, désolé');
  controle('JSON illisible — translation intacte', illisible.translation, RESULTAT.translation);
  controle('JSON illisible — aucun avis', illisible.verification, null);
  controle('JSON illisible — motif lisible', illisible.verify_skipped, 'relecteur_json_illisible');

  const vide = appliquer('');
  controle('réponse vide — translation intacte', vide.translation, RESULTAT.translation);
  controle('réponse vide — motif lisible', vide.verify_skipped, 'relecteur_reponse_vide');

  controle('le champ interne _verify ne fuit pas dans la réponse', ok._verify, undefined);
});

section('4 · Analyse tolérante — aucun fournisseur ne garantit du JSON nu', () => {
  const fences = appliquer('```json\n{"approved": true, "confidence": 0.9}\n```');
  controle('balises de code retirées', fences.verification.approved, true);

  const bavard = appliquer('Voici mon analyse :\n{"approved": false, "suggestion": "autre"}\nVoilà.');
  controle('texte autour du JSON toléré', bavard.verification.divergence, true);
  controle('et translation toujours intacte', bavard.translation, RESULTAT.translation);

  const sansConfiance = appliquer('{"approved": true}');
  controle('confiance absente → null, pas une valeur inventée',
    sansConfiance.verification.confidence, null);

  const issuesCassees = appliquer('{"approved": false, "issues": "pas un tableau"}');
  controle('issues non conforme → tableau vide', issuesCassees.verification.issues, []);
});

section('5 · Non-régression structurelle — rien ne promeut la suggestion', () => {
  // Le défaut qu'on refuse n'est pas une valeur fausse, c'est une SUBSTITUTION.
  // Ce contrôle échoue si un nœud se met à écrire translation depuis l'avis.
  const codes = W.nodes.filter((n) => (n.parameters || {}).jsCode)
    .map((n) => ({ nom: n.name, src: n.parameters.jsCode }));
  const coupables = codes.filter(({ src }) =>
    /translation\s*[:=]\s*[^;,\n]*\b(suggestion|my_translation|avis\.|verification\.suggestion)/.test(src));
  controle('aucun nœud n\'affecte une suggestion à translation', coupables.map((c) => c.nom), []);

  const appli = nd('Appliquer Vérification').parameters.jsCode;
  controle('Appliquer Vérification ne déclare aucun finalTranslation',
    /finalTranslation/.test(appli), false);
  controle('et il documente pourquoi aucun seuil', /aucun calcul local/.test(appli), true);

  const c = W.connections;
  controle('les 3 sorties convergent vers la vérification',
    ['Output Structured', 'Output Fallback', 'Output Direct']
      .map((s) => c[s].main[0][0].node),
    ['Préparer Vérification', 'Préparer Vérification', 'Préparer Vérification']);
  controle('la branche inactive a sa propre sortie',
    c['Vérification active ?'].main[1][0].node, 'Sortie sans vérification');
  const appel = nd('Vérifier (LLM)');
  controle('le relecteur ne casse pas la traduction en cas d\'échec',
    appel.onError, 'continueRegularOutput');
  controle('et il passe par llm-call-messages (multi-fournisseurs)',
    /llm-call-messages/.test(appel.parameters.url), true);
});

console.log(`\nRésultat : ${total - echecs.length} ok, ${echecs.length} échec(s)`);
if (echecs.length) { echecs.forEach((e) => console.log(`  - ${e}`)); process.exit(1); }
