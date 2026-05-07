"""Dashboard renderer.

Takes a unified data object and renders the HTML template by replacing
placeholders with scalar values and injecting the full data object as JSON.
"""

import json
from datetime import datetime
from pathlib import Path


class DashboardRenderer:
    """Renders the dashboard HTML from a data dictionary."""

    def __init__(self, template_path: str):
        self.template_path = Path(template_path)
        if not self.template_path.exists():
            raise FileNotFoundError(f"Template not found: {template_path}")
        self.template = self.template_path.read_text()

    def render(self, data: dict) -> str:
        """Render the template with data. Returns the rendered HTML string."""
        html = self.template

        site = data.get("site", {})
        summary = data.get("summary", {})
        customer_types = data.get("customer_types", [])

        replacements = {
            "{{SITE_NAME}}": site.get("name", ""),
            "{{SITE_URL}}": site.get("url", ""),
            "{{SITE_DOMAIN}}": site.get("domain", ""),
            "{{GENERATED_DATE}}": site.get("generated_at", datetime.utcnow().strftime("%B %d, %Y")),
            "{{ANALYSIS_ID}}": site.get("analysis_id", ""),
            "{{SCORE_STATUS}}": summary.get("score_status", ""),
            "{{TOTAL_RESPONSES}}": str(summary.get("total_responses", 0)),
            "{{RESPONSES_PER_TYPE}}": str(summary.get("responses_per_type", 0)),
            "{{UNIQUE_COMPETITORS}}": str(summary.get("unique_competitors", 0)),
            "{{OWN_APPEARANCE_PCT}}": str(summary.get("own_appearance_pct", 0)),
            "{{OWN_APPEARANCE_NOTE}}": summary.get("own_appearance_note", ""),
            "{{FONT_BASE_URL}}": site.get("font_base_url", ""),
        }

        # Customer type names
        if len(customer_types) >= 1:
            replacements["{{CUSTOMER_TYPE_1_NAME}}"] = customer_types[0].get("customer_type_name", "Customer Type 1")
        else:
            replacements["{{CUSTOMER_TYPE_1_NAME}}"] = "Customer Type 1"

        if len(customer_types) >= 2:
            replacements["{{CUSTOMER_TYPE_2_NAME}}"] = customer_types[1].get("customer_type_name", "Customer Type 2")
        else:
            replacements["{{CUSTOMER_TYPE_2_NAME}}"] = "Customer Type 2"

        # Apply scalar replacements
        for key, value in replacements.items():
            html = html.replace(key, value)

        # Inject full data as JSON (single source of truth for all JS renderers)
        data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        # Escape </script> sequences defensively
        data_json = data_json.replace("</script>", "<\\/script>")
        html = html.replace("{{DASHBOARD_DATA_JSON}}", data_json)

        return html

    def render_to_file(self, data: dict, output_path: str):
        """Render and write to a file."""
        html = self.render(data)
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(html)
        return output_path
