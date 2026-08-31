#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateConfig } from "./client";
import { listAccounts } from "./tools/accounts";
import {
	getIncomeVsExpenseSummary,
	getSpendingByCategory,
	getTopPayees,
} from "./tools/analytics";
import { listCategories } from "./tools/categories";
import { listLabels } from "./tools/labels";
import { getRecord, searchRecords } from "./tools/records";
import {
	GetRecordSchema,
	IncomeVsExpenseSchema,
	SearchRecordsSchema,
	SpendingByCategorySchema,
	TopPayeesSchema,
} from "./types/tools";

// Validate API token before starting. The client reports the failure; the
// entry point owns the decision to terminate.
const configError = validateConfig();
if (configError) {
	console.error(`[wallet-mcp] ${configError.message}`);
	process.exit(1);
}

const server = new McpServer({
	name: "wallet-mcp",
	version: "1.0.0",
});

// --- Tier 1: Reference / Lookup ---

server.registerTool(
	"list_accounts",
	{
		description:
			"Get all accounts with their current balances, currencies, and types. Call this first to understand the user's financial structure.",
	},
	async () => listAccounts(),
);

server.registerTool(
	"list_categories",
	{
		description:
			"Get all spending and income categories with their IDs. Call this to resolve a category name to an ID before filtering records by category.",
	},
	async () => listCategories(),
);

server.registerTool(
	"list_labels",
	{
		description:
			"Get all user-defined labels/tags. Call this to resolve a label name to an ID before filtering records by label.",
	},
	async () => listLabels(),
);

// --- Tier 2: Query ---

server.registerTool(
	"search_records",
	{
		description:
			"Search transactions with optional filters. Returns a single page of results. Use for specific lookups, recent transactions, or when the user asks to find particular transactions.",
		inputSchema: SearchRecordsSchema,
	},
	async (args) => searchRecords(args),
);

server.registerTool(
	"get_record",
	{
		description: "Get full details of a single transaction by its ID.",
		inputSchema: GetRecordSchema,
	},
	async (args) => getRecord(args),
);

// --- Tier 3: Analytics ---

server.registerTool(
	"get_spending_by_category",
	{
		description:
			"Summarize total spending grouped by category for a time period. Use this to answer 'where did my money go?' or 'how much did I spend on X?'",
		inputSchema: SpendingByCategorySchema,
	},
	async (args) => getSpendingByCategory(args),
);

server.registerTool(
	"get_income_vs_expense_summary",
	{
		description:
			"Get total income, total expenses, and net cashflow for a period. Use this to answer 'did I save money?', 'what's my cashflow?', 'am I in the red?'",
		inputSchema: IncomeVsExpenseSchema,
	},
	async (args) => getIncomeVsExpenseSummary(args),
);

server.registerTool(
	"get_top_payees",
	{
		description:
			"Get the merchants or payees where the most money was spent in a period. Use this to answer 'what are my biggest expenses?' or 'how much did I spend at X?'",
		inputSchema: TopPayeesSchema,
	},
	async (args) => getTopPayees(args),
);

// Start the server
async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("[wallet-mcp] Server started on stdio transport");
}

main().catch((err) => {
	console.error("[wallet-mcp] Fatal error:", err);
	process.exit(1);
});
