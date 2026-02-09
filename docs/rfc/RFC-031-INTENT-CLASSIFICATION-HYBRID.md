# RFC-031: Classification d'Intention Hybride (Keywords + Similarité Sémantique)

| Metadata | |
|----------|---------|
| **Auteur** | Équipe plugin-recipes |
| **Date** | 2026-02-06 |
| **Status** | Reviewed - En attente d'approbation finale |
| **Dépendances** | RFC-030 (azy_mcp library), Qdrant, chatbot-core |
| **Impacte** | chatbot-core, plugin-recipes, azy_mcp, n8n |

---

## 1. Contexte et Problématique

### 1.1 Situation actuelle

Le bot Bot Appetit gère plusieurs domaines fonctionnels :

- **Recettes** : Recherche, détails, liste de courses
- **Cours** : Formations vidéo, progression, certificats
- **Compte** : Abonnement, crédits, profil

Actuellement, azy_mcp utilise un prompt LLM simple pour détecter l'intention :

```python
prompt = f"""Analyse ce message et determine l'intention.
Outils disponibles: {tool_descriptions}
Message: "{message}"
"""
```

### 1.2 Problèmes identifiés

| Problème | Exemple | Impact |
|----------|---------|--------|
| **Ambiguïté inter-domaines** | "Je veux faire du canard laqué" | Recette ou Cours ? |
| **Pas d'apprentissage** | Mêmes erreurs répétées | UX dégradée |
| **Descriptions tools vagues** | `"MCP - Gmail Server"` | LLM ne peut pas décider |
| **Pas de contexte historique** | Utilisateur habitué aux cours | Ignoré |
| **Latence LLM systématique** | Chaque message → LLM | Coût + temps |

### 1.3 Objectifs

1. **Désambiguïsation précise** entre domaines (recettes vs cours)
2. **Apprentissage continu** basé sur les interactions validées
3. **Réduction latence** pour les cas évidents
4. **Gestion explicite** des cas ambigus (demande de clarification)

---

## 2. Solution Proposée : Classification Hybride

### 2.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Message: "Je veux une recette de canard laqué"                     │
│                              │                                       │
│              ┌───────────────┴───────────────┐                      │
│              ▼                               ▼                       │
│  ┌───────────────────────┐    ┌───────────────────────────────┐    │
│  │  Layer 1: Keywords    │    │  Layer 2: Similarité Qdrant   │    │
│  │  (< 1ms, Redis)       │    │  (~10ms, embeddings)          │    │
│  │                       │    │                               │    │
│  │  "recette" → recipes  │    │  Search intent_history        │    │
│  │  Score: 0.8           │    │  5 similar validated msgs     │    │
│  └───────────────────────┘    └───────────────────────────────┘    │
│              │                               │                       │
│              └───────────────┬───────────────┘                      │
│                              ▼                                       │
│              ┌───────────────────────────────┐                      │
│              │  Layer 3: Fusion & Décision   │                      │
│              │                               │                      │
│              │  keywords_score: 0.8 (recipes)│                      │
│              │  similar_score:  0.6 (mixed)  │                      │
│              │                               │                      │
│              │  → Clarification requise      │                      │
│              └───────────────────────────────┘                      │
│                              │                                       │
│                              ▼                                       │
│  Bot: "Tu veux :                                                    │
│        📖 La recette de canard laqué (ingrédients + étapes)         │
│        🎓 Le cours vidéo sur la technique du canard laqué"          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Les 3 Layers

| Layer | Technologie | Latence | Rôle |
|-------|-------------|---------|------|
| **Keywords** | Redis ZSET | < 1ms | Signaux forts (trigger/anti-trigger) |
| **Similarité** | Qdrant | ~10ms | Historique sémantique |
| **Fusion** | Algorithme local | < 1ms | Décision finale |

### 2.3 Avantages de l'approche hybride

1. **Keywords** : Capture les signaux explicites ("recette", "cours", "apprendre")
2. **Similarité** : Capture le sens profond ("Comment faire X" ≈ cours)
3. **Fusion** : Détecte les conflits et demande clarification

---

## 3. Architecture Technique

### 3.1 Composants

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   chatbot-core                                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                                                              │   │
│   │  KeywordsMatcher                 IntentClassifier            │   │
│   │  ┌──────────────────┐           ┌──────────────────────┐    │   │
│   │  │ Redis ZSET       │           │ Qdrant + Embeddings  │    │   │
│   │  │ score_message()  │           │ classify()           │    │   │
│   │  │ < 1ms            │           │ record()             │    │   │
│   │  └──────────────────┘           │ ~10ms                │    │   │
│   │           │                      └──────────────────────┘    │   │
│   │           │                                │                 │   │
│   │           └──────────────┬─────────────────┘                 │   │
│   │                          ▼                                   │   │
│   │                 HybridIntentResolver                         │   │
│   │                 ┌──────────────────────┐                     │   │
│   │                 │ resolve()            │                     │   │
│   │                 │ - Combine scores     │                     │   │
│   │                 │ - Detect ambiguity   │                     │   │
│   │                 │ - Return decision    │                     │   │
│   │                 └──────────────────────┘                     │   │
│   │                                                              │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                    │                                 │
│                                    ▼                                 │
│   plugin-recipes                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  ConversationService                                         │   │
│   │  - Appelle HybridIntentResolver avant azy_mcp               │   │
│   │  - Si ambigu → clarification                                 │   │
│   │  - Si confiant → passe le domaine à azy_mcp                 │   │
│   │  - Après résolution → record() pour apprentissage           │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   Qdrant                              Redis                          │
│   ┌─────────────────────┐            ┌─────────────────────┐        │
│   │ intent_history      │            │ keywords:*:triggers │        │
│   │ - embeddings        │            │ keywords:*:anti     │        │
│   │ - domain validated  │            │ keywords:version    │        │
│   └─────────────────────┘            └─────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Qui porte quoi ?

| Composant | Responsable | Justification |
|-----------|-------------|---------------|
| `KeywordsMatcher` | chatbot-core | Réutilisable, accès Redis existant |
| `IntentClassifier` | chatbot-core | Réutilisable, abstraction Qdrant |
| `HybridIntentResolver` | chatbot-core | Combine les deux |
| Qdrant collection | chatbot-core | Configuration centralisée |
| Redis keywords | plugin-recipes seed | Données spécifiques métier |
| Apprentissage | plugin-recipes | Déclenche record() |

---

## 4. Modèles de Données

### 4.1 Qdrant Collection : `intent_history`

```javascript
{
  // Vecteur
  "id": "uuid-v4",
  "vector": [0.12, -0.34, 0.78, ...],  // 1536 dims (OpenAI) ou 1024 (Anthropic)

  // Payload
  "payload": {
    // Message original
    "message": "Comment faire du canard laqué ?",
    "message_normalized": "comment faire canard laque",
    "tokens": ["comment", "faire", "canard", "laqué"],

    // Classification
    "domain": "courses",
    "action": "search",
    "tool_used": "mcp-courses-search",

    // Validation
    "was_validated": true,
    "validation_type": "implicit",  // implicit | explicit | corrected
    "original_prediction": "recipes",
    "confidence_at_prediction": 0.65,

    // Contexte
    "user_id": "636639897767378954",
    "guild_id": "1458159736775119115",
    "user_subscription": "chef_patissier",
    "session_id": "abc123",

    // Entités extraites
    "entities": {
      "dish": "canard laqué",
      "cuisine": "asiatique"
    },

    // Métadonnées
    "created_at": "2026-02-06T15:30:00Z",
    "source": "discord"
  }
}
```

### 4.2 Redis : Keywords (ZSET avec poids)

```
# Triggers par domaine (mot → poids)
keywords:recipes:triggers
  "recette"      → 10.0
  "ingrédients"  → 9.0
  "cuisiner"     → 8.0
  "préparer"     → 7.0
  "plat"         → 6.0

keywords:courses:triggers
  "cours"        → 10.0
  "apprendre"    → 9.5
  "formation"    → 9.0
  "vidéo"        → 8.0
  "technique"    → 8.0
  "leçon"        → 7.5

# Anti-triggers (réduisent le score)
keywords:recipes:anti
  "cours"        → 5.0
  "vidéo"        → 4.0
  "apprendre"    → 4.0

keywords:courses:anti
  "recette"      → 5.0
  "ingrédients"  → 4.0
  "liste"        → 3.0

# Version pour invalidation cache
keywords:version → "2026-02-06T15:30:00Z"
```

### 4.3 Structure de réponse

```python
@dataclass
class IntentResolution:
    """Résultat de la classification hybride."""

    # Décision
    domain: str | None           # "recipes", "courses", None si inconnu
    confidence: float            # 0.0 - 1.0
    needs_clarification: bool    # True si ambigu

    # Détails
    distribution: dict[str, DomainScore]  # Score par domaine
    similar_messages: list[SimilarMessage]  # Top 5 messages similaires

    # Scores par layer
    keywords_score: dict[str, float]
    similarity_score: dict[str, float]

    # Options de clarification (si needs_clarification)
    clarification_options: list[ClarificationOption] | None


@dataclass
class DomainScore:
    count: int           # Nombre de hits
    avg_score: float     # Score moyen de similarité
    weight: float        # Poids combiné
    percentage: float    # % du total


@dataclass
class SimilarMessage:
    message: str
    domain: str
    score: float
    was_validated: bool


@dataclass
class ClarificationOption:
    domain: str
    label: str           # "📖 La recette de canard laqué"
    description: str     # "Ingrédients et étapes de préparation"
    confidence: float
```

---

## 5. Algorithmes

### 5.1 KeywordsMatcher (Layer 1)

```python
class KeywordsMatcher:
    """Scoring rapide par mots-clés via Redis ZSET."""

    DOMAINS = ["recipes", "courses", "shopping", "account"]

    async def score_message(self, message: str) -> dict[str, float]:
        """Score un message par domaine en < 1ms."""
        tokens = self._tokenize(message)
        scores = {}

        pipe = self.redis.pipeline()

        for domain in self.DOMAINS:
            # Récupérer poids des triggers
            for token in tokens:
                pipe.zscore(f"keywords:{domain}:triggers", token)
            # Récupérer poids des anti-triggers
            for token in tokens:
                pipe.zscore(f"keywords:{domain}:anti", token)

        results = await pipe.execute()

        # Parser les résultats
        idx = 0
        for domain in self.DOMAINS:
            trigger_sum = 0
            anti_sum = 0

            for _ in tokens:
                score = results[idx]
                if score:
                    trigger_sum += score
                idx += 1

            for _ in tokens:
                score = results[idx]
                if score:
                    anti_sum += score
                idx += 1

            # Score final = triggers - anti * 0.7
            scores[domain] = max(0, trigger_sum - (anti_sum * 0.7))

        return scores

    def _tokenize(self, message: str) -> list[str]:
        """Tokenize et normalise le message."""
        import unicodedata
        # Lowercase, remove accents, split
        normalized = unicodedata.normalize('NFD', message.lower())
        ascii_text = normalized.encode('ascii', 'ignore').decode()
        return [w for w in ascii_text.split() if len(w) > 2]
```

### 5.2 IntentClassifier (Layer 2)

```python
class IntentClassifier:
    """Classification par similarité sémantique via Qdrant."""

    COLLECTION = "intent_history"

    async def classify(
        self,
        message: str,
        top_k: int = 10,
        min_score: float = 0.7,
        guild_id: str | None = None,
    ) -> SimilarityResult:
        """Classifie par recherche de messages similaires."""

        # 1. Embedding
        vector = await self.embedder.embed(message)

        # 2. Filtres optionnels (même guild = plus pertinent)
        filters = [
            FieldCondition(key="was_validated", match={"value": True})
        ]
        if guild_id:
            # Boost pour même guild mais pas exclusif
            pass  # Géré via scoring

        # 3. Recherche
        results = self.qdrant.search(
            collection_name=self.COLLECTION,
            query_vector=vector,
            limit=top_k,
            score_threshold=min_score,
            query_filter=Filter(must=filters),
        )

        # 4. Agréger par domaine
        domain_hits: dict[str, list] = defaultdict(list)
        similar = []

        for hit in results:
            domain = hit.payload["domain"]
            domain_hits[domain].append(hit.score)
            similar.append(SimilarMessage(
                message=hit.payload["message"],
                domain=domain,
                score=hit.score,
                was_validated=hit.payload["was_validated"],
            ))

        # 5. Calculer distribution
        distribution = {}
        total_weight = 0

        for domain, scores in domain_hits.items():
            weight = len(scores) * (sum(scores) / len(scores))
            distribution[domain] = DomainScore(
                count=len(scores),
                avg_score=sum(scores) / len(scores),
                weight=weight,
                percentage=0,  # Calculé après
            )
            total_weight += weight

        # Normaliser percentages
        for domain in distribution:
            distribution[domain].percentage = (
                distribution[domain].weight / total_weight if total_weight else 0
            )

        return SimilarityResult(
            distribution=distribution,
            similar_messages=similar[:5],
            total_hits=len(results),
        )

    async def record(
        self,
        message: str,
        domain: str,
        validated: bool = True,
        validation_type: str = "implicit",
        **metadata,
    ) -> None:
        """Enregistre pour apprentissage."""
        vector = await self.embedder.embed(message)

        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "message": message,
                "message_normalized": self._normalize(message),
                "domain": domain,
                "was_validated": validated,
                "validation_type": validation_type,
                "created_at": datetime.utcnow().isoformat(),
                **metadata,
            },
        )

        self.qdrant.upsert(
            collection_name=self.COLLECTION,
            points=[point],
        )
```

### 5.3 HybridIntentResolver (Layer 3)

```python
class HybridIntentResolver:
    """Fusion des scores keywords + similarité."""

    # Poids de chaque layer
    WEIGHT_KEYWORDS = 0.4
    WEIGHT_SIMILARITY = 0.6

    # Seuils
    CONFIDENCE_THRESHOLD = 0.65      # En dessous → incertain
    AMBIGUITY_RATIO = 1.3            # Si 1er < 2ème * ratio → ambigu
    MIN_SIMILAR_FOR_BOOST = 3        # Minimum de hits similaires

    def __init__(
        self,
        keywords_matcher: KeywordsMatcher,
        intent_classifier: IntentClassifier,
    ):
        self.keywords = keywords_matcher
        self.classifier = intent_classifier

    async def resolve(
        self,
        message: str,
        guild_id: str | None = None,
        user_context: dict | None = None,
    ) -> IntentResolution:
        """Résout l'intention avec les deux layers."""

        # 1. Scores keywords (< 1ms)
        kw_scores = await self.keywords.score_message(message)

        # 2. Scores similarité (~10ms)
        sim_result = await self.classifier.classify(
            message,
            guild_id=guild_id,
        )

        # 3. Normaliser les scores keywords
        kw_total = sum(kw_scores.values()) or 1
        kw_normalized = {d: s / kw_total for d, s in kw_scores.items()}

        # 4. Scores similarité normalisés
        sim_normalized = {
            d: score.percentage
            for d, score in sim_result.distribution.items()
        }

        # 5. Fusion pondérée
        all_domains = set(kw_normalized.keys()) | set(sim_normalized.keys())
        combined = {}

        for domain in all_domains:
            kw = kw_normalized.get(domain, 0)
            sim = sim_normalized.get(domain, 0)

            # Boost si beaucoup de hits similaires
            sim_boost = 1.0
            if domain in sim_result.distribution:
                if sim_result.distribution[domain].count >= self.MIN_SIMILAR_FOR_BOOST:
                    sim_boost = 1.2

            combined[domain] = (
                kw * self.WEIGHT_KEYWORDS +
                sim * self.WEIGHT_SIMILARITY * sim_boost
            )

        # 6. Trouver le meilleur
        if not combined:
            return IntentResolution(
                domain=None,
                confidence=0.0,
                needs_clarification=True,
            )

        sorted_domains = sorted(combined.items(), key=lambda x: -x[1])
        best_domain, best_score = sorted_domains[0]

        # 7. Vérifier ambiguïté
        needs_clarification = False
        clarification_options = None

        if len(sorted_domains) > 1:
            second_score = sorted_domains[1][1]
            if best_score < second_score * self.AMBIGUITY_RATIO:
                needs_clarification = True
                clarification_options = self._build_options(sorted_domains[:3])

        if best_score < self.CONFIDENCE_THRESHOLD:
            needs_clarification = True

        # 8. Construire le résultat
        return IntentResolution(
            domain=best_domain if not needs_clarification else None,
            confidence=best_score,
            needs_clarification=needs_clarification,
            distribution={
                d: DomainScore(
                    count=sim_result.distribution.get(d, DomainScore(0, 0, 0, 0)).count,
                    avg_score=sim_result.distribution.get(d, DomainScore(0, 0, 0, 0)).avg_score,
                    weight=score,
                    percentage=score / sum(combined.values()) if combined else 0,
                )
                for d, score in combined.items()
            },
            similar_messages=sim_result.similar_messages,
            keywords_score=kw_scores,
            similarity_score=sim_normalized,
            clarification_options=clarification_options,
        )

    def _build_options(
        self,
        top_domains: list[tuple[str, float]]
    ) -> list[ClarificationOption]:
        """Construit les options de clarification."""
        templates = {
            "recipes": ("📖", "Recette", "Voir les ingrédients et étapes"),
            "courses": ("🎓", "Cours", "Suivre la formation vidéo"),
            "shopping": ("🛒", "Liste", "Ajouter à la liste de courses"),
        }

        options = []
        for domain, score in top_domains:
            if domain in templates:
                icon, label, desc = templates[domain]
                options.append(ClarificationOption(
                    domain=domain,
                    label=f"{icon} {label}",
                    description=desc,
                    confidence=score,
                ))

        return options
```

---

## 6. Apprentissage Continu

### 6.1 Types de validation

| Type | Déclencheur | Fiabilité |
|------|-------------|-----------|
| **Implicit** | User utilise le résultat sans corriger | Moyenne |
| **Explicit** | User clique sur bouton de confirmation | Haute |
| **Corrected** | User choisit autre option après clarification | Très haute |

### 6.2 Flux d'apprentissage

```python
async def handle_interaction(message: str, context: Context):
    # 1. Résolution initiale
    resolution = await resolver.resolve(message, guild_id=context.guild_id)

    if resolution.needs_clarification:
        # 2a. Demander clarification
        choice = await ask_clarification(resolution.clarification_options)

        # 3a. Enregistrer avec correction
        await classifier.record(
            message=message,
            domain=choice.domain,
            validated=True,
            validation_type="corrected",
            original_prediction=resolution.domain,
            user_id=context.user_id,
            guild_id=context.guild_id,
        )

        return await process_domain(choice.domain, message)

    else:
        # 2b. Traiter directement
        result = await process_domain(resolution.domain, message)

        # 3b. Enregistrer comme implicitement validé
        await classifier.record(
            message=message,
            domain=resolution.domain,
            validated=True,
            validation_type="implicit",
            confidence_at_prediction=resolution.confidence,
            user_id=context.user_id,
            guild_id=context.guild_id,
        )

        return result
```

### 6.3 Évolution des poids keywords

Un job batch peut analyser les patterns :

```python
async def update_keyword_weights():
    """Ajuste les poids keywords basé sur les validations Qdrant."""

    # Agrégation des tokens par domaine (dernier mois)
    pipeline = [
        {"$match": {"was_validated": True, "created_at": {"$gte": month_ago}}},
        {"$unwind": "$tokens"},
        {"$group": {
            "_id": {"domain": "$domain", "token": "$tokens"},
            "count": {"$sum": 1},
            "avg_confidence": {"$avg": "$confidence_at_prediction"},
        }},
        {"$match": {"count": {"$gte": 5}}},  # Minimum 5 occurrences
    ]

    # Mettre à jour Redis avec les nouveaux poids
    for result in aggregation_results:
        domain = result["_id"]["domain"]
        token = result["_id"]["token"]
        weight = min(10, result["count"] * result["avg_confidence"])

        await redis.zadd(f"keywords:{domain}:triggers", {token: weight})
```

---

## 7. Intégration avec azy_mcp

### 7.1 Flux modifié

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Message utilisateur                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────────────┐                                        │
│  │ HybridIntentResolver    │                                        │
│  │ (chatbot-core)          │                                        │
│  └───────────┬─────────────┘                                        │
│              │                                                       │
│       ┌──────┴──────┐                                               │
│       ▼             ▼                                                │
│  [Confiant]    [Ambigu]                                             │
│       │             │                                                │
│       │             ▼                                                │
│       │      ┌─────────────┐                                        │
│       │      │ Clarification│                                       │
│       │      │ UI Discord   │                                       │
│       │      └──────┬──────┘                                        │
│       │             │                                                │
│       └──────┬──────┘                                               │
│              ▼                                                       │
│  ┌─────────────────────────┐                                        │
│  │ azy_mcp.process()       │  ← Reçoit domain pré-résolu           │
│  │ - Scope tools au domain │                                        │
│  │ - Extract entities      │                                        │
│  │ - Generate response     │                                        │
│  └───────────┬─────────────┘                                        │
│              │                                                       │
│              ▼                                                       │
│  ┌─────────────────────────┐                                        │
│  │ ActionExecutor          │                                        │
│  └───────────┬─────────────┘                                        │
│              │                                                       │
│              ▼                                                       │
│  ┌─────────────────────────┐                                        │
│  │ record() → Qdrant       │  ← Apprentissage                       │
│  └─────────────────────────┘                                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Modification ConversationService

```python
class ConversationService:
    def __init__(self, ..., intent_resolver: HybridIntentResolver):
        self.intent_resolver = intent_resolver
        # ...

    async def process(self, message: str, ...) -> ConversationResult:
        # 1. Pré-résolution du domaine
        resolution = await self.intent_resolver.resolve(
            message,
            guild_id=guild_id,
            user_context={"subscription": user_subscription},
        )

        if resolution.needs_clarification:
            return ConversationResult(
                response=None,
                needs_clarification=True,
                clarification_options=resolution.clarification_options,
            )

        # 2. Filtrer les tools par domaine
        domain_tools = [
            t for t in self.tools_registry.tools
            if self._tool_matches_domain(t, resolution.domain)
        ]

        # 3. Appeler azy_mcp avec tools filtrés
        result = await self._conversation_manager.process(
            message=message,
            session_id=session_id,
            context={
                **context,
                "pre_resolved_domain": resolution.domain,
                "domain_confidence": resolution.confidence,
            },
            tools=domain_tools,  # Override avec tools filtrés
        )

        # 4. Enregistrer pour apprentissage
        await self.intent_resolver.classifier.record(
            message=message,
            domain=resolution.domain,
            validated=True,
            tool_used=result.action.tool if result.action else None,
            user_id=user_id,
            guild_id=guild_id,
        )

        return result
```

---

## 8. Seed Data (Données initiales)

### 8.1 Keywords initiaux

```python
SEED_KEYWORDS = {
    "recipes": {
        "triggers": {
            "recette": 10, "recettes": 10,
            "ingrédients": 9, "ingredient": 9,
            "cuisiner": 8, "préparer": 8, "faire": 7,
            "plat": 7, "dish": 6,
            "portions": 6, "servings": 6,
            "étapes": 6, "instructions": 6,
            "temps de cuisson": 7,
        },
        "anti": {
            "cours": 6, "course": 6,
            "apprendre": 5, "learn": 5,
            "vidéo": 5, "video": 5,
            "formation": 6, "training": 6,
            "technique": 4,
        },
    },
    "courses": {
        "triggers": {
            "cours": 10, "course": 10,
            "apprendre": 9, "learn": 9,
            "formation": 9, "training": 9,
            "vidéo": 8, "video": 8,
            "technique": 8,
            "leçon": 7, "lesson": 7,
            "tutoriel": 8, "tutorial": 8,
            "progression": 6, "progress": 6,
            "certificat": 7, "certificate": 7,
            "maîtriser": 8, "master": 8,
        },
        "anti": {
            "recette": 6, "recipe": 6,
            "ingrédients": 5, "ingredients": 5,
            "liste de courses": 5,
        },
    },
    "shopping": {
        "triggers": {
            "liste": 9, "list": 9,
            "courses": 8, "shopping": 8,
            "acheter": 7, "buy": 7,
            "ajouter": 6, "add": 6,
            "panier": 7, "cart": 7,
            "supermarché": 5,
        },
        "anti": {
            "cours": 5, "course": 5,
            "vidéo": 4,
        },
    },
}
```

### 8.2 Messages seed pour Qdrant

```python
SEED_MESSAGES = [
    # Recipes - clairs
    {"message": "Donne-moi une recette de poulet rôti", "domain": "recipes"},
    {"message": "Quels ingrédients pour faire une quiche ?", "domain": "recipes"},
    {"message": "Je cherche une recette végétarienne", "domain": "recipes"},

    # Courses - clairs
    {"message": "Je veux apprendre à faire des macarons", "domain": "courses"},
    {"message": "Y a-t-il un cours sur les techniques de pâtisserie ?", "domain": "courses"},
    {"message": "Montre-moi une vidéo sur le canard laqué", "domain": "courses"},

    # Ambigus (seront affinés par apprentissage)
    {"message": "Comment faire une pizza maison ?", "domain": "recipes"},
    {"message": "Je veux faire du pain", "domain": "recipes"},
]
```

---

## 9. Plan de Déploiement

### Phase 1 : Infrastructure (Semaine 1)

| Tâche | Équipe | Dépendance |
|-------|--------|------------|
| Créer collection Qdrant `intent_history` | chatbot-core | - |
| Implémenter `KeywordsMatcher` | chatbot-core | Redis |
| Implémenter `IntentClassifier` | chatbot-core | Qdrant |
| Implémenter `HybridIntentResolver` | chatbot-core | Les deux |

### Phase 2 : Intégration (Semaine 2)

| Tâche | Équipe | Dépendance |
|-------|--------|------------|
| Seed keywords Redis | plugin-recipes | Phase 1 |
| Seed messages Qdrant | plugin-recipes | Phase 1 |
| Modifier `ConversationService` | plugin-recipes | Phase 1 |
| UI Clarification Discord | plugin-recipes | - |

### Phase 3 : Apprentissage (Semaine 3)

| Tâche | Équipe | Dépendance |
|-------|--------|------------|
| Job batch update keywords | chatbot-core | Phase 2 |
| Dashboard monitoring | n8n/API | Phase 2 |
| A/B Testing | plugin-recipes | Phase 2 |

---

## 10. Métriques de Succès

| Métrique | Baseline | Target | Mesure |
|----------|----------|--------|--------|
| Précision classification | N/A | > 90% | % prédictions correctes |
| Taux de clarification | N/A | < 15% | % messages ambigus |
| Latence résolution | N/A | < 50ms | P95 |
| Satisfaction utilisateur | N/A | > 4/5 | Feedback implicite |

---

## 11. Questions ouvertes pour review

1. **Embedding model** : OpenAI `text-embedding-3-small` ou Anthropic ?
2. **Rétention Qdrant** : Garder toutes les interactions ou TTL ?
3. **Multi-guild** : Apprentissage global ou par guild ?
4. **Cold start** : Stratégie pour nouveaux guilds sans historique ?

---

## 12. Retour equipe api-backend

> Review par equipe api-backend (chat.api) — 2026-02-09

### Remarques

1. **Syntaxe MongoDB dans `update_keyword_weights()` (section 6.3)** : Le code utilise `$match`, `$unwind`, `$group` (syntaxe MongoDB). Si MongoDB est bien prevu pour ce use-case, le preciser dans les dependances de la RFC. Sinon, reecrire en requetes Qdrant (scroll + aggregation cote applicatif) ou PostgreSQL.

2. **Architecture chatbot-core** : Les 3 composants (`KeywordsMatcher`, `IntentClassifier`, `HybridIntentResolver`) dans chatbot-core est le bon choix. chatbot-core ne stocke pas les data, il embarque des services generiques reutilisables par les plugins et fait l'interface. La section 3.2 est correcte.

3. **Pas de lien avec RFC-028** : Les quotas tokens/modeles LLM par guild (RFC-028 `guild_subscriptions`) n'ont pas de rapport avec la classification d'intention. Ce sont deux preoccupations distinctes. Aucune modification necessaire.

4. **Nommage `AMBIGUITY_RATIO`** (section 5.3, ligne 477) : Renommer en `DOMINANCE_THRESHOLD` serait plus explicite. La variable represente le ratio minimum par lequel le meilleur score doit dominer le second pour ne pas etre considere ambigu. Suggestion :
   ```python
   DOMINANCE_THRESHOLD = 1.3  # best_score doit etre >= second * 1.3
   ```

5. **Recommandations sur les questions ouvertes** :
   - **Q1 (Embedding)** : `text-embedding-3-small` (OpenAI) — le moins cher, 1536 dims, suffisant pour du francais
   - **Q2 (Retention)** : TTL 6 mois glissant. Au-dela, les patterns d'usage evoluent
   - **Q3 (Multi-guild)** : Apprentissage global avec boost same-guild (deja prevu dans le code)
   - **Q4 (Cold start)** : Keywords-only au demarrage + seed messages. Bascule hybride apres un seuil d'interactions (ex: 50 messages valides)

---

## 13. Analyse complémentaire (équipe n8n-workflows)

> Review par équipe n8n-workflows — 2026-02-09

### 13.1 Points validés

L'architecture hybride 3 layers est solide. La séparation des responsabilités (chatbot-core = services génériques, plugin = données métier) est correcte.

### 13.2 Points en suspens / Challenges

| # | Point | Risque | Analyse |
|---|-------|--------|---------|
| 1 | **Budget latence irréaliste** | 🔴 Élevé | Target < 50ms P95, mais : embedding ~50-200ms + Qdrant ~10ms + Redis < 1ms = **60-210ms minimum**. L'embedding n'est pas comptabilisé. |
| 2 | **⚠️ DOMAINS HARDCODÉS** | 🔴 **Critique** | `DOMAINS = ["recipes", "courses", "shopping", "account"]` est en dur dans le code (section 5.1). **INACCEPTABLE.** Ajouter un domaine = redéploiement. Les domaines DOIVENT être dynamiques (Redis/PostgreSQL). |
| 3 | **Pas de cache embedding** | 🟡 Moyen | Messages similaires/identiques = recalcul embedding à chaque fois. Cache Redis avec TTL recommandé. |
| 4 | **Feedback négatif** | 🟡 Moyen | `record()` doit enregistrer TOUS les feedbacks (positifs ET négatifs). Stocker dans MongoDB + Redis pour analyse. Le champ `was_validated: false` existe mais le flux ne l'utilise jamais. À corriger. |
| 5 | **record() après action** | 🟡 Moyen | Section 7.2 : `record()` est appelé APRÈS l'exécution. Si l'action échoue (API down, erreur), on enregistre quand même comme "validé". Faux positif. Conditionner sur `result.success`. |
| 6 | **Multi-langue non prévu** | 🟡 Moyen | Keywords et seed messages sont 100% français. Un user anglophone ("I want a recipe") aura score keywords = 0. **À prévoir** : détection langue + keywords par langue (`keywords:{lang}:{domain}:triggers`). |
| 7 | **Clarification fatigue** | 🟡 Moyen | Si le système demande clarification trop souvent, les utilisateurs se lassent et abandonnent. C'est un problème d'UX : un seuil d'ambiguïté trop sensible = trop de questions = frustration. Prévoir un mécanisme adaptatif par utilisateur (réduire le seuil si l'utilisateur répond toujours la même chose). |
| 8 | **Coût OpenAI embeddings** | 🟢 Faible | `text-embedding-3-small` = $0.02/1M tokens. Estimation coût mensuel pour X messages ? |

### 13.3 Recommandations

1. **Latence** : Ajouter cache embedding (Redis, TTL 1h, clé = hash du message normalisé). Target révisé : < 100ms P95 avec cache hit, < 250ms cold.

2. **Architecture solide** : Pas de fallback. Qdrant et Redis doivent être hautement disponibles (réplication, health checks, alerting). Si un composant tombe, on préfère une erreur explicite plutôt qu'une dégradation silencieuse.

3. **Feedback complet** : Enregistrer TOUS les feedbacks dans MongoDB + Redis :
   ```python
   # Positif (implicite ou explicite)
   await classifier.record(..., validated=True, validation_type="implicit")

   # Négatif (user corrige ou abandonne)
   await classifier.record(..., validated=False, validation_type="rejected")

   # Action échouée
   await classifier.record(..., validated=False, validation_type="action_failed")
   ```

4. **⚠️ Domains dynamiques (OBLIGATOIRE)** :
   ```python
   # Au lieu de DOMAINS = ["recipes", "courses", ...] en dur
   DOMAINS = await redis.smembers("config:intent:domains")
   # Ou depuis PostgreSQL : SELECT name FROM intent_domains WHERE active = true
   ```
   Permet d'ajouter un domaine sans redéploiement.

5. **Multi-langue** :
   - Layer 0 : Détection langue (fasttext ou API)
   - Keywords par langue : `keywords:{lang}:{domain}:triggers`
   - Seed messages multilingues

6. **Clarification adaptative** : Tracker par user le ratio clarification/résolution. Si un user répond toujours "recettes" aux clarifications, baisser son seuil d'ambiguïté pour ce domaine.

### 13.4 Intégration n8n (détail)

L'équipe n8n-workflows fournira les workflows suivants :

| Workflow | Type | Description |
|----------|------|-------------|
| `CRON - Intent Keywords Sync` | Cron (daily) | Exécute `update_keyword_weights()` : agrège les feedbacks Qdrant, recalcule les poids, met à jour Redis |
| `CRON - Intent Stats Daily` | Cron (daily) | Calcule les métriques quotidiennes : taux clarification, précision, latence P95. Stocke dans PostgreSQL `intent_metrics` |
| `MCP - Intent Feedback` | Webhook | Endpoint pour enregistrer les feedbacks négatifs explicites (user clique "mauvaise réponse") |
| `ALERT - Intent Clarification High` | Cron (hourly) | Alerte si taux de clarification > 20% sur la dernière heure |
| `NOTIF - Intent Domain Added` | Webhook | Notifie les plugins quand un nouveau domaine est ajouté à `config:intent:domains` |

**Schéma d'intégration :**

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  chatbot-core (HybridIntentResolver)                                │
│           │                                                          │
│           │ record() après chaque interaction                        │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ Qdrant          │ ← Stocke embeddings + metadata                 │
│  │ intent_history  │                                                │
│  └────────┬────────┘                                                │
│           │                                                          │
│           │ Agrégation quotidienne                                   │
│           ▼                                                          │
│  ┌─────────────────────────────────────────┐                        │
│  │ n8n: CRON - Intent Keywords Sync        │                        │
│  │ - Scroll Qdrant (dernières 24h)         │                        │
│  │ - Agrège tokens par domaine             │                        │
│  │ - ZADD Redis keywords:*:triggers        │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                      │
│  ┌─────────────────────────────────────────┐                        │
│  │ n8n: CRON - Intent Stats Daily          │                        │
│  │ - Query Qdrant pour métriques           │                        │
│  │ - INSERT PostgreSQL intent_metrics      │                        │
│  │ - Expose via API pour dashboard         │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                      │
│  ┌─────────────────────────────────────────┐                        │
│  │ n8n: ALERT - Intent Clarification High  │                        │
│  │ - Si clarification_rate > 0.20          │                        │
│  │ - POST Discord #alerts                  │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 13.5 Questions pour l'équipe plugin-recipes

1. Le job batch `update_keyword_weights()` : daily suffit ou plus fréquent ?
2. Seuil d'alerte clarification : 20% est-il acceptable ?
3. Les seed messages (section 8.2) : fichier JSON versionné ou table PostgreSQL ?
4. Langues supportées au lancement : FR uniquement ou FR + EN ?

---

## Annexes

### A. Alternatives considérées

| Alternative | Raison du rejet |
|-------------|-----------------|
| LLM seul pour classification | Latence, coût, pas d'apprentissage |
| Fine-tuning modèle | Complexité, maintenance |
| Rules engine | Pas de sémantique, rigide |
| MongoDB seul | Pas de recherche vectorielle native |

### B. Références

- RFC-030: azy_mcp Library Architecture
- Qdrant Documentation: <https://qdrant.tech/documentation/>
- OpenAI Embeddings: <https://platform.openai.com/docs/guides/embeddings>

---

## 14. Analyse équipe azy_mcp (Claude)

> Review par équipe azy_mcp — 2026-02-09

### 14.1 Réponses aux questions en suspens

| Question | Décision | Justification |
|----------|----------|---------------|
| **Q1 (Embedding)** | `text-embedding-3-small` (OpenAI) | Moins cher, 1536 dims, suffisant. Aligné avec recommandation api-backend |
| **Q2 (Rétention)** | TTL 6 mois glissant | Patterns évoluent. Aligné avec recommandation api-backend |
| **Q3 (Multi-guild)** | Global + boost same-guild | Déjà prévu dans le code. Permet cold start cross-guild |
| **Q4 (Cold start)** | Keywords-only → hybride après 50 messages | Progressive, pas de dégradation UX |
| **Langues** | **FR uniquement** pour les POC | Simplification. Multi-langue = phase 2 |

### 14.2 Clarification MongoDB vs Qdrant

**Contexte** : Section 6.3 `update_keyword_weights()` utilise syntaxe MongoDB (`$match`, `$unwind`, `$group`), mais les données sont dans Qdrant.

**⚠️ Contrainte importante** : MongoDB **4.4.18** (version en place) **n'a PAS de vector search natif**. Cette fonctionnalité est apparue dans MongoDB 7.0+ et Atlas Vector Search. **Qdrant reste donc indispensable** pour la recherche vectorielle.

**Rôles distincts** :

| Technologie | Rôle | Pourquoi |
|-------------|------|----------|
| **Qdrant** | Vector search temps réel | Seul capable de recherche par similarité sémantique |
| **MongoDB 4.4** | Stockage metadata + agrégations batch | `$group`, `$unwind` pour `update_keyword_weights()` |
| **Redis** | Cache keywords | Lookup < 1ms |
| **OpenAI API** | Génération embeddings | `text-embedding-3-small` |

**Analyse comparative pour agrégations batch** :

| Critère | MongoDB 4.4 | Qdrant scroll |
|---------|-------------|---------------|
| Agrégation native | ✅ Oui (`$group`) | ❌ Non (côté applicatif) |
| Performance sur 100k docs | ~50ms | ~200ms + processing |
| Complexité | Simple (une query) | Plus complexe (pagination) |

**Recommandation** : Utiliser **MongoDB** pour les agrégations batch (job CRON). **Qdrant obligatoire** pour la recherche vectorielle temps réel.

**Architecture dual-storage** :

```
┌─────────────────────────────────────────────────────────────────┐
│  TEMPS RÉEL (chaque message)                                    │
│  ───────────────────────────                                    │
│                                                                  │
│  Message → OpenAI embedding API                                 │
│         → Qdrant vector search (similarité)                     │
│         → Classification hybride                                │
│                                                                  │
│  record() dual write:                                           │
│    → Qdrant : embedding + payload (vector search)               │
│    → MongoDB : metadata + tokens (agrégation batch)             │
│                                                                  │
│  BATCH (CRON daily)                                             │
│  ──────────────────                                             │
│                                                                  │
│  MongoDB aggregation ($match, $unwind, $group)                  │
│         → update_keyword_weights()                              │
│         → Redis ZADD keywords:*:triggers                        │
└─────────────────────────────────────────────────────────────────┘
```

Le `record()` écrit dans les deux :

- **Qdrant** : embedding vector + payload complet (pour vector search)
- **MongoDB** : metadata + tokens uniquement (pour agrégation, pas de vector)

### 14.3 Latence : mesure obligatoire

**Problème** : Target < 50ms irréaliste. Révisé à < 100ms (cache) / < 250ms (cold).

**Action requise** : Implémenter un **tracker de latence** dès le début.

```python
@dataclass
class IntentResolution:
    # ... champs existants ...

    # Métriques de latence (ajouté)
    latency_ms: float
    latency_breakdown: dict[str, float]  # {"keywords": 1, "embedding": 80, "qdrant": 15, "fusion": 2}
```

**Enregistrement** :

- Chaque `resolve()` log sa latence dans Redis Stream `metrics:intent:latency`
- Job CRON agrège P50/P95/P99 → PostgreSQL `intent_metrics`
- Dashboard expose les tendances

### 14.4 Mes questions pour les équipes

| # | Question | Pour | Impact |
|---|----------|------|--------|
| 1 | **Dual write Qdrant + MongoDB** : overhead acceptable ? | api-backend | Architecture |
| 2 | **Cache embedding** : Redis string ou hash ? TTL 1h suffisant ? | n8n | Performance |
| 3 | **Seed messages** : combien au minimum pour que l'hybride soit fiable ? | plugin-recipes | Cold start |
| 4 | **Clarification UI** : boutons Discord ou select menu ? | plugin-recipes | UX |
| 5 | **Fallback si Qdrant down** : keywords-only ou erreur explicite ? | tous | Résilience |

### 14.5 Points de vigilance

| Point | Risque | Mitigation proposée |
|-------|--------|---------------------|
| **Dual write** | Incohérence si un write échoue | Transaction ou saga pattern |
| **Cache invalidation** | Embedding stale après correction | Invalider sur `validation_type="corrected"` |
| **Boucle de feedback** | Erreurs s'auto-renforcent | Minimum de confiance pour `record()` : 0.7 |
| **Explosion Redis** | Trop de keywords | Max 500 keywords/domaine, prune les moins utilisés |

### 14.6 Relation avec azy_mcp (RFC-030)

**Clarification importante** : Le `HybridIntentResolver` est **en amont** de azy_mcp, pas dedans.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  chatbot-core                                                    │
│  ┌──────────────────────────────┐                               │
│  │ HybridIntentResolver         │  ← Pré-classification         │
│  │ - KeywordsMatcher            │                                │
│  │ - IntentClassifier           │                                │
│  └──────────────┬───────────────┘                               │
│                 │ domain + confidence                            │
│                 ▼                                                │
│  ┌──────────────────────────────┐                               │
│  │ azy_mcp.ConversationManager  │  ← NLU/Dialog/NLG            │
│  │ - Reçoit tools filtrés       │                                │
│  │ - Extract entities           │                                │
│  │ - Generate response          │                                │
│  └──────────────────────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**azy_mcp ne connaît pas** le HybridIntentResolver. Le plugin :

1. Appelle `resolver.resolve(message)` pour obtenir le domaine
2. Filtre les tools par domaine
3. Appelle `azy_mcp.process(message, tools=filtered_tools)`

Cela respecte la séparation des responsabilités de RFC-030.

### 14.7 Résumé des décisions

| Item | Décision finale |
|------|-----------------|
| Embedding model | `text-embedding-3-small` (OpenAI) |
| Vector search | **Qdrant** (obligatoire, MongoDB 4.4 ne supporte pas) |
| Agrégation batch | **MongoDB 4.4** (pour `$group`, `$unwind`) |
| Stockage | Dual write : Qdrant (vectors) + MongoDB (metadata) |
| Rétention | TTL 6 mois |
| Multi-guild | Global + boost same-guild |
| Cold start | Keywords-only, puis hybride après 50 messages |
| Langues | FR uniquement (POC) |
| Latence target | < 100ms P95 (cache), < 250ms (cold) |
| Latence tracking | Obligatoire dès le début |
| Domains | **Dynamiques** (Redis/PostgreSQL) |
| Feedback négatif | Enregistrer avec `validated=False` |

### 14.8 Prochaines étapes

1. ✅ RFC validée par toutes les équipes
2. 📋 Créer issues GitHub pour implémentation
3. 🏗️ Phase 1 : Infrastructure (chatbot-core)
4. 🔌 Phase 2 : Intégration (plugin-recipes)
5. 📊 Phase 3 : Monitoring et apprentissage

---

## 15. Analyse équipe chatbot-core

> Review par équipe chatbot-core — 2026-02-09

### 15.1 Validation de l'architecture

L'architecture proposée est cohérente avec le rôle de chatbot-core : fournir des **services génériques réutilisables** sans stocker de données métier. Les 3 composants (`KeywordsMatcher`, `IntentClassifier`, `HybridIntentResolver`) s'intègrent naturellement dans la librairie.

### 15.2 Remarques et préoccupations

| # | Point | Analyse |
|---|-------|---------|
| 1 | **Nouvelles dépendances** | `qdrant-client`, `openai`, `motor` seront en **optional dependencies** (`[intent]`). Les plugins qui n'utilisent pas l'intent classification n'auront pas ces dépendances. |
| 2 | **MongoDB client** | Qui fournit le client MongoDB ? Si chatbot-core l'instancie, cela crée un couplage fort. **Recommandation** : le plugin passe le client en paramètre (injection de dépendance). |
| 3 | **Fallback Qdrant** | En cas d'indisponibilité Qdrant, je recommande **keywords-only** plutôt qu'une erreur. L'UX dégradée est préférable à une erreur bloquante. Le plugin doit être notifié du mode dégradé. |
| 4 | **Configuration externalisée** | Tous les seuils (`CONFIDENCE_THRESHOLD`, `DOMINANCE_THRESHOLD`, etc.) doivent être dans `IntentConfig`, jamais hardcodés. Cela permet aux plugins de les ajuster sans modifier chatbot-core. |
| 5 | **Interface embedder** | L'`embedder` doit être une **interface abstraite**. OpenAI est l'implémentation par défaut, mais un plugin pourrait vouloir utiliser un autre provider (Anthropic, local). |
| 6 | **Dual write atomicité** | Le dual write Qdrant + MongoDB n'est pas transactionnel. Si un write échoue, on peut avoir des incohérences. **Recommandation** : write Qdrant d'abord (critique), MongoDB en best-effort avec retry async. |
| 7 | **Latence breakdown** | J'ajoute `latency_breakdown` dans `IntentResolution` pour le debugging. Chaque étape (keywords, embedding, qdrant, fusion) sera mesurée. |

### 15.3 Questions pour les autres équipes

| # | Question | Pour |
|---|----------|------|
| 1 | Le client MongoDB est-il partagé avec d'autres composants ou dédié à l'intent ? | api-backend |
| 2 | Format du cache embedding : Redis STRING avec JSON ou HASH ? | n8n-workflows |
| 3 | Qdrant est-il déjà déployé ou à provisionner ? | infra |

### 15.4 Accord sur les décisions

Je valide les décisions de la section 14.7 :

- ✅ `text-embedding-3-small` (OpenAI)
- ✅ Dual storage Qdrant + MongoDB
- ✅ TTL 6 mois
- ✅ Domains dynamiques (Redis)
- ✅ Latence < 100ms (cache) / < 250ms (cold)
- ✅ FR uniquement pour le POC

### 15.5 Prêt pour implémentation

Le module `chatbot_core/intent/` peut être implémenté. Le plan détaillé est disponible dans `docs/issues/RFC031-CHATBOT-CORE-INTENT.md`.

---

## 16. Schéma de flux complet : Question → Réponse

> Ajouté par équipe azy_mcp — 2026-02-09

### 16.1 Qui porte quoi ?

| Composant | Équipe responsable | Stockage | Description |
|-----------|-------------------|----------|-------------|
| **plugin-recipes** | plugin-recipes | - | Point d'entrée, orchestre tout le flux |
| **HybridIntentResolver** | chatbot-core | - | Pré-classification (keywords + similarité) |
| **KeywordsMatcher** | chatbot-core | Redis ZSET | Score rapide par mots-clés (< 1ms) |
| **IntentClassifier** | chatbot-core | Qdrant | Recherche sémantique (~10ms) |
| **azy_mcp** | azy_mcp | - | NLU/Dialog/NLG, génère la réponse et l'action |
| **Qdrant** | infra (chatbot-core config) | Qdrant | Stockage vecteurs + payload |
| **MongoDB** | infra (api-backend config) | MongoDB 4.4 | Stockage metadata pour agrégation batch |
| **Redis** | infra | Redis | Cache keywords + cache embedding |
| **OpenAI API** | externe | - | Génération des embeddings |
| **n8n workflows** | n8n-workflows | PostgreSQL | Jobs CRON (sync keywords, stats) |

### 16.2 Flux complet détaillé

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                          │
│  ÉTAPE 1: RÉCEPTION MESSAGE                                                             │
│  ─────────────────────────                                                              │
│                                                                                          │
│  User: "Je veux faire du canard laqué"                                                  │
│           │                                                                              │
│           ▼                                                                              │
│  ┌─────────────────────────────────────────┐                                            │
│  │ plugin-recipes (Discord bot)            │                                            │
│  │ - Reçoit le message                     │                                            │
│  │ - Extrait user_id, guild_id, session_id │                                            │
│  └─────────────────┬───────────────────────┘                                            │
│                    │                                                                     │
│                    ▼                                                                     │
│  ÉTAPE 2: PRÉ-CLASSIFICATION (chatbot-core)                                             │
│  ──────────────────────────────────────────                                             │
│                    │                                                                     │
│  ┌─────────────────┴─────────────────────────────────────────────────────────┐          │
│  │                                                                            │          │
│  │  HybridIntentResolver.resolve(message, guild_id)                          │          │
│  │                                                                            │          │
│  │  ┌─────────────────────────┐      ┌─────────────────────────────────────┐ │          │
│  │  │ Layer 1: KeywordsMatcher│      │ Layer 2: IntentClassifier          │ │          │
│  │  │ ┌─────────────────────┐ │      │ ┌─────────────────────────────────┐ │ │          │
│  │  │ │ Redis ZSET lookup   │ │      │ │ 1. Check cache embedding        │ │ │          │
│  │  │ │ < 1ms               │ │      │ │    Redis: embed:{hash(msg)}     │ │ │          │
│  │  │ │                     │ │      │ │                                 │ │ │          │
│  │  │ │ keywords:recipes:   │ │      │ │ 2. Si cache miss:               │ │ │          │
│  │  │ │   triggers → 0      │ │      │ │    → OpenAI API (~50-100ms)     │ │ │          │
│  │  │ │ keywords:courses:   │ │      │ │    → Cache dans Redis (TTL 1h)  │ │ │          │
│  │  │ │   triggers → "faire"│ │      │ │                                 │ │ │          │
│  │  │ │   = 7 points        │ │      │ │ 3. Qdrant vector search (~10ms) │ │ │          │
│  │  │ └─────────────────────┘ │      │ │    collection: intent_history   │ │ │          │
│  │  │                         │      │ │    filter: was_validated=true   │ │ │          │
│  │  │ Résultat:               │      │ │                                 │ │ │          │
│  │  │ {"recipes": 0,          │      │ │ 4. Agrège par domaine          │ │ │          │
│  │  │  "courses": 7}          │      │ │    → distribution               │ │ │          │
│  │  └─────────────────────────┘      └─────────────────────────────────────┘ │          │
│  │              │                                    │                        │          │
│  │              └──────────────┬─────────────────────┘                        │          │
│  │                             ▼                                              │          │
│  │              ┌─────────────────────────────────────┐                      │          │
│  │              │ Layer 3: Fusion & Décision          │                      │          │
│  │              │                                     │                      │          │
│  │              │ keywords_normalized + sim_normalized│                      │          │
│  │              │ × poids (0.4 / 0.6)                 │                      │          │
│  │              │                                     │                      │          │
│  │              │ Score final:                        │                      │          │
│  │              │  - recipes: 0.35                    │                      │          │
│  │              │  - courses: 0.55                    │                      │          │
│  │              │                                     │                      │          │
│  │              │ 0.55 < 0.35 × 1.3 (DOMINANCE)?      │                      │          │
│  │              │ Non, mais 0.55 - 0.35 = 0.20        │                      │          │
│  │              │ → AMBIGU (écart < 0.30)             │                      │          │
│  │              └─────────────────────────────────────┘                      │          │
│  │                                                                            │          │
│  │  Retourne: IntentResolution(                                              │          │
│  │      domain=None,                                                         │          │
│  │      confidence=0.55,                                                     │          │
│  │      needs_clarification=True,                                            │          │
│  │      clarification_options=[                                              │          │
│  │          {domain: "courses", label: "🎓 Cours vidéo"},                    │          │
│  │          {domain: "recipes", label: "📖 Recette"},                        │          │
│  │      ],                                                                   │          │
│  │      latency_breakdown={keywords: 1, embedding: 0, qdrant: 12, fusion: 1} │          │
│  │  )                                                                        │          │
│  └───────────────────────────────────────────────────────────────────────────┘          │
│                    │                                                                     │
│                    ▼                                                                     │
│  ÉTAPE 3: CLARIFICATION (si ambigu)                                                     │
│  ──────────────────────────────────                                                     │
│                    │                                                                     │
│  ┌─────────────────┴───────────────────────────────────────┐                            │
│  │ plugin-recipes                                           │                            │
│  │                                                          │                            │
│  │ if resolution.needs_clarification:                       │                            │
│  │     → Affiche boutons Discord:                           │                            │
│  │       ┌─────────────────────────────────────────┐        │                            │
│  │       │ Tu veux :                                │        │                            │
│  │       │ [🎓 Le cours vidéo sur le canard laqué] │        │                            │
│  │       │ [📖 La recette du canard laqué]         │        │                            │
│  │       └─────────────────────────────────────────┘        │                            │
│  │                                                          │                            │
│  │     → Attend clic utilisateur                            │                            │
│  │     → User clique "🎓 Le cours vidéo"                    │                            │
│  │     → domain = "courses"                                 │                            │
│  │     → validation_type = "corrected"                      │                            │
│  └──────────────────────────┬───────────────────────────────┘                            │
│                             │                                                            │
│                             ▼                                                            │
│  ÉTAPE 4: TRAITEMENT azy_mcp                                                            │
│  ───────────────────────────                                                            │
│                             │                                                            │
│  ┌──────────────────────────┴──────────────────────────────────────────────┐            │
│  │ plugin-recipes                                                           │            │
│  │                                                                          │            │
│  │ # Filtrer les tools par domaine                                         │            │
│  │ domain_tools = [t for t in all_tools if t.domain == "courses"]          │            │
│  │                                                                          │            │
│  │ # Appeler azy_mcp avec tools filtrés                                    │            │
│  │ result = await conversation_manager.process(                             │            │
│  │     message="Je veux faire du canard laqué",                            │            │
│  │     session_id="user:123:guild:456",                                    │            │
│  │     context={"guild_id": "456", "user_id": "123"},                      │            │
│  │     tools=domain_tools,  # Seulement les tools "courses"                │            │
│  │ )                                                                        │            │
│  └──────────────────────────┬───────────────────────────────────────────────┘            │
│                             │                                                            │
│                             ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐            │
│  │ azy_mcp.ConversationManager (librairie pure)                             │            │
│  │                                                                          │            │
│  │ 1. Récupère/crée la session (Redis/InMemory)                            │            │
│  │ 2. Appelle LLM avec:                                                     │            │
│  │    - Historique de conversation                                          │            │
│  │    - Tools filtrés (seulement "courses")                                │            │
│  │    - Contexte (guild_id, user_id)                                       │            │
│  │                                                                          │            │
│  │ 3. LLM retourne:                                                         │            │
│  │    - response: "Je vais te trouver un cours sur le canard laqué..."     │            │
│  │    - action: Action(tool="mcp_courses_search",                          │            │
│  │                     params={"query": "canard laqué"})                   │            │
│  │                                                                          │            │
│  │ 4. Sauvegarde session                                                    │            │
│  │                                                                          │            │
│  │ Retourne: ConversationResult(                                            │            │
│  │     response="Je vais te trouver un cours...",                          │            │
│  │     action=Action(tool="mcp_courses_search", params={...}),             │            │
│  │     session_id="user:123:guild:456"                                     │            │
│  │ )                                                                        │            │
│  └──────────────────────────┬───────────────────────────────────────────────┘            │
│                             │                                                            │
│                             ▼                                                            │
│  ÉTAPE 5: EXÉCUTION ACTION                                                              │
│  ─────────────────────────                                                              │
│                             │                                                            │
│  ┌──────────────────────────┴──────────────────────────────────────────────┐            │
│  │ plugin-recipes (ActionExecutor)                                          │            │
│  │                                                                          │            │
│  │ if result.action:                                                        │            │
│  │     tool_name = result.action.tool  # "mcp_courses_search"              │            │
│  │                                                                          │            │
│  │     if tool_name.startswith("mcp_"):                                    │            │
│  │         # → n8n workflow via webhook                                     │            │
│  │         action_result = await call_n8n_webhook(                         │            │
│  │             f"https://n8n.example.com/webhook/{tool_name}",             │            │
│  │             params=result.action.params                                 │            │
│  │         )                                                                │            │
│  │         # action_result = {"courses": [{...}, {...}], "success": true}  │            │
│  │                                                                          │            │
│  │     elif tool_name.startswith("discord_"):                              │            │
│  │         # → Discord API directe                                          │            │
│  │         action_result = await execute_discord_action(...)               │            │
│  │                                                                          │            │
│  │     # Afficher résultat à l'utilisateur                                 │            │
│  │     await send_discord_message(result.response)                         │            │
│  │     await send_discord_embed(action_result.courses)                     │            │
│  └──────────────────────────┬───────────────────────────────────────────────┘            │
│                             │                                                            │
│                             ▼                                                            │
│  ÉTAPE 6: APPRENTISSAGE (record)                                                        │
│  ───────────────────────────────                                                        │
│                             │                                                            │
│  ┌──────────────────────────┴──────────────────────────────────────────────┐            │
│  │ plugin-recipes (après exécution réussie)                                 │            │
│  │                                                                          │            │
│  │ # Enregistrer pour apprentissage (DUAL WRITE)                           │            │
│  │ if action_result.success:                                                │            │
│  │     await intent_classifier.record(                                      │            │
│  │         message="Je veux faire du canard laqué",                        │            │
│  │         domain="courses",                                                │            │
│  │         validated=True,                                                  │            │
│  │         validation_type="corrected",  # Car clarification demandée      │            │
│  │         original_prediction=None,     # Était ambigu                    │            │
│  │         tool_used="mcp_courses_search",                                 │            │
│  │         user_id="123",                                                   │            │
│  │         guild_id="456",                                                  │            │
│  │         confidence_at_prediction=0.55,                                  │            │
│  │     )                                                                    │            │
│  │ else:                                                                    │            │
│  │     # Action échouée → feedback négatif                                 │            │
│  │     await intent_classifier.record(                                      │            │
│  │         ...,                                                             │            │
│  │         validated=False,                                                 │            │
│  │         validation_type="action_failed",                                │            │
│  │     )                                                                    │            │
│  └──────────────────────────┬───────────────────────────────────────────────┘            │
│                             │                                                            │
│                             ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐            │
│  │ IntentClassifier.record() - DUAL WRITE                                   │            │
│  │                                                                          │            │
│  │ async def record(self, message, domain, ...):                           │            │
│  │     # 1. Générer embedding (ou récupérer du cache)                      │            │
│  │     vector = await self.get_or_create_embedding(message)                │            │
│  │                                                                          │            │
│  │     # 2. WRITE QDRANT (critique pour vector search)                     │            │
│  │     point = PointStruct(                                                │            │
│  │         id=str(uuid.uuid4()),                                           │            │
│  │         vector=vector,                                                   │            │
│  │         payload={                                                        │            │
│  │             "message": message,                                          │            │
│  │             "domain": domain,                                            │            │
│  │             "was_validated": validated,                                  │            │
│  │             "validation_type": validation_type,                         │            │
│  │             "tool_used": tool_used,                                     │            │
│  │             "user_id": user_id,                                         │            │
│  │             "guild_id": guild_id,                                       │            │
│  │             "created_at": datetime.utcnow().isoformat(),                │            │
│  │             ...                                                          │            │
│  │         }                                                                │            │
│  │     )                                                                    │            │
│  │     await self.qdrant.upsert("intent_history", [point])                 │            │
│  │                                                                          │            │
│  │     # 3. WRITE MONGODB (best-effort pour agrégation batch)              │            │
│  │     tokens = self._tokenize(message)                                    │            │
│  │     doc = {                                                              │            │
│  │         "message": message,                                              │            │
│  │         "tokens": tokens,  # Pour $unwind dans batch job                │            │
│  │         "domain": domain,                                                │            │
│  │         "was_validated": validated,                                      │            │
│  │         "confidence_at_prediction": confidence,                         │            │
│  │         "created_at": datetime.utcnow(),                                │            │
│  │     }                                                                    │            │
│  │     await self.mongodb.intent_history.insert_one(doc)                   │            │
│  │                                                                          │            │
│  └──────────────────────────────────────────────────────────────────────────┘            │
│                                                                                          │
│  ÉTAPE 7: BATCH JOB (CRON daily via n8n)                                                │
│  ───────────────────────────────────────                                                │
│                                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐            │
│  │ n8n: CRON - Intent Keywords Sync (daily 3:00 AM)                         │            │
│  │                                                                          │            │
│  │ # 1. Agrégation MongoDB (dernières 24h)                                 │            │
│  │ pipeline = [                                                             │            │
│  │     {"$match": {"was_validated": True, "created_at": {"$gte": yesterday}}},│          │
│  │     {"$unwind": "$tokens"},                                              │            │
│  │     {"$group": {                                                         │            │
│  │         "_id": {"domain": "$domain", "token": "$tokens"},               │            │
│  │         "count": {"$sum": 1},                                           │            │
│  │         "avg_confidence": {"$avg": "$confidence_at_prediction"},        │            │
│  │     }},                                                                  │            │
│  │     {"$match": {"count": {"$gte": 5}}},  # Minimum 5 occurrences        │            │
│  │ ]                                                                        │            │
│  │ results = await mongodb.intent_history.aggregate(pipeline)              │            │
│  │                                                                          │            │
│  │ # 2. Mise à jour Redis ZSET                                             │            │
│  │ for result in results:                                                   │            │
│  │     domain = result["_id"]["domain"]                                    │            │
│  │     token = result["_id"]["token"]                                      │            │
│  │     weight = min(10, result["count"] * result["avg_confidence"])        │            │
│  │                                                                          │            │
│  │     await redis.zadd(f"keywords:{domain}:triggers", {token: weight})    │            │
│  │                                                                          │            │
│  │ # 3. Bump version pour invalidation cache                               │            │
│  │ await redis.set("keywords:version", datetime.utcnow().isoformat())      │            │
│  │                                                                          │            │
│  └──────────────────────────────────────────────────────────────────────────┘            │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 16.3 Résumé des étapes

| # | Étape | Responsable | Stockage utilisé | Latence |
|---|-------|-------------|------------------|---------|
| 1 | Réception message | plugin-recipes | - | - |
| 2 | Pré-classification | chatbot-core (HybridIntentResolver) | Redis (keywords) + Qdrant (vectors) | ~15-120ms |
| 3 | Clarification (si ambigu) | plugin-recipes | - | Attente user |
| 4 | Traitement NLU/Dialog/NLG | azy_mcp | Redis (session) | ~200-500ms |
| 5 | Exécution action | plugin-recipes | n8n/Discord API | Variable |
| 6 | Apprentissage (dual write) | chatbot-core (IntentClassifier) | Qdrant + MongoDB | ~50ms |
| 7 | Batch update keywords | n8n (CRON) | MongoDB → Redis | - |

### 16.4 Points clés

1. **azy_mcp ne connaît pas Qdrant/MongoDB** : C'est chatbot-core qui gère le HybridIntentResolver, pas azy_mcp.

2. **Le plugin orchestre tout** : plugin-recipes appelle successivement HybridIntentResolver puis azy_mcp puis exécute l'action.

3. **Dual write** : `record()` écrit dans Qdrant (vector search temps réel) ET MongoDB (agrégation batch).

4. **Apprentissage continu** : Chaque interaction validée améliore le système via le job CRON.

5. **Clarification = feedback de haute qualité** : Quand l'utilisateur corrige une ambiguïté, c'est un signal fort pour l'apprentissage (`validation_type="corrected"`).

---

## 17. Architecture d'accès aux bases de données

> Ajouté par équipe azy_mcp — 2026-02-09
> **Question critique** : Comment chatbot-core communique-t-il avec Qdrant et MongoDB ? Qui porte la responsabilité ?

### 17.1 Problématique

Le `record()` doit écrire dans **deux bases** (Qdrant + MongoDB). Plusieurs architectures sont possibles, chacune avec ses compromis.

### 17.2 Option A : Accès direct (chatbot-core → Qdrant/MongoDB)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  plugin-recipes                                                  │
│       │                                                          │
│       ▼                                                          │
│  chatbot-core (IntentClassifier)                                │
│       │                                                          │
│       ├──────────────────┬───────────────────┐                  │
│       ▼                  ▼                   ▼                  │
│  ┌─────────┐        ┌─────────┐         ┌─────────┐            │
│  │ Qdrant  │        │ MongoDB │         │  Redis  │            │
│  │ (direct)│        │ (direct)│         │ (direct)│            │
│  └─────────┘        └─────────┘         └─────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Avantages :**

| Avantage | Description |
|----------|-------------|
| Latence minimale | Pas d'intermédiaire |
| Simplicité initiale | Moins de composants |

**Risques :**

| Risque | Gravité | Description |
|--------|---------|-------------|
| **Credentials dispersés** | 🔴 Haute | Chaque plugin a les credentials Qdrant/MongoDB |
| **Connection pool explosion** | 🟡 Moyenne | N plugins × M instances = beaucoup de connexions |
| **Pas d'audit centralisé** | 🟡 Moyenne | Difficile de tracer qui écrit quoi |
| **Couplage fort** | 🔴 Haute | Changement de schéma Qdrant = redéployer tous les plugins |
| **Incohérence dual write** | 🔴 Haute | Si un write échoue, pas de rollback automatique |

---

### 17.3 Option B : Via API Gateway (api-backend)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  plugin-recipes                                                  │
│       │                                                          │
│       ▼                                                          │
│  chatbot-core (IntentClassifier)                                │
│       │                                                          │
│       │  HTTP POST /intent/record                               │
│       │  HTTP POST /intent/classify                             │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ api-backend (Intent Service)                                 ││
│  │                                                              ││
│  │  - Valide les requêtes                                       ││
│  │  - Gère le dual write (transaction-like)                    ││
│  │  - Rate limiting par guild                                  ││
│  │  - Audit logging                                            ││
│  │  - Credentials centralisés                                  ││
│  └──────────────────────┬──────────────────────────────────────┘│
│                         │                                        │
│       ┌─────────────────┼─────────────────┐                     │
│       ▼                 ▼                 ▼                     │
│  ┌─────────┐       ┌─────────┐       ┌─────────┐               │
│  │ Qdrant  │       │ MongoDB │       │  Redis  │               │
│  └─────────┘       └─────────┘       └─────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Avantages :**

| Avantage | Description |
|----------|-------------|
| **Credentials centralisés** | Seul api-backend a accès aux DB |
| **Dual write fiable** | api-backend gère la saga pattern |
| **Audit trail** | Toutes les opérations loggées |
| **Rate limiting** | Protection contre les abus |
| **Évolution indépendante** | Schéma Qdrant change → seul api-backend à modifier |

**Risques :**

| Risque | Gravité | Description |
|--------|---------|-------------|
| **Latence +10-20ms** | 🟡 Moyenne | HTTP call au lieu de direct |
| **SPOF** | 🟡 Moyenne | Si api-backend down, intent classification down |
| **Charge api-backend** | 🟡 Moyenne | Toutes les requêtes intent passent par lui |

**Interface API proposée :**

```python
# Endpoints à créer dans api-backend

# Classification (temps réel)
POST /api/v1/intent/classify
{
    "message": "Je veux faire du canard laqué",
    "guild_id": "456",
    "user_id": "123"
}
# Response: IntentResolution

# Enregistrement (après action)
POST /api/v1/intent/record
{
    "message": "Je veux faire du canard laqué",
    "domain": "courses",
    "validated": true,
    "validation_type": "corrected",
    "tool_used": "mcp_courses_search",
    "guild_id": "456",
    "user_id": "123"
}
# Response: 201 Created
```

---

### 17.4 Option C : Hybride (Qdrant direct, MongoDB via n8n) — RECOMMANDÉE

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  TEMPS RÉEL (chaque message)                                    │
│  ───────────────────────────                                    │
│                                                                  │
│  chatbot-core (IntentClassifier)                                │
│       │                                                          │
│       ├───────────────────┐                                     │
│       ▼                   ▼                                     │
│  ┌─────────┐         ┌─────────┐                               │
│  │ Qdrant  │         │  Redis  │   ← Direct (performance)      │
│  │ (direct)│         │ (direct)│                               │
│  └─────────┘         └─────────┘                               │
│                           │                                      │
│                           │ XADD intent:events                   │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Redis Stream: intent:events                                  ││
│  │                                                              ││
│  │ {                                                            ││
│  │   "message": "Je veux faire du canard laqué",               ││
│  │   "domain": "courses",                                       ││
│  │   "validated": true,                                         ││
│  │   "validation_type": "corrected",                           ││
│  │   "tokens": ["veux", "faire", "canard", "laque"],           ││
│  │   "timestamp": "2026-02-09T15:30:00Z",                      ││
│  │   ...                                                        ││
│  │ }                                                            ││
│  └──────────────────────┬──────────────────────────────────────┘│
│                         │                                        │
│  ASYNC (n8n consumer)   │                                        │
│  ────────────────────   ▼                                        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ n8n: Stream Consumer - Intent Events                        ││
│  │                                                              ││
│  │ Trigger: Redis Stream (XREAD BLOCK)                         ││
│  │                                                              ││
│  │ 1. Consomme les events du stream                            ││
│  │ 2. INSERT MongoDB intent_history                            ││
│  │ 3. XACK pour confirmer traitement                           ││
│  │ 4. Si échec → retry automatique (3 tentatives)             ││
│  │ 5. Si trop d'échecs → Dead Letter Queue                    ││
│  │                                                              ││
│  └──────────────────────┬──────────────────────────────────────┘│
│                         ▼                                        │
│                    ┌─────────┐                                  │
│                    │ MongoDB │                                  │
│                    └─────────┘                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Avantages :**

| Avantage | Description |
|----------|-------------|
| **Temps réel préservé** | Qdrant + Redis en direct, latence minimale |
| **MongoDB non bloquant** | Write async, pas d'impact sur UX |
| **Retry automatique** | n8n gère les échecs MongoDB |
| **Découplage propre** | chatbot-core ne connaît pas MongoDB |
| **Scalabilité** | Consumer groups si charge élevée |
| **Auditabilité** | Stream = log persistant des events |

**Risques :**

| Risque | Gravité | Description | Mitigation |
|--------|---------|-------------|------------|
| **Eventual consistency** | 🟡 Moyenne | MongoDB peut avoir 1-5s de retard | Acceptable pour batch job |
| **Stream overflow** | 🟡 Moyenne | Si n8n down, stream grandit | MAXLEN ~100k, alerting |
| **Complexité ops** | 🟡 Moyenne | Redis Stream à monitorer | Dashboard n8n + alertes |

**Flux détaillé :**

```python
# chatbot-core/intent/classifier.py

class IntentClassifier:
    async def record(self, message: str, domain: str, **metadata) -> None:
        """Enregistre pour apprentissage (Qdrant + Redis Stream)."""

        # 1. Générer/récupérer embedding
        vector = await self.get_or_create_embedding(message)

        # 2. WRITE QDRANT (synchrone, critique pour vector search)
        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "message": message,
                "domain": domain,
                "was_validated": metadata.get("validated", True),
                "validation_type": metadata.get("validation_type", "implicit"),
                "created_at": datetime.utcnow().isoformat(),
                **metadata,
            }
        )
        await self.qdrant.upsert("intent_history", [point])

        # 3. PUBLISH TO REDIS STREAM (async, pour MongoDB via n8n)
        tokens = self._tokenize(message)
        event = {
            "message": message,
            "tokens": json.dumps(tokens),
            "domain": domain,
            "was_validated": str(metadata.get("validated", True)),
            "validation_type": metadata.get("validation_type", "implicit"),
            "confidence_at_prediction": str(metadata.get("confidence", 0)),
            "user_id": metadata.get("user_id", ""),
            "guild_id": metadata.get("guild_id", ""),
            "tool_used": metadata.get("tool_used", ""),
            "timestamp": datetime.utcnow().isoformat(),
        }

        await self.redis.xadd(
            "intent:events",
            event,
            maxlen=100000,  # Limite pour éviter overflow
        )
```

**Workflow n8n : Stream Consumer**

```
┌─────────────────────────────────────────────────────────────────┐
│ n8n Workflow: Intent Events Consumer                            │
│                                                                  │
│ ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│ │ Redis       │    │ Transform   │    │ MongoDB             │  │
│ │ Stream      │───▶│ JSON parse  │───▶│ Insert              │  │
│ │ Trigger     │    │ tokens      │    │ intent_history      │  │
│ └─────────────┘    └─────────────┘    └──────────┬──────────┘  │
│                                                   │             │
│                         ┌─────────────────────────┘             │
│                         ▼                                       │
│                    ┌─────────────┐                             │
│                    │ Redis XACK  │                             │
│                    │ (confirm)   │                             │
│                    └─────────────┘                             │
│                                                                  │
│ On Error:                                                       │
│ ┌─────────────┐    ┌─────────────┐                             │
│ │ Retry (3x)  │───▶│ DLQ Stream  │                             │
│ │ with delay  │    │ intent:dlq  │                             │
│ └─────────────┘    └─────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 17.5 Comparatif des options

| Critère | Option A (Direct) | Option B (API) | Option C (Hybride) |
|---------|-------------------|----------------|-------------------|
| **Latence temps réel** | ✅ ~15ms | ⚠️ ~25ms | ✅ ~15ms |
| **Fiabilité dual write** | ❌ Risque incohérence | ✅ Saga pattern | ✅ Eventual consistency |
| **Credentials** | ❌ Dispersés | ✅ Centralisés | ⚠️ Qdrant dispersé |
| **Audit trail** | ❌ Non | ✅ Oui | ✅ Via Redis Stream |
| **Complexité ops** | ✅ Simple | ⚠️ Moyenne | ⚠️ Moyenne |
| **Scalabilité** | ⚠️ Connection pools | ⚠️ Charge API | ✅ Consumer groups |
| **Impact si MongoDB down** | ❌ Bloquant | ❌ Bloquant | ✅ Non bloquant |

---

### 17.6 Décision et questions pour les équipes

**Recommandation équipe azy_mcp : Option C (Hybride)**

Raisons :
1. Latence temps réel préservée (Qdrant direct)
2. MongoDB non bloquant (via Redis Stream + n8n)
3. Retry automatique et Dead Letter Queue
4. Scalable avec consumer groups

**Questions pour les équipes :**

| # | Question | Pour | Impact |
|---|----------|------|--------|
| 1 | **Credentials Qdrant** : chatbot-core a-t-il déjà accès à Qdrant pour d'autres features ? | chatbot-core | Architecture |
| 2 | **Redis Stream** : n8n peut-il consommer un Redis Stream en temps réel (XREAD BLOCK) ? | n8n-workflows | Faisabilité |
| 3 | **Consumer group** : Faut-il prévoir plusieurs consumers pour la charge ? | n8n-workflows | Scalabilité |
| 4 | **DLQ monitoring** : Qui surveille la Dead Letter Queue `intent:dlq` ? | n8n-workflows | Ops |
| 5 | **Eventual consistency** : Délai de 1-5s acceptable pour MongoDB ? | api-backend | Data |
| 6 | **MAXLEN stream** : 100k events suffisant ? (≈ 2-3 jours à charge normale) | infra | Ops |

---

### 17.7 Schéma mis à jour avec Option C

Le flux complet de la section 16.2 est mis à jour comme suit pour l'étape 6 :

```
  ÉTAPE 6: APPRENTISSAGE (Option C - Hybride)
  ───────────────────────────────────────────
                           │
  ┌────────────────────────┴────────────────────────────────────┐
  │ chatbot-core (IntentClassifier.record())                    │
  │                                                             │
  │ # 1. WRITE QDRANT (synchrone)                              │
  │ await qdrant.upsert("intent_history", [point])             │
  │                                                             │
  │ # 2. PUBLISH REDIS STREAM (async, non bloquant)            │
  │ await redis.xadd("intent:events", event, maxlen=100000)    │
  │                                                             │
  └────────────────────────┬────────────────────────────────────┘
                           │
                           ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Redis Stream: intent:events                                 │
  │ (buffer entre chatbot-core et MongoDB)                      │
  └────────────────────────┬────────────────────────────────────┘
                           │
                           ▼ (consommé par n8n, ~1-5s delay)
  ┌─────────────────────────────────────────────────────────────┐
  │ n8n: Intent Events Consumer                                 │
  │                                                             │
  │ - XREAD BLOCK intent:events                                 │
  │ - INSERT MongoDB intent_history                            │
  │ - XACK intent:events                                        │
  │ - On error → retry 3x → DLQ                                │
  └────────────────────────┬────────────────────────────────────┘
                           │
                           ▼
                      ┌─────────┐
                      │ MongoDB │
                      └─────────┘
```
