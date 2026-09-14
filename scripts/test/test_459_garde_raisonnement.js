#!/usr/bin/env node
/**
 * Garde « modèle de raisonnement » sur les six appels OpenAI exposés — #459, lot 1.
 *
 *     node scripts/test/test_459_garde_raisonnement.js
 *     node scripts/test/test_459_garde_raisonnement.js --en-ligne   # appelle vraiment OpenAI
 *
 * Même motif que test_openai_raisonnement.js (PR #458) : le test évalue le
 * jsonBody extrait du JSON des workflows, avec la même découpe `{{ … }}` que
 * n8n — c'est le code importé qui est testé, pas une copie.
 *
 * La règle
 * --------
 * gpt-5*, o1*, o3*, o4* refusent `max_tokens` (400 « use max_completion_tokens »)
 * et toute `temperature` autre que 1 (400). Leur budget est partagé avec les
 * jetons de raisonnement : trop serré, il rend un texte VIDE en HTTP 200 — d'où
 * un plancher de 1024 sur `max_completion_tokens`.
 *
 * Ce que le test protège, nœud par nœud
 * -------------------------------------
 *  - modèle de raisonnement : pas de `max_tokens`, pas de `temperature`,
 *    `max_completion_tokens` ≥ 1024, modèle et messages relayés ;
 *  - modèle classique : corps IDENTIQUE à celui de develop avant correction
 *    (commit épinglé ci-dessous, relu avec git) ;
 *  - le corps reste du JSON valide quand une valeur contient un guillemet : deux
 *    nœuds (Dataset Generator, Tools Enricher) inséraient des valeurs dans un
 *    gabarit JSON écrit en dur.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..', '..');
/** develop juste avant la correction : sert de référence « corps historique ». */
const AVANT = '70308c9b';

const echecs = [];
let total = 0;
function controle(libelle, obtenu, attendu) {
  total++;
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(58)} ${vu && vu.length > 50 ? vu.slice(0, 50) + '…' : vu}`
    + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

/** Clés triées : l'ordre des clés n'a aucun effet côté OpenAI. */
const canonique = v => Array.isArray(v) ? v.map(canonique)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonique(v[k])])) : v;

const lireWorkflow = f => JSON.parse(fs.readFileSync(path.join(RACINE, 'workflows', f + '.json'), 'utf8'));
function lireWorkflowAvant(f) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${AVANT}:workflows/${f}.json`],
      { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
  } catch { return null; }
}

/**
 * Résout un jsonBody comme n8n : un champ n'est une expression que s'il commence
 * par « = » ; chaque segment `{{ … }}` est évalué (le premier `}}` le ferme,
 * comme chez n8n) ; puis le nœud HTTP parse le résultat en JSON.
 * Rend { corps } ou { erreur }.
 */
function resoudre(jsonBody, json) {
  if (!jsonBody.startsWith('=')) return { erreur: 'jsonBody sans « = »' };
  try {
    const texte = jsonBody.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
      const v = vm.runInNewContext(`(${expr})`, { $json: json, JSON, Object, Array, String, Number, Math, RegExp });
      return typeof v === 'string' ? v : JSON.stringify(v);
    });
    return { corps: JSON.parse(texte) };
  } catch (e) { return { erreur: e.message }; }
}

// Entrées représentatives, telles que les reçoit chaque nœud. Les valeurs
// « sures » (sans guillemet) permettent la comparaison avec le gabarit historique.
const NOEUDS = [
  {
    fichier: 'MCP_-_Dataset_Generator', noeud: 'Reviewer (GPT)', budget: 4096, historique: { temperature: 0.2 },
    entree: m => ({ config: { reviewerModel: m }, toolsList: ['search_tools', 'ask_user'], category: 'elliptique', generatedCases: [] }),
    avecGuillemets: m => ({ config: { reviewerModel: m }, toolsList: ['search_tools'], category: 'elliptique',
      generatedCases: [{ demande: 'Et "demain" ?', outils_obligatoires: ['search_tools'] }] }),
  },
  {
    fichier: 'MCP_-_Quiz_Generator', noeud: 'OpenAI Generate Quiz', budget: 4096, historique: { temperature: 0.7, max_tokens: 4096 },
    entree: m => ({ model: m, user_request: 'Un quiz sur les fractions', source: 'topic', data: 'Les fractions',
      num_questions: 2, question_types: ['true_false'], difficulty: 'easy', language: 'fr', include_explanations: false }),
  },
  {
    fichier: 'MCP_-_Syllabus_Generator', noeud: 'OpenAI Generate Syllabus', budget: 8192, historique: { temperature: 0.7, max_tokens: 8192 },
    entree: m => ({ model: m, user_request: 'Une initiation très courte', topic: 'Les fractions', level: 'debutant',
      duration_weeks: 1, hours_per_week: 1, language: 'fr', format: 'theorique', context_text: 'Un seul module, une seule leçon.' }),
  },
  {
    fichier: 'MCP_-_Text_Generator', noeud: 'OpenAI Generate', budget: 1024, historique: { max_tokens: 512, temperature: 0.3 },
    entree: m => ({ model: m, prompt: 'Réponds exactement : ok', system_prompt: 'Tu es concis.', max_tokens: 512, temperature: 0.3, user_request: null }),
  },
  {
    fichier: 'MCP_-_Tools_Enricher', noeud: 'GPT Validate', budget: 4096, historique: { temperature: 0.3 },
    entree: m => ({ config: { modelOpenai: m }, name: 'MCP - Demo', claude_result: null }),
    avecGuillemets: m => ({ config: { modelOpenai: m }, name: 'MCP - Demo',
      claude_result: { description: 'Traduire un "verset"', keywords: ['traduire', 'translate'] } }),
  },
  {
    fichier: 'Torah_Discord_Translation_Pivot', noeud: 'OpenAI Verify', budget: 4096, historique: { temperature: 0.1 },
    entree: m => ({ openaiModel: m, sourceLangName: 'hébreu', originalText: 'בראשית ברא אלהים',
      intermediateTranslation: 'In the beginning God created', targetLangName: 'français',
      claudeTranslation: 'Au commencement, Dieu créa', contextInfo: '' }),
  },
];

const jsonBody = wf => n => (wf && wf.nodes.find(x => x.name === n) || { parameters: {} }).parameters.jsonBody;

for (const N of NOEUDS) {
  const actuel = jsonBody(lireWorkflow(N.fichier))(N.noeud);
  const avantWf = lireWorkflowAvant(N.fichier);
  N.corps = m => resoudre(actuel, N.entree(m));
  N.corpsAvant = avantWf ? m => resoudre(jsonBody(avantWf)(N.noeud), N.entree(m)) : null;

  console.log(`\n${N.fichier} › ${N.noeud}`);
  controle('le nœud existe', typeof actuel, 'string');
  if (typeof actuel !== 'string') continue;

  const classique = N.corps('gpt-4o');
  controle('gpt-4o : JSON valide', classique.erreur || null, null);
  if (N.corpsAvant) {
    const ref = N.corpsAvant('gpt-4o');
    controle(`gpt-4o : corps identique à ${AVANT}`, canonique(classique.corps), canonique(ref.corps));
  } else {
    console.log(`  ⏭  ${AVANT} illisible (git absent ?) — comparaison historique sautée`);
  }
  for (const [k, v] of Object.entries(N.historique)) controle(`gpt-4o : ${k} conservé`, classique.corps && classique.corps[k], v);
  controle('gpt-4o : pas de max_completion_tokens', !!classique.corps && 'max_completion_tokens' in classique.corps, false);

  for (const m of ['gpt-5', 'gpt-5-mini', 'gpt-5.6-luna', 'o3-mini', 'openai/gpt-5']) {
    const r = N.corps(m);
    const c = r.corps || {};
    controle(`${m} : sans max_tokens ni temperature`, [r.erreur || null, 'max_tokens' in c, 'temperature' in c], [null, false, false]);
    controle(`${m} : max_completion_tokens ≥ 1024`, c.max_completion_tokens >= 1024, true);
  }
  const g5 = N.corps('gpt-5').corps || {};
  controle('gpt-5 : budget attendu', g5.max_completion_tokens, N.budget);
  controle('gpt-5 : modèle relayé', g5.model, 'gpt-5');
  controle('gpt-5 : mêmes messages que gpt-4o', canonique(g5.messages), canonique(classique.corps && classique.corps.messages));

  if (N.avecGuillemets) {
    const r = resoudre(actuel, N.avecGuillemets('gpt-4o'));
    controle('valeur avec guillemets : JSON valide', r.erreur || null, null);
  }
}

console.log('\nMCP_-_Text_Generator — le plancher suit le budget demandé');
{
  const N = NOEUDS.find(x => x.fichier === 'MCP_-_Text_Generator');
  const body = jsonBody(lireWorkflow(N.fichier))(N.noeud);
  const budget = mt => (resoudre(body, { ...N.entree('gpt-5'), max_tokens: mt }).corps || {}).max_completion_tokens;
  controle('budget 16 relevé au plancher', budget(16), 1024);
  controle('budget 8000 respecté', budget(8000), 8000);
}

if (process.argv.includes('--en-ligne')) enLigne().then(conclure, e => { console.log(`  ❌ ${e.message}`); echecs.push('en ligne'); conclure(); });
else conclure();

async function enLigne() {
  console.log('\nAller-retour réel contre OpenAI');
  const cle = process.env.OPENAI_API_KEY;
  if (!cle) { console.log('  ⏭  OPENAI_API_KEY absente — étape sautée'); return; }
  const appel = async corps => {
    const t0 = Date.now();
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const j = await r.json().catch(() => ({}));
    return { statut: r.status, j, ms: Date.now() - t0 };
  };
  for (const N of NOEUDS) {
    console.log(`\n  ${N.fichier} › ${N.noeud}`);
    for (const m of ['gpt-5.6-luna', 'gpt-4o-mini']) {
      const r = await appel(N.corps(m).corps);
      const texte = r.j.choices?.[0]?.message?.content || '';
      const u = r.j.usage || {};
      console.log(`     ${m} : HTTP ${r.statut}, ${r.ms} ms, ${texte.length} car., ` +
        `${u.completion_tokens ?? '?'} jetons dont ${u.completion_tokens_details?.reasoning_tokens ?? '?'} de raisonnement` +
        (r.j.error ? `, ${r.j.error.code || r.j.error.message}` : ''));
      controle(`${m} : corps corrigé accepté`, r.statut, 200);
      controle(`${m} : texte non vide`, texte.length > 0, true);
    }
    if (N.corpsAvant) {
      // L'ancien corps doit toujours échouer — sinon le test ne prouve rien.
      const r = await appel(N.corpsAvant('gpt-5.6-luna').corps);
      console.log(`     ancien corps, gpt-5.6-luna : HTTP ${r.statut}, ${r.j.error?.param || ''} ${r.j.error?.code || ''}`);
      controle('ancien corps sur gpt-5.6-luna refusé', r.statut, 400);
    }
  }
}

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length}/${total} contrôle(s) en échec`); process.exit(1); }
  console.log(`✅ tous les contrôles passent  (${total}/${total})`);
}
