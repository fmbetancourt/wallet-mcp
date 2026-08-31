import type { AgentHint, ApiResult, ClientError } from "./types/api";

const DEFAULT_API_URL = "https://rest.budgetbakers.com/wallet";

export interface ClientConfig {
	token: string | undefined;
	baseUrl: string;
}

// Resolved per call rather than captured at module load, so the process
// environment stays the single source of truth and tests can vary it.
export function getConfig(): ClientConfig {
	return {
		token: process.env.WALLET_API_TOKEN,
		baseUrl: process.env.WALLET_API_URL || DEFAULT_API_URL,
	};
}

// Returns the failure instead of exiting: process lifetime belongs to the
// entry point, and an exiting function cannot be tested.
export function validateConfig(): ClientError | null {
	if (!getConfig().token) {
		return {
			error: "config_missing",
			message:
				"WALLET_API_TOKEN is not set. Set it in your environment or Claude Desktop config.",
		};
	}
	return null;
}

export function buildUrl(
	path: string,
	params?: Record<string, unknown>,
): string {
	const url = new URL(`${getConfig().baseUrl}${path}`);

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

export function mapHttpError(status: number): ClientError {
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
				Authorization: `Bearer ${getConfig().token}`,
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

	const body = (await response.json()) as T & {
		agentHints?: AgentHint[] | null;
	};

	// Extract agentHints from the response if present
	const hints: AgentHint[] | null = body.agentHints ?? null;

	return { ok: true, data: body as T, hints };
}
