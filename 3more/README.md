# Jovey 3more

Standalone dashboard at https://jovey.co/3more/. All viewer code and data are served by GitHub Pages. No redirect, iframe, application server, external JavaScript libraries or login is needed.

- `index.html`, `app.js`, `roadmap.js`, `roadmap.css`: read-only interface, combined interactive 3D map, personal/team progress, calendar and bot inbox.
- `data/dashboard.json`: authoritative public snapshot. The migrated nine-project data remains explicitly mock or proposed.
- `assets/kkuid-vision.jpg`: the supplied school vision reference, optimized for the web.
- `bot/`: shared instructions, schemas, optional dependency-free GitHub MCP/CLI adapter, and model tests.

Preview from the repository root with a static HTTP server and visit `/3more/`. Do not open the HTML through a file URL; JavaScript module and JSON loading need HTTP.

```sh
python3 -m http.server 8772 --bind 127.0.0.1
node 3more/bot/scripts/jovey.mjs --validate 3more/data/dashboard.json
node --test 3more/bot/tests/*.test.mjs
```

Bots publish the entire validated JSON file in a single GitHub commit using its current blob SHA. The browser checks for updates every 30 seconds after Pages publishes. The optional MCP adapter runs in the bot's environment, not the website. No credentials are shipped. Bot inbox updates are durable; external chat delivery needs a separately connected receiver.

Dashboard changes stay within this directory. Preserve all existing Jovey root pages, other project paths and DNS. `noindex` keeps this operational page out of the search sitemap, but it does not make its data private.

The public dashboard and `/3more/design/studio/` model library are view-only. People
filter, orbit and inspect; authorized bots handle project edits and 3D creation
from chat. The library contains four procedural templates and one agent-authored
concept, with provenance preserved. No browser imports, plan editors, local model
writes or generation calls remain. Existing browser-local demo records are not
deleted. Automatic provider generation is still unconnected. GitHub repository
permissions remain unchanged; this UI does not prevent repository administrators
from editing source. The private backend draft separately enforces bot-only content
writes and remains unpublished.
