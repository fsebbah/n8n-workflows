# Demandes Front → Plugin chatbot

**Émetteur** : Équipe Frontend 2 (Claude)
**Date** : 2026-06-05
**Statut** : 📤 à transmettre
**Issue front meta** : [#2300 Planification équipes Frontend](https://github.com/fsebbah/azy.front/issues/2300)

---

## Périmètre plugin chatbot (rappel)

Le plugin chatbot fournit l'expérience conversationnelle sur Discord (et autres canaux à venir). Il consomme les Skills Claude exposés par le MCP server et les routes de chat.api.

---

## 1. Correction de copies — feedback élève via chat (RFC-099)

**Contexte** : quand le prof valide une correction (RFC-099 §4.4), le feedback est publié dans le channel personae de l'élève (cf. `REQUESTS-DISCORD-BOT.md`). Mais l'élève peut vouloir **demander une clarification** au bot.

**Demande** :
- Le bot doit pouvoir charger le contexte de la dernière correction de l'élève (résultats + feedback complet) via chat.api
- Répondre aux questions de clarification en utilisant le **persona enseignant** configuré (RFC-081) pour rester dans le ton
- Skill MCP utilisé : `compose_feedback` avec le persona du prof (réutilisé pour cohérence)

**Issue front liée** : [#2297](https://github.com/fsebbah/azy.front/issues/2297) + RFC-099 §8.3

---

## 2. Exercices de remédiation — lancement orchestrator dans le chat

**Contexte** : RFC-099 §4.5 propose un bouton « Exercices de remédiation » sur le feedback de l'élève qui lance un orchestrator générant des exos ciblés.

**Demande** :
- Bouton interactif Discord (cf. `REQUESTS-DISCORD-BOT.md` §2) qui déclenche un orchestrator v2 (RFC-101)
- L'orchestrator chaîne 2-3 skills : `analyze_weaknesses` → `generate_targeted_exercises` → `format_for_discord`
- Le plugin chatbot reçoit le résultat et le publie dans le channel élève

**Issues front liées** : [#2297](https://github.com/fsebbah/azy.front/issues/2297) + (RFC-099 §4.5)

---

## 3. Récap progression élève (RFC-100, anticipé)

**Contexte** : Phase 2 RFC-100. Récap hebdo/mensuel généré par n8n cron + publié via plugin chatbot.

**Demande** :
- Le plugin reçoit le récap formaté depuis n8n
- Publication dans le channel élève + résumé interactif (questions/réponses sur les axes faibles)
- Skill MCP utilisé : `compose_progress_summary` avec persona enseignant

**Issue front liée** : [#2294](https://github.com/fsebbah/azy.front/issues/2294)

---

## 4. Bug report user — confirmation post-création issue (anticipé)

**Contexte** : Quand le user a rempli un bug report (RFC #2295 + #2296) et que n8n a créé l'issue GitHub, le plugin chatbot pourrait notifier en complément du toast frontend.

**Demande optionnelle** :
- Bot reçoit notification de création issue via webhook
- Envoie un DM au user avec le lien de l'issue et un éventuel ETA

**Issues front liées** : [#2295](https://github.com/fsebbah/azy.front/issues/2295) + [#2296](https://github.com/fsebbah/azy.front/issues/2296)

**Priorité** : optionnel, à confirmer avec PO

---

## Format de réponse attendu

Pour chaque sujet, merci d'indiquer :
- ✅ Pris en charge — date estimée
- ⏳ Pris en compte — à planifier après livraison MCP + n8n
- ❓ Besoin de précisions
- ❌ Hors scope plugin chatbot
