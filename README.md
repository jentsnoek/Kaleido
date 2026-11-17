# Kaleido

Kaleido lets you recolor website areas yourself. Use **Select an area** to pick parts manually, or **Select matching color** to click a solid background and find visible areas with that exact same color. Review the highlighted matches, remove any you do not want, then choose a new color to save them as a group. Matching is based on exact solid CSS background colors; gradients, images, text colors, and borders are not matched.

## Install the development build

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome or `vivaldi://extensions` in Vivaldi.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted Kaleido folder containing `manifest.json`.
5. Open a website and choose **Select an area** or **Select matching color**.

The first time you pick an area, the browser asks for website access. Kaleido uses that permission to apply the saved areas on websites you choose. You can revoke it in the browser's extension settings.

## Pick and color an area

For manual picking, move over the page to see the highlighted area, click each area, confirm the selection, then choose a saved color square. For color matching, click **Select matching color**, then click a solid-colored area on the page. Kaleido highlights other visible areas with the exact same solid background color; click highlighted matches to remove them or click another matching area to include it, confirm, then choose the color to apply to the group. Kaleido applies and saves the color for the current website. Groups start collapsed in the popup. Expand one to review, reorder, temporarily turn off, or remove areas. Click an area name to highlight it on the page (click again to clear the highlight), use its color square to preview colors on hover and apply one with a click, or delete the group. Pause all Kaleido colors on a site with **Pause colors**. Search saved websites in **Find a saved website**. Use **Undo** and **Redo** for recent changes. **Reset page** removes this host's saved areas and hides inherited parent-domain colors on this host only; it does not remove saved colors or settings for other websites. Add, edit, and remove swatches in the **Colors** section; it includes a larger set of UI-friendly colors. Choose the pipette icon beside **Save color** to sample a page background color, then save the swatch.

Your color library and picked areas are stored in the browser's local extension storage. Use **Move settings to another device** to create a compressed, AES-GCM encrypted transfer code protected by your passphrase. The code includes saved colors, custom areas, and their enabled or paused states; browser website permissions must still be granted on each device. Kaleido does not automatically sync settings. Kaleido does not send page data or settings to a server. See [`privacy.html`](./privacy.html).

Kaleido is an unofficial community project and is not affiliated with or endorsed by Riot Games.

