const DEFAULT_COLORS = {
  base: "#282025",
  surface: "#553D44",
  accent: "#ECA8BD",
  text: "#CDD6F4"
};
const ALL_SITES_PATTERN = "*://*/*";
const BUILT_IN_PALETTE = {
  id: "my-plum",
  name: "My Plum",
  colors: DEFAULT_COLORS,
  builtIn: true
};
const fields = ["base", "surface", "accent", "text"];
const domainInput = document.getElementById("domain");
const nameInput = document.getElementById("siteName");
const saveButton = document.getElementById("saveTheme");
const statusNode = document.getElementById("status");
const savedList = document.getElementById("savedList");
const emptyState = document.getElementById("emptyState");
const countNode = document.getElementById("siteCount");
const siteState = document.getElementById("siteState");
const paletteList = document.getElementById("paletteList");
const paletteCount = document.getElementById("paletteCount");
const paletteNameInput = document.getElementById("paletteName");
const savePaletteButton = document.getElementById("savePalette");
const pickAreaButton = document.getElementById("pickArea");
const targetList = document.getElementById("targetList");

let activeHost = "";
let activeTabId = null;
let themes = {};
let palettes = [];
let siteRules = {};
let previewDirty = false;
let previewTimer = null;
let hasAllSitesPermission = false;

function normalizeHost(value) {
  let host = String(value || "").trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  host = host.replace(/:\d+$/, "").replace(/^www\./, "");
  return host;
}

function validHost(host) {
  if (!host || host.length > 253) return false;
  if (host === "localhost") return true;
  return host.split(".").every(label =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
}

function defaultName(host) {
  if (host === "op.gg") return "OP.GG";
  return host.split(".").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function findTheme(host) {
  return Object.values(themes)
    .filter(item => item && item.domain && (host === item.domain || host.endsWith("." + item.domain)))
    .sort((a, b) => b.domain.length - a.domain.length)[0] || null;
}

function activeRuleDomain() {
  return findTheme(activeHost)?.domain || activeHost;
}

function permissionPattern(domain) {
  const host = domain.includes(".") ? "*." + domain : domain;
  return "*://" + host + "/*";
}

function setColors(colors) {
  const source = colors || DEFAULT_COLORS;
  for (const key of fields) {
    const input = document.getElementById(key);
    const value = /^#[0-9a-fA-F]{6}$/.test(source[key] || "") ? source[key] : DEFAULT_COLORS[key];
    input.value = value;
    document.getElementById(key + "Value").textContent = value.toUpperCase();
  }
}

function currentColors() {
  return Object.fromEntries(fields.map(key => [key, document.getElementById(key).value.toUpperCase()]));
}

function validPaletteColors(colors) {
  return colors && fields.every(key => typeof colors[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(colors[key]));
}

function sameColors(first, second) {
  return validPaletteColors(first) && validPaletteColors(second) &&
    fields.every(key => first[key].toUpperCase() === second[key].toUpperCase());
}

async function refreshTabs() {
  try {
    await chrome.runtime.sendMessage({ type: "kaleido-refresh" });
  } catch {
    // A tab may close while the popup is saving.
  }
}

function showStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.style.color = isError ? "#F0A1A7" : "#ECA8BD";
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
        colors: currentColors(),
        rules: siteRules[activeRuleDomain()] || []
      });
    } catch {
      // Chrome internal pages cannot be previewed.
    }
  }, 55);
}

function renderList() {
  savedList.replaceChildren();
  const entries = Object.values(themes).sort((a, b) => a.domain.localeCompare(b.domain));
  countNode.textContent = String(entries.length);
  emptyState.hidden = entries.length > 0;

  for (const profile of entries) {
    const card = document.createElement("div");
    card.className = "site-card";
    const info = document.createElement("div");
    info.className = "site-info";
    const title = document.createElement("div");
    title.className = "site-title";
    title.textContent = profile.name || profile.domain;
    const domain = document.createElement("div");
    domain.className = "site-domain";
    domain.textContent = profile.domain;
    info.append(title, domain);

    const actions = document.createElement("div");
    actions.className = "site-actions";
    const toggle = document.createElement("input");
    toggle.className = "toggle";
    toggle.type = "checkbox";
    toggle.checked = Boolean(profile.enabled);
    toggle.title = profile.enabled ? "Disable this theme" : "Enable this theme";
    toggle.setAttribute("aria-label", "Enable theme for " + profile.domain);
    toggle.addEventListener("change", async () => {
      profile.enabled = toggle.checked;
      themes[profile.domain] = profile;
      await chrome.storage.local.set({ themes });
      await refreshTabs();
      renderList();
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      domainInput.value = profile.domain;
      nameInput.value = profile.name || defaultName(profile.domain);
      setColors(profile.colors);
      if (profile.domain === activeHost) schedulePreview();
      document.getElementById("sitesDetails").open = false;
      showStatus("Previewing " + profile.domain + " - save to keep these changes.");
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "Delete";
    remove.title = "Remove " + profile.domain;
    remove.setAttribute("aria-label", "Remove " + profile.domain);
    remove.addEventListener("click", async () => {
      delete themes[profile.domain];
      await chrome.storage.local.set({ themes });
      await refreshTabs();
      try {
        await chrome.permissions.remove({ origins: [permissionPattern(profile.domain)] });
      } catch {
        // A site-specific permission may not exist anymore.
      }
      showStatus("Removed " + profile.domain);
      renderList();
    });

    actions.append(toggle, edit, remove);
    card.append(info, actions);
    savedList.appendChild(card);
  }
}

function renderPalettes() {
  paletteList.replaceChildren();
  paletteCount.textContent = String(palettes.length);
  for (const palette of palettes) {
    const card = document.createElement("div");
    card.className = "palette-card";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "palette-main";
    apply.title = "Preview this color combo on the current page";
    const name = document.createElement("div");
    name.className = "palette-name";
    name.textContent = palette.name;
    const swatches = document.createElement("div");
    swatches.className = "palette-swatches";
    for (const key of fields) {
      const swatch = document.createElement("span");
      swatch.className = "palette-swatch";
      swatch.style.backgroundColor = palette.colors[key];
      swatch.title = `${key}: ${palette.colors[key]}`;
      swatches.appendChild(swatch);
    }
    apply.append(name, swatches);
    apply.addEventListener("click", () => {
      setColors(palette.colors);
      schedulePreview();
      showStatus(`Previewing "${palette.name}". Save the site theme to keep it.`);
    });
    const actions = document.createElement("div");
    actions.className = "palette-actions";
    if (!palette.builtIn) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-button";
      remove.textContent = "Delete";
      remove.title = "Delete palette";
      remove.setAttribute("aria-label", "Delete palette " + palette.name);
      remove.addEventListener("click", async () => {
        palettes = palettes.filter(item => item.id !== palette.id);
        await chrome.storage.local.set({ palettes });
        renderPalettes();
      });
      actions.appendChild(remove);
    }
    card.append(apply, actions);
    paletteList.appendChild(card);
  }
}

async function savePalette() {
  const name = paletteNameInput.value.trim();
  if (!name) {
    showStatus("Name this color combo first.", true);
    paletteNameInput.focus();
    return;
  }
  const palette = {
    id: `palette-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: name.slice(0, 32),
    colors: currentColors()
  };
  palettes.push(palette);
  await chrome.storage.local.set({ palettes });
  paletteNameInput.value = "";
  renderPalettes();
  showStatus(`Saved "${palette.name}" in your color combos.`);
}

function renderTargets() {
  targetList.replaceChildren();
  if (!activeHost) {
    targetList.innerHTML = '<p class="target-empty">Open a website to pick areas.</p>';
    return;
  }
  const ruleDomain = activeRuleDomain();
  const rules = siteRules[ruleDomain] || [];
  if (!rules.length) {
    targetList.innerHTML = '<p class="target-empty">No picked areas for this site yet.</p>';
    return;
  }
  const roleNames = { base: "Page color", surface: "Card color", accent: "Accent color", text: "Text color" };
  for (const rule of rules) {
    const card = document.createElement("div");
    card.className = "target-card";
    const info = document.createElement("div");
    info.className = "target-name";
    info.textContent = rule.label || rule.selector;
    const roleSelect = document.createElement("select");
    roleSelect.setAttribute("aria-label", `Color for ${rule.label || "picked area"}`);
    for (const role of ["base", "surface", "text", "accent"]) {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = roleNames[role];
      roleSelect.appendChild(option);
    }
    roleSelect.value = roleNames[rule.role] ? rule.role : "surface";
    roleSelect.addEventListener("change", async () => {
      siteRules[ruleDomain] = (siteRules[ruleDomain] || []).map(item =>
        item.selector === rule.selector ? { ...item, role: roleSelect.value } : item
      );
      await chrome.storage.local.set({ siteRules });
      await refreshTabs();
      schedulePreview();
      showStatus("Updated this area's color role.");
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "Delete";
    remove.title = "Remove picked area";
    remove.setAttribute("aria-label", "Remove " + (rule.label || "picked area"));
    remove.addEventListener("click", async () => {
      siteRules[ruleDomain] = (siteRules[ruleDomain] || []).filter(item => item.selector !== rule.selector);
      await chrome.storage.local.set({ siteRules });
      await refreshTabs();
      renderTargets();
      schedulePreview();
    });
    card.append(info, roleSelect, remove);
    targetList.appendChild(card);
  }
}

async function pickArea() {
  if (!activeTabId || !activeHost) {
    showStatus("Open the website you want to edit first.", true);
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: activeTabId }, files: ["picker.js"] });
    showStatus("Click an area on the page, then choose its color role.");
  } catch {
    showStatus("This page does not allow Kaleido's picker.", true);
  }
}

async function saveTheme() {
  const host = normalizeHost(domainInput.value);
  if (!validHost(host)) {
    showStatus("Enter a valid website domain, like op.gg.", true);
    return;
  }

  if (!hasAllSitesPermission) {
    try {
      hasAllSitesPermission = await chrome.permissions.request({ origins: [ALL_SITES_PATTERN] });
    } catch {
      hasAllSitesPermission = false;
    }
    if (!hasAllSitesPermission) {
      showStatus("Kaleido needs all-sites access to apply themes without asking on every website.", true);
      return;
    }
  }

  themes[host] = {
    domain: host,
    name: nameInput.value.trim() || defaultName(host),
    enabled: true,
    colors: currentColors()
  };
  await chrome.storage.local.set({ themes });
  await refreshTabs();
  previewDirty = false;
  renderList();
  siteState.textContent = "All sites enabled";
  showStatus(host === activeHost ? "Saved and applied to this site." : `Saved. Open ${host} to see its theme.`);
}

async function initialize() {
  fields.forEach(key => {
    document.getElementById(key).addEventListener("input", event => {
      document.getElementById(key + "Value").textContent = event.target.value.toUpperCase();
      schedulePreview();
    });
  });
  saveButton.addEventListener("click", saveTheme);
  savePaletteButton.addEventListener("click", savePalette);
  pickAreaButton.addEventListener("click", pickArea);

  const result = await chrome.storage.local.get(["themes", "palettes", "siteRules"]);
  themes = result.themes || {};
  palettes = Array.isArray(result.palettes)
    ? result.palettes.filter(item => item && typeof item.id === "string" && typeof item.name === "string" && validPaletteColors(item.colors))
    : [];
  let palettesChanged = !Array.isArray(result.palettes);
  if (!palettes.some(item => item.id === BUILT_IN_PALETTE.id)) {
    palettes.unshift(BUILT_IN_PALETTE);
    palettesChanged = true;
  }
  for (const profile of Object.values(themes)) {
    if (!profile?.domain || !validPaletteColors(profile.colors)) continue;
    if (palettes.some(item => sameColors(item.colors, profile.colors))) continue;
    palettes.push({
      id: `site-colors-${normalizeHost(profile.domain)}`,
      name: `${profile.name || profile.domain} colors`.slice(0, 32),
      colors: Object.fromEntries(fields.map(key => [key, profile.colors[key].toUpperCase()]))
    });
    palettesChanged = true;
  }
  const allowedRoles = new Set(["base", "surface", "accent", "text"]);
  siteRules = Object.fromEntries(Object.entries(result.siteRules || {}).map(([domain, rules]) => [
    domain,
    Array.isArray(rules) ? rules.filter(rule => rule && typeof rule.selector === "string" && allowedRoles.has(rule.role)) : []
  ]));
  hasAllSitesPermission = await chrome.permissions.contains({ origins: [ALL_SITES_PATTERN] });
  if (palettesChanged || result.palettes?.length !== palettes.length) await chrome.storage.local.set({ palettes });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let tabUrl = null;
  try {
    tabUrl = tab && tab.url ? new URL(tab.url) : null;
    activeTabId = tab && Number.isInteger(tab.id) ? tab.id : null;
  } catch {
    tabUrl = null;
  }

  if (tabUrl && (tabUrl.protocol === "http:" || tabUrl.protocol === "https:")) {
    activeHost = normalizeHost(tabUrl.hostname);
    domainInput.value = activeHost;
    siteState.textContent = hasAllSitesPermission ? "All sites enabled" : "Web page";
    const profile = findTheme(activeHost);
    if (profile) {
      nameInput.value = profile.name || defaultName(profile.domain);
      setColors(profile.colors);
      if (profile.enabled) siteState.textContent = "Theme saved";
      else siteState.textContent = "Theme off";
    } else {
      nameInput.value = defaultName(activeHost);
      setColors(DEFAULT_COLORS);
    }
  } else {
    activeTabId = null;
    siteState.textContent = "Open a website";
    domainInput.value = "";
    nameInput.value = "";
    domainInput.placeholder = "op.gg";
  }

  renderList();
  renderPalettes();
  renderTargets();
}

window.addEventListener("pagehide", () => {
  clearTimeout(previewTimer);
  if (previewDirty && activeTabId) {
    try {
      void chrome.runtime.sendMessage({ type: "kaleido-clear-preview", tabId: activeTabId });
    } catch {
      // The popup may close before the preview can be restored.
    }
  }
});

initialize().catch(() => showStatus("Kaleido could not load this page.", true));

