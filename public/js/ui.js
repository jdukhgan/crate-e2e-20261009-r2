// Crate UI components: small DOM factories with no business logic.
// Each returns an Element; callers own state, data loading and API calls.
import { STATUSES, LIMITS, FIELD_LABELS, countChars } from "./contract.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** h("button.btn.btn--primary", { type: "button", onclick }, "Save") */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key in el && !key.includes("-") && key !== "list" && key !== "form") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  retry: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
  crate: '<path d="M8 50h112M8 50v58h112V50M8 50l14-22h84l14 22"/><path d="M8 79h112M40 50v58M88 50v58" opacity=".5"/>',
};

export function icon(name, { size = 20, viewBox = "0 0 24 24", className = "icon" } = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = ICONS[name]; // trusted static markup only
  return svg;
}

/* ---------- Covers ---------- */

const GENERATED_PALETTES = [
  ["#2d3b2f", "#e9dfc6", "#e0623a"],
  ["#e8d7b9", "#3a2a5c", "#c23d18"],
  ["#14324a", "#f1e8d6", "#f2b544"],
  ["#d9ddd2", "#1e1d1b", "#2f7a6b"],
  ["#5b1d26", "#f1e8d6", "#e7a33c"],
  ["#f2c14e", "#1c1915", "#c23d18"],
];

function hash(text) {
  let n = 2166136261;
  for (const ch of String(text)) n = Math.imul(n ^ ch.codePointAt(0), 16777619);
  return n >>> 0;
}

/** Typographic sleeve for albums without artwork (user-created records). */
export function generatedCover(album) {
  const seed = hash(`${album.title}\u0000${album.artist}`);
  const [bg, fg, mark] = GENERATED_PALETTES[seed % GENERATED_PALETTES.length];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 600 600");
  svg.setAttribute("aria-hidden", "true");
  const add = (tag, attrs, text) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text != null) el.textContent = text;
    svg.append(el);
    return el;
  };
  add("rect", { width: 600, height: 600, fill: bg });
  const bands = 3 + (seed % 4);
  for (let i = 0; i < bands; i++) {
    add("rect", { x: 0, y: 420 + i * 18, width: 600, height: 6 + ((seed >> i) % 6), fill: fg, opacity: 0.18 + i * 0.08 });
  }
  add("circle", { cx: 470, cy: 150, r: 46 + (seed % 30), fill: mark });
  const initial = [...(album.title || "?").trim()][0]?.toUpperCase() ?? "?";
  add("text", { x: 44, y: 380, fill: fg, "font-family": "Instrument Serif, Georgia, serif", "font-size": 340, "font-style": "italic" }, initial);
  add("text", { x: 48, y: 560, fill: fg, "font-family": "Instrument Sans, Helvetica, sans-serif", "font-size": 22, "letter-spacing": 4, "font-weight": 600 },
    [...String(album.artist || "").toUpperCase()].slice(0, 34).join(""));
  return svg;
}

/** Cover with the record behind it. data-status drives the Listening slide-out. */
export function sleeve(album) {
  const cover = h("span.sleeve__cover");
  if (album.cover) cover.append(h("img", { src: album.cover, alt: "", width: 600, height: 600, loading: "lazy", decoding: "async" }));
  else cover.append(generatedCover(album));
  return h("span.sleeve", { dataset: { status: album.status } }, h("span.sleeve__disc", { "aria-hidden": "true" }), cover);
}

export function statusTag(status) {
  return h("span.status-tag", { dataset: { status } }, status);
}

/* ---------- Collection ---------- */

export function albumCard(album, { current = false, disabled = false, onOpen } = {}) {
  return h("li", {},
    h("button.card", {
      type: "button",
      "data-album-id": album.id,
      "aria-current": current ? "true" : null,
      "aria-disabled": disabled ? "true" : null,
      onclick: (e) => { if (disabled) { e.preventDefault(); return; } onOpen?.(album, e.currentTarget); },
    },
      sleeve(album),
      h("span.card__text", {},
        h("span.card__title", {}, album.title),
        h("span.card__artist", {}, album.artist),
        statusTag(album.status)),
    ));
}

export function albumGrid(albums, { currentId, disabled, onOpen } = {}) {
  return h("ul.grid", { "aria-label": "Albums" },
    albums.map((a) => albumCard(a, { current: a.id === currentId, disabled, onOpen })));
}

export function skeletonGrid(count = 8) {
  return h("ul.grid.skeleton", { "aria-hidden": "true" },
    Array.from({ length: count }, () => h("li", {}, h("div.skeleton__cover"), h("div.skeleton__line"), h("div.skeleton__line"))));
}

export function searchField({ value = "", disabled = false, onInput, onClear } = {}) {
  const input = h("input.search__input", {
    type: "search", id: "album-search", name: "q", value, autocomplete: "off", spellcheck: false,
    placeholder: "Search titles and artists", "aria-label": "Search titles and artists",
    readOnly: disabled, "aria-disabled": disabled ? "true" : null,
    oninput: (e) => onInput?.(e.target.value),
    onkeydown: (e) => { if (e.key === "Escape" && e.target.value) { e.preventDefault(); onClear?.(); } },
  });
  const clear = h("button.icon-btn.search__clear", {
    type: "button", "aria-label": "Clear search", hidden: !value, disabled,
    onclick: () => { onClear?.(); input.focus(); },
  }, icon("close", { size: 18 }));
  return h("div.search", { role: "search" }, icon("search"), input, clear);
}

/** Status filter radio group: value "" means all statuses. */
export function statusFilter({ value = "", counts = {}, disabled = false, onChange } = {}) {
  const options = [["", "All"], ...STATUSES.map((s) => [s, s])];
  return h("div.filter-scroll", {},
    h("fieldset.filter", { disabled },
      h("legend", {}, "Filter by status"),
      options.map(([v, label]) => h("label.filter__option", {},
        h("input", { type: "radio", name: "status-filter", value: v, checked: v === value, onchange: () => onChange?.(v) }),
        h("span", {}, label, counts[v] != null ? h("b", {}, counts[v]) : null)))));
}

export function emptyState({ kind = "collection", query = "", status = "", onAdd, onClearSearch, onShowAll } = {}) {
  if (kind === "collection") {
    return h("section.empty", { "aria-labelledby": "empty-title" },
      icon("crate", { size: 112, viewBox: "0 0 128 128", className: "icon empty__art" }),
      h("h2.empty__title", { id: "empty-title" }, "Your crate is empty"),
      h("p.empty__body", {}, "Add a record you own, or one you want to hear next. Crate keeps your notes and listening status together."),
      h("div.empty__actions", {}, h("button.btn.btn--primary", { type: "button", onclick: onAdd }, icon("plus"), "Add album")));
  }
  const where = status ? ` in ${status}` : "";
  const title = query ? `Nothing matches “${query}”${where}` : `No records${where} yet`;
  return h("section.empty", { "aria-labelledby": "empty-title" },
    h("h2.empty__title", { id: "empty-title" }, title),
    h("p.empty__body", {}, query
      ? `Search covers titles and artists. Try fewer letters${status ? ", or look across all statuses" : " or another spelling"}.`
      : "Change a record’s status from its detail view to see it here."),
    h("div.empty__actions", {},
      query ? h("button.btn.btn--secondary", { type: "button", onclick: onClearSearch }, "Clear search") : null,
      status ? h("button.btn.btn--secondary", { type: "button", onclick: onShowAll }, "Show all statuses") : null));
}

/** Load failure. Keep any previously loaded grid visible beneath it. */
export function loadNotice({ title = "Collection not loaded", message, onRetry, pending = false } = {}) {
  return h("div.notice", { role: "alert" },
    h("p.notice__text", {}, h("strong", {}, title), message),
    h("button.btn.btn--secondary", { type: "button", onclick: onRetry, "aria-disabled": pending ? "true" : null },
      pending ? h("span.spinner", { "aria-hidden": "true" }) : icon("retry", { size: 18 }), pending ? "Trying again…" : "Try again"));
}

/* ---------- Detail ---------- */

const SELECT_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Home", "End"]);

export function statusSwitch({ name, value, legend = "Listening status", disabled = false, busy = false, onChange } = {}) {
  return h("fieldset.status-switch", { "aria-busy": busy ? "true" : null },
    h("legend", {}, legend),
    h("div.status-switch__track", {}, STATUSES.map((s) => h("label.status-switch__option", {},
      // aria-disabled (not disabled) keeps focus on the chosen option while pending.
      h("input", { type: "radio", name, value: s, checked: s === value, "aria-disabled": disabled ? "true" : null,
        // While pending, block pointer and keyboard (arrows/Space) selection and
        // restore the committed option if the browser changes it anyway.
        onclick: (e) => { if (disabled) e.preventDefault(); },
        onkeydown: (e) => { if (disabled && SELECT_KEYS.has(e.key)) e.preventDefault(); },
        onchange: (e) => {
          if (!disabled) return onChange?.(s, e.currentTarget);
          for (const r of e.currentTarget.closest(".status-switch").querySelectorAll("input")) r.checked = r.value === value;
        } }),
      h("span", {}, s)))));
}

function panelBar({ label, onClose, disabled }) {
  return h("div.panel__bar", {},
    h("span.panel__crumb", {}, label),
    h("button.icon-btn", { type: "button", "aria-label": "Close and return to collection", "aria-disabled": disabled ? "true" : null, onclick: () => { if (!disabled) onClose?.(); } }, icon("close")));
}

/**
 * Detail view. `pending` is null or a string naming the in-flight action
 * ("status" | "delete"); while pending, competing actions are aria-disabled.
 */
export function detailView(album, {
  pending = null, pendingStatus = null, statusMessage = "", statusError = false, confirming = false, deleteError = "",
  onClose, onStatus, onEdit, onDelete, onConfirmDelete, onCancelDelete,
} = {}) {
  const busy = Boolean(pending);
  const guard = (fn) => (e) => { if (busy) { e.preventDefault(); return; } fn?.(e); };
  const notes = album.notes
    ? h("p.notes", {}, album.notes)
    : h("p.notes.notes--empty", {}, "No notes yet. Add what you noticed, where you found it, or what to listen for.");

  return h("article.detail", { "aria-labelledby": "detail-title", "aria-busy": busy ? "true" : null },
    panelBar({ label: "Album", onClose, disabled: busy }),
    h("div.detail__art", {}, sleeve(album)),
    h("h2.detail__title", { id: "detail-title", tabIndex: -1 }, album.title),
    h("p.detail__artist", {}, album.artist),
    h("div.detail__section", {},
      statusSwitch({ name: `status-${album.id}`, value: pendingStatus ?? album.status, disabled: busy, busy: pending === "status", onChange: onStatus }),
      // One reserved line: pending, success or failure copy swap in place without shifting content.
      h("p.inline-msg", { role: "status", className: `inline-msg${statusError ? " inline-msg--error" : ""}` },
        pending === "status"
          ? [h("span.spinner", { "aria-hidden": "true" }), `Saving as ${pendingStatus} — other actions are paused.`]
          : statusMessage)),
    h("section.detail__section", { "aria-labelledby": "notes-label" },
      h("h3.detail__label", { id: "notes-label" }, "Notes"),
      notes),
    confirming
      ? h("div.confirm", { role: "group", "aria-labelledby": "confirm-text" },
        h("p.confirm__text", { id: "confirm-text" }, `Delete “${album.title}”? This removes it and its notes from your crate.`),
        deleteError ? h("p.inline-msg.inline-msg--error", { role: "alert" }, deleteError) : null,
        h("div.confirm__actions", {},
          h("button.btn.btn--danger", { type: "button", "data-confirm-delete": "", "aria-busy": pending === "delete" ? "true" : null, "aria-disabled": busy ? "true" : null, onclick: guard(onConfirmDelete) },
            pending === "delete" ? h("span.spinner", { "aria-hidden": "true" }) : null, pending === "delete" ? "Deleting…" : "Delete album"),
          h("button.btn.btn--secondary", { type: "button", "aria-disabled": busy ? "true" : null, onclick: guard(onCancelDelete) }, "Keep it")),
        pending === "delete" ? pendingNote("Other actions are paused until this finishes.") : null)
      : h("div.detail__actions", {},
        h("button.btn.btn--secondary", { type: "button", "data-edit": "", "aria-disabled": busy ? "true" : null, onclick: guard(onEdit) }, icon("edit", { size: 18 }), "Edit details"),
        h("button.btn.btn--danger-quiet", { type: "button", "data-delete": "", "aria-disabled": busy ? "true" : null, onclick: guard(onDelete) }, icon("trash", { size: 18 }), "Delete")),
  );
}

export function pendingNote(text) {
  return h("p.pending-note", { role: "status" }, h("span.spinner", { "aria-hidden": "true" }), text);
}

export function missingView({ onBack } = {}) {
  return h("section.missing", { "aria-labelledby": "missing-title" },
    h("h2.missing__title", { id: "missing-title", tabIndex: -1 }, "This record isn’t in your crate"),
    h("p", {}, "It may have been deleted in another tab or window. Nothing else was changed."),
    h("button.btn.btn--secondary", { type: "button", onclick: onBack }, icon("back", { size: 18 }), "Back to collection"));
}

/* ---------- Editor ---------- */

function counterState(n, max) {
  if (n > max) return "over";
  return n >= max * 0.9 ? "near" : "ok";
}

function textField({ key, value, error, pending, multiline = false, optional = false, onInput }) {
  const id = `field-${key}`;
  const max = LIMITS[key];
  const counter = h("span.counter", { id: `${id}-count`, "aria-hidden": "true" });
  const errorEl = h("span.field__error", { id: `${id}-error` }, error || "");
  const update = (v) => {
    const n = countChars(key === "notes" ? v : v.trim());
    counter.textContent = `${n} / ${max}`;
    counter.dataset.state = counterState(n, max);
  };
  const control = h(multiline ? "textarea.textarea" : "input.input", {
    id, name: key, value: value ?? "",
    required: !optional, readOnly: pending, "aria-invalid": error ? "true" : null,
    "aria-describedby": `${id}-error ${id}-hint`, autocomplete: "off",
    oninput: (e) => { update(e.target.value); onInput?.(key, e.target.value); },
  });
  if (multiline) control.value = value ?? "";
  update(value ?? "");
  return h("div.field", {},
    h("label.field__label", { htmlFor: id }, FIELD_LABELS[key], optional ? h("span.optional", {}, "Optional") : null),
    control,
    h("div.field__meta", {}, errorEl, counter, h("span.visually-hidden", { id: `${id}-hint` }, `Up to ${max} characters.`)));
}

/**
 * Add/edit form. Fields stay mounted while typing; the caller re-renders only
 * on submit outcome. While pending, inputs are read-only (keeping focus and
 * text selectable) and Save/Cancel are aria-disabled with an explanation.
 */
export function editorView({
  mode = "edit", draft, errors = {}, formError = "", pending = false,
  onInput, onSubmit, onCancel,
} = {}) {
  const fieldErrors = Object.entries(errors).filter(([, msg]) => msg);
  const summary = formError || fieldErrors.length
    ? h("div.error-summary", { id: "error-summary", tabIndex: -1, role: "alert" },
      h("p.error-summary__title", {}, formError || "Some fields need attention before this can be saved."),
      fieldErrors.length ? h("ul", {}, fieldErrors.map(([k, msg]) => h("li", {}, h("a", { href: `#field-${k}` }, msg)))) : null)
    : null;

  const heading = mode === "create" ? "Add album" : "Edit album";
  return h("form.editor", {
    noValidate: true, "aria-labelledby": "editor-title", "aria-busy": pending ? "true" : null,
    onsubmit: (e) => { e.preventDefault(); if (!pending) onSubmit?.(); },
  },
    panelBar({ label: mode === "create" ? "New record" : "Editing", onClose: onCancel, disabled: pending }),
    h("div.editor__preview", { "aria-hidden": "true" }, sleeve({ ...draft, status: draft.status, title: draft.title || "?", cover: draft.cover })),
    h("h2.editor__title", { id: "editor-title", tabIndex: -1 }, heading),
    summary,
    textField({ key: "title", value: draft.title, error: errors.title, pending, onInput }),
    textField({ key: "artist", value: draft.artist, error: errors.artist, pending, onInput }),
    h("div.field", {},
      statusSwitch({ name: "editor-status", value: draft.status, legend: "Status", disabled: pending, onChange: (s) => onInput?.("status", s) })),
    textField({ key: "notes", value: draft.notes, error: errors.notes, pending, multiline: true, optional: true, onInput }),
    h("div.form-actions", {},
      h("button.btn.btn--primary", { type: "submit", "aria-busy": pending ? "true" : null, "aria-disabled": pending ? "true" : null },
        pending ? h("span.spinner", { "aria-hidden": "true" }) : null,
        pending ? "Saving…" : mode === "create" ? "Add to crate" : "Save changes"),
      h("button.btn.btn--secondary", { type: "button", "aria-disabled": pending ? "true" : null, onclick: () => { if (!pending) onCancel?.(); } }, "Cancel"),
      // Reserved line so the pending explanation never shifts the form.
      h("p.form-actions__status", { role: "status" }, pending ? "Saving — fields and navigation are paused until this finishes." : "")));
}

/* ---------- Live announcements ---------- */

export function resultSummary(count, total, { query = "", status = "" } = {}) {
  const noun = (n) => `${n} ${n === 1 ? "record" : "records"}`;
  if (!query && !status) return noun(total);
  return `${count} of ${noun(total)}${status ? ` · ${status}` : ""}${query ? ` · “${query}”` : ""}`;
}

/** Polite, settled announcement: call after search/filter results render. */
export function announce(region, text) {
  region.textContent = "";
  requestAnimationFrame(() => { region.textContent = text; });
}
