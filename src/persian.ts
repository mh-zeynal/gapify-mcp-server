import { z } from "zod";

// Helpers that let tools accept Persian (Farsi) input. Free text is passed through untouched (UTF-8);
// only identifiers, numbers and booleans are normalized, because the Gapify API expects ASCII there.

// Zero-width and bidi control marks that Persian keyboards and RTL editors often insert around values.
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

/** Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII 0-9. Other characters are kept. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Normalizes an ID-like value: ASCII digits, no invisible marks, trimmed. */
export function normalizeId(value: string | number): string {
  return toAsciiDigits(String(value).replace(INVISIBLE, "")).trim();
}

/** True when a string is only digits (any script) plus phone/number punctuation, e.g. "۰۹۱۲ ۳۴۵ ۶۷۸۹" or "+۹۸۹۱۲...". */
export function isNumericLike(value: string): boolean {
  return /^[+\-\s()\d۰-۹٠-٩٫٬.,]+$/.test(value.replace(INVISIBLE, "")) && /[\d۰-۹٠-٩]/.test(value);
}

/** Normalizes digits only when the whole value is numeric-like (phone numbers, IDs); other text is returned as-is. */
export function normalizeIfNumeric(value: string): string {
  return isNumericLike(value) ? normalizeId(value).replace(/\s+/g, "") : value;
}

function parseNumber(value: string | number, ctx: z.RefinementCtx): number {
  if (typeof value === "number") return value;
  const cleaned = normalizeId(value)
    .replace(/٫/g, ".") // Arabic decimal separator
    .replace(/[٬,\s]/g, ""); // Arabic and Latin thousands separators
  const n = Number(cleaned);
  if (cleaned === "" || Number.isNaN(n)) {
    ctx.addIssue({ code: "custom", message: `Expected a number, got "${value}".` });
    return z.NEVER;
  }
  return n;
}

/** Path/query identifier: accepts a number or a string with ASCII or Persian digits. */
export function idSchema() {
  return z.union([z.string(), z.number()]).transform(normalizeId);
}

/** Numeric field: accepts a JSON number or a numeric string with ASCII or Persian digits. */
export function numberSchema() {
  return z.union([z.number(), z.string()]).transform(parseNumber);
}

/** Boolean field: accepts true/false, or the strings "true"/"false" (also Persian "بله"/"خیر"). */
export function booleanSchema() {
  return z.union([z.boolean(), z.string()]).transform((value, ctx) => {
    if (typeof value === "boolean") return value;
    const v = value.replace(INVISIBLE, "").trim().toLowerCase();
    if (["true", "1", "yes", "بله", "آره", "درست"].includes(v)) return true;
    if (["false", "0", "no", "خیر", "نه", "نادرست"].includes(v)) return false;
    ctx.addIssue({ code: "custom", message: `Expected true or false, got "${value}".` });
    return z.NEVER;
  });
}

/** Array of IDs (e.g. user_ids): each item may be a number or a string with Persian digits. */
export function idArraySchema() {
  return z.array(z.union([z.number(), z.string()])).transform((items) =>
    items.map((item) => {
      if (typeof item === "number") return item;
      const id = normalizeId(item);
      return /^\d+$/.test(id) ? Number(id) : id;
    }),
  );
}

export const PERSIAN_INPUT_NOTE =
  "Text values may be written in Persian (Farsi) or any other language and are sent unchanged; IDs, numbers and phone numbers may use Persian or Arabic-Indic digits.";
