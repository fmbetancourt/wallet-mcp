const MAX_PAGES = 20;

export async function fetchAllPages<T>(
	fetcher: (offset: number) => Promise<{
		items: T[];
		nextOffset?: number;
		hints?: unknown;
	}>,
): Promise<T[]> {
	const allItems: T[] = [];
	let currentOffset = 0;
	let page = 0;

	while (page < MAX_PAGES) {
		const result = await fetcher(currentOffset);
		allItems.push(...result.items);
		page++;

		if (result.nextOffset === undefined || result.nextOffset === null) {
			break;
		}

		if (page >= MAX_PAGES) {
			console.error(
				`[wallet-mcp] Pagination hard cap reached (${MAX_PAGES} pages). Returning ${allItems.length} items collected so far.`,
			);
			break;
		}

		currentOffset = result.nextOffset;
	}

	return allItems;
}
