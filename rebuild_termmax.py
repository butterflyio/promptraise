#!/usr/bin/env python3
"""Rebuild TermMax dashboard from existing state with fixed position extraction.

Uses the existing 80 responses but applies:
- Fixed position extraction (full text fallback instead of 20-line limit)
- null instead of 0 for missing avg_rank
- Updated dashboard template with N/A display
"""

import json
import os
import sys
from pathlib import Path

# Load .env before imports
repo_root = Path(__file__).parent
env_file = repo_root / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                key, val = line.strip().split("=", 1)
                os.environ.setdefault(key, val)

# Add audit-tool to path
sys.path.insert(0, str(repo_root / "audit-tool"))

from openrouter_batch_client import OpenRouterBatchClient
from insights_generator import InsightsGenerator
from dashboard_renderer import DashboardRenderer
from state_manager import StateManager
from audit import (
    stage_aggregate_openrouter_results,
    stage_generate_insights,
    stage_build_data_model,
    log,
    DEFAULT_DASHBOARDS_DIR,
    TEMPLATE_PATH,
)

SLUG = "termmax-v1"
SITE_NAME = "TermMax"
SITE_URL = "https://ts.finance/"

def main():
    log(f"=== Rebuilding {SLUG} dashboard with fixed position extraction ===")
    
    # Load state
    state = StateManager(SLUG, str(DEFAULT_DASHBOARDS_DIR))
    
    # Get existing data
    batch_result = state.get("batch_result", {})
    ct_data = state.get("ct_persona_data", [])
    homepage_text = state.get("homepage_text", "")
    discovery_batch = state.get("discovery_batch", [])
    
    if not batch_result or not batch_result.get("responses"):
        log("ERROR: No batch_result found in state")
        return
    
    log(f"  Loaded {len(batch_result.get('responses', []))} responses")
    log(f"  Loaded {len(ct_data)} customer types")
    
    # Create clients
    or_client = OpenRouterBatchClient()
    generator = InsightsGenerator()
    
    # Build competitor list from discovery batch
    competitor_list = []
    if discovery_batch:
        for comp in discovery_batch:
            if isinstance(comp, dict):
                competitor_list.append(comp)
            else:
                competitor_list.append({"name": str(comp)})
    
    # Stage 1: Aggregate results (this will re-extract positions from raw responses)
    log("Re-aggregating results with fixed position extraction...")
    
    # Reset aggregation stage so it runs again
    stages = state._state.get("stages", {})
    if "aggregate_openrouter" in stages:
        del stages["aggregate_openrouter"]
    state._save()
    
    aggregated = stage_aggregate_openrouter_results(
        or_client, batch_result, SITE_NAME, competitor_list, state,
        competitor_aliases_map={}
    )
    
    competitors_payload = aggregated.get("competitors", {})
    by_ct = competitors_payload.get("by_customer_type", [])
    overall = competitors_payload.get("overall_summary", {})
    
    # Check if ranks are now populated
    null_ranks = 0
    total_comps = 0
    for ct in by_ct:
        for c in ct.get("competitors", []):
            total_comps += 1
            if c.get("avg_rank") is None:
                null_ranks += 1
    
    log(f"  Competitors with null rank: {null_ranks}/{total_comps}")
    
    all_comp_map = {}
    for ct in by_ct:
        for c in ct.get("competitors", []):
            name = c.get("name")
            if name and name not in all_comp_map:
                all_comp_map[name] = c
    
    top_competitors = sorted(
        all_comp_map.values(),
        key=lambda c: c.get("appearance_percentage", 0),
        reverse=True,
    )[:10]
    
    own_pct = 0
    own_mentioned = overall.get("own_company_mentioned", False)
    for c in top_competitors:
        if c.get("is_own"):
            own_pct = max(own_pct, c.get("appearance_percentage", 0))
    
    customer_types_context = [
        {"name": ct.get("customer_type_name"), "total_responses": ct.get("total_responses", 0)}
        for ct in by_ct
    ]
    
    total_responses = overall.get("total_responses_analyzed", 0)
    if not total_responses:
        total_responses = sum(ct.get("total_responses", 0) for ct in by_ct)
    
    keywords_items = aggregated.get("keywords", [])
    sources_items = aggregated.get("sources", [])
    
    insight_context = {
        "site_name": SITE_NAME,
        "site_url": SITE_URL,
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
    
    # Stage 2: Generate insights
    log("Generating insights...")
    insights = stage_generate_insights(generator, insight_context, state)
    
    # Stage 3: Build data model
    log("Building data model...")
    from datetime import datetime
    site_info = {
        "name": SITE_NAME,
        "url": SITE_URL,
        "domain": "ts.finance",
        "slug": SLUG,
        "analysis_id": f"openrouter-{SLUG}",
        "site_uuid": "openrouter-batch",
        "generated_at": datetime.now().strftime("%B %d, %Y"),
        "font_base_url": "https://butterflyio.github.io/promptraise",
    }
    
    results = {
        "competitors": competitors_payload,
        "keywords": {"keywords": keywords_items},
        "sources": {"sources": sources_items},
        "keyword_opportunities": {"opportunities": aggregated.get("keyword_opportunities", [])},
        "source_opportunities": {"opportunities": aggregated.get("source_opportunities", [])},
    }
    
    data = stage_build_data_model(site_info, results, insights)
    
    # Stage 4: Write files
    output_dir = DEFAULT_DASHBOARDS_DIR / SLUG
    output_dir.mkdir(parents=True, exist_ok=True)
    
    data_path = output_dir / "data.json"
    data_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    log(f"  ✓ data.json written to {data_path}")
    
    renderer = DashboardRenderer(str(TEMPLATE_PATH))
    output_html = output_dir / "index.html"
    renderer.render_to_file(data, str(output_html))
    log(f"  ✓ index.html written to {output_html}")
    
    log("")
    log("=== REBUILD COMPLETE ===")
    log(f"Preview: file://{output_html}")

if __name__ == "__main__":
    main()
