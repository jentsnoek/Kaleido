# Kaleido

Kaleido lets you recolor specific areas of websites yourself. Pick one or more areas, confirm the highlights, and choose a saved color for the group. You can change the group's color, add areas, or remove individual areas later. It does not guess which parts of a page to change.

## Install the development build

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome or `vivaldi://extensions` in Vivaldi.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted Kaleido folder containing `manifest.json`.
5. Open a website and choose **Select an area**.

The first time you pick an area, the browser asks for website access. Kaleido uses that permission to apply the saved areas on websites you choose. You can revoke it in the browser's extension settings.

## Pick and color an area

Move over the page to see the highlighted area. Click each area you want to change, confirm the highlighted selection, then choose a saved color square for that group. Kaleido applies and saves the color for the current website. Groups start collapsed in the popup. Expand one to review, reorder, temporarily turn off, or remove areas. Click an area name to highlight it on the page (click again to clear the highlight), use its color square to recolor the whole group, or delete the group. Pause all Kaleido colors on a site with **Pause colors**. Search saved websites in **Find a saved website**. Use **Undo** and **Redo** for recent changes. Add, edit, and remove swatches in the **Colors** section; it includes a larger set of UI-friendly colors. Choose **Pick from page** to sample a page background color, then save the swatch.

Your color library and picked areas are stored in the browser's local extension storage. Use **Move settings to another device** to create a compressed, AES-GCM encrypted transfer code protected by your passphrase. The code includes saved colors, custom areas, and their enabled or paused states; browser website permissions must still be granted on each device. Kaleido does not automatically sync settings. Kaleido does not send page data or settings to a server. See [`privacy.html`](./privacy.html).

Kaleido is an unofficial community project and is not affiliated with or endorsed by Riot Games.

