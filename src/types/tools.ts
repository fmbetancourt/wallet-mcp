import { z } from "zod";

const periodEnum = z.enum([
	"this_month",
	"last_month",
	"last_3_months",
	"this_year",
	"last_year",
]);

export const SearchRecordsSchema = {
	period: periodEnum.optional().describe("Predefined period shortcut"),
	dateFrom: z
		.string()
		.optional()
		.describe("ISO date (YYYY-MM-DD), used when period is not set"),
	dateTo: z
		.string()
		.optional()
		.describe("ISO date (YYYY-MM-DD), used when period is not set"),
	accountId: z.string().optional().describe("Filter by account ID"),
	categoryId: z.string().optional().describe("Filter by category ID"),
	labelId: z.string().optional().describe("Filter by label ID"),
	type: z
		.enum(["expense", "income", "transfer"])
		.optional()
		.describe("Filter by record type"),
	amountMin: z.number().optional().describe("Minimum amount (inclusive)"),
	amountMax: z.number().optional().describe("Maximum amount (inclusive)"),
	payeeSearch: z
		.string()
		.optional()
		.describe("Case-insensitive payee name search"),
	noteSearch: z
		.string()
		.optional()
		.describe("Case-insensitive note text search"),
	limit: z
		.number()
		.max(100)
		.optional()
		.default(30)
		.describe("Results per page (default 30, max 100)"),
	offset: z.number().optional().default(0).describe("Pagination offset"),
};

export const GetRecordSchema = {
	id: z.string().describe("The record ID to retrieve"),
};

export const SpendingByCategorySchema = {
	period: periodEnum
		.optional()
		.describe("Predefined period (defaults to this_month)"),
	dateFrom: z
		.string()
		.optional()
		.describe("ISO date (YYYY-MM-DD), used when period is not set"),
	dateTo: z
		.string()
		.optional()
		.describe("ISO date (YYYY-MM-DD), used when period is not set"),
	accountId: z.string().optional().describe("Filter by account ID"),
};

export const IncomeVsExpenseSchema = {
	period: periodEnum
		.optional()
		.describe("Predefined period (defaults to this_month)"),
	dateFrom: z
		.string()
		.optional()
		.describe("ISO date (YYYY-MM-DD), used when period is not set"),
	dateTo: z
		.string()
		.optional()
		.describe("ISO date (YYYY-MM-DD), used when period is not set"),
	accountId: z.string().optional().describe("Filter by account ID"),
};

export const TopPayeesSchema = {
	period: periodEnum
		.optional()
		.describe("Predefined period (defaults to this_month)"),
	dateFrom: z
		.string()
		.optional()
		.describe("ISO date (YYYY-MM-DD), used when period is not set"),
	dateTo: z
		.string()
		.optional()
		.describe("ISO date (YYYY-MM-DD), used when period is not set"),
	accountId: z.string().optional().describe("Filter by account ID"),
	categoryId: z.string().optional().describe("Filter by category ID"),
	topN: z
		.number()
		.default(10)
		.optional()
		.describe("Number of top payees to return (default 10)"),
};
