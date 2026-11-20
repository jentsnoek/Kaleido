(() => {
  if (window.__kaleidoPickerActive) return;
  window.__kaleidoPickerActive = true;

  const options = window.__kaleidoPickerOptions || {};
  let targetGroupId = typeof options.groupId === "string" ? options.groupId : "";
  const selectByColor = options.selectByColor === true;
  const textMode = options.textMode === true;
  let matchedColorHex = "";
  let matchedColorRgb = [];
  let matchedColorScope = null;
  let targetGroup = null;
  let hoveredElement = null;
  let selectedElements = [];
  let dragStart = null;
  let dragBox = null;
  let dragStyle = null;
  let suppressClickUntil = 0;
  let savedColors = [];
  let activeColorId = "";
  let colorPreviewStyle = null;
  let stage = "picking";

  const host = document.createElement("div");
  host.dataset.kaleidoPickerUi = "true";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    #selections { position:fixed; inset:0; z-index:1; pointer-events:none; }
    .picked { position:fixed; border:2px solid #e8c7ff; border-radius:5px; background:rgba(205,180,255,.17); box-shadow:0 0 0 2px rgba(205,180,255,.18); pointer-events:none; }
    .drag-selection { position:fixed; border:1px solid #e8c7ff; background:rgba(205,180,255,.18); box-shadow:0 0 0 1px rgba(205,180,255,.25); pointer-events:none; }
    #highlight { display:none; position:fixed; z-index:2; border:2px solid #eca8bd; border-radius:5px; background:rgba(236,168,189,.24); box-shadow:0 0 0 9999px rgba(0,0,0,.14), 0 0 0 4px rgba(236,168,189,.16); pointer-events:none; }
    #panel { position:fixed; top:16px; right:16px; width:min(340px, calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow:auto; z-index:3; padding:15px; border:1px solid #765261; border-radius:14px; color:#f4eff3; background:#211a20; box-shadow:0 12px 38px #0009; font:13px/1.45 Segoe UI,system-ui,sans-serif; pointer-events:auto; }
    #brand { margin:0 0 9px; color:#eca8bd; font-size:16px; font-weight:750; }
    #title { margin:0 0 7px; color:#f4eff3; font-size:13px; font-weight:700; overflow-wrap:anywhere; }
    #hint { margin:0 0 12px; color:#b8a7b7; font-size:11px; }
    #actions { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
    #colors { display:grid; grid-template-columns:repeat(auto-fill,minmax(42px,1fr)); gap:8px; margin-bottom:8px; }
    button { min-width:0; display:flex; align-items:center; justify-content:center; gap:8px; border:1px solid #624955; border-radius:8px; padding:8px; color:#f4eff3; background:#30262d; text-align:left; font:600 11px Segoe UI,system-ui,sans-serif; cursor:pointer; }
    button:hover, button:focus-visible { border-color:#eca8bd; color:#eca8bd; outline:none; }
    button.primary { justify-content:center; border-color:#eca8bd; color:#282025; background:#eca8bd; }
    button.quiet { justify-content:center; color:#c9b9c5; background:transparent; }
    button:disabled { opacity:.4; cursor:default; }
    .swatch { width:28px; height:28px; flex:none; border:1px solid #ffffff66; border-radius:7px; box-shadow:inset 0 0 0 1px #0002; }
    #colors button { min-height:44px; padding:6px; }
    #colors button.active { border-color:#eca8bd; background:#5a3b4a; box-shadow:0 0 0 1px #eca8bd55; }
    #match-summary { display:flex; align-items:center; gap:8px; margin-bottom:8px; color:#d8cbd4; font-size:11px; }
    #match-summary .swatch { width:22px; height:22px; border-radius:6px; }
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
    selectedElements = selectedElements.filter(element => element.isConnected);
    selections.replaceChildren();
    selectedElements.forEach(element => {
      const box = document.createElement("div");
      box.className = "picked";
      placeBox(box, element);
      selections.appendChild(box);
    });
  }

  function clearColorPreview() {
    if (colorPreviewStyle) colorPreviewStyle.remove();
    colorPreviewStyle = null;
    document.querySelectorAll("[data-kaleido-picker-preview]").forEach(element =>
      element.removeAttribute("data-kaleido-picker-preview")
    );
  }

  function previewSelectedColor(color) {
    clearColorPreview();
    const rules = [];
    selectedElements.filter(element => element.isConnected).forEach((element, index) => {
      element.setAttribute("data-kaleido-picker-preview", String(index));
      if (textMode) {
        rules.push(`[data-kaleido-picker-preview="${index}"] { color: ${color.value} !important; }`);
      } else {
        const background = parseColor(getComputedStyle(element).backgroundColor);
        const alpha = background && background.alpha > 0.01 ? background.alpha : 1;
        const channels = color.value.match(/[0-9a-f]{2}/gi).map(channel => parseInt(channel, 16));
        const fill = alpha < 0.999 ? `rgba(${channels.join(",")},${alpha})` : color.value;
        rules.push(`[data-kaleido-picker-preview="${index}"] { background-color: ${fill} !important; background-image: none !important; }`);
      }
    });
    if (!rules.length) return;
    colorPreviewStyle = document.createElement("style");
    colorPreviewStyle.dataset.kaleidoPickerPreview = "true";
    colorPreviewStyle.textContent = rules.join("\n");
    (document.head || document.documentElement).appendChild(colorPreviewStyle);
  }

  function describe(element) {
    const tag = element?.localName || "area";
    const accessibleName = element?.getAttribute("aria-label") || element?.getAttribute("title");
    if (accessibleName) return `${tag}: ${accessibleName}`.slice(0, 64);
    if (element?.id) return `${tag}#${element.id}`.slice(0, 64);
    const firstClass = Array.from(element?.classList || []).find(name => name.length < 32 && !/[0-9a-f]{8,}/i.test(name));
    return (firstClass ? `${tag}.${firstClass}` : tag).slice(0, 64);
  }

  function escapeCss(value) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function buildSelector(element, useClasses) {
    const parts = [];
    let current = element;
    while (current && current instanceof Element) {
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

  function parseColor(value) {
    const match = /^rgba?\((.+)\)$/i.exec(String(value || "").trim());
    if (!match) return null;
    const parts = match[1].replace(/\//g, " ").trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = part => {
      const number = Number.parseFloat(part);
      return Number.isFinite(number) ? Math.max(0, Math.min(255, Math.round(part.endsWith("%") ? number * 2.55 : number))) : NaN;
    };
    const rgb = parts.slice(0, 3).map(channel);
    const alphaPart = parts[3] || "1";
    const alphaNumber = Number.parseFloat(alphaPart);
    const alpha = alphaPart.endsWith("%") ? alphaNumber / 100 : alphaNumber;
    if (!rgb.every(Number.isFinite) || !Number.isFinite(alpha)) return null;
    return { rgb, alpha: Math.max(0, Math.min(1, alpha)) };
  }

  function rgbToHex(rgb) {
    return "#" + rgb.map(value => Math.round(value).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  function effectiveBackground(element) {
    const layers = [];
    for (let current = element; current instanceof Element; current = current.parentElement) {
      const color = parseColor(getComputedStyle(current).backgroundColor);
      if (color && color.alpha > 0.01) layers.push(color);
    }
    let result = [255, 255, 255];
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const layer = layers[index];
      result = result.map((under, channel) => Math.round(layer.rgb[channel] * layer.alpha + under * (1 - layer.alpha)));
    }
    return result;
  }

  function findBackgroundSource(element) {
    let current = element;
    while (current instanceof Element) {
      const color = parseColor(getComputedStyle(current).backgroundColor);
      if (color && color.alpha > 0.01) {
        const rgb = effectiveBackground(current);
        return { element: current, rgb, hex: rgbToHex(rgb) };
      }
      current = current.parentElement;
    }
    return null;
  }

  const COLOR_MATCH_TOLERANCE = 36;

  function colorDistance(first, second) {
    return Math.sqrt(first.reduce((sum, channel, index) => sum + (channel - second[index]) ** 2, 0));
  }

  function isComponentBoundary(element) {
    const tag = element.localName || "";
    const role = element.getAttribute("role") || "";
    if (tag === "article" || role === "article") return true;
    const tokens = [
      element.id || "",
      ...Array.from(element.classList || []),
      element.getAttribute("data-testid") || ""
    ];
    if (tokens.some(token => /^(?:[a-z0-9]+-)*(?:card|post|tweet|comment|message|video|product)(?:-(?:card|item|renderer|container|content|row))?$/i.test(token))) return true;
    return tag.endsWith("-renderer") && /(?:item|video|post|feed)/i.test(tag);
  }

  function matchingBackgroundAreas(scope, targetRgb, includeScope = false) {
    if (!(scope instanceof Element)) return [];
    const candidates = [];
    const elements = [...(includeScope ? [scope] : []), ...scope.querySelectorAll("*")];
    for (const element of elements) {
      if (element === host || host.contains(element)) continue;
      const ownColor = parseColor(getComputedStyle(element).backgroundColor);
      if (!ownColor || ownColor.alpha <= 0.01) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.02) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if (colorDistance(effectiveBackground(element), targetRgb) > COLOR_MATCH_TOLERANCE) continue;
      candidates.push(element);
      if (candidates.length >= 500) break;
    }

    const candidateSet = new Set(candidates);
    return candidates.filter(element => {
      for (let parent = element.parentElement; parent && parent !== scope.parentElement; parent = parent.parentElement) {
        if (candidateSet.has(parent)) return false;
      }
      return true;
    });
  }

  function findLocalColorScope(sourceElement, targetRgb) {
    for (let current = sourceElement; current instanceof Element && current !== document.body; current = current.parentElement) {
      if (isComponentBoundary(current)) return current;
    }

    let current = sourceElement.parentElement;
    for (let depth = 0; current instanceof Element && current !== document.body && current.localName !== "main" && depth < 5; current = current.parentElement, depth += 1) {
      if (current.querySelectorAll("*").length > 1200) break;
      if (matchingBackgroundAreas(current, targetRgb).length > 1) return current;
    }
    return sourceElement;
  }

  function findLocalMatchingAreas(sourceElement, targetRgb) {
    const scope = findLocalColorScope(sourceElement, targetRgb);
    const areas = matchingBackgroundAreas(scope, targetRgb, scope === sourceElement);
    const selected = areas.some(element => element === sourceElement || element.contains(sourceElement))
      ? areas
      : [sourceElement, ...areas];
    return { scope, elements: selected.slice(0, 100) };
  }

  function hasExistingTextColor(element) {
    for (let current = element; current instanceof Element && current !== document.body; current = current.parentElement) {
      if (current.matches('a, [role="link"], button, [role="button"], mark, code, pre, kbd, samp, input, select, textarea, [contenteditable="true"]')) return true;
      const parent = current.parentElement;
      if (!parent) break;
      const style = getComputedStyle(current);
      const parentStyle = getComputedStyle(parent);
      if (current.hasAttribute("data-kaleido-text-target")) return false;
      if (style.color !== parentStyle.color) return true;
      if (style.webkitTextFillColor !== parentStyle.webkitTextFillColor) return true;
      if ((style.backgroundClip === "text" || style.webkitBackgroundClip === "text") && style.backgroundImage !== "none") return true;
    }
    return false;
  }

  function showColorTarget() {
    stage = "color-target";
    selectedElements = [];
    renderSelectedHighlights();
    title.style.color = "#f4eff3";
    title.textContent = "Match by color";
    hint.textContent = "Click a solid-colored area.";
    content.replaceChildren(makeButton("Cancel", "quiet", cleanup));
    footer.textContent = "Solid backgrounds only."
    highlight.style.display = "none";
  }

  function selectMatchingColor(element) {
    const source = findBackgroundSource(element);
    if (!source || source.element === document.body) {
      title.textContent = "No solid color there";
      hint.textContent = "Try a colored panel.";
      return;
    }
    matchedColorHex = source.hex;
    matchedColorRgb = source.rgb;
    const match = findLocalMatchingAreas(source.element, source.rgb);
    matchedColorScope = match.scope;
    selectedElements = match.elements;
    hoveredElement = source.element;
    showPicking();
  }

  function updatePinnedHighlights() {
    renderSelectedHighlights();
    if (hoveredElement?.isConnected && (stage === "picking" || stage === "color-target")) placeBox(highlight, hoveredElement);
    else highlight.style.display = "none";
  }

  function showPicking(clear = false) {
    clearColorPreview();
    stage = "picking";
    if (clear) selectedElements = [];
    renderSelectedHighlights();
    title.style.color = "#f4eff3";
    if (selectByColor && matchedColorHex) {
      title.textContent = selectedElements.length
        ? `Selected ${selectedElements.length} matching area${selectedElements.length === 1 ? "" : "s"}`
        : "Select an area in this component";
      hint.textContent = "Click matching areas here to add or remove them.";
    } else {
      title.textContent = textMode
        ? (targetGroup ? `Add text to ${targetGroup.name}` : "Pick text areas")
        : (targetGroup ? `Add areas to ${targetGroup.name}` : "Pick areas for a new group");
      hint.textContent = targetGroup
        ? (textMode ? "Click text or drag to add several. Click again to remove." : "Click areas to add or remove.")
        : (textMode ? "Click text or drag to select several." : "Click areas to select them.");
    }
    content.replaceChildren();
    if (selectByColor && matchedColorHex) {
      const matchSummary = document.createElement("div");
      matchSummary.id = "match-summary";
      const matchSwatch = document.createElement("span");
      matchSwatch.className = "swatch";
      matchSwatch.style.backgroundColor = matchedColorHex;
      const matchLabel = document.createElement("span");
      matchLabel.textContent = "Local color match";
      matchSummary.append(matchSwatch, matchLabel);
      content.appendChild(matchSummary);
    }
    const actions = document.createElement("div");
    actions.id = "actions";
    const confirm = makeButton(`Confirm ${selectedElements.length}`, "primary", showColors);
    confirm.disabled = selectedElements.length === 0;
    const clearButton = makeButton("Clear", "", () => showPicking(true));
    clearButton.disabled = selectedElements.length === 0;
    actions.append(confirm, clearButton, makeButton("Cancel", "quiet", cleanup));
    content.appendChild(actions);
    footer.textContent = selectByColor && matchedColorHex
      ? "Matching areas in this component."
      : selectedElements.length
        ? `${selectedElements.length} selected.`
        : "Esc or Cancel to close.";
    if (hoveredElement?.isConnected) placeBox(highlight, hoveredElement);
    else highlight.style.display = "none";
  }

  function showColors() {
    selectedElements = selectedElements.filter(element => element.isConnected);
    if (!selectedElements.length) {
      showPicking(true);
      title.textContent = textMode ? "Text is no longer on the page." : "Areas are no longer on the page.";
      return;
    }
    stage = "colors";
    highlight.style.display = "none";
    renderSelectedHighlights();
    content.replaceChildren();

    if (targetGroup) {
      const groupColor = savedColors.find(color => color.id === targetGroup.colorId);
      if (!groupColor) {
        title.textContent = "Group color not found.";
        hint.textContent = "Choose another color first.";
        content.appendChild(makeButton("Close", "quiet", cleanup));
        return;
      }
      previewSelectedColor(groupColor);
      title.textContent = `Add ${selectedElements.length} to ${targetGroup.name}?`;
      hint.textContent = "Preview shown on the page.";
      const add = makeButton(`Add to ${targetGroup.name}`, "primary", () => saveAreas(groupColor));
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.backgroundColor = groupColor.value;
      add.prepend(swatch);
      content.append(
        add,
        makeButton("Back", "quiet", () => showPicking()),
        makeButton("Cancel", "quiet", cleanup)
      );
      footer.textContent = "";
      return;
    }

    title.textContent = `Choose a color (${selectedElements.length})`;
    hint.textContent = "Choose a color.";
    const grid = document.createElement("div");
    grid.id = "colors";
    savedColors.forEach((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = color.id === activeColorId ? "active" : "";
      button.title = "Apply this color to the selected areas";
      button.setAttribute("aria-label", `Saved color ${index + 1}`);
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.backgroundColor = color.value;
      button.appendChild(swatch);
      button.addEventListener("mouseenter", () => previewSelectedColor(color));
      button.addEventListener("mouseleave", clearColorPreview);
      button.addEventListener("focus", () => previewSelectedColor(color));
      button.addEventListener("blur", clearColorPreview);
      button.addEventListener("click", () => saveAreas(color));
      grid.appendChild(button);
    });
    content.append(
      grid,
      makeButton("Back", "quiet", () => showPicking()),
      makeButton("Cancel", "quiet", cleanup)
    );
    footer.textContent = "";
  }

  function saveAreas(color) {
    const targets = selectedElements.filter(element => element.isConnected).map(element => {
      const target = { selector: selectorFor(element), label: describe(element) };
      if (!textMode) {
        const background = parseColor(getComputedStyle(element).backgroundColor);
        target.alpha = background && background.alpha > 0.01 ? background.alpha : 1;
      }
      return target;
    });
    if (!targets.length) {
      showPicking(true);
      title.textContent = textMode ? "Text disappeared." : "Areas disappeared.";
      return;
    }
    stage = "saving";
    title.textContent = "Saving…";
    hint.textContent = "";
    content.replaceChildren();
    const message = { type: "kaleido-targets-picked", targets, colorId: color.id, kind: textMode ? "text" : "background" };
    if (targetGroupId) message.groupId = targetGroupId;
    chrome.runtime.sendMessage(message, response => {
      const failed = chrome.runtime.lastError || !response?.ok;
      if (failed) {
        title.style.color = "#ff9ca8";
        title.textContent = "Couldn't save.";
        hint.textContent = "Check permissions and try again.";
        content.append(
          makeButton("Back", "primary", showColors),
          makeButton("Cancel", "quiet", cleanup)
        );
        return;
      }
      const count = targets.length;
      targetGroupId = response.groupId || targetGroupId;
      targetGroup = {
        id: targetGroupId,
        name: response.groupName || targetGroup?.name || "this group",
        colorId: response.colorId || color.id
      };
      clearColorPreview();
      selectedElements = [];
      renderSelectedHighlights();
      title.style.color = "#eca8bd";
      title.textContent = `${count} added.`;
      hint.textContent = "";
      content.append(
        makeButton(textMode ? "Add more text" : "Add more areas", "primary", () => showPicking(true)),
        makeButton("Done", "quiet", cleanup)
      );
      footer.textContent = "";
    });
  }

  function onMove(event) {
    if (stage !== "picking" && stage !== "color-target") return;
    if (textMode && dragStart && stage === "picking") {
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      if (!dragBox && Math.hypot(dx, dy) >= 6) {
        dragBox = document.createElement("div");
        dragBox.className = "drag-selection";
        selections.appendChild(dragBox);
        dragStyle = document.createElement("style");
        dragStyle.textContent = "* { user-select:none !important; cursor:crosshair !important; }";
        (document.head || document.documentElement).appendChild(dragStyle);
      }
      if (dragBox) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        updateDragBox(event.clientX, event.clientY);
        return;
      }
    }
    const element = pageElement(event);
    if (element) {
      hoveredElement = element;
      placeBox(highlight, element);
    } else if (!isPickerUi(event)) {
      hoveredElement = null;
      highlight.style.display = "none";
    }
  }

  function updateDragBox(clientX, clientY) {
    const left = Math.min(dragStart.x, clientX);
    const top = Math.min(dragStart.y, clientY);
    dragBox.style.left = `${left}px`;
    dragBox.style.top = `${top}px`;
    dragBox.style.width = `${Math.abs(clientX - dragStart.x)}px`;
    dragBox.style.height = `${Math.abs(clientY - dragStart.y)}px`;
  }

  function hasDirectText(element) {
    return Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  }

  function selectTextInBox(rect) {
    const candidates = Array.from(document.body.querySelectorAll("*"));
    const matches = candidates.filter(element => {
      if (element === host || element.closest("[data-kaleido-picker-ui]") || !hasDirectText(element)) return false;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      if (hasExistingTextColor(element)) return false;
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && bounds.right >= rect.left && bounds.left <= rect.right &&
        bounds.bottom >= rect.top && bounds.top <= rect.bottom;
    });
    const additions = matches.filter(element => !selectedElements.includes(element));
    selectedElements.push(...additions.slice(0, Math.max(0, 100 - selectedElements.length)));
  }

  function onMouseDown(event) {
    if (!textMode || stage !== "picking" || event.button !== 0 || isPickerUi(event)) return;
    dragStart = { x: event.clientX, y: event.clientY };
    dragBox = null;
  }

  function onMouseUp(event) {
    if (!dragStart) return;
    if (!dragBox) {
      dragStart = null;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const left = Math.min(dragStart.x, event.clientX);
    const top = Math.min(dragStart.y, event.clientY);
    selectTextInBox({ left, top, right: Math.max(dragStart.x, event.clientX), bottom: Math.max(dragStart.y, event.clientY) });
    dragBox.remove();
    dragBox = null;
    dragStyle?.remove();
    dragStyle = null;
    dragStart = null;
    suppressClickUntil = Date.now() + 250;
    showPicking();
  }

  function onClick(event) {
    if (isPickerUi(event)) return;
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    if (stage !== "picking" && stage !== "color-target") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const element = pageElement(event);
    if (!element) return;
    hoveredElement = element;
    if (stage === "color-target") {
      selectMatchingColor(element);
      return;
    }
    if (textMode && hasExistingTextColor(element)) {
      showPicking();
      title.textContent = "Text already has a color";
      hint.textContent = "Skipped.";
      return;
    }
    if (selectByColor && matchedColorHex) {
      const source = findBackgroundSource(element);
      if (source) {
        const match = findLocalMatchingAreas(source.element, source.rgb);
        const sameColor = matchedColorRgb.length && colorDistance(source.rgb, matchedColorRgb) <= COLOR_MATCH_TOLERANCE;
        if (match.scope === matchedColorScope && sameColor) {
          const index = selectedElements.indexOf(source.element);
          if (index >= 0) selectedElements.splice(index, 1);
          else if (selectedElements.length < 100) selectedElements.push(source.element);
        } else {
          matchedColorHex = source.hex;
          matchedColorRgb = source.rgb;
          matchedColorScope = match.scope;
          selectedElements = match.elements;
        }
      }
    } else {
      const index = selectedElements.indexOf(element);
      if (index >= 0) selectedElements.splice(index, 1);
      else if (selectedElements.length < 100) selectedElements.push(element);
    }
    showPicking();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") cleanup();
  }

  function cleanup() {
    clearColorPreview();
    dragStyle?.remove();
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("mouseup", onMouseUp, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", updatePinnedHighlights, true);
    window.removeEventListener("resize", updatePinnedHighlights, true);
    host.remove();
    window.__kaleidoPickerActive = false;
  }

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", updatePinnedHighlights, true);
  window.addEventListener("resize", updatePinnedHighlights, true);
  title.textContent = "Loading colors…";
  hint.textContent = "";
  chrome.runtime.sendMessage({ type: "kaleido-get-colors" }, response => {
    if (chrome.runtime.lastError) {
      title.textContent = "Couldn't load colors.";
      hint.textContent = "Close and try again.";
      content.appendChild(makeButton("Cancel", "quiet", cleanup));
      return;
    }
    savedColors = Array.isArray(textMode ? response?.textColors : response?.colors)
      ? (textMode ? response.textColors : response.colors)
      : [];
    activeColorId = textMode
      ? response?.activeTextColorId || ""
      : response?.activeColorId || "";
    targetGroup = targetGroupId ? (response?.groups || []).find(group => group.id === targetGroupId) || null : null;
    if (targetGroupId && !targetGroup) {
      title.textContent = "Group not found.";
      hint.textContent = "Close and try again.";
      content.appendChild(makeButton("Cancel", "quiet", cleanup));
      return;
    }
    if (!savedColors.length) {
      title.textContent = "No saved colors.";
      hint.textContent = "Save one in Kaleido first.";
      content.appendChild(makeButton("Cancel", "quiet", cleanup));
      return;
    }
    if (selectByColor) showColorTarget();
    else showPicking();
  });
})();

