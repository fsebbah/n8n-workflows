#!/usr/bin/env node
/**
 * Dispatch — paramètres d'échantillonnage refusés par les familles récentes (azy.daily#411)
 *
 * Panne : `/api/llm/vision/describe` en 502, le webhook `llm-call-messages` rendant 400.
 * Cause mesurée le 2026-09-22 sur l'exécution 953404 puis contre les API réelles :
 *
 *   claude-sonnet-5 / claude-opus-5  temperature:0.7 → 400 « `temperature` is deprecated
 *                                    for this model. » ; top_p:0.9 → 400 ; temperature:1 → 200
 *   gpt-5-mini                       temperature:0.7 → 400 « Only the default (1) » ; top_p → 400
 *   claude-sonnet-4-5, claude-haiku-4-5, gpt-4o-mini, mistral-small-latest → 200
 *
 * Ce n'est donc pas une propriété du FOURNISSEUR mais de la GÉNÉRATION du modèle : filtrer
 * par provider retirerait la température là où elle fonctionne encore.
 *
 * Le piège que ce test verrouille : `claude-haiku-4-5-20251001` contient « -5 » sans être
 * un Claude 5. Un motif naïf le priverait de température — panne silencieuse inverse.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHIER = path.join(__dirname, '..', '..', 'workflows', 'LLM_-_Call_Messages.json');

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
const noeud = (nom) => workflow.nodes.find((n) => n.name === nom);

/** Exécute le vrai code de `Validate Input` sur un corps de requête. */
function valider(corps) {
  const code = noeud('Validate Input').parameters.jsCode;
  const ctx = vm.createContext({ $input: { first: () => ({ json: { body: corps } }) }, console });
  return vm.runInContext(`(function () {\n${code}\n})()`, ctx);
}

/** Évalue l'expression `={{ ... }}` du corps HTTP d'un nœud, avec $json = sortie de validation. */
function corpsHttp(nomNoeud, data) {
  const brut = noeud(nomNoeud).parameters.jsonBody;
  const expr = brut.replace(/^=\{\{/, '').replace(/\}\}$/, '');
  const ctx = vm.createContext({ $json: data, console });
  return JSON.parse(vm.runInContext(`(${expr})`, ctx));
}

const REQUETE = (model, extra = {}) => ({
  provider: model.startsWith('claude') ? 'anthropic' : (model.startsWith('gpt') || model.startsWith('o') ? 'openai' : 'mistral'),
  model,
  api_key: 'sk-test',
  messages: [{ role: 'user', content: 'ok' }],
  max_tokens: 64,
  ...extra,
});

console.log('\nDispatch — température refusée par famille de modèle\n');

console.log('La règle porte sur la génération du modèle, pas sur le fournisseur');
for (const [model, attendu] of [
  ['claude-sonnet-5', true],
  ['claude-opus-5', true],
  ['claude-sonnet-5.2', true],
  ['gpt-5-mini', true],
  ['gpt-5.6-terra', true],
  ['o3-pro', true],
  ['claude-sonnet-4-5', false],
  ['claude-haiku-4-5-20251001', false],
  ['claude-3-5-sonnet-20241022', false],
  ['gpt-4o-mini', false],
  ['mistral-small-latest', false],
  ['gemini-2.5-pro', false],
]) {
  const v = valider(REQUETE(model));
  verifier(`${model} → échantillonnage ${attendu ? 'REFUSÉ' : 'accepté'}`,
    v.echantillonnage_refuse === attendu, `obtenu : ${v.echantillonnage_refuse}`);
}

console.log('\nLa règle qui ne vieillit pas : ne jamais inventer de température');
// Mesuré le 2026-09-23 : claude-opus-4-8 → 400 sur temperature 0.7, claude-sonnet-4-6 → 200.
// Un « 4-8 » refuse là où un « 4-6 » accepte : aucune liste de modèles ne peut suivre. La seule
// protection qui ne demande pas d'entretien est de ne transmettre que ce qui a été demandé.
for (const [noeud, model, provider] of [
  ['Anthropic API', 'claude-opus-4-8', 'anthropic'],
  ['Anthropic API', 'claude-sonnet-4-6', 'anthropic'],
  ['OpenAI API', 'gpt-4o-mini', 'openai'],
  ['Mistral API', 'mistral-small-latest', 'mistral'],
]) {
  const sans = corpsHttp(noeud, valider(REQUETE(model)));
  verifier(`${model} sans demande → aucune temperature dans le corps`,
    !('temperature' in sans), JSON.stringify(Object.keys(sans)));
}
const explicite = corpsHttp('Anthropic API', valider(REQUETE('claude-sonnet-4-6', { temperature: 0.2 })));
verifier('claude-sonnet-4-6 avec temperature 0.2 → transmise (elle fonctionne)',
  explicite.temperature === 0.2, JSON.stringify(explicite.temperature));
verifier('la validation accepte l\'absence de température (plus de NaN)',
  valider(REQUETE('claude-sonnet-4-6')).valid === true);
verifier('une température hors bornes reste refusée',
  valider(REQUETE('claude-sonnet-4-6', { temperature: 5 })).valid === false);

console.log('\nDemande explicite ou défaut maison');
verifier('temperature envoyée par l\'appelant → demande explicite',
  valider(REQUETE('claude-sonnet-5', { temperature: 0.2 })).temperature_demandee === true);
verifier('temperature absente → notre défaut de 0.7, pas une demande',
  valider(REQUETE('claude-sonnet-5')).temperature_demandee === false);
verifier('temperature dans context.* → demande explicite aussi',
  valider({ ...REQUETE('claude-sonnet-5'), context: { temperature: 0.3 } }).temperature_demandee === true);

console.log('\nCorps envoyé à Anthropic (le 400 de la panne)');
const sonnet5 = corpsHttp('Anthropic API', valider(REQUETE('claude-sonnet-5', { temperature: 0.7 })));
verifier('claude-sonnet-5 : aucune temperature dans le corps',
  !('temperature' in sonnet5), JSON.stringify(Object.keys(sonnet5)));
verifier('claude-sonnet-5 : aucun top_p dans le corps', !('top_p' in sonnet5));
verifier('claude-sonnet-5 : le reste du corps est intact',
  sonnet5.model === 'claude-sonnet-5' && sonnet5.max_tokens === 64 && Array.isArray(sonnet5.messages),
  JSON.stringify(sonnet5).slice(0, 160));

const sonnet45 = corpsHttp('Anthropic API', valider(REQUETE('claude-sonnet-4-5', { temperature: 0.7 })));
verifier('claude-sonnet-4-5 : la temperature est CONSERVÉE (elle fonctionne)',
  sonnet45.temperature === 0.7, JSON.stringify(sonnet45.temperature));

console.log('\nLe retrait est signalé, jamais tu');
/** Exécute le nœud de signalement sur une réponse de succès. */
function signaler(prev, reponse) {
  const code = noeud('Signal filtre domaines').parameters.jsCode;
  const ctx = vm.createContext({
    $input: { first: () => ({ json: reponse }) },
    $: () => ({ first: () => ({ json: prev }) }),
    console,
  });
  return vm.runInContext(`(function () {\n${code}\n})()`, ctx)[0].json;
}

const REPONSE = { success: true, data: { text: 'ok' }, meta: { provider: 'anthropic' } };
const avecDemande = signaler(valider(REQUETE('claude-sonnet-5', { temperature: 0.2 })), REPONSE);
const w = (avecDemande.meta && avecDemande.meta.warnings) || [];
verifier('temperature demandée puis retirée → avertissement TEMPERATURE_NOT_SUPPORTED',
  w.length === 1 && w[0].code === 'TEMPERATURE_NOT_SUPPORTED', JSON.stringify(w));
verifier('l\'avertissement nomme le modèle en cause',
  w[0] && /claude-sonnet-5/.test(w[0].message || ''), JSON.stringify(w));

const sansDemande = signaler(valider(REQUETE('claude-sonnet-5')), REPONSE);
verifier('aucune demande explicite → pas d\'avertissement (on ne crie pas sur notre défaut)',
  JSON.stringify(sansDemande) === JSON.stringify(REPONSE), JSON.stringify(sansDemande));

const modeleOk = signaler(valider(REQUETE('claude-sonnet-4-5', { temperature: 0.2 })), REPONSE);
verifier('modèle qui accepte la température → réponse inchangée',
  JSON.stringify(modeleOk) === JSON.stringify(REPONSE), JSON.stringify(modeleOk));

console.log('\nContrat existant préservé (azy.daily#361)');
verifier('sans recherche web, meta.domain_filter_applied n\'apparaît toujours pas',
  !('domain_filter_applied' in (avecDemande.meta || {})), JSON.stringify(avecDemande.meta));

const avecFiltre = signaler({
  ...valider(REQUETE('mistral-small-latest', { temperature: 0.2 })),
  web_search: true,
  domain_filter: { allowed_domains: ['python.org'], blocked_domains: [] },
  provider: 'mistral',
}, REPONSE);
verifier('avec recherche web, le filtre de domaines est signalé comme avant',
  avecFiltre.meta.domain_filter_applied === false
  && (avecFiltre.meta.warnings || []).some((x) => x.code === 'DOMAIN_FILTER_NOT_APPLIED'),
  JSON.stringify(avecFiltre.meta));

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
