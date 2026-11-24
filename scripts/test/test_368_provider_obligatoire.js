#!/usr/bin/env node
/**
 * chatbot.api#368 — `provider` et `model` sont OBLIGATOIRES sur
 * /api/translations/save-batch. Le lot part en UNE requête : un seul item sans
 * provenance fait répondre 422, et c'est TOUT le lot qui est refusé, traductions
 * déjà payées comprises.
 *
 *     node scripts/test/test_368_provider_obligatoire.js
 *
 * Le test exécute le JavaScript extrait du JSON des workflows : c'est le code qui
 * sera importé, pas une copie.
 *
 * Le défaut, et pourquoi il ne se voyait pas
 * -----------------------------------------
 * `Grouper Sauvegardes` posait `provider` CONDITIONNELLEMENT — « omis plutôt que
 * rempli d'une valeur inventée », ce qui était juste tant que l'API le traitait en
 * optionnel. Et le dispatcher dérive `provider` du NOM du modèle quand l'appelant
 * se tait : `/^claude/i`. Un nom préfixé ou aliasé (`anthropic/claude-sonnet-4-6`,
 * `sonnet-4-6`) ne correspond pas, la dérivation rendait `null`, et le champ
 * disparaissait du corps. Aucun test ne regardait ce croisement, parce que chacune
 * des deux moitiés était correcte isolément.
 *
 * Ce qu'il verrouille
 * -------------------
 *  1. le dispatcher ne met plus JAMAIS `provider: null` dans le metadata du lot ;
 *  2. `Grouper Sauvegardes` pose `provider` sur CHAQUE item, même quand la
 *     metadata du lot est muette — ce qui couvre les lots déjà en vol, dont la
 *     metadata est figée pour 24 h ;
 *  3. non-régression : un `provider` explicite est relayé VERBATIM, jamais écrasé
 *     par le repli ;
 *  4. `model` reste conditionnel, et c'est voulu : lui inventer un repli écrirait
 *     une fausse provenance en base (#443). Il est exigé par le dispatcher, donc
 *     structurellement toujours présent.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const DISPATCHER = lire('Torah_Batch_Dispatcher.json');
const CALLBACK = lire('Torah_Batch_Callback.json');

const code = (wf, nom) => {
  const trouves = wf.nodes.filter(n => n.name === nom);
  if (trouves.length !== 1) throw new Error(`${trouves.length} nœud(s) « ${nom} »`);
  return trouves[0].parameters.jsCode;
};

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(58)} ${JSON.stringify(obtenu)}`
    + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

function executer(src, entree, refs = {}) {
  const env = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: n => {
      if (!(n in refs)) throw new Error(`nœud « ${n} » non fourni`);
      const v = env(refs[n]);
      return { all: () => v, first: () => v[0] };
    },
    $env: { N8N_WEBHOOK_URL: 'http://x', TORAH_API_URL: 'http://api' },
    console, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp, Date,
  };
  return env(vm.runInNewContext(`(function(){${src}})()`, ctx));
}

/** Metadata du lot produite par le dispatcher pour un payload donné. */
function metadataDuLot(surcharge) {
  const valide = {
    valid: true,
    project_id: 'torah',
    api_key: 'sk-ant-x',
    target_language: 'fr',
    items: [{ commentary_id: 'c-1', segmentText: 'בְּרֵאשִׁית',
              sourceLangName: 'hébreu', targetLangName: 'français' }],
    ...surcharge,
  };
  const r = executer(code(DISPATCHER, 'Build Requests'), {},
    { 'Validate Input': valide, 'Résoudre Job': { job_id: 'job-1' } })[0].json;
  return r.metadata;
}

/** Items envoyés à /save-batch par le callback, pour une provenance donnée. */
function itemsEnvoyes(provenance) {
  const entrants = [
    { rang: 0, ok: true, translated_text: 'Au commencement', commentary_id: 'c-1', ...provenance },
    { rang: 1, ok: true, translated_text: 'Et la terre',     segment_id: 's-2',    ...provenance },
    // un échec : il ne doit PAS partir, donc il ne peut pas déclencher de 422
    { rang: 2, ok: false, translated_text: null, commentary_id: 'c-3', ...provenance },
  ];
  const lots = executer(code(CALLBACK, 'Grouper Sauvegardes'), entrants);
  return lots[0].json.items;
}

console.log('\nchatbot.api#368 — provider obligatoire sur /api/translations/save-batch\n');

console.log('1 · Le dispatcher ne met plus jamais provider: null dans la metadata');
// Les trois formes de nom qui échappaient à /^claude/i, mesurées sur des alias réels.
for (const model of ['anthropic/claude-sonnet-4-6', 'sonnet-4-6', 'haiku-4-5']) {
  controle(`model « ${model} », appelant muet`, metadataDuLot({ model }).provider, 'anthropic');
}
controle('model « claude-sonnet-4-6 » (dérivation historique)',
  metadataDuLot({ model: 'claude-sonnet-4-6' }).provider, 'anthropic');
controle('model exigé ⇒ toujours dans la metadata',
  metadataDuLot({ model: 'claude-sonnet-4-6' }).model, 'claude-sonnet-4-6');

console.log('\n2 · Chaque item porte provider, même si la metadata du lot est muette');
// Le cas du lot DÉJÀ EN VOL : sa metadata est figée, le correctif amont ne l'atteint plus.
{
  const items = itemsEnvoyes({ provider: null, model: 'claude-sonnet-4-6', target_language: 'fr' });
  controle('nombre d\'items envoyés (l\'échec est exclu)', items.length, 2);
  controle('items sans provider', items.filter(i => !('provider' in i)).length, 0);
  controle('provider posé par le repli', items.map(i => i.provider), ['anthropic', 'anthropic']);
  controle('model relayé', items.map(i => i.model), ['claude-sonnet-4-6', 'claude-sonnet-4-6']);
}

console.log('\n3 · Non-régression : un provider explicite n\'est jamais écrasé');
{
  const items = itemsEnvoyes({ provider: 'claude+openai', model: 'claude-sonnet-4+gpt-4o' });
  controle('provider verbatim', items.map(i => i.provider), ['claude+openai', 'claude+openai']);
  controle('model verbatim', items[0].model, 'claude-sonnet-4+gpt-4o');
}

console.log('\n4 · model reste SANS repli : pas de provenance inventée (#443)');
{
  const items = itemsEnvoyes({ provider: 'anthropic', model: null });
  controle('model omis plutôt qu\'inventé', items.filter(i => 'model' in i).length, 0);
  controle('provider quand même posé', items.every(i => i.provider === 'anthropic'), true);
}

console.log('\n5 · L\'identifiant reste exclusif (contrat azy.daily#201)');
{
  const items = itemsEnvoyes({ provider: 'anthropic', model: 'claude-sonnet-4-6',
                              target_language: 'fr' });
  controle('jamais commentary_id ET segment_id',
    items.filter(i => i.commentary_id && i.segment_id).length, 0);
  controle('clés de l\'item commentaire', Object.keys(items[0]).sort(),
    ['commentary_id', 'model', 'provider', 'target_language', 'translated_text']);
}

console.log(`\n${echecs.length === 0 ? '✅ tout passe' : `❌ ${echecs.length} échec(s) : ${echecs.join(', ')}`}\n`);
process.exit(echecs.length === 0 ? 0 : 1);
