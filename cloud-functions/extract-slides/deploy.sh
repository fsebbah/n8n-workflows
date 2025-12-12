#!/bin/bash
# Deploy extract-slides Cloud Function to GCP

set -e

# Configuration - Update these values
PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-europe-west1}"
FUNCTION_NAME="extract-slides"
MEMORY="1GB"
TIMEOUT="540s"
MIN_INSTANCES="0"
MAX_INSTANCES="10"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Deploying ${FUNCTION_NAME} to GCP...${NC}"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo -e "${RED}Error: Not logged in to gcloud${NC}"
    echo "Run: gcloud auth login"
    exit 1
fi

# Set project
echo "Setting project..."
gcloud config set project "${PROJECT_ID}"

# Enable required APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable cloudfunctions.googleapis.com --quiet
gcloud services enable cloudbuild.googleapis.com --quiet
gcloud services enable run.googleapis.com --quiet
gcloud services enable artifactregistry.googleapis.com --quiet
gcloud services enable storage.googleapis.com --quiet

# Deploy the function
echo -e "${YELLOW}Deploying function...${NC}"
gcloud functions deploy "${FUNCTION_NAME}" \
    --gen2 \
    --runtime=python311 \
    --region="${REGION}" \
    --source=. \
    --entry-point=extract_slides \
    --trigger-http \
    --allow-unauthenticated \
    --memory="${MEMORY}" \
    --timeout="${TIMEOUT}" \
    --min-instances="${MIN_INSTANCES}" \
    --max-instances="${MAX_INSTANCES}" \
    --set-env-vars="GCP_PROJECT=${PROJECT_ID}"

# Get the function URL
FUNCTION_URL=$(gcloud functions describe "${FUNCTION_NAME}" \
    --region="${REGION}" \
    --format="value(serviceConfig.uri)" 2>/dev/null || echo "")

if [ -n "${FUNCTION_URL}" ]; then
    echo ""
    echo -e "${GREEN}Deployment successful!${NC}"
    echo ""
    echo "Function URL: ${FUNCTION_URL}"
    echo ""
    echo "Test with:"
    echo "curl -X POST ${FUNCTION_URL} \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -d '{"
    echo "    \"video_url\": \"https://example.com/video.mp4\","
    echo "    \"slides\": [{\"id\": 1, \"timestamp_ms\": 15000, \"title\": \"Test\"}],"
    echo "    \"output\": {\"type\": \"base64\"}"
    echo "  }'"
else
    echo -e "${RED}Warning: Could not retrieve function URL${NC}"
    echo "Check the GCP Console for the function URL"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
