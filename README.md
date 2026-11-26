# X Content AI Agent

An autonomous AI-powered content creation agent for X (Twitter) that discovers trending technology topics, analyzes high-performing content, and generates engaging, fact-checked posts.

## Features

- **Multi-Agent Architecture**: 6 specialized agents (Researcher, Viral Analyst, Strategist, Copywriter, Editor, Performance Analyst)
- **Real-time Research**: Monitors RSS feeds, GitHub, Hacker News, Hugging Face, Product Hunt, arXiv
- **Viral Intelligence**: Reverse-engineers high-performing posts using R.E.C.O.N. process
- **Fact-Checking**: Independent verification of all factual claims
- **Editorial Scoring**: Weighted rubric (Hook 20%, Originality 20%, Factual 20%, Audience 15%, Clarity 10%, Shareability 10%, Brand 5%)
- **Brand Memory**: Learns from feedback and performance data
- **5 Operating Modes**: Automatic, Topic, URL, Viral Framework, Evergreen
- **Cloudflare Native**: Workers, Workflows, D1 Database
- **Free-tier Optimized**: Uses free AI models where practical

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Content Generation Workflow               │
├─────────────────────────────────────────────────────────────┤
│  Research → Viral Analysis → Strategy → Copywriting → Edit  │
└─────────────────────────────────────────────────────────────┘
         │              │            │           │          │
         ▼              ▼            ▼           ▼          ▼
    ┌─────────┐   ┌───────────┐  ┌─────────┐ ┌───────┐ ┌────────┐
    │Research │   │Viral      │  │Strategist│ │Copy-  │ │Editor  │
    │Agent    │   │Analyst    │  │         │ │writer │ │        │
    └─────────┘   └───────────┘  └─────────┘ └───────┘ └────────┘
         │              │            │           │          │
         └──────────────┴────────────┴───────────┴──────────┘
                                    │
                                    ▼
                         ┌──────────────────┐
                         │  Cloudflare D1   │
                         │  (Persistence)   │
                         └──────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 22+
- Cloudflare account (free tier works)
- OpenRouter API key (free models available)

### Installation

```bash
# Clone and install
git clone <repo>
cd x-content-ai-agent
npm install

# Copy environment template
cp .dev.vars.example .dev.vars

# Edit .dev.vars with your API keys
# Required: OPENROUTER_API_KEY
```

### Configuration

1. **Brand Configuration** (`config/brand.json`):
   - Define your niche, audience, writing personality
   - Set content pillars and weekly targets
   - Add personal opinions and prohibited expressions

2. **Sources** (`config/sources.json`):
   - Enable/disable RSS feeds
   - Configure GitHub topics and organizations
   - Set credibility thresholds

3. **Settings** (`config/settings.json`):
   - AI model selection per agent
   - Editorial scoring weights
   - Content generation limits
   - Platform compliance rules

### Local Development

```bash
# Start local development server
npm run dev

# Run tests
npm run test

# Type checking
npm run typecheck

# Lint
npm run lint
```

### Database Setup

```bash
# Create D1 database
npm run db:create

# Run migrations locally
npm run db:migrate:local

# Run migrations on remote
npm run db:migrate
```

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy

# Or use GitHub Actions (push to main)
```

## Operating Modes

### 1. Automatic Mode
Discovers fresh technology topics and generates relevant posts without requiring a topic.

```json
POST /api/generate
{
  "mode": "automatic"
}
```

### 2. Topic Mode
Generates content around a user-specified topic.

```json
POST /api/generate
{
  "mode": "topic",
  "topic": "AI agent memory architectures"
}
```

### 3. URL Mode
Researches a supplied article, GitHub repo, or product page and converts it into original X content.

```json
POST /api/generate
{
  "mode": "url",
  "url": "https://github.com/langchain-ai/langgraph"
}
```

### 4. Viral Framework Mode
Analyzes supplied high-performing posts, extracts their structural frameworks, and generates original content on different topics.

```json
POST /api/generate
{
  "mode": "viral_framework",
  "sourcePosts": [
    {
      "text": "AI makes prototyping faster. It makes deciding what deserves production more important.",
      "metrics": { "views": 125000, "likes": 3200 }
    }
  ]
}
```

### 5. Evergreen Mode
Creates timeless educational, technical, and thought-leadership content.

```json
POST /api/generate
{
  "mode": "evergreen"
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/generate` | Generate content (all modes) |
| GET | `/api/drafts` | List pending drafts |
| GET | `/api/drafts/:id` | Get draft details |
| POST | `/api/feedback` | Submit human feedback |
| GET | `/api/brand-memory` | Get brand memory |
| GET | `/api/analytics/performance` | Performance analysis |
| GET | `/api/research/topics` | Get research topics |
| POST | `/api/research/trigger` | Trigger manual research |

## Response Format

Every selected draft returns structured JSON:

```json
{
  "draft_id": "draft-20241125-abc123",
  "topic": "AI Production Readiness",
  "category": "ai-agents",
  "content_format": "contrarian_opinion",
  "target_audience": "AI engineers building production systems",
  "hook_type": "unexpected_truth",
  "primary_hook": "AI makes prototyping faster. But it makes deciding what deserves production more important.",
  "alternative_hooks": ["Alternative hook 1", "Alternative hook 2"],
  "recommended_post": "Final polished post text...",
  "alternative_posts": ["Variation 1", "Variation 2", "Variation 3", "Variation 4"],
  "character_count": 267,
  "content_framework": "F2",
  "core_insight": "The bottleneck shifted from building to judging AI features for production",
  "originality_score": 92,
  "editorial_score": 91.5,
  "engagement_potential": "high",
  "fact_check_status": "passed",
  "verified_claims": ["Verified claim 1", "Verified claim 2"],
  "source_urls": ["https://anthropic.com/news/...", "https://..."],
  "source_publication_dates": ["2024-11-25T10:00:00Z"],
  "visual_content_suggestion": "Diagram showing prototype vs production gap",
  "reason_for_selection": "Highest score (91.5), passes all gates",
  "platform_compliance_status": "compliant",
  "requires_manual_publication": true,
  "status": "pending_approval"
}
```

## Project Structure

```
x-content-ai-agent/
├── src/
│   ├── agents/           # 6 specialized agents
│   ├── workflows/        # Cloudflare Workflows
│   ├── integrations/     # OpenRouter, RSS, GitHub, Research
│   ├── services/         # Fact-checking, Scoring, Deduplication, Brand Memory
│   ├── database/         # D1 schema and types
│   ├── schemas/          # Zod validation schemas
│   ├── utils/            # Helpers, prompt loader
│   └── index.ts          # Hono API server
├── prompts/              # Agent prompts (markdown)
├── config/               # Brand, sources, settings
├── migrations/           # D1 database migrations
├── tests/                # Unit and integration tests
├── .github/workflows/    # CI/CD pipelines
├── wrangler.jsonc        # Cloudflare config
├── package.json
├── tsconfig.json
└── README.md
```

## Content Frameworks

The agent uses 8 reusable frameworks (F1-F8):

| ID | Name | Best For |
|----|------|----------|
| F1 | Tension → Mechanism → Implication | Technical trade-offs |
| F2 | Common Belief → Qualification → Better Model | Misconception correction |
| F3 | Observation → Principle → Application | Founder/engineering insights |
| F4 | Before → Friction → After | Automation demos |
| F5 | Claim → Evidence → Decision | Research/tools analysis |
| F6 | Failure → Diagnosis → Lesson | Engineering/operations |
| F7 | Trend → Second-Order Effect → Opportunity | AI/SaaS developments |
| F8 | Checklist → Exception → Priority | Educational posts |

## Editorial Standards

- **Accuracy First**: Factual accuracy is a mandatory gate
- **Audience Relevance**: Specific reader must recognize why it matters
- **Clarity Over Cleverness**: Clear on first read
- **Originality Required**: Not a close paraphrase of another creator
- **No Fabrication**: No invented experiences, statistics, or quotes
- **No Engagement Bait**: "Thoughts?", "Agree?" prohibited

## Testing

```bash
# Run all tests
npm run test

# Run with coverage
npm run test -- --coverage

# Watch mode
npm run test:watch
```

## Configuration Files

### `.dev.vars` (Required)
```bash
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=google/gemma-4-31b-it:free
OPENROUTER_FALLBACK_MODEL=openrouter/free
API_KEY=your-api-key
JWT_SECRET=your-jwt-secret
```

### Free Models on OpenRouter
- `google/gemma-4-31b-it:free`
- `google/gemma-4-26b-a4b-it:free`
- `openrouter/free`

## Deployment Checklist

- [ ] Create Cloudflare D1 database
- [ ] Run migrations: `wrangler d1 migrations apply x-content-agent`
- [ ] Set environment variables in Cloudflare dashboard
- [ ] Configure GitHub secrets for CI/CD
- [ ] Deploy: `wrangler deploy`
- [ ] Verify health endpoint: `https://your-worker.workers.dev/api/health`

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Run `npm run test` and `npm run typecheck`
5. Submit PR

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Built with [Cloudflare Workers](https://workers.cloudflare.com/)
- AI via [OpenRouter](https://openrouter.ai/)
- Framework inspired by Naval Ravikant's writing principles
- Content optimization methods from editorial systems research