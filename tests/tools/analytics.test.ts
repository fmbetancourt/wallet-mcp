import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setSystemTime,
} from "bun:test";
import {
	getIncomeVsExpenseSummary,
	getSpendingByCategory,
	getTopPayees,
	resolveDates,
} from "../../src/tools/analytics";
import { makeAccount, makeRecord, stubFetch } from "../fixtures";

let savedToken: string | undefined;

beforeEach(() => {
	savedToken = process.env.WALLET_API_TOKEN;
	process.env.WALLET_API_TOKEN = "test-token";
});

afterEach(() => {
	if (savedToken === undefined) delete process.env.WALLET_API_TOKEN;
	else process.env.WALLET_API_TOKEN = savedToken;
});

afterAll(() => {
	setSystemTime();
});

function parse(result: { content: Array<{ text: string }> }): unknown {
	const text = result.content[0]?.text;
	if (!text) throw new Error("no content returned");
	return JSON.parse(text);
}

function accountsBody(accounts: ReturnType<typeof makeAccount>[]) {
	return { limit: 20, offset: 0, accounts };
}

function recordsBody(records: ReturnType<typeof makeRecord>[]) {
	return { limit: 100, offset: 0, records };
}

const groceries = { id: "cat-food", name: "Groceries", color: "#0f0" };

describe("resolveDates", () => {
	it("prefers an explicit period over anything else", () => {
		setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
		expect(
			resolveDates({ period: "this_month", dateFrom: "1999-01-01" }),
		).toEqual({
			dateFrom: "2026-03-01",
			dateTo: "2026-03-15",
		});
		setSystemTime();
	});

	it("uses both explicit dates when given", () => {
		expect(
			resolveDates({ dateFrom: "2026-01-01", dateTo: "2026-01-31" }),
		).toEqual({
			dateFrom: "2026-01-01",
			dateTo: "2026-01-31",
		});
	});

	it("defaults dateFrom to the epoch floor when only dateTo is given", () => {
		expect(resolveDates({ dateTo: "2026-01-31" }).dateFrom).toBe("2000-01-01");
	});

	it("defaults dateTo to today when only dateFrom is given", () => {
		const range = resolveDates({ dateFrom: "2026-01-01" });
		expect(range.dateFrom).toBe("2026-01-01");
		expect(range.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("falls back to this_month when nothing is given", () => {
		setSystemTime(new Date(2026, 5, 10, 12, 0, 0));
		expect(resolveDates({})).toEqual({
			dateFrom: "2026-06-01",
			dateTo: "2026-06-10",
		});
		setSystemTime();
	});
});

describe("getSpendingByCategory", () => {
	it("skips the accounts lookup when an accountId is given", async () => {
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			await getSpendingByCategory({ accountId: "acc-1" });
			expect(stub.calls).toHaveLength(1);
			expect(stub.calls[0]?.url).toContain("/v1/api/records");
		} finally {
			stub.restore();
		}
	});

	it("reports an empty result without aggregating", async () => {
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			expect(
				parse(await getSpendingByCategory({ accountId: "acc-1" })),
			).toEqual({
				categories: [],
				message: "No expense records found for the given period.",
			});
		} finally {
			stub.restore();
		}
	});

	it("aggregates expenses and reports the resolved period", async () => {
		const stub = stubFetch([
			{
				body: recordsBody([
					makeRecord({
						recordType: "expense",
						category: groceries,
						amount: { currencyCode: "EUR", value: -40 },
					}),
					makeRecord({
						recordType: "income",
						amount: { currencyCode: "EUR", value: 1000 },
					}),
				]),
			},
		]);
		try {
			const payload = parse(
				await getSpendingByCategory({
					accountId: "acc-1",
					dateFrom: "2026-03-01",
					dateTo: "2026-03-31",
				}),
			) as {
				categories: Array<{ categoryId: string; total: number }>;
				period: unknown;
				totalExpenses: number;
				totalTransactions: number;
			};

			// Income is excluded before aggregation.
			expect(payload.categories).toHaveLength(1);
			expect(payload.categories[0]?.total).toBe(40);
			expect(payload.totalExpenses).toBe(40);
			expect(payload.totalTransactions).toBe(1);
			expect(payload.period).toEqual({
				dateFrom: "2026-03-01",
				dateTo: "2026-03-31",
			});
		} finally {
			stub.restore();
		}
	});

	it("queries every active account when no accountId is given", async () => {
		const stub = stubFetch([
			{
				body: accountsBody([
					makeAccount({ id: "acc-1" }),
					makeAccount({ id: "acc-2" }),
					makeAccount({ id: "acc-archived", archived: true }),
					makeAccount({ id: "acc-excluded", excludeFromStats: true }),
				]),
			},
			{ body: recordsBody([]) },
		]);
		try {
			await getSpendingByCategory({});
			const recordCalls = stub.calls.filter((c) => c.url.includes("/records"));
			const queried = recordCalls.map((c) =>
				new URL(c.url).searchParams.get("accountId"),
			);
			// Archived and excluded accounts never reach the records endpoint.
			expect(queried).toEqual(["acc-1", "acc-2"]);
		} finally {
			stub.restore();
		}
	});

	it("yields an empty result when the accounts lookup fails", async () => {
		const stub = stubFetch([{ status: 401, body: {} }]);
		try {
			const payload = parse(await getSpendingByCategory({})) as {
				categories: unknown[];
			};
			expect(payload.categories).toEqual([]);
			expect(stub.calls).toHaveLength(1);
		} finally {
			stub.restore();
		}
	});
});

describe("getIncomeVsExpenseSummary", () => {
	it("summarises income against expenses for the period", async () => {
		const stub = stubFetch([
			{
				body: recordsBody([
					makeRecord({
						recordType: "income",
						amount: { currencyCode: "EUR", value: 2000 },
					}),
					makeRecord({
						recordType: "expense",
						amount: { currencyCode: "EUR", value: -1200 },
					}),
				]),
			},
		]);
		try {
			expect(
				parse(
					await getIncomeVsExpenseSummary({
						accountId: "acc-1",
						dateFrom: "2026-03-01",
						dateTo: "2026-03-31",
					}),
				),
			).toEqual({
				totalIncome: 2000,
				totalExpenses: 1200,
				netCashflow: 800,
				currency: "EUR",
				period: { dateFrom: "2026-03-01", dateTo: "2026-03-31" },
				transactionCount: 2,
			});
		} finally {
			stub.restore();
		}
	});
});

describe("getTopPayees", () => {
	it("ranks payees and honours topN", async () => {
		const stub = stubFetch([
			{
				body: recordsBody([
					makeRecord({
						recordType: "expense",
						payee: "Amazon",
						amount: { currencyCode: "EUR", value: -100 },
					}),
					makeRecord({
						recordType: "expense",
						payee: "Mercadona",
						amount: { currencyCode: "EUR", value: -60 },
					}),
					makeRecord({
						recordType: "expense",
						payee: "Netflix",
						amount: { currencyCode: "EUR", value: -10 },
					}),
				]),
			},
		]);
		try {
			const payload = parse(
				await getTopPayees({ accountId: "acc-1", topN: 2 }),
			) as { payees: Array<{ payee: string }>; totalTransactions: number };

			expect(payload.payees.map((p) => p.payee)).toEqual([
				"Amazon",
				"Mercadona",
			]);
			expect(payload.totalTransactions).toBe(3);
		} finally {
			stub.restore();
		}
	});

	it("reports an empty result when the category filter matches nothing", async () => {
		const stub = stubFetch([
			{
				body: recordsBody([
					makeRecord({
						recordType: "expense",
						payee: "Amazon",
						category: groceries,
					}),
				]),
			},
		]);
		try {
			expect(
				parse(
					await getTopPayees({ accountId: "acc-1", categoryId: "cat-other" }),
				),
			).toEqual({
				payees: [],
				message: "No expense records found for the given period.",
			});
		} finally {
			stub.restore();
		}
	});

	// DEFECT: categoryId is filtered in memory after every page has been fetched,
	// even though the records endpoint accepts it as a query parameter. That
	// spends the full request budget on data that is then discarded, and the
	// 20-page cap can truncate the set before the filter ever runs.
	// Passes while the defect stands.
	it.failing("pushes the category filter down to the API", async () => {
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			await getTopPayees({ accountId: "acc-1", categoryId: "cat-food" });
			const url = new URL(stub.calls[0]?.url ?? "");
			expect(url.searchParams.get("categoryId")).toBe("cat-food");
		} finally {
			stub.restore();
		}
	});
});
