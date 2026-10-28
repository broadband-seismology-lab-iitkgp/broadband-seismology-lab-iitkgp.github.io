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
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w500` : u;
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
  // 2. Match by Email Address
  if(obj.email){
    p=PEOPLE.find(x=>x.email && x.email.toLowerCase()===obj.email.toLowerCase());
    if(p) return p;
  }
  // 3. Match by Google Scholar user ID (user=...)
  const gsId=extractUid(obj.scholar, /user=([A-Za-z0-9_-]+)/);
  if(gsId){
    p=PEOPLE.find(x=>extractUid(x.links&&x.links.scholar, /user=([A-Za-z0-9_-]+)/)===gsId);
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
  // 6. Fuzzy name match (handles typos up to 2 letters, or matching surname + similar first name)
  const nn=norm(nm);
  p=PEOPLE.find(x=>editDist(norm(x.name), nn)<=2);
  if(p) return p;
  const toks=nn.split(' ');
  if(toks.length>=2){
    const last=toks[toks.length-1];
    const sameLast=PEOPLE.filter(x=>{const pt=norm(x.name).split(' '); return pt[pt.length-1]===last && editDist(pt[0], toks[0])<=2;});
    if(sameLast.length===1) return sameLast[0];
  }
  // Never create a ghost profile from a typo: only return matched lab member
  return null;
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
  if(obj.prevPositions) p.prevPositions=obj.prevPositions;
  if(obj.thesis) p.thesis=obj.thesis;
  if(obj.bio) p.bio=obj.bio;
  if(obj.interests){p.interests=obj.interests.split(',').map(x=>x.trim()).filter(Boolean); p.area=p.interests.slice(0,3).join(', ');}
  if(obj.email) p.email=obj.email;
  p.links=p.links||{};
  if(obj.scholar) p.links.scholar=obj.scholar;
  if(obj.orcid) p.links.orcid=/^\d{4}-/.test(obj.orcid)?'https://orcid.org/'+obj.orcid.trim():obj.orcid;
  if(obj.researchgate) p.links.researchgate=obj.researchgate;
  if(obj.web) p.links.web=obj.web;
  if(obj.photo) p.photo=drivePhoto(obj.photo);
}
async function syncLiveSheet(){
  try{
    // Clean any old typo entries like "shrish-bose" from browser localStorage
    const loc=JSON.parse(localStorage.getItem('LAB_PROFILE_UPDATES')||'{}');
    delete loc['shrish-bose'];
    localStorage.setItem('LAB_PROFILE_UPDATES', JSON.stringify(loc));
    Object.values(loc).forEach(applyProfileUpdate);
  }catch(e){}
  if(_sheetSynced) return _sheetSynced;
  if(!LAB.sheetCsvUrl) return (_sheetSynced=Promise.resolve());
  _sheetSynced=(async()=>{
    try{
      const r=await fetch(LAB.sheetCsvUrl + (LAB.sheetCsvUrl.includes('?')?'&':'?') + '_t=' + Date.now());
      if(!r.ok) return;
      const rows=parseCSV(await r.text());
      if(rows.length<2) return;
      const hdr=rows[0].map(h=>h.toLowerCase());
      const colExact=s=>hdr.findIndex(h=>h.trim()===s);
      const colAny=(...subs)=>hdr.findIndex(h=>subs.some(s=>h.includes(s)));
      const cName=colAny('full name','name'),
            cMail=colAny('email address','public email','email'),
            cThes=colAny('phd thesis title','thesis title','thesis'),
            cPos=colAny('current affiliation','current position','position'),
            cPrev=colAny('previous affiliations','past jobs','previous'),
            cGS=colAny('google scholar','scholar'),
            cOrc=colAny('orcid'),
            cRG=colAny('researchgate','research gate'),
            cWeb=colAny('personal website','website'),
            cBio=colExact('brief overview')>=0?colExact('brief overview'):colAny('brief overview','short biography','biography'),
            cKw=colAny('topics of research interest','research interests','topics','interest'),
            cPic=colAny('upload profile image','profile photo','photo','image'),
            cStat=colAny('status in lab','status','role'),
            cYear=colAny('graduation year','passout');
      rows.slice(1).forEach(row=>{
        const get=idx=>idx>=0?(row[idx]||'').trim():'';
        const nm=get(cName); if(!nm) return;
        applyProfileUpdate({
          name:nm,
          email:get(cMail),
          thesis:get(cThes),
          position:get(cPos),
          prevPositions:get(cPrev),
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
    }catch(e){}
  })();
  return _sheetSynced;
}
const $=s=>document.querySelector(s);
const byId=id=>PEOPLE.find(p=>p.id===id);
const norm=s=>s.toLowerCase().replace(/prof\.|dr\.|[^a-z ]/g,'').replace(/\s+/g,' ').trim();
const byName=n=>{
  let nn=norm(n);
  if(!nn) return null;
  // Exact full-name match first
  let exact=PEOPLE.find(p=>norm(p.name)===nn);
  if(exact) return exact;
  // Strip leading co-author initials Google Scholar sometimes glues on (e.g. "as sukanta sarkar" -> "sukanta sarkar")
  const toks=nn.split(' ');
  if(toks.length>=3 && toks[0].length<=2){
    const tail=toks.slice(1).join(' ');
    exact=PEOPLE.find(p=>norm(p.name)===tail);
    if(exact) return exact;
  }
  // Safe initial + surname match ONLY when the surname is unique in the lab OR initials match uniquely
  const np=nn.split(' ');
  if(np.length<2) return null;
  const nLast=np[np.length-1], nInits=np.slice(0,-1).map(w=>w[0]).join('');
  const cands=PEOPLE.filter(p=>{
    const pp=norm(p.name).split(' ');
    if(pp.length<2 || pp[pp.length-1]!==nLast) return false;
    const pInits=pp.slice(0,-1).map(w=>w[0]).join('');
    return pInits===nInits || (nInits.length===1 && pInits[0]===nInits[0]);
  });
  return cands.length===1 ? cands[0] : null;
};
const initials=n=>n.replace(/Prof\.|Dr\./g,'').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2);
const avatar=p=>`<div class="avatar"><img src="${p.photo||'photos/'+p.id+'.jpg'}" alt="${p.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" onerror="this.remove()">${initials(p.name)}</div>`;
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
async function pubsFor(p){
  const scPubs = scholarCacheFor(p);
  const direct = await livePubs(p);
  // If this person has a synced Google Scholar profile, show their EXACT Google Scholar list!
  // Only enrich those exact papers with OpenAlex concepts/institutions (for Fingerprint & Network), without adding non-Scholar items.
  if(scPubs.length > 0){
    const oaByTitle = new Map(direct.map(w=>[norm(w.title), w]));
    return scPubs.map(sp=>{
      const oa = oaByTitle.get(norm(sp.title));
      return {
        ...sp,
        type: typeOf(sp),
        concepts: (oa && oa.concepts) || sp.concepts || [],
        rawAuthorships: (oa && oa.rawAuthorships) || sp.rawAuthorships || []
      };
    });
  }
  if(p.group==='pi') return merge([manualFor(p), direct]);
  // Fallback ONLY for members who haven't synced Google Scholar yet: use manual + ORCID + PI co-authored works
  const piWorks = (await Promise.all(PEOPLE.filter(x=>x.group==='pi').map(async pi=>[...scholarCacheFor(pi), ...(await livePubs(pi))]))).flat()
    .filter(w=>(w.authors||[]).some(a=>byName(a)===p));
  return merge([manualFor(p), direct, piWorks]);
}

function layout(page){
  const nav=[['index.html','Home'],['people.html','People'],['publications.html','Research output'],['join.html','Update profile'],['contact.html','Contact']];
  document.body.insertAdjacentHTML('afterbegin',`<header><nav><a class="brand" href="index.html">${LAB.name}</a><div class="links">${nav.map(n=>`<a href="${n[0]}" class="${n[0]===page?'on':''}">${n[1]}</a>`).join('')}</div></nav></header>`);
  document.body.insertAdjacentHTML('beforeend',`<footer>${LAB.name} · ${LAB.institution}<br>${LAB.email}</footer>`);
}
async function home(){
  await syncLiveSheet();
  $('#themes').innerHTML=LAB.themes.map(t=>`<div class="card"><h3>${t.title}</h3><p>${t.text}</p></div>`).join('');
  $('#pis').innerHTML=PEOPLE.filter(p=>p.group==='pi').map(card).join('');
  $('#news').innerHTML=LAB.news.map(n=>`<li><strong>${n.date}</strong> – ${n.text}</li>`).join('');
}
async function people(){
  await syncLiveSheet();
  let f='all';
  const row=p=>`<a class="row" href="person.html?id=${p.id}">${avatar(p)}<div><h3>${p.name}</h3><div class="pos">${p.position}</div><div class="org">${LAB.name}</div>
    <div class="tags">${(p.interests||[]).map(i=>`<span class="tag">${i}</span>`).join('')}</div></div><span class="count" data-id="${p.id}"></span></a>`;
  const draw=()=>{
    const q=$('#q').value.toLowerCase();
    const list=PEOPLE.filter(p=>(f==='all'||(f==='pi'&&p.group==='pi')||(f==='active'&&p.group==='student'&&p.status==='active')||(f==='alumni'&&p.status==='alumni'))
      &&(p.name+' '+p.position+' '+(p.interests||[]).join(' ')).toLowerCase().includes(q)).sort((a,b)=>a.name.replace('Prof. ','').localeCompare(b.name.replace('Prof. ','')));
    $('#total').textContent=list.length+' persons';
    $('#list').innerHTML=list.map(row).join('')||'<p>No results.</p>';
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));
    list.forEach(async p=>{const n=(await pubsFor(p)).length;const e=document.querySelector(`.count[data-id="${p.id}"]`);if(e)e.innerHTML=`<b>${n}</b><br>research outputs`});
  };
  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{f=b.dataset.f;draw()});$('#q').oninput=draw;draw();
}
async function pubs(){
  await syncLiveSheet();
  const el=$('#pubs');el.innerHTML='Loading…';
  const all=merge([...PEOPLE.map(scholarCacheFor),PUBLICATIONS,...await Promise.all(PEOPLE.map(livePubs))]);
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

function renderNetwork(p, mine){
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

  const coNodes=Object.values(coMap).sort((a,b)=>b.count-a.count).slice(0,22);
  const instNodes=Object.entries(instMap).sort((a,b)=>b[1]-a[1]).slice(0,12);
  if(!coNodes.length){
    return `<h2>Collaboration Network</h2><p>No co-author network available yet. Add publications or an ORCID link to generate the interactive collaboration graph.</p>`;
  }

  return `<h2>Collaboration Network</h2>
  <p>Explore the co-author and institutional collaboration network of <strong>${p.name}</strong> derived from ${mine.length} research outputs. Click any lab member node to open their profile, or drag nodes to rearrange.</p>
  <div class="net-controls">
    <button class="on" data-nm="authors">Co-authors (${Object.keys(coMap).length})</button>
    ${instNodes.length?`<button data-nm="inst">Collaborating Institutions (${Object.keys(instMap).length})</button>`:''}
  </div>
  <div class="net-wrap">
    <svg id="netsvg" viewBox="0 0 800 520"></svg>
    <div class="net-side">
      <h3 id="net-side-title">Top Co-authors</h3>
      <ul class="net-list" id="net-list"></ul>
    </div>
  </div>`;
}

function initNetworkInteractive(p, mine){
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

async function person(){
  await syncLiveSheet();
  const p=byId(new URLSearchParams(location.search).get('id'));
  if(!p){$('#person').innerHTML='<p>Person not found. <a href="people.html">Back to people</a></p>';return}
  document.title=p.name+' – '+LAB.name;
  const l=p.links||{};const L={scholar:'Google Scholar',researchgate:'ResearchGate',orcid:'ORCID',web:'Website'};
  const cleanNm=p.name.replace(/Prof\.|Dr\./g,'').trim();
  const nm=encodeURIComponent(cleanNm);
  const fb={
    scholar:`https://scholar.google.com/citations?view_op=search_authors&mauthors=${encodeURIComponent(cleanNm+' IIT Kharagpur')}`,
    researchgate:`https://www.google.com/search?q=${encodeURIComponent('site:researchgate.net/profile "'+cleanNm+'" "Kharagpur"')}`
  };
  const links=Object.entries(L).filter(e=>l[e[0]]||fb[e[0]]).map(e=>l[e[0]]?`<a class="ext ext-verified" href="${l[e[0]]}" target="_blank" rel="noopener">${e[1]} ↗</a>`:`<a class="ext" href="${fb[e[0]]}" target="_blank" rel="noopener">Search ${e[1]} ↗</a>`).join('');
  $('#person').innerHTML=`<div class="phead">${avatar(p)}<div><h1>${p.name}</h1>${p.status==='alumni'?'<span class="badge">Alumni</span>':''}
    <p class="ptitle">${p.title||p.role}</p><p class="pline">${p.area||'Seismology'}</p><p class="pline">${LAB.department||''}</p><p class="pline">${LAB.institution}</p>
    ${p.status==='alumni'?`<p class="pline"><b>Current position:</b> ${p.position}</p>`:''}
    ${l.orcid?`<p class="pline"><a href="${l.orcid}" target="_blank">${l.orcid}</a></p>`:''}${p.email?`<p class="pline">Email<br><a href="mailto:${p.email}">${p.email}</a></p>`:''}
    <div class="exts">${links}</div></div><div class="metrics" id="metrics"></div></div>
   <div class="ptabs">
     <button data-t="overview">Overview</button>
     <button data-t="output">Research output</button>
     <button data-t="network">Network</button>
     <button data-t="finger">Fingerprint</button>
   </div>
   <div id="tab"></div>`;
  const mine=await pubsFor(p);
  const cites=mine.filter(x=>x.cites!=null).map(x=>x.cites);
  const citesRecent=mine.filter(x=>x.cites!=null && x.year>=2021).map(x=>x.cites);
  const total=p.citations!=null?p.citations:cites.reduce((a,b)=>a+b,0);
  const h=p.hindex!=null?p.hindex:hIndex(cites);
  const i10=p.i10index!=null?p.i10index:i10Index(cites);
  const hasScholarMetrics = p.citations!=null || p.hindex!=null || p.i10index!=null;

  if(p.citationsRecent!=null || p.hindexRecent!=null){
    $('#metrics').innerHTML=`
      <div class="m-count"><b>${mine.length}</b>Research outputs</div>
      <table class="gs-table">
        <thead><tr><th></th><th>All</th><th>Since 2021</th></tr></thead>
        <tbody>
          <tr><td>Citations</td><td><b>${total}</b></td><td><b>${p.citationsRecent!=null?p.citationsRecent:citesRecent.reduce((a,b)=>a+b,0)}</b></td></tr>
          <tr><td>h-index</td><td><b>${h}</b></td><td><b>${p.hindexRecent!=null?p.hindexRecent:hIndex(citesRecent)}</b></td></tr>
          <tr><td>i10-index</td><td><b>${i10}</b></td><td><b>${p.i10indexRecent!=null?p.i10indexRecent:i10Index(citesRecent)}</b></td></tr>
        </tbody>
      </table>
      <small>Metrics: ${hasScholarMetrics?(l.scholar?`<a href="${l.scholar}" target="_blank" rel="noopener">Google Scholar ↗</a>`:'Google Scholar'):'OpenAlex / ORCID'}</small>`;
  } else {
    $('#metrics').innerHTML=`<div><b>${mine.length}</b>Research outputs</div><div><b>${cites.length||hasScholarMetrics?total:'–'}</b>Citations</div><div><b>${cites.length||hasScholarMetrics?h:'–'}</b>h-index</div><div><b>${cites.length||hasScholarMetrics?i10:'–'}</b>i10-index</div><small>Source: ${hasScholarMetrics?'Google Scholar':'OpenAlex / ORCID'}</small>`;
  }

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
  const tabs={
    overview:()=>`<h2>Overview</h2>${p.thesis?`<p><b>${p.degree||'PhD'} Thesis${p.gradYear?' ('+p.gradYear+')':''}:</b> ${p.thesis}</p>`:""}${p.bio && (!p.thesis || !p.bio.startsWith('Thesis:'))?`<p>${p.bio}</p>`:""}${p.prevPositions?`<p><b>Previous Affiliations / Past Jobs:</b> ${p.prevPositions}</p>`:""}<p>${(p.interests||[]).map(i=>`<span class="tag">${i}</span>`).join('')}</p>
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
  show(['overview','output','network','finger'].includes(location.hash.slice(1))?location.hash.slice(1):'overview');
}
