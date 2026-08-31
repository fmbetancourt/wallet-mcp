import { get } from "../client";
import type { Account, WalletRecord } from "../types/api";
import {
	aggregateByCategory,
	rankPayees,
	summarizeCashflow,
} from "../utils/aggregate";
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

type SpendingByCategoryArgs = AnalyticsDateArgs;

type IncomeVsExpenseArgs = AnalyticsDateArgs;

interface TopPayeesArgs extends AnalyticsDateArgs {
	categoryId?: string;
	topN?: number;
}

interface DateRange {
	dateFrom: string;
	dateTo: string;
}

export function resolveDates(args: AnalyticsDateArgs): DateRange {
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

function jsonContent(payload: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(payload) }],
	};
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

export async function getSpendingByCategory(args: SpendingByCategoryArgs) {
	const expenses = await fetchAllRecords(args, "expense");

	if (expenses.length === 0) {
		return jsonContent({
			categories: [],
			message: "No expense records found for the given period.",
		});
	}

	const { categories, totalExpenses, totalTransactions } =
		aggregateByCategory(expenses);

	return jsonContent({
		categories,
		period: resolveDates(args),
		totalExpenses,
		totalTransactions,
	});
}

// --- Tool: get_income_vs_expense_summary ---

export async function getIncomeVsExpenseSummary(args: IncomeVsExpenseArgs) {
	const allRecords = await fetchAllRecords(args);
	const summary = summarizeCashflow(allRecords);

	return jsonContent({
		totalIncome: summary.totalIncome,
		totalExpenses: summary.totalExpenses,
		netCashflow: summary.netCashflow,
		currency: summary.currency,
		period: resolveDates(args),
		transactionCount: summary.transactionCount,
	});
}

// --- Tool: get_top_payees ---

export async function getTopPayees(args: TopPayeesArgs) {
	const expenses = await fetchAllRecords(args, "expense");

	// Additional client-side filter by categoryId if specified
	const filtered = args.categoryId
		? expenses.filter((r) => r.category?.id === args.categoryId)
		: expenses;

	if (filtered.length === 0) {
		return jsonContent({
			payees: [],
			message: "No expense records found for the given period.",
		});
	}

	const { payees, totalExpenses, totalTransactions } = rankPayees(
		filtered,
		args.topN ?? 10,
	);

	return jsonContent({
		payees,
		period: resolveDates(args),
		totalExpenses,
		totalTransactions,
	});
}
