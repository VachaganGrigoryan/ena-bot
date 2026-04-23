import axios from "axios";

import { AddressFormatter, AddressFormattingCandidate } from "../domain/types";
import { env } from "../shared/env";

export class OllamaAddressFormatter implements AddressFormatter {
  async refine(candidate: AddressFormattingCandidate): Promise<string[]> {
    const prompt = [
      "Split Armenian outage addresses into a JSON array of strings.",
      "Do not translate.",
      "Do not invent new addresses.",
      "Keep only cleaned address entries.",
      `Region: ${candidate.regionName}`,
      `Time slot: ${candidate.timeSlot}`,
      `Raw addresses: ${candidate.addresses.join(" | ")}`,
    ].join("\n");

    try {
      const response = await axios.post(
        `${env.OLLAMA_BASE_URL}/api/generate`,
        {
          model: env.OLLAMA_MODEL,
          prompt,
          stream: false,
          format: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
        {
          timeout: 30_000,
        },
      );

      const parsed = JSON.parse(String(response.data?.response ?? "[]"));
      if (!Array.isArray(parsed)) {
        return candidate.addresses;
      }

      const cleaned = parsed
        .map((value) => String(value).trim())
        .filter(Boolean);

      return cleaned.length > 0 ? cleaned : candidate.addresses;
    } catch (error) {
      console.warn("Ollama address formatting failed, using deterministic fallback.", error);
      return candidate.addresses;
    }
  }
}
