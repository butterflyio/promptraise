## Supra AI Visibility Dashboard (Supra.com)

This folder packages the BotSee-based AI visibility dashboard for Supra. Deploy it as a static site on Netlify and map it to `report.promptraise.com` for client-ready sharing.

### Contents
- `index.html`: Self-contained dashboard (HTML/CSS/JS) including BotSee results, score visualizations, competitive analysis, and recommendations. All datasets are baked into inline JS for confidentiality.

### Updating the Dashboard
1. Re-run the BotSee CLI for Supra (site UUID `5acad24e-ea76-4dfc-82a2-15c35d89f53d`).
2. Refresh the datasets inside `index.html` (keywords, sources, opportunities, scores, etc.).
3. Update the `Analysis ID` and timestamp text if BotSee generates new IDs.
4. Commit changes and push to GitHub; Netlify will redeploy automatically.

### Netlify Deployment Steps
1. In Netlify, create a new site from Git and select the `butterflyio/promptraise` repository.
2. Set **Base directory** to `dashboards/supra-report`, **Build command** empty, and **Publish directory** to `dashboards/supra-report` (static export).
3. Deploy to receive a temporary Netlify subdomain, then add the custom domain `report.promptraise.com` under **Domain management**.
4. Since the apex domain already runs on Netlify, add the subdomain inside Netlify DNS or create a CNAME (`report -> <site>.netlify.app`) at your external DNS provider.
5. Once DNS propagates, enable HTTPS via Netlify's automatic Let’s Encrypt certificate.

### Live Sharing Guidance
- Favor the live Netlify URL (`report.promptraise.com`) for clients—this preserves animations, charts, and layout fidelity.
- The built-in PDF export remains as a fallback but is lower quality than the live experience.

### Confidentiality Note
- The footer reiterates “Generated in full confidentiality by www.promptraise.com”; avoid distributing raw data sources outside controlled channels.
