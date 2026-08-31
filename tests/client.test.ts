import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	buildUrl,
	get,
	getConfig,
	mapHttpError,
	validateConfig,
} from "../src/client";
import type { AgentHint } from "../src/types/api";
import { stubFetch } from "./fixtures";

const DEFAULT_URL = "https://rest.budgetbakers.com/wallet";

let savedToken: string | undefined;
let savedUrl: string | undefined;

beforeEach(() => {
	savedToken = process.env.WALLET_API_TOKEN;
	savedUrl = process.env.WALLET_API_URL;
	process.env.WALLET_API_TOKEN = "test-token";
	delete process.env.WALLET_API_URL;
});

afterEach(() => {
	if (savedToken === undefined) delete process.env.WALLET_API_TOKEN;
	else process.env.WALLET_API_TOKEN = savedToken;
	if (savedUrl === undefined) delete process.env.WALLET_API_URL;
	else process.env.WALLET_API_URL = savedUrl;
});

describe("getConfig", () => {
	it("falls back to the production base URL", () => {
		expect(getConfig()).toEqual({ token: "test-token", baseUrl: DEFAULT_URL });
	});

	it("honours WALLET_API_URL", () => {
		process.env.WALLET_API_URL = "https://staging.example.com/wallet";
		expect(getConfig().baseUrl).toBe("https://staging.example.com/wallet");
	});

	it("reflects the environment at call time, not at import time", () => {
		process.env.WALLET_API_TOKEN = "rotated";
		expect(getConfig().token).toBe("rotated");
	});

	it("reports an absent token as undefined", () => {
		delete process.env.WALLET_API_TOKEN;
		expect(getConfig().token).toBeUndefined();
	});
});

describe("validateConfig", () => {
	it("returns null when a token is present", () => {
		expect(validateConfig()).toBeNull();
	});

	it("returns a structured error when the token is missing", () => {
		delete process.env.WALLET_API_TOKEN;
		expect(validateConfig()).toEqual({
			error: "config_missing",
			message:
				"WALLET_API_TOKEN is not set. Set it in your environment or Claude Desktop config.",
		});
	});

	it("treats an empty token as missing", () => {
		process.env.WALLET_API_TOKEN = "";
		expect(validateConfig()?.error).toBe("config_missing");
	});
});

describe("buildUrl", () => {
	it("always requests agent hints", () => {
		expect(buildUrl("/v1/api/accounts")).toBe(
			`${DEFAULT_URL}/v1/api/accounts?agentHints=true`,
		);
	});

	it("skips undefined and null parameters", () => {
		const url = new URL(
			buildUrl("/v1/api/records", { a: undefined, b: null, c: "kept" }),
		);
		expect(url.searchParams.has("a")).toBe(false);
		expect(url.searchParams.has("b")).toBe(false);
		expect(url.searchParams.get("c")).toBe("kept");
	});

	it("repeats a key for each element of an array parameter", () => {
		const url = new URL(
			buildUrl("/v1/api/records", {
				recordDate: ["gte.2026-01-01", "lte.2026-03-31"],
			}),
		);
		expect(url.searchParams.getAll("recordDate")).toEqual([
			"gte.2026-01-01",
			"lte.2026-03-31",
		]);
	});

	it("stringifies non-string scalars", () => {
		const url = new URL(
			buildUrl("/v1/api/records", { limit: 100, deep: false }),
		);
		expect(url.searchParams.get("limit")).toBe("100");
		expect(url.searchParams.get("deep")).toBe("false");
	});

	it("builds against the configured base URL", () => {
		process.env.WALLET_API_URL = "https://staging.example.com/wallet";
		expect(buildUrl("/v1/api/labels")).toStartWith(
			"https://staging.example.com/wallet/v1/api/labels",
		);
	});
});

describe("mapHttpError", () => {
	it("maps 401 to auth_failed", () => {
		expect(mapHttpError(401).error).toBe("auth_failed");
	});

	it("maps 409 to sync_in_progress", () => {
		expect(mapHttpError(409).error).toBe("sync_in_progress");
	});

	it("maps 429 to rate_limited", () => {
		expect(mapHttpError(429)).toEqual({
			error: "rate_limited",
			message: "Rate limit reached (500 req/hour). Slow down requests.",
		});
	});

	it("maps 500 and 503 to server_error", () => {
		expect(mapHttpError(500).error).toBe("server_error");
		expect(mapHttpError(503).error).toBe("server_error");
	});

	it("maps other 4xx codes to request_failed and echoes the status", () => {
		expect(mapHttpError(404)).toEqual({
			error: "request_failed",
			message: "Wallet API returned HTTP 404.",
		});
		expect(mapHttpError(400).error).toBe("request_failed");
	});
});

describe("get", () => {
	it("returns the parsed body with null hints when none are present", async () => {
		const stub = stubFetch([{ body: { accounts: [] } }]);
		try {
			const result = await get<{ accounts: unknown[] }>("/v1/api/accounts");
			expect(result).toEqual({ ok: true, data: { accounts: [] }, hints: null });
		} finally {
			stub.restore();
		}
	});

	it("surfaces agentHints verbatim", async () => {
		const hint: AgentHint = {
			type: "rate_limit.warning",
			severity: "warning",
			text: "Approaching the hourly limit",
		};
		const stub = stubFetch([{ body: { records: [], agentHints: [hint] } }]);
		try {
			const result = await get("/v1/api/records");
			expect(result.ok).toBe(true);
			if (result.ok) expect(result.hints).toEqual([hint]);
		} finally {
			stub.restore();
		}
	});

	it("sends the bearer token and accepts JSON", async () => {
		const stub = stubFetch([{ body: {} }]);
		try {
			await get("/v1/api/accounts");
			const headers = stub.calls[0]?.init?.headers as Record<string, string>;
			expect(headers.Authorization).toBe("Bearer test-token");
			expect(headers.Accept).toBe("application/json");
		} finally {
			stub.restore();
		}
	});

	it("forwards query parameters to the request URL", async () => {
		const stub = stubFetch([{ body: {} }]);
		try {
			await get("/v1/api/records", { accountId: "acc-1", limit: 100 });
			const url = new URL(stub.calls[0]?.url ?? "");
			expect(url.searchParams.get("accountId")).toBe("acc-1");
			expect(url.searchParams.get("limit")).toBe("100");
			expect(url.searchParams.get("agentHints")).toBe("true");
		} finally {
			stub.restore();
		}
	});

	it("maps a non-ok response to a structured error", async () => {
		const stub = stubFetch([{ status: 429, body: {} }]);
		try {
			const result = await get("/v1/api/records");
			expect(result).toEqual({
				ok: false,
				error: {
					error: "rate_limited",
					message: "Rate limit reached (500 req/hour). Slow down requests.",
				},
			});
		} finally {
			stub.restore();
		}
	});

	it("wraps a thrown Error as network_error", async () => {
		const stub = stubFetch([{ throws: new Error("ECONNREFUSED") }]);
		try {
			const result = await get("/v1/api/records");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.error).toBe("network_error");
				expect(result.error.message).toContain("ECONNREFUSED");
			}
		} finally {
			stub.restore();
		}
	});

	it("wraps a thrown non-Error value as network_error", async () => {
		const stub = stubFetch([{ throws: "socket hang up" }]);
		try {
			const result = await get("/v1/api/records");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toContain("socket hang up");
			}
		} finally {
			stub.restore();
		}
	});
});
