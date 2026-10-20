import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export type AuthKind = "user" | "platform" | "agent_bot" | "none";

const CHARACTER_LIMIT = 60_000;

// Load <project>/.env as a fallback for values not already set in the process environment.
function loadDotEnv(): void {
  try {
    const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
    for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // no .env file; environment variables only
  }
}
loadDotEnv();

export const config = {
  baseUrl: (process.env.GAPIFY_BASE_URL || "https://app.gapify.ai").replace(/\/+$/, ""),
  userToken: process.env.GAPIFY_API_ACCESS_TOKEN || "",
  platformKey: process.env.GAPIFY_PLATFORM_APP_API_KEY || "",
  agentBotKey: process.env.GAPIFY_AGENT_BOT_API_KEY || "",
  defaultAccountId: process.env.GAPIFY_ACCOUNT_ID || "",
};

function tokenFor(auth: AuthKind): { token: string; hint: string } {
  switch (auth) {
    case "platform":
      return {
        token: config.platformKey,
        hint: "Set GAPIFY_PLATFORM_APP_API_KEY (Super Admin -> Platform Apps) for platform endpoints.",
      };
    case "agent_bot":
      return { token: config.agentBotKey || config.userToken, hint: "Set GAPIFY_AGENT_BOT_API_KEY or GAPIFY_API_ACCESS_TOKEN." };
    case "user":
      return {
        token: config.userToken || config.agentBotKey,
        hint: "Set GAPIFY_API_ACCESS_TOKEN (Gapify -> Profile Settings -> Access Token).",
      };
    default:
      return { token: "", hint: "" };
  }
}

export interface RequestSpec {
  method: string;
  path: string; // e.g. /api/v1/accounts/{account_id}/contacts
  auth: AuthKind;
  pathParams: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface ApiResult {
  ok: boolean;
  status: number;
  url: string;
  data: unknown;
  text: string; // formatted for the model
}

const STATUS_HINTS: Record<number, string> = {
  401: "Unauthorized: check the api-access-token value and that it matches the auth type this endpoint needs.",
  403: "Forbidden: the token's user may lack permission for this account or action.",
  404: "Not found: check the ids / account_id you passed.",
  422: "Unprocessable: the request body is missing required fields or has invalid values.",
  429: "Rate limited: wait and retry.",
};

export async function callGapify(spec: RequestSpec): Promise<ApiResult> {
  let path = spec.path;
  for (const [key, value] of Object.entries(spec.pathParams)) {
    path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
  }
  const missing = path.match(/\{[a-z_]+\}/g);
  if (missing) {
    throw new Error(`Missing path parameter(s): ${missing.join(", ")}`);
  }

  const url = new URL(config.baseUrl + path);
  for (const [key, value] of Object.entries(spec.query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (spec.auth !== "none") {
    const { token, hint } = tokenFor(spec.auth);
    if (!token) throw new Error(`No API token configured for this endpoint. ${hint}`);
    headers["api-access-token"] = token;
  }
  if (spec.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method: spec.method,
    headers,
    body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
  });

  const raw = await response.text();
  let data: unknown = raw;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // keep raw text
  }

  let text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (text.length > CHARACTER_LIMIT) {
    const dropped = text.length - CHARACTER_LIMIT;
    text = text.slice(0, CHARACTER_LIMIT) + `\n... [truncated ${dropped} characters; use pagination or filters to narrow the result]`;
  }
  if (!response.ok) {
    const hint = STATUS_HINTS[response.status] || "";
    text = `HTTP ${response.status} ${response.statusText} for ${spec.method} ${url.pathname}\n${hint}\n${text}`.trim();
  }

  return { ok: response.ok, status: response.status, url: url.toString(), data, text };
}
