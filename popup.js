const DEFAULT_COLORS = {
  base: "#282025",
  surface: "#553D44",
  accent: "#ECA8BD",
  text: "#CDD6F4"
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

let activeHost = "";
let themes = {};

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
      window.scrollTo({ top: 0, behavior: "smooth" });
      showStatus("Editing " + profile.domain);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "�";
    remove.title = "Remove " + profile.domain;
    remove.setAttribute("aria-label", "Remove " + profile.domain);
    remove.addEventListener("click", async () => {
      delete themes[profile.domain];
      await chrome.storage.local.set({ themes });
      await refreshTabs();
      try {
        await chrome.permissions.remove({ origins: [permissionPattern(profile.domain)] });
      } catch {
        // A permission may already have been removed in Chrome settings.
      }
      showStatus("Removed " + profile.domain);
      renderList();
    });

    actions.append(toggle, edit, remove);
    card.append(info, actions);
    savedList.appendChild(card);
  }
}

async function saveTheme() {
  const host = normalizeHost(domainInput.value);
  if (!validHost(host)) {
    showStatus("Enter a valid website domain, like op.gg.", true);
    return;
  }

  const pattern = permissionPattern(host);
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [pattern] });
  } catch {
    granted = false;
  }
  if (!granted) {
    showStatus("Kaleido needs site access to apply this theme.", true);
    return;
  }

  const name = nameInput.value.trim() || defaultName(host);
  themes[host] = {
    domain: host,
    name,
    enabled: true,
    colors: currentColors()
  };
  await chrome.storage.local.set({ themes });
  await refreshTabs();
  renderList();
  showStatus(host === activeHost ? "Saved and applied to this site." : "Saved. Open " + host + " to see its theme.");
}

async function initialize() {
  fields.forEach(key => {
    document.getElementById(key).addEventListener("input", event => {
      document.getElementById(key + "Value").textContent = event.target.value.toUpperCase();
    });
  });

  const result = await chrome.storage.local.get("themes");
  themes = result.themes || {};

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let tabUrl = null;
  try {
    tabUrl = tab && tab.url ? new URL(tab.url) : null;
  } catch {
    tabUrl = null;
  }

  if (tabUrl && (tabUrl.protocol === "http:" || tabUrl.protocol === "https:")) {
    activeHost = normalizeHost(tabUrl.hostname);
    domainInput.value = activeHost;
    siteState.textContent = "Web page";
    const profile = findTheme(activeHost);
    if (profile) {
      nameInput.value = profile.name || defaultName(profile.domain);
      setColors(profile.colors);
      siteState.textContent = profile.enabled ? "Theme saved" : "Theme off";
    } else {
      nameInput.value = defaultName(activeHost);
      setColors(DEFAULT_COLORS);
    }
  } else {
    siteState.textContent = "Open a website";
    domainInput.value = "";
    nameInput.value = "";
    domainInput.placeholder = "op.gg";
  }

  renderList();
}

saveButton.addEventListener("click", saveTheme);
initialize().catch(() => showStatus("Kaleido could not load this page.", true));
