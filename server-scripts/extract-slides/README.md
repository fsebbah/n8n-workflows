# Extract Slides Server

Script pour extraire les frames de slides depuis des vidéos YouTube.

## Installation sur le serveur

### 1. Cloner ou copier les fichiers

```bash
# Option A: Créer le dossier et copier les fichiers
mkdir -p ~/extract-slides
cd ~/extract-slides

# Option B: Cloner depuis le repo (si disponible)
# git clone <repo_url> ~/extract-slides
```

### 2. Créer un environnement virtuel

```bash
cd ~/extract-slides
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Installer les dépendances

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Vérifier l'installation

```bash
# Vérifier yt-dlp
yt-dlp --version

# Vérifier OpenCV
python3 -c "import cv2; print(cv2.__version__)"
```

## Utilisation

### Depuis un fichier metadata (recommandé)

```bash
# Activer l'environnement
source ~/extract-slides/.venv/bin/activate

# Extraire les slides
python extract_frames.py \
    --metadata slides.json \
    --video "https://www.youtube.com/watch?v=VIDEO_ID" \
    --output ./output_slides/
```

### Avec timestamps directs

```bash
python extract_frames.py \
    --video "https://www.youtube.com/watch?v=VIDEO_ID" \
    --timestamps "15000,45000,120000,180000" \
    --output ./output_slides/
```

### Avec cookies navigateur (si YouTube bloque)

```bash
python extract_frames.py \
    --metadata slides.json \
    --video "https://www.youtube.com/watch?v=VIDEO_ID" \
    --cookies-from-browser firefox \
    --output ./output_slides/
```

### Output en base64 (pour API)

```bash
python extract_frames.py \
    --metadata slides.json \
    --video "https://www.youtube.com/watch?v=VIDEO_ID" \
    --base64
```

## Options

| Option | Description |
|--------|-------------|
| `--video, -v` | URL vidéo (YouTube ou directe) ou fichier local |
| `--metadata, -m` | Fichier JSON avec metadata des slides |
| `--timestamps, -t` | Timestamps en ms séparés par virgules |
| `--output, -o` | Dossier de sortie (défaut: ./slides) |
| `--cookies-from-browser, -c` | Navigateur pour cookies (chrome, firefox, etc.) |
| `--keep-video, -k` | Garder la vidéo téléchargée |
| `--base64` | Sortie JSON avec images en base64 |
| `--quiet, -q` | Mode silencieux |

## Appel distant via SSH

Depuis le Pi :

```bash
# Copier le fichier metadata
scp docs/test/slides_VIDEO_ID.json user@server:~/extract-slides/

# Exécuter l'extraction
ssh user@server "cd ~/extract-slides && source venv/bin/activate && python extract_frames.py --metadata slides_VIDEO_ID.json --video 'https://youtube.com/...' -o output/"

# Récupérer les images
scp -r user@server:~/extract-slides/output/*.jpg docs/test/presentation/
```
