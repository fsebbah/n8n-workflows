#!/usr/bin/env node
/**
 * Clé normalisée `web_results` sur les trois chercheurs web (azy.daily#476).
 *
 *     node scripts/test/test_476_web_results.js
 *
 * MCP dérive `search_performed` (bool) et `sources_count` (int) depuis
 * `completed_tasks[].data` sur le chemin WS managé. Il ne peut pas connaître trois formes
 * différentes : `data.organic_results` chez SerpAPI, `data.articles` chez GNews,
 * `data.papers` chez Semantic Scholar — avec l'URL nommée `link` chez le premier et `url`
 * chez les deux autres.
 *
 * `data.web_results` + `data.web_results_count` sont donc ajoutés aux trois, EN AJOUT et
 * jamais à la place : les consommateurs des clés spécifiques ne perdent rien (décision de
 * Franck sur azy.daily#458 — on ne jette rien, on restitue tout).
 *
 * ⚠️ Le piège que ce test verrouille : `total_results` est le total ANNONCÉ PAR LE
 * FOURNISSEUR, pas le nombre d'éléments rendus. Chez SerpAPI c'est le nombre de pages que
 * Google prétend avoir — un `sources_count` bâti dessus afficherait des millions.
 * `web_results_count` est la LONGUEUR du tableau, et les contrôles ci-dessous le prouvent
 * en rendant les deux volontairement divergents.
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

const CORPS = { body: { query: 'quantique', execution_mode: 'online' } };

/** Nœud Set en mode raw : on évalue son expression. */
function viaSet(wf, nom, json) {
  const expr = noeud(wf, nom).parameters.jsonOutput
    .replace(/^=\{\{/, '').replace(/\}\}$/, '');
  return vm.runInNewContext(expr, {
    $json: json, $: () => ({ first: () => ({ json: CORPS }) }), JSON, Object,
  });
}

/** Nœud Code : on l'exécute sur une liste d'items. */
function viaCode(wf, nom, json) {
  const ctx = vm.createContext({
    $input: { all: () => [{ json }], first: () => ({ json }) },
    $: () => ({ first: () => ({ json: CORPS }) }),
    Date, JSON, Object, console,
  });
  const r = vm.runInContext(`(function () {\n${noeud(wf, nom).parameters.jsCode}\n})()`, ctx);
  return (Array.isArray(r) ? r[0].json : r.json || r);
}

console.log('\nazy.daily#476 — clé normalisée web_results\n');

console.log('google-searcher (SerpAPI) — et le piège du total annoncé');
{
  const wf = charger('MCP_-_Google_Searcher.json');
  const sortie = viaSet(wf, 'Format Output', {
    organic_results: [
      { position: 1, title: 'A', link: 'https://a.test', snippet: 'sa', displayed_link: 'a.test', source: 'A' },
      { position: 2, title: 'B', link: 'https://b.test', snippet: 'sb', displayed_link: 'b.test', source: 'B' },
    ],
    // Google annonce 1,24 million de pages pour 2 résultats rendus.
    search_information: { total_results: 1240000, time_taken_displayed: 0.41 },
  });
  verifier('web_results normalisé, `link` devenu `url`', sortie.data.web_results,
    [{ title: 'A', url: 'https://a.test', snippet: 'sa', source: 'serpapi' },
     { title: 'B', url: 'https://b.test', snippet: 'sb', source: 'serpapi' }]);
  verifier('web_results_count = longueur du tableau', sortie.data.web_results_count, 2);
  verifier('LE PIÈGE : total_results reste à 1 240 000 et ne sert pas au compte',
    [sortie.data.total_results, sortie.data.web_results_count], [1240000, 2]);
  verifier('organic_results est intact (rien n\'est remplacé)',
    sortie.data.organic_results.map((r) => r.link), ['https://a.test', 'https://b.test']);
  verifier('les autres clés survivent',
    [sortie.success, sortie.data.query, sortie.meta.provider], [true, 'quantique', 'serpapi']);
  verifier('aucune divergence possible : les deux listes ont la même longueur',
    sortie.data.web_results.length === sortie.data.organic_results.length, true);
}

console.log('\nnews-searcher (GNews)');
{
  const wf = charger('MCP_-_News_Searcher.json');
  const sortie = viaCode(wf, 'Format Output', {
    articles: [{ title: 'T', description: 'D', content: 'C', url: 'https://n.test',
                 publishedAt: '2026-10-01', source: { name: 'N', url: 'https://n.test' } }],
    totalArticles: 9312,
  });
  verifier('web_results normalisé', sortie.data.web_results,
    [{ title: 'T', url: 'https://n.test', snippet: 'D', source: 'gnews' }]);
  verifier('web_results_count = 1, pas 9312',
    [sortie.data.web_results_count, sortie.data.meta.total_results], [1, 9312]);
  verifier('articles intact', sortie.data.articles.length, 1);
  verifier('succès et provider inchangés', [sortie.success, sortie.meta.provider], [true, 'gnews']);
}

console.log('\nacademic-searcher (Semantic Scholar)');
{
  const wf = charger('MCP_-_Academic_Searcher.json');
  const sortie = viaCode(wf, 'Format Output', {
    data: [{ paperId: 'p1', title: 'Papier', abstract: 'Résumé', authors: [{ name: 'Z' }],
             year: 2026, citationCount: 4, url: 'https://s.test/p1' }],
    total: 7781,
  });
  verifier('web_results normalisé', sortie.data.web_results,
    [{ title: 'Papier', url: 'https://s.test/p1', snippet: 'Résumé', source: 'semantic-scholar' }]);
  verifier('web_results_count = 1, pas 7781',
    [sortie.data.web_results_count, sortie.data.meta.total_results], [1, 7781]);
  verifier('papers intact', sortie.data.papers.length, 1);
}

console.log('\nRecherche vide : « a cherché, rien trouvé » ≠ « n\'a pas pu chercher »');
{
  const g = viaSet(charger('MCP_-_Google_Searcher.json'), 'Format Output',
    { organic_results: [], search_information: { total_results: 0 } });
  verifier('google : web_results présent et vide, succès vrai',
    [Array.isArray(g.data.web_results), g.data.web_results.length, g.data.web_results_count, g.success],
    [true, 0, 0, true]);
  const n = viaCode(charger('MCP_-_News_Searcher.json'), 'Format Output', { articles: [] });
  verifier('news : web_results présent et vide, succès vrai',
    [Array.isArray(n.data.web_results), n.data.web_results_count, n.success], [true, 0, true]);
}

console.log('\nDérivation `searches_web` du registre');
{
  const { execFileSync } = require('child_process');
  const sortie = JSON.parse(execFileSync('python3',
    [path.join(__dirname, '..', 'audit', 'registre_credential.py'), '--json'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
  const web = sortie.filter((l) => l.searches_web).map((l) => l.tool).sort();
  verifier('exactement les trois chercheurs web', web,
    ['academic-searcher', 'google-searcher', 'news-searcher']);
  const hors = sortie.filter((l) => ['youtube-searcher', 'qdrant-search', 'entity-search',
    'torah-search'].includes(l.tool));
  verifier('catalogue vidéo et corpus internes exclus',
    hors.map((l) => l.searches_web), hors.map(() => false));
}

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
