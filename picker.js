(() => {
  if (window.__kaleidoPickerActive) return;
  window.__kaleidoPickerActive = true;

  const host = document.createElement("div");
  host.dataset.kaleidoPickerUi = "true";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    #highlight { display:none; position:fixed; z-index:1; border:2px solid #eca8bd; border-radius:5px; background:rgba(236,168,189,.24); box-shadow:0 0 0 9999px rgba(0,0,0,.14), 0 0 0 4px rgba(236,168,189,.16); pointer-events:none; }
    #panel { position:fixed; top:16px; right:16px; width:min(330px, calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow:auto; z-index:2; padding:15px; border:1px solid #765261; border-radius:14px; color:#f4eff3; background:#211a20; box-shadow:0 12px 38px #0009; font:13px/1.45 Segoe UI,system-ui,sans-serif; pointer-events:auto; }
    #brand { margin:0 0 9px; color:#eca8bd; font-size:16px; font-weight:750; }
    #title { margin:0 0 7px; color:#f4eff3; font-size:13px; font-weight:700; overflow-wrap:anywhere; }
    #hint { margin:0 0 12px; color:#b8a7b7; font-size:11px; }
    #actions { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
    #colors { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
    button { min-width:0; display:flex; align-items:center; gap:8px; border:1px solid #624955; border-radius:8px; padding:8px; color:#f4eff3; background:#30262d; text-align:left; font:600 11px Segoe UI,system-ui,sans-serif; cursor:pointer; }
    button:hover, button:focus-visible { border-color:#eca8bd; color:#eca8bd; outline:none; }
    button.primary { justify-content:center; border-color:#eca8bd; color:#282025; background:#eca8bd; }
    button.quiet { justify-content:center; color:#c9b9c5; background:transparent; }
    .swatch { width:23px; height:23px; flex:none; border:1px solid #ffffff55; border-radius:6px; }
    .color-copy { min-width:0; overflow:hidden; }
    .color-name { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .color-value { display:block; margin-top:2px; color:#b8a7b7; font:10px Consolas,monospace; }
    .active { border-color:#eca8bd; background:#5a3b4a; }
    #footer { margin-top:9px; color:#b8a7b7; font-size:10px; }
  `;
  const highlight = document.createElement("div");
  highlight.id = "highlight";
  const panel = document.createElement("section");
  panel.id = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Kaleido area picker");
  const brand = document.createElement("p");
  brand.id = "brand";
  brand.textContent = "Kaleido";
  const title = document.createElement("p");
  title.id = "title";
  const hint = document.createElement("p");
  hint.id = "hint";
  const content = document.createElement("div");
  const footer = document.createElement("div");
  footer.id = "footer";
  panel.append(brand, title, hint, content, footer);
  shadow.append(style, highlight, panel);
  document.documentElement.appendChild(host);

  let hoveredElement = null;
  let selectedElement = null;
  let savedColors = [];
  let activeColorId = "";
  let stage = "picking";

  function isPickerUi(event) {
    return event.composedPath().includes(host);
  }

  function pageElement(event) {
    let candidate = event.target instanceof Element ? event.target : event.target?.parentElement;
    while (candidate && (candidate === document.documentElement || candidate === document.body)) {
      candidate = candidate.parentElement;
    }
    return candidate && !isPickerUi(event) ? candidate : null;
  }

  function updateHighlight(element) {
    if (!element || !element.isConnected) {
      highlight.style.display = "none";
      return;
    }
    const rect = element.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.left = `${Math.max(0, rect.left)}px`;
    highlight.style.top = `${Math.max(0, rect.top)}px`;
    highlight.style.width = `${Math.max(4, Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)))}px`;
    highlight.style.height = `${Math.max(4, Math.min(rect.height, window.innerHeight - Math.max(0, rect.top)))}px`;
  }

  function describe(element) {
    if (!element) return "area";
    const tag = element.localName || "area";
    const accessibleName = element.getAttribute("aria-label") || element.getAttribute("title");
    if (accessibleName) return `${tag}: ${accessibleName}`.slice(0, 64);
    if (element.id) return `${tag}#${element.id}`.slice(0, 64);
    const firstClass = Array.from(element.classList || []).find(name => name.length < 32 && !/[0-9a-f]{8,}/i.test(name));
    return (firstClass ? `${tag}.${firstClass}` : tag).slice(0, 64);
  }

  function escapeCss(value) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function buildSelector(element, useClasses) {
    const parts = [];
    let current = element;
    while (current && current instanceof Element && current !== document.documentElement) {
      if (current.id) {
        const idSelector = `#${escapeCss(current.id)}`;
        try {
          if (document.querySelectorAll(idSelector).length === 1) {
            parts.unshift(idSelector);
            break;
          }
        } catch { /* Continue with a positional selector. */ }
      }

      let part = current.localName;
      if (useClasses && current.classList?.length) {
        const stableClasses = Array.from(current.classList)
          .filter(name => name.length < 40 && !/[0-9a-f]{8,}/i.test(name))
          .slice(0, 2);
        for (const className of stableClasses) part += `.${escapeCss(className)}`;
      }
      const parent = current.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(child => child.localName === current.localName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      if (current === document.body) break;
      current = parent;
    }
    if (parts[0] !== "body" && !parts[0]?.startsWith("#")) parts.unshift("body");
    return parts.join(" > ");
  }

  function selectorFor(element) {
    const classSelector = buildSelector(element, true);
    try {
      if (document.querySelectorAll(classSelector).length === 1) return classSelector;
    } catch { /* Use positional fallback. */ }
    return buildSelector(element, false);
  }

  function showPicking() {
    stage = "picking";
    hoveredElement = null;
    selectedElement = null;
    highlight.style.display = "none";
    title.textContent = "Choose an area";
    title.style.color = "#f4eff3";
    hint.textContent = "Move over the page to see the highlight, then click the area you want to color.";
    content.replaceChildren();
    const cancel = makeButton("Cancel", "quiet", cleanup);
    content.appendChild(cancel);
    footer.textContent = "Press Esc to cancel.";
  }

  function showConfirmation(element) {
    stage = "confirm";
    selectedElement = element;
    updateHighlight(element);
    title.textContent = `Use this area? ${describe(element)}`;
    hint.textContent = "The pink highlight shows the exact page area Kaleido will change.";
    content.replaceChildren();
    const actions = document.createElement("div");
    actions.id = "actions";
    actions.append(
      makeButton("Confirm area", "primary", showColors),
      makeButton("Choose another", "", showPicking),
      makeButton("Cancel", "quiet", cleanup)
    );
    content.appendChild(actions);
    footer.textContent = "Nothing is saved until you choose a color.";
  }

  function makeButton(label, className, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener("click", action);
    return button;
  }

  function showColors() {
    if (!selectedElement || !selectedElement.isConnected) {
      title.textContent = "That area is no longer on the page.";
      hint.textContent = "Choose another area to continue.";
      content.replaceChildren(makeButton("Choose another area", "primary", showPicking));
      return;
    }
    stage = "colors";
    title.textContent = `Choose a color for ${describe(selectedElement)}`;
    hint.textContent = "Pick one of your saved colors. It will be applied and saved for this site.";
    content.replaceChildren();
    const grid = document.createElement("div");
    grid.id = "colors";
    for (const color of savedColors) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = color.id === activeColorId ? "active" : "";
      button.title = `Use ${color.name} (${color.value})`;
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.backgroundColor = color.value;
      const copy = document.createElement("span");
      copy.className = "color-copy";
      const name = document.createElement("span");
      name.className = "color-name";
      name.textContent = color.name || "Saved color";
      const value = document.createElement("span");
      value.className = "color-value";
      value.textContent = color.value;
      copy.append(name, value);
      button.append(swatch, copy);
      button.addEventListener("click", () => saveArea(color));
      grid.appendChild(button);
    }
    content.append(grid);
    content.append(makeButton("Choose another area", "quiet", showPicking));
    footer.textContent = "Add or edit saved colors from the Kaleido menu.";
  }

  function saveArea(color) {
    if (!selectedElement || !selectedElement.isConnected) {
      showPicking();
      title.textContent = "That area disappeared. Choose another.";
      return;
    }
    const selector = selectorFor(selectedElement);
    const label = describe(selectedElement);
    chrome.runtime.sendMessage({ type: "kaleido-target-picked", selector, label, colorId: color.id }, response => {
      const failed = chrome.runtime.lastError || !response?.ok;
      title.textContent = failed ? "Kaleido couldn't save this area." : "Area saved and colored.";
      title.style.color = failed ? "#ff9ca8" : "#eca8bd";
      hint.textContent = failed ? "Check that this site is allowed in Kaleido, then try again." : `${label} is now ${color.name} (${color.value}).`;
      content.replaceChildren(makeButton("Done", "primary", cleanup));
      footer.textContent = failed ? "You can close this panel and try again." : "Change its color any time in the Kaleido menu.";
    });
  }

  function onMove(event) {
    if (stage !== "picking") return;
    const element = pageElement(event);
    if (element) {
      hoveredElement = element;
      updateHighlight(element);
    } else if (!isPickerUi(event)) {
      hoveredElement = null;
      highlight.style.display = "none";
    }
  }

  function onClick(event) {
    if (isPickerUi(event)) return;
    if (stage !== "picking") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    const element = pageElement(event);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showConfirmation(element);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") cleanup();
  }

  function updatePinnedHighlight() {
    if (stage !== "picking") updateHighlight(selectedElement);
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", updatePinnedHighlight, true);
    window.removeEventListener("resize", updatePinnedHighlight, true);
    host.remove();
    window.__kaleidoPickerActive = false;
  }

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", updatePinnedHighlight, true);
  window.addEventListener("resize", updatePinnedHighlight, true);
  chrome.runtime.sendMessage({ type: "kaleido-get-colors" }, response => {
    if (chrome.runtime.lastError) {
      title.textContent = "Kaleido couldn't load your saved colors.";
      hint.textContent = "Close the picker and reopen the extension.";
      return;
    }
    savedColors = Array.isArray(response?.colors) ? response.colors : [];
    activeColorId = response?.activeColorId || "";
    if (!savedColors.length) {
      title.textContent = "No saved colors yet";
      hint.textContent = "Close this picker and save a color in the Kaleido menu first.";
      content.replaceChildren(makeButton("Close picker", "quiet", cleanup));
      return;
    }
    showPicking();
  });
})();

