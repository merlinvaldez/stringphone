import "dotenv/config";
import { Mistral } from "@mistralai/mistralai";

const apiKey = process.env.MISTRAL_API_KEY ?? "";

if (!apiKey) {
  throw new Error("Missing MISTRAL_API_KEY in the environment");
}

export const mistral = new Mistral({ apiKey });
