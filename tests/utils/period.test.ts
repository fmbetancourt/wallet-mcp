import { afterAll, describe, expect, it, setSystemTime } from "bun:test";
import { resolvePeriod } from "../../src/utils/period";

// resolvePeriod reads the local calendar (getFullYear/getMonth/getDate), so the
// clock is frozen with a local Date. Building it from local components keeps
// the expectations identical in every timezone the suite runs in.
function freeze(year: number, monthIndex: number, day: number): void {
	setSystemTime(new Date(year, monthIndex, day, 12, 0, 0));
}

afterAll(() => {
	setSystemTime();
});

describe("resolvePeriod", () => {
	describe("this_month", () => {
		it("spans the first of the month through today", () => {
			freeze(2026, 2, 15);
			expect(resolvePeriod("this_month")).toEqual({
				dateFrom: "2026-03-01",
				dateTo: "2026-03-15",
			});
		});

		it("zero-pads single-digit months and days", () => {
			freeze(2026, 0, 5);
			expect(resolvePeriod("this_month")).toEqual({
				dateFrom: "2026-01-01",
				dateTo: "2026-01-05",
			});
		});

		it("collapses to a single day on the first of the month", () => {
			freeze(2026, 6, 1);
			expect(resolvePeriod("this_month")).toEqual({
				dateFrom: "2026-07-01",
				dateTo: "2026-07-01",
			});
		});
	});

	describe("last_month", () => {
		it("spans the whole previous month", () => {
			freeze(2026, 2, 15);
			expect(resolvePeriod("last_month")).toEqual({
				dateFrom: "2026-02-01",
				dateTo: "2026-02-28",
			});
		});

		it("crosses the year boundary in January", () => {
			freeze(2026, 0, 10);
			expect(resolvePeriod("last_month")).toEqual({
				dateFrom: "2025-12-01",
				dateTo: "2025-12-31",
			});
		});

		it("returns February 29 in a leap year", () => {
			freeze(2024, 2, 5);
			expect(resolvePeriod("last_month")).toEqual({
				dateFrom: "2024-02-01",
				dateTo: "2024-02-29",
			});
		});

		it("does not overflow when today is the 31st and last month is shorter", () => {
			freeze(2026, 2, 31);
			expect(resolvePeriod("last_month")).toEqual({
				dateFrom: "2026-02-01",
				dateTo: "2026-02-28",
			});
		});
	});

	describe("last_3_months", () => {
		it("starts on the same day three months back", () => {
			freeze(2026, 2, 15);
			expect(resolvePeriod("last_3_months")).toEqual({
				dateFrom: "2025-12-15",
				dateTo: "2026-03-15",
			});
		});

		it("crosses the year boundary", () => {
			freeze(2026, 1, 20);
			expect(resolvePeriod("last_3_months")).toEqual({
				dateFrom: "2025-11-20",
				dateTo: "2026-02-20",
			});
		});

		// Quirk, pinned deliberately: Date rolls an out-of-range day forward, so
		// three months before May 31 lands on March 3 rather than late February.
		it("rolls a day that does not exist in the target month forward", () => {
			freeze(2026, 4, 31);
			expect(resolvePeriod("last_3_months")).toEqual({
				dateFrom: "2026-03-03",
				dateTo: "2026-05-31",
			});
		});
	});

	describe("this_year", () => {
		it("spans January 1 through today", () => {
			freeze(2026, 2, 15);
			expect(resolvePeriod("this_year")).toEqual({
				dateFrom: "2026-01-01",
				dateTo: "2026-03-15",
			});
		});
	});

	describe("last_year", () => {
		it("spans the full previous calendar year", () => {
			freeze(2026, 2, 15);
			expect(resolvePeriod("last_year")).toEqual({
				dateFrom: "2025-01-01",
				dateTo: "2025-12-31",
			});
		});

		it("is independent of the current day within the year", () => {
			freeze(2026, 11, 31);
			expect(resolvePeriod("last_year")).toEqual({
				dateFrom: "2025-01-01",
				dateTo: "2025-12-31",
			});
		});
	});
});
