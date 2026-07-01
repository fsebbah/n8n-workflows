# 🧩 Skills & orchestration

> **Statut** : brouillon · back rempli, n8n/MCP à compléter (azy.daily#84) · 2026-07

## En une phrase
Étendre les capacités de l'IA avec des automatisations packagées (les « skills »), exécutées sur le poste ou dans le cloud — tout en gardant le contrôle des coûts et de la sécurité.

## Pour qui & bénéfices
- **Utilisateur** : déclencher des automatisations « intelligentes » (générer un document, analyser un fichier…) depuis une seule interface, quelle que soit leur origine.
- **Organisation** : chaque appel IA d'un skill est audité et facturé de façon centralisée ; la clé API ne quitte jamais le serveur.
- **Décideur** : activer et curer les skills disponibles par formule (package/tier), sans exposer l'infrastructure.

## Ce que ça permet
- **Un catalogue unifié de skills** — un skill est un pipeline multi-étapes (scripts, ressources, appels LLM, stockage) packagé et déclaratif.
- **3 natures de skills** cohabitant dans le même catalogue :
  - **skill local** installé sur le poste de l'utilisateur ;
  - **skill public Anthropic** (miroir du catalogue Anthropic) ;
  - **skill public plateforme** (créé et maintenu par la plateforme).
- **2 modes d'exécution** : sur le poste (via l'**agent local**) ou dans le **cloud (MCP)** — expérience homogène côté utilisateur.
- **Génération de livrables bureautiques** (Word, Excel, PowerPoint, PDF) avec stockage sécurisé et téléchargement contrôlé (permissions).
- **Exécutions longues robustes** : suivi en streaming avec reprise après déconnexion, ou mode synchrone.
- **Garde-fous intégrés** : limites de concurrence, cooldown par skill, quotas quotidiens par utilisateur et par organisation, erreurs typées.
- **Curation** : les skills publics Anthropic sont activés à la demande par un super-admin et filtrables par tier.

## Comment ça marche (par couche)
- **Back (chat.api)** : ✅ **catalogue de référence + tiers de confiance**. Détient le catalogue, applique les permissions et les quotas, **proxifie les exécutions cloud**, et surtout **exécute/audite/facture les étapes LLM** de façon centralisée. La clé API reste côté serveur (jamais exposée à l'agent local). Il **n'exécute jamais le skill lui-même**.
- **n8n** : 🔗 *À COMPLÉTER (équipe n8n — azy.daily#84)* — porte les webhooks d'appel LLM effectivement adressés aux fournisseurs ; c'est la couche qui parle au modèle. Chaîne type : chat.api → MCP → n8n → fournisseur IA.
- **MCP** : 🔗 *À COMPLÉTER (équipe MCP — azy.daily#84)* — **exécuteur des skills publics (cloud)** ; source de vérité du miroir Anthropic ; interpose la clé API. L'**agent local** (sur le poste) orchestre, lui, les skills locaux et repasse par le serveur pour les étapes LLM.

## Prérequis / activation
- Compte authentifié + organisation ; au moins un skill public disponible.
- Pour les skills **locaux** : agent local installé et appairé sur le poste (jeton distinct du jeton applicatif).
- Webhooks n8n déployés et MCP configuré pour l'exécution cloud.

## Limites connues & roadmap
- **Orchestrateurs** : le socle est **livré** — génération assistée, CRUD, catalogue, **exécution asynchrone** (`POST /api/orchestrators/{id}/execute` → 202) + historique d'exécutions + workflow d'approbation ; l'exécution réelle est **déléguée** (MCP / agent local). **Roadmap** = le **déclenchement autonome/programmé** et le **chaînage multi-étapes** de jobs (pas encore) ; cohérence des 2 stockages PG↔MCP `tools.db` en cours (chat.api#2580).
- Mode batch différé encore partiel (V1 = exécution synchrone) ; stockage Google Drive par utilisateur différé ; synchronisation automatique du catalogue depuis MCP à venir (V2).

## Références techniques
> *Pour les rédacteurs — ne pas mettre dans une plaquette commerciale.*
- Moteur de skills (natures, modes, proxy de runs, quotas) : `docs/rfc/RFC-085-SKILLS-ENGINE.md`.
- Vue d'ensemble & index front : `docs/guides/skills-architecture-overview.md`, `docs/guides/INDEX-SKILLS-FRONTEND.md` (+ contrats compagnons `skills-*-contract.md`).
- Streaming des exécutions longues : `docs/rfc/RFC-086-LLM-STREAMING-ARCHITECTURE.md`.
- Note : run d'un skill **local** non proxifié (`POST /api/skills/{name}/runs` renvoie `400 runs_handled_by_local_agent` → le front dialogue avec l'agent local).
