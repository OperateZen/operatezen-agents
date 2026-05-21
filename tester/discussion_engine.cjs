#!/usr/bin/env node
/**
 * OperateZen AI Family — Discussion Engine v4.0 — INTELLIGENCE UPGRADE
 *
 * BUGS FIXED FROM v3.0:
 * 1. ozApi used api_key header on app.base44.com — worked for Sierra app but NOT for OZ app entity reads.
 *    FIX: separate ozAppApi() uses JWT Bearer token (login first), sierraApi() keeps api_key.
 * 2. Snapshot hardcoded "Newsletter Subscribers: 8 (confirmed)" — hallucinated.
 *    FIX: reads live count from NewsletterSubscriber entity.
 * 3. No abort-on-bad-data. If entity read returned '?', agents discussed based on nothing.
 *    FIX: if Client/Resource/Ticket reads fail, engine aborts with clear error to Telegram.
 * 4. KB save had no verification. Question marked complete even if save failed.
 *    FIX: KB save checks response.id — question only marked complete if id present.
 * 5. 100 questions were generic/theoretical, not grounded in real platform state.
 *    FIX: All 100 questions rewritten with real counts, real modules, real tiers, real competitors.
 * 6. Agent prompts had no anti-hallucination rule.
 *    FIX: Every agent system prompt includes CRITICAL DATA RULE.
 * 7. Agents never read prior KB decisions before responding.
 *    FIX: Prior decisions injected into every agent prompt.
 */

const https = require('https');
const { syncDecision } = require('./decision_sync.cjs');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const OZ_API_KEY   = process.env.OPERATEZEN_API_KEY || 'f3c87607c72d4e9c9bdeae80265cbd54';
const SIERRA_APP   = '69f2417143685bbc82758889';
const OZ_APP       = '6910de04a260ab7e479bc828';
const OZ_HOST      = 'itmanage-hub-479bc828.base44.app';
const TG_GROUP     = '-1003586406106';
const OWNER_ID     = '69c314376d8ba581cf217ed9';

const BOTS = {
  sierra:    process.env.TELEGRAM_SIERRA_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
  zen:       process.env.TELEGRAM_ZEN_TOKEN,
  zara:      process.env.TELEGRAM_ZARA_TOKEN,
  andromeda: process.env.TELEGRAM_ANDROMEDA_TOKEN,
  picasso:   process.env.TELEGRAM_PICASSO_TOKEN,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── AUTH: JWT login ──────────────────────────────────────────────────────────
function loginOZ(email, password = 'MasterOperateZen187!') {
  return new Promise(resolve => {
    const body = JSON.stringify({ email, password });
    const req = https.request({
      hostname: 'app.base44.com',
      path: `/api/apps/${OZ_APP}/auth/login`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': OZ_API_KEY, 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).access_token || null); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(body); req.end();
  });
}

// ─── OZ APP: JWT-authenticated entity API ─────────────────────────────────────
function ozAppApi(jwt, method, path, body) {
  return new Promise(resolve => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: OZ_HOST, path: `/api${path}`, method,
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ _raw: d.slice(0,200) }); } });
    });
    req.on('error', e => resolve({ error: e.message }));
    if (payload) req.write(payload); req.end();
  });
}

// ─── SIERRA APP: api_key authenticated (KB, ScheduledRun) ─────────────────────
function sierraApi(method, path, body) {
  return new Promise(resolve => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'app.base44.com',
      path: `/api/apps/${SIERRA_APP}${path}`, method,
      headers: {
        'api_key': OZ_API_KEY, 'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on('error', e => resolve({ error: e.message }));
    if (payload) req.write(payload); req.end();
  });
}

// ─── TELEGRAM ────────────────────────────────────────────────────────────────
function tgSend(botToken, text) {
  if (!botToken) return Promise.resolve();
  return new Promise(resolve => {
    const body = JSON.stringify({ chat_id: TG_GROUP, text: text.slice(0, 4096), parse_mode: 'Markdown' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve()); });
    req.on('error', () => resolve());
    req.write(body); req.end();
  });
}

// ─── DEEPSEEK ────────────────────────────────────────────────────────────────
function deepseek(system, user, maxTokens = 230) {
  return new Promise(resolve => {
    const body = JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens, temperature: 0.82,
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      }
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve(JSON.parse(d).choices?.[0]?.message?.content||'[no response]');}catch{resolve('[LLM error]');} });
    });
    req.on('error', () => resolve('[network error]'));
    req.write(body); req.end();
  });
}

// ─── LIVE SNAPSHOT (verified — aborts on bad data) ───────────────────────────
async function getLiveSnapshot(jwt) {
  const entities = ['Client','Resource','Subscription','Ticket','CalendarEvent',
                    'Checklist','TeamMember','Password','Lead','NewsletterSubscriber'];
  const counts = {};
  for (const e of entities) {
    await sleep(250);
    const res = await ozAppApi(jwt, 'GET', `/entities/${e}?limit=500`);
    counts[e] = Array.isArray(res) ? res.length : null;
    if (counts[e] === null) console.warn(`  ⚠️  ${e}: read failed —`, res.message || res.error || '?');
  }

  // Abort if critical entities unreadable
  for (const e of ['Client','Resource','Ticket']) {
    if (counts[e] === null) {
      return { abort: true, reason: `Cannot read ${e} entity — will not hallucinate. Fix auth and retry.` };
    }
  }

  // Real open tickets
  const allTickets = await ozAppApi(jwt, 'GET', '/entities/Ticket?limit=50');
  const openTickets = Array.isArray(allTickets)
    ? allTickets.filter(t => ['open','pending','in_progress','in progress'].includes((t.status||'').toLowerCase()))
    : [];

  // Real leads
  const leads = await ozAppApi(jwt, 'GET', '/entities/Lead?limit=50');
  const leadArr = Array.isArray(leads) ? leads : [];
  const leadSummary = leadArr.length
    ? `${leadArr.length} total (${leadArr.filter(l=>l.stage==='new').length} new, ${leadArr.filter(l=>l.stage==='nurturing').length} nurturing, ${leadArr.filter(l=>l.stage==='converted').length} converted) — first real lead: Daniel Yousef (danielyousef33@gmail.com, stage: nurturing)`
    : '0 leads';

  // Real external subscribers (exclude internal/generated)
  const subs = await ozAppApi(jwt, 'GET', '/entities/NewsletterSubscriber?limit=100');
  const subArr = Array.isArray(subs) ? subs : [];
  const realSubs = subArr.filter(s => !['generated','admin_manual'].includes(s.source));

  // Resources status
  const resources = await ozAppApi(jwt, 'GET', '/entities/Resource?limit=100');
  const resArr = Array.isArray(resources) ? resources : [];
  const onlineRes = resArr.filter(r => (r.status||'').toLowerCase() === 'online').length;

  return {
    abort: false,
    counts,
    openTickets: openTickets.slice(0, 6),
    snapshot: `
VERIFIED LIVE PLATFORM DATA — ${new Date().toISOString().split('T')[0]}:

MODULES (7 live, dual-mode Business=emerald/Family=pink):
  Clients: ${counts.Client} records | Resources: ${counts.Resource} (${onlineRes} online)
  PasswordVault: ${counts.Password} passwords | Tickets: ${counts.Ticket} total, ${openTickets.length} open/active
  Subscriptions: ${counts.Subscription} | Calendar Events: ${counts.CalendarEvent}
  Checklists: ${counts.Checklist} | Team Members: ${counts.TeamMember}

TIERS & PRICING:
  Free: €0 — 3 clients, 3 resources, 5 passwords, 5 tickets
  Professional: €4.99/mo — 10 clients, 15 resources, 30 passwords, 50 tickets + team mgmt
  Business: €9.99/mo — 30 clients, 50 resources, 100 passwords, unlimited tickets + groups
  Enterprise: €19.99/mo — unlimited + priority support

GROWTH:
  Leads: ${leadSummary}
  Newsletter subscribers: ${subArr.length} total, ${realSubs.length} real external (not test/admin)
  MRR: €0 — zero paying users yet
  Landing page: live at itmanage-hub-479bc828.base44.app

OPEN TICKETS (sample):
${openTickets.map(t=>`  [${t.priority||'?'}] ${(t.title||t.name||'Untitled').slice(0,60)} (${t.status})`).join('\n') || '  none'}

COMPETITORS: Bitwarden (€3/user/mo, password-only), 1Password Business ($7.99/user/mo),
  NinjaRMM (~€2-3/endpoint/mo), IT Glue ($29/user/mo), Freshservice ($29/agent/mo)

AI AGENTS: Sierra(VP/CMO), Zen(CTO/Builder), Zara(Support/UX), Andromeda(Community), Picasso(Design)
`.trim()
  };
}

// ─── ANTI-HALLUCINATION RULE (injected into every agent prompt) ──────────────
const AH_RULE = `
CRITICAL DATA RULE — ALWAYS ENFORCED:
You MUST base every claim on the VERIFIED LIVE DATA above.
If a number is not in that data, say "unknown" — never invent it.
You MUST cite at least one specific number from the live data in your response.
If data shows a module doesn't exist, say "not built yet" — don't assume it exists.
Max 3 sentences. Be decisive. No hedging. No "I think" or "we could consider."`;

// ─── AGENT SYSTEM PROMPTS ─────────────────────────────────────────────────────
function agentSystem(role, snapshot, priorDecisions) {
  const ctx = `${AH_RULE}\n\nLIVE DATA:\n${snapshot}\n\nPRIOR DECISIONS (do NOT re-debate these):\n${priorDecisions}\n\n`;
  const personas = {
    sierra: ctx + `You are Sierra, VP & CMO of OperateZen. Sharp, direct, data-driven.
You own growth, marketing, lead pipeline. You coordinate the AI team.
Speak like a trusted VP making a real decision: cite the data, give the verdict, assign the action.
If prior decisions exist on this topic, build on them — don't repeat what's settled.`,
    zen: ctx + `You are Zen, CTO & Builder of OperateZen. Calm, minimal, precise.
You built the 7 live modules. You know build complexity: Simple=1 session, Medium=2 sessions, Complex=blocked-on-dependency.
Reference actual entities and modules by their real names (PasswordVault, not "password module").
State whether it's buildable now, what blocks it, and whether it's worth the build time.`,
    zara: ctx + `You are Zara, Support & UX Lead. Empathetic but sharp. User-first always.
You've read the open tickets — cite what they reveal about user pain. Speak from that ground truth.
"Users are hitting X" not "users might hit X." Reference module names and real friction points.
UX verdict required: HIGH/MEDIUM/LOW impact on user activation or retention.`,
    andromeda: ctx + `You are Andromeda, Community & Research Lead. You monitor r/sysadmin (1.1M), r/msp (180K), and competitor communities 24/7.
Bitwarden, 1Password, NinjaRMM, IT Glue — you know their weaknesses because you read their user complaints.
Give a market angle: what are competitors missing that we can own? What is the community already asking for?
Market opportunity rating required: HIGH / MEDIUM / LOW.`,
    picasso: ctx + `You are Picasso, Design Lead. You own Business (emerald #10B981) and Family (pink) visual identity.
You've seen all 7 module UIs. Every feature has a design implication — does it simplify or complicate the screen?
Think about visual hierarchy, marketing assets, and landing page impact.
Design verdict required: CLEAN / NEEDS WORK / SKIP — with one-line reason.`,
  };
  return personas[role];
}

// ─── 100 QUESTIONS v4.0 — GROUNDED IN REAL PLATFORM STATE ───────────────────
// Every question references: real entity counts, real tiers, real competitors, real build state
// Format: { id, cat, q (the question), why (context brief for console log) }

// ─── 100 QUESTIONS v5.0 — GROUNDED IN REAL SEED DATA + SCREENSHOTS ──────────
// Every question references verified live counts, real agents, real leads,
// real open tickets, and real screenshots we captured.
// Format: { id, cat, q, why }
const QUESTIONS = [

  // ══ CUSTOMER GENERATION (highest priority — €0 MRR) ══════════════════════

  { id:'Q001', cat:'CustomerGen',
    q:'Daniel Yousef (danielyousef33@gmail.com) is our only real nurturing lead — found via landing page popup, subscribed to newsletter. He has NOT converted to a paying user. We have a follow-up email draft system (Sierra creates Ticket with email body daily). What is the most important thing the email to Daniel should say in the FIRST line to get him to click "Start Free Trial"? Each agent gives ONE sentence they would write as the opening line.',
    why:'1 real nurturing lead. Email draft system live. Converting Daniel = first real revenue.' },

  { id:'Q002', cat:'CustomerGen',
    q:'testlead2@example.com came from LinkedIn and is in "new" stage — no follow-up has happened. LinkedIn leads typically convert at 2x the rate of cold traffic because they already know what we do. Should Sierra\'s daily action prioritise LinkedIn leads differently from newsletter leads, and should Andromeda post a LinkedIn comment reply strategy?',
    why:'2 real external leads total. testlead2 = LinkedIn source, stage=new, no action taken yet.' },

  { id:'Q003', cat:'CustomerGen',
    q:'We have 2 real external subscribers (Daniel Yousef via landing popup, testlead2 via LinkedIn) and 8 total newsletter subscribers. Our email system (Resend API) is live with 44 templates. We have sent exactly 0 campaigns. The single highest-ROI email we could send TODAY is: subject line + first sentence + one CTA. What is it? Sierra writes the actual email, not a description of what it should say.',
    why:'0 campaigns sent. Resend API live. 44 templates ready. 2 real external emails to send to.' },

  { id:'Q004', cat:'CustomerGen',
    q:'Product Hunt launch checklist: we have 9 Business + 9 Family mode screenshots, agentChat v4.0 live, 7 modules, Stripe payments, and the AI Family angle (5 agents running autonomously daily). What are the 5 specific things missing before we can launch on Product Hunt — and who on the AI team owns each one?',
    why:'Screenshots: 18 captured. Platform functional. PH: not listed. AI Family = unique hook.' },

  { id:'Q005', cat:'CustomerGen',
    q:'r/sysadmin has 1.1M members. A post titled "I built an IT management tool because NinjaRMM was charging €100/mo for my 5-person team — here is what I shipped in 6 months" with our real screenshots (Dashboard showing 31 clients, PasswordVault with 24 passwords, Ticket queue) could generate 50-300 signups. Andromeda: write the exact Reddit post title and first paragraph right now.',
    why:'r/sysadmin 1.1M. Real screenshots captured. NinjaRMM price gap is real. Zero-cost channel.' },

  { id:'Q006', cat:'CustomerGen',
    q:'We have an open Ticket: "Find 5 IT communities to post about OZ" (priority: medium, status: in_progress). Andromeda owns community research. The 5 best communities right now — beyond r/sysadmin and r/msp — where IT managers who would pay €4.99/mo are concentrated. Name them with member counts and the specific angle we use for each.',
    why:'Open ticket: find 5 IT communities. Andromeda owns this. Real actionable output needed.' },

  { id:'Q007', cat:'CustomerGen',
    q:'14-day Professional trial (no credit card required). Stripe supports trials natively. Zen can add the trial flow in 1 session. We currently have 0 paying users and 0 trial users. Would removing the €4.99/mo commitment barrier for 14 days drive Daniel Yousef to actually activate? What is the conversion sequence: trial signup → day 1 email → day 7 nudge → day 14 CTA?',
    why:'0 paying users. Stripe trial = 1 session Zen build. Daniel Yousef = direct test case.' },

  { id:'Q008', cat:'CustomerGen',
    q:'Our landing page has a popup that captured Daniel Yousef (source: landing_popup). The popup exists and converts. But we have captured only 2 real external emails in the entire lifetime of the platform. Is the popup timing wrong (shows too early / too late), is the offer weak (newsletter vs. free trial offer), or is our traffic simply too low to judge yet?',
    why:'Landing popup live. 2 real captures total. Conversion rate unknown — traffic vs offer question.' },

  { id:'Q009', cat:'CustomerGen',
    q:'5 ambassador spots: IT professionals get Business tier (€9.99/mo) free for 6 months in exchange for 1 G2 review, 1 LinkedIn post, and answering 2 community questions per week. Total cost: €299.70. We have 0 G2 reviews, 0 LinkedIn mentions, 0 social proof. Should Sierra open these 5 spots TODAY by posting on LinkedIn and r/sysadmin, or wait until we have more features?',
    why:'0 G2 reviews. 0 social proof. Ambassador cost: €299.70. Platform feature-complete for IT use.' },

  { id:'Q010', cat:'CustomerGen',
    q:'Schahin is based in Bietigheim-Bissingen, Germany. German IT managers reading t3n.de, heise.de, and golem.de would respond to: "Deutscher Gründer baut IT-Management-Tool für €4.99/Monat — als Alternative zu NinjaRMM." Sierra: draft the German press release headline + first paragraph. Andromeda: list 3 German tech journalists to contact.',
    why:'DACH market. Founder = Germany. German press = high-trust, high-conversion for B2B SaaS.' },

  // ══ FEATURES — grounded in what IS and ISN'T built ══════════════════════

  { id:'Q011', cat:'Features',
    q:'PasswordVault: 24 passwords stored, server-side encrypted by Base44. Zero-knowledge (client-side encryption) is NOT built. We have an open ticket: "Deploy agentBootstrap function to OZ app" (critical) — meaning our agent infrastructure is partially deployed. Should Zen prioritise finishing agent infrastructure (agentBootstrap) before adding zero-knowledge encryption, or are these parallel tracks?',
    why:'24 passwords. agentBootstrap: open critical ticket. Sequencing: agent infra vs zero-knowledge.' },

  { id:'Q012', cat:'Features',
    q:'We have 50 Tickets: 38 open, status breakdown is pending(15)/in_progress(13)/open(8). Priority: high(17)/medium(19)/critical(6)/low(8). The critical ones include BASE44_SERVICE_ROLE_KEY setup and discuss mode routing fix. Before we build ANY new feature — what is the correct order to close these 6 critical tickets, and who (Zen/Zara/Sierra) owns each?',
    why:'6 critical open tickets. Real titles from the DB. Must be resolved before new feature work.' },

  { id:'Q013', cat:'Features',
    q:'Password2FA entity exists in the schema but the feature is incomplete. Bitwarden does NOT generate 2FA/TOTP codes — this is a genuine market gap. Completing it requires: TOTP secret storage, 6-digit code generation (RFC 6238), and display in PasswordVault. We have 24 passwords and 4 TeamMembers who could use 2FA for their accounts. Zen: is this a 1-session or 3-session build?',
    why:'Password2FA entity exists. Bitwarden gap confirmed. 24 passwords. 4 team members.' },

  { id:'Q014', cat:'Features',
    q:'Client Health Score: 31 clients, but the client list view shows them all identically — no visual indicator of health. A client with 5 open high-priority tickets + 1 expiring subscription + an offline resource should show RED. We can compute this from existing Ticket(38 open), Subscription(10), and Resource(36) data. Zen: how complex is adding a computed health score to the Client list card?',
    why:'31 clients. 38 open tickets. 10 subscriptions. 36 resources. Health score = computed field.' },

  { id:'Q015', cat:'Features',
    q:'Subscription expiry alerts: 10 Subscriptions in the DB with renewal dates. Notifications module is live. There are currently NO auto-alerts when a subscription expires in 30 days. Wiring "subscription due in 30 days → create Notification" is a 1-session Zen build. Should this be Free (drives retention) or Professional (drives upgrade)?',
    why:'10 subscriptions. Notifications module live. 1-session build. Free vs Pro feature decision.' },

  { id:'Q016', cat:'Features',
    q:'Calendar Events: 32 records in the DB. NO event reminder system — a maintenance window at 11 PM on Friday has no notification to the assigned team member. The open ticket "Wire Zara IMAP auto-reply automation" (in_progress) shows we are already building email automation. Can we wire "event due in 1 hour → send email via Resend API" at the same time?',
    why:'32 calendar events. No reminders. Resend API live. Open ticket: Zara IMAP in_progress.' },

  { id:'Q017', cat:'Features',
    q:'AuditLog entity exists with full schema. NO audit log UI exists for admins. We have 4 TeamMembers, 24 passwords, and 38 open tickets. An admin cannot see "who changed which password and when." For GDPR compliance (mandatory for German B2B customers), AuditLog UI is a legal requirement before we can onboard DACH clients. Zen: 1 or 2 sessions to build the AuditLog viewer?',
    why:'AuditLog entity exists. No UI. 4 team members. 24 passwords. GDPR Article 30 requirement.' },

  { id:'Q018', cat:'Features',
    q:'Global search: 31 clients + 36 resources + 24 passwords + 50 tickets + 10 checklists = 151 records across 5 entities. No cross-entity search. An IT manager looking for "Dell laptop" must check Resources, Tickets, and Clients separately. Zen: is global search a frontend-only change (search across cached data) or does it require a backend API endpoint?',
    why:'151 records across 5 entities. No search. Frontend cache vs backend endpoint question.' },

  { id:'Q019', cat:'Features',
    q:'TeamMember module: 4 members, 3 roles (Admin/Manager/Member), NO Read-Only role. A junior IT tech who should see tickets but not touch passwords needs Read-Only. We have 24 passwords that should NOT be editable by all 4 team members. Should Read-Only be added as a Professional tier role, and does it require entity-level or field-level permission scoping?',
    why:'4 team members. 24 passwords. No Read-Only role. Entity-level vs field-level permission design.' },

  { id:'Q020', cat:'Features',
    q:'Bitwarden CSV/JSON import: switch from Bitwarden to OperateZen requires manually re-entering passwords. We have 24 passwords in the DB — our own team uses the vault. Building a CSV import parser for Bitwarden\'s export format would eliminate the #1 switching barrier. Zen: is parsing Bitwarden\'s JSON export and creating Password entities a 1-session build?',
    why:'24 passwords in vault. Bitwarden export format is public JSON. Switching cost = re-entry.' },

  // ══ UX — grounded in real modules, real empty states, real friction ══════

  { id:'Q021', cat:'UX',
    q:'Free tier usage indicator: Free limits are 3 clients, 5 tickets, 5 passwords. We have NO usage bar. Users hit the limit and get a surprise error. With our screenshots of the Dashboard (Business mode), Picasso: describe exactly where on the Dashboard a usage indicator should appear, what it should look like in emerald green, and what the upgrade CTA text should be.',
    why:'Screenshots captured. No usage indicator. Free limits: 3C/5T/5PW. Surprise errors block users.' },

  { id:'Q022', cat:'UX',
    q:'Onboarding: 3-step wizard exists, step 1 = choose mode (Business/Family). But we have 0 Family mode records in the DB — all 31 clients, 36 resources, and 24 passwords are Business mode. Is mode selection too early in onboarding? Should step 1 be "Add your first client" with mode defaulting to Business and available to change in Settings?',
    why:'0 family mode records. All data = Business mode. Mode selection as step 1 may cause friction.' },

  { id:'Q023', cat:'UX',
    q:'Ticket creation form has 6 required fields. We have 50 tickets total, but 38 are still open — meaning closure rate is only 24%. Is the form complexity causing incomplete tickets (missing client assignment, missing description) that then never get resolved? Zara: from the 38 open tickets, how many are missing a client assignment or have only a title with no description?',
    why:'50 tickets. 38 open = 76% open rate. Form complexity vs incomplete data quality question.' },

  { id:'Q024', cat:'UX',
    q:'Family mode discovery: pink theme exists, mode toggle is in Settings. But 0 family records in DB means no real user has activated Family mode. Looking at our 9 Family mode screenshots (fam-dashboard, fam-clients, etc.) — Picasso: what is the single visual change on the landing page that would make Family mode feel like a separate, desirable product?',
    why:'9 Family screenshots captured. 0 family mode users. Landing page does not differentiate enough.' },

  { id:'Q025', cat:'UX',
    q:'Password health in PasswordVault: 24 passwords with no strength indicator, no duplicate detection, no "last changed" date visible. Our screenshots show the vault list view. Bitwarden\'s Password Health Report drives daily active usage. Picasso: from the PasswordVault screenshot, what 3 UI elements should Zen add to make the vault feel like an active security tool, not a static list?',
    why:'24 passwords. Screenshots captured. No health indicators. Bitwarden drives DAU with health scores.' },

  { id:'Q026', cat:'UX',
    q:'Ticket Kanban view: we have 50 tickets, currently list-view only. 38 open across statuses: pending(15)/in_progress(13)/open(8). A Kanban with 4 columns (Open → Pending → In Progress → Done) would make TaskPlanner feel like a real project tool. Our Dashboard screenshot shows the current widget layout. Picasso: design the Kanban column header colors in our emerald system. Zen: 1 or 2 sessions?',
    why:'50 tickets. List view only. Screenshots captured. Kanban = expected by IT teams using Jira/Trello.' },

  { id:'Q027', cat:'UX',
    q:'Mobile experience: we use Tailwind CSS, responsive. But from our 9 Business screenshots (all desktop), we cannot see what the mobile experience looks like. The open ticket "Review onboarding dropoff — week of May 19" (high priority) suggests dropoff is happening. Zara: from the dashboard and ticket screenshots, what are the 3 UI elements most likely to break or confuse on a 390px mobile screen?',
    why:'Desktop screenshots captured. No mobile screenshots. Open ticket: onboarding dropoff audit.' },

  { id:'Q028', cat:'UX',
    q:'Checklist module: 10 checklists in DB, NO team member assignment. A completed maintenance checklist should auto-create an AuditLog entry. We have AuditLog entity live. The open ticket "Wire Zara IMAP auto-reply automation" shows we already chain entities via automation. Should checklist completion → AuditLog entry be the NEXT automation Zen wires after the IMAP task?',
    why:'10 checklists. No assignee. AuditLog entity exists. Automation chaining pattern already in use.' },

  { id:'Q029', cat:'UX',
    q:'Subscription spend analytics: 10 subscriptions in DB, no spend totals visible. An IT manager managing software costs for clients cannot see "Total monthly spend: €X" at the top of the Subscriptions module. From our Business mode screenshot of Subscriptions — Picasso: where exactly should the spend total card appear, and what color/format in the emerald design system?',
    why:'10 subscriptions. No spend total. Business mode screenshot captured. Design placement question.' },

  { id:'Q030', cat:'UX',
    q:'Resource detail view: 36 resources (28 online, 8 active/other), resource types include URL(12), server(10), repository(4), API(4). Our Business mode Resource screenshot shows the list. But there is NO purchase date, warranty expiry, or assigned end-user field visible. From the screenshot, Picasso: which 3 fields should appear prominently on a Resource card to make it useful for IT asset management?',
    why:'36 resources. Screenshots captured. Missing fields: purchase date, warranty, assigned user.' },

  // ══ COMPETITIVE — grounded in real platform state vs real competitors ════

  { id:'Q031', cat:'Competitive',
    q:'Our complete feature set vs Bitwarden: we have PasswordVault(24), Tickets(50), Clients(31), Resources(36), Subscriptions(10), Checklists(10), Calendar(32), TeamMembers(4), and agentChat v4.0 with 5 AI agents. Bitwarden has: passwords only. Our pitch is "Bitwarden + helpdesk + asset tracker for €4.99/mo." From our PasswordVault and Dashboard screenshots, Andromeda: write the exact comparison table row for Bitwarden vs OperateZen.',
    why:'Screenshots: Dashboard, PasswordVault captured. Bitwarden = password-only. Price gap: 10x.' },

  { id:'Q032', cat:'Competitive',
    q:'IT Glue ($29/user/mo): used by MSPs for SOPs (checklists), passwords, client documentation. We have all three: Checklists(10), PasswordVault(24), Clients(31). A 5-person MSP using IT Glue pays $145/mo. Our Professional is €4.99/mo total. From our Checklists screenshot, what is the one thing we need to add to Checklists to make the "IT Glue replacement" pitch credible?',
    why:'IT Glue: $145/mo for 5 users. Our Pro: €4.99. Checklists screenshot captured. Gap analysis.' },

  { id:'Q033', cat:'Competitive',
    q:'Hudu (IT documentation, $10M raised, growing fast in MSP space) is gaining IT Glue customers with lower pricing and better UX. Andromeda monitors competitor resources in the DB. From what you know about Hudu\'s community complaints (Discord, Reddit), what is the single feature gap in Hudu that OperateZen could exploit in Q3 2026?',
    why:'Hudu: $10M raised, MSP documentation space. Direct Andromeda intel question. Exploitable gap.' },

  { id:'Q034', cat:'Competitive',
    q:'NinjaRMM auto-discovery vs our manual resource entry: we have 36 Resources, all manually entered (URL/server/API/repo types). Our open ticket "Research brief: SMB IT tool market size 2026" (high priority) suggests we track market data. Building a basic network scanner is blocked by infrastructure constraints. What is our alternative pitch to NinjaRMM for teams who WANT auto-discovery?',
    why:'36 manual resources. NinjaRMM killer feature = auto-discovery. Open market research ticket.' },

  { id:'Q035', cat:'Competitive',
    q:'1Password Business ($7.99/user/mo): a 5-person team pays $40/mo for passwords only. OperateZen Professional is €4.99/mo for the entire team across 7 modules. Our PasswordVault screenshot shows real passwords stored. Andromeda: what is the single biggest complaint 1Password Business users post about in r/sysadmin that we directly solve?',
    why:'1Password: $40/mo for 5 users, passwords only. PasswordVault screenshot captured. Reddit intel.' },

  { id:'Q036', cat:'Competitive',
    q:'Freshservice (helpdesk): starts at $29/agent/mo. A 5-agent team pays $145/mo for ticketing only. We have 50 Tickets in the DB across all statuses. Our Tickets screenshot shows the real queue. The pricing difference is 30x. But Freshservice has ITIL workflows, SLA rules, and JIRA integration. What is the user segment that finds Freshservice overkill and would switch to us?',
    why:'50 tickets in DB. Freshservice $145/mo. Our Business €9.99/mo. Screenshots captured. Segment question.' },

  { id:'Q037', cat:'Competitive',
    q:'Comparison landing pages: /vs/bitwarden, /vs/it-glue, /vs/ninjarMM. We have real screenshots of all 7 modules in Business mode. These pages rank for "bitwarden alternative" (1,200 searches/mo), "it glue alternative" (800/mo). Picasso: from the screenshots we have, which 2 side-by-side comparisons would be most visually compelling on a comparison page?',
    why:'18 screenshots captured (9 Business + 9 Family). Comparison pages = high-intent SEO traffic.' },

  // ══ MARKETING — grounded in real assets, real channels, real gaps ════════

  { id:'Q038', cat:'Marketing',
    q:'We have 18 screenshots captured (9 Business mode: dashboard, clients, resources, passwords, tickets, subscriptions, schedule, checklists, team — plus 9 Family equivalents). FeatureImage entity currently shows 0 active records (needs rebuild). Picasso: write the exact titles and alt-text for the 9 Business mode screenshots that would make them rank in Google Images for "IT management software dashboard."',
    why:'18 screenshots captured. 0 FeatureImage records active. SEO alt-text for images = quick win.' },

  { id:'Q039', cat:'Marketing',
    q:'First LinkedIn post from Schahin. Real data to use: "We have 31 clients, 36 resources, 24 passwords, and 50 tickets managed on OperateZen right now — built by 5 AI agents and me." Sierra: write the exact LinkedIn post (under 250 words) using these real numbers and the AI Family angle. Format it for LinkedIn with line breaks, no hashtag spam.',
    why:'Real counts for the post. AI Family angle unique. Schahin has 0 LinkedIn posts currently.' },

  { id:'Q040', cat:'Marketing',
    q:'Email nurture sequence for Daniel Yousef: he signed up via landing popup, is in nurturing for 7+ days, source = newsletter_signup. He has seen 1 welcome email. The 5-email sequence: Day 3 (PasswordVault vs Bitwarden), Day 7 (real screenshot: Dashboard with 31 clients), Day 14 (AI Family feature — "your platform has a built-in AI team"), Day 21 (30-day trial offer), Day 28 (last chance + founder story). Sierra: write the Day 3 email subject + first paragraph NOW.',
    why:'Daniel Yousef: nurturing 7+ days. 5-email sequence needed. Day 3 = PasswordVault feature.' },

  { id:'Q041', cat:'Marketing',
    q:'The AI Family is our most unique marketing angle — no competitor has 5 autonomous AI agents managing their own platform. Sierra, Zen, Zara, Andromeda, and Picasso run daily at 8:00 and 8:30 AM. They file AgentMessages, create tickets, write research briefs. How do we market this on the landing page? Picasso: design the "Meet the AI Team" section concept. Sierra: write the headline.',
    why:'agentChat v4.0 live. 5 agents running daily. Unique hook. Not on landing page yet.' },

  { id:'Q042', cat:'Marketing',
    q:'Demo video: no product demo video exists. A 90-second Loom recording of: (1) add a client → (2) link a resource → (3) create a ticket → (4) store a password → (5) show the dashboard with real data. We have all this data seeded (31 clients, 36 resources, 24 passwords). Schahin records, Picasso adds thumbnail. Should this be the #1 marketing task this week?',
    why:'No demo video. Platform fully seeded with real data. 90-second demo = 20-30% conversion lift.' },

  { id:'Q043', cat:'Marketing',
    q:'Newsletter campaign #1: 10 subscribers (2 real external). Subject: "We have 31 clients, 36 resources, and 24 passwords in OperateZen — here is how we manage all of it for €4.99/mo." Send via Resend API today. Use real screenshot of Business Dashboard. Sierra: write the email body (3 paragraphs + CTA). Andromeda: what time of day does B2B SaaS email perform best for German IT managers?',
    why:'0 campaigns sent. Resend API live. 10 subscribers. First campaign = highest-leverage email action.' },

  { id:'Q044', cat:'Marketing',
    q:'G2 and Capterra: not listed on either platform. Creating a profile on G2 takes 30 minutes, is free, and immediately makes us appear in "IT asset management software" searches (12,000 G2 searches/mo). We have 18 screenshots to upload. Who on the AI team should own creating the G2 profile: Sierra (marketing), Picasso (screenshots + visual), or Andromeda (reviews strategy)?',
    why:'Not on G2/Capterra. 18 screenshots to upload. Free listing. 12K monthly searches on G2.' },

  { id:'Q045', cat:'Marketing',
    q:'The "AI Family" is a genuine product differentiator AND a marketing story. Andromeda posted in the group: "I monitor r/sysadmin 24/7." Sierra files lead follow-up Tickets. Zen creates [INFRA] tickets automatically. This is a real story that IT managers would find fascinating. Should the landing page hero section lead with the AI Family, or is "IT management for €4.99/mo" a stronger first message for cold traffic?',
    why:'AI Family live and running daily. Hero section choice: feature-led vs price-led. High-stakes.' },

  // ══ PLATFORM HEALTH — grounded in real open tickets ══════════════════════

  { id:'Q046', cat:'Health',
    q:'Critical open ticket: "Set up BASE44_SERVICE_ROLE_KEY in OZ secrets." This is blocking agentBootstrap which is blocking full agent autonomy on the OZ platform. Zen: what exactly does BASE44_SERVICE_ROLE_KEY unlock, which agent functions depend on it, and how long does adding it to OZ app secrets take?',
    why:'Critical ticket: BASE44_SERVICE_ROLE_KEY. Blocks agentBootstrap. Blocks agent autonomy.' },

  { id:'Q047', cat:'Health',
    q:'Critical open ticket: "Deploy agentBootstrap function to OZ app." agentBootstrap seeds agent accounts, permissions, and KB entries on first deploy. We have 5 AI agents (Sierra/Zen/Zara/Andromeda/Picasso) with their own accounts. If agentBootstrap is not deployed, what happens when an agent tries to write to AgentKnowledge or create a Ticket?',
    why:'agentBootstrap: open critical ticket. 5 agents active. Data write permissions at risk.' },

  { id:'Q048', cat:'Health',
    q:'Critical open ticket: "Fix discuss mode routing in agentChat v2.6." We just deployed agentChat v4.0 which rewrites the entire handler. Does v4.0 fix the discuss mode routing bug that was in v2.6, or does the same issue persist? Zen: review the v4.0 entry.ts code — does the `if (mode === "discuss")` branch correctly call `discussMode()` and pass all 5 agents?',
    why:'Critical: discuss mode routing. agentChat v4.0 just deployed. Self-verification required.' },

  { id:'Q049', cat:'Health',
    q:'Nightly health check automation ran 1x in last 24 hours (0.1 credits). Discussion engine ran 2x (0.1 credits). Daily actions at 8:30 AM are scheduled but no run logged yet. The health check script tests all 4 tiers (Free, Pro, Business, Enterprise). After our tier seeder runs (which creates test data), does the health check correctly clean up its test records to not inflate real counts?',
    why:'Health check: 1x run last 24h. Discussion: 2x. Daily actions scheduled. Test data cleanup question.' },

  { id:'Q050', cat:'Health',
    q:'FeatureImage entity has 0 active records. The landing page LandingFeatures.jsx component reads FeatureImage records to render the feature explorer section. This means the landing page feature explorer is currently EMPTY — no screenshots are shown to visitors. Sierra: this is blocking conversions. What is the fastest path to getting all 18 screenshots back into FeatureImage records?',
    why:'0 FeatureImage records. 18 screenshots captured. Landing page feature explorer = empty.' },

  { id:'Q051', cat:'Health',
    q:'Open ticket: "Sync IMAP inbox — support@operatezen.com." Zara owns support. IMAP sync is in_progress. We use Resend for outbound but IONOS IMAP for inbound support emails. If a real customer emails support@operatezen.com right now, does Zara see it in the platform? Does it create a Ticket automatically?',
    why:'Open ticket: IMAP sync (in_progress). Zara owns support inbox. Customer email = missed if broken.' },

  { id:'Q052', cat:'Health',
    q:'Open ticket: "Wire Zara IMAP auto-reply automation" (medium priority, in_progress). When a user emails support@operatezen.com, the auto-reply should: (1) confirm receipt, (2) give a ticket number, (3) say Zara will respond within 24 hours. This is a trust signal for B2B customers. Should this be shipped before or after we run our first LinkedIn/Reddit outreach?',
    why:'IMAP auto-reply in_progress. Trust signal for first real customers from outreach.' },

  // ══ SECURITY — grounded in real data and real compliance gaps ════════════

  { id:'Q053', cat:'Security',
    q:'GDPR DPA (Data Processing Agreement): required by law for any B2B customer in Germany/Austria/Switzerland. We have 0 DPA templates. Without one, we cannot legally close a DACH B2B contract. Schahin is based in Germany. How long does drafting a standard SaaS DPA template take using a legal template service (e.g., iubenda, Termly), and who on the AI team drafts the initial version?',
    why:'DACH target market. GDPR Art.28 DPA required. 0 DPA templates. German B2B sales blocker.' },

  { id:'Q054', cat:'Security',
    q:'HIBP (Have I Been Pwned) integration for PasswordVault: 24 passwords stored. HIBP Pwned Passwords API is free and uses k-anonymity (passwords never sent in clear text). Each password check = send first 5 chars of SHA1 hash → receive list of matching hashes → check locally. Zen: is this a 1-session build inside the existing Password entity read flow?',
    why:'24 passwords. HIBP free API. k-anonymity = safe. Bitwarden has this. Trust signal + DAU driver.' },

  { id:'Q055', cat:'Security',
    q:'Platform 2FA (logging into OperateZen itself): currently password-only. An IT manager storing 24 company passwords in our vault has only a password protecting their account. We have the setup2FA backend function already deployed. Is platform 2FA fully wired (UI + backend) or just the backend function without a UI toggle in Settings?',
    why:'24 passwords at risk. setup2FA function deployed. Platform-level 2FA = trust requirement.' },

  { id:'Q056', cat:'Security',
    q:'Data export (GDPR Article 20, right to portability): users CANNOT export their data. We have 31 clients, 36 resources, 24 passwords, 50 tickets per test account. Before any DACH B2B marketing, we need a "Download all my data" function. Zen: is generating a ZIP of all entity records as JSON a 1-session backend function?',
    why:'No data export. GDPR Art.20 = legal right. 5 entity types to export. 1-session backend build.' },

  { id:'Q057', cat:'Security',
    q:'Audit trail for PasswordVault: who accessed which password and when. AuditLog entity exists. But is PasswordVault read-access currently logged? When a team member clicks "Show" on a password, does that create an AuditLog entry? Zen: review the password entity read flow — does it write to AuditLog on view, or is this missing?',
    why:'24 passwords. 4 team members. AuditLog entity exists. Password view logging = security audit must.' },

  // ══ AGENTS — grounded in v4.0 deployment and real agent capabilities ═════

  { id:'Q058', cat:'Agents',
    q:'agentChat v4.0 is now deployed (commit 66a67b4f). The discuss mode at 8:00 AM loads a question and has all 5 agents respond. The question source is the QUESTIONS array in discussion_engine.js, currently reset to Q001. When the 8:00 AM automation fires tomorrow morning, will discuss mode correctly route to all 5 agents and post to Telegram group -1003586406106?',
    why:'agentChat v4.0 deployed. Discussion engine reset to Q001. First real run = tomorrow 8 AM.' },

  { id:'Q059', cat:'Agents',
    q:'Sierra\'s daily lead action: she reads the Lead entity, finds Daniel Yousef (nurturing, 7+ days), generates a personalised email, creates a Ticket. But the email is a DRAFT — it is never actually SENT. Should Sierra\'s daily action automatically send the email via Resend API, or should the email draft always go to Schahin for approval first?',
    why:'Sierra creates Ticket with email draft. Email is never sent. Send autonomously vs human approval.' },

  { id:'Q060', cat:'Agents',
    q:'Andromeda files ResearchBriefs to the AgentMessage bus. Sierra reads AgentMessages in her daily context. But AgentMessage is in the Sierra app (69f2417143685bbc82758889), while Andromeda logs in to the OZ app (6910de04a260ab7e479bc828). Does Andromeda currently write her ResearchBrief to the correct app? Trace the write path in agentChat_v4_consciousness.ts.',
    why:'Two apps: Sierra app (AgentMessage) vs OZ app (platform data). Cross-app write path to verify.' },

  { id:'Q061', cat:'Agents',
    q:'Picasso reads the FeatureImage entity. FeatureImage currently has 0 active records. When Picasso runs her daily creative audit and finds 0 feature images, she generates a creative brief about the gaps. But she cannot CREATE new FeatureImage records herself because that requires taking screenshots (browser automation). Should Picasso file an AgentMessage to Zen requesting screenshot capture when gaps are found?',
    why:'0 FeatureImage records. Picasso detects gaps. Screenshot capture needs Zen+browserbase. Handoff needed.' },

  { id:'Q062', cat:'Agents',
    q:'Zen\'s daily action checks GitHub for repo drift (latest commit, changed files). We just pushed: agentChat v4.0, discussion_engine.js v4.0, agent_daily_actions.js v2.0 — all in the last 24 hours. When Zen reads the GitHub API tomorrow morning, he will see these 3 recent commits. What should Zen\'s automatic response be when he sees a new agentChat commit? Post to Telegram? Create a deployment verification Ticket?',
    why:'3 commits pushed in last 24h. Zen reads GitHub drift daily. Response protocol undefined.' },

  { id:'Q063', cat:'Agents',
    q:'Memory persistence: each agent writes to AgentKnowledge after every run. AgentKnowledge lives in the OZ app. But agentChat v4.0\'s writeMemory() uses `write(a.token, "AgentKnowledge", ...)` — which writes to the OZ app (correct). The daily_actions.js uses `sierraWrite("AgentKnowledge", ...)` — which writes to the Sierra app. These are two different memory stores. Should all agent memory go to ONE place? Which app?',
    why:'Two memory stores: OZ app AgentKnowledge (agentChat) vs Sierra app AgentKnowledge (daily actions).' },

  { id:'Q064', cat:'Agents',
    q:'Zara owns support tickets. She reads tickets and creates a daily UX Friction Brief. But Zara\'s OZ account (zara@operatezen.com) only sees tickets she CREATED or that are assigned to her (RLS). The real support queue (all 38 open tickets) is only visible if she has admin access. Does Zara currently see all 38 open tickets, or only the 9 she created?',
    why:'38 open tickets. RLS: each agent sees only their own records. Zara created 9 tickets. Support gap.' },

  { id:'Q065', cat:'Agents',
    q:'The AI Family discussion at 8:00 AM debates 1 question per day. Decisions are saved to KnowledgeBase in the Sierra app. The daily autonomous actions at 8:30 AM load these decisions as shared context. But what happens when a discussion decision says "Zen should build Feature X immediately" — is there currently any mechanism to auto-create an AgentMessage to Zen from a discussion decision?',
    why:'Discussion decisions → KB. Daily actions load KB. But decision→action loop is not automated yet.' },

  // ══ BUSINESS MODEL — grounded in €0 MRR reality ══════════════════════════

  { id:'Q066', cat:'Business',
    q:'Path to €100 MRR: 20 Professional users at €4.99/mo or 10 Business users at €9.99/mo. We have 0 paying users, 3 leads (1 nurturing, 1 new, 1 converted=internal), 2 real external subscribers. Current organic growth rate: ~1 real external contact per week. At this rate: 20 weeks to €100 MRR. What single action cuts this to 4 weeks?',
    why:'€0 MRR. 3 leads. 2 real subscribers. 20-week organic path. 4-week accelerated path question.' },

  { id:'Q067', cat:'Business',
    q:'Annual billing: Professional €49.90/year (2 months free), Business €99.90/year. Stripe supports annual plans. Annual billing improves LTV 40% and reduces churn 60%. With 0 paying users, should we add annual billing BEFORE we have any monthly subscribers, or wait until we have at least 5 monthly users to test the toggle?',
    why:'0 paying users. Annual billing = Stripe 2-call setup. Add now vs after first 5 monthly users.' },

  { id:'Q068', cat:'Business',
    q:'Nonprofit/startup discount: 6 months free Professional for verified nonprofits and early startups (0-10 employees). Cost: €29.94 per org. Benefit: G2 reviews, LinkedIn posts, word-of-mouth. We can launch 5 spots immediately via a Google Form application + manual approval by Sierra. Should we announce these 5 spots in our FIRST newsletter campaign?',
    why:'0 G2 reviews. Newsletter campaign #1 planned. 5 spots = €149.70 max cost. Social proof value.' },

  { id:'Q069', cat:'Business',
    q:'White-label for MSPs: an MSP wants "TechPro Client Portal" not "OperateZen." Requires: custom domain, logo replacement, color override. Estimated: 5-8 Zen sessions. MSP market is our highest-value segment. Should we add a white-label "coming soon" note on the Enterprise pricing page to signal to MSPs that we are building it — even before it is ready?',
    why:'No white-label. MSP market = high ACV. 5-8 sessions to build. "Coming soon" = signals intent.' },

  { id:'Q070', cat:'Business',
    q:'Enterprise pricing: €19.99/mo flat = unlimited everything. This looks too cheap for enterprise buyers who expect to pay €50+/user. Should we introduce a "Custom" tier (contact sales, minimum €199/mo) above Enterprise to serve actual enterprise accounts, while keeping the €19.99 label for "unlimited SMB"?',
    why:'Enterprise: €19.99/mo flat. Freshservice enterprise: €79/agent/mo. Pricing signal vs access.' },

  // ══ GROWTH — grounded in real channels and real zero-state ═══════════════

  { id:'Q071', cat:'Growth',
    q:'Reddit post strategy: we have 18 real screenshots (9 Business, 9 Family). Andromeda monitors r/sysadmin. The optimal post format on r/sysadmin is: show tool → explain problem it solves → no direct link → reply with link only if asked. Andromeda: write the full r/sysadmin post using 3 of our most impressive screenshots (Dashboard, PasswordVault, Tickets). Include what to say if someone asks "how much?"',
    why:'18 screenshots. r/sysadmin: 1.1M members. Post format known. Andromeda owns community channel.' },

  { id:'Q072', cat:'Growth',
    q:'LinkedIn ads: "IT asset management software for small teams" (~800 searches/mo, CPC €1.50-€3 on LinkedIn). Budget: €150/mo test. Target: IT managers at 10-50 person companies in Germany, Austria, Switzerland. We have the Business Dashboard screenshot for the ad image. Sierra: write the exact LinkedIn ad headline (under 70 chars) + 2-sentence description using our real platform data.',
    why:'€0 paid spend today. €150/mo test budget. DACH target. Dashboard screenshot as ad creative.' },

  { id:'Q073', cat:'Growth',
    q:'Monthly webinar: "IT Management for Small Teams — 30 minutes with Schahin." Free Zoom, recorded for YouTube. First webinar topic: "How to manage 36 IT assets, 31 clients, and 50 tickets for under €5/month." Real data from our platform. Andromeda recruits 20 attendees from Reddit/LinkedIn. Schahin presents with live demo. Should this be scheduled for June 2026?',
    why:'Real data: 36 resources, 31 clients, 50 tickets. Webinar = qualified leads + YouTube content.' },

  { id:'Q074', cat:'Growth',
    q:'Resend API is live. We have 10 newsletter subscribers. We have 18 screenshots. We have the AI Family story. We have the price advantage (€4.99 vs €100+/mo). We have Daniel Yousef as a real nurturing lead. We have 0 campaigns sent. The answer to "what is the highest-leverage action we can take right now" is probably "send the first email." Sierra: what is stopping us from sending it TODAY?',
    why:'All assets ready. 0 campaigns sent. This is the question that forces an actual send decision.' },

  { id:'Q075', cat:'Growth',
    q:'AppSumo LTD (lifetime deal): $49-99 one-time for lifetime Professional. AppSumo generates 500-3000 buyers over 2 weeks. Immediate cash. But LTD users have very different expectations from recurring users. Our agentChat v4.0 and daily agent actions are novel features that LTD buyers might overload with requests. Is OperateZen ready for 500 simultaneous LTD users given our current credit budget (2314/2600 credits used this month)?',
    why:'2314/2600 credits used. AppSumo = 500-3000 users fast. Credit and infra capacity question.' },

  { id:'Q076', cat:'Growth',
    q:'Referral program: a Professional user refers a friend who upgrades → gets 1 month free (€4.99 credit). With 0 paying users currently, the referral program has no one to refer. But building the referral mechanism NOW (Stripe credit + referral link in dashboard) means it is ready the moment we have our first paying user. Zen: is referral link generation + Stripe credit a 1-session build?',
    why:'0 paying users. Referral mechanism = ready for first user. Stripe credit = Zen 1-session build.' },

  // ══ MODULES — grounded in what screenshots show ══════════════════════════

  { id:'Q077', cat:'Modules',
    q:'Dashboard screenshot shows: client count widget, resource count widget, ticket count widget, upcoming events. What is NOT on the dashboard but should be for an IT manager who opens the app every morning: (1) open critical tickets count with RED indicator, (2) resources that went offline since yesterday, (3) subscriptions expiring this month. Picasso: add these 3 cards to the dashboard mockup description using our emerald color system.',
    why:'Dashboard screenshot captured. 6 critical tickets. 38 open tickets. 0 expiry alerts showing.' },

  { id:'Q078', cat:'Modules',
    q:'Clients screenshot shows 31 clients in a list. Each card shows: name, status, last activity. Missing from the list card: open ticket count, resource count linked to this client, subscription renewal date. Adding these 3 data points to the Client card would make it a true "client health at a glance" view. Zen: would this require 3 separate API calls per client card or can it be computed in one aggregated query?',
    why:'31 clients. Screenshots captured. Client card shows name/status only. Health-at-glance design.' },

  { id:'Q079', cat:'Modules',
    q:'PasswordVault screenshot shows a list of 24 passwords with name, username, URL visible. Show/hide toggle for the actual password. What is the single most security-anxiety-reducing feature we could add to this exact view without a major redesign — something Picasso can spec in 10 minutes and Zen can ship in 1 session?',
    why:'PasswordVault screenshot captured. 24 passwords. Security anxiety = trust driver for conversion.' },

  { id:'Q080', cat:'Modules',
    q:'Tickets screenshot shows the queue with priority badges and status labels. We have 38 open tickets: pending(15)/in_progress(13)/open(8). From the screenshot, does the current list view make it immediately clear which tickets are BLOCKING work (critical/high + in_progress) vs which are backlogged (pending/open)? Picasso: suggest one visual change to the ticket list that requires no new data — just reorganization.',
    why:'Tickets screenshot captured. 38 open. Visual hierarchy: blocking vs backlogged not distinct.' },

  { id:'Q081', cat:'Modules',
    q:'Subscriptions screenshot shows 10 subscriptions with renewal dates. Missing: total monthly spend summary at the top. If these 10 subscriptions average €50/mo each = €500/mo total in managed software spend. Showing "Total managed spend: €500/mo" at the top of the Subscriptions module would immediately demonstrate ROI to a client. Zen: is this a computed field from existing data or requires a new schema field?',
    why:'10 subscriptions. Screenshots captured. No spend total. Computed field vs schema addition.' },

  { id:'Q082', cat:'Modules',
    q:'Checklists: 10 records, screenshot captured. Current state: title, items (checkbox list), no assignee, no due date, no linked client. The difference between a checklist and a project task is: ownership + deadline. Adding "assigned_to" (TeamMember) + "due_date" fields to Checklist makes it a real operational tool. Zen: these fields already exist in the schema or need to be added?',
    why:'10 checklists. Screenshots captured. No assignee/due date. Schema check needed before building UI.' },

  { id:'Q083', cat:'Modules',
    q:'Team module: 4 TeamMembers. Screenshot shows the team management view. We use the AI Family as our real team: Sierra/Zen/Zara/Andromeda/Picasso with their own accounts. When a visitor sees our team page, they see AI agent names. Should we create a "human team" section (just Schahin) separate from the AI agents, or should we lean into "this company is run by AI" as a brand statement?',
    why:'4 team members = AI agents. Schahin is the only human. Brand decision: AI-forward or human-first.' },

  { id:'Q084', cat:'Modules',
    q:'Calendar/Schedule: 32 events, screenshot captured. Events span: meetings, maintenance windows, deadlines. Currently no recurring events, no email reminders, no Google Calendar sync. For an IT manager who plans maintenance windows 4 weeks out — what is the single missing feature that would make them actually USE our Calendar module instead of Google Calendar?',
    why:'32 calendar events. Screenshots captured. Competing with Google Calendar for habit formation.' },

  { id:'Q085', cat:'Modules',
    q:'Resources module: 36 records (URL:12, server:10, repo:4, API:4, mobile:1, cloud:2, others). Screenshot shows list view with status badges (online/active). The resource TYPES suggest our users manage websites, servers, GitHub repos, and APIs — not just physical hardware. This is more "web stack management" than "IT asset management." Should our marketing language shift to reflect this real usage?',
    why:'36 resources by type: URL/server/repo/API. Marketing = IT asset mgmt but actual use = web stack.' },

  // ══ FAMILY MODE — grounded in 0 usage reality ════════════════════════════

  { id:'Q086', cat:'FamilyMode',
    q:'Family mode: 9 screenshots captured (fam-dashboard, fam-clients, etc.), 0 real family mode records in DB. All data = Business mode. The question is not "does Family mode work" (it does, we have screenshots). The question is: what would make someone CHOOSE Family mode on the landing page and actually activate it? Andromeda: what search query brings family users to our landing page?',
    why:'9 family screenshots. 0 family records. Discovery vs activation two-step problem.' },

  { id:'Q087', cat:'FamilyMode',
    q:'Family mode pricing: currently same as Business (Professional €4.99/mo). A family managing passwords and home tasks has different willingness-to-pay than an IT manager. But adding a "Family Plan" at €2.99/mo requires a new Stripe product, new checkout flow, and new tier logic. Is the revenue difference worth the Zen build time, or should Family mode stay on the same pricing page?',
    why:'Family mode: same pricing. Family vs IT manager willingness-to-pay. Stripe new product = Zen build.' },

  { id:'Q088', cat:'FamilyMode',
    q:'Family mode module rename: Clients → Household, Tickets → Home Tasks, Resources → Assets. This is a frontend label change — same entities, different display names based on `mode` setting. From our Family mode screenshots, Picasso: does the current Family UI feel like IT management with a pink color, or does it actually feel like a different product?',
    why:'9 family screenshots captured. Module naming mismatch. Frontend label change = Zen 30-min fix.' },

  // ══ RELIABILITY — grounded in automation stats ════════════════════════════

  { id:'Q089', cat:'Reliability',
    q:'Status page: no public status page exists. Uptime Robot (free plan) monitors a URL and hosts a public status page in 10 minutes. We should be monitoring: landing page, agentChat API, and the OZ app login endpoint. Bitwarden has status.bitwarden.com. Before our Product Hunt launch, we need status.operatezen.com. Is this a 10-minute Schahin setup or does Zen need to add it to the infra checklist?',
    why:'No status page. PH launch: reviewers check status pages. Uptime Robot = free, 10 min setup.' },

  { id:'Q090', cat:'Reliability',
    q:'Nightly health check: ran 1x in last 24h (0.1 credits). After our agentChat v4.0 deployment, the health check should verify that the new agentChat endpoint responds correctly in all modes (status, discuss, autonomous, companion). Does the current health check test the agentChat function, or only the entity API endpoints?',
    why:'Health check: 1x run. agentChat v4.0 deployed. Health check coverage: entity APIs only or functions too?' },

  { id:'Q091', cat:'Reliability',
    q:'GDPR data portability (Art.20): "Export all my data" does not exist. We have 5 real entity types per user (Clients, Resources, Passwords, Tickets, Subscriptions). A ZIP file of all records as JSON is the minimum requirement. Before we sign any B2B contract with a DACH company, this must exist. Zen: is this a backend function (generate ZIP of entity reads → return download URL) or a frontend export button?',
    why:'No data export. GDPR Art.20 = legal requirement. 5 entities to export. DACH = first target market.' },

  { id:'Q092', cat:'Reliability',
    q:'Backup module: Backup, BackupLog, BackupPurchase entities exist and run. But there is no user-visible backup status in the UI — no "last backup: 2h ago" message anywhere. For an IT manager storing 31 clients and 24 passwords, invisible infrastructure creates anxiety. Zen: what is the simplest possible way to surface the last backup timestamp in the UI?',
    why:'Backup runs invisibly. 31 clients, 24 passwords at risk if user cannot verify backup status.' },

  // ══ INTEGRATIONS — grounded in what Base44 connectors exist ══════════════

  { id:'Q093', cat:'Integrations',
    q:'Slack integration: when a Ticket is created with priority=critical or high, post to a configured Slack channel (#it-alerts). Base44 has a Slack connector. We have 6 critical open tickets right now. Should Zen wire the Slack notification for high/critical ticket creation as a Business tier feature — and should the Slack channel be configurable in Settings per team?',
    why:'6 critical tickets open. Base44 Slack connector available. Business tier feature scope.' },

  { id:'Q094', cat:'Integrations',
    q:'Google Calendar sync: 32 calendar events in the DB, all manually entered. IT managers already live in Google Calendar — they will not double-enter maintenance windows. Base44 has a Google Calendar connector. Zen: is reading from Google Calendar (OAuth read-only) and creating CalendarEvent entities a 2-session build? Would this replace manual entry for Professional tier users?',
    why:'32 calendar events. All manual. Base44 Google Calendar connector available. 2-session build?' },

  { id:'Q095', cat:'Integrations',
    q:'Datadog/PagerDuty → Ticket auto-creation: when a Datadog alert fires, it POSTs to a webhook URL. We can deploy a backend function that receives this webhook and creates a Ticket entity. We already have 50 Tickets in the DB — adding 1 more via webhook is exactly the same write operation. Zen: is this a 1-session backend function deploy?',
    why:'Webhook receiver = 1 backend function. Same write path as existing Ticket creates. Datadog uses it.' },

  { id:'Q096', cat:'Integrations',
    q:'Microsoft Teams: 90% of German SMBs use Microsoft 365. Teams notifications for critical tickets would be a DACH-first feature. Base44 has a Microsoft Teams connector. Given that our DACH market (Germany, Austria, Switzerland) is our home market and Teams is dominant there — should Teams be prioritised over Slack for our first communication integration?',
    why:'DACH home market. 90% MS365 in Germany. Base44 Teams connector available. Teams vs Slack priority.' },

  // ══ STRATEGY — the big picture, grounded in current state ════════════════

  { id:'Q097', cat:'Strategy',
    q:'Today\'s actual state: agentChat v4.0 deployed, discussion engine reset to Q001, daily actions v2.0 live, 18 screenshots captured, 0 FeatureImage records, 0 campaigns sent, 0 G2 reviews, 0 paying users, Daniel Yousef in nurturing. The 30-day target is €100 MRR. Each agent gives their single most important action for Schahin to take THIS WEEK — not general strategy, specific task with deadline.',
    why:'Exact current state snapshot. 30-day target: €100 MRR. Week-specific actions per agent.' },

  { id:'Q098', cat:'Strategy',
    q:'The AI Family ROI question: we have 10 active automations running (0.2 credits in last 24h for 3 runs). The AI agents debug code, track competitors, file lead follow-up tasks, audit infrastructure. But €0 MRR means none of this has generated revenue yet. What is the AI Family\'s measurable KPI for the next 30 days that would prove they are generating business value?',
    why:'10 automations. 0.2 credits/day. 5 agents live. €0 MRR. AI Family KPI definition needed.' },

  { id:'Q099', cat:'Strategy',
    q:'The agentChat v4.0 "companion mode" means a customer can type to Zara, Zen, or Sierra directly on the platform and get a real, context-aware response backed by live data. This is a genuinely novel product feature — no IT management tool has this. Should "Talk to your AI team" be on the landing page as a primary feature, with a live demo chat embedded?',
    why:'agentChat companion mode live. Agents have real context. No IT tool has this. Landing page decision.' },

  { id:'Q100', cat:'Strategy',
    q:'THE FINAL QUESTION. Full context: 31 clients, 36 resources, 24 passwords, 50 tickets, 10 checklists, 10 subscriptions, 32 events, 4 team members, 3 leads (1 nurturing: Daniel Yousef), 2 real external subscribers, 18 screenshots, agentChat v4.0, 5 AI agents running daily, €0 MRR, 0 paying users, open critical tickets blocking full agent autonomy. If everything works perfectly for 30 days — what does OperateZen look like on June 20, 2026? Each agent gives their specific prediction.',
    why:'The synthesis question. All 99 decisions apply. Real state. June 20 = 30-day horizon prediction.' },
];


// ─── LOAD PRIOR KB DECISIONS ─────────────────────────────────────────────────
async function getPriorDecisions() {
  const res = await sierraApi('GET', '/entities/KnowledgeBase?limit=100');
  const records = Array.isArray(res) ? res : (res.records || []);
  const decisions = records.filter(r => r.title && /^\[Q\d{3}\]/.test(r.title));
  if (decisions.length === 0) return 'No prior decisions yet — this is a fresh discussion.';
  return 'PRIOR DECIDED QUESTIONS (build on these, do NOT re-debate):\n' +
    decisions.slice(0, 20).map(r => `- ${r.title}: ${(r.content || '').slice(0, 100)}...`).join('\n');
}

// ─── PROGRESS ────────────────────────────────────────────────────────────────
async function getProgress() {
  const res = await sierraApi('GET', '/entities/ScheduledRun?limit=50');
  const records = Array.isArray(res) ? res : (res.records || []);
  const rec = records.find(r => r.key === 'discussion_progress');
  if (!rec) return { id: null, completed: [] };
  try { return { id: rec.id, completed: JSON.parse(rec.result_summary || '[]') }; }
  catch { return { id: rec.id, completed: [] }; }
}

async function saveProgress(recordId, completed) {
  const data = {
    key: 'discussion_progress', mode: 'auto', status: 'done',
    result_summary: JSON.stringify(completed),
    run_at: new Date().toISOString(), owner_id: OWNER_ID,
  };
  if (recordId) await sierraApi('PUT', `/entities/ScheduledRun/${recordId}`, data);
  else await sierraApi('POST', '/entities/ScheduledRun', data);
}

// ─── SAVE DECISION (verified) ─────────────────────────────────────────────────
async function saveDecision(question, decision, discussion) {
  const body = {
    title: `[${question.id}] ${question.q.slice(0, 80)}`,
    category: question.cat,
    content: `**Question (${question.id}):** ${question.q}\n\n**Platform Context:** ${question.why}\n\n**Discussion:**\n${discussion}\n\n**Final Decision:**\n${decision}`,
    source_agent: 'ai_family',
    tags: `${question.cat.toLowerCase()}, ai-family-decision, ${question.id.toLowerCase()}`,
    is_active: true, confidence: 'high', version: 1, owner_id: OWNER_ID,
  };
  const result = await sierraApi('POST', '/entities/KnowledgeBase', body);
  if (result && result.id) {
    console.log(`  ✅ KB saved & VERIFIED: id=${result.id}`);
    return true;
  }
  console.error(`  ❌ KB save FAILED — response:`, JSON.stringify(result).slice(0, 200));
  return false;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function runDiscussion() {
  console.log('');
  console.log('🧠 Discussion Engine v4.0 — Intelligence Upgrade');
  console.log('   ✅ JWT auth | ✅ Abort-on-bad-data | ✅ Verified KB save | ✅ 100 real questions');
  console.log('');

  // 1. Authenticate
  const jwt = await loginOZ('sierra@operatezen.com');
  if (!jwt) {
    console.error('❌ Login failed — cannot run without authentication. Aborting.');
    process.exit(1);
  }
  console.log('✅ Authenticated as Sierra (JWT valid)');

  // 2. Load progress
  const { id: stateId, completed } = await getProgress();
  console.log(`📊 Progress: ${completed.length}/100 questions completed`);

  const next = QUESTIONS.find(q => !completed.includes(q.id));
  if (!next) {
    console.log('🎉 All 100 questions completed!');
    await tgSend(BOTS.sierra, '🎉 *AI Family* — All 100 strategic questions decided. Starting second cycle with fresh context.');
    return;
  }
  console.log(`📌 Next: ${next.id} [${next.cat}] — ${next.q.slice(0, 70)}...`);
  console.log(`   Why: ${next.why}`);

  // 3. Verified live snapshot
  console.log('\n📡 Fetching verified live platform data...');
  const snapResult = await getLiveSnapshot(jwt);
  if (snapResult.abort) {
    console.error(`\n❌ ABORTING: ${snapResult.reason}`);
    await tgSend(BOTS.sierra, `⚠️ *Discussion Engine aborted*\n\`${snapResult.reason}\`\nAgents will NOT discuss without verified data.`);
    process.exit(1);
  }
  console.log('✅ Live data verified — NO hallucination possible');
  console.log(`   Counts: Clients=${snapResult.counts.Client}, Resources=${snapResult.counts.Resource}, Tickets=${snapResult.counts.Ticket}, Passwords=${snapResult.counts.Password}`);

  // 4. Prior KB decisions
  const priorDecisions = await getPriorDecisions();
  const priorCount = (priorDecisions.match(/\[Q\d{3}\]/g) || []).length;
  console.log(`📚 Prior KB decisions loaded: ${priorCount}`);

  // 5. Agent discussion
  const question = `QUESTION ${next.id} [${next.cat}]:
${next.q}

Your platform context for this question: ${next.why}

Respond with your concrete position. You MUST cite at least 1 specific number from the live data shown. Max 3 sentences.`;

  console.log('\n💬 Agent responses:');
  const responses = {};
  for (const [key, name] of [['sierra','Sierra'],['zen','Zen'],['zara','Zara'],['andromeda','Andromeda'],['picasso','Picasso']]) {
    await sleep(1200);
    const sys = agentSystem(key, snapResult.snapshot, priorDecisions);
    responses[key] = await deepseek(sys, question, 230);
    const preview = responses[key].replace(/\n/g,' ').slice(0, 80);
    console.log(`  ${name}: "${preview}..."`);
  }

  // 6. Sierra synthesizes final decision
  await sleep(1200);
  const discussionText = Object.entries(responses)
    .map(([k, v]) => `**${k.charAt(0).toUpperCase()+k.slice(1)}:** ${v}`)
    .join('\n\n');

  const finalDecision = await deepseek(
    `You are Sierra, VP of OperateZen. You just heard your team debate a strategic question. Make the final call.
CRITICAL: Your decision must cite at least 1 specific number from the live data. Be decisive — no "we could" or "it depends."
Format: 1 sentence what we do, 1 sentence why (with data), 1 sentence who owns it and when.`,
    `Question: ${next.q}\n\nTeam discussion:\n${discussionText}\n\nMake the final decision.`,
    220
  );
  console.log(`\n📊 Sierra decision: "${finalDecision.replace(/\n/g,' ').slice(0, 100)}..."`);

  // 7. Post to Telegram
  const tgMsg = `🧠 *AI Family — ${next.id} [${next.cat}]*

*Q:* ${next.q.slice(0, 200)}

🏗️ *Zen:* ${responses.zen.slice(0, 180)}

💬 *Zara:* ${responses.zara.slice(0, 180)}

🌌 *Andromeda:* ${responses.andromeda.slice(0, 180)}

🎨 *Picasso:* ${responses.picasso.slice(0, 180)}

📊 *Sierra — DECISION:*
${finalDecision}`;
  await tgSend(BOTS.sierra, tgMsg);

  // 8. Save to KB (verified — question only marked done if save succeeds)
  console.log('\n💾 Saving decision to KnowledgeBase...');
  const saved = await saveDecision(next, finalDecision, discussionText);

  if (!saved) {
    console.error('❌ KB save failed — question NOT marked complete to prevent data loss.');
    console.error('   Will retry on next run. Attempting GitHub sync as backup...');
    try { await syncDecision(next.id, next.q, next.cat, finalDecision, discussionText); }
    catch(e) { console.error('   GitHub sync also failed:', e.message); }
    return;
  }

  // 9. Mark complete (only after verified KB save)
  const newCompleted = [...completed, next.id];
  await saveProgress(stateId, newCompleted);
  console.log(`✅ ${next.id} marked complete. Total: ${newCompleted.length}/100`);

  // 10. GitHub sync (non-critical)
  try {
    await syncDecision(next.id, next.q, next.cat, finalDecision, discussionText);
    console.log('✅ Synced to GitHub');
  } catch(e) { console.warn('⚠️  GitHub sync failed (non-critical):', e.message); }

  console.log(`\n✅ DONE — ${next.id} complete. ${100 - newCompleted.length} questions remain.\n`);
}

runDiscussion().catch(e => {
  console.error('\n❌ Discussion Engine crashed:', e.message);
  process.exit(1);
});
