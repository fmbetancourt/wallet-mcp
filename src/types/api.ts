// TypeScript types derived from the BudgetBakers Wallet REST API OpenAPI spec.
// Field names match the API exactly — do not rename.

export type AccountType =
	| "General"
	| "Cash"
	| "CurrentAccount"
	| "CreditCard"
	| "SavingAccount"
	| "Bonus"
	| "Insurance"
	| "Investment"
	| "Loan"
	| "Mortgage"
	| "Overdraft";

export type RecordType = "income" | "expense";

export type RecordState =
	| "reconciled"
	| "cleared"
	| "uncleared"
	| "void"
	| "waitForAssign";

export type PaymentType =
	| "cash"
	| "debit_card"
	| "credit_card"
	| "transfer"
	| "voucher"
	| "mobile_payment"
	| "web_payment";

export type AgentHintType =
	| "pagination.has_more"
	| "result.partial_match"
	| "result.empty"
	| "param.inferred"
	| "rate_limit.warning"
	| "data.recency";

export type AgentHintSeverity = "info" | "warning" | "instruction";

export interface AgentHint {
	type: AgentHintType;
	severity: AgentHintSeverity;
	text: string;
	data?: Record<string, unknown> | null;
	action?: { url: string } | null;
}

export interface AmountWithCurrency {
	currencyCode: string;
	value: number;
}

export interface BalanceWithCurrency {
	currencyCode: string;
	value: number;
}

export interface CategoryEmbed {
	id: string;
	name: string;
	color: string;
}

export interface LabelEmbed {
	id: string;
	name: string;
	color: string;
	archived: boolean;
}

export interface RecordPhoto {
	temporaryUrl: string;
	createdAt: string;
}

export interface StatDateRange {
	min: string;
	max: string;
}

export interface AccountStats {
	createdAt: StatDateRange;
	recordCount: number;
	recordDate: StatDateRange;
}

export interface Account {
	id: string;
	name: string;
	accountType: AccountType;
	bankAccountNumber: string;
	color: string;
	archived: boolean;
	excludeFromStats: boolean;
	initialBalance: BalanceWithCurrency;
	initialBaseBalance: BalanceWithCurrency;
	recordStats: AccountStats | null;
	createdAt: string;
	updatedAt: string;
}

export interface WalletRecord {
	id: string;
	accountId: string;
	recordType: RecordType;
	recordState: RecordState;
	recordDate: string;
	amount: AmountWithCurrency;
	baseAmount: AmountWithCurrency;
	paymentType: PaymentType;
	payee: string;
	payer: string;
	note: string;
	category: CategoryEmbed | null;
	labels: LabelEmbed[];
	contactId: string;
	transferAccountId: string;
	transferId: string;
	latitude: number;
	longitude: number;
	photos: RecordPhoto[];
	createdAt: string;
	updatedAt: string;
}

export interface Category {
	id: string;
	name: string;
	color: string;
	iconName: string;
	enabled: boolean;
	archived: boolean;
	customCategory: boolean;
	customColor: boolean;
	customName: boolean;
	cardinality: string;
	createdAt: string;
	updatedAt: string;
}

export interface Label {
	id: string;
	name: string;
	color: string;
	archived: boolean;
	createdAt: string;
	updatedAt: string;
}

// Paginated response wrapper — the data array key varies by endpoint
export interface PaginatedResponse<T> {
	limit: number;
	offset: number;
	nextOffset?: number;
	items: T[];
	agentHints?: AgentHint[] | null;
}

// API error response
export interface ApiError {
	error: string;
	message: string;
	retry_after_minutes?: number;
}

// Structured error returned by the client (not thrown)
export interface ClientError {
	error: string;
	message: string;
}

export type ApiResult<T> =
	| { ok: true; data: T; hints?: AgentHint[] | null }
	| { ok: false; error: ClientError };
