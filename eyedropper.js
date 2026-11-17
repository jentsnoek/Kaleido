(() => {
  if (window.__kaleidoEyedropper?.cleanup) window.__kaleidoEyedropper.cleanup();

  const host = document.createElement("div");
  host.setAttribute("data-kaleido-eyedropper", "true");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = ":host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none} .box{position:fixed;box-sizing:border-box;border:2px solid #eca8bd;border-radius:4px;background:rgba(236,168,189,.12);box-shadow:0 0 0 2px rgba(40,32,37,.8)} .tip{position:fixed;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid #eca8bd;border-radius:10px;background:#282025;color:#f7f1f4;font:13px/1.3 system-ui,sans-serif;box-shadow:0 6px 24px #0008} .swatch{width:20px;height:20px;border:1px solid #ffffff88;border-radius:5px;background:#fff} .text{white-space:nowrap}";
  const box = document.createElement("div");
  box.className = "box";
  box.hidden = true;
  const tip = document.createElement("div");
  tip.className = "tip";
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  const text = document.createElement("span");
  text.className = "text";
  text.textContent = "Move over a color, click to pick · Esc to cancel";
  tip.append(swatch, text);
  shadow.append(style, box, tip);
  (document.documentElement || document.body).appendChild(host);

  let hovered = null;
  let sampled = "#FFFFFF";

  function cssColorToHex(element) {
    let node = element;
    while (node instanceof Element) {
      const value = getComputedStyle(node).backgroundColor;
      const match = value.match(/rgba?\(([^)]+)\)/i);
      if (match) {
        const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        if (parts.length >= 3 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && Number.isFinite(parts[2])) {
          const alpha = Number.isFinite(parts[3]) ? parts[3] : 1;
          if (alpha > 0.05) {
            const rgb = [parts[0], parts[1], parts[2]].map(channel =>
              Math.round(channel * alpha + 255 * (1 - alpha))
            );
            return "#" + rgb.map(channel => channel.toString(16).padStart(2, "0")).join("").toUpperCase();
          }
        }
      }
      node = node.parentElement;
    }
    const textColor = getComputedStyle(element).color.match(/rgba?\(([^)]+)\)/i);
    if (textColor) {
      const parts = textColor[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
        return "#" + parts.slice(0, 3).map(channel =>
          Math.round(channel).toString(16).padStart(2, "0")
        ).join("").toUpperCase();
      }
    }
    return "#FFFFFF";
  }

  function placeHighlight(element) {
    const rect = element.getBoundingClientRect();
    box.hidden = rect.width <= 0 || rect.height <= 0;
    box.style.left = rect.left + "px";
    box.style.top = rect.top + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";
    sampled = cssColorToHex(element);
    swatch.style.backgroundColor = sampled;
    text.textContent = sampled + " · click to pick · Esc to cancel";
  }

  function onMove(event) {
    if (event.composedPath().includes(host)) return;
    const element = event.target instanceof Element ? event.target : document.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === host) return;
    hovered = element;
    placeHighlight(element);
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", updateHighlight, true);
    window.removeEventListener("resize", updateHighlight);
    host.remove();
    window.__kaleidoEyedropper = null;
  }

  function onClick(event) {
    if (event.composedPath().includes(host)) return;
    const element = event.target instanceof Element ? event.target : hovered;
    if (!element || element === host) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sampled = cssColorToHex(element);
    chrome.runtime.sendMessage({ type: "kaleido-color-picked", value: sampled }, () => {});
    cleanup();
  }

  function updateHighlight() {
    if (hovered?.isConnected) placeHighlight(hovered);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      cleanup();
    }
  }

  window.__kaleidoEyedropper = { cleanup };
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", updateHighlight, true);
  window.addEventListener("resize", updateHighlight);
})();