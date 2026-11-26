# X Content AI Agent - Implementation Plan

## Project Overview
Build a production-ready AI-powered X content creation agent with 6 specialized agents, running on Cloudflare Workers/Workflows/D1.

---

## Phase 1: Foundation & Configuration (Week 1)

### 1.1 Project Setup
- [ ] Initialize TypeScript project with `package.json`
- [ ] Configure `tsconfig.json` for Cloudflare Workers
- [ ] Set up `wrangler.jsonc` for Cloudflare deployment
- [ ] Configure `.gitignore`
- [ ] Create `.dev.vars.example` for environment variables

### 1.2 Configuration System
- [ ] Create `config/brand.json` - Brand profile (niche, audience, personality, vocabulary, prohibited expressions, content pillars, formats, business objectives)
- [ ] Create `config/sources.json` - Research sources (RSS feeds, GitHub, Hacker News, Hugging Face, Product Hunt, etc.)
- [ ] Create `config/settings.json` - Application settings (AI model configs, rate limits, generation limits, scoring weights)

### 1.3 Database Schema (D1)
- [ ] Create migrations for:
  - `research_topics` - Discovered topics with scores
  - `viral_frameworks` - Analyzed content frameworks
  - `content_drafts` - Generated posts with metadata
  - `feedback` - Human feedback for learning
  - `brand_memory` - Persistent brand knowledge
  - `performance_data` - Historical performance metrics
- [ ] Create `src/database/schema.ts` with TypeScript types

### 1.4 AI Provider Abstraction
- [ ] Create `src/integrations/openrouter.ts` - OpenRouter client with:
  - Model abstraction layer
  - Token budget management
  - Exponential backoff
  - Structured output validation (Zod)
  - Mock mode for testing

---

## Phase 2: Research Integrations (Week 1-2)

### 2.1 RSS Feed Integration
- [ ] `src/integrations/rss.ts` - Parse RSS feeds with:
  - Feed validation
  - Date filtering (24-48 hours)
  - Deduplication
  - Source credibility scoring

### 2.2 GitHub Integration
- [ ] `src/integrations/github.ts` - Monitor:
  - Trending repositories
  - New releases from starred orgs
  - Security advisories
  - Topics: AI, automation, dev tools, cybersecurity

### 2.3 Additional Sources
- [ ] Hacker News API integration
- [ ] Hugging Face model releases
- [ ] Product Hunt launches
- [ ] Research paper APIs (arXiv, etc.)

---

## Phase 3: Agent Implementation (Week 2-3)

### 3.1 Technology Research Agent (`src/agents/researcher.ts`)
- [ ] Discover emerging technology topics
- [ ] Filter by relevance, novelty, freshness
- [ ] Verify sources and claims
- [ ] Output: Structured research with topic, category, summary, verified facts, scores

### 3.2 Viral Content Intelligence Agent (`src/agents/viral-analyst.ts`)
- [ ] Implement R.E.C.O.N. process (Retrieve, Examine, Classify, Originate, Normalize)
- [ ] Analyze 12 mechanisms (contrast, belief revision, recognition, etc.)
- [ ] Apply 8 frameworks (F1-F8)
- [ ] Output: Content opportunities with frameworks, angles, hooks

### 3.3 Content Strategist (`src/agents/strategist.ts`)
- [ ] Select optimal format from 15 content formats
- [ ] Balance timely vs evergreen
- [ ] Avoid duplicate topics
- [ ] Output: Strategy with format, audience, reasoning

### 3.4 Expert X Copywriter (`src/agents/copywriter.ts`)
- [ ] Generate 5 variations per topic
- [ ] Apply frameworks: AIDA, PAS, BAB, curiosity gap, pattern interruption, contrarian, etc.
- [ ] Follow writing rules from playbooks
- [ ] Validate character limits
- [ ] Output: 5 post variations with hooks, frameworks, insights

### 3.5 Fact Checker & Chief Editor (`src/agents/editor.ts`)
- [ ] Verify factual claims against sources
- [ ] Check dates, model names, specs, statistics
- [ ] Detect duplicates/similarity
- [ ] Score using weighted system (Hook 20%, Originality 20%, Factual 20%, Audience 15%, Clarity 10%, Shareability 10%, Brand 5%)
- [ ] Auto-rewrite (max 2 attempts)
- [ ] Output: Scored, refined best draft

### 3.6 Content Performance Analyst (`src/agents/performance-analyst.ts`)
- [ ] Analyze historical performance
- [ ] Identify successful patterns
- [ ] Maintain content intelligence library
- [ ] Process human feedback

---

## Phase 4: Workflow Orchestration (Week 3)

### 4.1 Content Generation Workflow (`src/workflows/content-generation.ts`)
- [ ] Implement full pipeline as Cloudflare Workflow:
  1. Research Sources → Discover Topics → Filter → Deduplicate → Verify
  2. Analyze Frameworks → Discover Angles → Rank Opportunities
  3. Generate Hooks → Create 5 Variations
  4. Fact-Check → Editorial Score → Rewrite → Select Best
  5. Save Draft → Return JSON

### 4.2 Operating Modes
- [ ] Automatic Mode (full pipeline)
- [ ] Topic Mode (research + generate for given topic)
- [ ] URL Mode (research URL + generate)
- [ ] Viral Framework Mode (analyze posts + generate on different topics)
- [ ] Evergreen Mode (timeless content)

---

## Phase 5: Services & Utilities (Week 3-4)

### 5.1 Fact-Checking Service (`src/services/fact-checking.ts`)
- [ ] Claim extraction
- [ ] Source verification
- [ ] Cross-reference validation

### 5.2 Content Scoring (`src/services/content-scoring.ts`)
- [ ] Editorial scoring implementation
- [ ] Character count validation
- [ ] Platform compliance checks

### 5.3 Deduplication (`src/services/deduplication.ts`)
- [ ] Topic similarity detection
- [ ] Content similarity hashing
- [ ] Historical comparison

### 5.4 Brand Memory (`src/services/brand-memory.ts`)
- [ ] Persistent brand knowledge
- [ ] Feedback incorporation
- [ ] Style consistency

---

## Phase 6: API Endpoints (Week 4)

### 6.1 REST API (`src/index.ts`)
- [ ] `POST /api/generate` - Start content generation (all modes)
- [ ] `GET /api/drafts` - List pending drafts
- [ ] `GET /api/drafts/:id` - Get draft details
- [ ] `POST /api/feedback` - Submit human feedback
- [ ] `GET /api/health` - Health check
- [ ] Authentication for future WhatsApp/X integrations

---

## Phase 7: Testing (Week 4-5)

### 7.1 Unit Tests (`tests/`)
- [ ] Agent logic tests (mock AI responses)
- [ ] Scoring algorithm tests
- [ ] Deduplication tests
- [ ] Schema validation tests
- [ ] Integration tests with mocked external APIs

### 7.2 Integration Tests
- [ ] Full workflow test
- [ ] Error handling tests (rate limits, API failures, invalid responses)
- [ ] Duplicate content detection test
- [ ] Character limit validation test

---

## Phase 8: CI/CD & Deployment (Week 5)

### 8.1 GitHub Actions
- [ ] `.github/workflows/test.yml` - Run tests on PR
- [ ] `.github/workflows/deploy.yml` - Deploy to Cloudflare on merge

### 8.2 Deployment Config
- [ ] Wrangler configuration for Workers, Workflows, D1
- [ ] Environment variable management
- [ ] Staging and production environments

---

## Phase 9: Documentation (Week 5)

### 9.1 Documentation
- [ ] `README.md` - Project overview, setup, usage
- [ ] `CONFIGURATION.md` - Brand, sources, settings config
- [ ] `API.md` - Endpoint documentation
- [ ] `DEPLOYMENT.md` - Cloudflare deployment guide
- [ ] `DEVELOPMENT.md` - Local development guide

---

## Detailed Task Breakdown

### Immediate Next Steps (Start Here)
1. Create project structure and configuration files
2. Set up database migrations and schema
3. Build AI provider abstraction (OpenRouter client)
4. Create prompt templates for each agent (in `prompts/`)
5. Implement researcher agent first (independent)

### Dependencies
- D1 database must exist before agents can store data
- OpenRouter client needed by all agents
- Prompts needed before agent implementation
- Workflow needs all agents implemented

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AI Provider | OpenRouter | Model interchangeability, free tier available |
| Database | Cloudflare D1 | Serverless, free tier, integrates with Workers |
| Workflow | Cloudflare Workflows | Durable execution, built-in retry, state persistence |
| Validation | Zod | TypeScript-native, schema-first |
| Testing | Vitest | Fast, TypeScript support, Cloudflare compatible |

---

## File Structure Target

```
x-content-ai-agent/
├── src/
│   ├── agents/
│   │   ├── researcher.ts
│   │   ├── viral-analyst.ts
│   │   ├── strategist.ts
│   │   ├── copywriter.ts
│   │   ├── editor.ts
│   │   └── performance-analyst.ts
│   ├── workflows/
│   │   └── content-generation.ts
│   ├── integrations/
│   │   ├── openrouter.ts
│   │   ├── rss.ts
│   │   ├── github.ts
│   │   └── research.ts
│   ├── services/
│   │   ├── fact-checking.ts
│   │   ├── content-scoring.ts
│   │   ├── deduplication.ts
│   │   └── brand-memory.ts
│   ├── database/
│   │   └── schema.ts
│   ├── schemas/
│   │   └── output.ts (Zod output schemas)
│   ├── utils/
│   │   ├── scoring.ts
│   │   ├── validation.ts
│   │   └── helpers.ts
│   └── index.ts
├── prompts/
│   ├── researcher.md
│   ├── viral-analyst.md
│   ├── strategist.md
│   ├── copywriter.md
│   ├── editor.md
│   ├── performance-analyst.md
│   ├── content-frameworks.md
│   └── brand-voice.md
├── config/
│   ├── brand.json
│   ├── sources.json
│   └── settings.json
├── migrations/
│   └── 0001_initial.sql
├── tests/
├── .github/workflows/
├── wrangler.jsonc
├── package.json
├── tsconfig.json
├── .dev.vars.example
├── .gitignore
└── README.md
```

---

## Acceptance Criteria Checklist

- [ ] Accept topic, URL, or automatic research request
- [ ] Retrieve relevant information from credible sources
- [ ] Extract and verify factual claims
- [ ] Identify original content opportunities
- [ ] Generate 5 distinct X post variations
- [ ] Score and independently evaluate drafts
- [ ] Select strongest post
- [ ] Store draft and supporting research
- [ ] Return valid structured JSON
- [ ] Accept human feedback
- [ ] Use feedback during subsequent generation
- [ ] Pass automated tests
- [ ] Deploy to Cloudflare without continuously running server

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| API rate limits | Exponential backoff, token budgets, configurable limits |
| Invalid AI responses | Zod validation, structured output prompts, retry logic |
| Duplicate content | Multi-layer deduplication (topic + content hash) |
| Factual errors | Independent fact-checking agent, source verification |
| Cost overruns | Token budgets, free model prioritization, execution limits |
| Prompt injection | Input sanitization, output validation, no untrusted content as instructions |

---

## Success Metrics

- All 6 agents implemented and communicating via structured data
- Full pipeline executes in < 60 seconds
- 95%+ uptime on Cloudflare Workers
- < 5% factual error rate in generated content
- Human approval rate > 70% on generated drafts
- Successful deployment to Cloudflare free tier