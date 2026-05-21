// Zen live test - 2026-05-21
// Auto-generated and pushed to GitHub
const OZ_BASE = 'https://itmanage-hub-479bc828.base44.app';
const API_KEY = 'f3c87607c72d4e9c9bdeae80265cbd54';
async function run() {
  const r = await fetch(OZ_BASE + '/api/entities/Ticket?limit=10', { headers: { api_key: API_KEY } });
  const d = await r.json();
  console.log('Tickets:', d.length, '| Open:', d.filter(t=>t.status==='open').length);
}
run();
