// Vercel Serverless Function: öffentlich lesbare FCN-Tabellen
const TABLES={fcn_matches:'kickoff.asc',fcn_news:'published_at.desc',fcn_transfers:'transfer_date.desc',fcn_odds:'updated_at.desc'};
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const name=req.query.table;
 if(typeof name!=='string'||!Object.hasOwn(TABLES,name))return res.status(400).json({error:'Unknown table'});
 const base=process.env.SUPABASE_URL?.replace(/\/$/,'');
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!base||!key)return res.status(503).json({error:'Supabase configuration missing'});
 try{
  const url=new URL(base+'/rest/v1/'+name);
  url.searchParams.set('select','*');url.searchParams.set('order',TABLES[name]);url.searchParams.set('limit','100');
  const upstream=await fetch(url,{headers:{apikey:key,Authorization:'Bearer '+key}});
  if(!upstream.ok)return res.status(502).json({error:'Supabase request failed',status:upstream.status});
  res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=120');
  return res.status(200).json(await upstream.json());
 }catch{return res.status(502).json({error:'Unable to reach Supabase'});}
}
