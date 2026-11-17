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
    rule && rule.enabled !== false &&
    typeof rule.selector === "string" && rule.selector.length > 0 && rule.selector.length <= 1000
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

function summarizeGroups(rules) {
  const groups = [];
  const byId = new Map();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || typeof rule.groupId !== "string" || !rule.groupId) continue;
    let group = byId.get(rule.groupId);
    if (!group) {
      group = { id: rule.groupId, name: `Group ${groups.length + 1}`, colorId: rule.colorId || "", count: 0 };
      byId.set(rule.groupId, group);
      groups.push(group);
    }
    group.count += 1;
  }
  return groups;
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

async function applyToTab(tab, injectImmediately = true) {
  if (!tab || !Number.isInteger(tab.id) || typeof tab.url !== "string") return false;
  let url;
  try {
    url = new URL(tab.url);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = normalizeHost(url.hostname);
  const { siteRules = {}, colors = [], pausedSites = {} } = await chrome.storage.local.get(["siteRules", "colors", "pausedSites"]);
  const domain = matchingDomain(host, siteRules);
  const isPaused = Boolean(pausedSites[host] || pausedSites[domain || host]);
  const rules = domain && !isPaused && await hasSiteAccess(domain) ? cleanRules(siteRules[domain], cleanColorLibrary(colors)) : [];
  try {
    const currentTab = await chrome.tabs.get(tab.id);
    if (currentTab.url !== tab.url) return false;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: applyKaleidoRules,
      args: [rules],
      injectImmediately
    });
    return true;
  } catch {
    // Browser internal pages and pages without access cannot be changed.
    return false;
  }
}

function applyKaleidoRules(rules) {
  if (!document.documentElement) {
    document.addEventListener("DOMContentLoaded", () => applyKaleidoRules(rules), { once: true });
    return;
  }
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


async function focusAreaOnTab(message, sendResponse) {
  const tabId = Number(message.tabId);
  if (!Number.isInteger(tabId)) {
    sendResponse({ ok: false, count: 0 });
    return;
  }
  const selector = typeof message.selector === "string" && message.selector.length <= 1000 ? message.selector : "";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: previewKaleidoArea,
      args: [selector, message.active === true]
    });
    const count = Number(results?.[0]?.result) || 0;
    sendResponse({ ok: message.active !== true || count > 0, count });
  } catch {
    sendResponse({ ok: false, count: 0 });
  }
}

function previewKaleidoArea(selector, active) {
  const oldPreview = window.__kaleidoAreaPreview;
  if (oldPreview && typeof oldPreview.cleanup === "function") oldPreview.cleanup();
  window.__kaleidoAreaPreview = null;
  if (!active || !selector) return 0;

  let targets;
  try {
    targets = Array.from(document.querySelectorAll(selector)).slice(0, 80);
  } catch {
    return 0;
  }
  if (!targets.length) return 0;

  const host = document.createElement("div");
  host.setAttribute("data-kaleido-focus-preview", "true");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = ":host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none} .layer{position:fixed;inset:0;pointer-events:none} .box{position:fixed;box-sizing:border-box;border:3px solid #ECA8BD;border-radius:4px;background:rgba(236,168,189,.18);box-shadow:0 0 0 2px rgba(40,32,37,.9),0 0 18px rgba(236,168,189,.8);pointer-events:none}";
  const layer = document.createElement("div");
  layer.className = "layer";
  shadow.append(style, layer);
  (document.documentElement || document.body).appendChild(host);

  const update = () => {
    layer.replaceChildren();
    targets.forEach(target => {
      if (!target.isConnected) return;
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const box = document.createElement("div");
      box.className = "box";
      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      box.style.width = rect.width + "px";
      box.style.height = rect.height + "px";
      layer.appendChild(box);
    });
  };
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  window.addEventListener("scroll", update, true);
  window.addEventListener("resize", update);
  update();

  window.__kaleidoAreaPreview = {
    cleanup: () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      host.remove();
    }
  };
  return targets.length;
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

const HISTORY_SETTING_KEYS = ["colors", "siteRules", "pausedSites", "activeColorId", "collapsedGroups"];
const HISTORY_LIMIT = 15;

async function saveUndoableSettings(changes) {
  const stored = await chrome.storage.local.get([...HISTORY_SETTING_KEYS, "kaleidoUndo"]);
  const changedKeys = Object.keys(changes).filter(key => HISTORY_SETTING_KEYS.includes(key));
  const snapshot = {};
  for (const key of changedKeys) {
    snapshot[key] = stored[key] ?? (key === "colors" ? [] : key === "activeColorId" ? "" : {});
  }
  const history = Array.isArray(stored.kaleidoUndo) ? stored.kaleidoUndo.slice(-HISTORY_LIMIT + 1) : [];
  history.push(snapshot);
  await chrome.storage.local.set({ ...changes, kaleidoUndo: history, kaleidoRedo: [] });
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
  const requestedGroupId = typeof message.groupId === "string" ? message.groupId.trim() : "";
  let groupId = requestedGroupId;
  let colorId = String(message.colorId || "");
  const targets = Array.isArray(message.targets) ? message.targets.slice(0, 100).map(target => {
    const selector = typeof target?.selector === "string" ? target.selector.trim() : "";
    const label = typeof target?.label === "string" ? target.label.slice(0, 80) : selector.slice(0, 80);
    return { selector, label };
  }).filter(target => target.selector && target.selector.length <= 1000) : [];
  if (!targets.length) {
    sendResponse({ ok: false });
    return;
  }

  const domain = normalizeHost(url.hostname);
  const { siteRules = {}, colors = [] } = await chrome.storage.local.get(["siteRules", "colors"]);
  const rules = Array.isArray(siteRules[domain]) ? siteRules[domain].filter(rule => rule && typeof rule.selector === "string") : [];
  if (groupId) {
    const existingGroup = rules.find(rule => rule.groupId === groupId);
    if (!existingGroup) {
      sendResponse({ ok: false });
      return;
    }
    colorId = existingGroup.colorId;
  } else {
    if (!colorId || !cleanColorLibrary(colors).some(color => color.id === colorId)) {
      sendResponse({ ok: false });
      return;
    }
    groupId = `group-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }
  if (!cleanColorLibrary(colors).some(color => color.id === colorId)) {
    sendResponse({ ok: false });
    return;
  }
  for (const target of targets) {
    const existing = rules.find(rule => rule.selector === target.selector);
    if (existing) {
      existing.colorId = colorId;
      existing.label = target.label;
      existing.groupId = groupId;
      existing.enabled = true;
      delete existing.role;
    } else {
      rules.push({ ...target, colorId, groupId, enabled: true });
    }
  }
  siteRules[domain] = rules;
  await saveUndoableSettings({ siteRules, activeColorId: colorId });
  await applyToTab(sender.tab);
  const groupName = summarizeGroups(rules).find(group => group.id === groupId)?.name || "Group";
  sendResponse({ ok: true, domain, rules, count: targets.length, groupId, colorId, groupName });
}

chrome.runtime.onInstalled.addListener(() => { void refreshOpenTabs(); });
const earlyNavigationApplications = new Map();
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const navigationUrl = changeInfo.url || tab.url || "";
  if (changeInfo.status === "loading") {
    const task = applyToTab({ ...tab, url: navigationUrl }, true);
    earlyNavigationApplications.set(tabId, { url: navigationUrl, task });
    return;
  }
  if (changeInfo.status !== "complete") return;

  const earlyAttempt = earlyNavigationApplications.get(tabId);
  earlyNavigationApplications.delete(tabId);
  if (earlyAttempt?.url === navigationUrl) {
    void earlyAttempt.task.then(async applied => {
      if (applied) return;
      try {
        const currentTab = await chrome.tabs.get(tabId);
        if (currentTab.url === navigationUrl) await applyToTab(currentTab, true);
      } catch { /* Tab may have closed. */ }
    });
  } else {
    void applyToTab(tab, true);
  }
});
chrome.tabs.onRemoved.addListener(tabId => earlyNavigationApplications.delete(tabId));
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try { await applyToTab(await chrome.tabs.get(tabId)); } catch { /* Tab may close. */ }
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.siteRules || changes.colors || changes.pausedSites)) void refreshOpenTabs();
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
  if (message.type === "kaleido-focus-area") {
    void focusAreaOnTab(message, sendResponse);
    return true;
  }
  if (message.type === "kaleido-color-picked") {
    const value = typeof message.value === "string" ? message.value.toUpperCase() : "";
    if (!isColor(value)) {
      sendResponse({ ok: false });
      return false;
    }
    chrome.storage.local.set({ kaleidoSampledColor: value })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === "kaleido-targets-picked") {
    void savePickedAreas(message, sender, sendResponse);
    return true;
  }
  if (message.type === "kaleido-get-colors") {
    chrome.storage.local.get(["colors", "activeColorId", "siteRules"]).then(result => {
      let domain = "";
      try { domain = normalizeHost(new URL(sender.tab?.url || "").hostname); } catch { /* No website context. */ }
      sendResponse({
        colors: cleanColorLibrary(result.colors),
        activeColorId: result.activeColorId || "",
        groups: summarizeGroups(result.siteRules?.[domain])
      });
    }).catch(() => sendResponse({ colors: [], activeColorId: "" }));
    return true;
  }
});

