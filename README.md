# Crate

A personal listening library with original album covers, notes, listening status, search, and light/dark themes. Node.js 22.13 or newer is required; no runtime packages or build step are needed.

Run `npm start`, then open http://127.0.0.1:4174. `HOST` and `PORT` configure the listener. SQLite defaults to `$XDG_DATA_HOME/crate/albums.sqlite` (or `~/.local/share/crate/albums.sqlite`). Set `CRATE_DB` to choose another durable location. The eight fictional albums seed once; emptying the collection never reseeds it.

Run `npm test` for isolated API, Unicode validation, CRUD, combined search/filter, restart persistence and seed-once checks. On the prepared project worker, run the repeatable browser regression command:

```sh
TEST_DB=$(mktemp -u /tmp/crate-browser-XXXXXX.sqlite) node ~/.agents/skills/jlab-dev-v1-implementation/browser-test.cjs --config playwright.config.cjs
```

The browser harness starts and stops its own isolated instance on port 4175. Its checks cover pending deduplication, failed save/retry, retained drafts/lists/focus, literal notes, committed mutations with failed refresh, status retry, redraw and stale edits. The test database is disposable; never use the retained preview database. Independent verification owns the full responsive/theme and accessibility acceptance.

For a retained preview, install `scripts/preview.service` as a project-specific systemd user unit, replacing the checkout and executable placeholders with absolute paths. Enable user lingering and the unit. Keep its database outside the checkout. Use `systemctl --user start|restart|stop jlab-preview-crate-e2e-20261009-r2.service` and `/health` to inspect readiness. Restart verification should compare stored album data before and after the restart. Exact worker paths, service readback and URL are recorded in the private task handoff.

`npm run foundation` opens the Designer component scenarios at http://127.0.0.1:4173/foundation.html. See [design authority](docs/design.md) for the component and interaction contract. Fonts include their OFL licenses. All album artwork and identities are fictional.
