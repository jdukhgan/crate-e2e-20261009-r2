// Foundation harness: drives the real components against an in-memory fixture
// store with controllable latency and failures. Not the production app — the
// Builder replaces FixtureStore with API calls and keeps the view contract.
import { validateAlbum, ERROR_COPY } from "./contract.js";
import {
  h, icon, albumGrid, skeletonGrid, searchField, statusFilter, emptyState, loadNotice,
  detailView, editorView, missingView, resultSummary, announce,
} from "./ui.js";

class ApiStore {
  async request(path = '', options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/albums' + path, {...options, signal: controller.signal, headers: {'content-type':'application/json'}});
      const data = await response.json();
      if (!response.ok) throw data.error;
      return data;
    } catch (err) {
      if (typeof err.code === "string") throw err;
      throw {code:'network', message:ERROR_COPY.network};
    } finally { clearTimeout(timer); }
  }
  list({q='', status=''}={}) {return this.request('?' + new URLSearchParams({q,status}));}
  get(id) {return this.request('/'+id);}
  create(input) {return this.request('', {method:'POST',body:JSON.stringify(input)});}
  update(id,input) {return this.request('/'+id,{method:'PATCH',body:JSON.stringify(input)});}
  remove(id) {return this.request('/'+id,{method:'DELETE'});}
}

/* ---------- Controller ---------- */

const root = document.getElementById("app");
const live = document.getElementById("live");
const store = new ApiStore();

const state = {
  all: [], visible: [], loaded: false, loadError: "", loading: true,
  query: "", status: "",
  panel: null, // { type: "detail"|"edit"|"create"|"missing", id?, draft?, errors?, formError? }
  pending: null, pendingStatus: null, confirming: false, statusMessage: "", statusError: false, deleteError: "",
  opener: null, // album id or "add" that opened the panel
};

let focusAfterRender = null;
const blankDraft = () => ({ title: "", artist: "", status: "Want to hear", notes: "", cover: null });

let loadVersion = 0;
async function load({ announceResult = false } = {}) {
  if (state.pending) return;
  const version = ++loadVersion;
  state.loading = !state.loaded;
  state.loadError = "";
  render();
  try {
    const [all, visible] = await Promise.all([store.list(), store.list({ q: state.query, status: state.status })]);
    if (version !== loadVersion) return;
    Object.assign(state, { all, visible, loaded: true, loading: false });
  } catch (err) {
    if (version !== loadVersion) return;
    Object.assign(state, { loading: false, loadError: err.code === "network" ? err.message : ERROR_COPY.load });
  }
  if (version !== loadVersion) return;
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

function beginMutation(kind) {
  clearTimeout(searchTimer);
  ++loadVersion;
  state.loading = false;
  state.pending = kind;
}
function commitAlbum(saved) {
  state.all = [saved, ...state.all.filter(a => a.id !== saved.id)];
  filterCommitted();
}
function filterCommitted() {
  const q=state.query.trim().toLocaleLowerCase();
  state.visible=state.all.filter(a=>(!state.status||a.status===state.status)&&(!q||a.title.toLocaleLowerCase().includes(q)||a.artist.toLocaleLowerCase().includes(q)));
}
function currentAlbum() {
  return state.all.find((a) => a.id === state.panel?.id);
}

async function changeStatus(status, input) {
  const album = currentAlbum();
  if (!album || state.pending || status === album.status) return;
  beginMutation("status");
  Object.assign(state, { pending: "status", pendingStatus: status, statusMessage: "", statusError: false });
  render({ keepFocus: `input[name="status-${album.id}"][value="${status}"]` });
  try {
    const updated = await store.update(album.id, { status });
    commitAlbum(updated);
    state.statusMessage = `Marked as ${status}.`;
    await refreshLists();
  } catch (err) {
    if (err.code === "not_found") return markMissing();
    Object.assign(state, { statusError: true, statusMessage: `Status not changed. ${err.message}` });
  } finally {
    state.pending = null;
    state.pendingStatus = null;
  }
  focusAfterRender = `input[name="status-${album.id}"][value="${status}"]`;
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
  if (state.pending) return;
  const p = state.panel;
  const check = validateAlbum(p.draft);
  if (!check.ok) {
    Object.assign(p, { errors: check.fields, formError: "" });
    focusAfterRender = "#error-summary";
    return render();
  }
  beginMutation("save");
  render({ keepFocus: "button[type=submit]" });
  try {
    const saved = p.type === "create" ? await store.create(p.draft) : await store.update(p.id, p.draft);
    commitAlbum(saved);
    await refreshLists();
    state.pending = null;
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
  if (state.pending) return;
  const album = currentAlbum();
  beginMutation("delete");
  state.deleteError = "";
  render({ keepFocus: "[data-confirm-delete]" });
  try {
    await store.remove(album.id);
    state.all = state.all.filter(a=>a.id!==album.id);
    filterCommitted();
    await refreshLists();
    state.pending = null;
    state.panel = null;
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
    onInput: (key, value) => { if (!state.pending) p.draft[key] = value; },
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

  const activeSelector = keepFocus || (document.activeElement?.id ? `#${CSS.escape(document.activeElement.id)}` : document.activeElement?.name ? `input[name="${document.activeElement.name}"][value="${document.activeElement.value}"]` : null);
  const selection = document.activeElement?.selectionStart;
  const selectionEnd = document.activeElement?.selectionEnd;
  root.replaceChildren(app);
  const target = focusAfterRender || activeSelector;
  focusAfterRender = null;
  if (target) {
    const el=root.querySelector(target) || root.querySelector("#collection-title");
    el?.focus({preventScroll:true});
    if (selection != null && !keepFocus) {try {el.setSelectionRange(selection,selectionEnd);} catch {}}
  }
}

function collectionMeta() {
  const listening = state.all.filter((a) => a.status === "Listening").length;
  const total = `${state.all.length} ${state.all.length === 1 ? "record" : "records"}`;
  return listening ? `${total} · ${listening} on the turntable` : total;
}

document.addEventListener("keydown", (e) => {
  if (e.key === 'Tab' && state.panel && matchMedia('(max-width:1179.98px)').matches) {
    const nodes=[...root.querySelectorAll('.panel button, .panel input, .panel textarea, .panel a')].filter(el=>!el.disabled && el.getClientRects().length);
    const first=nodes[0], last=nodes.at(-1);
    if (e.shiftKey && (document.activeElement===first || !nodes.includes(document.activeElement))) {e.preventDefault();last?.focus();}
    else if (!e.shiftKey && (document.activeElement===last || !nodes.includes(document.activeElement))) {e.preventDefault();first?.focus();}
  }
  if (e.key === "Escape" && state.panel && !state.pending && !e.defaultPrevented) close();
});

const savedTheme = localStorage.getItem('crate-theme');
if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
await load();
