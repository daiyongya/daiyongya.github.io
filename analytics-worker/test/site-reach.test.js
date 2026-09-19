import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const CLIENT = new URL("../../assets/js/site-reach.js", import.meta.url);
const API = "https://reach.example.test";
const EM_DASH = "—";

let fetchCalls = [];
let postCalls = [];
let session = new Map();

test.beforeEach(() => {
  fetchCalls = [];
  postCalls = [];
  session = new Map();
});

function element() {
  return { textContent: EM_DASH };
}

function storage(options) {
  if (options.storageThrows) {
    return {
      getItem() {
        throw new Error("storage disabled");
      },
      setItem() {
        throw new Error("storage disabled");
      },
    };
  }
  return {
    getItem(key) {
      return session.has(key) ? session.get(key) : null;
    },
    setItem(key, value) {
      session.set(key, String(value));
    },
    removeItem(key) {
      session.delete(key);
    },
  };
}

async function settle(pending) {
  for (let round = 0; round < 6; round += 1) {
    await Promise.allSettled(pending.slice());
    await new Promise(resolve => setImmediate(resolve));
  }
}

function startClient(options = {}) {
  const stats = "stats" in options ? options.stats : { visits: 0, countries: 0 };
  const view = { visits: element(), countries: element() };
  const pending = [];

  function fetchMock(url, init = {}) {
    const method = String(init.method || "GET").toUpperCase();
    fetchCalls.push({ url: String(url), method });
    if (method === "POST") {
      postCalls.push(String(url));
    }
    const promise = options.reject
      ? Promise.reject(new Error("network unavailable"))
      : Promise.resolve({
          ok: options.status ? options.status < 400 : true,
          status: options.status || 200,
          json: async () => stats,
        });
    pending.push(promise.catch(() => {}));
    return promise;
  }

  const sandbox = {
    SITE_REACH_API: "api" in options ? options.api : API,
    location: { hostname: options.hostname || "caihanlin.com" },
    document: {
      readyState: "complete",
      querySelector(selector) {
        if (options.elements === false) {
          return null;
        }
        if (selector === "[data-reach-visits]") {
          return view.visits;
        }
        if (selector === "[data-reach-countries]") {
          return view.countries;
        }
        return null;
      },
    },
    sessionStorage: storage(options),
    fetch: options.noFetch ? undefined : fetchMock,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  vm.runInContext(readFileSync(CLIENT, "utf8"), vm.createContext(sandbox), { filename: "site-reach.js" });
  return { view, pending };
}

async function runClient(options = {}) {
  const { view, pending } = startClient(options);
  await settle(pending);
  return view;
}

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
  assert.equal(view.visits.textContent, EM_DASH);
  assert.equal(view.countries.textContent, EM_DASH);
});

test("does nothing when no endpoint is configured", async () => {
  const view = await runClient({ api: "" });
  assert.equal(fetchCalls.length, 0);
  assert.equal(view.visits.textContent, EM_DASH);
});

test("does nothing when the browser has no fetch", async () => {
  const view = await runClient({ noFetch: true });
  assert.equal(view.visits.textContent, EM_DASH);
});

test("normalises a trailing slash on the configured endpoint", async () => {
  await runClient({ api: API + "/" });
  assert.deepEqual(postCalls, [API + "/visit"]);
});

test("reads statistics without recording a visit on localhost", async () => {
  const view = await runClient({ hostname: "localhost", stats: { visits: 7, countries: 3 } });
  assert.equal(postCalls.length, 0);
  assert.deepEqual(fetchCalls.map(call => call.method), ["GET"]);
  assert.match(fetchCalls[0].url, /\/stats$/);
  assert.equal(view.visits.textContent, "7");
});

test("reads statistics once the session has already recorded a visit", async () => {
  await runClient();
  const view = await runClient({ stats: { visits: 90, countries: 12 } });
  assert.deepEqual(fetchCalls.map(call => call.method), ["POST", "GET"]);
  assert.equal(view.countries.textContent, "12");
});

test("records only once when a second page loads before the visit resolves", async () => {
  const first = startClient();
  const second = startClient();
  await settle(first.pending.concat(second.pending));
  assert.equal(postCalls.length, 1);
});

test("retries the visit in the same session after a failed response", async () => {
  await runClient({ status: 500 });
  await runClient({ status: 500 });
  assert.equal(postCalls.length, 2);
});

test("ignores values that are not whole non-negative numbers", async () => {
  const view = await runClient({ stats: { visits: -5, countries: 3.5 } });
  assert.equal(view.visits.textContent, EM_DASH);
  assert.equal(view.countries.textContent, EM_DASH);
});

test("ignores non-numeric payload fields", async () => {
  const view = await runClient({ stats: { visits: "1234", countries: null } });
  assert.equal(view.visits.textContent, EM_DASH);
  assert.equal(view.countries.textContent, EM_DASH);
});

test("still records the visit when storage is unavailable", async () => {
  await runClient({ storageThrows: true });
  assert.equal(postCalls.length, 1);
});

test("skips the statistics read on pages without reach elements", async () => {
  session.set("site-reach-recorded", "1");
  await runClient({ elements: false });
  assert.equal(fetchCalls.length, 0);
});
