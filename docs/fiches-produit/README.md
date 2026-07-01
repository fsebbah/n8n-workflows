# 🗂️ Fiches produit — chat.api

> **Statut** : brouillon · 2026-07
> **Public** : produit, avant-vente, PO, onboarding non-dev.
> **Objet** : présenter, produit par produit, **la valeur** de la plateforme Azy et **ce que chaque couche apporte**.

Ces fiches sont dérivées de la documentation fonctionnelle
[`docs/architecture/FONCTIONNEL-API-BACKEND.md`](../architecture/FONCTIONNEL-API-BACKEND.md).
Elles sont **orientées produit / commercial** : bénéfices, cas d'usage, ce que ça permet.
Le détail technique (RFC, endpoints, contrats) reste en bas de chaque fiche, section
« Références techniques », à l'usage des rédacteurs — pas de la fiche commerciale.

## 📇 Index des fiches

| Fiche | En une phrase |
|---|---|
| [Chat IA cloud](chat-ia-cloud.md) | Converser avec l'IA en temps réel, avec des formules de modèles par rôle et une facturation maîtrisée. |
| [RAG — base de connaissances](rag-base-de-connaissances.md) | Nourrir l'IA avec vos propres documents, dans une base de connaissances unifiée et traçable. |
| [Experts & Personae](experts-et-personae.md) | Composer des assistants d'IA spécialisés (expert + spécialité + style) et les diffuser. |
| [Skills & orchestration](skills-et-orchestration.md) | Étendre l'IA avec des automatisations packagées, exécutées sur le poste ou dans le cloud. |
| [Formation](formation.md) | Piloter formations, promotions et matières, de l'inscription à la correction de copies. |
| [Assistant productivité](assistant-productivite.md) | Réunir mails, agenda et contacts multi-fournisseurs en une seule vue. |
| [Bot Discord](bot-discord.md) | Transformer un serveur Discord en espace client/pédagogique piloté par l'IA. |
| [Crédits & facturation](credits-et-facturation.md) | Gérer crédits, packs, boutique et facturation à l'usage. |
| [Plateforme socle](plateforme-socle.md) | Le socle transverse : multi-organisation isolé, sync mobile hors-ligne, temps réel, sécurité. |

> **Annexe (état d'implémentation)** : [Calendrier & Contacts — multi-provider](calendrier-contacts-multi-provider-etat.md) — matrice par connecteur (Google/Interne ✅ read+write ; CalDAV/CardDAV/Outlook = scaffold, écritures non implémentées ; gate RFC-102). Complément « roadmap » de la fiche *Assistant productivité*.

## 🧭 Convention de complétion : « Comment ça marche (par couche) »

La plateforme Azy s'appuie sur **trois couches** qui se répartissent le travail.
Chaque fiche décrit, pour son produit, ce que fait chacune :

- **Back (`chat.api`)** — ✅ **rempli**.
  C'est le hub qui **orchestre, sécurise, facture, audite et persiste**. Il ne fait jamais
  tourner lui-même les modèles d'IA ni les skills : il délègue, puis centralise le contrôle.
- **n8n** — 🔗 **À COMPLÉTER** par l'équipe n8n (cf. **azy.daily#84**).
  Automatisations et traitements par lots (ex. OCR/extraction, embeddings + upsert, branding Discord).
- **MCP** — 🔗 **À COMPLÉTER** par l'équipe MCP (cf. **azy.daily#84**).
  Exécution réelle des appels IA, retrieval RAG, skills cloud, multimodal.

> ✅ = section renseignée par l'équipe back. 🔗 = section à renseigner par l'équipe concernée.
> Les indices posés dans les fiches (« ex. … ») ne sont **pas** des engagements : ils orientent
> la rédaction n8n/MCP, qui reste seule source de vérité pour sa couche.

## Convention de statut

Toutes les fiches sont en **brouillon** tant que les couches n8n et MCP ne sont pas complétées.
La date figurant en tête de fiche est la date de rédaction du volet back.
