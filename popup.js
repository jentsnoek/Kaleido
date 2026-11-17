const DEFAULT_COLORS = [
  { id: "builtin-dark-plum", value: "#282025", builtIn: true },
  { id: "builtin-charcoal", value: "#20242B", builtIn: true },
  { id: "builtin-slate", value: "#475569", builtIn: true },
  { id: "builtin-plum", value: "#553D44", builtIn: true },
  { id: "builtin-warm-stone", value: "#786C60", builtIn: true },
  { id: "builtin-taupe", value: "#A58B78", builtIn: true },
  { id: "builtin-beige", value: "#D9C6A5", builtIn: true },
  { id: "builtin-cream", value: "#F3EBDD", builtIn: true },
  { id: "builtin-white", value: "#F7F7F5", builtIn: true },
  { id: "builtin-clay", value: "#C98267", builtIn: true },
  { id: "builtin-peach", value: "#F2B38F", builtIn: true },
  { id: "builtin-coral", value: "#EA806E", builtIn: true },
  { id: "builtin-rose", value: "#ECA8BD", builtIn: true },
  { id: "builtin-dusty-rose", value: "#C98296", builtIn: true },
  { id: "builtin-lavender", value: "#B7A1D7", builtIn: true },
  { id: "builtin-periwinkle", value: "#CDD6F4", builtIn: true },
  { id: "builtin-blue", value: "#7FA9D6", builtIn: true },
  { id: "builtin-sky", value: "#A6D4E8", builtIn: true },
  { id: "builtin-navy", value: "#30466E", builtIn: true },
  { id: "builtin-teal", value: "#529B95", builtIn: true },
  { id: "builtin-mint", value: "#A6D2BD", builtIn: true },
  { id: "builtin-sage", value: "#A9B79A", builtIn: true },
  { id: "builtin-olive", value: "#797F51", builtIn: true },
  { id: "builtin-butter", value: "#E8CE7A", builtIn: true },
  { id: "builtin-mauve", value: "#9E7C9F", builtIn: true }
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
const sampleColorButton = document.getElementById("sampleColor");
const toggleSiteColorsButton = document.getElementById("toggleSiteColors");
const siteToggleLabel = document.getElementById("siteToggleLabel");
const undoButton = document.getElementById("undoChange");
const redoButton = document.getElementById("redoChange");
const savedSiteSearch = document.getElementById("savedSiteSearch");
const savedSiteResults = document.getElementById("savedSiteResults");

let activeHost = "";
let activeTabId = null;
let colors = [];
let siteRules = {};
let activeColorId = "";
let collapsedGroups = {};
let pausedSites = {};
let undoHistory = [];
let redoHistory = [];
let openGroupPaletteId = "";
let previewDirty = false;
let previewTimer = null;
let groupPreviewTimer = null;
let groupColorPreviewActive = false;
let hasAllSitesPermission = false;
let focusedAreaKey = "";
let focusedAreaSelector = "";

const transferPasswordInput = document.getElementById("transferPassword");
const transferCodeInput = document.getElementById("transferCode");
const exportSettingsButton = document.getElementById("exportSettings");
const importSettingsButton = document.getElementById("importSettings");
const copySettingsButton = document.getElementById("copySettings");

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

function previewGroupColor(groupId, colorId) {
  clearTimeout(groupPreviewTimer);
  if (!activeTabId || !activeHost) return;
  groupColorPreviewActive = true;
  previewDirty = true;
  groupPreviewTimer = setTimeout(() => {
    const rules = (siteRules[activeHost] || []).map(rule =>
      rule.groupId === groupId ? { ...rule, colorId } : rule
    );
    void chrome.runtime.sendMessage({
      type: "kaleido-preview",
      tabId: activeTabId,
      colors,
      rules
    }).catch(() => {});
  }, 35);
}

async function restoreGroupColorPreview() {
  clearTimeout(groupPreviewTimer);
  if (!groupColorPreviewActive || !activeTabId || !activeHost) return;
  groupColorPreviewActive = false;
  try {
    await chrome.runtime.sendMessage({
      type: "kaleido-preview",
      tabId: activeTabId,
      colors,
      rules: siteRules[activeHost] || []
    });
  } catch { /* The page or tab may have closed. */ }
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
      await saveUndoableSettings({ activeColorId });
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
      await saveUndoableSettings({ colors });
      await refreshTabs();
      renderTargets();
      showStatus("Color updated.");
    });
    tools.appendChild(edit);

    if (!color.builtIn) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-color";
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 3v6m4-6v6"/></svg>';
      remove.title = "Delete color";
      const used = colorUseCount(color.id) > 0;
      remove.disabled = used;
      remove.title = used ? "Change or remove areas using this color first" : "Delete color";
      remove.setAttribute("aria-label", `Delete saved color ${colors.indexOf(color) + 1}`);
      remove.addEventListener("click", async () => {
        if (colorUseCount(color.id)) return;
        colors = colors.filter(item => item.id !== color.id);
        if (activeColorId === color.id) activeColorId = colors[0]?.id || "";
        await saveUndoableSettings({ colors, activeColorId });
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
  renderSiteToggle();
  renderSavedSites();
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
    toggle.textContent = isCollapsed ? "▸" : "▾";
    toggle.title = isCollapsed ? "Expand this group" : "Minimize this group";
    toggle.setAttribute("aria-label", isCollapsed ? `Expand Group ${groupIndex + 1}` : `Minimize Group ${groupIndex + 1}`);
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    toggle.addEventListener("click", async () => {
      if (!isCollapsed && focusedAreaKey.startsWith(group.id + "::")) await clearFocusedArea();
      if (!isCollapsed && openGroupPaletteId === group.id) await restoreGroupColorPreview();
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
    colorToggle.addEventListener("click", async () => {
      if (paletteIsOpen) await restoreGroupColorPreview();
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
      await restoreGroupColorPreview();
      if (focusedAreaKey.startsWith(group.id + "::")) await clearFocusedArea();
      siteRules[activeHost] = (siteRules[activeHost] || []).filter(rule => rule.groupId !== group.id);
      delete collapsedGroups[collapseKey];
      if (openGroupPaletteId === group.id) openGroupPaletteId = "";
      await saveUndoableSettings({ siteRules, collapsedGroups });
      await refreshTabs();
      renderTargets();
      renderSavedSites();
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
      swatch.title = "Hover to preview; click to apply this color to the group";
      swatch.addEventListener("mouseenter", () => previewGroupColor(group.id, color.id));
      swatch.addEventListener("mouseleave", () => { void restoreGroupColorPreview(); });
      swatch.addEventListener("focus", () => previewGroupColor(group.id, color.id));
      swatch.addEventListener("blur", () => { void restoreGroupColorPreview(); });
      swatch.addEventListener("click", async () => {
        siteRules[activeHost] = (siteRules[activeHost] || []).map(rule =>
          rule.groupId === group.id ? { ...rule, colorId: color.id } : rule
        );
        await saveUndoableSettings({ siteRules });
        await restoreGroupColorPreview();
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
    group.rules.forEach((rule, areaIndex) => {
      const row = document.createElement("div");
      const previewKey = group.id + "::" + rule.selector;
      const isFocused = focusedAreaKey === previewKey;
      const isEnabled = rule.enabled !== false;
      row.className = "group-area";
      const label = document.createElement("button");
      label.type = "button";
      label.className = "group-area-select" + (isFocused ? " focused" : "") + (isEnabled ? "" : " disabled");
      label.textContent = rule.label || rule.selector;
      label.title = isFocused ? "Click to stop highlighting this area" : "Click to highlight this area on the page";
      label.setAttribute("aria-pressed", String(isFocused));
      label.addEventListener("click", async () => {
        if (focusedAreaKey === previewKey) {
          await clearFocusedArea();
          renderTargets();
          return;
        }
        focusedAreaKey = previewKey;
        focusedAreaSelector = rule.selector;
        try {
          const result = await chrome.runtime.sendMessage({
            type: "kaleido-focus-area",
            tabId: activeTabId,
            selector: rule.selector,
            active: true
          });
          if (!result?.ok || !result.count) {
            focusedAreaKey = "";
            focusedAreaSelector = "";
            renderTargets();
            showStatus("That area is not visible on this page right now.", true);
            return;
          }
          renderTargets();
        } catch {
          focusedAreaKey = "";
          focusedAreaSelector = "";
          renderTargets();
          showStatus("Kaleido could not preview that area.", true);
        }
      });
      const actions = document.createElement("div");
      actions.className = "group-area-actions";
      const moveUp = document.createElement("button");
      moveUp.type = "button";
      moveUp.className = "group-area-move";
      moveUp.textContent = "↑";
      moveUp.title = "Move area up";
      moveUp.setAttribute("aria-label", "Move area up");
      moveUp.disabled = areaIndex === 0;
      moveUp.addEventListener("click", () => reorderArea(group.id, rule.selector, -1));
      const moveDown = document.createElement("button");
      moveDown.type = "button";
      moveDown.className = "group-area-move";
      moveDown.textContent = "↓";
      moveDown.title = "Move area down";
      moveDown.setAttribute("aria-label", "Move area down");
      moveDown.disabled = areaIndex === group.rules.length - 1;
      moveDown.addEventListener("click", () => reorderArea(group.id, rule.selector, 1));
      const enable = document.createElement("button");
      enable.type = "button";
      enable.className = "group-area-enable" + (isEnabled ? "" : " off");
      enable.textContent = isEnabled ? "On" : "Off";
      enable.title = isEnabled ? "Turn this area off" : "Turn this area on";
      enable.setAttribute("aria-pressed", String(isEnabled));
      enable.addEventListener("click", () => toggleAreaEnabled(group.id, rule.selector));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "group-area-remove";
      remove.textContent = "×";
      remove.title = "Remove area from this group";
      remove.setAttribute("aria-label", "Remove " + (rule.label || "area") + " from Group " + (groupIndex + 1));
      remove.addEventListener("click", async () => {
        if (focusedAreaKey === previewKey) await clearFocusedArea();
        siteRules[activeHost] = (siteRules[activeHost] || []).filter(item => item.selector !== rule.selector);
        if (!siteRules[activeHost].some(item => item.groupId === group.id)) delete collapsedGroups[collapseKey];
        await saveUndoableSettings({ siteRules, collapsedGroups });
        await refreshTabs();
        renderTargets();
        showStatus("Area removed from its group.");
      });
      actions.append(moveUp, moveDown, enable, remove);
      row.append(label, actions);
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
  await saveUndoableSettings({ colors, activeColorId });
  renderColorLibrary();
}

async function startEyedropper() {
  if (!activeTabId || !activeHost) {
    showStatus("Open a website before picking a color.", true);
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: activeTabId }, files: ["eyedropper.js"] });
    showStatus("Click a page area to sample its background color. Press Escape to cancel.");
  } catch {
    showStatus("Kaleido could not start the page color picker.", true);
  }
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
        groupId,
        enabled: rule.enabled !== false
      }];
    });
  }
  return migrated;
}


function bytesToBase64Url(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}


async function compressTransferBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressTransferBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 20000000) {
      await reader.cancel();
      throw new Error("The settings code is too large.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function deriveTransferKey(passphrase, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function exportSettings() {
  const passphrase = transferPasswordInput.value;
  if (passphrase.length < 8) {
    showStatus("Use a password or passphrase with at least 8 characters.", true);
    return;
  }
  try {
    const payload = {
      format: "kaleido-settings",
      version: 1,
      colors,
      siteRules,
      activeColorId,
      collapsedGroups,
      pausedSites
    };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveTransferKey(passphrase, salt);
    let payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    let codeVersion = "KAL1";
    if (typeof CompressionStream !== "undefined") {
      payloadBytes = await compressTransferBytes(payloadBytes);
      codeVersion = "KAL2";
    }
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      payloadBytes
    );
    transferCodeInput.value = [
      codeVersion,
      bytesToBase64Url(salt),
      bytesToBase64Url(iv),
      bytesToBase64Url(new Uint8Array(ciphertext))
    ].join(".");
    copySettingsButton.hidden = false;
    showStatus("Encrypted transfer code created. Keep the passphrase with it.");
  } catch {
    showStatus("Kaleido could not create the encrypted code.", true);
  }
}

function validateImportedSettings(data) {
  if (!data || data.format !== "kaleido-settings" || data.version !== 1 ||
      !Array.isArray(data.colors) || !data.siteRules || typeof data.siteRules !== "object" ||
      Array.isArray(data.siteRules)) {
    throw new Error("This is not a Kaleido settings code.");
  }
  if (data.colors.length > 1000) throw new Error("The code contains too many colors.");
  const importedColors = [];
  const colorIds = new Set();
  for (const color of data.colors) {
    if (!color || typeof color.id !== "string" || !color.id || color.id.length > 80 || !isHex(color.value)) {
      throw new Error("The code contains an invalid color.");
    }
    if (!colorIds.has(color.id)) {
      colorIds.add(color.id);
      importedColors.push({ id: color.id, value: color.value.toUpperCase() });
    }
  }

  const importedRules = {};
  const domains = Object.entries(data.siteRules);
  if (domains.length > 500) throw new Error("The code contains too many websites.");
  let totalRules = 0;
  for (const [domain, rules] of domains) {
    if (!/^[a-z0-9.-]{1,253}$/i.test(domain) || !Array.isArray(rules) || rules.length > 2000) {
      throw new Error("The code contains invalid website settings.");
    }
    importedRules[domain] = rules.map(rule => {
      if (!rule || typeof rule.selector !== "string" || !rule.selector || rule.selector.length > 1000 ||
          typeof rule.label !== "string" || rule.label.length > 80 ||
          typeof rule.groupId !== "string" || !rule.groupId || rule.groupId.length > 120 ||
          typeof rule.colorId !== "string" || !colorIds.has(rule.colorId) ||
          (rule.enabled !== undefined && typeof rule.enabled !== "boolean")) {
        throw new Error("The code contains an invalid area.");
      }
      return {
        selector: rule.selector,
        label: rule.label,
        groupId: rule.groupId,
        colorId: rule.colorId,
        enabled: rule.enabled !== false
      };
    });
    totalRules += rules.length;
  }
  if (totalRules > 10000) throw new Error("The code contains too many saved areas.");

  const importedPausedSites = {};
  if (data.pausedSites && typeof data.pausedSites === "object" && !Array.isArray(data.pausedSites)) {
    for (const [domain, isPaused] of Object.entries(data.pausedSites)) {
      if (/^[a-z0-9.-]{1,253}$/i.test(domain) && isPaused === true) importedPausedSites[domain] = true;
    }
  }

  const collapsed = {};
  if (data.collapsedGroups && typeof data.collapsedGroups === "object" && !Array.isArray(data.collapsedGroups)) {
    for (const [key, value] of Object.entries(data.collapsedGroups).slice(0, 5000)) {
      if (typeof key === "string" && key.length <= 350 && typeof value === "boolean") collapsed[key] = value;
    }
  }
  return {
    colors: importedColors,
    siteRules: importedRules,
    collapsedGroups: collapsed,
    pausedSites: importedPausedSites,
    activeColorId: typeof data.activeColorId === "string" && colorIds.has(data.activeColorId) ? data.activeColorId : ""
  };
}

async function importSettings() {
  const code = transferCodeInput.value.trim();
  const passphrase = transferPasswordInput.value;
  if (passphrase.length < 8) {
    showStatus("Enter the passphrase used to create the code.", true);
    return;
  }
  if ((!code.startsWith("KAL1.") && !code.startsWith("KAL2.")) || code.length > 20000000) {
    showStatus("Paste a Kaleido transfer code into the box first.", true);
    return;
  }
  if (!window.confirm("Importing replaces the Kaleido colors, groups, and website states currently saved on this device. Continue?")) return;

  try {
    const [prefix, saltText, ivText, ciphertextText, extra] = code.split(".");
    if ((prefix !== "KAL1" && prefix !== "KAL2") || !saltText || !ivText || !ciphertextText || extra) throw new Error("This code is not valid.");
    const salt = base64UrlToBytes(saltText);
    const iv = base64UrlToBytes(ivText);
    const ciphertext = base64UrlToBytes(ciphertextText);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error("This code is not valid.");
    const key = await deriveTransferKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const plainBytes = prefix === "KAL2"
      ? await decompressTransferBytes(new Uint8Array(decrypted))
      : new Uint8Array(decrypted);
    const data = JSON.parse(new TextDecoder().decode(plainBytes));
    const imported = validateImportedSettings(data);

    colors = DEFAULT_COLORS.map(color => ({ ...color }));
    imported.colors.forEach(color => addColor(color.value, color.id));
    siteRules = imported.siteRules;
    collapsedGroups = imported.collapsedGroups;
    pausedSites = imported.pausedSites;
    activeColorId = colors.some(color => color.id === imported.activeColorId)
      ? imported.activeColorId
      : colors[0]?.id || "";
    await saveUndoableSettings({ colors, siteRules, activeColorId, collapsedGroups, pausedSites });
    await chrome.storage.local.remove(["themes", "palettes"]);
    await refreshTabs();
    renderColorLibrary();
    renderTargets();
    renderSiteToggle();
    renderSavedSites();
    showStatus("Colors, groups, and website states imported.");
  } catch {
    showStatus("Could not unlock that code. Check the code and passphrase.", true);
  }
}

async function copySettingsCode() {
  if (!transferCodeInput.value) return;
  try {
    await navigator.clipboard.writeText(transferCodeInput.value);
    showStatus("Encrypted code copied.");
  } catch {
    transferCodeInput.focus();
    transferCodeInput.select();
    showStatus("Select and copy the encrypted code from the box.");
  }
}

async function clearFocusedArea() {
  const selector = focusedAreaSelector;
  focusedAreaKey = "";
  focusedAreaSelector = "";
  if (!activeTabId) return;
  try {
    await chrome.runtime.sendMessage({
      type: "kaleido-focus-area",
      tabId: activeTabId,
      selector,
      active: false
    });
  } catch { /* The page or tab may have closed. */ }
}


const HISTORY_SETTING_KEYS = ["colors", "siteRules", "pausedSites", "activeColorId", "collapsedGroups"];
const HISTORY_LIMIT = 15;

function snapshotSettings(state, keys = HISTORY_SETTING_KEYS) {
  const snapshot = {};
  for (const key of keys) {
    if (!HISTORY_SETTING_KEYS.includes(key)) continue;
    if (key === "colors") snapshot[key] = Array.isArray(state[key]) ? state[key] : [];
    else if (key === "activeColorId") snapshot[key] = typeof state[key] === "string" ? state[key] : "";
    else snapshot[key] = state[key] && typeof state[key] === "object" ? state[key] : {};
  }
  return snapshot;
}

function renderHistoryButtons() {
  undoButton.disabled = undoHistory.length === 0;
  redoButton.disabled = redoHistory.length === 0;
}

async function saveUndoableSettings(changes) {
  const keys = [...HISTORY_SETTING_KEYS, "kaleidoUndo", "kaleidoRedo"];
  const stored = await chrome.storage.local.get(keys);
  undoHistory = Array.isArray(stored.kaleidoUndo) ? stored.kaleidoUndo.slice(-HISTORY_LIMIT + 1) : [];
  redoHistory = [];
  const changedKeys = Object.keys(changes).filter(key => HISTORY_SETTING_KEYS.includes(key));
  undoHistory.push(snapshotSettings(stored, changedKeys));
  await chrome.storage.local.set({
    ...changes,
    kaleidoUndo: undoHistory,
    kaleidoRedo: redoHistory
  });
  renderHistoryButtons();
}

async function applyHistory(direction) {
  const keys = [...HISTORY_SETTING_KEYS, "kaleidoUndo", "kaleidoRedo"];
  const stored = await chrome.storage.local.get(keys);
  const undo = Array.isArray(stored.kaleidoUndo) ? [...stored.kaleidoUndo] : [];
  const redo = Array.isArray(stored.kaleidoRedo) ? [...stored.kaleidoRedo] : [];
  const source = direction === "undo" ? undo : redo;
  if (!source.length) return;
  const target = source.pop();
  const targetKeys = Object.keys(target).filter(key => HISTORY_SETTING_KEYS.includes(key));
  const current = snapshotSettings(stored, targetKeys);
  if (direction === "undo") redo.push(current);
  else undo.push(current);
  undoHistory = undo.slice(-HISTORY_LIMIT);
  redoHistory = redo.slice(-HISTORY_LIMIT);
  const restored = snapshotSettings(target, targetKeys);
  await chrome.storage.local.set({
    ...restored,
    kaleidoUndo: undoHistory,
    kaleidoRedo: redoHistory
  });
  if (Object.prototype.hasOwnProperty.call(restored, "colors")) colors = restored.colors;
  if (Object.prototype.hasOwnProperty.call(restored, "siteRules")) siteRules = restored.siteRules;
  if (Object.prototype.hasOwnProperty.call(restored, "pausedSites")) pausedSites = restored.pausedSites;
  if (Object.prototype.hasOwnProperty.call(restored, "activeColorId")) activeColorId = restored.activeColorId;
  if (Object.prototype.hasOwnProperty.call(restored, "collapsedGroups")) collapsedGroups = restored.collapsedGroups;
  renderHistoryButtons();
  renderColorLibrary();
  renderTargets();
  renderSiteToggle();
  renderSavedSites();
  await refreshTabs();
  showStatus(direction === "undo" ? "Last change undone." : "Change restored.");
}

function matchingSavedDomain(host) {
  return Object.keys(siteRules)
    .filter(domain => Array.isArray(siteRules[domain]) && (host === domain || host.endsWith("." + domain)))
    .sort((a, b) => b.length - a.length)[0] || "";
}

function activePauseKey() {
  return matchingSavedDomain(activeHost) || activeHost;
}

function renderSiteToggle() {
  const canToggle = Boolean(activeHost);
  const key = activePauseKey();
  const isPaused = Boolean(key && pausedSites[key]);
  toggleSiteColorsButton.disabled = !canToggle;
  toggleSiteColorsButton.classList.toggle("paused", isPaused);
  siteToggleLabel.textContent = isPaused ? "Off" : "On";
  toggleSiteColorsButton.setAttribute("aria-checked", String(!isPaused));
  toggleSiteColorsButton.title = isPaused
    ? "Turn Kaleido colors on for this website"
    : "Turn Kaleido colors off for this website";
}

async function toggleSiteColors() {
  if (!activeHost) return;
  const key = activePauseKey();
  if (pausedSites[key]) delete pausedSites[key];
  else pausedSites[key] = true;
  await saveUndoableSettings({ pausedSites });
  renderSiteToggle();
  await refreshTabs();
  showStatus(pausedSites[key] ? "Colors paused for this website." : "Colors resumed for this website.");
}

function renderSavedSites() {
  savedSiteResults.replaceChildren();
  const query = savedSiteSearch.value.trim().toLowerCase();
  const hosts = [...new Set([...Object.keys(siteRules), ...Object.keys(pausedSites)])]
    .filter(host => host.toLowerCase().includes(query))
    .sort((a, b) => a.localeCompare(b));
  if (!hosts.length) {
    const empty = document.createElement("p");
    empty.className = "saved-site-empty";
    empty.textContent = query ? "No matching saved websites." : "No saved websites yet.";
    savedSiteResults.appendChild(empty);
    return;
  }
  hosts.slice(0, 50).forEach(host => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "saved-site-button";
    const name = document.createElement("span");
    name.textContent = host;
    button.appendChild(name);
    if (pausedSites[host]) {
      const badge = document.createElement("span");
      badge.className = "saved-site-badge";
      badge.textContent = "Paused";
      button.appendChild(badge);
    }
    button.title = "Open this saved website";
    button.addEventListener("click", async () => {
      try {
        const url = "https://" + host;
        if (activeTabId) await chrome.tabs.update(activeTabId, { url });
        else await chrome.tabs.create({ url });
      } catch {
        showStatus("Kaleido could not open that website.", true);
      }
    });
    savedSiteResults.appendChild(button);
  });
  if (hosts.length > 50) {
    const more = document.createElement("p");
    more.className = "saved-site-empty";
    more.textContent = "Showing the first 50 matches.";
    savedSiteResults.appendChild(more);
  }
}

async function reorderArea(groupId, selector, direction) {
  const current = siteRules[activeHost] || [];
  const indices = current.map((rule, index) => rule.groupId === groupId ? index : -1).filter(index => index >= 0);
  const groupRules = indices.map(index => current[index]);
  const itemIndex = groupRules.findIndex(rule => rule.selector === selector);
  const targetIndex = itemIndex + direction;
  if (itemIndex < 0 || targetIndex < 0 || targetIndex >= groupRules.length) return;
  [groupRules[itemIndex], groupRules[targetIndex]] = [groupRules[targetIndex], groupRules[itemIndex]];
  const reordered = [...current];
  indices.forEach((index, i) => { reordered[index] = groupRules[i]; });
  siteRules[activeHost] = reordered;
  await saveUndoableSettings({ siteRules });
  await refreshTabs();
  renderTargets();
  showStatus("Areas reordered.");
}

async function toggleAreaEnabled(groupId, selector) {
  siteRules[activeHost] = (siteRules[activeHost] || []).map(rule =>
    rule.groupId === groupId && rule.selector === selector
      ? { ...rule, enabled: rule.enabled === false }
      : rule
  );
  await saveUndoableSettings({ siteRules });
  await refreshTabs();
  renderTargets();
  showStatus("Area setting updated.");
}

async function initialize() {
  saveColorButton.addEventListener("click", saveColor);
  sampleColorButton.addEventListener("click", startEyedropper);
  toggleSiteColorsButton.addEventListener("click", toggleSiteColors);
  undoButton.addEventListener("click", () => applyHistory("undo"));
  redoButton.addEventListener("click", () => applyHistory("redo"));
  savedSiteSearch.addEventListener("input", renderSavedSites);
  pickAreaButton.addEventListener("click", () => pickArea());
  exportSettingsButton.addEventListener("click", exportSettings);
  importSettingsButton.addEventListener("click", importSettings);
  copySettingsButton.addEventListener("click", copySettingsCode);
  const result = await chrome.storage.local.get([
    "colors", "siteRules", "activeColorId", "themes", "palettes", "collapsedGroups",
    "pausedSites", "kaleidoUndo", "kaleidoRedo", "kaleidoSampledColor"
  ]);
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
  pausedSites = result.pausedSites && typeof result.pausedSites === "object" ? result.pausedSites : {};
  undoHistory = Array.isArray(result.kaleidoUndo) ? result.kaleidoUndo : [];
  redoHistory = Array.isArray(result.kaleidoRedo) ? result.kaleidoRedo : [];
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
  renderHistoryButtons();
  renderSiteToggle();
  renderSavedSites();
  renderColorLibrary();
  renderTargets();
  if (isHex(result.kaleidoSampledColor)) {
    newColorValue.value = result.kaleidoSampledColor.toUpperCase();
    showStatus("Color sampled. Save it to add it to your library.");
    await chrome.storage.local.remove("kaleidoSampledColor");
  }
}

window.addEventListener("pagehide", () => {
  clearTimeout(previewTimer);
  clearTimeout(groupPreviewTimer);
  if (focusedAreaSelector && activeTabId) {
    try { void chrome.runtime.sendMessage({ type: "kaleido-focus-area", tabId: activeTabId, selector: focusedAreaSelector, active: false }); } catch { /* Popup may close. */ }
  }
  if (previewDirty && activeTabId) {
    try { void chrome.runtime.sendMessage({ type: "kaleido-clear-preview", tabId: activeTabId }); } catch { /* Popup may close. */ }
  }
});

initialize().catch(() => showStatus("Kaleido could not load this page.", true));

