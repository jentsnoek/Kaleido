# Kaleido

Kaleido lets you recolor website areas. Use **Select an area** to pick parts yourself, or **Pick area by color** to select matching pieces inside the clicked component. Similar colors elsewhere on the page stay unselected. Selected backgrounds keep their original transparency when recolored.

## Install the development build

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome or `vivaldi://extensions` in Vivaldi.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted Kaleido folder containing `manifest.json`.
5. Open a website and choose **Select an area** or **Pick area by color**.

The first time you pick an area, the browser asks for website access. Kaleido uses that permission to apply the saved areas on websites you choose. You can revoke it in the browser's extension settings.

## Text colors

Choose a swatch in the separate **Text colors** section, then use **Select text** or **Color all text**. In the text picker, click individual text areas or drag a box around several at once. Text groups can be edited or removed like background groups. Text with its own color, such as colored links, is skipped so it keeps its existing color.

## Pick and color an area

For manual picking, click the page areas you want. To pick by color, click **Pick area by color**, then click one solid-colored area. Kaleido selects similar backgrounds inside that nearby component, while leaving matching colors elsewhere on the page alone. Remove any unwanted outlines, and preview the group color before confirming. Kaleido applies and saves the color for the current website. Groups start collapsed in the popup. Expand one to review, reorder, temporarily turn off, or remove areas. Click an area name to highlight it on the page (click again to clear the highlight), use its color square to preview colors on hover and apply one with a click, or delete the group. Pause all Kaleido colors on a site with **Pause colors**. Search saved websites in **Find a saved website**. Use **Undo** and **Redo** for recent changes. **Reset page** removes this host's saved areas and hides inherited parent-domain colors on this host only; it does not remove saved colors or settings for other websites. Add, edit, and remove background swatches in **Colors**. The separate text palette includes 24 text-friendly colors. Choose the pipette icon beside **Save color** to sample a page background color, then save the swatch.

Your colors and areas are saved in this browser. Normal updates to the same Kaleido extension keep these settings. Removing the extension deletes its local settings; moving from an unpacked development build to a store install may require a one-time transfer with **Export .txt** / **Import .txt** or **Copy code** / **Paste code**. Import replaces settings on the destination device. Use **Grant saved sites** at the bottom of the popup to allow Kaleido on saved websites. When you first open Kaleido, review and accept its brief privacy notice before using page features. See [`privacy.html`](./privacy.html).

Kaleido is an unofficial community project and is not affiliated with or endorsed by Riot Games.

