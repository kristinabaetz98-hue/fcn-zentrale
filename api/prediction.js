import { timingSafeEqual } from 'node:crypto';
const base=()=>process.env.SUPABASE_URL?.replace(/\/+$/,'');
const key=()=>process.env.SUPABASE_SECRET_KEY;
function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
async function db(path,opts={}){const response=await fetch(base()+'/rest/v1/'+path,{...opts,headers:{apikey:key(),Authorization:'Bearer '+key(),'Content-Type':'application/json',...opts.headers}});if(!response.ok)throw new Error('Database HTTP '+response.status);return response.status===204?null:response.json();}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!base()||!key())return res.status(503).json({error:'Datenbank nicht eingerichtet'});
 try{
 if(req.method==='GET'){
  const id=Number(req.query.match_id);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Ungültiges Spiel'});
  const rows=await db('fcn_predictions?match_id=eq.'+id+'&select=home_score,away_score&limit=1');return res.status(200).json({tip:rows[0]||null});
 }
 if(req.method==='POST'){
  if(!process.env.ROBIN_TIP_PASSWORD)return res.status(503).json({error:'Robin-Passwort fehlt in Vercel'});
  const b=req.body||{};
  if(!equal(b.password,process.env.ROBIN_TIP_PASSWORD))return res.status(401).json({error:'Passwort stimmt nicht'});
  const id=Number(b.match_id),home=Number(b.home_score),away=Number(b.away_score);
  if(!Number.isSafeInteger(id)||id<=0||![home,away].every(n=>Number.isInteger(n)&&n>=0&&n<=30))return res.status(400).json({error:'Ungültiger Tipp'});
  const matches=await db('fcn_matches?id=eq.'+id+'&select=id,kickoff&limit=1');
  if(!matches.length||new Date(matches[0].kickoff)<=new Date())return res.status(400).json({error:'Spiel hat bereits begonnen oder existiert nicht'});
  await db('fcn_predictions?on_conflict=match_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{match_id:id,home_score:home,away_score:away,updated_at:new Date().toISOString()}])});
  return res.status(200).json({ok:true});
 }
 return res.status(405).json({error:'Method not allowed'});
 }catch(e){console.error('Prediction API:',e.message);return res.status(502).json({error:'Datenbankfehler – siehe Vercel Logs'});}
}
