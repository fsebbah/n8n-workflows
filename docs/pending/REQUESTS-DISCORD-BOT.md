# Demandes Front → Bot Discord

**Émetteur** : Équipe Frontend 2 (Claude)
**Date** : 2026-06-05
**Statut** : 📤 à transmettre
**Issue front meta** : [#2300 Planification équipes Frontend](https://github.com/fsebbah/azy.front/issues/2300)

---

## Périmètre bot Discord (rappel)

Le bot Discord publie dans les channels Azy (channels personae) et gère les interactions élève (boutons, threads). Distinct du plugin chatbot qui gère la conversation Q/R.

---

## 1. Publication de corrections de copies (RFC-099 §8)

**Contexte** : après validation prof d'une copie, le bot publie le feedback dans le channel personae de l'élève.

**Demande — message structuré** :
```
📝 **Ta copie de DS n°3 - Géométrie est corrigée**
Note : 14/20

✅ Points forts :
   • [extrait synthétisé du feedback]

⚠️ À retravailler :
   • [extrait synthétisé]

[📄 Voir copie annotée]   [🎯 Exercices de remédiation]   [💬 Demander une clarification]
```

**Boutons interactifs Discord** :
- **Voir copie annotée** → DM le PDF annoté (signed URL Backblaze, expirée 7j)
- **Exercices de remédiation** → déclenche un orchestrator v2 via plugin chatbot (cf. `REQUESTS-PLUGIN-CHATBOT.md` §2)
- **Demander une clarification** → ouvre un thread Discord avec le plugin chatbot (cf. `REQUESTS-PLUGIN-CHATBOT.md` §1)

**Endpoint à appeler** : `POST /api/grading/submissions/{id}/publish` (côté chat.api) qui déclenche le bot via webhook

**Privacy** :
- Aucune copie élève en channel public
- DM systématique pour le PDF annoté
- Préférences user : opt-out notifications correction possible

**Issue front liée** : [#2297](https://github.com/fsebbah/azy.front/issues/2297)

**Effort estimé** : ~5j (RFC-099 §13.5)

---

## 2. Suivi élève — récap périodique (RFC-100, anticipé)

**Contexte** : Phase 2 RFC-100. Récap hebdo généré par n8n cron.

**Demande — message structuré** :
```
📊 **Ta progression cette semaine**

🎯 Compétences travaillées : 8 (+2 cette semaine)
📈 Évolution : +0.5 points / 20 sur la moyenne
⚠️ Axes à renforcer : [liste 2-3 max]

[📋 Voir le détail]   [🎯 Exercices ciblés]
```

**Issue front liée** : [#2294](https://github.com/fsebbah/azy.front/issues/2294)

---

## 3. Notifications bug report (optionnel)

Cf. `REQUESTS-PLUGIN-CHATBOT.md` §4 — DM de confirmation à l'utilisateur quand son bug report a généré une issue GitHub.

---

## 4. Channels personae — création / archive (RFC-094 + RFC-099)

**Contexte** : la RFC-099 suppose l'existence d'un channel personae par couple (élève, personae enseignant). Il faut s'assurer de la cohérence du naming et de la gestion lifecycle.

**Demande** :
- Helper côté bot pour résoudre le channel personae cible à partir de `(student_id, persona_id)`
- Si le channel n'existe pas → le créer automatiquement (avec convention RFC-094)
- Gestion archive en fin d'année scolaire

**Issue front liée** : (RFC-094 existante, à recroiser)

---

## Format de réponse attendu

Pour chaque sujet, merci d'indiquer :
- ✅ Pris en charge — date estimée
- ⏳ Pris en compte — à planifier après livraison back chat.api
- ❓ Besoin de précisions
- ❌ Hors scope bot Discord
