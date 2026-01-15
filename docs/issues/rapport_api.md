● Résultat de l'audit pour 1455174904323379215
  ┌───────────────────────┬────────┬──────────────────────────────────────────────────┐
  │         Table         │ Status │                     Données                      │
  ├───────────────────────┼────────┼──────────────────────────────────────────────────┤
  │ user_credits          │ ✅     │ project=bot-appetit, 1500 crédits, status=active │
  ├───────────────────────┼────────┼──────────────────────────────────────────────────┤
  │ credit_transactions   │ ⚠️     │ user_id est NULL → pas de FK pour transactions   │
  ├───────────────────────┼────────┼──────────────────────────────────────────────────┤
  │ users                 │ ❌     │ Non créé                                         │
  ├───────────────────────┼────────┼──────────────────────────────────────────────────┤
  │ user_addresses        │ ❌     │ Non créé                                         │
  ├───────────────────────┼────────┼──────────────────────────────────────────────────┤
  │ carts                 │ ❌     │ Non créé                                         │
  ├───────────────────────┼────────┼──────────────────────────────────────────────────┤
  │ checkout_sessions     │ ❌     │ Non créé                                         │
  ├───────────────────────┼────────┼──────────────────────────────────────────────────┤
  │ orders                │ ❌     │ Non créé                                         │
  ├───────────────────────┼────────┼──────────────────────────────────────────────────┤
  │ user_private_channels │ ❌     │ Non créé                                         │
  ├───────────────────────┼────────┼──────────────────────────────────────────────────┤
  │ Redis                 │ ❌     │ Aucune clé                                       │
  └───────────────────────┴────────┴──────────────────────────────────────────────────┘
  ---
  Problème identifié

  user_credits.user_id est NULL → Les credit_transactions ne peuvent pas être liées.

  user_credits:
    discord_user_id: 1455174904323379215
    user_id: NULL  ← ⚠️ Devrait être un UUID

  Cause probable: Le webhook Stripe qui crée l'entrée user_credits ne génère pas de user_id UUID.

  Impact:
  - Pas de suivi des transactions de crédits
  - FK cassée entre user_credits et credit_transactions

  ---
  Tables normales à ce stade

  Les tables suivantes sont vides car l'utilisateur n'a pas encore fait d'actions:
  - users → Créé au premier appel API Profile
  - user_addresses → Créé quand l'utilisateur ajoute une adresse
  - carts → Créé au premier ajout au panier
  - orders → Créé après checkout Stripe

  Action requise: Corriger le webhook pour générer user_id dans user_credits.

  Concernant votre question user_id vs discord_user_id:

  Le user_id (UUID) dans user_credits sert de clé étrangère pour credit_transactions.subscriber_id.

  user_credits                     credit_transactions
  ┌─────────────────────┐         ┌─────────────────────┐
  │ discord_user_id (PK)│         │ subscriber_id (FK)  │──┐
  │ user_id (UUID)      │◄────────│                     │  │
  └─────────────────────┘         └─────────────────────┘  │
                                                            │
                                           Permet de lier   │
                                           les transactions◄┘

  Pourquoi pas juste discord_user_id partout ?
  - La table credit_transactions a été conçue avec un UUID subscriber_id
  - Cela permet de découpler l'identité Discord de l'identité interne

  Le bug actuel: Le webhook Stripe ne génère pas le user_id UUID → les transactions ne peuvent pas être liées.

  Fix nécessaire: Dans le webhook qui crée user_credits, ajouter:
  user_id = uuid.uuid4()  # Générer un UUID


● Endpoints appelés par le Webhook Stripe

  Le fichier api/routers/webhook_account.py expose ces endpoints:

  Endpoint principal : POST /api/webhook/account/set

  C'est l'endpoint appelé par n8n lors d'un événement Stripe (checkout, renewal, cancellation).

  POST /api/webhook/account/set
  Headers: X-Project-ID: bot-appetit

  Payload:
  {
    "discord_user_id": "1455174904323379215",
    "discord_username": "azy0147",
    "customer_email": "fsebbah@azy.solutions",
    "credits_remaining": 1500,
    "credits_total": 1500,
    "subscription_status": "active",
    "plan_id": "price_1SnRv7ASFmxXUAAwbT8A4Uzt",
    "current_period_end": "2026-02-15T13:32:29Z",
    "metadata": {
      "stripe_session_id": "cs_xxx",
      "stripe_customer_id": "cus_xxx"
    },
    "reason": "checkout_completed"
  }

  ---
  Autres endpoints disponibles
  ┌─────────────────────────────┬─────────┬─────────────────────────────┐
  │          Endpoint           │ Méthode │         Description         │
  ├─────────────────────────────┼─────────┼─────────────────────────────┤
  │ /api/webhook/account        │ GET     │ Récupérer crédits d'un user │
  ├─────────────────────────────┼─────────┼─────────────────────────────┤
  │ /api/webhook/account/set    │ POST    │ Créer/MAJ crédits (upsert)  │
  ├─────────────────────────────┼─────────┼─────────────────────────────┤
  │ /api/webhook/account/credit │ POST    │ Ajouter des crédits         │
  ├─────────────────────────────┼─────────┼─────────────────────────────┤
  │ /api/webhook/account/debit  │ POST    │ Retirer des crédits         │
  ├─────────────────────────────┼─────────┼─────────────────────────────┤
  │ /api/webhook/account/logs   │ GET     │ Historique des opérations   │
  └─────────────────────────────┴─────────┴─────────────────────────────┘
  ---
  Problème identifié

  Dans /set, la query SQL ne génère pas de user_id UUID :

  # Ligne 883-888
  query = f"""
      INSERT INTO user_credits ({", ".join(insert_columns)})
      VALUES ({", ".join(insert_values)})
      ON CONFLICT (project_id, discord_user_id)
      DO UPDATE SET {", ".join(update_fields)}
      RETURNING ...
  """

  Le user_id UUID n'est jamais inséré → credit_transactions ne peut pas être liée.


