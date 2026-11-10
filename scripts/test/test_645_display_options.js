#!/usr/bin/env node
/**
 * `displayOptions` : `show` est un ET, `hide` est un OU. azy.daily#645
 *
 * n8n affiche un paramètre si TOUTES les conditions de `show` sont vraies et si
 * AUCUNE de `hide` ne l'est. La combinaison est donc ASYMÉTRIQUE, et c'est un piège
 * qui ne se voit ni à la lecture du nœud, ni à l'analyse statique du câblage.
 *
 * CE QU'IL A COÛTÉ, MESURÉ
 * `ClassroomToolDynamic` déclarait `courseId` avec
 *     hide: { resource: ['course'], operation: ['create', 'getAll'] }
 * visiblement pour dire « cache-le pour `course/create` et `course/getAll` » — les
 * deux seules opérations qui n'en ont pas besoin. Lue en OU, la clause cachait
 * `courseId` pour TOUTE opération nommée `create` ou `getAll`, quelle que soit la
 * ressource. Une seconde déclaration ne le réaffichait que pour quatre opérations de
 * `course`. Résultat : 11 des 33 routes levaient « Could not get parameter "courseId" »
 * AVANT tout appel réseau.
 *
 * ⚠️ POURQUOI UN TEST ET PAS UNE RELECTURE
 * La matrice du contrat (`matrice_contrat_mcp.py`) donnait 33 paires SAINES, et elle
 * avait raison dans son propre registre : le nœud LIT bien les paramètres que le
 * workflow POSE. Elle ne peut pas savoir que n8n REFUSERA de les rendre. C'est l'essai
 * sur l'instance (`scripts/audit/sonde_645_classroom.py`) qui l'a découvert. Ce test
 * est ce qui empêche la clause de revenir sans qu'on relance l'essai.
 *
 * LA RÈGLE RETENUE : une clause `hide` ne porte qu'UNE clé. Dès qu'il en faut deux,
 * l'intention est un ET — et il faut l'écrire en `show`, qui en est un.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let reussis = 0, echoues = 0;
function ok(nom, condition, detail) {
  if (condition) { reussis++; }
  else { echoues++; console.log(`  ❌ ${nom}` + (detail ? `\n       ${detail}` : '')); }
}

/** Tous les `*.node.ts` des paquets de `custom-nodes/`. */
function sources(dir = path.join(RACINE, 'custom-nodes'), trouves = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, trouves);
    else if (e.name.endsWith('.node.ts')) trouves.push(p);
  }
  return trouves;
}

const fichiers = sources();
ok('des nœuds personnalisés ont été trouvés', fichiers.length > 0, `${fichiers.length}`);

let clauses = 0;
for (const f of fichiers) {
  const src = fs.readFileSync(f, 'utf8');
  const nomFichier = path.basename(f);
  // Chaque bloc `hide: { … },` et ses clés de premier niveau.
  for (const m of src.matchAll(/hide:\s*\{([\s\S]*?)\n(\s*)\},/g)) {
    clauses++;
    const cles = [...m[1].matchAll(/^\s{2,}([a-zA-Z_]+):\s*\[/gm)].map(x => x[1]);
    const ligne = src.slice(0, m.index).split('\n').length;
    // Le paramètre concerné : la dernière déclaration `name:` avant la clause.
    const noms = [...src.slice(0, m.index).matchAll(/name:\s*'([a-zA-Z_]+)'/g)];
    const param = noms.length ? noms[noms.length - 1][1] : '?';
    ok(`${nomFichier} l.${ligne} → \`${param}\` : clause \`hide\` à une seule clé`,
       cles.length <= 1,
       `clés = [${cles.join(', ')}] — lues en OU, pas en ET. ` +
       'Si l\'intention est un ET, écrire un `show`, qui en est un.');
  }
}
console.log(`  (${clauses} clause(s) \`hide\` examinée(s) dans ${fichiers.length} nœuds)`);

// ── Le cas qui a motivé ce test, vérifié nommément ────────────────────────────
// Un contrôle générique peut passer parce que la clause a été SUPPRIMÉE au lieu
// d'être corrigée. On vérifie donc que `courseId` est bel et bien OFFERT aux six
// ressources qui en ont besoin, et à toutes leurs opérations.
{
  const f = path.join(RACINE, 'custom-nodes', 'n8n-nodes-classroom-dynamic',
                      'nodes', 'ClassroomToolDynamic', 'ClassroomToolDynamic.node.ts');
  const src = fs.readFileSync(f, 'utf8');
  const decls = [...src.matchAll(
    /name:\s*'courseId'[\s\S]{0,2400}?displayOptions:\s*\{([\s\S]*?)\n        \},/g)]
    .map(m => m[1]);
  ok('classroom → `courseId` a bien deux déclarations', decls.length === 2,
     `${decls.length} trouvée(s)`);

  const ATTENDUES = ['announcement', 'courseWork', 'student', 'studentSubmission',
                     'teacher', 'topic'];
  const generale = decls.find(d => d.includes('show') && !d.includes("'course'"));
  ok('classroom → la déclaration générale est un `show`, pas un `hide`', !!generale,
     JSON.stringify(decls));
  if (generale) {
    for (const r of ATTENDUES) {
      ok(`classroom → \`courseId\` offert à la ressource \`${r}\``,
         generale.includes(`'${r}'`), generale.replace(/\s+/g, ' ').slice(0, 160));
    }
    // ⚠️ Et SURTOUT : aucune condition sur `operation`. Toutes les opérations de ces
    // six ressources lisent `courseId` — en restreindre une recréerait le trou.
    ok('classroom → aucune condition sur `operation` (toutes en ont besoin)',
       !/operation:/.test(generale), generale.replace(/\s+/g, ' ').slice(0, 160));
  }
  // `course/create` et `course/getAll` sont les SEULES à ne pas poser `course_id` :
  // la seconde déclaration ne doit donc couvrir que les quatre autres.
  const pourCourse = decls.find(d => d.includes("'course'"));
  ok('classroom → la déclaration `course` existe', !!pourCourse);
  if (pourCourse) {
    for (const o of ['get', 'update', 'delete', 'archive']) {
      ok(`classroom → \`course/${o}\` reçoit \`courseId\``, pourCourse.includes(`'${o}'`));
    }
    ok('classroom → `course/create` ne reçoit PAS `courseId` (il n\'en pose pas)',
       !/'create'/.test(pourCourse), pourCourse.replace(/\s+/g, ' ').slice(0, 160));
  }

  // ── Le dist DOIT porter la correction : c'est lui que le conteneur charge ────
  // ⚠️ Corriger le `.ts` sans reconstruire ne change RIEN sur l'instance. Le paquet
  // déclare `main: dist/…` et `n8n.nodes: [dist/…]`.
  const d = path.join(RACINE, 'custom-nodes', 'n8n-nodes-classroom-dynamic', 'dist',
                      'nodes', 'ClassroomToolDynamic', 'ClassroomToolDynamic.node.js');
  ok('classroom → le dist existe', fs.existsSync(d));
  if (fs.existsSync(d)) {
    const js = fs.readFileSync(d, 'utf8');
    // On cherche la clause EFFECTIVE, hors commentaires : les lignes de commentaire
    // du dist reproduisent l'ancienne clause pour mémoire, et elles ne comptent pas.
    const effectif = js.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    ok('classroom → le dist ne porte plus le `hide` multi-clés',
       !/hide:\s*\{\s*resource:\s*\['course'\],\s*operation:/.test(effectif));
    for (const r of ATTENDUES) {
      ok(`classroom → le dist offre \`courseId\` à \`${r}\``, effectif.includes(`'${r}'`));
    }
  }
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues ? 1 : 0);
