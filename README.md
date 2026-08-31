# wallet-mcp

A community-built MCP (Model Context Protocol) server for the [BudgetBakers Wallet](https://budgetbakers.com) REST API. It lets you query your personal finances through Claude Desktop (or any MCP-compatible client) using natural language. BudgetBakers is building their own official MCP integration, but it hasn't been released yet — this project fills the gap.

## Prerequisites

- **Node 18+** or **Bun v1.0+**
- **BudgetBakers Wallet Premium** plan
- **API token** — generate one from Settings > API Tokens in the [Wallet web app](https://web.budgetbakers.com)

## Installation

> [!WARNING]
> **Do not install this from npm.** The npm package named `wallet-mcp` is an unrelated
> crypto-wallet project by a different author — it is not this server. Installing it and
> pasting your BudgetBakers token into its `env` block would hand your API token to
> third-party code. This project is not published to any registry; run it from a clone,
> as described below.

### 1. Clone and install

```bash
git clone https://github.com/lowwave/wallet-mcp.git
cd wallet-mcp
pnpm install
```

### 2. Get your API token

Generate one from **Settings > API Tokens** in the [Wallet web app](https://web.budgetbakers.com).

### 3. Register the server with your MCP client

#### Claude Desktop

Open your config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the `wallet` server, using absolute paths for both the runtime and the entry point:

```json
{
  "mcpServers": {
    "wallet": {
      "command": "/absolute/path/to/bun",
      "args": ["run", "/absolute/path/to/wallet-mcp/src/index.ts"],
      "env": {
        "WALLET_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

Then restart Claude Desktop completely (quit the app, not just the window). The wallet
tools should appear in the tools menu.

> **Absolute path to the runtime matters.** Claude Desktop is launched from the GUI and
> does not inherit your shell `PATH`, so a bare `"command": "bun"` fails with `ENOENT`
> when Bun (or Node, under nvm) lives outside the system paths. Run `which bun` and paste
> the result.

> **The token must live in the `env` block.** Claude Desktop does not read `.env` files.
> The config file is local to your machine and is not committed to any repository.

#### Claude Code

```bash
claude mcp add wallet --scope local \
  --env WALLET_API_TOKEN=your_token_here \
  -- "$(which bun)" run /absolute/path/to/wallet-mcp/src/index.ts
```

Verify with `claude mcp list` — the server should report `✔ Connected`.

### Running with Node instead of Bun

Bun is the intended runtime, but the server is plain TypeScript with no Bun-specific APIs.
To run it on Node, compile first and point the client at the build output:

```bash
pnpm build
```

```json
{
  "command": "/absolute/path/to/node",
  "args": ["/absolute/path/to/wallet-mcp/dist/index.js"]
}
```

Remember to re-run `pnpm build` after every source change; the Bun setup reads `src/`
directly and needs no build step.

### Manual testing via stdin

```bash
WALLET_API_TOKEN=your_token_here pnpm dev
```

You can also drive a full handshake without a client to confirm the server boots and
registers its tools:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | WALLET_API_TOKEN=your_token_here bun run src/index.ts
```

Note that `pnpm dev` uses `bun --watch`, which is only useful for this kind of manual
stdin testing — MCP clients spawn the server fresh per session, so the watcher has no
effect there.

## Available tools

| Tool | Description |
|------|-------------|
| `list_accounts` | Get all accounts with balances, currencies, and types |
| `list_categories` | Get all spending and income categories with IDs |
| `list_labels` | Get all user-defined labels/tags |
| `search_records` | Search transactions with filters (date, category, payee, amount, etc.) |
| `get_record` | Get full details of a single transaction by ID |
| `get_spending_by_category` | Summarize spending grouped by category for a time period |
| `get_income_vs_expense_summary` | Get total income, expenses, and net cashflow for a period |
| `get_top_payees` | Get merchants where the most money was spent |

## Example prompts

After connecting the server, try asking Claude:

- "What are my account balances?"
- "How much did I spend last month and on what categories?"
- "Show me my last 10 transactions at restaurants"
- "Did I spend more or less than I earned this month?"
- "What are my top 5 biggest expenses this year?"
- "Find all Amazon transactions from last quarter"
- "How has my grocery spending changed between last month and the month before?"
- "What percentage of my spending goes to subscriptions?"

## Rate limiting

The Wallet API allows **500 requests per hour**. Analytics queries (spending summaries, income vs expense, top payees) fetch all matching records and count against this limit proportionally to how many pages of data you have. Each analytics tool can use up to 20 API requests per account queried.

For typical usage, this limit is generous. If you hit it, the server will return a structured error message and the API provides a `rate_limit.warning` hint as you approach the threshold.

## Contributing

```bash
pnpm install
pnpm dev          # Run with Bun file watcher
pnpm build        # Compile TypeScript
pnpm lint         # Run Biome linter/formatter
```

PRs welcome. See [CLAUDE.md](./CLAUDE.md) for architecture decisions before making changes.

## License

MIT
