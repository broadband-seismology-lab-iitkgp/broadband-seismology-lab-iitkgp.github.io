const $=s=>document.querySelector(s);
const byId=id=>PEOPLE.find(p=>p.id===id);
const norm=s=>s.toLowerCase().replace(/prof\.|dr\.|[^a-z ]/g,'').replace(/\s+/g,' ').trim();
const byName=n=>{
  const nn=norm(n);
  return PEOPLE.find(p=>{
    const pn=norm(p.name);
    if(pn===nn)return true;
    const pp=pn.split(' '), np=nn.split(' ');
    if(pp.length>1 && np.length>1 && pp[pp.length-1]===np[np.length-1] && pp[0][0]===np[0][0]){
      if(pp[0].length===1 || np[0].length===1 || pp[0]===np[0]) return true;
    }
    return false;
  });
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

// ---- Live publications from ORCID + OpenAlex Author Search (combined, up to 200 works per author profile!) ----
async function livePubs(p){
  if(p._cache) return p._cache;
  const l=p.links||{};const m=(l.orcid||'').match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/);
  try{
    const filters=[];
    if(m) filters.push('author.orcid:'+m[0]);
    if(p.openalex) filters.push('author.id:'+p.openalex);
    if(p.autoSearch!==false){
      const qName=p.name.replace(/Prof\.|Dr\./g,'').trim();
      const a=await (await fetch('https://api.openalex.org/authors?search='+encodeURIComponent(qName)+'&per-page=15&select=id,display_name,affiliations,last_known_institutions,works_count')).json();
      const instRegex = p.group==='pi' ? /Kharagpur|National Geophysical Research Institute/i : /Kharagpur|National Geophysical Research Institute|Dhanbad|North East Institute|Wadia/i;
      const hits=(a.results||[]).filter(x=>instRegex.test(JSON.stringify([x.affiliations,x.last_known_institutions]))).sort((x,y)=>y.works_count-x.works_count);
      hits.slice(0,5).forEach(h=>filters.push('author.id:'+h.id.split('/').pop()));
    }
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
const typeOf=p=>p.type||(/abstract|conference|meeting/i.test(p.venue)?'Conference contribution':'Article');
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
async function pubsFor(p){
  const direct = await livePubs(p);
  if(p.group==='pi') return merge([manualFor(p), direct]);
  // Also check PIs' fetched works for co-authored papers where student/alumnus name appears
  const piWorks = (await Promise.all(PEOPLE.filter(x=>x.group==='pi').map(livePubs))).flat()
    .filter(w=>(w.authors||[]).some(a=>byName(a)===p));
  return merge([manualFor(p), direct, piWorks]);
}

function layout(page){
  const nav=[['index.html','Home'],['people.html','People'],['publications.html','Research output'],['contact.html','Contact']];
  document.body.insertAdjacentHTML('afterbegin',`<header><nav><a class="brand" href="index.html">${LAB.name}</a><div class="links">${nav.map(n=>`<a href="${n[0]}" class="${n[0]===page?'on':''}">${n[1]}</a>`).join('')}</div></nav></header>`);
  document.body.insertAdjacentHTML('beforeend',`<footer>${LAB.name} · ${LAB.institution}<br>${LAB.email}</footer>`);
}
function home(){
  $('#themes').innerHTML=LAB.themes.map(t=>`<div class="card"><h3>${t.title}</h3><p>${t.text}</p></div>`).join('');
  $('#pis').innerHTML=PEOPLE.filter(p=>p.group==='pi').map(card).join('');
  $('#news').innerHTML=LAB.news.map(n=>`<li><strong>${n.date}</strong> – ${n.text}</li>`).join('');
}
function people(){
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
  const el=$('#pubs');el.innerHTML='Loading…';
  const all=merge([PUBLICATIONS,...await Promise.all(PEOPLE.map(livePubs))]);
  el.innerHTML=`<p>${all.length} research outputs</p>`+groupByYearHTML(all);
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

  // fingerprint: aggregate concept weights over all works
  const w={};mine.forEach(x=>(x.concepts||[]).forEach(c=>{if(c.score>0.3)w[c.display_name]=(w[c.display_name]||0)+c.score}));
  const fp=Object.entries(w).sort((a,b)=>b[1]-a[1]).slice(0,20),mx=fp.length?fp[0][1]:1;
  const types=[...new Set(mine.map(x=>x.type))];let ft='All';
  const tabs={
    overview:()=>`<h2>Overview</h2>${p.thesis?`<p><b>${p.degree} thesis (${p.gradYear}):</b> ${p.thesis}</p>`:`<p>${p.bio}</p>`}<p>${(p.interests||[]).map(i=>`<span class="tag">${i}</span>`).join('')}</p>
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
