# Chrome Web Store submission draft

Use this copy in the Chrome Web Store Developer Dashboard. The screenshot files still need to be captured from the finished extension UI before publishing.

## Short description

Choose website areas and text, then recolor them with your own saved palettes.

## Detailed description

Make websites easier to read or more your style with Kaleido. Choose the parts of a page you want to recolor and keep different settings for each website.

- Select individual page areas and apply a background color.
- Match nearby areas with a similar background color.
- Select text by clicking or dragging, then apply a text color.
- Organize, reorder, pause, undo, and remove saved color groups.
- Save your palettes and website settings in this browser, or export them to another device.

Kaleido changes only the areas you choose, including individual areas or all page text. With your permission, it reads page structure and styles on allowed websites to find and apply saved colors. Saved website domains, selectors, short labels, and colors stay in the browser's extension storage. Kaleido does not send them to a server or share them with third parties. See the privacy policy for details.

## Privacy policy URL

https://github.com/jentsnoek/Kaleido/blob/main/privacy.html

## Website and support URLs

- Website: https://github.com/jentsnoek/Kaleido
- Support: https://github.com/jentsnoek/Kaleido/issues
- Suggested category: Productivity

## Privacy practices answers

- Data handled: website content (selectors and short labels from areas the user selects) and web browsing activity (domains where the user saves settings), plus color settings. These are stored locally in Chrome extension storage; Kaleido does not keep general browsing history.
- Purpose: provide the website recoloring feature requested by the user, including reapplying saved settings on websites for which the user grants access.
- Sharing: no sharing with the developer or third parties; no analytics or advertising.
- Transfer: export files and copy codes are generated locally by the user. They include saved domains, selectors, and colors and are not encrypted.

In the Dashboard, select the data categories that cover website content and web browsing activity. Make sure these answers match the current privacy policy and product behavior.

## Permission justifications

- `storage`: save palettes, selected website rules, preferences, and undo history locally.
- `scripting`: display the page picker and apply the colors users choose.
- `activeTab`: sample a color from the active page after the user starts the color picker.
- Optional website access (`*://*/*`): Kaleido supports sites selected by the user, so the eligible sites cannot be known in advance. The extension requests host patterns for the current website or saved websites only after the user chooses a Kaleido action. Users can deny or revoke access.

## Listing assets to capture

Capture current, unaltered screenshots from the published build:

1. Kaleido popup showing its palettes, page actions, saved groups, and site status.
2. Page picker showing selected areas and the color selection panel.
3. Optional: text selection and the saved websites list.

## Release checklist

- Keep the same Chrome Web Store item and extension ID for updates so `chrome.storage.local` remains attached to the installed extension.
- For migration from an unpacked development build with a different extension ID, tell existing users to export/import once.
- Use a new manifest version for each upload.
- Enable two-step verification on the developer account.
- Confirm the uploaded ZIP has `manifest.json` at its root and the privacy URL is publicly reachable.
- Verify the listing description, screenshots, privacy fields, and in-product disclosure all match.
