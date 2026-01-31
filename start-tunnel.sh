#!/bin/bash

# Start Cloudflare tunnel and register URL with the app
# Usage: ./start-tunnel.sh [modal-url]
# Example: ./start-tunnel.sh https://your-app.modal.run

MODAL_URL="${1:-http://localhost:3000}"

echo "Starting Cloudflare tunnel for: $MODAL_URL"

# Start cloudflared and capture the URL
cloudflared tunnel --url "$MODAL_URL" 2>&1 | while read line; do
  echo "$line"
  
  # Look for the trycloudflare.com URL
  if echo "$line" | grep -q "trycloudflare.com"; then
    CF_URL=$(echo "$line" | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
    
    if [ -n "$CF_URL" ]; then
      echo ""
      echo "============================================"
      echo "Cloudflare URL: $CF_URL"
      echo "============================================"
      echo ""
      
      # Register the URL with the app
      sleep 2
      curl -s -X POST "$MODAL_URL/api/cf-url" \
        -H "Content-Type: application/json" \
        -d "{\"url\": \"$CF_URL\"}" && echo ""
      
      echo "URL registered with app!"
    fi
  fi
done
