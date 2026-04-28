#!/usr/bin/env python3
"""AI Visibility Audit Tool - Main CLI.

Phase 1: --migrate-existing mode.
  Uses an already-completed BotSee analysis (site_uuid + analysis_id) to
  produce a dashboard via the new reusable template. No new BotSee credits
  are spent; only Claude API calls for insights.

Phase 2 (coming): full end-to-end audit including site creation, persona/
question generation, Web3 detection, and DeepSeek via OpenRouter.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

from botsee_client import BotSeeClient, BotSeeError
from dashboard_renderer import DashboardRenderer
from deepseek_client import DeepSeekClient
from insights_generator import InsightsGenerator
from state_manager import StateManager

# ---------------- Constants ----------------

AUDIT_TOOL_DIR = Path(__file__).parent
REPO_ROOT = AUDIT_TOOL_DIR.parent
DEFAULT_DASHBOARDS_DIR = REPO_ROOT / "dashboards"
TEMPLATE_PATH = AUDIT_TOOL_DIR / "templates" / "dashboard.html"


# ---------------- Helpers ----------------

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def slug_from_url(url: str) -> str:
    """Derive a slug from a URL: staynex.vip -> staynex, foo.bar.co.uk -> foo-bar."""
    parsed = urlparse(url if "://" in url else f"https://{url}")
    host = parsed.netloc or parsed.path
    host = host.lower().strip("/")
    # Strip common TLDs iteratively
    parts = host.split(".")
    # Take the first N parts that aren't TLDs
    tlds = {"com", "org", "net", "io", "co", "uk", "vip", "app",
            "dev", "xyz", "ai", "finance", "tech", "site", "online"}
    # Keep parts up to but not including the TLD chain
    kept = []
    for p in parts:
        if p in tlds and kept:
            break
        kept.append(p)
    slug = "-".join(kept) if kept else host
    # Sanitize
    slug = re.sub(r"[^a-z0-9-]", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "audit"


def title_from_domain(url: str) -> str:
    """Derive a display name from a URL."""
    parsed = urlparse(url if "://" in url else f"https://{url}")
    host = parsed.netloc or parsed.path
    host = host.lower().strip("/")
    first = host.split(".")[0]
    return first.capitalize()


# ---------------- Data transformations ----------------

def transform_competitors(botsee_competitors: list, site_own_url: str = None,
                          site_own_name: str = None, limit: int = 10) -> list:
    """Convert BotSee competitor shape into our dashboard shape."""
    out = []
    for c in botsee_competitors[:limit]:
        out.append({
            "name": c.get("name"),
            "appearance": c.get("appearance_percentage", 0),
            "rank": c.get("avg_rank", 0),
            "providers": c.get("providers", []),
            "isOwn": bool(c.get("is_own", False)),
            "url": c.get("url"),
        })
    return out


def transform_keywords(botsee_keywords, limit: int = 30) -> list:
    """Transform BotSee keyword results into [{text, count}]. Sort by count desc."""
    if isinstance(botsee_keywords, list):
        items = botsee_keywords
    elif isinstance(botsee_keywords, dict):
        items = (
            botsee_keywords.get("keywords")
            or botsee_keywords.get("items")
            or []
        )
    else:
        items = []

    out = []
    for k in items:
        if isinstance(k, str):
            out.append({"text": k, "count": 1})
        elif isinstance(k, dict):
            text = k.get("keyword") or k.get("text") or k.get("term") or ""
            count = k.get("count") or k.get("frequency") or k.get("total_mentions") or 1
            if text:
                out.append({"text": text, "count": count})

    out.sort(key=lambda x: x.get("count", 0), reverse=True)
    return out[:limit]


def transform_sources(botsee_sources, limit: int = 50) -> list:
    """Transform BotSee sources into [{name, url, mentions}].

    BotSee may return a list, or {sources: [...]}, or {items: [...]}.
    Sometimes URLs contain trailing `",` artifacts from the BotSee
    extractor; clean those defensively. Sort by mentions desc and limit.
    """
    if isinstance(botsee_sources, list):
        items = botsee_sources
    elif isinstance(botsee_sources, dict):
        items = (
            botsee_sources.get("sources")
            or botsee_sources.get("items")
            or []
        )
    else:
        items = []

    def _clean(s: str) -> str:
        if not isinstance(s, str):
            return ""
        # Strip trailing `",` and stray quotes
        s = s.strip()
        s = s.rstrip(",").rstrip('"').rstrip("'").rstrip(",").strip()
        return s

    out = []
    for s in items:
        if not isinstance(s, dict):
            continue
        raw_name = s.get("title") or s.get("name") or s.get("domain") or s.get("url", "")
        raw_url = s.get("url") or s.get("domain") or raw_name
        name = _clean(raw_name)
        url = _clean(raw_url)
        mentions = (
            s.get("mentions")
            or s.get("total_mentions")
            or s.get("count")
            or 0
        )
        out.append({"name": name, "url": url, "mentions": mentions})

    # Sort by mentions desc and limit
    out.sort(key=lambda x: x.get("mentions", 0), reverse=True)
    return out[:limit]


def transform_keyword_opportunities(botsee_opps, limit: int = 15) -> list:
    """Transform keyword opportunities into [{text, type}].

    BotSee shape: {opportunities: [{question, total_responses, persona,
    by_model: [{rank, provider, mentioned}]}]}.
    We classify each as 'missing' if the site wasn't mentioned by any provider,
    'low_rank' if it was mentioned but ranked poorly.
    """
    if isinstance(botsee_opps, dict):
        items = (
            botsee_opps.get("opportunities")
            or botsee_opps.get("keyword_opportunities")
            or botsee_opps.get("items")
            or []
        )
    elif isinstance(botsee_opps, list):
        items = botsee_opps
    else:
        items = []

    out = []
    for o in items:
        if not isinstance(o, dict):
            continue
        text = o.get("question") or o.get("keyword") or o.get("text") or ""
        if not text:
            continue

        by_model = o.get("by_model", [])
        any_mentioned = any(m.get("mentioned") for m in by_model if isinstance(m, dict))
        min_rank = None
        for m in by_model:
            if isinstance(m, dict) and m.get("rank"):
                rank = m["rank"]
                if min_rank is None or rank < min_rank:
                    min_rank = rank

        if not any_mentioned:
            opp_type = "missing"
        elif min_rank and min_rank > 3:
            opp_type = "low_rank"
        else:
            continue  # mentioned with good rank → not an opportunity

        out.append({
            "text": text,
            "type": opp_type,
            "persona": o.get("persona", ""),
        })

    return out[:limit]


def transform_source_opportunities(botsee_opps, limit: int = 15) -> list:
    """Transform source opportunities into {name, domain, type}.

    Source opportunities from BotSee use the same shape as sources:
    {sources: [{title, url, mentions, own_company_mentioned}]}.
    Filter out own-site entries, deduplicate by domain, sort by mentions.
    """
    if isinstance(botsee_opps, dict):
        items = (
            botsee_opps.get("sources")
            or botsee_opps.get("opportunities")
            or botsee_opps.get("source_opportunities")
            or botsee_opps.get("items")
            or []
        )
    elif isinstance(botsee_opps, list):
        items = botsee_opps
    else:
        items = []

    def _clean(s: str) -> str:
        if not isinstance(s, str):
            return ""
        return s.strip().rstrip(",").rstrip('"').rstrip("'").rstrip(",").strip()

    def _domain_from_url(url: str) -> str:
        url = _clean(url)
        if not url:
            return ""
        # Strip scheme
        if "://" in url:
            url = url.split("://", 1)[1]
        # Keep only netloc
        url = url.split("/", 1)[0]
        return url

    seen_domains = set()
    out = []
    for o in items:
        if not isinstance(o, dict):
            continue
        if o.get("own_company_mentioned"):
            continue
        title = _clean(o.get("title") or o.get("name") or "")
        url = _clean(o.get("url") or "")
        domain = _domain_from_url(url or title)
        if not domain or domain in seen_domains:
            continue
        seen_domains.add(domain)
        out.append({
            "name": title or domain,
            "domain": domain,
            "type": "competitor",
            "mentions": o.get("mentions", 0),
        })

    out.sort(key=lambda x: x.get("mentions", 0), reverse=True)
    return out[:limit]


def compute_provider_coverage(customer_types: list, deepseek_data: dict = None) -> dict:
    """Count provider appearances across all competitors.

    DeepSeek adds a 4th segment to the doughnut. We estimate its share
    based on whether it mentioned any of the top competitors.
    """
    counts = {}
    total = 0
    for ct in customer_types:
        for c in ct.get("competitors", []):
            for p in c.get("providers", []):
                key = "openai" if p == "openai-search" else p
                counts[key] = counts.get(key, 0) + 1
                total += 1

    if total == 0:
        base = {"claude": 0, "gemini": 0, "openai": 0}
    else:
        base = {k: round((v / total) * 100) for k, v in counts.items()}

    # DeepSeek segment: 0 if not analyzed, else estimate from BotSee ratios
    if deepseek_data and deepseek_data.get("analyzed"):
        deepseek_competitors = len(deepseek_data.get("competitors_mentioned", []))
        if deepseek_competitors > 0:
            base["deepseek"] = 15
        else:
            base["deepseek"] = 0
    else:
        base["deepseek"] = 0

    return base


def compute_score(own_appearance_pct: float, own_avg_rank: float = None) -> int:
    """Simple visibility score 0-100.

    Heavily weighted on appearance. If the site isn't mentioned (0%),
    score is 0. At 50%+ appearance and rank ≤ 3, score approaches 100.
    """
    if not own_appearance_pct or own_appearance_pct <= 0:
        return 0

    # Base: appearance % directly contributes up to 70 points
    appearance_score = min(own_appearance_pct, 70)

    # Rank modifier: up to 30 points for good rank
    rank_score = 0
    if own_avg_rank and own_avg_rank > 0:
        if own_avg_rank <= 1.5:
            rank_score = 30
        elif own_avg_rank <= 3:
            rank_score = 20
        elif own_avg_rank <= 5:
            rank_score = 10

    return min(int(appearance_score + rank_score), 100)


# ---------------- Pipeline stages ----------------

def stage_fetch_botsee_results(client: BotSeeClient, analysis_id: str, state: StateManager) -> dict:
    """Fetch all BotSee result endpoints for a given analysis."""
    if state.is_complete("fetch_results"):
        log("  ✓ Skipping fetch_results (already complete)")
        return state.get("fetch_results")

    log("Fetching BotSee results...")
    results = {}

    log("  → competitors")
    results["competitors"] = client.results_competitors(analysis_id)

    log("  → keywords")
    results["keywords"] = client.results_keywords(analysis_id)

    log("  → sources")
    results["sources"] = client.results_sources(analysis_id)

    log("  → keyword opportunities")
    try:
        results["keyword_opportunities"] = client.results_keyword_opportunities(analysis_id)
    except BotSeeError as e:
        log(f"  ! keyword-opportunities failed: {e}")
        results["keyword_opportunities"] = {}

    log("  → source opportunities")
    try:
        results["source_opportunities"] = client.results_source_opportunities(analysis_id)
    except BotSeeError as e:
        log(f"  ! source-opportunities failed: {e}")
        results["source_opportunities"] = {}

    state.mark_complete("fetch_results", results)
    log("  ✓ Results fetched")
    return results


def stage_scrape_homepage(generator: InsightsGenerator, url: str, state: StateManager) -> str:
    """Scrape homepage for insight context."""
    if state.is_complete("scrape_homepage"):
        log("  ✓ Skipping scrape_homepage (already complete)")
        return state.get("homepage_text", "")

    log(f"Scraping homepage {url}...")
    text = generator.scrape_homepage(url)
    log(f"  ✓ Retrieved {len(text)} chars")
    state.mark_complete("scrape_homepage", text)
    state.set("homepage_text", text)
    return text


def stage_generate_insights(generator: InsightsGenerator, context: dict,
                             state: StateManager) -> dict:
    """Call Claude to generate analytical insights."""
    if state.is_complete("insights"):
        log("  ✓ Skipping insights (already complete)")
        return state.get("insights")

    log("Generating insights via Claude...")
    insights = generator.generate(**context)
    state.mark_complete("insights", insights)
    state.set("insights", insights)
    log("  ✓ Insights generated")
    return insights


def stage_create_site(client: BotSeeClient, domain: str, state: StateManager,
                       types: int = 2, personas: int = 2, questions: int = 5) -> dict:
    """Create a new site in BotSee with customer types, personas, and questions."""
    if state.is_complete("create_site"):
        log("  ✓ Skipping create_site (already complete)")
        return state.get("create_site")

    log(f"Creating BotSee site for {domain}...")
    result = client.create_site(domain, types=types, personas=personas, questions=questions)
    log(f"  ✓ Site created")
    state.mark_complete("create_site", result)
    state.set("create_site", result)
    return result


def stage_generate_types(client: BotSeeClient, site_uuid: str,
                          state: StateManager) -> list:
    """Generate 2 customer types for the site."""
    if state.is_complete("generate_types"):
        log("  ✓ Skipping generate_types (already complete)")
        return state.get("type_uuids", [])

    log("Generating customer types...")
    result = client.generate_types(site_uuid, count=2)
    type_uuids = []
    if isinstance(result, dict) and "customer_types" in result:
        type_uuids = [ct.get("uuid") or ct.get("customer_type_uuid")
                      for ct in result.get("customer_types", [])]
    log(f"  ✓ {len(type_uuids)} types created")
    state.mark_complete("generate_types", type_uuids)
    state.set("type_uuids", type_uuids)
    return type_uuids


def stage_generate_personas(client: BotSeeClient, type_uuids: list,
                              state: StateManager, count: int = 2) -> list:
    """Generate 2 personas per customer type."""
    if state.is_complete("generate_personas"):
        log("  ✓ Skipping generate_personas (already complete)")
        return state.get("persona_uuids", [])

    all_persona_uuids = []
    for type_uuid in type_uuids:
        log(f"  Generating personas for type {type_uuid[:8]}...")
        result = client.generate_personas(type_uuid, count=count)
        uuids = []
        if isinstance(result, dict) and "personas" in result:
            uuids = [p.get("uuid") or p.get("persona_uuid")
                     for p in result.get("personas", [])]
        elif isinstance(result, list):
            uuids = [p.get("uuid") or p.get("persona_uuid") for p in result]
        all_persona_uuids.extend(uuids)
        log(f"  ✓ {len(uuids)} personas created")

    state.mark_complete("generate_personas", all_persona_uuids)
    state.set("persona_uuids", all_persona_uuids)
    return all_persona_uuids


def stage_generate_questions(client: BotSeeClient, persona_uuids: list,
                               state: StateManager, count: int = 5) -> None:
    """Generate 5 questions per persona."""
    if state.is_complete("generate_questions"):
        log("  ✓ Skipping generate_questions (already complete)")
        return

    for persona_uuid in persona_uuids:
        log(f"  Generating questions for persona {persona_uuid[:8]}...")
        result = client.generate_questions(persona_uuid, count=count)
        log(f"  ✓ Questions generated")

    state.mark_complete("generate_questions", {"count": len(persona_uuids)})


def stage_run_analysis(client: BotSeeClient, site_uuid: str,
                        state: StateManager,
                        models: str = "claude,gemini,openai") -> str:
    """Run BotSee analysis and poll until completion."""
    if state.is_complete("run_analysis"):
        log("  ✓ Skipping run_analysis (already complete)")
        return state.get("analysis_id")

    log("Starting BotSee analysis...")
    result = client.run_analysis(site_uuid, models=models)
    analysis_id = result.get("uuid") or result.get("analysis_uuid") or result.get("id")
    if not analysis_id:
        # The CLI may have printed "Analysis started" without returning the ID
        # List latest analyses to find it
        log("  Analysis started — fetching analysis ID...")
        analyses = client.list_analyses(site_uuid, limit=1)
        if isinstance(analyses, dict) and "analyses" in analyses:
            analysis_id = analyses["analyses"][0].get("uuid")
        elif isinstance(analyses, list) and analyses:
            analysis_id = analyses[0].get("uuid")

    if not analysis_id:
        raise BotSeeError("Could not determine analysis_id from BotSee response")

    state.set("analysis_id", analysis_id)
    log(f"  Analysis ID: {analysis_id}")

    # Poll for completion
    log("  Polling for completion...")
    for attempt in range(30):
        import time
        time.sleep(10)
        analyses = client.list_analyses(site_uuid, limit=1)
        status = None
        if isinstance(analyses, dict):
            if "analyses" in analyses:
                status = analyses["analyses"][0].get("status")
            elif "status" in analyses:
                status = analyses.get("status")
        elif isinstance(analyses, list) and analyses:
            status = analyses[0].get("status")

        if status == "completed":
            log(f"  ✓ Analysis completed")
            break
        elif status == "failed":
            raise BotSeeError("BotSee analysis failed")
        log(f"  Waiting... (attempt {attempt + 1}/30)")

    state.mark_complete("run_analysis", analysis_id)
    return analysis_id


def stage_deepseek_analysis(ds_client: DeepSeekClient, site_name: str,
                             site_url: str, top_competitors: list,
                             state: StateManager) -> dict:
    """Query DeepSeek about brand visibility and competitive landscape."""
    if state.is_complete("deepseek_analysis"):
        log("  ✓ Skipping deepseek_analysis (already complete)")
        return state.get("deepseek_data", {})

    log("Analyzing brand via DeepSeek (OpenRouter)...")
    comp_names = [c.get("name") for c in top_competitors[:10]]

    try:
        result = ds_client.analyze_brand(
            brand_name=site_name,
            brand_description=f"Site: {site_url}",
            competitors=comp_names,
        )
        # Normalize: extract top competitors from DeepSeek response
        ds_competitors = result.get("top_competitors", [])
        competitors_mentioned = [c["name"] for c in ds_competitors
                                  if isinstance(c, dict) and c.get("name")]
        deepseek_data = {
            "analyzed": True,
            "brand_visibility": result.get("brand_visibility", {}),
            "top_competitors": ds_competitors,
            "competitors_mentioned": competitors_mentioned,
            "sources_cited": result.get("sources_cited", []),
            "ai_usage": result.get("ai_usage", {}),
        }
    except Exception as e:
        log(f"  ! DeepSeek analysis failed: {e}")
        deepseek_data = {"analyzed": False, "error": str(e)}

    state.mark_complete("deepseek_analysis", deepseek_data)
    state.set("deepseek_data", deepseek_data)
    log(f"  ✓ DeepSeek analysis complete")
    return deepseek_data


def stage_build_data_model(site_info: dict, botsee_results: dict,
                            insights: dict, deepseek_data: dict = None) -> dict:
    """Merge everything into the final dashboard data model."""
    competitors_payload = botsee_results.get("competitors", {})

    # BotSee returns per-customer-type data under by_customer_type
    by_ct = competitors_payload.get("by_customer_type", [])
    overall_summary = competitors_payload.get("overall_summary", {})

    customer_types = []
    for ct in by_ct:
        transformed = transform_competitors(ct.get("competitors", []))
        # Build provider order summary: maps provider name → rank position (0 = first-listed)
        providers_seen = []
        for c in ct.get("competitors", []):
            for p in c.get("providers", []):
                if p not in providers_seen:
                    providers_seen.append(p)
        provider_order_summary = {p: i for i, p in enumerate(providers_seen)}
        customer_types.append({
            "name": ct.get("customer_type_name", "Unknown"),
            "uuid": ct.get("customer_type_uuid"),
            "competitors": transformed,
            "total_responses": ct.get("total_responses", 0),
            "provider_order_summary": provider_order_summary,
        })

    # Detect whether both CT slots have identical competitor appearance rates.
    # If so, the BotSee analysis returned the same aggregated data for both,
    # and we flag it so the dashboard can show a data-limitation note.
    if len(customer_types) >= 2:
        ct0_appearances = sorted(
            (c["name"], c["appearance"]) for c in customer_types[0]["competitors"]
        )
        ct1_appearances = sorted(
            (c["name"], c["appearance"]) for c in customer_types[1]["competitors"]
        )
        identical_appearances = ct0_appearances == ct1_appearances
    else:
        identical_appearances = True

    for i, ct_data in enumerate(customer_types):
        ct_data["has_distinct_competitor_data"] = not identical_appearances
        if identical_appearances and i == 1:
            ct_data["data_note"] = (
                "Share of Voice percentages reflect the same aggregated BotSee analysis "
                "for this site. Both customer type tabs display identical competitor rankings "
                "because BotSee did not return per-segment appearance data for this analysis. "
                "The provider ordering and source URLs differ per segment."
            )
        else:
            ct_data["data_note"] = None

    # Find own appearance % (highest across customer types)
    own_appearance_pct = 0
    own_avg_rank = None
    for ct in by_ct:
        for c in ct.get("competitors", []):
            if c.get("is_own"):
                own_appearance_pct = max(own_appearance_pct, c.get("appearance_percentage", 0))
                if own_avg_rank is None or (c.get("avg_rank") and c["avg_rank"] < own_avg_rank):
                    own_avg_rank = c.get("avg_rank")

    score = compute_score(own_appearance_pct, own_avg_rank)
    own_mentioned = overall_summary.get("own_company_mentioned", own_appearance_pct > 0)

    # Score status
    if score == 0:
        score_status = "Zero AI Visibility"
        own_note = f"Site NOT mentioned in AI responses"
    elif score < 25:
        score_status = "Very Low AI Visibility"
        own_note = f"Site mentioned in {own_appearance_pct}% of responses"
    elif score < 50:
        score_status = "Low AI Visibility"
        own_note = f"Site mentioned in {own_appearance_pct}% of responses"
    elif score < 75:
        score_status = "Moderate AI Visibility"
        own_note = f"Site mentioned in {own_appearance_pct}% of responses"
    else:
        score_status = "Strong AI Visibility"
        own_note = f"Site mentioned in {own_appearance_pct}% of responses"

    # Top 2 competitors for hero comparison
    all_competitors_sorted = sorted(
        (c for ct in by_ct for c in ct.get("competitors", []) if not c.get("is_own")),
        key=lambda c: c.get("appearance_percentage", 0),
        reverse=True,
    )
    # Dedupe by name
    seen = set()
    top_competitors = []
    for c in all_competitors_sorted:
        if c.get("name") not in seen:
            seen.add(c.get("name"))
            top_competitors.append(c)

    hero_comparison = [
        {
            "value": f"{own_appearance_pct}%",
            "label": f"{site_info['name']} Visibility",
            "trend": "down" if own_appearance_pct < 25 else ("up" if own_appearance_pct > 50 else ""),
        }
    ]
    if len(top_competitors) >= 1:
        hero_comparison.append({
            "value": f"{top_competitors[0].get('appearance_percentage', 0)}%",
            "label": f"{top_competitors[0].get('name')} (Leader)",
            "trend": "",
        })
    if len(top_competitors) >= 2:
        hero_comparison.append({
            "value": f"{top_competitors[1].get('appearance_percentage', 0)}%",
            "label": f"{top_competitors[1].get('name')} (#2)",
            "trend": "",
        })

    total_responses = overall_summary.get("total_responses_analyzed", 0)
    # BotSee's overall total often only reports one customer type's count.
    # If the sum of per-CT responses differs, use the sum (it's accurate).
    sum_per_ct = sum(ct.get("total_responses", 0) for ct in by_ct)
    if sum_per_ct > total_responses:
        total_responses = sum_per_ct

    data = {
        "site": site_info,
        "summary": {
            "score": score,
            "score_status": score_status,
            "total_responses": total_responses,
            "responses_per_type": total_responses // max(len(by_ct), 1),
            "unique_competitors": overall_summary.get("total_unique_competitors", 0),
            "own_mentioned": own_mentioned,
            "own_appearance_pct": own_appearance_pct,
            "own_appearance_note": own_note,
            "hero_comparison": hero_comparison,
        },
        "customer_types": customer_types,
        "keywords": transform_keywords(botsee_results.get("keywords", {})),
        "sources": transform_sources(botsee_results.get("sources", {})),
        "keyword_opportunities": transform_keyword_opportunities(botsee_results.get("keyword_opportunities", {})),
        "source_opportunities": transform_source_opportunities(botsee_results.get("source_opportunities", {})),
        "provider_coverage": compute_provider_coverage(customer_types, deepseek_data),
        "deepseek_data": deepseek_data or {},
        "insights": insights,
    }

    return data


# ---------------- Main CLI ----------------

def run_migrate_existing(args):
    """Phase 1: migrate an existing BotSee analysis to the new template."""
    load_dotenv(REPO_ROOT / ".env")

    # Derive site info
    site_url = args.url
    if not site_url.startswith("http"):
        site_url = f"https://{site_url}"

    parsed = urlparse(site_url)
    domain = parsed.netloc or parsed.path.strip("/")
    slug = args.slug or slug_from_url(site_url)
    site_name = args.name or title_from_domain(site_url)

    log(f"=== AI Visibility Audit: {site_name} ({site_url}) ===")
    log(f"Slug: {slug}")
    log(f"Analysis ID: {args.analysis_id}")

    # Init state
    state = StateManager(slug, str(DEFAULT_DASHBOARDS_DIR))
    if args.fresh:
        state.reset()
        log("State reset (--fresh)")

    # Seed state with known IDs
    state.set("site_uuid", args.site_uuid)
    state.set("analysis_id", args.analysis_id)
    state.set("site_url", site_url)
    state.set("site_slug", slug)
    state.set("site_name", site_name)

    # Clients
    botsee = BotSeeClient()

    try:
        generator = InsightsGenerator()
    except RuntimeError as e:
        log(f"ERROR: {e}")
        log("Add OPENROUTER_API_KEY to your .env file and try again.")
        sys.exit(1)

    # Stage 1: Fetch BotSee results
    results = stage_fetch_botsee_results(botsee, args.analysis_id, state)

    # Stage 2: Scrape homepage
    homepage_text = stage_scrape_homepage(generator, site_url, state)

    # Preview data summary for insights generation
    competitors_payload = results.get("competitors", {})
    by_ct = competitors_payload.get("by_customer_type", [])
    overall = competitors_payload.get("overall_summary", {})

    # Build flat top competitors list for insights context
    all_comp_map = {}
    for ct in by_ct:
        for c in ct.get("competitors", []):
            name = c.get("name")
            if name not in all_comp_map or c.get("appearance_percentage", 0) > all_comp_map[name].get("appearance_percentage", 0):
                all_comp_map[name] = c
    top_competitors = sorted(all_comp_map.values(),
                              key=lambda c: c.get("appearance_percentage", 0),
                              reverse=True)[:10]

    own_pct = 0
    own_mentioned = overall.get("own_company_mentioned", False)
    for c in top_competitors:
        if c.get("is_own"):
            own_pct = max(own_pct, c.get("appearance_percentage", 0))

    customer_types_context = [
        {"name": ct.get("customer_type_name"), "total_responses": ct.get("total_responses", 0)}
        for ct in by_ct
    ]

    keywords_raw = results.get("keywords", {})
    keywords_items = keywords_raw.get("keywords") if isinstance(keywords_raw, dict) else keywords_raw
    if keywords_items is None and isinstance(keywords_raw, dict):
        keywords_items = keywords_raw.get("items", [])
    keywords_items = keywords_items or []

    sources_raw = results.get("sources", {})
    sources_items = sources_raw.get("sources") if isinstance(sources_raw, dict) else sources_raw
    if sources_items is None and isinstance(sources_raw, dict):
        sources_items = sources_raw.get("items", [])
    sources_items = sources_items or []

    total_responses = overall.get("total_responses_analyzed", 0)
    if not total_responses:
        total_responses = sum(ct.get("total_responses", 0) for ct in by_ct)

    insight_context = {
        "site_name": site_name,
        "site_url": site_url,
        "homepage_text": homepage_text,
        "total_responses": total_responses,
        "unique_competitors": overall.get("total_unique_competitors", 0),
        "own_mentioned": own_mentioned,
        "own_appearance_pct": own_pct,
        "top_competitors": top_competitors,
        "top_keywords": keywords_items,
        "top_sources": sources_items,
        "customer_types": customer_types_context,
    }

    # Stage 3: Generate insights
    insights = stage_generate_insights(generator, insight_context, state)

    # Stage 4: Build final data model
    log("Building final data model...")
    site_info = {
        "name": site_name,
        "url": site_url,
        "domain": domain,
        "slug": slug,
        "analysis_id": args.analysis_id,
        "site_uuid": args.site_uuid,
        "generated_at": datetime.utcnow().strftime("%B %d, %Y"),
        "font_base_url": "https://butterflyio.github.io/promptraise",
    }
    data = stage_build_data_model(site_info, results, insights)

    # Persist data.json for inspection
    output_dir = DEFAULT_DASHBOARDS_DIR / slug
    output_dir.mkdir(parents=True, exist_ok=True)
    data_path = output_dir / "data.json"
    data_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    log(f"  ✓ data.json written to {data_path}")

    # Stage 5: Render dashboard
    log("Rendering dashboard...")
    renderer = DashboardRenderer(str(TEMPLATE_PATH))
    output_html = output_dir / "index.html"
    renderer.render_to_file(data, str(output_html))
    log(f"  ✓ index.html written to {output_html}")

    state.mark_complete("render_dashboard", {"output_path": str(output_html)})

    # Done
    log("")
    log("=" * 60)
    log("✓ AUDIT COMPLETE")
    log("=" * 60)
    log(f"")
    log(f"Dashboard: {output_html}")
    log(f"")
    log(f"To preview:")
    log(f"  cd dashboards/{slug}")
    log(f"  python3 -m http.server 9000")
    log(f"  open http://localhost:9000")
    log("")


def run_full_audit(args):
    """Phase 2: full end-to-end audit with site creation + DeepSeek."""
    load_dotenv(REPO_ROOT / ".env")

    site_url = args.url
    if not site_url.startswith("http"):
        site_url = f"https://{site_url}"

    parsed = urlparse(site_url)
    domain = parsed.netloc or parsed.path.strip("/")
    slug = args.slug or slug_from_url(site_url)
    site_name = args.name or title_from_domain(site_url)

    log(f"=== AI Visibility Audit (Full): {site_name} ({site_url}) ===")
    log(f"Slug: {slug}")

    # Init state
    state = StateManager(slug, str(DEFAULT_DASHBOARDS_DIR))
    if args.fresh:
        state.reset()
        log("State reset (--fresh)")

    state.set("site_url", site_url)
    state.set("site_slug", slug)
    state.set("site_name", site_name)

    # Clients
    botsee = BotSeeClient()

    try:
        generator = InsightsGenerator()
        ds_client = DeepSeekClient()
    except RuntimeError as e:
        log(f"ERROR: {e}")
        log("Add OPENROUTER_API_KEY to your .env file and try again.")
        sys.exit(1)

    # Stage 1: Create site in BotSee
    site_result = stage_create_site(botsee, domain, state)
    site_uuid = (
        site_result.get("uuid")
        or site_result.get("site_uuid")
        or site_result.get("id")
    )
    if not site_uuid:
        raise BotSeeError("Could not determine site_uuid from create_site response")
    state.set("site_uuid", site_uuid)
    log(f"  Site UUID: {site_uuid}")

    # Stage 2: Generate customer types
    type_uuids = stage_generate_types(botsee, site_uuid, state)

    # Stage 3: Generate personas
    persona_uuids = stage_generate_personas(botsee, type_uuids, state)

    # Stage 4: Generate questions
    stage_generate_questions(botsee, persona_uuids, state)

    # Stage 5: Run analysis
    analysis_id = stage_run_analysis(botsee, site_uuid, state)
    state.set("analysis_id", analysis_id)

    # Stage 6: Fetch BotSee results
    results = stage_fetch_botsee_results(botsee, analysis_id, state)

    # Stage 7: DeepSeek analysis
    competitors_payload = results.get("competitors", {})
    by_ct = competitors_payload.get("by_customer_type", [])
    all_comp_map = {}
    for ct in by_ct:
        for c in ct.get("competitors", []):
            name = c.get("name")
            if name not in all_comp_map:
                all_comp_map[name] = c
    top_competitors = sorted(all_comp_map.values(),
                              key=lambda c: c.get("appearance_percentage", 0),
                              reverse=True)[:10]

    deepseek_data = stage_deepseek_analysis(
        ds_client, site_name, site_url, top_competitors, state
    )

    # Stage 8: Scrape homepage
    homepage_text = stage_scrape_homepage(generator, site_url, state)

    # Stage 9: Build insights context
    overall = competitors_payload.get("overall_summary", {})
    by_ct = competitors_payload.get("by_customer_type", [])

    own_pct = 0
    own_mentioned = overall.get("own_company_mentioned", False)
    for c in top_competitors:
        if c.get("is_own"):
            own_pct = max(own_pct, c.get("appearance_percentage", 0))

    customer_types_context = [
        {"name": ct.get("customer_type_name"), "total_responses": ct.get("total_responses", 0)}
        for ct in by_ct
    ]

    keywords_raw = results.get("keywords", {})
    keywords_items = keywords_raw.get("keywords") if isinstance(keywords_raw, dict) else keywords_raw
    if keywords_items is None and isinstance(keywords_raw, dict):
        keywords_items = keywords_raw.get("items", [])
    keywords_items = keywords_items or []

    sources_raw = results.get("sources", {})
    sources_items = sources_raw.get("sources") if isinstance(sources_raw, dict) else sources_raw
    if sources_items is None and isinstance(sources_raw, dict):
        sources_items = sources_raw.get("items", [])
    sources_items = sources_items or []

    total_responses = overall.get("total_responses_analyzed", 0)
    if not total_responses:
        total_responses = sum(ct.get("total_responses", 0) for ct in by_ct)

    insight_context = {
        "site_name": site_name,
        "site_url": site_url,
        "homepage_text": homepage_text,
        "total_responses": total_responses,
        "unique_competitors": overall.get("total_unique_competitors", 0),
        "own_mentioned": own_mentioned,
        "own_appearance_pct": own_pct,
        "top_competitors": top_competitors,
        "top_keywords": keywords_items,
        "top_sources": sources_items,
        "customer_types": customer_types_context,
    }

    # Stage 10: Generate insights
    insights = stage_generate_insights(generator, insight_context, state)

    # Stage 11: Build final data model
    log("Building final data model...")
    site_info = {
        "name": site_name,
        "url": site_url,
        "domain": domain,
        "slug": slug,
        "analysis_id": analysis_id,
        "site_uuid": site_uuid,
        "generated_at": datetime.utcnow().strftime("%B %d, %Y"),
        "font_base_url": "https://butterflyio.github.io/promptraise",
    }
    data = stage_build_data_model(site_info, results, insights, deepseek_data)

    # Persist data.json
    output_dir = DEFAULT_DASHBOARDS_DIR / slug
    output_dir.mkdir(parents=True, exist_ok=True)
    data_path = output_dir / "data.json"
    data_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    log(f"  ✓ data.json written to {data_path}")

    # Stage 12: Render dashboard
    log("Rendering dashboard...")
    renderer = DashboardRenderer(str(TEMPLATE_PATH))
    output_html = output_dir / "index.html"
    renderer.render_to_file(data, str(output_html))
    log(f"  ✓ index.html written to {output_html}")

    state.mark_complete("render_dashboard", {"output_path": str(output_html)})

    log("")
    log("=" * 60)
    log("✓ FULL AUDIT COMPLETE")
    log("=" * 60)
    log(f"")
    log(f"Dashboard: {output_html}")
    log(f"Site UUID: {site_uuid}")
    log(f"Analysis ID: {analysis_id}")
    log("")
    log(f"To preview:")
    log(f"  cd {output_dir}")
    log(f"  python3 -m http.server 9000")
    log(f"  open http://localhost:9000")
    log("")


def main():
    parser = argparse.ArgumentParser(
        description="AI Visibility Audit Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:

  # Migrate existing Staynex analysis (Phase 1)
  python3 audit.py --migrate-existing \\
      --url https://staynex.vip \\
      --site-uuid c73a64b1-8118-45e7-b170-e43e7056c793 \\
      --analysis-id 5b08288f-f375-4113-b204-863556a14ab8 \\
      --slug staynex-v2

  # Resume an interrupted audit
  python3 audit.py --migrate-existing --url https://staynex.vip \\
      --site-uuid ... --analysis-id ... --slug staynex-v2

  # Start fresh (ignore prior state)
  python3 audit.py --migrate-existing --url ... --site-uuid ... \\
      --analysis-id ... --slug ... --fresh
""",
    )

    parser.add_argument("--migrate-existing", action="store_true",
                        help="Phase 1 mode: use an existing BotSee analysis.")
    parser.add_argument("--full-audit", action="store_true",
                        help="Phase 2 mode: create site + run analysis + DeepSeek.")
    parser.add_argument("--url", required=True, help="Site URL (e.g. https://staynex.vip)")
    parser.add_argument("--site-uuid", help="BotSee site UUID (required for --migrate-existing)")
    parser.add_argument("--analysis-id", help="BotSee analysis UUID (required for --migrate-existing)")
    parser.add_argument("--slug", help="Output directory slug (auto-derived from URL if omitted)")
    parser.add_argument("--name", help="Display name for the site (auto-derived from URL if omitted)")
    parser.add_argument("--fresh", action="store_true", help="Ignore prior state and restart")

    args = parser.parse_args()

    if args.migrate_existing:
        if not args.site_uuid or not args.analysis_id:
            parser.error("--migrate-existing requires --site-uuid and --analysis-id")
        run_migrate_existing(args)
    elif args.full_audit:
        run_full_audit(args)
    else:
        parser.error("Specify --migrate-existing or --full-audit.")


if __name__ == "__main__":
    main()
