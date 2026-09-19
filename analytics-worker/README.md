# Site reach Worker

Aggregate-only Cloudflare Worker for public site visit totals. D1 stores two counters (`visits` and distinct ISO country codes) and never stores IP addresses, user agents, fingerprints, cookies, or persistent visitor identifiers.

Exposed JSON is always `{ visits, countries }`.

## Deploy

```bash
npx wrangler login
# First-time Cloudflare accounts also need a workers.dev subdomain.
# Register one in the dashboard or via PUT /accounts/<id>/workers/subdomain.
npx wrangler d1 create yong-dai-site-reach --binding DB --update-config
npx wrangler d1 execute yong-dai-site-reach --remote --file=schema.sql
npm run deploy
```

The production Worker is `https://yong-dai-site-reach.daiyongya.workers.dev`. `ALLOWED_ORIGINS` stays limited to GitHub Pages, the custom domain, and local preview origins used for development. After D1 creation, Wrangler writes the `DB` binding into `wrangler.jsonc`; keep that binding aggregate-only. A newly registered `workers.dev` hostname can take a few minutes for DNS before `curl` succeeds.

## Local checks

```bash
npm test
npm run dev
```
