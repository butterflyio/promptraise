# Promptraise - Development & Deployment Workflow

## Overview

This document outlines the development workflow, deployment process, and best practices for the Promptraise AI Visibility Audit platform.

---

## 1. Environment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      DEVELOPMENT                             │
│  Local Machine                                               │
│  URL: localhost:3000                                        │
│  Branch: feature/*, bugfix/*                                │
│  Purpose: Local development & testing                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ git push
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      PREVIEW (STAGING)                      │
│  Vercel Preview                                             │
│  URL: https://promptraise-[hash].vercel.app                │
│  Branch: Any PR branch                                      │
│  Purpose: Team review, QA testing                          │
│  Auto-created: On every PR/commit                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ merge to main
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      PRODUCTION                              │
│  Vercel Production                                         │
│  URL: audit.promptraise.com                                 │
│  Branch: main                                              │
│  Purpose: Live users                                       │
│  Auto-deploy: On merge to main                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Git Workflow

### 2.1 Branch Naming Convention

| Type | Pattern | Example |
|------|----------|---------|
| Feature | `feature/description` | `feature/social-sharing` |
| Bugfix | `bugfix/issue-description` | `bugfix/telegram-webhook` |
| Hotfix | `hotfix/urgent-fix` | `hotfix/production-error` |
| Chore | `chore/task-description` | `chore/update-docs` |

### 2.2 Standard Flow

```bash
# 1. Update main branch
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feature/my-new-feature

# 3. Make changes and commit
git add .
git commit -m "Add: Description of changes"

# 4. Push branch
git push origin feature/my-new-feature

# 5. Create Pull Request on GitHub
# - Review changes
# - Get approval
# - Merge to main

# 6. Vercel auto-deploys to production
```

---

## 3. Vercel Setup

### 3.1 Preview Deployments

Vercel automatically creates preview deployments for every branch and PR.

| Branch | Preview URL | Purpose |
|--------|-------------|---------|
| `feature/social-sharing` | `https://promptraise-[hash].vercel.app` | Testing new feature |
| `bugfix/telegram` | `https://promptraise-[hash].vercel.app` | Testing bug fix |
| `main` | `audit.promptraise.com` | Production |

### 3.2 Environment Variables

| Variable | Development | Preview | Production |
|----------|-------------|---------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Local | Vercel | Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Local | Vercel | Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Local | Vercel | Vercel |
| `BOTSEE_API_KEY` | Local | Vercel | Vercel |
| `TELEGRAM_BOT_TOKEN` | Local | Vercel | Vercel |

### 3.3 Adding Environment Variables

1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Add each variable for:
   - [x] Production
   - [x] Preview
   - [x] Development
3. For new builds, Vercel auto-injects these values

---

## 4. Testing Checklist

### 4.1 Before Creating PR

- [ ] Code runs without errors locally
- [ ] TypeScript compilation succeeds
- [ ] No console errors in browser
- [ ] Tested with Supra demo data (`SUPRA2024`)

### 4.2 PR Review Checklist

- [ ] Preview deployment created
- [ ] Tested on preview URL
- [ ] No breaking changes to existing features
- [ ] Documentation updated (if needed)
- [ ] Code follows project conventions

### 4.3 Pre-Production Checklist

- [ ] Merged to main
- [ ] Production deployment successful
- [ ] Tested on production URL
- [ ] Telegram bot works
- [ ] Supabase data persists correctly

---

## 5. Rollback Procedures

### 5.1 Quick Rollback

If production breaks after merge:

```bash
# Option 1: Revert the commit
git revert HEAD
git push origin main

# Option 2: Vercel Dashboard
# 1. Go to Vercel Dashboard → Deployments
# 2. Find last working deployment
# 3. Click "..." → "Promote to Production"
```

### 5.2 Emergency Hotfix

```bash
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/urgent-fix

# 2. Make minimal fix
git add .
git commit -m "Fix: Urgent production issue"

# 3. Push and create PR (mark as hotfix)
git push origin hotfix/urgent-fix

# 4. Review and merge immediately
# Vercel auto-deploys to production
```

---

## 6. Telegram Webhook Setup

### 6.1 Architecture

```
Telegram Bot → Cloudflare Worker → Vercel API
              (Webhook URL)       (audit-promptraise)
```

### 6.2 Setup Steps

1. Create Cloudflare Worker at `telegram.promptraise.com`
2. Worker forwards to Vercel API endpoint
3. Set Telegram webhook:
```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://telegram.promptraise.com/"}'
```

---

## 7. Supabase Database

### 7.1 Tables

| Table | Purpose |
|-------|---------|
| `audits` | Store audit records |
| `telegram_users` | Store Telegram chat IDs |

### 7.2 Common Operations

```sql
-- Check audit status
SELECT * FROM audits WHERE access_code = 'SUPRA2024';

-- Check telegram users
SELECT * FROM telegram_users;

-- Delete old audits (cleanup)
DELETE FROM audits WHERE created_at < NOW() - INTERVAL '90 days';
```

---

## 8. BotSee API

### 8.1 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/sites` | POST | Create site |
| `/api/v1/sites/:id/customer-types/generate` | POST | Generate customer types |
| `/api/v1/customer-types/:id/personas/generate` | POST | Generate personas |
| `/api/v1/personas/:id/questions/generate` | POST | Generate questions |
| `/api/v1/analysis` | POST | Start analysis |
| `/api/v1/analysis/:id` | GET | Check status |

### 8.2 Analysis Flow

```
1. Create Site → uuid
2. Generate Customer Types → customer_type_uuid
3. Generate Personas → persona_uuid[]
4. Generate Questions → for each persona
5. Create Analysis → analysis_uuid
6. Poll for Results → status = 'completed'
7. Fetch Competitors, Keywords, Sources
```

---

## 9. Troubleshooting

### 9.1 Common Issues

| Issue | Solution |
|-------|----------|
| Preview not updating | Force redeploy in Vercel |
| Supabase connection fails | Check environment variables |
| BotSee error | Check API key, site limit |
| Telegram not working | Verify webhook URL |
| Build fails | Check TypeScript errors locally |

### 9.2 Useful Commands

```bash
# Check TypeScript errors
npm run build

# Run lint
npm run lint

# Test locally
npm run dev

# Check git status
git status

# View recent commits
git log --oneline -5
```

---

## 10. Team Members

| Role | Contact |
|------|---------|
| Development | @zk_uae |
| Support | @zk_uae (Telegram) |

---

## 11. Links

| Resource | URL |
|----------|-----|
| Production | https://audit.promptraise.com |
| GitHub | https://github.com/butterflyio/promptraise |
| Vercel Dashboard | https://vercel.com/dashboard |
| Supabase Dashboard | https://supabase.com/dashboard |
| BotSee Dashboard | https://www.botsee.io/dashboard |
| Telegram Bot | @PromptraiseBot |

---

*Last Updated: March 2026*
