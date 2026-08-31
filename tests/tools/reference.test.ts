import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { listAccounts } from "../../src/tools/accounts";
import { listCategories } from "../../src/tools/categories";
import { listLabels } from "../../src/tools/labels";
import { makeAccount, stubFetch } from "../fixtures";

let savedToken: string | undefined;

beforeEach(() => {
	savedToken = process.env.WALLET_API_TOKEN;
	process.env.WALLET_API_TOKEN = "test-token";
});

afterEach(() => {
	if (savedToken === undefined) delete process.env.WALLET_API_TOKEN;
	else process.env.WALLET_API_TOKEN = savedToken;
});

function parse(result: { content: Array<{ text: string }> }): unknown {
	const text = result.content[0]?.text;
	if (!text) throw new Error("no content returned");
	return JSON.parse(text);
}

describe("listAccounts", () => {
	it("projects only the fields the model needs", async () => {
		const stub = stubFetch([
			{
				body: {
					limit: 20,
					offset: 0,
					accounts: [
						makeAccount({
							id: "acc-1",
							name: "Checking",
							initialBalance: { currencyCode: "EUR", value: 1250.5 },
						}),
					],
				},
			},
		]);
		try {
			const payload = parse(await listAccounts()) as {
				accounts: Array<Record<string, unknown>>;
			};
			expect(payload.accounts[0]).toEqual({
				id: "acc-1",
				name: "Checking",
				accountType: "CurrentAccount",
				balance: { currencyCode: "EUR", value: 1250.5 },
				archived: false,
				excludeFromStats: false,
			});
		} finally {
			stub.restore();
		}
	});

	it("returns the structured error when the request fails", async () => {
		const stub = stubFetch([{ status: 500, body: {} }]);
		try {
			expect(parse(await listAccounts())).toEqual({
				error: "server_error",
				message: "Wallet API returned an error. Try again later.",
			});
		} finally {
			stub.restore();
		}
	});

	// DEFECT: the accounts endpoint caps a page at 20 regardless of the requested
	// limit, and this handler never follows nextOffset, so accounts past the
	// twentieth are silently dropped. Passes while the defect stands.
	it.failing("drains every page of accounts", async () => {
		const firstPage = Array.from({ length: 20 }, (_, i) =>
			makeAccount({ id: `acc-${i}` }),
		);
		const stub = stubFetch([
			{ body: { limit: 20, offset: 0, nextOffset: 20, accounts: firstPage } },
			{
				body: {
					limit: 20,
					offset: 20,
					accounts: [makeAccount({ id: "acc-20" })],
				},
			},
		]);
		try {
			const payload = parse(await listAccounts()) as { accounts: unknown[] };
			expect(payload.accounts).toHaveLength(21);
		} finally {
			stub.restore();
		}
	});
});

describe("listCategories", () => {
	it("projects the category fields", async () => {
		const stub = stubFetch([
			{
				body: {
					limit: 100,
					offset: 0,
					categories: [
						{
							id: "cat-1",
							name: "Groceries",
							color: "#0f0",
							iconName: "cart",
							enabled: true,
							archived: false,
							customCategory: false,
							customColor: false,
							customName: false,
							cardinality: "expense",
							createdAt: "2026-01-01T00:00:00.000Z",
							updatedAt: "2026-01-01T00:00:00.000Z",
						},
					],
				},
			},
		]);
		try {
			const payload = parse(await listCategories()) as {
				categories: Array<Record<string, unknown>>;
			};
			expect(payload.categories[0]).toEqual({
				id: "cat-1",
				name: "Groceries",
				color: "#0f0",
				iconName: "cart",
				enabled: true,
				archived: false,
				cardinality: "expense",
			});
		} finally {
			stub.restore();
		}
	});

	it("returns the structured error when the request fails", async () => {
		const stub = stubFetch([{ status: 429, body: {} }]);
		try {
			expect((parse(await listCategories()) as { error: string }).error).toBe(
				"rate_limited",
			);
		} finally {
			stub.restore();
		}
	});
});

describe("listLabels", () => {
	it("projects the label fields", async () => {
		const stub = stubFetch([
			{
				body: {
					limit: 100,
					offset: 0,
					labels: [
						{
							id: "lab-1",
							name: "Holiday",
							color: "#f00",
							archived: false,
							createdAt: "2026-01-01T00:00:00.000Z",
							updatedAt: "2026-01-01T00:00:00.000Z",
						},
					],
				},
			},
		]);
		try {
			const payload = parse(await listLabels()) as {
				labels: Array<Record<string, unknown>>;
			};
			expect(payload.labels[0]).toEqual({
				id: "lab-1",
				name: "Holiday",
				color: "#f00",
				archived: false,
			});
		} finally {
			stub.restore();
		}
	});

	it("returns the structured error when the request fails", async () => {
		const stub = stubFetch([{ status: 404, body: {} }]);
		try {
			expect((parse(await listLabels()) as { error: string }).error).toBe(
				"request_failed",
			);
		} finally {
			stub.restore();
		}
	});
});
