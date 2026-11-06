#!/usr/bin/env node
/**
 * L'étiquette `**Category:** torah` — périmètre arrêté par Franck le 2026-11-06.
 *
 *     node scripts/test/test_category_torah.js
 *
 * Pourquoi cette étiquette existe
 * -------------------------------
 * MCP applique `QDRANT_EXCLUDE_CATEGORIES=torah` pour garder les outils Torah hors
 * de sa recherche sémantique, et son `sync_to_qdrant` lit NOTRE champ tel quel
 * (`tool_data.get("category", "general")`), sans rien dériver.
 *
 * ⚠️ Or avant ce lot, **aucun** outil du parc ne portait `category=torah` — 4 sur 239
 * avaient une catégorie, aucune n'était `torah`. L'exclusion n'excluait donc rien, et
 * ne l'avait jamais fait. Le parseur fonctionnait ; c'est le contenu qui manquait.
 * **Un champ lisible mais vide est la panne la plus discrète : tout le code marche.**
 *
 * Le périmètre, et ses deux exceptions
 * ------------------------------------
 * 37 outils, soit tout le périmètre `torah-*` SAUF :
 *
 *  • `torah-pdf` → `DOC - Render PDF`. Le chemin dit « torah », la fonction dit rendu
 *    de document GÉNÉRIQUE : ce workflow sert aussi `render-pdf` (n'importe quel
 *    gabarit) et `pdf-templates` (le catalogue des gabarits). Reste dans la recherche.
 *  • `torah-chunk` → `Torah Chunk Worker`. Découpe **n'importe quel texte** en
 *    segments ≤ 8 000 caractères ; entrées `text` + `api_key`, rien de Torah dedans.
 *    Aucun autre outil du parc ne fait ça. Reste dans la recherche.
 *
 * Les deux illustrent la même chose : **le nom colle à l'histoire du workflow, pas à
 * sa fonction.** C'est l'argument qui a fait abandonner le filtre par nom en #555.
 *
 * ⚠️ LE PIÈGE QUE CE TEST EXISTE POUR ATTRAPER
 * `Build Registry` fait `nodes.find(n => n.type === 'stickyNote')` — **la PREMIÈRE
 * seulement**. Une étiquette posée dans la deuxième sticky serait invisible du
 * catalogue, sans aucune erreur. Un workflow du lot en a deux
 * (`Torah Vocalization Worker`), et 9 outils du catalogue sont dans ce cas.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DOSSIER = path.resolve(__dirname, '..', '..', 'workflows');
const ETIQUETTE = /\*\*Category:\*\*\s*torah\b/i;
/** Périmètre décidé le 2026-11-06 : ces deux-là restent trouvables. */
const EXCEPTIONS = new Set(['torah-pdf', 'torah-chunk']);
const ATTENDU = 37;

let ok = 0;
const echecs = [];
const verifier = (intitule, obtenu, attendu) => {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  if (a === b) { ok += 1; console.log(`  ✓ ${intitule}`); }
  else { echecs.push(intitule); console.log(`  ✗ ${intitule}\n      obtenu  : ${a}\n      attendu : ${b}`); }
};

/** Tous les workflows du dépôt, avec leur premier webhook et leurs sticky notes. */
const lus = [];
for (const f of fs.readdirSync(DOSSIER).filter((n) => n.endsWith('.json'))) {
  let wf;
  try { wf = JSON.parse(fs.readFileSync(path.join(DOSSIER, f), 'utf8')); }
  catch (e) { continue; }
  const noeuds = wf.nodes || [];
  const wh = noeuds.find((n) => n.type === 'n8n-nodes-base.webhook');
  if (!wh) continue;
  const stickies = noeuds.filter((n) => n.type === 'n8n-nodes-base.stickyNote');
  lus.push({
    fichier: f,
    nom: wf.name,
    chemin: (wh.parameters || {}).path || wh.webhookId || '',
    stickies,
  });
}

/**
 * Le périmètre vient du FICHIER-LISTE versionné, pas d'un filtre rejoué sur le dépôt.
 *
 * ⚠️ Pourquoi : le dépôt garde des workflows INACTIFS dont le chemin de webhook est
 * périmé. `Torah_Translation_Orchestrator.json` revendique `torah-translate-batch`,
 * chemin réattribué à `Torah Batch Dispatcher` par la PR #409 — l'Orchestrator est
 * inactif en base (`1eVhwHnO4UQyUYrN`), le Dispatcher est l'actif (`kbpJGkxdkJdpehiZ`).
 * Un filtre rejoué sur les fichiers comptait donc 40 candidats au lieu de 39 et
 * réclamait une étiquette sur un fichier mort. Le périmètre est une DÉCISION, pas une
 * dérivation : il se lit là où il a été écrit.
 */
const LISTE = path.resolve(__dirname, '..', 'n8n', 'reimport-category-torah.txt');
const stems = fs.readFileSync(LISTE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
const parFichier = new Map(lus.map((w) => [w.fichier.replace(/\.json$/, ''), w]));
const candidats = stems.map((st) => {
  const w = parFichier.get(st);
  if (!w) throw new Error(`le fichier-liste nomme ${st}, absent de workflows/ ou sans webhook`);
  return w;
});
/** Les deux exceptions, retrouvées dans le dépôt pour être contrôlées elles aussi. */
const exceptions = lus.filter((w) => EXCEPTIONS.has(w.chemin));

(async () => {
  console.log('\nÉtiquette « Category: torah » — périmètre du 2026-11-06\n');

  console.log('Le périmètre');
  {
    verifier(`${ATTENDU} outils dans le fichier-liste`, candidats.length, ATTENDU);
    verifier('les 2 exceptions sont dans le parc, et HORS de la liste',
      exceptions.map((w) => w.chemin).sort(), ['torah-chunk', 'torah-pdf']);
    verifier('aucune exception ne s\'est glissée dans la liste',
      candidats.filter((w) => EXCEPTIONS.has(w.chemin)).map((w) => w.chemin), []);
  }

  console.log('\nChaque outil du périmètre porte l\'étiquette — dans sa PREMIÈRE sticky');
  {
    const manquants = [];
    const malPlaces = [];
    for (const w of candidats) {
      const premiere = w.stickies[0];
      if (!premiere || !ETIQUETTE.test(premiere.parameters.content || '')) {
        // ⚠️ Distinguer « absente » de « présente mais pas lue » : le second cas est
        // le plus dangereux, parce que le fichier a l'air correct à la relecture.
        const ailleurs = w.stickies.some((s) => ETIQUETTE.test(s.parameters.content || ''));
        (ailleurs ? malPlaces : manquants).push(w.chemin);
      }
    }
    verifier('aucune étiquette manquante', manquants, []);
    verifier('aucune étiquette dans une sticky NON LUE par le registre', malPlaces, []);
  }

  console.log('\n⚠️ Les deux exceptions NE doivent PAS l\'avoir');
  {
    const fautifs = exceptions
      .filter((w) => w.stickies.some((s) => ETIQUETTE.test(s.parameters.content || '')))
      .map((w) => w.chemin);
    // Les étiqueter les retirerait de la recherche sémantique — l'inverse de la décision.
    verifier('torah-pdf et torah-chunk restent sans catégorie torah', fautifs, []);
  }

  console.log('\nAucune étiquette torah hors du périmètre');
  {
    const horsPerimetre = lus
      .filter((w) => !candidats.includes(w))
      // Le fichier mort de l'Orchestrator n'a pas d'étiquette : s'il en gagnait une,
      // ce contrôle le dirait, et c'est voulu — un fichier inactif ne doit pas
      // porter une décision de catalogue.
      .filter((w) => w.stickies.some((s) => ETIQUETTE.test(s.parameters.content || '')))
      .map((w) => `${w.chemin} (${w.nom})`);
    verifier('aucun outil non-torah étiqueté torah', horsPerimetre, []);
  }

  console.log('\nLes 4 sticky notes créées pour l\'occasion sont utilisables');
  {
    // Elles ne prétendent pas documenter le workflow, mais elles doivent au moins
    // porter son nom et dire pourquoi elles existent — sinon c'est un artefact muet.
    const creees = candidats.filter((w) =>
      w.stickies.length === 1 && /Note créée le 2026-11-06/.test(w.stickies[0].parameters.content || ''));
    verifier('4 sticky créées', creees.length, 4);
    verifier('chacune porte le nom du workflow',
      creees.filter((w) => !(w.stickies[0].parameters.content || '').includes(w.nom)).map((w) => w.chemin), []);
    verifier('chacune renvoie à l\'issue qui la motive',
      creees.filter((w) => !/azy\.daily#631/.test(w.stickies[0].parameters.content || '')).map((w) => w.chemin), []);
  }

  console.log('\nUne seule étiquette par sticky — pas de doublon de parsing');
  {
    const doubles = candidats
      .filter((w) => w.stickies[0] &&
        ((w.stickies[0].parameters.content || '').match(/\*\*Category:\*\*/gi) || []).length > 1)
      .map((w) => w.chemin);
    verifier('aucune sticky ne porte deux fois **Category:**', doubles, []);
  }

  console.log(`\nRésultat : ${ok} ok, ${echecs.length} échec(s)\n`);
  if (echecs.length) { echecs.forEach((e) => console.log(`  - ${e}`)); process.exit(1); }
})();
