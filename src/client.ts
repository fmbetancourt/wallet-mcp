import type { AgentHint, ApiResult, ClientError } from "./types/api";

const API_TOKEN = process.env.WALLET_API_TOKEN;
const API_URL =
	process.env.WALLET_API_URL || "https://rest.budgetbakers.com/wallet";

export function validateConfig(): void {
	if (!API_TOKEN) {
		console.error(
			"[wallet-mcp] WALLET_API_TOKEN is not set. Set it in your environment or Claude Desktop config.",
		);
		process.exit(1);
	}
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
	const url = new URL(`${API_URL}${path}`);

	// Always append agentHints=true
	url.searchParams.set("agentHints", "true");

	if (params) {
		for (const [key, value] of Object.entries(params)) {
			if (value === undefined || value === null) continue;

			// Support array values (multiple values for same key)
			if (Array.isArray(value)) {
				for (const v of value) {
					url.searchParams.append(key, String(v));
				}
			} else {
				url.searchParams.set(key, String(value));
			}
		}
	}

	return url.toString();
}

function mapHttpError(status: number): ClientError {
	switch (status) {
		case 401:
			return {
				error: "auth_failed",
				message: "Invalid or missing API token. Check WALLET_API_TOKEN.",
			};
		case 409:
			return {
				error: "sync_in_progress",
				message: "Wallet is syncing. Retry in a few minutes.",
			};
		case 429:
			return {
				error: "rate_limited",
				message: "Rate limit reached (500 req/hour). Slow down requests.",
			};
		default:
			if (status >= 500) {
				return {
					error: "server_error",
					message: "Wallet API returned an error. Try again later.",
				};
			}
			return {
				error: "request_failed",
				message: `Wallet API returned HTTP ${status}.`,
			};
	}
}

export async function get<T>(
	path: string,
	params?: Record<string, unknown>,
): Promise<ApiResult<T>> {
	const url = buildUrl(path, params);

	let response: Response;
	try {
		response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${API_TOKEN}`,
				Accept: "application/json",
			},
		});
	} catch (err) {
		return {
			ok: false,
			error: {
				error: "network_error",
				message: `Failed to connect to Wallet API: ${err instanceof Error ? err.message : String(err)}`,
			},
		};
	}

	if (!response.ok) {
		return { ok: false, error: mapHttpError(response.status) };
	}

	const body = await response.json();

	// Extract agentHints from the response if present
	const hints: AgentHint[] | null = body.agentHints ?? null;

	return { ok: true, data: body as T, hints };
}
