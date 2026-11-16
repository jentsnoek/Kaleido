const ALL_SITES_PATTERN = "*://*/*";

function normalizeHost(value) {
  let host = String(value || "").trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  return host.replace(/:\d+$/, "").replace(/^www\./, "");
}

function permissionPattern(domain) {
  const host = normalizeHost(domain);
  return "*://" + (host.includes(".") ? "*." + host : host) + "/*";
}

function isColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function cleanColorLibrary(colors) {
  if (!Array.isArray(colors)) return [];
  return colors.filter(color =>
    color && typeof color.id === "string" && color.id.length <= 80 && isColor(color.value)
  ).map(color => ({ id: color.id, value: color.value.toUpperCase() }));
}

function cleanRules(rules, colors) {
  if (!Array.isArray(rules)) return [];
  return rules.filter(rule =>
    rule && typeof rule.selector === "string" && rule.selector.length > 0 && rule.selector.length <= 1000
  ).map(rule => {
    const savedColor = colors.find(color => color.id === rule.colorId);
    const value = savedColor?.value || rule.value;
    if (!isColor(value)) return null;
    return {
      selector: rule.selector,
      label: typeof rule.label === "string" ? rule.label.slice(0, 80) : rule.selector.slice(0, 80),
      value: value.toUpperCase()
    };
  }).filter(Boolean);
}

function matchingDomain(host, siteRules) {
  return Object.keys(siteRules || {})
    .filter(domain => Array.isArray(siteRules[domain]) && (host === domain || host.endsWith("." + domain)))
    .sort((a, b) => b.length - a.length)[0] || "";
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
  const { siteRules = {}, colors = [] } = await chrome.storage.local.get(["siteRules", "colors"]);
  const domain = matchingDomain(host, siteRules);
  const rules = domain && await hasSiteAccess(domain) ? cleanRules(siteRules[domain], cleanColorLibrary(colors)) : [];
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: applyKaleidoRules, args: [rules] });
  } catch {
    // Browser internal pages and pages without access cannot be changed.
  }
}

function applyKaleidoRules(rules) {
  if (window.__kaleidoObserver) {
    window.__kaleidoObserver.disconnect();
    window.__kaleidoObserver = null;
  }

  const markers = [
    "[data-kaleido-target]", "[data-kaleido-picked-role]", "[data-kaleido-root]",
    "[data-kaleido-bg]", "[data-kaleido-fg]", "[data-kaleido-border]", "[data-kaleido-link]"
  ].join(",");
  document.querySelectorAll(markers).forEach(element => {
    element.removeAttribute("data-kaleido-target");
    element.removeAttribute("data-kaleido-picked-role");
    element.removeAttribute("data-kaleido-root");
    element.removeAttribute("data-kaleido-bg");
    element.removeAttribute("data-kaleido-fg");
    element.removeAttribute("data-kaleido-border");
    element.removeAttribute("data-kaleido-link");
  });

  const oldStyle = document.querySelector("style[data-kaleido-styles], style[data-kaleido-theme]");
  if (oldStyle) oldStyle.remove();
  const isValidColor = value => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
  const safeRules = Array.isArray(rules) ? rules.filter(rule =>
    rule && typeof rule.selector === "string" && rule.selector.length <= 1000 &&
    isValidColor(rule.value)
  ) : [];
  if (!safeRules.length) return;

  function applyRules(root) {
    safeRules.forEach((rule, index) => {
      try {
        if (root instanceof Element && root.matches(rule.selector)) {
          root.setAttribute("data-kaleido-target", String(index));
        }
        if (root && typeof root.querySelectorAll === "function") {
          root.querySelectorAll(rule.selector).forEach(element => element.setAttribute("data-kaleido-target", String(index)));
        }
      } catch {
        // A selector may stop matching after the website changes its markup.
      }
    });
  }

  applyRules(document);
  const style = document.createElement("style");
  style.setAttribute("data-kaleido-styles", "true");
  style.textContent = safeRules.map((rule, index) =>
    `[data-kaleido-target="${index}"] { background-color: ${rule.value} !important; background-image: none !important; }`
  ).join("");
  (document.head || document.documentElement).appendChild(style);

  function refreshRules(root) {
    if (root instanceof Element) root.removeAttribute("data-kaleido-target");
    if (root && typeof root.querySelectorAll === "function") {
      root.querySelectorAll("[data-kaleido-target]").forEach(element => element.removeAttribute("data-kaleido-target"));
    }
    applyRules(root);
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "childList") {
        record.addedNodes.forEach(node => { if (node instanceof Element) applyRules(node); });
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

async function applyPreview(message, sendResponse) {
  const colors = cleanColorLibrary(message.colors);
  const rules = cleanRules(message.rules, colors);
  const tabId = Number(message.tabId);
  if (!Number.isInteger(tabId)) {
    sendResponse({ ok: false });
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: applyKaleidoRules, args: [rules] });
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

async function savePickedAreas(message, sender, sendResponse) {
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
  const colorId = String(message.colorId || "");
  const targets = Array.isArray(message.targets) ? message.targets.slice(0, 100).map(target => {
    const selector = typeof target?.selector === "string" ? target.selector.trim() : "";
    const label = typeof target?.label === "string" ? target.label.slice(0, 80) : selector.slice(0, 80);
    return { selector, label };
  }).filter(target => target.selector && target.selector.length <= 1000) : [];
  if (!targets.length || !colorId) {
    sendResponse({ ok: false });
    return;
  }

  const domain = normalizeHost(url.hostname);
  const { siteRules = {}, colors = [] } = await chrome.storage.local.get(["siteRules", "colors"]);
  if (!cleanColorLibrary(colors).some(color => color.id === colorId)) {
    sendResponse({ ok: false });
    return;
  }
  const rules = Array.isArray(siteRules[domain]) ? siteRules[domain].filter(rule => rule && typeof rule.selector === "string") : [];
  for (const target of targets) {
    const existing = rules.find(rule => rule.selector === target.selector);
    if (existing) {
      existing.colorId = colorId;
      existing.label = target.label;
      delete existing.role;
    } else {
      rules.push({ ...target, colorId });
    }
  }
  siteRules[domain] = rules;
  await chrome.storage.local.set({ siteRules });
  await applyToTab(sender.tab);
  sendResponse({ ok: true, domain, rules, count: targets.length });
}

chrome.runtime.onInstalled.addListener(() => { void refreshOpenTabs(); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") void applyToTab(tab);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try { await applyToTab(await chrome.tabs.get(tabId)); } catch { /* Tab may close. */ }
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.siteRules || changes.colors)) void refreshOpenTabs();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;
  if (message.type === "kaleido-refresh") {
    refreshOpenTabs().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
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
  if (message.type === "kaleido-targets-picked") {
    void savePickedAreas(message, sender, sendResponse);
    return true;
  }
  if (message.type === "kaleido-get-colors") {
    chrome.storage.local.get(["colors", "activeColorId"]).then(result => {
      sendResponse({ colors: cleanColorLibrary(result.colors), activeColorId: result.activeColorId || "" });
    }).catch(() => sendResponse({ colors: [], activeColorId: "" }));
    return true;
  }
});

