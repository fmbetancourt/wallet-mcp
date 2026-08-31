import type { Account, WalletRecord } from "../src/types/api";

// Factories keep each test focused on the one or two fields it actually
// exercises, instead of restating the full API shape every time.

export function makeRecord(
	overrides: Partial<WalletRecord> = {},
): WalletRecord {
	return {
		id: "rec-1",
		accountId: "acc-1",
		recordType: "expense",
		recordState: "cleared",
		recordDate: "2026-03-10",
		amount: { currencyCode: "EUR", value: -10 },
		baseAmount: { currencyCode: "EUR", value: -10 },
		paymentType: "cash",
		payee: "",
		payer: "",
		note: "",
		category: null,
		labels: [],
		contactId: "",
		transferAccountId: "",
		transferId: "",
		latitude: 0,
		longitude: 0,
		photos: [],
		createdAt: "2026-03-10T00:00:00.000Z",
		updatedAt: "2026-03-10T00:00:00.000Z",
		...overrides,
	};
}

export function makeAccount(overrides: Partial<Account> = {}): Account {
	return {
		id: "acc-1",
		name: "Checking",
		accountType: "CurrentAccount",
		bankAccountNumber: "",
		color: "#000000",
		archived: false,
		excludeFromStats: false,
		initialBalance: { currencyCode: "EUR", value: 0 },
		initialBaseBalance: { currencyCode: "EUR", value: 0 },
		recordStats: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

export interface StubbedCall {
	url: string;
	init?: RequestInit;
}

/**
 * Replaces global fetch with a queue of canned responses and records every
 * call. Returns the recorded calls plus a restore function.
 */
export function stubFetch(
	responses: Array<{ status?: number; body?: unknown; throws?: unknown }>,
): { calls: StubbedCall[]; restore: () => void } {
	const original = globalThis.fetch;
	const calls: StubbedCall[] = [];
	let index = 0;

	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		calls.push({ url: String(input), init });
		// The last entry repeats, so pagination caps can be exercised without
		// enumerating twenty identical responses.
		const spec = responses[Math.min(index, responses.length - 1)];
		index++;
		if (!spec) throw new Error("stubFetch: no response configured");
		if ("throws" in spec && spec.throws !== undefined) throw spec.throws;
		const status = spec.status ?? 200;
		return new Response(JSON.stringify(spec.body ?? {}), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof globalThis.fetch;

	return {
		calls,
		restore: () => {
			globalThis.fetch = original;
		},
	};
}
