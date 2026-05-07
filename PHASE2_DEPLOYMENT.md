# Phase 2: Custom Domain Deployment (www.audit.promptraise.com)

## Overview
Deploy PromptRaise dashboards to `www.audit.promptraise.com/xyz` where xyz = project name

## Architecture Decision: Vercel

**Why Vercel:**
- ✅ Seamless GitHub integration (auto-deploys on push)
- ✅ Zero-config setup for static sites
- ✅ Global CDN with automatic SSL/TLS
- ✅ Custom domain support
- ✅ Free tier suitable for this use case
- ✅ Built-in preview deployments
- ✅ Easy scaling as dashboards grow

## Implementation Steps

### Step 1: Vercel Project Setup (5 minutes)
1. Go to https://vercel.com/signup (sign up if needed)
2. Connect GitHub account to Vercel
3. Import `butterflyio/promptraise` repository
4. Configure:
   - **Framework**: "Other" (static site)
   - **Build Command**: (leave empty - no build needed)
   - **Output Directory**: `docs`
5. Click "Deploy"

### Step 2: Custom Domain Configuration (10 minutes)
1. In Vercel project settings → Domains
2. Add custom domain: `audit.promptraise.com`
3. Vercel will show DNS records to add:
   - One or more A records pointing to Vercel's IP
   - Or CNAME record if available
4. Go to your domain registrar (GoDaddy, Namecheap, etc.)
5. Add the DNS records Vercel provides
6. Wait 5-30 minutes for DNS propagation

### Step 3: Update Dashboard Organization
```
docs/
├── index.html (landing page - redirects/shows dashboard list)
├── dashboards/
│   ├── icn/
│   │   ├── index.html
│   │   └── data.json
│   ├── coreweave/
│   │   ├── index.html
│   │   └── data.json
│   └── vast/
│       ├── index.html
│       └── data.json
├── .nojekyll
└── vercel.json
```

### Step 4: Create Dashboard Landing Page
The `docs/index.html` will:
- Display list of all available dashboards
- Show status: "Latest audit" timestamp
- Link to each dashboard at `/dashboards/{project-name}/`

**Access URLs:**
- `www.audit.promptraise.com/` → Landing page
- `www.audit.promptraise.com/dashboards/icn/` → ICN dashboard
- `www.audit.promptraise.com/dashboards/coreweave/` → CoreWeave dashboard

### Step 5: Automated Deployment Workflow
Create `scripts/deploy-dashboard.sh`:
```bash
#!/bin/bash
PROJECT_NAME=$1  # e.g., "icn"
AUDIT_DATA=$2    # path to audit output

# Create dashboard directory
mkdir -p docs/dashboards/$PROJECT_NAME

# Copy dashboard files
cp $AUDIT_DATA/index.html docs/dashboards/$PROJECT_NAME/
cp $AUDIT_DATA/data.json docs/dashboards/$PROJECT_NAME/

# Update landing page with new dashboard
python3 scripts/update-dashboard-index.py $PROJECT_NAME

# Commit and push
git add docs/
git commit -m "Deploy dashboard: $PROJECT_NAME"
git push origin master

# Vercel auto-deploys on push
echo "✓ Dashboard deployed to www.audit.promptraise.com/dashboards/$PROJECT_NAME/"
```

## Current Status
- ✅ Repository structure ready (`docs/` folder configured)
- ✅ GitHub Pages working (fallback option)
- ✅ Vercel.json configured and pushed
- ⏳ Pending: Vercel connection & domain setup
- ⏳ Pending: Dashboard restructuring into `/dashboards/` paths

## Next Steps
1. Create Vercel account and import repository
2. Configure custom domain DNS
3. Restructure dashboards into `/dashboards/{project}/` paths
4. Create automated deployment script
5. Test with ICN dashboard

## Timeline Estimate
- Step 1 (Vercel setup): 5 minutes
- Step 2 (Domain DNS): 10 minutes + 5-30 minutes DNS propagation
- Step 3-4 (File restructuring): 15 minutes
- Step 5 (Automation script): 30 minutes

**Total: ~1 hour to production-ready**

## Cost Estimate
- Vercel: FREE tier (suitable for dashboard hosting)
- Custom domain: Already owned (audit.promptraise.com)
- **Total: $0/month**
