#!/usr/bin/env node
/**
 * Le contrat MCP↔n8n doit tenir : MCP RETIRE tout champ hors InputSchema.
 *
 * Donc un param requis par une paire saine mais absent du schéma n'arrive JAMAIS,
 * et l'outil échoue en silence. Ces contrôles comparent le schéma publié au
 * câblage réel du workflow, paire par paire.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let ok_ = 0, ko = 0;
function ok(nom, cond, det) {
  if (cond) ok_++; else { ko++; console.log(`  ❌ ${nom}` + (det ? `\n       ${det}` : '')); }
}

// La matrice est la source de vérité : on la régénère plutôt que de la recopier,
// sinon le contrôle vérifierait une copie figée au lieu du câblage actuel.
const matrice = execFileSync('python3',
  [path.join(RACINE, 'scripts', 'audit', 'matrice_contrat_mcp.py')], { encoding: 'utf8' });

const FICHIERS = {
  'mcp-gmail': 'MCP_-_Gmail_Server_(All-in-One).json',
  'mcp-calendar': 'MCP_-_Google_Calendar_Server.json',
  'mcp-contacts': 'MCP_-_Google_Contacts_Server.json',
  'mcp-drive': 'MCP_-_Google_Drive_Server.json',
  'mcp-classroom': 'MCP_-_Google_Classroom_Server.json',
};

/** Extrait, du document de matrice, les paires saines et leurs params. */
function lireMatrice(texte) {
  const parService = {};
  let courant = null;
  for (const ligne of texte.split('\n')) {
    const m = ligne.match(/^## `([^`]+)`/);
    if (m) { courant = m[1]; parService[courant] = { saines: [], mortes: [] }; continue; }
    if (!courant) continue;
    const mm = ligne.match(/^\| `([^`]+)` \| `([^`]+)` \| (.*?) \| (.*?) \|$/);
    if (mm) {
      const champs = (s) => s === '—' ? []
        : [...s.matchAll(/`([a-zA-Z_][a-zA-Z0-9_]*)`:(\w+)/g)].map(x => [x[1], x[2]]);
      parService[courant].saines.push(
        { resource: mm[1], operation: mm[2], requis: champs(mm[3]), optionnels: champs(mm[4]) });
      continue;
    }
    const mo = ligne.match(/^\*\*MORTES[^:]*\*\* : (.+)$/);
    if (mo) parService[courant].mortes = [...mo[1].matchAll(/`([^\/`]+)\/([^`]+)`/g)]
      .map(x => ({ resource: x[1], operation: x[2] }));
  }
  return parService;
}

const M = lireMatrice(matrice);

for (const [chemin, fichier] of Object.entries(FICHIERS)) {
  const wf = JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', fichier), 'utf8'));
  const sticky = wf.nodes.find(n => n.type === 'n8n-nodes-base.stickyNote');
  ok(`${chemin} → une sticky note existe`, !!sticky);
  if (!sticky) continue;
  const contenu = sticky.parameters.content || '';
  const bloc = contenu.match(/\*\*InputSchema:\*\*\s*```json\s*([\s\S]*?)```/);
  ok(`${chemin} → InputSchema publié`, !!bloc);
  if (!bloc) continue;
  let schema;
  try { schema = JSON.parse(bloc[1]); } catch (e) { ok(`${chemin} → JSON valide`, false, e.message); continue; }
  ok(`${chemin} → JSON valide`, true);
  const props = schema.properties || {};

  // ── Le jeton, sous les DEUX noms ────────────────────────────────────────
  ok(`${chemin} → \`oauth_token\` déclaré (nom émis par MCP)`, 'oauth_token' in props);
  ok(`${chemin} → \`access_token\` déclaré (nom historique)`, 'access_token' in props);

  // ── `operation` requis, sinon le Switch ne peut pas router ──────────────
  ok(`${chemin} → \`operation\` requis`, (schema.required || []).includes('operation'),
     JSON.stringify(schema.required));

  const svc = M[chemin];
  ok(`${chemin} → présent dans la matrice`, !!svc);
  if (!svc) continue;

  // ── LE contrôle qui compte : tout param requis d'une paire saine est déclaré ──
  for (const paire of svc.saines) {
    for (const [champ] of paire.requis.concat(paire.optionnels)) {
      ok(`${chemin} ${paire.resource}/${paire.operation} → \`${champ}\` déclaré au schéma`,
         champ in props, `absent du schéma → MCP le supprimera`);
    }
  }

  // ── L'enum n'offre QUE des paires saines ────────────────────────────────
  if (props.operation && props.operation.enum) {
    const saines = new Set(svc.saines.map(p => p.operation));
    for (const op of props.operation.enum) {
      ok(`${chemin} → enum \`${op}\` correspond à une paire saine`, saines.has(op),
         `l'enum propose une opération qu'aucune paire saine ne porte`);
    }
    for (const m of svc.mortes) {
      ok(`${chemin} → route morte \`${m.resource}/${m.operation}\` ABSENTE de l'enum`,
         !props.operation.enum.includes(m.operation)
         || svc.saines.some(p => p.operation === m.operation),
         `l'enum laisse un agent appeler une route morte`);
    }
  }

  // ── La lecture tolérante du jeton, dans le câblage ──────────────────────
  const brut = JSON.stringify(wf);
  ok(`${chemin} → les nœuds lisent \`oauth_token || access_token\``,
     brut.includes('$json.body.oauth_token || $json.body.access_token'));
  // ⚠️ Aucun `$env` pour le jeton : il reste en BYOT.
  const jsSansCommentaires = wf.nodes.filter(n => n.parameters && n.parameters.jsCode)
    .map(n => n.parameters.jsCode).join('\n').split('\n')
    .filter(l => !l.trim().startsWith('//')).join('\n');
  ok(`${chemin} → aucun \`$env\` pour le jeton`,
     !/\$env\.[A-Z_]*TOKEN/.test(jsSansCommentaires) && !/\$env\.[A-Z_]*TOKEN/.test(brut));
}

// Les deux workflows à tolérance seule.
for (const [chemin, fichier] of Object.entries({
  'google-drive-ocr': 'MCP_-_Google_Drive_OCR.json',
  'documents/save': 'MCP_-_Documents_Save.json' })) {
  const p = path.join(RACINE, 'workflows', fichier);
  if (!fs.existsSync(p)) { ok(`${chemin} → fichier trouvé`, false, fichier); continue; }
  const brut = fs.readFileSync(p, 'utf8');
  ok(`${chemin} → accepte aussi \`oauth_token\``, brut.includes('oauth_token'),
     `MCP émet oauth_token ; sans ce repli l'auth Google échoue`);
  ok(`${chemin} → garde \`google_access_token\` en premier`,
     brut.includes('google_access_token'));
}

console.log(`\n${ok_} contrôles réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
