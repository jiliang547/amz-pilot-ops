# AMZ Pilot Cloudflare recovery

This repository is a Cloudflare-ready backup of the AMZ Pilot Sites project.
The Git history preserves the original Sites revisions through version 27.

## Required Cloudflare resources

- Worker: `amz-pilot-ops`
- D1 database: `amz-pilot-ops-db`
- R2 bucket: `amz-pilot-ops-files`
- Bindings: `DB`, `FILES`, and `IMAGES`
- Cron: every five minutes

The resource identifiers and non-secret runtime variables are configured in
`vite.config.ts`.

## Required secrets

Configure these with `wrangler secret put` or `wrangler secret bulk`:

- `CREDENTIAL_ENCRYPTION_KEY`: base64-encoded 32-byte AES key
- `AUTH_PEPPER`
- `CRON_SECRET`
- `INITIALIZE_SECRET`
- `MODEL_API_KEY` when a shared default model is required
- `BOOTSTRAP_AMAZON_CREDENTIALS` only when bootstrapping an Amazon account

Do not commit secret values to this repository.

## Build and deploy

```sh
npm ci
npm run build
npx wrangler deploy --dry-run --config dist/server/wrangler.json
npx wrangler deploy --config dist/server/wrangler.json
```

The application creates its D1 schema on the first request. Existing runtime
data should be restored separately into D1 and R2 when a data export is
available.
