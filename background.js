const DEFAULT_COLORS = {
  base: "#282025",
  surface: "#553D44",
  accent: "#ECA8BD",
  text: "#CDD6F4"
};

function normalizeHost(value) {
  let host = String(value || "").trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  host = host.replace(/:\d+$/, "").replace(/^www\./, "");
  return host;
}

function permissionPattern(domain) {
  const normalized = normalizeHost(domain);
  const hostPattern = normalized.includes(".") ? "*." + normalized : normalized;
  return "*://" + hostPattern + "/*";
}

function validColors(colors) {
  if (!colors || typeof colors !== "object") return null;
  const result = {};
  for (const key of ["base", "surface", "accent", "text"]) {
    const value = colors[key];
    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) return null;
    result[key] = value;
  }
  return result;
}

function findTheme(host, themes) {
  const matches = Object.values(themes || {})
    .filter(item => item && item.domain && (host === item.domain || host.endsWith("." + item.domain)))
    .sort((a, b) => b.domain.length - a.domain.length);
  return matches[0] || null;
}

async function applyToTab(tab) {
  if (!tab || !Number.isInteger(tab.id) || typeof tab.url !== "string") return;
  let url;
  try {
    url = new URL(tab.url);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const host = normalizeHost(url.hostname);
  const { themes = {} } = await chrome.storage.local.get("themes");
  const stored = findTheme(host, themes);
  let colors = null;
  if (stored && stored.enabled) {
    const safeColors = validColors(stored.colors) || DEFAULT_COLORS;
    const permitted = await chrome.permissions.contains({
      origins: [permissionPattern(stored.domain)]
    });
    if (permitted) colors = safeColors;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: applyKaleidoTheme,
      args: [colors]
    });
  } catch {
    // Chrome internal pages and pages without granted site access cannot be changed.
  }
}

function applyKaleidoTheme(colors) {
  const styleSelector = "style[data-kaleido-theme]";
  const oldStyle = document.querySelector(styleSelector);
  if (window.__kaleidoObserver) {
    window.__kaleidoObserver.disconnect();
    window.__kaleidoObserver = null;
  }

  const marked = "[data-kaleido-bg], [data-kaleido-fg], [data-kaleido-border]";
  if (!colors) {
    if (oldStyle) oldStyle.remove();
    document.querySelectorAll(marked).forEach(element => {
      element.removeAttribute("data-kaleido-bg");
      element.removeAttribute("data-kaleido-fg");
      element.removeAttribute("data-kaleido-border");
    });
    return;
  }

  const safe = {};
  for (const key of ["base", "surface", "accent", "text"]) {
    const value = colors[key];
    safe[key] = typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#282025";
  }

  const style = oldStyle || document.createElement("style");
  style.setAttribute("data-kaleido-theme", "true");
  style.textContent =
    ":root { color-scheme: dark !important; --kaleido-base: " + safe.base +
    "; --kaleido-surface: " + safe.surface +
    "; --kaleido-accent: " + safe.accent +
    "; --kaleido-text: " + safe.text + "; }" +
    "html, body { background-color: var(--kaleido-base) !important; color: var(--kaleido-text) !important; }" +
    "[data-kaleido-bg='true'] { background-color: var(--kaleido-surface) !important; }" +
    "[data-kaleido-fg='true'] { color: var(--kaleido-text) !important; }" +
    "[data-kaleido-border='true'] { border-color: color-mix(in srgb, var(--kaleido-accent) 38%, transparent) !important; }" +
    "a, [role='link'] { color: var(--kaleido-accent) !important; }" +
    "a:hover, [role='link']:hover { color: color-mix(in srgb, var(--kaleido-accent) 76%, white) !important; }" +
    "button, [role='button'], input, select, textarea { color: var(--kaleido-text) !important; accent-color: var(--kaleido-accent) !important; }" +
    "::selection { color: var(--kaleido-base) !important; background: var(--kaleido-accent) !important; }";
  if (!oldStyle) (document.head || document.documentElement).appendChild(style);

  function colorInfo(value) {
    const values = String(value).match(/[\d.]+/g);
    if (!values || values.length < 3) return null;
    const alpha = values.length > 3 ? Number(values[3]) : 1;
    if (alpha < 0.12) return null;
    const r = Number(values[0]) / 255;
    const g = Number(values[1]) / 255;
    const b = Number(values[2]) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
    return { lightness, saturation };
  }

  function isNeutral(info) {
    return info && info.saturation < 0.2;
  }

  function processElement(element) {
    if (!(element instanceof HTMLElement)) return;
    if (["HTML", "BODY", "IMG", "VIDEO", "CANVAS", "SVG", "PICTURE", "SOURCE", "IFRAME", "SCRIPT", "STYLE", "LINK"].includes(element.tagName)) return;
    if (element.hasAttribute("data-kaleido-theme")) return;

    element.removeAttribute("data-kaleido-bg");
    element.removeAttribute("data-kaleido-fg");
    element.removeAttribute("data-kaleido-border");

    const computed = getComputedStyle(element);
    const background = colorInfo(computed.backgroundColor);
    if (isNeutral(background) && background.lightness > 0.78) {
      element.setAttribute("data-kaleido-bg", "true");
    }

    const foreground = colorInfo(computed.color);
    if (isNeutral(foreground) && foreground.lightness < 0.22) {
      element.setAttribute("data-kaleido-fg", "true");
    }

    const borderValues = [
      computed.borderTopColor,
      computed.borderRightColor,
      computed.borderBottomColor,
      computed.borderLeftColor
    ];
    if (borderValues.some(value => {
      const info = colorInfo(value);
      return isNeutral(info) && info.lightness > 0.42;
    })) {
      element.setAttribute("data-kaleido-border", "true");
    }
  }

  function scan(root) {
    if (root instanceof HTMLElement) processElement(root);
    if (root && typeof root.querySelectorAll === "function") {
      root.querySelectorAll("*").forEach(processElement);
    }
  }

  const pending = new Set();
  let queued = false;
  function queue(root) {
    if (!(root instanceof HTMLElement)) return;
    pending.add(root);
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const roots = Array.from(pending);
      pending.clear();
      roots.forEach(scan);
    });
  }

  scan(document.body || document.documentElement);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "childList") {
        record.addedNodes.forEach(queue);
      } else if (record.target instanceof HTMLElement) {
        queue(record.target);
      }
    }
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
  }
  window.__kaleidoObserver = observer;
}

async function refreshOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => applyToTab(tab)));
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") void applyToTab(tab);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await applyToTab(await chrome.tabs.get(tabId));
  } catch {
    // The tab may close before it can be inspected.
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.themes) void refreshOpenTabs();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "kaleido-refresh") return;
  refreshOpenTabs()
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});
