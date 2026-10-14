/*!
 * Sonar Feedback button. Add to any site:
 *
 *   <script async src="https://YOUR-SONAR/embed.js" data-sonar="your-sonar-link-name"></script>
 *
 * Options (attributes on the script tag):
 *   data-sonar      which Sonar to show (required)
 *   data-label      button text, default "Feedback". data-label="" = no corner button (pop-ups and Sonar.open() only)
 *   data-position   bottom-right (default) | bottom-left | inline (put the button inside data-target)
 *   data-target     CSS selector for inline mode
 *   data-offset     extra px from the bottom, e.g. to sit above a chat bubble
 *   data-prompt     the text of the pop-up offer after Sonar.trigger()
 *
 * From the page:
 *   Sonar.trigger("finished_setup")  offers the pop-up (at most once every 30 days per person; "Not now" snoozes 7 days)
 *   Sonar.open() / Sonar.close()
 *   Sonar.on("done", fn)             someone finished answering
 *
 * Nothing loads until it's needed: the Sonar screen is created only when someone opens it,
 * inside an isolated frame, so this page's styles can't break it and its own can't leak out.
 */
(function () {
  "use strict";
  if (window.Sonar && window.Sonar.__sonar) return; // loaded twice (e.g. single-page app navigation)

  var script =
    document.currentScript ||
    (function () {
      var all = document.querySelectorAll("script[data-sonar]");
      return all[all.length - 1];
    })();
  if (!script) return;
  var slug = (script.getAttribute("data-sonar") || "").trim();
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
    console.warn("[Sonar] data-sonar is missing or not a valid Sonar link name.");
    return;
  }
  var ORIGIN = new URL(script.src, location.href).origin;
  var label = script.hasAttribute("data-label") ? script.getAttribute("data-label") : "Feedback";
  var position = script.getAttribute("data-position") || "bottom-right";
  var target = script.getAttribute("data-target");
  var offset = Math.max(0, Math.min(400, parseInt(script.getAttribute("data-offset") || "0", 10) || 0));
  var prompt = script.getAttribute("data-prompt") || "How’s it going? Tell us in about a minute. Just talk.";
  var DAY = 86400000;
  var CAP_DAYS = 30;
  var SNOOZE_DAYS = 7;

  // ---------------------------------------------------------------- memory (this person, this site)
  var KEY = "sonar:" + slug;
  var mem = {};
  function load() {
    try {
      mem = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch (e) {
      mem = mem || {}; // storage blocked: remember for this page view only
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(mem));
    } catch (e) {}
  }
  load();

  // ---------------------------------------------------------------- DOM, isolated in a shadow root
  var host = document.createElement("div");
  host.setAttribute("data-sonar-widget", "");
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var css =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:ui-sans-serif,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}" +
    ".fixed{position:fixed;z-index:2147483000}" +
    ".btn{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:10px 16px 10px 12px;background:#111315;color:#fff;font-size:14px;font-weight:600;line-height:1;cursor:pointer;box-shadow:0 10px 24px -10px rgba(17,19,21,.6);transition:transform .15s ease}" +
    ".btn:hover{transform:translateY(-1px)}" +
    ".btn:focus-visible,.pill:focus-visible,.x:focus-visible{outline:2px solid #3867ff;outline-offset:3px}" +
    ".nudge{width:min(300px,calc(100vw - 32px));background:#fff;color:#111315;border-radius:18px;padding:16px;box-shadow:0 18px 40px -16px rgba(17,19,21,.45);animation:rise .3s ease both}" +
    ".nudge p{margin:0;font-size:16px;font-weight:600;line-height:1.3}" +
    ".row{display:flex;gap:8px;margin-top:12px}" +
    ".pill{border:0;border-radius:999px;padding:9px 15px;font-size:14px;font-weight:600;cursor:pointer}" +
    ".dark{background:#111315;color:#fff}.plain{background:transparent;color:#4b524f}" +
    ".panel{width:380px;height:min(600px,calc(100vh - 110px));border-radius:24px;overflow:hidden;display:flex;flex-direction:column;background:#f5f7f6;box-shadow:0 30px 70px -24px rgba(17,19,21,.55);animation:rise .28s ease both}" +
    ".head{display:flex;align-items:center;gap:8px;padding:10px 10px 10px 16px;background:#f5f7f6;color:rgba(17,19,21,.6);font-size:13px;transition:background .3s,color .3s}" +
    ".panel.tone-dark .head{background:#111315;color:rgba(255,255,255,.6)}" +
    ".head span{flex:1}" +
    ".x{border:0;background:transparent;color:inherit;width:32px;height:32px;border-radius:50%;font-size:20px;line-height:1;cursor:pointer}" +
    ".x:hover{background:rgba(127,127,127,.15)}" +
    "iframe{flex:1;width:100%;border:0;background:#f5f7f6}" +
    ".msg{flex:1;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:24px;color:#111315}" +
    ".msg a{color:#3867ff}" +
    "@media (max-width:640px){.panel{position:fixed;left:0!important;right:0!important;bottom:0!important;width:100%;height:88vh;border-radius:22px 22px 0 0}}" +
    "@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}" +
    "@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}";
  var style = document.createElement("style");
  style.textContent = css;
  root.appendChild(style);

  var MARK =
    '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 7.2c-.9-1.2-2.2-1.8-3.6-1.8-2 0-3.4 1.1-3.4 2.7 0 3.6 7.3 2.2 7.3 6.4 0 1.9-1.7 3.2-3.9 3.2-1.6 0-3.1-.7-4-2" fill="none" stroke="#3867ff" stroke-width="2.2" stroke-linecap="round"/><path d="M4.5 9.5c-.6 1.6-.6 3.4 0 5M19.5 9.5c.6 1.6.6 3.4 0 5" fill="none" stroke="#55d6be" stroke-width="1.8" stroke-linecap="round"/></svg>';

  function corner(el, lift) {
    if (position === "inline") return;
    el.classList.add("fixed");
    el.style.bottom = 20 + offset + (lift || 0) + "px";
    if (position === "bottom-left") el.style.left = "20px";
    else el.style.right = "20px";
  }

  var button = null;
  var nudge = null;
  var panel = null;
  var frame = null;
  var frameReady = false;
  var returnFocus = null;
  var available = null; // null = still checking, true/false once known
  var waiters = [];
  var listeners = { done: [], open: [], close: [] };

  function emit(name) {
    (listeners[name] || []).forEach(function (fn) {
      try {
        fn();
      } catch (e) {}
    });
  }

  function mount() {
    if (host.isConnected) return;
    if (position === "inline" && target) {
      var t = document.querySelector(target);
      if (t) t.appendChild(host);
      else document.body.appendChild(host);
    } else document.body.appendChild(host);
  }

  function showButton() {
    if (!label || button) return;
    button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = MARK + "<span></span>";
    button.querySelector("span").textContent = label;
    button.addEventListener("click", function () {
      panel ? requestClose() : open();
    });
    corner(button);
    root.appendChild(button);
  }

  // ---------------------------------------------------------------- is Sonar there?
  // Never show a button that leads nowhere: check first, quietly.
  function check() {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, 4000);
    fetch(ORIGIN + "/api/public/" + encodeURIComponent(slug), { mode: "cors", credentials: "omit", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        settle(!!(d && d.session && d.session.status === "published"));
      })
      .catch(function () {
        settle(false);
      })
      .then(function () {
        clearTimeout(timer);
      });
  }

  function settle(ok) {
    available = ok;
    if (!ok) console.info("[Sonar] This Sonar isn't available right now, so the Feedback button is hidden.");
    else showButton();
    var w = waiters;
    waiters = [];
    w.forEach(function (fn) {
      fn(ok);
    });
  }

  function whenReady(fn) {
    if (available === null) waiters.push(fn);
    else fn(available);
  }

  // ---------------------------------------------------------------- the offer after Sonar.trigger()
  function trigger() {
    whenReady(function (ok) {
      var now = Date.now();
      load();
      if (!ok || panel || nudge) return;
      if (mem.answeredAt && now - mem.answeredAt < CAP_DAYS * DAY) return;
      if (mem.snoozedUntil && now < mem.snoozedUntil) return;
      if (mem.offeredAt && now - mem.offeredAt < CAP_DAYS * DAY) return;
      // Wait a beat so it doesn't land on top of the page's own success message.
      setTimeout(function () {
        if (panel || nudge) return;
        mem.offeredAt = Date.now();
        save();
        nudge = document.createElement("div");
        nudge.className = "nudge";
        nudge.setAttribute("role", "dialog");
        nudge.setAttribute("aria-label", "Feedback");
        nudge.innerHTML = '<p></p><div class="row"><button type="button" class="pill dark" data-a="yes">Sure</button><button type="button" class="pill plain" data-a="no">Not now</button></div>';
        nudge.querySelector("p").textContent = prompt;
        nudge.addEventListener("click", function (e) {
          var a = e.target && e.target.getAttribute && e.target.getAttribute("data-a");
          if (a === "yes") {
            removeNudge();
            open();
          } else if (a === "no") {
            mem.snoozedUntil = Date.now() + SNOOZE_DAYS * DAY;
            save();
            removeNudge();
          }
        });
        corner(nudge, button ? 56 : 0);
        root.appendChild(nudge);
      }, 1200);
    });
    return true;
  }

  function removeNudge() {
    if (nudge) nudge.remove();
    nudge = null;
  }

  // ---------------------------------------------------------------- the panel
  function open() {
    whenReady(function (ok) {
      if (!ok) {
        console.warn("[Sonar] Can't open: this Sonar isn't available right now.");
        return;
      }
      if (panel) return;
      removeNudge();
      returnFocus = document.activeElement;
      panel = document.createElement("div");
      panel.className = "panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Feedback");
      panel.innerHTML = '<div class="head">' + MARK + '<span>Feedback</span><button type="button" class="x" aria-label="Close feedback">&times;</button></div>';
      panel.querySelector(".x").addEventListener("click", requestClose);
      frame = document.createElement("iframe");
      frame.title = "Feedback";
      // The microphone has to be handed to the frame explicitly.
      frame.setAttribute("allow", "microphone; autoplay");
      frame.src = ORIGIN + "/e/" + encodeURIComponent(slug) + "?host=" + encodeURIComponent(location.origin);
      frameReady = false;
      var loadTimer = setTimeout(function () {
        if (!frameReady && panel) failed();
      }, 10000);
      frame.addEventListener("load", function () {
        clearTimeout(loadTimer);
        // A frame that loaded but never says hello was blocked (e.g. by this site's security policy).
        setTimeout(function () {
          if (!frameReady && panel) failed();
        }, 4000);
      });
      panel.appendChild(frame);
      corner(panel, button ? 56 : 0);
      root.appendChild(panel);
      if (button) button.setAttribute("aria-expanded", "true");
      var x = panel.querySelector(".x");
      if (x) x.focus();
      emit("open");
    });
  }

  function failed() {
    if (frame) frame.remove();
    frame = null;
    var box = document.createElement("div");
    box.className = "msg";
    box.innerHTML = "<strong>Feedback couldn’t load here.</strong><span>You can still answer in a new tab.</span>";
    var a = document.createElement("a");
    a.href = ORIGIN + "/s/" + encodeURIComponent(slug);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Open feedback in a new tab";
    box.appendChild(a);
    panel.appendChild(box);
  }

  /** Ask the Sonar screen first: if someone is mid-answer it checks with them. */
  function requestClose() {
    if (!panel) return;
    if (frame && frameReady && frame.contentWindow) frame.contentWindow.postMessage({ type: "sonar:request-close" }, ORIGIN);
    else destroy();
  }

  function destroy() {
    if (!panel) return;
    panel.remove(); // removing the frame also releases the microphone
    panel = null;
    frame = null;
    frameReady = false;
    if (button) {
      button.setAttribute("aria-expanded", "false");
      button.focus();
    } else if (returnFocus && returnFocus.focus) returnFocus.focus();
    emit("close");
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGIN || !frame || e.source !== frame.contentWindow) return;
    var type = e.data && e.data.type;
    if (type === "sonar:ready") frameReady = true;
    else if (type === "sonar:close") destroy();
    else if (type === "sonar:tone" && panel) panel.classList.toggle("tone-dark", !!e.data.dark);
    else if (type === "sonar:done") {
      load();
      mem.answeredAt = Date.now();
      save();
      emit("done");
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel) requestClose();
    else if (e.key === "Escape" && nudge) removeNudge();
  });

  window.Sonar = {
    __sonar: true,
    open: open,
    close: requestClose,
    trigger: trigger,
    on: function (name, fn) {
      if (listeners[name] && typeof fn === "function") listeners[name].push(fn);
    },
  };

  function start() {
    mount();
    check();
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
