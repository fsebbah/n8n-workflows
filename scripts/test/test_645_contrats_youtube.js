#!/usr/bin/env node
/**
 * Contrats des deux outils YouTube. azy.daily#642 / #645
 *
 * Les deux publiaient un schéma VIDE. `_build_from_schema` de MCP retire tout champ
 * non déclaré : `youtube-searcher` perdait `query`, son seul champ requis, et rendait
 * « Missing required parameter: query » quoi qu'on lui envoie. Inappelables, pas
 * seulement inutilisés.
 *
 * Le test vérifie les DEUX SENS, parce que les deux erreurs produisent la même panne
 * silencieuse à un cran de distance :
 *   • un champ requis NON déclaré → MCP le supprime, il n'arrive jamais ;
 *   • un champ déclaré que le workflow NE LIT PAS → le LLM croit pouvoir l'utiliser.
 *
 * ⚠️ TOUTE LECTURE PORTE SUR `wf.nodes`, JAMAIS SUR LE FICHIER SÉRIALISÉ.
 * 250 des 269 workflows du dépôt portent un `activeVersion` : un instantané complet,
 * souvent périmé de plusieurs lots — ici 23 nœuds contre 28 dans `nodes`. Il est retiré
 * par `import_workflow`/`update_workflow` avant l'appel à l'API, donc jamais déployé,
 * mais un `grep` sur le fichier rend l'ANCIEN câblage. Un contrôle d'absence fondé sur
 * le texte brut du fichier est faux par construction.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let ok_ = 0, ko = 0;
function ok(nom, cond, det) {
  if (cond) ok_++; else { ko++; console.log(`  ❌ ${nom}` + (det ? `\n       ${det}` : '')); }
}

const charger = (f) => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f), 'utf8'));
const schemaDe = (wf) => {
  const st = wf.nodes.find(n => n.type === 'n8n-nodes-base.stickyNote');
  const m = ((st && st.parameters.content) || '')
    .match(/\*\*InputSchema:\*\*\s*```json\s*([\s\S]*?)```/);
  return { sticky: (st && st.parameters.content) || '', schema: m ? JSON.parse(m[1]) : null };
};
const cheminDe = (wf) => {
  const w = wf.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
  return w && w.parameters.path;
};

// ════════ youtube-searcher ════════════════════════════════════════════════════
{
  const wf = charger('MCP_-_YouTube_Searcher.json');
  const { sticky, schema } = schemaDe(wf);
  ok('searcher → InputSchema publié et valide', !!schema);
  const props = (schema && schema.properties) || {};
  const chemin = cheminDe(wf);

  // L'endpoint annoncé doit être celui qui existe : c'est cette sticky que
  // `Build Registry` publie, et un agent n'a que ça.
  ok(`searcher → endpoint annoncé = \`${chemin}\``,
     sticky.includes(`POST /webhook/${chemin}`), sticky.split('\n')[2]);

  // Champs réellement lus, relevés sur les expressions des nœuds vivants.
  const lus = new Set();
  for (const n of wf.nodes) {
    for (const m of JSON.stringify(n.parameters || {})
      .matchAll(/\$json\.body\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) lus.add(m[1]);
  }
  ok('searcher → le workflow lit bien `query`', lus.has('query'));
  ok('searcher → `query` requis au schéma', (schema.required || []).includes('query'),
     'sans quoi MCP le supprime et l\'outil rend toujours 400');

  for (const champ of Object.keys(props)) {
    ok(`searcher → \`${champ}\` déclaré EST lu par le workflow`, lus.has(champ),
       'déclaré mais jamais lu : le LLM croirait pouvoir s\'en servir');
  }
  // `execution_mode` est lu, mais seulement recopié dans `meta` : aucun effet.
  ok('searcher → `execution_mode` PAS déclaré (recopié dans meta, sans effet)',
     !('execution_mode' in props));
  for (const champ of ['type', 'max_results', 'order']) {
    ok(`searcher → \`${champ}\` porte une liste fermée ou une explication`,
       !!(props[champ] && (props[champ].enum || props[champ].description)));
  }
  // La clé partagée est une décision en attente : elle doit être ÉCRITE, pas tue.
  const cred = wf.nodes.some(n => n.credentials && n.credentials.googleApi);
  ok('searcher → la credential partagée `googleApi` est toujours là', cred);
  ok('searcher → et le schéma le DIT (quota commun, aucune attribution)',
     /PARTAG[ÉE]/i.test(sticky) && /quota/i.test(sticky),
     'une entorse à BYOT non écrite est une entorse invisible');
}

// ════════ youtube-extract ═════════════════════════════════════════════════════
{
  const wf = charger('YOUTUBE_-_Transcribe_and_Extract.json');
  const { sticky, schema } = schemaDe(wf);
  ok('extract → InputSchema publié et valide', !!schema);
  const props = (schema && schema.properties) || {};
  const chemin = cheminDe(wf);

  // ── La sticky annonçait `POST /webhook/recipes-youtube` : un chemin INEXISTANT.
  ok(`extract → endpoint annoncé = \`${chemin}\``,
     sticky.includes(`POST /webhook/${chemin}`));
  ok('extract → l\'ancien chemin `recipes-youtube` n\'est plus annoncé',
     !sticky.includes('recipes-youtube'));

  // ── Le suffixe « recette », vestige de « Recipes - YouTube » ─────────────────
  // `q = {{ query }} recette` : un client cherchant « tutoriel python » cherchait
  // « tutoriel python recette ». Impossible de déclarer `query` honnêtement avec ça.
  const rech = wf.nodes.find(n => n.name === 'Search YouTube');
  const q = rech.parameters.queryParameters.parameters.find(p => p.name === 'q');
  ok('extract → la recherche n\'ajoute plus « recette »', !/recette/.test(q.value), q.value);
  ok('extract → la recherche transmet la requête telle quelle',
     q.value === "={{ $('Validate Input').first().json.query }}", q.value);

  // ── BYOT : aucun repli d'environnement pour une clé de fournisseur ───────────
  // Un client qui oublie sa clé ne doit pas consommer le quota d'Azy en silence.
  // `$env.N8N_WEBHOOK_URL` est une URL d'INFRA, pas un secret de fournisseur : elle reste.
  const vivant = JSON.stringify(wf.nodes);
  ok('extract → plus de repli `$env.GOOGLE_API_KEY`', !vivant.includes('$env.GOOGLE_API_KEY'));
  // ⚠️ LA RÈGLE N'EST PAS « AUCUN SECRET EN $env », ET MON PREMIER CONTRÔLE AVAIT TORT.
  // Il rejetait tout nom finissant par KEY/TOKEN/SECRET, et a donc accusé
  // `N8N_WEBHOOK_SECRET` — qui est le secret HMAC avec lequel n8n SIGNE son propre
  // rappel (RFC-040). C'est un secret d'INFRASTRUCTURE d'Azy : il n'appartient à aucun
  // client, aucun appelant ne peut le fournir, et sa place est bien l'environnement.
  // La règle réelle est : une clé de FOURNISSEUR — facturée au client, propre à lui —
  // vient du corps ; un secret d'infrastructure reste en $env. On liste donc
  // explicitement ce qui est admis, avec son motif, et tout le reste échoue.
  const ENV_ADMIS = {
    N8N_WEBHOOK_URL: 'URL de service interne, pas un secret',
    N8N_WEBHOOK_SECRET: 'secret HMAC de signature du rappel RFC-040, propre à Azy',
  };
  const envs = [...vivant.matchAll(/\$env\.([A-Z_0-9]+)/g)].map(m => m[1]);
  for (const e of new Set(envs)) {
    ok(`extract → \`$env.${e}\` est admis (${ENV_ADMIS[e] || 'MOTIF ABSENT'})`,
       e in ENV_ADMIS,
       'une clé de fournisseur vient du corps ; tout autre $env doit être justifié ici');
  }
  // L'erreur 400 devenue atteignable doit toujours être posée.
  const vi = wf.nodes.find(n => n.name === 'Validate Input');
  ok('extract → la 400 « google_api_key requis » est toujours posée',
     vi.parameters.jsCode.includes('google_api_key requis'));

  // ── Déclaré ⊆ lu : relevé sur les `racine()` et `lire()` de `Validate Input` ──
  const code = vi.parameters.jsCode;
  const lus = new Set();
  for (const m of code.matchAll(/\b(?:racine|lire)\(([^)]*)\)/g)) {
    for (const c of m[1].matchAll(/'([a-zA-Z_][a-zA-Z0-9_]*)'/g)) lus.add(c[1]);
  }
  // Les objets imbriqués ne sont pas des arguments de `lire()` : ils sont déréférencés
  // directement (`body.transcription || ctx.transcription`).
  for (const g of ['transcription', 'extraction', 'preferences', 'context']) {
    if (code.includes(`body.${g}`)) lus.add(g);
  }
  for (const champ of Object.keys(props)) {
    ok(`extract → \`${champ}\` déclaré EST lu par \`Validate Input\``, lus.has(champ),
       'déclaré mais jamais lu');
  }
  // ── Les champs INERTES ne sont pas déclarés ──────────────────────────────────
  ok('extract → `max_videos` PAS déclaré (seule `items[0]` est traitée)',
     !('max_videos' in props),
     'le déclarer promettrait de traiter N vidéos');

  // ── La contrainte que `required` ne sait pas exprimer doit être ÉCRITE ───────
  // `video_url` OU `query` : JSON Schema ne l'exprime pas sans `anyOf`, dont on ne
  // sait pas si MCP l'honore. Ce sont donc les descriptions qui portent la règle,
  // et c'est tout ce que le LLM lit.
  ok('extract → aucun `required` inconditionnel (la contrainte est un OU)',
     !(schema.required || []).length);
  for (const champ of ['video_url', 'query']) {
    ok(`extract → \`${champ}\` dit que l'un des deux est requis`,
       /`video_url` OU `query`|Exige `google_api_key`/.test(props[champ].description || ''),
       props[champ].description);
  }
  // ⚠️ RENVERSÉ LE 2026-11-10 : `google_api_key` devait être déclaré, il ne doit plus
  // l'être. MCP injecte les clés sous `plugin_context.api_keys.<fournisseur>`, APRÈS son
  // filtrage et pour tout outil, dès que l'appelant fournit des clés BYOT. Elles
  // arrivent donc qu'on les déclare ou non — et une clé déclarée est une clé que le LLM
  // peut POSER. Même raisonnement que pour le jeton OAuth des serveurs Google.
  for (const champ of ['google_api_key', 'gemini_api_key', 'anthropic_api_key',
                       'openai_api_key']) {
    ok(`extract → \`${champ}\` PAS déclaré (MCP l'injecte hors schéma)`,
       !(champ in props), 'déclarée, le LLM pourrait la poser');
  }
  for (const g of ['transcription', 'extraction']) {
    ok(`extract → \`${g}.api_key\` PAS déclaré`,
       !('api_key' in ((props[g] || {}).properties || {})));
  }
  // Mais le workflow doit CONTINUER à les lire : les appelants directs (api, chat.api)
  // ne passent pas par le filtre de MCP et les fournissent à plat.
  for (const champ of ['google_api_key', 'gemini_api_key', 'anthropic_api_key',
                       'openai_api_key', 'youtube_api_key']) {
    ok(`extract → le workflow LIT toujours \`${champ}\` dans le corps`,
       code.includes(`'${champ}'`), 'les appelants directs le fournissent à plat');
  }
  // Et il doit lire le coffre de MCP.
  ok('extract → lit `plugin_context.api_keys`', /plugin_context/.test(code));
  // ⚠️ L'ORDRE compte : une clé Gemini n'est pas une clé YouTube Data API v3. Chercher
  // `google` avant `youtube` donnerait un 403 « API not enabled » sur une clé valide.
  const iY = code.indexOf("cle('youtube'");
  ok('extract → `youtube` cherché AVANT `google` pour la recherche', iY > 0,
     'une clé Gemini n\'est pas une clé YouTube Data API v3');
  ok('extract → BYOT strict : aucun repli d\'environnement sur une clé',
     !/\$env\.[A-Z_]*(KEY|TOKEN|SECRET)/.test(JSON.stringify(wf.nodes).replace(/N8N_WEBHOOK_SECRET/g, 'X')),
     'décision de Franck du 2026-11-10');

  // ── Les objets imbriqués portent leur forme, sinon l'agent ne peut pas les remplir
  for (const g of ['transcription', 'extraction']) {
    ok(`extract → \`${g}\` déclare ses sous-champs`,
       !!(props[g] && props[g].type === 'object' && props[g].properties &&
          Object.keys(props[g].properties).length >= 4));
    ok(`extract → \`${g}\` porte une explication`, !!(props[g] && props[g].description));
  }
  // Le vocabulaire fermé relevé sur `MCP - Transcriber`, le service réellement appelé.
  const tr = props.transcription.properties;
  ok('extract → `transcription.operation` porte le vocabulaire de `MCP - Transcriber`',
     JSON.stringify((tr.operation || {}).enum || []) ===
     JSON.stringify(['transcribe', 'identifySpeakers', 'extractOcr', 'analyzeScene',
                     'extractSlides']),
     JSON.stringify((tr.operation || {}).enum));
  // Seul google ingère une URL vidéo : offrir un autre fournisseur serait un leurre.
  ok('extract → `transcription.provider` limité à `google` (seul à ingérer une URL)',
     JSON.stringify((tr.provider || {}).enum || []) === JSON.stringify(['google']));

  // ── Ce que l'appelant doit savoir pour ne pas se faire piéger ───────────────
  ok('extract → le schéma annonce la chaîne LENTE et le mode `callback_url`',
     /LENTE/.test(sticky) && /callback_url/.test(sticky),
     'sans ça, un appel conversationnel part en délai d\'attente');
  ok('extract → le schéma annonce que le transcript est rendu même sans extraction',
     /extraction[\s\S]{0,80}FACULTATIVE|MÊME SI l'extraction échoue/.test(sticky));
}

console.log(`\n${ok_} contrôles réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
