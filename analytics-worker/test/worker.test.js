import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";

const ALLOWED_ORIGIN = "https://caihanlin.com";

function createDb() {
  const counters = new Map();
  const countryVisits = new Map();

  function exec(sql, params) {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (/^INSERT INTO counters/i.test(text)) {
      counters.set("visits", (counters.get("visits") || 0) + 1);
      return;
    }
    if (/^INSERT INTO country_visits/i.test(text)) {
      const countryCode = params[0];
      countryVisits.set(countryCode, (countryVisits.get(countryCode) || 0) + 1);
    }
  }

  function query(sql) {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (/FROM counters/i.test(text)) {
      if (!counters.has("visits")) {
        return null;
      }
      return { value: counters.get("visits") };
    }
    if (/COUNT/i.test(text) && /FROM country_visits/i.test(text)) {
      return { count: countryVisits.size };
    }
    return null;
  }

  function statement(sql, params = []) {
    return {
      bind(...args) {
        return statement(sql, args);
      },
      async run() {
        exec(sql, params);
        return { success: true };
      },
      async first(column) {
        const row = query(sql);
        if (!row) {
          return null;
        }
        return column ? row[column] ?? null : row;
      },
    };
  }

  return {
    prepare(sql) {
      return statement(sql);
    },
    async batch(statements) {
      for (const stmt of statements) {
        await stmt.run();
      }
    },
  };
}

function env() {
  return {
    ALLOWED_ORIGINS: "https://triplllllex.github.io,https://caihanlin.com",
    DB: createDb(),
  };
}

function request(method, path, country, origin = ALLOWED_ORIGIN) {
  const req = new Request(`https://yong-dai-site-reach.test${path}`, {
    method,
    headers: { Origin: origin },
  });
  Object.defineProperty(req, "cf", { value: { country } });
  return req;
}

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
