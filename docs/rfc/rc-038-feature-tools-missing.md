# Features — Outils manquants ou partiels
> RFC-037 · AZY Solutions · Mars 2026

---

## Outils manquants (à créer)

---

### 🎯 `game-analyzer` — Analyse de parties d'échecs

**Domaine :** Échecs  
**Priorité :** Haute

**Description**  
Analyse une partie d'échecs complète ou une position donnée (notation PGN ou FEN) et retourne une évaluation coup par coup : erreurs critiques, coups manqués, moments de bascule. S'appuie sur Stockfish comme moteur d'évaluation sous-jacent.

**Inputs attendus**
- `game` : notation PGN ou historique de partie (string)
- `position` : notation FEN d'une position isolée (string, optionnel)
- `depth` : profondeur d'analyse Stockfish (int, défaut : 15)

**Outputs**
- Liste des coups avec évaluation centipawn, classification (brillant / bon / imprécision / erreur / gaffe)
- Moments clés annotés
- Score global par joueur

**Dépendances**  
Stockfish (déjà intégré dans Bot Échecs), python-chess

---

### 🧩 `puzzle-generator` — Génération de puzzles tactiques

**Domaine :** Échecs  
**Priorité :** Haute

**Description**  
Génère des puzzles tactiques (mat en N coups, gain de matériel, défense) calibrés sur un niveau Élo cible. Peut s'appuyer sur une base de puzzles existante (Lichess open dataset) ou sur `game-analyzer` pour extraire des positions intéressantes depuis des parties réelles.

**Inputs attendus**
- `level` : niveau cible (`beginner` / `intermediate` / `advanced` / `expert`)
- `theme` : thème tactique (`fork`, `pin`, `skewer`, `mate_in_2`, etc., optionnel)
- `count` : nombre de puzzles (int, défaut : 5)

**Outputs**
- Liste de puzzles : position FEN, solution, thème, difficulté estimée Élo

**Dépendances**  
Lichess puzzle dataset (CSV ~3M puzzles), python-chess

---

### 📖 `opening-explorer` — Exploration des ouvertures

**Domaine :** Échecs  
**Priorité :** Haute

**Description**  
Explique une ouverture d'échecs nommée (théorie, variantes principales, pièges fréquents, plans typiques) et retourne les coups de référence en notation algébrique. Permet aussi de rechercher des parties de référence jouées dans cette ouverture par des joueurs nommés.

**Inputs attendus**
- `opening_name` : nom de l'ouverture (string, ex : "Défense Sicilienne", "Ruy Lopez")
- `color` : couleur jouée (`white` / `black`, optionnel)
- `player` : nom d'un joueur pour filtrer les parties de référence (string, optionnel)

**Outputs**
- Description théorique de l'ouverture
- Séquence de coups principale (ECO code + PGN)
- Variantes clés et leurs noms
- Parties de référence si `player` fourni

**Dépendances**  
Base ECO (Encyclopedia of Chess Openings), API Lichess ou Chess.com (optionnel)

---

### 📊 `elo-calculator` — Calcul et estimation Élo

**Domaine :** Échecs  
**Priorité :** Moyenne

**Description**  
Calcule ou estime le classement Élo d'un utilisateur à partir de ses résultats récents, ou simule l'évolution Élo après une série de parties. Retourne aussi un historique de progression sur une période donnée.

**Inputs attendus**
- `user_id` : identifiant utilisateur (pour lookup historique)
- `results` : liste de résultats récents `[{opponent_elo, result}]` (optionnel, pour simulation)
- `period` : période d'analyse (`7d` / `30d` / `90d`, optionnel)

**Outputs**
- Élo actuel calculé
- Delta sur la période
- Courbe de progression (série temporelle)
- Élo estimé si simulation fournie

**Dépendances**  
`progress-tracker` (lookup historique), formule Élo standard FIDE

---

### 🏆 `tournament-search` — Recherche de tournois

**Domaine :** Échecs  
**Priorité :** Basse

**Description**  
Recherche des tournois d'échecs (historiques ou en cours) par nom, joueur, période ou lieu. Retourne les rondes, résultats et parties jouées dans le tournoi.

**Inputs attendus**
- `tournament_name` : nom du tournoi (string, ex : "Wijk aan Zee")
- `player` : filtrer par joueur (string, optionnel)
- `year` : année du tournoi (int, optionnel)
- `round` : numéro de ronde (int, optionnel)

**Outputs**
- Informations tournoi (lieu, date, participants)
- Tableau de résultats par ronde
- Liste des parties jouées (PGN si disponible)

**Dépendances**  
API Lichess ou Chess.com, TWIC (This Week In Chess)

---

### 👨‍🍳 `technique-explainer` — Explication de techniques

**Domaine :** Cuisine (extensible aux échecs)  
**Priorité :** Haute

**Description**  
Explique une technique culinaire (roux, brunoise, tempérage, émulsion…) ou une technique d'échecs (fourchette, clouage, enfilade, mat du couloir…) avec une description étape par étape, les erreurs fréquentes à éviter et les conditions de réussite. Retourne optionnellement des ressources vidéo associées.

**Inputs attendus**
- `technique` : nom de la technique (string)
- `domain` : `cuisine` / `echecs` (string, inféré automatiquement si absent)
- `level` : niveau de détail (`beginner` / `advanced`, optionnel)

**Outputs**
- Description structurée étape par étape
- Erreurs fréquentes
- Variantes ou applications avancées
- Liens YouTube associés (via `youtube-searcher`, optionnel)

**Dépendances**  
LLM (génération), `youtube-searcher` (optionnel)

---

### 🍷 `flavor-pairing` — Associations de saveurs

**Domaine :** Cuisine  
**Priorité :** Basse

**Description**  
Retourne les associations de saveurs, ingrédients ou vins recommandés pour un plat, un ingrédient ou une cuisine donnée. Basé sur une base de données d'accords gastronomiques et de profils aromatiques.

**Inputs attendus**
- `ingredient` : ingrédient ou plat principal (string, ex : "agneau", "magret de canard")
- `pairing_type` : type d'accord recherché (`spices` / `wine` / `side_dish` / `all`, défaut : `all`)
- `cuisine_style` : style culinaire pour filtrer (string, optionnel)

**Outputs**
- Liste d'associations recommandées avec score de compatibilité
- Rationale pour chaque accord
- Accords à éviter

**Dépendances**  
FlavorDB ou base propriétaire, LLM pour le rationale

---

---

## Outils partiels (à compléter)

---

### ⚠️ `lesson-generator` — Générateur de leçons

**Workflow existant :** `LEARNING-Generate-*` (Dispatcher + Worker)  
**Statut :** Partiel — architecture dispatcher/worker présente mais scope limité

**Ce qui manque**  
Le dispatcher actuel est conçu pour un type de contenu spécifique. Il n'expose pas d'interface générique capable de recevoir un `subject` + `level` + `domain` arbitraires (cuisine, échecs, autre) et de produire une leçon structurée adaptée.

**Feature à ajouter**  
- Paramètre `domain` : `cuisine` / `echecs` / `generic`
- Paramètre `format` : `theoretical` / `practical` / `mixed`
- Support du paramètre `duration` (durée estimée de la leçon en minutes)
- Output structuré : titre, objectifs, contenu, exercices, ressources

**Effort estimé :** Moyen — refactoring du dispatcher pour accepter des inputs génériques

---

### ⚠️ `progress-tracker` — Suivi de progression

**Workflow existant :** `LEARNING-Weekly-Stats`, `LEARNING-Badge-Check`  
**Statut :** Partiel — stats hebdo et badges présents, lookup individuel manquant

**Ce qui manque**  
Pas d'endpoint de lookup unitaire par `user_id` + `period` utilisable par les autres outils du pipeline. `game-analyzer`, `elo-calculator` et `lesson-generator` ont tous besoin de récupérer la progression d'un utilisateur en temps réel, pas seulement en batch hebdomadaire.

**Feature à ajouter**  
- Endpoint `GET /progress/{user_id}?period=30d` synchrone
- Historique de parties jouées (pour `game-analyzer`)
- Historique Élo (pour `elo-calculator`)
- Dernière session active (pour résolution contexte elliptique)

**Effort estimé :** Faible à moyen — les données existent, il manque l'interface de lecture unitaire

---

### ⚠️ `pdf-generator` — Génération de PDF générique

**Workflow existant :** `Torah-PDF-Generation`  
**Statut :** Partiel — pipeline PDF fonctionnel mais hardcodé pour le domaine Torah

**Ce qui manque**  
Le workflow actuel est couplé à un template et une structure de données spécifiques. Il ne peut pas recevoir du contenu arbitraire (leçon, rapport, récapitulatif de partie) et le mettre en forme dans un PDF générique.

**Feature à ajouter**  
- Input générique : `title` + `sections[]` (titre + contenu markdown par section)
- Support des tableaux et listes
- Template neutre AZY Solutions (header/footer branding)
- Optionnel : export vers Drive (`mcp-drive`) en sortie directe

**Effort estimé :** Faible — la plomberie PDF existe, seul le template et le parsing d'input sont à généraliser

---

*Document généré le 11 mars 2026 — AZY Solutions / RFC-038*
