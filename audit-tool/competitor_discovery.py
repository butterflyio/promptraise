"""
Dynamic competitor discovery module.
Discovers Tier-1 competitors from client website using 3-layer validation.
Layer 1: Web scrape + domain check
Layer 2: LLM credibility scoring
Layer 3: Response validation (post-audit filtering)
"""

import re
import json
import logging
from typing import Dict, List, Tuple, Optional
from urllib.parse import urlparse
from datetime import datetime

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    requests = None
    BeautifulSoup = None

logger = logging.getLogger(__name__)


def extract_explicit_competitors(homepage_html: str, domain: str = "") -> List[str]:
    """
    Extract competitor names explicitly mentioned on homepage.
    Looks for patterns: "vs", "compared to", "alternative to", comparison tables.
    
    Args:
        homepage_html: Raw HTML content of client homepage
        domain: Client domain for context
        
    Returns:
        List of extracted competitor names
    """
    if not homepage_html:
        return []
    
    explicit = []
    
    # Pattern 1: "vs Company" or "vs. Company"
    vs_pattern = r'vs\.?\s+([A-Z][A-Za-z0-9\s&\-\.]+?)(?:[,;\.\s<]|$)'
    vs_matches = re.findall(vs_pattern, homepage_html)
    explicit.extend([m.strip() for m in vs_matches])
    
    # Pattern 2: "compared to Company" or "compare to Company"
    compare_pattern = r'(?:compared|compare)\s+to\s+([A-Z][A-Za-z0-9\s&\-\.]+?)(?:[,;\.\s<]|$)'
    compare_matches = re.findall(compare_pattern, homepage_html, re.IGNORECASE)
    explicit.extend([m.strip() for m in compare_matches])
    
    # Pattern 3: "alternative to Company"
    alt_pattern = r'alternative\s+to\s+([A-Z][A-Za-z0-9\s&\-\.]+?)(?:[,;\.\s<]|$)'
    alt_matches = re.findall(alt_pattern, homepage_html, re.IGNORECASE)
    explicit.extend([m.strip() for m in alt_matches])
    
    # Pattern 4: "competitors" section headings
    competitors_section = re.search(
        r'(?:competitors|competing|market|alternatives).*?(?:</section>|</div>)',
        homepage_html,
        re.IGNORECASE | re.DOTALL
    )
    if competitors_section:
        section_text = competitors_section.group()
        # Extract company names from section (basic heuristic: capitalized words/phrases)
        company_pattern = r'([A-Z][A-Za-z0-9\s&\-\.]+?)(?:,|;|\s+and\s+|<|$)'
        section_matches = re.findall(company_pattern, section_text)
        explicit.extend([m.strip() for m in section_matches if len(m.strip()) > 2])
    
    # Clean up: remove generic terms, duplicates, short names
    stop_words = {'the', 'and', 'or', 'to', 'from', 'is', 'are', 'will', 'can', 'be', 'our', 'your'}
    cleaned = set()
    for comp in explicit:
        comp_clean = comp.strip().strip('.,:;')
        if comp_clean and len(comp_clean) > 2 and comp_clean.lower() not in stop_words:
            cleaned.add(comp_clean)
    
    logger.info(f"Extracted {len(cleaned)} explicit competitors from homepage")
    return sorted(list(cleaned))


def identify_tier1_competitors_llm(homepage_text: str, client_name: str, openrouter_client) -> Tuple[List[str], str]:
    """
    Use LLM to identify Tier-1 competitors from website context.
    
    Args:
        homepage_text: Parsed text from client homepage
        client_name: Name of client company
        openrouter_client: OpenRouter API client
        
    Returns:
        Tuple of (competitor list, reasoning)
    """
    prompt = f"""You are a competitive intelligence analyst. Based on the following website content from {client_name}, 
identify their 5-10 direct Tier-1 competitors in their specific market segment.

Only list companies that DIRECTLY compete with {client_name}. Do not include:
- Adjacent players or complementary services
- Vertical integrations or different market segments
- Vague or speculative competitors

Website content:
{homepage_text[:2000]}

Respond in JSON format:
{{
  "competitors": ["Competitor1", "Competitor2", ...],
  "market_segment": "Brief description of market",
  "reasoning": "Why these are Tier-1 competitors"
}}"""

    try:
        response_text = openrouter_client._call(
            model="deepseek/deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500
        )
        
        # Extract JSON
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            competitors = data.get("competitors", [])
            reasoning = data.get("reasoning", "LLM identified")
            logger.info(f"LLM identified {len(competitors)} competitors for {client_name}")
            return competitors, reasoning
    except Exception as e:
        logger.error(f"Error in LLM competitor identification: {e}")
    
    return [], "LLM identification failed"


def validate_competitor_layer1(competitor_name: str, timeout_per_domain: float = 3.0) -> bool:
    """
    Layer 1: Web scrape validation.
    Check if competitor has valid domain/web presence.
    
    Args:
        competitor_name: Name of competitor to validate
        timeout_per_domain: Seconds to wait per domain check
        
    Returns:
        True if competitor passes Layer 1 (has web presence)
    """
    if not requests or not BeautifulSoup:
        logger.warning("requests/BeautifulSoup not available, skipping Layer 1 validation")
        return True
    
    # Try common domain patterns
    domain_patterns = [
        f"https://www.{competitor_name.lower().replace(' ', '')}.com",
        f"https://{competitor_name.lower().replace(' ', '')}.com",
        f"https://www.{competitor_name.lower().replace(' ', '-')}.com",
        f"https://{competitor_name.lower().replace(' ', '-')}.com",
    ]
    
    for domain in domain_patterns:
        try:
            response = requests.head(domain, timeout=timeout_per_domain, allow_redirects=True)
            if response.status_code < 400:
                logger.info(f"Layer 1 PASS: {competitor_name} ({domain})")
                return True
        except requests.Timeout:
            logger.warning(f"Layer 1 TIMEOUT: {competitor_name} ({domain})")
            continue
        except Exception:
            continue
    
    logger.warning(f"Layer 1 FAIL: {competitor_name} - no web presence found")
    return False


def validate_competitor_layer2_llm(
    competitor_name: str, 
    client_name: str, 
    market_segment: str,
    openrouter_client
) -> Tuple[float, str]:
    """
    Layer 2: LLM credibility scoring.
    Score how directly competitive is the competitor (1-5 scale).
    
    Args:
        competitor_name: Name of competitor
        client_name: Name of client company
        market_segment: Market segment from discovery
        openrouter_client: OpenRouter API client
        
    Returns:
        Tuple of (credibility_score 1-5, reasoning)
    """
    prompt = f"""Rate how directly competitive is {competitor_name} to {client_name} on a scale 1-5.

Market segment: {market_segment}

Criteria:
- 5: Direct head-to-head competitor in exact same market
- 4: Strong competitor, slight product/market differentiation
- 3: Moderate competitor, overlapping but distinct positioning
- 2: Weak competitor, mostly different market
- 1: Not a competitor or wrong market

Respond in JSON:
{{
  "score": 4,
  "reasoning": "Brief explanation"
}}"""

    try:
        response_text = openrouter_client._call(
            model="deepseek/deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200
        )
        
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        
        if json_match:
            data = json.loads(json_match.group())
            score = float(data.get("score", 0))
            reasoning = data.get("reasoning", "")
            
            status = "PASS" if score >= 3.5 else "FAIL"
            logger.info(f"Layer 2 {status}: {competitor_name} scored {score}/5")
            
            return score, reasoning
    except Exception as e:
        logger.error(f"Error in Layer 2 validation for {competitor_name}: {e}")
    
    return 0.0, "Validation error"


def generate_competitor_aliases_llm(competitor_name: str, openrouter_client) -> List[str]:
    """
    Generate 15+ common variations and aliases for competitor name.
    Includes: abbreviations, typos, camelCase, spacing variations, etc.
    
    Args:
        competitor_name: Name of competitor
        openrouter_client: OpenRouter API client
        
    Returns:
        List of aliases
    """
    prompt = f"""Generate 15 common variations, abbreviations, typos, and alternative names for '{competitor_name}'.

Include:
- CamelCase and PascalCase versions
- With/without spaces
- Common abbreviations or acronyms
- Common misspellings
- Domain variations (if applicable)
- Social media handles style
- Ticker symbols (if publicly traded)

Return JSON:
{{
  "aliases": ["variant1", "variant2", ...]
}}"""

    try:
        response_text = openrouter_client._call(
            model="deepseek/deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300
        )
        
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        
        if json_match:
            data = json.loads(json_match.group())
            aliases = data.get("aliases", [])
            # Add original name
            if competitor_name not in aliases:
                aliases.insert(0, competitor_name)
            logger.info(f"Generated {len(aliases)} aliases for {competitor_name}")
            return aliases
    except Exception as e:
        logger.error(f"Error generating aliases for {competitor_name}: {e}")
    
    # Fallback: basic variations
    fallback = [
        competitor_name,
        competitor_name.lower(),
        competitor_name.replace(" ", "").lower(),
        competitor_name.replace(" ", "-").lower(),
    ]
    return fallback


def validate_competitors_layer3(
    responses: List[str],
    competitors: Dict[str, dict],
    min_appearance_threshold: float = 0.0
) -> Dict[str, dict]:
    """
    Layer 3: Post-audit validation.
    Filter competitors by mention frequency (remove 0% mentions).
    
    Args:
        responses: List of LLM responses from audit
        competitors: Dict of competitors with aliases
        min_appearance_threshold: Minimum appearance % to keep (default 0% = remove only if 0%)
        
    Returns:
        Filtered competitors dict
    """
    response_text = " ".join(responses).lower()
    
    filtered = {}
    for comp_name, comp_data in competitors.items():
        aliases = comp_data.get("aliases", [comp_name])
        
        # Count mentions
        mentions = 0
        for alias in aliases:
            mentions += response_text.count(alias.lower())
        
        # Calculate appearance percentage
        if len(responses) > 0:
            appearance_pct = (mentions / len(responses)) * 100
        else:
            appearance_pct = 0
        
        # Filter: keep if appeared at least once
        if mentions > 0 or min_appearance_threshold == 0:
            comp_data["mention_count"] = mentions
            comp_data["appearance_percentage"] = appearance_pct
            filtered[comp_name] = comp_data
            logger.info(f"Layer 3 KEEP: {comp_name} ({mentions} mentions, {appearance_pct:.1f}%)")
        else:
            logger.info(f"Layer 3 REMOVE: {comp_name} (0 mentions)")
    
    return filtered


def discover_competitors_from_audit_responses(
    responses: List[str],
    client_name: str,
    openrouter_client
) -> List[str]:
    """
    Fallback: Extract competitors from actual audit responses.
    Used when Layer 2 validation returns < 3 competitors.
    
    Args:
        responses: List of LLM responses from audit
        client_name: Name of client
        openrouter_client: OpenRouter API client
        
    Returns:
        List of discovered competitors
    """
    response_sample = "\n".join(responses[:10])  # Sample first 10 responses
    
    prompt = f"""Based on these audit responses about {client_name}, extract any competitors mentioned.
Return ONLY a JSON list of competitor names, no explanations.

Responses sample:
{response_sample}

Return JSON:
{{"competitors": ["Company1", "Company2", ...]}}"""

    try:
        response_text = openrouter_client._call(
            model="deepseek/deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300
        )
        
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        
        if json_match:
            data = json.loads(json_match.group())
            competitors = data.get("competitors", [])
            logger.info(f"Fallback: extracted {len(competitors)} competitors from audit responses")
            return competitors
    except Exception as e:
        logger.error(f"Error in fallback competitor extraction: {e}")
    
    return []


def run_competitor_discovery(
    homepage_url: str,
    homepage_text: str,
    client_name: str,
    openrouter_client,
    min_competitors: int = 5,
    max_competitors: int = 10
) -> Tuple[Dict[str, dict], Dict[str, list]]:
    """
    Complete 3-layer competitor discovery workflow.
    
    Args:
        homepage_url: URL of client homepage
        homepage_text: Parsed text from homepage
        client_name: Name of client company
        openrouter_client: OpenRouter API client
        min_competitors: Minimum competitors to return (triggers fallback if needed)
        max_competitors: Maximum competitors to return
        
    Returns:
        Tuple of (competitors dict, competitor_aliases map)
    """
    logger.info(f"Starting competitor discovery for {client_name}")
    
    # Step 1: Extract explicit mentions
    homepage_html = ""  # Would need to parse homepage_url to get HTML
    explicit = extract_explicit_competitors(homepage_html, homepage_url)
    logger.info(f"Step 1 (Explicit): found {len(explicit)} competitors")
    
    # Step 2: LLM identifies Tier-1 competitors
    llm_competitors, market_segment = identify_tier1_competitors_llm(
        homepage_text,
        client_name,
        openrouter_client
    )
    logger.info(f"Step 2 (LLM): identified {len(llm_competitors)} competitors")
    
    # Merge explicit + LLM, deduplicate
    candidate_competitors = list(set(explicit + llm_competitors))
    logger.info(f"Step 2 Result: {len(candidate_competitors)} candidate competitors (after dedup)")
    
    # Step 3: Layer 1 validation (web scrape)
    layer1_passed = []
    for comp in candidate_competitors:
        if validate_competitor_layer1(comp):
            layer1_passed.append(comp)
    logger.info(f"Step 3 (Layer 1): {len(layer1_passed)} passed web scrape validation")
    
    # Step 4: Layer 2 validation (LLM credibility scoring)
    layer2_passed = {}
    for comp in layer1_passed:
        score, reasoning = validate_competitor_layer2_llm(
            comp,
            client_name,
            market_segment,
            openrouter_client
        )
        if score >= 3.5:
            layer2_passed[comp] = {
                "credibility_score": score,
                "reasoning": reasoning,
                "market_segment": market_segment,
                "tier": 1,
            }
    
    logger.info(f"Step 4 (Layer 2): {len(layer2_passed)} passed credibility scoring (score >= 3.5)")
    
    # Check if we have enough competitors
    if len(layer2_passed) < min_competitors:
        logger.warning(f"Only {len(layer2_passed)} competitors found, minimum is {min_competitors}. Will use fallback during audit.")
    
    # Step 5: Generate aliases for each validated competitor
    competitor_aliases = {}
    for comp_name, comp_data in layer2_passed.items():
        aliases = generate_competitor_aliases_llm(comp_name, openrouter_client)
        comp_data["aliases"] = aliases
        competitor_aliases[comp_name] = aliases
    
    # Limit to max_competitors (by credibility score, descending)
    if len(layer2_passed) > max_competitors:
        sorted_comps = sorted(
            layer2_passed.items(),
            key=lambda x: x[1]["credibility_score"],
            reverse=True
        )
        layer2_passed = dict(sorted_comps[:max_competitors])
        logger.info(f"Trimmed to top {max_competitors} by credibility score")
    
    logger.info(f"Competitor discovery complete: {len(layer2_passed)} final competitors")
    
    return layer2_passed, competitor_aliases
