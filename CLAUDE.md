# CLAUDE.md — wallet-mcp

## Project overview

wallet-mcp is a community-built MCP (Model Context Protocol) server that wraps the BudgetBakers Wallet REST API. It allows any MCP-compatible client — such as Claude Desktop — to query personal finance data using natural language. The server exposes 8 tools covering account lookups, transaction search, and spending analytics.

The runtime is Bun, the package manager is pnpm, and the project uses TypeScript with ESM modules throughout.

## Architecture decisions

### Why Tier 3 analytics tools auto-paginate while search_records does not

Analytics tools (get_spending_by_category, get_income_vs_expense_summary, get_top_payees) need the complete dataset for a time period to compute accurate totals and percentages. They use `fetchAllPages()` internally to collect all matching records before performing in-memory aggregation.

`search_records` is intentionally single-page and cursor-based. The user typically only needs the first N results for a lookup query. Exposing `offset` and `limit` parameters lets the LLM request additional pages if needed, but avoids the cost of fetching everything upfront.

### Why there is a 20-page hard cap in pagination.ts

The Wallet API rate limit is 500 requests/hour. A single analytics tool call fetching 100 records per page could consume 20 requests for one query. With multiple tool calls in a session (and analytics queries across multiple accounts), runaway pagination could exhaust the quota entirely. The 20-page cap (up to 2000 records per account per query) provides a safety valve. If the cap is hit, a warning is logged to stderr and the partial dataset is used for aggregation.

### Why agentHints=true is always sent

The Wallet API has built-in AI agent support via the `agentHints` query parameter. When set to `true`, the API returns structured hints about pagination status, rate limit proximity, partial matches, and data recency. These hints are surfaced in tool responses so the LLM can reason about them — for example, noticing a `rate_limit.warning` hint and slowing down, or seeing `pagination.has_more` and knowing that results were truncated.

### Why moduleResolution is "bundler" in tsconfig

Bun resolves imports differently from the classic Node16/NodeNext strategy. The `"bundler"` setting matches how Bun (and modern bundlers like esbuild, Vite) resolve modules. This means relative imports don't require explicit `.js` extensions, keeping the source code cleaner. If you switch to `"node16"`, you'd need to add `.js` extensions to every relative import.

### Why all HTTP calls go through client.ts

`client.ts` is the single place that talks to the Wallet API. It handles:
- Authentication (Bearer token from WALLET_API_TOKEN, read per call via `getConfig()`)
- Appending `agentHints=true` to every request
- Structured error handling (401, 409, 429, 5xx mapped to typed error objects)
- Network error wrapping

No tool file constructs fetch calls directly. If the API changes its auth mechanism or error format, `client.ts` is the only file that needs updating.

### Why tool responses are plain JSON, not markdown

The LLM client (Claude Desktop, Cursor, etc.) is responsible for presenting results to the user. Embedding markdown in tool results would double-format the output and could break non-Claude MCP clients. Tool results are returned as `JSON.stringify(data)` in a text content block.

### Why the records endpoint requires accountId

The Wallet API requires `accountId` as a mandatory parameter for the records endpoint. For analytics tools that need data across all accounts, the code first fetches the account list and then queries records for each account individually. This is an API constraint, not a design choice.

## Environment variables

- `WALLET_API_TOKEN` — **Required.** Your BudgetBakers Wallet API token. Obtain from Settings > API Tokens in the Wallet web app. The server will exit with a clear error at startup if this is not set.
- `WALLET_API_URL` — Optional. Defaults to `https://rest.budgetbakers.com/wallet`. Override for testing against a different endpoint.

## Development workflow

```bash
pnpm install       # Install dependencies
pnpm dev           # Run with Bun's file watcher (useful for manual stdin testing)
pnpm build         # Compile TypeScript to dist/ via tsc
pnpm lint          # Run Biome linter and formatter checks
pnpm typecheck     # Type-check src/ and tests/ (tsc -p tsconfig.test.json)
pnpm test          # Run the bun:test suite
pnpm test:coverage # Run the suite with the 80% coverage gate enforced
```

Note: `pnpm dev` uses `bun --watch` which is useful when testing manually via stdin. Claude Desktop spawns the server fresh per session, so the watcher has no effect there.

## Project structure

```
src/
  index.ts            # MCP server entry point, tool registration, stdio transport
  client.ts           # Wallet API HTTP client (auth, agentHints, error handling)
  tools/
    accounts.ts       # list_accounts
    categories.ts     # list_categories
    labels.ts         # list_labels
    records.ts        # search_records, get_record
    analytics.ts      # get_spending_by_category, get_income_vs_expense_summary, get_top_payees
  types/
    api.ts            # TypeScript types derived from the OpenAPI spec
    tools.ts          # Zod schemas for each tool's input parameters
  utils/
    period.ts         # Converts period enum values to ISO date ranges
    pagination.ts     # Auto-paginates until all results collected (for analytics)
    aggregate.ts      # Pure aggregation over fetched records (no I/O)
tests/
  fixtures.ts         # Record/account factories and the global fetch stub
  client.test.ts      # Config, URL building, error mapping, transport
  utils/              # period, pagination, aggregate — held at 100%
  tools/              # Handler orchestration against a stubbed fetch
```

## Adding a new tool

1. Define the Zod input schema in `src/types/tools.ts`
2. Implement the handler function in the appropriate `src/tools/*.ts` file (or create a new one)
3. Register the tool with the MCP server in `src/index.ts` using `server.tool()`
4. Document the tool in `README.md` under "Available tools"
5. Add an example prompt to `README.md` under "Example prompts"

## Rate limiting awareness

The Wallet API allows 500 requests per hour per token. Analytics tools can use up to 20 requests each (one per page, per account). In a typical session, assume a budget of roughly 50 tool calls before the rate limit becomes a concern.

Tools should surface the `rate_limit.warning` agentHint if the API returns one. The LLM can then inform the user and reduce the frequency of requests.

## Key API details

- Base URL: `https://rest.budgetbakers.com/wallet`
- Auth: `Authorization: Bearer <token>`
- Pagination: responses include `limit`, `offset`, `nextOffset` (when more pages exist)
- Filter syntax: text filters use `contains-i.` prefix for case-insensitive search; range filters use `gte.`, `lte.`, etc.
- The API returns 409 during initial data sync after generating a new API key
- Record date filtering has a maximum range of 370 days per request
