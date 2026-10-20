// Parses the Postman collection into src/generated/tools.json.
// Re-run (npm run generate) whenever the collection changes.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const collection = JSON.parse(readFileSync(join(root, "Gapify-API.postman_collection.json"), "utf8"));

const STOP_WORDS = new Set(["a", "an", "the", "all", "new", "in", "from", "to", "of", "details", "object", "page"]);
const PREFIX = { Platform: "platform_", Client: "client_", Others: "", Application: "" };

// Hand-picked names where the automatic slug is ambiguous or awkward. Key: "<sub-folder>/<request name>".
const OVERRIDES = {
  "Agents/Add a New Agent": "add_agent",
  "Agents/List Agents in Account": "list_agents",
  "Agents/Update Agent in Account": "update_agent",
  "Agents/Remove an Agent from Account": "remove_agent",
  "Inboxes/List Agents in Inbox": "list_inbox_agents",
  "Inboxes/Add a New Agent": "add_inbox_agents",
  "Inboxes/Update Agents in Inbox": "update_inbox_agents",
  "Inboxes/Remove an Agent from Inbox": "remove_inbox_agent",
  "Inboxes/Add or remove agent bot": "set_inbox_agent_bot",
  "Teams/List Agents in Team": "list_team_agents",
  "Teams/Add a New Agent": "add_team_agents",
  "Teams/Update Agents in Team": "update_team_agents",
  "Teams/Remove an Agent from Team": "remove_team_agent",
  "Contact Labels/List Labels": "list_contact_labels",
  "Contact Labels/Add Labels": "set_contact_labels",
  "Conversation Labels/List Labels": "list_conversation_labels",
  "Conversation Labels/Add Labels": "set_conversation_labels",
  "Conversations/Conversations List": "list_conversations",
  "Conversations/Conversation Details": "get_conversation",
  "Conversations/Conversations Filter": "filter_conversations",
  "Conversations/Toggle Status": "toggle_conversation_status",
  "Conversations/Toggle Priority": "toggle_conversation_priority",
  "Contacts/Contact Conversations": "list_contact_conversations",
  "Contacts/Contact Filter": "filter_contacts",
  "Contacts/Show Contact": "get_contact",
  "Profile/Fetch user profile": "get_profile",
  "Inbox API/Inbox details": "get_inbox",
  "Help Center/update a new portal": "update_portal",
  "Others/Get CSAT survey page": "get_csat_survey",
};

// Precise English summaries where the collection's first description line is vague or ungrammatical. Key: tool name.
const SUMMARY_OVERRIDES = {
  gapify_platform_delete_agent_bot: "Delete an agent bot",
  gapify_platform_get_user: "Get the details of a user",
  gapify_platform_get_user_sso_link: "Get a single sign-on (SSO) login link for a user",
  gapify_delete_agent_bot: "Delete an agent bot from the account",
  gapify_list_agents: "List all agents in the account",
  gapify_add_agent: "Add a new agent to the account",
  gapify_update_agent: "Update an agent in the account",
  gapify_remove_agent: "Remove an agent from the account",
  gapify_list_canned_responses: "List all canned responses (saved reply templates) in the account",
  gapify_add_canned_response: "Add a new canned response to the account",
  gapify_update_canned_response: "Update a canned response in the account",
  gapify_remove_canned_response: "Remove a canned response from the account",
  gapify_list_contacts:
    "List resolved contacts with pagination (15 per page). Resolved contacts are those with an identifier, email or phone number",
  gapify_create_contact: "Create a new contact in the account",
  gapify_get_contact: "Get a contact by ID",
  gapify_update_contact: "Update a contact by ID",
  gapify_delete_contact: "Delete a contact by ID",
  gapify_list_contact_conversations: "List the conversations of a contact",
  gapify_search_contacts:
    "Search resolved contacts by name, identifier, email or phone number (15 per page). Persian names and Persian-digit phone numbers are accepted",
  gapify_get_contactable_inboxes: "List the inboxes through which a contact can be reached",
  gapify_list_contact_labels: "List the labels of a contact",
  gapify_set_contact_labels: "Set the labels of a contact. Replaces the contact's existing labels with the given list",
  gapify_list_conversation_labels: "List the labels of a conversation",
  gapify_set_conversation_labels:
    "Set the labels of a conversation. Replaces the conversation's existing labels with the given list",
  gapify_get_conversation_counts: "Get conversation counts by assignment (mine, unassigned, assigned, all), with optional filters",
  gapify_list_conversations: "List conversations with filters and pagination",
  gapify_create_conversation:
    "Create a conversation for a contact in an inbox. Requires the contact inbox source_id (see gapify_create_contact_inbox)",
  gapify_get_conversation: "Get a conversation's details by its display ID",
  gapify_toggle_conversation_status: "Change the status of a conversation (open, resolved, pending or snoozed)",
  gapify_toggle_conversation_priority: "Set the priority of a conversation (urgent, high, medium, low or none)",
  gapify_list_custom_attributes: "List custom attribute definitions in the account",
  gapify_get_custom_attribute: "Get a custom attribute definition by ID",
  gapify_list_custom_filters: "List the current user's saved custom filters of a given type",
  gapify_create_inbox: "Create a new inbox (channel) in the account",
  gapify_update_inbox: "Update an inbox's settings, such as name, avatar and auto assignment",
  gapify_show_inbox_agent_bot: "Get the agent bot connected to an inbox, if any",
  gapify_set_inbox_agent_bot: "Connect an agent bot to an inbox, or disconnect it by passing agent_bot as null",
  gapify_list_inbox_agents: "List the agents assigned to an inbox",
  gapify_add_inbox_agents: "Add agents to an inbox",
  gapify_update_inbox_agents: "Replace the agents of an inbox. Agents not in user_ids are removed from the inbox",
  gapify_remove_inbox_agent: "Remove agents from an inbox",
  gapify_list_integrations: "List the integrations available for the account",
  gapify_get_messages: "List the messages of a conversation",
  gapify_create_message: "Send a new message or private note in a conversation",
  gapify_delete_message: "Delete a message and its attachments from a conversation",
  gapify_get_profile: "Get the profile of the user who owns the API access token",
  gapify_get_account_reports: "Get time-series report data for a metric, report type and date range",
  gapify_get_account_reports_summary: "Get summary report totals for a report type and date range",
  gapify_list_team_agents: "List the agents in a team",
  gapify_add_team_agents: "Add agents to a team",
  gapify_update_team_agents: "Replace the agents of a team. Agents not in user_ids are removed from the team",
  gapify_remove_team_agent: "Remove agents from a team",
  gapify_list_automation_rules: "List automation rules in the account",
  gapify_get_automation_rule: "Get an automation rule by ID",
  gapify_update_automation_rule: "Update an automation rule in the account",
  gapify_remove_automation_rule: "Remove an automation rule from the account",
  gapify_list_portals: "List help center portals in the account",
  gapify_add_portal: "Create a help center portal in the account",
  gapify_update_portal: "Update a help center portal",
  gapify_add_category: "Add a category to a help center portal",
  gapify_add_article: "Add an article to a help center portal",
  gapify_get_csat_survey: "Get the hosted CSAT (customer satisfaction) survey page for a conversation",
};

// English descriptions for parameters the collection leaves undocumented.
// Key: "<field>" fills any tool's undocumented field, "<tool>.<field>" overrides one tool's field.
const FIELD_DOCS = {
  page: "Page number, starting at 1.",
  inbox_id: "Numeric ID of the inbox.",
  team_id: "Numeric ID of the team.",
  portal_id: "Numeric ID of the help center portal.",
  account_id: "Numeric ID of the account.",
  author_id: "Numeric ID of the user who authored the article.",
  category_id: "Numeric ID of the help center category.",
  folder_id: "Numeric ID of the help center folder.",
  labels: "Label names to filter by, comma-separated.",
  payload:
    'Array of filter conditions. Each item: {attribute_key, filter_operator (e.g. equal_to, not_equal_to, contains, does_not_contain), values: [...], query_operator: "AND" | "OR", null on the last item}. Values may be Persian text.',
  channel:
    'Channel settings object. For a website inbox: {type: "web_widget", website_url, welcome_title, welcome_tagline, agent_away_message, widget_color}. Text values may be Persian.',
  event_name: "Event that triggers the rule. One of: `conversation_created`, `conversation_updated`, `message_created`.",
  "gapify_add_agent.role": "Role of the agent. One of: `agent`, `administrator`.",
  "gapify_update_agent.role": "Role of the agent. One of: `agent`, `administrator`.",
  "gapify_add_agent.availability_status": "Availability of the agent. One of: `available`, `busy`, `offline`.",
  "gapify_update_agent.availability": "Availability of the agent. One of: `available`, `busy`, `offline`.",
  "gapify_create_conversation.status": "Initial status of the conversation. One of: `open`, `resolved`, `pending`.",
  "gapify_toggle_conversation_status.status": "New status. One of: `open`, `resolved`, `pending`, `snoozed`.",
  "gapify_toggle_conversation_priority.priority": "New priority. One of: `urgent`, `high`, `medium`, `low`, `none`.",
  "gapify_create_custom_filter.type": "Type of the custom filter. One of: `conversation`, `contact`, `report`.",
  "gapify_update_custom_filter.type": "Type of the custom filter. One of: `conversation`, `contact`, `report`.",
  "gapify_create_message.content": "Text of the message. Any language, including Persian, is sent unchanged.",
  "gapify_create_message.message_type": "Direction of the message. One of: `outgoing` (agent to contact), `incoming`.",
  "gapify_create_message.content_type":
    "Content type of the message. One of: `text`, `input_email`, `cards`, `input_select`, `form`, `article`. Use `text` for normal messages.",
  "gapify_add_article.status": "Publication status of the article. One of: `draft`, `published`, `archived`.",
  "gapify_add_article.title": "Title of the article.",
  "gapify_add_article.slug": "URL slug of the article (ASCII letters, digits and dashes).",
  "gapify_add_article.views": "Initial view count of the article.",
  "gapify_client_update_message.submitted_values": "Values the contact submitted for an interactive message (form, input_select or cards).",
};

// Field types that the collection's example body gets wrong. Key: "<tool>.<field>".
const FIELD_TYPE_OVERRIDES = {
  "gapify_add_article.status": "string",
  "gapify_client_update_message.submitted_values": "object",
};

function slug(s) {
  return s
    .replace(/\s+(in|from)\s+(an?\s+)?account$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !STOP_WORDS.has(w))
    .join("_");
}

// Parse "- `key` *type* **required** - desc" lines from the description's Request body section.
function parseBodyDocs(description) {
  const out = {};
  const section = description.split("**Request body**")[1];
  if (!section) return out;
  const lines = section.split("**Responses**")[0].split("\n");
  for (const line of lines) {
    const m = line.match(/^-\s+`([^`]+)`\s*(?:\*([^*]+)\*)?\s*(\*\*required\*\*)?\s*(?:-\s*(.*))?$/);
    if (m) out[m[1]] = { type: (m[2] || "").trim(), required: !!m[3], description: (m[4] || "").trim() };
  }
  return out;
}

function inferType(value, docType) {
  const t = (docType || "").toLowerCase();
  if (t.startsWith("array")) return "array";
  if (t === "integer" || t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t === "object") return "object";
  if (t === "string") return "string";
  if (value === undefined || value === null) return "any";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value; // string | number | boolean
}

function authKind(request) {
  if (!request.auth) return "user";
  if (request.auth.type === "noauth") return "none";
  const v = (request.auth.apikey || []).find((x) => x.key === "value")?.value || "";
  if (v.includes("platform_app_api_key")) return "platform";
  if (v.includes("agent_bot_api_key")) return "agent_bot";
  return "user";
}

const tools = [];
function walk(items, folders) {
  for (const it of items) {
    if (it.item) {
      walk(it.item, [...folders, it.name]);
      continue;
    }
    const r = it.request;
    const top = folders[0];
    const sub = folders[1] || "";
    const path = "/" + r.url.path.map((p) => (p.startsWith(":") ? `{${p.slice(1)}}` : p)).join("/");
    const description = r.description || "";
    const summary = description.split("\n")[0].trim();
    const authLine = (description.match(/^Auth:\s*(.*)$/m) || [])[1] || "";
    const bodyDocs = parseBodyDocs(description);

    let bodyExample = null;
    if (r.body && r.body.mode === "raw" && r.body.raw.trim()) bodyExample = JSON.parse(r.body.raw);

    const bodyFields = [];
    if (bodyExample && typeof bodyExample === "object" && !Array.isArray(bodyExample)) {
      for (const [key, value] of Object.entries(bodyExample)) {
        const doc = bodyDocs[key] || {};
        bodyFields.push({ name: key, type: inferType(value, doc.type), required: !!doc.required, description: doc.description || "", example: value });
      }
      for (const [key, doc] of Object.entries(bodyDocs)) {
        if (!bodyFields.find((f) => f.name === key))
          bodyFields.push({ name: key, type: inferType(undefined, doc.type), required: !!doc.required, description: doc.description, example: undefined });
      }
    }

    const key = `${top === "Others" ? "Others" : sub}/${it.name}`;
    tools.push({
      name: PREFIX[top] + (OVERRIDES[key] || slug(it.name)),
      folder: sub,
      title: it.name,
      method: r.method,
      path,
      summary,
      authLine,
      auth: authKind(r),
      pathParams: (r.url.variable || []).map((v) => ({ name: v.key, description: v.description || "" })),
      queryParams: (r.url.query || []).map((q) => ({ name: q.key, description: q.description || "", example: q.value || "" })),
      bodyFields,
      bodyExample,
    });
  }
}
walk(collection.item, []);
for (const t of tools) {
  t.name = "gapify_" + t.name;
  if (SUMMARY_OVERRIDES[t.name]) t.summary = SUMMARY_OVERRIDES[t.name];
  for (const p of [...t.pathParams, ...t.queryParams, ...t.bodyFields]) {
    const doc = FIELD_DOCS[`${t.name}.${p.name}`] || (!p.description && FIELD_DOCS[p.name]);
    if (doc) p.description = doc;
  }
  for (const f of t.bodyFields) {
    const type = FIELD_TYPE_OVERRIDES[`${t.name}.${f.name}`];
    if (type) {
      f.type = type;
      f.example = undefined;
    }
  }
}

// Publishing rule: every tool and parameter needs a precise English description.
const unknownOverrides = Object.keys(SUMMARY_OVERRIDES).filter((n) => !tools.some((t) => t.name === n));
if (unknownOverrides.length) throw new Error("SUMMARY_OVERRIDES for unknown tools: " + unknownOverrides.join(", "));
const undocumented = tools.flatMap((t) =>
  [...t.pathParams, ...t.queryParams, ...t.bodyFields].filter((p) => !p.description).map((p) => `${t.name}.${p.name}`),
);
if (undocumented.length) throw new Error("Parameters without a description: " + undocumented.join(", "));
const nonEnglish = tools.filter((t) =>
  /[^\x00-\x7f]/.test(JSON.stringify([t.summary, t.title, t.pathParams, t.queryParams, t.bodyFields.map((f) => f.description)])),
);
if (nonEnglish.length) throw new Error("Non-ASCII text in tool descriptions: " + nonEnglish.map((t) => t.name).join(", "));

const dupes = tools.map((t) => t.name).filter((n, i, a) => a.indexOf(n) !== i);
if (dupes.length) throw new Error("Duplicate tool names: " + dupes.join(", "));
const tooLong = tools.filter((t) => t.name.length > 64);
if (tooLong.length) throw new Error("Tool names over 64 chars: " + tooLong.map((t) => t.name).join(", "));

writeFileSync(join(root, "src/generated/tools.json"), JSON.stringify(tools, null, 2));
console.log(`Generated ${tools.length} tools -> src/generated/tools.json`);
if (process.argv.includes("--list")) for (const t of tools) console.log(`${t.method.padEnd(6)} ${t.name.padEnd(44)} ${t.path}`);
