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
    #selections { position:fixed; inset:0; z-index:1; pointer-events:none; }
    .picked { position:fixed; border:2px solid #e8c7ff; border-radius:5px; background:rgba(205,180,255,.17); box-shadow:0 0 0 2px rgba(205,180,255,.18); pointer-events:none; }
    #highlight { display:none; position:fixed; z-index:2; border:2px solid #eca8bd; border-radius:5px; background:rgba(236,168,189,.24); box-shadow:0 0 0 9999px rgba(0,0,0,.14), 0 0 0 4px rgba(236,168,189,.16); pointer-events:none; }
    #panel { position:fixed; top:16px; right:16px; width:min(340px, calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow:auto; z-index:3; padding:15px; border:1px solid #765261; border-radius:14px; color:#f4eff3; background:#211a20; box-shadow:0 12px 38px #0009; font:13px/1.45 Segoe UI,system-ui,sans-serif; pointer-events:auto; }
    #brand { margin:0 0 9px; color:#eca8bd; font-size:16px; font-weight:750; }
    #title { margin:0 0 7px; color:#f4eff3; font-size:13px; font-weight:700; overflow-wrap:anywhere; }
    #hint { margin:0 0 12px; color:#b8a7b7; font-size:11px; }
    #actions { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
    #colors { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:8px; }
    button { min-width:0; display:flex; align-items:center; gap:8px; border:1px solid #624955; border-radius:8px; padding:8px; color:#f4eff3; background:#30262d; text-align:left; font:600 11px Segoe UI,system-ui,sans-serif; cursor:pointer; }
    button:hover, button:focus-visible { border-color:#eca8bd; color:#eca8bd; outline:none; }
    button.primary { justify-content:center; border-color:#eca8bd; color:#282025; background:#eca8bd; }
    button.quiet { justify-content:center; color:#c9b9c5; background:transparent; }
    button:disabled { opacity:.4; cursor:default; }
    .swatch { width:24px; height:24px; flex:none; border:1px solid #ffffff55; border-radius:6px; }
    .color-value { color:#f4eff3; font:10px Consolas,monospace; }
    .active { border-color:#eca8bd; background:#5a3b4a; }
    #footer { margin-top:9px; color:#b8a7b7; font-size:10px; }
  `;
  const selections = document.createElement("div");
  selections.id = "selections";
  selections.setAttribute("aria-hidden", "true");
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
  shadow.append(style, selections, highlight, panel);
  document.documentElement.appendChild(host);

  let hoveredElement = null;
  let selectedElements = [];
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

  function placeBox(box, element) {
    if (!element || !element.isConnected) {
      box.style.display = "none";
      return;
    }
    const rect = element.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = `${Math.max(0, rect.left)}px`;
    box.style.top = `${Math.max(0, rect.top)}px`;
    box.style.width = `${Math.max(4, Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)))}px`;
    box.style.height = `${Math.max(4, Math.min(rect.height, window.innerHeight - Math.max(0, rect.top)))}px`;
  }

  function renderSelectedHighlights() {
    selections.replaceChildren();
    selectedElements = selectedElements.filter(element => element.isConnected);
    selectedElements.forEach(element => {
      const box = document.createElement("div");
      box.className = "picked";
      placeBox(box, element);
      selections.appendChild(box);
    });
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

  function makeButton(label, className, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener("click", action);
    return button;
  }

  function updatePinnedHighlights() {
    renderSelectedHighlights();
    if (hoveredElement?.isConnected && stage === "picking") placeBox(highlight, hoveredElement);
    else highlight.style.display = "none";
  }

  function showPicking(clear = false) {
    stage = "picking";
    if (clear) selectedElements = [];
    renderSelectedHighlights();
    title.style.color = "#f4eff3";
    title.textContent = "Pick areas";
    hint.textContent = "Hover to highlight an area, then click each area you want to change. Click a selected area again to remove it.";
    content.replaceChildren();
    const actions = document.createElement("div");
    actions.id = "actions";
    const confirm = makeButton(`Confirm ${selectedElements.length} area${selectedElements.length === 1 ? "" : "s"}`, "primary", showColors);
    confirm.disabled = selectedElements.length === 0;
    const clearButton = makeButton("Clear", "", () => showPicking(true));
    clearButton.disabled = selectedElements.length === 0;
    actions.append(confirm, clearButton, makeButton("Cancel", "quiet", cleanup));
    content.appendChild(actions);
    footer.textContent = selectedElements.length ? `${selectedElements.length} selected � purple outlines mark your choices.` : "Press Esc to cancel.";
    if (hoveredElement?.isConnected) placeBox(highlight, hoveredElement);
    else highlight.style.display = "none";
  }

  function showColors() {
    selectedElements = selectedElements.filter(element => element.isConnected);
    if (!selectedElements.length) {
      showPicking(true);
      title.textContent = "Those areas are no longer on the page. Pick them again.";
      return;
    }
    stage = "colors";
    highlight.style.display = "none";
    renderSelectedHighlights();
    title.textContent = `Confirm ${selectedElements.length} selected area${selectedElements.length === 1 ? "" : "s"}`;
    hint.textContent = "The purple outlines show what will change. Choose one saved color for this group.";
    content.replaceChildren();
    const grid = document.createElement("div");
    grid.id = "colors";
    for (const color of savedColors) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = color.id === activeColorId ? "active" : "";
      button.title = `Apply ${color.value} to the selected areas`;
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.backgroundColor = color.value;
      const value = document.createElement("span");
      value.className = "color-value";
      value.textContent = color.value.toUpperCase();
      button.append(swatch, value);
      button.addEventListener("click", () => saveAreas(color));
      grid.appendChild(button);
    }
    content.append(grid, makeButton("Back to areas", "quiet", () => showPicking()));
    footer.textContent = "This applies the chosen color to every selected area.";
  }

  function saveAreas(color) {
    const targets = selectedElements.filter(element => element.isConnected).map(element => ({
      selector: selectorFor(element),
      label: describe(element)
    }));
    if (!targets.length) {
      showPicking(true);
      title.textContent = "Those areas disappeared. Pick them again.";
      return;
    }
    stage = "saving";
    title.textContent = "Saving selected areas.";
    hint.textContent = `Applying ${color.value.toUpperCase()}.`;
    content.replaceChildren();
    chrome.runtime.sendMessage({ type: "kaleido-targets-picked", targets, colorId: color.id }, response => {
      const failed = chrome.runtime.lastError || !response?.ok;
      if (failed) {
        title.style.color = "#ff9ca8";
        title.textContent = "Kaleido couldn't save these areas.";
        hint.textContent = "Check the site's access, then try again.";
        content.append(makeButton("Back to colors", "primary", showColors));
        return;
      }
      const count = targets.length;
      selectedElements = [];
      renderSelectedHighlights();
      title.style.color = "#eca8bd";
      title.textContent = `${count} area${count === 1 ? "" : "s"} saved and colored.`;
      hint.textContent = `Applied ${color.value.toUpperCase()} to the selected areas.`;
      content.append(
        makeButton("Pick more areas", "primary", () => showPicking(true)),
        makeButton("Done", "quiet", cleanup)
      );
      footer.textContent = "Change any area's color later in the Kaleido menu.";
    });
  }

  function onMove(event) {
    if (stage !== "picking") return;
    const element = pageElement(event);
    if (element) {
      hoveredElement = element;
      placeBox(highlight, element);
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
    hoveredElement = element;
    const index = selectedElements.indexOf(element);
    if (index >= 0) selectedElements.splice(index, 1);
    else if (selectedElements.length < 100) selectedElements.push(element);
    showPicking();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") cleanup();
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", updatePinnedHighlights, true);
    window.removeEventListener("resize", updatePinnedHighlights, true);
    host.remove();
    window.__kaleidoPickerActive = false;
  }

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", updatePinnedHighlights, true);
  window.addEventListener("resize", updatePinnedHighlights, true);
  title.textContent = "Loading saved colors.";
  hint.textContent = "";
  chrome.runtime.sendMessage({ type: "kaleido-get-colors" }, response => {
    if (chrome.runtime.lastError) {
      title.textContent = "Kaleido couldn't load your saved colors.";
      hint.textContent = "Close the picker and reopen the extension.";
      content.appendChild(makeButton("Close picker", "quiet", cleanup));
      return;
    }
    savedColors = Array.isArray(response?.colors) ? response.colors : [];
    activeColorId = response?.activeColorId || "";
    if (!savedColors.length) {
      title.textContent = "No saved colors yet";
      hint.textContent = "Close this picker and save a color in the Kaleido menu first.";
      content.appendChild(makeButton("Close picker", "quiet", cleanup));
      return;
    }
    showPicking();
  });
})();

