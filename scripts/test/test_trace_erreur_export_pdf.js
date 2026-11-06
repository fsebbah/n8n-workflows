#!/usr/bin/env node
/**
 * `DOC - Render PDF` doit laisser une trace de ses échecs — azy.daily#355.
 *
 *     node scripts/test/test_trace_erreur_export_pdf.js
 *
 * Le défaut
 * ---------
 * Ce workflow ne laissait AUCUNE trace d'un échec. Deux réglages s'additionnaient :
 *
 *     settings.saveDataSuccessExecution = 'none'   les succès ne sont pas enregistrés
 *     gotenberg.api  onError continueErrorOutput   un 400 part en branche d'erreur,
 *                                                  est mis en forme, et l'exécution
 *                                                  se termine en statut `success`
 *
 * Donc un export, réussi ou proprement échoué, ne laissait rien. « torah-pdf : 0
 * exécution sur 15 relevés » ne disait rien du trafic réel — j'en ai conclu deux fois
 * de travers en deux jours.
 *
 * Et le réglage `none` est JUSTIFIÉ : n8n stocke les binaires en base avec l'exécution
 * (aucun N8N_DEFAULT_BINARY_DATA_MODE dans le conteneur) et ce workflow rend un PDF —
 * 258 Ko pour une page de Talmud. Ces contrôles exigent donc que `none` SURVIVE : une
 * « correction » qui enregistrerait les succès serait une régression, pas un progrès.
 *
 * Ce que le test protège
 * ----------------------
 *  1. le réglage `none` est préservé, et la trace passe par un EFFET, pas par un dossier ;
 *  2. la trace part APRÈS la réponse — l'appelant n'attend jamais Redis ;
 *  3. elle ne porte JAMAIS le binaire ni les données du document ;
 *  4. une panne du service de trace n'altère rien (un échec expliqué ne devient pas
 *     un échec inexpliqué) ;
 *  5. `correlation_id` est ABSENT quand il n'existe pas, jamais une chaîne vide ;
 *  6. le nœud survit à un amont qui n'a pas tourné — `Normalize Error` est atteignable
 *     depuis trois nœuds différents, et référencer un nœud non exécuté LÈVE dans n8n.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHIER = path.join(__dirname, '..', '..', 'workflows', 'DOC_-_Render_PDF.json');
const wf = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
const noeud = (nom) => wf.nodes.find((n) => n.name === nom);
const NOM = "Tracer l'échec";

let ok = 0;
const echecs = [];
const verifier = (intitule, obtenu, attendu) => {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) { ok += 1; console.log(`  ✓ ${intitule}`); }
  else { echecs.push(intitule); console.log(`  ✗ ${intitule}\n      obtenu  : ${a}\n      attendu : ${b}`); }
};

/**
 * Exécute le nœud de trace.
 * @param erreur      sortie de `Normalize Error` (ce que `Respond Error` fait passer)
 * @param demande     sortie de `Validate Input`, ou `null` pour simuler un amont
 *                    qui n'a PAS tourné (n8n lève alors sur `$('Validate Input')`)
 * @param envUrl      $env.REDIS_XADD_SERVICE_URL
 * @param panne       true : le service de trace répond par une erreur
 */
async function tracer(erreur, demande, { envUrl = 'http://host3.local:7000/', panne = false } = {}) {
  const appels = [];
  const journal = [];
  const ctx = vm.createContext({
    $input: { first: () => ({ json: erreur }) },
    $: (nom) => {
      if (nom === 'Validate Input' && demande === null) {
        // Message calqué sur celui de n8n quand un nœud n'a pas été exécuté.
        throw new Error(`Referenced node is unexecuted: ${nom}`);
      }
      return { first: () => ({ json: demande }) };
    },
    $env: envUrl === null ? {} : { REDIS_XADD_SERVICE_URL: envUrl },
    console: { log: (m) => journal.push(String(m)) },
    helpers: {
      httpRequest: async (opts) => {
        appels.push(opts);
        if (panne) throw new Error('ECONNREFUSED host3.local:7000');
        return { ok: true };
      },
    },
  });
  const r = await vm.runInContext(
    `(async function () {\n${noeud(NOM).parameters.jsCode}\n}).call({ helpers })`, ctx);
  return { retour: r, appels, journal };
}

const ERREUR = {
  success: false,
  error: 'Chromium failed to print the PDF; page too large',
  error_code: 'PDF_GENERATION_FAILED',
  http_status: 502,
};
const DEMANDE = {
  url: 'http://webs.local:3100/render/pdf',
  corps: {
    template: 'bavli-visavis',
    filename: 'Pesachim_20a.pdf',
    // ⚠️ volumineux et porteur de texte utilisateur : ne doit JAMAIS sortir.
    data: { massekhet: 'Pesachim', daf: '20a', paragraphes: ['SECRET-DU-DOCUMENT'.repeat(50)] },
  },
  correlation_id: 'corr-42',
};

(async () => {
  console.log('\nDOC - Render PDF — trace des échecs\n');

  console.log('Le réglage qui crée l\'angle mort est PRÉSERVÉ (le corriger serait la régression)');
  {
    verifier('saveDataSuccessExecution reste « none »',
      wf.settings.saveDataSuccessExecution, 'none');
    verifier('saveExecutionProgress reste false', wf.settings.saveExecutionProgress, false);
    // C'est le point de conception : la trace est un EFFET, pas un dossier d'exécution.
    verifier('le nœud de trace existe', typeof (noeud(NOM) || {}).type, 'string');
    verifier('c\'est un Code node', noeud(NOM).type, 'n8n-nodes-base.code');
  }

  console.log('\nLa trace part APRÈS la réponse — l\'appelant n\'attend pas Redis');
  {
    const depuis = (n) => ((wf.connections[n] || {}).main || []).map(
      (s) => (s || []).map((x) => x.node));
    verifier('Respond Error → Tracer l\'échec', depuis('Respond Error'), [[NOM]]);
    verifier('Normalize Error va toujours à Respond Error', depuis('Normalize Error'), [['Respond Error']]);
    // Une sortie depuis Normalize Error ferait courir la trace AVANT la réponse.
    verifier('le nœud n\'est pas branché en parallèle de la réponse',
      depuis('Normalize Error').flat().includes(NOM), false);
    verifier('un échec de trace ne fait pas échouer l\'exécution',
      noeud(NOM).onError, 'continueRegularOutput');
    verifier('la branche est terminale (elle ne réinjecte rien)',
      (wf.connections[NOM] || null), null);
  }

  console.log('\nCe qui est publié');
  {
    const { retour, appels } = await tracer(ERREUR, DEMANDE);
    verifier('un seul appel', appels.length, 1);
    verifier('vers /xadd', appels[0].url, 'http://host3.local:7000/xadd');
    verifier('stream dédié aux erreurs', appels[0].body.stream, 'n8n:errors:stream');
    verifier('max_len borné', appels[0].body.max_len, 5000);
    const f = appels[0].body.fields;
    verifier('event', f.event, 'document_render_failed');
    verifier('error_code', f.error_code, 'PDF_GENERATION_FAILED');
    verifier('http_status en CHAÎNE (convention des streams)', f.http_status, '502');
    verifier('template', f.template, 'bavli-visavis');
    verifier('filename', f.filename, 'Pesachim_20a.pdf');
    verifier('format déduit de l\'URL de rendu', f.format, 'pdf');
    verifier('correlation_id relayé', f.correlation_id, 'corr-42');
    verifier('horodatage en UTC avec le Z', /Z$/.test(f.failed_at), true);
    verifier('la branche ne réinjecte rien', retour, []);
  }

  console.log('\n⚠️ Ce qui ne doit JAMAIS sortir');
  {
    const { appels } = await tracer(ERREUR, DEMANDE);
    const charge = JSON.stringify(appels[0].body);
    verifier('aucune donnée du document', /SECRET-DU-DOCUMENT/.test(charge), false);
    verifier('pas de champ data', 'data' in appels[0].body.fields, false);
    verifier('aucun binaire', /binary|base64/i.test(charge), false);
    // La charge doit rester un diagnostic, pas un journal : un ordre de grandeur suffit.
    verifier('charge compacte (< 1 Ko)', charge.length < 1024, true);
  }

  console.log('\nLe message long est tronqué');
  {
    const longue = Object.assign({}, ERREUR, { error: 'x'.repeat(900) });
    const { appels } = await tracer(longue, DEMANDE);
    verifier('error_message tronqué à 300', appels[0].body.fields.error_message.length, 300);
  }

  console.log('\n⚠️ correlation_id ABSENT, jamais une chaîne vide');
  {
    const sansCorr = Object.assign({}, DEMANDE, { correlation_id: null });
    const { appels } = await tracer(ERREUR, sansCorr);
    // Un repli `|| ''` publierait du vide qui a l'air présent : un consommateur
    // croirait tenir un identifiant d'appariement et n'apparierait rien.
    verifier('le champ n\'est pas posé du tout',
      'correlation_id' in appels[0].body.fields, false);
    verifier('mais la trace part quand même', appels.length, 1);
  }

  console.log('\nUn amont qui n\'a pas tourné ne fait pas tomber le nœud');
  {
    // `Normalize Error` est atteignable depuis Validate Input, gotenberg.api ET
    // Préparer catalogue. Dans le dernier cas `Validate Input` n'a jamais tourné, et
    // n8n LÈVE sur la référence — un `?.` n'y suffirait pas, d'où le try/catch.
    const { appels, retour } = await tracer(ERREUR, null);
    verifier('la trace part quand même', appels.length, 1);
    verifier('template vide plutôt qu\'une exception', appels[0].body.fields.template, '');
    verifier('error_code conservé', appels[0].body.fields.error_code, 'PDF_GENERATION_FAILED');
    verifier('aucune exception remontée', retour, []);
  }

  console.log('\nUne panne du service de trace n\'altère rien');
  {
    const { appels, retour, journal } = await tracer(ERREUR, DEMANDE, { panne: true });
    verifier('l\'appel a bien été tenté', appels.length, 1);
    verifier('aucune exception remontée', retour, []);
    verifier('la panne est journalisée', journal.some((m) => /trace non publiée/.test(m)), true);
    verifier('timeout court, pour ne pas retenir l\'exécution', appels[0].timeout, 5000);
  }

  console.log('\nSans URL de service, le nœud est inoffensif');
  {
    const { appels, retour, journal } = await tracer(ERREUR, DEMANDE, { envUrl: null });
    verifier('aucun appel', appels.length, 0);
    verifier('aucune exception', retour, []);
    verifier('et c\'est dit dans le journal',
      journal.some((m) => /REDIS_XADD_SERVICE_URL absent/.test(m)), true);
  }

  console.log(`\nRésultat : ${ok} ok, ${echecs.length} échec(s)\n`);
  if (echecs.length) { echecs.forEach((e) => console.log(`  - ${e}`)); process.exit(1); }
})();
