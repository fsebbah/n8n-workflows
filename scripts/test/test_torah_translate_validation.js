#!/usr/bin/env node
/**
 * VALIDATION D'ENTRÉE DE /webhook/torah-translate — sortie rendue atteignable.
 *
 * LE DÉFAUT, MESURÉ EN SERVICE LE 2026-11-15
 *
 * `Parse Input` CONSTRUISAIT trois erreurs depuis toujours — `MISSING_TEXT`,
 * `INVALID_PROVIDER`, `MISSING_API_KEY` / `MISSING_PROVIDER_API_KEY` — et
 * AUCUNE ne pouvait sortir : sa seule connexion allait droit sur
 * `Needs Structured?`. Du code de validation écrit, correct, inatteignable.
 *
 * Sonde réelle sur llm.local, AVANT ce correctif :
 *     POST /webhook/torah-translate  {"text":"שלום"}   (aucune clé)
 *     → {"error":{"code":"EMPTY_RESPONSE",
 *                 "message":"le fournisseur a rendu une reponse vide"}}
 *
 * L'appelant soupçonnait donc le fournisseur, le réseau ou un quota, alors que
 * la cause était qu'il n'avait pas envoyé de clé — et la chaîne brûlait un
 * appel au relais avant de constater l'évidence. À comparer avec
 * `torah-translate-page`, qui validait correctement et rendait un vrai 400.
 *
 * ⚠️ LE CODE HTTP RESTE 200 : ce workflow est en `responseMode: lastNode`.
 * Voir le commentaire du nœud `Erreur Validation` pour pourquoi on ne bascule
 * pas en `responseNode` ici.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let reussis = 0, echoues = 0;
function ok(nom, condition, detail) {
  if (condition) { reussis++; }
  else { echoues++; console.log(`  ❌ ${nom}` + (detail ? `\n       ${detail}` : '')); }
}
const egal = (nom, a, b) => ok(nom, JSON.stringify(a) === JSON.stringify(b),
  `attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
const g = (o) => (o && typeof o === 'object') ? o : {};

const wf = JSON.parse(fs.readFileSync(
  path.join(RACINE, 'workflows', 'Torah_Translate_Simple.json'), 'utf8'));
// ⚠️ TOLÉRANT À L'ABSENCE. Si un nœud manque — c'est le cas sur le code
// d'origine, et c'est tout l'objet de ce fichier — la suite doit ÉCHOUER en
// nommant le contrôle, pas PLANTER : un plantage masque les 40 suivants.
const noeud = (nom) => wf.nodes.find((x) => x.name === nom) || null;
const params = (nom) => g(g(noeud(nom)).parameters);
const executer = (nom, entree, contexte) => {
  const n = noeud(nom);
  if (!n) return [{ json: { _noeud_absent: nom } }];
  const items = Array.isArray(entree) ? entree : [entree];
  return new Function('$input', '$', '$env', n.parameters.jsCode)(
    { first: () => ({ json: items[0] }), all: () => items.map((j) => ({ json: j })) },
    (n) => {
      if (!(n in (contexte || {}))) throw new Error(`Referenced node is unexecuted: ${n}`);
      const v = contexte[n];
      const tab = Array.isArray(v) ? v : [v];
      return { first: () => ({ json: tab[0] }), all: () => tab.map((j) => ({ json: j })) };
    },
    {}
  );
};
const parse = (body) => executer('Parse Input', { body })[0].json;

// ═════════════════════════════════════════════════════════════════════════════
// 1 · LE CÂBLAGE : LA VALIDATION EST SUR LE CHEMIN
// ═════════════════════════════════════════════════════════════════════════════
// C'est le cœur du correctif. Le code de validation existait déjà ; ce qui
// manquait, c'était l'aiguillage qui le lit.
{
  const cx = wf.connections;
  egal('⚠️ `Parse Input` ne va plus droit à la traduction',
       (g(g(cx['Parse Input']).main)[0] || []).map((x) => x.node), ['Entrée valide ?']);
  ok('l\'aiguillage existe', !!cx['Entrée valide ?']);
  egal('sortie vraie → la traduction',
       (g(g(cx['Entrée valide ?']).main)[0] || []).map((x) => x.node), ['Needs Structured?']);
  egal('sortie fausse → l\'erreur',
       (g(g(cx['Entrée valide ?']).main)[1] || []).map((x) => x.node), ['Erreur Validation']);

  // La condition doit porter sur la PRÉSENCE de `error`, pas sur `success`.
  // `success` est absent des items valides, donc le tester inverserait le test.
  const cond = g(g(g(params('Entrée valide ?')).conditions).conditions)[0] || {};
  ok('la condition teste l\'absence de `error`',
     /\$json\.error === undefined \|\| \$json\.error === null/.test(cond.leftValue || ''),
     String(cond.leftValue));
  egal('et elle est booléenne vraie', g(cond.operator).operation, 'true');

  // ⚠️ `Erreur Validation` doit être TERMINAL : s'il repartait vers la
  // traduction, le refus serait traduit quand même.
  ok('⚠️ `Erreur Validation` est terminal', !cx['Erreur Validation']);
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · LES TROIS ERREURS DE PARSE INPUT SORTENT MAINTENANT
// ═════════════════════════════════════════════════════════════════════════════
{
  const cas = [
    ['texte absent', {}, 'MISSING_TEXT'],
    ['clé absente (anthropic)', { text: 'שלום' }, 'MISSING_API_KEY'],
    ['clé absente (autre fournisseur)',
     { text: 'שלום', provider: 'google', model: 'gemini-2.5-pro' },
     'MISSING_PROVIDER_API_KEY'],
    ['fournisseur inconnu',
     { text: 'שלום', provider: 'gemini', api_key: 'k' }, 'INVALID_PROVIDER'],
  ];
  for (const [nom, body, code] of cas) {
    const p = parse(body);
    egal(`${nom} → erreur construite`, g(p.error).code, code);
    // Et elle traverse le nœud terminal sans être réécrite.
    const r = executer('Erreur Validation', p)[0].json;
    egal(`${nom} → rendue à l'appelant`, g(r.error).code, code);
    egal(`${nom} → success false`, r.success, false);
    egal(`${nom} → étape nommée`, r.etape, 'validation_entree');
  }

  // Le message de `INVALID_PROVIDER` doit continuer à nommer `google`, c'est
  // le piège que toutes les équipes rencontrent.
  const inv = parse({ text: 'שלום', provider: 'gemini', api_key: 'k' });
  ok('⚠️ le message dit que Gemini se nomme google',
     /google/.test(g(inv.error).message), g(inv.error).message);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · CE QUI NE DOIT PAS CHANGER — NON-RÉGRESSION
// ═════════════════════════════════════════════════════════════════════════════
{
  // Une entrée valide doit passer la condition, et porter tout ce que la suite
  // attend. Si `error` apparaissait sur un item valide, toute traduction
  // tomberait dans la branche d'erreur : c'est le risque de ce correctif.
  const bon = parse({ text: 'שלום', api_key: 'sk-ant-X',
                      source_language: 'he', target_language: 'fr' });
  egal('⚠️ aucune `error` sur une entrée valide', bon.error, undefined);
  ok('la condition de l\'aiguillage serait VRAIE',
     bon.error === undefined || bon.error === null);
  // Les champs dont dépend la suite du workflow.
  for (const champ of ['text', 'provider', 'providerCle', 'model', 'targetLanguage',
                       'verifyActive', 'verifyProvider', 'verifyModel']) {
    ok(`\`${champ}\` est toujours présent`, champ in bon, Object.keys(bon).join(', '));
  }

  // Et les acquis des PR précédentes ne doivent pas avoir bougé.
  egal('#585 : relecteur non indépendant signalé', bon.verifyIndependant, false);
  egal('#585 : et son motif', bon.verifyIndependanceMotif,
       'aucune_cle_pour_un_autre_fournisseur');
  egal('#585 : la relecture reste active', bon.verifyActive, true);

  // ⚠️ La clé ne doit pas fuir dans l'objet d'erreur.
  const fuite = parse({ text: 'שלום', provider: 'google', api_key: 'sk-ant-SECRET' });
  ok('⚠️ aucune clé dans le message d\'erreur',
     !/sk-ant-SECRET/.test(JSON.stringify(fuite)), JSON.stringify(fuite).slice(0, 200));
}

// ═════════════════════════════════════════════════════════════════════════════
// 4 · LE CODE HTTP RESTE 200, ET C'EST ASSUMÉ
// ═════════════════════════════════════════════════════════════════════════════
{
  const wh = wf.nodes.find((n) => n.type.endsWith('webhook')) || {};
  egal('le workflow reste en `lastNode`', g(wh.parameters).responseMode, 'lastNode');
  egal('⚠️ donc aucun nœud de réponse, et aucun statut choisi',
       wf.nodes.filter((n) => n.type.endsWith('respondToWebhook')).length, 0);

  // La raison est écrite dans le nœud, pour que personne ne « corrige » ça sans
  // mesurer : un chemin terminal sans nœud de réponse fait EXPIRER l'appelant.
  const c = params('Erreur Validation').jsCode || '';
  ok('la raison du 200 est documentée dans le nœud', /responseMode/.test(c));
  ok('et le risque de la bascule aussi', /EXPIRER/.test(c));
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues === 0 ? 0 : 1);
