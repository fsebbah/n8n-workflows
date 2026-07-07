# Installation d'un serveur n8n — Docker (mode unique)

> Guide d'installation d'une instance n8n pour le projet `n8n-workflows`.
> **Depuis n8n ≥ 2.28, Docker est le SEUL mode supporté** (voir §1 pourquoi).
> Parc actuel : **host2 = staging**, **llm = dev** — base PostgreSQL **partagée**.
> Dernière mise à jour : 2026-07-07 (v2 — remplace la version PM2/npm, obsolète).

---

## 1. Pourquoi Docker uniquement (npm banni)

**`npm install -g n8n` est cassé pour n8n ≥ 2.28** : npm résout un arbre de
dépendances incompatible (`@langchain/core` sans le subpath attendu) → le CLI
meurt au chargement avec le message trompeur `Error: Command "start" not found`.
Constaté sur les 2.28.6 et 2.28.7 (npm), alors que **la même version en image
Docker fonctionne parfaitement** (l'image embarque l'arbre de deps construit et
testé par l'éditeur).

- ❌ `npm install -g n8n` → interdit
- ❌ `image: n8nio/n8n:latest` → interdit (dérive de version + migration sauvage
  du schéma de la base partagée — vécu : host2 en `latest` a migré la base en 2.28
  pendant que le reste du parc était en 2.20)
- ✅ `image: docker.n8n.io/n8nio/n8n:<version épinglée>` — actuellement **2.28.7**

## 2. Prérequis communs

### 2.1 Base de données PARTAGÉE — règles du parc
Toutes les instances partagent **la même base** : `databases.local:5435`, base `n8n`
(donc mêmes workflows, credentials, exécutions partout).

1. **MÊME version n8n sur toutes les instances, épinglée** — une instance plus
   récente migre le schéma au démarrage et met les autres en mode non supporté.
2. **MÊME `N8N_ENCRYPTION_KEY`** sur toutes les instances : les credentials
   chiffrés vivent dans la base commune. Clé différente = credentials illisibles.
3. Les warnings `ExecutionAlreadyResumingError` au boot/runtime sont **bénins**
   (verrou multi-instance : une seule instance reprend chaque exécution).
4. La séparation staging/dev se joue chez les **appelants** (quelle URL n8n chaque
   environnement appelle), pas dans les données n8n.

### 2.2 `.env.local` — points critiques
Fichier hors git (`chmod 600`), placé dans `docker/.env.local`. En plus des
variables n8n/DB habituelles :

```bash
N8N_ENCRYPTION_KEY=<clé commune du parc>          # §2.1 règle 2
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=databases.local
DB_POSTGRESDB_PORT=5435
DB_POSTGRESDB_DATABASE=n8n                        # base PARTAGÉE du parc
# ⚠️ utilisées par l'INTERPOLATION du docker-compose (extra_hosts) :
DATABASES_LOCAL_IP=192.168.1.185                  # IP réelle de databases.local
```

> ⚠️ **Piège vécu** : une `DATABASES_LOCAL_IP` périmée (ou non fournie au compose)
> fait résoudre `databases.local` vers une mauvaise IP DANS le conteneur →
> `ECONNREFUSED` au boot. Vérifier avec `getent hosts databases.local`.

> ⚠️ **Politique projet** : les workflows ne lisent AUCUN secret via `$env`/
> `process.env`. Toutes les clés (OpenAI, Mistral, AssemblyAI…) arrivent **par le
> payload (BYOT)**, poussées par chat.api/MCP.

### 2.3 Custom nodes — artefact partagé
Les sources sont dans `custom-nodes/` (repo), **mais les builds (`dist/` +
`node_modules/`) ne sont pas dans git**. La référence des packages **buildés** est
`host2:/storage4/n8n/custom-nodes` (montée dans le conteneur staging). Les autres
instances utilisent une **copie** (llm : `custom-nodes-built/`, hors git).

**Après tout rebuild d'un custom node** : lancer `docker/sync-custom-nodes.sh`
(sync host2 → llm + redéploiement des deux n8n). Sans ça, staging et dev
divergent silencieusement.

## 3. Installation d'une instance (Docker)

### 3.1 Prérequis machine
```bash
docker --version                    # Docker Engine + compose plugin
systemctl is-active docker          # daemon actif…
sudo systemctl enable --now docker  # …et enabled au boot (sinon rien ne survit au reboot)
```

### 3.2 Mise en place
```bash
git clone git@github.com:fsebbah/n8n-workflows.git && cd n8n-workflows/docker
cp /chemin/vers/.env.local .env.local && chmod 600 .env.local   # adapter §2.2 !
# Vérifier l'image épinglée :
grep image: docker-compose.yml      # docker.n8n.io/n8nio/n8n:2.28.7
# Custom nodes buildés (§2.3) : adapter le volume du compose si besoin
#   - <chemin des packages buildés>:/home/node/.n8n/nodes
```

**Récupérer l'image sans internet** (depuis une machine du parc qui l'a) :
```bash
ssh fsebb@host2.local 'docker save docker.n8n.io/n8nio/n8n:2.28.7' | docker load
```

### 3.3 Démarrage / relance — TOUJOURS via `deploy.sh`
```bash
./deploy.sh           # down && --env-file .env.local up -d --force-recreate + healthz
./deploy.sh --pull    # idem, en tirant d'abord la nouvelle image épinglée (upgrade)
```
> Le script encapsule la commande de référence du projet. **Ne jamais lancer
> `docker compose up` à la main sans `--env-file .env.local`** : l'interpolation
> des `extra_hosts` serait vide → `databases.local → 127.0.0.1` → ECONNREFUSED
> (vécu).

### 3.4 Vérifications
```bash
docker ps --filter name=n8n                       # Up (healthy)
curl -s http://localhost:5678/healthz             # {"status":"ok"}
docker exec n8n n8n --version                     # version épinglée
docker compose --env-file .env.local logs n8n --tail 100 | grep -c "Unrecognized node type"   # 0 attendu
```

## 4. Mise à jour de version (tout le parc, jamais une seule instance)

1. Choisir la version cible, **backup de la base** :
   `pg_dump -h databases.local -p 5435 -U n8n -d n8n -Fc -f n8n_pre-<ver>.dump`
2. Éditer `image:` dans les compose **des deux instances** (même tag).
3. `./deploy.sh --pull` sur l'instance **dev (llm) d'abord**, vérifier (§3.4).
4. Puis staging (host2).
5. Mettre à jour ce guide (version courante) et l'issue de suivi.

## 5. Post-installation

1. La base étant partagée : **rien à importer** — workflows/credentials déjà là.
2. UI : `http://<host>:5678` (compte owner commun au parc).
3. Scripts d'exploitation depuis le repo (`scripts/n8n/n8n_api.py`) : réimport
   par **stem de fichier** (`batch-reimport "MCP_-_PDF_OCR"`), export snapshot, etc.
   Les scripts sanitizent les settings refusés par l'API d'écriture — ne pas contourner.

## 6. Services complémentaires

| Service | Où | Rôle |
|---|---|---|
| **redis-xadd** | host2, Docker (`n8n-redis-xadd`) | Redis Streams en HTTP pour les workflows batch LLM (`REDIS_XADD_SERVICE_URL`) |
| **Apache Tika** 3.3.1 | webs.local:9998, systemd natif (`tika.service`) | extraction Office/PDF natif pour le RAG (`MCP - Office Extractor`) — streaming, aucun stockage |
| **torah.api** | host2:/storage4/torah.api, Docker (port 3031) | consommé par le workflow torah-corpus (`API_URL=http://host2.local:3031`) |

## 7. Points de vigilance (tous vécus)

| Piège | Parade |
|---|---|
| `npm install -g n8n` (≥2.28) | interdit — Docker only (§1) |
| `image: latest` | interdit — épingler ; c'est lui qui a migré la base à l'insu du parc |
| `docker compose up` sans `--env-file` | `deploy.sh` uniquement (§3.3) |
| `DATABASES_LOCAL_IP` périmée | vérifier `getent hosts databases.local` (§2.2) |
| Version différente entre instances | upgrade = tout le parc, dev d'abord (§4) |
| Encryption key différente | credentials illisibles — clé commune (§2.1) |
| Custom nodes divergents après rebuild | `sync-custom-nodes.sh` (§2.3) |
| `ExecutionAlreadyResumingError` | bénin, multi-instance (§2.1) |
| Réimport avec le nom d'affichage | stem du fichier (`MCP_-_PDF_OCR`) |
| rsync de dossiers contenant des symlinks | `-aL` pour matérialiser le contenu (sinon liens cassés) |
