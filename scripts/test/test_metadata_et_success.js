#!/usr/bin/env node
/**
 * Deux silences supprimés : la metadata jetée avec le correlation_id, et le succès
 * déclaré sans identifiant.
 *
 *     node scripts/test/test_metadata_et_success.js
 *
 * a · `Torah Batch Dispatcher` mettait `correlation_id` et `client_metadata` dans le MÊME
 *     spread conditionnel. Un appelant qui envoyait sa metadata sans correlation_id la
 *     perdait avec lui — sans erreur, sur un lot déjà payé. Le symptôme (un débit sans
 *     utilisateur) serait apparu très loin de la cause.
 *
 * b · `Torah Save Worker` déclarait `success: input.success !== false` : le succès par
 *     ABSENCE d'un signal négatif. Un 200 d'une autre forme rendait « Translation saved »
 *     avec un identifiant vide. Depuis azy.daily#469 ce chemin déclenche l'indexation côté
 *     torah.api — une sauvegarde qui n'a pas eu lieu n'indexe rien non plus.
 *
 * Les deux correctifs sont NON RÉGRESSIFS : les contrôles ci-dessous vérifient aussi que
 * les cas qui marchaient avant rendent exactement la même chose.
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
const code = (wf, nom) => wf.nodes.find((n) => n.name === nom).parameters.jsCode;

console.log('\na · client_metadata ne dépend plus de correlation_id\n');
{
  const wf = charger('Torah_Batch_Dispatcher.json');
  const lancer = (corps) => {
    const ctx = vm.createContext({ $input: { first: () => ({ json: { body: corps } }) }, console });
    const r = vm.runInContext(`(function () {\n${code(wf, 'Validate Input')}\n})()`, ctx);
    return (Array.isArray(r) ? r[0].json : r);
  };
  const ITEMS = [{ commentary_id: 'c-1', segmentText: 'texte' }];
  const BASE = { items: ITEMS, api_key: 'k', model: 'm', project_id: 'p-1' };
  const META = { discord_user_id: 'u-1', channel_id: 'ch-1', unit_cost: 3 };

  const casse = lancer({ ...BASE, metadata_absente: true, client_metadata: META });
  verifier('LE CAS CASSÉ : metadata sans correlation_id est désormais transmise',
    casse.client_metadata, META);
  verifier('…et aucun correlation_id n\'est inventé', 'correlation_id' in casse, false);

  const nominal = lancer({ ...BASE, correlation_id: 'torah-trad-9', client_metadata: META });
  verifier('cas nominal inchangé : les deux passent',
    [nominal.correlation_id, nominal.client_metadata], ['torah-trad-9', META]);

  const corrSeul = lancer({ ...BASE, correlation_id: 'torah-trad-9' });
  verifier('correlation_id seul : client_metadata reste présent à null (comme avant)',
    [corrSeul.correlation_id, 'client_metadata' in corrSeul, corrSeul.client_metadata],
    ['torah-trad-9', true, null]);

  const aucun = lancer({ ...BASE });
  verifier('ni l\'un ni l\'autre : les deux champs restent OMIS (sortie identique au caractère près)',
    ['correlation_id' in aucun, 'client_metadata' in aucun], [false, false]);
  verifier('la validation passe toujours', aucun.valid, true);
}

console.log('\nb · le succès exige désormais un identifiant\n');
{
  const wf = charger('Torah_Save_Worker.json');
  const lancer = (reponseApi) => {
    const ctx = vm.createContext({ $input: { first: () => ({ json: reponseApi }) }, console });
    const r = vm.runInContext(`(function () {\n${code(wf, 'Format Response')}\n})()`, ctx);
    return (Array.isArray(r) ? r[0].json : r);
  };

  verifier('LE CAS CASSÉ : 200 sans identifiant n\'est plus un succès',
    lancer({ message: 'ok' }).success, false);
  verifier('…et le message ne prétend plus « Translation saved »',
    lancer({ message: 'ok' }).translation_id, null);

  verifier('réponse normale avec translation_id : succès',
    [lancer({ translation_id: 't-1' }).success, lancer({ translation_id: 't-1' }).translation_id],
    [true, 't-1']);
  verifier('tolérance assumée : un `id` nu est accepté et remonté',
    [lancer({ id: 'x-1' }).success, lancer({ id: 'x-1' }).translation_id], [true, 'x-1']);
  verifier('success: false explicite reste un échec, même avec un id',
    lancer({ success: false, translation_id: 't-1' }).success, false);
  verifier('le chemin d\'erreur n8n est intact',
    lancer({ error: { message: 'ENOTFOUND' } }).error.code, 'SAVE_ERROR');
  verifier('les autres champs sont toujours remplis',
    (() => { const r = lancer({ translation_id: 't-1', mode: 'commentary', version: 2 });
      return [r.mode, r.version, r.status]; })(), ['commentary', 2, 'approved']);
}

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
