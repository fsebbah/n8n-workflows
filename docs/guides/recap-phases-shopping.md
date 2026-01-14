● RFC-001 - Phases de developpement

  Phase 1: Panier (v0.7.0 - v0.7.2)
  ┌───────────┬───────────────────────────────────────────────────────────────┬──────────────────┐
  │  Equipe   │                            Taches                             │      Statut      │
  ├───────────┼───────────────────────────────────────────────────────────────┼──────────────────┤
  │ API       │ A1: Migrations DB, A2-A3: /products/*, A4-A6: /cart/*         │ A faire          │
  ├───────────┼───────────────────────────────────────────────────────────────┼──────────────────┤
  │ n8n       │ N1: Product Discovery, N2-N7: cart-* workflows                │ N1 fait (PR#231) │
  ├───────────┼───────────────────────────────────────────────────────────────┼──────────────────┤
  │ Framework │ F1: models.py, F2-F3: ShoppingCartService, F4-F5: Mocks+Tests │ A faire          │
  ├───────────┼───────────────────────────────────────────────────────────────┼──────────────────┤
  │ Plugin    │ P1-P4: UI Discord (bloque par F3)                             │ En attente       │
  └───────────┴───────────────────────────────────────────────────────────────┴──────────────────┘
  Livrable: Ajouter produits au panier + voir panier

  ---
  Phase 2: Checkout (v0.7.3 - v0.7.5)
  ┌───────────┬─────────────────────────────────────────┐
  │  Equipe   │                 Taches                  │
  ├───────────┼─────────────────────────────────────────┤
  │ API       │ Tables orders, order_items              │
  ├───────────┼─────────────────────────────────────────┤
  │ n8n       │ cart-checkout, orders-*, Stripe webhook │
  ├───────────┼─────────────────────────────────────────┤
  │ Framework │ CheckoutService, OrderService, Coupons  │
  └───────────┴─────────────────────────────────────────┘
  Livrable: Payer via Stripe + historique commandes

  ---
  Phase 3: Profil + Livraison (v0.7.6 - v0.7.8)
  ┌───────────┬─────────────────────────────────────┐
  │  Equipe   │               Taches                │
  ├───────────┼─────────────────────────────────────┤
  │ API       │ Table user_addresses                │
  ├───────────┼─────────────────────────────────────┤
  │ n8n       │ profile-*, shipping-*               │
  ├───────────┼─────────────────────────────────────┤
  │ Framework │ UserProfileService, ShippingService │
  └───────────┴─────────────────────────────────────┘
  Livrable: Gestion adresses + options livraison

  ---
  Diagramme temporel

           Phase 1              Phase 2              Phase 3
      +-----------------+  +-----------------+  +-----------------+
      |     PANIER      |  |    CHECKOUT     |  |    LIVRAISON    |
      +-----------------+  +-----------------+  +-----------------+

  API:    [Migrations+Endpoints]  [Orders+Stripe]     [Addresses]
  n8n:    [cart-* workflows]      [checkout+webhook]  [profile+ship]
  Fwk:    [CartService]           [Checkout+Orders]   [Profile+Ship]
  Plugin: [CartView UI]           [PayerButton]       [AdresseView]
