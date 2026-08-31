import { describe, expect, it } from "bun:test";
import {
	aggregateByCategory,
	rankPayees,
	summarizeCashflow,
} from "../../src/utils/aggregate";
import { makeRecord } from "../fixtures";

const groceries = { id: "cat-food", name: "Groceries", color: "#0f0" };
const rent = { id: "cat-rent", name: "Rent", color: "#00f" };

describe("aggregateByCategory", () => {
	it("groups records by category and sums absolute amounts", () => {
		const result = aggregateByCategory([
			makeRecord({
				category: groceries,
				amount: { currencyCode: "EUR", value: -30 },
			}),
			makeRecord({
				category: groceries,
				amount: { currencyCode: "EUR", value: -20 },
			}),
			makeRecord({
				category: rent,
				amount: { currencyCode: "EUR", value: -500 },
			}),
		]);

		expect(result.categories).toHaveLength(2);
		expect(result.totalExpenses).toBe(550);
		expect(result.totalTransactions).toBe(3);
		expect(result.categories[0]).toMatchObject({
			categoryId: "cat-rent",
			categoryName: "Rent",
			total: 500,
			transactionCount: 1,
		});
		expect(result.categories[1]).toMatchObject({
			categoryId: "cat-food",
			total: 50,
			transactionCount: 2,
		});
	});

	it("sorts categories by total descending", () => {
		const result = aggregateByCategory([
			makeRecord({
				category: groceries,
				amount: { currencyCode: "EUR", value: -10 },
			}),
			makeRecord({
				category: rent,
				amount: { currencyCode: "EUR", value: -900 },
			}),
		]);

		expect(result.categories.map((c) => c.categoryId)).toEqual([
			"cat-rent",
			"cat-food",
		]);
	});

	it("falls back to an uncategorized bucket when category is null", () => {
		const result = aggregateByCategory([
			makeRecord({
				category: null,
				amount: { currencyCode: "EUR", value: -25 },
			}),
		]);

		expect(result.categories[0]).toMatchObject({
			categoryId: "uncategorized",
			categoryName: "Uncategorized",
			total: 25,
			percentOfTotal: 100,
		});
	});

	it("computes percentages that add up to the whole", () => {
		const result = aggregateByCategory([
			makeRecord({
				category: groceries,
				amount: { currencyCode: "EUR", value: -25 },
			}),
			makeRecord({
				category: rent,
				amount: { currencyCode: "EUR", value: -75 },
			}),
		]);

		expect(result.categories.map((c) => c.percentOfTotal)).toEqual([75, 25]);
	});

	it("rounds money to two decimals", () => {
		const result = aggregateByCategory([
			makeRecord({
				category: groceries,
				amount: { currencyCode: "EUR", value: -0.1 },
			}),
			makeRecord({
				category: groceries,
				amount: { currencyCode: "EUR", value: -0.2 },
			}),
		]);

		expect(result.categories[0]?.total).toBe(0.3);
		expect(result.totalExpenses).toBe(0.3);
	});

	it("carries the currency of the first record seen in each group", () => {
		const result = aggregateByCategory([
			makeRecord({
				category: groceries,
				amount: { currencyCode: "USD", value: -5 },
			}),
		]);

		expect(result.categories[0]?.currency).toBe("USD");
	});

	it("returns an empty breakdown for an empty record set", () => {
		expect(aggregateByCategory([])).toEqual({
			categories: [],
			totalExpenses: 0,
			totalTransactions: 0,
		});
	});

	// DEFECT: with a zero grand total the percentage divides by zero and yields
	// NaN, which JSON.stringify emits as null to the model. Expected: 0.
	// This test passes while the defect stands and fails once it is fixed.
	it.failing("reports 0% instead of NaN when every amount is zero", () => {
		const result = aggregateByCategory([
			makeRecord({
				category: groceries,
				amount: { currencyCode: "EUR", value: 0 },
			}),
		]);

		expect(result.categories[0]?.percentOfTotal).toBe(0);
	});
});

describe("summarizeCashflow", () => {
	it("splits income from expenses and nets them", () => {
		const result = summarizeCashflow([
			makeRecord({
				recordType: "income",
				amount: { currencyCode: "EUR", value: 2000 },
			}),
			makeRecord({
				recordType: "expense",
				amount: { currencyCode: "EUR", value: -750 },
			}),
			makeRecord({
				recordType: "expense",
				amount: { currencyCode: "EUR", value: -250 },
			}),
		]);

		expect(result).toEqual({
			totalIncome: 2000,
			totalExpenses: 1000,
			netCashflow: 1000,
			currency: "EUR",
			transactionCount: 3,
		});
	});

	it("reports a negative net cashflow when spending exceeds income", () => {
		const result = summarizeCashflow([
			makeRecord({
				recordType: "income",
				amount: { currencyCode: "EUR", value: 100 },
			}),
			makeRecord({
				recordType: "expense",
				amount: { currencyCode: "EUR", value: -250 },
			}),
		]);

		expect(result.netCashflow).toBe(-150);
	});

	it("falls back to USD for an empty record set", () => {
		expect(summarizeCashflow([])).toEqual({
			totalIncome: 0,
			totalExpenses: 0,
			netCashflow: 0,
			currency: "USD",
			transactionCount: 0,
		});
	});

	it("reports the most frequent currency in a mixed set", () => {
		const result = summarizeCashflow([
			makeRecord({ amount: { currencyCode: "EUR", value: -1 } }),
			makeRecord({ amount: { currencyCode: "EUR", value: -1 } }),
			makeRecord({ amount: { currencyCode: "USD", value: -1 } }),
		]);

		expect(result.currency).toBe("EUR");
	});

	it("rounds accumulated totals to two decimals", () => {
		const result = summarizeCashflow([
			makeRecord({
				recordType: "income",
				amount: { currencyCode: "EUR", value: 0.1 },
			}),
			makeRecord({
				recordType: "income",
				amount: { currencyCode: "EUR", value: 0.2 },
			}),
		]);

		expect(result.totalIncome).toBe(0.3);
	});
});

describe("rankPayees", () => {
	const spend = (payee: string, value: number) =>
		makeRecord({ payee, amount: { currencyCode: "EUR", value } });

	it("groups by payee and sorts by total descending", () => {
		const result = rankPayees(
			[spend("Mercadona", -40), spend("Amazon", -100), spend("Mercadona", -60)],
			10,
		);

		expect(result.payees).toEqual([
			{
				payee: "Mercadona",
				total: 100,
				transactionCount: 2,
				percentOfTotal: 50,
			},
			{ payee: "Amazon", total: 100, transactionCount: 1, percentOfTotal: 50 },
		]);
		expect(result.totalExpenses).toBe(200);
		expect(result.totalTransactions).toBe(3);
	});

	it("labels records with a blank payee", () => {
		const result = rankPayees([spend("", -10)], 10);
		expect(result.payees[0]?.payee).toBe("(no payee)");
	});

	it("truncates to topN while keeping totals over the whole set", () => {
		const result = rankPayees(
			[spend("A", -50), spend("B", -30), spend("C", -20)],
			2,
		);

		expect(result.payees.map((p) => p.payee)).toEqual(["A", "B"]);
		// Percentages stay relative to the full 100, not to the visible 80.
		expect(result.payees.map((p) => p.percentOfTotal)).toEqual([50, 30]);
		expect(result.totalExpenses).toBe(100);
		expect(result.totalTransactions).toBe(3);
	});

	it("returns every payee when topN exceeds the group count", () => {
		const result = rankPayees([spend("A", -1), spend("B", -1)], 99);
		expect(result.payees).toHaveLength(2);
	});

	it("returns an empty ranking for an empty record set", () => {
		expect(rankPayees([], 10)).toEqual({
			payees: [],
			totalExpenses: 0,
			totalTransactions: 0,
		});
	});
});
