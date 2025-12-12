#!/bin/bash
# =============================================================================
# Extract Presentation - Complete extraction pipeline
# =============================================================================
#
# This script performs a complete extraction from a video:
#   1. Transcribes the video (via n8n webhook)
#   2. Extracts slides metadata (via n8n webhook)
#   3. Extracts slide images (via remote server)
#
# Usage:
#   ./scripts/test/extract_presentation.sh <video_url> [output_dir] [save_video_dir]
#
# Examples:
#   ./scripts/test/extract_presentation.sh "https://youtube.com/watch?v=abc123"
#   ./scripts/test/extract_presentation.sh "https://youtube.com/watch?v=abc123" docs/test/my_presentation
#   ./scripts/test/extract_presentation.sh "https://youtube.com/watch?v=abc123" docs/test/my_presentation docs/test/videos
#
# =============================================================================

set -e

# === CONFIGURATION ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Load from .env.local at project root if exists
if [ -f "${PROJECT_ROOT}/.env.local" ]; then
    source "${PROJECT_ROOT}/.env.local"
fi

# Defaults
N8N_WEBHOOK_URL="${N8N_WEBHOOK_URL:-http://localhost:5678/webhook/video-transcription}"
EXTRACT_SERVER="${EXTRACT_SERVER:-user@your-server.com}"
SSH_PORT="${SSH_PORT:-2222}"
REMOTE_DIR="${REMOTE_DIR:-~/extract-slides}"
DEFAULT_OUTPUT_DIR="docs/test"

# SSH/SCP options
SSH_OPTS="-p ${SSH_PORT}"
SCP_OPTS="-P ${SSH_PORT}"
# =====================

# === FUNCTIONS ===

extract_video_id() {
    local url="$1"
    # Extract video ID from various YouTube URL formats
    if [[ "$url" =~ youtube\.com.*v=([a-zA-Z0-9_-]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    elif [[ "$url" =~ youtu\.be/([a-zA-Z0-9_-]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        # Return hash of URL for non-YouTube videos
        echo "$url" | md5sum | cut -c1-11
    fi
}

call_n8n_webhook() {
    local operation="$1"
    local video_url="$2"
    local output_file="$3"

    echo "Calling n8n webhook: $operation"

    local response=$(curl -s -X POST "$N8N_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"operation\": \"$operation\", \"videoUrl\": \"$video_url\"}" \
        --max-time 600)

    if [ -z "$response" ]; then
        echo "Error: Empty response from n8n webhook"
        return 1
    fi

    echo "$response" > "$output_file"
    echo "  -> Saved to: $output_file"
}

extract_slides_remote() {
    local local_dir="$1"
    local metadata_file="$2"
    local video_url="$3"
    local save_video="$4"
    local video_id="$5"

    local metadata_filename=$(basename "$metadata_file")
    local remote_project_dir="${REMOTE_DIR}/projects/${video_id}"

    # Step 1: Create remote directory structure and copy local folder
    echo "  Creating remote directory: ${remote_project_dir}"
    ssh ${SSH_OPTS} "$EXTRACT_SERVER" "mkdir -p '${remote_project_dir}'"

    # Step 2: Copy all JSON files to server (same structure)
    echo "  Syncing local folder to server..."
    scp ${SCP_OPTS} "${local_dir}"/*.json "${EXTRACT_SERVER}:${remote_project_dir}/" 2>/dev/null || true

    # Step 3: Run extraction on server
    echo "  Running extraction on server..."
    local save_video_opt=""
    if [ "$save_video" = "true" ]; then
        save_video_opt="--save-video '${remote_project_dir}/video'"
    fi
    ssh ${SSH_OPTS} "$EXTRACT_SERVER" "cd ${REMOTE_DIR} && source .venv/bin/activate && python extract_frames.py --metadata '${remote_project_dir}/${metadata_filename}' --video '${video_url}' -o '${remote_project_dir}/images' ${save_video_opt}"

    # Step 4: Copy images back to local
    echo "  Copying images to local..."
    mkdir -p "${local_dir}/images"
    scp ${SCP_OPTS} -r "${EXTRACT_SERVER}:${remote_project_dir}/images/*.jpg" "${local_dir}/images/" 2>/dev/null || echo "  No images found"

    # Step 5: Copy video back if requested
    if [ "$save_video" = "true" ]; then
        echo "  Copying video to local..."
        mkdir -p "${local_dir}/video"
        scp ${SCP_OPTS} -r "${EXTRACT_SERVER}:${remote_project_dir}/video/*" "${local_dir}/video/" 2>/dev/null || echo "  No video found"
    fi

    # Show remote structure (no cleanup - keep on server)
    echo "  Remote folder kept at: ${remote_project_dir}"
}

# === MAIN ===

VIDEO_URL=""
OUTPUT_DIR=""
SAVE_VIDEO="false"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --save-video)
            SAVE_VIDEO="true"
            shift
            ;;
        -h|--help)
            VIDEO_URL=""
            break
            ;;
        *)
            if [ -z "$VIDEO_URL" ]; then
                VIDEO_URL="$1"
            elif [ -z "$OUTPUT_DIR" ]; then
                OUTPUT_DIR="$1"
            fi
            shift
            ;;
    esac
done

if [ -z "$VIDEO_URL" ]; then
    echo "Usage: $0 <video_url> [output_dir] [--save-video]"
    echo ""
    echo "This script performs a complete presentation extraction:"
    echo "  1. Transcribes the video"
    echo "  2. Extracts slides metadata (timestamps, titles, bounding boxes)"
    echo "  3. Extracts slide images via remote server"
    echo ""
    echo "Arguments:"
    echo "  video_url       - YouTube or direct video URL"
    echo "  output_dir      - Output directory (default: docs/test/<video_id>)"
    echo "  --save-video    - Also download and save the video"
    echo ""
    echo "Examples:"
    echo "  $0 'https://youtube.com/watch?v=abc123'"
    echo "  $0 'https://youtube.com/watch?v=abc123' docs/test/my_presentation"
    echo "  $0 'https://youtube.com/watch?v=abc123' docs/test/my_presentation --save-video"
    echo ""
    echo "Output structure (local and remote mirror):"
    echo "  <output_dir>/"
    echo "    ├── transcript_<id>_<timestamp>.json"
    echo "    ├── slides_<id>_<timestamp>.json"
    echo "    ├── images/"
    echo "    │   ├── slide_001_Title.jpg"
    echo "    │   └── ..."
    echo "    └── video/  (if --save-video)"
    echo "        └── video_<id>.mp4"
    exit 1
fi

# Extract video ID
VIDEO_ID=$(extract_video_id "$VIDEO_URL")
echo "Video ID: $VIDEO_ID"

# Set output directory
if [ -z "$OUTPUT_DIR" ]; then
    OUTPUT_DIR="${DEFAULT_OUTPUT_DIR}/${VIDEO_ID}"
fi
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TRANSCRIPT_FILE="${OUTPUT_DIR}/transcript_${VIDEO_ID}_${TIMESTAMP}.json"
SLIDES_FILE="${OUTPUT_DIR}/slides_${VIDEO_ID}_${TIMESTAMP}.json"
IMAGES_DIR="${OUTPUT_DIR}/images"

# Start total timer
TOTAL_START_TIME=$(date +%s)

echo ""
echo "=============================================="
echo "  PRESENTATION EXTRACTION PIPELINE"
echo "=============================================="
echo "Video URL:    $VIDEO_URL"
echo "Video ID:     $VIDEO_ID"
echo "Output:       $OUTPUT_DIR"
echo "Save video:   $SAVE_VIDEO"
echo "Remote:       ${EXTRACT_SERVER}:${REMOTE_DIR}/projects/${VIDEO_ID}"
echo "=============================================="
echo ""

# === STEP 1: TRANSCRIPT ===
echo "[1/3] Extracting transcript..."
START_TIME=$(date +%s)
call_n8n_webhook "transcribe" "$VIDEO_URL" "$TRANSCRIPT_FILE"
END_TIME=$(date +%s)
echo "  -> Completed in $((END_TIME - START_TIME))s"
echo ""

# === STEP 2: SLIDES METADATA ===
echo "[2/3] Extracting slides metadata..."
START_TIME=$(date +%s)
call_n8n_webhook "extractSlides" "$VIDEO_URL" "$SLIDES_FILE"
END_TIME=$(date +%s)
echo "  -> Completed in $((END_TIME - START_TIME))s"

# Check if slides were found
SLIDES_COUNT=$(cat "$SLIDES_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('slides', [])))" 2>/dev/null || echo "0")
echo "  -> Found $SLIDES_COUNT slides"
echo ""

# === STEP 3: SLIDE IMAGES ===
IMAGES_COUNT=0
if [ "$SLIDES_COUNT" -gt 0 ]; then
    echo "[3/3] Extracting slide images via remote server..."
    START_TIME=$(date +%s)
    extract_slides_remote "$OUTPUT_DIR" "$SLIDES_FILE" "$VIDEO_URL" "$SAVE_VIDEO" "$VIDEO_ID"
    END_TIME=$(date +%s)
    echo "  -> Completed in $((END_TIME - START_TIME))s"

    IMAGES_COUNT=$(ls -1 "$IMAGES_DIR"/*.jpg 2>/dev/null | wc -l || echo "0")
    echo "  -> Extracted $IMAGES_COUNT images"
else
    echo "[3/3] Skipping image extraction (no slides found)"
fi
echo ""

# === SUMMARY ===
echo "=============================================="
echo "  EXTRACTION COMPLETE"
echo "=============================================="
echo ""
echo "Local: $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR"/ 2>/dev/null | grep -v "^total" | grep -v "^d"
echo ""
if [ -d "$IMAGES_DIR" ]; then
    echo "Images: $IMAGES_DIR/ ($IMAGES_COUNT files)"
fi
if [ "$SAVE_VIDEO" = "true" ] && [ -d "${OUTPUT_DIR}/video" ]; then
    echo "Video:  ${OUTPUT_DIR}/video/"
    ls -la "${OUTPUT_DIR}/video/" 2>/dev/null | grep -v "^total"
fi
# Calculate total time
TOTAL_END_TIME=$(date +%s)
TOTAL_DURATION=$((TOTAL_END_TIME - TOTAL_START_TIME))
TOTAL_MINUTES=$((TOTAL_DURATION / 60))
TOTAL_SECONDS=$((TOTAL_DURATION % 60))

echo ""
echo "Remote mirror: ${EXTRACT_SERVER}:${REMOTE_DIR}/projects/${VIDEO_ID}/"
echo ""
echo "Total execution time: ${TOTAL_MINUTES}m ${TOTAL_SECONDS}s (${TOTAL_DURATION}s)"
echo "=============================================="
