# PortalPlus Helper PROOF OF CONECEPT

A small browser helper for the forms on [PortalPlus](https://portal.portalplus.bayern), the practice-firm portal used in the *Übungsunternehmen* subject at Bavarian business schools. It saves typing in two ways:

- **“Today” buttons** next to date and time fields. One click fills in today’s date or the current time in the format the field uses.
- **Linked fields.** Pick a source field and a target field once. From then on, whatever you type into the source also appears in the target, live. If you change the target yourself, your value stays and is no longer overwritten. Clear the target to link it again.

Everything runs in your own browser, either as a Tampermonkey userscript or as a bookmarklet on computers where extensions can’t be installed. The helper only fills in fields: it sends nothing anywhere, and saving is always done with the portal’s own buttons. Links are stored in the browser’s `localStorage`.

## Installation

Build the project first (see [Build](#build)), then open `dist/index.html`. That install page contains both variants ready to use.

### Bookmarklet (e.g. school PCs)

1. Show the bookmarks bar (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>).
2. Drag the **PP Helper** button from the install page onto the bookmarks bar.
3. Log in to the portal and click the bookmark once. After a full page reload, click it again.

If dragging doesn’t work, create a bookmark manually and paste the contents of `dist/bookmarklet.txt` as its URL.

### Userscript (your own PC)

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension. In Chrome and Edge, also turn on **Allow User Scripts** in the extension’s details.
2. Create a new script, replace its contents with `dist/portalplus-helper.user.js`, and save.

The userscript then starts automatically on `portal.portalplus.bayern`.

## Usage

- Click **Helper** in the bottom-right corner to open the panel.
- **+ Link fields**: click the field to copy *from*, then the target field. <kbd>Esc</kbd> cancels.
- A **blue** bar on a target field means it is filled automatically. An **orange** bar means it has its own value and is left alone.
- **↻** next to a link copies the current value again; **✕** deletes the link.
- **Export** turns your links into a short code; **Import** adds the links from such a code, e.g. on another PC.
- The checkbox at the top turns the “Today” buttons on or off.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/helper.js` | Field detection, “Today” buttons, copying between linked fields, start-up |
| `src/ui.js` | Linking by clicking, panel, export/import, notifications |
| `src/helper.css` | Styles, inlined into the script at build time |
| `src/install.html` | Template for the install page |
| `scripts/build.mjs` | Combines the sources and writes everything to `dist/` |
| `tests/mock-portal.html` | Local replica of the portal’s form setup for testing |
| `docker-compose.yml` | Serves `dist/` with nginx |

## Build

Requires Node.js 18 or newer; there are no dependencies.

```bash
node scripts/build.mjs
```

Without a local Node installation, use Docker:

```bash
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/app" -w /app node:22-alpine node scripts/build.mjs
```

The build writes three files to `dist/` (which is not tracked by git):

- `index.html`: the install page with the bookmarklet and the userscript
- `portalplus-helper.user.js`: the Tampermonkey userscript
- `bookmarklet.txt`: the bookmarklet code

## Hosting the install page

```bash
docker compose up -d
```

This serves `dist/` with nginx on port 8095. The folder is mounted read-only, so a rebuild is live immediately without restarting the container.

## Testing

Serve the repository root with any static file server and open the replica:

```bash
python -m http.server 8765
```

Then go to <http://localhost:8765/tests/mock-portal.html>. The replica loads the same libraries as the portal (Bootstrap 5.3, jQuery 3.6, jQuery UI 1.13) and inserts its forms with `.html()`, the same way the portal loads content via AJAX. Start the helper by running the code from `dist/bookmarklet.txt` on that page. The form labels in the replica are German on purpose: they mirror the portal and exercise the helper’s German label detection.

## Responsible use

Use the helper only where it is allowed. The portal also runs exams; don’t use it there unless your teacher gives you explicit permission.

## Notes

- Saved links live under the `localStorage` key `ppHelfer.v1`. The name is kept from version 1.0 so existing links survive updates.
- Version 1.1 translated the interface to English; behaviour is unchanged.
