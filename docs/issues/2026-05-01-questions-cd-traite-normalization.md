# Questions équipe DATA — UPDATE `commentary_details.traite` & coordination ISSUE-007b

**Date :** 2026-05-01
**Émetteur :** équipe API torah-api
**Destinataire :** équipe DATA
**Contexte :** heads-up DATA sur UPDATE de normalisation `commentary_details.traite` (≈19 233 lignes Mishnah + Yerushalmi) + clôture du fix ISSUE-007b (fallback Guggenheimer / Yerushalmi).

Ce document liste les questions ouvertes côté API avant exécution. À renseigner par l'équipe DATA. Une fois les réponses collectées, on diffuse la note finale à l'équipe n8n et on planifie la fenêtre.

---

## A. UPDATE `commentary_details.traite`

### A1. Pré-staging et étalons de validation

**Contexte :** côté API on a un seul filtre direct sur `cd.traite` (`/api/vocalization/search` méthode 3) et deux flow-throughs en projection. On veut valider le diff sur staging avant de programmer la prod.

**Questions :**
1. Pouvez-vous lancer l'UPDATE sur staging en premier, avec snapshot avant/après ?
2. Les étalons proposés ci-dessous vous conviennent-ils, ou en préférez-vous d'autres ?
   - **Yerushalmi Berakhot 1a** — cas combiné UPDATE × Guggenheimer (cf. §C).
   - **Rif Ketubot** — cas pédagogique cité par DATA (524 lignes invisibles aujourd'hui sous `collectiveTitle`).
   - **Bavli Pesachim 6a** — témoin non impacté pour sanity check.
3. Pouvez-vous fournir le diff de valeurs `cd.traite` (ancienne → nouvelle) en CSV ou liste, pour qu'on documente précisément la note n8n ? Idéalement les ~50 valeurs uniques côté Mishnah + Yerushalmi suffisent.

### A2. Planning prod

**Question :**
1. Trois créneaux possibles pour l'exécution prod ? Idéal : hors heures hautes utilisateur, fenêtre 30 min minimum pour soak + check.
2. Préavis 24 h vers n8n : ça vous semble suffisant côté DATA, ou bien 48 h ?

### A3. Rollback

**Questions :**
1. Le backup `_backup_cd_traite_*` couvre-t-il bien toutes les colonnes nécessaires à un rollback bit-pour-bit (`cd.traite` + tout dépendant éventuel) ou seulement la colonne `traite` ?
2. Fenêtre de rétention du backup : 48 h après prod ? 72 h ? Plus ? On préfèrerait au moins 72 h pour avoir le temps de remonter d'éventuels tickets utilisateurs.
3. Si rollback : est-ce un simple `UPDATE … SET traite = backup.traite` ou faut-il un script DATA dédié ? Quelle latence estimée ?

### A4. Périmètre futur

**Contexte :** vous mentionnez Mishnah + Yerushalmi pour cette passe. On veut savoir si d'autres corpus suivront.

**Questions :**
1. D'autres normalisations `cd.traite` prévues sur Bavli, Tosefta, autres corpus ? Calendrier ?
2. Idem pour d'autres colonnes du même genre (`cd.page`, `cd.commentator`, `cd.reference`) — y a-t-il des UPDATE en pipeline qu'on doit anticiper ?
3. Une normalisation similaire est-elle prévue côté `source_text_segments` ou `source_texts` ?

---

## B. Coordination avec ISSUE-007b (Guggenheimer)

### B1. Ordre de déploiement

**Contexte :** la PR ISSUE-007b (fallback Guggenheimer + flag `anchor_source`) est prête côté API mais pas encore mergée. L'UPDATE `cd.traite` touche aussi les 576 lignes Guggenheimer.

**Questions :**
1. Préférez-vous qu'on merge ISSUE-007b **avant**, **pendant**, ou **après** l'UPDATE ?
   - **Avant l'UPDATE :** les 576 notes redeviennent visibles avec le **vieux** libellé `traite`, puis basculent au nouveau libellé après l'UPDATE → deux changements observables côté n8n à 1-2 jours d'intervalle.
   - **Après l'UPDATE :** les 576 notes restent invisibles pendant la fenêtre intermédiaire, puis réapparaissent **directement avec le nouveau libellé** → un seul changement observable. Préférable côté UX.
   - **Pendant (même jour) :** opération double, plus risquée.
2. Pas de blocage technique de notre côté pour s'aligner sur votre préférence. Quelle option recommandez-vous ?

### B2. Périmètre Guggenheimer (réponse partielle déjà reçue)

**Réponse DATA reçue 2026-05-01 :** 576/576 sur Yerushalmi, exclusivement `Notes by Heinrich Guggenheimer`. Confirmé.

**Questions complémentaires :**
1. Y a-t-il d'autres `commentator` connus pour ne pas avoir d'`anchorRef` Sefaria, mais qui ne sont pas encore en base ? Si oui, pouvez-vous les pré-déclarer pour qu'on étende `_GUGGENHEIMER_NOTES_COMMENTATOR` en `_EDITORIAL_NOTES_COMMENTATORS = (...)` dès maintenant ?
2. Si demain Sefaria ajoute des notes Guggenheimer sur d'autres corpus (Tosefta ? Mishnah indépendamment ?), est-ce un cas que vous comptez importer, ou bien c'est strictement Yerushalmi par design ? Ça oriente le choix de scoper le fallback côté API par `commentator` vs `(commentator, corpus)`.
3. Le fallback côté API utilise `cd.segment_num` comme proxy d'ancrage. Confirmez-vous que `cd.segment_num` est **toujours peuplé** pour les 576 lignes Guggenheimer ? On a un `if not seg: continue` qui les jette si NULL côté `segment_num` aussi (ce qui serait pire qu'avant).

### B3. Affichage côté front (info, pas action)

Côté ISSUE-007b on expose `anchor_source: "anchor" | "editorial_fallback"` aux clients. Est-ce que côté DATA vous avez une recommandation éditoriale sur comment ces notes devraient être présentées (ex : libellé "Note de l'édition Guggenheimer", picto livre, etc.) ? Pas bloquant pour le merge mais utile à transmettre au front.

---

## C. Cas combiné Yerushalmi Berakhot 1a — validation conjointe

Pour servir de cas pédagogique commun :

```sql
-- État avant les deux changements
SELECT id, commentator, traite, page, segment, segment_num, sub_segment
  FROM commentary_details
 WHERE commentator = 'Notes by Heinrich Guggenheimer'
   AND traite ILIKE '%Berakhot%'
   AND page = '1a'
 ORDER BY segment_num
 LIMIT 10;
```

**Questions :**
1. Pouvez-vous nous fournir les ~10 premières lignes (résultat brut) **avant** l'UPDATE pour figer le snapshot dans la note n8n ?
2. Et idem **après** l'UPDATE en staging, pour pouvoir diffuser un avant/après concret aux consommateurs ?

---

## D. Communication et gouvernance

### D1. Canal de coordination

**Questions :**
1. Pour les futures alertes DATA → API (UPDATE, REINDEX, MIGRATION), on continue sur Slack `#torah-data` + Slack `#torah-api`, ou on bascule sur un canal commun `#torah-db-changes` ?
2. SLA sur ce type d'alerte préalable : combien de jours ouvrés à l'avance pour des UPDATE de >10 k lignes ? On propose minimum 3 jours ouvrés sauf urgence sécurité.

### D2. Documentation persistante

**Question :**
1. Acceptez-vous qu'on track ce type d'opérations dans un changelog partagé `docs/data/changelog.md` côté repo torah-api (entrée par UPDATE, avec date d'exécution, volume, backup ref, rollback status) ? Ou bien vous préférez que ça vive côté repo DATA et qu'on link ici ?

---

## E. Récapitulatif demandes côté API

Ce qu'on attend de votre côté avant exécution prod, par ordre :

- [ ] Réponses A1, A2, A3 (staging, planning, rollback) → bloquant pour fixer la fenêtre.
- [ ] Réponse B1 (ordre vs ISSUE-007b) → on merge la PR ISSUE-007b en fonction.
- [ ] Réponses B2.1 et B2.3 → potentiellement extension du scope du fallback côté API avant merge.
- [ ] Snapshot pré-staging C.1 → on enrichit la note n8n.
- [ ] Snapshot post-staging C.2 + diff CSV A1.3 → on enrichit la note n8n et on diffuse à n8n avec préavis 24 h.
- [ ] Réponses A4, B2.2, B3, D1, D2 → utiles mais non bloquantes pour cette opération.

---

## F. Engagement côté API

- Aucune PR de code requise pour absorber l'UPDATE `cd.traite` (audit confirmé).
- PR ISSUE-007b prête côté local, ouverture pilotée par votre réponse B1.
- Note n8n rédigée (`docs/n8n/2026-05-01-update-cd-traite-normalization.md`), diffusion conditionnée à votre validation des sections concernées.
- Disponible pour appel/réunion 30 min si plus rapide qu'un échange écrit.
