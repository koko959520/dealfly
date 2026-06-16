#!/bin/sh
# Démarre Next.js (web) + BullMQ worker en parallèle dans le même conteneur.
# Si l'un des deux s'arrête, l'autre est tué et le conteneur redémarre.

set -e

echo "[start.sh] Démarrage du serveur Next.js..."
node_modules/.bin/next start &
WEB_PID=$!

echo "[start.sh] Démarrage du worker BullMQ..."
node_modules/.bin/tsx src/workers/index.ts &
WORKER_PID=$!

# Propager SIGTERM aux deux processus
trap "kill $WEB_PID $WORKER_PID 2>/dev/null; exit 0" TERM INT

echo "[start.sh] Web PID=$WEB_PID | Worker PID=$WORKER_PID"

# Attendre que l'un des deux se termine — Railway redémarrera le conteneur
wait -n $WEB_PID $WORKER_PID
EXIT_CODE=$?

echo "[start.sh] Un processus s'est arrêté (code $EXIT_CODE), arrêt de l'autre..."
kill $WEB_PID $WORKER_PID 2>/dev/null
exit $EXIT_CODE
