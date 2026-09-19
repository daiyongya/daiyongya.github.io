# Homepage Research Narrative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the homepage around a model-training and experience-compression narrative, and add a privacy-conscious public count of visits and source countries.

**Architecture:** Keep homepage content in `index.md` and scoped presentation in `editorial-overrides.css`. A dependency-free browser script calls a small Cloudflare Worker; the Worker validates origins and updates aggregate-only D1 rows, while its public read endpoint returns only total visits and distinct country count.

**Tech Stack:** Jekyll/Liquid, semantic HTML, CSS, browser JavaScript, Cloudflare Workers, D1 SQLite, Node's built-in test runner, Wrangler 4.

## Global Constraints

- Preserve the current Morandi palette, typography, square details, hairline dividers, and generous whitespace.
- Do not introduce gradients, rounded cards, decorative icons, or broad animation.
- Keep the existing Experience facts and avoid duration claims in the biography.
- Public statistics expose only `{ visits, countries }`.
- Do not store IP addresses, user agents, fingerprints, cookies, or persistent visitor identifiers.
- Count one visit per browser tab session across the site.
- Existing Google Analytics and counter.dev integrations remain unchanged.
- The page must remain usable when Worker configuration is absent or the endpoint is unreachable.

## File structure

- `index.md` — homepage copy, thesis flow, structured Experience rows, and public statistic fallback values.
- `assets/css/editorial-overrides.css` — homepage-specific visual hierarchy, responsive behavior, focus states, and reach display.
- `assets/js/site-reach.js` — session-scoped visit recording and public aggregate loading.
- `_includes/scripts.html` — conditionally loads `site-reach.js` when a Worker URL is configured.
- `_config.yml` — public `reach_api_url` setting.
- `analytics-worker/src/worker.js` — CORS validation, `POST /visit`, and `GET /stats`.
- `analytics-worker/schema.sql` — aggregate-only D1 schema.
- `analytics-worker/wrangler.jsonc` — Worker/D1 deployment configuration.
- `analytics-worker/package.json` — local test and deployment commands.
- `analytics-worker/test/worker.test.js` — Worker behavior tests with an in-memory D1-compatible fake.
- `analytics-worker/README.md` — login, D1 creation, migration, deployment, and site configuration instructions.

---

### Task 1: Aggregate-only visit Worker

**Files:**
- Create: `analytics-worker/package.json`
- Create: `analytics-worker/wrangler.jsonc`
- Create: `analytics-worker/schema.sql`
- Create: `analytics-worker/src/worker.js`
- Create: `analytics-worker/test/worker.test.js`
- Create: `analytics-worker/README.md`

**Interfaces:**
- Consumes: `env.DB` implementing D1 `prepare().bind().run()/first()`, `env.ALLOWED_ORIGINS` as a comma-separated origin list, and `request.cf.country`.
- Produces: `POST /visit -> { visits: number, countries: number }`, `GET /stats -> { visits: number, countries: number }`.

- [ ] **Step 1: Add the Worker package and failing endpoint tests**

Create a private ESM package using Node's built-in test runner:

```json
{
  "name": "site-reach-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^4.135.0"
  }
}
```

Tests must assert:

```js
test("GET /stats exposes zeroed aggregates", async () => {
  const response = await worker.fetch(request("GET", "/stats"), env());
  assert.deepEqual(await response.json(), { visits: 0, countries: 0 });
});

test("POST /visit increments visits and one distinct country", async () => {
  const response = await worker.fetch(request("POST", "/visit", "US"), env());
  assert.deepEqual(await response.json(), { visits: 1, countries: 1 });
});

test("repeated countries increment visits but not countries", async () => {
  const testEnv = env();
  await worker.fetch(request("POST", "/visit", "US"), testEnv);
  const response = await worker.fetch(request("POST", "/visit", "US"), testEnv);
  assert.deepEqual(await response.json(), { visits: 2, countries: 1 });
});

test("a second country increments the distinct-country count", async () => {
  const testEnv = env();
  await worker.fetch(request("POST", "/visit", "US"), testEnv);
  const response = await worker.fetch(request("POST", "/visit", "JP"), testEnv);
  assert.deepEqual(await response.json(), { visits: 2, countries: 2 });
});

test("disallowed origins receive 403 without changing counts", async () => {
  const testEnv = env();
  const response = await worker.fetch(request("POST", "/visit", "US", "https://example.com"), testEnv);
  assert.equal(response.status, 403);
  assert.deepEqual(await (await worker.fetch(request("GET", "/stats"), testEnv)).json(), { visits: 0, countries: 0 });
});

test("unknown country codes count the visit but not a country", async () => {
  const response = await worker.fetch(request("POST", "/visit", "XX"), env());
  assert.deepEqual(await response.json(), { visits: 1, countries: 0 });
});
```

- [ ] **Step 2: Run tests and confirm the missing module failure**

Run: `cd analytics-worker && npm test`

Expected: FAIL because `src/worker.js` does not exist.

- [ ] **Step 3: Add the aggregate schema and Worker implementation**

Use two small aggregate tables:

```sql
CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS country_visits (
  country_code TEXT PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0
);
```

Implement:

```js
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const VALID_COUNTRY = /^[A-Z]{2}$/;
const UNKNOWN_COUNTRIES = new Set(["XX", "T1"]);

export function allowedOrigins(env) {
  return new Set((env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean));
}

export function validCountry(value) {
  const country = String(value || "").toUpperCase();
  return VALID_COUNTRY.test(country) && !UNKNOWN_COUNTRIES.has(country) ? country : null;
}

async function stats(db) {
  const visits = await db.prepare("SELECT value FROM counters WHERE name = 'visits'").first("value");
  const countries = await db.prepare("SELECT COUNT(*) AS count FROM country_visits").first("count");
  return { visits: Number(visits || 0), countries: Number(countries || 0) };
}
```

`POST /visit` must execute the global upsert and optional country upsert through `DB.batch()` so both changes are atomic. `GET /stats` is read-only. All responses include origin-specific CORS only when the request origin is allowlisted. Unsupported routes return 404; unsupported methods return 405; disallowed origins return 403.

- [ ] **Step 4: Add Wrangler configuration and deployment documentation**

Configure:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "yong-dai-site-reach",
  "main": "src/worker.js",
  "compatibility_date": "2026-09-19",
  "vars": {
    "ALLOWED_ORIGINS": "https://triplllllex.github.io,https://caihanlin.com"
  }
}
```

The README must provide exact commands:

```bash
npx wrangler login
npx wrangler d1 create yong-dai-site-reach --binding DB --update-config
npx wrangler d1 execute yong-dai-site-reach --remote --file=schema.sql
npm run deploy
```

- [ ] **Step 5: Run Worker tests**

Run: `cd analytics-worker && npm test`

Expected: all six endpoint tests PASS.

- [ ] **Step 6: Commit the Worker**

```bash
git add analytics-worker
git commit -m "Add privacy-friendly site reach worker"
```

---

### Task 2: Homepage research narrative and visual hierarchy

**Files:**
- Modify: `index.md`
- Modify: `assets/css/editorial-overrides.css`

**Interfaces:**
- Consumes: existing site color/type tokens and homepage grid.
- Produces: `.research-thesis`, `.thesis-flow`, `.experience-list`, and `.site-reach` markup for styling and later statistic updates.

- [ ] **Step 1: Capture the existing homepage structure**

Run:

```bash
rg -n "profile-intro|profile-thesis|home-section|news-table" index.md assets/css/editorial-overrides.css
```

Expected: current profile, thesis, section, and news selectors are present.

- [ ] **Step 2: Replace the introduction and thesis markup**

Use the approved biography:

```html
<p class="profile-summary">AI researcher whose work has consistently centered on model pre-training and post-training, spanning language models, multimodal foundation models, agents, and embodied intelligence. I conducted research at Microsoft and Tencent AI Lab, where I worked on the training and adaptation of foundation models.</p>
```

Keep the embodied-intelligence/world-model current-focus paragraph, then replace the single thesis paragraph with:

```html
<aside class="research-thesis" aria-labelledby="research-thesis-title">
  <p class="thesis-kicker" id="research-thesis-title">Research thesis</p>
  <div class="thesis-flow" aria-label="Experience leads through accumulation and compression to intelligence">
    <span>Experience</span><i aria-hidden="true"></i>
    <span>Accumulation &amp; compression</span><i aria-hidden="true"></i>
    <span>Intelligence</span>
  </div>
  <p>Scaling intelligence means scaling how much experience a model can compress. The gap between digital and physical intelligence lies in the limited accumulation and compression of action information and real-world interaction.</p>
</aside>
```

- [ ] **Step 3: Restructure Experience without changing facts**

Replace the plain `<ul>` with:

```html
<ol class="experience-list">
  <li><time>06/21 – 04/24</time><div><strong>Tencent AI Lab</strong><span>Research Intern and Researcher</span></div></li>
  <li><time>12/20 – 04/21</time><div><strong>Westlake University</strong><span>Visiting Student</span></div></li>
  <li><time>10/19 – 10/20</time><div><strong>Microsoft STCA NLPG</strong><span>Research Intern</span></div></li>
  <li><time>10/18 – 08/19</time><div><strong>Nuance collaboration</strong><span>Project Leader</span></div></li>
</ol>
```

- [ ] **Step 4: Add the public statistic fallback after News**

Add:

```html
<section class="site-reach" aria-labelledby="site-reach-title" data-reach>
  <p id="site-reach-title">Site reach</p>
  <dl>
    <div><dt>Visits</dt><dd data-reach-visits aria-live="polite">—</dd></div>
    <div><dt>Countries</dt><dd data-reach-countries aria-live="polite">—</dd></div>
  </dl>
</section>
```

- [ ] **Step 5: Implement scoped desktop and mobile styling**

Replace `.profile-thesis` with `.research-thesis` styles derived from existing tokens. The flow uses three uppercase mono labels separated by hairline connectors. Add structured Experience rows, refined roadmap hover/focus treatment, improved News vertical padding, and quiet statistics aligned to the content grid.

Required behavior:

```css
@media only screen and (max-width: 47.99em) {
  .thesis-flow { grid-template-columns: 1fr; }
  .thesis-flow i { width: 1px; height: 18px; }
  .experience-list li { grid-template-columns: 1fr; gap: 5px; }
}

@media (prefers-reduced-motion: reduce) {
  .page-home a,
  .research-map img { transition: none; }
}
```

Use `:focus-visible` alongside hover so links and the roadmap have visible keyboard focus.

- [ ] **Step 6: Rebuild the existing local static preview**

Because port 8123 serves `/private/tmp/site-preview` rather than a live Jekyll build, update its homepage body, CSS, and later JavaScript from the current source using the existing preview-refresh approach. Do not commit files under `/private/tmp`.

- [ ] **Step 7: Verify desktop and mobile layout**

Open `http://localhost:8123/index.html` and check 1280×900 and 390×844 viewports.

Expected:

- Biography, current focus, and thesis have a clear hierarchy.
- Thesis flow is horizontal on desktop and vertical on mobile.
- Experience facts are unchanged and easy to scan.
- Roadmap and News remain intact.
- The statistic values are em dashes before API configuration.
- No horizontal overflow appears.

- [ ] **Step 8: Commit homepage presentation**

```bash
git add index.md assets/css/editorial-overrides.css
git commit -m "Refine homepage research narrative"
```

---

### Task 3: Session-scoped statistic client

**Files:**
- Create: `assets/js/site-reach.js`
- Create: `analytics-worker/test/site-reach.test.js`
- Modify: `_includes/scripts.html`
- Modify: `_config.yml`

**Interfaces:**
- Consumes: `window.SITE_REACH_API`, `[data-reach-visits]`, `[data-reach-countries]`, `sessionStorage`, and `fetch`.
- Produces: one `POST /visit` per tab session and formatted statistic text on the homepage.

- [ ] **Step 1: Write failing browser-client tests with Node VM mocks**

Tests must execute the browser script in `node:vm` with mocked `document`, `fetch`, and `sessionStorage` and assert:

```js
test("records only once in one tab session", async () => {
  await runClient();
  await runClient();
  assert.equal(postCalls.length, 1);
});

test("renders aggregate values returned by the API", async () => {
  const view = await runClient({ stats: { visits: 1234, countries: 28 } });
  assert.equal(view.visits.textContent, "1,234");
  assert.equal(view.countries.textContent, "28");
});

test("keeps em dashes when fetch rejects", async () => {
  const view = await runClient({ reject: true });
  assert.equal(view.visits.textContent, "—");
  assert.equal(view.countries.textContent, "—");
});
```

- [ ] **Step 2: Run the client tests and confirm failure**

Run: `cd analytics-worker && npm test`

Expected: FAIL because `assets/js/site-reach.js` does not exist.

- [ ] **Step 3: Implement the dependency-free client**

The script must:

1. Exit when `window.SITE_REACH_API` is empty.
2. Read `site-reach-recorded` from `sessionStorage`.
3. If absent and hostname is not `localhost`/`127.0.0.1`, call `POST /visit`, then set the session key only after a successful response.
4. Otherwise call `GET /stats` when statistic elements exist.
5. Render only finite, non-negative integers through `Intl.NumberFormat`.
6. Catch storage and network errors without logging or changing the em dashes.

- [ ] **Step 4: Add conditional Liquid configuration**

Add to `_config.yml`:

```yaml
reach_api_url: ""
```

At the end of `_includes/scripts.html`, add:

```liquid
{% if site.reach_api_url %}
<script>window.SITE_REACH_API = {{ site.reach_api_url | jsonify }};</script>
<script src="/assets/js/site-reach.js" defer></script>
{% endif %}
```

This prevents network requests and leaves the homepage fallback intact before deployment.

- [ ] **Step 5: Run all local tests**

Run: `cd analytics-worker && npm test`

Expected: Worker and browser-client tests all PASS.

- [ ] **Step 6: Verify no configured-endpoint regressions**

Refresh `http://localhost:8123/index.html`.

Expected: no console errors, no statistic request, and both public values remain `—`.

- [ ] **Step 7: Commit the browser integration**

```bash
git add assets/js/site-reach.js analytics-worker/test/site-reach.test.js _includes/scripts.html _config.yml
git commit -m "Connect homepage to public reach statistics"
```

---

### Task 4: Deploy, configure, and end-to-end verify

**Files:**
- Modify: `analytics-worker/wrangler.jsonc`
- Modify: `_config.yml`
- Modify: `analytics-worker/README.md` only if deployment reveals a missing instruction.

**Interfaces:**
- Consumes: authenticated Wrangler session and deployed Worker URL.
- Produces: live public aggregate statistics on the production site.

- [ ] **Step 1: Authenticate Wrangler**

Run: `cd analytics-worker && npx wrangler login`

Expected: user completes Cloudflare browser authorization and `npx wrangler whoami` shows the active account.

- [ ] **Step 2: Create D1 and set its generated ID**

Run:

```bash
npx wrangler d1 create yong-dai-site-reach --binding DB --update-config
```

Expected: Wrangler creates the database and writes its generated `database_id` and `DB` binding directly into `wrangler.jsonc`.

- [ ] **Step 3: Apply the production schema**

Run:

```bash
npx wrangler d1 execute yong-dai-site-reach --remote --file=schema.sql
```

Expected: both `counters` and `country_visits` tables are created successfully.

- [ ] **Step 4: Deploy and smoke-test the Worker**

Run:

```bash
DEPLOY_OUTPUT="$(npm run deploy 2>&1)"
printf '%s\n' "$DEPLOY_OUTPUT"
export WORKER_URL="$(python3 -c 'import re,sys; urls=re.findall(r"https://[^\s]+\.workers\.dev", sys.stdin.read()); print(urls[-1] if urls else "")' <<<"$DEPLOY_OUTPUT")"
test -n "$WORKER_URL"
curl -i -H 'Origin: https://triplllllex.github.io' "$WORKER_URL/stats"
curl -i -X POST -H 'Origin: https://triplllllex.github.io' "$WORKER_URL/visit"
```

Expected: `/stats` returns 200 with numeric fields; `/visit` returns 200 and increments visits. A request with `Origin: https://example.com` returns 403.

- [ ] **Step 5: Configure the public endpoint**

Set the deployed origin printed by Wrangler in `_config.yml`. With `WORKER_URL` still exported:

```bash
python3 - <<'PY'
import os
from pathlib import Path

path = Path("../_config.yml")
text = path.read_text()
text = text.replace('reach_api_url: ""', f'reach_api_url: "{os.environ["WORKER_URL"]}"')
path.write_text(text)
PY
```

- [ ] **Step 6: Rebuild preview and perform browser verification**

Verify:

- The first non-local page load performs one POST.
- Refreshing in the same tab does not POST again.
- A new tab performs one new POST.
- Visits and Countries render formatted values.
- Worker outage leaves em dashes and causes no uncaught error.
- Publications still load and can trigger the session-scoped visit.

- [ ] **Step 7: Run final checks**

Run:

```bash
cd analytics-worker && npm test
cd .. && git diff --check
```

Check edited-file lints and browser console output. Expected: tests PASS, no whitespace errors, no new lints, and no console errors.

- [ ] **Step 8: Commit deployment configuration**

```bash
git add analytics-worker/wrangler.jsonc analytics-worker/README.md _config.yml
git commit -m "Configure deployed site reach service"
```
