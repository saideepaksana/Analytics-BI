#!/bin/bash

# Automatically generate embed URL for first published dashboard
# No arguments needed!

set -e

DASHBOARD_API="http://localhost:5000/api/dashboard"
EMBED_TOKEN_API="http://localhost:5000/api/export/embed/token"

echo "🔄 Fetching first published dashboard..."

# Step 1: Get first published dashboard
DASHBOARD_RESPONSE=$(curl -s -X GET "$DASHBOARD_API" \
  -H "x-user-id: role3@abi.com" \
  -H "x-user-role: admin")

# Extract dashboard ID
DASHBOARD_ID=$(echo "$DASHBOARD_RESPONSE" | grep -o '"_id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$DASHBOARD_ID" ]; then
  echo "❌ Error: No dashboards found"
  exit 1
fi

echo "✓ Found dashboard: $DASHBOARD_ID"
echo ""
echo "🔄 Generating embed token..."

# Step 2: Generate embed token
TOKEN_RESPONSE=$(curl -s -X POST "$EMBED_TOKEN_API" \
  -H "Content-Type: application/json" \
  -H "x-user-id: ai23@cv.com" \
  -H "x-user-role: editor" \
  -d "{
    \"dashboardId\": \"$DASHBOARD_ID\",
    \"expirationHours\": 24,
    \"allowedOrigins\": [\"http://localhost:5173\", \"http://localhost:3000\"]
  }")

# Check if response contains an error
if echo "$TOKEN_RESPONSE" | grep -q '"error"'; then
  echo "❌ Error: $(echo "$TOKEN_RESPONSE" | grep -o '"error":"[^"]*"')"
  exit 1
fi

# Extract the embedUrl
EMBED_URL=$(echo "$TOKEN_RESPONSE" | grep -o '"embedUrl":"[^"]*"' | cut -d'"' -f4)
TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
EXPIRES_AT=$(echo "$TOKEN_RESPONSE" | grep -o '"expiresAt":"[^"]*"' | cut -d'"' -f4)

if [ -z "$EMBED_URL" ]; then
  echo "❌ Failed to extract embed URL from response"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo ""
echo "✅ Success!"
echo ""
echo "📊 Dashboard ID: $DASHBOARD_ID"
echo "📋 Embed URL:"
echo "   $EMBED_URL"
echo ""
echo "⏰ Expires at: $EXPIRES_AT"
echo ""

# Try to copy to clipboard (works on most systems)
if command -v xclip &> /dev/null; then
  echo "$EMBED_URL" | xclip -selection clipboard
  echo "✓ URL copied to clipboard"
elif command -v xsel &> /dev/null; then
  echo "$EMBED_URL" | xsel --clipboard --input
  echo "✓ URL copied to clipboard"
elif command -v pbcopy &> /dev/null; then
  echo "$EMBED_URL" | pbcopy
  echo "✓ URL copied to clipboard"
else
  echo "💡 (Install xclip/xsel to enable auto-copy to clipboard)"
fi

echo ""
echo "🔗 Open in browser:"
echo "   $EMBED_URL"