# Site reach Worker

Aggregate-only Cloudflare Worker for public site visit totals. D1 stores two counters (`visits` and distinct ISO country codes) and never stores IP addresses, user agents, fingerprints, cookies, or persistent visitor identifiers.

Exposed JSON is always `{ visits, countries }`.

## Deploy

```bash
npx wrangler login
npx wrangler d1 create yong-dai-site-reach --binding DB --update-config
npx wrangler d1 execute yong-dai-site-reach --remote --file=schema.sql
npm run deploy
```

`ALLOWED_ORIGINS` in `wrangler.jsonc` must stay limited to the GitHub Pages origin and the custom domain. After D1 creation, Wrangler writes the `DB` binding into `wrangler.jsonc`; keep that binding aggregate-only.

## Local checks

```bash
npm test
npm run dev
```
