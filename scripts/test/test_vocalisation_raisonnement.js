#!/usr/bin/env node
/**
 * BUDGET DE RAISONNEMENT DE LA VOCALISATION — azy.daily#706.
 *
 * LE DÉFAUT, MESURÉ EN SERVICE LE 2026-11-22 (exécution 1313618)
 *
 * Deux pages de Bavli (Pesachim 22a/22b), 144 appels, ZÉRO caractère rendu.
 * `gpt-5-mini-2025-08-07` dépensait la TOTALITÉ du budget en raisonnement :
 *
 *     finish_reason = 'length'                          71/71
 *     completion_tokens == reasoning_tokens == budget   71/71
 *     data.text vide, success: true, HTTP 200
 *
 * `Vocaliser (LLM)` offrait `max_tokens = min(16000, max(1024, car × 2))` — un
 * budget dimensionné pour le TEXTE, à un modèle qui le dépense en calcul.
 *
 * ⚠️ AUGMENTER LE BUDGET NE CORRIGE RIEN : le raisonnement s'étend pour occuper
 * ce qu'on lui offre. Le levier est l'EFFORT, et ce fichier le verrouille.
 *
 * ⚠️ CE QUE CETTE SUITE PROTÈGE EN PRIORITÉ : le chemin `gpt-4o`, qui est le
 * DÉFAUT et qui fonctionne. Envoyer `reasoning_effort` à un modèle non raisonnant
 * ferait basculer le relais en mode raisonnement — il remplace `max_tokens` par
 * `max_completion_tokens`, RETIRE `temperature`, et OpenAI refuse le paramètre
 * (400). Le contrôle « corps identique à la veille » est donc le plus important
 * du fichier, pas une formalité.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let reussis = 0, echoues = 0;
function ok(nom, condition, detail) {
  if (condition) { reussis++; }
  else { echoues++; console.log(`  ❌ ${nom}` + (detail ? `\n       ${detail}` : '')); }
}
const egal = (nom, a, b) => ok(nom, JSON.stringify(a) === JSON.stringify(b),
  `attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
const g = (o) => (o && typeof o === 'object') ? o : {};

const wf = JSON.parse(fs.readFileSync(
  path.join(RACINE, 'workflows', 'Torah_Vocalization_Worker.json'), 'utf8'));
// ⚠️ TOLÉRANT À L'ABSENCE : un nœud manquant doit faire ÉCHOUER en nommant le
// contrôle, pas PLANTER — un plantage masque les contrôles suivants.
const noeud = (nom) => wf.nodes.find((x) => x.name === nom) || null;
const executer = (nom, entree, contexte) => {
  const n = noeud(nom);
  if (!n) return [{ json: { _noeud_absent: nom } }];
  const items = Array.isArray(entree) ? entree : [entree];
  return new Function('$input', '$', '$env', n.parameters.jsCode)(
    { first: () => ({ json: items[0] }), all: () => items.map((j) => ({ json: j })) },
    (nom2) => {
      if (!(nom2 in (contexte || {}))) throw new Error(`Referenced node is unexecuted: ${nom2}`);
      const v = contexte[nom2];
      const tab = Array.isArray(v) ? v : [v];
      return { first: () => ({ json: tab[0] }), all: () => tab.map((j) => ({ json: j })) };
    },
    {}
  );
};
const valider = (body, headers) => executer('Validate Input', {},
  { 'Webhook Trigger': { body, headers: headers || {} } })[0].json;

// Le corps envoyé au relais est une EXPRESSION, pas un Code node : on l'évalue
// comme n8n le fait, en retirant les délimiteurs `={{ … }}`.
const corpsAppel = (json) => {
  const n = noeud('Vocaliser (LLM)');
  if (!n) return { _noeud_absent: true };
  const expr = String(n.parameters.jsonBody).replace(/^=\{\{/, '').replace(/\}\}$/, '');
  return JSON.parse(new Function('$json', `return (${expr});`)(json));
};

// ═════════════════════════════════════════════════════════════════════════════
// 1 · LE DÉFAUT NE BOUGE PAS — `gpt-4o` DOIT RENDRE LE CORPS DE LA VEILLE
// ═════════════════════════════════════════════════════════════════════════════
{
  const v = valider({ text: 'שלום', openai_api_key: 'sk-X' });
  ok('entrée valide', v.valid, JSON.stringify(v.errors));
  egal('le défaut reste openai', v.provider, 'openai');
  egal('le défaut reste gpt-4o', v.model, 'gpt-4o');
  egal('⚠️ aucun effort imposé à un modèle non raisonnant', v.reasoningEffort, null);
  egal('et aucun fragment', v.reasoningConfig, null);

  const texte = 'א'.repeat(3000);
  const corps = corpsAppel({ text: texte, provider: 'openai', model: 'gpt-4o',
                             providerCle: 'sk-X', reasoningEffort: null, reasoningConfig: null });
  ok('⚠️ `reasoning_effort` ABSENT du corps', !('reasoning_effort' in corps), JSON.stringify(Object.keys(corps)));
  ok('⚠️ `reasoning_config` ABSENT du corps', !('reasoning_config' in corps));
  egal('⚠️ `temperature` conservée (le relais la retirerait en mode raisonnement)', corps.temperature, 0.1);
  // La formule d'origine, à la lettre : min(16000, max(1024, car × 2)).
  egal('⚠️ budget inchangé, sans marge', corps.max_tokens,
       Math.min(16000, Math.max(1024, Math.ceil(texte.length * 2))));
  egal('le plafond de 16 000 tient', corpsAppel({ text: 'א'.repeat(20000), provider: 'openai',
       model: 'gpt-4o', providerCle: 'k', reasoningEffort: null, reasoningConfig: null }).max_tokens, 16000);
  // L'invite est calibrée sur gpt-4o : la réécrire changerait le rendu des nekudot.
  ok('l\'invite système parle toujours de nekudot', /nekudot/.test(corps.system), corps.system);
  egal('un seul message utilisateur', corps.messages.length, 1);
  ok('et il porte le texte', corps.messages[0].content.endsWith(texte));
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · LA FAMILLE RAISONNANTE REÇOIT 'minimal' ET UNE MARGE
// ═════════════════════════════════════════════════════════════════════════════
{
  for (const m of ['gpt-5-mini-2025-08-07', 'gpt-5', 'openai/gpt-5.6', 'o3-mini', 'chatgpt-5']) {
    const v = valider({ text: 'שלום', provider: 'openai', model: m, provider_api_key: 'sk-X' });
    egal(`\`${m}\` → effort minimal`, v.reasoningEffort, 'minimal');
  }
  // ⚠️ Le discriminant ne vaut QUE chez openai : ailleurs, le relais ne bascule pas.
  egal('anthropic n\'est pas concerné',
       valider({ text: 'שלום', provider: 'anthropic', model: 'claude-haiku-4-5-20251001',
                 provider_api_key: 'sk-ant' }).reasoningEffort, null);

  const texte = 'א'.repeat(2290);  // la longueur exacte du cas mesuré
  const corps = corpsAppel({ text: texte, provider: 'openai', model: 'gpt-5-mini-2025-08-07',
                             providerCle: 'sk-X', reasoningEffort: 'minimal', reasoningConfig: null });
  egal('le corps porte l\'effort', corps.reasoning_effort, 'minimal');
  egal('⚠️ et le budget gagne la marge de raisonnement', corps.max_tokens,
       Math.ceil(texte.length * 2) + 1024);
  ok('⚠️ la marge ne casse pas le plafond',
     corpsAppel({ text: 'א'.repeat(20000), provider: 'openai', model: 'gpt-5',
                  providerCle: 'k', reasoningEffort: 'minimal', reasoningConfig: null }).max_tokens === 16000);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · L'APPELANT PRIME — IL A LE CATALOGUE, NOUS AVONS UNE EXPRESSION RÉGULIÈRE
// ═════════════════════════════════════════════════════════════════════════════
{
  egal('un effort explicite écrase le défaut',
       valider({ text: 'ש', provider: 'openai', model: 'gpt-5', provider_api_key: 'k',
                 reasoning_effort: 'low' }).reasoningEffort, 'low');
  egal('un effort explicite vaut aussi pour un modèle non reconnu',
       valider({ text: 'ש', provider: 'openai', model: 'gpt-7-futur', provider_api_key: 'k',
                 reasoning_effort: 'minimal' }).reasoningEffort, 'minimal');
  egal('le fragment du catalogue passe tel quel',
       valider({ text: 'ש', provider: 'openai', model: 'gpt-5', provider_api_key: 'k',
                 reasoning_config: { reasoning_effort: 'minimal' } }).reasoningConfig,
       { reasoning_effort: 'minimal' });
  // Un fragment mal formé doit être REFUSÉ, pas deviné : le relais lèverait dessus.
  const mauvais = valider({ text: 'ש', provider: 'openai', model: 'gpt-4o', openai_api_key: 'k',
                            reasoning_config: ['minimal'] });
  egal('⚠️ un fragment non-objet invalide l\'entrée', mauvais.valid, false);
  ok('et le motif est nommé', (mauvais.errors || []).some((e) => /reasoning_config/.test(e)),
     JSON.stringify(mauvais.errors));
  // Le fragment voyage aussi dans le corps.
  const corps = corpsAppel({ text: 'ש', provider: 'openai', model: 'gpt-5', providerCle: 'k',
                             reasoningEffort: null, reasoningConfig: { thinking: { type: 'enabled' } } });
  egal('le corps porte le fragment', corps.reasoning_config, { thinking: { type: 'enabled' } });
  ok('un fragment seul suffit à ouvrir la marge', corps.max_tokens === 1024 + 1024,
     String(corps.max_tokens));
}

// ═════════════════════════════════════════════════════════════════════════════
// 4 · LE PORTAGE JUSQU'À L'APPEL — MODE BATCH
// ═════════════════════════════════════════════════════════════════════════════
// Le lot traverse DEUX nœuds de recopie avant l'appel. Un champ oublié dans l'un
// des deux se voit seulement en service, et seulement sur le chemin batch.
{
  const v = valider({ provider: 'openai', model: 'gpt-5-mini', provider_api_key: 'k',
                      items: [{ text: 'א', commentary_id: 1 }, { text: 'ב', commentary_id: 2 }] });
  egal('mode batch détecté', v.isBatch, true);
  egal('effort calculé une fois pour le lot', v.reasoningEffort, 'minimal');
  const prepares = executer('Prepare Batch Items', v).map((x) => x.json);
  egal('chaque item du lot porte l\'effort',
       prepares.map((p) => p.reasoningEffort), ['minimal', 'minimal']);
  const courant = executer('Process Batch Item', prepares[0])[0].json;
  egal('⚠️ et il survit au nœud de traitement', courant.reasoningEffort, 'minimal');
  egal('le fragment aussi (ici absent, donc null)', courant.reasoningConfig, null);
}

// ═════════════════════════════════════════════════════════════════════════════
// 5 · LE DIAGNOSTIC — LA CAUSE AVANT LE SYMPTÔME
// ═════════════════════════════════════════════════════════════════════════════
// Rien ne change de COMPORTEMENT ici : dans tous les cas la tranche est rejetée
// et rien n'est sauvegardé. Ce qui change, c'est le message — et c'est lui qui a
// coûté deux diagnostics faux.
{
  const tranche = (data, usage) => ({ statusCode: 200, body: {
    success: true, data: data, meta: { provider: 'openai', model: 'gpt-5-mini', usage: usage || {} } } });

  const avale = executer('Recoller Vocalisation',
    [tranche({ text: '', finish_reason: 'length' },
             { prompt_tokens: 300, completion_tokens: 4580, reasoning_tokens: 4580 })])[0].json;
  egal('la tranche est rejetée', avale.body.success, false);
  ok('⚠️ le message NOMME le budget de raisonnement',
     /budget de raisonnement avalé/.test(avale.body.error.message), avale.body.error.message);
  ok('et il donne les deux nombres qui font la signature',
     /4580 jetons sur 4580/.test(avale.body.error.message), avale.body.error.message);
  ok('⚠️ il ne dit PLUS « réponse vide »',
     !/réponse vide/.test(avale.body.error.message), avale.body.error.message);

  // Tronqué mais non vide : c'est une vraie troncature, pas le budget avalé.
  const tronque = executer('Recoller Vocalisation',
    [tranche({ text: 'שָׁלוֹם', finish_reason: 'length' },
             { completion_tokens: 4580, reasoning_tokens: 0 })])[0].json;
  ok('une troncature reste une troncature',
     /génération interrompue/.test(tronque.body.error.message), tronque.body.error.message);
  ok('et ne se dit pas « budget avalé »',
     !/budget de raisonnement/.test(tronque.body.error.message));

  // Vide SANS troncature : « réponse vide » garde son sens.
  const vide = executer('Recoller Vocalisation',
    [tranche({ text: '   ', finish_reason: 'stop' }, {})])[0].json;
  ok('un vide sans cause reste « réponse vide »',
     /réponse vide/.test(vide.body.error.message), vide.body.error.message);

  // ⚠️ LE PIÈGE MULTI-FOURNISSEURS, acquis d'une PR précédente : les fins normales
  // d'Anthropic et de Gemini ne doivent pas être lues comme des troncatures.
  for (const fin of ['stop', 'end_turn', 'stop_sequence']) {
    const bon = executer('Recoller Vocalisation', [tranche({ text: 'שָׁלוֹם', finish_reason: fin },
      { prompt_tokens: 10, completion_tokens: 20 })])[0].json;
    egal(`\`${fin}\` est une fin normale`, bon.body.success, true);
  }
  // Et le recollage de plusieurs tranches reste intact.
  const deux = executer('Recoller Vocalisation', [
    tranche({ text: 'אָ', finish_reason: 'stop' }, { prompt_tokens: 5, completion_tokens: 7 }),
    tranche({ text: 'בָּ', finish_reason: 'stop' }, { prompt_tokens: 6, completion_tokens: 8 })])[0].json;
  egal('deux tranches se recollent', deux.body.data.text, 'אָ בָּ');
  egal('et les jetons s\'additionnent', deux.body.meta.usage,
       { prompt_tokens: 11, completion_tokens: 15 });
  egal('le nombre de tranches est rendu', deux.body._tranches, 2);
}

// ═════════════════════════════════════════════════════════════════════════════
// 6 · AUCUN CÂBLAGE N'A BOUGÉ
// ═════════════════════════════════════════════════════════════════════════════
// Le correctif est volontairement sans nouveau nœud : la boucle du lot (71 items
// sur le cas mesuré) n'est pas touchée.
{
  const cx = wf.connections;
  egal('Découper → Vocaliser', (g(g(cx['Découper Texte']).main)[0] || []).map((x) => x.node),
       ['Vocaliser (LLM)']);
  egal('Vocaliser → Recoller', (g(g(cx['Vocaliser (LLM)']).main)[0] || []).map((x) => x.node),
       ['Recoller Vocalisation']);
  egal('Recoller → Extract', (g(g(cx['Recoller Vocalisation']).main)[0] || []).map((x) => x.node),
       ['Extract GPT Response']);
  // splitInBatches v3 : sortie 0 = terminé, sortie 1 = corps de boucle. Inverser
  // ces deux-là ne déclencherait JAMAIS le corps (#165).
  egal('⚠️ la boucle garde l\'ordre des sorties de splitInBatches v3',
       [(g(g(cx['Loop Items']).main)[0] || []).map((x) => x.node),
        (g(g(cx['Loop Items']).main)[1] || []).map((x) => x.node)],
       [['Merge Batch Results'], ['Process Batch Item']]);
  egal('le timeout de l\'appel est inchangé', g(g(noeud('Vocaliser (LLM)')).parameters).options.timeout, 240000);
}

console.log(`\n${reussis} contrôles réussis, ${echoues} échoués`);
process.exit(echoues === 0 ? 0 : 1);
