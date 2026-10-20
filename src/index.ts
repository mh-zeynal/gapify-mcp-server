#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodTypeAny } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callGapify, config, type AuthKind } from "./client.js";
import {
  PERSIAN_INPUT_NOTE,
  booleanSchema,
  idArraySchema,
  idSchema,
  normalizeIfNumeric,
  numberSchema,
  toAsciiDigits,
} from "./persian.js";

interface ParamDoc {
  name: string;
  description: string;
  example?: string;
}
interface BodyField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: unknown;
}
interface ToolSpec {
  name: string;
  folder: string;
  title: string;
  method: string;
  path: string;
  summary: string;
  authLine: string;
  auth: AuthKind;
  pathParams: ParamDoc[];
  queryParams: ParamDoc[];
  bodyFields: BodyField[];
  bodyExample: unknown;
}

const here = dirname(fileURLToPath(import.meta.url));
const tools: ToolSpec[] = JSON.parse(readFileSync(join(here, "generated", "tools.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string };

const server = new McpServer(
  { name: "gapify-mcp-server", version: pkg.version },
  {
    instructions:
      "Tools for the Gapify customer-support API (Chatwoot-compatible): conversations, messages, contacts, inboxes, " +
      "agents, teams, labels, reports and help center. Users may write in Persian (Farsi). Pass names, message content, " +
      "notes, search terms and other free text exactly as the user wrote them, in Persian if so; do not translate them. " +
      "IDs, numbers and phone numbers may contain Persian digits and are normalized automatically. Enum values listed " +
      "in parameter descriptions (e.g. status `open`, `resolved`) must be sent in English.",
  },
);

// Names whose string values are identifiers or phone numbers: Persian digits are converted to ASCII.
const isIdName = (name: string) => name === "id" || name.endsWith("_id") || name === "page" || name === "since" || name === "until";
const isNumericTextName = (name: string) => isIdName(name) || name === "phone_number" || name === "q";

function zodForField(f: BodyField): ZodTypeAny {
  let schema: ZodTypeAny;
  switch (f.type) {
    case "number":
      schema = numberSchema();
      break;
    case "boolean":
      schema = booleanSchema();
      break;
    case "array":
      schema = f.name.endsWith("_ids") ? idArraySchema() : z.array(z.any());
      break;
    case "object":
      schema = z.record(z.string(), z.any());
      break;
    case "string":
      schema = isNumericTextName(f.name) ? z.string().transform(normalizeIfNumeric) : z.string();
      break;
    default:
      schema = z.any();
  }
  const hasExample = f.example !== undefined && f.example !== null && f.example !== "string";
  const example = hasExample ? ` Example: ${JSON.stringify(f.example)}` : "";
  schema = schema.describe((f.description || f.name) + example);
  return f.required ? schema : schema.optional();
}

function buildDescription(t: ToolSpec): string {
  const lines: string[] = [];
  lines.push(`${t.summary || t.title} [${t.folder}]`);
  lines.push(`${t.method} ${t.path}`);
  if (t.authLine) lines.push(`Auth: ${t.authLine}`);
  if (t.pathParams.some((p) => p.name === "account_id") && config.defaultAccountId) {
    lines.push(`account_id defaults to ${config.defaultAccountId} when omitted.`);
  }
  if (t.bodyFields.length) {
    const fields = t.bodyFields.map((f) => `${f.name}${f.required ? " (required)" : ""}`).join(", ");
    lines.push(`Body fields: ${fields}. Extra fields can be passed via extra_body.`);
  }
  if (t.method === "DELETE") lines.push("Destructive: this permanently deletes the resource.");
  lines.push(PERSIAN_INPUT_NOTE);
  return lines.join("\n");
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

for (const t of tools) {
  const shape: Record<string, ZodTypeAny> = {};

  for (const p of t.pathParams) {
    const desc = p.description || p.name;
    if (p.name === "account_id" && config.defaultAccountId) {
      shape[p.name] = idSchema().optional().describe(`${desc} (defaults to ${config.defaultAccountId})`);
    } else {
      shape[p.name] = idSchema().describe(desc);
    }
  }
  for (const q of t.queryParams) {
    if (shape[q.name]) continue;
    const ex = q.example ? ` Example: ${q.example}` : "";
    const base = isIdName(q.name) ? idSchema() : isNumericTextName(q.name) ? z.string().transform(normalizeIfNumeric) : z.string();
    shape[q.name] = base.optional().describe(`Query param. ${q.description || q.name}${ex}`.trim());
  }
  for (const f of t.bodyFields) {
    if (shape[f.name]) continue;
    shape[f.name] = zodForField(f);
  }
  if (t.bodyExample !== null) {
    shape.extra_body = z
      .record(z.string(), z.any())
      .optional()
      .describe("Additional JSON body fields to merge into the request (for keys not listed above).");
  }

  const pathNames = new Set(t.pathParams.map((p) => p.name));
  const queryNames = new Set(t.queryParams.map((q) => q.name).filter((n) => !pathNames.has(n)));
  const bodyNames = new Set(t.bodyFields.map((f) => f.name).filter((n) => !pathNames.has(n) && !queryNames.has(n)));

  server.registerTool(
    t.name,
    {
      title: `${t.folder ? t.folder + ": " : ""}${t.title}`,
      description: buildDescription(t),
      inputSchema: shape,
      annotations: {
        readOnlyHint: t.method === "GET",
        destructiveHint: t.method === "DELETE",
        idempotentHint: t.method === "GET" || t.method === "PUT" || t.method === "DELETE",
        openWorldHint: true,
      },
    },
    async (args: Record<string, unknown>) => {
      try {
        const pathParams: Record<string, string> = {};
        for (const name of pathNames) {
          const value = args[name] ?? (name === "account_id" ? config.defaultAccountId : undefined);
          if (value === undefined || value === "") throw new Error(`Missing required path parameter '${name}'.`);
          pathParams[name] = String(value);
        }
        const query: Record<string, string> = {};
        for (const name of queryNames) if (args[name] !== undefined) query[name] = String(args[name]);

        let body: Record<string, unknown> | undefined;
        if (t.bodyExample !== null) {
          body = {};
          for (const name of bodyNames) if (args[name] !== undefined) body[name] = args[name];
          if (args.extra_body && typeof args.extra_body === "object") {
            Object.assign(body, args.extra_body as Record<string, unknown>);
          }
        }

        const result = await callGapify({ method: t.method, path: t.path, auth: t.auth, pathParams, query, body });
        return { content: [{ type: "text" as const, text: result.text }], isError: !result.ok };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

// Escape hatch for endpoints missing from the collection.
server.registerTool(
  "gapify_raw_request",
  {
    title: "Raw Gapify API request",
    description:
      "Send an arbitrary request to the Gapify API for endpoints not covered by the generated tools. " +
      "Path is relative to the base URL (e.g. /api/v1/accounts/1/labels). Uses the user API key unless auth is changed. " +
      "Persian digits in the path are converted to ASCII; the body is sent as UTF-8 JSON, so Persian text is preserved.",
    inputSchema: {
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
      path: z.string().describe("Path relative to the base URL, starting with /"),
      query: z.record(z.string(), z.string()).optional().describe("Query string parameters"),
      body: z.any().optional().describe("JSON body"),
      auth: z.enum(["user", "platform", "agent_bot", "none"]).default("user").describe("Which API key to send"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ method, path, query, body, auth }) => {
    try {
      const result = await callGapify({ method, path: toAsciiDigits(path), auth, pathParams: {}, query, body });
      return { content: [{ type: "text" as const, text: result.text }], isError: !result.ok };
    } catch (err) {
      return errorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const tokenState = config.userToken ? "set" : "MISSING";
  console.error(`gapify-mcp-server ready: ${tools.length + 1} tools, base URL ${config.baseUrl}, user token ${tokenState}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
