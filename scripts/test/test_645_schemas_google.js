#!/usr/bin/env node
/**
 * Le schéma publié doit dire la VÉRITÉ sur ce que le nœud honore.
 *
 * Deux erreurs symétriques produisent la même panne silencieuse :
 *  • un champ requis ABSENT du schéma → MCP le supprime, il n'arrive jamais ;
 *  • un champ IGNORÉ par le nœud mais DÉCLARÉ → le LLM croit pouvoir filtrer.
 * MCP l'a formulé ainsi : « un schéma qui promet ce que le nœud n'honore pas,
 * c'est reproduire la panne un cran plus loin. » Ces contrôles vérifient les deux.
 *
 * La matrice est RÉGÉNÉRÉE à chaque exécution : le test compare le schéma au
 * câblage actuel, jamais à une copie figée.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let ok_ = 0, ko = 0;
function ok(nom, cond, det) {
  if (cond) ok_++; else { ko++; console.log(`  ❌ ${nom}` + (det ? `\n       ${det}` : '')); }
}
const egal = (nom, a, b) => ok(nom, a === b, `attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);

// ⚠️ Le script sort en code 2 dès qu'il reste une route morte — c'est voulu de sa
// part. `execFileSync` lève alors ; on récupère la sortie sur l'objet d'erreur.
let matrice;
try {
  matrice = execFileSync('python3',
    [path.join(RACINE, 'scripts', 'audit', 'matrice_contrat_mcp.py')], { encoding: 'utf8' });
} catch (e) {
  matrice = e.stdout || '';
}
ok('la matrice se régénère', matrice.includes('## `mcp-gmail`'), matrice.slice(0, 200));

function lireMatrice(texte) {
  const par = {};
  let courant = null;
  for (const ligne of texte.split('\n')) {
    const m = ligne.match(/^## `([^`]+)`/);
    if (m) { courant = m[1]; par[courant] = { saines: [], mortes: [] }; continue; }
    if (!courant) continue;
    // | `resource` | `operation` | champs HONORÉS | listing | champs IGNORÉS |
    const mm = ligne.match(/^\| `([^`]+)` \| `([^`]+)` \| (.*?) \| (.*?) \| (.*?) \|$/);
    if (mm) {
      const champs = (s) => s === '—' ? [] : [...s.matchAll(/`([a-zA-Z_][a-zA-Z0-9_]*)`/g)].map(x => x[1]);
      par[courant].saines.push({ resource: mm[1], operation: mm[2],
        honores: champs(mm[3]), cherchable: mm[4].includes('cherchable'), ignores: champs(mm[5]) });
      continue;
    }
    const mo = ligne.match(/^- `([^\/`]+)\/([^`]+)` — MORTE/);
    if (mo) par[courant].mortes.push({ resource: mo[1], operation: mo[2] });
  }
  return par;
}

const M = lireMatrice(matrice);
const FICHIERS = {
  'mcp-gmail': 'MCP_-_Gmail_Server_(All-in-One).json',
  'mcp-calendar': 'MCP_-_Google_Calendar_Server.json',
  'mcp-contacts': 'MCP_-_Google_Contacts_Server.json',
  'mcp-drive': 'MCP_-_Google_Drive_Server.json',
};

for (const [chemin, fichier] of Object.entries(FICHIERS)) {
  const wf = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', fichier), 'utf8'));
  const sticky = wf.nodes.find(n => n.type === 'n8n-nodes-base.stickyNote');
  ok(`${chemin} → sticky note présente`, !!sticky);
  if (!sticky) continue;
  const bloc = (sticky.parameters.content || '').match(/\*\*InputSchema:\*\*\s*```json\s*([\s\S]*?)```/);
  ok(`${chemin} → InputSchema publié`, !!bloc);
  if (!bloc) continue;
  let schema; try { schema = JSON.parse(bloc[1]); } catch (e) { ok(`${chemin} → JSON valide`, false, e.message); continue; }
  ok(`${chemin} → JSON valide`, true);
  const props = schema.properties || {};
  const svc = M[chemin];
  ok(`${chemin} → présent dans la matrice`, !!svc);
  if (!svc) continue;

  egal(`${chemin} → \`operation\` requis`, (schema.required || []).includes('operation'), true);
  ok(`${chemin} → \`oauth_token\` déclaré`, 'oauth_token' in props);
  ok(`${chemin} → \`access_token\` déclaré`, 'access_token' in props);

  // ── 1 · Tout champ HONORÉ est déclaré, sinon MCP le supprime ──────────────
  for (const p of svc.saines) {
    for (const champ of p.honores) {
      ok(`${chemin} ${p.resource}/${p.operation} → \`${champ}\` déclaré`, champ in props,
         'absent du schéma → MCP le supprimera');
    }
  }

  // ── 2 · Aucun champ IGNORÉ n'est déclaré — l'exigence de MCP ──────────────
  const ignores = new Set(svc.saines.flatMap(p => p.ignores));
  const honores = new Set(svc.saines.flatMap(p => p.honores));
  for (const champ of ignores) {
    if (honores.has(champ)) continue;          // honoré ailleurs : légitime
    ok(`${chemin} → \`${champ}\` (ignoré par le nœud) PAS déclaré`, !(champ in props),
       'le déclarer ferait croire à un filtrage qui n\'a pas lieu');
  }

  // ── 3 · L'enum n'offre que des opérations saines ──────────────────────────
  const opsSaines = new Set(svc.saines.map(p => p.operation));
  for (const op of props.operation.enum || []) {
    ok(`${chemin} → enum \`${op}\` est une opération saine`, opsSaines.has(op));
  }
  for (const m of svc.mortes) {
    if (opsSaines.has(m.operation)) continue;  // même nom, autre ressource : saine
    ok(`${chemin} → morte \`${m.resource}/${m.operation}\` absente de l'enum`,
       !(props.operation.enum || []).includes(m.operation),
       'un agent pourrait appeler une route morte');
  }

  // ── 4 · Le jeton, lu en tolérant, et jamais depuis $env ──────────────────
  const brut = JSON.stringify(wf);
  ok(`${chemin} → lecture \`oauth_token || access_token\``,
     brut.includes('$json.body.oauth_token || $json.body.access_token'));
  ok(`${chemin} → aucun \`$env\` porteur de jeton`, !/\$env\.[A-Z_]*(TOKEN|KEY)/.test(brut));
}

// ── 5 · Le piège de TYPE : le nœud découpe `labelIds` comme une CHAÎNE ──────
// `(this.getNodeParameter('labelIds', i) as string).split(',')` → un tableau y
// lève « split is not a function ». Le schéma déclare `label_ids` en array, donc
// l'expression DOIT convertir. Sans ce contrôle, les trois routes d'étiquettes
// passaient pour saines et cassaient à l'exécution.
const gmail = JSON.parse(fs.readFileSync(
  path.join(RACINE, 'workflows', 'MCP_-_Gmail_Server_(All-in-One).json'), 'utf8'));
for (const nom of ['addLabels', 'removeLabels', 'addLabelThread']) {
  const n = gmail.nodes.find(x => x.name === nom);
  ok(`gmail ${nom} → nœud présent`, !!n);
  if (!n) continue;
  const expr = String(n.parameters.labelIds || '');
  ok(`gmail ${nom} → \`label_ids\` converti en chaîne pour le nœud`,
     expr.includes('join(') && expr.includes('Array.isArray'), expr);
}

// ── 6 · Les 4 routes réparées pointent sur ce que le nœud implémente ────────
const ATTENDU = { search: 'search', markAsRead: 'markRead',
                  markAsUnread: 'markUnread', addLabelThread: 'modify' };
for (const [nom, op] of Object.entries(ATTENDU)) {
  const n = gmail.nodes.find(x => x.name === nom);
  egal(`gmail ${nom} → operation = \`${op}\``, n && n.parameters.operation, op);
}
// ⚠️ thread/removeLabels NE DOIT PAS être mappé sur `modify` : `thread/modify`
// n'AJOUTE que des étiquettes. Le mapper en AJOUTERAIT au lieu d'en retirer.
const rm = gmail.nodes.find(x => x.name === 'removeLabelThread');
ok('gmail removeLabelThread → PAS mappé sur `modify` (il ajouterait au lieu de retirer)',
   rm && rm.parameters.operation !== 'modify', rm && rm.parameters.operation);

// Le corps d'un message accepte les DEUX noms, pour ne casser aucun appelant.
for (const nom of ['reply', 'createDraft']) {
  const n = gmail.nodes.find(x => x.name === nom);
  const b = String((n && n.parameters.body) || '');
  ok(`gmail ${nom} → corps accepté sous \`body\` ET \`message\``,
     b.includes('body.body') && b.includes('body.message'), b);
}

console.log(`\n${ok_} contrôles réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
