(() => {
  if (window.__kaleidoPickerActive) return;
  window.__kaleidoPickerActive = true;

  const options = window.__kaleidoPickerOptions || {};
  let targetGroupId = typeof options.groupId === "string" ? options.groupId : "";
  const selectByColor = options.selectByColor === true;
  const textMode = options.textMode === true;
  let matchedColorHex = "";
  let targetGroup = null;
  let hoveredElement = null;
  let selectedElements = [];
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

  function hasExistingTextColor(element) {
    for (let current = element; current instanceof Element && current !== document.body; current = current.parentElement) {
      if (current.hasAttribute("data-kaleido-text-target")) return false;
      const parent = current.parentElement;
      if (parent && getComputedStyle(current).color !== getComputedStyle(parent).color) return true;
    }
    return false;
  }

  function showColorTarget() {
    stage = "color-target";
    selectedElements = [];
    renderSelectedHighlights();
    title.style.color = "#f4eff3";
    title.textContent = "Choose one area by its color";
    hint.textContent = "Click a solid-colored area. Only that area will be selected.";
    content.replaceChildren(makeButton("Cancel picking", "quiet", cleanup));
    footer.textContent = "Solid backgrounds only."
    highlight.style.display = "none";
  }

  function selectMatchingColor(element) {
    const source = findBackgroundSource(element);
    if (!source || source.element === document.body) {
      title.textContent = "Click a solid-colored area";
      hint.textContent = "No solid color there. Try a colored panel."
      return;
    }
    matchedColorHex = source.hex;
    selectedElements = [source.element];
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
      title.textContent = selectedElements.length ? "Selected one area" : "Select one area";
      hint.textContent = "Only the area you click will be selected.";
    } else {
      title.textContent = textMode
        ? (targetGroup ? `Add text to ${targetGroup.name}` : "Pick text areas")
        : (targetGroup ? `Add areas to ${targetGroup.name}` : "Pick areas for a new group");
      hint.textContent = targetGroup
        ? (textMode ? "Click text areas to add them. Click again to remove." : "Click areas to add them. Click again to remove.")
        : (textMode ? "Click text to select it. Click again to remove." : "Click areas to select them. Click again to remove.");
    }
    content.replaceChildren();
    if (selectByColor && matchedColorHex) {
      const matchSummary = document.createElement("div");
      matchSummary.id = "match-summary";
      const matchSwatch = document.createElement("span");
      matchSwatch.className = "swatch";
      matchSwatch.style.backgroundColor = matchedColorHex;
      const matchLabel = document.createElement("span");
      matchLabel.textContent = "Selected area color";
      matchSummary.append(matchSwatch, matchLabel);
      content.appendChild(matchSummary);
    }
    const actions = document.createElement("div");
    actions.id = "actions";
    const selectionName = textMode ? "text area" : "area";
    const confirm = makeButton(`Confirm ${selectedElements.length} ${selectionName}${selectedElements.length === 1 ? "" : "s"}`, "primary", showColors);
    confirm.disabled = selectedElements.length === 0;
    const clearButton = makeButton("Clear", "", () => showPicking(true));
    clearButton.disabled = selectedElements.length === 0;
    actions.append(confirm, clearButton, makeButton("Cancel picking", "quiet", cleanup));
    content.appendChild(actions);
    footer.textContent = selectByColor && matchedColorHex
      ? "Choose one area with a solid background."
      : selectedElements.length
        ? `${selectedElements.length} selected - purple outlines mark your choices.`
        : "Press Esc or Cancel picking to close without saving.";
    if (hoveredElement?.isConnected) placeBox(highlight, hoveredElement);
    else highlight.style.display = "none";
  }

  function showColors() {
    selectedElements = selectedElements.filter(element => element.isConnected);
    if (!selectedElements.length) {
      showPicking(true);
      title.textContent = textMode ? "That text is no longer on the page. Pick it again." : "Those areas are no longer on the page. Pick them again.";
      return;
    }
    stage = "colors";
    highlight.style.display = "none";
    renderSelectedHighlights();
    content.replaceChildren();

    if (targetGroup) {
      const groupColor = savedColors.find(color => color.id === targetGroup.colorId);
      if (!groupColor) {
        title.textContent = "This group's color is no longer saved.";
        hint.textContent = "Close the picker and choose another color for the group first.";
        content.appendChild(makeButton("Close picker", "quiet", cleanup));
        return;
      }
      previewSelectedColor(groupColor);
      title.textContent = textMode
        ? `Add ${selectedElements.length} text area${selectedElements.length === 1 ? "" : "s"} to ${targetGroup.name}?`
        : `Add ${selectedElements.length} area${selectedElements.length === 1 ? "" : "s"} to ${targetGroup.name}?`;
      hint.textContent = textMode ? "These text areas will use the group color." : "Preview shown on the page. Confirm to add it to the group.";
      const add = makeButton(`Add to ${targetGroup.name}`, "primary", () => saveAreas(groupColor));
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.backgroundColor = groupColor.value;
      add.prepend(swatch);
      content.append(
        add,
        makeButton("Back to areas", "quiet", () => showPicking()),
        makeButton("Cancel picking", "quiet", cleanup)
      );
      footer.textContent = textMode
        ? "New text areas will use the same color as the rest of this group."
        : "New areas will use the same color as the rest of this group.";
      return;
    }

    title.textContent = textMode
      ? `Choose a color for ${selectedElements.length} selected text area${selectedElements.length === 1 ? "" : "s"}`
      : `Confirm ${selectedElements.length} selected area${selectedElements.length === 1 ? "" : "s"}`;
    hint.textContent = selectByColor && matchedColorHex
      ? "Choose one color for these areas."
      : textMode
        ? "The purple outlines show which text will change. Choose a color square."
        : "The purple outlines show what will change. Choose a color square for the group.";
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
      makeButton("Back to areas", "quiet", () => showPicking()),
      makeButton("Cancel picking", "quiet", cleanup)
    );
    footer.textContent = textMode ? "One color applies to all selected text areas." : "One color applies to all selected areas."
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
      title.textContent = textMode ? "That text disappeared. Pick it again." : "Those areas disappeared. Pick them again.";
      return;
    }
    stage = "saving";
    title.textContent = textMode ? "Saving selected text." : "Saving selected areas.";
    hint.textContent = textMode ? "Applying the chosen text color." : "Applying the chosen group color.";
    content.replaceChildren();
    const message = { type: "kaleido-targets-picked", targets, colorId: color.id, kind: textMode ? "text" : "background" };
    if (targetGroupId) message.groupId = targetGroupId;
    chrome.runtime.sendMessage(message, response => {
      const failed = chrome.runtime.lastError || !response?.ok;
      if (failed) {
        title.style.color = "#ff9ca8";
        title.textContent = textMode ? "Kaleido couldn't save this text." : "Kaleido couldn't save these areas.";
        hint.textContent = "Check site access and try again.";
        content.append(
          makeButton("Back to colors", "primary", showColors),
          makeButton("Cancel picking", "quiet", cleanup)
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
      title.textContent = textMode
        ? `${count} text area${count === 1 ? "" : "s"} added to ${targetGroup.name}.`
        : `${count} area${count === 1 ? "" : "s"} added to ${targetGroup.name}.`;
      hint.textContent = textMode ? "Text color applied." : "Group color applied."
      content.append(
        makeButton(textMode ? "Add more text" : "Add more areas", "primary", () => showPicking(true)),
        makeButton("Done", "quiet", cleanup)
      );
      footer.textContent = "Change the group's color or its areas in the Kaleido menu.";
    });
  }

  function onMove(event) {
    if (stage !== "picking" && stage !== "color-target") return;
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
      title.textContent = "This text already has its own color";
      hint.textContent = "Kaleido skips colored text so links and important text keep their color.";
      return;
    }
    if (selectByColor && matchedColorHex) {
      const source = findBackgroundSource(element);
      if (source) {
        matchedColorHex = source.hex;
        selectedElements = [source.element];
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
  title.textContent = "Loading colors…";
  hint.textContent = "";
  chrome.runtime.sendMessage({ type: "kaleido-get-colors" }, response => {
    if (chrome.runtime.lastError) {
      title.textContent = "Kaleido couldn't load your saved colors.";
      hint.textContent = "Close and reopen the picker.";
      content.appendChild(makeButton("Cancel picking", "quiet", cleanup));
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
      title.textContent = "That group could not be found.";
      hint.textContent = "Close and reopen this group.";
      content.appendChild(makeButton("Cancel picking", "quiet", cleanup));
      return;
    }
    if (!savedColors.length) {
      title.textContent = "No saved colors yet";
      hint.textContent = "Save a color in Kaleido first."
      content.appendChild(makeButton("Cancel picking", "quiet", cleanup));
      return;
    }
    if (selectByColor) showColorTarget();
    else showPicking();
  });
})();

