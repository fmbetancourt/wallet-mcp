export type Period =
	| "this_month"
	| "last_month"
	| "last_3_months"
	| "this_year"
	| "last_year";

function pad(n: number): string {
	return n.toString().padStart(2, "0");
}

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function resolvePeriod(period: Period): {
	dateFrom: string;
	dateTo: string;
} {
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth(); // 0-indexed

	switch (period) {
		case "this_month":
			return {
				dateFrom: formatDate(new Date(year, month, 1)),
				dateTo: formatDate(now),
			};

		case "last_month": {
			const lastMonthStart = new Date(year, month - 1, 1);
			const lastMonthEnd = new Date(year, month, 0); // day 0 of current month = last day of previous
			return {
				dateFrom: formatDate(lastMonthStart),
				dateTo: formatDate(lastMonthEnd),
			};
		}

		case "last_3_months": {
			const threeMonthsAgo = new Date(year, month - 3, now.getDate());
			return {
				dateFrom: formatDate(threeMonthsAgo),
				dateTo: formatDate(now),
			};
		}

		case "this_year":
			return {
				dateFrom: `${year}-01-01`,
				dateTo: formatDate(now),
			};

		case "last_year":
			return {
				dateFrom: `${year - 1}-01-01`,
				dateTo: `${year - 1}-12-31`,
			};
	}
}
