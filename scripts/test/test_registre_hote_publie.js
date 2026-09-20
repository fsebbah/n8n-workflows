#!/usr/bin/env node
/**
 * Registre MCP : l'hôte publié dans webhook_url
 *
 * Le registre `mcp/tools/registry` sert à MCP la liste des outils n8n avec, pour chacun,
 * une `webhook_url` complète. MCP tourne sur une AUTRE machine : cette URL doit être
 * joignable depuis l'extérieur.
 *
 * Défaut mesuré le 2026-09-20 (exécution 938842, appel réel de MCP) :
 *   "webhook_url": "http://pi6.local:5678/webhook/mcp-test-echo"   sur 217 outils
 * parce que `Build Registry` faisait `$env.WEBHOOK_URL || 'http://pi6.local:5678/'`
 * et que WEBHOOK_URL est ABSENTE du conteneur (vérifié par docker inspect) — donc le
 * repli s'appliquait, vers une machine décommissionnée.
 *
 * Pièges écartés, mesurés le même jour dans le conteneur :
 *   N8N_WEBHOOK_BASE_URL=http://localhost:5678  → inutilisable par un appelant distant
 *   N8N_WEBHOOK_URL=http://localhost:5678       → idem
 * D'où le choix de l'en-tête `host` de la requête entrante : l'hôte par lequel l'appelant
 * nous a effectivement joints (mesuré : `llm.local:5678`).
 *
 * Ce test exécute le vrai code du nœud hors n8n (contexte `vm`, $input/$env/$ simulés)
 * et vérifie l'URL PRODUITE, pas seulement le texte du code.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', '..', 'workflows');

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

function noeud(fichier, nom) {
  const w = JSON.parse(fs.readFileSync(path.join(RACINE, fichier), 'utf8'));
  return { workflow: w, noeud: w.nodes.find((n) => n.name === nom) };
}

/** Un workflow n8n factice, avec un nœud Webhook, tel que l'API en renvoie. */
const OUTIL_FACTICE = {
  id: 'AbCdEf123',
  name: 'MCP - Outil Témoin',
  active: true,
  nodes: [
    { name: 'Webhook', type: 'n8n-nodes-base.webhook', parameters: { path: 'outil-temoin' }, webhookId: 'x' },
    { name: 'Code', type: 'n8n-nodes-base.code', parameters: {} },
  ],
};

/**
 * Exécute le code de `Build Registry` avec un contexte n8n simulé.
 * `host` = valeur de l'en-tête Host de la requête entrante (undefined = absent).
 */
function construireRegistre(code, { env = {}, host } = {}) {
  const entree = [{ json: { data: [OUTIL_FACTICE] } }];
  const contexte = vm.createContext({
    $input: { first: () => entree[0], all: () => entree },
    $env: env,
    $: (nom) => {
      if (nom !== 'Webhook Registry') throw new Error(`nœud inattendu : ${nom}`);
      return { first: () => ({ json: { headers: host === undefined ? {} : { host } } }) };
    },
    $json: entree[0].json,
    console,
  });
  // Le Code node reçoit le corps tel quel et doit retourner un item ; on l'enveloppe.
  return vm.runInContext(`(function () {\n${code}\n})()`, contexte);
}

console.log('\nRegistre MCP — hôte publié dans webhook_url\n');

/* ------------------------------------------------------------------ Registre */
console.log('MCP - Tools - Registry (chemin mcp/tools/registry, celui qu\'appelle MCP)');
const reg = noeud('MCP_-_Tools_-_Registry.json', 'Build Registry');
verifier('le nœud « Build Registry » existe', Boolean(reg.noeud));

const codeRegistre = reg.noeud?.parameters?.jsCode || '';
verifier('plus aucun hôte décommissionné dans les nœuds vivants',
  !JSON.stringify(reg.workflow.nodes).includes('pi6.local'));

const cas = [
  ['en-tête Host de l\'appelant (cas réel de MCP)', { host: 'llm.local:5678' }, 'http://llm.local:5678/webhook/outil-temoin'],
  ['autre hôte appelant (staging)', { host: 'host2.local:5678' }, 'http://host2.local:5678/webhook/outil-temoin'],
  ['WEBHOOK_URL explicite : elle prime', { env: { WEBHOOK_URL: 'https://n8n.azy.solutions/' }, host: 'llm.local:5678' },
    'https://n8n.azy.solutions/webhook/outil-temoin'],
  ['aucun en-tête Host (appel interne) → repli llm.local', {}, 'http://llm.local:5678/webhook/outil-temoin'],
];

for (const [intitule, options, attendu] of cas) {
  let obtenu;
  let erreur = null;
  try {
    const r = construireRegistre(codeRegistre, options);
    const sortie = Array.isArray(r) ? r[0].json : (r.json || r);
    obtenu = sortie.tools['outil-temoin']?.webhook_url;
  } catch (e) {
    erreur = e.message;
  }
  verifier(`${intitule} → ${attendu}`, !erreur && obtenu === attendu,
    erreur ? `exception : ${erreur}` : `obtenu : ${obtenu}`);
}

/* ------------------------------------------------------------------ Enricher */
console.log('\nMCP - Tools Enricher (webhook + Manual Trigger)');
const enr = noeud('MCP_-_Tools_Enricher.json', 'Prepare Qdrant');
verifier('plus aucun hôte décommissionné dans les nœuds vivants',
  !JSON.stringify(enr.workflow.nodes).includes('pi6.local'));
const codeEnricher = enr.noeud?.parameters?.jsCode || '';
verifier('l\'hôte y vient de l\'environnement, pas d\'un nœud Webhook',
  codeEnricher.includes("$env.WEBHOOK_URL") && !/\$\('Webhook'\)/.test(codeEnricher),
  'ce workflow a aussi un Manual Trigger : $(\'Webhook\') y lèverait une erreur');

const urlApi = (noeud('MCP_-_Tools_Enricher.json', 'Get Workflows').noeud?.parameters?.url) || '';
verifier('le repli de l\'URL d\'API pointe sur un hôte vivant',
  urlApi.includes('llm.local') && !urlApi.includes('pi6.local'), `url = ${urlApi}`);

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
