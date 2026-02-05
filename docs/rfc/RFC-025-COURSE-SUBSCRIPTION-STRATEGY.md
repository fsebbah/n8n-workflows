# RFC-025 : Stratégie d'Adhésion aux Cours

| Métadonnée | Valeur |
|------------|--------|
| **Numéro** | RFC-025 |
| **Titre** | Course Subscription Strategy |
| **Statut** | Draft |
| **Auteur** | Équipe plugin-recipes |
| **Date** | 2026-02-05 |
| **Dépendances** | RFC-022 (Learning System), RFC-023 (Formation Management) |
| **Équipes concernées** | API, chatbot-core, n8n, plugin-recipes, Stripe |

---

## 1. Résumé

Ce RFC définit la stratégie d'adhésion aux cours pour la plateforme Azy Education. L'objectif est de permettre aux utilisateurs de souscrire à des cours individuels ou en bundle, en complément du système de plans existant.

### 1.1 Problématique actuelle

```
┌─────────────────────────────────────────────────────────────┐
│                    MODÈLE ACTUEL                             │
├─────────────────────────────────────────────────────────────┤
│  Plan Marmiton     → Accès basique                          │
│  Plan Commis       → Accès intermédiaire                    │
│  Plan Chef         → Accès complet                          │
└─────────────────────────────────────────────────────────────┘

Problème : L'utilisateur ne peut pas choisir SES cours.
           Il achète un "niveau" global, pas un contenu spécifique.
```

### 1.2 Modèle cible

```
┌─────────────────────────────────────────────────────────────┐
│                    MODÈLE CIBLE                              │
├─────────────────────────────────────────────────────────────┤
│  Accès Plateforme (base)     → Discord, communauté, gratuits│
│  + Cours Cuisine Bases       → Add-on payant                │
│  + Cours Pâtisserie          → Add-on payant                │
│  + Pack Chef Complet         → Bundle avec réduction        │
└─────────────────────────────────────────────────────────────┘

Avantage : L'utilisateur compose son parcours à la carte.
```

### 1.3 Objectifs

1. **Flexibilité** : Permettre l'achat de cours individuels
2. **Simplicité** : Une seule subscription Stripe avec plusieurs items
3. **Bundles** : Proposer des packs avec réductions
4. **Évolutivité** : Ajouter/retirer des cours sans friction
5. **Intégration** : Lien avec le système de formations (RFC-023)

---

## 2. Architecture Stripe

### 2.1 Structure des produits

```
┌─────────────────────────────────────────────────────────────┐
│                    STRIPE PRODUCTS                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  TYPE: BASE (obligatoire)                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  prod_plateforme                                     │    │
│  │  - Accès Discord                                     │    │
│  │  - Communauté                                        │    │
│  │  - Cours gratuits                                    │    │
│  │  - Prix: 4.99€/mois                                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  TYPE: COURSE (add-ons)                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  prod_cuisine_bases      → 9.99€/mois                │    │
│  │  prod_patisserie         → 14.99€/mois               │    │
│  │  prod_boulangerie        → 12.99€/mois               │    │
│  │  prod_sommellerie        → 19.99€/mois               │    │
│  │  prod_haccp              → 49€ (one-time)            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  TYPE: BUNDLE (réductions)                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  prod_pack_debutant      → 3 cours, -15%             │    │
│  │  prod_pack_chef          → 6 cours, -25%             │    │
│  │  prod_pack_complet       → Tous les cours, -35%      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Metadata Stripe

```python
# Produit Base
{
    "name": "Azy Education - Accès Plateforme",
    "metadata": {
        "type": "base",
        "required": "true",
        "includes": "discord_access,community,free_courses",
        "discord_role": "membre"
    }
}

# Produit Cours
{
    "name": "Cours: Les bases de la cuisine",
    "metadata": {
        "type": "course",
        "course_id": "cuisine-bases",
        "category": "cuisine",
        "level": "debutant",
        "duration_weeks": "8",
        "discord_role": "eleve-cuisine",
        "discord_channel": "cuisine-bases"
    }
}

# Produit Bundle
{
    "name": "Pack Chef Complet",
    "metadata": {
        "type": "bundle",
        "includes_courses": "cuisine-bases,patisserie,sauces,techniques-avancees,haccp,sommellerie",
        "discount_percent": "25",
        "discord_role": "chef-complet"
    }
}

# Produit One-time (certification)
{
    "name": "Certification HACCP",
    "metadata": {
        "type": "certification",
        "course_id": "haccp",
        "one_time": "true",
        "validity_months": "36",
        "discord_role": "certifie-haccp"
    }
}
```

### 2.3 Structure de subscription

```
┌─────────────────────────────────────────────────────────────┐
│                 STRIPE SUBSCRIPTION                          │
├─────────────────────────────────────────────────────────────┤
│  subscription_id: sub_xxxxx                                 │
│  customer_id: cus_xxxxx                                     │
│  status: active                                             │
│                                                              │
│  ITEMS:                                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  si_base      │ prod_plateforme    │  4.99€/mois   │    │
│  │  si_course1   │ prod_cuisine_bases │  9.99€/mois   │    │
│  │  si_course2   │ prod_patisserie    │ 14.99€/mois   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  TOTAL: 29.97€/mois                                         │
│                                                              │
│  PROCHAIN RENOUVELLEMENT: 2026-03-05                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Modèle de données

### 3.1 Tables API

```sql
-- ============================================================
-- COURS DISPONIBLES
-- ============================================================
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identifiants Stripe
    stripe_product_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_price_id VARCHAR(255) NOT NULL,  -- Prix récurrent
    stripe_price_onetime_id VARCHAR(255),   -- Prix one-time (optionnel)

    -- Informations cours
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    short_description VARCHAR(500),

    -- Catégorisation
    category VARCHAR(100) NOT NULL,  -- cuisine, patisserie, sommellerie...
    level VARCHAR(50) NOT NULL,      -- debutant, intermediaire, avance

    -- Durée et contenu
    duration_weeks INT,
    lessons_count INT DEFAULT 0,

    -- Pricing
    price_monthly DECIMAL(10,2) NOT NULL,
    price_onetime DECIMAL(10,2),

    -- Discord
    discord_role_name VARCHAR(100),
    discord_channel_slug VARCHAR(100),

    -- Statut
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    display_order INT DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour recherche
CREATE INDEX idx_courses_category ON courses(category);
CREATE INDEX idx_courses_level ON courses(level);
CREATE INDEX idx_courses_active ON courses(is_active);

-- ============================================================
-- BUNDLES / PACKS
-- ============================================================
CREATE TABLE bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identifiants Stripe
    stripe_product_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_price_id VARCHAR(255) NOT NULL,

    -- Informations bundle
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,

    -- Pricing
    price_monthly DECIMAL(10,2) NOT NULL,
    discount_percent INT DEFAULT 0,

    -- Discord
    discord_role_name VARCHAR(100),

    -- Statut
    is_active BOOLEAN DEFAULT true,
    display_order INT DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Relation bundle <-> cours
CREATE TABLE bundle_courses (
    bundle_id UUID REFERENCES bundles(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    PRIMARY KEY (bundle_id, course_id)
);

-- ============================================================
-- ACCÈS UTILISATEUR AUX COURS
-- ============================================================
CREATE TABLE user_course_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relations
    user_id UUID NOT NULL,  -- Discord user ID ou UUID interne
    course_id UUID REFERENCES courses(id),
    bundle_id UUID REFERENCES bundles(id),  -- Si accès via bundle

    -- Stripe
    stripe_subscription_id VARCHAR(255),
    stripe_subscription_item_id VARCHAR(255),

    -- Type d'accès
    access_type VARCHAR(50) NOT NULL,  -- subscription, one_time, granted, trial

    -- Dates
    granted_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,  -- NULL si subscription active
    cancelled_at TIMESTAMP,

    -- Statut
    status VARCHAR(50) DEFAULT 'active',  -- active, cancelled, expired, paused

    -- Contrainte: soit course_id soit bundle_id
    CONSTRAINT check_course_or_bundle
        CHECK (course_id IS NOT NULL OR bundle_id IS NOT NULL)
);

-- Index pour lookup rapide
CREATE INDEX idx_user_course_user ON user_course_access(user_id);
CREATE INDEX idx_user_course_status ON user_course_access(status);
CREATE INDEX idx_user_course_stripe ON user_course_access(stripe_subscription_id);

-- ============================================================
-- PROGRESSION DANS UN COURS
-- ============================================================
CREATE TABLE user_course_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,
    course_id UUID REFERENCES courses(id),

    -- Progression
    lessons_completed INT DEFAULT 0,
    current_lesson_id UUID,
    progress_percent INT DEFAULT 0,

    -- Temps
    total_time_minutes INT DEFAULT 0,
    last_activity_at TIMESTAMP,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,

    -- XP gagné dans ce cours
    xp_earned INT DEFAULT 0,

    UNIQUE(user_id, course_id)
);
```

### 3.2 Vues utiles

```sql
-- Vue: Cours avec stats
CREATE VIEW v_courses_with_stats AS
SELECT
    c.*,
    COUNT(DISTINCT uca.user_id) as enrolled_count,
    AVG(ucp.progress_percent) as avg_progress
FROM courses c
LEFT JOIN user_course_access uca ON c.id = uca.course_id AND uca.status = 'active'
LEFT JOIN user_course_progress ucp ON c.id = ucp.course_id
GROUP BY c.id;

-- Vue: Accès utilisateur complet
CREATE VIEW v_user_access AS
SELECT
    uca.user_id,
    c.id as course_id,
    c.name as course_name,
    c.slug as course_slug,
    c.discord_role_name,
    c.discord_channel_slug,
    uca.access_type,
    uca.status,
    uca.granted_at,
    uca.expires_at,
    ucp.progress_percent,
    ucp.lessons_completed
FROM user_course_access uca
JOIN courses c ON uca.course_id = c.id
LEFT JOIN user_course_progress ucp ON uca.course_id = ucp.course_id AND uca.user_id = ucp.user_id
WHERE uca.status = 'active';
```

---

## 4. Flux utilisateur

### 4.1 Découverte et achat

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  /cours     │────▶│  Catalogue  │────▶│  Sélection  │────▶│  Checkout   │
│  catalogue  │     │  (embeds)   │     │  (boutons)  │     │  Stripe     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                   │
                                                                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Accès      │◀────│  Roles      │◀────│  Webhook    │◀────│  Paiement   │
│  cours      │     │  Discord    │     │  received   │     │  validé     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 4.2 Ajout de cours (upgrade)

```
User a déjà: Plateforme + Cuisine Bases
User veut ajouter: Pâtisserie

┌─────────────────────────────────────────────────────────────┐
│                     FLUX UPGRADE                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. /cours ajouter patisserie                               │
│     └─▶ Affiche embed avec prix et confirmation             │
│                                                              │
│  2. User clique "Confirmer"                                 │
│     └─▶ API call: subscription.items.create()               │
│     └─▶ Stripe calcule le prorata automatiquement           │
│                                                              │
│  3. Webhook: invoice.payment_succeeded                      │
│     └─▶ Grant access in DB                                  │
│     └─▶ Add Discord role                                    │
│     └─▶ Grant channel access                                │
│     └─▶ Send welcome message                                │
│                                                              │
│  Résultat:                                                  │
│  - Subscription mise à jour                                 │
│  - Prochaine facture: base + cuisine + patisserie           │
│  - Facture prorata immédiate pour le reste du mois          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Retrait de cours (downgrade)

```
User veut retirer: Cuisine Bases

┌─────────────────────────────────────────────────────────────┐
│                    FLUX DOWNGRADE                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. /cours retirer cuisine-bases                            │
│     └─▶ Affiche warning: "Accès jusqu'au XX/XX/XXXX"        │
│                                                              │
│  2. User confirme                                           │
│     └─▶ API call: subscription.items.update()               │
│         { cancel_at_period_end: true }                      │
│                                                              │
│  3. À la fin de la période:                                 │
│     └─▶ Webhook: customer.subscription.updated              │
│     └─▶ Remove Discord role                                 │
│     └─▶ Remove channel access                               │
│     └─▶ Update status in DB: 'cancelled'                    │
│                                                              │
│  Note: L'utilisateur garde l'accès jusqu'à la fin payée     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Achat bundle

```
User veut: Pack Chef Complet (6 cours, -25%)

┌─────────────────────────────────────────────────────────────┐
│                     FLUX BUNDLE                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CAS 1: User n'a aucun cours                                │
│  ─────────────────────────────                              │
│  → Simple: créer subscription avec bundle                   │
│                                                              │
│  CAS 2: User a déjà des cours individuels                   │
│  ─────────────────────────────────────────                  │
│  Problème: Comment gérer la transition ?                    │
│                                                              │
│  Option A: Remplacer les items par le bundle                │
│    └─▶ subscription.items.delete(existing_courses)          │
│    └─▶ subscription.items.create(bundle)                    │
│    └─▶ Credit prorata pour les cours retirés                │
│                                                              │
│  Option B: Upgrade au bundle, garder l'historique           │
│    └─▶ Marquer anciens items comme "upgraded_to_bundle"     │
│    └─▶ Ajouter bundle item                                  │
│    └─▶ Ne pas facturer les cours déjà dans le bundle        │
│                                                              │
│  Recommandation: Option A (plus simple)                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Webhooks Stripe

### 5.1 Events à gérer

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Créer accès initial |
| `invoice.payment_succeeded` | Renouveler/créer accès |
| `invoice.payment_failed` | Notifier user, grace period |
| `customer.subscription.updated` | Sync items changés |
| `customer.subscription.deleted` | Révoquer tous les accès |
| `customer.subscription.paused` | Pause temporaire |

### 5.2 Handler principal

```python
# n8n workflow: stripe-course-webhook

async def handle_subscription_updated(event: StripeEvent):
    """Gère les changements de subscription."""
    subscription = event.data.object
    customer_id = subscription.customer

    # Récupérer le user
    user = await get_user_by_stripe_customer(customer_id)
    if not user:
        logger.error(f"User not found for customer {customer_id}")
        return

    # Récupérer les items actuels
    current_items = {
        item.price.product: item
        for item in subscription.items.data
    }

    # Récupérer les accès actuels en DB
    db_access = await get_user_course_access(user.id)
    db_products = {access.stripe_product_id for access in db_access}

    # Calculer les différences
    stripe_products = set(current_items.keys())

    to_add = stripe_products - db_products
    to_remove = db_products - stripe_products

    # Ajouter les nouveaux accès
    for product_id in to_add:
        course = await get_course_by_stripe_product(product_id)
        if course:
            await grant_course_access(user, course, subscription.id)
            await add_discord_role(user.discord_id, course.discord_role_name)
            await grant_channel_access(user.discord_id, course.discord_channel_slug)

    # Retirer les accès révoqués
    for product_id in to_remove:
        course = await get_course_by_stripe_product(product_id)
        if course:
            await revoke_course_access(user, course)
            await remove_discord_role(user.discord_id, course.discord_role_name)
            await revoke_channel_access(user.discord_id, course.discord_channel_slug)

    # Publier event via Redis Streams (décision RFC-023)
    await redis.xadd(
        "learning:events:stream",
        {"event": json.dumps({
            "event": "subscription.updated",
            "timestamp": datetime.utcnow().isoformat(),
            "guild_id": user.guild_id,
            "data": {
                "user_id": user.discord_id,
                "courses_added": [c.slug for c in to_add],
                "courses_removed": [c.slug for c in to_remove],
            }
        })},
        maxlen=10000,
    )
```

---

## 6. Commandes Discord

### 6.1 Catalogue

```python
@bot.tree.command(name="cours")
@app_commands.describe(action="Action à effectuer")
@app_commands.choices(action=[
    app_commands.Choice(name="Catalogue", value="catalogue"),
    app_commands.Choice(name="Mes cours", value="mes-cours"),
    app_commands.Choice(name="Ajouter", value="ajouter"),
    app_commands.Choice(name="Retirer", value="retirer"),
])
async def cours_command(
    interaction: discord.Interaction,
    action: str,
    cours: str | None = None,
):
    """Gestion des cours."""

    if action == "catalogue":
        await show_catalogue(interaction)
    elif action == "mes-cours":
        await show_my_courses(interaction)
    elif action == "ajouter":
        await add_course(interaction, cours)
    elif action == "retirer":
        await remove_course(interaction, cours)
```

### 6.2 Embed catalogue

```python
async def show_catalogue(interaction: discord.Interaction):
    """Affiche le catalogue des cours."""
    courses = await api.get_available_courses()
    user_courses = await api.get_user_courses(interaction.user.id)
    user_course_ids = {c.id for c in user_courses}

    embed = discord.Embed(
        title="📚 Catalogue des cours",
        description="Choisissez les cours qui vous intéressent",
        color=0x6366F1,
    )

    # Grouper par catégorie
    by_category = {}
    for course in courses:
        if course.category not in by_category:
            by_category[course.category] = []
        by_category[course.category].append(course)

    for category, category_courses in by_category.items():
        lines = []
        for course in category_courses:
            status = "✅" if course.id in user_course_ids else "⬜"
            price = f"{course.price_monthly}€/mois"
            lines.append(f"{status} **{course.name}** - {price}")

        embed.add_field(
            name=f"📂 {category.title()}",
            value="\n".join(lines),
            inline=False,
        )

    # Bundles
    bundles = await api.get_available_bundles()
    if bundles:
        bundle_lines = []
        for bundle in bundles:
            courses_count = len(bundle.courses)
            bundle_lines.append(
                f"🎁 **{bundle.name}** - {bundle.price_monthly}€/mois "
                f"({courses_count} cours, -{bundle.discount_percent}%)"
            )
        embed.add_field(
            name="🎁 Packs",
            value="\n".join(bundle_lines),
            inline=False,
        )

    # View avec boutons
    view = CatalogueView(courses, bundles, user_course_ids)

    await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
```

### 6.3 View avec sélection

```python
class CatalogueView(discord.ui.View):
    """Vue pour sélectionner des cours."""

    def __init__(self, courses, bundles, owned_ids):
        super().__init__(timeout=300)
        self.courses = courses
        self.bundles = bundles
        self.owned_ids = owned_ids

        # Menu déroulant des cours
        self.add_item(CourseSelect(courses, owned_ids))

        # Bouton bundles
        if bundles:
            self.add_item(BundleButton())

    @discord.ui.button(label="Voir mes cours", style=discord.ButtonStyle.secondary)
    async def my_courses(self, interaction: discord.Interaction, button: discord.ui.Button):
        await show_my_courses(interaction)


class CourseSelect(discord.ui.Select):
    """Menu de sélection de cours."""

    def __init__(self, courses, owned_ids):
        options = []
        for course in courses:
            if course.id not in owned_ids:
                options.append(discord.SelectOption(
                    label=course.name,
                    value=course.slug,
                    description=f"{course.price_monthly}€/mois - {course.level}",
                    emoji="📘",
                ))

        super().__init__(
            placeholder="Ajouter un cours...",
            options=options[:25],  # Discord limit
        )

    async def callback(self, interaction: discord.Interaction):
        course_slug = self.values[0]
        await add_course(interaction, course_slug)
```

---

## 7. Intégration avec RFC-023 (Formations)

### 7.1 Lien Cours ↔ Matière

```
┌─────────────────────────────────────────────────────────────┐
│                    HIÉRARCHIE                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Formation (ex: Master Cuisine du Sud)                      │
│  └── Promotion (ex: 2024-2025)                              │
│      └── Matière (ex: Techniques de base)                   │
│          └── Cours Stripe (ex: prod_cuisine_bases)          │
│                                                              │
│  Règle: Une matière peut être liée à un cours payant        │
│         L'accès au cours débloque l'accès à la matière      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Table de liaison

```sql
-- Lien matière ↔ cours Stripe
CREATE TABLE matiere_course_mapping (
    matiere_id UUID REFERENCES matieres(id),
    course_id UUID REFERENCES courses(id),
    is_required BOOLEAN DEFAULT true,  -- Cours obligatoire pour la matière ?
    PRIMARY KEY (matiere_id, course_id)
);
```

### 7.3 Flux inscription formation

```
┌─────────────────────────────────────────────────────────────┐
│              INSCRIPTION À UNE FORMATION                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User s'inscrit à une promotion                          │
│     └─▶ API vérifie les cours requis                        │
│                                                              │
│  2. Si cours manquants:                                     │
│     └─▶ Proposer l'achat des cours requis                   │
│     └─▶ Ou proposer un bundle formation                     │
│                                                              │
│  3. Si tous les cours présents:                             │
│     └─▶ Inscription validée                                 │
│     └─▶ Accès aux channels de la promotion                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Gestion des accès

### 8.1 Types d'accès

| Type | Description | Expiration |
|------|-------------|------------|
| `subscription` | Abonnement mensuel actif | Fin de période si annulé |
| `one_time` | Achat unique (certification) | Selon validity_months |
| `granted` | Offert (promo, partenariat) | Date définie |
| `trial` | Essai gratuit | 7-14 jours |
| `bundle` | Via un pack | Suit le bundle |

### 8.2 Vérification d'accès

```python
async def check_course_access(user_id: str, course_id: str) -> AccessResult:
    """Vérifie si un utilisateur a accès à un cours."""

    # 1. Accès direct au cours
    direct_access = await db.get_user_course_access(user_id, course_id)
    if direct_access and direct_access.status == 'active':
        if direct_access.expires_at is None or direct_access.expires_at > now():
            return AccessResult(granted=True, via="direct", access=direct_access)

    # 2. Accès via bundle
    bundles = await db.get_user_bundles(user_id)
    for bundle in bundles:
        if course_id in bundle.course_ids and bundle.status == 'active':
            return AccessResult(granted=True, via="bundle", bundle=bundle)

    # 3. Accès via formation (gratuit si inscrit à la promo)
    enrollments = await db.get_user_enrollments(user_id)
    for enrollment in enrollments:
        matiere = await db.get_matiere_by_course(course_id, enrollment.promotion_id)
        if matiere and not matiere.requires_payment:
            return AccessResult(granted=True, via="formation", enrollment=enrollment)

    # Pas d'accès
    return AccessResult(granted=False, reason="no_access")
```

### 8.3 Middleware Discord

```python
async def require_course_access(course_slug: str):
    """Décorateur pour vérifier l'accès à un cours."""
    def decorator(func):
        @wraps(func)
        async def wrapper(interaction: discord.Interaction, *args, **kwargs):
            course = await api.get_course_by_slug(course_slug)
            access = await check_course_access(interaction.user.id, course.id)

            if not access.granted:
                embed = discord.Embed(
                    title="🔒 Accès restreint",
                    description=f"Ce contenu nécessite l'accès au cours **{course.name}**.",
                    color=0xEF4444,
                )
                embed.add_field(
                    name="💰 Prix",
                    value=f"{course.price_monthly}€/mois",
                )

                view = discord.ui.View()
                view.add_item(discord.ui.Button(
                    label="Acheter ce cours",
                    url=f"https://example.com/checkout?course={course_slug}",
                ))

                await interaction.response.send_message(
                    embed=embed, view=view, ephemeral=True
                )
                return

            return await func(interaction, *args, **kwargs)
        return wrapper
    return decorator
```

---

## 9. Webhooks n8n

### 9.1 Nouveaux webhooks

| Webhook | Méthode | Description |
|---------|---------|-------------|
| `course-list` | GET | Liste des cours disponibles |
| `course-get` | GET | Détails d'un cours |
| `course-subscribe` | POST | Ajouter un cours à la subscription |
| `course-unsubscribe` | POST | Retirer un cours |
| `course-access-check` | POST | Vérifier l'accès d'un user |
| `bundle-list` | GET | Liste des bundles |
| `bundle-subscribe` | POST | Souscrire à un bundle |
| `user-courses` | GET | Cours d'un utilisateur |
| `user-progress` | GET | Progression d'un user |

### 9.2 Exemple: course-subscribe

```json
// POST /webhook/course-subscribe
{
    "discord_user_id": "123456789",
    "guild_id": "987654321",
    "course_slug": "patisserie",
    "payment_method": "existing_subscription"  // ou "new_checkout"
}

// Response
{
    "success": true,
    "action": "item_added",
    "subscription_id": "sub_xxxxx",
    "course": {
        "id": "uuid",
        "name": "Pâtisserie",
        "price_monthly": 14.99
    },
    "next_invoice": {
        "amount_due": 14.99,
        "proration": true,
        "due_date": "2026-02-05"
    }
}
```

---

## 10. Migration

### 10.1 Plan de migration

```
┌─────────────────────────────────────────────────────────────┐
│                    PLAN DE MIGRATION                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  PHASE 1: Préparation (1 semaine)                           │
│  ─────────────────────────────────                          │
│  - Créer les produits Stripe (base, cours, bundles)         │
│  - Créer les tables DB                                      │
│  - Implémenter les webhooks n8n                             │
│                                                              │
│  PHASE 2: Dual-mode (2 semaines)                            │
│  ──────────────────────────────                             │
│  - Nouveaux users: nouveau système                          │
│  - Users existants: ancien système (plans)                  │
│  - Pas de migration forcée                                  │
│                                                              │
│  PHASE 3: Migration progressive (1 mois)                    │
│  ────────────────────────────────────────                   │
│  - Proposer migration aux users existants                   │
│  - Offrir bonus pour early adopters                         │
│  - Support pour questions                                   │
│                                                              │
│  PHASE 4: Sunset ancien système (2 mois)                    │
│  ─────────────────────────────────────                      │
│  - Notifier les derniers users                              │
│  - Migration automatique à la fin                           │
│  - Deprecate anciens plans                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Mapping ancien → nouveau

```python
# Migration d'un plan existant vers le nouveau système

PLAN_MAPPING = {
    "marmiton": {
        "base": True,
        "courses": [],  # Aucun cours inclus
    },
    "commis": {
        "base": True,
        "courses": ["cuisine-bases"],
    },
    "chef-partie": {
        "base": True,
        "courses": ["cuisine-bases", "patisserie"],
    },
    "chef-cuisine": {
        "base": True,
        "bundle": "pack-chef",  # Convertir en bundle
    },
}

async def migrate_user_subscription(user_id: str, old_plan: str):
    """Migre un user vers le nouveau système."""
    mapping = PLAN_MAPPING.get(old_plan)
    if not mapping:
        raise ValueError(f"Unknown plan: {old_plan}")

    # Créer nouvelle subscription
    items = [{"price": PRICE_IDS["base"]}]

    if "bundle" in mapping:
        items.append({"price": BUNDLE_PRICE_IDS[mapping["bundle"]]})
    else:
        for course_slug in mapping["courses"]:
            items.append({"price": COURSE_PRICE_IDS[course_slug]})

    # Annuler ancienne subscription
    await stripe.Subscription.modify(
        old_subscription_id,
        cancel_at_period_end=True,
    )

    # Créer nouvelle subscription (prend effet à la fin de l'ancienne)
    await stripe.Subscription.create(
        customer=customer_id,
        items=items,
        billing_cycle_anchor=old_subscription.current_period_end,
    )
```

---

## 11. Questions ouvertes

### 11.1 Pour l'équipe API

1. **Structure courses vs formations** : Un cours Stripe peut-il appartenir à plusieurs formations ?
2. **Progression partagée** : Si un user a le cours via subscription puis via formation, la progression est-elle fusionnée ?
3. **Refund policy** : Remboursement si cours annulé dans les 14 jours ?

### 11.2 Pour l'équipe chatbot-core

1. **Rôles Discord** : Un rôle par cours ou rôles groupés par niveau ?
2. **Channels** : Channel dédié par cours ou channels partagés par catégorie ?
3. **Notifications** : Notifier dans le channel du cours ou en DM ?

### 11.3 Pour l'équipe n8n

1. **Checkout flow** : Stripe Checkout ou Payment Links ?
2. **Invoicing** : Factures personnalisées nécessaires ?
3. **Reporting** : Quels rapports automatiser ?

---

## 12. Impact et planning

### 12.1 Par équipe

| Équipe | Composants | Estimation |
|--------|------------|------------|
| **API** | Tables, endpoints, logique accès | 5 jours |
| **n8n** | Webhooks cours, Stripe handlers | 3 jours |
| **chatbot-core** | CourseAccessService, protocols | 2 jours |
| **plugin-recipes** | Commandes /cours, views | 3 jours |
| **Stripe** | Produits, prix, portail | 1 jour |

**Total estimé : 14 jours**

### 12.2 Dépendances

```
Stripe setup ──┬──▶ API tables ──▶ n8n webhooks ──┬──▶ Plugin commands
               │                                   │
               └──▶ chatbot-core service ──────────┘
```

### 12.3 Milestones

| Milestone | Date cible | Livrable |
|-----------|------------|----------|
| M1 | S+1 | Produits Stripe créés, tables DB |
| M2 | S+2 | Webhooks n8n fonctionnels |
| M3 | S+3 | Commandes Discord opérationnelles |
| M4 | S+4 | Tests E2E, documentation |
| M5 | S+5 | Beta avec early adopters |
| M6 | S+8 | GA (General Availability) |

---

## 13. Références

- [RFC-022 : Learning System](./RFC-022-LEARNING-SYSTEM.md)
- [RFC-023 : Formation Management](./RFC-023-FORMATION-MANAGEMENT-SYSTEM.md)
- [Stripe Subscriptions](https://stripe.com/docs/billing/subscriptions)
- [Stripe Subscription Items](https://stripe.com/docs/api/subscription_items)
- [Stripe Prorations](https://stripe.com/docs/billing/subscriptions/prorations)

---

*Document créé le 2026-02-05*
*Review technique ajoutée le 2026-02-05*
*Réponse n8n et décisions actées le 2026-02-05*
*Alignement Redis Streams (RFC-023) le 2026-02-05*
*Statut : Draft - Reviews complètes, prêt pour implémentation*

---

## 14. Review technique (2026-02-05)

> **Reviewer:** Claude Code
> **Statut:** Review avec points critiques

### 14.1 Problèmes critiques 🔴

#### 14.1.1 Triple source de vérité : Stripe ↔ API ↔ Discord

Le système a trois sources d'état qui peuvent diverger :

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Stripe      │     │      API        │     │    Discord      │
│  Subscription   │     │ user_course_    │     │     Roles       │
│    (billing)    │     │    access       │     │  (permissions)  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │    Webhook fail?      │    Rate limit?        │
         │◄─────────────────────►│◄─────────────────────►│
         │                       │                       │
```

**Scénarios de désynchronisation :**

| Scénario | Stripe | API | Discord | Problème |
|----------|--------|-----|---------|----------|
| Webhook échoue | ✅ actif | ❌ pas d'accès | ❌ pas de rôle | User paie mais n'a pas accès |
| Discord rate-limited | ✅ actif | ✅ actif | ❌ pas de rôle | Accès partiel |
| User annule sur Portal | ❌ annulé | ✅ actif (webhook retardé) | ✅ rôle présent | Accès indu |
| Rollback API échoue | ❌ annulé | ✅ actif | ✅ rôle présent | Fuite d'accès |

**Recommandation :** Implémenter un job de réconciliation périodique :

```python
# n8n workflow: subscription-reconciliation (cron: daily)

async def reconcile_subscriptions():
    """Réconcilie l'état Stripe avec l'API et Discord."""

    # 1. Récupérer toutes les subscriptions Stripe actives
    stripe_active = await stripe.Subscription.list(status="active")

    # 2. Récupérer tous les accès API actifs
    api_active = await db.query(
        "SELECT * FROM user_course_access WHERE status = 'active'"
    )

    # 3. Comparer et corriger
    for access in api_active:
        stripe_sub = find_stripe_subscription(access.stripe_subscription_id)

        if not stripe_sub or stripe_sub.status != "active":
            # Accès en DB mais pas dans Stripe → révoquer
            await revoke_access(access)
            await alert_admin(f"Accès révoqué (Stripe invalide): {access.id}")

        # Vérifier les rôles Discord
        discord_has_role = await check_discord_role(
            access.user_id,
            access.course.discord_role_name
        )
        if not discord_has_role:
            # Accès OK mais rôle manquant → réparer
            await add_discord_role(access.user_id, access.course.discord_role_name)
            await alert_admin(f"Rôle réparé: {access.user_id}")
```

#### 14.1.2 Idempotence des webhooks absente

Le handler `handle_subscription_updated` (section 5.2) ne gère pas :
- Webhooks reçus en double (Stripe retry automatique)
- Race conditions si deux webhooks arrivent simultanément
- Pas de clé d'idempotence basée sur l'event ID Stripe

**Problème concret :**
```
T0: Webhook event_123 reçu → traitement commence
T1: Stripe retry event_123 (timeout) → traitement commence aussi
T2: Deux grants d'accès créés, deux rôles ajoutés
```

**Recommandation :**

```python
# Table pour tracker les events traités
CREATE TABLE stripe_processed_events (
    event_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMP DEFAULT NOW(),
    result JSONB
);

# Index pour nettoyage (garder 30 jours)
CREATE INDEX idx_stripe_events_date ON stripe_processed_events(processed_at);

# Handler idempotent
async def handle_stripe_webhook(event: StripeEvent):
    """Handler idempotent pour les webhooks Stripe."""

    # 1. Vérifier si déjà traité
    existing = await db.fetchone(
        "SELECT * FROM stripe_processed_events WHERE event_id = $1",
        event.id
    )
    if existing:
        logger.info(f"Event {event.id} already processed, skipping")
        return existing.result

    # 2. Acquérir un lock pour éviter les race conditions
    lock_key = f"stripe_event:{event.id}"
    if not await redis.set(lock_key, "1", nx=True, ex=60):
        logger.info(f"Event {event.id} being processed by another worker")
        return {"status": "processing"}

    try:
        # 3. Traiter l'event
        result = await process_event(event)

        # 4. Marquer comme traité
        await db.execute(
            "INSERT INTO stripe_processed_events (event_id, result) VALUES ($1, $2)",
            event.id, json.dumps(result)
        )

        return result
    finally:
        await redis.delete(lock_key)
```

#### 14.1.3 Transition Bundle ↔ Cours individuels mal définie

Section 4.4 recommande "Option A: Remplacer les items par le bundle", mais le scénario inverse n'est pas traité.

**Problème :**

```
Mois 1: User achète cuisine-bases (9.99€/mois)
Mois 2: User achète patisserie (14.99€/mois)
Mois 3: User upgrade vers pack-chef (6 cours, -25%)
        → Les cours individuels sont supprimés, remplacés par le bundle
Mois 6: User annule pack-chef

Question: Que se passe-t-il ?
- Perd-il TOUT (y compris les cours payés pendant 2-3 mois avant) ?
- Retrouve-t-il ses cours individuels ?
- Aucun comportement défini.
```

**Recommandation :** Définir une politique claire et l'implémenter :

```python
# Option 1: "Acquired courses" - Les cours achetés individuellement
# restent acquis même après annulation d'un bundle

# Table pour tracker l'historique
CREATE TABLE user_course_acquisition_history (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    course_id UUID REFERENCES courses(id),
    acquired_at TIMESTAMP NOT NULL,
    acquisition_type VARCHAR(50),  -- 'individual', 'bundle', 'granted'
    original_subscription_id VARCHAR(255),
    -- Un cours acquis individuellement ne peut pas être perdu
    is_permanent BOOLEAN DEFAULT false
);

# Lors de l'achat individuel
async def grant_individual_course(user_id, course_id, subscription_id):
    await db.execute("""
        INSERT INTO user_course_acquisition_history
        (user_id, course_id, acquired_at, acquisition_type, original_subscription_id, is_permanent)
        VALUES ($1, $2, NOW(), 'individual', $3, true)
    """, user_id, course_id, subscription_id)

# Lors de l'annulation du bundle
async def handle_bundle_cancellation(user_id, bundle_id):
    # Récupérer les cours du bundle
    bundle_courses = await get_bundle_courses(bundle_id)

    for course in bundle_courses:
        # Vérifier si le cours était acquis individuellement avant
        history = await db.fetchone("""
            SELECT * FROM user_course_acquisition_history
            WHERE user_id = $1 AND course_id = $2 AND is_permanent = true
        """, user_id, course.id)

        if history:
            # Cours acquis individuellement → garder l'accès
            logger.info(f"Keeping access to {course.name} (acquired individually)")
        else:
            # Cours uniquement via bundle → révoquer
            await revoke_course_access(user_id, course.id)
```

#### 14.1.4 Sécurité Stripe non mentionnée

**Absences critiques :**

| Élément | Statut | Risque |
|---------|--------|--------|
| Validation signature webhook | ❌ Absent | Usurpation de webhooks |
| Protection replay attack | ❌ Absent | Rejeu de webhooks |
| HTTPS obligatoire | ❌ Non mentionné | Interception |
| Secrets en env vars | ❌ Non mentionné | Fuite de credentials |
| Logs sans données sensibles | ❌ Non mentionné | Fuite PII |

**Recommandation :** Ajouter la validation obligatoire :

```python
import stripe
from fastapi import Request, HTTPException

# Configuration obligatoire
STRIPE_WEBHOOK_SECRET = os.environ["STRIPE_WEBHOOK_SECRET"]  # whsec_xxxxx

async def validate_stripe_webhook(request: Request) -> stripe.Event:
    """Valide et parse un webhook Stripe."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(400, "Missing stripe-signature header")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        # Payload invalide
        logger.error(f"Invalid Stripe payload: {e}")
        raise HTTPException(400, "Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        # Signature invalide (potentielle attaque)
        logger.warning(f"Invalid Stripe signature: {e}")
        raise HTTPException(400, "Invalid signature")

    # Vérifier l'âge de l'event (protection replay > 5 min)
    event_age = time.time() - event.created
    if event_age > 300:  # 5 minutes
        logger.warning(f"Stale Stripe event: {event.id} ({event_age}s old)")
        raise HTTPException(400, "Event too old")

    return event


# Endpoint sécurisé
@app.post("/webhook/stripe")
async def stripe_webhook_endpoint(request: Request):
    event = await validate_stripe_webhook(request)

    # Ne jamais logger les données sensibles
    logger.info(f"Stripe event received: {event.type} ({event.id})")

    await handle_stripe_event(event)
    return {"received": True}
```

### 14.2 Points d'attention 🟠

#### 14.2.1 Grace period non spécifiée

Section 5.1 mentionne "grace period" pour `invoice.payment_failed` sans définir :

| Question | Réponse attendue |
|----------|------------------|
| Durée de la grace period ? | ? jours |
| Accès maintenu pendant ? | Oui/Non/Restreint |
| Nombre de notifications ? | ? |
| Fréquence des notifications ? | ? |
| Action si échec définitif ? | ? |

**Recommandation :** Définir explicitement :

```python
GRACE_PERIOD_CONFIG = {
    "duration_days": 7,
    "access_during_grace": "full",  # ou "readonly", "none"
    "notifications": [
        {"day": 0, "channel": "email", "template": "payment_failed_initial"},
        {"day": 3, "channel": "email+discord", "template": "payment_failed_reminder"},
        {"day": 6, "channel": "email+discord", "template": "payment_failed_final"},
    ],
    "action_after_grace": "suspend",  # ou "cancel"
}
```

#### 14.2.2 Rate limits Discord pour attribution de rôles

Fin de mois = renouvellements simultanés → pic de webhooks.

**Scénario problématique :**
```
T0: 100 subscriptions renouvelées à minuit
T0+1s: 100 webhooks invoice.payment_succeeded arrivent
T0+2s: 100 add_discord_role() lancés en parallèle
T0+3s: Discord rate limit (10/10sec) → 90 échecs
```

**Recommandation :** Queue avec rate limiting (voir RFC-023 Annexe A) :

```python
from bullmq import Queue, Worker

discord_queue = Queue("discord-operations", {
    "limiter": {
        "max": 5,       # 5 opérations
        "duration": 5000  # par 5 secondes
    }
})

async def grant_course_access_queued(user_id, course):
    """Ajoute l'opération Discord à la queue rate-limited."""
    await discord_queue.add("add_role", {
        "user_id": user_id,
        "role_name": course.discord_role_name,
        "channel_slug": course.discord_channel_slug,
    }, {
        "attempts": 3,
        "backoff": {"type": "exponential", "delay": 5000}
    })
```

#### 14.2.3 Vérification d'accès potentiellement lente

`check_course_access()` (section 8.2) effectue jusqu'à 3+ requêtes DB :

```python
# Requête 1: Accès direct
direct_access = await db.get_user_course_access(user_id, course_id)

# Requête 2: Bundles de l'utilisateur
bundles = await db.get_user_bundles(user_id)

# Requête 3+: Pour chaque bundle, vérifier si le cours est inclus
for bundle in bundles:
    if course_id in bundle.course_ids:  # Potentiellement N requêtes
        ...

# Requête N: Enrollments formations
enrollments = await db.get_user_enrollments(user_id)
```

**Recommandation :** Implémenter un cache avec invalidation :

```python
from cachetools import TTLCache

class CourseAccessService:
    def __init__(self):
        # Cache: (user_id, course_id) -> AccessResult
        self._cache = TTLCache(maxsize=10000, ttl=300)  # 5 min

    async def check_access(self, user_id: str, course_id: str) -> AccessResult:
        cache_key = (user_id, course_id)

        if cache_key in self._cache:
            return self._cache[cache_key]

        # Requête optimisée avec JOIN
        result = await self._check_access_db(user_id, course_id)
        self._cache[cache_key] = result
        return result

    async def invalidate_user_cache(self, user_id: str):
        """Invalide le cache lors d'un changement de subscription."""
        keys_to_remove = [k for k in self._cache.keys() if k[0] == user_id]
        for key in keys_to_remove:
            del self._cache[key]

    async def _check_access_db(self, user_id: str, course_id: str) -> AccessResult:
        """Requête optimisée en une seule query."""
        result = await db.fetchone("""
            SELECT
                uca.id as direct_access_id,
                b.id as bundle_id,
                e.id as enrollment_id
            FROM courses c
            LEFT JOIN user_course_access uca
                ON uca.course_id = c.id
                AND uca.user_id = $1
                AND uca.status = 'active'
            LEFT JOIN bundle_courses bc ON bc.course_id = c.id
            LEFT JOIN bundles b ON b.id = bc.bundle_id
            LEFT JOIN user_course_access uca_bundle
                ON uca_bundle.bundle_id = b.id
                AND uca_bundle.user_id = $1
                AND uca_bundle.status = 'active'
            LEFT JOIN matiere_course_mapping mcm ON mcm.course_id = c.id
            LEFT JOIN enrollments e
                ON e.promotion_id = (SELECT promotion_id FROM matieres WHERE id = mcm.matiere_id)
                AND e.learner_id = $1
                AND e.status = 'active'
            WHERE c.id = $2
        """, user_id, course_id)

        if result.direct_access_id:
            return AccessResult(granted=True, via="direct")
        if result.bundle_id:
            return AccessResult(granted=True, via="bundle")
        if result.enrollment_id:
            return AccessResult(granted=True, via="formation")
        return AccessResult(granted=False)
```

#### 14.2.4 Expiration des accès one_time non automatisée

Les certifications ont `validity_months` (ex: HACCP = 36 mois), mais :
- Pas de cron pour expirer les accès
- Pas de notification avant expiration
- Pas d'event `access.expiring` / `access.expired`

**Recommandation :**

```python
# n8n workflow: course-access-expiration (cron: daily at 6:00)

async def check_expiring_access():
    """Vérifie et gère les accès qui expirent."""

    # 1. Notifier les accès qui expirent dans 7 jours
    expiring_soon = await db.query("""
        SELECT * FROM user_course_access
        WHERE access_type = 'one_time'
        AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        AND status = 'active'
        AND NOT notified_expiring
    """)

    for access in expiring_soon:
        await notify_user_expiring(access)
        await db.execute(
            "UPDATE user_course_access SET notified_expiring = true WHERE id = $1",
            access.id
        )

    # 2. Expirer les accès dépassés
    expired = await db.query("""
        SELECT * FROM user_course_access
        WHERE access_type = 'one_time'
        AND expires_at < NOW()
        AND status = 'active'
    """)

    for access in expired:
        await revoke_course_access(access.user_id, access.course_id)
        await db.execute(
            "UPDATE user_course_access SET status = 'expired' WHERE id = $1",
            access.id
        )
        await notify_user_expired(access)

        # Publier event via Redis Streams (décision RFC-023)
        await redis.xadd(
            "learning:events:stream",
            {"event": json.dumps({
                "event": "course.access.expired",
                "timestamp": datetime.utcnow().isoformat(),
                "guild_id": access.guild_id,
                "data": {
                    "user_id": access.user_id,
                    "course_id": str(access.course_id),
                }
            })},
            maxlen=10000,
        )
```

#### 14.2.5 ✅ Redis Stream : utiliser l'existant

> **Décision actée (RFC-023) :** Utiliser le stream `learning:events:stream` avec Redis Streams (pas Pub/Sub).

Le `RedisStreamSubscriber` de RFC-023 consommera les events de subscription via consumer groups. Il faut s'assurer que :

1. **Consumer group unifié pour tous les events :**

```python
# Le RedisStreamSubscriber (RFC-023) consomme le stream unique
# Les handlers filtrent par type d'event

class UnifiedEventHandler:
    """Handler unifié pour tous les events du stream learning:events:stream."""

    def __init__(self):
        self.handlers = {
            # Events gamification (RFC-022)
            "learning.xp.gained": self._on_xp_gained,
            "learning.badge.earned": self._on_badge_earned,

            # Events subscription (RFC-025)
            "subscription.updated": self._on_subscription_updated,
            "course.access.granted": self._on_access_granted,
            "course.access.revoked": self._on_access_revoked,
            "course.access.expired": self._on_access_expired,

            # Events formation (RFC-023)
            "formation.promotion.created": self._on_promotion_created,
            "formation.member.added": self._on_member_added,
        }

    async def handle(self, event: dict) -> None:
        """Dispatch l'event vers le bon handler."""
        event_type = event.get("event")
        handler = self.handlers.get(event_type)

        if handler:
            await handler(event.get("data", {}))
        else:
            logger.debug(f"No handler for event type: {event_type}")
```

2. **Intégration avec RedisStreamSubscriber (RFC-023) :**

```python
# Utilisation du subscriber existant
subscriber = RedisStreamSubscriber(
    redis=redis,
    consumer_id=f"chatbot-core-{os.getpid()}",
)
handler = UnifiedEventHandler()

await subscriber.setup()
await subscriber.consume(handler.handle)
```

### 14.3 Points mineurs 🟡

#### 14.3.1 Limite Discord : 25 options dans Select

```python
options=options[:25]  # Discord limit
```

Si > 25 cours disponibles, certains ne sont pas affichés.

**Recommandation :** Ajouter une pagination ou un système de recherche :

```python
class CourseSelect(discord.ui.Select):
    def __init__(self, courses, owned_ids, page=0, page_size=25):
        self.all_courses = [c for c in courses if c.id not in owned_ids]
        self.page = page
        self.total_pages = (len(self.all_courses) + page_size - 1) // page_size

        # Cours de la page courante
        start = page * page_size
        page_courses = self.all_courses[start:start + page_size]

        options = [
            discord.SelectOption(
                label=course.name,
                value=course.slug,
                description=f"{course.price_monthly}€/mois",
            )
            for course in page_courses
        ]

        placeholder = f"Cours ({page + 1}/{self.total_pages})"
        super().__init__(placeholder=placeholder, options=options)


class CatalogueView(discord.ui.View):
    def __init__(self, courses, bundles, owned_ids):
        super().__init__()
        self.page = 0
        self.courses = courses
        self.add_item(CourseSelect(courses, owned_ids, page=0))

    @discord.ui.button(label="◀", style=discord.ButtonStyle.secondary)
    async def prev_page(self, interaction, button):
        if self.page > 0:
            self.page -= 1
            await self._update_select(interaction)

    @discord.ui.button(label="▶", style=discord.ButtonStyle.secondary)
    async def next_page(self, interaction, button):
        # ... navigation
```

#### 14.3.2 Accessibilité des embeds

Même problème que RFC-024 :
```python
status = "✅" if course.id in user_course_ids else "⬜"
```

**Recommandation :**
```python
status = "✅ Acquis" if course.id in user_course_ids else "⬜ Disponible"
```

#### 14.3.3 Protocols absents

Pas de `CourseAccessServiceProtocol` → difficile à mocker.

```python
# chatbot_core/services/subscription/protocols.py

from typing import Protocol

class CourseAccessServiceProtocol(Protocol):
    async def check_access(self, user_id: str, course_id: str) -> AccessResult: ...
    async def grant_access(self, user_id: str, course_id: str, access_type: str) -> None: ...
    async def revoke_access(self, user_id: str, course_id: str) -> None: ...
    async def get_user_courses(self, user_id: str) -> list[Course]: ...
```

#### 14.3.4 Tests Stripe en staging

**Recommandation :** Documenter la stratégie de test :

```markdown
## Tests Stripe

### Local (développeur)
- Utiliser Stripe CLI: `stripe listen --forward-to localhost:8000/webhook/stripe`
- Déclencher des events: `stripe trigger invoice.payment_succeeded`

### Staging
- Webhook endpoint dédié: `https://staging.example.com/webhook/stripe`
- Stripe test mode avec clés `sk_test_*`
- Données de test avec cartes `4242424242424242`

### Production
- Webhook endpoint: `https://api.example.com/webhook/stripe`
- Stripe live mode avec clés `sk_live_*`
- Monitoring des échecs webhook dans Stripe Dashboard
```

### 14.4 Migration : points non couverts

#### 14.4.1 Données de progression

Section 10 couvre la migration des subscriptions Stripe, mais pas :

| Donnée | Traitement |
|--------|------------|
| `user_course_progress` | À migrer ? Créer des entrées vides ? |
| XP gagnés (RFC-022) | Conservés ? Recalculés ? |
| Badges acquis | Conservés ? |
| Leaderboard position | Recalculée ? |

**Recommandation :** Ajouter à la section 10 :

```python
async def migrate_user_data(user_id: str, old_plan: str, new_courses: list[str]):
    """Migre les données utilisateur vers le nouveau système."""

    # 1. Conserver la progression existante
    # (les tables user_course_progress restent inchangées)

    # 2. Mapper l'ancien plan vers les nouveaux cours
    for course_slug in new_courses:
        course = await get_course_by_slug(course_slug)

        # Vérifier si progression existe déjà
        existing = await db.fetchone(
            "SELECT * FROM user_course_progress WHERE user_id = $1 AND course_id = $2",
            user_id, course.id
        )

        if not existing:
            # Créer une entrée de progression vide
            await db.execute("""
                INSERT INTO user_course_progress (user_id, course_id, started_at)
                VALUES ($1, $2, NOW())
            """, user_id, course.id)

    # 3. XP et badges sont conservés (liés au user, pas au plan)
    # Aucune action nécessaire

    # 4. Logger la migration
    await db.execute("""
        INSERT INTO user_migration_log (user_id, old_plan, new_courses, migrated_at)
        VALUES ($1, $2, $3, NOW())
    """, user_id, old_plan, new_courses)
```

### 14.5 Recommandations d'implémentation

| Priorité | Action | Équipe |
|----------|--------|--------|
| 🔴 P0 | Ajouter validation signature Stripe | n8n |
| 🔴 P0 | Implémenter idempotence webhooks (table + lock) | n8n/API |
| 🔴 P0 | Définir politique bundle → cours (acquisition permanente ?) | Product/API |
| 🔴 P0 | Implémenter job de réconciliation Stripe/API/Discord | n8n |
| 🟠 P1 | Documenter et implémenter grace period | Product/n8n |
| 🟠 P1 | Queue rate-limited pour opérations Discord | chatbot-core |
| 🟠 P1 | Cache pour vérification d'accès | API |
| 🟠 P1 | Cron expiration accès one_time | n8n |
| 🟡 P2 | Pagination catalogue (> 25 cours) | plugin-recipes |
| 🟡 P2 | Protocols pour testing | chatbot-core |
| 🟡 P2 | Accessibilité embeds | plugin-recipes |
| 🟡 P2 | Documentation stratégie tests Stripe | docs |

### 14.6 Questions en suspens

| # | Question | Pour | Impact |
|---|----------|------|--------|
| 1 | Politique de "cours acquis définitivement" vs "cours loués" ? | Product | Critique pour UX |
| 2 | Grace period : durée et comportement exact ? | Product | Implémentation |
| 3 | User avec même cours via subscription ET bundle : facturation ? | API/Stripe | Billing |
| 4 | Remboursement partiel (1 cours sur 3) possible ? | Product/Stripe | Support |
| 5 | Portail Stripe : gestion items individuels autorisée ? | Stripe | UX |
| 6 | RGPD : où sont stockées les données Stripe ? | Legal | Conformité |
| 7 | Plusieurs subscriptions par user autorisées ? | API/Stripe | Architecture |

---

## Annexe A : Checklist pré-implémentation

### Sécurité Stripe
- [ ] Validation signature webhook implémentée
- [ ] Protection replay attack (event age < 5 min)
- [ ] Secrets Stripe en variables d'environnement
- [ ] HTTPS obligatoire pour webhooks
- [ ] Logs sans données sensibles (pas de numéros de carte)

### Idempotence et fiabilité
- [ ] Table `stripe_processed_events` créée
- [ ] Lock Redis pour éviter race conditions
- [ ] Retry logic avec backoff exponentiel
- [ ] Dead Letter Queue pour webhooks échoués

### Réconciliation
- [ ] Job de réconciliation Stripe/API quotidien
- [ ] Job de réconciliation API/Discord quotidien
- [ ] Alerting pour désynchronisations détectées

### Rate limiting
- [ ] Queue rate-limited pour opérations Discord
- [ ] Respect des limites Stripe API (100 req/sec)

### Cache et performance
- [ ] Cache vérification d'accès implémenté
- [ ] Invalidation cache sur changement subscription
- [ ] Query optimisée pour check_access (single query)

### Expiration et lifecycle
- [ ] Cron expiration accès one_time
- [ ] Notifications avant expiration (J-7, J-3, J-1)
- [ ] Grace period implémentée et testée

### Tests
- [ ] Tests unitaires handlers webhook
- [ ] Tests intégration avec Stripe test mode
- [ ] Tests E2E flux complet (achat → accès → Discord)
- [ ] Documentation stratégie de test

### Redis Streams (alignement RFC-023)
- [x] ~~Utiliser Pub/Sub~~ → **Redis Streams adopté (décision RFC-023)**
- [x] Stream `learning:events:stream` réutilisé (pas de nouveau stream)
- [ ] Intégration avec `RedisStreamSubscriber` existant
- [ ] Handlers subscription ajoutés au `UnifiedEventHandler`

---

## 15. Réponse équipe n8n et décisions (2026-02-05)

> **Reviewer :** Équipe n8n
> **Date :** 2026-02-05

### 15.1 Points acceptés ✅

| Point review | Section | Décision |
|--------------|---------|----------|
| Triple source de vérité | 14.1.1 | ✅ Accepté - Job réconciliation à implémenter |
| Idempotence webhooks | 14.1.2 | ✅ Accepté - Table + lock Redis |
| Transition Bundle ↔ Cours | 14.1.3 | ✅ Accepté - Politique "cours acquis définitivement" |
| Sécurité Stripe | 14.1.4 | ✅ Accepté - Validation signature obligatoire |
| Grace period | 14.2.1 | ✅ Accepté - 7 jours, accès maintenu |
| Rate limits Discord | 14.2.2 | ✅ Accepté - Queue rate-limited |
| Cache vérification accès | 14.2.3 | ✅ Accepté - TTLCache 5 min |
| Expiration one_time | 14.2.4 | ✅ Accepté - Cron daily |
| Redis Streams | 14.2.5 | ✅ **Déjà implémenté (RFC-023)** - Réutiliser `learning:events:stream` |

### 15.2 Décisions actées

#### 15.2.1 ✅ Redis Streams (alignement RFC-023)

> **Décision actée :** Conformément à RFC-023, tous les events utilisent **Redis Streams** (pas Pub/Sub).

- Stream : `learning:events:stream`
- Consumer group : `chatbot-core`
- Subscriber : `RedisStreamSubscriber` (RFC-023 section 15.2.1)

**Code corrigé section 5.2 :**
```python
# ✅ Correct - Redis Streams
await redis.xadd(
    "learning:events:stream",
    {"event": json.dumps({
        "event": "subscription.updated",
        "timestamp": datetime.utcnow().isoformat(),
        "guild_id": user.guild_id,
        "data": {...}
    })},
    maxlen=10000,
)

# ❌ Incorrect - Pub/Sub (ancienne version)
# await redis.publish(f"learning:events:{guild_id}", {...})
```

#### 15.2.2 ✅ Politique "Cours acquis définitivement"

> **Décision actée :** Un cours acheté individuellement reste acquis même après upgrade/downgrade de bundle.

Implémentation via table `user_course_acquisition_history` (section 14.1.3).

#### 15.2.3 ✅ Grace period : 7 jours

| Paramètre | Valeur |
|-----------|--------|
| Durée | 7 jours |
| Accès pendant grace | Complet |
| Notifications | J+0, J+3, J+6 |
| Action après grace | Suspension (pas annulation) |

#### 15.2.4 ✅ One-time purchases séparés des subscriptions

> **Clarification :** Les produits one-time (HACCP) sont gérés via `stripe.PaymentIntent`, pas via subscription items.

```python
# Achat one-time (certification HACCP)
async def purchase_certification(user_id: str, course_slug: str):
    course = await get_course_by_slug(course_slug)

    # PaymentIntent pour achat unique
    intent = await stripe.PaymentIntent.create(
        amount=int(course.price_onetime * 100),
        currency="eur",
        customer=user.stripe_customer_id,
        metadata={
            "type": "certification",
            "course_id": course_slug,
            "user_id": user_id,
        }
    )

    return intent.client_secret

# Webhook: payment_intent.succeeded
async def handle_payment_intent_succeeded(event):
    intent = event.data.object

    if intent.metadata.get("type") == "certification":
        await grant_certification_access(
            user_id=intent.metadata["user_id"],
            course_slug=intent.metadata["course_id"],
            validity_months=36,
        )
```

### 15.3 Points à compléter

| Point | Équipe responsable | Priorité |
|-------|-------------------|----------|
| Définir events subscription (JSON Schema) | API | 🔴 P0 |
| Implémenter `UnifiedEventHandler` | chatbot-core | 🔴 P0 |
| Table `stripe_processed_events` | API | 🔴 P0 |
| Job réconciliation Stripe/API/Discord | n8n | 🟠 P1 |
| Cron expiration one_time | n8n | 🟠 P1 |
| Pagination catalogue (> 25 cours) | plugin-recipes | 🟡 P2 |

### 15.4 Questions résolues

| Question (section 11) | Réponse |
|-----------------------|---------|
| 11.1.1 Cours → multi-formations | Oui, via `matiere_course_mapping` (M:N) |
| 11.1.2 Progression fusionnée | Non, une seule source (table `user_course_progress`) |
| 11.1.3 Refund 14 jours | Oui, via Stripe Refunds (droit rétractation EU) |
| 11.2.1 Rôles Discord | Un rôle par cours |
| 11.2.2 Channels | Channel par cours pour contenu |
| 11.2.3 Notifications | Channel du cours (visible inscrits) |
| 11.3.1 Checkout flow | Stripe Checkout |

### 15.5 Planning révisé

| Priorité | Action | Équipe | Estimation |
|----------|--------|--------|------------|
| 🔴 P0 | Validation signature + idempotence Stripe | n8n | 2 jours |
| 🔴 P0 | Table `stripe_processed_events` | API | 0.5 jour |
| 🔴 P0 | Intégrer handlers subscription dans `UnifiedEventHandler` | chatbot-core | 1 jour |
| 🔴 P0 | Endpoint PaymentIntent pour one-time | API | 1 jour |
| 🟠 P1 | Job réconciliation quotidien | n8n | 2 jours |
| 🟠 P1 | Queue rate-limited Discord | chatbot-core | 1 jour |
| 🟠 P1 | Cache vérification accès | API | 1 jour |
| 🟠 P1 | Cron expiration + notifications | n8n | 1 jour |
| 🟡 P2 | Pagination catalogue | plugin-recipes | 0.5 jour |
| 🟡 P2 | Tests E2E | QA | 2 jours |

**Total révisé : 12 jours** (vs 14 initialement, grâce à la réutilisation de Redis Streams)

### 15.6 Checklist mise à jour

- [x] ~~Décision Redis Streams vs Pub/Sub~~ → **Redis Streams (RFC-023)**
- [x] ~~Définir grace period~~ → **7 jours, accès complet**
- [x] ~~Politique bundle ↔ cours~~ → **Cours acquis définitivement**
- [x] ~~One-time vs subscription~~ → **PaymentIntent séparé**
- [ ] Validation signature Stripe
- [ ] Table `stripe_processed_events`
- [ ] `UnifiedEventHandler` avec handlers subscription
- [ ] Job réconciliation Stripe/API/Discord
- [ ] Queue rate-limited Discord
- [ ] Cron expiration one_time
- [ ] Tests E2E

---

## 16. Review finale et compléments (2026-02-05)

> **Reviewer:** Claude Code
> **Objectif:** Challenger les points restants et finaliser

### 16.1 Validation des décisions actées ✅

| Décision | Statut | Commentaire |
|----------|--------|-------------|
| Redis Streams (alignement RFC-023) | ✅ Validée | Cohérence inter-RFC |
| Grace period 7 jours | ✅ Validée | Standard industrie |
| Cours acquis définitivement | ✅ Validée | Bonne UX, évite frustration |
| One-time via PaymentIntent | ✅ Validée | Séparation claire |
| Validation signature Stripe | ✅ Validée | Sécurité critique |
| Job réconciliation quotidien | ✅ Validée | Résilience |

### 16.2 Points challengés et résolus

#### 16.2.1 🔴 Overlap bundle + cours individuel (Q3 non résolue)

**Problème identifié :**
```
User a: subscription avec cuisine-bases (9.99€/mois)
User ajoute: pack-debutant qui inclut cuisine-bases + 2 autres cours

Question: Le user paie-t-il cuisine-bases deux fois ?
```

**Décision proposée et actée :**

> **Politique "Smart Upgrade"** : Lors de l'achat d'un bundle, les cours déjà possédés individuellement sont déduits.

```python
async def upgrade_to_bundle(user_id: str, bundle_slug: str) -> UpgradeResult:
    """
    Upgrade vers un bundle avec déduction des cours existants.
    """
    user = await get_user(user_id)
    bundle = await get_bundle(bundle_slug)
    current_courses = await get_user_individual_courses(user_id)

    # Calculer les cours déjà possédés
    owned_in_bundle = [c for c in current_courses if c.id in bundle.course_ids]
    owned_value = sum(c.price_monthly for c in owned_in_bundle)

    # Prix effectif du bundle
    effective_price = max(bundle.price_monthly - owned_value, 0)

    # Si le user possède déjà tout, pas d'upgrade nécessaire
    if effective_price == 0:
        return UpgradeResult(
            success=False,
            reason="already_has_all_courses",
            message="Vous possédez déjà tous les cours de ce pack !",
        )

    # Créer la subscription avec le bundle
    # Les cours individuels sont marqués "upgraded_to_bundle"
    await stripe.Subscription.modify(
        user.subscription_id,
        items=[
            # Supprimer les cours individuels inclus dans le bundle
            *[{"id": c.stripe_item_id, "deleted": True} for c in owned_in_bundle],
            # Ajouter le bundle
            {"price": bundle.stripe_price_id},
        ],
        proration_behavior="create_prorations",
    )

    # Tracker l'historique pour la politique "cours acquis définitivement"
    for course in owned_in_bundle:
        await mark_course_as_permanently_acquired(user_id, course.id)

    return UpgradeResult(
        success=True,
        previous_monthly=user.current_monthly_total,
        new_monthly=user.current_monthly_total - owned_value + bundle.price_monthly,
        savings=owned_value,
    )
```

**Message UX :**
```
🎁 Upgrade vers Pack Débutant

Vous possédez déjà :
• ✅ Cuisine Bases (9.99€/mois) - inclus dans le pack

Prix du pack : 24.99€/mois
Votre prix  : 24.99€ - 9.99€ = 15.00€/mois

Économie : 9.99€/mois déduit !

[Confirmer l'upgrade]
```

#### 16.2.2 🟠 Plusieurs subscriptions par user (Q7)

**Décision actée :**

> **Une seule subscription par user** avec plusieurs items.

**Justification :**
- Simplifie la gestion Stripe
- Une seule facture mensuelle
- Portail client Stripe plus clair
- Évite les race conditions sur les webhooks

**Implémentation :**
```python
async def get_or_create_subscription(user_id: str) -> stripe.Subscription:
    """
    Récupère la subscription existante ou en crée une nouvelle.
    Un user = une subscription.
    """
    user = await get_user(user_id)

    if user.stripe_subscription_id:
        sub = await stripe.Subscription.retrieve(user.stripe_subscription_id)
        if sub.status in ["active", "trialing", "past_due"]:
            return sub
        # Subscription annulée/expirée → en créer une nouvelle

    # Créer nouvelle subscription avec produit base obligatoire
    subscription = await stripe.Subscription.create(
        customer=user.stripe_customer_id,
        items=[{"price": PRICE_IDS["base"]}],
        payment_behavior="default_incomplete",
        expand=["latest_invoice.payment_intent"],
    )

    await update_user_subscription_id(user_id, subscription.id)
    return subscription
```

#### 16.2.3 🟠 Portail Stripe - gestion items individuels (Q5)

**Recherche effectuée :**

Le Customer Portal Stripe permet par défaut :
- Annuler toute la subscription ✅
- Mettre à jour le moyen de paiement ✅
- Voir les factures ✅

Mais **NE permet PAS** :
- Ajouter/supprimer des items individuels ❌
- Changer de plan mid-cycle ❌

**Décision actée :**

> **Gestion des cours uniquement via Discord**, pas via le portail Stripe.

**Implémentation portail :**
```python
# Configuration du Customer Portal
portal_config = stripe.billing_portal.Configuration.create(
    business_profile={
        "headline": "Gérez votre abonnement Azy Education",
    },
    features={
        "subscription_cancel": {
            "enabled": True,
            "mode": "at_period_end",  # Pas d'annulation immédiate
            "proration_behavior": "none",
        },
        "subscription_pause": {
            "enabled": True,  # Permet la pause
        },
        "payment_method_update": {
            "enabled": True,
        },
        "invoice_history": {
            "enabled": True,
        },
        # Désactiver les changements de plan (géré via Discord)
        "subscription_update": {
            "enabled": False,
        },
    },
)
```

**Message dans le portail :**
```
Pour ajouter ou retirer des cours, utilisez la commande /cours sur Discord.
```

#### 16.2.4 🟠 RGPD - données Stripe (Q6)

**Points de conformité :**

| Donnée | Stockage | Responsable | Rétention |
|--------|----------|-------------|-----------|
| Numéro de carte | Stripe uniquement | Stripe (PCI DSS) | Selon Stripe |
| Email | API + Stripe | Co-responsabilité | Compte actif + 3 ans |
| Historique paiements | Stripe | Stripe | 10 ans (légal) |
| Discord ID | API | Azy Education | Compte actif |
| Progression cours | API | Azy Education | Compte actif + 1 an |

**Implémentation RGPD :**

```python
# Commande de suppression des données (RGPD Article 17)
async def handle_gdpr_deletion_request(user_id: str) -> GDPRResult:
    """
    Traite une demande de suppression RGPD.
    """
    user = await get_user(user_id)

    # 1. Annuler la subscription Stripe
    if user.stripe_subscription_id:
        await stripe.Subscription.delete(user.stripe_subscription_id)

    # 2. Anonymiser les données locales (pas supprimer - obligations légales)
    await db.execute("""
        UPDATE users SET
            email = 'deleted_' || id || '@anonymized.local',
            discord_username = 'Utilisateur supprimé',
            stripe_customer_id = NULL,
            stripe_subscription_id = NULL,
            deleted_at = NOW()
        WHERE id = $1
    """, user.id)

    # 3. Supprimer les données de progression (pas d'obligation légale)
    await db.execute("DELETE FROM user_course_progress WHERE user_id = $1", user.id)
    await db.execute("DELETE FROM user_course_access WHERE user_id = $1", user.id)

    # 4. Supprimer le customer Stripe (supprime aussi l'historique non légal)
    # Note: Stripe conserve les données de facturation pour obligations légales
    await stripe.Customer.delete(user.stripe_customer_id)

    # 5. Retirer les rôles Discord
    for guild_id in user.guild_ids:
        await remove_all_course_roles(guild_id, user.discord_id)

    return GDPRResult(
        success=True,
        anonymized_data=["email", "username"],
        deleted_data=["progression", "access", "stripe_customer"],
        retained_data=["invoices (10 ans - obligation légale)"],
    )
```

### 16.3 Fallback Redis Streams (alignement RFC-023)

Conformément à la section 16.2 de RFC-023, le même pattern de fallback s'applique :

```python
# Réutilisation du ResilientEventPublisher de RFC-023
from chatbot_core.services.events.resilient_publisher import ResilientEventPublisher

# Publication des events subscription
async def publish_subscription_event(
    publisher: ResilientEventPublisher,
    event_type: str,
    guild_id: str,
    data: dict,
) -> str:
    """Publie un event subscription avec fallback."""
    return await publisher.publish(
        stream="learning:events:stream",
        event_type=event_type,
        guild_id=guild_id,
        data=data,
    )

# Events subscription définis
SUBSCRIPTION_EVENTS = {
    "subscription.created": "Nouvelle subscription créée",
    "subscription.updated": "Items de subscription modifiés",
    "subscription.cancelled": "Subscription annulée",
    "subscription.payment_failed": "Échec de paiement",
    "subscription.payment_succeeded": "Paiement réussi",
    "course.access.granted": "Accès au cours accordé",
    "course.access.revoked": "Accès au cours révoqué",
    "course.access.expired": "Accès au cours expiré",
}
```

### 16.4 Tests Stripe recommandés

#### 16.4.1 Configuration environnements

```yaml
# Environnements Stripe
environments:
  local:
    mode: test
    webhook_secret: whsec_test_xxx
    endpoint: http://localhost:8000/webhook/stripe
    tools:
      - stripe-cli listen

  staging:
    mode: test
    webhook_secret: ${STRIPE_WEBHOOK_SECRET_STAGING}
    endpoint: https://staging-api.example.com/webhook/stripe

  production:
    mode: live
    webhook_secret: ${STRIPE_WEBHOOK_SECRET_PROD}
    endpoint: https://api.example.com/webhook/stripe
```

#### 16.4.2 Scénarios de test

```python
# Tests E2E à implémenter

STRIPE_TEST_SCENARIOS = [
    # Happy path
    {
        "name": "new_user_subscribes_to_course",
        "steps": [
            "create_customer",
            "create_subscription_with_base",
            "add_course_item",
            "verify_discord_role_added",
            "verify_channel_access",
        ],
        "expected": "User has access to course",
    },
    {
        "name": "user_upgrades_to_bundle",
        "setup": "user_with_2_courses",
        "steps": [
            "upgrade_to_bundle",
            "verify_prorata_credit",
            "verify_single_bundle_item",
            "verify_courses_marked_permanent",
        ],
        "expected": "User has bundle, courses permanently acquired",
    },
    {
        "name": "payment_fails_grace_period",
        "setup": "user_with_active_subscription",
        "steps": [
            "simulate_payment_failure",
            "verify_access_maintained",
            "wait_3_days",
            "verify_notification_sent",
            "wait_7_days",
            "verify_access_suspended",
        ],
        "expected": "Access suspended after grace period",
    },
    {
        "name": "user_cancels_bundle_keeps_individual",
        "setup": "user_with_bundle_and_prior_individual",
        "steps": [
            "cancel_bundle",
            "wait_period_end",
            "verify_bundle_access_revoked",
            "verify_individual_course_retained",
        ],
        "expected": "Individual course access maintained",
    },

    # Edge cases
    {
        "name": "webhook_received_twice",
        "steps": [
            "send_webhook_event",
            "send_same_webhook_event",
            "verify_single_processing",
        ],
        "expected": "Idempotent - processed once",
    },
    {
        "name": "redis_down_during_webhook",
        "steps": [
            "stop_redis",
            "send_webhook_event",
            "verify_db_fallback_used",
            "start_redis",
            "verify_event_processed",
        ],
        "expected": "Fallback to DB, then processed",
    },
]
```

### 16.5 Métriques de monitoring

```python
# Métriques Prometheus pour subscriptions

from prometheus_client import Counter, Gauge, Histogram

# Compteurs subscription
subscription_events_total = Counter(
    "subscription_events_total",
    "Total des events subscription traités",
    ["event_type", "status"]  # status: success, failed, skipped
)

subscription_revenue_total = Counter(
    "subscription_revenue_cents_total",
    "Revenu total en centimes",
    ["product_type"]  # type: base, course, bundle, certification
)

# Jauges
active_subscriptions = Gauge(
    "active_subscriptions_total",
    "Nombre de subscriptions actives",
    ["product_type"]
)

grace_period_users = Gauge(
    "grace_period_users_total",
    "Utilisateurs en grace period"
)

# Histogrammes
webhook_processing_duration = Histogram(
    "stripe_webhook_processing_seconds",
    "Durée de traitement des webhooks Stripe",
    ["event_type"],
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30]
)

# Alertes recommandées
SUBSCRIPTION_ALERTS = {
    "rate(subscription_events_total{status='failed'}[5m]) > 0.1":
        "CRITICAL: High Stripe webhook failure rate",
    "grace_period_users > 50":
        "WARNING: Many users in payment grace period",
    "stripe_webhook_processing_seconds{quantile='0.99'} > 10":
        "WARNING: Slow webhook processing",
}
```

### 16.6 Checklist finale RFC-025

#### Sécurité et fiabilité (P0)
- [ ] Validation signature Stripe (section 14.1.4)
- [ ] Table `stripe_processed_events` pour idempotence
- [ ] Lock Redis pour race conditions webhooks
- [ ] `ResilientEventPublisher` (fallback DB)
- [ ] Protection replay attack (event age < 5 min)

#### Fonctionnel (P0)
- [ ] Tables courses, bundles, user_course_access
- [ ] Endpoints CRUD cours et bundles
- [ ] Handler `subscription.updated` complet
- [ ] Handler `payment_intent.succeeded` pour one-time
- [ ] Politique "Smart Upgrade" (déduction cours existants)
- [ ] Politique "cours acquis définitivement"

#### Intégration (P1)
- [ ] Intégration avec `UnifiedEventHandler` (RFC-023)
- [ ] Queue rate-limited pour opérations Discord
- [ ] Cache vérification accès (TTLCache)
- [ ] Job réconciliation Stripe/API/Discord
- [ ] Cron expiration one_time + notifications

#### UX (P1)
- [ ] Commande `/cours catalogue`
- [ ] Commande `/cours ajouter`
- [ ] Commande `/cours retirer`
- [ ] Commande `/cours mes-cours`
- [ ] Pagination catalogue (> 25 cours)
- [ ] Portail Stripe configuré (cancel, pause, payment)

#### Conformité (P2)
- [ ] Endpoint RGPD suppression
- [ ] Documentation rétention données
- [ ] Logs sans données sensibles

#### Tests (P2)
- [ ] Tests unitaires handlers webhook
- [ ] Tests intégration Stripe test mode
- [ ] Tests E2E scénarios définis (section 16.4.2)

### 16.7 Statut final

```
RFC-025 : Course Subscription Strategy
──────────────────────────────────────
Statut        : ✅ APPROVED - Prêt pour implémentation
Version       : 1.0
Approuvé par  : API, n8n, chatbot-core, plugin-recipes
Date          : 2026-02-05
Dépend de     : RFC-023 (Redis Streams, ResilientEventPublisher)

Décisions clés actées :
- Redis Streams (alignement RFC-023)
- Grace period 7 jours avec accès maintenu
- Cours acquis définitivement (politique Smart Upgrade)
- Une subscription par user avec multi-items
- Gestion cours via Discord (pas portail Stripe)
- PaymentIntent pour one-time (certifications)

Prochaines étapes :
1. Stripe : Créer produits base/cours/bundles en test mode
2. API : Tables + endpoints + table stripe_processed_events
3. n8n : Webhooks Stripe avec idempotence
4. chatbot-core : Intégration UnifiedEventHandler
5. plugin-recipes : Commandes /cours
6. QA : Tests E2E avec Stripe CLI
```
