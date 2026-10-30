// Daily FCN fixture import from OpenLigaDB (2. Bundesliga).
// DFB-Pokal and friendlies require separate verified sources.
const TEAM_RE = /(?:1\.\s*fc\s*n[uü]rnberg|1\.\s*fcn|fc\s*n[uü]rnberg)/i;
const SEASONS = [2026, 2027];
const SOURCE = 'https://api.openligadb.de/getmatchdata/bl2/';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.CRON_SECRET;
  if (!token || req.headers.authorization !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secret) return res.status(503).json({ error: 'Missing Supabase server credentials' });
  try {
    const currentSeason = new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
    const seasons = [currentSeason, currentSeason - 1];
    const collected = [];
    for (const season of seasons) {
      const response = await fetch(SOURCE + season, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`OpenLigaDB HTTP ${response.status} for ${season}`);
      const fixtures = await response.json();
      if (!Array.isArray(fixtures)) throw new Error('Unexpected OpenLigaDB response');
      for (const match of fixtures) {
        const home = match.team1?.teamName || '';
        const away = match.team2?.teamName || '';
        const isHome = TEAM_RE.test(home);
        if (!isHome && !TEAM_RE.test(away)) continue;
        const kickoff = match.matchDateTimeUTC ? new Date(match.matchDateTimeUTC + (/[zZ]|[+-]\d\d:\d\d$/.test(match.matchDateTimeUTC) ? '' : 'Z')) : null;
        if (!kickoff || Number.isNaN(kickoff.getTime())) continue;
        const final = (match.matchResults || []).find(r => r.resultTypeID === 2) || (match.matchIsFinished ? (match.matchResults || []).at(-1) : null);
        collected.push({
          external_id: `openligadb:bl2:${match.matchID}`,
          opponent: isHome ? away : home,
          competition: '2. Bundesliga',
          kickoff: kickoff.toISOString(),
          is_home: isHome,
          status: match.matchIsFinished ? 'finished' : 'scheduled',
          fcn_score: final ? (isHome ? final.pointsTeam1 : final.pointsTeam2) : null,
          opponent_score: final ? (isHome ? final.pointsTeam2 : final.pointsTeam1) : null,
          stadium: match.location?.locationStadium || null,
          updated_at: new Date().toISOString()
        });
      }
    }
    const unique = [...new Map(collected.map(x => [x.external_id, x])).values()];
    if (!unique.length) return res.status(502).json({ error: 'No FCN fixtures found; no database changes made' });
    const response = await fetch(`${base}/rest/v1/fcn_matches?on_conflict=external_id`, {
      method: 'POST',
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(unique),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
    return res.status(200).json({ ok: true, imported: unique.length, source: 'OpenLigaDB', competitions: ['2. Bundesliga'], checkedSeasons: seasons });
  } catch (err) {
    console.error('Fixture sync failed:', err.message);
    return res.status(502).json({ error: 'Fixture import failed; check Vercel logs' });
  }
}
