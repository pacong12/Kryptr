# 🔒 Versioning Guide - Versioned Artifacts Only

## Problem Statement
GitHub Actions was producing both **versioned** and **non-versioned** artifacts when only versioned ones should exist.

## Solution Overview

### ✅ What Changed:
1. **Build Workflow** → Only uploads artifacts with version tags (v1.2.3 format)
2. **Artifact Structure** → All builds organized under `dist/versioned/{version}/`
3. **Cleanup Script** → Automatically removes non-versioned files before upload
4. **Validation** → Rejects non-semantic version tags at workflow start

## How It Works

### 1. Tag Validation
```yaml
# Validates tag follows vX.Y.Z pattern
if [[ ! "$TAG_NAME" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  exit 1  # Reject invalid versions
fi
```

### 2. Build Output Directory
```bash
mkdir -p dist/versioned/v1.2.3/
# Copy ALL artifacts ONLY here
forge build --output-dir dist/versioned/v1.2.3/contracts/
```

### 3. Cleanup Pre-Upload
```bash
#!/bin/bash
# Remove any non-versioned files from dist/
find dist/ -maxdepth 1 -type f ! -name "*.md" -delete
```

### 4. Upload Only Versioned
```yaml
uses: actions/upload-artifact@v4
with:
  name: kryptr-${{ github.ref_name }}
  path: dist/versioned/${{ github.ref_name }}/**
```

## Artifact Structure After Fix

```
dist/
├── README.md                    ← Documentation (kept)
└── versioned/                   ← ONLY this subdirectory
    └── v1.2.3/                  ← Version-tagged folder
        ├── contracts/           ← Contract artifacts
        │   ├── TokenFactory.json
        │   └── TokenTemplate.json
        └── deployments/         ← Deployment receipts
            └── v1.2.3-deploy.json
```

## Before vs After

### ❌ BEFORE (Incorrect):
```
dist/
├── contracts/artifacts/*.json    ← Non-versioned!
├── deployments/deploy.json       ← Non-versioned!
├── versioned/v1.2.3/contracts/  ← Versioned
└── versioned/v1.2.3/deployments/ ← Versioned
```
→ GitHub Actions uploads BOTH versions!

### ✅ AFTER (Correct):
```
dist/
└── versioned/v1.2.3/            ← Everything inside versioned folder
    ├── contracts/
    └── deployments/
```
→ GitHub Actions uploads ONLY versioned!

## Testing Locally

```bash
# Simulate workflow locally
export GITHUB_REF_NAME="v1.2.3"
./node_modules/.bin/npx nx build @kryptr/contracts

# Run cleanup script
AUTO_CLEAN=true ./.github/scripts/clean-nonversioned-artifacts.sh dist v1.2.3

# Verify output
tree dist/
```

## FAQ

**Q: Why not just delete non-versioned files?**  
A: Because sometimes developers intentionally build without tags for testing. We want to catch those cases early!

**Q: Can I disable auto-cleanup?**  
A: Yes, set `AUTO_CLEAN=false` environment variable. The script will list files but not delete them.

**Q: What about documentation files (.md)?**  
A: They're preserved in root `dist/` since they don't affect artifact versioning.

**Q: How do I handle multiple versions?**  
A: Each tag creates its own subdirectory: `dist/versioned/v1.2.3/`, `dist/versioned/v1.2.4/`, etc.

## Troubleshooting

### Issue: "Artifact doesn't contain version number"
**Fix:** Ensure your build command outputs version to artifact metadata:
```bash
echo "{\"version\": \"${{ github.ref_name }}\"}" > dist/versioned/${{ github.ref_name }}/metadata.json
```

### Issue: "Non-versioned files still present after cleanup"
**Fix:** Check that you're running cleanup BEFORE upload step in workflow

### Issue: "Version tag rejected"
**Fix:** Use semantic versioning: `v1.2.3`, NOT `v1.2`, `1.2.3`, or `release-v1.2.3`

---

**Last Updated:** 2025-08-18  
**Workflow File:** `.github/workflows/build-versioned-only.yml`  
**Cleanup Script:** `.github/scripts/clean-nonversioned-artifacts.sh`
