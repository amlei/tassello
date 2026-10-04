#!/usr/bin/env bash
set -euo pipefail
out="${1:-./release/tassello-publisher}"
mkdir -p "$out"
cp dist/main.js manifest.json styles.css "$out/"
echo "Packaged plugin into $out"
