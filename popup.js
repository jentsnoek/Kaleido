const DEFAULT_COLORS = [
  { id: "builtin-dark-plum", name: "Dark plum", value: "#282025", builtIn: true },
  { id: "builtin-plum", name: "Plum", value: "#553D44", builtIn: true },
  { id: "builtin-rose", name: "Rose", value: "#ECA8BD", builtIn: true },
  { id: "builtin-periwinkle", name: "Periwinkle", value: "#CDD6F4", builtIn: true }
];
const DEFAULT_ROLE_VALUES = {
  base: "#282025",
  surface: "#553D44",
  accent: "#ECA8BD",
  text: "#CDD6F4"
};
const ALL_SITES_PATTERN = "*://*/*";
const colorLibrary = document.getElementById("colorLibrary");
const colorCount = document.getElementById("colorCount");
const siteName = document.getElementById("siteName");
const statusNode = document.getElementById("status");
const targetList = document.getElementById("targetList");
const pickAreaButton = document.getElementById("pickArea");
const newColorValue = document.getElementById("newColorValue");
const newColorName = document.getElementById("newColorName");
const saveColorButton = document.getElementById("saveColor");

let activeHost = "";
let activeTabId = null;
let colors = [];
let siteRules = {};
let activeColorId = "";
let previewDirty = false;
let previewTimer = null;
let hasAllSitesPermission = false;

function normalizeHost(value) {
  let host = String(value || "").trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  return host.replace(/:\d+$/, "").replace(/^www\./, "");
}

function isHex(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function findColor(id) {
  return colors.find(color => color.id === id) || colors[0] || null;
}

function addColor(value, name = "Saved color", id = "") {
  if (!isHex(value)) return null;
  const hex = value.toUpperCase();
  const safeId = id || `color-${hex.slice(1).toLowerCase()}`;
  const existingId = colors.find(color => color.id === safeId);
  if (existingId) {
    existingId.name = String(name || existingId.name || "Saved color").slice(0, 32);
    existingId.value = hex;
    return existingId;
  }
  if (!id) {
    const found = colors.find(color => color.value.toUpperCase() === hex);
    if (found) return found;
  }
  const color = { id: safeId, name: String(name || "Saved color").slice(0, 32), value: hex };
  colors.push(color);
  return color;
}

function showStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", isError);
}

function schedulePreview() {
  if (!activeTabId || !activeHost) return;
  previewDirty = true;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    try {
      await chrome.runtime.sendMessage({
        type: "kaleido-preview",
        tabId: activeTabId,
        colors,
        rules: siteRules[activeHost] || []
      });
    } catch {
      // Browser internal pages cannot be previewed.
    }
  }, 50);
}

function colorUseCount(colorId) {
  return Object.values(siteRules).reduce((count, rules) =>
    count + (Array.isArray(rules) ? rules.filter(rule => rule?.colorId === colorId).length : 0), 0);
}

function renderColorLibrary() {
  colorLibrary.replaceChildren();
  colorCount.textContent = String(colors.length);
  for (const color of colors) {
    const card = document.createElement("div");
    card.className = "color-card" + (color.id === activeColorId ? " selected" : "");

    const select = document.createElement("button");
    select.type = "button";
    select.className = "color-select";
    select.setAttribute("aria-pressed", String(color.id === activeColorId));
    select.title = "Select this color for the next area you pick";
    const swatch = document.createElement("span");
    swatch.className = "color-swatch";
    swatch.style.backgroundColor = color.value;
    const copy = document.createElement("span");
    copy.className = "color-copy";
    const name = document.createElement("span");
    name.className = "color-name";
    name.textContent = color.name;
    const hex = document.createElement("span");
    hex.className = "color-hex";
    hex.textContent = color.value.toUpperCase();
    copy.append(name, hex);
    select.append(swatch, copy);
    select.addEventListener("click", async () => {
      activeColorId = color.id;
      await chrome.storage.local.set({ activeColorId });
      renderColorLibrary();
      showStatus(`Selected ${color.name} for the next area.`);
    });

    const tools = document.createElement("div");
    tools.className = "color-tools";
    const edit = document.createElement("input");
    edit.className = "edit-color";
    edit.type = "color";
    edit.value = color.value;
    edit.title = `Change ${color.name}`;
    edit.setAttribute("aria-label", `Change ${color.name}`);
    edit.addEventListener("input", () => {
      color.value = edit.value.toUpperCase();
      hex.textContent = color.value;
      swatch.style.backgroundColor = color.value;
      schedulePreview();
    });
    edit.addEventListener("change", async () => {
      await chrome.storage.local.set({ colors });
      await refreshTabs();
      showStatus(`Updated ${color.name}.`);
    });
    tools.appendChild(edit);

    if (!color.builtIn) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-color";
      remove.textContent = "Delete";
      const used = colorUseCount(color.id) > 0;
      remove.disabled = used;
      remove.title = used ? "Change or remove areas using this color first" : `Delete ${color.name}`;
      remove.setAttribute("aria-label", `Delete ${color.name}`);
      remove.addEventListener("click", async () => {
        if (colorUseCount(color.id)) return;
        colors = colors.filter(item => item.id !== color.id);
        if (activeColorId === color.id) activeColorId = colors[0]?.id || "";
        await chrome.storage.local.set({ colors, activeColorId });
        renderColorLibrary();
        showStatus(`Deleted ${color.name}.`);
      });
      tools.appendChild(remove);
    }

    card.append(select, tools);
    colorLibrary.appendChild(card);
  }
}

function renderTargets() {
  targetList.replaceChildren();
  if (!activeHost) {
    targetList.innerHTML = '<p class="target-empty">Open a webpage to pick areas.</p>';
    return;
  }
  const rules = siteRules[activeHost] || [];
  if (!rules.length) {
    targetList.innerHTML = '<p class="target-empty">No areas picked on this site yet.</p>';
    return;
  }

  for (const rule of rules) {
    const card = document.createElement("div");
    card.className = "target-card";
    const label = document.createElement("div");
    label.className = "target-name";
    label.textContent = rule.label || rule.selector;

    const select = document.createElement("select");
    select.setAttribute("aria-label", `Color for ${rule.label || "picked area"}`);
    for (const color of colors) {
      const option = document.createElement("option");
      option.value = color.id;
      option.textContent = `${color.name} - ${color.value.toUpperCase()}`;
      select.appendChild(option);
    }
    select.value = colors.some(color => color.id === rule.colorId) ? rule.colorId : (activeColorId || colors[0]?.id || "");
    select.addEventListener("change", async () => {
      siteRules[activeHost] = (siteRules[activeHost] || []).map(item =>
        item.selector === rule.selector ? { ...item, colorId: select.value } : item
      );
      await chrome.storage.local.set({ siteRules });
      await refreshTabs();
      schedulePreview();
      renderColorLibrary();
      showStatus("Updated this area's color.");
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.title = "Remove this picked area";
    remove.setAttribute("aria-label", `Delete ${rule.label || "picked area"}`);
    remove.addEventListener("click", async () => {
      siteRules[activeHost] = (siteRules[activeHost] || []).filter(item => item.selector !== rule.selector);
      await chrome.storage.local.set({ siteRules });
      await refreshTabs();
      schedulePreview();
      renderTargets();
      renderColorLibrary();
      showStatus("Removed this area.");
    });
    card.append(label, select, remove);
    targetList.appendChild(card);
  }
}

async function refreshTabs() {
  try { await chrome.runtime.sendMessage({ type: "kaleido-refresh" }); } catch { /* A tab may close. */ }
}

async function saveColor() {
  const name = newColorName.value.trim();
  if (!name) {
    showStatus("Give this color a name first.", true);
    newColorName.focus();
    return;
  }
  const hex = newColorValue.value.toUpperCase();
  let color = colors.find(item => item.value.toUpperCase() === hex);
  if (color) {
    activeColorId = color.id;
    showStatus(`${hex} is already saved. Selected it.`);
  } else {
    color = { id: `color-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, name: name.slice(0, 32), value: hex };
    colors.push(color);
    activeColorId = color.id;
    showStatus(`Saved ${color.name}.`);
  }
  newColorName.value = "";
  await chrome.storage.local.set({ colors, activeColorId });
  renderColorLibrary();
}

async function pickArea() {
  if (!activeTabId || !activeHost) {
    showStatus("Open the webpage you want to color first.", true);
    return;
  }
  if (!colors.length) {
    showStatus("Save at least one color first.", true);
    return;
  }
  if (!hasAllSitesPermission) {
    try {
      hasAllSitesPermission = await chrome.permissions.request({ origins: [ALL_SITES_PATTERN] });
    } catch {
      hasAllSitesPermission = false;
    }
    if (!hasAllSitesPermission) {
      showStatus("Kaleido needs website access before it can save picked areas.", true);
      return;
    }
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: activeTabId }, files: ["picker.js"] });
    showStatus("Move over the page, click the area, then confirm it.");
  } catch {
    showStatus("This page does not allow Kaleido's area picker.", true);
  }
}

function migrateRules(oldRules, oldThemes) {
  const migrated = {};
  const roleKeys = { base: "base", surface: "surface", accent: "accent", text: "text" };
  for (const [domain, rules] of Object.entries(oldRules || {})) {
    if (!Array.isArray(rules)) continue;
    migrated[domain] = rules.flatMap(rule => {
      if (!rule || typeof rule.selector !== "string") return [];
      if (rule.colorId && colors.some(color => color.id === rule.colorId)) return [{ ...rule }];
      let value = isHex(rule.value) ? rule.value : "";
      if (!value && roleKeys[rule.role]) value = oldThemes?.[domain]?.colors?.[roleKeys[rule.role]] || "";
      if (!value && roleKeys[rule.role]) value = DEFAULT_ROLE_VALUES[roleKeys[rule.role]] || "";
      if (!isHex(value)) return [];
      const color = addColor(value, "Saved color");
      return color ? [{ selector: rule.selector, label: rule.label || rule.selector, colorId: color.id }] : [];
    });
  }
  return migrated;
}

async function initialize() {
  saveColorButton.addEventListener("click", saveColor);
  pickAreaButton.addEventListener("click", pickArea);
  const result = await chrome.storage.local.get(["colors", "siteRules", "activeColorId", "themes", "palettes"]);
  colors = DEFAULT_COLORS.map(color => ({ ...color }));

  if (Array.isArray(result.colors)) {
    for (const saved of result.colors) {
      if (saved && isHex(saved.value)) addColor(saved.value, saved.name || "Saved color", saved.id || "");
    }
  }
  for (const profile of Object.values(result.themes || {})) {
    for (const value of Object.values(profile?.colors || {})) {
      if (isHex(value)) addColor(value, "Saved color");
    }
  }
  for (const palette of result.palettes || []) {
    for (const value of Object.values(palette?.colors || {})) {
      if (isHex(value)) addColor(value, "Saved color");
    }
  }

  siteRules = migrateRules(result.siteRules, result.themes || {});
  activeColorId = colors.some(color => color.id === result.activeColorId) ? result.activeColorId : colors[0]?.id || "";
  hasAllSitesPermission = await chrome.permissions.contains({ origins: [ALL_SITES_PATTERN] });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = tab?.url ? new URL(tab.url) : null;
    if (url && (url.protocol === "http:" || url.protocol === "https:")) {
      activeHost = normalizeHost(url.hostname);
      activeTabId = Number.isInteger(tab.id) ? tab.id : null;
      siteName.textContent = activeHost;
    } else {
      siteName.textContent = "Open a webpage";
    }
  } catch {
    siteName.textContent = "Open a webpage";
  }

  await chrome.storage.local.set({ colors, siteRules, activeColorId });
  renderColorLibrary();
  renderTargets();
}

window.addEventListener("pagehide", () => {
  clearTimeout(previewTimer);
  if (previewDirty && activeTabId) {
    try { void chrome.runtime.sendMessage({ type: "kaleido-clear-preview", tabId: activeTabId }); } catch { /* Popup may close. */ }
  }
});

initialize().catch(() => showStatus("Kaleido could not load this page.", true));

