#!/usr/bin/env node
/**
 * Additif Agenda : les options dormantes du nœud, enfin exposées au corps. #645
 *
 * Ces options ne sont pas nouvelles — `CalendarToolDynamic` les lit depuis toujours
 * avec une valeur de repli. Le workflow ne les posait pas : personne ne pouvait créer
 * un événement récurrent, poser un rappel, un Meet, une couleur ou une visibilité.
 *
 * ⚠️ POURQUOI CE TEST ÉVALUE LES EXPRESSIONS AU LIEU DE LES COMPARER
 * Une expression n8n qui « contient bien `recurrence` » peut rendre exactement la
 * mauvaise valeur. Le nœud fait `eventBody.recurrence = [valeur]` SANS valider : une
 * valeur fausse part chez Google telle quelle, et l'événement sort non récurrent sans
 * la moindre erreur. Comparer le TEXTE de l'expression n'attrape pas ça. On extrait
 * donc le corps de chaque `{{ … }}` et on l'évalue sur de vrais corps de requête.
 *
 * Le contrôle le plus fort est le dernier : chaque valeur de l'enum PUBLIÉ au schéma
 * est passée dans l'expression du workflow, et doit produire une valeur que le nœud
 * accepte. C'est ce qui garantit qu'un agent qui obéit au schéma est servi — la seule
 * promesse qui compte.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
let ok_ = 0, ko = 0;
function ok(nom, cond, det) {
  if (cond) ok_++; else { ko++; console.log(`  ❌ ${nom}` + (det ? `\n       ${det}` : '')); }
}
const egal = (nom, a, b) => ok(nom, JSON.stringify(a) === JSON.stringify(b),
  `attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);

const wf = JSON.parse(fs.readFileSync(
  path.join(RACINE, 'workflows', 'MCP_-_Google_Calendar_Server.json'), 'utf8'));
const noeud = (nom) => wf.nodes.find(n => n.name === nom);

/** Évalue une expression n8n `={{ … }}` sur un corps de requête donné. */
function evaluer(expr, corps) {
  const m = String(expr).match(/^=\{\{([\s\S]*)\}\}$/);
  if (!m) throw new Error(`pas une expression n8n : ${expr}`);
  // eslint-disable-next-line no-new-func
  return new Function('$json', `return (${m[1]});`)({ body: corps });
}

// ── 1 · Les paramètres sont posés là où le nœud sait les lire, et NULLE PART ailleurs
const CREATE = ['addGoogleMeet', 'recurrence', 'customRecurrence', 'recurrenceCount',
                'useDefaultReminders', 'reminderEmail', 'reminderPopup', 'colorId',
                'visibility'];
const UPDATE = ['useDefaultReminders', 'reminderEmail', 'reminderPopup', 'colorId',
                'visibility', 'status'];
for (const p of CREATE) ok(`createEvent → \`${p}\` posé`, p in noeud('createEvent').parameters);
for (const p of UPDATE) ok(`updateEvent → \`${p}\` posé`, p in noeud('updateEvent').parameters);

// ⚠️ `update` ne lit NI la récurrence NI le Meet — vérifié sur le nœud. Les poser
// n'aurait rien cassé : le nœud les ignore. Mais le schéma les aurait montrés comme
// honorés par `update`, et un agent aurait cru pouvoir rendre récurrent un événement
// existant. C'est la promesse non tenue que ce lot entier combat.
for (const p of ['recurrence', 'customRecurrence', 'recurrenceCount', 'addGoogleMeet']) {
  ok(`updateEvent → \`${p}\` PAS posé (le nœud ne le lit pas en update)`,
     !(p in noeud('updateEvent').parameters));
}

// ── 2 · Récurrence : un mot d'agent doit devenir une RRULE, jamais passer brut ──
const rec = noeud('createEvent').parameters.recurrence;
const custom = noeud('createEvent').parameters.customRecurrence;
egal('recurrence → corps vide = non récurrent', evaluer(rec, {}), '');
egal('recurrence → `daily`', evaluer(rec, { recurrence: 'daily' }), 'RRULE:FREQ=DAILY');
egal('recurrence → `weekly`', evaluer(rec, { recurrence: 'weekly' }), 'RRULE:FREQ=WEEKLY');
egal('recurrence → `monthly`', evaluer(rec, { recurrence: 'monthly' }), 'RRULE:FREQ=MONTHLY');
egal('recurrence → `yearly`', evaluer(rec, { recurrence: 'yearly' }), 'RRULE:FREQ=YEARLY');
// La casse ne doit pas décider du résultat : un LLM écrit « Daily » aussi souvent.
egal('recurrence → `Daily` (casse indifférente)',
     evaluer(rec, { recurrence: 'Daily' }), 'RRULE:FREQ=DAILY');
// ⚠️ Hors vocabulaire, on rend '' — donc PAS de récurrence — et surtout jamais le mot
// brut : `recurrence: ["every day"]` serait un 400 de Google sur une requête par
// ailleurs valide. L'événement est créé, simplement non répété.
egal('recurrence → mot inconnu = non récurrent, pas de valeur brute',
     evaluer(rec, { recurrence: 'every day' }), '');

// Une règle brute bascule le nœud en mode `custom`, qui lui fait lire `customRecurrence`.
egal('recurrence_rule → bascule le nœud en `custom`',
     evaluer(rec, { recurrence_rule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH' }), 'custom');
egal('recurrence_rule → la règle brute est transmise',
     evaluer(custom, { recurrence_rule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH' }),
     'RRULE:FREQ=WEEKLY;BYDAY=MO,TH');
egal('recurrence_rule → prime sur `recurrence`',
     evaluer(rec, { recurrence: 'daily', recurrence_rule: 'RRULE:FREQ=HOURLY' }), 'custom');
egal('recurrence_count → 0 par défaut (sans fin)',
     evaluer(noeud('createEvent').parameters.recurrenceCount, {}), 0);
egal('recurrence_count → transmis',
     evaluer(noeud('createEvent').parameters.recurrenceCount, { recurrence_count: 12 }), 12);

// ── 3 · Rappels : le drapeau doit basculer TOUT SEUL, sinon le reste est mort ───
// Le nœud n'écrit les rappels QUE si `useDefaultReminders` est faux. Exposer
// `reminder_email` sans basculer ce drapeau n'aurait donc RIEN fait — l'option serait
// restée dormante tout en paraissant exposée.
for (const [nom, corps, attendu] of [
  ['corps vide → défauts de l\'agenda', {}, true],
  ['reminder_email posé → bascule à faux', { reminder_email: 1440 }, false],
  ['reminder_popup posé → bascule à faux', { reminder_popup: 15 }, false],
  ['reminder_popup à 0 posé explicitement → bascule (= aucun rappel)', { reminder_popup: 0 }, false],
  ['use_default_reminders:false → faux', { use_default_reminders: false }, false],
  ['use_default_reminders:true → vrai', { use_default_reminders: true }, true],
]) {
  for (const op of ['createEvent', 'updateEvent']) {
    egal(`${op} useDefaultReminders → ${nom}`,
         evaluer(noeud(op).parameters.useDefaultReminders, corps), attendu);
  }
}

// ⚠️ LE DÉFAUT DU NŒUD EST 10, PAS 0. Si on avait laissé ce défaut, demander un rappel
// courriel la veille aurait ajouté EN PLUS une alerte à l'écran 10 minutes avant, que
// personne n'a demandée. On pose 0 : seul ce qui est demandé est envoyé.
for (const op of ['createEvent', 'updateEvent']) {
  egal(`${op} reminderPopup → 0 par défaut, pas le 10 du nœud`,
       evaluer(noeud(op).parameters.reminderPopup, {}), 0);
  egal(`${op} reminderEmail → 0 par défaut`,
       evaluer(noeud(op).parameters.reminderEmail, {}), 0);
  egal(`${op} reminderEmail → minutes transmises`,
       evaluer(noeud(op).parameters.reminderEmail, { reminder_email: 1440 }), 1440);
}

// ── 4 · Couleur : un agent dit « tomate », Google veut « 11 » ───────────────────
const COULEURS = { lavender: '1', sage: '2', grape: '3', flamingo: '4', banana: '5',
                   tangerine: '6', peacock: '7', graphite: '8', blueberry: '9',
                   basil: '10', tomato: '11' };
for (const op of ['createEvent', 'updateEvent']) {
  const c = noeud(op).parameters.colorId;
  egal(`${op} colorId → vide par défaut`, evaluer(c, {}), '');
  for (const [nom, id] of Object.entries(COULEURS)) {
    egal(`${op} colorId → \`${nom}\` = ${id}`, evaluer(c, { color_id: nom }), id);
  }
  egal(`${op} colorId → \`Tomato\` (casse indifférente)`,
       evaluer(c, { color_id: 'Tomato' }), '11');
  // L'identifiant Google direct reste accepté : les appelants existants ne cassent pas.
  egal(`${op} colorId → identifiant Google \`7\` accepté tel quel`,
       evaluer(c, { color_id: '7' }), '7');
  // Une valeur inconnue est TRANSMISE, pas avalée : Google rend une erreur explicite,
  // au lieu d'un événement silencieusement incolore.
  egal(`${op} colorId → valeur inconnue transmise (erreur explicite de Google)`,
       evaluer(c, { color_id: 'cramoisi' }), 'cramoisi');
}

// ── 5 · Visibilité et statut ───────────────────────────────────────────────────
for (const op of ['createEvent', 'updateEvent']) {
  egal(`${op} visibility → \`default\` par défaut`,
       evaluer(noeud(op).parameters.visibility, {}), 'default');
  egal(`${op} visibility → \`private\` transmis`,
       evaluer(noeud(op).parameters.visibility, { visibility: 'private' }), 'private');
}

// ⚠️ CE CONTRÔLE EST UNE CORRECTION, PAS UN AJOUT.
// Le nœud lit `status` avec le défaut 'confirmed' et fait `if (status) eventBody.status
// = status`. Comme le workflow ne posait RIEN, chaque mise à jour envoyait
// `status: confirmed` : déplacer un événement « provisoire » le confirmait
// silencieusement. En posant '' par défaut, le nœud ne touche plus au statut. La
// requête est un PATCH, donc un champ omis est un champ conservé.
egal('updateEvent status → \'\' par défaut : le statut actuel est CONSERVÉ',
     evaluer(noeud('updateEvent').parameters.status, {}), '');
for (const s of ['confirmed', 'tentative', 'cancelled']) {
  egal(`updateEvent status → \`${s}\` transmis quand il est demandé`,
       evaluer(noeud('updateEvent').parameters.status, { status: s }), s);
}

// ── 6 · Le contrôle qui compte : l'enum publié est HONORÉ par l'expression ─────
// Un agent n'a que le schéma. Chaque valeur qu'on lui offre doit donc produire, en
// sortie d'expression, quelque chose que le nœud accepte. C'est le seul contrôle qui
// relie la promesse faite au LLM au comportement réel.
const sticky = wf.nodes.find(n => n.type === 'n8n-nodes-base.stickyNote');
const bloc = (sticky.parameters.content || '')
  .match(/\*\*InputSchema:\*\*\s*```json\s*([\s\S]*?)```/);
ok('schéma publié et lisible', !!bloc);
const props = bloc ? (JSON.parse(bloc[1]).properties || {}) : {};

const ATTENDU_PAR_ENUM = {
  recurrence: (v) => /^RRULE:FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)$/.test(v),
  color_id: (v) => /^([1-9]|1[01])$/.test(v),
  visibility: (v) => ['default', 'public', 'private', 'confidential'].includes(v),
  status: (v) => ['confirmed', 'tentative', 'cancelled'].includes(v),
};
const PARAM = { recurrence: 'recurrence', color_id: 'colorId',
                visibility: 'visibility', status: 'status' };
for (const [champ, valide] of Object.entries(ATTENDU_PAR_ENUM)) {
  const p = props[champ];
  ok(`schéma → \`${champ}\` déclare une liste fermée`, !!(p && p.enum), JSON.stringify(p));
  ok(`schéma → \`${champ}\` porte une explication`, !!(p && p.description));
  if (!p || !p.enum) continue;
  const op = champ === 'status' ? 'updateEvent' : 'createEvent';
  for (const v of p.enum) {
    const rendu = evaluer(noeud(op).parameters[PARAM[champ]], { [champ]: v });
    ok(`schéma → \`${champ}: ${v}\` produit une valeur acceptée par le nœud (${JSON.stringify(rendu)})`,
       valide(rendu));
  }
}
// Les champs à UNITÉ doivent la dire : « 1440 » n'a de sens qu'en minutes.
for (const champ of ['reminder_email', 'reminder_popup', 'recurrence_count',
                     'recurrence_rule', 'use_default_reminders', 'add_google_meet']) {
  ok(`schéma → \`${champ}\` porte une explication`,
     !!(props[champ] && props[champ].description), JSON.stringify(props[champ]));
}
// `add_google_meet` et `status` ne valent que pour une opération : le schéma est plat,
// c'est donc l'explication qui doit le dire, sinon l'agent les posera partout.
for (const [champ, mot] of [['add_google_meet', 'create'], ['status', 'update']]) {
  ok(`schéma → \`${champ}\` précise l'opération concernée`,
     /UNIQUEMENT/.test((props[champ] || {}).description || '')
     && new RegExp(mot).test((props[champ] || {}).description || ''),
     (props[champ] || {}).description);
}

console.log(`\n${ok_} contrôles réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
