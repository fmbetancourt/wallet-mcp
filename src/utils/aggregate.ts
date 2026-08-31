import type { WalletRecord } from "../types/api";

// Pure aggregation over an already-fetched record set. No I/O lives here, so
// the money math is testable without stubbing the network.

export interface CategoryBreakdown {
	categoryId: string;
	categoryName: string;
	total: number;
	currency: string;
	transactionCount: number;
	percentOfTotal: number;
}

export interface CategoryAggregate {
	categories: CategoryBreakdown[];
	totalExpenses: number;
	totalTransactions: number;
}

export interface CashflowSummary {
	totalIncome: number;
	totalExpenses: number;
	netCashflow: number;
	currency: string;
	transactionCount: number;
}

export interface PayeeBreakdown {
	payee: string;
	total: number;
	transactionCount: number;
	percentOfTotal: number;
}

export interface PayeeAggregate {
	payees: PayeeBreakdown[];
	totalExpenses: number;
	totalTransactions: number;
}

const UNCATEGORIZED_ID = "uncategorized";
const UNCATEGORIZED_NAME = "Uncategorized";
const NO_PAYEE = "(no payee)";
const FALLBACK_CURRENCY = "USD";

// Amounts are money: round to cents at the boundary, never mid-accumulation.
function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function percentOf(part: number, whole: number): number {
	return Math.round((part / whole) * 10000) / 100;
}

export function aggregateByCategory(
	expenses: WalletRecord[],
): CategoryAggregate {
	const grouped = new Map<
		string,
		{ categoryName: string; total: number; count: number; currency: string }
	>();

	for (const r of expenses) {
		const catId = r.category?.id ?? UNCATEGORIZED_ID;
		const catName = r.category?.name ?? UNCATEGORIZED_NAME;
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
			total: round2(data.total),
			currency: data.currency,
			transactionCount: data.count,
			percentOfTotal: percentOf(data.total, grandTotal),
		}))
		.sort((a, b) => b.total - a.total);

	return {
		categories,
		totalExpenses: round2(grandTotal),
		totalTransactions: expenses.length,
	};
}

export function summarizeCashflow(records: WalletRecord[]): CashflowSummary {
	let totalIncome = 0;
	let totalExpenses = 0;

	// Currency is the most frequent one across the set; mixed-currency sets
	// therefore report a single label over summed raw values.
	const currencyCounts = new Map<string, number>();

	for (const r of records) {
		const amount = Math.abs(r.amount.value);
		if (r.recordType === "income") {
			totalIncome += amount;
		} else if (r.recordType === "expense") {
			totalExpenses += amount;
		}

		const code = r.amount.currencyCode;
		currencyCounts.set(code, (currencyCounts.get(code) ?? 0) + 1);
	}

	let currency = FALLBACK_CURRENCY;
	let maxCount = 0;
	for (const [code, count] of currencyCounts) {
		if (count > maxCount) {
			currency = code;
			maxCount = count;
		}
	}

	return {
		totalIncome: round2(totalIncome),
		totalExpenses: round2(totalExpenses),
		netCashflow: round2(totalIncome - totalExpenses),
		currency,
		transactionCount: records.length,
	};
}

export function rankPayees(
	expenses: WalletRecord[],
	topN: number,
): PayeeAggregate {
	const grouped = new Map<string, { total: number; count: number }>();

	for (const r of expenses) {
		const payee = r.payee || NO_PAYEE;
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

	// Percentages are relative to the whole set, not to the truncated top N.
	const payees = Array.from(grouped.entries())
		.map(([payee, data]) => ({
			payee,
			total: round2(data.total),
			transactionCount: data.count,
			percentOfTotal: percentOf(data.total, grandTotal),
		}))
		.sort((a, b) => b.total - a.total)
		.slice(0, topN);

	return {
		payees,
		totalExpenses: round2(grandTotal),
		totalTransactions: expenses.length,
	};
}
