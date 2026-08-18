#!/bin/bash
# 🔒 Script: Clean Non-Versioned Artifacts
set -euo pipefail

ARTIFACT_DIR="${1:-dist}"
VERSION="${2:-${GITHUB_REF_NAME}}"

echo "🧹 Cleaning non-versioned artifacts from $ARTIFACT_DIR..."

if [ -d "$ARTIFACT_DIR" ]; then
    NON_VERSED=$(find "$ARTIFACT_DIR" -maxdepth 1 -type f ! -name "*.md")
    
    if [ -n "$NON_VERSED" ]; then
        echo "⚠️ Found non-versioned files:"
        echo "$NON_VERSED" | sed 's/^/     - /'
        
        if [ "${AUTO_CLEAN:-true}" = "true" ]; then
            find "$ARTIFACT_DIR" -maxdepth 1 -type f ! -name "*.md" -delete
            echo "✅ Removed non-versioned files"
        else
            exit 1
        fi
    fi
fi

echo "✅ Cleanup complete!"
