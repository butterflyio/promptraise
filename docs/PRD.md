# Promptraise AI Visibility Audit - Product Requirements Document (PRD)

## 1. Overview

**Product Name:** Promptraise AI Visibility Audit  
**Version:** 1.0 (MVP)  
**Date:** March 2026  
**Status:** In Development

### Executive Summary

Promptraise is a fully automated AI visibility audit platform that analyzes how AI search engines (ChatGPT, Claude, Gemini) perceive and mention a brand. Users input their website URL and receive a comprehensive report with competitor analysis, terminology gaps, and a 90-day improvement action plan.

---

## 2. Product Vision

**Mission:** Help businesses understand and improve their visibility in AI search results.

**Target Users:**
- Marketing teams
- Brand managers
- SEO professionals
- Web3/Crypto companies
- B2B SaaS businesses

---

## 3. User Flow

### 3.1 Registration Flow

```
User visits audit.promptraise.com
    ↓
Enters Company Name
    ↓
Enters Website URL
    ↓
Enters Telegram Username (@zk_uae for support)
    ↓
Submits form
    ↓
Receives 8-digit Access Code
    ↓
Notified via Telegram when audit is ready
    ↓
Views full report with share option
```

### 3.2 Telegram Bot Flow

```
User starts @PromptraiseBot
    ↓
Bot welcomes with instructions
    ↓
Provides @zk_uae contact for support
    ↓
User submits audit via website
    ↓
Bot notifies when report is ready
    ↓
User clicks report link
```

---

## 4. Feature Requirements

### 4.1 Core Features (MVP)

| Feature | Description | Status |
|---------|-------------|--------|
| Landing Page | Form with company name, URL, Telegram fields | ✅ Complete |
| Supabase Database | Store audits and telegram users | ✅ Complete |
| BotSee Integration | Full API workflow (site → personas → questions → analysis) | ✅ Complete |
| Report Dashboard | Competitors, gaps, LLM breakdown, sources | ✅ Complete |
| 90-Day Plan | Auto-generated from audit data | ✅ Complete |
| CSV Download | Detailed plan for sales team | ✅ Complete |
| Social Sharing | X/LinkedIn buttons (30+ score only) | ✅ Complete |

### 4.2 Future Features

| Feature | Priority | Target |
|---------|----------|--------|
| Email Notifications | Medium | Q2 2026 |
| Bulk Audits | Low | Q2 2026 |
| Competitor Monitoring | Medium | Q3 2026 |
| Weekly Reports | Medium | Q3 2026 |
| White-label Reports | Low | Q3 2026 |
| API Access | Low | Q4 2026 |
| Team Collaboration | Low | Q4 2026 |

---

## 5. Technical Architecture

### 5.1 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React, TypeScript |
| Styling | Tailwind CSS, Glassmorphism |
| Database | Supabase (PostgreSQL) |
| AI Analysis | BotSee API |
| Notifications | Telegram Bot API |
| Deployment | Vercel |
| DNS/Domain | Cloudflare |

### 5.2 Database Schema

#### Table: audits
```sql
id (UUID, PRIMARY KEY)
access_code (TEXT, UNIQUE)
website_url (TEXT)
company_name (TEXT)
telegram_handle (TEXT)
telegram_chat_id (TEXT)
botsee_site_uuid (TEXT)
botsee_analysis_uuid (TEXT)
status (TEXT: pending/processing/ready/failed)
results (JSONB)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

#### Table: telegram_users
```sql
id (UUID, PRIMARY KEY)
username (TEXT, UNIQUE)
chat_id (TEXT)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

### 5.3 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/audit` | POST | Create new audit |
| `/api/audit` | GET | Fetch audit by code |
| `/api/send-telegram` | POST | Send Telegram notification |
| `/api/telegram-webhook` | POST | Receive Telegram updates |
| `/api/download-plan` | GET | Download CSV plan |

---

## 6. Dashboard Sections

### 6.1 Hero Section
- Analysis status badge
- **Social Sharing (30+ score only)** - X & LinkedIn buttons
- Company name & website
- Report title

### 6.2 Stats Overview
- AI Visibility %
- Total Mentions
- Competitors Found
- LLMs Tested
- Verification badge with summary

### 6.3 Competitor Landscape
- AI Visibility comparison chart
- Coverage score circles
- Competitor cards with metrics

### 6.4 LLM Landscape
- Overall visibility distribution (donut chart)
- LLM preference radar
- Individual LLM cards (ChatGPT, Claude, Gemini)
- Mentions breakdown

### 6.5 Sources
- Top cited sources grid
- Backlink opportunities

### 6.6 Gap Analysis
- Terminology gaps table
- Priority badges (High/Medium/Low)

### 6.7 90-Day Action Plan
- Priority actions card
- Key milestones
- Contact button (@zk_uae)
- Phase breakdown (Phase 1-3)

---

## 7. Social Sharing

### Trigger Condition
Visibility score ≥ 30%

### Share Text
```
check out how we rank on LLMs. Get your audit today by visiting audit.promptraise.com
```

### Platforms
| Platform | URL |
|----------|-----|
| X (Twitter) | `https://twitter.com/intent/tweet?text=...` |
| LinkedIn | `https://www.linkedin.com/sharing/share-offsite/?url=...` |

---

## 8. 90-Day Improvement Plan

### Generation Logic
Auto-generated from actual audit data:
- Gap analysis → Terminology improvements
- Keywords → Content targets
- Competitors → Positioning strategy
- Sources → Backlink opportunities

### Phases
| Phase | Weeks | Focus |
|-------|-------|--------|
| 1 | 1-4 | Quick Wins |
| 2 | 5-8 | Content Development |
| 3 | 9-12 | Authority Building |

### CSV Export
Detailed tasks for sales team (internal use only).

---

## 9. Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
BOTSEE_API_KEY=bts_live_xxx
TELEGRAM_BOT_TOKEN=xxx
```

---

## 10. Deployment

### Production
- URL: `audit.promptraise.com`
- Branch: `main`
- Auto-deploy on merge

### Staging/Preview
- URL: Auto-generated per PR
- Branch: Any PR branch
- Vercel Preview Deployments

### Development
- URL: `localhost:3000`
- Branch: Feature branches

---

## 11. Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| BotSee "image input" error | Investigating | May need BotSee support |
| Vercel Auth Protection | Resolved | Using bypass token for webhook |
| Telegram webhook isolation | Pending | Cloudflare Worker setup |

---

## 12. Roadmap

### Q2 2026
- Social Sharing (X, LinkedIn)
- Email Notifications
- Bulk Audits

### Q3 2026
- Competitor Monitoring
- Weekly Reports
- White-label Reports

### Q4 2026
- API Access
- Team Collaboration

---

## 13. Contact

- **Support:** @zk_uae (Telegram)
- **Bot:** @PromptraiseBot

---

*Last Updated: March 2026*
