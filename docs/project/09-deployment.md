# 09 — Deployment

How this project is built, packaged, and shipped.

## Local run

```bash
pnpm install
pnpm build
pnpm smoke
node dist/cli.js --help
```

## Build

```bash
pnpm build          # → dist/
pnpm prepack        # clean + build (runs automatically before npm pack/publish)
```

## Packaging / distribution (npm)

Package: `@goodtek/vibeops` (public). Version is `package.json` `version`.

### Publish with Infisical (preferred)

1. Create an npm **granular access token** (Read and write, enable bypass 2FA for publish).
2. Store it in Infisical as `NPM_TOKEN` at path **`/`** (env `local`). Optional: use a `/npm` folder and `INFISICAL_PATH=/npm`.
3. Link this repo once:

```bash
export INFISICAL_API_URL=https://infisical.goodtek.xyz   # add to shell profile
brew install infisical/get-cli/infisical
infisical login
infisical init    # creates .infisical.json (commit workspaceId if the team agrees)
```

4. Publish:

```bash
pnpm publish:npm          # smoke + npm publish
pnpm publish:npm:dry      # dry-run
```

`scripts/npm-publish.sh` injects secrets via `scripts/infisical-run.sh`, writes a **temporary** npmrc (not `~/.npmrc`), then runs `npm publish`.

### Publish with local `.env` (fallback)

```bash
cp .env.example .env
# edit NPM_TOKEN=npm_...
pnpm publish:npm
```

`.env` is gitignored.

### One-shot OTP

If the token does not bypass 2FA:

```bash
NPM_OTP=123456 pnpm publish:npm
```

## Environment separation

| Secret source | When |
|---------------|------|
| Infisical `/` (`NPM_TOKEN`) | Team publish from maintainer machines |
| `.env` | Solo fallback |
| `NPM_TOKEN` already exported | CI or ad-hoc shell |

## Rollback

- npm: publish a new patch that reverts behavior, or `npm deprecate @goodtek/vibeops@x.y.z "message"`.
- Git: revert the release commit on `main`.
