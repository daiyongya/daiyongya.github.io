(function () {
  "use strict";

  var form = document.querySelector("[data-contact]");
  if (!form || typeof window.fetch !== "function") {
    return;
  }

  var status = form.querySelector(".contact-status");
  var button = form.querySelector("button[type='submit']");
  var endpoint = "https://formsubmit.co/ajax/61c79f2e42385dd98e805ddf6ef7bac1";

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (form.querySelector("[name='_honey']").value) {
      return;
    }

    var body = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim(),
      _subject: "Message from caihanlin.com",
      _template: "table",
      _captcha: "false"
    };

    button.disabled = true;
    status.classList.remove("is-error");
    status.textContent = "Sending…";

    window.fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, data: data };
      });
    }).then(function (result) {
      var success = result.data && (result.data.success === true || result.data.success === "true");
      if (!result.ok || !success) {
        throw new Error((result.data && result.data.message) || "Send failed");
      }
      form.reset();
      status.textContent = "Sent.";
    }).catch(function () {
      status.classList.add("is-error");
      status.textContent = "Couldn’t send from here. Use the Email link above.";
    }).then(function () {
      button.disabled = false;
    });
  });
})();
