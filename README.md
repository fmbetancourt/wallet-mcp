# wallet-mcp

A community-built MCP (Model Context Protocol) server for the [BudgetBakers Wallet](https://budgetbakers.com) REST API. It lets you query your personal finances through Claude Desktop (or any MCP-compatible client) using natural language. BudgetBakers is building their own official MCP integration, but it hasn't been released yet — this project fills the gap.

## Prerequisites

- **Node 18+** or **Bun v1.0+**
- **BudgetBakers Wallet Premium** plan
- **API token** — generate one from Settings > API Tokens in the [Wallet web app](https://web.budgetbakers.com)

## Installation

### Option A — Claude Desktop (recommended, zero install)

1. Get your API token from **Settings > API Tokens** in the [Wallet web app](https://web.budgetbakers.com)

2. Open your Claude Desktop config file:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

3. Add the `wallet` server — paste your token directly into the `env` block:

```json
{
  "mcpServers": {
    "wallet": {
      "command": "npx",
      "args": ["-y", "wallet-mcp"],
      "env": {
        "WALLET_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

> **Note:** The token must be set in the `env` field of the config — Claude Desktop does not load `.env` files. This config file is local to your machine and is not shared or committed to any repository.

If you have Bun installed, you can replace `"npx"` with `"bunx"` for faster startup.

4. Restart Claude Desktop. You should see the wallet tools appear in the tools menu.

### Option B — Local development

```bash
git clone https://github.com/lowwave/wallet-mcp.git
cd wallet-mcp
pnpm install
```

Then add it to your Claude Desktop config pointing to the local source:

```json
{
  "mcpServers": {
    "wallet": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/wallet-mcp/src/index.ts"],
      "env": {
        "WALLET_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

Or run standalone for manual testing via stdin:

```bash
WALLET_API_TOKEN=your_token_here pnpm dev
```

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
