// ---- Live Google Form / Sheet Auto-Sync (if LAB.sheetCsvUrl is configured) ----
let _sheetSynced = null;
function parseCSV(text){
  const rows=[]; let row=[], cur='', inQ=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], nx=text[i+1];
    if(inQ){
      if(ch==='"' && nx==='"'){cur+='"'; i++;}
      else if(ch==='"'){inQ=false;}
      else cur+=ch;
    } else {
      if(ch==='"') inQ=true;
      else if(ch===','){row.push(cur.trim()); cur='';}
      else if(ch==='\n' || ch==='\r'){
        if(ch==='\r' && nx==='\n') i++;
        row.push(cur.trim()); if(row.some(Boolean)) rows.push(row);
        row=[]; cur='';
      } else cur+=ch;
    }
  }
  if(cur || row.length){row.push(cur.trim()); if(row.some(Boolean)) rows.push(row);}
  return rows;
}
function drivePhoto(u){
  if(!u) return '';
  const m=u.match(/\/file\/d\/([A-Za-z0-9_-]{15,})/)||u.match(/[?&]id=([A-Za-z0-9_-]{15,})/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800` : u;
}
function parseScholarId(s){
  if(!s) return '';
  const t=String(s).trim();
  const m=t.match(/user=([A-Za-z0-9_-]{8,16})/);
  if(m) return m[1];
  if(/^[A-Za-z0-9_-]{11,13}$/.test(t)) return t;
  return '';
}
function editDist(a,b){
  const m=a.length, n=b.length, dp=Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}
function extractUid(u, rx){const m=String(u||'').match(rx); return m?m[1]:'';}
function findMemberSmart(obj){
  const nm=obj.name||'';
  const slug=nm.toLowerCase().replace(/prof\.|dr\./g,'').trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  // 1. Exact ID or exact normalized name
  let p=byId(slug)||PEOPLE.find(x=>norm(x.name)===norm(nm));
  if(p) return p;
  // 2. Match by Email Address (Institutional or Personal)
  const mails=[obj.email, obj.instEmail, obj.personalEmail].filter(Boolean).map(e=>e.toLowerCase().trim());
  if(mails.length){
    p=PEOPLE.find(x=>{
      const xm=[x.email, x.instEmail, x.personalEmail].filter(Boolean).map(e=>e.toLowerCase().trim());
      return xm.some(e=>mails.includes(e));
    });
    if(p) return p;
  }
  // 3. Match by Google Scholar user ID (accepts full URL or raw 12-char ID like TPNNtLYAAAAJ)
  const gsId=parseScholarId(obj.scholar);
  if(gsId){
    p=PEOPLE.find(x=>parseScholarId(x.links&&x.links.scholar)===gsId);
    if(p) return p;
  }
  // 4. Match by ORCID iD (0000-0000-0000-0000)
  const orcId=extractUid(obj.orcid, /(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/);
  if(orcId){
    p=PEOPLE.find(x=>extractUid(x.links&&x.links.orcid, /(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/)===orcId);
    if(p) return p;
  }
  // 5. Match by ResearchGate profile slug
  const rgId=extractUid(obj.researchgate, /profile\/([A-Za-z0-9_-]+)/);
  if(rgId){
    p=PEOPLE.find(x=>extractUid(x.links&&x.links.researchgate, /profile\/([A-Za-z0-9_-]+)/)===rgId);
    if(p) return p;
  }
  // 6. Fuzzy full-name or single first-name match (e.g., "shirish" or "shrish" -> "Shirish Bose")
  const nn=norm(nm);
  if(!nn) return null;
  p=PEOPLE.find(x=>editDist(norm(x.name), nn)<=2);
  if(p) return p;
  const toks=nn.split(' ');
  if(toks.length===1 && toks[0].length>=3){
    const exactFirst=PEOPLE.filter(x=>norm(x.name).split(' ')[0]===toks[0]);
    if(exactFirst.length===1) return exactFirst[0];
    const fuzzyFirst=PEOPLE.filter(x=>editDist(norm(x.name).split(' ')[0], toks[0])<=1);
    if(fuzzyFirst.length===1) return fuzzyFirst[0];
  }
  if(toks.length>=2){
    const last=toks[toks.length-1];
    const sameLast=PEOPLE.filter(x=>{const pt=norm(x.name).split(' '); return pt[pt.length-1]===last && editDist(pt[0], toks[0])<=2;});
    if(sameLast.length===1) return sameLast[0];
  }
  // Never create a ghost profile from a typo: only return matched lab member
  return null;
}
function splitTopicsSmart(str){
  // Split by comma/semicolon ONLY when outside parentheses so "Attenuation (Pg, Lg, Qc)" stays together
  const res=[]; let cur='', depth=0;
  for(let i=0;i<str.length;i++){
    const ch=str[i];
    if(ch==='(') depth++;
    else if(ch===')' && depth>0) depth--;
    if((ch===',' || ch===';') && depth===0){
      if(cur.trim()) res.push(cur.trim());
      cur='';
    } else cur+=ch;
  }
  if(cur.trim()) res.push(cur.trim());
  return res;
}
function applyProfileUpdate(obj){
  let p=findMemberSmart(obj);
  if(!p) return; // Ignore unrecognized entries instead of creating duplicate ghost cards
  const st=obj.status||'', yr=obj.gradYear||'';
  if(/alumni/i.test(st)){p.status='alumni'; p.degree=/ms/i.test(st)?'MS':'PhD'; if(/^\d{4}$/.test(yr)){p.gradYear=Number(yr); p.role=`${p.degree} Graduate (${yr})`;} else p.role=`${p.degree} Graduate`;}
  else if(/principal investigator/i.test(st)){p.group='pi'; p.status='active'; p.role='Principal Investigator';}
  else if(st){p.status='active'; p.role=/ms/i.test(st)?'MS Scholar':(/postdoc/i.test(st)?'Postdoctoral Fellow':'PhD Scholar');}
  if(obj.position){
    // If Current Affiliation is just "Indian Institute of Technology Kharagpur" for a student, keep "PhD Scholar, Dept. of Geology and Geophysics, IIT Kharagpur"
    if(p.group==='student' && p.status==='active' && /^indian institute of technology kharagpur$/i.test(obj.position.trim())){
      p.position='PhD Scholar, Dept. of Geology and Geophysics, IIT Kharagpur';
    } else {
      p.position=obj.position;
    }
  }
  if(obj.prevList && obj.prevList.length){
    p.prevList=obj.prevList;
    p.prevPositions=obj.prevList.join(' • ');
  } else if(obj.prevPositions){
    p.prevPositions=obj.prevPositions;
  }
  if(obj.thesis) p.thesis=obj.thesis;
  if(obj.bio) p.bio=obj.bio;
  if(obj.interests){
    p.interests=splitTopicsSmart(obj.interests);
    p.area=p.interests.slice(0,3).map(s=>s.replace(/\s*\([^)]*\)/g,'')).join(', ');
  }
  if(obj.instEmail) p.instEmail=obj.instEmail;
  if(obj.personalEmail) p.personalEmail=obj.personalEmail;
  if(obj.email){
    if(/@(gg\.)?iitkgp\.ac\.in|@kgpian\.iitkgp\.ac\.in/i.test(obj.email)) p.instEmail=p.instEmail||obj.email;
    else if(/@gmail\.com|@yahoo\.|@outlook\.|@hotmail\./i.test(obj.email)) p.personalEmail=p.personalEmail||obj.email;
    p.email=obj.instEmail||obj.email;
  } else if(obj.instEmail || obj.personalEmail){
    p.email=obj.instEmail||obj.personalEmail;
  }
  p.links=p.links||{};
  if(obj.scholar){
    const gId=parseScholarId(obj.scholar);
    p.links.scholar=gId && !/^https?:\/\//i.test(obj.scholar.trim()) ? `https://scholar.google.com/citations?user=${gId}&hl=en` : obj.scholar.trim();
  }
  if(obj.orcid) p.links.orcid=/^\d{4}-/.test(obj.orcid)?'https://orcid.org/'+obj.orcid.trim():obj.orcid;
  if(obj.researchgate) p.links.researchgate=obj.researchgate;
  if(obj.web) p.links.web=obj.web;
  if(obj.photo) p.photo=drivePhoto(obj.photo);
}
function applyCsvText(rawText){
  if(!rawText) return;
  const rows=parseCSV(rawText);
  if(rows.length<2) return;
  const hdr=rows[0].map(h=>h.toLowerCase().trim());
  // Because Google Forms appends new columns with the same header names when form items are updated,
  // check ALL matching columns in each row and return the latest non-empty value!
  const colsExact=s=>hdr.map((h,i)=>h===s?i:-1).filter(i=>i>=0);
  const colsAny=(...subs)=>hdr.map((h,i)=>subs.some(s=>h.includes(s))?i:-1).filter(i=>i>=0);
  const cName=colsAny('full name','name'),
        cInstMail=colsAny('institutional email','institute email','official email','work email'),
        cPersMail=colsAny('personal email','alternate email','gmail'),
        cMail=[...colsExact('email address'), ...colsAny('email address','public email','email')],
        cThes=colsAny('phd thesis title','thesis title','thesis'),
        cPos=colsExact('current affiliation').length?colsExact('current affiliation'):colsAny('current affiliation','current position','position'),
        cPosFrom=colsAny('current affiliation — year from','current affiliation - year from','current from'),
        cPosTo=colsAny('current affiliation — year to','current affiliation - year to','current to'),
        cPrev=[...colsExact('previous affiliation (if any)'), ...colsExact('previous affiliations or past jobs'), ...colsAny('previous affiliation (if any)','previous affiliations','previous affiliation','past jobs')],
        cP1=colsAny('previous affiliation 1 —','previous affiliation 1 -','previous affiliation 1'),
        cP1From=colsAny('affiliation 1 — year from','affiliation 1 - year from','affiliation 1 from'),
        cP1To=colsAny('affiliation 1 — year to','affiliation 1 - year to','affiliation 1 to'),
        cP2=colsAny('previous affiliation 2 —','previous affiliation 2 -','previous affiliation 2'),
        cP2From=colsAny('affiliation 2 — year from','affiliation 2 - year from','affiliation 2 from'),
        cP2To=colsAny('affiliation 2 — year to','affiliation 2 - year to','affiliation 2 to'),
        cP3=colsAny('previous affiliation 3 —','previous affiliation 3 -','previous affiliation 3'),
        cP3From=colsAny('affiliation 3 — year from','affiliation 3 - year from','affiliation 3 from'),
        cP3To=colsAny('affiliation 3 — year to','affiliation 3 - year to','affiliation 3 to'),
        cGS=colsAny('google scholar','scholar'),
        cOrc=colsAny('orcid'),
        cRG=colsAny('researchgate','research gate'),
        cWeb=colsAny('personal website','website'),
        cBio=[...colsExact('brief overview'), ...colsAny('brief overview','short biography','biography')],
        cKw=colsAny('research domains','research topics','topics of research interest','research interests','topics','interest'),
        cPic=colsAny('upload profile image','profile photo','photo','image'),
        cStat=colsAny('status in lab','status','role'),
        cYear=colsAny('graduation year','passout');
  rows.slice(1).forEach(row=>{
    const get=indices=>{
      let val='';
      for(const idx of indices){
        const v=(row[idx]||'').trim();
        if(v) val=v;
      }
      return val;
    };
    const nm=get(cName); if(!nm) return;
    const fmtAff=(txt, fr, to)=>{
      if(!txt) return '';
      if(fr && to) return `${txt} (${fr} – ${to})`;
      if(fr) return `${txt} (${fr})`;
      return txt;
    };
    const prevList=[
      fmtAff(get(cP1), get(cP1From), get(cP1To)),
      fmtAff(get(cP2), get(cP2From), get(cP2To)),
      fmtAff(get(cP3), get(cP3From), get(cP3To))
    ].filter(Boolean);
    const rawPrev=get(cPrev);
    if(rawPrev && !prevList.includes(rawPrev)){
      rawPrev.split(/\n|;/).map(s=>s.trim()).filter(Boolean).forEach(s=>prevList.push(s));
    }
    const curPos = fmtAff(get(cPos), get(cPosFrom), get(cPosTo));
    applyProfileUpdate({
      name:nm,
      email:get(cMail),
      instEmail:get(cInstMail),
      personalEmail:get(cPersMail),
      thesis:get(cThes),
      position:curPos,
      prevPositions:rawPrev,
      prevList:prevList,
      scholar:get(cGS),
      orcid:get(cOrc),
      researchgate:get(cRG),
      web:get(cWeb),
      bio:get(cBio),
      interests:get(cKw),
      photo:get(cPic),
      status:get(cStat),
      gradYear:get(cYear)
    });
  });
}
function applyCachedSheetSync(){
  try{
    const loc=JSON.parse(localStorage.getItem('LAB_PROFILE_UPDATES')||'{}');
    delete loc['shrish-bose'];
    localStorage.setItem('LAB_PROFILE_UPDATES', JSON.stringify(loc));
    Object.values(loc).forEach(applyProfileUpdate);
    const cachedCsv=localStorage.getItem('LAB_SHEET_CSV_CACHE');
    if(cachedCsv) applyCsvText(cachedCsv);
  }catch(e){}
}
async function syncLiveSheet(onChanged){
  applyCachedSheetSync();
  if(!LAB.sheetCsvUrl) return;
  if(!_sheetSynced){
    _sheetSynced=(async()=>{
      try{
        const r=await fetch(LAB.sheetCsvUrl + (LAB.sheetCsvUrl.includes('?')?'&':'?') + '_t=' + Date.now());
        if(!r.ok) return false;
        const txt=await r.text();
        const prev=localStorage.getItem('LAB_SHEET_CSV_CACHE')||'';
        if(txt && txt!==prev){
          localStorage.setItem('LAB_SHEET_CSV_CACHE', txt);
          applyCsvText(txt);
          return true;
        }
      }catch(e){}
      return false;
    })();
  }
  const changed=await _sheetSynced;
  if(changed && typeof onChanged==='function') onChanged();
}
const $=s=>document.querySelector(s);
const byId=id=>PEOPLE.find(p=>p.id===id);
const norm=s=>s.toLowerCase().replace(/prof\.|dr\.|[^a-z ]/g,'').replace(/\s+/g,' ').trim();
const _byNameCache=new Map();
const byName=n=>{
  let nn=norm(n);
  if(!nn) return null;
  if(_byNameCache.has(nn)) return _byNameCache.get(nn);
  // Exact full-name match first
  let exact=PEOPLE.find(p=>norm(p.name)===nn);
  if(exact){_byNameCache.set(nn,exact); return exact;}
  // Strip leading co-author initials Google Scholar sometimes glues on (e.g. "as sukanta sarkar" -> "sukanta sarkar")
  const toks=nn.split(' ');
  if(toks.length>=3 && toks[0].length<=2){
    const tail=toks.slice(1).join(' ');
    exact=PEOPLE.find(p=>norm(p.name)===tail);
    if(exact){_byNameCache.set(nn,exact); return exact;}
  }
  // Safe initial + surname match ONLY when the surname is unique in the lab OR initials match uniquely
  const np=nn.split(' ');
  if(np.length<2){_byNameCache.set(nn,null); return null;}
  const nLast=np[np.length-1], nInits=np.slice(0,-1).map(w=>w[0]).join('');
  const cands=PEOPLE.filter(p=>{
    const pp=norm(p.name).split(' ');
    if(pp.length<2 || pp[pp.length-1]!==nLast) return false;
    const pInits=pp.slice(0,-1).map(w=>w[0]).join('');
    return pInits===nInits || (nInits.length===1 && pInits[0]===nInits[0]);
  });
  const res=cands.length===1 ? cands[0] : null;
  _byNameCache.set(nn,res);
  return res;
};
const initials=n=>n.replace(/Prof\.|Dr\./g,'').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2);
const avatar=p=>`<div class="avatar"><span>${initials(p.name)}</span><img src="${p.photo||'photos/'+p.id+'.jpg'}" alt="${p.name}" onload="if(this.previousElementSibling)this.previousElementSibling.style.display='none'" onerror="this.remove()"></div>`;
const card=p=>`<a class="card" href="person.html?id=${p.id}">${avatar(p)}<h3>${p.name}</h3><small>${p.role}</small><br><small>${p.position}</small></a>`;

// Format author name in ANU citation style: "Surname, F. M."
function anuName(fullName){
  const clean=fullName.replace(/Prof\.|Dr\./gi,'').trim();
  if(clean.includes(',')) return clean;
  const parts=clean.split(/\s+/);
  if(parts.length===1) return parts[0];
  const last=parts[parts.length-1];
  const inits=parts.slice(0,-1).map(w=>w[0].toUpperCase()+'.').join(' ');
  return `${last}, ${inits}`;
}

function formatAuthorsANU(aList){
  const formatted=(aList||[]).map(x=>{
    const p=byId(x)||byName(x);
    const disp=anuName(p?p.name:x);
    return p?`<a class="author-link" href="person.html?id=${p.id}">${disp}</a>`:disp;
  });
  if(formatted.length<=1) return formatted.join('');
  return formatted.slice(0,-1).join(', ') + ' &amp; ' + formatted[formatted.length-1];
}

function formatDateANU(dateStr, year){
  if(!dateStr) return String(year||'');
  const m=String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return String(dateStr);
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day=parseInt(m[3],10), mon=months[parseInt(m[2],10)-1];
  return `${day} ${mon} ${m[1]}`;
}

// ANU-style Publication Row:
// 1. Light-blue clickable title
// 2. Full bibliographic reference line: Authors, Date, Venue. Publisher, vol, p. pages. (Type).
// 3. Right-hand column with Citation count
function pubItem(p){
  const titleUrl = p.url || `https://scholar.google.com/scholar?q=${encodeURIComponent(p.title)}`;
  const authStr = formatAuthorsANU(p.authors);
  const dateStr = formatDateANU(p.date, p.year);
  const venueStr = p.venue ? `<em>${p.venue}</em>.` : '';
  const pubStr = p.publisher ? ` ${p.publisher},` : '';
  const volStr = p.volume ? ` vol. ${p.volume},` : '';
  const pageStr = p.pages ? ` p. ${p.pages}.` : '';
  const typeLabel = p.type || 'Article';
  const refParts = [authStr, dateStr, venueStr].filter(Boolean).join(', ');

  return `<li class="pub-row">
    <div class="pub-main">
      <div class="pub-title"><a href="${titleUrl}" target="_blank" rel="noopener">${p.title}</a></div>
      <div class="pub-ref">${refParts}${pubStr}${volStr}${pageStr} (${typeLabel}).</div>
      <div class="pub-sub"><span class="pub-type-pill">${typeLabel}</span></div>
    </div>
    <div class="pub-cite-col">
      <span class="pub-cite-num">${p.cites!=null ? p.cites : 0}</span>
      <span class="pub-cite-lbl">${p.cites===1 ? 'Citation' : 'Citations'}</span>
    </div>
  </li>`;
}

function groupByYearHTML(list){
  if(!list.length) return '<p>No publications listed.</p>';
  const years=[...new Set(list.map(p=>p.year))].sort((a,b)=>b-a);
  return years.map(y=>`<div class="year">${y}</div><ul class="pubs">${list.filter(p=>p.year===y).map(pubItem).join('')}</ul>`).join('');
}

// ---- Live publications strictly from verified ORCID or explicit OpenAlex ID (never blind name search!) ----
async function livePubs(p){
  if(p._cache) return p._cache;
  const l=p.links||{};const m=(l.orcid||'').match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/);
  try{
    const filters=[];
    if(m) filters.push('author.orcid:'+m[0]);
    if(p.openalex) filters.push('author.id:'+p.openalex);
    if(!filters.length) return (p._cache=[]);
    const pages=await Promise.all([...new Set(filters)].map(flt=>
      fetch(`https://api.openalex.org/works?filter=${flt}&sort=publication_year:desc&per-page=200&select=title,publication_year,publication_date,doi,authorships,primary_location,biblio,type,cited_by_count,concepts`)
        .then(r=>r.ok?r.json():{results:[]}).catch(()=>({results:[]}))
    ));
    const j={results:pages.flatMap(pg=>pg.results||[])};
    return (p._cache=(j.results||[]).filter(w=>w.title).map(w=>{
      const src=(w.primary_location&&w.primary_location.source)||{};
      const bib=w.biblio||{};
      const pages=bib.first_page ? (bib.last_page && bib.last_page!==bib.first_page ? `${bib.first_page}-${bib.last_page}` : bib.first_page) : '';
      const vol=bib.volume ? (bib.issue ? `${bib.volume}(${bib.issue})` : bib.volume) : '';
      return {
        year:w.publication_year,
        date:w.publication_date||String(w.publication_year||''),
        title:w.title,
        authors:w.authorships.map(a=>a.author.display_name),
        rawAuthorships:w.authorships.map(a=>({
          name:a.author.display_name,
          inst:(a.institutions||[]).map(i=>i.display_name).filter(Boolean)
        })),
        venue:src.display_name||'',
        publisher:src.host_organization_name||'',
        volume:vol,
        pages:pages,
        url:w.doi||'',
        cites:w.cited_by_count,
        concepts:w.concepts||[],
        type:(src.type==='conference')?'Conference contribution':({article:'Article','book-chapter':'Chapter',review:'Review article',book:'Book',preprint:'Preprint',dissertation:'Thesis'}[w.type]||'Article')
      };
    }));
  }catch(e){return (p._cache=[])}
}
const KNOWN_JOURNALS=/journal|bulletin|tectonophysics|^tectonics\b|geophysics,\s*geosystems|letters|reports|physics of the earth|physics and chemistry|soil dynamics|geomatics|seismica|precambrian|gondwana|solid earth|^natural hazards|geologica acta|current science|eos|pure and applied|lithos|earth and planetary science|rev\.|reviews|annals|international|seismological|ieee|nature|science|all earth|acta geophysica|studia geophysica|curr\.\s*sci|deccan geographer/i;
function typeOf(p){
  const t=(p.title||'').trim(), v=(p.venue||'').trim(), tv=t+' '+v;
  if(/\b(thesis|dissertation)\b|^kharagpur\b|indian institute of technology|^iit,\s*kharagpur/i.test(v)) return 'Thesis';
  if(!v || /^preprint$/i.test(v) || /\b(preprint|arxiv|essoar|authorea|research\s*square|ssrn|eartharxiv)\b/i.test(tv)) return 'Preprint';
  if(/\b(abstracts?|meeting|conference|general assembly|symposium|workshop|proceedings|session|egu\d{2}|agu\d{2}|epsc|iugg)\b|\?/i.test(v)) return 'Conference contribution';
  if(/^a review of\b|\breview:\b|\breview article\b/i.test(t)) return 'Review article';
  if(/\b(book|chapter|handbook|encyclopedia|springer\s+nature|agu\s+monograph|elsevier\s+book|special\s+publication|memoir|himalayan\s+natural\s+hazards|probe\s+for\s+subsurface|structural\s+geology\s+and\s+tectonics|remote\s+sensing\s+for\s+geophysicists)\b/i.test(v)) return 'Chapter';
  if(/^[A-Za-z][A-Za-z\s:,\-&]+,\s*\d+\s*[-–]\s*\d+\s*$/.test(v) && !KNOWN_JOURNALS.test(v)) return 'Chapter';
  return p.type || 'Article';
}
function merge(lists){
  const byTitle=new Map();
  lists.flat().forEach(p=>{
    p.type=typeOf(p);
    const k=norm(p.title);
    if(!byTitle.has(k)){
      byTitle.set(k,{...p});
    } else {
      const ex=byTitle.get(k);
      if(p.cites!=null && (ex.cites==null || p.cites>ex.cites)) ex.cites=p.cites;
      if(p.url && !ex.url) ex.url=p.url;
      if(p.concepts?.length && !ex.concepts?.length) ex.concepts=p.concepts;
      if(p.rawAuthorships?.length && !ex.rawAuthorships?.length) ex.rawAuthorships=p.rawAuthorships;
      if(p.publisher && !ex.publisher) ex.publisher=p.publisher;
      if(p.volume && !ex.volume) ex.volume=p.volume;
      if(p.pages && !ex.pages) ex.pages=p.pages;
    }
  });
  return [...byTitle.values()].sort((a,b)=>b.year-a.year);
}
const manualFor=p=>PUBLICATIONS.filter(x=>x.authors.includes(p.id)||x.authors.some(a=>byName(a)===p));
function scholarCacheFor(p){
  const sc = (typeof SCHOLAR_CACHE!=='undefined' && SCHOLAR_CACHE[p.id]) || null;
  if(sc){
    if(sc.scholarId){
      p.links = p.links || {};
      if(!p.links.scholar) p.links.scholar = `https://scholar.google.com/citations?hl=en&user=${sc.scholarId}`;
    }
    if(sc.citations) p.citations = sc.citations;
    if(sc.citationsRecent) p.citationsRecent = sc.citationsRecent;
    if(sc.hindex) p.hindex = sc.hindex;
    if(sc.hindexRecent) p.hindexRecent = sc.hindexRecent;
    if(sc.i10index!=null) p.i10index = sc.i10index;
    if(sc.i10indexRecent!=null) p.i10indexRecent = sc.i10indexRecent;
    return sc.publications || [];
  }
  return [];
}
let _allSyncedPool=null;
function getAllSyncedPool(){
  if(_allSyncedPool) return _allSyncedPool;
  _allSyncedPool=merge([...PEOPLE.map(scholarCacheFor), PUBLICATIONS]);
  return _allSyncedPool;
}
function pubsForSync(p){
  if(p._syncPubs) return p._syncPubs;
  const scPubs = scholarCacheFor(p);
  if(scPubs.length > 0){
    return (p._syncPubs = scPubs.map(sp=>({...sp, type:typeOf(sp)})));
  }
  const pool = getAllSyncedPool();
  return (p._syncPubs = pool.filter(w=>(w.authors||[]).some(a=>a===p.id || byName(a)===p)));
}
async function pubsFor(p){
  return pubsForSync(p);
}

function layout(page){
  const nav=[['index.html','Home'],['people.html','People'],['publications.html','Research output'],['contact.html','Contact']];
  document.body.insertAdjacentHTML('afterbegin',`<header><nav><a class="brand" href="index.html">${LAB.name}</a><div class="links">${nav.map(n=>`<a href="${n[0]}" class="${n[0]===page?'on':''}">${n[1]}</a>`).join('')}</div></nav></header>`);
  document.body.insertAdjacentHTML('beforeend',`<footer>${LAB.name} · ${LAB.institution}<br><a href="mailto:chandrani@gg.iitkgp.ac.in" style="color:#c5d7ea">chandrani@gg.iitkgp.ac.in</a> · <a href="mailto:arun@gg.iitkgp.ac.in" style="color:#c5d7ea">arun@gg.iitkgp.ac.in</a></footer>`);
}
function home(){
  const render=()=>{
    $('#themes').innerHTML=LAB.themes.map(t=>`<div class="card"><h3>${t.title}</h3><p>${t.text}</p></div>`).join('');
    $('#pis').innerHTML=PEOPLE.filter(p=>p.group==='pi').map(card).join('');
    $('#news').innerHTML=LAB.news.map(n=>`<li><strong>${n.date}</strong> – ${n.text}</li>`).join('');
  };
  applyCachedSheetSync();
  render();
  syncLiveSheet(render);
}
function people(){
  let f='all';
  const row=p=>{
    const n=pubsForSync(p).length;
    return `<a class="row" href="person.html?id=${p.id}">${avatar(p)}<div><h3>${p.name}</h3><div class="pos">${p.position}</div><div class="org">${LAB.name}</div>
      <div class="tags">${(p.interests||[]).map(i=>`<span class="tag">${i}</span>`).join('')}</div></div><span class="count" data-id="${p.id}"><b>${n}</b><br>research outputs</span></a>`;
  };
  const draw=()=>{
    const q=$('#q').value.toLowerCase();
    const list=PEOPLE.filter(p=>(f==='all'||(f==='pi'&&p.group==='pi')||(f==='active'&&p.group==='student'&&p.status==='active')||(f==='alumni'&&p.status==='alumni'))
      &&(p.name+' '+p.position+' '+(p.interests||[]).join(' ')).toLowerCase().includes(q)).sort((a,b)=>a.name.replace('Prof. ','').localeCompare(b.name.replace('Prof. ','')));
    $('#total').textContent=list.length+' persons';
    $('#list').innerHTML=list.map(row).join('')||'<p>No results.</p>';
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));
  };
  applyCachedSheetSync();
  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{f=b.dataset.f;draw()});
  $('#q').oninput=draw;
  draw();
  syncLiveSheet(draw);
}
function pubs(){
  applyCachedSheetSync();
  const el=$('#pubs');
  const all=getAllSyncedPool();
  const types=[...new Set(all.map(x=>x.type))];
  let ft='All';
  const draw=()=>{
    const filtered=all.filter(x=>ft==='All'||x.type===ft);
    el.innerHTML=`<div class="tabs">${['All',...types].map(t=>`<button class="${t===ft?'on':''}" data-ft="${t}">${t} (${t==='All'?all.length:all.filter(x=>x.type===t).length})</button>`).join('')}</div><p>${filtered.length} research outputs</p>`+groupByYearHTML(filtered);
    el.querySelectorAll('[data-ft]').forEach(b=>b.onclick=()=>{ft=b.dataset.ft;draw();});
  };
  draw();
}
const hIndex=c=>{c=c.slice().sort((a,b)=>b-a);let h=0;while(h<c.length&&c[h]>=h+1)h++;return h};
const i10Index=c=>c.filter(x=>x>=10).length;

function getHubCollaborations(mine){
  if(typeof COLLAB_HUBS==='undefined') return [];
  const hubsMap=new Map();
  mine.forEach(pub=>{
    const authText=(pub.authors||[]).join(' ').toLowerCase();
    const venueText=(pub.venue||'').toLowerCase();
    const fullText=authText+' '+venueText;

    COLLAB_HUBS.forEach(hub=>{
      if(hub.isHome) return;
      const matched=(hub.patterns||[]).some(pat=>{
        try{ return new RegExp(pat,'i').test(fullText); }catch(e){ return false; }
      });
      if(matched){
        if(!hubsMap.has(hub.id)){
          hubsMap.set(hub.id,{...hub, count:0, pubs:[]});
        }
        const entry=hubsMap.get(hub.id);
        entry.count++;
        if(!entry.pubs.some(p=>p.title===pub.title)){
          entry.pubs.push(pub);
        }
      }
    });
  });

  if(hubsMap.size===0){
    COLLAB_HUBS.filter(h=>!h.isHome).forEach(hub=>{
      hubsMap.set(hub.id,{...hub, count:1, pubs:[], isLabWide:true});
    });
  }
  return Array.from(hubsMap.values()).sort((a,b)=>b.count-a.count);
}

function makeFlightArc(x0, y0, x1, y1){
  const dx=x1-x0, dy=y1-y0;
  const dist=Math.hypot(dx, dy);
  const mx=(x0+x1)/2, my=(y0+y1)/2;
  const arch=Math.min(130, Math.max(28, dist*0.22));
  const cx=mx, cy=my-arch;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function renderNetwork(p, mine){
  const hubs=getHubCollaborations(mine);
  const intlHubs=hubs.filter(h=>h.intl);
  const natHubs=hubs.filter(h=>!h.intl);
  const uniqueCountries=new Set(hubs.map(h=>h.country)).size;
  const uniqueContinents=new Set(hubs.map(h=>h.continent||'Asia')).size;
  const totalJointPubs=hubs.reduce((acc,h)=>acc+h.count,0);

  const egoNorm=norm(p.name);
  const coMap={}, instMap={};
  mine.forEach(w=>{
    (w.authors||[]).forEach(rawA=>{
      const matched=byId(rawA)||byName(rawA);
      const disp=matched?matched.name:rawA;
      const k=norm(disp);
      if(!k || k===egoNorm) return;
      if(!coMap[k]) coMap[k]={key:k, name:disp, count:0, id:matched?matched.id:null};
      coMap[k].count++;
    });
    (w.rawAuthorships||[]).forEach(ra=>{
      (ra.inst||[]).forEach(ins=>{
        if(/Kharagpur/i.test(ins)) return;
        instMap[ins]=(instMap[ins]||0)+1;
      });
    });
  });

  return `<h2>Collaboration Network</h2>
  <p>Explore the global research footprint and co-authorship collaboration network of <strong>${p.name}</strong> spanning <strong>${uniqueCountries} countries</strong> and <strong>${hubs.length} partner institutions</strong> worldwide.</p>
  
  <div class="net-view-switch">
    <button class="on" data-view="map">🗺️ World Collaboration Map (${hubs.length} Hubs)</button>
    <button data-view="graph">🕸️ Co-author Radial Graph (${Object.keys(coMap).length} Co-authors)</button>
  </div>

  <!-- VIEW 1: WORLD MAP -->
  <div id="net-map-view" class="net-view-panel">
    <div class="map-metrics-bar">
      <span class="map-stat-pill">🌍 Continents: <b>${uniqueContinents}</b></span>
      <span class="map-stat-pill">🏳️ Countries: <b>${uniqueCountries}</b></span>
      <span class="map-stat-pill">🌐 International: <b>${intlHubs.length} hubs</b></span>
      <span class="map-stat-pill">🇮🇳 National: <b>${natHubs.length} hubs</b></span>
      <span class="map-stat-pill">📄 Joint Outputs: <b>${totalJointPubs}</b></span>
    </div>

    <div class="map-layout">
      <div class="map-canvas-wrap">
        <div class="map-zoom-controls">
          <button id="map-zoom-in" title="Zoom In">+</button>
          <button id="map-zoom-out" title="Zoom Out">−</button>
          <button id="map-zoom-reset" title="Reset View">↺</button>
        </div>
        <svg id="worldsvg" viewBox="0 0 960 520"></svg>
        <div class="map-legend-overlay">
          <span class="map-legend-item"><span class="legend-dot home-dot"></span> Lab Hub (IIT KGP)</span>
          <span class="map-legend-item"><span class="legend-dot intl-dot"></span> International Partner</span>
          <span class="map-legend-item"><span class="legend-dot nat-dot"></span> National Partner</span>
        </div>
        <div id="hub-detail-box" style="display:none" class="hub-detail-card"></div>
      </div>

      <div class="map-side-panel">
        <h3>Collaborating Hubs <span>${hubs.length}</span></h3>
        <div class="map-filter-tabs">
          <button class="on" data-mapfilter="all">All (${hubs.length})</button>
          <button data-mapfilter="intl">🌐 International (${intlHubs.length})</button>
          <button data-mapfilter="nat">🇮🇳 National (${natHubs.length})</button>
        </div>
        <input type="text" id="map-search" class="map-search-input" placeholder="Search institution, city or country…">
        <ul id="map-hub-list" class="map-hub-list"></ul>
      </div>
    </div>
  </div>

  <!-- VIEW 2: RADIAL GRAPH -->
  <div id="net-graph-view" class="net-view-panel" style="display:none">
    <div class="net-controls">
      <button class="on" data-nm="authors">Co-authors (${Object.keys(coMap).length})</button>
      ${Object.keys(instMap).length ? `<button data-nm="inst">Collaborating Institutions (${Object.keys(instMap).length})</button>` : ''}
    </div>
    <div class="net-wrap">
      <svg id="netsvg" viewBox="0 0 800 520"></svg>
      <div class="net-side">
        <h3 id="net-side-title">Top Co-authors</h3>
        <ul class="net-list" id="net-list"></ul>
      </div>
    </div>
  </div>`;
}

function initNetworkInteractive(p, mine){
  // 1. View Switcher Wiring
  document.querySelectorAll('.net-view-switch button').forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll('.net-view-switch button').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      const v=b.dataset.view;
      const mv=$('#net-map-view'), gv=$('#net-graph-view');
      if(mv) mv.style.display=v==='map'?'block':'none';
      if(gv) gv.style.display=v==='graph'?'block':'none';
    };
  });

  // 2. Initialize World Collaboration Map
  initWorldMapInteractive(p, mine);

  // 3. Initialize Co-author Radial Graph
  initRadialGraphInteractive(p, mine);
}

function initWorldMapInteractive(p, mine){
  const svg=$('#worldsvg');
  if(!svg || typeof WORLD_MAP_SVG==='undefined') return;

  const hubs=getHubCollaborations(mine);
  const homeHub=(typeof COLLAB_HUBS!=='undefined'&&COLLAB_HUBS.find(h=>h.isHome))||{
    name:"Broadband Seismology Lab, IIT Kharagpur",
    short:"IIT Kharagpur (Lab Hub)",
    city:"Kharagpur, West Bengal",
    country:"India",
    coords:[87.3105, 22.3149]
  };

  const [hx, hy]=WORLD_MAP_SVG.project(homeHub.coords[0], homeHub.coords[1]);

  let curFilter='all';
  let curSearch='';
  let activeHubId=null;

  // ViewBox pan/zoom state strictly keeping 960:520 (ratio 1.846)
  const origVB=[0, 0, 960, 520];
  let curVB=[...origVB];
  let isPanning=false, startPt={x:0, y:0}, totalDragDist=0;

  const clampViewBox=()=>{
    const maxW=960, maxH=520;
    // Allow zoom between 220px (4.3x zoom) and 960px (full world)
    curVB[2]=Math.max(220, Math.min(maxW, curVB[2]));
    curVB[3]=curVB[2]*(maxH/maxW);
    // Allow smooth margins around world borders
    const minX=-50, maxX=maxW - curVB[2] + 50;
    const minY=-30, maxY=maxH - curVB[3] + 30;
    curVB[0]=Math.max(minX, Math.min(maxX, curVB[0]));
    curVB[1]=Math.max(minY, Math.min(maxY, curVB[1]));
  };

  const updateViewBox=()=>{
    clampViewBox();
    svg.setAttribute('viewBox', `${curVB[0].toFixed(1)} ${curVB[1].toFixed(1)} ${curVB[2].toFixed(1)} ${curVB[3].toFixed(1)}`);
  };

  // Center-anchored zoom buttons
  const zoomAtCenter=(factor)=>{
    const cx=curVB[0]+curVB[2]/2;
    const cy=curVB[1]+curVB[3]/2;
    const targetW=curVB[2]*factor;
    const targetH=targetW*(520/960);
    curVB[0]=cx - targetW/2;
    curVB[1]=cy - targetH/2;
    curVB[2]=targetW;
    curVB[3]=targetH;
    updateViewBox();
  };

  const zoomBtnIn=$('#map-zoom-in');
  if(zoomBtnIn) zoomBtnIn.onclick=()=>zoomAtCenter(0.72);

  const zoomBtnOut=$('#map-zoom-out');
  if(zoomBtnOut) zoomBtnOut.onclick=()=>zoomAtCenter(1.38);

  const zoomBtnReset=$('#map-zoom-reset');
  if(zoomBtnReset) zoomBtnReset.onclick=()=>{
    curVB=[...origVB];
    activeHubId=null;
    updateViewBox();
    renderDetails(null);
    renderSideList();
    applyActiveHighlights();
  };

  // Pointer Events for smooth dragging on Desktop and Touch devices without window listener leaks
  svg.onpointerdown=e=>{
    if(e.button!==0) return;
    isPanning=true;
    totalDragDist=0;
    startPt={x:e.clientX, y:e.clientY};
    svg.classList.add('is-panning');
    try { svg.setPointerCapture(e.pointerId); } catch(err){}
  };

  svg.onpointermove=e=>{
    if(!isPanning) return;
    const rect=svg.getBoundingClientRect();
    if(!rect.width || !rect.height) return;
    const dx=(e.clientX-startPt.x)*(curVB[2]/rect.width);
    const dy=(e.clientY-startPt.y)*(curVB[3]/rect.height);
    totalDragDist+=Math.hypot(e.clientX-startPt.x, e.clientY-startPt.y);
    curVB[0]-=dx;
    curVB[1]-=dy;
    startPt={x:e.clientX, y:e.clientY};
    updateViewBox();
  };

  svg.onpointerup=svg.onpointercancel=e=>{
    if(isPanning){
      isPanning=false;
      svg.classList.remove('is-panning');
      try { svg.releasePointerCapture(e.pointerId); } catch(err){}
    }
  };

  // Smooth wheel zoom centered on cursor coordinates
  svg.onwheel=e=>{
    e.preventDefault();
    const rect=svg.getBoundingClientRect();
    if(!rect.width || !rect.height) return;

    const mx=Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width));
    const my=Math.max(0, Math.min(1, (e.clientY-rect.top)/rect.height));

    const worldX=curVB[0] + mx*curVB[2];
    const worldY=curVB[1] + my*curVB[3];

    const factor=e.deltaY<0 ? 0.88 : 1.15;
    const targetW=Math.max(220, Math.min(960, curVB[2]*factor));
    const targetH=targetW*(520/960);

    curVB[0]=worldX - mx*targetW;
    curVB[1]=worldY - my*targetH;
    curVB[2]=targetW;
    curVB[3]=targetH;

    updateViewBox();
  };

  // Double click to zoom in
  svg.ondblclick=e=>{
    e.preventDefault();
    const rect=svg.getBoundingClientRect();
    if(!rect.width || !rect.height) return;
    const mx=Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width));
    const my=Math.max(0, Math.min(1, (e.clientY-rect.top)/rect.height));
    const worldX=curVB[0] + mx*curVB[2];
    const worldY=curVB[1] + my*curVB[3];
    const targetW=Math.max(220, curVB[2]*0.65);
    const targetH=targetW*(520/960);
    curVB[0]=worldX - mx*targetW;
    curVB[1]=worldY - my*targetH;
    curVB[2]=targetW;
    curVB[3]=targetH;
    updateViewBox();
  };

  const renderDetails=hub=>{
    const box=$('#hub-detail-box');
    if(!box) return;
    if(!hub){
      box.style.display='none';
      return;
    }
    const pubList=(hub.pubs||[]).map(pub=>{
      const u=pub.url||`https://scholar.google.com/scholar?q=${encodeURIComponent(pub.title)}`;
      return `<li><a href="${u}" target="_blank" rel="noopener">${pub.title}</a> <span style="color:var(--muted)">(${pub.year||''})</span></li>`;
    }).join('');

    box.style.display='block';
    box.innerHTML=`
      <h4>${hub.flag||'🏛️'} ${hub.name}</h4>
      <p><strong>Location:</strong> ${hub.city}, ${hub.country} · <span class="map-hub-badge ${hub.intl?'intl-badge':''}">${hub.intl?'International Partner':'National Partner'}</span></p>
      ${hub.scientists?`<p><strong>Key Collaborating Researchers:</strong> ${hub.scientists}</p>`:''}
      <p><strong>Joint Research Outputs (${hub.count}):</strong></p>
      ${pubList?`<ul class="hub-pubs-list">${pubList}</ul>`:'<p style="font-size:0.84rem;color:var(--muted);margin-left:14px">Lab-wide collaborative research in Seismology & Geodynamics.</p>'}`;
  };

  const renderSideList=()=>{
    const filtered=hubs.filter(h=>{
      const matchFilter=curFilter==='all' || (curFilter==='intl'&&h.intl) || (curFilter==='nat'&&!h.intl);
      const matchSearch=!curSearch || (h.name+' '+h.city+' '+h.country+' '+(h.scientists||'')).toLowerCase().includes(curSearch);
      return matchFilter && matchSearch;
    });

    const list=$('#map-hub-list');
    if(!list) return;
    list.innerHTML=filtered.map(h=>`
      <li class="map-hub-item ${activeHubId===h.id?'active':''}" data-hid="${h.id}">
        <div class="map-hub-item-hdr">
          <strong>${h.flag||'🏛️'} ${h.short||h.name}</strong>
          <span class="map-hub-badge ${h.intl?'intl-badge':''}">${h.count} paper${h.count===1?'':'s'}</span>
        </div>
        <div class="map-hub-loc">${h.city}, ${h.country}</div>
        ${h.scientists?`<div class="map-hub-people">${h.scientists}</div>`:''}
      </li>`).join('')||'<li style="padding:12px;color:var(--muted);font-size:0.85rem">No matching partner hubs.</li>';

    list.querySelectorAll('.map-hub-item').forEach(li=>{
      li.onclick=()=>{
        const hid=li.dataset.hid;
        selectHub(hid);
      };
    });
  };

  const applyActiveHighlights=()=>{
    svg.querySelectorAll('.flight-arc').forEach(a=>{
      const isAct=a.dataset.hid===activeHubId;
      a.classList.toggle('active-arc', isAct);
      a.style.opacity=isAct ? '1' : (activeHubId ? '0.22' : '');
    });
    svg.querySelectorAll('.flight-arc-glow').forEach(g=>{
      g.setAttribute('opacity', g.dataset.hid===activeHubId ? '0.6' : '0');
    });
    svg.querySelectorAll('.hub-pin').forEach(p=>{
      p.classList.toggle('active-pin', p.dataset.hid===activeHubId);
    });
  };

  const selectHub=hid=>{
    activeHubId=hid;
    const hub=hubs.find(h=>h.id===hid);
    renderDetails(hub);
    renderSideList();
    applyActiveHighlights();

    if(hub){
      const [px, py]=WORLD_MAP_SVG.project(hub.coords[0], hub.coords[1]);
      const midX=(hx+px)/2;
      const midY=(hy+py)/2;
      const spanX=Math.abs(px-hx);
      const spanY=Math.abs(py-hy);
      // Ensure aspect ratio is strictly preserved with comfortable padding
      const targetW=Math.max(340, Math.min(960, Math.max(spanX+180, (spanY+120)*(960/520))));
      const targetH=targetW*(520/960);
      curVB=[
        midX - targetW/2,
        midY - targetH/2,
        targetW,
        targetH
      ];
      updateViewBox();
    }
  };

  const renderMapElements=()=>{
    // Draw Graticule lines
    const parallels=[-30, 0, 30, 60];
    const meridians=[-120, -60, 0, 60, 120];
    const grats=[];
    parallels.forEach(lat=>{
      const [, y]=WORLD_MAP_SVG.project(0, lat);
      grats.push(`<line class="${lat===0?'map-equator':'map-graticule'}" x1="0" y1="${y}" x2="960" y2="${y}"/>`);
    });
    meridians.forEach(lon=>{
      const [x]=WORLD_MAP_SVG.project(lon, 0);
      grats.push(`<line class="map-graticule" x1="${x}" y1="0" x2="${x}" y2="520"/>`);
    });

    const activeHubs=hubs.filter(h=>{
      if(curFilter==='intl') return h.intl;
      if(curFilter==='nat') return !h.intl;
      return true;
    });

    // Draw Arcs from Home (IIT Kharagpur) to each partner hub
    const arcsHTML=activeHubs.map(h=>{
      const [x, y]=WORLD_MAP_SVG.project(h.coords[0], h.coords[1]);
      const d=makeFlightArc(hx, hy, x, y);
      const isAct=activeHubId===h.id;
      return `
        <path class="flight-arc-glow" data-hid="${h.id}" d="${d}" opacity="${isAct?'0.6':'0'}"/>
        <path class="flight-arc ${isAct?'active-arc':''}" data-hid="${h.id}" d="${d}" style="stroke-width:${isAct?3.4:Math.max(1.5, Math.min(3, 1.2+Math.sqrt(h.count)*0.5))}"/>`;
    }).join('');

    // Draw Hub Pins directly positioned at (x, y)
    const pinsHTML=activeHubs.map(h=>{
      const [x, y]=WORLD_MAP_SVG.project(h.coords[0], h.coords[1]);
      const isAct=activeHubId===h.id;
      const r=Math.min(13, Math.max(6, Math.round(5 + Math.sqrt(h.count)*2.2)));
      const cls=h.intl?'intl':'national';
      return `
        <g class="hub-pin ${cls} ${isAct?'active-pin':''}" data-hid="${h.id}" transform="translate(${x},${y})">
          <circle r="${r+3}" fill="${h.intl?'#d97706':'#0070cc'}" opacity="0.18"/>
          <circle class="pin-core" r="${r}"/>
          <text y="3" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${h.count}</text>
          <text class="pin-lbl" y="${r+12}" text-anchor="middle">${h.short||h.name}</text>
          <title>${h.name} (${h.city}, ${h.country}) — ${h.count} joint publications</title>
        </g>`;
    }).join('');

    // Home Beacon (IIT Kharagpur)
    const homeBeaconHTML=`
      <g class="home-beacon" transform="translate(${hx},${hy})">
        <circle class="beacon-pulse" r="10" fill="#f59e0b"/>
        <circle r="8" fill="#0a2540" stroke="#ffffff" stroke-width="2.5"/>
        <circle r="3.5" fill="#f59e0b"/>
        <text class="pin-lbl" y="-12" text-anchor="middle" font-weight="700" fill="#0a2540">📍 IIT Kharagpur (Lab Hub)</text>
      </g>`;

    svg.innerHTML=`
      <rect width="960" height="520" fill="#edf5fc"/>
      <g class="graticules">${grats.join('')}</g>
      <path class="map-land" d="${WORLD_MAP_SVG.land}"/>
      <path class="map-borders" d="${WORLD_MAP_SVG.borders}"/>
      <g class="arcs">${arcsHTML}</g>
      <g class="pins">${pinsHTML}</g>
      ${homeBeaconHTML}`;

    // Wire clicks & hovers on pins and arcs
    svg.querySelectorAll('.hub-pin, .flight-arc').forEach(el=>{
      const hid=el.dataset.hid;
      el.onclick=()=>{
        if(totalDragDist>6) return; // Ignore if user was panning/dragging
        selectHub(hid);
      };
      el.onmouseenter=()=>{
        svg.querySelectorAll('.flight-arc').forEach(a=>{
          if(a.dataset.hid===hid) a.classList.add('active-arc');
          else if(!activeHubId) a.style.opacity='0.2';
        });
      };
      el.onmouseleave=()=>{
        svg.querySelectorAll('.flight-arc').forEach(a=>{
          if(a.dataset.hid!==activeHubId) a.classList.remove('active-arc');
          a.style.opacity=activeHubId ? (a.dataset.hid===activeHubId?'1':'0.22') : '';
        });
      };
    });
  };

  // Wire Map Filter Tabs
  document.querySelectorAll('.map-filter-tabs button').forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll('.map-filter-tabs button').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      curFilter=b.dataset.mapfilter;
      renderSideList();
      renderMapElements();
      updateViewBox();
    };
  });

  // Wire Map Search Box
  const searchInput=$('#map-search');
  if(searchInput){
    searchInput.oninput=()=>{
      curSearch=searchInput.value.toLowerCase().trim();
      renderSideList();
    };
  }

  // Initial draw
  renderSideList();
  renderMapElements();
  updateViewBox();
}

function initRadialGraphInteractive(p, mine){
  const svg=$('#netsvg');
  if(!svg) return;
  const egoNorm=norm(p.name);
  const coMap={}, instMap={}, pairMap={};
  mine.forEach(w=>{
    const coList=[];
    (w.authors||[]).forEach(rawA=>{
      const matched=byId(rawA)||byName(rawA);
      const disp=matched?matched.name:rawA;
      const k=norm(disp);
      if(!k || k===egoNorm) return;
      if(!coMap[k]) coMap[k]={key:k, name:disp, count:0, id:matched?matched.id:null};
      coMap[k].count++;
      coList.push(k);
    });
    for(let i=0;i<coList.length;i++){
      for(let j=i+1;j<coList.length;j++){
        const pk=[coList[i],coList[j]].sort().join('|');
        pairMap[pk]=(pairMap[pk]||0)+1;
      }
    }
    (w.rawAuthorships||[]).forEach(ra=>{
      (ra.inst||[]).forEach(ins=>{
        if(/Kharagpur/i.test(ins)) return;
        instMap[ins]=(instMap[ins]||0)+1;
      });
    });
  });

  const drawMode=(mode)=>{
    const W=800, H=520, cx=W/2, cy=H/2;
    const items = mode==='inst'
      ? Object.entries(instMap).sort((a,b)=>b[1]-a[1]).slice(0,18).map((e,i)=>({key:'i'+i, name:e[0], count:e[1], id:null, isInst:true}))
      : Object.values(coMap).sort((a,b)=>b.count-a.count).slice(0,22);

    const maxC=Math.max(1,...items.map(x=>x.count));
    const nodes=[{key:'ego', name:p.name, count:mine.length, x:cx, y:cy, r:28, fixed:true, ego:true}];
    items.forEach((it, idx)=>{
      const ang=(2*Math.PI*idx)/items.length - Math.PI/2;
      const dist=idx%2===0 ? 185 : 135;
      const r=Math.round(10 + 14*(it.count/maxC));
      nodes.push({...it, x:cx+dist*Math.cos(ang), y:cy+dist*Math.sin(ang), r});
    });

    const nodeByKey=Object.fromEntries(nodes.map(n=>[n.key,n]));
    const edges=items.map(it=>({a:'ego', b:it.key, w:it.count, primary:true}));
    if(mode==='authors'){
      Object.entries(pairMap).forEach(([pk,w])=>{
        const [u,v]=pk.split('|');
        if(nodeByKey[u]&&nodeByKey[v]&&w>=1) edges.push({a:u, b:v, w, primary:false});
      });
    }

    const paint=()=>{
      svg.innerHTML=`
        <g class="edges">
          ${edges.map(e=>{
            const na=nodeByKey[e.a], nb=nodeByKey[e.b];
            const sw=e.primary ? Math.max(1.5, Math.min(7, 1.5 + (e.w/maxC)*5.5)) : Math.max(0.8, Math.min(3, e.w*0.8));
            const op=e.primary ? 0.55 : 0.22;
            const col=e.primary ? '#0070cc' : '#8da9c4';
            return `<line data-a="${e.a}" data-b="${e.b}" x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}" stroke="${col}" stroke-width="${sw}" stroke-opacity="${op}"/>`;
          }).join('')}
        </g>
        <g class="nodes">
          ${nodes.map(n=>{
            const fill=n.ego ? '#0a2540' : (n.id ? '#0070cc' : (n.isInst ? '#1b6ca8' : '#647d96'));
            const shortName=n.name.length>26 ? n.name.slice(0,24)+'…' : n.name;
            return `<g class="n-grp" data-k="${n.key}" transform="translate(${n.x},${n.y})" style="cursor:${n.id?'pointer':'grab'}">
              <circle r="${n.r}" fill="${fill}" stroke="#fff" stroke-width="2.5"/>
              <title>${n.name} (${n.count} shared research outputs)${n.id?' — Click to view lab profile':''}</title>
              <text y="${n.r+13}" text-anchor="middle" font-size="11" font-weight="${n.ego||n.id?'600':'400'}" fill="#1b2735">${shortName}</text>
              <text y="4" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${n.ego?'':n.count}</text>
            </g>`;
          }).join('')}
        </g>
        <g transform="translate(14, 18)" font-size="11" fill="#5a6b7c">
          <circle cx="6" cy="-4" r="5" fill="#0a2540"/><text x="16" y="0">Researcher</text>
          <circle cx="96" cy="-4" r="5" fill="#0070cc"/><text x="106" y="0">Lab Member (click to open)</text>
          <circle cx="272" cy="-4" r="5" fill="${mode==='inst'?'#1b6ca8':'#647d96'}"/><text x="282" y="0">${mode==='inst'?'External Institution':'External Co-author'}</text>
        </g>`;

      let dragNode=null, moved=false;
      svg.querySelectorAll('.n-grp').forEach(g=>{
        const k=g.dataset.k;
        const n=nodeByKey[k];
        g.onmouseenter=()=>{
          svg.querySelectorAll('.edges line').forEach(ln=>{
            const hit=ln.dataset.a===k||ln.dataset.b===k;
            ln.setAttribute('stroke-opacity', hit?'0.95':'0.1');
          });
        };
        g.onmouseleave=()=>{
          svg.querySelectorAll('.edges line').forEach(ln=>{
            const isP=ln.dataset.a==='ego';
            ln.setAttribute('stroke-opacity', isP?'0.55':'0.22');
          });
        };
        g.onmousedown=(ev)=>{
          ev.preventDefault();
          dragNode=n; moved=false;
        };
        g.onclick=()=>{
          if(!moved && n.id) location.href='person.html?id='+n.id;
        };
      });
      svg.onmousemove=(ev)=>{
        if(!dragNode) return;
        moved=true;
        const pt=svg.createSVGPoint();
        pt.x=ev.clientX; pt.y=ev.clientY;
        const loc=pt.matrixTransform(svg.getScreenCTM().inverse());
        dragNode.x=Math.max(40, Math.min(W-40, loc.x));
        dragNode.y=Math.max(35, Math.min(H-35, loc.y));
        paint();
      };
      window.onmouseup=()=>{dragNode=null;};
    };
    paint();

    $('#net-side-title').textContent = mode==='inst' ? 'Collaborating Institutions' : 'Top Co-authors';
    $('#net-list').innerHTML = items.map(it=>`
      <li>
        <span>${it.id?`<a href="person.html?id=${it.id}"><strong>${it.name}</strong></a> <span class="badge-sm">Lab</span>`:it.name}</span>
        <b>${it.count}</b>
      </li>`).join('');
  };

  document.querySelectorAll('.net-controls button').forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll('.net-controls button').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      drawMode(b.dataset.nm);
    };
  });
  drawMode('authors');
}

function person(){
  const render=()=>{
    const p=byId(new URLSearchParams(location.search).get('id'));
    if(!p){$('#person').innerHTML='<p>Person not found. <a href="people.html">Back to people</a></p>';return}
    scholarCacheFor(p);
    document.title=p.name+' – '+LAB.name;
    const l=p.links||{};const L={scholar:'Google Scholar',researchgate:'ResearchGate',orcid:'ORCID',web:'Website'};
    const cleanNm=p.name.replace(/Prof\.|Dr\./g,'').trim();
    const fb={
      scholar:`https://scholar.google.com/citations?view_op=search_authors&mauthors=${encodeURIComponent(cleanNm+' IIT Kharagpur')}`,
      researchgate:`https://www.google.com/search?q=${encodeURIComponent('site:researchgate.net/profile "'+cleanNm+'" "Kharagpur"')}`
    };
    const links=Object.entries(L).filter(e=>l[e[0]]||fb[e[0]]).map(e=>l[e[0]]?`<a class="ext ext-verified" href="${l[e[0]]}" target="_blank" rel="noopener">${e[1]} ↗</a>`:`<a class="ext" href="${fb[e[0]]}" target="_blank" rel="noopener">Search ${e[1]} ↗</a>`).join('');
    const emailLines=[];
    if(p.instEmail) emailLines.push(`<b>Institutional Email:</b> <a href="mailto:${p.instEmail}">${p.instEmail}</a>`);
    if(p.personalEmail && p.personalEmail!==p.instEmail) emailLines.push(`<b>Personal Email:</b> <a href="mailto:${p.personalEmail}">${p.personalEmail}</a>`);
    if(!emailLines.length && p.email) emailLines.push(`<b>Email:</b> <a href="mailto:${p.email}">${p.email}</a>`);
    $('#person').innerHTML=`<div class="phead">${avatar(p)}<div><h1>${p.name}</h1>${p.status==='alumni'?'<span class="badge">Alumni</span>':''}
      <p class="ptitle">${p.title||p.role}</p><p class="pline">${p.area||'Seismology'}</p><p class="pline">${LAB.department||''}</p><p class="pline">${LAB.institution}</p>
      ${p.status==='alumni'||(p.position&&!/^PhD Scholar, Dept\. of Geology/i.test(p.position))?`<p class="pline"><b>Current affiliation:</b> ${p.position}</p>`:''}
      ${l.orcid?`<p class="pline"><a href="${l.orcid}" target="_blank">${l.orcid}</a></p>`:''}${emailLines.length?`<p class="pline">${emailLines.join('<br>')}</p>`:''}
      <div class="exts">${links}</div></div><div class="metrics" id="metrics"></div></div>
     <div class="ptabs">
       <button data-t="overview">Overview</button>
       <button data-t="output">Research output</button>
       <button data-t="network">Network</button>
       <button data-t="finger">Fingerprint</button>
     </div>
     <div id="tab"></div>`;
    const mine=pubsForSync(p);
  const cites=mine.filter(x=>x.cites!=null).map(x=>x.cites);
  const citesRecent=mine.filter(x=>x.cites!=null && x.year>=2021).map(x=>x.cites);
  const total=p.citations!=null?p.citations:cites.reduce((a,b)=>a+b,0);
  const h=p.hindex!=null?p.hindex:hIndex(cites);
  const i10=p.i10index!=null?p.i10index:i10Index(cites);
  const totalRec=p.citationsRecent!=null?p.citationsRecent:citesRecent.reduce((a,b)=>a+b,0);
  const hRec=p.hindexRecent!=null?p.hindexRecent:hIndex(citesRecent);
  const i10Rec=p.i10indexRecent!=null?p.i10indexRecent:i10Index(citesRecent);
  const hasScholarMetrics = p.citations!=null || p.hindex!=null || p.i10index!=null;

  // Build ANU-style "Research activity per year" bar plot
  const validYears=mine.map(x=>Number(x.year)).filter(y=>y>=1970 && y<=2030);
  let yearPlotHTML='';
  if(validYears.length){
    const rawMin=Math.min(...validYears), maxY=Math.max(...validYears);
    const minY=Math.min(rawMin, maxY-4);
    const yrCounts=[];
    for(let y=minY;y<=maxY;y++){
      yrCounts.push({y, c:mine.filter(x=>Number(x.year)===y).length});
    }
    const maxC=Math.max(1, ...yrCounts.map(o=>o.c));
    yearPlotHTML=`
      <div class="yr-activity">
        <div class="yr-chart-row">
          <span class="yr-bound">${minY}</span>
          <div class="yr-bars">
            ${yrCounts.map(o=>{
              const hPct=o.c>0 ? Math.max(16, Math.round((o.c/maxC)*100)) : 4;
              return `<div class="yr-col" title="${o.y}: ${o.c} research output${o.c===1?'':'s'}">
                <div class="yr-bar ${o.c===0?'yr-zero':''}" style="height:${hPct}%"></div>
              </div>`;
            }).join('')}
          </div>
          <span class="yr-bound">${maxY}</span>
        </div>
        <div class="yr-caption">Research activity per year</div>
      </div>`;
  }

  $('#metrics').innerHTML=`
    <div class="metrics-top">
      <div class="m-count"><b>${mine.length}</b>Research outputs</div>
      <table class="gs-table">
        <thead><tr><th></th><th>All</th><th>Since 2021</th></tr></thead>
        <tbody>
          <tr><td>Citations</td><td><b>${total}</b></td><td><b>${totalRec}</b></td></tr>
          <tr><td>h-index</td><td><b>${h}</b></td><td><b>${hRec}</b></td></tr>
          <tr><td>i10-index</td><td><b>${i10}</b></td><td><b>${i10Rec}</b></td></tr>
        </tbody>
      </table>
    </div>
    ${yearPlotHTML}
    <small class="metrics-src">Metrics: ${hasScholarMetrics?(l.scholar?`<a href="${l.scholar}" target="_blank" rel="noopener">Google Scholar ↗</a>`:'Google Scholar'):'OpenAlex / ORCID'}</small>`;

  // fingerprint: aggregate OpenAlex concepts + domain-specific Earth & Seismology topic taxonomy across all publications
  const TOPICS=[
    ['Seismic Wave Attenuation', /attenuat|coda|\bqc\b|\bq0\b|pgq|lgq|quality factor/i],
    ['Crustal Structure & Heterogeneity', /crust|moho|discontinuity|heterogene/i],
    ['Himalayan Seismotectonics', /himalay|sikkim|bhutan|kumaun|garhwal|arunachal|nepal/i],
    ['Tibetan Plateau Geodynamics', /tibet|lhasa|qiantang/i],
    ['Seismic Tomography', /tomograph|inversion|velocity model|travel[- ]?time/i],
    ['Seismic Anisotropy & Shear-Wave Splitting', /anisotrop|splitting|sks|birefringence|polarization/i],
    ['Receiver Function Analysis', /receiver function|p-to-s|s-to-p|\brf\b/i],
    ['Lithospheric & Mantle Deformation', /lithospher|mantle|asthenospher|slab|subduct|underthrust/i],
    ['Ambient Seismic Noise & Surface Waves', /ambient noise|rayleigh|love wave|surface wave|microseism|hvsr/i],
    ['Earthquake Source Parameters & Stress', /source parameter|focal mechanism|stress drop|moment tensor|b-value|fractal/i],
    ['Seismic Hazard & Ground Motion', /hazard|ground motion|site response|early warning|peak ground/i],
    ['Reservoir-Triggered & Induced Seismicity', /reservoir|koyna|warna|triggered|induced seismicity/i],
    ['Indian Shield & Cratonic Basins', /craton|chhattisgarh|eastern ghats|dharwar|singhbhum|ghat|shield|gondwana|basin/i],
    ['Fault Zone Architecture', /fault|shear zone|thrust|mbt|mct|dhubri|chungthang|kopili/i],
    ['Body Waves (Pg, Lg, Sn, Pn)', /\bpg\b|\blg\b|\bsn\b|\bpn\b|body wave/i],
    ['Deep Learning & Signal Processing', /deep learning|neural network|machine learning|signal|waveform|filter/i]
  ];
  const GENERIC=/^(geology|computer science|physics|geography|materials science|mathematics|engineering|chemistry|artificial intelligence)$/i;
  const w={};
  mine.forEach(x=>{
    (x.concepts||[]).forEach(c=>{
      if(c.score>0.35 && !GENERIC.test(c.display_name)){
        w[c.display_name]=(w[c.display_name]||0)+c.score;
      }
    });
    const txt=`${x.title||''} ${x.venue||''}`;
    TOPICS.forEach(([label, rx])=>{
      if(rx.test(txt)) w[label]=(w[label]||0)+1.2;
    });
  });
  const fp=Object.entries(w).sort((a,b)=>b[1]-a[1]).slice(0,18),mx=fp.length?fp[0][1]:1;
  const types=[...new Set(mine.map(x=>x.type))];let ft='All';
  const prevHTML = (p.prevList && p.prevList.length)
    ? `<p><b>Previous Affiliations / Past Positions:</b></p><ul style="margin:4px 0 14px 20px">${p.prevList.map(item=>`<li>${item}</li>`).join('')}</ul>`
    : (p.prevPositions ? `<p><b>Previous Affiliations / Past Positions:</b> ${p.prevPositions}</p>` : '');
  const tabs={
    overview:()=>`<h2>Overview</h2>${p.thesis?`<p><b>${p.degree||'PhD'} Thesis${p.gradYear?' ('+p.gradYear+')':''}:</b> ${p.thesis}</p>`:""}${p.bio && (!p.thesis || !p.bio.startsWith('Thesis:'))?`<p>${p.bio}</p>`:""}${prevHTML}<p>${(p.interests||[]).map(i=>`<span class="tag">${i}</span>`).join('')}</p>
      <h2>Recent research output</h2><ul class="pubs">${mine.slice(0,3).map(pubItem).join('')||'<li>No publications listed.</li>'}</ul>`,
    output:()=>`<h2>Research output</h2><div class="tabs">${['All',...types].map(t=>`<button class="${t===ft?'on':''}" data-ft="${t}">${t} (${t==='All'?mine.length:mine.filter(x=>x.type===t).length})</button>`).join('')}</div>
      ${groupByYearHTML(mine.filter(x=>ft==='All'||x.type===ft))}`,
    network:()=>renderNetwork(p, mine),
    finger:()=>`<h2>Fingerprint</h2><p>Dive into the research topics of ${p.name}. Together they form a unique fingerprint (built from the topics of their publications).</p>
      ${fp.map(e=>`<div class="fp"><span>${e[0]}</span><div class="bar"><i style="width:${Math.round(e[1]/mx*100)}%"></i></div></div>`).join('')||'<p>No fingerprint yet: add an ORCID link so publication topics can be loaded.</p>'}`};
  const show=t=>{
    $('#tab').innerHTML=tabs[t]();
    document.querySelectorAll('.ptabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
    document.querySelectorAll('[data-ft]').forEach(b=>b.onclick=()=>{ft=b.dataset.ft;show('output')});
    if(t==='network') initNetworkInteractive(p, mine);
    location.hash=t;
  };
    document.querySelectorAll('.ptabs button').forEach(b=>b.onclick=()=>show(b.dataset.t));
    document.querySelectorAll('.yr-col').forEach(b=>b.onclick=()=>show('output'));
    show(['overview','output','network','finger'].includes(location.hash.slice(1))?location.hash.slice(1):'overview');
  };
  applyCachedSheetSync();
  render();
  syncLiveSheet(render);
}
