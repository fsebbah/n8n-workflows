#!/usr/bin/env node
/**
 * AUDIO — Transcription : branche whisper-local (azy.daily#421, contrat #296)
 *
 * Décision du 23/09 : **option B** — le routage vers un fournisseur vit dans n8n, y compris
 * quand ce fournisseur est local. La branche est donc DANS `audio-transcription`, pas dans un
 * webhook séparé : MCP n'a rien à changer, il relaie déjà tout verbatim.
 *
 * Ce workflow ne transcrit pas : le service faster-whisper de prod001 va chercher l'audio,
 * transcrit et fait LUI-MÊME le rappel signé vers la `callback_url` reçue (annoncé par infra
 * le 2026-09-23 : `POST http://prod001.local:8088/api/v1/audio/transcribe` → `202 {accepted,
 * job_id}`, puis rappel `X-N8N-Signature`).
 *
 * n8n valide, relaie verbatim, répond 202 — et n'émet un rappel QUE si la soumission échoue :
 * le service n'a alors jamais accepté le job, personne ne rappellera, et chat.api attendrait
 * indéfiniment (jobs orphelins, azy.daily#422).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHIER = path.join(__dirname, '..', '..', 'workflows', 'AUDIO_-_Transcription.json');

let ok = 0;
let ko = 0;

function verifier(intitule, condition, detail) {
  if (condition) {
    ok += 1;
    console.log(`  ✓ ${intitule}`);
  } else {
    ko += 1;
    console.log(`  ✗ ${intitule}${detail ? `\n      ${detail}` : ''}`);
  }
}

const workflow = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
const noeud = (nom) => workflow.nodes.find((n) => n.name === nom);

/** Exécute le Code node `Valider la requête` sur un corps de requête. */
function valider(corps) {
  const ctx = vm.createContext({ $input: { first: () => ({ json: { body: corps } }) }, console });
  return vm.runInContext(`(function () {\n${noeud('Valider la requête').parameters.jsCode}\n})()`, ctx)[0].json;
}

/** Exécute `Construire le rappel d'échec` sur la sortie du nœud HTTP. */
function echec(reponseHttp, requete) {
  const ctx = vm.createContext({
    $input: { first: () => ({ json: reponseHttp }) },
    $: () => ({ first: () => ({ json: requete }) }),
    console,
  });
  const r = vm.runInContext(`(function () {\n${noeud("Construire le rappel d'échec local").parameters.jsCode}\n})()`, ctx);
  return { ...r[0].json, corps: JSON.parse(r[0].json.corps_json) };
}

// La charge telle que chat.api la compose (contrat #296) : `api_key` vaut « local » et
// `model` arrive préfixé — le moteur accepte les deux formes, nous ne réécrivons rien.
const BASE = {
  job_id: 'j-1', callback_url: 'https://api.azy.solutions/api/v1/webhooks/transcription-callback',
  audio_url: 'http://prod001.local:3900/azy-audio-prod/note.ogg?X-Amz-Signature=abc',
  mime_type: 'audio/ogg', filename: 'note.ogg', size_bytes: 120000,
  provider: 'whisper-local', model: 'faster-whisper-small', api_key: 'local',
};

console.log('\nAUDIO — Transcription : branche whisper-local\n');

console.log('Structure — une branche, pas un second webhook');
verifier('le webhook reste unique et inchangé', noeud('Webhook').parameters.path === 'audio-transcription',
  noeud('Webhook').parameters.path);
verifier('le routage local est testé AVANT le choix Mistral/OpenAI',
  workflow.connections['Refus avant appel ?'].main[1][0].node === 'whisper-local ?',
  JSON.stringify(workflow.connections['Refus avant appel ?'].main[1]));
verifier('un fournisseur distant continue par le chemin existant',
  workflow.connections['whisper-local ?'].main[1][0].node === 'Mistral ?');
verifier('la branche locale rejoint la signature commune (un seul chemin de rappel)',
  workflow.connections["Construire le rappel d'échec local"].main[0][0].node === 'Secret configuré ?');
const noms = new Set(workflow.nodes.map((n) => n.name));
const orphelines = Object.values(workflow.connections)
  .flatMap((c) => c.main.flat()).map((c) => c.node).filter((n) => !noms.has(n));
verifier('aucune connexion vers un nœud inexistant', orphelines.length === 0, JSON.stringify(orphelines));
verifier('le rappel n\'est jamais envoyé sans signature',
  workflow.connections['Secret configuré ?'].main[1][0].node === 'Erreur — secret absent');

console.log('\nCharge relayée — verbatim, contrat #296');
const v = valider(BASE);
verifier('whisper-local est un fournisseur accepté', v.valide === true, JSON.stringify(v.reponse));
verifier('la charge est relayée telle quelle, champ pour champ',
  JSON.stringify(v.charge_locale) === JSON.stringify(BASE), JSON.stringify(v.charge_locale));
verifier('le modèle préfixé n\'est pas réécrit (le moteur accepte les deux formes)',
  v.charge_locale.model === 'faster-whisper-small');
verifier('api_key « local » est transmise telle quelle — au moteur de l\'ignorer',
  v.charge_locale.api_key === 'local');
verifier('les fournisseurs distants ne portent pas de charge locale',
  valider({ ...BASE, provider: 'mistralai', model: 'voxtral-mini-latest', api_key: 'k',
    audio_url: 'https://x.test/a.ogg' }).charge_locale === null);

console.log('\nURL du stockage Garage (le défaut qu\'a trouvé ce test)');
// Mesuré le 23/09 : chat.api signe des URL `http://prod001.local:3900/...`. La validation
// exigeait https et refusait donc TOUT job whisper-local avant le moindre appel.
verifier('audio http vers prod001.local accepté', valider(BASE).valide === true);
verifier('callback http vers un .local accepté (chat.api en dev)',
  valider({ ...BASE, callback_url: 'http://llm.local:8000/api/v1/webhooks/transcription-callback' }).valide === true);
verifier('audio http vers une IP privée accepté',
  valider({ ...BASE, audio_url: 'http://192.168.1.114:3900/azy-audio/note.ogg' }).valide === true);
verifier('http PUBLIC toujours refusé (la tolérance ne vaut que pour le réseau local)',
  valider({ ...BASE, audio_url: 'http://exemple.test/a.ogg' }).valide === false);
verifier('https reste accepté partout',
  valider({ ...BASE, audio_url: 'https://f003.backblazeb2.test/file/note.ogg' }).valide === true);

console.log('\nRefus avant appel (l\'erreur nomme le champ)');
for (const [intitule, corps, champ] of [
  ['job_id manquant', { ...BASE, job_id: undefined }, 'job_id'],
  ['callback_url en http public', { ...BASE, callback_url: 'http://exemple.test/cb' }, 'callback_url'],
  ['fournisseur inconnu', { ...BASE, provider: 'whisper-distant' }, 'provider'],
]) {
  const r = valider(corps);
  verifier(`${intitule} → 400 sur le champ ${champ}`,
    r.valide === false && r.reponse.error.code === 'invalid_request'
    && r.reponse.error.fields.includes(champ), JSON.stringify(r.reponse.error));
}

console.log('\nÉchec de soumission : c\'est n8n qui doit rappeler');
const requete = valider(BASE);
const cas = [
  ['service injoignable (aucune réponse HTTP)', { error: { message: 'connect ECONNREFUSED' } }, 'provider_unavailable', null],
  ['service en panne (500)', { statusCode: 500, body: { message: 'moteur indisponible' } }, 'provider_unavailable', 500],
  ['jeton exigé (401)', { statusCode: 401, body: { message: 'token required' } }, 'provider_auth', 401],
  ['jeton refusé (403)', { statusCode: 403, body: {} }, 'provider_auth', 403],
  ['charge refusée (422)', { statusCode: 422, body: { message: 'transcription_model_unsupported' } }, 'provider_unavailable', 422],
];
for (const [intitule, reponse, code, statut] of cas) {
  const r = echec(reponse, requete);
  verifier(`${intitule} → ${code}, http_status ${statut}`,
    r.corps.error.code === code && r.corps.error.http_status === statut,
    JSON.stringify(r.corps.error));
}
const sansReponse = echec({ error: { message: 'connect ECONNREFUSED' } }, requete);
verifier('http_status reste null quand il n\'y a eu aucune réponse (jamais inventé)',
  sansReponse.corps.error.http_status === null);
verifier('le rappel d\'échec vise la callback_url reçue',
  sansReponse.callback_url === BASE.callback_url);
verifier('le corps signé porte success:false et le job',
  sansReponse.corps.success === false && sansReponse.corps.job_id === 'j-1');
verifier('meta nomme le fournisseur et le modèle',
  sansReponse.corps.meta.provider === 'whisper-local'
  && sansReponse.corps.meta.model === 'faster-whisper-small', JSON.stringify(sansReponse.corps.meta));

console.log('\nEnvironnement');
const url = noeud('whisper-local — soumettre').parameters.url;
verifier('l\'URL vient de $env avec repli sur prod001.local',
  /\$env\.WHISPER_LOCAL_URL/.test(url) && /prod001\.local:8088/.test(url) && url.endsWith('/api/v1/audio/transcribe'),
  url);
const entetes = noeud('whisper-local — soumettre').parameters.headerParameters.parameters;
verifier('le jeton est envoyé s\'il existe, absent sinon (infra a laissé le service ouvert)',
  entetes.some((h) => h.name === 'Authorization' && /WHISPER_LOCAL_TOKEN/.test(h.value)));
verifier('la soumission n\'échoue pas le workflow (neverError) — sinon aucun rappel ne partirait',
  noeud('whisper-local — soumettre').parameters.options.response.response.neverError === true);

console.log(`\nRésultat : ${ok} ok, ${ko} échec(s)\n`);
process.exit(ko === 0 ? 0 : 1);
