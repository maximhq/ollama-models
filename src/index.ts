import { load } from "cheerio";

interface ModelDetail {
	name: string;
	description: string;
	tags: string[];
}

interface Env {
	KV: KVNamespace;
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		// Handle CORS preflight requests
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: corsHeaders(),
			});
		}

		let models = await env.KV.get("models", { type: "json", cacheTtl: 3600 });
		if (!models) {
			models = await fetchModels();
			ctx.waitUntil(env.KV.put("models", JSON.stringify(models)));
		}
		
		// Return the response with CORS headers
		return new Response(JSON.stringify(models), {
			headers: {
				...corsHeaders(),
				"Content-Type": "application/json",
			},
		});
	},
	
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		const models = await fetchModels();
		await env.KV.put("models", JSON.stringify(models));
	},
};

// Helper function to generate CORS headers
function corsHeaders() {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Max-Age": "86400",
	};
}

async function fetchModels(): Promise<ModelDetail[]> {
	const baseUrl = "https://ollama.com";
	const resp = await fetch(baseUrl.concat("/library"));
	const $ = load(await resp.text());
	const models: ModelDetail[] = [];
	const elements = $("#repo > ul").find("li");
	for (let i = 0; i < elements.length; i++) {
		const element = elements.get(i);
		const a = $(element).find("a");
		const name = a.find("h2").text().trim();
		const description = a.find("p").first().text().trim();
		const tagsHref = a.attr("href")?.concat("/tags");
		const tags: string[] = [];
		if (tagsHref) {
			const resp = await fetch(baseUrl.concat(tagsHref));
			const $ = load(await resp.text());
			let list = $("body > main > div > section > div > div").find("a");
			list.each((i, el) => {
				if (i === 0) return;
				const tag = $(el).text().trim();
				if (tag) {
					tags.push(tag);
				}
			});
		}
		models.push({
			name,
			description,
			tags,
		});
	}
	return models;
}
