#!/bin/bash

# ✅ Fonction d'aide
usage() {
  echo "Usage: $0 [-f fichier] [-d dossier] [-l label1,label2,...]"
  echo "  -f    Fichier markdown unique à traiter"
  echo "  -d    Dossier contenant plusieurs fichiers .md"
  echo "  -l    Labels à ajouter (séparés par des virgules, optionnel)"
  echo "        Exemple: -l 'enhancement,PI5S5,Refactorisation'"
  exit 1
}

# 🔍 Analyse des options
LABELS=""
while getopts ":f:d:l:" opt; do
  case $opt in
    f) FILE="$OPTARG" ;;
    d) DIR="$OPTARG" ;;
    l) LABELS="$OPTARG" ;;
    *) usage ;;
  esac
done

# 📁 Traitement d'un fichier unique
if [ -n "$FILE" ]; then
  if [ ! -f "$FILE" ]; then
    echo "❌ Fichier introuvable: $FILE"
    exit 1
  fi
  filename=$(basename -- "$FILE")
  title="${filename%.*}"
  echo "📌 Création de l'issue: \"$title\" depuis \"$FILE\""
  
  # Construire la commande avec ou sans labels
  if [ -n "$LABELS" ]; then
    echo "🏷️ Ajout des labels: $LABELS"
    gh issue create --title "$title" --body-file "$FILE" --label "$LABELS"
  else
    gh issue create --title "$title" --body-file "$FILE"
  fi
  
  echo "🗑️ Suppression du fichier: $FILE"
  rm "$FILE"
  exit 0
fi

# 📂 Traitement d'un dossier
if [ -n "$DIR" ]; then
  if [ ! -d "$DIR" ]; then
    echo "❌ Dossier introuvable: $DIR"
    exit 1
  fi

  for filepath in "$DIR"/*.md; do
    [ -e "$filepath" ] || continue
    filename=$(basename -- "$filepath")
    title="${filename%.*}"
    echo "📌 Création de l'issue: \"$title\" depuis \"$filepath\""
    
    # Construire la commande avec ou sans labels
    if [ -n "$LABELS" ]; then
      echo "🏷️ Ajout des labels: $LABELS"
      gh issue create --title "$title" --body-file "$filepath" --label "$LABELS"
    else
      gh issue create --title "$title" --body-file "$filepath"
    fi
    
    echo "🗑️ Suppression du fichier: $filepath"
    rm "$filepath"
  done
  exit 0
fi

# ⚠️ Si aucun argument n'est fourni, utiliser le dossier par défaut
DEFAULT_DIR="./docs/issues_backend"
echo "ℹ️ Aucun argument fourni. Utilisation du dossier par défaut: $DEFAULT_DIR"

for filepath in "$DEFAULT_DIR"/*.md; do
  [ -e "$filepath" ] || continue
  filename=$(basename -- "$filepath")
  title="${filename%.*}"
  echo "📌 Création de l'issue: \"$title\" depuis \"$filepath\""
  
  # Construire la commande avec ou sans labels
  if [ -n "$LABELS" ]; then
    echo "🏷️ Ajout des labels: $LABELS"
    gh issue create --title "$title" --body-file "$filepath" --label "$LABELS"
  else
    gh issue create --title "$title" --body-file "$filepath"
  fi
  
  echo "🗑️ Suppression du fichier: $filepath"
  rm "$filepath"
done

