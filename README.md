# Kaleido

Kaleido lets you recolor specific areas of websites yourself. Pick an area, confirm the highlight, and choose one of your saved colors. It does not guess which parts of a page to change.

## Install the development build

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome or `vivaldi://extensions` in Vivaldi.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted Kaleido folder containing `manifest.json`.
5. Open a website and choose **Pick an area on this page**.

The first time you pick an area, the browser asks for website access. Kaleido uses that permission to apply the saved areas on websites you choose. You can revoke it in the browser's extension settings.

## Pick and color an area

Move over the page to see the highlighted area. Click it, confirm the highlight, then choose one of the saved colors. Kaleido applies and saves that color for the current website. To change it later, use the color menu beside that area in the popup. Add, edit, and remove individual colors in the **Colors** section.

Your color library and picked areas are stored in the browser's local extension storage. Kaleido does not send page data or settings to a server. See [`privacy.html`](./privacy.html).

Kaleido is an unofficial community project and is not affiliated with or endorsed by Riot Games.

