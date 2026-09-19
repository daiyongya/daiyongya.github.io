import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";

const SCHEMA = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "schema.sql"), "utf8");
const ALLOWED_ORIGIN = "https://caihanlin.com";

function d1(database) {
  function statement(sql, params = []) {
    return {
      bind(...args) {
        return statement(sql, args);
      },
      async run() {
        const { changes } = database.prepare(sql).run(...params);
        return { success: true, meta: { changes } };
      },
      async first(column) {
        const row = database.prepare(sql).get(...params);
        if (row === undefined) {
          return null;
        }
        return column === undefined ? row : row[column] ?? null;
      },
    };
  }

  return {
    prepare(sql) {
      return statement(sql);
    },
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const stmt of statements) {
          results.push(await stmt.run());
        }
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function env() {
  const database = new DatabaseSync(":memory:");
  database.exec(SCHEMA);
  return {
    ALLOWED_ORIGINS: "https://triplllllex.github.io,https://caihanlin.com",
    DB: d1(database),
    database,
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

function rows(testEnv, sql) {
  return testEnv.database
    .prepare(sql)
    .all()
    .map(row => ({ ...row }));
}

test("schema.sql applies to SQLite and reports zeroed aggregates", async () => {
  const testEnv = env();
  const response = await worker.fetch(request("GET", "/stats"), testEnv);
  assert.deepEqual(await response.json(), { visits: 0, countries: 0 });
  assert.deepEqual(rows(testEnv, "SELECT * FROM counters"), []);
  assert.deepEqual(rows(testEnv, "SELECT * FROM country_visits"), []);
});

test("POST /visit upserts a first visit in SQLite", async () => {
  const testEnv = env();
  const response = await worker.fetch(request("POST", "/visit", "US"), testEnv);
  assert.deepEqual(await response.json(), { visits: 1, countries: 1 });
  assert.deepEqual(rows(testEnv, "SELECT name, value FROM counters"), [{ name: "visits", value: 1 }]);
  assert.deepEqual(rows(testEnv, "SELECT country_code, visits FROM country_visits"), [
    { country_code: "US", visits: 1 },
  ]);
});

test("repeated countries upsert the same row in SQLite", async () => {
  const testEnv = env();
  await worker.fetch(request("POST", "/visit", "US"), testEnv);
  const response = await worker.fetch(request("POST", "/visit", "US"), testEnv);
  assert.deepEqual(await response.json(), { visits: 2, countries: 1 });
  assert.deepEqual(rows(testEnv, "SELECT name, value FROM counters"), [{ name: "visits", value: 2 }]);
  assert.deepEqual(rows(testEnv, "SELECT country_code, visits FROM country_visits"), [
    { country_code: "US", visits: 2 },
  ]);
});

test("a second country inserts a second SQLite row", async () => {
  const testEnv = env();
  await worker.fetch(request("POST", "/visit", "US"), testEnv);
  const response = await worker.fetch(request("POST", "/visit", "JP"), testEnv);
  assert.deepEqual(await response.json(), { visits: 2, countries: 2 });
  assert.deepEqual(rows(testEnv, "SELECT country_code, visits FROM country_visits ORDER BY country_code"), [
    { country_code: "JP", visits: 1 },
    { country_code: "US", visits: 1 },
  ]);
});

test("unknown country codes leave country_visits empty in SQLite", async () => {
  const testEnv = env();
  const response = await worker.fetch(request("POST", "/visit", "XX"), testEnv);
  assert.deepEqual(await response.json(), { visits: 1, countries: 0 });
  assert.deepEqual(rows(testEnv, "SELECT * FROM country_visits"), []);
});

test("a failing statement rolls back the whole batch", async () => {
  const testEnv = env();
  await assert.rejects(() =>
    testEnv.DB.batch([
      testEnv.DB.prepare(
        "INSERT INTO counters (name, value) VALUES ('visits', 1) ON CONFLICT(name) DO UPDATE SET value = value + 1"
      ),
      testEnv.DB.prepare("INSERT INTO country_visits (country_code, visits) VALUES (?, NULL)").bind("US"),
    ])
  );
  assert.deepEqual(rows(testEnv, "SELECT * FROM counters"), []);
  assert.deepEqual(rows(testEnv, "SELECT * FROM country_visits"), []);
  assert.deepEqual(await (await worker.fetch(request("GET", "/stats"), testEnv)).json(), {
    visits: 0,
    countries: 0,
  });
});
