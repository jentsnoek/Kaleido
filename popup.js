const DEFAULT_COLORS = [
  { id: "builtin-dark-plum", value: "#282025", builtIn: true },
  { id: "builtin-plum", value: "#553D44", builtIn: true },
  { id: "builtin-rose", value: "#ECA8BD", builtIn: true },
  { id: "builtin-periwinkle", value: "#CDD6F4", builtIn: true }
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
const saveColorButton = document.getElementById("saveColor");

let activeHost = "";
let activeTabId = null;
let colors = [];
let siteRules = {};
let activeColorId = "";
let collapsedGroups = {};
let openGroupPaletteId = "";
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

function addColor(value, id = "") {
  if (!isHex(value)) return null;
  const hex = value.toUpperCase();
  const safeId = id || `color-${hex.slice(1).toLowerCase()}`;
  const existingId = colors.find(color => color.id === safeId);
  if (existingId) {
    existingId.value = hex;
    return existingId;
  }
  if (!id) {
    const found = colors.find(color => color.value.toUpperCase() === hex);
    if (found) return found;
  }
  const color = { id: safeId, value: hex };
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
    select.title = "Select this color for new areas";
    select.setAttribute("aria-label", `Select saved color ${colors.indexOf(color) + 1}`);
    const swatch = document.createElement("span");
    swatch.className = "color-swatch";
    swatch.style.backgroundColor = color.value;
    select.append(swatch);
    select.addEventListener("click", async () => {
      activeColorId = color.id;
      await chrome.storage.local.set({ activeColorId });
      renderColorLibrary();
      showStatus("Color selected for new areas.");
    });

    const tools = document.createElement("div");
    tools.className = "color-tools";
    const edit = document.createElement("input");
    edit.className = "edit-color";
    edit.type = "color";
    edit.value = color.value;
    edit.title = "Edit color";
    edit.setAttribute("aria-label", `Edit saved color ${colors.indexOf(color) + 1}`);
    edit.addEventListener("input", () => {
      color.value = edit.value.toUpperCase();
      swatch.style.backgroundColor = color.value;
      schedulePreview();
    });
    edit.addEventListener("change", async () => {
      await chrome.storage.local.set({ colors });
      await refreshTabs();
      renderTargets();
      showStatus("Color updated.");
    });
    tools.appendChild(edit);

    if (!color.builtIn) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-color";
      remove.textContent = "Delete";
      const used = colorUseCount(color.id) > 0;
      remove.disabled = used;
      remove.title = used ? "Change or remove areas using this color first" : "Delete color";
      remove.setAttribute("aria-label", `Delete saved color ${colors.indexOf(color) + 1}`);
      remove.addEventListener("click", async () => {
        if (colorUseCount(color.id)) return;
        colors = colors.filter(item => item.id !== color.id);
        if (activeColorId === color.id) activeColorId = colors[0]?.id || "";
        await chrome.storage.local.set({ colors, activeColorId });
        renderColorLibrary();
        showStatus("Color deleted.");
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
    targetList.innerHTML = '<p class="target-empty">No groups on this site yet.</p>';
    return;
  }

  const groups = [];
  const byId = new Map();
  for (const rule of rules) {
    const groupId = rule.groupId || `legacy-${rule.selector}`;
    let group = byId.get(groupId);
    if (!group) {
      group = { id: groupId, colorId: rule.colorId, rules: [] };
      byId.set(groupId, group);
      groups.push(group);
    }
    group.rules.push(rule);
  }

  groups.forEach((group, groupIndex) => {
    const collapseKey = `${activeHost}:${group.id}`;
    const isCollapsed = collapsedGroups[collapseKey] ?? true;
    const paletteIsOpen = openGroupPaletteId === group.id;
    const card = document.createElement("section");
    card.className = "group-card";
    const heading = document.createElement("div");
    heading.className = "group-heading";
    const title = document.createElement("strong");
    title.className = "group-title";
    title.textContent = `Group ${groupIndex + 1}`;
    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = `${group.rules.length} area${group.rules.length === 1 ? "" : "s"}`;
    const summary = document.createElement("div");
    summary.className = "group-summary";
    summary.append(title, count);

    const controls = document.createElement("div");
    controls.className = "group-controls";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "group-icon-button add-area-button";
    add.textContent = "+";
    add.title = "Add area to this group";
    add.setAttribute("aria-label", `Add area to Group ${groupIndex + 1}`);
    add.addEventListener("click", () => pickArea(group.id));

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "group-icon-button collapse-button";
    toggle.textContent = isCollapsed ? "+" : "-";
    toggle.title = isCollapsed ? "Expand group" : "Minimize group";
    toggle.setAttribute("aria-label", isCollapsed ? `Expand Group ${groupIndex + 1}` : `Minimize Group ${groupIndex + 1}`);
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    toggle.addEventListener("click", async () => {
      collapsedGroups[collapseKey] = !isCollapsed;
      if (!isCollapsed && openGroupPaletteId === group.id) openGroupPaletteId = "";
      await chrome.storage.local.set({ collapsedGroups });
      renderTargets();
    });

    const currentColor = colors.find(color => color.id === group.colorId) || colors[0];
    const colorToggle = document.createElement("button");
    colorToggle.type = "button";
    colorToggle.className = "group-current-color";
    colorToggle.style.backgroundColor = currentColor?.value || "transparent";
    colorToggle.title = "Choose this group's color";
    colorToggle.setAttribute("aria-label", `Choose color for Group ${groupIndex + 1}`);
    colorToggle.setAttribute("aria-expanded", String(paletteIsOpen));
    colorToggle.addEventListener("click", () => {
      openGroupPaletteId = paletteIsOpen ? "" : group.id;
      renderTargets();
    });

    const deleteGroup = document.createElement("button");
    deleteGroup.type = "button";
    deleteGroup.className = "group-delete";
    deleteGroup.textContent = "Delete";
    deleteGroup.title = "Delete this entire group and all its areas";
    deleteGroup.setAttribute("aria-label", `Delete Group ${groupIndex + 1}`);
    deleteGroup.addEventListener("click", async () => {
      siteRules[activeHost] = (siteRules[activeHost] || []).filter(rule => rule.groupId !== group.id);
      delete collapsedGroups[collapseKey];
      if (openGroupPaletteId === group.id) openGroupPaletteId = "";
      await chrome.storage.local.set({ siteRules, collapsedGroups });
      await refreshTabs();
      renderTargets();
      showStatus("Group deleted.");
    });
    controls.append(add, toggle, colorToggle, deleteGroup);
    heading.append(summary, controls);

    const palette = document.createElement("div");
    palette.className = "group-palette";
    palette.hidden = !paletteIsOpen;
    colors.forEach((color, colorIndex) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "group-color" + (color.id === group.colorId ? " selected" : "");
      swatch.style.backgroundColor = color.value;
      swatch.title = "Change the color of this whole group";
      swatch.setAttribute("aria-label", `Set Group ${groupIndex + 1} to saved color ${colorIndex + 1}`);
      swatch.setAttribute("aria-pressed", String(color.id === group.colorId));
      swatch.addEventListener("click", async () => {
        siteRules[activeHost] = (siteRules[activeHost] || []).map(rule =>
          rule.groupId === group.id ? { ...rule, colorId: color.id } : rule
        );
        await chrome.storage.local.set({ siteRules });
        await refreshTabs();
        openGroupPaletteId = "";
        renderTargets();
        showStatus("Group color updated.");
      });
      palette.appendChild(swatch);
    });

    const areaList = document.createElement("div");
    areaList.className = "group-areas";
    areaList.hidden = isCollapsed;
    group.rules.forEach(rule => {
      const row = document.createElement("div");
      row.className = "group-area";
      const label = document.createElement("span");
      label.className = "group-area-name";
      label.textContent = rule.label || rule.selector;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${rule.label || "area"} from Group ${groupIndex + 1}`);
      remove.addEventListener("click", async () => {
        siteRules[activeHost] = (siteRules[activeHost] || []).filter(item => item.selector !== rule.selector);
        if (!siteRules[activeHost].some(item => item.groupId === group.id)) delete collapsedGroups[collapseKey];
        await chrome.storage.local.set({ siteRules, collapsedGroups });
        await refreshTabs();
        renderTargets();
        showStatus("Area removed from its group.");
      });
      row.append(label, remove);
      areaList.appendChild(row);
    });

    card.append(heading, palette, areaList);
    targetList.appendChild(card);
  });
}

async function refreshTabs() {
  try { await chrome.runtime.sendMessage({ type: "kaleido-refresh" }); } catch { /* A tab may close. */ }
}

async function saveColor() {
  const hex = newColorValue.value.toUpperCase();
  let color = colors.find(item => item.value.toUpperCase() === hex);
  if (color) {
    activeColorId = color.id;
    showStatus("That color is already saved. Selected it.");
  } else {
    color = { id: `color-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, value: hex };
    colors.push(color);
    activeColorId = color.id;
    showStatus("Color saved.");
  }
  await chrome.storage.local.set({ colors, activeColorId });
  renderColorLibrary();
}

async function pickArea(groupId = "") {
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
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      func: id => { window.__kaleidoPickerOptions = { groupId: id }; },
      args: [groupId]
    });
    await chrome.scripting.executeScript({ target: { tabId: activeTabId }, files: ["picker.js"] });
    showStatus(groupId ? "Select areas to add to this group." : "Select areas for a new color group.");
  } catch {
    showStatus("This page does not allow Kaleido's area picker.", true);
  }
}

function migrateRules(oldRules, oldThemes) {
  const migrated = {};
  const roleKeys = { base: "base", surface: "surface", accent: "accent", text: "text" };
  for (const [domain, rules] of Object.entries(oldRules || {})) {
    if (!Array.isArray(rules)) continue;
    const legacyGroups = new Map();
    migrated[domain] = rules.flatMap(rule => {
      if (!rule || typeof rule.selector !== "string") return [];
      let color = colors.find(item => item.id === rule.colorId);
      if (!color) {
        let value = isHex(rule.value) ? rule.value : "";
        if (!value && roleKeys[rule.role]) value = oldThemes?.[domain]?.colors?.[roleKeys[rule.role]] || "";
        if (!value && roleKeys[rule.role]) value = DEFAULT_ROLE_VALUES[roleKeys[rule.role]] || "";
        if (!isHex(value)) return [];
        color = addColor(value);
      }
      if (!color) return [];
      let groupId = typeof rule.groupId === "string" ? rule.groupId : "";
      if (!groupId) {
        if (!legacyGroups.has(color.id)) legacyGroups.set(color.id, `group-import-${Date.now()}-${legacyGroups.size}`);
        groupId = legacyGroups.get(color.id);
      }
      return [{
        selector: rule.selector,
        label: rule.label || rule.selector,
        colorId: color.id,
        groupId
      }];
    });
  }
  return migrated;
}

async function initialize() {
  saveColorButton.addEventListener("click", saveColor);
  pickAreaButton.addEventListener("click", () => pickArea());
  const result = await chrome.storage.local.get(["colors", "siteRules", "activeColorId", "themes", "palettes", "collapsedGroups"]);
  colors = DEFAULT_COLORS.map(color => ({ ...color }));

  if (Array.isArray(result.colors)) {
    for (const saved of result.colors) {
      if (saved && isHex(saved.value)) addColor(saved.value, saved.id || "");
    }
  }
  for (const profile of Object.values(result.themes || {})) {
    for (const value of Object.values(profile?.colors || {})) {
      if (isHex(value)) addColor(value);
    }
  }
  for (const palette of result.palettes || []) {
    for (const value of Object.values(palette?.colors || {})) {
      if (isHex(value)) addColor(value);
    }
  }

  siteRules = migrateRules(result.siteRules, result.themes || {});
  collapsedGroups = result.collapsedGroups && typeof result.collapsedGroups === "object" ? result.collapsedGroups : {};
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

  await chrome.storage.local.set({ colors, siteRules, activeColorId, collapsedGroups });
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

