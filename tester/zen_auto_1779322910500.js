// Zen auto-generated 2026-05-21T00:21:50.500Z
// Request: show me snippet from guthub code

const OZ = 'https://itmanage-hub-479bc828.base44.app';
const KEY = 'f3c87607c72d4e9c9bdeae80265cbd54';

async function run() {
  const r = await fetch(OZ + '/api/entities/Ticket?limit=10', { headers: { api_key: KEY } });
  const d = await r.json();
  console.log('Tickets:', d.length, '| Open:', d.filter(t=>t.status==='open').length);
}
run();
