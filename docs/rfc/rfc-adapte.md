● Les trois RFC ont été complétées. Voici le récapitulatif final :

  ---
  Récapitulatif des modifications et planning de déploiement

  1. Modifications apportées aux RFC

  RFC-023 : Formation Management System

  Section 16 ajoutée :
  - ✅ Architecture de résilience (4 niveaux de fallback)
  - ✅ ResilientEventPublisher avec fallback PostgreSQL
  - ✅ Table pending_events pour mode dégradé
  - ✅ Cron process-pending-events
  - ✅ Commandes admin /formation-admin sync/check/repair
  - ✅ Métriques Prometheus recommandées
  - ✅ Checklist finale complète

  RFC-024 : Discord Branding Strategy

  Section 14 ajoutée :
  - ✅ BrandingService complet avec cache TTL + invalidation cross-instance
  - ✅ OnboardingService complet (toutes les méthodes manquantes)
  - ✅ Protocols pour testing
  - ✅ EmbedTemplates refactoré avec BrandingConfig
  - ✅ Documentation mode dégradé Nitro Boost
  - ✅ Checklist finale complète

  RFC-025 : Course Subscription Strategy

  Section 16 ajoutée :
  - ✅ Politique "Smart Upgrade" (overlap bundle/cours résolu)
  - ✅ Une subscription par user (décision actée)
  - ✅ Configuration portail Stripe (gestion via Discord)
  - ✅ Conformité RGPD (suppression des données)
  - ✅ Fallback Redis Streams (alignement RFC-023)
  - ✅ Scénarios de tests E2E
  - ✅ Métriques Prometheus
  - ✅ Checklist finale complète

  ---
  2. Planning de déploiement consolidé

  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                         PLANNING DE DÉPLOIEMENT                                  │
  ├─────────────────────────────────────────────────────────────────────────────────┤
  │                                                                                  │
  │  PHASE 1 : INFRASTRUCTURE (S1-S2)                                               │
  │  ══════════════════════════════════                                              │
  │  • API : Tables Formation/Promotion/Matiere + pending_events                    │
  │  • chatbot-core : ResilientEventPublisher + RedisStreamSubscriber               │
  │  • n8n : Cron process-pending-events                                            │
  │                                                                                  │
  │  PHASE 2 : RFC-023 FORMATIONS (S2-S4)                                           │
  │  ════════════════════════════════════                                            │
  │  • chatbot-core v0.7.3 : FormationSetupService + FormationEventSubscriber       │
  │  • n8n : Workflows formation-create-promotion, formation-archive                │
  │  • plugin-recipes : FormationApiClient + commandes /formation                   │
  │                                                                                  │
  │  PHASE 3 : RFC-024 BRANDING (S4-S6)                                             │
  │  ══════════════════════════════════                                              │
  │  • chatbot-core v0.7.4 : BrandingService + OnboardingService                    │
  │  • plugin-recipes : Templates serveur + commandes /branding, /onboarding        │
  │                                                                                  │
  │  PHASE 4 : RFC-025 SUBSCRIPTIONS (S6-S10)                                       │
  │  ════════════════════════════════════════                                        │
  │  • Stripe : Produits base/cours/bundles en test mode                            │
  │  • API : Tables courses/bundles + stripe_processed_events                       │
  │  • n8n : Webhooks Stripe avec idempotence                                       │
  │  • chatbot-core v0.7.5 : CourseAccessService + UnifiedEventHandler              │
  │  • plugin-recipes : Commandes /cours                                            │
  │                                                                                  │
  │  PHASE 5 : TESTS ET STABILISATION (S10-S12)                                     │
  │  ═══════════════════════════════════════════                                     │
  │  • Tests E2E flux complet                                                       │
  │  • Beta avec early adopters                                                     │
  │  • Monitoring et alerting                                                       │
  │                                                                                  │
  └─────────────────────────────────────────────────────────────────────────────────┘

  ---
  3. Acquis vs En suspens (mise à jour finale)

  Par équipe
  Équipe: chatbot-core
  Acquis ✅: EventBus, RoleManager, ChannelManager, Redis services
  En suspens (priorisé): P0: ResilientEventPublisher, RedisStreamSubscriber, FormationSetupService, Idempotence handlers, Saga
  pattern
  ────────────────────────────────────────
  Équipe:
  Acquis ✅:
  En suspens (priorisé): P1: BrandingService, OnboardingService, CourseAccessService, Rate limiter Discord
  ────────────────────────────────────────
  Équipe: API
  Acquis ✅: Architecture existante, Intégration Stripe
  En suspens (priorisé): P0: Tables Formation/Promotion/Matiere, pending_events, stripe_processed_events
  ────────────────────────────────────────
  Équipe:
  Acquis ✅:
  En suspens (priorisé): P1: Tables courses/bundles, Endpoints CRUD, Cache vérification accès
  ────────────────────────────────────────
  Équipe: n8n
  Acquis ✅: Workflows existants
  En suspens (priorisé): P0: process-pending-events, Webhooks Stripe avec idempotence
  ────────────────────────────────────────
  Équipe:
  Acquis ✅:
  En suspens (priorisé): P1: Workflows formations, Job réconciliation, Cron expiration
  ────────────────────────────────────────
  Équipe: plugin-recipes
  Acquis ✅: LearningApiClient, Commands existantes
  En suspens (priorisé): P1: FormationApiClient, Commandes formations, Templates serveur
  ────────────────────────────────────────
  Équipe:
  Acquis ✅:
  En suspens (priorisé): P2: Commandes branding/onboarding/cours
  ---
  4. Décisions clés actées (toutes RFC)
  ┌────────────────┬─────────────────────────────────────────────────────────────┬──────────────────────────────────────┐
  │    Domaine     │                          Décision                           │                Impact                │
  ├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ Infrastructure │ Redis Streams (pas Pub/Sub)                                 │ Persistence, consumer groups, replay │
  ├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ Fallback       │ 4 niveaux (Redis → Memory → PostgreSQL → Manuel)            │ Résilience garantie                  │
  ├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ Formations     │ Channel formation:events:stream séparé                      │ Isolation des domaines               │
  ├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ Branding       │ Pas de nouveau stream, réutilisation learning:events:stream │ Simplicité                           │
  ├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ Subscriptions  │ Une subscription par user avec multi-items                  │ Facturation claire                   │
  ├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ Subscriptions  │ Cours acquis définitivement                                 │ UX positive, évite frustration       │
  ├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ Subscriptions  │ Grace period 7 jours avec accès maintenu                    │ Standard industrie                   │
  ├────────────────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────────┤
  │ Subscriptions  │ Gestion cours via Discord (pas portail Stripe)              │ Contrôle total                       │
  └────────────────┴─────────────────────────────────────────────────────────────┴──────────────────────────────────────┘
  ---
  5. Risques identifiés et mitigations
  ┌─────────────────────────────────┬─────────────┬───────────┬───────────────────────────────────┐
  │             Risque              │ Probabilité │  Impact   │            Mitigation             │
  ├─────────────────────────────────┼─────────────┼───────────┼───────────────────────────────────┤
  │ Redis down prolongé             │ Faible      │ Critique  │ Fallback 4 niveaux + alerting     │
  ├─────────────────────────────────┼─────────────┼───────────┼───────────────────────────────────┤
  │ Rate limit Discord              │ Moyenne     │ Important │ Queue rate-limited obligatoire    │
  ├─────────────────────────────────┼─────────────┼───────────┼───────────────────────────────────┤
  │ Désynchronisation triple source │ Moyenne     │ Important │ Job réconciliation quotidien      │
  ├─────────────────────────────────┼─────────────┼───────────┼───────────────────────────────────┤
  │ Migration Stripe complexe       │ Moyenne     │ Business  │ Dual-mode 2 mois + early adopters │
  ├─────────────────────────────────┼─────────────┼───────────┼───────────────────────────────────┤
  │ Webhook Stripe dupliqué         │ Élevée      │ Moyen     │ Idempotence + lock Redis          │
  └─────────────────────────────────┴─────────────┴───────────┴───────────────────────────────────┘
  ---
  Les trois RFC sont maintenant APPROVED et prêtes pour implémentation. La prochaine étape est de créer les issues correspondantes
  dans le backlog de chaque équipe.
