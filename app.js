/* =============================================================
   CGPA Calc — Student Performance Tracker
   app.js — All application logic
   Depends on: Chart.js, jsPDF
============================================================= */

/* ══════════════════════════════════════════
   SCALE & GRADE MAPS
══════════════════════════════════════════ */
const SCALE5 = {A:5,B:4,C:3,D:2,E:1,F:0};
const SCALE4 = {A:4,B:3,C:2,D:1,F:0};
const WEAK_THRESHOLD = {5:3, 4:2.5}; // below this = weak on that scale
let SCALE = 5;
let GRADES = {...SCALE5};
let GRADE_KEYS = ['A','B','C','D','E','F'];

function getGrades(){ return SCALE===5?SCALE5:SCALE4; }
function getKeys(){ return SCALE===5?['A','B','C','D','E','F']:['A','B','C','D','F']; }
function weakThresh(){ return WEAK_THRESHOLD[SCALE]; }

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
let sems=[],semId=0,cId=0,chart=null,distChart=null,dm=false;
let records=[];
let modalRec=null;

/* ══════════════════════════════════════════
   UTILS
══════════════════════════════════════════ */
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ini=n=>n.trim().split(/\s+/).map(w=>w[0]||'').join('').toUpperCase().slice(0,2)||'?';
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800);}
function gpClass(gp,scale){const m={[scale]:5,[scale-1]:4,[scale-2]:3,[scale-3]:2,[scale-4]:1,0:0};
  const n=Math.round(gp);return `gp${n<=0?0:n>=scale?scale:n}`;}
function closeModal(id){$(id).classList.remove('open');}

/* ══════════════════════════════════════════
   DARK MODE
══════════════════════════════════════════ */
function toggleDarkMode(){dm=!dm;document.body.classList.toggle('dm',dm);$('dmLbl').textContent=dm?'Light':'Dark';updateChart();saveAll();}

/* ══════════════════════════════════════════
   VIEWS
══════════════════════════════════════════ */
function showView(v){
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  $('view'+v.charAt(0).toUpperCase()+v.slice(1)).classList.add('active');
  document.querySelectorAll('.nb[id^="nb-"]').forEach(b=>b.classList.remove('act'));
  const nb=$('nb-'+v);if(nb)nb.classList.add('act');
  if(v==='records')renderRecs();
  if(v==='analytics')renderAnalytics();
  closeSidebar();
}
function openSidebar(){
  document.body.classList.add('menu-open');
  $('mobOv').classList.add('open');
  const b=$('mobBtn'); if(b) b.classList.add('open');
  if(b) b.setAttribute('aria-label','Close menu');
}
function closeSidebar(){
  document.body.classList.remove('menu-open');
  $('mobOv').classList.remove('open');
  const b=$('mobBtn'); if(b) b.classList.remove('open');
  if(b) b.setAttribute('aria-label','Open menu');
}
function toggleSidebar(){
  if(document.body.classList.contains('menu-open')) closeSidebar(); else openSidebar();
}

/* ══════════════════════════════════════════
   SCALE CHANGES
══════════════════════════════════════════ */
function onScaleChange(){
  const v=parseInt($('globalScale').value);
  SCALE=v;$('localScale').value=v;
  GRADES=getGrades();GRADE_KEYS=getKeys();
  $('cgpaScale').textContent='/'+v;
  renderSems();updateStats();saveAll();
}
function onLocalScaleChange(){
  const v=parseInt($('localScale').value);
  SCALE=v;$('globalScale').value=v;
  GRADES=getGrades();GRADE_KEYS=getKeys();
  $('cgpaScale').textContent='/'+v;
  renderSems();updateStats();saveAll();
}

/* ══════════════════════════════════════════
   AVATAR
══════════════════════════════════════════ */
function updAv(){const n=$('stuName').value.trim();$('stuAv').textContent=ini(n);}

/* ══════════════════════════════════════════
   SEMESTER & COURSE LOGIC
══════════════════════════════════════════ */
function calcSem(sem){
  if(!sem.courses.length)return{gpa:0,u:0,gp:0};
  let u=0,gp=0;
  sem.courses.forEach(c=>{u+=c.unit;gp+=GRADES[c.grade]*c.unit;});
  return{gpa:u?gp/u:0,u,gp};
}

function addSem(){
  const id=++semId;
  sems.push({id,name:`Semester ${sems.length+1}`,courses:[]});
  renderSems();updateStats();toast('Semester added');
}
function delSem(id){
  if(!confirm('Delete this semester?'))return;
  sems=sems.filter(s=>s.id!==id);renderSems();updateStats();toast('Semester removed');
}
function addCourse(sid){
  const s=sems.find(s=>s.id===sid);if(!s)return;
  const id=++cId;s.courses.push({id,name:'',unit:3,grade:'A'});
  renderSems();updateStats();
  setTimeout(()=>{const el=document.querySelector(`[data-cid="${id}"] .cname`);if(el)el.focus();},50);
}
function delCourse(sid,cid){
  const s=sems.find(s=>s.id===sid);if(!s)return;
  s.courses=s.courses.filter(c=>c.id!==cid);renderSems();updateStats();
}
function updCourse(sid,cid,field,val){
  const s=sems.find(s=>s.id===sid);if(!s)return;
  const c=s.courses.find(c=>c.id===cid);if(!c)return;
  c[field]=field==='unit'?parseInt(val):val;
  updateStats();liveUpdateRow(cid,c);liveFooters();
}
function updSemName(id,name){const s=sems.find(s=>s.id===id);if(s)s.name=name.trim()||s.name;}

function liveUpdateRow(cid,c){
  const gp=GRADES[c.grade]*c.unit;
  const badge=document.querySelector(`[data-cid="${cid}"] .gp-badge`);
  if(badge){badge.textContent=gp;badge.className=`gp-badge gp${GRADES[c.grade]}`;}
}
function liveFooters(){
  let cu=0,cg=0;
  sems.forEach((s,i)=>{
    const{u,gp,gpa}=calcSem(s);cu+=u;cg+=gp;
    const cgpa=cu?cg/cu:0;
    const f=document.getElementById(`sf-${s.id}`);if(!f)return;
    const ps=f.querySelectorAll('.s-pill b');
    if(ps[0])ps[0].textContent=u;if(ps[1])ps[1].textContent=gp;if(ps[2])ps[2].textContent=cu;if(ps[3])ps[3].textContent=cg;
    const cn=f.querySelector('.cn');if(cn)cn.textContent=cgpa.toFixed(2);
    const cl=f.querySelectorAll('.cl');
    if(cl[0])cl[0].textContent=`CGPA after ${i+1} sem${i>0?'s':''}:`;
    const chip=document.querySelector(`#sem-${s.id} .gpa-chip`);
    if(chip)chip.textContent=`GPA: ${gpa.toFixed(2)}`;
  });
}

/* ══════════════════════════════════════════
   RENDER SEMESTERS
══════════════════════════════════════════ */
function renderSems(){
  const con=$('semsContainer');
  if(!sems.length){
    con.innerHTML=`<div class="main-empty">
      <div class="main-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h8"/></svg>
      </div>
      <h2>No Semesters Yet</h2>
      <p>Add your first semester to start tracking GPA and CGPA live.</p>
      <button class="tbtn green" onclick="addSem()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Semester
      </button>
    </div>`;
    return;
  }
  const q=($('searchInp').value||'').toLowerCase();
  let cu=0,cg=0;
  const cumArr=sems.map(s=>{const{u,gp}=calcSem(s);cu+=u;cg+=gp;return{cgpa:cu?cg/cu:0,cu,cg};});
  const G=getGrades(),K=getKeys();
  con.innerHTML=sems.map((sem,idx)=>{
    const{gpa,u:su,gp:sg}=calcSem(sem);
    const{cgpa:rc,cu:c_u,cg:c_g}=cumArr[idx];
    let courses=sem.courses;
    if(q)courses=courses.filter(c=>c.name.toLowerCase().includes(q));
    const rows=sem.courses.length===0
      ?`<tr><td colspan="6"><div class="empty-card"><div class="empty-icon"></div><p>No courses yet — click Add Course below</p></div></td></tr>`
      :courses.length===0&&q
        ?`<tr><td colspan="6"><div class="empty-card"><p>No courses match your search</p></div></td></tr>`
        :courses.map(c=>{
          const gp=G[c.grade]*c.unit;
          const isWeak=G[c.grade]<weakThresh();
          return `<tr data-cid="${c.id}">
            <td data-label="Course"><input class="cname" value="${esc(c.name)}" placeholder="Course name…" oninput="updCourse(${sem.id},${c.id},'name',this.value)">
            ${isWeak?'<span class="weak-flag">Weak</span>':''}</td>
            <td data-label="Unit"><select class="csel" onchange="updCourse(${sem.id},${c.id},'unit',this.value)">
              ${[1,2,3,4,5,6].map(u=>`<option value="${u}"${c.unit==u?' selected':''}>${u}u</option>`).join('')}
            </select></td>
            <td data-label="Grade"><select class="csel" onchange="updCourse(${sem.id},${c.id},'grade',this.value)">
              ${K.map(g=>`<option value="${g}"${c.grade===g?' selected':''}>${g} (${G[g]})</option>`).join('')}
            </select></td>
            <td data-label="GP"><span class="gp-badge gp${G[c.grade]}">${gp}</span></td>
            <td data-label="GP/Unit" style="color:var(--tm);font-size:11px;">${c.unit>0?(gp/c.unit).toFixed(2):'-'}</td>
            <td data-label=""><button class="row-del" onclick="delCourse(${sem.id},${c.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button></td>
          </tr>`;
        }).join('');
    return `<div class="sem-card" id="sem-${sem.id}">
      <div class="sem-hdr">
        <div class="sem-l">
          <div class="sem-badge">${idx+1}</div>
          <div>
            <div class="sem-name" contenteditable="true" onblur="updSemName(${sem.id},this.textContent)" spellcheck="false">${esc(sem.name)}</div>
            <div class="sem-sub">
              <span class="gpa-chip">GPA: ${gpa.toFixed(2)}</span>
              <span class="sem-meta">· ${sem.courses.length} course${sem.courses.length!==1?'s':''} · Scale: ${SCALE}.0</span>
            </div>
          </div>
        </div>
        <div class="sem-acts">
          <button class="ico-btn" onclick="addCourse(${sem.id})" title="Add course">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="ico-btn del" onclick="delSem(${sem.id})" title="Delete semester">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Course Name</th><th>Unit</th><th>Grade</th><th>GP</th><th>GP/Unit</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="add-row">
        <button class="add-course-btn" onclick="addCourse(${sem.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Course
        </button>
      </div>
      <div class="sem-foot" id="sf-${sem.id}">
        <div class="s-pills">
          <div class="s-pill">Sem Units:<b>${su}</b></div>
          <div class="s-pill">Sem GP:<b>${sg}</b></div>
          <div class="s-pill">Cum. Units:<b>${c_u}</b></div>
          <div class="s-pill">Cum. GP:<b>${c_g}</b></div>
        </div>
        <div class="cgpa-pill">
          <span class="cl">CGPA after ${idx+1} sem${idx>0?'s':''}:</span>
          <span class="cn">${rc.toFixed(2)}</span>
          <span class="cl">/${SCALE}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   RESPONSIVE: Table → Card transform for small screens
══════════════════════════════════════════ */
function buildRowCardsForSem(semCard){
  // if already built, skip
  if(semCard.querySelector('.row-cards')) return;
  const tblWrap = semCard.querySelector('.tbl-wrap');
  if(!tblWrap) return;
  const tbody = tblWrap.querySelector('tbody');
  if(!tbody) return;
  const rows = Array.from(tbody.children);
  const cardList = document.createElement('div');
  cardList.className = 'row-cards';
  rows.forEach(r=>{
    const card = document.createElement('div');
    card.className = 'row-card';
    // For each cell, clone its inner content (inputs/selects preserve inline handlers)
    const cells = Array.from(r.children);
    const courseCell = cells[0] ? cells[0].innerHTML : '';
    const unitCell = cells[1] ? cells[1].innerHTML : '';
    const gradeCell = cells[2] ? cells[2].innerHTML : '';
    const gpCell = cells[3] ? cells[3].innerHTML : '';
    const gpUnitCell = cells[4] ? cells[4].innerHTML : '';
    const actCell = cells[5] ? cells[5].innerHTML : '';

    card.innerHTML = `
      <div class="rc-row">
        <div class="rc-row-main">
          <div class="rc-course">${courseCell}</div>
          <div class="rc-meta">
            <div class="rc-unit">${unitCell}</div>
            <div class="rc-grade">${gradeCell}</div>
          </div>
        </div>
        <div class="rc-row-foot">
          <div class="rc-gp">${gpCell}</div>
          <div class="rc-gpunit">${gpUnitCell}</div>
          <div class="rc-act">${actCell}</div>
        </div>
      </div>`;
    cardList.appendChild(card);
  });
  tblWrap.style.display = 'none';
  tblWrap.parentNode.insertBefore(cardList, tblWrap);
}

function removeRowCardsForSem(semCard){
  const cardList = semCard.querySelector('.row-cards');
  const tblWrap = semCard.querySelector('.tbl-wrap');
  if(cardList) cardList.remove();
  if(tblWrap) tblWrap.style.display = '';
}

function updateTableCardMode(){
  const small = window.innerWidth<=420;
  document.querySelectorAll('.sem-card').forEach(sc=>{
    if(small) buildRowCardsForSem(sc);
    else removeRowCardsForSem(sc);
  });
}

window.addEventListener('resize',()=>{
  updateTableCardMode();
});
document.addEventListener('DOMContentLoaded',()=>{
  // run after initial render
  setTimeout(updateTableCardMode,120);
});

/* ══════════════════════════════════════════
   STATS + CHART + PREDICTION
══════════════════════════════════════════ */
function updateStats(){
  const G=getGrades();
  let tu=0,tgp=0,tc=0,ga=0;const gd=[];
  sems.forEach(s=>{
    const{gpa,u,gp}=calcSem(s);
    tu+=u;tgp+=gp;tc+=s.courses.length;
    s.courses.forEach(c=>{if(c.grade==='A')ga++;});
    gd.push({name:s.name,gpa});
  });
  const cgpa=tu?tgp/tu:0;
  $('cgpaDisp').textContent=cgpa.toFixed(2);
  $('sTotalU').textContent=tu;$('sTotalGP').textContent=tgp;
  $('sTotalS').textContent=sems.length;$('sTotalC').textContent=tc;
  const pct=Math.round((cgpa/SCALE)*100);
  $('cgpaBar').style.width=pct+'%';$('cgpaPct').textContent=pct+'%';
  const ap=tc?Math.round((ga/tc)*100):0;
  $('gradeABar').style.width=ap+'%';$('gradeAPct').textContent=ap+'%';
  $('cgpaCls').textContent=classLabel(cgpa);
  updateChart(gd);
  updatePrediction(gd,cgpa);
  saveAll();
}

/* ── PREDICTION ENGINE ── */
let predSems=2;
function updatePrediction(gd,curCGPA){
  const opts=$('predOpts');const pdiv=$('predNum');const psub=$('predSub');
  if(gd.length<1){pdiv.textContent='—';pdiv.className='pred-num';psub.textContent='Add at least 2 semesters to see predictions';opts.innerHTML='';return;}
  // Weighted moving average + trend
  const vals=gd.map(d=>d.gpa);
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  let trend=0;
  if(vals.length>=2){
    const recent=vals.slice(-Math.min(3,vals.length));
    trend=(recent[recent.length-1]-recent[0])/(recent.length-1||1)*0.5;
  }
  const simOptions=[1,2,3,4];
  opts.innerHTML=simOptions.map(n=>`<span class="pred-opt${predSems===n?' sel':''}" onclick="setPredSems(${n})">${n} more sem${n>1?'s':''}</span>`).join('');
  let projVals=[...vals];
  for(let i=0;i<predSems;i++){
    let next=projVals[projVals.length-1]+trend;
    next=Math.max(0,Math.min(SCALE,next));
    projVals.push(next);
  }
  const projAvg=projVals.reduce((a,b)=>a+b,0)/projVals.length;
  const diff=projAvg-curCGPA;
  pdiv.textContent=projAvg.toFixed(2);
  pdiv.className=`pred-num ${projAvg>=(SCALE>=5?4.5:3.5)?'good':projAvg>=(SCALE>=5?3.0:2.5)?'ok':'warn'}`;
  const dir=diff>0.01?'↑ improving':diff<-0.01?'↓ declining':'→ stable';
  psub.textContent=`After ${predSems} more semester${predSems>1?'s':''}, predicted CGPA is ${dir} (${diff>=0?'+':''}${diff.toFixed(2)} change)`;
}
function setPredSems(n){predSems=n;const gd=sems.map(s=>({name:s.name,gpa:calcSem(s).gpa}));const G=getGrades();let tu=0,tgp=0;sems.forEach(s=>{const{u,gp}=calcSem(s);tu+=u;tgp+=gp;});updatePrediction(gd,tu?tgp/tu:0);document.querySelectorAll('.pred-opt').forEach((el,i)=>{el.classList.toggle('sel',i+1===n);});}

function classLabel(c){
  if(SCALE>=5){
    if(c>=4.5) return 'Distinction';
    if(c>=3.5) return 'Upper Credit';
    if(c>=2.4) return 'Lower Credit';
    if(c>=1.5) return 'Pass';
    if(c>0)    return 'Fail';
  } else {
    if(c>=3.6) return 'Distinction';
    if(c>=3.0) return 'Upper Credit';
    if(c>=2.0) return 'Lower Credit';
    if(c>=1.5) return 'Pass';
    if(c>0)    return 'Fail';
  }
  return 'Add courses to see your class';
}
function classTagInfo(c){
  const s=SCALE;
  if(s>=5){
    if(c>=4.5) return {t:'Distinction',cls:'c1'};
    if(c>=3.5) return {t:'Upper Credit',cls:'c2u'};
    if(c>=2.4) return {t:'Lower Credit',cls:'c2l'};
    if(c>=1.5) return {t:'Pass',cls:'cp'};
    if(c>0)    return {t:'Fail',cls:'cf'};
  } else {
    if(c>=3.6) return {t:'Distinction',cls:'c1'};
    if(c>=3.0) return {t:'Upper Credit',cls:'c2u'};
    if(c>=2.0) return {t:'Lower Credit',cls:'c2l'};
    if(c>=1.5) return {t:'Pass',cls:'cp'};
    if(c>0)    return {t:'Fail',cls:'cf'};
  }
  return{t:'No Data',cls:'cls-none'};
}

/* ── CHART ── */
function updateChart(gd){
  if(!gd)gd=sems.map(s=>({name:s.name,gpa:calcSem(s).gpa}));
  const ctx=$('gpaChart').getContext('2d');
  if(chart)chart.destroy();
  const tc=dm?'#9dc998':'#4a6741',gc=dm?'#2a4a2a':'#e2ebe2';
  chart=new Chart(ctx,{type:'bar',data:{
    labels:gd.map((d,i)=>d.name.length>10?`S${i+1}`:d.name),
    datasets:[{data:gd.map(d=>+d.gpa.toFixed(2)),
      backgroundColor:gd.map(d=>d.gpa>=(SCALE>=5?4:3)?'#22c55e':d.gpa>=(SCALE>=5?3:2)?'#eab308':'#ef4444'),
      borderRadius:5,borderSkipped:false}]
  },options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`GPA: ${c.parsed.y.toFixed(2)}`}}},
    scales:{y:{min:0,max:SCALE,ticks:{color:tc,font:{size:9,family:"'Plus Jakarta Sans',sans-serif"}},grid:{color:gc}},
      x:{ticks:{color:tc,font:{size:9,family:"'Plus Jakarta Sans',sans-serif"}},grid:{display:false}}}}});
}

/* ══════════════════════════════════════════
  STUDY MATERIALS — WITH FILE UPLOAD
══════════════════════════════════════════ */
let mcqData=[],flashData=[],quizAnswered=0,quizCorrect=0;
let uploadedFiles=[];
let activeSource='upload';

function switchAiTab(t){
  ['mcq','flash'].forEach(k=>{
    const tab=$('tab'+k.charAt(0).toUpperCase()+k.slice(1));
    const pane=$(k+'Content');
    if(tab)tab.classList.toggle('act',k===t);
    if(pane)pane.classList.toggle('act',k===t);
  });
}

function switchSource(src){
  activeSource=src;
  ['upload','paste','none'].forEach(s=>{
    const btn=$('src'+s.charAt(0).toUpperCase()+s.slice(1));
    const sec=$('sec'+s.charAt(0).toUpperCase()+s.slice(1));
    if(btn){btn.classList.toggle('act',s===src);btn.setAttribute('aria-selected',s===src?'true':'false');}
    if(sec)sec.classList.toggle('act',s===src);
  });
  updateCtxBadge();
}

function updateCtxBadge(){
  const badge=$('materialContextBadge');
  const cb=$('ctxBadge');
  if(!badge||!cb)return;
  const readyFiles=uploadedFiles.filter(f=>f.status==='ready');
  const hasUpload=activeSource==='upload'&&readyFiles.length>0;
  const pasteVal=($('pasteText')&&$('pasteText').value)||'';
  const hasPaste=activeSource==='paste'&&pasteVal.trim().length>50;
  if(hasUpload){
    badge.style.display='block';
    cb.textContent=readyFiles.length+' file'+(readyFiles.length>1?'s':'')+' ready — the tool will read your materials';
    cb.className='context-badge has-material';
  } else if(hasPaste){
    badge.style.display='block';
    cb.textContent='Text pasted ('+pasteVal.trim().length.toLocaleString()+' chars) — the tool will use your content';
    cb.className='context-badge has-material';
  } else {
    badge.style.display='none';
  }
}

function updateCharCount(){
  const el=$('pasteText');const cc=$('charCount');
  if(!el||!cc)return;
  cc.textContent=el.value.length.toLocaleString()+' characters';
  updateCtxBadge();
}

/* ── DRAG & DROP ── */
function onDragOver(e){e.preventDefault();const z=$('uploadZone');if(z)z.classList.add('drag');}
function onDragLeave(e){const z=$('uploadZone');if(z)z.classList.remove('drag');}
function onDrop(e){
  e.preventDefault();
  const z=$('uploadZone');if(z)z.classList.remove('drag');
  processFiles([...e.dataTransfer.files]);
}
function onFilesSelected(e){processFiles([...e.target.files]);e.target.value='';}

function processFiles(files){
  const allowedExts=['pdf','txt','png','jpg','jpeg','webp'];
  files.forEach(file=>{
    const ext=file.name.split('.').pop().toLowerCase();
    if(!allowedExts.includes(ext)){toast('Unsupported: '+file.name+' (use PDF, TXT, or image)');return;}
    if(file.size>20*1024*1024){toast('Too large (max 20MB): '+file.name);return;}
    if(uploadedFiles.length>=5){toast('Max 5 files allowed at once');return;}
    const entry={name:file.name,size:file.size,type:file.type,base64:null,mediaType:null,
      apiType:null,textContent:null,status:'reading',id:Date.now()+Math.random()};
    uploadedFiles.push(entry);
    renderFilesList();
    const reader=new FileReader();
    reader.onload=ev=>{
      const parts=ev.target.result.split(',');
      entry.base64=parts[1];
      if(ext==='pdf'){
        entry.mediaType='application/pdf';entry.apiType='document';
      } else if(['png','jpg','jpeg','webp'].includes(ext)){
        entry.mediaType=file.type||'image/'+ext;entry.apiType='image';
      } else {
        // txt — decode and store as plain text
        try{entry.textContent=decodeURIComponent(escape(atob(entry.base64))).slice(0,80000);}
        catch(ex){entry.textContent=atob(entry.base64).slice(0,80000);}
        entry.apiType='text';
      }
      // Extra validation: ensure we actually have content
      if(entry.apiType==='text'&&!entry.textContent){
        entry.textContent='[File content could not be extracted from: '+file.name+']';
      }
      entry.status='ready';
      renderFilesList();updateCtxBadge();
      toast(file.name+' ready ✓');
    };
    reader.onerror=()=>{entry.status='error';renderFilesList();toast('Failed to read: '+file.name);};
    reader.readAsDataURL(file);
  });
}

function removeFile(id){
  uploadedFiles=uploadedFiles.filter(f=>f.id!==id);
  renderFilesList();updateCtxBadge();
}

function renderFilesList(){
  const list=$('filesList');if(!list)return;
  if(!uploadedFiles.length){list.innerHTML='';return;}
  const iconMap={pdf:'PDF',png:'IMG',jpg:'IMG',jpeg:'IMG',webp:'IMG',txt:'TXT'};
  const clsMap={pdf:'pdf',png:'img',jpg:'img',jpeg:'img',webp:'img',txt:'txt'};
  list.innerHTML=uploadedFiles.map(f=>{
    const ext=f.name.split('.').pop().toLowerCase();
    const ic=iconMap[ext]||'FILE';const cl=clsMap[ext]||'doc';
    const sz=f.size<1024?f.size+'B':f.size<1048576?(f.size/1024).toFixed(1)+'KB':(f.size/1048576).toFixed(1)+'MB';
    const extra=f.apiType==='text'&&f.textContent?' · '+f.textContent.length.toLocaleString()+' chars':'';
    return '<div class="file-item">'
      +'<div class="file-icon '+cl+'">'+ic+'</div>'
      +'<div class="file-info">'
        +'<div class="file-name" title="'+esc(f.name)+'">'+esc(f.name)+'</div>'
        +'<div class="file-size">'+sz+extra+'</div>'
      +'</div>'
      +'<span class="file-status '+f.status+'">'+(f.status==='ready'?'Ready':f.status==='reading'?'Reading…':'Error')+'</span>'
      +'<button class="file-del" onclick="removeFile('+f.id+')" title="Remove">'
        +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      +'</button>'
      +'</div>';
  }).join('');
}

/* ── GENERATION (Google Gemini) ── */
const GEMINI_MODELS=['gemini-2.0-flash','gemini-2.5-flash','gemini-1.5-flash'];
const GEN_BTN_HTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg> Generate Assessment';

function getGeminiKey(){
  try{return String((window.__ENV&&(window.__ENV.GEMINI_API_KEY||window.__ENV.GOOGLE_API_KEY))||'').trim();}catch(e){return '';}
}

function buildStudyPrompt(course,diff,n,wantMcq,wantFlash,hasMaterial){
  const audience='Nigerian polytechnic and university students';
  let p='Create an original assessment for the course/topic "'+course+'" at '+diff+' difficulty for '+audience+'.\n';
  if(hasMaterial)p+='Use ONLY the course material provided. Do not invent facts that are not supported by the material.\n';
  else p+='Use accurate general knowledge of this topic. Prefer exam-style questions a lecturer might set.\n';
  if(wantMcq)p+='Generate exactly '+n+' multiple-choice questions. Each must have 4 options labeled A–D, one correct answer letter, and a short explanation.\n';
  if(wantFlash)p+='Generate exactly '+n+' true/false flashcards. Each must have a statement, boolean answer, and a short explanation.\n';
  if(!wantMcq)p+='Return "mcqs" as an empty array.\n';
  if(!wantFlash)p+='Return "flashcards" as an empty array.\n';
  p+='Return JSON only in this shape: {"mcqs":[{"q":"question","opts":["option A","option B","option C","option D"],"ans":"A","exp":"why"}],"flashcards":[{"statement":"claim","answer":true,"exp":"why"}]}';
  return p;
}

function parseGeminiJson(raw){
  const jsonMatch=String(raw||'').match(/```json\s*([\s\S]*?)```/)||String(raw||'').match(/(\{[\s\S]*\})/);
  if(!jsonMatch)throw new Error('Gemini did not return valid JSON. Try again.');
  return JSON.parse(jsonMatch[1]||jsonMatch[0]);
}

function normalizeQuiz(parsed,wantMcq,wantFlash){
  let mcqs=Array.isArray(parsed.mcqs)?parsed.mcqs:[];
  let cards=Array.isArray(parsed.flashcards)?parsed.flashcards:[];
  mcqs=mcqs.map(q=>{
    const opts=Array.isArray(q.opts)?q.opts.map(o=>String(o).replace(/^[A-D][.)]\s*/,'' )).slice(0,4):[];
    while(opts.length<4)opts.push('Option '+(opts.length+1));
    let ans=String(q.ans||'A').trim().toUpperCase();
    ans=ans.replace(/[^A-D].*/,'');
    if(!['A','B','C','D'].includes(ans))ans='A';
    return{q:String(q.q||'').trim(),opts,ans,exp:String(q.exp||'').trim()};
  }).filter(q=>q.q);
  cards=cards.map(f=>{
    let ans=f.answer;
    if(typeof ans==='string')ans=/^(true|t|yes|1)$/i.test(ans.trim());
    return{statement:String(f.statement||'').trim(),answer:!!ans,exp:String(f.exp||'').trim()};
  }).filter(f=>f.statement);
  if(!wantMcq)mcqs=[];
  if(!wantFlash)cards=[];
  return{mcqs,cards};
}

async function callGemini(parts){
  const key=getGeminiKey();
  if(!key)throw new Error('Add GEMINI_API_KEY to your .env file, then refresh the page.');
  let lastErr=null;
  for(const model of GEMINI_MODELS){
    const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key);
    const payload={
      systemInstruction:{parts:[{text:'You are an exam-prep tutor. Produce original assessment items and valid JSON only.'}]},
      contents:[{role:'user',parts}],
      generationConfig:{temperature:0.5,maxOutputTokens:8192,responseMimeType:'application/json'}
    };
    let res,data;
    try{
      res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      data=await res.json();
    }catch(err){lastErr=err;continue;}
    if(data.error){
      const msg=data.error.message||'Gemini request failed';
      lastErr=new Error(msg);
      const low=msg.toLowerCase();
      if(low.includes('api key')||low.includes('permission denied')||res.status===403||res.status===401)throw lastErr;
      continue;
    }
    const cand=(data.candidates||[])[0];
    const text=((cand&&cand.content&&cand.content.parts)||[]).map(p=>p.text||'').join('');
    if(!text){
      const block=(data.promptFeedback&&data.promptFeedback.blockReason)||(cand&&cand.finishReason);
      lastErr=new Error(block?'Gemini blocked or stopped the response ('+block+'). Try different material or a shorter topic.':'Empty response from Gemini.');
      continue;
    }
    return text;
  }
  throw lastErr||new Error('Gemini request failed');
}

async function generateStudyMaterial(){
  const course=($('aiCourse').value||'').trim();
  const type=$('aiType').value;
  const diff=$('aiDiff').value;
  const count=parseInt($('aiCount').value,10)||10;
  if(!course){toast('Enter a course or topic name first');if($('aiCourse'))$('aiCourse').focus();return;}
  if(!getGeminiKey()){toast('Add GEMINI_API_KEY to your .env file, then refresh');return;}

  const readyFiles=uploadedFiles.filter(f=>f.status==='ready');
  const pasteText=(($('pasteText')&&$('pasteText').value)||'').trim();
  const hasUpload=activeSource==='upload'&&readyFiles.length>0;
  const hasPaste=activeSource==='paste'&&pasteText.length>50;
  const hasMaterial=hasUpload||hasPaste;

  const btn=$('genBtn');if(!btn)return;
  btn.disabled=true;btn.textContent='Generating with Gemini…';
  const out=$('aiOutput');if(out)out.style.display='block';
  const loading='<div class="loading-pulse"><div class="pulse-dots"><div class="pulse-dot"></div><div class="pulse-dot"></div><div class="pulse-dot"></div></div><p>'+(hasMaterial?'Reading your materials and generating an assessment…':'Generating a '+diff+' assessment for "'+esc(course)+'"…')+'</p></div>';
  const mc=$('mcqContent');const fc=$('flashContent');
  if(mc){mc.innerHTML=loading;mc.classList.add('act');}
  if(fc){fc.innerHTML=loading;fc.classList.remove('act');}
  const tm=$('tabMcq');const tf=$('tabFlash');
  if(tm)tm.classList.add('act');if(tf)tf.classList.remove('act');

  const wantMcq=type==='mcq'||type==='both';
  const wantFlash=type==='flash'||type==='both';
  const n=wantMcq&&wantFlash?Math.ceil(count/2):count;
  const prompt=buildStudyPrompt(course,diff,n,wantMcq,wantFlash,hasMaterial);

  const parts=[];
  const MAX_B64=8*1024*1024;
  if(hasUpload){
    readyFiles.forEach(f=>{
      const b64size=f.base64?f.base64.length:0;
      if((f.apiType==='document'||f.apiType==='image')&&f.base64&&b64size<MAX_B64){
        parts.push({inline_data:{mime_type:f.mediaType||(f.apiType==='document'?'application/pdf':'image/jpeg'),data:f.base64}});
      }else if(f.apiType==='text'&&f.textContent){
        parts.push({text:'[File: '+f.name+']\n'+f.textContent});
      }else if(b64size>=MAX_B64){
        parts.push({text:'[Note: '+f.name+' was too large to attach. Paste key excerpts in Paste Text mode.]'});
      }
    });
  }else if(hasPaste){
    parts.push({text:'Course material for "'+course+'":\n\n'+pasteText.slice(0,60000)});
  }
  parts.push({text:prompt});

  try{
    const raw=await callGemini(parts);
    const parsed=parseGeminiJson(raw);
    const quiz=normalizeQuiz(parsed,wantMcq,wantFlash);
    mcqData=quiz.mcqs;flashData=quiz.cards;
    if(!mcqData.length&&!flashData.length)throw new Error('Gemini returned no questions. Try a more specific topic or add course material.');
    quizAnswered=0;quizCorrect=0;
    renderMCQ();renderFlash();
    if(wantFlash&&!wantMcq)switchAiTab('flash');
    toast((mcqData.length?mcqData.length+' MCQs':'')+(mcqData.length&&flashData.length?' + ':'')+(flashData.length?flashData.length+' flashcards':'')+' generated');
  }catch(e){
    let userMsg=e.message||'Unknown error';
    if(/failed to fetch|networkerror|cors/i.test(userMsg)){
      userMsg='Could not reach Google Gemini. Check your internet connection, API key restrictions, and that this page is open on a local server.';
    }
    const errHtml='<div class="empty-card" style="padding:2rem;">'
      +'<p style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--tp);">Generation Failed</p>'
      +'<p style="font-size:12px;color:var(--tm);line-height:1.6;max-width:420px;margin:0 auto;">'+esc(userMsg)+'</p>'
      +'<button class="gen-btn" onclick="generateStudyMaterial()" style="margin-top:14px;">Try Again</button>'
      +'</div>';
    if(mc)mc.innerHTML=errHtml;if(fc)fc.innerHTML=errHtml;
    console.error('Study gen error:',e);
  }
  btn.disabled=false;
  btn.innerHTML=GEN_BTN_HTML;
}
function renderMCQ(){
  if(!mcqData.length){$('mcqContent').innerHTML='<div class="empty-card"><div class="empty-icon"></div><p>No MCQs generated</p></div>';return;}
  const scoreBar=`<div class="quiz-score-bar"><span class="qs-label">Score</span><span class="qs-val" id="quizScore">0 / ${mcqData.length}</span></div>`;
  $('mcqContent').innerHTML=scoreBar+mcqData.map((q,qi)=>{
    return `<div class="mcq-item" id="mcq-${qi}">
      <div class="mcq-q"><span>Q${qi+1}</span>${esc(q.q)}</div>
      <div class="mcq-opts">${q.opts.map((o,oi)=>{
        const letter=['A','B','C','D'][oi];
        return `<div class="mcq-opt" onclick="answerMCQ(${qi},'${letter}')" id="opt-${qi}-${letter}">
          <div class="opt-letter">${letter}</div><span>${esc(o.replace(/^[A-D]\.\s*/,''))}</span>
        </div>`;
      }).join('')}</div>
      <div class="mcq-result" id="mcq-res-${qi}"></div>
    </div>`;
  }).join('');
}

function answerMCQ(qi,chosen){
  const q=mcqData[qi];
  const card=document.querySelector(`#mcq-${qi}`);
  if(card.dataset.answered)return;
  card.dataset.answered='1';
  quizAnswered++;
  const correct=chosen===q.ans;
  if(correct)quizCorrect++;
  ['A','B','C','D'].forEach(l=>{
    const el=document.getElementById(`opt-${qi}-${l}`);if(!el)return;
    if(l===q.ans)el.classList.add('correct');
    else if(l===chosen&&!correct)el.classList.add('wrong');
    el.style.pointerEvents='none';
  });
  const res=document.getElementById(`mcq-res-${qi}`);
  res.textContent=correct?`✅ Correct! ${q.exp}`:`❌ Wrong. Answer: ${q.ans}. ${q.exp}`;
  res.className=`mcq-result show ${correct?'correct':'wrong'}`;
  const sc=document.getElementById('quizScore');
  if(sc)sc.textContent=`${quizCorrect} / ${mcqData.length}`;
}

function renderFlash(){
  if(!flashData.length){$('flashContent').innerHTML='<div class="empty-card"><div class="empty-icon">🃏</div><p>No flashcards generated</p></div>';return;}
  $('flashContent').innerHTML=`<p style="font-size:11.5px;color:var(--tm);margin-bottom:12px;">🖱️ Click any card to flip and reveal the answer</p>
  <div class="flash-grid">${flashData.map((f,i)=>`
    <div class="flash-card" onclick="this.classList.toggle('flipped')">
      <div class="flash-inner">
        <div class="flash-front">
          <div class="flash-tag">True / False?</div>
          <div class="flash-q">${esc(f.statement)}</div>
          <div class="flash-hint">Tap to reveal →</div>
        </div>
        <div class="flash-back">
          <div class="flash-ans-label">Answer</div>
          <div class="flash-ans ${f.answer?'true':'false'}">${f.answer?'TRUE ✓':'FALSE ✗'}</div>
          <div class="flash-exp">${esc(f.exp)}</div>
        </div>
      </div>
    </div>`).join('')}</div>`;
}

/* ══════════════════════════════════════════
   RECORDS
══════════════════════════════════════════ */
function saveRecord(){
  const name=$('stuName').value.trim();
  const matric=$('stuMatric').value.trim();
  const dept=$('stuDept').value.trim();
  const level=$('stuLevel').value;
  if(!name){toast('Enter student name first');$('stuName').focus();return;}
  if(!matric){toast('Enter matric number');$('stuMatric').focus();return;}
  if(!sems.length){toast('Add at least one semester first');return;}
  const existing=records.findIndex(r=>r.matric.toLowerCase()===matric.toLowerCase());
  const rec={
    id:existing>=0?records[existing].id:Date.now(),
    name,matric,dept,level,scale:SCALE,
    savedAt:new Date().toISOString(),
    sems:JSON.parse(JSON.stringify(sems)),semId,cId
  };
  if(existing>=0){records[existing]=rec;toast(`Updated: ${name} ✓`);}
  else{records.push(rec);toast(`Saved: ${name} ✓`);}
  saveAll();updRecBadge();
}

function loadRecordToEditor(rec){
  $('stuName').value=rec.name;$('stuMatric').value=rec.matric;
  $('stuDept').value=rec.dept||'';$('stuLevel').value=rec.level||'100 Level';
  updAv();
  SCALE=rec.scale||5;GRADES=getGrades();GRADE_KEYS=getKeys();
  $('localScale').value=SCALE;$('globalScale').value=SCALE;
  $('cgpaScale').textContent='/'+SCALE;
  sems=JSON.parse(JSON.stringify(rec.sems));semId=rec.semId;cId=rec.cId;
  renderSems();updateStats();showView('editor');
  closeModal('recModal');
  toast(`Loaded: ${rec.name}`);
}

function delRecord(id,ev){
  ev.stopPropagation();
  const r=records.find(r=>r.id===id);if(!r)return;
  if(!confirm(`Delete record for ${r.name}? This cannot be undone.`))return;
  records=records.filter(r=>r.id!==id);
  saveAll();updRecBadge();renderRecs();toast('Record deleted');
}

function viewRecord(id){
  const r=records.find(r=>r.id===id);if(!r)return;
  modalRec=r;
  const sc=r.scale||5;const G=sc>=5?SCALE5:SCALE4;
  let cu=0,cg=0,tc=0;
  r.sems.forEach(s=>{s.courses.forEach(c=>{cu+=c.unit;cg+=G[c.grade]*c.unit;tc++;});});
  const cgpa=cu?cg/cu:0;const{t,cls}=classTagInfo(cgpa);
  $('mTitle').textContent=r.name;
  $('mSub').textContent=`${r.matric}${r.dept?' · '+r.dept:''} · ${r.level||''} · Scale: ${sc}.0`;
  let cumU=0,cumG=0;
  const semRows=r.sems.map((s,i)=>{
    const{gpa,u:su,gp:sg}=calcSemRec(s,G);cumU+=su;cumG+=sg;const sc2=cumU?cumG/cumU:0;
    return `<div style="margin-bottom:10px;background:var(--surf2);border-radius:var(--r-md);overflow:hidden;border:1.5px solid var(--bdr);">
      <div style="background:linear-gradient(135deg,var(--g700),var(--g900));padding:8px 12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:5px;">
        <span style="font-family:var(--f);font-size:12.5px;font-weight:800;color:#fff;">${esc(s.name)}</span>
        <span style="background:var(--y400);color:var(--g900);font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px;">GPA: ${gpa.toFixed(2)} · CGPA so far: ${sc2.toFixed(2)}</span>
      </div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:320px;">
        <thead><tr>${['Course','Units','Grade','Grade Points'].map(h=>`<th style="padding:6px 10px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--tm);text-align:left;border-bottom:1px solid var(--bdr);background:var(--surf2);">${h}</th>`).join('')}</tr></thead>
        <tbody>${s.courses.map(c=>{const gp=G[c.grade]*c.unit;return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid var(--bdr);font-size:12px;">${esc(c.name||'Unnamed')}</td>
          <td style="padding:6px 10px;border-bottom:1px solid var(--bdr);font-size:12px;">${c.unit}</td>
          <td style="padding:6px 10px;border-bottom:1px solid var(--bdr);font-size:12px;font-weight:700;">${c.grade}</td>
          <td style="padding:6px 10px;border-bottom:1px solid var(--bdr);font-size:12px;font-weight:700;color:var(--g700);">${gp}</td>
        </tr>`;}).join('')}</tbody>
      </table></div>
    </div>`;
  }).join('');
  $('mBody').innerHTML=`<div class="modal-meta">
    <div class="mm-item"><div class="mm-lbl">Overall CGPA</div><div class="mm-val big">${cgpa.toFixed(2)}<span style="font-size:12px;color:var(--tm);">/${sc}</span></div></div>
    <div class="mm-item"><div class="mm-lbl">Classification</div><div class="mm-val"><span class="cls-tag ${cls}">${t}</span></div></div>
    <div class="mm-item"><div class="mm-lbl">Total Units</div><div class="mm-val">${cu}</div></div>
    <div class="mm-item"><div class="mm-lbl">Total Grade Points</div><div class="mm-val">${cg}</div></div>
    <div class="mm-item"><div class="mm-lbl">Courses</div><div class="mm-val">${tc}</div></div>
  </div><div style="overflow-x:auto;">${semRows}</div>`;
  $('mEditBtn').onclick=()=>loadRecordToEditor(r);
  $('mPdfBtn').onclick=()=>exportRecordPDF(r);
  $('recModal').classList.add('open');
}

function calcSemRec(sem,G){
  if(!sem.courses.length)return{gpa:0,u:0,gp:0};
  let u=0,gp=0;
  sem.courses.forEach(c=>{u+=c.unit;gp+=G[c.grade]*c.unit;});
  return{gpa:u?gp/u:0,u,gp};
}

function renderRecs(){
  const grid=$('recGrid');
  const q=($('recSearch').value||'').toLowerCase();
  let filtered=records
    .filter(r=>r.name.toLowerCase().includes(q)||r.matric.toLowerCase().includes(q)||(r.dept||'').toLowerCase().includes(q))
    .sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt));
  if(!filtered.length){
    grid.innerHTML=`<div class="rec-empty"><div class="ei">${records.length?'🔍':'🗂️'}</div>
      <h3>${records.length?'No Results Found':'No Records Yet'}</h3>
      <p>${records.length?'Try a different search term.':'Save a student record from the Editor to see it here.'}</p></div>`;
    return;
  }
  grid.innerHTML=filtered.map(rec=>{
    const sc=rec.scale||5;const G=sc>=5?SCALE5:SCALE4;
    let cu=0,cg=0,tc=0;
    rec.sems.forEach(s=>{s.courses.forEach(c=>{cu+=c.unit;cg+=G[c.grade]*c.unit;tc++;});});
    const cgpa=cu?cg/cu:0;const{t,cls}=classTagInfo(cgpa);
    const saved=new Date(rec.savedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    return `<div class="rec-card" onclick="viewRecord(${rec.id})">
      <div class="rec-top">
        <div style="display:flex;gap:8px;align-items:center;">
          <div class="rec-av">${ini(rec.name)}</div>
          <div><div class="rec-name">${esc(rec.name)}</div><div class="rec-matric">${esc(rec.matric)}</div></div>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="rec-edit" onclick="(function(e){e.stopPropagation();loadRecordToEditor(records.find(r=>r.id===${rec.id}));})(event)" title="Edit in Editor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="rec-del" onclick="delRecord(${rec.id},event)" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
      ${rec.dept?`<div style="font-size:10px;color:var(--tm);margin-bottom:6px;">${esc(rec.dept)} · ${rec.level||''} · ${sc}.0 Scale</div>`:''}
      <div class="rec-stats">
        <div class="rs"><div class="rs-l">Sems</div><div class="rs-v">${rec.sems.length}</div></div>
        <div class="rs"><div class="rs-l">Courses</div><div class="rs-v">${tc}</div></div>
        <div class="rs"><div class="rs-l">Units</div><div class="rs-v">${cu}</div></div>
      </div>
      <div class="rec-bot">
        <span class="cls-tag ${cls}">${t}</span>
        <span class="rec-cgpa">${cgpa.toFixed(2)}<span style="font-size:11px;color:var(--tm);">/${sc}</span></span>
      </div>
      <div class="rec-date">Last saved: ${saved}</div>
    </div>`;
  }).join('');
}

function updRecBadge(){
  const n=records.length;
  $('recBadge').textContent=n?`Records (${n})`:'Records';
}

/* ══════════════════════════════════════════
   ANALYTICS
══════════════════════════════════════════ */
function renderAnalytics(){
  const G=getGrades();
  const allCourses=sems.flatMap(s=>s.courses.map(c=>({...c,semName:s.name,gpVal:G[c.grade]*c.unit})));
  const weak=allCourses.filter(c=>G[c.grade]<weakThresh()).sort((a,b)=>G[a.grade]-G[b.grade]);
  const top=[...allCourses].sort((a,b)=>G[b.grade]-G[a.grade]).slice(0,6);

  $('weakList').innerHTML=weak.length===0
    ?'<div class="trend-row" style="padding:12px 0;"><span style="color:var(--g600);font-weight:600;font-size:13px;">✅ No weak courses detected!</span></div>'
    :weak.slice(0,8).map(c=>`<div class="weak-course-item">
        <div>
          <div class="wci-name">${esc(c.name||'Unnamed Course')}</div>
          <div class="wci-meta">${esc(c.semName)} · ${c.unit} unit${c.unit>1?'s':''}</div>
        </div>
        <div class="wci-right">
          <div class="grade-dot gp${G[c.grade]}">${c.grade}</div>
        </div>
      </div>`).join('');

  const gpas=sems.map((s,i)=>({n:s.name,g:calcSem(s).gpa,i}));
  $('trendList').innerHTML=!gpas.length
    ?'<div class="trend-row">No semester data yet</div>'
    :gpas.map((s,i)=>{
        const prev=i>0?gpas[i-1].g:s.g;
        const diff=s.g-prev;
        const cls=i===0?'trend-eq':diff>0.01?'trend-up':diff<-0.01?'trend-down':'trend-eq';
        const arr=i===0?'·':diff>0.01?'▲':diff<-0.01?'▼':'—';
        return `<div class="trend-row">
          <span class="trend-sem">${s.n.length>18?s.n.slice(0,16)+'…':s.n}</span>
          <span class="trend-gpa ${cls}">${s.g.toFixed(2)} <span class="trend-arr">${arr}</span></span>
        </div>`;
      }).join('');

  // Grade distribution chart
  const dist={A:0,B:0,C:0,D:0,E:0,F:0};
  allCourses.forEach(c=>{if(dist[c.grade]!==undefined)dist[c.grade]++;});
  const dctx=$('gradeDistChart').getContext('2d');
  if(distChart)distChart.destroy();
  const tc=dm?'#9dc998':'#4a6741';
  distChart=new Chart(dctx,{
    type:'bar',
    data:{
      labels:Object.keys(dist),
      datasets:[{
        data:Object.values(dist),
        backgroundColor:['#22c55e','#3b82f6','#eab308','#f97316','#a855f7','#ef4444'],
        borderRadius:6,borderSkipped:false
      }]
    },
    options:{responsive:true,plugins:{legend:{display:false}},
      scales:{
        y:{ticks:{color:tc,font:{size:9,family:"'Plus Jakarta Sans',sans-serif"}},grid:{color:dm?'#2a4a2a':'#e2ebe2'},beginAtZero:true},
        x:{ticks:{color:tc,font:{size:11,family:"'Plus Jakarta Sans',sans-serif",weight:'bold'}},grid:{display:false}}
      }}
  });

  $('topList').innerHTML=!top.length
    ?'<div class="trend-row">No course data yet</div>'
    :top.map(c=>`<div class="weak-course-item">
        <div>
          <div class="wci-name">${esc(c.name||'Unnamed')}</div>
          <div class="wci-meta">${esc(c.semName)} · ${c.unit} unit${c.unit>1?'s':''}</div>
        </div>
        <div class="wci-right">
          <div class="grade-dot gp${G[c.grade]}">${c.grade}</div>
        </div>
      </div>`).join('');

  let cu=0,cg=0;
  $('semSummary').innerHTML=!sems.length
    ?'<div class="trend-row">No data yet</div>'
    :sems.map((s,i)=>{
        const{gpa,u,gp}=calcSem(s);cu+=u;cg+=gp;const cgpa=cu?cg/cu:0;
        const cls=gpa>=(SCALE>=5?4:3)?'trend-up':gpa>=(SCALE>=5?3:2)?'trend-eq':'trend-down';
        return `<div class="trend-row">
          <span class="trend-sem">${s.name.length>14?s.name.slice(0,12)+'…':s.name}</span>
          <span style="font-size:10px;color:var(--tm);">${u}u · GP:${gp}</span>
          <span class="trend-gpa ${cls}">${gpa.toFixed(2)}</span>
        </div>`;
      }).join('');
}

/* ══════════════════════════════════════════
   IMPORT / EXPORT
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   EXCEL IMPORT / EXPORT  (SheetJS)
══════════════════════════════════════════ */

/* ── EXPORT ── */
function exportXLSX(){
  if(typeof XLSX==='undefined'){toast('SheetJS not loaded — check your connection');return;}
  const G=getGrades();
  const wb=XLSX.utils.book_new();

  /* ── Sheet 1: Student Info ── */
  const name=$('stuName').value.trim()||'Student';
  const matric=$('stuMatric').value.trim()||'—';
  const dept=$('stuDept').value.trim()||'—';
  const level=$('stuLevel').value||'—';
  let tu=0,tgp=0;
  sems.forEach(s=>{const{u,gp}=calcSem(s);tu+=u;tgp+=gp;});
  const cgpa=tu?tgp/tu:0;

  const infoRows=[
    ['CGPA Calc — Academic Transcript','','',''],
    ['','','',''],
    ['Full Name',name,'',''],
    ['Matric Number',matric,'',''],
    ['Department',dept,'',''],
    ['Level',level,'',''],
    ['Grading Scale',SCALE+'.0 Scale','',''],
    ['','','',''],
    ['Overall CGPA',+cgpa.toFixed(2),'',''],
    ['Total Units',tu,'',''],
    ['Total Grade Points',tgp,'',''],
    ['Classification',classLabel(cgpa).replace(/[🏆🥇🥈🥉📋⭐📈📉→]/g,'').trim(),'',''],
    ['Exported',new Date().toLocaleString('en-GB'),'',''],
  ];
  const wsInfo=XLSX.utils.aoa_to_sheet(infoRows);
  wsInfo['!cols']=[{wch:22},{wch:30},{wch:16},{wch:16}];
  XLSX.utils.book_append_sheet(wb,wsInfo,'Student Info');

  /* ── Sheet 2: All Courses (flat) ── */
  const courseRows=[
    ['Semester','Course Name','Units','Grade','Grade Points','GP per Unit','Semester GPA','Cumulative CGPA','Status']
  ];
  let cumU=0,cumG=0;
  sems.forEach(s=>{
    const{gpa,u:su,gp:sg}=calcSem(s);
    cumU+=su;cumG+=sg;
    const semCGPA=cumU?cumG/cumU:0;
    s.courses.forEach((c,i)=>{
      const gp=G[c.grade]*c.unit;
      const gpPerUnit=c.unit?+(gp/c.unit).toFixed(2):0;
      const weak=G[c.grade]<(SCALE>=5?3:2.5);
      courseRows.push([
        s.name,
        c.name||'Unnamed Course',
        c.unit,
        c.grade,
        gp,
        gpPerUnit,
        i===0?+gpa.toFixed(2):'',   // show GPA only on first course row of semester
        i===0?+semCGPA.toFixed(2):'',
        weak?'Needs Attention':'Good'
      ]);
    });
    // Blank separator between semesters
    courseRows.push(['','','','','','','','','']);
  });
  const wsCourses=XLSX.utils.aoa_to_sheet(courseRows);
  wsCourses['!cols']=[{wch:24},{wch:36},{wch:7},{wch:7},{wch:13},{wch:12},{wch:13},{wch:16},{wch:16}];
  XLSX.utils.book_append_sheet(wb,wsCourses,'All Courses');

  /* ── Sheet 3: Semester Summary ── */
  const semRows=[
    ['Semester','Courses','Sem Units','Sem GP','Semester GPA','Cumulative Units','Cumulative GP','CGPA After Sem','Classification']
  ];
  let cu2=0,cg2=0;
  sems.forEach((s,i)=>{
    const{gpa,u,gp}=calcSem(s);
    cu2+=u;cg2+=gp;
    const sc=cu2?cg2/cu2:0;
    semRows.push([
      s.name,
      s.courses.length,
      u,
      gp,
      +gpa.toFixed(2),
      cu2,
      cg2,
      +sc.toFixed(2),
      classLabel(sc).replace(/[🏆🥇🥈🥉📋⭐📈📉→]/g,'').trim()
    ]);
  });
  const wsSems=XLSX.utils.aoa_to_sheet(semRows);
  wsSems['!cols']=[{wch:26},{wch:9},{wch:11},{wch:8},{wch:14},{wch:16},{wch:13},{wch:16},{wch:22}];
  XLSX.utils.book_append_sheet(wb,wsSems,'Semester Summary');

  /* ── Sheet 4: Grade Distribution ── */
  const G2=getGrades();
  const dist={};
  Object.keys(G2).forEach(g=>{dist[g]=0;});
  sems.forEach(s=>s.courses.forEach(c=>{if(dist[c.grade]!==undefined)dist[c.grade]++;}));
  const distRows=[['Grade','Count','Grade Points Value']];
  Object.entries(dist).forEach(([g,cnt])=>distRows.push([g,cnt,G2[g]]));
  const wsDist=XLSX.utils.aoa_to_sheet(distRows);
  wsDist['!cols']=[{wch:10},{wch:8},{wch:18}];
  XLSX.utils.book_append_sheet(wb,wsDist,'Grade Distribution');

  /* ── Download ── */
  const filename=`CGPA_${name.replace(/\s+/g,'_')}_${matric.replace(/\//g,'-')}.xlsx`;
  XLSX.writeFile(wb,filename);
  toast('Excel file exported ✓');
}

/* ── IMPORT ── */
function importXLSX(){$('importFile').click();}

function onImportFile(ev){
  const file=ev.target.files[0];if(!file)return;
  if(typeof XLSX==='undefined'){toast('SheetJS not loaded — check your connection');ev.target.value='';return;}

  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=new Uint8Array(e.target.result);
      const wb=XLSX.read(data,{type:'array'});

      /* ── Try to find the sheets we need ── */
      const sheetNames=wb.SheetNames.map(s=>s.toLowerCase());
      const infoIdx=sheetNames.findIndex(s=>s.includes('info')||s.includes('student'));
      const coursesIdx=sheetNames.findIndex(s=>s.includes('course')||s.includes('grade'));
      const semIdx=sheetNames.findIndex(s=>s.includes('sem'));

      /* ── Parse Student Info sheet ── */
      let stuName='',stuMatric='',stuDept='',stuLevel='100 Level',stuScale=5;
      if(infoIdx>=0){
        const ws=wb.Sheets[wb.SheetNames[infoIdx]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        rows.forEach(row=>{
          const key=String(row[0]||'').toLowerCase().trim();
          const val=String(row[1]||'').trim();
          if(key.includes('name')&&!key.includes('course'))stuName=val;
          else if(key.includes('matric'))stuMatric=val;
          else if(key.includes('dept'))stuDept=val;
          else if(key.includes('level'))stuLevel=val||'100 Level';
          else if(key.includes('scale'))stuScale=val.startsWith('4')?4:5;
        });
      }

      /* ── Parse Courses sheet (primary data source) ── */
      // Expected columns: Semester | Course Name | Units | Grade | ...
      if(coursesIdx<0&&semIdx<0)
        throw new Error('Could not find a Courses or Semester sheet. Make sure the file was exported from CGPA Calc or follows the expected format.');

      const wsName=wb.SheetNames[coursesIdx>=0?coursesIdx:semIdx];
      const ws=wb.Sheets[wsName];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});

      if(rows.length<2)throw new Error('The courses sheet appears to be empty.');

      // Detect header row and column positions
      const header=rows[0].map(h=>String(h).toLowerCase().trim());
      const col={
        sem:   header.findIndex(h=>h.includes('sem')),
        name:  header.findIndex(h=>h.includes('course')||h.includes('name')),
        unit:  header.findIndex(h=>h.includes('unit')),
        grade: header.findIndex(h=>h.includes('grade')&&!h.includes('point')&&!h.includes('gp')),
      };

      if(col.sem<0||col.name<0||col.unit<0||col.grade<0){
        throw new Error(
          `Could not find required columns.
`+
          `Need: Semester, Course Name, Units, Grade.
`+
          `Found: ${rows[0].filter(Boolean).join(', ')}`
        );
      }

      // Build sems array from rows
      const semMap=new Map(); // semName -> {id, name, courses[]}
      let localSemId=0,localCId=0;
      const validGrades=new Set(Object.keys(getGrades()));

      rows.slice(1).forEach(row=>{
        const semName=String(row[col.sem]||'').trim();
        const courseName=String(row[col.name]||'').trim();
        const unitRaw=parseInt(row[col.unit])||0;
        const gradeRaw=String(row[col.grade]||'').trim().toUpperCase();

        if(!semName||!courseName||!unitRaw)return; // skip blank/separator rows
        if(!validGrades.has(gradeRaw)){return;} // skip rows with invalid grades

        if(!semMap.has(semName)){
          semMap.set(semName,{id:++localSemId,name:semName,courses:[]});
        }
        semMap.get(semName).courses.push({
          id:++localCId,
          name:courseName,
          unit:Math.min(6,Math.max(1,unitRaw)),
          grade:gradeRaw
        });
      });

      const importedSems=[...semMap.values()];
      if(!importedSems.length)throw new Error('No valid course rows found in the sheet. Check that Semester, Course Name, Units and Grade columns have data.');

      // Apply to editor
      $('stuName').value=stuName;
      $('stuMatric').value=stuMatric;
      $('stuDept').value=stuDept;
      $('stuLevel').value=stuLevel;
      updAv();
      SCALE=stuScale;GRADES=getGrades();GRADE_KEYS=getKeys();
      const ls=$('localScale');if(ls)ls.value=SCALE;
      const gs=$('globalScale');if(gs)gs.value=SCALE;
      const sl=$('cgpaScale');if(sl)sl.textContent='/'+SCALE;
      sems=importedSems;semId=localSemId;cId=localCId;
      renderSems();updateStats();showView('editor');

      const courseCount=importedSems.reduce((a,s)=>a+s.courses.length,0);
      toast(`Imported ${importedSems.length} semesters, ${courseCount} courses ✓`);
    }catch(err){
      console.error('Excel import error:',err);
      toast('Import failed: '+err.message.slice(0,80));
    }
    ev.target.value='';
  };
  reader.readAsArrayBuffer(file);
}

/* ══════════════════════════════════════════
   PDF EXPORT
══════════════════════════════════════════ */
function exportPDF(){
  const nm=$('stuName').value.trim()||'Student';
  exportRecordPDF({
    name:nm,matric:$('stuMatric').value.trim()||'—',
    dept:$('stuDept').value.trim(),level:$('stuLevel').value,
    scale:SCALE,sems
  });
}
function exportRecordPDF(r){
  const{jsPDF}=window.jspdf;const doc=new jsPDF();
  const pw=doc.internal.pageSize.getWidth();let y=20;
  const sc=r.scale||5;const G=sc>=5?SCALE5:SCALE4;
  // Header
  doc.setFillColor(22,101,52);doc.rect(0,0,pw,50,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(18);
  doc.text('CGPA CALC — Academic Transcript',pw/2,16,{align:'center'});
  doc.setFontSize(11);doc.text(`${r.name}  ·  ${r.matric}`,pw/2,27,{align:'center'});
  doc.setFont('helvetica','normal');doc.setFontSize(8.5);
  doc.text(`${r.dept||''}${r.level?' · '+r.level:''} · Scale: ${sc}.0 · Generated: ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})}`,pw/2,36,{align:'center'});
  y=58;
  let allU=0,allGP=0;
  r.sems.forEach(s=>{const{u,gp}=calcSemRec(s,G);allU+=u;allGP+=gp;});
  const overallCGPA=allU?allGP/allU:0;
  let cu=0,cg=0;
  r.sems.forEach((s,i)=>{
    const{gpa,u,gp}=calcSemRec(s,G);cu+=u;cg+=gp;const sc2=cu?cg/cu:0;
    if(y>260){doc.addPage();y=20;}
    doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.setTextColor(22,101,52);
    doc.text(s.name,14,y);y+=5;
    doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(80,80,80);
    doc.text(`Sem GPA: ${gpa.toFixed(2)}  ·  Units: ${u}  ·  GP: ${gp}  ·  CGPA after Sem ${i+1}: ${sc2.toFixed(2)}`,14,y);y+=3.5;
    doc.setDrawColor(200,230,200);doc.line(14,y,pw-14,y);y+=2.5;
    s.courses.forEach(c=>{
      if(y>272){doc.addPage();y=20;}
      const gpv=G[c.grade]*c.unit;
      const isWeak=G[c.grade]<(sc>=5?3:2.5);
      doc.setTextColor(isWeak?180:40,isWeak?40:40,40);
      doc.setFontSize(8.5);
      doc.text(`  ${c.name||'Unnamed'}`,14,y);
      doc.text(`${c.unit}u`,105,y);
      doc.text(`Grade: ${c.grade}${isWeak?' ⚠':''}`,125,y);
      doc.text(`GP: ${gpv}`,162,y);
      y+=5.5;
    });
    y+=5;
  });
  // Footer summary box
  if(y>252){doc.addPage();y=20;}
  doc.setFillColor(22,101,52);doc.roundedRect(14,y,pw-28,30,4,4,'F');
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(14);
  doc.text(`Overall CGPA: ${overallCGPA.toFixed(2)} / ${sc}.00`,pw/2,y+11,{align:'center'});
  doc.setFontSize(9.5);doc.setFont('helvetica','normal');
  doc.text(classLabel(overallCGPA).replace(/[🏆🥇🥈🥉📋⭐📈📉→]/g,'').trim(),pw/2,y+21,{align:'center'});
  doc.save(`CGPA_${r.name.replace(/\s+/g,'_')}.pdf`);
  toast('PDF exported ✓');
}

/* ══════════════════════════════════════════
   SAMPLE DATA
══════════════════════════════════════════ */
function loadSample(){
  $('stuName').value='Chidera Nwosu';$('stuMatric').value='CSC/2021/047';
  $('stuDept').value='Computer Science';$('stuLevel').value='200 Level';
  updAv();sems=[];semId=0;cId=0;
  const data=[
    {n:'100L First Semester',c:[
      {n:'Use of English',u:2,g:'A'},{n:'Calculus I',u:3,g:'B'},
      {n:'Intro to Computer Science',u:3,g:'A'},{n:'Physics I',u:3,g:'B'},{n:'General Studies',u:2,g:'A'}
    ]},
    {n:'100L Second Semester',c:[
      {n:'Calculus II',u:3,g:'A'},{n:'Introduction to Programming',u:3,g:'A'},
      {n:'Nigerian History',u:2,g:'B'},{n:'Communication Skills',u:2,g:'A'},{n:'Logic & Critical Thinking',u:2,g:'B'}
    ]},
    {n:'200L First Semester',c:[
      {n:'Data Structures',u:3,g:'B'},{n:'Discrete Mathematics',u:3,g:'C'},
      {n:'Digital Logic Design',u:3,g:'A'},{n:'Technical Writing',u:2,g:'D'},{n:'Algorithms',u:3,g:'A'}
    ]},
    {n:'200L Second Semester',c:[
      {n:'Database Systems',u:3,g:'A'},{n:'Operating Systems',u:3,g:'B'},
      {n:'Computer Networks',u:3,g:'C'},{n:'Numerical Methods',u:3,g:'D'},{n:'Software Engineering',u:2,g:'A'}
    ]},
  ];
  data.forEach(d=>{
    semId++;const s={id:semId,name:d.n,courses:[]};
    d.c.forEach(c=>{cId++;s.courses.push({id:cId,name:c.n,unit:c.u,grade:c.g});});
    sems.push(s);
  });
  renderSems();updateStats();toast('Sample data loaded ✓');
}

/* ══════════════════════════════════════════
   PERSIST
══════════════════════════════════════════ */
function clearEditor(){
  if(!confirm('Start fresh? Unsaved changes will be lost.'))return;
  sems=[];semId=0;cId=0;
  $('stuName').value='';$('stuMatric').value='';$('stuDept').value='';updAv();
  renderSems();updateStats();toast('Editor cleared — ready for new record');
}

function saveAll(){
  try{
    localStorage.setItem('cgpa_v3',JSON.stringify({
      sems,semId,cId,dm,scale:SCALE,
      n:$('stuName').value,m:$('stuMatric').value,
      d:$('stuDept').value,l:$('stuLevel').value
    }));
    localStorage.setItem('cgpa_recs3',JSON.stringify(records));
  }catch(e){}
}

function loadAll(){
  try{
    const s=localStorage.getItem('cgpa_v3');
    if(s){
      const d=JSON.parse(s);
      sems=d.sems||[];semId=d.semId||0;cId=d.cId||0;
      dm=d.dm||false;document.body.classList.toggle('dm',dm);
      $('dmLbl').textContent=dm?'Light':'Dark';
      SCALE=d.scale||5;GRADES=getGrades();GRADE_KEYS=getKeys();
      $('localScale').value=SCALE;$('globalScale').value=SCALE;
      $('cgpaScale').textContent='/'+SCALE;
      if(d.n){$('stuName').value=d.n;updAv();}
      if(d.m)$('stuMatric').value=d.m;
      if(d.d)$('stuDept').value=d.d;
      if(d.l)$('stuLevel').value=d.l;
    }
    const r=localStorage.getItem('cgpa_recs3');
    if(r)records=JSON.parse(r);
  }catch(e){}
  renderSems();updateStats();updRecBadge();
}

// ── BOOT ──
loadAll();
window.addEventListener('resize',()=>{ if(window.innerWidth>1024) closeSidebar(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeSidebar(); });