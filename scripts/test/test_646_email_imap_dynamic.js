#!/usr/bin/env node
/**
 * `EmailImapToolDynamic` : échouer franchement, et ne jamais laisser fuir le mot de passe.
 *
 * CE QUE CE TEST EMPÊCHE DE REVENIR, MESURÉ LE 2026-11-10
 * `POST /webhook/email-imap` rendait `HTTP 200 {"success":true,"emails":[],"count":0}`
 * pour `imap.exemple.invalid` — un hôte qui NE RÉSOUT PAS. Une boîte vide fabriquée, que
 * l'agent relaie en « vous n'avez pas de courrier ». C'est la pire panne possible : elle
 * ne ressemble pas à une panne. Le contrôle 2 ci-dessous est exactement cette mesure,
 * avec l'assertion inversée.
 *
 * ⚠️ Ce test N'A PAS BESOIN d'un serveur IMAP. Il vérifie les chemins d'ÉCHEC et le
 * nettoyage des secrets — ce qui est précisément ce qu'on ne peut pas vérifier en
 * production sans un compte réel, et ce qui a cassé la dernière fois.
 */
const path = require('path');
const assert = require('assert');

const RACINE = path.resolve(__dirname, '..', '..');
const PAQUET = path.join(RACINE, 'custom-nodes', 'n8n-nodes-email-imap-dynamic');
let reussis = 0, echoues = 0;
function ok(nom, condition, detail) {
  if (condition) { reussis++; console.log(`  ✓ ${nom}`); }
  else { echoues++; console.log(`  ❌ ${nom}` + (detail ? `\n       ${detail}` : '')); }
}

const mod = require(path.join(PAQUET, 'dist/nodes/EmailImapToolDynamic/EmailImapToolDynamic.node.js'));
const { EmailImapToolDynamic, nettoyer } = mod;

/** Faux IExecuteFunctions : juste assez pour exécuter le nœud hors de n8n. */
function contexte(params, { continueOnFail = false } = {}) {
  return {
    getInputData: () => [{ json: {} }],
    getNodeParameter: (nom, _i, defaut) => (nom in params ? params[nom] : defaut),
    getNode: () => ({ name: 'test', type: 'emailImapToolDynamic', typeVersion: 1,
                      position: [0, 0], parameters: {} }),
    continueOnFail: () => continueOnFail,
  };
}

(async () => {
  const noeud = new EmailImapToolDynamic();
  const d = noeud.description;

  // ── 1 · Un paramètre manquant est une erreur de CÂBLAGE, détectée avant la socket ──
  for (const absent of ['imap_server', 'imap_username', 'imap_password']) {
    const p = { imap_server: 'imap.exemple.invalid', imap_username: 'u',
                imap_password: 'p', operation: 'list_folders' };
    delete p[absent];
    p[absent] = '';
    let leve = null;
    try { await noeud.execute.call(contexte(p)); } catch (e) { leve = e; }
    ok(`\`${absent}\` vide → lève, et nomme le champ`,
       leve !== null && String(leve.message).includes(absent),
       leve ? `message : ${leve.message}` : 'aucune erreur levée');
  }

  // ── 2 · LA MESURE DU 10/11, ASSERTION INVERSÉE ────────────────────────────
  // `.invalid` est réservé par la RFC 2606 : il ne résout jamais. L'ancien workflow
  // rendait ici 200 + boîte vide. Le nœud DOIT lever.
  {
    let leve = null, resultat = null;
    try {
      resultat = await noeud.execute.call(contexte({
        imap_server: 'imap.exemple.invalid', imap_port: 993, imap_use_ssl: true,
        imap_username: 'sonde@exemple.invalid', imap_password: 'MOTDEPASSE-SONDE-646',
        operation: 'list_folders', connectionTimeout: 4000,
      }));
    } catch (e) { leve = e; }
    ok('hôte inexistant → LÈVE (et ne rend PAS une boîte vide)',
       leve !== null,
       resultat ? `a rendu : ${JSON.stringify(resultat).slice(0, 220)}` : '');
    // Et le mot de passe ne doit apparaître NULLE PART dans l'erreur.
    if (leve) {
      const tout = JSON.stringify({ m: leve.message, s: leve.stack ?? null, ...leve });
      ok('hôte inexistant → le mot de passe est absent de l\'erreur',
         !tout.includes('MOTDEPASSE-SONDE-646'),
         'un secret dans une erreur reste lisible via GET /executions/<id>?includeData=true');
    }
  }

  // ── 3 · Avec `continueOnFail`, l'échec sort en DONNÉE — mais toujours nettoyée ──
  {
    const r = await noeud.execute.call(contexte({
      imap_server: 'imap.exemple.invalid', imap_username: 'u',
      imap_password: 'MOTDEPASSE-SONDE-646', operation: 'list_folders',
      connectionTimeout: 4000,
    }, { continueOnFail: true }));
    const j = r?.[0]?.[0]?.json ?? {};
    ok('continueOnFail → porte la clé `error` (jamais `success: true`)',
       'error' in j && j.success !== true, JSON.stringify(j).slice(0, 200));
    ok('continueOnFail → le mot de passe est absent de la donnée rendue',
       !JSON.stringify(j).includes('MOTDEPASSE-SONDE-646'));
  }

  // ── 4 · Le nettoyage lui-même ─────────────────────────────────────────────
  ok('nettoyer() remplace le secret, même répété',
     nettoyer('LOGIN u s3cr3t puis s3cr3t', ['s3cr3t']) === 'LOGIN u *** puis ***');
  ok('nettoyer() ignore un secret de moins de 3 caractères',
     nettoyer('erreur de port 25', ['25']) === 'erreur de port 25',
     'sinon un mot de passe court mutilerait tous les messages');
  ok('nettoyer() tolère une liste vide ou nulle',
     nettoyer('rien à cacher', ['', undefined]) === 'rien à cacher');

  // ── 5 · Le piège `displayOptions` qui a tué 11 routes Classroom ───────────
  // n8n lit `show` en ET et `hide` en OU : une clause `hide` à plusieurs clés masque un
  // paramètre bien au-delà de l'intention, et la route meurt sur « Could not get
  // parameter » AVANT tout appel réseau — invisible à toute analyse de forme.
  {
    const ops = new Set(d.properties.find((p) => p.name === 'operation').options.map((o) => o.value));
    const avecHide = d.properties.filter((p) => p.displayOptions?.hide).map((p) => p.name);
    ok('aucun paramètre n\'utilise une clause `hide`', avecHide.length === 0, avecHide.join(', '));
    const fantomes = [];
    for (const p of d.properties) {
      for (const v of (p.displayOptions?.show?.operation ?? [])) if (!ops.has(v)) fantomes.push(`${p.name}→${v}`);
    }
    ok('chaque `show` ne cite que des opérations réellement offertes',
       fantomes.length === 0, fantomes.join(', '));
    // Chaque opération doit pouvoir lire les paramètres qu'elle utilise.
    const visiblePour = (nom, op) => {
      const p = d.properties.find((x) => x.name === nom);
      const s = p.displayOptions?.show?.operation;
      return !s || s.includes(op);
    };
    for (const [op, requis] of [['search', ['folder', 'limit']], ['fetch_email', ['folder', 'uid']]]) {
      for (const r of requis) {
        ok(`\`${r}\` est visible pour \`${op}\``, visiblePour(r, op));
      }
    }
  }

  // ── 6 · BYOT : aucune credential statique ─────────────────────────────────
  ok('le nœud ne déclare AUCUNE credential n8n (BYOT)',
     Array.isArray(d.credentials) && d.credentials.length === 0,
     JSON.stringify(d.credentials));

  // ── 7 · Les noms de champs sont ceux d'api, pas les nôtres ────────────────
  // api stocke `provider_settings.imap = {server, port, use_ssl}` + `credentials =
  // {username, password}` (imap_adapter.py:446-462). Renommer en host/secure/user
  // recréerait une couche de traduction des deux côtés.
  for (const champ of ['imap_server', 'imap_port', 'imap_use_ssl', 'imap_username', 'imap_password']) {
    ok(`paramètre \`${champ}\` présent (nom d'api)`, d.properties.some((p) => p.name === champ));
  }
  ok('aucun alias concurrent (imap_host / imap_secure / imap_user)',
     !d.properties.some((p) => ['imap_host', 'imap_secure', 'imap_user'].includes(p.name)));

  // ── 8 · Le mot de passe est marqué comme tel dans l'interface ─────────────
  ok('`imap_password` est de type mot de passe (masqué dans l\'UI)',
     d.properties.find((p) => p.name === 'imap_password')?.typeOptions?.password === true);

  // ── 9 · La dépendance doit VOYAGER vers llm ───────────────────────────────
  // `sync-custom-nodes.sh` envoie `custom-nodes/` en entier, node_modules compris. Si le
  // paquet n'est pas enregistré à la racine, npm ne hisse pas `imapflow` et le nœud
  // lèvera « Cannot find module 'imapflow' » SUR L'INSTANCE seulement.
  {
    const fs = require('fs');
    const racine = JSON.parse(fs.readFileSync(path.join(RACINE, 'custom-nodes/package.json'), 'utf8'));
    ok('paquet enregistré dans custom-nodes/package.json',
       racine.dependencies?.['n8n-nodes-email-imap-dynamic'] === 'file:./n8n-nodes-email-imap-dynamic');
    for (const dep of ['imapflow', 'mailparser']) {
      ok(`\`${dep}\` hissé dans custom-nodes/node_modules (il voyagera vers llm)`,
         fs.existsSync(path.join(RACINE, 'custom-nodes/node_modules', dep)));
    }
    const pk = JSON.parse(fs.readFileSync(path.join(PAQUET, 'package.json'), 'utf8'));
    ok('le paquet déclare ses dépendances d\'exécution',
       !!pk.dependencies?.imapflow && !!pk.dependencies?.mailparser);
    ok('`main` pointe vers dist (c\'est dist qui est servi, pas le .ts)',
       pk.main === 'dist/nodes/EmailImapToolDynamic/EmailImapToolDynamic.node.js'
       && fs.existsSync(path.join(PAQUET, pk.main)));
  }

  // ── 10 · Les identifiants ne doivent JAMAIS entrer dans un schéma publié ──
  // Mesuré par MCP : un champ déclaré au schéma est un champ que le LLM remplit, et le
  // registre est publié sans authentification puis vectorisé dans Qdrant.
  {
    const fs = require('fs');
    const f = path.join(RACINE, 'workflows/MCP_-_Email_IMAP.json');
    if (fs.existsSync(f)) {
      const wf = JSON.parse(fs.readFileSync(f, 'utf8'));
      // ⚠️ ON ANALYSE LA STRUCTURE, PAS LES MOTS — et c'est ce test qui me l'a appris.
      // Une première version cherchait /imap_password/ dans tout pense-bête contenant
      // « InputSchema », et elle a échoué sur la PROSE qui explique pourquoi aucun schéma
      // n'est publié. Un garde-fou qui signale sa propre documentation sera désactivé par
      // le premier qui le croise. On ne lit donc que des blocs JSON valides, et on ne
      // regarde que les CLÉS de `properties`.
      const fuite = [];
      for (const n of wf.nodes || []) {
        if (n.type !== 'n8n-nodes-base.stickyNote') continue;
        const contenu = (n.parameters || {}).content || '';
        for (const bloc of contenu.match(/```json\s*([\s\S]*?)```/g) || []) {
          let o;
          try { o = JSON.parse(bloc.replace(/```json|```/g, '').trim()); } catch { continue; }
          const props = o?.properties ?? o?.inputSchema?.properties ?? o?.InputSchema?.properties;
          if (props && typeof props === 'object') {
            for (const cle of Object.keys(props)) {
              if (/^imap_(password|username|server|port|use_ssl)$/.test(cle)) fuite.push(`${n.name}:${cle}`);
            }
          }
        }
      }
      ok('aucun InputSchema du workflow ne déclare les identifiants IMAP',
         fuite.length === 0, fuite.join(', ') +
         ' — un mot de passe déclaré au schéma est un mot de passe que le LLM remplit');
    }
  }

  console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
  process.exit(echoues ? 1 : 0);
})().catch((e) => { console.error('ERREUR DU TEST :', e); process.exit(2); });
