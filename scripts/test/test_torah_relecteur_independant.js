#!/usr/bin/env node
/**
 * RELECTEUR INDÉPENDANT DU TRADUCTEUR — azy.daily#669, point 5.
 *
 * LE DÉFAUT
 * `verify_provider` valait `anthropic` par défaut — exactement le fournisseur
 * de la traduction — et `verifyCle` retombait sur `body.api_key`. Donc
 * `claude-sonnet-4-6` relisait `claude-sonnet-4-6` : le modèle se relisait
 * lui-même. Il repère les fautes de forme, beaucoup moins les contresens qu'il
 * vient de produire.
 *
 * ⚠️ DEUX CONTRAINTES QUI INTERDISENT LE CORRECTIF ÉVIDENT
 *
 * 1. On ne peut pas simplement changer le défaut.
 *    `verifyActive = verifyDemandee && !!verifyCle` : viser un fournisseur dont
 *    l'appelant n'a pas la clé DÉSACTIVERAIT la relecture, en silence et sans
 *    changement de code HTTP, pour tous ceux qui n'envoient que `api_key`.
 *
 * 2. On n'invente jamais un nom de modèle.
 *    `LLM - Call Messages` exige `model` et n'a aucun défaut par fournisseur.
 *    Un modèle faux est pire qu'un modèle absent (azy.daily#201), et le
 *    `claude-sonnet-4` mort de n8n-workflows#462 a déjà coûté un 404 latent.
 *
 * D'où la règle testée ici : un autre fournisseur n'est retenu automatiquement
 * que si l'appelant a fourni À LA FOIS sa clé et son modèle. Sinon la relecture
 * a lieu quand même, non indépendante, et on le DIT.
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
const noeud = (nom) => {
  const n = wf.nodes.find((x) => x.name === nom);
  if (!n) throw new Error(`nœud introuvable : ${nom}`);
  return n;
};
const codeNu = (nom) => (noeud(nom).parameters.jsCode || '')
  .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const executer = (nom, entree, contexte) => {
  const items = Array.isArray(entree) ? entree : [entree];
  return new Function('$input', '$', '$env', noeud(nom).parameters.jsCode)(
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

const BASE = { job_id: 'j1', segment_id: 's1', text: 'שֶׁעוֹנִין עָלָיו',
  source_language: 'he', target_language: 'fr' };
const parse = (extra) => executer('Parse Input',
  { body: Object.assign({}, BASE, extra) })[0].json;

// ═════════════════════════════════════════════════════════════════════════════
// 1 · NON-RÉGRESSION : LA RELECTURE A TOUJOURS LIEU AVEC UNE SEULE CLÉ
// ═════════════════════════════════════════════════════════════════════════════
// C'est le contrôle le plus important du fichier. Le correctif ne doit RIEN
// désactiver : un appelant qui n'envoie que `api_key` doit continuer à être relu.
{
  const p = parse({ api_key: 'sk-ant-X' });
  egal('⚠️ la relecture reste ACTIVE', p.verifyActive, true);
  egal('fournisseur du relecteur', p.verifyProvider, 'anthropic');
  egal('modèle du relecteur', p.verifyModel, 'claude-sonnet-4-6');
  egal('clé réutilisée', p.verifyCle, 'sk-ant-X');
  egal('aucun saut', p.verifySautee, null);

  // Mais le manque d'indépendance est DIT, au lieu d'être tu.
  egal('⚠️ et il est signalé NON indépendant', p.verifyIndependant, false);
  egal('avec le motif exact', p.verifyIndependanceMotif,
       'aucune_cle_pour_un_autre_fournisseur');
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · UNE CLÉ TIERCE SANS MODÈLE N'EST PAS RETENUE — ON N'INVENTE PAS
// ═════════════════════════════════════════════════════════════════════════════
{
  const p = parse({ api_key: 'sk-ant-X',
    plugin_context: { api_keys: { google: 'AIza-X', openai: 'sk-oai-X' } } });
  egal('⚠️ le fournisseur reste celui du traducteur', p.verifyProvider, 'anthropic');
  egal('⚠️ et AUCUN modèle n\'est inventé', p.verifyModel, 'claude-sonnet-4-6');
  egal('la relecture a quand même lieu', p.verifyActive, true);
  egal('non indépendant', p.verifyIndependant, false);
  egal('⚠️ et le motif distingue le manque de MODÈLE du manque de CLÉ',
       p.verifyIndependanceMotif, 'aucun_modele_pour_un_autre_fournisseur');
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · CLÉ + MODÈLE → RELECTEUR VRAIMENT INDÉPENDANT
// ═════════════════════════════════════════════════════════════════════════════
{
  const p = parse({ api_key: 'sk-ant-X',
    plugin_context: { api_keys: { google: 'AIza-X' } },
    verify_models: { google: 'gemini-2.5-pro' } });
  egal('⭐ fournisseur indépendant choisi', p.verifyProvider, 'google');
  egal('⭐ et son modèle vient de l\'appelant', p.verifyModel, 'gemini-2.5-pro');
  egal('⭐ clé prise dans le trousseau', p.verifyCle, 'AIza-X');
  egal('⭐ relecture active', p.verifyActive, true);
  egal('⭐ INDÉPENDANT', p.verifyIndependant, true);
  egal('motif', p.verifyIndependanceMotif, 'choisi_dans_le_trousseau');

  // ⚠️ La clé de traduction ne doit pas fuir vers le relecteur tiers.
  ok('⚠️ la clé anthropic n\'est PAS celle du relecteur', p.verifyCle !== 'sk-ant-X');
}

// ═════════════════════════════════════════════════════════════════════════════
// 4 · ORDRE DE PRÉFÉRENCE, STABLE ET DOCUMENTÉ
// ═════════════════════════════════════════════════════════════════════════════
{
  // Traduction anthropic : le premier candidat est openai, puis google.
  const p = parse({ api_key: 'sk-ant-X',
    plugin_context: { api_keys: { google: 'AIza-X', openai: 'sk-oai-X' } },
    verify_models: { google: 'gemini-2.5-pro', openai: 'gpt-4o' } });
  egal('openai passe avant google', p.verifyProvider, 'openai');
  egal('et son modèle suit', p.verifyModel, 'gpt-4o');

  // Traduction google : le traducteur est écarté des candidats, anthropic passe.
  const q = parse({ provider: 'google', api_key: 'AIza-T',
    plugin_context: { api_keys: { google: 'AIza-T', anthropic: 'sk-ant-R' } },
    verify_models: { anthropic: 'claude-sonnet-4-6', google: 'gemini-2.5-pro' } });
  egal('⚠️ le traducteur n\'est jamais son propre relecteur', q.verifyProvider, 'anthropic');
  egal('et le relecteur est indépendant', q.verifyIndependant, true);

  // Traduction google, et SEULE une clé google : pas d'indépendance possible.
  const r = parse({ provider: 'google', api_key: 'AIza-T',
    plugin_context: { api_keys: { google: 'AIza-T' } },
    verify_models: { google: 'gemini-2.5-pro' } });
  egal('sans autre fournisseur, retour au défaut', r.verifyProvider, 'anthropic');
  egal('et il n\'y a pas de clé pour lui → relecture sautée', r.verifyActive, false);
  egal('le motif de saut le nomme', r.verifySautee, 'aucune_cle_pour_anthropic');
}

// ═════════════════════════════════════════════════════════════════════════════
// 5 · UN CHOIX EXPLICITE DE L'APPELANT N'EST JAMAIS DISCUTÉ
// ═════════════════════════════════════════════════════════════════════════════
{
  const p = parse({ api_key: 'sk-ant-X', verify_provider: 'google',
    verify_model: 'gemini-2.5-pro',
    plugin_context: { api_keys: { google: 'AIza-X', openai: 'sk-oai-X' } },
    verify_models: { openai: 'gpt-4o' } });
  egal('le fournisseur demandé est retenu', p.verifyProvider, 'google');
  egal('⚠️ même si openai passerait avant dans l\'ordre automatique', p.verifyModel,
       'gemini-2.5-pro');
  egal('motif', p.verifyIndependanceMotif, 'demande_par_appelant');
  egal('indépendant', p.verifyIndependant, true);

  // Un appelant qui demande explicitement le fournisseur du traducteur est
  // suivi, et le rapport le dit : non indépendant, par sa propre demande.
  const q = parse({ api_key: 'sk-ant-X', verify_provider: 'anthropic' });
  egal('choix explicite du traducteur : suivi', q.verifyProvider, 'anthropic');
  egal('mais signalé non indépendant', q.verifyIndependant, false);
  egal('et le motif dit que c\'est voulu', q.verifyIndependanceMotif,
       'demande_par_appelant');

  // ⚠️ La clé d'un fournisseur ne part JAMAIS chez un autre.
  const f = parse({ api_key: 'sk-ant-SECRET', verify_provider: 'openai',
                    verify_model: 'gpt-4o' });
  egal('⚠️ `api_key` anthropic ne sert pas pour openai', f.verifyCle, null);
  egal('donc la relecture est sautée', f.verifyActive, false);
  egal('et le motif le nomme', f.verifySautee, 'aucune_cle_pour_openai');
}

// ═════════════════════════════════════════════════════════════════════════════
// 6 · L'INDÉPENDANCE REMONTE DANS LA RÉPONSE, HORS DE `verification`
// ═════════════════════════════════════════════════════════════════════════════
{
  const pd = parse({ api_key: 'sk-ant-X' });
  const resultat = { success: true, translation: 'Bonjour' };
  const prep = executer('Préparer Vérification', resultat,
    { 'Parse Input': pd })[0].json;
  egal('l\'indépendance est portée', prep.verify_independant, false);
  egal('et son motif', prep.verify_independance_motif,
       'aucune_cle_pour_un_autre_fournisseur');

  // Même quand la relecture est sautée : savoir qu'elle AURAIT été non
  // indépendante vaut mieux que de l'ignorer.
  const pdSaute = parse({ verify_provider: 'openai', verify_model: 'gpt-4o',
                          api_key: 'sk-ant-X' });
  const saute = executer('Préparer Vérification', resultat,
    { 'Parse Input': pdSaute })[0].json;
  egal('sautée : l\'indépendance est quand même dite', saute.verify_independant, true);
  egal('et le saut aussi', saute.verify_skipped, 'aucune_cle_pour_openai');

  // Traduction absente : troisième sortie du nœud, elle doit aussi le porter.
  const absente = executer('Préparer Vérification', { success: false },
    { 'Parse Input': pd })[0].json;
  egal('traduction absente : motif conservé', absente.verify_skipped, 'traduction_absente');
  egal('et l\'indépendance aussi', absente.verify_independant, false);

  // ⚠️ JAMAIS dans `verification` : cet objet est strictement la forme `review`
  // de torah.api, qui refuse les champs inconnus (422, et sur /save-batch c'est
  // tout le lot qui tombe).
  const avis = { approved: true, confidence: 0.9 };
  const applique = executer('Appliquer Vérification',
    { statusCode: 200, body: { success: true, data: { text: JSON.stringify(avis) } } },
    { 'Préparer Vérification': Object.assign({}, prep, {
        _verify: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        _verify_demande_a: '2026-11-15T12:00:00.000Z' }) })[0].json;
  egal('⚠️ `verify_independant` n\'est PAS dans `verification`',
       g(applique.verification).verify_independant, undefined);
  egal('⚠️ ni son motif', g(applique.verification).verify_independance_motif, undefined);
  egal('mais il est bien à côté', applique.verify_independant, false);
}

// ═════════════════════════════════════════════════════════════════════════════
// 7 · CE QUE LE CODE NE DOIT PAS CONTENIR
// ═════════════════════════════════════════════════════════════════════════════
{
  const c = codeNu('Parse Input');
  // ⚠️ Aucune table de modèles par fournisseur : ce serait inventer des noms, et
  // le `claude-sonnet-4` mort de #462 montre comment ça vieillit.
  for (const faux of ['gemini-', 'gpt-4', 'mistral-large', 'claude-sonnet-4\'']) {
    ok(`⚠️ aucun nom de modèle tiers en dur (${faux})`,
       c.indexOf(faux) === -1, `trouvé « ${faux} »`);
  }
  ok('l\'ordre de préférence est explicite', /ORDRE_RELECTEURS/.test(c));
  ok('et il exige clé ET modèle',
     /trousseau\[pr\][\s\S]{0,20}modelesTiers\[pr\]/.test(c));
  ok('le trousseau est lu', /plugin_context/.test(c));
  ok('`verifyIndependant` est calculé', /verifyIndependant\s*=/.test(c));
  // Le défaut historique doit rester le repli, jamais être supprimé.
  ok('`claude-sonnet-4-6` reste le repli de modèle', /claude-sonnet-4-6/.test(c));
}

// ═════════════════════════════════════════════════════════════════════════════
// 8 · ⚠️ FUITE DE CLÉ : LA CLÉ DE TRADUCTION NE PART QUE CHEZ SON FOURNISSEUR
// ═════════════════════════════════════════════════════════════════════════════
// Défaut introduit par n8n-workflows#579 et trouvé en écrivant ce fichier.
// Le repli était `(verifyProvider === 'anthropic' ? body.api_key : null)`. Il
// supposait que `body.api_key` EST la clé Anthropic — vrai tant que la
// traduction ne passait que par Anthropic. Depuis #579, `api_key` est la clé du
// fournisseur de TRADUCTION : une traduction Gemini envoie une clé `AIza…`, et
// le repli l'aurait transmise à `api.anthropic.com`.
{
  // Traduction Gemini. Le relecteur retombe sur anthropic (aucun autre
  // candidat), et il ne doit SURTOUT PAS recevoir la clé Google.
  const p = parse({ provider: 'google', api_key: 'AIza-SECRET-GOOGLE',
    plugin_context: { api_keys: { google: 'AIza-SECRET-GOOGLE' } } });
  egal('le relecteur retombe sur anthropic', p.verifyProvider, 'anthropic');
  egal('⚠️ la clé GOOGLE ne lui est PAS transmise', p.verifyCle, null);
  egal('donc la relecture est sautée, proprement', p.verifyActive, false);
  egal('et le motif le nomme', p.verifySautee, 'aucune_cle_pour_anthropic');

  // Même fournisseur des deux côtés : la réutilisation est légitime.
  const q = parse({ provider: 'google', api_key: 'AIza-X',
    verify_provider: 'google', verify_model: 'gemini-2.5-pro',
    plugin_context: { api_keys: { google: 'AIza-X' } } });
  egal('relecteur = traducteur → clé réutilisée', q.verifyCle, 'AIza-X');
  egal('et la relecture a lieu', q.verifyActive, true);
  egal('mais elle est signalée non indépendante', q.verifyIndependant, false);

  // Le code ne doit plus porter l'ancien repli.
  const c = codeNu('Parse Input');
  ok('⚠️ l\'ancien repli `verifyProvider === \'anthropic\'` a disparu',
     !/verifyProvider\s*===\s*'anthropic'\s*\?\s*body\.api_key/.test(c));
  ok('le repli compare le relecteur AU TRADUCTEUR',
     /verifyProvider\s*===\s*provider\s*\?\s*providerCle/.test(c));
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues === 0 ? 0 : 1);
