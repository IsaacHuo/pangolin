#!/bin/bash
set -e

# Everything that is purely TS in src/ needs to go to node-host/src/
mkdir -p node-host/src

# Explicit TS directories
for dir in acp agents auto-reply browser canvas-host cli commands compat config cron daemon docs hooks infra link-understanding logging macos markdown media media-understanding memory pairing plugin-sdk plugins process providers routing scripts security sessions shared terminal test-helpers test-utils tts tui types utils web wizard; do
    if [ -d "src/$dir" ]; then
        mv "src/$dir" "node-host/src/"
    fi
done

# Mixed directories (like channels, gateway) that have PY and TS
# For channels:
mkdir -p node-host/src/channels
# Find all TS/JS files in src/channels and move them maintaining structure
cd src/channels
find . -name "*.ts" -o -name "*.js" | cpio -pvd ../../node-host/src/channels/
find . -name "*.test.ts" -exec rm {} \; # Tests were already supposed to be purged, or we move them separately
find . -name "*.ts" -exec rm {} \;
find . -type d -empty -delete
cd ../..

# For gateway:
mkdir -p node-host/src/gateway
cd src/gateway
find . -name "*.ts" -o -name "*.js" | cpio -pvd ../../node-host/src/gateway/
find . -name "*.ts" -exec rm {} \;
find . -type d -empty -delete
cd ../..

echo "Done moving TS domain blocks"
