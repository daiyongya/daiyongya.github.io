(function () {
  "use strict";

  var SESSION_KEY = "site-reach-recorded";
  var LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];
  var endpoint = typeof window.SITE_REACH_API === "string" ? window.SITE_REACH_API.trim().replace(/\/+$/, "") : "";

  if (!endpoint || typeof window.fetch !== "function") {
    return;
  }

  var visits = document.querySelector("[data-reach-visits]");
  var countries = document.querySelector("[data-reach-countries]");
  var formatter = new Intl.NumberFormat("en-US");

  function recorded() {
    try {
      return window.sessionStorage.getItem(SESSION_KEY) !== null;
    } catch (error) {
      return false;
    }
  }

  function remember() {
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch (error) {
      /* Private browsing or blocked storage only costs an extra visit. */
    }
  }

  function forget() {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* Nothing to undo when storage is blocked. */
    }
  }

  function write(element, value) {
    if (!element || typeof value !== "number" || !isFinite(value) || value < 0 || Math.floor(value) !== value) {
      return;
    }
    element.textContent = formatter.format(value);
  }

  function render(stats) {
    if (!stats || typeof stats !== "object") {
      return;
    }
    write(visits, stats.visits);
    write(countries, stats.countries);
  }

  function request(path, method) {
    return window.fetch(endpoint + path, { method: method, mode: "cors", cache: "no-store" }).then(function (response) {
      if (!response || !response.ok) {
        throw new Error("site reach unavailable");
      }
      return response.json();
    });
  }

  var local = LOCAL_HOSTS.indexOf(window.location.hostname) !== -1;
  var pending;

  if (!recorded() && !local) {
    /* Claim the session up front so navigating mid-flight cannot post a second visit,
       then release the claim on failure so the next page retries. */
    remember();
    pending = request("/visit", "POST").then(render, function (error) {
      forget();
      throw error;
    });
  } else if (visits || countries) {
    pending = request("/stats", "GET").then(render);
  } else {
    return;
  }

  pending.catch(function () {
    /* Leave the fallback values in place. */
  });
})();
