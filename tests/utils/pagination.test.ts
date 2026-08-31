import { describe, expect, it, spyOn } from "bun:test";
import { fetchAllPages } from "../../src/utils/pagination";

const MAX_PAGES = 20;

describe("fetchAllPages", () => {
	it("returns a single page when no nextOffset is provided", async () => {
		const offsets: number[] = [];
		const items = await fetchAllPages<string>(async (offset) => {
			offsets.push(offset);
			return { items: ["a", "b"] };
		});

		expect(items).toEqual(["a", "b"]);
		expect(offsets).toEqual([0]);
	});

	it("stops when nextOffset is null", async () => {
		let calls = 0;
		const items = await fetchAllPages<string>(async () => {
			calls++;
			// The API omits nextOffset on the last page; null is defended against
			// because JSON round-trips can surface it explicitly.
			return { items: ["a"], nextOffset: null as unknown as undefined };
		});

		expect(items).toEqual(["a"]);
		expect(calls).toBe(1);
	});

	it("accumulates across pages and forwards each nextOffset", async () => {
		const offsets: number[] = [];
		const pages: Array<{ items: string[]; nextOffset?: number }> = [
			{ items: ["a"], nextOffset: 1 },
			{ items: ["b"], nextOffset: 2 },
			{ items: ["c"] },
		];

		const items = await fetchAllPages<string>(async (offset) => {
			offsets.push(offset);
			const page = pages[offsets.length - 1];
			if (!page) throw new Error("unexpected extra page request");
			return page;
		});

		expect(items).toEqual(["a", "b", "c"]);
		expect(offsets).toEqual([0, 1, 2]);
	});

	it("returns an empty array when the first page is empty", async () => {
		const items = await fetchAllPages<string>(async () => ({ items: [] }));
		expect(items).toEqual([]);
	});

	it("stops at the hard cap and reports it on stderr", async () => {
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});
		let calls = 0;

		try {
			const items = await fetchAllPages<number>(async (offset) => {
				calls++;
				// Never signals the end, so only the cap can stop the loop.
				return { items: [offset], nextOffset: offset + 1 };
			});

			expect(calls).toBe(MAX_PAGES);
			expect(items).toHaveLength(MAX_PAGES);
			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(String(errorSpy.mock.calls[0]?.[0])).toContain(
				"Pagination hard cap reached (20 pages)",
			);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("does not warn when the data ends exactly one page before the cap", async () => {
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});
		let calls = 0;

		try {
			await fetchAllPages<number>(async (offset) => {
				calls++;
				const last = calls === MAX_PAGES - 1;
				return { items: [offset], nextOffset: last ? undefined : offset + 1 };
			});

			expect(calls).toBe(MAX_PAGES - 1);
			expect(errorSpy).not.toHaveBeenCalled();
		} finally {
			errorSpy.mockRestore();
		}
	});
});
