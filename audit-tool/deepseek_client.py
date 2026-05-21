"""DeepSeek client via OpenRouter.

Used to query DeepSeek's knowledge about a brand and its competitive landscape.
Adds a "4th AI provider" perspective to complement BotSee's Claude/Gemini/OpenAI data.
"""

import json
import os
import re
import time
from typing import Optional

import requests


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """You are an expert competitive intelligence analyst.
You analyze brand visibility in AI search engines.
Always respond with valid JSON only. No markdown, no prose outside the JSON."""


class DeepSeekClient:
    """Queries DeepSeek via OpenRouter for brand competitive data."""

    DEFAULT_MODEL = "deepseek/deepseek-chat-v3"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY not set.")
        self.model = model or os.environ.get("DEEPSEEK_MODEL", self.DEFAULT_MODEL)

    def _call(self, messages: list, max_tokens: int = 2048) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://promptraise.com",
            "X-Title": "PromptRaise Audit Tool",
        }
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=120)
        if resp.status_code != 200:
            raise RuntimeError(f"OpenRouter returned {resp.status_code}: {resp.text[:500]}")
        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"Unexpected OpenRouter response: {json.dumps(data)[:500]}") from e

    def _parse_json(self, text: str) -> dict:
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```\s*$", "", text)
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            raise RuntimeError(f"DeepSeek returned invalid JSON: {e}\nResponse: {text[:500]}")

    def analyze_brand(self, brand_name: str, brand_description: str = "",
                     competitors: list = None) -> dict:
        """Query DeepSeek about brand visibility and competitive landscape."""
        comp_text = ""
        if competitors:
            comp_text = "\n## Known Competitors:\n" + "\n".join(
                f"  - {c}" for c in competitors[:10]
            )

        prompt = f"""Analyze the AI visibility of {brand_name} for competitive intelligence.

## Brand
{brand_description or "(no description available)"}
{comp_text}

---

Produce a JSON object with this EXACT shape:
{{
  "brand_visibility": {{
    "mentioned": true,
    "visibility_score": 0-100,
    "summary": "1-2 sentence description of how visible this brand is in AI responses"
  }},
  "top_competitors": [
    {{"name": "<name>", "visibility_score": 0-100, "why": "<short reason>"}}
  ],
  "sources_cited": [
    {{"domain": "<domain>", "note": "<why this source is cited>"}}
  ],
  "ai_usage": {{
    "gaming": "How AI mentions gaming products",
    "trading": "How AI mentions trading products",
    "privacy_vpn": "How AI mentions VPN products",
    "poker": "How AI mentions poker products"
  }}
}}

Return ONLY the JSON object. No markdown fences, no commentary."""

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        response_text = self._call(messages, max_tokens=2048)
        return self._parse_json(response_text)

    def analyze_competitor(self, brand_name: str, competitor_name: str) -> dict:
        """Direct comparison: how does DeepSeek see this competitor vs the brand?"""
        prompt = f"""Compare {brand_name} and {competitor_name} from an AI search visibility perspective.

Produce a JSON object:
{{
  "brand_mentioned": true,
  "competitor_mentioned": true,
  "both_mentioned": true,
  "relative_visibility": "higher|lower|similar|unknown",
  "key_differences": ["...", "..."],
  "shared_queries": ["...", "..."]
}}

Return ONLY the JSON object. No markdown fences."""

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        response_text = self._call(messages, max_tokens=1024)
        return self._parse_json(response_text)

    def bulk_competitor_check(self, brand_name: str, competitor_names: list) -> list:
        """Check multiple competitors at once. Returns list of analysis dicts."""
        results = []
        for comp in competitor_names[:8]:
            try:
                result = self.analyze_competitor(brand_name, comp)
                results.append({"competitor": comp, "analysis": result})
                time.sleep(0.5)
            except Exception as e:
                results.append({"competitor": comp, "error": str(e)})
        return results
