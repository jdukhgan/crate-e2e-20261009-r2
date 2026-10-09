// Shared album contract. Imported by the browser UI and usable from Node
// (`import { validateAlbum } from "../public/js/contract.js"`) so the client
// and server count and validate identically.

export const STATUSES = Object.freeze(["Want to hear", "Listening", "Heard"]);

export const LIMITS = Object.freeze({ title: 160, artist: 120, notes: 4000 });

export const FIELD_LABELS = Object.freeze({
  title: "Title",
  artist: "Artist",
  status: "Status",
  notes: "Notes",
});

/** Unicode code points, not UTF-16 units: "Ø" is 1, an emoji is 1. */
export function countChars(value) {
  let n = 0;
  for (const _ of String(value ?? "")) n++;
  return n;
}

/**
 * Validate a full draft (create) or a partial patch (`{ partial: true }`).
 * Title/artist are trimmed before counting; whitespace-only is rejected.
 * Notes keep their whitespace; missing notes become "".
 * Returns { ok, value, fields } where fields maps field -> message.
 */
export function validateAlbum(input, { partial = false } = {}) {
  const fields = {};
  const value = {};
  const src = input && typeof input === "object" ? input : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(src, k);

  for (const key of ["title", "artist"]) {
    if (!has(key)) {
      if (!partial) fields[key] = `${FIELD_LABELS[key]} is required.`;
      continue;
    }
    if (typeof src[key] !== "string") {
      fields[key] = `${FIELD_LABELS[key]} must be text.`;
      continue;
    }
    const trimmed = src[key].trim();
    if (!trimmed) fields[key] = `${FIELD_LABELS[key]} is required.`;
    else if (countChars(trimmed) > LIMITS[key])
      fields[key] = `${FIELD_LABELS[key]} must be ${LIMITS[key]} characters or fewer.`;
    else value[key] = trimmed;
  }

  if (has("status")) {
    if (!STATUSES.includes(src.status))
      fields.status = `Status must be one of: ${STATUSES.join(", ")}.`;
    else value.status = src.status;
  } else if (!partial) {
    fields.status = "Status is required.";
  }

  if (has("notes") && src.notes !== null) {
    if (typeof src.notes !== "string") fields.notes = "Notes must be text.";
    else if (countChars(src.notes) > LIMITS.notes)
      fields.notes = `Notes must be ${LIMITS.notes} characters or fewer.`;
    else value.notes = src.notes;
  } else if (!partial) {
    value.notes = "";
  }

  return { ok: Object.keys(fields).length === 0, value, fields };
}

/** Friendly copy for the error envelope `{ error: { code, message, fields? } }`. */
export const ERROR_COPY = Object.freeze({
  network: "Crate couldn’t be reached. Check that it is still running, then try again.",
  server: "Something went wrong on Crate’s side. Your changes are still here — try again.",
  notFound: "This record is no longer in your crate. It may have been deleted in another tab.",
  invalid: "Some fields need attention before this can be saved.",
  load: "Your collection couldn’t be loaded. Check that Crate is still running, then try again.",
});
