import { get } from "../client";
import type { Account, WalletRecord } from "../types/api";
import { fetchAllPages } from "../utils/pagination";
import type { Period } from "../utils/period";
import { resolvePeriod } from "../utils/period";

interface RecordsResponse {
	limit: number;
	offset: number;
	nextOffset?: number;
	records: WalletRecord[];
	agentHints?: unknown;
}

interface AccountsResponse {
	limit: number;
	offset: number;
	accounts: Account[];
	agentHints?: unknown;
}

interface AnalyticsDateArgs {
	period?: Period;
	dateFrom?: string;
	dateTo?: string;
	accountId?: string;
}

function resolveDates(args: AnalyticsDateArgs): {
	dateFrom: string;
	dateTo: string;
} {
	if (args.period) {
		return resolvePeriod(args.period);
	}
	if (args.dateFrom || args.dateTo) {
		return {
			dateFrom: args.dateFrom ?? "2000-01-01",
			dateTo: args.dateTo ?? new Date().toISOString().slice(0, 10),
		};
	}
	// Default to this_month
	return resolvePeriod("this_month");
}

async function getAccountIds(accountId?: string): Promise<string[]> {
	if (accountId) return [accountId];

	// Fetch all accounts and return their IDs
	const result = await get<AccountsResponse>("/v1/api/accounts", {
		limit: 100,
	});
	if (!result.ok) return [];
	return result.data.accounts
		.filter((a) => !a.archived && !a.excludeFromStats)
		.map((a) => a.id);
}

async function fetchAllRecords(
	args: AnalyticsDateArgs,
	recordType?: "expense" | "income",
): Promise<WalletRecord[]> {
	const { dateFrom, dateTo } = resolveDates(args);
	const accountIds = await getAccountIds(args.accountId);

	const allRecords: WalletRecord[] = [];

	for (const acctId of accountIds) {
		const params: Record<string, unknown> = {
			accountId: acctId,
			recordDate: [`gte.${dateFrom}`, `lte.${dateTo}`],
			limit: 100,
			sortBy: "-recordDate",
		};

		const records = await fetchAllPages<WalletRecord>(async (offset) => {
			const result = await get<RecordsResponse>("/v1/api/records", {
				...params,
				offset,
			});
			if (!result.ok) {
				return { items: [] };
			}
			return {
				items: result.data.records,
				nextOffset: result.data.nextOffset,
			};
		});

		allRecords.push(...records);
	}

	if (recordType) {
		return allRecords.filter((r) => r.recordType === recordType);
	}
	return allRecords;
}

// --- Tool: get_spending_by_category ---

interface SpendingByCategoryArgs extends AnalyticsDateArgs {}

export async function getSpendingByCategory(args: SpendingByCategoryArgs) {
	const expenses = await fetchAllRecords(args, "expense");

	if (expenses.length === 0) {
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						categories: [],
						message: "No expense records found for the given period.",
					}),
				},
			],
		};
	}

	// Group by categoryId
	const grouped = new Map<
		string,
		{ categoryName: string; total: number; count: number; currency: string }
	>();

	for (const r of expenses) {
		const catId = r.category?.id ?? "uncategorized";
		const catName = r.category?.name ?? "Uncategorized";
		const existing = grouped.get(catId);
		const amount = Math.abs(r.amount.value);

		if (existing) {
			existing.total += amount;
			existing.count++;
		} else {
			grouped.set(catId, {
				categoryName: catName,
				total: amount,
				count: 1,
				currency: r.amount.currencyCode,
			});
		}
	}

	const grandTotal = Array.from(grouped.values()).reduce(
		(sum, g) => sum + g.total,
		0,
	);

	const categories = Array.from(grouped.entries())
		.map(([categoryId, data]) => ({
			categoryId,
			categoryName: data.categoryName,
			total: Math.round(data.total * 100) / 100,
			currency: data.currency,
			transactionCount: data.count,
			percentOfTotal: Math.round((data.total / grandTotal) * 10000) / 100,
		}))
		.sort((a, b) => b.total - a.total);

	const { dateFrom, dateTo } = resolveDates(args);

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({
					categories,
					period: { dateFrom, dateTo },
					totalExpenses: Math.round(grandTotal * 100) / 100,
					totalTransactions: expenses.length,
				}),
			},
		],
	};
}

// --- Tool: get_income_vs_expense_summary ---

interface IncomeVsExpenseArgs extends AnalyticsDateArgs {}

export async function getIncomeVsExpenseSummary(args: IncomeVsExpenseArgs) {
	const allRecords = await fetchAllRecords(args);

	const incomeRecords = allRecords.filter((r) => r.recordType === "income");
	const expenseRecords = allRecords.filter((r) => r.recordType === "expense");

	const totalIncome = incomeRecords.reduce(
		(sum, r) => sum + Math.abs(r.amount.value),
		0,
	);
	const totalExpenses = expenseRecords.reduce(
		(sum, r) => sum + Math.abs(r.amount.value),
		0,
	);

	// Determine primary currency from the most common currency in records
	const currencyCounts = new Map<string, number>();
	for (const r of allRecords) {
		const c = r.amount.currencyCode;
		currencyCounts.set(c, (currencyCounts.get(c) ?? 0) + 1);
	}
	let currency = "USD";
	let maxCount = 0;
	for (const [c, count] of currencyCounts) {
		if (count > maxCount) {
			currency = c;
			maxCount = count;
		}
	}

	const { dateFrom, dateTo } = resolveDates(args);

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({
					totalIncome: Math.round(totalIncome * 100) / 100,
					totalExpenses: Math.round(totalExpenses * 100) / 100,
					netCashflow: Math.round((totalIncome - totalExpenses) * 100) / 100,
					currency,
					period: { dateFrom, dateTo },
					transactionCount: allRecords.length,
				}),
			},
		],
	};
}

// --- Tool: get_top_payees ---

interface TopPayeesArgs extends AnalyticsDateArgs {
	categoryId?: string;
	topN?: number;
}

export async function getTopPayees(args: TopPayeesArgs) {
	const expenses = await fetchAllRecords(args, "expense");

	// Additional client-side filter by categoryId if specified
	const filtered = args.categoryId
		? expenses.filter((r) => r.category?.id === args.categoryId)
		: expenses;

	if (filtered.length === 0) {
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						payees: [],
						message: "No expense records found for the given period.",
					}),
				},
			],
		};
	}

	// Group by payee
	const grouped = new Map<string, { total: number; count: number }>();

	for (const r of filtered) {
		const payee = r.payee || "(no payee)";
		const existing = grouped.get(payee);
		const amount = Math.abs(r.amount.value);

		if (existing) {
			existing.total += amount;
			existing.count++;
		} else {
			grouped.set(payee, { total: amount, count: 1 });
		}
	}

	const grandTotal = Array.from(grouped.values()).reduce(
		(sum, g) => sum + g.total,
		0,
	);

	const topN = args.topN ?? 10;
	const payees = Array.from(grouped.entries())
		.map(([payee, data]) => ({
			payee,
			total: Math.round(data.total * 100) / 100,
			transactionCount: data.count,
			percentOfTotal: Math.round((data.total / grandTotal) * 10000) / 100,
		}))
		.sort((a, b) => b.total - a.total)
		.slice(0, topN);

	const { dateFrom, dateTo } = resolveDates(args);

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({
					payees,
					period: { dateFrom, dateTo },
					totalExpenses: Math.round(grandTotal * 100) / 100,
					totalTransactions: filtered.length,
				}),
			},
		],
	};
}
