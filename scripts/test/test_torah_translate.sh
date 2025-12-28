#!/bin/bash
# Script de test pour le workflow Torah Discord Translation v2
# Usage: ./test_torah_translate.sh <anthropic_api_key> <openai_api_key> [text] [target_language]

ANTHROPIC_KEY="${1:-}"
OPENAI_KEY="${2:-}"
TEXT="${3:-בר ממטללא - אם ירצה דמצטער הוא}"
TARGET_LANG="${4:-fr}"
WEBHOOK_URL="http://pi6.local:5678/webhook/torah-discord-translate"

if [ -z "$ANTHROPIC_KEY" ] || [ -z "$OPENAI_KEY" ]; then
    echo "Usage: $0 <anthropic_api_key> <openai_api_key> [text] [target_language]"
    echo ""
    echo "Examples:"
    echo "  $0 sk-ant-xxx sk-xxx"
    echo "  $0 sk-ant-xxx sk-xxx 'בר ממטללא' fr"
    echo ""
    echo "Test validation (sans clés):"
    curl -s -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d '{"text":"","api_key":"","openai_api_key":""}' | jq .
    exit 1
fi

echo "=== Torah Discord Translation v2 ==="
echo "Pipeline: Claude Sonnet 4 → GPT-4o Verifier"
echo "Text: $TEXT"
echo "Target: $TARGET_LANG"
echo ""

curl -s -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{
        \"text\": \"$TEXT\",
        \"api_key\": \"$ANTHROPIC_KEY\",
        \"openai_api_key\": \"$OPENAI_KEY\",
        \"target_language\": \"$TARGET_LANG\",
        \"context\": {
            \"traite\": \"Sukkah\",
            \"page\": \"28b\",
            \"commentator\": \"Rashi\"
        }
    }" | jq .
