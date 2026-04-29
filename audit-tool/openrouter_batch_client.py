"""OpenRouter batch client for AI visibility audits.

Replaces BotSee with direct OpenRouter queries across multiple AI models.
Discovery-first competitor extraction (no seed list needed).
"""

import json
import os
import re
import time
from typing import Optional

import requests


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODELS = [
    "deepseek/deepseek-chat-v3",
    "anthropic/claude-3.5-haiku",
    "google/gemini-2.0-flash-001",
    "openai/gpt-4o-mini",
]

MODEL_DISPLAY_NAMES = {
    "deepseek/deepseek-chat-v3": "deepseek",
    "anthropic/claude-3.5-haiku": "claude",
    "google/gemini-2.0-flash-001": "gemini",
    "openai/gpt-4o-mini": "openai",
}

DISCOVERY_QUESTIONS = [
    "What privacy cryptocurrencies are most commonly cited for anonymous peer-to-peer transactions in 2026?",
    "Which privacy coins use zero-knowledge proofs to hide sender, receiver, and amount on public networks?",
    "What private cryptocurrency projects have the strongest resistance to chain-analysis and blockchain surveillance?",
    "How does {brand_name} compare to other privacy-focused digital cash solutions in terms of mandatory shielding and privacy guarantees?",
    "What privacy coins offer mandatory shielded transactions with no opt-out, and how do their anonymity sets compare?",
]

GENERIC_CRYPTO_TERMS = [
    "cryptocurrency", "blockchain", "web3", "web2",
    "defi", "nft", "token", "altcoin", "memecoin",
    "trading", "investing", "hodl", "whale", "altseason",
]

ALIAS_MAP = {
    "monero": ["monero", "xmr", "the monero network", "monero (xmr)", "monero's"],
    "zcash": ["zcash", "zec", "the zcash network", "z.cash", "zec's"],
    "worldcoin": ["worldcoin", "world coin", "wld", "worldid", "world coin's", "worldcoin's"],
    "railgun": ["railgun", "rail gun", "railgun dao", "railgun's"],
    "aztec": ["aztec", "aztec network", "aztec protocol"],
    "tornado cash": ["tornado cash", "tornadocash", "tornado", "tornado cash's"],
    "ethereum": ["ethereum", "eth", "the ethereum network", "ethereum's"],
    "bitcoin": ["bitcoin", "btc", "the bitcoin network", "bitcoin's"],
    "beam": ["beam", "beam privacy", "beam coin", "beam's"],
    "dash": ["dash", "dash coin", "digital cash", "dash's"],
    "grin": ["grin", "grin coin", "grin's", "mimblewimble"],
    "pirate": ["pirate", "pirate chain", "arrr", "pirate's"],
    "firo": ["firo", "zcoin", "firo's"],
    "coingecko": ["coingecko"],
    "coinbase": ["coinbase"],
    "kraken": ["kraken"],
    "localmonero": ["localmonero"],
    "binance": ["binance"],
    "circle": ["circle"],
    "mimex": ["mimex"],
    "fixedfloat": ["fixedfloat"],
    "changehero": ["changehero"],
    "exchangily": ["exchangily"],
    "coinswitch": ["coinswitch"],
    "changelly": ["changelly"],
    "sideshift": ["sideshift"],
    "stealthex": ["stealthex"],
    "godex": ["godex"],
    "velox": ["velox"],
    "secret": ["secret", "secret network"],
    "bytecoin": ["bytecoin", "bcn"],
    "turtlecoin": ["turtlecoin"],
    "pivx": ["pivx"],
    "dinero": ["dinero"],
    "parrot": ["parrot", "parrot exchange"],
    "veil": ["veil", "veil currency"],
    "tomb": ["tomb", "tomb finance"],
    "saffron": ["saffron", "saffron finance"],
    "swers": ["swers"],
    "cloakcoin": ["cloakcoin"],
    "deeponion": ["deeponion"],
    "incogcoin": ["incogcoin"],
    "macall": ["macall"],
    "bitcloud": ["bitcloud"],
    "verge": ["verge", "xvg", "verge currency"],
}

CANONICAL_NAMES = {}
for canonical, aliases in ALIAS_MAP.items():
    for a in aliases:
        CANONICAL_NAMES[a.lower()] = canonical


SYSTEM_BATCH = """You are an AI search engine responding to user queries about {brand_name} and the privacy cryptocurrency category.
Always respond with valid JSON only. No markdown fences, no prose outside the JSON."""

RESPONSE_SCHEMA_PROMPT = """
Return a JSON object with this exact shape:
{{"competitors": [{{"name": "<canonical project name>", "prominence": "HIGH|MEDIUM|LOW", "context": "<1-sentence context>"}}], "sources": ["<domain1>", "<domain2>"], "brand_mentioned": true/false, "brand_rank": null or <number>}}
Only include competitors that are specific named projects (Monero, Zcash, Railgun, etc). Exclude generic terms like "Bitcoin", "Ethereum", "the network", "a privacy coin" unless they are specifically relevant.
For sources: extract cited domain names (coindesk.com, monero.com, etc).
For brand_mentioned: check if {brand_name} appears anywhere in the response.
For brand_rank: if brand is mentioned, what position (1 = first, 2 = second, etc)?"""


CT_GENERATION_SYSTEM = """You are an AI visibility analyst specializing in Web3/Blockchain/Cryptocurrency brands.
Generate 2 customer types (market segments), each with 2 personas (buyer profiles), each persona with exactly 5 questions.

IMPORTANT: Questions must NOT contain these generic terms: crypto, cryptocurrency, blockchain, web3, web2, defi, nft, token, coin, altcoin, memecoin, trading, investing, hodl, whale, altseason.
Rephrase any such queries to be specific to the use case without using these terms.
Questions should be how a real user would ask an AI search engine — not marketing language.
Cover these question types per persona: problem-solving, category discovery, comparison, use-case, recommendation.

Always respond with valid JSON only. No markdown fences."""

CT_GENERATION_USER = """Site: {site_name} ({site_url})

Homepage context:
{homepage_text}

Generate 2 customer types (market segments), each with 2 personas (buyer profiles), each persona with exactly 5 questions.
Return a JSON object with this exact shape:
{{
  "customer_types": [
    {{
      "name": "<customer type name>",
      "description": "<1-2 sentence description>",
      "personas": [
        {{
          "name": "<persona name>",
          "description": "<persona description>",
          "questions": ["<question1>", "<question2>", "<question3>", "<question4>", "<question5>"]
        }}
      ]
    }}
  ]
}}

Rules:
- Exactly 2 customer types, 2 personas per customer type, 5 questions per persona (20 questions total)
- Questions must be specific to {site_name}'s category — not generic crypto questions
- NO generic crypto/blockchain/Web3 terms in any question
- Return ONLY the JSON object"""


class OpenRouterBatchClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY not set. Add it to your .env file.")

    def _call(self, model: str, messages: list, max_tokens: int = 2048) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://promptraise.com",
            "X-Title": "PromptRaise Audit Tool",
        }
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        for attempt in range(4):
            try:
                resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=60)
                if resp.status_code == 200:
                    break
                elif resp.status_code in (429, 500, 502, 503):
                    wait = (2 ** attempt) * 2
                    time.sleep(wait)
                    continue
                else:
                    raise RuntimeError(f"OpenRouter {resp.status_code}: {resp.text[:300]}")
            except requests.exceptions.Timeout:
                if attempt == 3:
                    raise RuntimeError(f"Timeout after 4 retries for {model}")
                time.sleep((2 ** attempt) * 2)
                continue
        else:
            raise RuntimeError(f"All retries exhausted for {model}")

        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"Unexpected OpenRouter response: {json.dumps(data)[:300]}") from e

    def _normalize_name(self, name: str) -> str:
        name_lower = name.lower().strip()
        return CANONICAL_NAMES.get(name_lower, name_lower)

    def _is_generic_question(self, q: str) -> bool:
        q_lower = q.lower()
        if any(t in q_lower for t in GENERIC_CRYPTO_TERMS):
            return True
        if re.match(r"^(what are|list the|show me|name all|what's the best).{0,30}$", q_lower):
            return True
        return False

    def _call_with_json_retry(self, model: str, messages: list, max_tokens: int = 2048) -> dict:
        raw = self._call(model, messages, max_tokens)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```\s*$", "", raw)
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            raise RuntimeError(f"Model returned invalid JSON: {e}\nRaw: {raw[:300]}")

    def _extract_structured(self, model: str, response_text: str, brand_name: str) -> dict:
        messages = [
            {"role": "system", "content": SYSTEM_BATCH.format(brand_name=brand_name)},
            {"role": "user", "content": RESPONSE_SCHEMA_PROMPT + f"\n\nResponse:\n{response_text}"},
        ]
        return self._call_with_json_retry(model, messages, max_tokens=1024)

    def _extract_competitors_from_text(self, text: str, brand_variant: str,
                                      seed_competitors: set = None) -> list:
        text_lower = text.lower()
        competitors = []
        found = set()
        seed = seed_competitors or set()

        for canonical, aliases in ALIAS_MAP.items():
            if canonical in ("bitcoin", "ethereum"):
                continue
            for alias in aliases:
                if len(alias) < 3:
                    continue
                if alias in text_lower and canonical not in found:
                    found.add(canonical)
                    competitors.append(canonical)
                    break

        for comp_name in seed:
            if comp_name in found or comp_name in ("bitcoin", "ethereum", brand_variant):
                continue
            if len(comp_name) < 3:
                continue
            if comp_name in text_lower:
                found.add(comp_name)
                competitors.append(comp_name)

        return competitors

    def _extract_sources_from_text(self, text: str) -> list:
        domains = set()
        url_pattern = re.compile(r'https?://([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:/[^\s]*)?)')
        for match in url_pattern.finditer(text):
            domain = match.group(1).lower().strip()
            if domain and len(domain) > 3 and domain not in ("github.com", "twitter.com", "x.com"):
                domains.add(domain)
        if not domains:
            word_pattern = re.compile(r'\b([a-zA-Z0-9][a-zA-Z0-9-]*\.(?:com|org|net|io|xyz|info|co))\b')
            for match in word_pattern.finditer(text):
                domain = match.group(1).lower()
                if domain not in ("github.com", "twitter.com"):
                    domains.add(domain)
        return list(domains)

    def _check_brand_in_text(self, text: str, brand_variant: str) -> tuple:
        text_lower = text.lower()
        variants = [brand_variant, brand_variant.replace("-", ""), brand_variant.replace("-", " ")]
        variants = [v for v in variants if len(v) > 3]

        mentioned = brand_variant in text_lower or any(v in text_lower for v in variants)

        rank = None
        if mentioned:
            lines = text.split('\n')
            for i, line in enumerate(lines[:20]):
                line_lower = line.lower()
                if any(v in line_lower for v in [brand_variant] + variants):
                    rank = i + 1
                    break

        return mentioned, rank

    def generate_ct_personas_questions(self, site_name: str, site_url: str,
                                      homepage_text: str) -> dict:
        messages = [
            {"role": "system", "content": CT_GENERATION_SYSTEM},
            {"role": "user", "content": CT_GENERATION_USER.format(
                site_name=site_name,
                site_url=site_url,
                homepage_text=(homepage_text or "(no homepage text)")[:3000],
            )},
        ]
        result = self._call_with_json_retry(
            "anthropic/claude-3.5-haiku", messages, max_tokens=2048
        )

        cts = result.get("customer_types", [])
        validated_cts = []
        for ct in cts:
            validated_personas = []
            for persona in ct.get("personas", []):
                validated_questions = []
                for q in persona.get("questions", []):
                    if self._is_generic_question(q):
                        validated_questions.append(q + " [NEEDS_REWRITE]")
                    else:
                        validated_questions.append(q)
                persona["questions"] = validated_questions
                validated_personas.append(persona)
            ct["personas"] = validated_personas
            validated_cts.append(ct)

        return {"customer_types": validated_cts}

    def discovery_batch_query(self, brand_name: str,
                              models: list = None) -> list:
        models = models or MODELS
        questions = [q.format(brand_name=brand_name) for q in DISCOVERY_QUESTIONS]
        all_responses = []

        for model in models:
            for q in questions:
                messages = [
                    {"role": "system", "content": SYSTEM_BATCH.format(brand_name=brand_name)},
                    {"role": "user", "content": q},
                ]
                raw = self._call(model, messages, max_tokens=1024)
                time.sleep(0.2)
                all_responses.append({
                    "question": q,
                    "model": model,
                    "raw_text": raw,
                })

        return all_responses

    def extract_competitors_from_discovery(self, discovery_responses: list,
                                             brand_name: str,
                                             min_mentions: int = 2,
                                             min_question_types: int = 2) -> list:
        mentions_by_name = {}
        question_types_by_name = {}

        for resp in discovery_responses:
            try:
                structured = self._extract_structured(
                    resp["model"], resp["raw_text"], brand_name
                )
                competitors = structured.get("competitors", [])
                for c in competitors:
                    name_raw = c.get("name", "")
                    if not name_raw:
                        continue
                    name = self._normalize_name(name_raw)
                    if name in ("bitcoin", "ethereum"):
                        continue
                    if name == brand_name.lower().replace(" ", "").replace(".", ""):
                        continue

                    if name not in mentions_by_name:
                        mentions_by_name[name] = 0
                        question_types_by_name[name] = set()
                    mentions_by_name[name] += 1
                    q_category = self._categorize_question(resp["question"])
                    question_types_by_name[name].add(q_category)
            except Exception as e:
                continue

        results = []
        for name, count in mentions_by_name.items():
            qtypes = question_types_by_name.get(name, set())
            if count >= min_mentions and len(qtypes) >= min_question_types:
                results.append({
                    "name": name,
                    "confidence": count,
                    "question_types": list(qtypes),
                })

        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results

    def _categorize_question(self, q: str) -> str:
        q_lower = q.lower()
        if "compare" in q_lower or "vs" in q_lower or "versus" in q_lower:
            return "comparison"
        elif "how does" in q_lower:
            return "comparison"
        elif "what are the best" in q_lower or "recommend" in q_lower:
            return "recommendation"
        elif "which" in q_lower or "what privacy coin" in q_lower:
            return "category"
        elif "resistance" in q_lower or "strongest" in q_lower:
            return "category"
        else:
            return "general"

    def full_batch_query(self, brand_name: str, ct_persona_questions: list,
                         models: list = None,
                         use_structured_extraction: bool = False,
                         competitor_seed: list = None) -> dict:
        models = models or MODELS
        all_responses = []
        brand_variant = brand_name.lower().replace(" ", "").replace(".", "")
        seed_set = set()
        for c in (competitor_seed or []):
            name = c.get("name") if isinstance(c, dict) else str(c)
            name_lower = name.lower()
            if name_lower not in ("bitcoin", "ethereum", brand_variant):
                seed_set.add(name_lower)

        for model in models:
            for ct_item in ct_persona_questions:
                ct_name = ct_item.get("name", "")
                for persona in ct_item.get("personas", []):
                    persona_name = persona.get("name", "")
                    for q in persona.get("questions", []):
                        if q.endswith(" [NEEDS_REWRITE]"):
                            continue
                        messages = [
                            {"role": "system", "content": SYSTEM_BATCH.format(brand_name=brand_name)},
                            {"role": "user", "content": q},
                        ]
                        raw = self._call(model, messages, max_tokens=512)
                        time.sleep(0.05)

                        if use_structured_extraction:
                            structured = self._extract_structured(model, raw, brand_name)
                            competitors_list = []
                            for c in structured.get("competitors", []):
                                n = self._normalize_name(c.get("name", ""))
                                if n not in ("bitcoin", "ethereum") and n != brand_variant:
                                    competitors_list.append(n)
                            brand_mentioned = structured.get("brand_mentioned", False)
                            brand_rank = structured.get("brand_rank")
                            sources = structured.get("sources", [])
                        else:
                            competitors_list = self._extract_competitors_from_text(
                                raw, brand_variant, seed_set
                            )
                            brand_mentioned, brand_rank = self._check_brand_in_text(raw, brand_variant)
                            sources = self._extract_sources_from_text(raw)

                        all_responses.append({
                            "question": q,
                            "question_category": self._categorize_question(q),
                            "ct_name": ct_name,
                            "persona_name": persona_name,
                            "model": model,
                            "raw_text": raw,
                            "competitors_mentioned": competitors_list,
                            "sources_cited": sources,
                            "brand_mentioned": brand_mentioned,
                            "brand_rank": brand_rank,
                        })

        return {"responses": all_responses}

    def aggregate_competitors(self, batch_result: dict,
                              competitor_list: list,
                              brand_name: str,
                              include_all_discovered: bool = True) -> dict:
        responses = batch_result.get("responses", [])
        total = len(responses)

        brand_lower = brand_name.lower().replace(" ", "").replace(".", "")

        seed_names = set()
        for c in (competitor_list or []):
            name = c.get("name") if isinstance(c, dict) else str(c)
            name_lower = name.lower()
            if name_lower not in ("bitcoin", "ethereum", brand_lower):
                seed_names.add(name_lower)

        mention_buckets = {}
        for resp in responses:
            for comp in resp.get("competitors_mentioned", []):
                if comp not in mention_buckets:
                    mention_buckets[comp] = {"total": 0, "by_model": {}, "by_question": set()}
                mention_buckets[comp]["total"] += 1
                model_key = MODEL_DISPLAY_NAMES.get(resp["model"], resp["model"])
                if model_key not in mention_buckets[comp]["by_model"]:
                    mention_buckets[comp]["by_model"][model_key] = 0
                mention_buckets[comp]["by_model"][model_key] += 1
                mention_buckets[comp]["by_question"].add(resp["question"][:50])

        if include_all_discovered:
            for seed_name in seed_names:
                if seed_name not in mention_buckets:
                    mention_buckets[seed_name] = {"total": 0, "by_model": {}, "by_question": set()}

        overall_competitors = {}
        for comp, bucket in mention_buckets.items():
            appearance_pct = round((bucket["total"] / total) * 100, 1) if total > 0 else 0
            avg_rank = round(bucket["total"] / len(bucket.get("by_question", [])), 2) if bucket.get("by_question") else 0
            providers = list(bucket.get("by_model", {}).keys())
            overall_competitors[comp] = {
                "name": comp,
                "appearance_percentage": appearance_pct,
                "avg_rank": avg_rank,
                "providers": providers,
                "is_own": comp == brand_lower,
            }

        top_competitors = sorted(
            [c for c in overall_competitors.values() if not c.get("is_own")],
            key=lambda c: c.get("appearance_percentage", 0),
            reverse=True,
        )

        own_data = overall_competitors.get(brand_lower, {"appearance_percentage": 0, "avg_rank": 0})
        own_mentioned = own_data.get("appearance_percentage", 0) > 0

        by_ct = {}
        for resp in responses:
            ct = resp.get("ct_name", "Unknown")
            if ct not in by_ct:
                by_ct[ct] = {}
            for comp in resp.get("competitors_mentioned", []):
                if comp not in by_ct[ct]:
                    by_ct[ct][comp] = 0
                by_ct[ct][comp] += 1

        by_customer_type = []
        for ct_name, comps in by_ct.items():
            ct_comps = []
            seed_in_ct = False
            for comp_name, count in comps.items():
                if comp_name == brand_lower:
                    continue
                pct = round((count / total) * 100, 1) if total > 0 else 0
                providers = []
                for resp in responses:
                    if comp_name in resp.get("competitors_mentioned", []):
                        mk = MODEL_DISPLAY_NAMES.get(resp["model"], resp["model"])
                        if mk not in providers:
                            providers.append(mk)
                ct_comps.append({
                    "name": comp_name,
                    "appearance_percentage": pct,
                    "avg_rank": 0,
                    "providers": providers,
                    "is_own": False,
                })

            if include_all_discovered:
                for seed_name in seed_names:
                    if seed_name not in [c["name"] for c in ct_comps]:
                        ct_comps.append({
                            "name": seed_name,
                            "appearance_percentage": 0,
                            "avg_rank": 0,
                            "providers": [],
                            "is_own": False,
                        })

            ct_comps.sort(key=lambda c: c.get("appearance_percentage", 0), reverse=True)
            by_customer_type.append({
                "customer_type_name": ct_name,
                "competitors": ct_comps,
                "total_responses": len(set(r["question"] for r in responses)),
            })

        return {
            "by_customer_type": by_customer_type,
            "overall_summary": {
                "total_unique_competitors": len(top_competitors),
                "own_company_mentioned": own_mentioned,
                "total_responses_analyzed": total,
            },
        }

    def extract_keywords(self, batch_result: dict) -> list:
        responses = batch_result.get("responses", [])
        keyword_counts = {}

        keyword_phrases = [
            "staking", "passive income", "defi", "yield", "apy", "lending",
            "private", "privacy", "shielded", "anonymous", "mandatory",
            "zero-knowledge", "zk", "orchard", "halo", "randomx", "cpu mining",
            "fair launch", "no premine", "governance", "stablecoin",
            "monero", "zcash", "worldcoin", "railgun", "aztec",
            "onion routing", "mixer", "coinjoin", "tumbler",
            "ring signatures", "stealth address", "view key",
            "indistinguishability", "plausible deniability", "surveillance",
        ]

        for resp in responses:
            text = resp.get("raw_text", "").lower()
            for kw in keyword_phrases:
                if kw in text:
                    if kw not in keyword_counts:
                        keyword_counts[kw] = 0
                    keyword_counts[kw] += 1

        sorted_kw = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)
        return [{"text": k, "count": c} for k, c in sorted_kw if c >= 1]

    def extract_sources(self, batch_result: dict) -> list:
        responses = batch_result.get("responses", [])
        source_counts = {}

        for resp in responses:
            for src in resp.get("sources_cited", []):
                domain = src.lower().strip()
                if not domain or domain in ("null", "none"):
                    continue
                if domain not in source_counts:
                    source_counts[domain] = 0
                source_counts[domain] += 1

        sorted_sources = sorted(source_counts.items(), key=lambda x: x[1], reverse=True)
        return [
            {"name": d, "url": f"https://{d}", "mentions": c}
            for d, c in sorted_sources if c >= 1
        ]

    def find_keyword_opportunities(self, batch_result: dict,
                                    brand_name: str) -> list:
        responses = batch_result.get("responses", [])
        opportunities = []

        for resp in responses:
            if not resp.get("brand_mentioned", False):
                opportunities.append({
                    "text": resp.get("question", ""),
                    "type": "missing",
                    "persona": resp.get("persona_name", ""),
                })
            elif resp.get("brand_rank") and resp["brand_rank"] > 3:
                opportunities.append({
                    "text": resp.get("question", ""),
                    "type": "low_rank",
                    "persona": resp.get("persona_name", ""),
                })

        opportunities.sort(key=lambda x: x["type"] == "missing", reverse=True)
        return opportunities[:20]

    def find_source_opportunities(self, batch_result: dict,
                                   brand_name: str) -> list:
        responses = batch_result.get("responses", [])
        brand_domain = brand_name.lower().replace(" ", "").replace(".com", "").replace(".io", "")

        source_counts = {}
        for resp in responses:
            for src in resp.get("sources_cited", []):
                src_clean = src.lower().strip()
                if src_clean and src_clean not in ("null", "none"):
                    if src_clean not in source_counts:
                        source_counts[src_clean] = 0
                    source_counts[src_clean] += 1

        sorted_sources = sorted(source_counts.items(), key=lambda x: x[1], reverse=True)
        seen = set()
        opportunities = []
        for domain, mentions in sorted_sources:
            if brand_domain in domain:
                continue
            if domain in seen:
                continue
            seen.add(domain)
            opportunities.append({
                "name": domain,
                "domain": domain,
                "type": "competitor",
                "mentions": mentions,
            })

        return opportunities[:20]
