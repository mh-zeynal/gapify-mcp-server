# gapify-mcp-server

MCP server that exposes the [Gapify](https://app.gapify.ai) customer-support API (Chatwoot-compatible) as tools for
Claude Code, Claude Desktop, or any other MCP client. Built on the official
[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). All 117 endpoints in
`Gapify-API.postman_collection.json` are generated into tools, plus one `gapify_raw_request` escape hatch.

Tool descriptions are in English; tool inputs may be in Persian (Farsi). See [Persian input](#persian-input).

[راهنمای فارسی](README.fa.md)

## Install

No clone needed; MCP clients run it with `npx`:

```bash
npx -y gapify-mcp-server
```

Requires Node.js 18 or newer.

## Configuration

Set these as environment variables in the MCP client config:

| Variable | Required | Where to get it |
| --- | --- | --- |
| `GAPIFY_API_ACCESS_TOKEN` | yes, for `gapify_*` Application tools | Gapify -> Profile Settings -> Access Token |
| `GAPIFY_ACCOUNT_ID` | recommended | Number in the Gapify URL: `app.gapify.ai/app/accounts/<id>/...` |
| `GAPIFY_BASE_URL` | no | Defaults to `https://app.gapify.ai` |
| `GAPIFY_PLATFORM_APP_API_KEY` | only for `gapify_platform_*` tools | Super Admin -> Platform Apps |
| `GAPIFY_AGENT_BOT_API_KEY` | no | Fallback token for message endpoints |

When running from a local clone, a `.env` next to `package.json` is also read (see `.env.example`); environment
variables win over `.env` values.

### Claude Code

```bash
claude mcp add --scope user gapify -e GAPIFY_API_ACCESS_TOKEN=your-token -e GAPIFY_ACCOUNT_ID=1 -- npx -y gapify-mcp-server
```

Then run `/mcp` inside Claude Code to confirm it connected.

### Claude Desktop

Add to `claude_desktop_config.json` (`%APPDATA%\Claude\` on Windows, `~/Library/Application Support/Claude/` on macOS):

```json
{
  "mcpServers": {
    "gapify": {
      "command": "npx",
      "args": ["-y", "gapify-mcp-server"],
      "env": {
        "GAPIFY_API_ACCESS_TOKEN": "your-token",
        "GAPIFY_ACCOUNT_ID": "1"
      }
    }
  }
}
```

## Usage

Once connected, ask your assistant in English or Persian; it picks the matching tool. For example:

- "List my open conversations" / «گفتگوهای باز من را نشان بده»
- "Find the contact with phone 09121234567" / «مخاطب با شماره ۰۹۱۲۱۲۳۴۵۶۷ را پیدا کن»
- "Reply to conversation 42: your order has shipped" / «به گفتگوی ۴۲ پاسخ بده: سفارش شما ارسال شد»
- "Resolve conversation 42 and add the label `vip`"
- "Assign conversation 42 to the support team"
- "How many conversations did we resolve last week?"

Tools that change data (create, update, delete) are marked in their annotations, so clients that ask for
confirmation before write actions will do so. Delete tools are marked destructive.

If something fails, the tool returns the HTTP status with a hint, for example a 401 means `GAPIFY_API_ACCESS_TOKEN`
is missing or wrong, and a 404 usually means a wrong ID or `account_id`.

## Persian input

- Free text (names, message content, notes, search terms, custom attribute values) is sent unchanged as UTF-8 JSON
  or URL-encoded query strings, so Persian text round-trips exactly. The server's instructions tell the model not to
  translate it.
- IDs, page numbers, numeric fields and phone numbers accept Persian (`۰-۹`) and Arabic-Indic (`٠-٩`) digits and are
  converted to ASCII before the request. `۰۹۱۲ ۳۴۵ ۶۷۸۹` becomes `09123456789`; `+۹۸۹۱۲...` becomes `+98912...`.
- Zero-width and bidi control marks that RTL keyboards insert around values are stripped from IDs.
- Boolean fields accept `true`/`false`, `"true"`/`"false"` and `"بله"`/`"خیر"`.
- Enum values (e.g. conversation status `open`, `resolved`) stay English; each parameter description lists them.

The normalization lives in `src/persian.ts`.

## Tool naming

- `gapify_<action>` : Application API (`/api/v1/accounts/{account_id}/...`), user API key
- `gapify_platform_<action>` : Platform API (`/platform/api/v1/...`), platform app key
- `gapify_client_<action>` : Client/public API (`/public/api/v1/inboxes/...`), no auth
- `gapify_raw_request` : any method + path, for endpoints missing from the collection

Run `node scripts/generate-tools.mjs --list` to print every tool with its method and path.

## How it works

- `scripts/generate-tools.mjs` walks the Postman collection and writes `src/generated/tools.json`: name, method, path,
  path/query params with descriptions, and body fields parsed from the request description and example body.
  `SUMMARY_OVERRIDES` and `FIELD_DOCS` supply precise English text where the collection is vague or silent. The
  generator fails if any parameter lacks a description or any description contains non-ASCII text.
- `src/index.ts` registers one MCP tool per entry with a Zod schema. `account_id` becomes optional when
  `GAPIFY_ACCOUNT_ID` is set. `extra_body` lets you pass keys that are not in the example.
- `src/client.ts` picks the right `api-access-token` header per endpoint and returns actionable error text for
  401/403/404/422/429. Responses over 60k characters are truncated with a note.

## Development

```bash
npm install
npm run build        # regenerates tools.json from the Postman collection, then compiles to dist/
npm run inspect      # opens MCP Inspector against dist/index.js
```
