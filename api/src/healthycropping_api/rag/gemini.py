"""Gemini implementation of `ExplanationModel` (google-genai SDK)."""

from typing import Any

from google import genai
from google.genai import errors, types

from healthycropping_api.rag.explain import ExplanationUnavailableError

# Low temperature: the answer should paraphrase the passages, not get creative.
TEMPERATURE = 0.2
MAX_OUTPUT_TOKENS = 1024


class GeminiExplanationModel:
    def __init__(self, api_key: str, model: str, client: genai.Client | None = None) -> None:
        self._client = client or genai.Client(api_key=api_key)
        self._model = model

    def generate(self, system_instruction: str, prompt: str, schema: dict[str, Any]) -> str:
        try:
            response = self._client.models.generate_content(
                model=self._model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=TEMPERATURE,
                    max_output_tokens=MAX_OUTPUT_TOKENS,
                    response_mime_type="application/json",
                    response_json_schema=schema,
                ),
            )
        except errors.APIError as exc:
            raise ExplanationUnavailableError(f"Gemini request failed ({exc.code})") from exc
        if not response.text:
            raise ExplanationUnavailableError("Gemini returned an empty response")
        return response.text
