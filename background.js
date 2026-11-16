const DEFAULT_COLORS = {
  base: "#282025",
  surface: "#553D44",
  accent: "#ECA8BD",
  text: "#CDD6F4"
};

const ALL_SITES_PATTERN = "*://*/*";
const PICKED_ROLES = new Set(["base", "surface", "accent", "text", "ignore"]);

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

function cleanRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.filter(rule =>
    rule &&
    typeof rule.selector === "string" &&
    rule.selector.length > 0 &&
    rule.selector.length <= 1000 &&
    PICKED_ROLES.has(rule.role)
  ).map(rule => ({
    selector: rule.selector,
    role: rule.role,
    label: typeof rule.label === "string" ? rule.label.slice(0, 80) : rule.selector.slice(0, 80)
  }));
}

function findTheme(host, themes) {
  const matches = Object.values(themes || {})
    .filter(item => item && item.domain && (host === item.domain || host.endsWith("." + item.domain)))
    .sort((a, b) => b.domain.length - a.domain.length);
  return matches[0] || null;
}

async function hasSiteAccess(domain) {
  try {
    if (await chrome.permissions.contains({ origins: [ALL_SITES_PATTERN] })) return true;
    return await chrome.permissions.contains({ origins: [permissionPattern(domain)] });
  } catch {
    return false;
  }
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
  const { themes = {}, siteRules = {} } = await chrome.storage.local.get(["themes", "siteRules"]);
  const stored = findTheme(host, themes);
  let colors = null;
  let rules = [];
  let autoEnabled = false;

  if (stored && stored.enabled && await hasSiteAccess(stored.domain)) {
    colors = validColors(stored.colors) || DEFAULT_COLORS;
    rules = cleanRules(siteRules[stored.domain]);
    autoEnabled = stored.autoEnabled !== false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: applyKaleidoTheme,
      args: [colors, rules, autoEnabled]
    });
  } catch {
    // Chrome internal pages and pages without site access cannot be changed.
  }
}

function applyKaleidoTheme(colors, rules, autoEnabled) {
  const styleSelector = "style[data-kaleido-theme]";
  const oldStyle = document.querySelector(styleSelector);
  if (window.__kaleidoObserver) {
    window.__kaleidoObserver.disconnect();
    window.__kaleidoObserver = null;
  }

  const autoMarks = "[data-kaleido-bg], [data-kaleido-fg], [data-kaleido-border], [data-kaleido-link]";
  const clearAutoMarks = element => {
    element.removeAttribute("data-kaleido-bg");
    element.removeAttribute("data-kaleido-fg");
    element.removeAttribute("data-kaleido-border");
    element.removeAttribute("data-kaleido-link");
  };

  if (!colors) {
    if (oldStyle) oldStyle.remove();
    document.querySelectorAll(`${autoMarks}, [data-kaleido-picked-role], [data-kaleido-root]`).forEach(element => {
      clearAutoMarks(element);
      element.removeAttribute("data-kaleido-picked-role");
      element.removeAttribute("data-kaleido-root");
    });
    return;
  }

  const safe = {};
  for (const key of ["base", "surface", "accent", "text"]) {
    const value = colors[key];
    safe[key] = typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_COLORS[key];
  }
  const safeRules = Array.isArray(rules) ? rules.filter(rule =>
    rule && typeof rule.selector === "string" &&
    ["base", "surface", "accent", "text", "ignore"].includes(rule.role)
  ) : [];

  document.querySelectorAll("[data-kaleido-picked-role]").forEach(element => element.removeAttribute("data-kaleido-picked-role"));

  function applyRules(root) {
    for (const rule of safeRules) {
      try {
        if (root instanceof Element && root.matches(rule.selector)) {
          root.setAttribute("data-kaleido-picked-role", rule.role);
        }
        if (root && typeof root.querySelectorAll === "function") {
          root.querySelectorAll(rule.selector).forEach(element => element.setAttribute("data-kaleido-picked-role", rule.role));
        }
      } catch {
        // A selector may stop being valid after the website changes its markup.
      }
    }
  }

  applyRules(document);
  document.querySelectorAll("html, body").forEach(element => {
    if (autoEnabled && !element.closest('[data-kaleido-picked-role="ignore"]')) {
      element.setAttribute("data-kaleido-root", "true");
    } else {
      element.removeAttribute("data-kaleido-root");
    }
  });

  const style = oldStyle || document.createElement("style");
  style.setAttribute("data-kaleido-theme", "true");
  style.textContent =
    ":root { --kaleido-base: " + safe.base +
    "; --kaleido-surface: " + safe.surface +
    "; --kaleido-accent: " + safe.accent +
    "; --kaleido-text: " + safe.text + "; }" +
    "html[data-kaleido-root='true'], body[data-kaleido-root='true'] { color-scheme: dark !important; background-color: var(--kaleido-base) !important; color: var(--kaleido-text) !important; }" +
    "[data-kaleido-bg='true'] { background-color: var(--kaleido-surface) !important; }" +
    "[data-kaleido-fg='true'] { color: var(--kaleido-text) !important; }" +
    "[data-kaleido-border='true'] { border-color: color-mix(in srgb, var(--kaleido-accent) 38%, transparent) !important; }" +
    "[data-kaleido-link='true'] { color: var(--kaleido-accent) !important; }" +
    "[data-kaleido-link='true']:hover { color: color-mix(in srgb, var(--kaleido-accent) 76%, white) !important; }" +
    "[data-kaleido-picked-role='base'] { background-color: var(--kaleido-base) !important; }" +
    "[data-kaleido-picked-role='surface'] { background-color: var(--kaleido-surface) !important; }" +
    "[data-kaleido-picked-role='accent'] { color: var(--kaleido-accent) !important; border-color: var(--kaleido-accent) !important; }" +
    "[data-kaleido-picked-role='text'] { color: var(--kaleido-text) !important; }" +
    "[data-kaleido-picked-role='ignore'], [data-kaleido-picked-role='ignore'] * { color: revert !important; background-color: revert !important; border-color: revert !important; }" +
    (autoEnabled ? "::selection { color: var(--kaleido-base) !important; background: var(--kaleido-accent) !important; }" : "");
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

  const isNeutral = info => info && info.saturation < 0.2;
  const ignoredByRule = element => element.closest('[data-kaleido-picked-role="ignore"]');

  function processElement(element) {
    if (!(element instanceof HTMLElement)) return;
    if (element.hasAttribute("data-kaleido-picker-ui")) return;
    const tag = element.tagName;
    if (["HTML", "BODY", "IMG", "VIDEO", "CANVAS", "SVG", "PICTURE", "SOURCE", "IFRAME", "SCRIPT", "STYLE", "LINK"].includes(tag)) return;

    clearAutoMarks(element);
    const pickedRole = element.getAttribute("data-kaleido-picked-role");
    if (pickedRole || ignoredByRule(element) || !autoEnabled) return;

    const computed = getComputedStyle(element);
    const background = colorInfo(computed.backgroundColor);
    if (isNeutral(background) && background.lightness > 0.78) {
      element.setAttribute("data-kaleido-bg", "true");
    }

    const foreground = colorInfo(computed.color);
    if (isNeutral(foreground) && foreground.lightness < 0.22) {
      element.setAttribute("data-kaleido-fg", "true");
    }

    if ((tag === "A" || element.getAttribute("role") === "link") && isNeutral(foreground) && foreground.lightness < 0.55) {
      element.setAttribute("data-kaleido-link", "true");
    }

    const borderValues = [computed.borderTopColor, computed.borderRightColor, computed.borderBottomColor, computed.borderLeftColor];
    if (borderValues.some(value => {
      const info = colorInfo(value);
      return isNeutral(info) && info.lightness > 0.42;
    })) {
      element.setAttribute("data-kaleido-border", "true");
    }
  }

  function scan(root) {
    if (root instanceof HTMLElement) applyRules(root);
    if (root instanceof HTMLElement) processElement(root);
    if (root && typeof root.querySelectorAll === "function") {
      applyRules(root);
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

async function applyPreview(message, sendResponse) {
  const tabId = Number(message.tabId);
  const colors = validColors(message.colors);
  if (!Number.isInteger(tabId) || !colors) {
    sendResponse({ ok: false });
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: applyKaleidoTheme,
      args: [colors, cleanRules(message.rules), message.autoEnabled !== false]
    });
    sendResponse({ ok: true });
  } catch {
    sendResponse({ ok: false });
  }
}

async function clearPreview(message, sendResponse) {
  try {
    const tab = await chrome.tabs.get(Number(message.tabId));
    await applyToTab(tab);
    sendResponse({ ok: true });
  } catch {
    sendResponse({ ok: false });
  }
}

async function savePickedRule(message, sender, sendResponse) {
  let url;
  try {
    url = new URL(sender.tab?.url || "");
  } catch {
    sendResponse({ ok: false });
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    sendResponse({ ok: false });
    return;
  }
  const selector = String(message.selector || "").trim();
  const role = String(message.role || "");
  if (!selector || selector.length > 1000 || !PICKED_ROLES.has(role)) {
    sendResponse({ ok: false });
    return;
  }

  const domain = normalizeHost(url.hostname);
  const { siteRules = {}, themes = {} } = await chrome.storage.local.get(["siteRules", "themes"]);
  const matchedTheme = findTheme(domain, themes);
  const ruleDomain = matchedTheme?.domain || domain;
  const rules = cleanRules(siteRules[ruleDomain]);
  const existing = rules.find(rule => rule.selector === selector);
  const label = typeof message.label === "string" ? message.label.slice(0, 80) : selector.slice(0, 80);
  if (existing) {
    existing.role = role;
    existing.label = label;
  } else rules.push({ selector, role, label });
  siteRules[ruleDomain] = rules;
  await chrome.storage.local.set({ siteRules });
  sendResponse({ ok: true, domain: ruleDomain, rules });
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
  if (areaName === "local" && (changes.themes || changes.siteRules)) void refreshOpenTabs();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;
  if (message.type === "kaleido-refresh") {
    refreshOpenTabs()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === "kaleido-preview") {
    void applyPreview(message, sendResponse);
    return true;
  }
  if (message.type === "kaleido-clear-preview") {
    void clearPreview(message, sendResponse);
    return true;
  }
  if (message.type === "kaleido-target-picked") {
    void savePickedRule(message, sender, sendResponse);
    return true;
  }
});

