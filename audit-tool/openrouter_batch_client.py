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
    "deepseek/deepseek-chat-v3": "DeepSeek",
    "anthropic/claude-3.5-haiku": "Claude",
    "google/gemini-2.0-flash-001": "Gemini",
    "openai/gpt-4o-mini": "OpenAI",
}

# DISCOVERY_QUESTIONS removed - dynamically generated per project subcategory via _detect_subcategory_and_generate_questions

GENERIC_CRYPTO_TERMS = [
    "cryptocurrency", "blockchain", "web3", "web2",
    "defi", "nft", "token", "altcoin", "memecoin",
    "trading", "investing", "hodl", "whale", "altseason",
]

# ALIAS_MAP is now empty — competitor aliases are generated dynamically per audit
# via competitor_discovery.py's generate_competitor_aliases_llm().
# This avoids hardcoding project-specific aliases into the core client.
ALIAS_MAP = {}

CANONICAL_NAMES = {}
for canonical, aliases in ALIAS_MAP.items():
    for a in aliases:
        CANONICAL_NAMES[a.lower()] = canonical


SYSTEM_BATCH = """You are an AI search engine responding to user queries about {brand_name} in the Web3/Blockchain/Cryptocurrency industry. 
Be specific about real projects, companies, and platforms. Always mention competitor names when relevant.
Always respond with valid JSON only. No markdown fences, no prose outside the JSON."""

RESPONSE_SCHEMA_PROMPT = """
Return a JSON object with this exact shape:
{{"competitors": [{{"name": "<canonical project name>", "prominence": "HIGH|MEDIUM|LOW", "context": "<1-sentence context>"}}], "sources": ["<domain1>", "<domain2>"], "brand_mentioned": true/false, "brand_rank": null or <number>}}
Only include competitors that are specific named projects, companies, or platforms. Exclude generic terms like "the network", "a protocol", "a platform" unless they are specifically relevant.
For sources: extract cited domain names (e.g., coindesk.com, example.com, etc).
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


DISCOVERY_GENERATION_SYSTEM = """You are an AI visibility analyst specializing in identifying competitors for {site_name}.
Generate exactly 5 competitor discovery questions for the brand's market category.

Questions must:
- Be specific to {site_name}'s category (NOT generic crypto/blockchain)
- Cover different discovery angles: comparison, category awareness, recommendation, new entrants, general awareness
- Be phrased as real user questions to an AI search engine
- NOT contain generic terms: crypto, cryptocurrency, blockchain, web3, web2, defi, nft, token, coin, altcoin, memecoin, trading, investing, hodl, whale, altseason

Always respond with valid JSON only. No markdown fences."""


DISCOVERY_GENERATION_USER = """Site: {site_name} ({site_url})

Homepage context:
{homepage_text}

Generate exactly 5 competitor discovery questions for {site_name}'s market category.
Return a JSON object with this exact shape:
{{
  "discovery_questions": [
    "<question 1>",
    "<question 2>",
    "<question 3>",
    "<question 4>",
    "<question 5>"
  ]
}}

Rules:
- Exactly 5 questions, no more, no less
- Each question should discover competitors from a different angle
- Questions must be specific to the brand's category, not generic
- NO generic crypto/blockchain/Web3 terms
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
        last_status = None
        last_error = None
        for attempt in range(4):
            try:
                resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=60)
                last_status = resp.status_code
                if resp.status_code == 200:
                    break
                elif resp.status_code in (429, 500, 502, 503):
                    wait = (2 ** attempt) * 2
                    time.sleep(wait)
                    continue
                else:
                    raise RuntimeError(f"OpenRouter {resp.status_code}: {resp.text[:300]}")
            except (requests.exceptions.Timeout, requests.exceptions.ChunkedEncodingError, requests.exceptions.ConnectionError) as e:
                last_error = type(e).__name__
                if attempt == 3:
                    raise RuntimeError(f"{last_error} after 4 retries for {model} (last status: {last_status})")
                wait = (2 ** attempt) * 2
                time.sleep(wait)
                continue
        else:
            raise RuntimeError(f"All retries exhausted for {model} (last status: {last_status}, last error: {last_error})")

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
                                      seed_competitors: set = None,
                                      competitor_aliases_map: dict = None) -> tuple:
        text_lower = text.lower()
        competitors = []
        found = set()
        seed = seed_competitors or set()
        
        # Use provided aliases map, fall back to ALIAS_MAP
        aliases_map = competitor_aliases_map if competitor_aliases_map else ALIAS_MAP

        for canonical, aliases in aliases_map.items():
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

        positions = {}
        lines = text.split('\n')
        for canonical in found:
            aliases = aliases_map.get(canonical, [canonical])
            for i, line in enumerate(lines[:20]):
                line_lower = line.lower()
                if any(alias in line_lower for alias in aliases):
                    positions[canonical] = i + 1
                    break
        for comp_name in competitors:
            if comp_name not in positions:
                for i, line in enumerate(lines[:20]):
                    if comp_name in line.lower():
                        positions[comp_name] = i + 1
                        break

        return competitors, positions

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

    def _detect_subcategory(self, homepage_text: str, site_name: str) -> str:
        """Detect Web3 project subcategory from homepage text using keyword analysis.
        
        Returns one of: depin, rwa, defi, privacy, nft, gaming, infrastructure, 
        payments, dao, exchange, wallet, layer1, layer2, or generic
        """
        text_lower = (homepage_text or site_name or "").lower()
        
        subcategory_keywords = {
            "depin": ["depin", "decentralized physical infrastructure", "iot", "hardware", "device", "sensor", "network infrastructure", "physical", "infrastructure"],
            "rwa": ["real world asset", "real-world asset", "tokenized asset", "tokenized real estate", "tangible asset", "physical asset", "real estate tokenization", "rwa"],
            "defi": ["defi", "decentralized finance", "yield farming", "liquidity pool", "amm", "dex", "lending", "borrowing", "staking"],
            "privacy": ["privacy", "anonymous", "shielded", "zero-knowledge", "zk-proof", "confidential", "private transaction", "hidden"],
            "nft": ["nft", "non-fungible", "digital collectible", "pfp", "art collection", "mint", "opensea"],
            "gaming": ["gamefi", "play-to-earn", "p2e", "gaming", "metaverse", "virtual world", "in-game"],
            "infrastructure": ["oracle", "bridge", "interoperability", "cross-chain", "data availability", "sequencer", "validator"],
            "payments": ["payment", "remittance", "cross-border payment", "peer-to-peer payment", "stablecoin", "merchant", "pos"],
            "dao": ["dao", "governance token", "community governance", "voting", "proposal", "treasury"],
            "exchange": ["exchange", "trading", "spot trading", "futures", "perpetual", "orderbook"],
            "wallet": ["wallet", "self-custody", "key management", "mpc", "multisig", "hardware wallet"],
            "layer1": ["layer-1", "layer 1", "l1", "blockchain platform", "smart contract platform", "evm compatible"],
            "layer2": ["layer-2", "layer 2", "l2", "rollup", "optimistic rollup", "zk rollup", "scaling solution"],
        }
        
        scores = {cat: 0 for cat in subcategory_keywords}
        for category, keywords in subcategory_keywords.items():
            for kw in keywords:
                if kw in text_lower:
                    scores[category] += 1
        
        # Get top 2 categories
        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        
        if sorted_scores[0][1] == 0:
            return "generic"
        
        # If top 2 are close, return both as hyphenated
        if sorted_scores[1][1] > 0 and sorted_scores[0][1] <= sorted_scores[1][1] * 2:
            return f"{sorted_scores[0][0]}-{sorted_scores[1][0]}"
        
        return sorted_scores[0][0]
    
    def _generate_fallback_discovery_questions(self, brand_name: str, subcategory: str, site_name: str, site_url: str) -> list:
        """Generate subcategory-specific fallback discovery questions when LLM dynamic generation fails."""
        
        base_questions = {
            "depin": [
                "Which DePIN projects are leading the tokenization of physical infrastructure and IoT devices in 2026?",
                "What blockchain platforms connect real-world hardware and sensors to decentralized networks?",
                "Which projects offer the best rewards for contributing physical infrastructure to Web3 networks?",
                "How does {brand_name} compare to other DePIN protocols for device onboarding and revenue sharing?",
                "What are the top IoT and hardware-integrated blockchain projects for consumers and enterprises?",
            ],
            "rwa": [
                "Which platforms are leading real-world asset tokenization for retail investors in 2026?",
                "What blockchain projects allow fractional ownership of physical assets like real estate and commodities?",
                "Which RWA protocols offer the best yields from tokenized tangible assets?",
                "How does {brand_name} compare to other real-world asset tokenization platforms?",
                "What are the most trusted RWA projects with verified on-chain revenue and asset backing?",
            ],
            "defi": [
                "Which DeFi protocols offer the highest yields and lowest risk for liquidity providers in 2026?",
                "What decentralized exchanges and AMMs have the best trading volumes and lowest fees?",
                "Which DeFi lending platforms have the most competitive interest rates?",
                "How does {brand_name} compare to other DeFi yield farming and staking solutions?",
                "What are the most innovative DeFi protocols for derivatives and synthetic assets?",
            ],
            "privacy": [
                "Which privacy-focused cryptocurrencies offer the strongest transaction confidentiality in 2026?",
                "What zero-knowledge proof technologies are most widely adopted for private blockchain transactions?",
                "Which privacy coins have the best compliance track record while maintaining anonymity?",
                "How does {brand_name} compare to other privacy-focused digital payment solutions?",
                "What are the leading privacy-preserving DeFi and payment protocols?",
            ],
            "infrastructure": [
                "Which blockchain infrastructure projects provide the best oracle and interoperability solutions?",
                "What cross-chain bridges and messaging protocols are most secure and widely adopted?",
                "Which data availability layers and sequencers power the leading L2 ecosystems?",
                "How does {brand_name} compare to other Web3 infrastructure providers?",
                "What are the most critical infrastructure projects for blockchain scalability and connectivity?",
            ],
            "payments": [
                "Which crypto payment solutions offer the lowest fees and fastest settlement for merchants?",
                "What blockchain payment platforms are most widely adopted for cross-border remittances?",
                "Which stablecoin and payment integrations work best for e-commerce and retail?",
                "How does {brand_name} compare to other crypto payment rails and merchant solutions?",
                "What are the leading Web3 payment platforms for everyday consumer transactions?",
            ],
            "gaming": [
                "Which GameFi projects have the most engaging gameplay and sustainable tokenomics?",
                "What play-to-earn and metaverse platforms retain users beyond speculative value?",
                "Which blockchain gaming studios produce the highest quality game experiences?",
                "How does {brand_name} compare to other Web3 gaming ecosystems?",
                "What are the most innovative NFT and blockchain integration in traditional gaming?",
            ],
            "generic": [
                "Which Web3 projects in {brand_name}'s category are most frequently recommended by AI assistants?",
                "What are the leading competitors to {brand_name} in the blockchain and cryptocurrency space?",
                "Which platforms offer similar services to {brand_name} with stronger market presence?",
                "What do AI models recommend as alternatives to {brand_name}?",
                "Which crypto projects are most commonly compared to {brand_name} in user queries?",
            ],
        }
        
        # Handle compound categories (e.g., "depin-rwa")
        primary_cat = subcategory.split("-")[0]
        questions = base_questions.get(primary_cat, base_questions["generic"])
        
        return [q.format(brand_name=brand_name) for q in questions]

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

    def generate_discovery_questions(self, site_name: str, site_url: str,
                                     homepage_text: str) -> list:
        messages = [
            {"role": "system", "content": DISCOVERY_GENERATION_SYSTEM.format(site_name=site_name)},
            {"role": "user", "content": DISCOVERY_GENERATION_USER.format(
                site_name=site_name,
                site_url=site_url,
                homepage_text=(homepage_text or "(no homepage text)")[:3000],
            )},
        ]
        result = self._call_with_json_retry(
            "anthropic/claude-3.5-haiku", messages, max_tokens=1024
        )
        questions = result.get("discovery_questions", [])
        if not questions or len(questions) < 5:
            raise RuntimeError(f"Expected 5 discovery questions, got {len(questions)}")
        return questions[:5]

    def discovery_batch_query(self, brand_name: str,
                              models: list = None,
                              discovery_questions: list = None) -> list:
        models = models or MODELS
        if discovery_questions:
            formatted = [q.format(brand_name=brand_name) if "{brand_name}" in q else q for q in discovery_questions]
            questions = formatted
        else:
            # Generate dynamic discovery questions based on brand context
            subcategory = self._detect_subcategory("", brand_name)
            questions = self._generate_fallback_discovery_questions(brand_name, subcategory, brand_name, "")
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
        elif "which" in q_lower or "what are the top" in q_lower:
            return "category"
        elif "strongest" in q_lower or "leading" in q_lower:
            return "category"
        else:
            return "general"

    def full_batch_query(self, brand_name: str, ct_persona_questions: list,
                         models: list = None,
                         use_structured_extraction: bool = False,
                         competitor_seed: list = None,
                         competitor_aliases_map: dict = None) -> dict:
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
                            competitors_list, mention_position = self._extract_competitors_from_text(
                                raw, brand_variant, seed_set, competitor_aliases_map=competitor_aliases_map
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
                            "mention_position": mention_position if not use_structured_extraction else {},
                            "sources_cited": sources,
                            "brand_mentioned": brand_mentioned,
                            "brand_rank": brand_rank,
                        })

        return {"responses": all_responses}

    def aggregate_competitors(self, batch_result: dict,
                              competitor_list: list,
                              brand_name: str,
                              include_all_discovered: bool = True,
                              competitor_aliases_map: dict = None) -> dict:
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
                    mention_buckets[comp] = {"total": 0, "by_model": {}, "by_question": set(), "mention_positions": []}
                mention_buckets[comp]["total"] += 1
                model_key = MODEL_DISPLAY_NAMES.get(resp["model"], resp["model"])
                if model_key not in mention_buckets[comp]["by_model"]:
                    mention_buckets[comp]["by_model"][model_key] = 0
                mention_buckets[comp]["by_model"][model_key] += 1
                mention_buckets[comp]["by_question"].add(resp["question"][:50])
                pos = resp.get("mention_position", {}).get(comp)
                if pos is not None:
                    mention_buckets[comp]["mention_positions"].append(pos)

        if include_all_discovered:
            for seed_name in seed_names:
                if seed_name not in mention_buckets:
                    mention_buckets[seed_name] = {"total": 0, "by_model": {}, "by_question": set(), "mention_positions": []}

        overall_competitors = {}
        for comp, bucket in mention_buckets.items():
            appearance_pct = round((bucket["total"] / total) * 100, 1) if total > 0 else 0
            positions = bucket.get("mention_positions", [])
            avg_rank = round(sum(positions) / len(positions), 2) if positions else 0
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
        ct_response_counts = {}
        for resp in responses:
            ct = resp.get("ct_name", "Unknown")
            ct_response_counts[ct] = ct_response_counts.get(ct, 0) + 1
            if ct not in by_ct:
                by_ct[ct] = {}
            for comp in resp.get("competitors_mentioned", []):
                if comp not in by_ct[ct]:
                    by_ct[ct][comp] = {"count": 0, "positions": [], "models": set()}
                by_ct[ct][comp]["count"] += 1
                pos = resp.get("mention_position", {}).get(comp)
                if pos is not None:
                    by_ct[ct][comp]["positions"].append(pos)
                model_key = MODEL_DISPLAY_NAMES.get(resp["model"], resp["model"])
                by_ct[ct][comp]["models"].add(model_key)

        by_customer_type = []
        for ct_name, comps in by_ct.items():
            ct_total = ct_response_counts.get(ct_name, 1)
            ct_comps = []
            for comp_name, data in comps.items():
                if comp_name == brand_lower:
                    continue
                count = data["count"]
                pct = round((count / ct_total) * 100, 1) if ct_total > 0 else 0
                positions = data["positions"]
                avg_rank = round(sum(positions) / len(positions), 2) if positions else 0
                providers = list(data["models"])
                ct_comps.append({
                    "name": comp_name,
                    "appearance_percentage": pct,
                    "avg_rank": avg_rank,
                    "providers": providers,
                    "is_own": False,
                })

            # NOTE: Removed include_all_discovered logic for this CT
            # Only show competitors that were actually mentioned in this CT's responses
            # This prevents showing 0% for competitors not mentioned in this segment

            ct_comps.sort(key=lambda c: c.get("appearance_percentage", 0), reverse=True)
            by_customer_type.append({
                "customer_type_name": ct_name,
                "competitors": ct_comps,
                "total_responses": len(set(r["question"] for r in responses if r.get("ct_name") == ct_name)),
            })

        return {
            "by_customer_type": by_customer_type,
            "overall_summary": {
                "total_unique_competitors": len(top_competitors),
                "own_company_mentioned": own_mentioned,
                "total_responses_analyzed": total,
            },
        }

    def extract_keywords(self, batch_result: dict, brand_name: str = "",
                      top_n: int = 10) -> list:
        """Extract keywords using RAKE-style phrase scoring plus noun phrase mining.

        Phase 1: RAKE on raw_text to score phrase candidates.
        Phase 2: Extract noun phrases as fallback candidates.
        Phase 3: Deduplicate and rank by frequency across responses.
        Excludes brand name, common stopwords, and generic English.
        """
        responses = batch_result.get("responses", [])
        all_texts = [r.get("raw_text", "") for r in responses]

        stopwords = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
            "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
            "be", "have", "has", "had", "do", "does", "did", "will", "would",
            "could", "should", "may", "might", "must", "shall", "can", "need",
            "that", "this", "these", "those", "it", "its", "they", "them",
            "their", "what", "which", "who", "how", "when", "where", "why",
            "not", "no", "yes", "all", "any", "some", "most", "many", "few",
            "very", "more", "most", "just", "also", "only", "even",
            "if", "then", "so", "because", "since", "while", "although",
            "about", "after", "before", "between", "into", "through", "during",
            "above", "below", "up", "down", "out", "off", "over", "under",
            "again", "further", "once", "here", "there", "each", "other",
            "such", "than", "too", "s", "t", "don", "now", "doesn", "didn",
            "won", "wouldn", "couldn", "shouldn", "cann", "isn", "aren",
            "wasn", "weren", "hasn", "haven", "hadn",
        }
        brand_words = set(brand_name.lower().replace(".", " ").replace("-", " ").split()) if brand_name else set()
        generic_words = {
            "description", "described", "describes", "describe", "using",
            "provides", "provide", "provides", "based", "allows", "allows",
            "information", "example", "like", "include", "includes",
            "certain", "specifically", "particular", "particular", "various",
            "different", "similar", "related", "follow", "following",
            "new", "used", "use", "using", "make", "makes", "made",
            "one", "two", "first", "second", "third", "many", "most",
            "well", "also", "even", "still", "already", "yet",
            "time", "times", "real", "really", "thing", "things",
            "way", "ways", "part", "point", "case", "fact",
            "lot", "lots", "kind", "sort", "type", "types",
            "people", "person", "thing", "someone", "anyone", "everyone",
            "see", "seen", "know", "known", "want", "need",
            "look", "looking", "take", "takes", "get", "gets",
            "come", "comes", "go", "goes", "going",
        }
        all_stops = stopwords | brand_words | generic_words

        candidates = {}
        for text in all_texts:
            text_lower = text.lower()
            words = re.findall(r'\b[a-z][a-z0-9]{2,}\b', text_lower)
            filtered = [w for w in words if w not in all_stops and len(w) > 3]
            for i in range(len(filtered)):
                for j in range(i + 1, min(i + 5, len(filtered) + 1)):
                    phrase = " ".join(filtered[i:j])
                    if phrase not in candidates:
                        candidates[phrase] = {"count": 0, "scores": [], "words": set()}
                    candidates[phrase]["count"] += 1
                    score = sum(1 for w in phrase.split() if w not in all_stops) / max(len(phrase.split()), 1)
                    candidates[phrase]["scores"].append(score)
                    candidates[phrase]["words"].update(phrase.split())

        ranked = []
        for phrase, data in candidates.items():
            avg_score = sum(data["scores"]) / max(len(data["scores"]), 1)
            freq_score = data["count"]
            combined = round(avg_score * 0.3 + min(freq_score / max(len(responses), 1), 1.0) * 0.7, 3)
            ranked.append({"text": phrase, "count": data["count"], "combined_score": combined})

        ranked.sort(key=lambda x: (-x["combined_score"], -x["count"]))
        return [{"text": r["text"], "count": r["count"]} for r in ranked[:top_n]]

    def extract_sources(self, batch_result: dict) -> list:
        """Extract sources cited across responses. Handles URLs, domains, and bare domain strings."""
        responses = batch_result.get("responses", [])
        source_counts = {}
        
        # Blocklist of bogus/generic domains to exclude
        blocklist = {
            "example.com", "example.org", "example.net",
            "test.com", "test.org", "demo.com",
            "localhost", "127.0.0.1",
            "google.com", "google.co", "google.de",  # Generic search engines
            "github.com", "twitter.com", "x.com", "reddit.com",  # Social/dev platforms
        }

        for resp in responses:
            for src in resp.get("sources_cited", []):
                src = src.strip()
                if not src or src.lower() in ("null", "none", "n/a"):
                    continue

                domain = self._extract_domain(src)
                if domain and domain not in ("null", "none") and domain not in blocklist:
                    source_counts[domain] = source_counts.get(domain, 0) + 1

        sorted_sources = sorted(source_counts.items(), key=lambda x: x[1], reverse=True)
        return [
            {"name": d, "url": f"https://{d}", "mentions": c}
            for d, c in sorted_sources if c >= 1
        ]

    def _extract_domain(self, src: str) -> str:
        """Extract clean domain from URL or bare domain string."""
        src = src.lower().strip().rstrip("/").rstrip(",").rstrip('"').rstrip("'")
        if not src or src == "null" or src == "none":
            return None
        if src.startswith("http://"):
            src = src[7:]
        elif src.startswith("https://"):
            src = src[8:]
        if "/" in src:
            src = src.split("/")[0]
        src = re.sub(r"^(www\.|api\.|docs\.|app\.)", "", src)
        src = re.sub(r":\d+$", "", src)
        return src if src and len(src) > 1 else None

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

    def _extract_themes_from_responses(self, responses: list) -> list:
        """Extract dominant themes from response content using keyword frequency analysis."""
        from collections import Counter
        import re
        
        # Combine all text from questions and raw responses
        all_text = " ".join([
            resp.get("question", "") + " " + resp.get("raw_text", "")
            for resp in responses
        ]).lower()
        
        # Extract meaningful words (exclude common stop words)
        stop_words = {
            "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out",
            "day", "get", "has", "him", "his", "how", "man", "new", "now", "old", "see", "two", "way", "who", "boy",
            "did", "its", "let", "put", "say", "she", "too", "use", "with", "have", "this", "will", "your", "from",
            "they", "know", "want", "been", "good", "much", "some", "time", "very", "when", "come", "here", "just",
            "like", "long", "make", "many", "over", "such", "take", "than", "them", "well", "were", "what", "would",
            "there", "their", "said", "each", "which", "about", "could", "other", "after", "first", "never", "these",
            "think", "where", "being", "every", "great", "might", "shall", "still", "those", "while", "should", "through",
            "between", "example", "however", "another", "different", "information", "following", "according",
            # Response-specific filler words
            "based", "context", "provided", "following", "response", "answer", "mentioned", "discussed",
            "according", "sources", "include", "including", "various", "several", "multiple", "available",
        }
        
        # Extract keywords: multi-word phrases and single words
        # Look for industry-specific compound terms first
        compound_patterns = [
            r"real world asset", r"real world assets", r"real-world asset", r"real-world assets",
            r"decentralized physical infrastructure", r"depin", r"rwa", r"web3", r"tokenization",
            r"smart contract", r"cross border", r"cross-border", r"passive income", r"yield farming",
            r"power bank", r"power banks", r"vending machine", r"vending machines",
            r"iot device", r"iot devices", r"sharing economy", r"luxury service", r"luxury services",
            r"private aviation", r"private jet", r"yacht brokerage", r"luxury real estate",
        ]
        
        theme_counter = Counter()
        
        # Count compound terms
        for pattern in compound_patterns:
            matches = len(re.findall(pattern, all_text))
            if matches > 0:
                theme_counter[pattern] = matches
        
        # Count single words (filtered)
        words = re.findall(r'\b[a-z]{3,20}\b', all_text)
        for word in words:
            if word not in stop_words and not word.isdigit():
                theme_counter[word] += 1
        
        # Return top themes
        return [theme for theme, count in theme_counter.most_common(15) if count >= 2]

    def find_source_opportunities(self, batch_result: dict,
                                   brand_name: str) -> list:
        """Find strategic link-building opportunities using hybrid approach.
        
        Strategy:
        1. Extract themes from actual response content (dynamic)
        2. Use LLM to generate industry-specific publications (unique per audit)
        3. Cache LLM response to avoid regeneration (cost optimization)
        4. Filter out domains already in Top Sources
        5. Validate with competitor citation context
        
        This ensures each audit gets UNIQUE, relevant publications based on
        actual response content rather than hardcoded industry templates."""
        import hashlib
        import json as json_mod
        from pathlib import Path
        
        responses = batch_result.get("responses", [])
        
        if not responses:
            return []
        
        # Collect all mentioned domains (these are "Top Sources")
        mentioned_domains = set()
        for resp in responses:
            for src in resp.get("sources_cited", []):
                domain = self._extract_domain(src)
                if domain and domain not in ("null", "none"):
                    mentioned_domains.add(domain)
        
        # Extract dynamic themes from actual response content
        themes = self._extract_themes_from_responses(responses)
        
        if not themes:
            themes = ["blockchain", "web3", "cryptocurrency"]  # Fallback
        
        # Generate cache key from themes + brand + competitor count
        competitors_mentioned = set()
        for resp in responses:
            competitors_mentioned.update(resp.get("competitors_mentioned", []))
        
        cache_input = {
            "brand": brand_name,
            "themes": themes[:10],  # Top 10 themes
            "competitors": sorted(list(competitors_mentioned))[:10],  # Top 10 competitors
            "response_count": len(responses),
        }
        cache_key = hashlib.md5(json_mod.dumps(cache_input, sort_keys=True).encode()).hexdigest()[:16]
        
        # Check cache
        cache_dir = Path(".cache")
        cache_dir.mkdir(exist_ok=True)
        cache_file = cache_dir / f"source_opps_{cache_key}.json"
        
        if cache_file.exists():
            cached = json_mod.loads(cache_file.read_text())
            # Filter out any that are now in mentioned_domains
            opportunities = [opp for opp in cached if opp["domain"] not in mentioned_domains]
            return opportunities[:10]
        
        # LLM prompt for dynamic publication generation
        themes_str = ", ".join(themes[:10])
        competitors_str = ", ".join(sorted(list(competitors_mentioned))[:10]) if competitors_mentioned else "various projects"
        
        prompt = f"""You are a media intelligence analyst. Based on an AI audit response for {brand_name}, suggest 12 strategic link-building targets.

AUDIT CONTEXT:
- Dominant themes from responses: {themes_str}
- Key competitors mentioned: {competitors_str}
- Goal: Find authoritative publications where these competitors get coverage, but {brand_name} doesn't yet

REQUIREMENTS:
1. Publications must be SPECIFIC to the themes above (not generic tech blogs)
2. Focus on industry-authoritative sources (not social media)
3. Include a mix of: news publications, industry research sites, newsletters, developer communities
4. Each must have a clear, specific reason why {brand_name} should aim for coverage there
5. Do NOT suggest: social media, forums, job boards, or low-authority blogs

OUTPUT FORMAT - JSON array:
[
  {{
    "domain": "example.com",
    "type": "publication|research|newsletter|community",
    "reason": "Specific explanation of why this publication matters for {brand_name} based on the themes"
  }}
]

Generate exactly 12 entries."""

        try:
            llm_response = self._call(
                model="anthropic/claude-3.5-haiku",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=800,
            )
            
            # Extract JSON array from LLM response
            json_match = re.search(r'\[[\s\S]*?\]', llm_response)
            if json_match:
                raw_pubs = json_mod.loads(json_match.group())
            else:
                # Fallback: try to parse line by line
                raw_pubs = []
                
        except Exception as e:
            print(f"⚠ LLM source generation failed: {e}. Using fallback.")
            raw_pubs = []
        
        # Process and filter publications
        opportunities = []
        seen_domains = set()
        
        # Add LLM-generated publications first
        for pub in raw_pubs:
            if isinstance(pub, dict):
                domain = pub.get("domain", "").strip().lower()
                if not domain or domain in seen_domains or domain in mentioned_domains:
                    continue
                # Validate domain format (must have dot, not too long)
                if "." not in domain or len(domain) > 50:
                    continue
                seen_domains.add(domain)
                
                opportunities.append({
                    "name": domain,
                    "domain": domain,
                    "type": pub.get("type", "publication"),
                    "mentions": 0,
                    "priority": "OPPORTUNITY",
                    "reason": f"[DYNAMIC] {pub.get('reason', 'Strategic link-building target')}",
                })
        
        # If LLM didn't return enough, add competitor-derived suggestions
        if len(opportunities) < 5:
            # Extract competitor-cited sources as inspiration
            competitor_domains = {}
            for resp in responses:
                for comp in resp.get("competitors_mentioned", []):
                    for src in resp.get("sources_cited", []):
                        domain = self._extract_domain(src)
                        if domain:
                            competitor_domains.setdefault(domain, set()).add(comp)
            
            # Find similar publications (simplified: same TLD or keyword patterns)
            for domain, comps in competitor_domains.items():
                if domain not in seen_domains and domain not in mentioned_domains:
                    # Create opportunity based on competitor presence
                    opportunities.append({
                        "name": domain,
                        "domain": domain,
                        "type": "publication",
                        "mentions": 0,
                        "priority": "OPPORTUNITY",
                        "reason": f"[COMPETITOR-CITED] {', '.join(list(comps)[:3])} cited this source. {brand_name} should build presence here.",
                    })
                    seen_domains.add(domain)
                    
                    if len(opportunities) >= 10:
                        break
        
        # Final fallback if still empty
        if not opportunities:
            # Ultra-minimal fallback: just use the themes
            for theme in themes[:10]:
                # Generate a plausible domain based on theme (very rough heuristic)
                if "luxury" in theme or "yacht" in theme or "jet" in theme:
                    opportunities.append({
                        "name": "robbreport.com",
                        "domain": "robbreport.com",
                        "type": "publication",
                        "mentions": 0,
                        "priority": "OPPORTUNITY",
                        "reason": f"[THEME-DRIVEN] Luxury lifestyle publication relevant to '{theme}' discussions.",
                    })
                elif "crypto" in theme or "blockchain" in theme or "web3" in theme:
                    opportunities.append({
                        "name": "coindesk.com",
                        "domain": "coindesk.com",
                        "type": "publication",
                        "mentions": 0,
                        "priority": "OPPORTUNITY",
                        "reason": f"[THEME-DRIVEN] Leading crypto publication for '{theme}' coverage.",
                    })
                elif "payment" in theme or "fiat" in theme or "settlement" in theme:
                    opportunities.append({
                        "name": "pymnts.com",
                        "domain": "pymnts.com",
                        "type": "publication",
                        "mentions": 0,
                        "priority": "OPPORTUNITY",
                        "reason": f"[THEME-DRIVEN] Payment industry publication for '{theme}' coverage.",
                    })
                if len(opportunities) >= 10:
                    break
        
        # Limit to 10 and cache
        opportunities = opportunities[:10]
        cache_file.write_text(json_mod.dumps(opportunities, indent=2))
        
        return opportunities
