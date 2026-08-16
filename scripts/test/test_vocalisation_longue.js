#!/usr/bin/env node
/**
 * Non-régression du découpage des textes longs dans « Torah Vocalization Worker ».
 *
 *     node scripts/test/test_vocalisation_longue.js
 *     node scripts/test/test_vocalisation_longue.js --en-ligne   # appelle vraiment OpenAI
 *
 * Le test exécute le JavaScript extrait du JSON du workflow, dans un émulateur
 * minimal du contexte n8n : le code testé est le code qui sera importé.
 *
 * Le cas de référence
 * -------------------
 * Exécution 746039 du 11/08 : lot de 6 textes, le sixième — Avot DeRabbi Natan
 * p.1, 5 224 caractères — a expiré à 60 012 ms. Les cinq autres, tous sous
 * 2 300 caractères, sont passés. Durée mesurée sur ces cinq :
 *
 *     durée ≈ 2,1 s + 13,7 ms/caractère        seuil de rupture ≈ 4 200 car.
 *
 * Ce que le test protège
 * ----------------------
 *  - la concaténation des tranches redonne EXACTEMENT le texte d'origine : une
 *    coupure qui perd un séparateur perdrait un mot sans rien signaler ;
 *  - aucune tranche ne dépasse le seuil, y compris sur un texte sans ponctuation ;
 *  - une tranche tronquée (finish_reason ≠ stop) fait échouer l'ENSEMBLE : recoller
 *    les survivantes livrerait un texte amputé présenté comme complet ;
 *  - une tranche en échec réseau idem — c'est le mode de défaillance de
 *    onError=continueRegularOutput (n8n-workflows#442) ;
 *  - un item sans identifiant est signalé non mémorisé plutôt que traité en
 *    silence (azy.daily#150 : 94 s de gpt-4o générées puis jetées).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.resolve(__dirname, '..', '..');
const WF = JSON.parse(
  fs.readFileSync(path.join(RACINE, 'workflows/Torah_Vocalization_Worker.json'), 'utf8')
);
const CODE = Object.fromEntries(
  WF.nodes.filter(n => n.parameters && n.parameters.jsCode).map(n => [n.name, n.parameters.jsCode])
);

const echecs = [];
function controle(libelle, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  const vu = typeof obtenu === 'string' && obtenu.length > 70 ? obtenu.slice(0, 70) + '…' : JSON.stringify(obtenu);
  console.log(`  ${ok ? '✅' : '❌'} ${libelle.padEnd(54)} ${vu}` + (ok ? '' : `  (attendu ${JSON.stringify(attendu)})`));
  if (!ok) echecs.push(libelle);
}

function executer(nom, entree, refs = {}) {
  const env = v => (Array.isArray(v) ? v : [v]).map(x => (x && x.json !== undefined ? x : { json: x }));
  const items = env(entree);
  const ctx = {
    $input: { all: () => items, first: () => items[0] },
    $: n => {
      if (!(n in refs)) throw new Error(`nœud « ${n} » non fourni`);
      const v = env(refs[n]);
      return { all: () => v, first: () => v[0] };
    },
    console, JSON, Object, Array, String, Number, Math, parseInt, isNaN, RegExp,
  };
  return env(vm.runInNewContext(`(function(){${CODE[nom]}})()`, ctx));
}

// Le texte réel qui a fait expirer l'exécution 746039, si le log est encore là.
const CHEMIN_LOG = path.join(RACINE, 'logs_vocalize.log');
let texteReel = null;
try {
  const brut = JSON.parse(fs.readFileSync(CHEMIN_LOG, 'utf8'));
  texteReel = (Array.isArray(brut) ? brut[0] : brut).text || null;
} catch (e) { /* le log est un artefact de diagnostic, pas une dépendance */ }

console.log('\n0. expressions n8n — le préfixe « = » ne peut pas manquer');
{
  // Sans « = » en tête, n8n envoie la chaîne LITTÉRALE : le nœud Save to Cache
  // appelait « {{ $env.TORAH_API_URL }}/api/vocalization/save » tel quel, et
  // recevait « Invalid URL … must start with http or https ».
  //
  // Le défaut était muet : onError=continueRegularOutput l'avalait, et rien ne
  // regardait le résultat du save. C'est la cause d'azy.daily#150 — « 0 ligne
  // persistée sur ~1M commentaires ». Le contrôle de persistance ajouté depuis
  // l'a rendu visible, mais la cause tenait à un caractère.
  const sansPrefixe = [];
  for (const n of WF.nodes) {
    for (const champ of ['url', 'jsonBody', 'responseBody']) {
      const v = (n.parameters || {})[champ];
      if (typeof v === 'string' && v.includes('{{') && !v.startsWith('=')) {
        sansPrefixe.push(`${n.name}.${champ}`);
      }
    }
  }
  controle('aucune expression sans « = »', sansPrefixe, []);
  controle('Save to Cache appelle bien une expression',
    WF.nodes.find(n => n.name === 'Save to Cache').parameters.url,
    '={{ $env.TORAH_API_URL }}/api/vocalization/save');
}

console.log('\n1. découpage du texte réel qui a expiré');
if (!texteReel) {
  console.log('  ⏭  logs_vocalize.log absent — cas rejoué sur un texte synthétique');
}
{
  const texte = texteReel || ('משפט לדוגמה בעברית ללא ניקוד. '.repeat(200));
  const item = { text: texte, openaiApiKey: 'sk-test', context: { traite: 'Avot DeRabbi Natan', page: '1' } };
  const tr = executer('Découper Texte', item).map(i => i.json);

  controle('longueur du cas de référence', texte.length, texteReel ? 5224 : texte.length);
  controle('découpé en plusieurs tranches', tr.length > 1, true);
  controle('concaténation identique à l’original', tr.map(t => t.text).join(''), texte);
  controle('aucune tranche au-dessus de 3 750 car.', tr.every(t => t.text.length <= 3750), true);
  controle('clé OpenAI portée sur chaque tranche', tr.every(t => t.openaiApiKey === 'sk-test'), true);
  controle('_nbTranches cohérent', tr.every(t => t._nbTranches === tr.length), true);
  console.log(`     → ${tr.length} tranches : ${tr.map(t => t.text.length).join(', ')} car.`);
  const pire = Math.max(...tr.map(t => t.text.length));
  console.log(`     → durée prédite par tranche : ${((2100 + 13.7 * pire) / 1000).toFixed(0)} s (timeout 240 s pour le cumul)`);
}

console.log('\n2. cas limites du découpage');
{
  const court = executer('Découper Texte', { text: 'טקסט קצר' }).map(i => i.json);
  controle('texte court : une seule tranche', court.length, 1);
  controle('texte court : intact', court[0].text, 'טקסט קצר');

  // Aucune ponctuation : le repli doit couper aux espaces, pas rendre une tranche unique.
  const sansPonct = 'מילה '.repeat(1500);
  const tr = executer('Découper Texte', { text: sansPonct }).map(i => i.json);
  controle('sans ponctuation : découpé quand même', tr.length > 1, true);
  controle('sans ponctuation : reconstruction exacte', tr.map(t => t.text).join(''), sansPonct);

  // Aucune frontière du tout : coupe nette plutôt qu'une tranche qui expire.
  const bloc = 'א'.repeat(9000);
  const tb = executer('Découper Texte', { text: bloc }).map(i => i.json);
  controle('bloc sans frontière : tranches bornées', tb.every(t => t.text.length <= 3750), true);
  controle('bloc sans frontière : reconstruction exacte', tb.map(t => t.text).join(''), bloc);
}

console.log('\n3. recollage — le chemin nominal');
{
  const rep = n => Array.from({ length: n }, (_, i) => ({
    statusCode: 200,
    body: { choices: [{ message: { content: `מְנֻקָּד ${i}` }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 120 } },
  }));
  const r = executer('Recoller Vocalisation', rep(3))[0].json;
  controle('pas d’erreur', r.body.error, undefined);
  controle('tranches recollées', r.body.choices[0].message.content, 'מְנֻקָּד 0 מְנֻקָּד 1 מְנֻקָּד 2');
  controle('tokens cumulés', r.body.usage, { prompt_tokens: 300, completion_tokens: 360 });
  controle('nombre de tranches reporté', r.body._tranches, 3);
}

console.log('\n4. recollage — les trois garde-fous');
{
  const ok = { statusCode: 200, body: { choices: [{ message: { content: 'מְנֻקָּד' }, finish_reason: 'stop' }], usage: {} } };

  // (a) troncature par le modèle — le défaut le plus dangereux : aucune erreur émise
  const tronque = { statusCode: 200, body: { choices: [{ message: { content: 'מְנֻ' }, finish_reason: 'length' }], usage: {} } };
  let r = executer('Recoller Vocalisation', [ok, tronque])[0].json;
  controle('troncature → échec global', !!r.body.error, true);
  controle('message nomme finish_reason', /finish_reason=length/.test(r.body.error.message), true);
  controle('aucun texte partiel livré', r.body.choices, undefined);

  // (b) tranche en échec réseau (forme onError)
  const perdue = { error: { message: '500 - {"error":{"message":"boom"}}', code: 'ERR_BAD_RESPONSE' } };
  r = executer('Recoller Vocalisation', [ok, perdue, ok])[0].json;
  controle('tranche perdue → échec global', !!r.body.error, true);
  controle('compte des tranches dans le message', /2\/3 tranches/.test(r.body.error.message), true);

  // (c) réponse vide
  const vide = { statusCode: 200, body: { choices: [{ message: { content: '   ' }, finish_reason: 'stop' }], usage: {} } };
  r = executer('Recoller Vocalisation', [ok, vide])[0].json;
  controle('réponse vide → échec global', /réponse vide/.test(r.body.error.message), true);
}

console.log('\n5. l’échec de recollage est bien vu par Extract GPT Response');
{
  const r = executer('Recoller Vocalisation', [
    { statusCode: 200, body: { choices: [{ message: { content: 'x' }, finish_reason: 'length' }], usage: {} } },
  ])[0].json;
  const prev = { text: 'טקסט', context: {}, startTime: 0 };
  const sortie = executer('Extract GPT Response', r, {
    'Validate Input': { isBatch: true, startTime: 0 },
    'Process Batch Item': prev,
  })[0].json;
  controle('success = false', sortie.success, false);
  controle('rien à sauvegarder', sortie._saveData, undefined);
}

console.log('\n6. item sans identifiant — signalé, pas traité en silence');
{
  const base = {
    success: true, cached: false,
    vocalization: { original: 'טקסט', vocalized: 'טֶקְסְט' },
    metadata: {},
  };
  let r = executer('Clean Response', {}, {
    'Extract GPT Response': Object.assign({}, base, {
      _saveData: { segment_id: null, source_text_id: null, commentary_id: null },
    }),
  })[0].json;
  controle('persisted = false', r.persisted, false);
  controle('code d’avertissement', r.warning.code, 'NOT_PERSISTABLE');
  controle('la vocalisation est quand même rendue', r.vocalization.vocalized, 'טֶקְסְט');
  controle('_saveData retiré de la réponse', r._saveData, undefined);

  r = executer('Clean Response', {}, {
    'Extract GPT Response': Object.assign({}, base, {
      _saveData: { segment_id: null, source_text_id: 'st-1', commentary_id: null },
    }),
  })[0].json;
  controle('avec identifiant : aucun avertissement', r.warning, undefined);
}

// ---------------------------------------------------------------- en ligne
if (process.argv.includes('--en-ligne')) {
  console.log('\n7. appel réel à OpenAI sur le texte qui expirait');
  if (!texteReel) {
    console.log('  ⏭  logs_vocalize.log absent');
    conclure();
  } else {
    const cle = (fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8')
      .match(/^OPENAI_API_KEY=(.*)$/m) || [])[1];
    if (!cle) { console.log('  ⏭  pas de clé OpenAI'); conclure(); }
    else (async () => {
      const tr = executer('Découper Texte', { text: texteReel }).map(i => i.json);
      const SYS = "Tu es un expert en hébreu biblique et rabbinique. Ta tâche est d'ajouter les nekudot (voyelles hébraïques/signes de vocalisation) au texte hébreu fourni. Retourne UNIQUEMENT le texte vocalisé, sans explication ni commentaire.";
      const reponses = [];
      const t0 = Date.now();
      for (const t of tr) {
        const d0 = Date.now();
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o', temperature: 0.1,
            max_tokens: Math.min(16000, Math.max(1024, Math.ceil(t.text.length * 2))),
            messages: [{ role: 'system', content: SYS },
                       { role: 'user', content: 'Ajoute les nekudot (voyelles hébraïques) à ce texte:\n\n' + t.text }],
          }),
        });
        const body = await r.json();
        console.log(`     tranche ${t._tranche + 1}/${t._nbTranches} : ${t.text.length} car. → ` +
                    `${((Date.now() - d0) / 1000).toFixed(1)} s, finish=${body.choices?.[0]?.finish_reason}`);
        reponses.push({ statusCode: r.status, body });
      }
      const total = (Date.now() - t0) / 1000;
      const rec = executer('Recoller Vocalisation', reponses)[0].json;
      controle('aucune tranche en échec', rec.body.error, undefined);
      const voc = rec.body.choices?.[0]?.message?.content || '';
      const nek = [...voc].filter(c => c >= '֑' && c <= 'ׇ').length;
      controle('nekudot réellement produites', nek > 500, true);
      controle('longueur cohérente avec l’original', voc.length > texteReel.length * 0.85, true);
      console.log(`     → cumul ${total.toFixed(1)} s (timeout du nœud : 240 s), ` +
                  `${voc.length} car. vocalisés, ${nek} signes`);
      conclure();
    })().catch(e => { console.log(`  ❌ ${e.message}`); echecs.push('appel réel'); conclure(); });
  }
} else conclure();

function conclure() {
  console.log();
  if (echecs.length) { console.log(`❌ ${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`); process.exit(1); }
  console.log('✅ tous les contrôles passent');
}
