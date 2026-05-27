# RFC-096 — Extension pédagogique du modèle Personae (Assistant pédagogique)

| Champ | Valeur |
|-------|--------|
| Statut | Draft |
| Version | 0.2 (fusion v1 interne + avis externe) |
| Auteur | Franck |
| Date | 2026-05-27 |
| Étend | **RFC-081** (Personae 3-axes : Expert × Specialty × Style × Binding), **RFC-095** (inscription matières + audience + routing DM, *livré* B1/B2) |
| Dépend de | **RFC-082** (programmes experts / Google Classroom) pour l'objet Référentiel ; capacités RAG multi-bot + chaîne multi-intent (numéros RFC **à attribuer**) |
| Liés | Travaux Progression Pédagogique (STMG SGN 2026-2027) |

> ⚠️ **Recalage numérotation (2026-05-27)** : ce document était nommé `RFC-095-personae-pedagogique-v2`, or RFC-095 est **déjà** le modèle *inscription + audience* (livré). C'est donc une **nouvelle RFC (RFC-096)** qui *étend* RFC-081 et RFC-095, pas une v2 de RFC-095.
>
> ⚠️ **xrefs du draft initial à recaler** : « RFC-053 (RAG scoping) », « RFC-054 (multi-intent) », « RFC-059 (gamification mastery) » **ne correspondent pas** à l'index de ce repo (ici RFC-053 = *Discord bot server management*, RFC-054 = *inexistante*, RFC-059 = *Guild credit allocation*). Les vrais numéros pour le scoping RAG / la chaîne multi-intent sont **à attribuer**. Delta back + état du livré : `docs/issues/2026-05-27-rfc-096-pedagogique-delta-back.md`.

---

## 1. Résumé exécutif

Le modèle Personae actuel — composé de **Rôle, Spécialité, Style, Audience, Canal** — est solide pour les usages génériques (marketing, support, formation entreprise) mais présente plusieurs angles morts pour l'usage scolaire :

1. Le **Niveau** est noyé dans la Spécialité, ce qui interdit la mutualisation par cycle et empêche le raisonnement sur la progression.
2. Le **Référentiel** officiel (BO, Eduscol) est traité comme un simple document du corpus, alors qu'il définit ce qui *doit* être couvert.
3. Les **Compétences** ne sont pas représentées comme objets pilotables et réutilisables entre niveaux.
4. Le **Mode pédagogique** (acte pédagogique) est confondu avec le Style (ton).
5. La **Politique de réponse** (scaffolding) est implicite.
6. La **temporalité** (progression dans l'année) n'est pas représentée.
7. Le **routage matière** dans le cas multi-matières repose sur une classification silencieuse.
8. Aucune **mesure de qualité** n'est attachée au Personae.

Cette RFC propose une **extension scolaire optionnelle** du modèle Personae, structurée autour de sept nouveaux objets ou dimensions :

```
Assistant pédagogique = Personae générique
                      + pedagogical_extension {
                            Discipline
                          + Niveau
                          + Référentiel
                          + Compétences
                          + Corpus typé
                          + Mode pédagogique
                          + Politique de réponse
                          + Progression
                          + Santé
                        }
```

L'extension est **strictement additive** : les personae existants (marketing, support, coaching) ne sont pas touchés ; leur `pedagogical_extension` reste à `null`.

**Priorisation** : (1) Niveau + Référentiel + Compétence, (2) Mode pédagogique, (3) Politique de réponse, (4) Progression, (5) Routage robuste, (6) Santé.

---

## 2. Contexte

### 2.1 Modèle Personae actuel

| Objet | Rôle |
|-------|------|
| Rôle | Fonction de l'assistant (Professeur, Coach…) |
| Spécialité | Domaine + sources documentaires |
| Style | Ton, registre, format |
| Audience | Public visé |
| Brique | Spécialité + Style réutilisable |
| Canal | Lieu d'activation (Discord, Web, Classroom) |
| Binding | Rattachement personae × canal |
| Inscription | Matières d'un élève |

### 2.2 Vertus du modèle actuel

- Évite le bot monolithique.
- Sépare proprement **savoir** / **médiation** / **public**, ce qui correspond implicitement au triangle didactique.
- Réutilisable via Brique, déclinable via Audience.
- Vue matricielle des bindings opérationnelle.

### 2.3 Limites pour le scolaire

Au-delà des huit angles morts résumés en §1, deux limites structurelles méritent d'être nommées :

**Duplication par niveau.** "Maths 3ème" et "Maths 4ème" sont aujourd'hui deux Spécialités distinctes alors que ~70% du corpus cycle 4 est commun. À l'échelle multi-tenant, la duplication devient ingérable.

**Impossibilité de raisonner sur la couverture.** Sans représentation explicite du programme officiel, on ne peut pas répondre à *« ce personae couvre-t-il toutes les compétences attendues en 3ème ? »*.

---

## 3. Modèle cible

### 3.1 Vue conceptuelle

```
Assistant pédagogique
├── Identité (Rôle, nom affiché)
├── Domaine scolaire
│   ├── Discipline
│   ├── Niveau (+ cycle)
│   ├── Référentiel
│   └── Compétences couvertes
├── Ressources
│   └── Corpus typé (cours, exercices, corrections, erreurs, méthodes)
├── Adaptation pédagogique
│   ├── Audience
│   ├── Style
│   ├── Mode pédagogique (acte par défaut + autorisés)
│   ├── Politique de réponse (catalogue de règles)
│   └── Progression active
├── Activation
│   └── Canal + binding + inscriptions
└── Qualité
    └── Santé du personae
```

### 3.2 Responsabilités par objet

| Objet | Question | Exemple |
|-------|----------|---------|
| Rôle | Qui parle ? | Professeur, Tuteur, Conseiller |
| Discipline | De quelle matière ? | Mathématiques, Histoire-Géo |
| Niveau | À quel niveau scolaire ? | 3ème, 1ère STMG |
| Référentiel | Qu'est-ce qui est attendu officiellement ? | BO cycle 4 maths |
| Compétence | Quelle unité pédagogique pilotable ? | Résoudre une équation du 1er degré |
| Corpus | Sur quelles ressources s'appuie-t-on ? | Cours, exercices, annales |
| Audience | À quel type d'élève s'adresse-t-on ? | Soutien, standard, visée mention |
| Style | Comment s'exprime-t-on ? | Rassurant, rigoureux, ludique |
| Mode pédagogique | Quel acte est en cours ? | Explication, aide guidée, correction |
| Politique de réponse | Quelles règles de scaffolding ? | Indice avant solution, refus devoir clef en main |
| Progression | Où en est la classe / l'élève ? | Période 2, chapitre courant |
| Canal | Où intervient l'assistant ? | Discord, Web, Classroom |
| Santé | Est-il fiable et couvrant ? | Indicateurs §3.3.9 |

### 3.3 Objets nouveaux ou recadrés

#### 3.3.1 Discipline + Niveau (split de la Spécialité)

La Spécialité *« Maths 3ème »* est éclatée :

```json
{
  "discipline_id": "mathematiques",
  "level_id": "3eme",
  "cycle": "cycle_4"
}
```

Le libellé court *« Maths 3ème »* est conservé côté UI (les profs raisonnent ainsi). Côté données, le couple est explicite, indexable, et permet la mutualisation par cycle.

#### 3.3.2 Référentiel

Le Référentiel matérialise un programme officiel sous forme exploitable, pas comme un PDF du corpus :

```json
{
  "referential_id": "bo_maths_cycle4_3eme",
  "source": "BO n°31 du 30 juillet 2020",
  "discipline_id": "mathematiques",
  "level_id": "3eme",
  "cycle": "cycle_4",
  "competency_ids": [
    "eq_1er_degre",
    "fonctions_affines",
    "theoreme_thales",
    "proportionnalite_avancee"
  ],
  "version": "2020-07-30",
  "limits": [
    "ne pas introduire les équations du second degré",
    "trigonométrie limitée au triangle rectangle"
  ]
}
```

Le Référentiel sert simultanément à filtrer le retrieval Qdrant (extension du grain RFC-053), évaluer la couverture, détecter le hors-périmètre, borner le golden dataset et identifier les prérequis manquants.

#### 3.3.3 Compétence (nouveau, objet distinct)

La Compétence est l'**unité pédagogique pilotable**. Elle est un objet de première classe, **partagé entre référentiels** (une même compétence peut apparaître à plusieurs niveaux avec des attendus différents) :

```json
{
  "competency_id": "proportionnalite",
  "label": "Proportionnalité",
  "discipline_id": "mathematiques",
  "level_variants": [
    {
      "level_id": "cm2",
      "expected": "résoudre des problèmes simples avec tableaux",
      "prerequisites": ["multiplication", "division"]
    },
    {
      "level_id": "3eme",
      "expected": "mobiliser dans des problèmes complexes, pourcentages, fonctions linéaires",
      "prerequisites": ["calcul_litteral", "fonctions_lineaires"]
    }
  ]
}
```

**Pourquoi un objet distinct du Référentiel** : une notion comme la proportionnalité traverse CM2, 6ème, 5ème, 4ème, 3ème avec des exigences progressives mais des prérequis partiellement communs. Modéliser la Compétence à part permet de capturer ces continuités, de mutualiser, et de raisonner sur les prérequis transversaux (essentiel pour le mode `remediation`).

Le Référentiel devient alors une **liste de `competency_ids`** plutôt qu'un container monolithique des compétences.

#### 3.3.4 Corpus typé

Le Corpus reste rattaché à `(Discipline, Niveau)` mais ses chunks Qdrant portent un `type` qui pilote le filtrage RAG (cf. §4) :

| Type | Contenu | Mode pédagogique principal |
|------|---------|----------------------------|
| `cours` | Leçons, définitions, démonstrations | `explication` |
| `exercice` | Énoncés et corrigés gradués | `entrainement` |
| `methode` | Stratégies de résolution typées | `aide_guidee` |
| `correction` | Productions d'élèves corrigées | `correction` |
| `erreur_classique` | Erreurs récurrentes commentées | `remediation` |
| `referentiel` | Compétences BO | bornage / refus |

Métadonnées par chunk :

```json
{
  "discipline_id": "mathematiques",
  "level_id": "3eme",
  "cycle": "cycle_4",
  "referential_id": "bo_maths_cycle4_3eme",
  "competency_ids": ["eq_1er_degre"],
  "type": "cours",
  "difficulty": "standard",
  "source_type": "support_enseignant",
  "validated_by": "teacher",
  "periods": ["periode_2"]
}
```

#### 3.3.5 Mode pédagogique (nouveau, distinct du Style)

Le Style décrit *comment on parle*. Le Mode pédagogique décrit *l'acte pédagogique en cours*. Deux axes orthogonaux.

| Mode | Objectif |
|------|----------|
| `explication` | Faire comprendre une notion |
| `aide_guidee` | Accompagner sans donner la solution |
| `correction` | Corriger une production d'élève (copie, étape) |
| `entrainement` | Proposer des exercices progressifs |
| `revision` | Synthèse + quiz avant évaluation |
| `evaluation` | Tester les acquis |
| `remediation` | Reprendre les prérequis ou lacunes |

Cette liste est volontairement opérationnelle : elle correspond aux **usages réels d'un enseignant**, pas à des catégories didactiques abstraites (socratique, magistrale…) qui mélangeraient posture et acte.

Un Personae a un mode par défaut et une liste de modes autorisés :

```json
{
  "default_pedagogical_mode": "aide_guidee",
  "allowed_pedagogical_modes": [
    "explication", "aide_guidee", "correction",
    "entrainement", "revision", "remediation"
  ]
}
```

Le mode actif d'un échange peut être :
- détecté automatiquement par classification d'intention,
- choisi par l'enseignant via une commande,
- demandé explicitement par l'élève ("aide-moi à corriger ma copie").

#### 3.3.6 Politique de réponse (nouveau, catalogue)

La Politique de réponse est un **catalogue de règles nommées** qu'on combine pour piloter le scaffolding. C'est plus modulaire et plus utilisable côté UI qu'un objet à champs booléens.

| Politique | Effet |
|-----------|-------|
| `indice_avant_solution` | Donner un indice avant toute résolution complète |
| `solution_par_etapes` | Découper la réponse en étapes successives |
| `questionner_avant_aider` | Demander à l'élève ce qu'il a déjà tenté |
| `correction_sans_faire_a_la_place` | Corriger la démarche sans produire le devoir |
| `solution_complete_autorisee_en_revision` | Autoriser une solution complète dans un contexte de révision |
| `refus_devoir_clef_en_main` | Refuser de faire un devoir entier sans participation |
| `rappeler_prerequis_si_bloque` | Remonter aux prérequis si l'élève est bloqué |
| `verbalisation_obligatoire` | Demander à l'élève de reformuler ce qu'il comprend |

Application :

```json
{
  "response_policies": [
    "indice_avant_solution",
    "correction_sans_faire_a_la_place",
    "refus_devoir_clef_en_main",
    "rappeler_prerequis_si_bloque"
  ]
}
```

**Cadrage produit important** : ce n'est pas une politique « anti-triche ». C'est une politique de **scaffolding pour l'apprentissage**. Le framing matter dans la communication aux profs, élèves et familles.

Des **presets** peuvent être proposés côté UI : *« Soutien scolaire »*, *« Préparation examen »*, *« Coaching méthode »*, etc.

#### 3.3.7 Progression

Plug-in direct sur l'objet **Progression Pédagogique existant** (cf. travaux STMG SGN 2026-2027). Le Personae connaît à tout instant la position de la classe ou de l'élève :

```json
{
  "progression_binding": {
    "scope": "class_group",
    "progression_id": "maths_3eme_2026_2027_classe_3A"
  }
}
```

Structure d'une Progression :

```json
{
  "progression_id": "maths_3eme_2026_2027_classe_3A",
  "scope": "class_group",
  "etablissement": "college_xxx",
  "periode_active": {
    "numero": 2,
    "debut": "2026-11-04",
    "fin": "2026-12-19"
  },
  "competencies_vues": ["calcul_litteral", "equations_simples"],
  "competencies_en_cours": ["theoreme_thales"],
  "competencies_a_venir": ["fonctions_affines", "trigonometrie"]
}
```

Comportement attendu : si la question porte sur une compétence `a_venir`, le Personae le signale et propose deux options (découverte simple ou remédiation des prérequis) plutôt que de répondre comme si la notion avait été enseignée.

**C'est probablement le différenciant le plus fort par rapport à un GPT générique.** Aucun chatbot grand public ne sait *où* en est une classe à un instant t.

#### 3.3.8 Santé du personae

Indicateur agrégé affiché dans la matrice (cf. RFC-095) :

| Indicateur | Calcul |
|------------|--------|
| Couverture référentiel | % de compétences avec ≥ N chunks pertinents |
| Hors-périmètre | % de questions sortant du couple `(discipline, niveau)` |
| Qualité réponses | Score LLM judge azy-mcp sur le golden dataset |
| Respect du mode pédagogique | % de réponses conformes au mode actif |
| Respect des politiques | % de réponses conformes aux politiques activées |
| Qualité du routage matière | Taux d'acceptation des matières détectées |
| Fraîcheur corpus | Date du dernier ajout |
| Satisfaction enseignant | Retours manuels et validations |

Alimentation :
- LLM judge azy-mcp sur le golden dataset (batch hebdomadaire, modèle Haiku pour le coût).
- Traces de conversation classifiées.
- Corrections explicites des élèves sur le routage matière (§5.3).
- Retours enseignants.

---

## 4. RAG et filtrage par mode pédagogique

### 4.1 Principe

Le retrieval Qdrant n'est plus une simple recherche sémantique sur un corpus monolithique : il est **piloté par le Mode pédagogique actif**. Le type de chunks privilégié change selon l'acte en cours.

| Mode actif | Types de chunks privilégiés |
|------------|------------------------------|
| `explication` | `cours`, `methode`, `exemple` |
| `aide_guidee` | `methode`, `exercice`, `erreur_classique` |
| `correction` | `correction`, `erreur_classique`, `bareme` |
| `entrainement` | `exercice` (filtré par difficulté) |
| `revision` | `cours` (synthèses), `exercice` (representatifs) |
| `remediation` | `cours` (prérequis), `erreur_classique`, `methode` |

### 4.2 Ordre de filtrage recommandé

```
1. Tenant / établissement
2. Élève / groupe / classe (si applicable)
3. Discipline
4. Niveau
5. Référentiel
6. Progression active (vu / en cours / non vu)
7. Compétence ou notion détectée dans la question
8. Type de ressource selon le mode pédagogique
9. Difficulté (selon audience)
```

Le filtrage 1–7 borne le retrieval ; le filtrage 8–9 le pondère.

### 4.3 Extension du grain RFC-053

RFC-053 introduisait un scoping `(guild_id, bot_id)` pour Qdrant. L'extension scolaire ajoute :

```
(tenant_id, persona_id, discipline_id, level_id, referential_id, competency_id, type, difficulty)
```

Tous indexés. Le scoping reste rétro-compatible : un personae non-scolaire utilise le grain RFC-053 d'origine.

---

## 5. Cas particulier : un élève, plusieurs matières

### 5.1 Tuteur personnel comme orchestrateur

Conformément au cas prévu dans le guide actuel, l'élève voit un **Tuteur personnel** unique. Derrière, l'orchestrateur sélectionne le personae interne pertinent (Maths 3ème, Histoire 3ème…) selon :

1. Inscription de l'élève (périmètre autorisé).
2. Classification de la matière depuis la question.
3. Classification de l'intention pédagogique (→ mode actif).
4. Audience associée à l'élève.
5. Progression de la classe / de l'élève.

### 5.2 Cas qui cassent le routage

| Cas | Exemple | Risque |
|-----|---------|--------|
| Question transversale | "Je ne comprends pas la moyenne dans notre expérience" | Maths ou SVT |
| Question implicite | "Et pour l'autre formule ?" | Perte de contexte |
| Question hors inscription | "Explique le logarithme" en CM2 | Hors-périmètre |
| Question ambiguë | "Je ne comprends pas les fonctions" | Maths / programmation / économie |
| Suite conversationnelle | Matière claire 3 messages avant | Mauvais routage isolé |

### 5.3 Transparence à l'élève (UX)

La matière détectée doit être **affichée** et **corrigible** en un clic :

```
Matière détectée : Mathématiques
[ Changer : SVT | Physique | Géographie ]
```

Bénéfices :
- Correction immédiate des erreurs de routage.
- Trace utilisable pour améliorer le classifieur.
- Bénéfice pédagogique direct : oblige l'élève à conceptualiser sa question.
- Confiance utilisateur (pas de boîte noire).

### 5.4 Implémentation orchestrateur

Étend RFC-054 (multi-intent chain dans azy-mcp) :

```
Message élève
  → identification utilisateur
  → chargement profil (niveau, inscriptions, audience, progression)
  → classification matière + intention → mode pédagogique
  → si confiance < seuil : confirmation utilisateur
  → sélection personae interne
  → retrieval Qdrant filtré (cf. §4.2)
  → application style + mode + politiques de réponse
  → génération réponse
  → trace de progression (compétence abordée, intention, satisfaction)
```

---

## 6. Évaluation

### 6.1 Golden dataset par référentiel

Pour chaque Référentiel, un golden dataset minimal :

```
20 questions d'explication
20 demandes d'aide guidée
20 corrections d'erreurs fréquentes
10 questions hors programme
10 questions ambiguës multi-matières
10 cas de devoir à ne pas faire à la place de l'élève
```

Chaque question est rattachée à un ou plusieurs `competency_ids`, ce qui permet le calcul de couverture par compétence.

Stockage : collection Qdrant dédiée par référentiel, taguée `golden_dataset=true`.

### 6.2 LLM judge (extension azy-mcp)

Critères de notation pondérés :

1. Exactitude disciplinaire.
2. Adéquation au niveau (vocabulaire, complexité).
3. Conformité au mode pédagogique actif.
4. Conformité aux politiques de réponse activées.
5. Respect du format attendu pour le canal.
6. Refus correct du hors-périmètre.
7. Cohérence avec la progression active (notion vue / non vue).

Le juge LLM **ne remplace pas l'enseignant**. Il permet un premier contrôle automatique, la détection de dérives, la comparaison entre versions de prompts, la mesure de non-régression, et l'aide à la validation avant publication.

### 6.3 Boucle d'amélioration

Annotation des cas litigieux via le pipeline n8n existant → ré-injection dans le golden dataset → re-évaluation hebdomadaire. Cohérent avec l'architecture LangChain human-in-the-loop déjà mappée sur l'infra (Qdrant golden datasets + Discord annotation queue).

---

## 7. Migration depuis le modèle actuel

### 7.1 Compatibilité ascendante via `pedagogical_extension`

L'extension est **strictement optionnelle**. Un personae non-scolaire reste inchangé :

```json
{
  "id": "coach_marketing_b2b",
  "role_id": "coach",
  "style_id": "encourageant",
  "audience_id": "junior",
  "channels": [...],
  "pedagogical_extension": null
}
```

Un personae scolaire l'utilise :

```json
{
  "id": "persona_maths_3eme_soutien",
  "role_id": "teacher",
  "style_id": "rassurant_concret",
  "audience_id": "remise_a_niveau",
  "channels": [...],
  "pedagogical_extension": {
    "discipline_id": "mathematiques",
    "level_id": "3eme",
    "cycle": "cycle_4",
    "referential_id": "bo_maths_cycle4_3eme",
    "competency_ids": ["..."],
    "corpus_collections": ["..."],
    "default_pedagogical_mode": "aide_guidee",
    "allowed_pedagogical_modes": ["..."],
    "response_policies": ["..."],
    "progression_binding": {...},
    "health": {...}
  }
}
```

Aucun champ scolaire ne pollue le schéma générique.

### 7.2 Étapes

| # | Étape | Effort | Impact |
|---|-------|--------|--------|
| 1 | Schéma `pedagogical_extension` + objets Level, CurriculumReference, Competency | Moyen | Élevé (déverrouille tout le reste) |
| 2 | Migration des Spécialités existantes (split Discipline/Niveau inféré) | Moyen | Élevé |
| 3 | Catalogue des Modes pédagogiques + prompts par mode | Moyen | Élevé |
| 4 | Catalogue des Politiques de réponse + presets | Faible | Élevé |
| 5 | Connexion Progression existante | Moyen | Différenciant fort |
| 6 | Transparence routage matière | Faible | Robustesse |
| 7 | Santé du personae dans matrice + LLM judge | Élevé | Pilotage à l'échelle |

### 7.3 Sourcing des Référentiels et Compétences

Trois options :

- **Constitution manuelle** par les profs (1 référentiel = 1 à 2 jours-homme).
- **Extraction LLM** depuis les BO Eduscol publics (à valider qualitativement).
- **Mutualisation** entre tenants (§8.3).

Recommandation : seed initial par extraction LLM sur 3 à 5 référentiels prioritaires (Maths/Histoire/SVT collège), revue humaine, puis itération.

### 7.4 POC de validation

**Cible** : Maths 3ème + Référentiel BO cycle 4 + Progression existante.

Justification : le travail STMG SGN 2026-2027 fournit déjà un template de Progression complet, transposable en quelques jours sur un autre niveau. Le BO cycle 4 maths est bien documenté. Et le segment "maths collège" est la demande tutorat dominante identifiée.

Critères de succès du POC :
- Couverture référentiel ≥ 80%.
- Taux hors-périmètre ≤ 5%.
- Score LLM judge ≥ 0,85 sur le golden dataset initial (50 questions).
- Au moins 3 modes pédagogiques opérationnels (explication, aide_guidee, correction).
- Validation par 2 enseignants externes.

---

## 8. Décisions ouvertes

### 8.1 Nommage « Personae » vs « Assistant spécialisé »

Le terme « Personae » entre en collision avec l'usage marketing classique de **persona = profil client**. Or le modèle a déjà `Audience` qui *est* le profil. Risque de confusion pour les profs et directions formation.

**Recommandation** : *« Assistant spécialisé »* (ou *« Assistant pédagogique »* pour la variante scolaire) côté UI ; *« Personae »* conservé comme terme technique interne et dans l'API (`POST /personae`).

| Interne | Interface |
|---------|-----------|
| Personae | Assistant spécialisé |
| Personae pédagogique | Assistant pédagogique |
| Audience | Public cible |
| Binding | Activation |
| Spécialité | Discipline / Domaine |

### 8.2 Granularité du Niveau

**Recommandation** : grain principal = classe (5ème, 4ème, 3ème), métadonnée héritée = cycle, pour mutualiser le corpus quand pertinent.

### 8.3 Mutualisation des Référentiels et Compétences

Le programme BO est public.

**Recommandation** : Référentiel et Compétences maîtres mutualisés entre tenants + surcharges locales possibles par tenant (ex. compétences spécifiques au projet pédagogique d'un établissement).

### 8.4 Choix du Mode pédagogique : automatique ou manuel ?

Trois options :
- Classification automatique d'intention.
- Choix explicite par l'élève (commande, menu).
- Choix par l'enseignant (mode imposé sur un canal).

**Recommandation** : automatique par défaut, override possible par l'élève via commande Discord ou bouton UI, override possible par l'enseignant au niveau du Personae (ex. *« ce salon est en mode `revision` uniquement »*).

### 8.5 Validation enseignante avant publication

Faut-il bloquer l'activation d'un Personae pédagogique si la Santé est trop faible ?

**Recommandation** : ne pas bloquer, mais afficher un statut *« À compléter »* dans la matrice et exiger une validation explicite *« Je publie quand même »*. La validation pédagogique humaine reste souveraine.

### 8.6 Partage de Briques entre profs / établissements

Levier de valeur potentiel : marketplace interne de Briques calibrées. **Hors-périmètre de cette RFC**, à garder comme roadmap.

### 8.7 Routage : corrections élèves comme dataset d'entraînement

Les corrections de matière par les élèves peuvent-elles servir à entraîner un routeur interne ?

**Recommandation** : oui, sous réserve de consentement et d'anonymisation. À traiter dans une RFC dédiée au classifieur.

---

## 9. Non-objectifs

Cette RFC ne vise pas à :

- Remplacer le modèle Personae existant.
- Imposer cette extension aux assistants non scolaires.
- Définir tous les programmes officiels en une fois.
- Construire immédiatement tous les golden datasets.
- Fine-tuner un modèle LLM.
- **Remplacer la validation enseignante** : le juge LLM est une aide, pas un arbitre final.

Le fine-tuning reste hors-périmètre immédiat. La priorité reste : **RAG structuré + prompts par mode + politiques de réponse + évaluation**.

---

## 10. Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|-----------|
| Modèle trop complexe pour l'interface | Adoption faible | Parcours guidé existant + valeurs par défaut + presets + Briques pré-faites |
| Confusion entre Style, Audience, Mode et Politique | Mauvaise configuration | Exemples concrets + aide à la configuration intégrée + presets nommés |
| Routage matière incorrect | Réponses hors-contexte | Transparence + correction utilisateur (§5.3) + seuil de confiance |
| Référentiel incomplet | Mauvaise couverture | Indicateur de couverture dans la Santé |
| Progression trop rigide | Frustration élève | Autoriser découverte contrôlée hors progression avec signalement |
| Sur-coût d'évaluation (LLM judge sur N×M personae) | Coût opérationnel | Batch hebdomadaire hors-pointe + modèle Haiku pour le judge |
| Mode pédagogique mal respecté par le LLM | Dérive pédagogique | Politiques explicites en system prompt + ajout à la grille du judge + auto-correction par re-prompt |
| LLM judge trop confiant | Faux sentiment de qualité | Combiner juge LLM + revue enseignante + jeux de tests humains |
| Maintenance des Référentiels (BO évoluent) | Obsolescence | Versionnage du Référentiel + alerte à la mise à jour BO |
| Confusion vocabulaire Personae / Persona | UX dégradée | Renommage UI (§8.1) |

---

## 11. Glossaire mis à jour

| Terme | Définition |
|-------|------------|
| Personae | Assistant configuré (terme technique interne) |
| Assistant spécialisé | Idem, libellé côté UI |
| Assistant pédagogique | Personae avec `pedagogical_extension` non nulle |
| Discipline | Matière (Mathématiques, Histoire-Géographie…) |
| Niveau | Classe scolaire (CM2, 3ème, 1ère…) |
| Cycle | Regroupement officiel de niveaux (cycle 3, cycle 4…) |
| Référentiel | Représentation structurée d'un programme officiel |
| Compétence | Unité pédagogique pilotable, partageable entre référentiels |
| Corpus | Documents pédagogiques typés rattachés à `(Discipline, Niveau)` |
| Audience | Profil du public visé (soutien, standard, visée mention) |
| Style | Registre, ton, format d'expression |
| Mode pédagogique | Acte pédagogique en cours (explication, aide guidée, correction…) |
| Politique de réponse | Règle nommée de scaffolding |
| Progression | Position temporelle dans le programme annuel |
| Brique | Composition réutilisable (Discipline + Niveau + Style + Mode par défaut) |
| Santé | Indicateur agrégé de fiabilité du personae |
| `pedagogical_extension` | Bloc optionnel d'un Personae portant les attributs scolaires |

---

## 12. Annexes

### A. Mapping ancien → nouveau modèle

| Ancien (RFC-081/095) | Nouveau (cette RFC) |
|----------------------|---------------------|
| Rôle | Inchangé |
| Spécialité | `pedagogical_extension`: Discipline + Niveau + Référentiel + Compétences + Corpus typé |
| Style | Inchangé (recadré : registre + format uniquement) |
| Audience | Inchangé |
| Canal | Inchangé |
| Brique = Spécialité + Style | Brique = Discipline + Niveau + Style + Mode pédagogique par défaut |
| — | Mode pédagogique (nouveau) |
| — | Politique de réponse (nouveau) |
| — | Progression (nouveau, branchée sur l'existant) |
| — | Santé (nouveau, indicateur) |

### B. Schéma JSON complet d'un Assistant pédagogique

```json
{
  "id": "persona_maths_3eme_soutien",
  "display_name": "Prof de Maths 3ème — Soutien",
  "role_id": "teacher",
  "style_id": "rassurant_concret",
  "audience_id": "remise_a_niveau",
  "channels": [
    {
      "type": "discord",
      "target": "salon_maths_3eme_3A"
    }
  ],
  "pedagogical_extension": {
    "discipline_id": "mathematiques",
    "level_id": "3eme",
    "cycle": "cycle_4",
    "referential_id": "bo_maths_cycle4_3eme",
    "competency_ids": [
      "eq_1er_degre",
      "fonctions_affines",
      "proportionnalite",
      "theoreme_thales"
    ],
    "corpus_collections": [
      "maths_cycle4_cours",
      "maths_3eme_exercices",
      "maths_3eme_corrections",
      "maths_3eme_erreurs_classiques",
      "maths_3eme_methodes"
    ],
    "default_pedagogical_mode": "aide_guidee",
    "allowed_pedagogical_modes": [
      "explication",
      "aide_guidee",
      "correction",
      "entrainement",
      "revision",
      "remediation"
    ],
    "response_policies": [
      "indice_avant_solution",
      "correction_sans_faire_a_la_place",
      "refus_devoir_clef_en_main",
      "rappeler_prerequis_si_bloque"
    ],
    "progression_binding": {
      "scope": "class_group",
      "progression_id": "maths_3eme_2026_2027_classe_3A"
    },
    "health": {
      "status": "warning",
      "coverage_referentiel": 0.74,
      "off_scope_rate": 0.04,
      "response_quality": 0.87,
      "policy_compliance": 0.91,
      "routing_quality": 0.88,
      "last_eval": "2026-05-24T03:12:00Z"
    }
  }
}
```

### C. Convergence des avis sources

Trois analyses indépendantes ont convergé sur les axes principaux de cette RFC :

| Axe | Avis interne (produit) | Avis externe | Méta-revue |
|-----|------------------------|--------------|------------|
| Niveau comme objet distinct | ✓ | ✓ | ✓ |
| Référentiel comme objet de première classe | ✓ | ✓ | ✓ |
| Compétence comme objet distinct du Référentiel | — | ✓ | ✓ |
| Mode pédagogique séparé du Style | ✓ | ✓ | ✓ |
| Politique de réponse comme catalogue nommé | — | ✓ | ✓ |
| Progression comme dimension | ✓ | ✓ | ✓ |
| Transparence du routage matière | ✓ | ✓ | ✓ |
| Santé du personae dans la matrice | ✓ | ✓ | ✓ |
| Renommage UI « Assistant spécialisé » | — | ✓ | ✓ |
| Évaluation par LLM judge + golden dataset | ✓ | ✓ | ✓ |
| Compatibilité via extension optionnelle | — | ✓ | ✓ |
| Filtrage RAG par mode pédagogique | — | ✓ | — |
| Branchement Progression Pédagogique existante | ✓ | — | ✓ |
| Connexion aux RFCs existantes (053/054/059) | ✓ | — | — |

Les axes ✓✓✓ constituent le socle indiscutable. Les axes ✓✓ consolident la robustesse. Les axes ✓ apportent l'ancrage dans l'écosystème Azy existant.

---

## 13. Prochaines étapes

1. **Validation de la priorisation** par l'équipe produit Azy.
2. **POC Maths 3ème** (cf. §7.4) — cible de validation du modèle sur 6 semaines.
3. **Migration progressive** : commencer par les nouveaux personae pédagogiques, conversion des existants à la demande.
4. **RFC dérivées à prévoir** :
   - RFC sur le **classifieur matière + intention** (modèle, dataset, seuils de confiance, traitement des corrections élèves).
   - RFC sur la **marketplace de Briques** entre profs / établissements.
   - RFC sur l'**évaluation pédagogique automatisée** (extension azy-mcp : critères, modèle juge, agrégation).

---

## 14. Formule cible

```
Azy ne crée pas seulement des chatbots.
Azy compose des assistants pédagogiques spécialisés,
situés dans un niveau, un référentiel, une progression,
et pilotés par des modes pédagogiques évaluables.
```

C'est cette extension qui transforme le modèle Personae générique en véritable plateforme pédagogique, et qui différencie Azy d'un GPT générique avec un prompt bien écrit.

---

## 15. Arbitrages produit — passe front (2026-05-27)

Tri produit des améliorations §1 confronté à l'existant front (catalogues, inscription, aides contextuelles, matrice). Sépare **validé** / **en attente de clarification**.

### 15.1 Points validés

| Point | Décision | Mise en œuvre actée |
|---|---|---|
| **Scaffolding anti-déviance** (#1) | ✅ Indispensable | Une **liste de règles textuelles** saisissables/activables garantit l'absence de déviance (ne pas faire le devoir, guider…). Peut démarrer **via prompt** avant des objets dédiés. |
| **Routage matière** (#2) | ✅ Retenu — **côté plugin / runtime**, PAS front-paramétrage | L'élève étant inscrit à X cours, le routage est **borné à son périmètre d'inscription**. Pas un sujet de configuration admin. |
| **Bornage hors-périmètre** (#3) | ✅ Retenu — **côté plugin / runtime** | Refus de répondre sur une notion hors programme/niveau, à la question de l'élève. Même nature que #2. Le front n'affiche que le refus. |
| **Santé du personae** (#4) | ✅ Retenu — **conditionné à une source de feedback** | Alimentée par les **retours explicites de l'élève** et/ou l'**analyse de sentiment (« humeur »)** dans ses messages. Sans feedback, pas d'indicateur fiable. |
| **Presets de configuration** (#5) | ✅ Retenu — **raccourci côté prof** | Un preset (« Soutien scolaire »…) pré-règle les règles de scaffolding en 1 clic. **Côté config prof uniquement** ; l'élève ne le voit pas. |
| **Aides contextuelles renforcées** (#6) | ✅ Retenu — trivial | Enrichir le catalogue d'aide existant (`personaeConceptHelp.ts`) : distinguer **Style** (comment on parle) / **Mode** (ce qu'on fait) / **Audience** (à qui). |
| **Renommage UI** (#7) | ✅ Retenu — **wording UI uniquement** | « Assistant spécialisé / Public cible / Activation… ». Noms techniques + API **inchangés**. |
| **Corpus typé** (#10) | ✅ **Requalifié INDISPENSABLE** | Au moment de l'**ingestion RAG** : **tag automatique** du type (cours / exercice / correction…) **+ validation par le prof**. C'est ensuite au prof de **choisir et classer ses documents** pour l'entraînement. |
| **Discipline + Niveau (split)** (#12) | ✅ Retenu — **sans double saisie ressentie** | Le prof tape « Histoire 3ème » ; un **assistant IA splitte** en Discipline = Histoire + Niveau = 3ème. Saisie unique côté UI. |
| **Progression** (#11) | ⏸️ **Reporté** (hors scope actuel) | Trop complexe / valeur non démontrée à ce stade. À ré-ouvrir plus tard. |

### 15.2 Référentiels + Compétences — stratégie de seed (acté 2026-05-27)

Décision structurante qui **transforme le frein de saisie en pré-remplissage** :

- **Seed officiel** : livrer le produit avec les **référentiels du CM1 à la 2nde, dans toutes les matières**, récupérés depuis **Eduscol** (programmes officiels publics).
- **Script d'intégration** : un script importe ces référentiels (à exécuter une fois, mutualisable cross-tenant — le BO est public).
- **Compétences = dérivées des référentiels** : pas un objet à saisir séparément par le prof ; elles sont **extraites des référentiels** seedés.
- **Côté prof** : il n'a **qu'à cocher sa matière** → une grande partie est déjà paramétrée (référentiel + compétences attendues). Il ne lui reste qu'à **choisir et classer ses propres documents** pour l'entraînement (cf. corpus typé #10).
- **À articuler avec l'existant** : une quick-action « analyse de référentiels » existe déjà pour les experts profs → vérifier ce qu'elle fait avant de figer l'objet Référentiel (éviter le doublon).

Effet : #8 (Référentiel) et #9 (Compétences) ne sont **plus un frein** — le coût de constitution est porté **une fois** par le seed Eduscol, pas par chaque prof.

### 15.3 Mode pédagogique (#13) — résolu

L'« acte pédagogique » (expliquer / guider / corriger / faire pratiquer) **n'est pas un objet de config exposé au prof en V1**. Il est **pré-réglé par défaut** (posture « guider sans donner la solution ») via les règles de scaffolding (#1) + presets (#5) ; l'assistant adapte l'acte au runtime selon la demande de l'élève. Le prof peut ajuster s'il le souhaite, mais **n'a rien à régler par défaut**. Un objet « Mode » explicite reste possible plus tard si un pilotage fin devient nécessaire.

→ **Plus aucun point en suspens** : toutes les améliorations §1 sont tranchées.

### 15.4 Principe directeur transverse — pré-remplir au maximum

> *Décision produit (2026-05-27) : « Il faut pré-remplir au maximum. Paramétrages par défaut livrés, le prof ajuste seulement s'il le veut. »*

C'est la **réponse directe au Risque #1** (modèle trop complexe → adoption faible). Chaque dimension applique ce principe :

| Dimension | Pré-rempli par défaut | Ajustement prof |
|---|---|---|
| Référentiel + Compétences | Seed Eduscol — le prof **coche sa matière** | Surcharges locales possibles |
| Discipline + Niveau | IA splitte « Histoire 3ème » | Correction manuelle si besoin |
| Scaffolding / Mode | Preset par défaut (« guider, ne pas donner la solution ») | Autre preset / ajustement des règles |
| Corpus typé | Tag automatique à l'ingestion | Validation / reclassement par le prof |
| Style / Audience | Valeurs par défaut proposées | Choix dans le catalogue |

**Objectif** : un prof obtient un assistant **fonctionnel en cochant sa matière**, et n'entre dans le détail que s'il le veut. Le front porte cette philosophie (defaults + presets + assistant IA de config), pas une UI de formulaires à 13 champs.

### 15.5 Qui pré-remplit quoi — cascade de défauts + ligne de coupe V1

#### Cascade de défauts (3 niveaux)

Le pré-remplissage se construit en cascade : chaque étage prépare le suivant.

| Niveau | Qui | Pré-remplit | Outil |
|---|---|---|---|
| **1. Plateforme** (Azy) | **Super admin** | Socle commun : référentiels Eduscol (CM1→2nde), presets pédagogiques, styles/audiences génériques, règles de scaffolding par défaut | **Écran super-admin** : import/màj référentiels (script Eduscol) + gestion des presets globaux |
| **2. Tenant** (établissement / formateur) | **Owner** | Hérite du socle + surcharge/ajoute : ses référentiels (cas non-scolaire), presets, styles maison | UI owner (catalogues), valeurs héritées pré-affichées |
| **3. Utilisateur** | **Prof** | Hérite tenant+plateforme. **Coche sa matière** → tout se remplit | UI actuelle (inscription, composition) |

#### Cas non-scolaire (formateur entreprise)

Pas de programme officiel → mais le socle plateforme fournit ce qui est **valable partout** (presets, styles, audiences, scaffolding) ≈ 70% pré-rempli. Le programme spécifique est **apporté par l'owner, aidé par l'IA** (« décris ta formation → l'IA structure un référentiel », = assistant IA de config). Même mécanique pour tous : **socle générique livré + spécifique apporté avec aide IA**.

#### Ligne de coupe V1 — critère d'arrêt

> Une amélioration entre en V1 **seulement si**, sans elle, un prof **ne peut pas** obtenir un assistant utilisable en cochant sa matière. On s'arrête quand **un prof obtient un assistant fonctionnel en 1 clic**.

| ✅ Dans la ligne V1 (indispensable) | ⏸️ Après la ligne (amélioration continue) |
|---|---|
| Seed référentiels + presets + defaults | Santé fine du personae |
| Split IA discipline/niveau | Compétences pilotables individuellement |
| Corpus tag auto au RAG + aval prof | Progression temporelle |
| Scaffolding par défaut (anti-déviance) | Évaluation LLM judge / golden dataset |
| Écran super-admin pour le seed | Marketplace de briques entre profs |

Un produit qui s'arrête à gauche est **déjà vendable et utilisable**. Tout ce qui est à droite améliore le pilotage et la finesse, mais n'est pas requis pour la V1.

#### Implication front (mesurée)

- **Nouveau** : un **écran super-admin** de gestion du socle (référentiels + presets globaux). Seule pièce vraiment nouvelle.
- **Existant à enrichir** : les catalogues affichent les valeurs **héritées** (repère « hérité / personnalisé » quand l'owner surcharge).
- **Rien d'autre côté prof** : il coche, il ajuste au besoin. Pas de formulaire à 13 champs.

> Note de périmètre front : #2 et #3 relèvent du **runtime/plugin** (résolution à l'exécution selon l'inscription de l'élève), pas du paramétrage admin que porte le front. Le front n'intervient que sur l'**affichage** (matière détectée, refus hors-périmètre).

---

## 16. Recalage avec l'existant Azy & décisions d'architecture back (2026-05-27)

> Synthèse des décisions techniques back, après audit du code. Détail + découpage PR : `docs/issues/2026-05-27-rfc-096-pedagogique-delta-back.md`.

### 16.1 Le socle est déjà livré (0 rework)

Les §2 (modèle actuel) et §5 (1 élève / N matières) **sont déjà la réalité du code** :

| Brique RFC-096 | Couvert par | Statut |
|---|---|---|
| Rôle / Discipline / Niveau / Style | RFC-081 `Expert` / `Specialty` (porte **déjà `level` + `segment`**) / `Style` | ✅ livré |
| Audience | RFC-095 `audience_personae` (B1) | ✅ livré |
| Inscription élève (périmètre) | RFC-095 `student_subject_enrollment` (`user_id = discord_user_id`) | ✅ livré |
| Lister/sélectionner les élèves | `GET /api/owner/students` | ✅ livré |
| Routing matière borné au périmètre (§5) | RFC-095 B3 `resolve-dm` | 🔶 spécifié |

→ Conséquence : le « split Discipline/Niveau » (#12 / §3.3.1) est surtout **UI** (`Specialty.level` existe déjà), pas un nouveau schéma.

### 16.2 Décisions d'architecture back

| # | Décision | Note |
|---|---|---|
| A1 | **Modèle relationnel, pas blob JSON.** Les nouveaux objets (Référentiel, Compétence…) = **tables** (catalogue public mutualisable + surcharges per-tenant). Le `pedagogical_extension` JSON (§7.1, annexe B) est une **vue de composition runtime**, pas le stockage. | cohérent multi-tenant search_path |
| A2 | **Réutiliser `Specialty`** comme porteur Discipline/Niveau (pas de refactor). | `level`/`segment` déjà présents |
| A3 | **Référentiel = hybride** (audit P0) : **réutiliser** le pipeline existant *référence → programme* (`ReferenceAnalysis` RFC-084 + `ExpertProgramQueryService` RFC-082 + `ClassroomProgramBuilder` RFC-083) ; **ajouter** un catalogue Référentiel+Compétence normalisé seedable (Eduscol). Référentiel (*ce qui doit être couvert*) ≠ Programme (*séquence d'enseignement*) — complémentaires. | ne pas dupliquer |
| A4 | **Compétence dérivée en V1** (extraite du référentiel seedé, non saisie). Objet pilotable individuellement = post-V1. | = **§15.2** |
| A5 | **Mode pédagogique non exposé en V1** (runtime auto, encadré par scaffolding par défaut). Objet de config = post-V1. | = **§15.3** |

### 16.3 Découpage (derrière RFC-095 B3)

P0 audit (✅ fait) → P1 catalogue Référentiel+Compétence + seed Eduscol → P2 écran super-admin → P3 split IA Discipline/Niveau → P4 scaffolding/presets → P5 corpus typé. Détail dans le doc compagnon.

---

*Fusion v1 interne + avis externe. RFC-096 attribué le 2026-05-27 (ex-`RFC-095-personae-pedagogique-v2`).*
