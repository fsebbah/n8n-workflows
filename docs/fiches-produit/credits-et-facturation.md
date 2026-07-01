# 🧩 Crédits & facturation

> **Statut** : brouillon · back rempli, n8n/MCP à compléter (azy.daily#84) · 2026-07

## En une phrase
Gérer crédits, packs, boutique et facturation à l'usage — de la réservation d'un appel IA jusqu'à l'achat de crédits ou l'allocation gratuite par une organisation.

## Pour qui & bénéfices
- **Utilisateur** : un solde clair, une estimation du coût avant chaque action, un refus propre si le solde est insuffisant.
- **Organisation / owner** : deux façons de financer l'usage — l'utilisateur paie (Stripe) **ou** l'organisation offre un quota mensuel gratuit — idéal essais, B2B, écoles, événements.
- **Décideur** : monétisation fine (packs, boutique, codes promo) et pilotage de la consommation par rôle.

## Ce que ça permet
- **Deux mondes de facturation complémentaires**, à ne pas confondre :
  - **Facturation à l'usage de l'IA** : chaque appel IA est **réservé** puis **réconcilié** au décompte réel (tokens consommés) et audité — adossé au compte utilisateur.
  - **Crédits e-commerce / Discord** : crédits attachés à un membre d'un serveur, alimentés soit par **achat Stripe**, soit par **allocation gratuite** de l'organisation.
- **Quota mensuel par rôle Discord** : chaque rôle donne droit à un quota/mois (ex. everyone 100, Premium 1000, VIP 5000) ; le membre reçoit le meilleur quota de ses rôles.
- **Crédits alloués en lots** : cumul (rollover), expiration à 1 an, renouvellement mensuel automatique, bonus manuels ponctuels, « pot commun » redistribuable (crédits de membres partis).
- **Boutique complète** : découverte de produits → panier → paiement Stripe → commandes → codes de réduction (coupons Stripe) → profils/adresses/livraison, avec notification post-paiement.
- **Achat de crédits** via Stripe (paiement sécurisé, confirmation par webhook).

## Comment ça marche (par couche)
- **Back (chat.api)** : ✅ **toute la logique crédits et facturation**. Détecte le modèle de facturation actif (Stripe vs allocation), calcule le solde, débite en lots (FIFO), gère expiration et pot commun ; **réserve puis réconcilie** les crédits des appels IA ; audite ; expose les endpoints d'administration (quotas par rôle) ; détient les données e-commerce (produits, paniers, commandes). Émet vers Discord une commande sécurisée pour lire la liste des rôles (le token Discord ne quitte jamais le plugin).
- **n8n** : 🔗 *À COMPLÉTER (équipe n8n — azy.daily#84)* — façade webhook & orchestration : soldes/déductions/init crédits, réception des paiements Stripe (`checkout-completed`), crons de renouvellement/expiration, évènements Discord (quota bas/épuisé, départ de membre), workflows panier/produits (dont découverte de produits assistée).
- **MCP** : 🔗 *À COMPLÉTER (équipe MCP — azy.daily#84)* — non impliqué dans ce domaine (le décompte des appels IA reste chez le back). *À confirmer par l'équipe MCP.*

## Prérequis / activation
- Compte authentifié + organisation. Par défaut, mode **Stripe** (l'utilisateur paie).
- Pour offrir un quota gratuit : créer une **allocation de crédits** active sur le serveur → bascule automatique en mode allocation (exclusif du mode Stripe, jamais cumulés).
- Configuration des quotas par rôle via les endpoints d'administration (owner/admin).

## Limites connues & roadmap
- Pas de cumul Stripe + allocation ; migration entre les deux modes non gérée (V2).
- Pas de prorata pour un nouveau membre (quota complet le premier mois).
- Première lecture des rôles Discord lente (le temps que le plugin réponde) puis mise en cache — prévoir un bouton « réessayer ».
- Profils/adresses de livraison en phase ultérieure ; codes promo = coupons Stripe (pas de table maison).

## Références techniques
> *Pour les rédacteurs — ne pas mettre dans une plaquette commerciale.*
- Facturation IA (réservation + réconciliation par tokens) : `docs/rfc/RFC-086-LLM-STREAMING-ARCHITECTURE.md` §7 ; multiplicateur de coût par modèle : `docs/rfc/RFC-076-LLM-MODELS-CATALOG-REFACTOR.md`.
- Crédits e-commerce / allocation par serveur Discord : `docs/rfc/RFC-059-GUILD-CREDIT-ALLOCATION.md`, `docs/guides/frontend-guild-credit-quotas.md`.
- Boutique / panier / Stripe : `docs/rfc/RFC-001-CONSENSUS-SHOPPING-CART.md`, `docs/rfc/RFC-005-USER-DATA-MODEL.md`.
- Commande Discord sécurisée (lecture des rôles via Redis Stream) : `docs/rfc/RFC-062-BRANDING-SCOPE-CLARIFICATION.md`.
- ⚠️ Deux systèmes de stockage distincts : facturation IA (indexée compte/Firebase) vs crédits e-commerce (indexés serveur + membre Discord). Choisir selon le type d'identité.
