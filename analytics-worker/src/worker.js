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

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function text(body, status, headers) {
  return new Response(body, { status, headers });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = origin && allowedOrigins(env).has(origin);
    const headers = allowed ? corsHeaders(origin) : {};
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (!allowed) {
      return text("Forbidden", 403);
    }

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/stats") {
      if (method !== "GET") {
        return text("Method Not Allowed", 405, { ...headers, allow: "GET, OPTIONS" });
      }
      return json(await stats(env.DB), 200, headers);
    }

    if (url.pathname === "/visit") {
      if (method !== "POST") {
        return text("Method Not Allowed", 405, { ...headers, allow: "POST, OPTIONS" });
      }

      const statements = [
        env.DB.prepare(
          "INSERT INTO counters (name, value) VALUES ('visits', 1) ON CONFLICT(name) DO UPDATE SET value = value + 1"
        ),
      ];
      const country = validCountry(request.cf?.country);
      if (country) {
        statements.push(
          env.DB.prepare(
            "INSERT INTO country_visits (country_code, visits) VALUES (?, 1) ON CONFLICT(country_code) DO UPDATE SET visits = visits + 1"
          ).bind(country)
        );
      }
      await env.DB.batch(statements);
      return json(await stats(env.DB), 200, headers);
    }

    return text("Not Found", 404, headers);
  },
};
