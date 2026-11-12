#!/usr/bin/env bash
set -euo pipefail

# Presence check for the Pages build. The client validates project/domain and
# emulator restrictions before initializing Auth. Never print configuration values.
missing=0
for name in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID; do
  value="${!name:-}"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    printf '::error::Missing required Firebase web configuration: %s. Set this GitHub repository variable (or secret) before deploying.\n' "$name" >&2
    missing=1
  fi
done
exit "$missing"
