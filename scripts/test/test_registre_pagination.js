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

  // ──────────────────────────────────────────────────────────────────────────
  // CE QUI ENTRE AU CATALOGUE — règle de Franck du 2026-11-06 :
  // « tous les outils sont récupérés en dehors de torah-corpus-* ».
  //
  // Le filtre précédent (`!name.includes('TORAH')`) était SENSIBLE À LA CASSE : il
  // cachait 14 workflows `TORAH - …` et publiait les 27 `Torah …`, dont les trois
  // torah-corpus-* qui portent 88 % du trafic du parc. Une frontière de catalogue
  // ne doit pas dépendre d'une graphie — ces contrôles exigent qu'elle dépende du
  // CHEMIN DE WEBHOOK, qui est le contrat.
  // ──────────────────────────────────────────────────────────────────────────
  const outilWf = (id, chemin, { nom = null, methode = 'POST' } = {}) => ({
    id, active: true, name: nom || `W ${id}`,
    nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: chemin, httpMethod: methode } }],
  });

  console.log('\nLes torah-corpus-* sortent du catalogue, par le CHEMIN');
  {
    const rep = lancerRegistre({ data: [
      outilWf('a', 'torah-corpus', { nom: 'Torah Corpus' }),
      outilWf('b', 'torah-corpus-sedarim', { nom: 'Torah Corpus Sedarim' }),
      outilWf('c', 'torah-corpus-traites', { nom: 'Torah Corpus Traites' }),
      outilWf('d', 'torah-get-page', { nom: 'TORAH - Get Page' }),
      outilWf('e', 'torah-translate', { nom: 'Torah Translate Simple' }),
    ] });
    verifier('les 3 torah-corpus-* sont absents',
      Object.keys(rep.tools).sort(), ['torah-get-page', 'torah-translate']);
    verifier('total_tools suit', rep.total_tools, 2);
  }

  console.log('\nLa casse du NOM ne décide plus de rien');
  {
    // C'était tout le défaut : `TORAH - Get Page` caché, `Torah Get Page Translations`
    // publié, pour la seule raison que l'un criait et l'autre pas.
    const rep = lancerRegistre({ data: [
      outilWf('a', 'torah-get-page', { nom: 'TORAH - Get Page' }),
      outilWf('b', 'torah-get-page-translations', { nom: 'Torah Get Page Translations' }),
      outilWf('c', 'torah-document-callback', { nom: 'TORAH---Document-Callback' }),
    ] });
    verifier('les trois sont publiés, quelle que soit la graphie',
      Object.keys(rep.tools).sort(),
      ['torah-document-callback', 'torah-get-page', 'torah-get-page-translations']);
  }

  console.log('\nL\'exclusion est ANCRÉE au début du chemin, pas « contient »');
  {
    const rep = lancerRegistre({ data: [
      outilWf('a', 'torah-corpus-futur-variant'),   // préfixe → exclu
      outilWf('b', 'autre-torah-corpus'),           // contient, mais ne commence pas → gardé
      outilWf('c', 'torah-corpusculaire'),          // ⚠️ préfixe aussi → exclu, et c'est assumé
    ] });
    verifier('un futur torah-corpus-* est exclu sans y toucher',
      Object.keys(rep.tools), ['autre-torah-corpus']);
  }

  console.log('\nLes Registry restent exclus, eux');
  {
    const rep = lancerRegistre({ data: [
      outilWf('a', 'mcp/tools/registry', { nom: 'MCP - Tools - Registry' }),
      outilWf('b', 'torah-registry', { nom: 'Torah - Registry' }),
      outilWf('c', 'utile', { nom: 'MCP - Quelque Chose' }),
    ] });
    verifier('le registre ne se publie pas lui-même', Object.keys(rep.tools), ['utile']);
  }

  console.log('\nNon-régression structurelle du filtre');
  {
    const src = noeud('Build Registry').parameters.jsCode;
    // On juge le CODE, pas les commentaires — qui citent l'ancien filtre exprès.
    const sansCommentaires = src.split('\n').map((l) => l.split('//')[0]).join('\n');
    verifier('plus aucun filtre sur le nom « TORAH »',
      /includes\('TORAH'\)/.test(sansCommentaires), false);
    verifier('l\'exclusion est une ancre de début de chemin',
      /EXCLU_DU_CATALOGUE\s*=\s*\/\^torah-corpus\//.test(sansCommentaires), true);
    verifier('elle est appliquée au chemin, pas au nom',
      /EXCLU_DU_CATALOGUE\.test\(String\(webhookPath/.test(sansCommentaires), true);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // `**Surfaces:**` et `**Requires:**` — azy.daily#631
  //
  // ⚠️ Avant ce parseur, poser `**Surfaces:** chat` dans une sticky n'avait AUCUN
  // effet : le nœud ne lisait que Description, InputSchema, Analyzable, Category.
  // C'est le symétrique du défaut de `category`, qui était lisible et vide ; celui-ci
  // aurait été saisi et non lu. Même résultat — un champ inutile sans que personne
  // s'en aperçoive. D'où le contrôle le plus bête de cette section, et le plus utile.
  // ──────────────────────────────────────────────────────────────────────────
  const outilSticky = (chemin, contenu) => ({
    id: chemin, active: true, name: `W ${chemin}`,
    nodes: [
      { type: 'n8n-nodes-base.webhook', parameters: { path: chemin, httpMethod: 'POST' } },
      { type: 'n8n-nodes-base.stickyNote', parameters: { content: contenu } },
    ],
  });

  console.log('\nLe parseur lit les deux champs, et rend des TABLEAUX');
  {
    const rep = lancerRegistre({ data: [
      outilSticky('a', '## A\n\n**Surfaces:** chat, email\n**Requires:** files_in'),
    ] });
    verifier('surfaces en tableau', rep.tools.a.surfaces, ['chat', 'email']);
    verifier('requires en tableau', rep.tools.a.requires, ['files_in']);
  }

  console.log('\nTolérances de saisie : casse, espaces, séparateur');
  {
    const rep = lancerRegistre({ data: [
      outilSticky('a', '**surfaces:**  CHAT ,  Voice_Realtime ,,  AGENDA '),
      outilSticky('b', '**SURFACES:** chat'),
    ] });
    verifier('minusculé, détrimé, vides ignorés',
      rep.tools.a.surfaces, ['chat', 'voice_realtime', 'agenda']);
    verifier('étiquette insensible à la casse', rep.tools.b.surfaces, ['chat']);
  }

  console.log('\n⚠️ ABSENT et [] ne veulent pas dire la même chose');
  {
    const rep = lancerRegistre({ data: [
      outilSticky('a', '## Sans rien'),
      outilSticky('b', '**Surfaces:**'),
      outilSticky('c', '**Surfaces:**   '),
      outilSticky('d', '**Surfaces:** chat\n**Requires:**'),
    ] });
    // `absent` = personne n'a tranché. `[]` serait une décision « nulle part » que
    // personne n'a prise — la fabriquer est le défaut retiré de #557.
    verifier('aucune étiquette → champ ABSENT, pas []', 'surfaces' in rep.tools.a, false);
    verifier('étiquette vide → absent aussi (saisie inachevée)', 'surfaces' in rep.tools.b, false);
    verifier('étiquette blanche → absent', 'surfaces' in rep.tools.c, false);
    verifier('un champ absent n\'empêche pas l\'autre',
      [rep.tools.d.surfaces, 'requires' in rep.tools.d], [['chat'], false]);
  }

  console.log('\nAucune validation : une surface inconnue passe telle quelle');
  {
    // Même règle que les modèles LLM : pas de liste blanche côté n8n. Sinon ajouter
    // une surface au vocabulaire imposerait un réimport de tout le parc.
    const rep = lancerRegistre({ data: [
      outilSticky('a', '**Surfaces:** chat, telepathie, email'),
    ] });
    verifier('surface inconnue relayée', rep.tools.a.surfaces, ['chat', 'telepathie', 'email']);
  }

  console.log('\nLe parseur ne perturbe rien d\'autre');
  {
    const rep = lancerRegistre({ data: [
      outilSticky('a', '## A\n\n**Description:**\nFait des choses\n\n**Category:** torah\n**Surfaces:** chat'),
    ] });
    verifier('Category toujours lue', rep.tools.a.category, 'torah');
    verifier('Description toujours lue', rep.tools.a.description, 'Fait des choses');
    verifier('et Surfaces en plus', rep.tools.a.surfaces, ['chat']);
  }

  console.log('\nNon-régression : AUCUNE dérivation automatique de requires');
  {
    const src = noeud('Build Registry').parameters.jsCode;
    const code = src.split('\n').map((l) => l.split('//')[0]).join('\n');
    // Les deux dérivations proposées étaient fausses : `responseFormat: file` vit sur
    // des httpRequest qui TÉLÉCHARGENT (1 seul workflow rend vraiment un binaire), et
    // 11 outils acceptent octets OU url donc ne requièrent rien. Un examen du JSON ne
    // distingue pas entrée et sortie. Si quelqu'un réintroduit une dérivation, ce
    // contrôle doit rougir et le commentaire du nœud explique pourquoi.
    verifier('aucune dérivation depuis responseFormat',
      /responseFormat/.test(code), false);
    verifier('aucune dérivation depuis respondWith',
      /respondWith/.test(code), false);
    verifier('requires vient UNIQUEMENT de la sticky',
      /const requires = listeStickyNote631\('Requires'\)/.test(code), true);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // `**Tags:**` en sticky note — azy.daily#643
  //
  // ⚠️ POURQUOI PAS LES TAGS n8n : les 268 fichiers du dépôt portent `tags: []`,
  // et l'instance n'en a AUCUN (mesuré). Un tag posé dans l'UI serait donc EFFACÉ
  // au prochain réimport, qui pousse `tags: []`. Un tag qui disparaît à chaque
  // déploiement ne peut pas porter une décision de sécurité.
  //
  // MCP applique un filtre DENY-BY-DEFAULT sur ce champ : un outil tagué
  // `needs_service_token` est REFUSÉ si l'appel ne porte pas de jeton. Donc un tag
  // posé à tort bloque un outil qui marchait — d'où les contrôles d'union.
  // ──────────────────────────────────────────────────────────────────────────
  const outilTag = (chemin, contenu, tagsN8n) => ({
    id: chemin, active: true, name: `W ${chemin}`, tags: tagsN8n,
    nodes: [
      { type: 'n8n-nodes-base.webhook', parameters: { path: chemin, httpMethod: 'POST' } },
      { type: 'n8n-nodes-base.stickyNote', parameters: { content: contenu } },
    ],
  });

  console.log('\nLes tags viennent de la sticky note, et survivent au réimport');
  {
    const rep = lancerRegistre({ data: [
      outilTag('a', '## A\n\n**Tags:** needs_service_token', undefined),
      outilTag('b', '## B\n\n**tags:**  NEEDS_SERVICE_TOKEN , autre ,, ', undefined),
      outilTag('c', '## C\n\nrien', undefined),
    ] });
    verifier('tag lu depuis la sticky', rep.tools.a.tags, ['needs_service_token']);
    verifier('casse et espaces normalisés, vides ignorés',
      rep.tools.b.tags, ['needs_service_token', 'autre']);
    verifier('aucun tag → tableau vide, pas absent', rep.tools.c.tags, []);
  }

  console.log('\nUnion avec les tags n8n — l\'un n\'écrase pas l\'autre');
  {
    const rep = lancerRegistre({ data: [
      outilTag('a', '**Tags:** needs_service_token', [{ name: 'depuis-n8n' }]),
      outilTag('b', '## sans Tags', [{ name: 'depuis-n8n' }]),
    ] });
    verifier('les deux sources coexistent',
      rep.tools.a.tags.sort(), ['depuis-n8n', 'needs_service_token']);
    verifier('un tag n8n seul passe toujours', rep.tools.b.tags, ['depuis-n8n']);
    const dbl = lancerRegistre({ data: [
      outilTag('a', '**Tags:** needs_service_token', [{ name: 'needs_service_token' }]),
    ] });
    verifier('dédoublonné si présent des deux côtés',
      dbl.tools.a.tags, ['needs_service_token']);
  }

  console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
  process.exit(ko === 0 ? 0 : 1);
})();
