#!/bin/sh
set -e

# ── Maak data directory aan als die niet bestaat ──
mkdir -p /data

# ── PUID / PGID ondersteuning (zoals linuxserver.io) ──
PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Maak groep aan als die nog niet bestaat
if ! getent group "$PGID" > /dev/null 2>&1; then
    addgroup -g "$PGID" apotheek
fi

# Maak gebruiker aan als die nog niet bestaat
if ! getent passwd "$PUID" > /dev/null 2>&1; then
    adduser -D -u "$PUID" -G "$(getent group "$PGID" | cut -d: -f1)" apotheek
fi

# Zorg dat de data map schrijfbaar is voor de Node.js app
chown -R "$PUID:$PGID" /data

echo "======================================"
echo "  💊 Huisapotheek"
echo "  PUID=$PUID | PGID=$PGID"
echo "  TZ=${TZ:-niet ingesteld}"
echo "  Poort: 3520"
echo "======================================"

# Start supervisord (runt zowel nginx als node)
exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
