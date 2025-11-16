/*! THE PET SOCIETY — Universal Tracking (GA4, Meta, Sentry, CF) v1.0 */
(function () {
  "use strict";

  // ---------- Guard idempotence
  if (window.__TPS_TRACKING_LOADED__) return;
  window.__TPS_TRACKING_LOADED__ = true;

  // ---------- Tiny helpers
  const now = () => Date.now();
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts || false);
  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const once = (fn) => {
    let done = false;
    return (...a) => { if (!done) { done = true; try { fn(...a); } catch(_) {} } };
  };
  const safe = (fn) => { try { return fn(); } catch (_) {} };

  // ---------- Read config injected in theme.liquid (see <script id="tps-integrations">)
  function readConfig() {
    const el = document.getElementById("tps-integrations");
    let cfg = {};
    if (el) {
      try { cfg = JSON.parse(el.textContent || "{}"); } catch (_) {}
    }
    return {
      ga4: cfg.ga4 || "",
      meta_pixel_id: cfg.meta_pixel_id || "",
      sentry_dsn: cfg.sentry_dsn || "",
      cloudflare_beacon_token: cfg.cloudflare_beacon_token || "",
      clarity_id: cfg.clarity_id || ""
    };
  }
  const CFG = readConfig();

  // ---------- Global namespace
  const TPS = (window.TPS = window.TPS || {});
  TPS.integrations = Object.assign({}, TPS.integrations || {}, CFG);

  // ---------- Queues (fire-and-forget even if libs late-load)
  const q = { gtag: [], fbq: [] };
  function flushQueues() {
    if (window.gtag && q.gtag.length) { q.gtag.splice(0).forEach(args => window.gtag(...args)); }
    if (window.fbq && q.fbq.length) { q.fbq.splice(0).forEach(args => window.fbq(...args)); }
  }
  const tryFlush = () => { flushQueues(); setTimeout(flushQueues, 1500); };

  // ---------- Core: trackEvent
  TPS.trackEvent = function (name, data) {
    if (!name) return;
    const payload = Object.assign({ event: name, ts: now() }, data || {});
    if (localStorage.getItem("TPS_DEBUG") === "1") {
      // eslint-disable-next-line no-console
      console.log("🧩 TPS.trackEvent →", JSON.parse(JSON.stringify(payload)));
    }

    // GA4
    if (CFG.ga4 && window.gtag) {
      window.gtag("event", name, payload);
    } else if (CFG.ga4) {
      q.gtag.push(["event", name, payload]);
    }

    // Meta Pixel
    if (CFG.meta_pixel_id && window.fbq) {
      window.fbq("trackCustom", name, payload);
    } else if (CFG.meta_pixel_id) {
      q.fbq.push(["trackCustom", name, payload]);
    }

    // Sentry breadcrumb (if Sentry present)
    safe(() => window.Sentry && window.Sentry.addBreadcrumb({
      category: "tps.event", level: "info", message: name, data: payload
    }));
  };

  // ---------- Auto hooks (lightweight)
  function autoHooks() {
    // 1) Newsletter forms: <form data-newsletter ...>
    $all("form[data-newsletter]").forEach(form => {
      on(form, "submit", () => {
        const email = safe(() => (new FormData(form)).get("email")) || "";
        TPS.trackEvent("Newsletter Signup", {
          email: String(email || "").toLowerCase(),
          location: form.getAttribute("data-location") || "unknown"
        });
      });
    });

    // 2) Product recommendations (data attributes on links)
    // Example in Liquid:
    // <a href="{{ product.url }}"
    //    data-rec-product-id="{{ product.id }}"
    //    data-rec-position="{{ forloop.index }}"
    //    data-rec-source="homepage">
    //    {{ product.title }}
    // </a>
    on(document, "click", (e) => {
      const a = e.target.closest("a[data-rec-product-id]");
      if (!a) return;
      TPS.trackEvent("Product Recommended Click", {
        product_id: a.getAttribute("data-rec-product-id"),
        position: Number(a.getAttribute("data-rec-position") || 0),
        source: a.getAttribute("data-rec-source") || "recommendations"
      });
    }, { capture: true });

    // 3) Generic Add to Cart buttons (opt-in with data-track-add)
    // <button data-track-add data-product-id="{{ product.selected_or_first_available_variant.id }}">
    // JS side sends event – you keep your cart logic.
    on(document, "click", (e) => {
      const btn = e.target.closest("[data-track-add]");
      if (!btn) return;
      TPS.trackEvent("Add to Cart", {
        product_id: btn.getAttribute("data-product-id") || "",
        product_name: btn.getAttribute("data-product-name") || "",
        price: Number(btn.getAttribute("data-price") || 0),
        source: btn.getAttribute("data-source") || "button"
      });
    }, { capture: true });

    // 4) Basic PageView (helps Meta/GA4 when SPA-ish themes)
    TPS.trackEvent("Page View", {
      path: location.pathname,
      title: document.title
    });
  }

  // ---------- Init once DOM is ready
  const init = once(function () {
    autoHooks();

    // ============= Microsoft Clarity (si ID présent) =============
    if (CFG.clarity_id) {
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", CFG.clarity_id);
      console.log("🪟 Clarity loaded:", CFG.clarity_id);
    }

    tryFlush();
  });

  if (document.readyState === "loading") {
    on(document, "DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
