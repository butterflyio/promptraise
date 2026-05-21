## Self AI Visibility Dashboard

This folder contains the Self-branded AI Visibility dashboard used for audits. The HTML file is fully self-contained with inline data, styling, and scripts so it can be deployed easily (e.g., via Netlify) and exported to PDF.

### Files
- `index.html` – full dashboard implementation for Self (site: self.app, analysis ID `640c2229-853d-4c7d-b067-1ac5fd2a3317`).

### Updating the Dashboard
1. Re-run the BotSee workflow (site UUID `d2831626-1681-4d68-bcf8-ae574b0679e8`).
2. Refresh the datasets near the bottom of `index.html` (consumer/partner data, keywords, sources, etc.).
3. Adjust the hero stats, terminology gap, recommendations, and narrative text to match the latest analysis.
4. Update the “Last updated” text and analysis IDs in the header to reflect the new run.
5. Rebuild locally and verify charts/tabs/export before pushing.

### Deployment Notes
- Deploy this folder as a static site (Netlify/GitHub Pages). No build step is required.
- Keep the confidentiality note in the footer intact.
- Use the built-in PDF export for sharing snapshots if live access is unavailable.
