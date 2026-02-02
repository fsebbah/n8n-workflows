Problème rencontré
25|torah-b | 2026-02-02 10:30:43: [PageTranslation] POST http://pi6.local:5678/webhook/torah-translate-page
25|torah-b | 2026-02-02 10:30:43: [PageTranslation] Payload: traite=Sukkah, page=54b, mode=premium
25|torah-b | 2026-02-02 10:30:44: [PageTranslation] Started: job_id=b3d4c646-d366-4384-b538-bf5d99cbe8ba
25|torah-b | 2026-02-02 10:30:44: [PageTranslation] Starting polling for job b3d4c646-d366-4384-b538-bf5d99cbe8ba
25|torah-b | 2026-02-02 10:30:46: [PageTranslation] Job b3d4c646-d366-4384-b538-bf5d99cbe8ba not found
25|torah-b | 2026-02-02 10:30:47: [PageTranslation] Job b3d4c646-d366-4384-b538-bf5d99cbe8ba finished: failed

Réponse torah Plugin

  Le problème : Le workflow n8n torah-translate-page crée le job dans son propre système, mais n'enregistre pas le job dans
  MongoDB (l'API /api/v2/jobs).

  Donc quand le polling interroge l'API, le job n'existe pas.

  Solutions possibles
  ┌────────┬────────────────────────────────────────────────────────────────────────────────────────────┬────────┐
  │ Option │                                        Description                                         │  Côté  │
  ├────────┼────────────────────────────────────────────────────────────────────────────────────────────┼────────┤
  │ A      │ Modifier le workflow n8n pour enregistrer le job dans MongoDB via POST /api/v2/jobs        │ n8n    │
  ├────────┼────────────────────────────────────────────────────────────────────────────────────────────┼────────┤
  │ B      │ Utiliser le fallback n8n webhook pour le polling (ne pas utiliser api_url pour ce service) │ Plugin │
  ├────────┼────────────────────────────────────────────────────────────────────────────────────────────┼────────┤
  │ C      │ Créer le job côté plugin via l'API avant d'appeler n8n                                     │ Plugin │
  └────────┴────────────────────────────────────────────────────────────────────────────────────────────┴────────┘
  Question clé

  Est-ce que API_URL est défini dans ton environnement ?

  Si oui, le polling passe par l'API MongoDB. Si le workflow n8n n'y enregistre pas le job, ça explique le "not found".

Veux-tu que je vérifie si le workflow n8n enregistre bien le job dans l'API, ou qu'on force le fallback sur le webhook n8n pour
  le po le polling ?

Réponse équipe api:

 Réponse équipe API :

  L'option A est la bonne approche - le workflow n8n doit enregistrer le job via POST /api/v2/jobs.

  Pourquoi ?
  - L'API /api/v2/jobs est le source of truth pour tous les jobs (RFC-016/017)
  - Permet le tracking unifié (progress, credits, status)
  - Le polling fonctionne naturellement

  Workflow n8n attendu :

  1. Recevoir la demande de traduction
  2. POST /api/v2/jobs → créer le job dans MongoDB (récupérer job_id)
  3. Traiter la traduction
  4. PATCH /api/v2/jobs/{job_id} → mettre à jour progress/status
  5. PATCH /api/v2/jobs/{job_id} → marquer completed avec output

  Ce qu'il faut ajouter au workflow n8n torah-translate-page :

  // Étape 1: Créer le job
  POST http://pi6.local:3031/api/v2/jobs
  Headers: X-Project-ID: torah
  Body: {
    "job_type": "torah_page",
    "input": { "traite": "...", "page": "...", ... },
    "context": { "user_id": "...", "guild_id": "..." }
  }
  → Récupérer job_id de la réponse

  // Étape finale: Marquer completed
  PATCH http://pi6.local:3031/api/v2/jobs/{job_id}
  Body: { "status": "completed", "output": {...} }
