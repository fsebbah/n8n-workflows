#!/bin/bash
# Export all n8n workflows with names as filenames

# Load .env.local if exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [ -f "$ENV_FILE" ]; then
  echo "Loading $ENV_FILE..."
  set -a
  source "$ENV_FILE"
  set +a
elif [ -f ".env.local" ]; then
  echo "Loading .env.local..."
  set -a
  source ".env.local"
  set +a
fi

OUTPUT_DIR="${1:-workflows}"
API_URL="${N8N_API_URL:-http://pi6.local:5678/api/v1}"
API_KEY="${N8N_API_KEY}"

if [ -z "$API_KEY" ]; then
  echo "Error: N8N_API_KEY not set"
  echo "Ensure .env.local exists with N8N_API_KEY=xxx"
  echo "Or run: N8N_API_KEY=xxx ./export_workflows.sh [output_dir]"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "Fetching workflows from $API_URL..."

# Pagination variables
LIMIT=250
CURSOR=""
total_count=0
all_ids=""

# Fetch all workflow IDs with pagination
while true; do
  if [ -z "$CURSOR" ]; then
    response=$(curl -s -H "X-N8N-API-KEY: $API_KEY" "$API_URL/workflows?limit=$LIMIT")
  else
    response=$(curl -s -H "X-N8N-API-KEY: $API_KEY" "$API_URL/workflows?limit=$LIMIT&cursor=$CURSOR")
  fi

  # Check for errors
  if echo "$response" | jq -e '.message' > /dev/null 2>&1; then
    echo "Error: $(echo "$response" | jq -r '.message')"
    exit 1
  fi

  # Get workflows from this page
  page_count=$(echo "$response" | jq '.data | length')
  total_count=$((total_count + page_count))

  # Collect IDs and names
  echo "$response" | jq -c '.data[] | {id: .id, name: .name}' >> /tmp/workflow_list.jsonl

  # Check for next cursor
  CURSOR=$(echo "$response" | jq -r '.nextCursor // empty')
  if [ -z "$CURSOR" ]; then
    break
  fi
  echo "  Fetched $total_count workflows so far..."
done

echo "Found $total_count workflows"

# Export each workflow
while read -r wf; do
  id=$(echo "$wf" | jq -r '.id')
  name=$(echo "$wf" | jq -r '.name')

  # Clean filename: replace special chars with underscore, remove consecutive underscores
  filename=$(echo "$name" | sed 's/[^a-zA-Z0-9_-]/_/g' | sed 's/__*/_/g' | sed 's/^_//;s/_$//')

  echo "Exporting: $name -> $filename.json"

  # Fetch full workflow and save
  curl -s -H "X-N8N-API-KEY: $API_KEY" "$API_URL/workflows/$id" | jq '.' > "$OUTPUT_DIR/${filename}.json"
done < /tmp/workflow_list.jsonl

rm -f /tmp/workflow_list.jsonl

echo "Done! Exported to $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR" | head -20
