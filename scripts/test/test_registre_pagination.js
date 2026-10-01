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

  console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
  process.exit(ko === 0 ? 0 : 1);
})();
