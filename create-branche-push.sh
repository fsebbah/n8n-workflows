#!/bin/bash

# Usage:
# ./git-helper.sh 0 nom-de-branche ["message de commit"] # Créer une branche, add, commit, push (message par défaut: "commit init")
# ./git-helper.sh 1 "message de commit"                  # Add, commit et push sur la branche courante (force push si nécessaire)
# ./git-helper.sh 2                                      # Récupère et met à jour la branche develop

set -e  # Stop on error

if [ "$1" == "0" ]; then
  BRANCH_NAME="$2"
  COMMIT_MSG="$3"

  if [ -z "$BRANCH_NAME" ]; then
    echo "❌ Nom de branche manquant. Utilisation : ./git-helper.sh 0 nom-de-branche [\"message de commit\"]"
    exit 1
  fi

  # Message par défaut si aucun message fourni
  if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="commit init"
    echo "ℹ️  Aucun message fourni, utilisation du message par défaut : '$COMMIT_MSG'"
  fi

  git checkout -b "$BRANCH_NAME"
  
  # Vérifier s'il y a des changements à commiter (modifiés, stagés ou untracked)
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    git add .
    git commit -m "$COMMIT_MSG"
    echo "✅ Changements commitées avec le message : '$COMMIT_MSG'"
  else
    echo "ℹ️  Aucun changement à commiter"
  fi
  
  git push -u origin "$BRANCH_NAME"
  echo "✅ Branche '$BRANCH_NAME' créée et poussée."

elif [ "$1" == "1" ]; then
  COMMIT_MSG="$2"

  if [ -z "$COMMIT_MSG" ]; then
    echo "❌ Message de commit manquant. Utilisation : ./git-helper.sh 1 \"message de commit\""
    exit 1
  fi

  CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
  
  # Vérifier s'il y a des changements non stagés, stagés ou des fichiers untracked
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    echo "📝 Changements détectés, ajout et commit..."
    git add .
    if git commit -m "$COMMIT_MSG"; then
      echo "✅ Commit réussi avec le message : '$COMMIT_MSG'"
    else
      echo "❌ Échec du commit"
      exit 1
    fi
  else
    echo "ℹ️  Aucun changement à commiter"
  fi
  
  # Toujours essayer de pusher (même si pas de nouveau commit)
  echo "📤 Push vers '$CURRENT_BRANCH'..."
  if git push origin "$CURRENT_BRANCH" 2>/dev/null; then
    echo "✅ Push réussi sur '$CURRENT_BRANCH'"
  else
    # Si le push échoue, essayer avec --set-upstream
    echo "ℹ️  Tentative de push avec --set-upstream..."
    if git push --set-upstream origin "$CURRENT_BRANCH"; then
      echo "✅ Push réussi avec --set-upstream sur '$CURRENT_BRANCH'"
    else
      echo "❌ Échec du push. Vérifiez que la branche distante existe et que vous avez les permissions."
      exit 1
    fi
  fi

elif [ "$1" == "2" ]; then
  git fetch
  git checkout develop
  git pull origin develop
  echo "✅ Branche 'develop' mise à jour."

else
  echo "❌ Usage invalide. Utilisation :"
  echo "  ./git-helper.sh 0 nom-de-branche [\"message de commit\"] # créer, commit et push (défaut: \"commit init\")"
  echo "  ./git-helper.sh 1 \"message de commit\"                  # add, commit et push la branche courante"
  echo "  ./git-helper.sh 2                                       # mettre à jour develop"
  exit 1
fi

