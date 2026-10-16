# Connect your AI assistant

Movents is an [MCP](https://modelcontextprotocol.io) server. Any assistant that supports MCP can plan events with it,
acting as you with your role's permissions: anything you could not do alone goes to the right approver.

**Server URL:** `https://<your-movents-domain>/api/mcp` (shown in **Settings → Connect your AI assistant**).

There are two ways to sign in, depending on the app.

## Apps with a "Connect" button (OAuth)

The app opens a Movents sign-in page, you approve, and it is connected. No token to copy.

- **Claude (claude.ai and Claude Desktop):** add a custom connector, paste the server URL, then connect and sign in.
- **ChatGPT:** add a custom connector (MCP) with the server URL and OAuth authentication, then connect.
- **Claude Code:** `claude mcp add --transport http movents https://<your-domain>/api/mcp`, then run `/mcp` and choose
  *Authenticate*.
- **VS Code and other OAuth-capable clients:** add an HTTP MCP server with the URL; the client starts the sign-in.

You can see and disconnect connected apps in **Settings → Connected apps**.

## Apps configured with a file (personal token)

In **Settings → Connect your AI assistant**, create a token (it is shown once) and use the snippet shown there.

**Claude Code**

```bash
claude mcp add --transport http movents https://<your-domain>/api/mcp --header "Authorization: Bearer <token>"
```

**Cursor, Windsurf and other `mcp.json` clients**

```json
{
  "mcpServers": {
    "movents": {
      "type": "http",
      "url": "https://<your-domain>/api/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Tokens act as you. Give each app its own token and revoke any you no longer use.

## What to ask

> Plan a 150-pax AI talk on 15 Nov, 2pm to 5pm, budget RM3,000, with Priya and Jason. Use Mix Mix Catering for food.

The assistant asks for anything missing once, then plans the whole event. Open the trace link it returns to watch
it build live. Later:

> Generate the post-event report for the AI talk.

**Capabilities vary by assistant.** If yours can search the web, it finds real speakers, supplier prices and sponsors;
if it can generate images, it makes the posters. Otherwise Movents uses its supplier registry and branded poster
templates, and you add speakers on the Speakers page.

## Tools

The assistant sees about 45 tools (create and inspect events, SOP, timeline, venue, budget, risks, marketing,
meetings, sponsors, outreach, approvals). Read-only tools are marked as such, and tools that email people or publish
anything are marked as reaching outside Movents, so clients can ask you before calling them.

The same tools are available over REST: `POST /api/agent/tools/<name>` with a Bearer token and JSON arguments
(OpenAPI description at `/api/openapi.json`).
