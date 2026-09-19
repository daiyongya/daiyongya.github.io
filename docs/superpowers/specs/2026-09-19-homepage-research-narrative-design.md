# Homepage Research Narrative and Public Reach Design

## Goal

Refine the homepage so it communicates one coherent research trajectory: model pre-training and post-training across language, multimodal, agentic, and embodied systems. Improve visual hierarchy without replacing the site's restrained editorial identity, and add a privacy-conscious public summary of site reach.

## Homepage copy

The opening biography will avoid duration claims because the requested two-year Microsoft summary conflicts with the current `10/19–10/20` timeline.

Proposed biography:

> AI researcher whose work has consistently centered on model pre-training and post-training, spanning language models, multimodal foundation models, agents, and embodied intelligence. I conducted research at Microsoft and Tencent AI Lab, where I worked on the training and adaptation of foundation models.

The current-focus paragraph remains, tightened only where needed for rhythm.

The research thesis becomes:

> Scaling intelligence means scaling how much experience a model can compress. The gap between digital and physical intelligence lies in the limited accumulation and compression of action information and real-world interaction.

This wording makes scale the amount of compressed experience rather than treating scale itself as the missing ingredient.

## Visual direction

Preserve the current Morandi palette, typography, square details, hairline dividers, and generous whitespace. Do not introduce gradients, rounded cards, decorative icons, or broad animation.

The thesis is the homepage's single signature element. It contains a quiet three-part flow:

`EXPERIENCE → ACCUMULATION & COMPRESSION → INTELLIGENCE`

The flow labels provide a visual model of the thesis rather than decoration. The explanatory sentence sits directly below it. On narrow screens the flow stacks vertically. Motion is limited to color/border transitions and is disabled when reduced motion is requested.

Additional refinements:

- Strengthen the hierarchy between biography, current focus, and thesis.
- Replace the plain Experience bullet list with semantic rows for period, institution, and role while preserving all existing facts.
- Improve link focus states and spacing.
- Refine Research Interests image framing and News row rhythm without changing their content.
- Keep the layout responsive and compatible with the legacy theme's high-specificity rules.

## Public visit summary

Add a compact `Site reach` row at the bottom of the homepage:

- `Visits` — cumulative recorded site visits.
- `Countries` — number of distinct valid country codes observed.

This is a public aggregate, not an analytics dashboard. It does not expose country names, individual visits, IP addresses, or recent activity.

### Counting semantics

- Count one visit per browser tab session across the site, using `sessionStorage` only as a duplicate guard.
- A visitor who opens a new tab or starts a new browser session may increment the total again.
- Track visits from all pages because users can enter through Publications.
- Exclude localhost and automated requests where practical.
- Existing Google Analytics and counter.dev integrations remain unchanged.

### Architecture

A small Cloudflare Worker exposes:

- `POST /visit` — validates the request origin, increments the global total and the Cloudflare-provided country bucket in D1, and returns the updated aggregate.
- `GET /stats` — returns only `{ visits, countries }`.
- `OPTIONS` — provides restricted CORS preflight handling.

D1 stores aggregate rows rather than raw request records:

- One global counter row for total visits.
- One row per country code containing its visit count.

No IP address, user agent, fingerprint, cookie, or persistent visitor identifier is stored. Origin allowlisting covers the production GitHub Pages hostname and the custom domain from `CNAME`; localhost is allowed only for development.

The homepage fetches `/stats` after load. The global layout sends `/visit` once per tab session and updates the homepage display when present. If the Worker is unavailable or configuration is absent, both values remain an accessible em dash and the rest of the page works normally.

## Configuration and deployment

Worker source, D1 schema, Wrangler configuration, and deployment instructions live in a focused `analytics-worker/` directory. The public Worker URL is supplied through `_config.yml`; no secret is committed to the repository.

Wrangler is available through `npx` but is not currently authenticated. Deployment requires one user-authorized `wrangler login`, followed by D1 creation/migration and Worker deployment. The static homepage can be completed and tested locally before that authorization.

## Verification

- Validate the homepage at desktop and mobile widths.
- Verify keyboard focus and reduced-motion behavior.
- Confirm existing homepage links, roadmap, and News content still render.
- Test Worker origin rejection, malformed country handling, visit increments, distinct-country counting, and aggregate-only responses.
- Confirm duplicate calls in one tab session do not increment twice.
- Confirm the page remains usable when the statistics endpoint is unreachable.
- Confirm no new browser console errors or broken assets.
