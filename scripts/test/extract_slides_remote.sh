#!/bin/bash
# Extract slide images via remote server
#
# Usage:
#   ./extract_slides_remote.sh <metadata_json> <video_url> [output_dir]
#
# Example:
#   ./extract_slides_remote.sh docs/test/slides_VIDEO_ID.json "https://youtube.com/..." docs/test/presentation/
#
# Configuration:
#   Set EXTRACT_SERVER environment variable or edit below

# === CONFIGURATION ===
# Load from .env.local at project root if exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [ -f "${PROJECT_ROOT}/.env.local" ]; then
    source "${PROJECT_ROOT}/.env.local"
fi

EXTRACT_SERVER="${EXTRACT_SERVER:-user@your-server.com}"
REMOTE_DIR="${REMOTE_DIR:-~/extract-slides}"
SSH_PORT="${SSH_PORT:-2222}"
# =====================

# SSH/SCP options with port
SSH_OPTS="-p ${SSH_PORT}"
SCP_OPTS="-P ${SSH_PORT}"

set -e

# Arguments
METADATA_JSON="$1"
VIDEO_URL="$2"
OUTPUT_DIR="${3:-docs/test/slide_images}"
SAVE_VIDEO_DIR="${4:-}"

if [ -z "$METADATA_JSON" ] || [ -z "$VIDEO_URL" ]; then
    echo "Usage: $0 <metadata_json> <video_url> [output_dir] [save_video_dir]"
    echo ""
    echo "Arguments:"
    echo "  metadata_json   - Path to slides metadata JSON"
    echo "  video_url       - YouTube or direct video URL"
    echo "  output_dir      - Local directory for extracted images (default: docs/test/slide_images)"
    echo "  save_video_dir  - Local directory to save downloaded video (optional)"
    echo ""
    echo "Example:"
    echo "  $0 docs/test/slides_abc123.json 'https://youtube.com/watch?v=abc123'"
    echo "  $0 docs/test/slides_abc123.json 'https://youtube.com/watch?v=abc123' docs/test/slides/ docs/test/videos/"
    echo ""
    echo "Environment variables:"
    echo "  EXTRACT_SERVER  - SSH server (default: user@your-server.com)"
    echo "  SSH_PORT        - SSH port (default: 2222)"
    echo "  REMOTE_DIR      - Remote working directory (default: ~/extract-slides)"
    exit 1
fi

# Check if metadata file exists
if [ ! -f "$METADATA_JSON" ]; then
    echo "Error: Metadata file not found: $METADATA_JSON"
    exit 1
fi

METADATA_FILENAME=$(basename "$METADATA_JSON")
REMOTE_METADATA="${REMOTE_DIR}/${METADATA_FILENAME}"
REMOTE_OUTPUT="${REMOTE_DIR}/output"

echo "=== Extract Slides Remote ==="
echo "Server: $EXTRACT_SERVER (port $SSH_PORT)"
echo "Metadata: $METADATA_JSON"
echo "Video: $VIDEO_URL"
echo "Output: $OUTPUT_DIR"
if [ -n "$SAVE_VIDEO_DIR" ]; then
    echo "Save video: $SAVE_VIDEO_DIR"
fi
echo "============================="
echo ""

# Step 1: Copy metadata to server
echo "[1/4] Copying metadata to server..."
scp ${SCP_OPTS} "$METADATA_JSON" "${EXTRACT_SERVER}:${REMOTE_METADATA}"

# Step 2: Run extraction on server
echo "[2/4] Running extraction on server..."
SAVE_VIDEO_OPT=""
if [ -n "$SAVE_VIDEO_DIR" ]; then
    SAVE_VIDEO_OPT="--save-video video/"
fi
ssh ${SSH_OPTS} "$EXTRACT_SERVER" "cd ${REMOTE_DIR} && source .venv/bin/activate && python extract_frames.py --metadata '${METADATA_FILENAME}' --video '${VIDEO_URL}' -o output/ ${SAVE_VIDEO_OPT}"

# Step 3: Create local output directory
echo "[3/4] Creating output directory..."
mkdir -p "$OUTPUT_DIR"

# Step 4: Copy results back
echo "[4/5] Copying images back..."
scp ${SCP_OPTS} -r "${EXTRACT_SERVER}:${REMOTE_OUTPUT}/*.jpg" "$OUTPUT_DIR/"

# Step 5: Copy video if requested
if [ -n "$SAVE_VIDEO_DIR" ]; then
    echo "[5/5] Copying video back..."
    mkdir -p "$SAVE_VIDEO_DIR"
    scp ${SCP_OPTS} -r "${EXTRACT_SERVER}:${REMOTE_DIR}/video/*" "$SAVE_VIDEO_DIR/"
fi

# Cleanup remote
echo "Cleaning up remote..."
ssh ${SSH_OPTS} "$EXTRACT_SERVER" "rm -rf ${REMOTE_OUTPUT}/* ${REMOTE_METADATA} ${REMOTE_DIR}/video/* 2>/dev/null || true"

# Summary
echo ""
echo "=== Done ==="
echo "Images saved to: $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"/*.jpg 2>/dev/null | wc -l | xargs echo "Total images:"
if [ -n "$SAVE_VIDEO_DIR" ]; then
    echo "Video saved to: $SAVE_VIDEO_DIR"
    ls -la "$SAVE_VIDEO_DIR"/* 2>/dev/null
fi
