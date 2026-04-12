# Plan d'Implémentation - Microservice NotebookLM

> Full Stack : FastAPI + Playwright + noVNC + Nginx

**Version** : 1.0
**Date** : 2026-04-07
**Statut** : Planification
**RFC associée** : RFC-055

---

## Vue d'ensemble

### Architecture cible

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INFRASTRUCTURE                                  │
│                                                                              │
│   Internet                                                                   │
│       │                                                                      │
│       ▼                                                                      │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │  Nginx (:443)                                                      │     │
│   │  notebooklm-api.domain.com                                        │     │
│   │                                                                    │     │
│   │  /api/*          → FastAPI :8100                                  │     │
│   │  /auth/vnc/*     → noVNC :6080                                    │     │
│   │  /health         → Health check                                    │     │
│   └────────────────────────────┬──────────────────────────────────────┘     │
│                                │                                             │
│   ┌────────────────────────────┴──────────────────────────────────────┐     │
│   │                     Docker Compose                                 │     │
│   │                                                                    │     │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │     │
│   │  │  fastapi    │  │   novnc     │  │   chrome-playwright     │   │     │
│   │  │  :8100      │  │   :6080     │  │   Xvfb + x11vnc         │   │     │
│   │  │             │  │             │  │   + Chrome + Playwright │   │     │
│   │  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘   │     │
│   │         │                │                      │                 │     │
│   │         └────────────────┴──────────────────────┘                 │     │
│   │                          │                                         │     │
│   │                   Shared Volume                                    │     │
│   │                   (cookies, sessions)                              │     │
│   │                                                                    │     │
│   │  ┌─────────────┐                                                  │     │
│   │  │   redis     │  Cache sessions, rate limiting                   │     │
│   │  │   :6379     │                                                  │     │
│   │  └─────────────┘                                                  │     │
│   └────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Équipes impliquées

| Équipe | Responsabilité |
|--------|----------------|
| **Backend** | Microservice FastAPI, logique métier |
| **DevOps** | Docker, Nginx, déploiement, monitoring |
| **MCP** | Intégration n8n, webhooks |
| **Frontend** | Interface utilisateur (si applicable) |
| **Sécurité** | Audit, gestion des credentials |

---

## Planning Global

| Phase | Description | Durée estimée |
|-------|-------------|---------------|
| Phase 1 | Microservice FastAPI (core) | 3-4 jours |
| Phase 2 | Container Chrome + Playwright | 2-3 jours |
| Phase 3 | noVNC pour auth interactive | 1-2 jours |
| Phase 4 | Nginx + SSL | 1 jour |
| Phase 5 | Intégration n8n | 1 jour |
| Phase 6 | Tests & Documentation | 2 jours |
| **Total** | | **10-13 jours** |

---

## Phase 1 : Microservice FastAPI

**Équipe** : Backend
**Durée** : 3-4 jours
**Prérequis** : Aucun

### Étape 1.1 : Structure du projet

**Durée** : 0.5 jour

```
notebooklm-api/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app
│   ├── config.py               # Settings (pydantic)
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── router.py           # Routes /auth/*
│   │   ├── service.py          # Logique auth
│   │   └── schemas.py          # Pydantic models
│   ├── notebooks/
│   │   ├── __init__.py
│   │   ├── router.py           # Routes /notebooks/*
│   │   ├── service.py          # Logique notebooks
│   │   └── schemas.py
│   ├── query/
│   │   ├── __init__.py
│   │   ├── router.py           # Routes /query/*
│   │   └── service.py
│   ├── studio/
│   │   ├── __init__.py
│   │   ├── router.py           # Routes /studio/*
│   │   └── service.py
│   └── utils/
│       ├── __init__.py
│       ├── batchexecute.py     # Parser réponses Google
│       ├── cookies.py          # Gestion cookies
│       └── exceptions.py       # Custom exceptions
├── tests/
│   ├── __init__.py
│   ├── test_auth.py
│   ├── test_notebooks.py
│   └── conftest.py
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── README.md
```

**Livrables** :
- [ ] Structure projet créée
- [ ] `requirements.txt` avec dépendances
- [ ] `config.py` avec variables d'environnement

---

### Étape 1.2 : Endpoints REST de base

**Durée** : 1 jour

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Health check |
| `/auth/status` | GET | Vérifie si cookies valides |
| `/auth/setup` | POST | Déclenche auth Playwright |
| `/auth/cookies` | POST | Reçoit cookies manuels |
| `/notebooks` | GET | Liste notebooks |
| `/notebooks` | POST | Crée notebook |
| `/notebooks/{id}` | GET | Détails notebook |
| `/notebooks/{id}` | DELETE | Supprime notebook |
| `/notebooks/{id}/query` | POST | Pose question |
| `/notebooks/{id}/sources` | POST | Ajoute source |
| `/studio/audio` | POST | Génère audio overview |
| `/studio/slides` | POST | Génère slides (non dispo API) |

**Livrables** :
- [ ] `main.py` avec FastAPI app
- [ ] Routers pour chaque domaine
- [ ] Schemas Pydantic (request/response)

---

### Étape 1.3 : Logique batchexecute

**Durée** : 1.5 jours

Parser et encoder les requêtes/réponses de l'API interne Google.

```python
# app/utils/batchexecute.py

RPC_IDS = {
    "list_notebooks": "o8Hthc",
    "create_notebook": "CCqFvf",
    "add_source": "izAoDd",
    "query": "rCu4Hb",
    "generate_audio": "R7cb6c",
}

def encode_request(rpc_id: str, params: list) -> str:
    """Encode une requête batchexecute"""
    ...

def decode_response(raw: str) -> dict:
    """Parse la réponse )]}' + JSON"""
    ...
```

**Livrables** :
- [ ] `batchexecute.py` - encoder/decoder
- [ ] Tests unitaires parsing
- [ ] Mapping des RPC IDs documenté

---

### Étape 1.4 : Gestion des cookies

**Durée** : 0.5 jour

```python
# app/utils/cookies.py

class CookieManager:
    def __init__(self, redis_client=None, file_path=None):
        ...

    def store(self, user_id: str, cookies: dict) -> None:
        """Stocke cookies (Redis ou fichier)"""
        ...

    def get(self, user_id: str) -> Optional[dict]:
        """Récupère cookies"""
        ...

    def is_valid(self, user_id: str) -> bool:
        """Vérifie expiration"""
        ...

    def format_header(self, cookies: dict) -> str:
        """Formate pour header HTTP"""
        ...
```

**Livrables** :
- [ ] `cookies.py` - CookieManager
- [ ] Support Redis ou fichier local
- [ ] Expiration automatique

---

## Phase 2 : Container Chrome + Playwright

**Équipe** : DevOps + Backend
**Durée** : 2-3 jours
**Prérequis** : Phase 1.1 terminée

### Étape 2.1 : Dockerfile Playwright

**Durée** : 1 jour
**Équipe** : DevOps

```dockerfile
# Dockerfile.playwright
FROM python:3.11-slim

# Install dependencies for Chrome
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    fluxbox \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright
RUN pip install playwright
RUN playwright install chromium
RUN playwright install-deps

# App
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app/ ./app/

# Xvfb display
ENV DISPLAY=:99

# Start script
COPY start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
```

```bash
# start.sh
#!/bin/bash
Xvfb :99 -screen 0 1280x720x24 &
x11vnc -display :99 -forever -shared -rfbport 5900 &
uvicorn app.main:app --host 0.0.0.0 --port 8100
```

**Livrables** :
- [ ] `Dockerfile.playwright`
- [ ] `start.sh` script de démarrage
- [ ] Image buildée et testée

---

### Étape 2.2 : Service Playwright

**Durée** : 1.5 jours
**Équipe** : Backend

```python
# app/auth/playwright_service.py

from playwright.async_api import async_playwright

class PlaywrightAuthService:
    def __init__(self):
        self.browser = None
        self.context = None

    async def start_browser(self, headless: bool = False):
        """Lance Chrome (visible pour auth)"""
        ...

    async def open_login_page(self):
        """Ouvre notebooklm.google.com"""
        ...

    async def wait_for_login(self, timeout: int = 300):
        """Attend que l'utilisateur se connecte"""
        ...

    async def extract_cookies(self) -> dict:
        """Extrait les cookies de session"""
        ...

    async def close(self):
        """Ferme le navigateur"""
        ...
```

**Livrables** :
- [ ] `playwright_service.py`
- [ ] Détection login réussi
- [ ] Extraction cookies automatique
- [ ] Gestion timeout

---

### Étape 2.3 : Tests container

**Durée** : 0.5 jour
**Équipe** : DevOps + Backend

**Livrables** :
- [ ] Container démarre sans erreur
- [ ] Xvfb fonctionne
- [ ] VNC accessible sur :5900
- [ ] Playwright peut lancer Chrome

---

## Phase 3 : noVNC pour auth interactive

**Équipe** : DevOps
**Durée** : 1-2 jours
**Prérequis** : Phase 2 terminée

### Étape 3.1 : Container noVNC

**Durée** : 0.5 jour

```yaml
# docker-compose.yml (extrait)
services:
  novnc:
    image: theasp/novnc:latest
    environment:
      - DISPLAY_WIDTH=1280
      - DISPLAY_HEIGHT=720
    ports:
      - "6080:8080"
    depends_on:
      - playwright
    networks:
      - notebooklm-net
```

Ou intégré dans le même container que Playwright.

**Livrables** :
- [ ] noVNC accessible sur :6080
- [ ] Affiche le desktop Xvfb

---

### Étape 3.2 : Workflow auth utilisateur

**Durée** : 1 jour
**Équipe** : Backend + DevOps

```
1. User appelle POST /auth/setup
2. API retourne { "vnc_url": "https://xxx/auth/vnc/", "session_id": "abc123" }
3. User ouvre vnc_url dans son navigateur
4. User voit Chrome avec page login Google
5. User se connecte (email, password, 2FA)
6. API détecte login réussi (polling ou websocket)
7. API extrait cookies, stocke, ferme browser
8. User reçoit notification "Auth réussie"
9. API prête pour les appels
```

**Livrables** :
- [ ] Endpoint `/auth/setup` retourne URL VNC
- [ ] Mécanisme de détection login réussi
- [ ] Cleanup automatique après auth

---

### Étape 3.3 : Sécurisation VNC

**Durée** : 0.5 jour
**Équipe** : DevOps + Sécurité

| Mesure | Description |
|--------|-------------|
| Token unique | URL VNC avec token one-time |
| Timeout | Session VNC expire après 5 min |
| IP restriction | Optionnel : limiter aux IPs connues |
| HTTPS | VNC via WebSocket sécurisé |

**Livrables** :
- [ ] Token dans URL VNC
- [ ] Expiration session
- [ ] Logs accès VNC

---

## Phase 4 : Nginx + SSL

**Équipe** : DevOps
**Durée** : 1 jour
**Prérequis** : Phases 1-3 terminées

### Étape 4.1 : Configuration Nginx

**Durée** : 0.5 jour

```nginx
# nginx/notebooklm-api.conf

upstream fastapi {
    server fastapi:8100;
}

upstream novnc {
    server novnc:6080;
}

server {
    listen 443 ssl http2;
    server_name notebooklm-api.domain.com;

    ssl_certificate /etc/ssl/certs/notebooklm.crt;
    ssl_certificate_key /etc/ssl/private/notebooklm.key;

    # API REST
    location /api/ {
        proxy_pass http://fastapi/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # VNC WebSocket
    location /auth/vnc/ {
        proxy_pass http://novnc/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Health check
    location /health {
        proxy_pass http://fastapi/health;
    }
}
```

**Livrables** :
- [ ] Config Nginx
- [ ] Certificat SSL (Let's Encrypt ou auto-signé)
- [ ] Routing API + VNC fonctionnel

---

### Étape 4.2 : Docker Compose complet

**Durée** : 0.5 jour

```yaml
# docker-compose.yml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx:/etc/nginx/conf.d
      - ./ssl:/etc/ssl
    depends_on:
      - fastapi
      - novnc
    networks:
      - notebooklm-net

  fastapi:
    build:
      context: .
      dockerfile: Dockerfile.fastapi
    environment:
      - REDIS_URL=redis://redis:6379
      - COOKIE_STORAGE=redis
    volumes:
      - cookies-data:/app/data
    networks:
      - notebooklm-net

  playwright:
    build:
      context: .
      dockerfile: Dockerfile.playwright
    environment:
      - DISPLAY=:99
    volumes:
      - cookies-data:/app/data
    networks:
      - notebooklm-net

  novnc:
    image: theasp/novnc:latest
    environment:
      - DISPLAY_WIDTH=1280
      - DISPLAY_HEIGHT=720
      - RUN_XTERM=no
    depends_on:
      - playwright
    networks:
      - notebooklm-net

  redis:
    image: redis:alpine
    volumes:
      - redis-data:/data
    networks:
      - notebooklm-net

networks:
  notebooklm-net:
    driver: bridge

volumes:
  cookies-data:
  redis-data:
```

**Livrables** :
- [ ] `docker-compose.yml` complet
- [ ] Tous les services démarrent
- [ ] Communication inter-services OK

---

## Phase 5 : Intégration n8n

**Équipe** : MCP
**Durée** : 1 jour
**Prérequis** : Phase 4 terminée

### Étape 5.1 : Mise à jour workflow n8n

**Durée** : 0.5 jour

Modifier `MCP_-_NotebookLM.json` pour appeler le microservice au lieu de batchexecute directement.

```
Avant : Webhook → batchexecute (direct)
Après : Webhook → Microservice FastAPI → batchexecute
```

**Livrables** :
- [ ] Workflow mis à jour
- [ ] Appels vers `https://notebooklm-api.domain.com/api/`
- [ ] Gestion erreurs microservice

---

### Étape 5.2 : Endpoints pour n8n

**Durée** : 0.5 jour

| Opération n8n | Endpoint microservice |
|---------------|----------------------|
| `list_notebooks` | GET `/api/notebooks` |
| `create_notebook` | POST `/api/notebooks` |
| `query` | POST `/api/notebooks/{id}/query` |
| `add_source` | POST `/api/notebooks/{id}/sources` |
| `auth_status` | GET `/api/auth/status` |

**Livrables** :
- [ ] Mapping opérations documenté
- [ ] Tests depuis n8n

---

## Phase 6 : Tests & Documentation

**Équipe** : Tous
**Durée** : 2 jours
**Prérequis** : Phases 1-5 terminées

### Étape 6.1 : Tests end-to-end

**Durée** : 1 jour
**Équipe** : Backend + MCP

| Test | Description |
|------|-------------|
| Auth flow | Setup → VNC → Login → Cookies stockés |
| List notebooks | Récupère liste depuis API |
| Create notebook | Crée et vérifie |
| Query | Pose question, reçoit réponse |
| Error handling | Cookies expirés, timeout, etc. |

**Livrables** :
- [ ] Suite de tests e2e
- [ ] Tous tests passent
- [ ] CI/CD configuré (optionnel)

---

### Étape 6.2 : Documentation finale

**Durée** : 1 jour
**Équipe** : Tous

| Document | Contenu |
|----------|---------|
| README.md | Installation, démarrage rapide |
| API.md | Endpoints, schemas, exemples |
| DEPLOYMENT.md | Guide déploiement production |
| TROUBLESHOOTING.md | Problèmes courants |

**Livrables** :
- [ ] Documentation complète
- [ ] Exemples curl/Postman
- [ ] Diagrammes architecture

---

## Récapitulatif des livrables par équipe

### Backend (5-6 jours)

- [ ] Structure projet FastAPI
- [ ] Endpoints REST
- [ ] Parser batchexecute
- [ ] Gestion cookies
- [ ] Service Playwright
- [ ] Tests unitaires

### DevOps (4-5 jours)

- [ ] Dockerfile Playwright
- [ ] Dockerfile FastAPI
- [ ] Container noVNC
- [ ] docker-compose.yml
- [ ] Configuration Nginx
- [ ] Certificats SSL
- [ ] Monitoring (optionnel)

### MCP (1-2 jours)

- [ ] Workflow n8n mis à jour
- [ ] Tests intégration n8n
- [ ] Documentation appels

### Sécurité (0.5-1 jour)

- [ ] Audit tokens VNC
- [ ] Review gestion cookies
- [ ] Recommandations

---

## Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| API Google change | Élevé | Monitoring, alertes, code modulaire |
| Cookies expirent souvent | Moyen | Notification user, re-auth facile |
| noVNC complexe | Moyen | Fallback cookies manuels |
| Performance Playwright | Faible | Pool de browsers, timeout |

---

## ⚠️ Problème architectural : Multi-utilisateurs

### Le problème

L'architecture proposée a un **bug structurel** pour le multi-utilisateurs :

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PROBLÈME 1 : Display unique                                             │
│                                                                          │
│  Un seul Xvfb :99 = UN SEUL écran partagé                               │
│                                                                          │
│  User A fait auth ──┐                                                   │
│                     ├──▶ MÊME Chrome, MÊME écran                        │
│  User B fait auth ──┘                                                   │
│                                                                          │
│  ❌ User A voit les credentials de User B                               │
│  ❌ Problème de SÉCURITÉ, pas juste fonctionnel                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  PROBLÈME 2 : noVNC câblé sur un seul endpoint                          │
│                                                                          │
│  theasp/novnc se connecte à UN seul serveur VNC                         │
│  Pas de routing par session/token                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Solutions possibles

#### Solution A : File d'attente (v1 simple)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UN SEUL AUTH À LA FOIS                                                  │
│                                                                          │
│  User A demande auth ──▶ ✅ Accès VNC, fait son login                   │
│  User B demande auth ──▶ ⏳ "Auth en cours, réessayez dans 2 min"       │
│  User C demande auth ──▶ ⏳ File d'attente                              │
│                                                                          │
│  Implémentation : Sémaphore/Mutex + timeout                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Avantages** :
- Simple à implémenter
- Pas de changement d'architecture
- Suffisant si peu d'utilisateurs

**Inconvénients** :
- Bloquant si beaucoup d'auths simultanées
- UX dégradée (attente)

**Ajout code** :
```python
# app/auth/service.py
import asyncio

auth_lock = asyncio.Lock()
AUTH_TIMEOUT = 300  # 5 min max par auth

async def setup_auth(user_id: str):
    if auth_lock.locked():
        raise HTTPException(
            status_code=503,
            detail="Auth en cours pour un autre utilisateur. Réessayez dans quelques minutes."
        )

    async with auth_lock:
        # Lance Playwright, attend login, extrait cookies
        ...
```

---

#### Solution B : Orchestration dynamique (v2 complexe)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UN CONTAINER PAR SESSION D'AUTH                                         │
│                                                                          │
│  User A demande auth ──▶ Spawn container-A (Xvfb:100 + VNC:5901)       │
│  User B demande auth ──▶ Spawn container-B (Xvfb:101 + VNC:5902)       │
│  User C demande auth ──▶ Spawn container-C (Xvfb:102 + VNC:5903)       │
│                                                                          │
│  Proxy VNC route par token :                                             │
│  /vnc/token-A ──▶ container-A:5901                                      │
│  /vnc/token-B ──▶ container-B:5902                                      │
│                                                                          │
│  Après auth réussie ──▶ Container détruit                               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Avantages** :
- Multi-utilisateurs réel
- Isolation complète

**Inconvénients** :
- Mini-scheduler de containers à développer
- Complexité significative (Docker API, cleanup, timeouts)
- Overhead ressources

**Stack additionnelle** :
- Docker SDK Python
- Proxy VNC dynamique (websockify custom ou Traefik)
- Gestion lifecycle containers

**Estimation** : +3-5 jours de dev

---

### Recommandation

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ANALYSE COÛT/BÉNÉFICE                                                   │
│                                                                          │
│  L'auth sert UNIQUEMENT :                                                │
│  - Au premier setup (1 fois)                                             │
│  - Au refresh cookies (1 fois / 1-2 semaines)                           │
│                                                                          │
│  = Quelques minutes, occasionnellement                                   │
│                                                                          │
│  Le reste du temps : appels HTTP simples avec cookies stockés           │
│                                                                          │
│  ➜ Beaucoup d'infra pour un one-shot                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

| Version | Complexité | Multi-user | Recommandation |
|---------|------------|------------|----------------|
| **v0** | Faible | Non | Cookies manuels (prototype actuel) |
| **v1** | Moyenne | Séquentiel | File d'attente + mutex |
| **v2** | Élevée | Oui | Orchestration dynamique |

**Recommandation** :

1. **Démarrer avec v0** (cookies manuels) pour valider le besoin
2. **Passer à v1** si l'UX cookies manuels est bloquante
3. **v2 uniquement** si volume d'utilisateurs le justifie

La v1 avec file d'attente est un bon compromis : elle automatise l'auth tout en documentant la limitation "un seul auth à la fois".

---

## Décision Go/No-Go

Avant de lancer, valider :

- [ ] L'équipe est disponible pour 10-13 jours de travail
- [ ] L'infrastructure supporte Docker + Chrome
- [ ] Le ROI justifie la complexité vs cookies manuels
- [ ] Accord sécurité sur le stockage des cookies Google

---

## Contacts

| Rôle | Équipe |
|------|--------|
| Tech Lead Backend | À définir |
| DevOps Lead | À définir |
| Product Owner | À définir |
| Équipe MCP | À définir |
