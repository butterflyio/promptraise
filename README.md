# AI Visibility Audit - audit.promptraise.com

A Next.js application for running AI visibility audits using the BotSee API.

## Features

- Enter a website URL to start an AI visibility audit
- Receive a unique 8-digit access code
- View your report at `/audit/[code]`
- Dynamic reports with competitor analysis, LLM breakdowns, and gap analysis

## Tech Stack

- **Frontend**: Next.js 14
- **Backend**: Netlify Functions
- **Database**: Supabase (PostgreSQL)
- **API**: BotSee AI Visibility API
- **Styling**: Tailwind CSS with glass morphism design

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# BotSee API
BOTSEE_API_KEY=your_botsee_api_key

# Netlify (for serverless functions)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 3. Set Up Supabase

1. Create a new Supabase project at https://supabase.com
2. Run the migration in `supabase/migrations/001_initial.sql`
3. Copy your Supabase URL and keys

### 4. Run Locally

```bash
npm run dev
```

Open http://localhost:3000

## Deployment

### Deploy to Netlify

1. Push to GitHub
2. Connect to Netlify
3. Add environment variables in Netlify dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BOTSEE_API_KEY`
4. Deploy!

### Custom Domain

Set up `audit.promptraise.com` in Netlify:
1. Domain settings → Add custom domain
2. Configure DNS records as instructed

## Database Schema

```sql
CREATE TABLE audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code TEXT UNIQUE NOT NULL,
  website_url TEXT NOT NULL,
  company_name TEXT,
  botsee_site_uuid TEXT,
  botsee_analysis_uuid TEXT,
  status TEXT DEFAULT 'pending',
  results JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## API Flow

1. User submits website URL
2. `POST /api/start-audit` creates record in Supabase
3. BotSee site created, personas/questions generated
4. Analysis started (~25 minutes)
5. Report page polls for status updates
6. When ready, results displayed dynamically

## Project Structure

```
├── functions/           # Netlify serverless functions
│   └── start-audit.js  # Start audit endpoint
├── src/
│   ├── components/     # React components
│   ├── lib/           # Utilities (Supabase, BotSee clients)
│   ├── pages/         # Next.js pages
│   └── styles/        # Global CSS
├── supabase/
│   └── migrations/    # Database migrations
└── netlify.toml       # Netlify configuration
```

## License

Private - All rights reserved
