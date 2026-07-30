import "../../src/lib/mistral.js";
import { runUiTranslations } from "../../src/lib/runUiTranslations.js";

export const config = {
  runtime: "nodejs",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = await request.json().catch(() => null);
    const result = await runUiTranslations({
      targetLanguage: body?.targetLanguage,
    });

    if (result.ok === false) {
      return jsonResponse(result.body, result.status);
    }

    return jsonResponse(result);
  },
};
