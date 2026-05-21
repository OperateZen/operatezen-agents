# Agent Shared File Workspace

All 5 OperateZen AI agents read and write files here.

## Structure
agent-files/
  sierra/    - Reports, briefs, lead outreach drafts, strategy docs
  zen/       - Code snippets, build logs, test results, deployment notes
  zara/      - Support templates, ticket summaries, client emails
  andromeda/ - Competitor research, market briefs, community reports
  picasso/   - Brand assets, image prompts, design specs
  shared/    - Files all agents can access (screenshots, logos, platform data)
  screenshots/ - Platform screenshots for feature pages
  brand/     - Logo files, brand guidelines, color specs

## Logo CDN URLs
LOGO_TRANSPARENT: https://base44.app/api/apps/69f2417143685bbc82758889/files/mp/public/69f2417143685bbc82758889/f5b353711_0f59e2531_OperateZencom_Logo_transparent.png
LOGO_SQUARE: https://base44.app/api/apps/69f2417143685bbc82758889/files/mp/public/69f2417143685bbc82758889/06831c72b_a48bb9c9b_logo200x200_operatezencom-logo.png

## How agents use this
- Read: agentGitHub mode=read path=agent-files/[agent]/[file]
- Write: agentGitHub mode=push path=agent-files/[agent]/[file] content=...
- List: agentGitHub mode=list path=agent-files/[agent]/
