// Foundation harness: drives the real components against an in-memory fixture
// store with controllable latency and failures. Not the production app — the
// Builder replaces FixtureStore with API calls and keeps the view contract.
import { validateAlbum, ERROR_COPY } from "./contract.js";
import {
  h, icon, albumGrid, skeletonGrid, searchField, statusFilter, emptyState, loadNotice,
  detailView, editorView, missingView, resultSummary, announce,
} from "./ui.js";

/* ---------- Fixture store (API-shaped) ---------- */

class FixtureStore {
  constructor(seed) {
    this.rows = seed.map((a, i) => ({ id: i + 1, ...a }));
    this.nextId = this.rows.length + 1;
    this.latency = 450;
    this.fail = "none"; // none | network | server | notFound | hang
  }
  async #wait() {
    if (this.fail === "hang") return new Promise(() => {});
    await new Promise((r) => setTimeout(r, this.latency));
    if (this.fail === "network") throw { code: "network", message: ERROR_COPY.network };
    if (this.fail === "server") throw { code: "server", message: ERROR_COPY.server };
  }
  #find(id) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || this.fail === "notFound") throw { code: "not_found", message: ERROR_COPY.notFound };
    return row;
  }
  async list({ q = "", status = "" } = {}) {
    await this.#wait();
    const needle = q.trim().toLocaleLowerCase();
    return this.rows.filter((r) =>
      (!status || r.status === status) &&
      (!needle || r.title.toLocaleLowerCase().includes(needle) || r.artist.toLocaleLowerCase().includes(needle)));
  }
  async create(input) {
    await this.#wait();
    const v = validateAlbum(input);
    if (!v.ok) throw { code: "invalid", message: ERROR_COPY.invalid, fields: v.fields };
    const row = { id: this.nextId++, cover: null, ...v.value };
    this.rows.unshift(row);
    return row;
  }
  async update(id, patch) {
    await this.#wait();
    const row = this.#find(id);
    const v = validateAlbum(patch, { partial: true });
    if (!v.ok) throw { code: "invalid", message: ERROR_COPY.invalid, fields: v.fields };
    Object.assign(row, v.value);
    return { ...row };
  }
  async remove(id) {
    await this.#wait();
    this.#find(id);
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

/* ---------- Controller ---------- */

const root = document.getElementById("app");
const live = document.getElementById("live");
const fixture = await fetch("/data/albums.json").then((r) => r.json());
const store = new FixtureStore(fixture.albums);

const state = {
  all: [], visible: [], loaded: false, loadError: "", loading: true,
  query: "", status: "",
  panel: null, // { type: "detail"|"edit"|"create"|"missing", id?, draft?, errors?, formError? }
  pending: null, pendingStatus: null, confirming: false, statusMessage: "", statusError: false, deleteError: "",
  opener: null, // album id or "add" that opened the panel
};

let focusAfterRender = null;
const blankDraft = () => ({ title: "", artist: "", status: "Want to hear", notes: "", cover: null });

async function load({ announceResult = false } = {}) {
  state.loading = !state.loaded;
  state.loadError = "";
  render();
  try {
    const [all, visible] = await Promise.all([store.list(), store.list({ q: state.query, status: state.status })]);
    Object.assign(state, { all, visible, loaded: true, loading: false });
  } catch (err) {
    Object.assign(state, { loading: false, loadError: err.code === "network" ? err.message : ERROR_COPY.load });
  }
  render();
  if (announceResult && !state.loadError) announce(live, resultSummary(state.visible.length, state.all.length, state));
}

function open(panel, opener) {
  if (state.pending) return;
  Object.assign(state, { panel, opener, confirming: false, statusMessage: "", statusError: false, deleteError: "" });
  focusAfterRender = panel.type === "detail" ? "#detail-title" : panel.type === "missing" ? "#missing-title" : "#field-title";
  render();
}

function close() {
  if (state.pending) return;
  const opener = state.opener;
  state.panel = null;
  // Return to the trigger; fall back to the collection heading if it has gone.
  focusAfterRender = opener === "add" ? "#add-album" : `[data-album-id="${opener}"]`;
  render();
}

function currentAlbum() {
  return state.all.find((a) => a.id === state.panel?.id);
}

async function changeStatus(status, input) {
  const album = currentAlbum();
  if (!album || state.pending || status === album.status) return;
  Object.assign(state, { pending: "status", pendingStatus: status, statusMessage: "", statusError: false });
  render({ keepFocus: `input[name="status-${album.id}"][value="${status}"]` });
  try {
    const updated = await store.update(album.id, { status });
    Object.assign(album, updated);
    state.statusMessage = `Marked as ${status}.`;
    await refreshLists();
  } catch (err) {
    if (err.code === "not_found") return markMissing();
    Object.assign(state, { statusError: true, statusMessage: `Status not changed. ${err.message}` });
  } finally {
    state.pending = null;
    state.pendingStatus = null;
  }
  focusAfterRender = `input[name="status-${album.id}"]:checked`;
  render();
}

async function refreshLists() {
  try {
    const [all, visible] = await Promise.all([store.list(), store.list({ q: state.query, status: state.status })]);
    Object.assign(state, { all, visible, loadError: "" });
  } catch (err) {
    state.loadError = err.message;
  }
}

function markMissing() {
  state.pending = null;
  state.pendingStatus = null;
  state.panel = { type: "missing" };
  focusAfterRender = "#missing-title";
  refreshLists().then(() => render());
  render();
}

async function save() {
  const p = state.panel;
  const check = validateAlbum(p.draft);
  if (!check.ok) {
    Object.assign(p, { errors: check.fields, formError: "" });
    focusAfterRender = "#error-summary";
    return render();
  }
  state.pending = "save";
  render({ keepFocus: "button[type=submit]" });
  try {
    const saved = p.type === "create" ? await store.create(p.draft) : await store.update(p.id, p.draft);
    state.pending = null;
    await refreshLists();
    state.panel = { type: "detail", id: saved.id };
    if (p.type === "create") state.opener = "add";
    state.statusMessage = p.type === "create" ? "Added to your crate." : "Changes saved.";
    focusAfterRender = "#detail-title";
  } catch (err) {
    state.pending = null;
    if (err.code === "not_found") {
      // Keep the draft text visible so it can be copied before leaving.
      Object.assign(p, { formError: ERROR_COPY.notFound, errors: {} });
    } else {
      Object.assign(p, { errors: err.fields || {}, formError: err.fields ? ERROR_COPY.invalid : err.message });
    }
    focusAfterRender = "#error-summary";
  }
  render();
}

async function confirmDelete() {
  const album = currentAlbum();
  state.pending = "delete";
  state.deleteError = "";
  render({ keepFocus: "[data-confirm-delete]" });
  try {
    await store.remove(album.id);
    state.pending = null;
    state.panel = null;
    await refreshLists();
    announce(live, `Deleted “${album.title}”.`);
    focusAfterRender = "#collection-title"; // the trigger card no longer exists
  } catch (err) {
    state.pending = null;
    if (err.code === "not_found") return markMissing();
    state.deleteError = `Not deleted. ${err.message}`;
    focusAfterRender = "[data-confirm-delete]";
  }
  render();
}

let searchTimer;
function onSearch(value) {
  state.query = value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => load({ announceResult: true }), 220);
  root.querySelector(".search__clear").hidden = !value;
}

/* ---------- Render ---------- */

function themeToggle() {
  const dark = document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  return h("button.icon-btn", {
    type: "button", id: "theme-toggle", "aria-label": dark ? "Use light theme" : "Use dark theme",
    onclick: () => {
      document.documentElement.dataset.theme = dark ? "light" : "dark";
      localStorage.setItem("crate-theme", document.documentElement.dataset.theme);
      focusAfterRender = "#theme-toggle";
      render();
    },
  }, icon(dark ? "sun" : "moon"));
}

function counts() {
  if (!state.loaded) return {};
  const c = { "": state.all.length };
  for (const a of state.all) c[a.status] = (c[a.status] || 0) + 1;
  return c;
}

function collectionBody() {
  if (state.loading) return [h("p.visually-hidden", { role: "status" }, "Loading your collection…"), skeletonGrid(8)];
  const parts = [];
  if (state.loadError) parts.push(loadNotice({ title: state.loaded ? "Collection not refreshed" : "Collection not loaded", message: state.loadError, onRetry: () => load({ announceResult: true }) }));
  if (!state.loaded) return parts;
  if (state.all.length === 0) parts.push(emptyState({ kind: "collection", onAdd: (e) => open({ type: "create", draft: blankDraft(), errors: {} }, "add") }));
  else if (state.visible.length === 0) parts.push(emptyState({
    kind: "results", query: state.query, status: state.status,
    onClearSearch: () => { state.query = ""; focusAfterRender = "#album-search"; load({ announceResult: true }); },
    onShowAll: () => { state.status = ""; focusAfterRender = 'input[name="status-filter"]:checked'; load({ announceResult: true }); },
  }));
  else parts.push(albumGrid(state.visible, {
    currentId: state.panel?.id, disabled: Boolean(state.pending),
    onOpen: (album) => open({ type: "detail", id: album.id }, album.id),
  }));
  return parts;
}

function panelBody() {
  const p = state.panel;
  if (!p) return null;
  if (p.type === "missing") return missingView({ onBack: close });
  if (p.type === "detail") {
    const album = currentAlbum();
    if (!album) return missingView({ onBack: close });
    return detailView(album, {
      pending: state.pending, pendingStatus: state.pendingStatus, confirming: state.confirming, statusMessage: state.statusMessage,
      statusError: state.statusError, deleteError: state.deleteError,
      onClose: close,
      onStatus: changeStatus,
      onEdit: () => {
        Object.assign(state, { panel: { type: "edit", id: album.id, draft: { ...album }, errors: {} }, statusMessage: "" });
        focusAfterRender = "#field-title"; render();
      },
      onDelete: () => { state.confirming = true; focusAfterRender = "[data-confirm-delete]"; render(); },
      onConfirmDelete: confirmDelete,
      onCancelDelete: () => { state.confirming = false; state.deleteError = ""; focusAfterRender = "[data-delete]"; render(); },
    });
  }
  return editorView({
    mode: p.type === "create" ? "create" : "edit", draft: p.draft, errors: p.errors, formError: p.formError,
    pending: state.pending === "save",
    onInput: (key, value) => { p.draft[key] = value; },
    onSubmit: save,
    onCancel: () => {
      if (p.type === "create") return close();
      state.panel = { type: "detail", id: p.id };
      focusAfterRender = "[data-edit]"; render();
    },
  });
}

function render({ keepFocus } = {}) {
  const panel = panelBody();
  const busy = Boolean(state.pending);
  root.dataset.pending = busy ? "true" : "false";
  const app = h("div.workspace", { dataset: { panel: panel ? "open" : "closed" } },
    h("main.collection", { "aria-labelledby": "collection-title", inert: panel && matchMedia("(max-width: 1179.98px)").matches ? true : null },
      h("header.masthead", {},
        h("div", {},
          h("h1.masthead__title", { id: "collection-title", tabIndex: -1 }, "Crate"),
          h("p.masthead__meta", {}, state.loaded ? collectionMeta() : "Your listening library")),
        h("div.masthead__actions", {},
          themeToggle(),
          h("button.btn.btn--primary", {
            type: "button", id: "add-album", "aria-disabled": busy ? "true" : null,
            onclick: () => open({ type: "create", draft: blankDraft(), errors: {} }, "add"),
          }, icon("plus"), h("span", {}, "Add", h("span.btn__label-long", {}, " album"))))),
      h("div.toolbar", {},
        searchField({ value: state.query, disabled: busy, onInput: onSearch, onClear: () => { state.query = ""; load({ announceResult: true }); } }),
        statusFilter({ value: state.status, counts: counts(), disabled: busy, onChange: (v) => { state.status = v; load({ announceResult: true }); } })),
      h("p.visually-hidden", { id: "result-count" }, state.loaded ? resultSummary(state.visible.length, state.all.length, state) : ""),
      collectionBody()),
    panel ? h("button.scrim", { type: "button", tabIndex: -1, "aria-hidden": "true", onclick: close }) : null,
    h("aside.panel", { "aria-label": "Album details", dataset: { open: panel ? "true" : "false" } },
      panel ? h("div.panel__scroll", {}, h("div.panel__inner", {}, panel)) : null));

  const activeSelector = keepFocus || (document.activeElement?.id ? `#${CSS.escape(document.activeElement.id)}` : null);
  root.replaceChildren(app);
  const target = focusAfterRender || activeSelector;
  focusAfterRender = null;
  if (target) (root.querySelector(target) || root.querySelector("#collection-title"))?.focus({ preventScroll: false });
}

function collectionMeta() {
  const listening = state.all.filter((a) => a.status === "Listening").length;
  const total = `${state.all.length} ${state.all.length === 1 ? "record" : "records"}`;
  return listening ? `${total} · ${listening} on the turntable` : total;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.panel && !state.pending && !e.defaultPrevented) close();
});

/* ---------- Fixture scenarios ---------- */

const params = new URLSearchParams(location.search);
const scenario = params.get("scenario") || "populated";
const savedTheme = params.get("theme") || localStorage.getItem("crate-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

async function runScenario(name) {
  const firstId = (title) => store.rows.find((r) => r.title === title)?.id;
  switch (name) {
    case "loading": store.fail = "hang"; render(); return;
    case "load-error": store.fail = "network"; await load(); store.fail = "none"; return;
    case "empty": store.rows = []; break;
    case "filtered": state.status = "Listening"; break;
    case "search": state.query = "orchard"; break;
    case "no-results": state.query = "tapeworm"; state.status = "Heard"; break;
    case "stale-error": await load(); store.fail = "server"; await load(); store.fail = "none"; return;
  }
  await load();
  const detailFor = (title) => open({ type: "detail", id: firstId(title) }, firstId(title));
  switch (name) {
    case "detail": detailFor("Night Shift at the Observatory"); break;
    case "detail-long": detailFor(store.rows.find((r) => r.title.startsWith("The Long Room")).title); break;
    case "detail-empty-notes": detailFor("Low Frequency Garden"); break;
    case "status-error": detailFor("Salt Lines"); store.fail = "server"; break;
    case "status-pending": detailFor("Salt Lines"); store.fail = "hang"; break;
    case "delete-confirm": detailFor("Second Weather"); state.confirming = true; render(); break;
    case "missing": open({ type: "missing" }, firstId("Ø")); break;
    case "edit": { const a = state.all.find((r) => r.title === "Halfway to Pelagos"); open({ type: "edit", id: a.id, draft: { ...a }, errors: {} }, a.id); break; }
    case "create": open({ type: "create", draft: blankDraft(), errors: {} }, "add"); break;
    case "editor-invalid": {
      open({ type: "create", draft: { ...blankDraft(), title: "   ", artist: "A".repeat(121) }, errors: {} }, "add");
      await save(); break;
    }
    case "save-error": {
      const a = state.all.find((r) => r.title === "Concrete Orchard");
      open({ type: "edit", id: a.id, draft: { ...a, notes: `${a.notes}\n\nDraft line that must survive a failed save.` }, errors: {} }, a.id);
      store.fail = "server"; await save(); break;
    }
    case "save-pending": {
      const a = state.all.find((r) => r.title === "Concrete Orchard");
      open({ type: "edit", id: a.id, draft: { ...a }, errors: {} }, a.id);
      store.fail = "hang"; save(); break;
    }
  }
}

/* Fixture control strip: scenario, failure mode, latency, theme. */
function fixtureControls() {
  const scenarios = ["populated", "filtered", "search", "no-results", "empty", "loading", "load-error", "stale-error",
    "detail", "detail-long", "detail-empty-notes", "status-pending", "status-error", "delete-confirm", "missing",
    "edit", "create", "editor-invalid", "save-pending", "save-error"];
  const nav = (key, value) => { const p = new URLSearchParams(location.search); p.set(key, value); location.search = p; };
  const bar = h("details.fixture-bar", {},
    h("summary", {}, `Fixture · ${scenario}`),
    h("label", {}, "Scenario ", h("select", { onchange: (e) => nav("scenario", e.target.value) },
      scenarios.map((s) => h("option", { value: s, selected: s === scenario }, s)))),
    h("label", {}, "Next request ", h("select", { onchange: (e) => { store.fail = e.target.value; } },
      ["none", "server", "network", "notFound", "hang"].map((f) => h("option", { value: f }, f)))),
    h("label", {}, "Theme ", h("select", { onchange: (e) => nav("theme", e.target.value) },
      ["light", "dark"].map((t) => h("option", { value: t, selected: document.documentElement.dataset.theme === t }, t)))));
  document.body.append(bar);
}

fixtureControls();
await runScenario(scenario);
