#!/bin/bash
# Moov Service Network - one-click launcher (macOS).
# After downloading, make it runnable once:  chmod +x start-mac.command
# Then double-click it. Keep the window open while using the app.
cd "$(dirname "$0")" || exit 1

echo "Installing/updating dependencies (first run can take a minute)..."
npm run setup || { echo "Setup failed - please send the messages above."; exit 1; }

echo "Starting the app. Your browser will open shortly. Keep this window open."
( sleep 8; open http://localhost:5173 ) &
npm run dev:all
