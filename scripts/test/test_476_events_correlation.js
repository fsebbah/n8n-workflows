#!/usr/bin/env node
/**
 * Notification de fin pour les nekudot et les versets (azy.daily#476).
 *
 *     node scripts/test/test_476_events_correlation.js
 *
 * Trois chemins, trois défauts distincts, mesurés avant d'écrire une ligne :
 *
 *  • `torah-translate-page` lançait bien le Router — donc un lot Anthropic au-delà de 50
 *    segments, donc un `translation_complete` RÉELLEMENT ÉMIS — mais sans propager de
 *    `correlation_id`. L'événement partait avec `null` : correct, et inexploitable.
 *
 *  • `torah-vocalization` ne publiait RIEN. Le plugin ne pouvait que sonder le job, ce qui
 *    ne survit pas à la fenêtre Discord de quinze minutes sur 54 appels séquentiels.
 *
 *  • `Publier Événement` (Torah Batch Callback) n'avait aucun `retryOnFail` : un avis perdu
 *    laissait le plugin attendre une fin déjà survenue, sur des traductions déjà payées.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0;
let ko = 0;
const verifier = (intitule, obtenu, attendu) => {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) { ok += 1; console.log(`  ✓ ${intitule}`); }
  else { ko += 1; console.log(`  ✗ ${intitule}\n      obtenu  : ${a}\n      attendu : ${b}`); }
};
const charger = (f) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'workflows', f), 'utf8'));
const noeud = (wf, nom) => wf.nodes.find((n) => n.name === nom);

console.log('\nazy.daily#476 — correlation_id et événements de fin\n');

console.log('1 · L\'avis de fin n\'est plus perdu au premier échec');
{
  const n = noeud(charger('Torah_Batch_Callback.json'), 'Publier Événement');
  verifier('retryOnFail activé', [n.retryOnFail, n.maxTries], [true, 3]);
  verifier('onError conservé : un échec final ne fait pas tomber le lot déjà sauvegardé',
    n.onError, 'continueRegularOutput');
}

console.log('\n2 · torah-translate-page propage le correlation_id jusqu\'au Router');
{
  const wf = charger('Torah_Translate_Page.json');
  const valider = (corps) => {
    const ctx = vm.createContext({ $input: { first: () => ({ json: { body: corps } }) }, console });
    const r = vm.runInContext(`(function () {\n${noeud(wf, 'Validate Input').parameters.jsCode}\n})()`, ctx);
    return (Array.isArray(r) ? r[0].json : r);
  };
  const BASE = { traite: 'Pesachim', page: '18a', target_language: 'fr', api_key: 'k' };
  verifier('lu depuis le corps', valider({ ...BASE, correlation_id: 'torah-trad-abc' }).correlationId,
    'torah-trad-abc');
  verifier('absent → null, jamais undefined', valider(BASE).correlationId, null);

  const code = noeud(wf, 'Prepare Worker Payload').parameters.jsCode;
  verifier('relayé au Router sous le nom qu\'il lit (`correlation_id`)',
    /correlation_id:\s*data\.correlationId/.test(code), true);

  // Le Router lit bien `body.correlation_id` — sinon la propagation ne servirait à rien.
  const router = charger('Torah_Router.json');
  verifier('le Router lit bien ce champ',
    /correlationId\s*=\s*body\.correlation_id/.test(noeud(router, 'Parse Input').parameters.jsCode),
    true);
}

console.log('\n3 · torah-vocalization propage le correlation_id jusqu\'au worker');
{
  const wf = charger('Torah_Vocalization_(Nekudot).json');
  const corps = noeud(wf, 'Launch Worker (async)').parameters.jsonBody;
  verifier('transmis dans la charge utile du worker',
    /correlation_id:\s*\$\('Validate Input'\)\.first\(\)\.json\.correlationId/.test(corps), true);
  const interieur = corps.slice(corps.indexOf('{{') + 2, corps.lastIndexOf('}}'));
  verifier('aucune accolade adjacente dans l\'expression', interieur.includes('}}'), false);
}

console.log('\n4 · Le worker émet vocalization_complete');
{
  const wf = charger('Torah_Vocalization_Worker.json');
  verifier('les trois points de fin alimentent la préparation',
    ['Complete Job', 'Complete Job (Single)', 'Fail Job'].map((s) =>
      (wf.connections[s].main[0] || []).some((x) => x.node === 'Préparer Fin Vocalisation')),
    [true, true, true]);

  const pub = noeud(wf, 'Publier Fin Vocalisation');
  verifier('la publication a le retryOnFail dès l\'origine',
    [pub.retryOnFail, pub.maxTries], [true, 3]);

  const lancer = (merge, entree) => {
    const ctx = vm.createContext({
      $: (nom) => {
        if (nom === 'Merge Batch Results') {
          if (!merge) throw new Error("node 'Merge Batch Results' has not been executed");
          return { first: () => ({ json: merge }) };
        }
        return { first: () => ({ json: { correlation_id: 'torah-nek-xyz', job_id: 'job_1' } }) };
      },
      $input: { first: () => ({ json: entree || {} }) },
      Date, Number, String, Math, console,
    });
    const r = vm.runInContext(
      `(function () {\n${noeud(wf, 'Préparer Fin Vocalisation').parameters.jsCode}\n})()`, ctx);
    return (Array.isArray(r) ? r[0].json : r);
  };

  const lot = lancer({ summary: { total: 54, errors: 2 } });
  verifier('chemin lot : compteurs justes', [lot.fields.total, lot.fields.ok_count, lot.fields.fail_count],
    ['54', '52', '2']);
  verifier('tout est chaîne, comme translation_complete',
    [typeof lot.fields.total, typeof lot.fields.ok_count, typeof lot.fields.success],
    ['string', 'string', 'string']);
  verifier('correlation_id reposé verbatim', lot.fields.correlation_id, 'torah-nek-xyz');
  verifier('le flux et l\'événement sont les bons',
    [lot.stream, lot.fields.event], ['llm:results:stream', 'vocalization_complete']);

  const toutRate = lancer({ summary: { total: 54, errors: 54 } });
  verifier('tout en échec → ALL_FAILED et success "false"',
    [toutRate.fields.error_code, toutRate.fields.success], ['ALL_FAILED', 'false']);

  // Le piège de `translation_complete` : un seul succès suffit à rendre `success` vrai.
  const presqueTout = lancer({ summary: { total: 54, errors: 53 } });
  verifier('53 échecs sur 54 : success vaut "true" — d\'où ok_count/fail_count',
    [presqueTout.fields.success, presqueTout.fields.ok_count, presqueTout.fields.fail_count],
    ['true', '1', '53']);

  // Chemin élément unique : `Merge Batch Results` n'a pas tourné, `$()` lève.
  const unique = lancer(null, { success: true });
  verifier('élément unique réussi : 1/1, sans exception',
    [unique.fields.total, unique.fields.ok_count, unique.fields.fail_count], ['1', '1', '0']);
  const uniqueKo = lancer(null, { success: false });
  verifier('élément unique en échec : 0/1', 
    [uniqueKo.fields.ok_count, uniqueKo.fields.fail_count], ['0', '1']);
}

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
