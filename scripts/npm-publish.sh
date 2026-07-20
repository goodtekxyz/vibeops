#!/usr/bin/env bash
# Publish @goodtek/vibeops to npm using NPM_TOKEN from Infisical or local .env.
#
# Setup (once):
#   1. Create a granular npm token (Read and write, bypass 2FA for publish).
#   2. Store as NPM_TOKEN in Infisical (env local, path / by default)
#      OR put NPM_TOKEN=... in a gitignored .env
#   3. export INFISICAL_API_URL=https://infisical.goodtek.xyz
#      infisical login && infisical init   # link this folder to the Infisical project
#
# Usage:
#   scripts/npm-publish.sh              # smoke + publish
#   scripts/npm-publish.sh --dry-run    # smoke + npm publish --dry-run
#   scripts/npm-publish.sh --skip-smoke
#   INFISICAL_PATH=/npm scripts/npm-publish.sh   # if secrets live under /npm
#   NPM_OTP=123456 scripts/npm-publish.sh        # if token has no 2FA bypass
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
SKIP_SMOKE=0
INFISICAL_ENV="${INFISICAL_ENV:-local}"
INFISICAL_PATH="${INFISICAL_PATH:-/}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --skip-smoke) SKIP_SMOKE=1; shift ;;
    --env) INFISICAL_ENV="$2"; shift 2 ;;
    --path) INFISICAL_PATH="$2"; shift 2 ;;
    -h|--help)
      awk 'NR==1{next} /^[^#]/{exit} {sub(/^# ?/,""); print}' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

load_token_from_dotenv() {
  local f
  for f in .env.local .env; do
    if [[ -f "$f" ]] && grep -q '^NPM_TOKEN=' "$f"; then
      # shellcheck disable=SC1090
      set -a
      # Only export NPM_* lines to avoid clobbering unrelated env.
      # shellcheck disable=SC2046
      export $(grep -E '^NPM_(TOKEN|OTP)=' "$f" | sed 's/#.*//' | xargs)
      set +a
      echo "[npm-publish] loaded NPM_TOKEN from $f" >&2
      return 0
    fi
  done
  return 1
}

ensure_npm_token() {
  # Accept common Infisical / npmrc aliases.
  if [[ -z "${NPM_TOKEN:-}" && -n "${NPM_AUTH_TOKEN:-}" ]]; then
    export NPM_TOKEN="$NPM_AUTH_TOKEN"
  fi
  if [[ -n "${NPM_TOKEN:-}" ]]; then
    return 0
  fi

  # Already ran under Infisical once — do not re-exec (infinite loop).
  if [[ -n "${VIBEOPS_NPM_PUBLISH_INFISICAL:-}" ]]; then
    cat >&2 <<EOF
[npm-publish] Infisical injected secrets, but NPM_TOKEN is still missing.
Add a secret named exactly NPM_TOKEN (env=${INFISICAL_ENV} path=${INFISICAL_PATH}),
or set NPM_AUTH_TOKEN and this script will map it.
EOF
    exit 1
  fi

  if [[ -f .infisical.json ]] && command -v infisical >/dev/null 2>&1; then
    if [[ -z "${INFISICAL_API_URL:-}" ]]; then
      echo "[npm-publish] set INFISICAL_API_URL (e.g. https://infisical.goodtek.xyz)" >&2
      exit 1
    fi
    echo "[npm-publish] injecting secrets via Infisical (env=${INFISICAL_ENV} path=${INFISICAL_PATH})" >&2
    # Re-exec under Infisical so NPM_TOKEN is in the environment.
    # Bash 3.2 (macOS) + set -u: empty "${arr[@]}" is an unbound variable.
    inject=(
      env
      VIBEOPS_NPM_PUBLISH_INFISICAL=1
      INFISICAL_ENV="$INFISICAL_ENV"
      INFISICAL_PATH="$INFISICAL_PATH"
      "$ROOT/scripts/infisical-run.sh" --env "$INFISICAL_ENV" --path "$INFISICAL_PATH" --
      "$ROOT/scripts/npm-publish.sh"
    )
    [[ "$DRY_RUN" -eq 1 ]] && inject+=(--dry-run)
    [[ "$SKIP_SMOKE" -eq 1 ]] && inject+=(--skip-smoke)
    exec "${inject[@]}"
  fi

  if load_token_from_dotenv; then
    return 0
  fi

  cat >&2 <<'EOF'
[npm-publish] NPM_TOKEN is not set.

Options:
  1) Infisical (preferred)
       export INFISICAL_API_URL=https://infisical.goodtek.xyz
       infisical login
       infisical init          # once per clone
       # Add secret NPM_TOKEN at path / (env: local)
       scripts/npm-publish.sh

  2) Local .env (gitignored)
       cp .env.example .env
       # edit: NPM_TOKEN=npm_...
       scripts/npm-publish.sh

  3) Export for this shell only
       export NPM_TOKEN=npm_...
       scripts/npm-publish.sh
EOF
  exit 1
}

ensure_npm_token

if [[ -z "${NPM_TOKEN:-}" ]]; then
  echo "[npm-publish] NPM_TOKEN still empty after Infisical/.env inject" >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
NAME="$(node -p "require('./package.json').name")"

echo "[npm-publish] ${NAME}@${VERSION}"

if [[ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]]; then
  echo "[npm-publish] warning: not on main (currently $(git rev-parse --abbrev-ref HEAD))" >&2
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "[npm-publish] warning: working tree is dirty" >&2
fi

if [[ "$SKIP_SMOKE" -eq 0 ]]; then
  echo "[npm-publish] running pnpm smoke…"
  pnpm smoke
fi

TMP_NPMRC="$(mktemp)"
cleanup() { rm -f "$TMP_NPMRC"; }
trap cleanup EXIT

cat >"$TMP_NPMRC" <<EOF
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
registry=https://registry.npmjs.org/
EOF

PUBLISH_ARGS=(publish --access public --userconfig "$TMP_NPMRC")
if [[ "$DRY_RUN" -eq 1 ]]; then
  PUBLISH_ARGS+=(--dry-run)
fi
if [[ -n "${NPM_OTP:-}" ]]; then
  PUBLISH_ARGS+=(--otp="$NPM_OTP")
fi

echo "[npm-publish] npm ${PUBLISH_ARGS[*]/ //registry.npmjs.org/:_authToken=***}"
npm "${PUBLISH_ARGS[@]}"

if [[ "$DRY_RUN" -eq 0 ]]; then
  echo "[npm-publish] verifying ${NAME}@${VERSION}…"
  verified=0
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if published="$(npm view "${NAME}@${VERSION}" version 2>/dev/null)" && [[ "$published" == "$VERSION" ]]; then
      verified=1
      break
    fi
    echo "[npm-publish] waiting for registry (attempt ${i}/10)…" >&2
    sleep 2
  done
  if [[ "$verified" -ne 1 ]]; then
    echo "[npm-publish] error: ${NAME}@${VERSION} not visible on registry yet." >&2
    echo "[npm-publish] latest on registry: $(npm view "${NAME}" version 2>/dev/null || echo unknown)" >&2
    echo "[npm-publish] retry: npm view ${NAME}@${VERSION} version" >&2
    exit 1
  fi
  echo "[npm-publish] ok: ${NAME}@${VERSION}"
  echo "[npm-publish] Install with: npm i -g ${NAME}@${VERSION}"
fi
