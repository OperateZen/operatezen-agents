# Platform Screenshots
Updated: 2026-05-21

Screenshots are used for:
1. Landing page feature cards (FeatureImage entity)
2. Documentation page (DocImage entity)
3. Onboarding guides
4. Blog posts and social media

## How Picasso captures screenshots
1. Use browserbase to navigate to the platform
2. Log in as demo@operatezen.com
3. Navigate to each module
4. Take screenshot and upload to CDN
5. Update FeatureImage entity with new URL

## Current screenshot status
- Dashboard: needs refresh
- Clients: needs refresh
- Resources: UPDATED (provider field now shows)
- Password Vault: UPDATED (resource assignments visible)
- Task Planner: UPDATED (checklists linked)
- Schedule: UPDATED (time + recurring)
- Subscriptions: current
- Backups: current

## CDN Upload process
Use Sierra superagent upload_file tool, then store URL in FeatureImage.
