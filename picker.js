(() => {
  if (window.__kaleidoPickerActive) return;
  window.__kaleidoPickerActive = true;

  const host = document.createElement("div");
  host.setAttribute("data-kaleido-picker-ui", "true");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    #outline { display:none; position:fixed; z-index:1; border:2px solid #eca8bd; border-radius:4px; background:#eca8bd22; box-shadow:0 0 0 99999px #0003; pointer-events:none; }
    #panel { display:none; position:fixed; z-index:2; width:270px; padding:12px; border:1px solid #765261; border-radius:12px; color:#f4eff3; background:#211a20; box-shadow:0 12px 35px #0009; font:12px/1.4 Segoe UI,system-ui,sans-serif; pointer-events:auto; }
    #title { margin:0 0 9px; color:#f4eff3; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #hint { margin:0 0 8px; color:#b8a7b7; font-size:10px; }
    #roles { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    button { border:1px solid #624955; border-radius:7px; padding:7px 6px; color:#f4eff3; background:#30262d; font:600 10px Segoe UI,system-ui,sans-serif; cursor:pointer; }
    button:hover, button:focus { border-color:#eca8bd; color:#eca8bd; outline:none; }
    #cancel { width:100%; margin-top:7px; color:#b8a7b7; background:transparent; }
    #message { margin:0; color:#eca8bd; }
  `;
  const outline = document.createElement("div");
  outline.id = "outline";
  const panel = document.createElement("div");
  panel.id = "panel";
  const title = document.createElement("p");
  title.id = "title";
  const hint = document.createElement("p");
  hint.id = "hint";
  hint.textContent = "Choose what Kaleido should do with this area.";
  const roles = document.createElement("div");
  roles.id = "roles";
  const cancel = document.createElement("button");
  cancel.id = "cancel";
  cancel.type = "button";
  cancel.textContent = "Cancel � Esc";
  panel.append(title, hint, roles, cancel);
  shadow.append(style, outline, panel);
  document.documentElement.appendChild(host);

  let selectedElement = null;
  let lastPoint = { x: 20, y: 20 };

  function pageElement(event) {
    const candidate = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!candidate || event.composedPath().includes(host) || candidate === document.documentElement) return null;
    return candidate;
  }

  function updateOutline(element) {
    if (!element || element === document.body) {
      outline.style.display = "none";
      return;
    }
    const rect = element.getBoundingClientRect();
    outline.style.display = "block";
    outline.style.left = `${Math.max(0, rect.left)}px`;
    outline.style.top = `${Math.max(0, rect.top)}px`;
    outline.style.width = `${Math.max(4, rect.width)}px`;
    outline.style.height = `${Math.max(4, rect.height)}px`;
  }

  function onMove(event) {
    const element = pageElement(event);
    if (element) updateOutline(element);
    lastPoint = { x: event.clientX, y: event.clientY };
  }

  function escapeCss(value) {
    return window.CSS && typeof CSS.escape === "function" ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function buildSelector(element, includeClasses = true) {
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
        } catch {
          // Continue with a tag-and-position selector.
        }
      }

      let part = current.localName;
      if (includeClasses && current.classList?.length) {
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
    let selector = buildSelector(element, true);
    try {
      if (document.querySelectorAll(selector).length === 1) return selector;
    } catch {
      // Use the positional fallback below.
    }
    selector = buildSelector(element, false);
    return selector;
  }

  function describe(element) {
    const tag = element.localName || "element";
    if (element.id) return `${tag}#${element.id}`.slice(0, 70);
    const classes = Array.from(element.classList || []).slice(0, 2).join(".");
    return (classes ? `${tag}.${classes}` : tag).slice(0, 70);
  }

  function showRoleMenu(element) {
    selectedElement = element;
    title.textContent = `Selected: ${describe(element)}`;
    hint.textContent = "Pick a color role, or ignore this area in automatic matching.";
    roles.replaceChildren();
    const options = [
      ["base", "Page color"],
      ["surface", "Card color"],
      ["text", "Text color"],
      ["accent", "Accent color"],
      ["ignore", "Ignore automatic matching"]
    ];
    for (const [role, label] of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => saveRole(role));
      roles.appendChild(button);
    }
    panel.style.display = "block";
    const width = 270;
    const left = Math.max(8, Math.min(lastPoint.x + 12, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(lastPoint.y + 12, window.innerHeight - 210));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    updateOutline(element);
  }

  function showMessage(message, isError = false) {
    title.textContent = message;
    hint.textContent = "";
    roles.replaceChildren();
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Done";
    done.addEventListener("click", cleanup);
    roles.appendChild(done);
    title.style.color = isError ? "#ff9ca8" : "#eca8bd";
    panel.style.display = "block";
  }

  function saveRole(role) {
    if (!selectedElement) return;
    const selector = selectorFor(selectedElement);
    const label = describe(selectedElement);
    chrome.runtime.sendMessage({ type: "kaleido-target-picked", selector, label, role }, response => {
      const failed = chrome.runtime.lastError || !response?.ok;
      showMessage(failed ? "Kaleido couldn't save this area." : "Area saved for this website.", Boolean(failed));
    });
  }

  function onClick(event) {
    const element = pageElement(event);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    lastPoint = { x: event.clientX, y: event.clientY };
    showRoleMenu(element);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") cleanup();
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize, true);
    host.remove();
    window.__kaleidoPickerActive = false;
  }

  function onScroll() {
    if (selectedElement) updateOutline(selectedElement);
  }
  function onResize() {
    if (selectedElement) updateOutline(selectedElement);
  }

  cancel.addEventListener("click", cleanup);
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onResize, true);
})();

