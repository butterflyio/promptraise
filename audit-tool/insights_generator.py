"""Insights generator.

Uses Claude (via OpenRouter, using the cheap Haiku model) to generate
the dashboard's analytical sections:
  - Terminology Gap (missing keywords)
  - Language Gap (homepage vs AI-engine language)
  - Competitive Position (strengths, opportunities, gaps)
  - Action Items (content priorities, link-building, quick wins)
  - Audience segments (addressed vs. gap)

Also handles homepage scraping (BeautifulSoup) to feed site context to Claude.

OpenRouter is used (not the direct Anthropic SDK) so we can share a single
API key with the DeepSeek integration in Phase 2.
"""

import json
import os
import re
from typing import Optional

import requests
from bs4 import BeautifulSoup


INSIGHTS_SYSTEM_PROMPT = """You are an expert SEO + AI-search visibility consultant.
Your job is to analyze a website's AI visibility audit data and produce
concise, actionable insights as structured JSON.

You always respond with valid JSON only. No markdown, no prose outside the JSON."""


INSIGHTS_USER_PROMPT_TEMPLATE = """Analyze this AI visibility audit data for {site_name} ({site_url}).

The site was analyzed against AI search engines (Claude, Gemini, OpenAI & DeepSeek) using
{total_responses} queries across {customer_types_count} customer types.

## Homepage Content (excerpt):
{homepage_text}

## Overall Summary:
- Own site mentioned: {own_mentioned}
- Own site appearance: {own_appearance_pct}%
- Unique competitors found: {unique_competitors}

## Top Competitors:
{competitors_summary}

## Top Keywords Appearing in AI Responses:
{keywords_summary}

## Top Sources Cited by AI:
{sources_summary}

## Customer Types:
{customer_types_summary}

---

Produce a JSON object with this EXACT shape:

{{
  "terminology_gap": [
    {{"term": "<term in quotes>", "evidence": "<short reason>", "priority": "HIGH|MEDIUM|LOW"}}
  ],
  "language_gap": [
    {{"site_says": "<what the homepage says>", "site_context": "<short note>",
      "ai_uses": "<what AI engines actually say>", "ai_context": "<short note>"}}
  ],
  "audience_segments": {{
    "addressed": [
      {{"name": "<segment name>", "note": "<short note>"}}
    ],
    "opportunity_gap": [
      {{"name": "<segment name>", "note": "<short note, often a competitor %>"}}
    ]
  }},
  "position": {{
    "strengths": ["...", "...", "...", "..."],
    "opportunities": ["...", "...", "...", "..."],
    "gaps": ["...", "...", "...", "..."]
  }},
  "action_items": {{
    "content_priorities": ["...", "...", "...", "...", "..."],
    "link_building": ["...", "...", "...", "...", "..."],
    "quick_wins": ["...", "...", "...", "...", "..."]
  }}
}}

Constraints:
- terminology_gap: 4-8 items. Mix of HIGH and MEDIUM priorities. Include only genuinely meaningful gaps.
- language_gap: 2-4 comparison rows. Include only clear mismatches between site language and AI language.
- audience_segments.opportunity_gap: 3-5 items.
- position.strengths/opportunities/gaps: 3-5 items each. Omit sections if there's insufficient evidence.
- action_items.content_priorities/link_building/quick_wins: 4-6 items each. Focus on highest-impact actions.

Guidelines:
- Be concrete and site-specific. Reference actual competitor names and percentages.
- For terminology_gap, identify keywords/phrases the site uses that AI engines don't
  recognize, plus queries where the site should appear but doesn't.
- For language_gap, contrast the site's internal jargon against how AI describes the space.
- Strengths come from the site's differentiators. Gaps come from the audit data.
- Action items should be specific and executable (e.g., "Create 'X vs Y' comparison page").
- Return ONLY the JSON object. No markdown fences, no commentary."""


class InsightsGenerator:
    """Generates analytical insight sections via OpenRouter (Claude Haiku)."""

    DEFAULT_MODEL = "openai/gpt-4o-mini"
    OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            raise RuntimeError(
                "OPENROUTER_API_KEY not set. Add it to your .env file."
            )
        self.model = model or os.environ.get("INSIGHTS_MODEL", self.DEFAULT_MODEL)

    def scrape_homepage(self, url: str, max_chars: int = 4000) -> str:
        """Fetch a URL and return cleaned text content.

        Extracts body text, meta descriptions, og tags, title, and JSON-LD
        to handle JavaScript-heavy sites (Next.js, React, etc.).
        """
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            }
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            # Extract meta descriptions and Open Graph tags first
            meta_parts = []
            title_tag = soup.find("title")
            if title_tag and title_tag.get_text(strip=True):
                meta_parts.append(title_tag.get_text(strip=True))

            for meta_name in ["description", "og:description", "og:title", "twitter:description"]:
                tag = soup.find("meta", attrs={"name": meta_name}) or soup.find("meta", attrs={"property": meta_name})
                if tag and tag.get("content"):
                    meta_parts.append(tag["content"])

            # Extract JSON-LD structured data
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json.loads(script.string)
                    if isinstance(data, dict):
                        for key in ["description", "headline", "name", "about"]:
                            val = data.get(key)
                            if val and isinstance(val, str):
                                meta_parts.append(val)
                except Exception:
                    pass

            # Clean body text
            for tag in soup(["script", "style", "nav", "footer", "noscript"]):
                tag.decompose()

            body_text = soup.get_text(separator=" ", strip=True)
            body_text = re.sub(r"\s+", " ", body_text)

            # Combine: meta first (often more descriptive for JS sites), then body
            combined = " ".join(meta_parts)
            if body_text and len(body_text) > len(combined):
                combined = combined + " " + body_text if combined else body_text

            # If still very short, the site is likely JS-rendered; return what we have
            return combined[:max_chars].strip()
        except Exception as e:
            return f"(Failed to fetch homepage: {e})"

    def _call_openrouter(self, system: str, user: str, max_tokens: int = 4096) -> str:
        """POST a chat completion request to OpenRouter."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://promptraise.com",
            "X-Title": "PromptRaise Audit Tool",
        }
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        resp = requests.post(self.OPENROUTER_URL, headers=headers, json=payload, timeout=120)
        if resp.status_code != 200:
            raise RuntimeError(
                f"OpenRouter returned {resp.status_code}: {resp.text[:500]}"
            )
        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise RuntimeError(
                f"Unexpected OpenRouter response: {json.dumps(data)[:500]}"
            ) from e

    def generate(
        self,
        site_name: str,
        site_url: str,
        homepage_text: str,
        total_responses: int,
        unique_competitors: int,
        own_mentioned: bool,
        own_appearance_pct: float,
        top_competitors: list,
        top_keywords: list,
        top_sources: list,
        customer_types: list,
    ) -> dict:
        """Call Claude (via OpenRouter) to generate all insight sections."""

        competitors_summary = "\n".join(
            f"  - {c.get('name')}: {c.get('appearance_percentage', 0)}% "
            f"(avg rank {c.get('avg_rank', 0)})"
            for c in top_competitors[:10]
        )
        keywords_summary = "\n".join(
            f"  - {k.get('keyword') or k.get('text') or k}"
            for k in top_keywords[:10]
        )
        sources_summary = "\n".join(
            f"  - {s.get('domain') or s.get('name') or s.get('url')} "
            f"({s.get('total_mentions', s.get('mentions', 0))} mentions)"
            for s in top_sources[:10]
        )
        customer_types_summary = "\n".join(
            f"  - {ct.get('name')}: {ct.get('total_responses', 0)} responses"
            for ct in customer_types
        )

        prompt = INSIGHTS_USER_PROMPT_TEMPLATE.format(
            site_name=site_name,
            site_url=site_url,
            total_responses=total_responses,
            customer_types_count=len(customer_types),
            homepage_text=homepage_text or "(no homepage text available)",
            own_mentioned=own_mentioned,
            own_appearance_pct=own_appearance_pct,
            unique_competitors=unique_competitors,
            competitors_summary=competitors_summary or "  (none)",
            keywords_summary=keywords_summary or "  (none)",
            sources_summary=sources_summary or "  (none)",
            customer_types_summary=customer_types_summary or "  (none)",
        )

        response_text = self._call_openrouter(
            INSIGHTS_SYSTEM_PROMPT, prompt, max_tokens=4096
        ).strip()

        # Strip potential markdown code fences defensively
        if response_text.startswith("```"):
            response_text = re.sub(r"^```(?:json)?\s*", "", response_text)
            response_text = re.sub(r"\s*```\s*$", "", response_text)

        try:
            return json.loads(response_text)
        except json.JSONDecodeError as e:
            # Try to find the JSON object inside the response
            match = re.search(r"\{.*\}", response_text, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            raise RuntimeError(
                f"Claude (OpenRouter) returned invalid JSON: {e}\n"
                f"Response (first 500 chars): {response_text[:500]}"
            )
