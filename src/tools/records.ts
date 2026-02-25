import { get } from "../client";
import type { WalletRecord } from "../types/api";
import type { Period } from "../utils/period";
import { resolvePeriod } from "../utils/period";

interface RecordsResponse {
	limit: number;
	offset: number;
	nextOffset?: number;
	records: WalletRecord[];
	agentHints?: unknown;
}

interface SearchRecordsArgs {
	period?: Period;
	dateFrom?: string;
	dateTo?: string;
	accountId?: string;
	categoryId?: string;
	labelId?: string;
	type?: "expense" | "income" | "transfer";
	amountMin?: number;
	amountMax?: number;
	payeeSearch?: string;
	noteSearch?: string;
	limit?: number;
	offset?: number;
}

export async function searchRecords(args: SearchRecordsArgs) {
	const params: Record<string, unknown> = {};

	// Resolve dates from period or explicit dates
	if (args.period) {
		const { dateFrom, dateTo } = resolvePeriod(args.period);
		params.recordDate = [`gte.${dateFrom}`, `lte.${dateTo}`];
	} else {
		const dateFilters: string[] = [];
		if (args.dateFrom) dateFilters.push(`gte.${args.dateFrom}`);
		if (args.dateTo) dateFilters.push(`lte.${args.dateTo}`);
		if (dateFilters.length > 0) params.recordDate = dateFilters;
	}

	if (args.accountId) params.accountId = args.accountId;
	if (args.categoryId) params.categoryId = args.categoryId;
	if (args.labelId) params.labelId = args.labelId;

	// Amount filters using range prefix syntax
	const amountFilters: string[] = [];
	if (args.amountMin !== undefined) amountFilters.push(`gte.${args.amountMin}`);
	if (args.amountMax !== undefined) amountFilters.push(`lte.${args.amountMax}`);
	if (amountFilters.length > 0) params.amount = amountFilters;

	// Text search filters
	if (args.payeeSearch) params.payee = `contains-i.${args.payeeSearch}`;
	if (args.noteSearch) params.note = `contains-i.${args.noteSearch}`;

	params.limit = args.limit ?? 30;
	params.offset = args.offset ?? 0;
	params.sortBy = "-recordDate";

	const result = await get<RecordsResponse>("/v1/api/records", params);

	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result.error) }],
		};
	}

	// Filter by type client-side since the API doesn't have a recordType query param filter
	let records = result.data.records;
	if (args.type && args.type !== "transfer") {
		records = records.filter((r) => r.recordType === args.type);
	}

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({
					records,
					pagination: {
						limit: result.data.limit,
						offset: result.data.offset,
						nextOffset: result.data.nextOffset,
					},
					hints: result.hints,
				}),
			},
		],
	};
}

export async function getRecord(args: { id: string }) {
	const result = await get<RecordsResponse>("/v1/api/records/by-id", {
		id: args.id,
	});

	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result.error) }],
		};
	}

	const record = result.data.records?.[0] ?? null;

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({ record, hints: result.hints }),
			},
		],
	};
}
