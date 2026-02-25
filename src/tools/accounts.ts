import { get } from "../client";
import type { Account } from "../types/api";

interface AccountsResponse {
	limit: number;
	offset: number;
	nextOffset?: number;
	accounts: Account[];
	agentHints?: unknown;
}

export async function listAccounts() {
	const result = await get<AccountsResponse>("/v1/api/accounts", {
		limit: 100,
	});

	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result.error) }],
		};
	}

	const accounts = result.data.accounts.map((a) => ({
		id: a.id,
		name: a.name,
		accountType: a.accountType,
		balance: a.initialBalance,
		archived: a.archived,
		excludeFromStats: a.excludeFromStats,
	}));

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({ accounts, hints: result.hints }),
			},
		],
	};
}
