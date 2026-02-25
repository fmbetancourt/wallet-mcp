import { get } from "../client";
import type { Label } from "../types/api";

interface LabelsResponse {
	limit: number;
	offset: number;
	nextOffset?: number;
	labels: Label[];
	agentHints?: unknown;
}

export async function listLabels() {
	const result = await get<LabelsResponse>("/v1/api/labels", {
		limit: 100,
	});

	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result.error) }],
		};
	}

	const labels = result.data.labels.map((l) => ({
		id: l.id,
		name: l.name,
		color: l.color,
		archived: l.archived,
	}));

	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({ labels, hints: result.hints }),
			},
		],
	};
}
