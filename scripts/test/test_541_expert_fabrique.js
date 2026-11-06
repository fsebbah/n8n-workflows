#!/usr/bin/env node
/**
 * `DISCORD - Subject Switch` ne doit plus fabriquer d'expert — azy.daily#541.
 *
 *     node scripts/test/test_541_expert_fabrique.js
 *
 * Le défaut
 * ---------
 * Quand l'API rendait 200 avec une matière SANS expert configuré, `Build Response`
 * inventait quatre champs et répondait `success: true` :
 *
 *     expert_id       `expert-${slug}-001`        identifiant qui n'existe nulle part
 *     name            `Expert ${slug}`
 *     rag_collection  `education_${slug}`         collection Qdrant peut-être inexistante
 *     system_prompt   « Tu es un expert en … »    prompt inventé
 *
 * L'aval recevait une persona complète, plausible, entièrement fictive — sans signal.
 *
 * ⚠️ `rag_collection` est le pire des quatre : une collection inventée interroge un
 * espace vectoriel qui n'existe peut-être pas. La recherche ne lève pas, elle rend zéro
 * résultat, et l'expert répond sans source avec l'aplomb d'un expert qui en a. Un vide
 * se voit ; une fabrication passe pour du contenu valide et personne ne la cherche.
 *
 * Et `expert_id` fictif se propage aux journaux et aux débits de l'aval, qui
 * attribueraient une consommation à un expert qui n'a jamais existé.
 *
 * Pourquoi la correction est sans risque
 * --------------------------------------
 * Mesuré le 2026-11-06 sur 37 relevés quotidiens (2026-10-01 → 11-06) :
 * **0 exécution**, et `sauve_succes = all` — donc le zéro est RÉEL, pas l'angle mort de
 * `torah-pdf` où les succès ne sont pas enregistrés. Aucun appelant à casser.
 *
 * Ce que le test protège
 * ----------------------
 *  1. aucun des quatre gabarits ne subsiste dans le code ;
 *  2. un expert complet passe exactement comme avant (non-régression) ;
 *  3. chaque champ porteur manquant fait échouer, et il est NOMMÉ ;
 *  4. `name` garde son repli — sur une donnée réelle, ce n'est pas une fabrication ;
 *  5. les branches d'erreur préexistantes sont intactes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHIER = path.join(__dirname, '..', '..', 'workflows', 'DISCORD_-_Subject_Switch.json');
const wf = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
const noeud = (nom) => wf.nodes.find((n) => n.name === nom);

let ok = 0;
const echecs = [];
const verifier = (intitule, obtenu, attendu) => {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) { ok += 1; console.log(`  ✓ ${intitule}`); }
  else { echecs.push(intitule); console.log(`  ✗ ${intitule}\n      obtenu  : ${a}\n      attendu : ${b}`); }
};

const PROCESS = {
  startTime: Date.now() - 120,
  previous_subject: 'maths',
  student_id: 'etu-1', promotion_id: 'promo-7', thread_id: 'th-9',
};
const VALIDATE = { new_subject_slug: 'physique', guild_id: 'g-1' };
const UPDATE_OK = { statusCode: 200, body: { ok: true } };

/** Exécute `Build Response` sur une réponse de `Get Expert Config`. */
function construire(expertResponse, { update = UPDATE_OK } = {}) {
  const ctx = vm.createContext({
    $input: { first: () => ({ json: expertResponse }) },
    $: (nom) => ({ first: () => ({ json: {
      'Process Current Subject': PROCESS,
      'Validate Input': VALIDATE,
      'Update Subject (API)': update,
    }[nom] }) }),
    Date, console,
  });
  return vm.runInContext(
    `(function () {\n${noeud('Build Response').parameters.jsCode}\n})()`, ctx).json;
}

/** Matière rendue par l'API, avec l'expert qu'on lui donne. */
const matiere = (expert) => ({
  statusCode: 200,
  body: { subject: {
    id: 'subj-3', name: 'Physique', slug: 'physique',
    course_channel_id: 'c-1', prof_channel_id: 'c-2',
    expert,
  } },
});
const EXPERT_COMPLET = {
  id: 'exp-77', name: 'Pr. Curie',
  rag_collection: 'education_physique_reelle',
  system_prompt: 'Prompt réellement configuré.',
};

(async () => {
  console.log('\nDISCORD - Subject Switch — plus d\'expert fabriqué\n');

  console.log('Les quatre gabarits inventés ont disparu du CODE');
  {
    const src = noeud('Build Response').parameters.jsCode;
    // On juge le code, pas les commentaires : ceux-ci citent les gabarits exprès.
    const code = src.split('\n').map((l) => l.split('//')[0]).join('\n');
    for (const motif of ['expert-${', 'education_${', 'Expert ${', 'Tu es un expert en ${']) {
      verifier(`plus de « ${motif}… »`, code.includes(motif), false);
    }
    verifier('le garde-fou existe', code.includes('EXPERT_NOT_CONFIGURED'), true);
  }

  console.log('\nNon-régression : un expert complet passe comme avant');
  {
    const r = construire(matiere(EXPERT_COMPLET));
    verifier('succès', r.success, true);
    verifier('expert_id réel', r.data.expert.expert_id, 'exp-77');
    verifier('rag_collection réelle', r.data.expert.rag_collection, 'education_physique_reelle');
    verifier('system_prompt réel', r.data.expert.system_prompt, 'Prompt réellement configuré.');
    verifier('name réel', r.data.expert.name, 'Pr. Curie');
    verifier('la matière est relayée',
      [r.data.subject.id, r.data.subject.slug], ['subj-3', 'physique']);
    verifier('le contexte étudiant est relayé',
      r.data.student, { student_id: 'etu-1', promotion_id: 'promo-7', thread_id: 'th-9' });
    verifier('_trace conservée', r._trace.context_switched, true);
  }

  console.log('\nLE CAS CASSÉ : matière trouvée, aucun expert configuré');
  {
    // Avant ce correctif : success true, et quatre champs inventés.
    const r = construire(matiere(undefined));
    verifier('échec explicite', r.success, false);
    verifier('statut nommé', r.error.status, 'EXPERT_NOT_CONFIGURED');
    verifier('les trois champs porteurs sont nommés',
      r.error.missing_fields, ['expert_id', 'rag_collection', 'system_prompt']);
    verifier('code 502 — la matière existe, sa configuration est en faute', r.error.code, 502);
    verifier('aucune donnée d\'expert rendue', 'data' in r, false);
    verifier('la matière en faute est dans la trace', r._trace.subject_id, 'subj-3');
  }

  console.log('\nChaque champ manquant est nommé individuellement');
  {
    const sans = (cle) => {
      const e = Object.assign({}, EXPERT_COMPLET);
      delete e[cle];
      return construire(matiere(e));
    };
    const r1 = sans('rag_collection');
    verifier('rag_collection seule manquante', r1.error.missing_fields, ['rag_collection']);
    verifier('…et c\'est bien un échec', r1.success, false);

    const r2 = sans('system_prompt');
    verifier('system_prompt seul manquant', r2.error.missing_fields, ['system_prompt']);

    const r3 = sans('id');
    verifier('id seul manquant', r3.error.missing_fields, ['expert_id']);

    // `expert_id` accepte les deux graphies rendues par l'API.
    const alt = construire(matiere(Object.assign({}, EXPERT_COMPLET, { id: undefined, expert_id: 'exp-88' })));
    verifier('expert_id accepté comme alias de id', [alt.success, alt.data.expert.expert_id], [true, 'exp-88']);
  }

  console.log('\n⚠️ Une chaîne VIDE n\'est pas une configuration');
  {
    // `''` passerait un test de présence par `in` ou `!== undefined` ; le `!` l'attrape.
    const r = construire(matiere(Object.assign({}, EXPERT_COMPLET, { rag_collection: '', system_prompt: '' })));
    verifier('les champs vides sont traités comme manquants',
      r.error.missing_fields, ['rag_collection', 'system_prompt']);
  }

  console.log('\n`name` garde son repli — sur une donnée RÉELLE, pas inventée');
  {
    const e = Object.assign({}, EXPERT_COMPLET);
    delete e.name;
    const r = construire(matiere(e));
    verifier('succès : name n\'est pas un champ porteur', r.success, true);
    verifier('repli sur le nom de la matière, qui vient de l\'API', r.data.expert.name, 'Physique');
    // Et si la matière n'a pas de nom non plus : null, jamais un libellé inventé.
    const sansNom = { statusCode: 200, body: { subject: { id: 's', slug: 'physique', expert: e } } };
    verifier('ni nom d\'expert ni nom de matière → null', construire(sansNom).data.expert.name, null);
  }

  console.log('\nLes branches d\'erreur, et un second défaut trouvé en les testant');
  {
    const maj = construire(matiere(EXPERT_COMPLET), { update: { statusCode: 500, body: { e: 1 } } });
    verifier('échec de mise à jour du contexte', maj.error.status, 'UPDATE_FAILED');

    const absente = construire({ statusCode: 404, body: { error: 'nope' } });
    verifier('404 → matière introuvable', absente.error.status, 'SUBJECT_NOT_FOUND');

    // ⚠️ LE SECOND DÉFAUT, trouvé en écrivant ce test. Le test « non trouvee » venait
    // en PREMIER et portait `|| expertBody.error` : toute réponse d'erreur ayant un
    // champ `error` y tombait, 5xx compris. Un service indisponible était donc
    // rapporté comme SUBJECT_NOT_FOUND, et `EXPERT_API_ERROR` était inatteignable.
    // L'appelant partait corriger une configuration de matière qui n'avait rien.
    const api = construire({ statusCode: 503, body: { error: { message: 'service indisponible' } } });
    verifier('503 → erreur de service, PAS « non trouvée »', api.error.status, 'EXPERT_API_ERROR');
    verifier('message du service relayé', api.error.message, 'service indisponible');
    verifier('le statut réel est conservé', api.error.code, 503);

    const texte = construire({ statusCode: 500, body: { error: 'boom' } });
    verifier('un `error` en chaîne est relayé aussi', texte.error.message, 'boom');

    // ⚠️ `Get Expert Config` porte onError: continueRegularOutput, qui n'émet AUCUN
    // statusCode sur une erreur de transport. Le `|| 200` faisait passer une panne
    // pour une réponse réussie.
    const transport = construire({ error: { message: 'ETIMEDOUT api.local:8000' } });
    verifier('sans statut, une panne de transport est nommée', transport.error.status, 'EXPERT_API_ERROR');
    verifier('502, pas 200', transport.error.code, 502);
    verifier('la cause est citée', /ETIMEDOUT/.test(transport.error.message), true);

    const vide = construire({ statusCode: 200, body: null });
    verifier('200 sans corps → erreur de service', vide.error.status, 'EXPERT_API_ERROR');

    // Un 200 porteur d'`error` ne doit pas ressortir en « code: 200 » : un appelant
    // qui lit le code seul en conclurait un succès.
    const deuxCents = construire({ statusCode: 200, body: { error: { message: 'incoherent' } } });
    verifier('200 + error → code 502, jamais 200', [deuxCents.success, deuxCents.error.code], [false, 502]);
  }

  console.log(`\nRésultat : ${ok} ok, ${echecs.length} échec(s)\n`);
  if (echecs.length) { echecs.forEach((e) => console.log(`  - ${e}`)); process.exit(1); }
})();
