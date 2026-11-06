#!/usr/bin/env node
/**
 * Le registre d'outils doit suivre le curseur de l'API n8n (azy.daily#459).
 *
 *     node scripts/test/test_registre_pagination.js
 *
 * `Get Active Workflows` faisait UN SEUL appel `?active=true&limit=250`. L'API rend alors
 * 250 workflows **et** un `nextCursor`, que personne ne suivait.
 *
 * Mesuré le 2026-10-01 sur le serveur : 258 workflows actifs, 245 porteurs de webhook, et
 * le registre en service publiait **218 outils au lieu de 226**. Huit outils étaient
 * invisibles de MCP — sans aucune erreur. Le registre répondait 200 et annonçait un total
 * qui était faux.
 *
 * Le défaut s'aggrave tout seul : chaque workflow activé pousse un outil de plus au-delà de
 * la frontière. Il était invisible parce que rien ne comparait le nombre d'outils publiés au
 * nombre d'outils existants — c'est ce que ce test fait désormais.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHIER = path.join(__dirname, '..', '..', 'workflows', 'MCP_-_Tools_-_Registry.json');
const wf = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
const noeud = (nom) => wf.nodes.find((n) => n.name === nom);

let ok = 0;
let ko = 0;
const verifier = (intitule, obtenu, attendu) => {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) { ok += 1; console.log(`  ✓ ${intitule}`); }
  else { ko += 1; console.log(`  ✗ ${intitule}\n      obtenu  : ${a}\n      attendu : ${b}`); }
};

/** Exécute le nœud contre une API n8n simulée qui pagine. */
async function lancer(pages, { cleApi = 'k-1' } = {}) {
  const appels = [];
  const ctx = vm.createContext({
    $: () => ({ first: () => ({ json: { headers: { 'x-n8n-api-key': cleApi } } }) }),
    $env: { N8N_API_URL: 'http://llm.local:5678/api/v1/' },
    Set, encodeURIComponent, console,
    helpers: {
      httpRequest: async (opts) => {
        appels.push(opts);
        const u = new URL(opts.url);
        const cur = u.searchParams.get('cursor');
        const i = cur ? pages.findIndex((p) => p.cursor === cur) : 0;
        return pages[i] ? { data: pages[i].data, nextCursor: pages[i].next } : { data: [] };
      },
    },
  });
  const r = await vm.runInContext(
    `(async function () {\n${noeud('Get Active Workflows').parameters.jsCode}\n}).call({ helpers })`,
    ctx);
  return { sortie: Array.isArray(r) ? r[0].json : r.json, appels };
}

const wfs = (n, decalage = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `w${i + decalage}`, name: `W${i + decalage}` }));

/** Comme `wfs`, mais des workflows que `Build Registry` retient réellement comme outils. */
const wfsOutils = (n, decalage = 0) =>
  wfs(n, decalage).map((w) => Object.assign(w, {
    active: true,
    nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: `p-${w.id}`, httpMethod: 'POST' } }],
  }));

/** Exécute `Build Registry` sur la sortie (simulée ou réelle) du nœud amont. */
function lancerRegistre(sortieAmont, { hote = 'llm.local:5678' } = {}) {
  const ctx = vm.createContext({
    $input: { first: () => ({ json: sortieAmont }) },
    $: () => ({ first: () => ({ json: { headers: { host: hote } } }) }),
    $env: {},
    console,
  });
  const r = vm.runInContext(
    `(function () {\n${noeud('Build Registry').parameters.jsCode}\n})()`, ctx);
  return r.json;
}

(async () => {
  console.log('\nRegistre — pagination du curseur\n');

  console.log('LE CAS CASSÉ : 258 actifs, l\'API en rend 250 puis un curseur');
  {
    const { sortie, appels } = await lancer([
      { data: wfs(250), next: 'c2' },
      { cursor: 'c2', data: wfs(8, 250), next: null },
    ]);
    verifier('les 258 sont récupérés, pas 250', sortie.data.length, 258);
    verifier('deux appels, le second portant le curseur',
      appels.map((a) => new URL(a.url).searchParams.get('cursor')), [null, 'c2']);
    verifier('la forme attendue par Build Registry est préservée',
      Array.isArray(sortie.data) && 'data' in sortie, true);
    verifier('aucune troncature signalée', sortie._pagination.tronque, false);
  }

  console.log('\nUne seule page : rien ne change');
  {
    const { sortie, appels } = await lancer([{ data: wfs(42), next: null }]);
    verifier('un seul appel, aucun curseur', appels.length, 1);
    verifier('42 workflows', sortie.data.length, 42);
  }

  console.log('\nLe même workflow sur deux pages : dédoublonné');
  {
    const { sortie } = await lancer([
      { data: wfs(3), next: 'c2' },
      { cursor: 'c2', data: [{ id: 'w2', name: 'W2' }, { id: 'w9', name: 'W9' }], next: null },
    ]);
    verifier('w2 n\'est pas publié deux fois',
      sortie.data.map((w) => w.id), ['w0', 'w1', 'w2', 'w9']);
  }

  console.log('\nGarde-fou : un curseur qui ne progresse jamais');
  {
    const boucle = [{ data: wfs(2), next: 'boucle' }, { cursor: 'boucle', data: wfs(2), next: 'boucle' }];
    const { sortie, appels } = await lancer(boucle);
    verifier('l\'exécution s\'arrête au lieu de boucler', appels.length <= 20, true);
    verifier('et la troncature est SIGNALÉE, pas silencieuse', sortie._pagination.tronque, true);
  }

  console.log('\nLa clé de l\'appelant est bien relayée');
  {
    const { appels } = await lancer([{ data: wfs(1), next: null }], { cleApi: 'cle-appelant' });
    verifier('X-N8N-API-KEY relayée telle quelle',
      appels[0].headers['X-N8N-API-KEY'], 'cle-appelant');
    verifier('active=true conservé',
      new URL(appels[0].url).searchParams.get('active'), 'true');
  }

  console.log('\nLe nœud ne refait pas d\'appel unique');
  {
    const code = noeud('Get Active Workflows').parameters.jsCode;
    verifier('le type de nœud est bien un Code node',
      noeud('Get Active Workflows').type, 'n8n-nodes-base.code');
    verifier('la boucle sur le curseur est présente', /nextCursor/.test(code), true);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LE SECOND DÉFAUT : le diagnostic était calculé, mais il n'arrivait nulle part.
  //
  // `Get Active Workflows` posait `_pagination` depuis #543. `Build Registry` ne le
  // recopiait pas : la réponse ne portait que tools/total_tools/updated_at/version.
  // Mesuré à la source le 2026-11-06 sur le registre en service — `_pagination: None`.
  // Le garde-fou existait et personne ne pouvait le lire. Ces contrôles exigent qu'il
  // traverse le second nœud, pas seulement qu'il soit calculé dans le premier.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\nLe diagnostic traverse `Build Registry` jusqu\'à la réponse');
  {
    const amont = { data: wfsOutils(3), _pagination: { pages: 1, workflows: 3, tronque: false } };
    const rep = lancerRegistre(amont);
    verifier('_pagination présent dans la réponse',
      rep._pagination, { pages: 1, workflows: 3, tronque: false });
    verifier('total_tools reste calculé sur les outils', rep.total_tools, 3);
    verifier('les clés de la réponse incluent _pagination',
      Object.keys(rep).sort(),
      ['_pagination', 'tools', 'total_tools', 'updated_at', 'version'].sort());
  }

  console.log('\nLe cas qui compte : tronque=true doit être LISIBLE par l\'appelant');
  {
    const amont = { data: wfsOutils(5), _pagination: { pages: 20, workflows: 5000, tronque: true } };
    const rep = lancerRegistre(amont);
    verifier('tronque=true remonté tel quel', (rep._pagination || {}).tronque, true);
    verifier('pages remonté', (rep._pagination || {}).pages, 20);
    // ⚠️ C'est tout l'intérêt : total_tools PARAÎT normal alors que le catalogue ment.
    // Sans `_pagination`, rien dans la réponse ne distingue ce cas du précédent.
    verifier('total_tools ne trahit rien à lui seul', rep.total_tools, 5);
  }

  console.log('\nUn amont sans diagnostic ne casse pas la réponse');
  {
    const rep = lancerRegistre({ data: wfsOutils(2) });
    verifier('_pagination vaut null, pas undefined', rep._pagination, null);
    verifier('la réponse reste exploitable', rep.total_tools, 2);
  }

  console.log('\nDe bout en bout : les deux nœuds enchaînés, sans simulation du milieu');
  {
    const { sortie } = await lancer([
      { data: wfsOutils(250), next: 'c2' },
      { cursor: 'c2', data: wfsOutils(8, 250), next: null },
    ]);
    const rep = lancerRegistre(sortie);
    verifier('258 outils publiés après pagination', rep.total_tools, 258);
    verifier('workflows comptés par l\'amont et relayés', (rep._pagination || {}).workflows, 258);
    verifier('tronque=false sur un parc complet', (rep._pagination || {}).tronque, false);
    verifier('pages relayé depuis l\'amont', (rep._pagination || {}).pages, 2);
  }

  console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
  process.exit(ko === 0 ? 0 : 1);
})();
