# n8n Workflows Explorer

Interface Streamlit pour explorer les 2061 workflows n8n organisés en 188 catégories.

## Fonctionnalités

- **Exploration des catégories** :
  - Recherche avec autocomplétion (tapez les premières lettres)
  - Bouton "Toutes les catégories" avec liste alphabétique
  - Filtrage en temps réel

- **Liste des workflows** :
  - Filtrage par nom ou description
  - Tri par nom ou nombre de nodes
  - Affichage du nombre de nodes

- **Détails complets** :
  - Description du workflow
  - Métadonnées (statut, date de création)
  - Tags associés
  - Types de nodes utilisés
  - Visualisation du JSON original
  - Téléchargement du fichier JSON

- **Analyse IA (GPT-4)** :
  - Explication détaillée du workflow
  - Cas d'usage identifiés
  - Diagramme Mermaid généré automatiquement
  - Lien vers Mermaid Live Editor

## Installation

```bash
cd app
pip install -r requirements.txt
```

## Configuration de l'API OpenAI (optionnel)

Pour activer l'analyse IA des workflows :

1. Copiez le fichier d'exemple :
   ```bash
   cp .env.local.example .env.local
   ```

2. Éditez `.env.local` et ajoutez votre clé API OpenAI :
   ```
   OPENAI_API_KEY=sk-votre-clé-api
   ```

3. Obtenez une clé API sur [platform.openai.com](https://platform.openai.com/api-keys)

Sans clé API, l'application fonctionne mais sans l'analyse IA (un diagramme simplifié est quand même généré).

## Lancement

```bash
# Depuis le dossier app/
streamlit run streamlit_app.py

# Ou depuis la racine du projet
streamlit run app/streamlit_app.py
```

L'application sera accessible sur http://localhost:8501

## Structure

```
app/
├── streamlit_app.py        # Application principale Streamlit
├── workflow_analyzer.py    # Module d'analyse IA avec OpenAI
├── requirements.txt        # Dépendances Python
├── .env.local.example      # Exemple de configuration
├── .env.local              # Configuration locale (non versionné)
└── README.md               # Ce fichier
```

## Utilisation

### 1. Sélectionner une catégorie

- Tapez les premières lettres dans le champ de recherche (ex: "goo" pour Google)
- Ou cliquez sur "Toutes les catégories" pour voir la liste complète
- Cliquez sur une catégorie pour la sélectionner

### 2. Explorer les workflows

- Parcourez la liste des workflows de la catégorie
- Utilisez la recherche pour filtrer par nom/description
- Triez par nom ou nombre de nodes

### 3. Voir les détails

- Cliquez sur un workflow pour voir ses détails
- Consultez la description, les tags, les types de nodes
- Téléchargez le fichier JSON original

### 4. Analyser avec l'IA

- Cliquez sur "Analyser avec GPT-4"
- Choisissez le modèle (gpt-4o-mini recommandé)
- Obtenez :
  - Une explication détaillée
  - Les cas d'usage
  - Un diagramme Mermaid du flux

## Coûts API OpenAI

| Modèle | Coût approximatif par analyse |
|--------|-------------------------------|
| gpt-4o-mini | ~$0.001-0.003 |
| gpt-4o | ~$0.01-0.03 |
| gpt-4-turbo | ~$0.02-0.05 |

## Prérequis

- Python 3.8+
- Le fichier `docs/n8n/workflows-catalog.json` doit exister
- Les fichiers JSON des workflows dans `workflows/`
- (Optionnel) Clé API OpenAI pour l'analyse IA

## Technologies utilisées

- **Streamlit** : Interface utilisateur
- **OpenAI GPT-4** : Analyse intelligente des workflows
- **Mermaid** : Génération de diagrammes
