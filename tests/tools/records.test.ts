import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setSystemTime,
} from "bun:test";
import { getRecord, searchRecords } from "../../src/tools/records";
import { makeRecord, stubFetch } from "../fixtures";

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

function recordsBody(records: ReturnType<typeof makeRecord>[]) {
	return { limit: 30, offset: 0, records };
}

describe("searchRecords", () => {
	it("sends the pagination and sort defaults", async () => {
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			await searchRecords({});
			const url = new URL(stub.calls[0]?.url ?? "");
			expect(url.searchParams.get("limit")).toBe("30");
			expect(url.searchParams.get("offset")).toBe("0");
			expect(url.searchParams.get("sortBy")).toBe("-recordDate");
		} finally {
			stub.restore();
		}
	});

	it("translates a period into a recordDate range", async () => {
		setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			await searchRecords({ period: "this_month" });
			const url = new URL(stub.calls[0]?.url ?? "");
			expect(url.searchParams.getAll("recordDate")).toEqual([
				"gte.2026-03-01",
				"lte.2026-03-15",
			]);
		} finally {
			stub.restore();
			setSystemTime();
		}
	});

	it("uses explicit dates when no period is given", async () => {
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			await searchRecords({ dateFrom: "2026-01-01", dateTo: "2026-01-31" });
			const url = new URL(stub.calls[0]?.url ?? "");
			expect(url.searchParams.getAll("recordDate")).toEqual([
				"gte.2026-01-01",
				"lte.2026-01-31",
			]);
		} finally {
			stub.restore();
		}
	});

	it("omits recordDate entirely when no dates are given", async () => {
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			await searchRecords({});
			const url = new URL(stub.calls[0]?.url ?? "");
			expect(url.searchParams.has("recordDate")).toBe(false);
		} finally {
			stub.restore();
		}
	});

	it("builds range filters for amounts", async () => {
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			await searchRecords({ amountMin: 10, amountMax: 100 });
			const url = new URL(stub.calls[0]?.url ?? "");
			expect(url.searchParams.getAll("amount")).toEqual(["gte.10", "lte.100"]);
		} finally {
			stub.restore();
		}
	});

	it("uses the case-insensitive contains prefix for text search", async () => {
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			await searchRecords({ payeeSearch: "amazon", noteSearch: "gift" });
			const url = new URL(stub.calls[0]?.url ?? "");
			expect(url.searchParams.get("payee")).toBe("contains-i.amazon");
			expect(url.searchParams.get("note")).toBe("contains-i.gift");
		} finally {
			stub.restore();
		}
	});

	it("forwards id filters only when provided", async () => {
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			await searchRecords({ accountId: "acc-1", categoryId: "cat-1" });
			const url = new URL(stub.calls[0]?.url ?? "");
			expect(url.searchParams.get("accountId")).toBe("acc-1");
			expect(url.searchParams.get("categoryId")).toBe("cat-1");
			expect(url.searchParams.has("labelId")).toBe(false);
		} finally {
			stub.restore();
		}
	});

	it("returns the structured error when the request fails", async () => {
		const stub = stubFetch([{ status: 401, body: {} }]);
		try {
			expect(parse(await searchRecords({}))).toEqual({
				error: "auth_failed",
				message: "Invalid or missing API token. Check WALLET_API_TOKEN.",
			});
		} finally {
			stub.restore();
		}
	});

	it("echoes pagination metadata and hints", async () => {
		const stub = stubFetch([
			{
				body: {
					limit: 30,
					offset: 0,
					nextOffset: 30,
					records: [makeRecord()],
					agentHints: [
						{ type: "pagination.has_more", severity: "info", text: "more" },
					],
				},
			},
		]);
		try {
			const payload = parse(await searchRecords({})) as {
				pagination: unknown;
				hints: unknown;
			};
			expect(payload.pagination).toEqual({
				limit: 30,
				offset: 0,
				nextOffset: 30,
			});
			expect(payload.hints).toHaveLength(1);
		} finally {
			stub.restore();
		}
	});

	it("filters expenses out of a mixed page client-side", async () => {
		const stub = stubFetch([
			{
				body: recordsBody([
					makeRecord({ id: "a", recordType: "expense" }),
					makeRecord({ id: "b", recordType: "income" }),
				]),
			},
		]);
		try {
			const payload = parse(await searchRecords({ type: "expense" })) as {
				records: Array<{ id: string }>;
			};
			expect(payload.records.map((r) => r.id)).toEqual(["a"]);
		} finally {
			stub.restore();
		}
	});

	// Sharp edge, pinned deliberately: the type filter runs after the API applied
	// the limit, so a page can come back shorter than the limit it advertises and
	// the model cannot tell truncation from exhaustion.
	it("returns fewer records than the advertised page limit when filtering", async () => {
		const stub = stubFetch([
			{
				body: {
					limit: 30,
					offset: 0,
					nextOffset: 30,
					records: [
						makeRecord({ id: "a", recordType: "expense" }),
						makeRecord({ id: "b", recordType: "income" }),
					],
				},
			},
		]);
		try {
			const payload = parse(await searchRecords({ type: "expense" })) as {
				records: unknown[];
				pagination: { limit: number };
			};
			expect(payload.records).toHaveLength(1);
			expect(payload.pagination.limit).toBe(30);
		} finally {
			stub.restore();
		}
	});

	// DEFECT: "transfer" is offered by the input schema but the handler excludes
	// it from filtering, so the model receives every expense and income instead.
	// Passes while the defect stands; fails once transfers are filtered.
	it.failing("filters to transfers when type is transfer", async () => {
		const stub = stubFetch([
			{
				body: recordsBody([
					makeRecord({ id: "a", recordType: "expense", transferId: "" }),
					makeRecord({ id: "b", recordType: "expense", transferId: "tr-1" }),
				]),
			},
		]);
		try {
			const payload = parse(await searchRecords({ type: "transfer" })) as {
				records: Array<{ id: string }>;
			};
			expect(payload.records.map((r) => r.id)).toEqual(["b"]);
		} finally {
			stub.restore();
		}
	});
});

describe("getRecord", () => {
	it("returns the first record from the by-id lookup", async () => {
		const stub = stubFetch([
			{ body: recordsBody([makeRecord({ id: "rec-9" })]) },
		]);
		try {
			const payload = parse(await getRecord({ id: "rec-9" })) as {
				record: { id: string };
			};
			expect(payload.record.id).toBe("rec-9");
			const url = new URL(stub.calls[0]?.url ?? "");
			expect(url.pathname).toEndWith("/v1/api/records/by-id");
			expect(url.searchParams.get("id")).toBe("rec-9");
		} finally {
			stub.restore();
		}
	});

	it("returns null when the record is not found", async () => {
		const stub = stubFetch([{ body: recordsBody([]) }]);
		try {
			const payload = parse(await getRecord({ id: "missing" })) as {
				record: unknown;
			};
			expect(payload.record).toBeNull();
		} finally {
			stub.restore();
		}
	});

	it("returns the structured error when the request fails", async () => {
		const stub = stubFetch([{ status: 409, body: {} }]);
		try {
			expect(parse(await getRecord({ id: "x" }))).toEqual({
				error: "sync_in_progress",
				message: "Wallet is syncing. Retry in a few minutes.",
			});
		} finally {
			stub.restore();
		}
	});
});
