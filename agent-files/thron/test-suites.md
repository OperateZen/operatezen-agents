# Thron — Test Suite Specifications

## zen_test_suite.js

**Purpose:** Validate Zen's code changes
**Frequency:** After every PR, daily automated
**Location:** tester/zen_test_suite.js

### Tests
- Functions: 9/9 (agentChat, agentMemory, agentGitHub, agentEmail, agentScheduler, agentCommands, agentBackup, agentApproval, agentCognition)
- Entities: 9/9 (Client, Resource, Subscription, Ticket, Password, CalendarEvent, KnowledgeBase, AgentMessage, Lead)
- Inter-agent messaging
- Approve flow (PUT method)

**Pass Criteria:** 20/20

---

## agent_daily_actions.cjs

**Purpose:** Verify all agents can execute daily tasks
**Frequency:** Daily at 06:00 UTC
**Location:** tester/agent_daily_actions.cjs

### Tests
- Sierra: SEO scan, competitor check, social post
- Zen: Code review, sprint check, build verification
- Zara: Ticket triage, review check, user feedback
- Andromeda: News scan, research brief, trend analysis
- Picasso: Brand check, asset verification, design brief

**Pass Criteria:** All 5 agents complete without errors

---

## discussion_engine.cjs

**Purpose:** Test multi-agent discussion and decision extraction
**Frequency:** Weekly, on-demand
**Location:** tester/discussion_engine.cjs

### Tests
- 100 real questions from KnowledgeBase
- Agent discussion simulation
- Decision extraction via LLM
- KnowledgeBase save and verify
- Decision sync to local file

**Pass Criteria:** All questions processed, decisions saved

---

## runTierTestSuite (Base44 function)

**Purpose:** Verify tier-based access control
**Frequency:** After every deployment
**Location:** base44/functions/runTierTestSuite/entry.ts

### Tests
- Free tier: Client CREATE/READ limits
- All tiers: PlanLimit existence
- All tiers: Password CREATE/UPDATE
- All tiers: Resource CREATE
- All tiers: TemplateMode isolation
- All tiers: Subscription CREATE

**Pass Criteria:** 8/8

---

## infra_suite (planned)

**Purpose:** Infrastructure health checks
**Frequency:** Every 5 minutes

### Endpoints to monitor
1. ozAgentAPI — response <500ms
2. agentChat — response <2s
3. telegramRouter — response <1s
4. StripeWebhookHandler — response <1s
5. CreateCheckoutSession — response <1s
6. sendDynamicEmail — response <2s
7. runHealthCheck — response <5s
8. CreateBackup — response <10s
9. RestoreBackup — response <10s
10. GenerateAIInsights — response <5s
11. captureScreenshot — response <10s
12. pushCodeToGitHub — response <5s

**Pass Criteria:** All endpoints respond within SLA

---

## security_suite (planned)

**Purpose:** Security scanning
**Frequency:** Daily, after every commit

### Checks
- Credential exposure in source code
- Hardcoded tokens in CLAUDE.md
- Dependency vulnerabilities (npm audit)
- API key rotation status
- Telegram token exposure
- DeepSeek key exposure

**Pass Criteria:** No critical vulnerabilities

---

## performance_suite (planned)

**Purpose:** Performance monitoring
**Frequency:** Hourly

### Metrics
- Page load time <2s
- API response time <500ms
- Memory usage <512MB
- Database query time <100ms
- CDN cache hit rate >90%

**Pass Criteria:** All metrics within thresholds
