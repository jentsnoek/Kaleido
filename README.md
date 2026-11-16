# Kaleido

Kaleido lets you create and save a color theme for each website. Its first preset is **My Plum**, using the plum and pink colors chosen for this project. Save more color combos and reuse them across sites.

## Install the development build

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome or `vivaldi://extensions` in Vivaldi.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted Kaleido folder containing `manifest.json`.
5. Open a website, click Kaleido, preview colors as you adjust them, then choose **Save theme for this site**.

On the first save, Kaleido asks for optional access to all websites. This single permission lets it apply themes on future sites without asking again for every domain. Kaleido only changes sites for which you have saved an enabled theme. You can turn off automatic color matching or pick exact areas on a page to assign a color role.

Saved themes, color combos, and picked areas stay in Chrome's local extension storage. Kaleido does not send page data or settings to a server. See [`privacy.html`](./privacy.html).

## How recoloring works

Automatic matching targets neutral light backgrounds, dark text, and borders. For more precise results, turn off automatic matching and use **Pick an area on this page**. The picker can assign the page, card, text, or accent color to a selected area, or exclude it from automatic matching. Some sites use unusual layouts or shadow DOM that may need additional support.

Kaleido is an unofficial community project and is not affiliated with or endorsed by Riot Games.

