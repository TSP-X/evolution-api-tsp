#!/bin/sh

# Railway injects PORT dynamically - map to Evolution API's SERVER_PORT
if [ -n "$PORT" ]; then
  export SERVER_PORT="$PORT"
fi

# Auto-detect Railway public domain for SERVER_URL
if [ -n "$RAILWAY_PUBLIC_DOMAIN" ] && [ -z "$SERVER_URL" ]; then
  export SERVER_URL="https://$RAILWAY_PUBLIC_DOMAIN"
fi

# Map Railway's DATABASE_URL to Evolution API's DATABASE_CONNECTION_URI
if [ -n "$DATABASE_URL" ] && [ -z "$DATABASE_CONNECTION_URI" ]; then
  export DATABASE_CONNECTION_URI="$DATABASE_URL"
fi

# Map Railway's REDIS_URL to Evolution API's CACHE_REDIS_URI
if [ -n "$REDIS_URL" ] && [ -z "$CACHE_REDIS_URI" ]; then
  export CACHE_REDIS_URI="$REDIS_URL"
fi

echo "================================================"
echo "  Evolution API - TSP Group"
echo "================================================"
echo "  SERVER_URL: $SERVER_URL"
echo "  SERVER_PORT: $SERVER_PORT"
echo "  DATABASE: $DATABASE_ENABLED"
echo "  REDIS: $CACHE_REDIS_ENABLED"
echo "  WhatsApp: $WHATSAPP_BAILEYS_DEFAULT"
echo "================================================"

# Start Evolution API using the image's original boot sequence.
cd /evolution
exec /bin/bash -c '. ./Docker/scripts/deploy_database.sh && npm run start:prod'
