// Daily at 08:00 UTC; remind only when kickoff is tomorrow in Europe/Berlin.
const berlinDate=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!process.env.CRON_SECRET||req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({error:'Unauthorized'});
 const {SUPABASE_URL,SUPABASE_SECRET_KEY,RESEND_API_KEY,REMINDER_FROM_EMAIL}=process.env;
 if(!SUPABASE_URL||!SUPABASE_SECRET_KEY||!RESEND_API_KEY||!REMINDER_FROM_EMAIL)return res.status(503).json({error:'Reminder configuration missing'});
 try{
 const base=SUPABASE_URL.replace(/\/+$/,'');
 const r=await fetch(base+'/rest/v1/fcn_matches?select=id,opponent,kickoff,is_home&status=eq.scheduled&order=kickoff.asc&limit=100',{headers:{apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY}});
 if(!r.ok)throw new Error('Matches HTTP '+r.status);
 const tomorrow=berlinDate(new Date(Date.now()+86400000));
 const matches=(await r.json()).filter(m=>berlinDate(new Date(m.kickoff))===tomorrow);
 let sent=0;
 for(const m of matches){
  const check=await fetch(base+'/rest/v1/fcn_predictions?match_id=eq.'+m.id+'&select=match_id&limit=1',{headers:{apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY}});
  if(!check.ok)throw new Error('Predictions HTTP '+check.status);
  if((await check.json()).length)continue;
  const title=m.is_home?'1. FC Nürnberg – '+m.opponent:m.opponent+' – 1. FC Nürnberg';
  const date=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'full',timeStyle:'short'}).format(new Date(m.kickoff));
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:REMINDER_FROM_EMAIL,to:['Robin.Baetz@deutschebahn.com'],subject:'🔴⚫ Robin, dein FCN-Tipp fehlt noch!',text:`Morgen spielt ${title} (${date}). Gib deinen Tipp auf https://fcn-zentrale.vercel.app ab. Nur der FCN!`})});
  if(!response.ok)throw new Error('Email HTTP '+response.status+' '+(await response.text()).slice(0,160));sent++;
 }
 return res.status(200).json({ok:true,matched:matches.length,sent});
 }catch(e){console.error('Reminder failed:',e.message);return res.status(502).json({error:'Reminder failed; check logs'});}
}
