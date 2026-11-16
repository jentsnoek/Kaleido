const DEFAULT_COLORS = {
  base: "#282025",
  surface: "#553D44",
  accent: "#ECA8BD",
  text: "#CDD6F4"
};

const ALL_SITES_PATTERN = "*://*/*";
const PICKED_ROLES = new Set(["base", "surface", "accent", "text"]);

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
  if (stored && stored.enabled && await hasSiteAccess(stored.domain)) {
    colors = validColors(stored.colors) || DEFAULT_COLORS;
    rules = cleanRules(siteRules[stored.domain]);
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: applyKaleidoTheme,
      args: [colors, rules]
    });
  } catch {
    // Chrome internal pages and pages without site access cannot be changed.
  }
}

function applyKaleidoTheme(colors, rules) {
  const styleSelector = "style[data-kaleido-theme]";
  const oldStyle = document.querySelector(styleSelector);
  if (window.__kaleidoObserver) {
    window.__kaleidoObserver.disconnect();
    window.__kaleidoObserver = null;
  }

  const oldMarkers = [
    "[data-kaleido-picked-role]", "[data-kaleido-root]", "[data-kaleido-bg]",
    "[data-kaleido-fg]", "[data-kaleido-border]", "[data-kaleido-link]"
  ].join(",");
  document.querySelectorAll(oldMarkers).forEach(element => {
    element.removeAttribute("data-kaleido-picked-role");
    element.removeAttribute("data-kaleido-root");
    element.removeAttribute("data-kaleido-bg");
    element.removeAttribute("data-kaleido-fg");
    element.removeAttribute("data-kaleido-border");
    element.removeAttribute("data-kaleido-link");
  });

  if (!colors) {
    if (oldStyle) oldStyle.remove();
    return;
  }

  const safe = {};
  for (const key of ["base", "surface", "accent", "text"]) {
    const value = colors[key];
    safe[key] = typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_COLORS[key];
  }
  const safeRules = Array.isArray(rules) ? rules.filter(rule =>
    rule && typeof rule.selector === "string" && rule.selector.length <= 1000 &&
    ["base", "surface", "accent", "text"].includes(rule.role)
  ) : [];

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
        // A selector may stop matching after the website changes its markup.
      }
    }
  }

  if (!safeRules.length) {
    if (oldStyle) oldStyle.remove();
    return;
  }

  applyRules(document);
  const style = oldStyle || document.createElement("style");
  style.setAttribute("data-kaleido-theme", "true");
  style.textContent =
    ":root { --kaleido-base: " + safe.base +
    "; --kaleido-surface: " + safe.surface +
    "; --kaleido-accent: " + safe.accent +
    "; --kaleido-text: " + safe.text + "; }" +
    "[data-kaleido-picked-role='base'] { background-color: var(--kaleido-base) !important; }" +
    "[data-kaleido-picked-role='surface'] { background-color: var(--kaleido-surface) !important; }" +
    "[data-kaleido-picked-role='accent'] { color: var(--kaleido-accent) !important; border-color: var(--kaleido-accent) !important; }" +
    "[data-kaleido-picked-role='text'] { color: var(--kaleido-text) !important; }";
  if (!oldStyle) (document.head || document.documentElement).appendChild(style);

  function refreshRules(root) {
    if (root instanceof Element) root.removeAttribute("data-kaleido-picked-role");
    if (root && typeof root.querySelectorAll === "function") {
      root.querySelectorAll("[data-kaleido-picked-role]").forEach(element => element.removeAttribute("data-kaleido-picked-role"));
    }
    applyRules(root);
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "childList") {
        record.addedNodes.forEach(node => {
          if (node instanceof Element) applyRules(node);
        });
      } else if (record.target instanceof Element) {
        refreshRules(record.target);
      }
    }
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "id"]
    });
  }
  window.__kaleidoObserver = observer;
}

async function refreshOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => applyToTab(tab)));
}

chrome.runtime.onInstalled.addListener(() => {
  void refreshOpenTabs();
});

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
      args: [colors, cleanRules(message.rules)]
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

  const host = normalizeHost(url.hostname);
  const { siteRules = {}, themes = {} } = await chrome.storage.local.get(["siteRules", "themes"]);
  const matchedTheme = findTheme(host, themes);
  const domain = matchedTheme?.domain || host;
  const rules = cleanRules(siteRules[domain]);
  const existing = rules.find(rule => rule.selector === selector);
  const label = typeof message.label === "string" ? message.label.slice(0, 80) : selector.slice(0, 80);
  if (existing) {
    existing.role = role;
    existing.label = label;
  } else {
    rules.push({ selector, role, label });
  }
  siteRules[domain] = rules;
  await chrome.storage.local.set({ siteRules });
  sendResponse({ ok: true, domain, rules });
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

