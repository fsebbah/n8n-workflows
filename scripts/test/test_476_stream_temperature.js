#!/usr/bin/env node
/**
 * LLM - Call Stream — ne jamais inventer de température (azy.mob#476, azy.daily#411)
 *
 * Le mobile signale des `stream_interrupted` sur `/api/llm/chat/stream` sans envoyer ni
 * `temperature` ni `reasoning`, et demande si n8n en injecte une.
 *
 * ⚠️ Mesuré le 2026-09-24 : **ce chemin ne passe pas par n8n**. `LLM - Call Stream` et
 * `Claude - Call Stream With Skills` ont **0 exécution** sur la fenêtre de rétention (2 j) ;
 * MCP génère lui-même dès que `messages` est fourni (`llm_streaming/generator.drive_stream`),
 * et chat.api en met toujours. Le workflow n8n est le « flux historique ».
 *
 * Le défaut y dormait pourtant à l'identique de celui corrigé dans le dispatch (#523) :
 *   const temperature = parseFloat(body.temperature ?? ctx.temperature ?? 0.7);
 * Mesuré chez Anthropic le 23/09 : claude-opus-4-8 et claude-sonnet-5 rendent 400
 * « `temperature` is deprecated for this model. », claude-sonnet-4-6 l'accepte — aucun motif
 * sur le nom ne tient. Corrigé avant tout incident, pour que la voie historique ne puisse pas
 * réintroduire la panne si elle est réactivée un jour.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHIER = path.join(__dirname, '..', '..', 'workflows', 'LLM_-_Call_Stream.json');

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

/** Exécute le Code node de validation sur un corps de requête. */
function valider(corps) {
  const ctx = vm.createContext({ $input: { first: () => ({ json: { body: corps } }) }, console });
  return vm.runInContext(`(function () {\n${noeud('Validate Input').parameters.jsCode}\n})()`, ctx);
}

/** Évalue le corps HTTP d'un nœud de flux, avec la requête validée en entrée. */
function corpsDe(nom, req) {
  const brut = noeud(nom).parameters.jsonBody;
  const expr = brut.replace(/^=\{\{/, '').replace(/\}\}$/, '');
  return JSON.parse(vm.runInNewContext(expr, { $json: { stream_request: req } }));
}

const REQUETE = (extra = {}) => ({
  model: 'claude-opus-4-8', messages: [{ role: 'user', content: 'x' }],
  max_tokens: 64, system: null, api_key: 'k', temperature: null, ...extra,
});

console.log('\nLLM - Call Stream — température jamais inventée\n');

console.log('Validation : plus de défaut maison');
// callback_url et correlation_id sont requis : sans eux la validation refuse avant même
// de regarder la température, et le contrôle ne dirait rien.
const REQ_VALIDE = { provider: 'anthropic', model: 'claude-opus-4-8', api_key: 'k',
  messages: [{ role: 'user', content: 'x' }], max_tokens: 64,
  callback_url: 'https://api.test/cb', correlation_id: 'c-1' };
const v = valider(REQ_VALIDE);
const sortie = Array.isArray(v) ? v[0].json : v;
verifier('la requête d\'essai est bien acceptée', sortie.valid === true, JSON.stringify(sortie.errors));
verifier('sans temperature dans la requête → null, pas 0.7',
  sortie.temperature === null, JSON.stringify(sortie.temperature));
verifier('une temperature demandée est conservée par la validation',
  valider({ ...REQ_VALIDE, temperature: 0.2 }).temperature === 0.2
  || (Array.isArray(valider({ ...REQ_VALIDE, temperature: 0.2 }))
      && valider({ ...REQ_VALIDE, temperature: 0.2 })[0].json.temperature === 0.2));
verifier('le code ne contient plus le repli `?? 0.7`',
  !/\?\?\s*0\.7/.test(noeud('Validate Input').parameters.jsCode));

console.log('\nCorps des quatre fournisseurs');
for (const nom of ['Anthropic Stream', 'OpenAI Stream', 'Mistral Stream', 'Gemini Stream']) {
  const lire = (c) => (nom === 'Gemini Stream' ? c.generationConfig.temperature : c.temperature);
  const sans = corpsDe(nom, REQUETE());
  const avec = corpsDe(nom, REQUETE({ temperature: 0.2 }));
  verifier(`${nom} : aucune température quand l'appelant n'en demande pas`,
    lire(sans) === undefined, JSON.stringify(sans).slice(0, 120));
  verifier(`${nom} : la température demandée est transmise`,
    lire(avec) === 0.2, JSON.stringify(avec).slice(0, 120));
  verifier(`${nom} : le reste du corps est intact`,
    JSON.stringify(sans).includes('"model"') || JSON.stringify(sans).includes('"contents"'),
    JSON.stringify(Object.keys(sans)));
}

console.log('\nLe flux lui-même reste demandé');
for (const nom of ['Anthropic Stream', 'OpenAI Stream', 'Mistral Stream']) {
  const c = corpsDe(nom, REQUETE());
  verifier(`${nom} : stream toujours activé`, c.stream === true, JSON.stringify(c.stream));
}

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
