# Kaleido

Kaleido lets you recolor website areas. Use **Select an area** to pick parts yourself, or **Select matching color** to find similar visible backgrounds. Review the highlights, remove any you do not want, then choose a color. Gradients, images, text, and borders are not matched. Selected backgrounds keep their original transparency when recolored.

## Install the development build

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome or `vivaldi://extensions` in Vivaldi.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted Kaleido folder containing `manifest.json`.
5. Open a website and choose **Select an area** or **Select matching color**.

The first time you pick an area, the browser asks for website access. Kaleido uses that permission to apply the saved areas on websites you choose. You can revoke it in the browser's extension settings.

## Text colors

Choose **Select text** to pick one or more text areas, or **Color all text** to recolor the whole page. Text color is controlled separately from background color, and chosen text groups can be edited or removed like other groups.

## Pick and color an area

For manual picking, click the page areas you want. For color matching, click **Select matching color**, then click a colored area. Kaleido highlights similar solid backgrounds. Remove extras or add another match, confirm, then choose a color. Matching includes semi-transparent backgrounds and nearby shades. Gradients, images, text, and borders are skipped; up to 100 areas are selected at once. Kaleido applies and saves the color for the current website. Groups start collapsed in the popup. Expand one to review, reorder, temporarily turn off, or remove areas. Click an area name to highlight it on the page (click again to clear the highlight), use its color square to preview colors on hover and apply one with a click, or delete the group. Pause all Kaleido colors on a site with **Pause colors**. Search saved websites in **Find a saved website**. Use **Undo** and **Redo** for recent changes. **Reset page** removes this host's saved areas and hides inherited parent-domain colors on this host only; it does not remove saved colors or settings for other websites. Add, edit, and remove swatches in the **Colors** section; it includes a larger set of UI-friendly colors. Choose the pipette icon beside **Save color** to sample a page background color, then save the swatch.

Your colors and areas are saved in the browser. The **Device code** at the bottom updates automatically. Copy it to another device, then use the arrow beside it to import. The code is compressed, not encrypted, and anyone with it can import your settings. Website access must be granted separately on each device. Kaleido does not send settings to a server. See [`privacy.html`](./privacy.html).

Kaleido is an unofficial community project and is not affiliated with or endorsed by Riot Games.

