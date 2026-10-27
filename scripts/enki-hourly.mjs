import postgres from 'postgres';
import crypto from 'crypto';
import { gunzipSync } from 'zlib';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
const CC = process.env.ENKI_CLIENT_CODE, SE = process.env.ENKI_SECRET, CI = process.env.ENKI_CONFIG_ID;

function tok(ts) { return CC + ':' + crypto.createHmac('sha256', SE).update(['reports', 'us', CI, ts, 'ws', 'v1'].join('|')).digest('base64'); }

async function ef(p) {
  const ts = String(Math.floor(Date.now() / 1000));
  const u = new URL('https://www.enkiads.com/ws/v1/' + CC + '/us/reports/' + CI + '/' + ts);
  Object.entries(p).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + tok(ts) } });
  if (r.status === 429) { console.error('Rate limited:', await r.text()); process.exit(1); }
  if (!r.ok) throw new Error('ENKI ' + r.status + ': ' + await r.text());
  return r.json();
}

const today = new Date().toISOString().split('T')[0];
console.log('Requesting hourly for', today);

const d = await ef({ f: 'requestReport', service: 'yads', time_breakdown: 'hourly', date_from: today, date_to: today });
const jobId = d.data.jobId;
console.log('Job', jobId, '- polling...');

await sql`INSERT INTO report_jobs (job_id,status,breakdown,date_from,date_to) VALUES (${jobId},'QUEUED','hourly',${today},${today}) ON CONFLICT (job_id) DO UPDATE SET status='QUEUED',updated_at=NOW()`;

for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 20000));
  const s = await ef({ f: 'getJobStatus', jobId: String(jobId) });
  const st = s.data.status, link = s.data.response?.download_link;
  console.log(' ', st);

  if (st === 'FAILED') { await sql`UPDATE report_jobs SET status='FAILED',updated_at=NOW() WHERE job_id=${jobId}`; break; }
  if (st === 'SUCCESS' && link) {
    const res = await fetch(link);
    const buf = Buffer.from(await res.arrayBuffer());
    let txt; try { txt = gunzipSync(buf).toString(); } catch { txt = buf.toString(); }
    txt = txt.replace(/^\uFEFF/, '');
    const ls = txt.replace(/\r\n/g, '\n').trim().split('\n');
    const hd = ls[0].split(',').map(h => h.trim());
    const rows = ls.slice(1).filter(l => l.trim()).map(l => {
      const v = l.split(','); const row = {};
      hd.forEach((h, idx) => row[h] = (v[idx] ?? '').trim());
      return row;
    });
    const valid = rows.filter(r => r.date === today);
    console.log('Downloaded', rows.length, 'total,', valid.length, 'for', today);

    if (valid.length > 0) {
      const ins = valid.map(r => ({
        job_id: jobId, breakdown: 'hourly',
        config_name: r.config_name || null, report_date: r.date || today,
        report_hour: r.hour != null && r.hour !== '' ? parseInt(r.hour, 10) : null,
        revenue: parseFloat(r.amount_usd || '0') || 0, amount_eur: parseFloat(r.amount_eur || '0') || 0,
        clicks: parseInt(r.bidded_clicks || '0', 10) || 0, searches: parseInt(r.searches || '0', 10) || 0,
        bidded_searches: parseInt(r.bidded_searches || '0', 10) || 0, bidded_results: parseInt(r.bidded_results || '0', 10) || 0,
        ads_query: r.adsQuery || null, market: r.market || null, device: r.device || null,
        placement: r.placement || null, raw: r,
      }));
      await sql`DELETE FROM report_data WHERE provider='enki' AND breakdown='hourly' AND report_date=${today}`;
      for (let j = 0; j < ins.length; j += 500) await sql`INSERT INTO report_data ${sql(ins.slice(j, j + 500))}`;
      await sql`UPDATE report_jobs SET status='SUCCESS',records=${valid.length},updated_at=NOW() WHERE job_id=${jobId}`;
      console.log('DONE:', valid.length, 'hourly rows inserted for', today);
    }
    break;
  }
}
await sql.end();
