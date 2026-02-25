import { get } from "../client";
import type { Category } from "../types/api";

interface CategoriesResponse {
	limit: number;
	offset: number;
	nextOffset?: number;
	categories: Category[];
	agentHints?: unknown;
}

export async function listCategories() {
	const result = await get<CategoriesResponse>("/v1/api/categories", {
		limit: 100,
	});

	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result.error) }],
		};
	}

	const categories = result.data.categories.map((c) => ({
		id: c.id,
		name: c.name,
		color: c.color,
		iconName: c.iconName,
		enabled: c.enabled,
		archived: c.archived,
		cardinality: c.cardinality,
	}));

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({ categories, hints: result.hints }),
			},
		],
	};
}
