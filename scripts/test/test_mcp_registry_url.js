#!/usr/bin/env node
/**
 * MCP - Registry : URL d'appel de l'API n8n (dette #455)
 *
 * Historique des deux pannes du webhook `mcp-registry`, qui répondait 200 avec un corps vide :
 *   1. l'URL était une chaîne littérale pointant sur pi6.local, machine décommissionnée ;
 *   2. une première reprise `={{$env.N8N_API_URL}}/api/v1/workflows` doublait le préfixe,
 *      car la variable contient DÉJÀ /api/v1 → 404 → `Build Registry` ne reçoit rien.
 *
 * Valeur mesurée dans le conteneur n8n de llm.local le 2026-09-20 :
 *   N8N_API_URL=http://localhost:5678/api/v1
 *
 * La version en service (relue par l'API n8n le 2026-09-20) est donc :
 *   ={{$env.N8N_API_URL}}/workflows?active=true&limit=250
 * Le dépôt la reprend verbatim : pas de divergence dépôt / production.
 *
 * Ce test est hors ligne (aucune sonde réseau) : il évalue l'expression comme le fait n8n.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHIER = path.join(__dirname, '..', '..', 'workflows', 'MCP_-_Registry.json');
const ATTENDU = 'http://localhost:5678/api/v1/workflows?active=true&limit=250';

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

/**
 * Évalue une valeur de paramètre n8n de la forme `=texte {{ expression }} texte`.
 * Le préfixe `=` marque l'expression ; chaque {{ }} est évalué puis interpolé en chaîne.
 * Sans ce préfixe, n8n renvoie la chaîne telle quelle — c'était la panne #455.
 */
function evaluerExpression(valeur, env) {
  if (typeof valeur !== 'string' || !valeur.startsWith('=')) return valeur;
  const contexte = vm.createContext({ $env: env });
  return valeur.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, code) => {
    const resultat = vm.runInContext(`(${code})`, contexte);
    return resultat === undefined || resultat === null ? '' : String(resultat);
  });
}

const workflow = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
const noeud = workflow.nodes.find((n) => n.name === 'Get Active Workflows');

console.log('\nMCP - Registry — URL de l\'API n8n\n');

console.log('Structure du nœud');
verifier('le nœud « Get Active Workflows » existe', Boolean(noeud));
if (!noeud) {
  console.log('\nRésultat : 0 ok, 1 échec\n');
  process.exit(1);
}

const url = noeud.parameters?.url;
verifier('l\'URL est une expression n8n (préfixe `=`)',
  typeof url === 'string' && url.startsWith('='),
  `url = ${JSON.stringify(url)}`);
verifier('aucun hôte codé en dur (pi6.local est décommissionné)',
  typeof url === 'string' && !/pi6\.local|llm\.local|host2\.local/.test(url),
  `url = ${JSON.stringify(url)}`);
verifier('le préfixe /api/v1 n\'est pas réécrit dans l\'URL (il vient de la variable)',
  typeof url === 'string' && !url.includes('/api/v1'),
  `url = ${JSON.stringify(url)}`);
verifier('l\'authentification par credential est conservée',
  noeud.parameters?.authentication === 'genericCredentialType'
  && noeud.credentials?.httpHeaderAuth?.id === 'aHxvULwe4es6Gnmh',
  `authentication = ${noeud.parameters?.authentication}`);

console.log('\nÉvaluation avec l\'environnement mesuré sur llm.local');
const resolu = evaluerExpression(url, { N8N_API_URL: 'http://localhost:5678/api/v1' });
verifier(`résout exactement vers ${ATTENDU}`, resolu === ATTENDU, `obtenu : ${resolu}`);
verifier('un seul /api/v1 dans l\'URL finale', !resolu.includes('/api/v1/api/v1'),
  `obtenu : ${resolu}`);
verifier('le chemin appelé est bien /workflows', /\/api\/v1\/workflows\?/.test(resolu),
  `obtenu : ${resolu}`);
verifier('les paramètres de requête sont conservés',
  resolu.includes('active=true') && resolu.includes('limit=250'), `obtenu : ${resolu}`);

console.log('\nContrat d\'environnement (explicite, pas implicite)');
// L'expression dépend d'une propriété de la variable : la documenter par un test
// évite que quelqu'un « nettoie » N8N_API_URL sans voir la casse qu'il provoque.
const sansSuffixe = evaluerExpression(url, { N8N_API_URL: 'http://localhost:5678' });
verifier('N8N_API_URL DOIT se terminer par /api/v1 — sinon l\'URL est invalide',
  sansSuffixe === 'http://localhost:5678/workflows?active=true&limit=250',
  `obtenu : ${sansSuffixe} — si ce contrôle change, adapter docker compose ET ce test`);
const absente = evaluerExpression(url, {});
verifier('variable absente → URL vide et non un appel au mauvais hôte',
  absente === '/workflows?active=true&limit=250', `obtenu : ${absente}`);

console.log('\nRappel de dette (non bloquant)');
// On ne compte que les nœuds vivants : `activeVersion` est l'instantané figé de la
// version déployée, c'est une trace et non la définition ; il n'a pas à être réécrit.
const restants = (JSON.stringify(workflow.nodes).match(/pi6\.local/g) || []).length;
console.log(`  ℹ ${restants} occurrence(s) de pi6.local restante(s) dans « Build Registry » `
  + '(webhook_url, n8n.host, webhook_base). Elles sont PUBLIÉES vers MCP : un repli sur '
  + 'N8N_WEBHOOK_BASE_URL (= http://localhost:5678, mesuré) donnerait une URL inutilisable '
  + 'par un consommateur distant. À trancher avec MCP, hors de cette correction.');

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
