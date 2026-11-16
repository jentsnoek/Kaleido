# Kaleido

Kaleido lets you create and save a color theme for each website. The built-in **My Plum** combo uses the plum and pink colors chosen for this project. Save more combos and reuse them across sites.

## Install the development build

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome or `vivaldi://extensions` in Vivaldi.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted Kaleido folder containing `manifest.json`.
5. Open a website, save its theme, then pick the page areas Kaleido should recolor.

On the first save, Kaleido asks for optional access to all websites. This single permission lets it work on sites you choose without asking for every domain. Kaleido changes only the areas you pick on a site with an enabled saved theme.

## Manual targeting

Kaleido does not guess which page elements to recolor. Click **Pick an area on this page**, click the area, and assign it the page, card, text, or accent color. You can change the color role or remove a picked area in the popup menu. Color adjustments preview live and are saved when you save the site's theme.

Saved themes, color combos, and picked areas stay in Chrome's local extension storage. Kaleido does not send page data or settings to a server. See [`privacy.html`](./privacy.html).

Kaleido is an unofficial community project and is not affiliated with or endorsed by Riot Games.

