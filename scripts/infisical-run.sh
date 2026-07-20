#!/usr/bin/env bash
# Wraps `infisical run` for this repo.
# Requires INFISICAL_API_URL (self-hosted Infisical).
#
# Usage:
#   export INFISICAL_API_URL=https://infisical.goodtek.xyz
#   scripts/infisical-run.sh [--env local|dev|prod] [--path /] -- <command> [args...]
set -euo pipefail

: "${INFISICAL_API_URL:?INFISICAL_API_URL is required (e.g. export INFISICAL_API_URL=https://infisical.goodtek.xyz)}"

ENVIRONMENT="${INFISICAL_ENV:-local}"
SECRET_PATH="${INFISICAL_PATH:-/}"

args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --path)
      SECRET_PATH="$2"
      shift 2
      ;;
    --)
      shift
      args=("$@")
      break
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

if [[ ${#args[@]} -eq 0 ]]; then
  echo "usage: scripts/infisical-run.sh [--env local] [--path /] -- <command>" >&2
  exit 1
fi

if ! command -v infisical >/dev/null 2>&1; then
  echo "infisical CLI not found. Install: brew install infisical/get-cli/infisical" >&2
  exit 1
fi

export INFISICAL_API_URL
exec infisical run --env="${ENVIRONMENT}" --path="${SECRET_PATH}" -- "${args[@]}"
