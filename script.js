// Runtime error monitoring: surface errors as toasts so clicks failing due to JS errors are visible
window.addEventListener('error', (e) => {
  try{ toast('JavaScript error: ' + (e.message || e.toString()), 'error'); } catch(e){ /* toast may not be available yet */ }
  console.error('Runtime error', e.error || e.message || e);
});
window.addEventListener('unhandledrejection', (ev) => {
  try{ const msg = ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason); toast('Unhandled rejection: ' + msg, 'error'); } catch(e){}
  console.error('Unhandled rejection', ev.reason);
});

const TCOLORS={Conference:'#2563eb',Workshop:'#0d9488','Guest Lecture':'#7c3aed','Community Engagement':'#16a34a',Meeting:'#d97706','Industry Collaboration':'#db2777',Volunteering:'#0891b2',Other:'#64748b'};

const DB={
  get:k=>JSON.parse(localStorage.getItem('ears3_'+k)||'null'),
  set:(k,v)=>localStorage.setItem('ears3_'+k,JSON.stringify(v)),
  remove:k=>localStorage.removeItem('ears3_'+k),
  acts:()=>DB.get('acts')||[],
  saveActs:v=>DB.set('acts',v),
  users:()=>DB.get('users')||[],
  saveUsers:v=>DB.set('users',v),
  audit:()=>DB.get('audit')||[],
  saveAudit:v=>DB.set('audit',v),
  nextId:key=>{const value=(DB.get(key)||0)+1;DB.set(key,value);return value;}
};

let showUpcomingOnly=false;
let adminTab='users';
let syncInProgress = false;
let lastSyncTime = null;

// Sync configuration - what to exclude from sync
const SYNC_CONFIG = {
  excludeTypes: [], // Activity types to exclude from sync
  excludeStatuses: ['pending'], // Statuses to exclude from sync
  autoSyncEnabled: false,
  syncInterval: 30000, // 30 seconds
  maxRetries: 3
};

function nowIso(){
  return new Date().toISOString();
}

function seedData(){
  if(!DB.get('usersSeeded')){
    DB.saveUsers([
      {id:1,name:'System Administrator',email:'admin@uni.edu',password:'admin123',department:'IT Services',jobTitle:'Platform Administrator',role:'admin',active:true,createdAt:nowIso()},
      {id:2,name:'Staff Member',email:'staff@uni.edu',password:'staff123',department:'Engineering',jobTitle:'Lecturer',role:'staff',active:true,createdAt:nowIso()}
    ]);
    DB.set('userId',2);
    DB.set('usersSeeded',true);
  }

  if(!DB.get('actsSeeded')){
    const y=new Date().getFullYear();
    DB.saveActs([
      {id:1,userId:2,title:'Faculty Industry Advisory Meeting',type:'Meeting',org:'Curtin Industry Board',date:`${y}-04-02`,time:'10:00',endDate:'',location:'Perth Campus',hours:2,desc:'Quarterly advisory meeting with industry partners to discuss curriculum alignment.',outcome:'Collected industry feedback for capstone redesign.',status:'approved',createdAt:nowIso(),verifiedBy:1},
      {id:2,userId:2,title:'Regional STEM Outreach Workshop',type:'Community Engagement',org:'WA Schools Network',date:`${y}-05-14`,time:'13:30',endDate:'',location:'Online',hours:3,desc:'Planning and delivery workshop for STEM outreach activities.',outcome:'Confirmed three outreach sessions for next term.',status:'pending',createdAt:nowIso()},
      {id:3,userId:2,title:'Research Methods Workshop',type:'Workshop',org:'Curtin Academy',date:`${y}-03-20`,time:'09:00',endDate:'',location:'Building 402',hours:4,desc:'Professional development workshop on mixed-methods research design.',outcome:'Applied framework to current project proposal.',status:'approved',createdAt:nowIso(),verifiedBy:1},
      {id:4,userId:1,title:'University Governance Briefing',type:'Meeting',org:'Executive Office',date:`${y}-04-28`,time:'15:00',endDate:'',location:'Senate Room',hours:1,desc:'Compliance briefing for engagement reporting and academic review.',outcome:'Updated internal guidance for annual reviews.',status:'approved',createdAt:nowIso(),verifiedBy:1}
    ]);
    DB.set('activityId',4);
    DB.set('actsSeeded',true);
  }

  if(!DB.get('auditSeeded')){
    DB.saveAudit([
      {id:1,at:nowIso(),actor:'system',action:'seed',details:'Loaded demo users and activities'}
    ]);
    DB.set('auditId',1);
    DB.set('auditSeeded',true);
  }
}

function currentUser(){
  const session=DB.get('session');
  if(!session?.userId)return null;
  return DB.users().find(user=>user.id===session.userId)||null;
}

function isLoggedIn(){
  return !!currentUser();
}

function isAdmin(){
  return currentUser()?.role==='admin';
}

function visibleActivities(){
  const user=currentUser();
  if(!user)return [];
  const activities=DB.acts();
  return user.role==='admin'?activities:activities.filter(activity=>activity.userId===user.id);
}

function addAudit(action,details=''){
  const logs=DB.audit();
  const actor=currentUser()?.email||'system';
  logs.unshift({id:DB.nextId('auditId'),at:nowIso(),actor,action,details});
  DB.saveAudit(logs.slice(0,200));
}

function esc(value){
  return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(value){
  if(!value)return '—';
  try{return new Date(value+'T12:00:00').toLocaleDateString('en-AU',{year:'numeric',month:'short',day:'numeric'});}catch{return value;}
}

function fmtTime(value){
  if(!value)return '';
  try{
    const [hours,minutes]=value.split(':');
    const hour=+hours;
    return `${hour%12||12}:${minutes} ${hour>=12?'PM':'AM'}`;
  }catch{return value;}
}

function fmtDateTime(value){
  if(!value)return '—';
  try{return new Date(value).toLocaleString('en-AU',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return value;}
}

function fmtMonth(value){
  if(!value)return 'Unknown Date';
  try{return new Date(value+'-01T12:00:00').toLocaleDateString('en-AU',{year:'numeric',month:'long'});}catch{return value;}
}

function toast(message,type=''){
  const host=document.getElementById('toasts');
  const item=document.createElement('div');
  item.className='toast'+(type?' toast-'+type:'');
  item.innerHTML=`<span>${type==='success'?'✓':'ℹ'}</span> ${esc(message)}`;
  host.appendChild(item);
  setTimeout(()=>item.remove(),3200);
}

function closeM(id){
  document.getElementById(id).classList.add('hidden');
}

function requireLogin(action){
  if(isLoggedIn())return true;
  toast(`Please login to ${action}`,'error');
  openLoginModal();
  return false;
}

function updateAuthUI(){
  const user=currentUser();
  const loginBtn=document.getElementById('login-btn');
  const adminNav=document.getElementById('nav-admin');
  const app=document.getElementById('app');
  if(loginBtn){
    loginBtn.textContent=user?'Logout':'Login';
    loginBtn.classList.toggle('btn-p',!!user);
    loginBtn.classList.toggle('btn-s',!user);
    loginBtn.onclick=user?logout:openLoginModal;
  }
  if(adminNav)adminNav.classList.toggle('hidden',!isAdmin());
  app.classList.toggle('auth-locked',!user);
}

function openLoginModal(){
  document.getElementById('login-error').style.display='none';
  document.getElementById('login-username').value='';
  document.getElementById('login-password').value='';
  document.getElementById('modal-login').classList.remove('hidden');
}

function openRegisterModal(){
  document.getElementById('register-error').style.display='none';
  ['register-name','register-email','register-department','register-job','register-password'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('modal-register').classList.remove('hidden');
}

function handleLogin(){
  const email=document.getElementById('login-username').value.trim().toLowerCase();
  const password=document.getElementById('login-password').value;
  const user=DB.users().find(item=>item.email.toLowerCase()===email&&item.password===password&&item.active);
  if(!user){
    document.getElementById('login-error').style.display='block';
    return;
  }
  DB.set('session',{userId:user.id,loggedInAt:nowIso()});
  closeM('modal-login');
  updateAuthUI();
  addAudit('login',`Signed in as ${user.email}`);
  toast(`Welcome, ${user.name}`,'success');
  showPage(user.role==='admin'?'admin':'dashboard');
}

function handleRegister(){
  const name=document.getElementById('register-name').value.trim();
  const email=document.getElementById('register-email').value.trim().toLowerCase();
  const department=document.getElementById('register-department').value.trim();
  const jobTitle=document.getElementById('register-job').value.trim();
  const password=document.getElementById('register-password').value;
  const exists=DB.users().some(user=>user.email.toLowerCase()===email);
  if(!name||!email||!department||!jobTitle||!password||exists){
    document.getElementById('register-error').style.display='block';
    return;
  }
  const users=DB.users();
  const user={id:DB.nextId('userId'),name,email,password,department,jobTitle,role:'staff',active:true,createdAt:nowIso()};
  users.push(user);
  DB.saveUsers(users);
  DB.set('session',{userId:user.id,loggedInAt:nowIso()});
  closeM('modal-register');
  updateAuthUI();
  addAudit('register',`Created account ${email}`);
  toast('Account created','success');
  showPage('dashboard');
}

function logout(){
  const email=currentUser()?.email||'';
  DB.remove('session');
  updateAuthUI();
  addAudit('logout',`Signed out ${email}`);
  toast('Logged out','success');
  showLoginGate();
}

function showLoginGate(){
  document.querySelectorAll('[id^="page-"]').forEach(page=>page.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.remove('active'));
  document.getElementById('page-dashboard').classList.remove('hidden');
  document.getElementById('dash-greet').textContent='Login Required';
  document.querySelector('#page-dashboard .ps').textContent='Sign in with your university demo account to continue';
  document.getElementById('type-chart').innerHTML='<div style="font-size:13px;color:var(--g400);padding:12px 0">Login as admin@uni.edu / admin123 or staff@uni.edu / staff123</div>';
  document.getElementById('dash-recent').innerHTML='<div style="font-size:13px;color:var(--g400);padding:12px 0">Authentication required before viewing records.</div>';
  document.getElementById('dash-table').innerHTML='<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--g400)">Please login first.</td></tr>';
  document.getElementById('s-total').textContent='0';
  document.getElementById('s-hours').textContent='0';
  document.getElementById('s-year').textContent='0';
  document.getElementById('s-orgs').textContent='0';
  openLoginModal();
}

function showPage(name){
  if(!isLoggedIn()&&name!=='dashboard'){
    showLoginGate();
    return;
  }
  if(name==='admin'&&!isAdmin()){
    toast('Admin access only','error');
    return;
  }
  document.querySelectorAll('[id^="page-"]').forEach(page=>page.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.remove('active'));
  document.getElementById('page-'+name).classList.remove('hidden');
  const nav=document.getElementById('nav-'+name);
  if(nav)nav.classList.add('active');
  populateYears();
  if(name==='dashboard')renderDash();
  if(name==='activities')renderActivities();
  if(name==='timeline')renderTimeline();
  if(name==='reports')renderReport();
  if(name==='profile')renderProfile();
  if(name==='admin')renderAdmin();
}

function populateYears(){
  const years=[...new Set(visibleActivities().map(activity=>activity.date?.slice(0,4)).filter(Boolean))].sort().reverse();
  ['act-fyear','tl-fyear','rpt-year'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const current=el.value;
    while(el.options.length>1)el.remove(1);
    years.forEach(year=>el.add(new Option(year,year)));
    if(current)el.value=current;
  });
}

function renderDash(){
  const activities=visibleActivities();
  const user=currentUser();
  const hour=new Date().getHours();
  document.getElementById('dash-greet').textContent=`${hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'}, ${user.name}`;
  document.querySelector('#page-dashboard .ps').textContent=user.role==='admin'?'Administrative overview and review queue':'Your engagement activity overview';
  document.getElementById('s-total').textContent=activities.length;
  document.getElementById('s-hours').textContent=activities.reduce((sum,item)=>sum+(+item.hours||0),0);
  const year=String(new Date().getFullYear());
  document.getElementById('s-year').textContent=activities.filter(item=>item.date?.startsWith(year)).length;
  document.getElementById('s-year-l').textContent='Activities in '+year;
  document.getElementById('s-orgs').textContent=new Set(activities.map(item=>item.org).filter(Boolean)).size;

  const types={};
  activities.forEach(item=>{types[item.type]=(types[item.type]||0)+1;});
  const total=activities.length||1;
  document.getElementById('type-chart').innerHTML=Object.keys(types).length===0
    ?'<div style="font-size:13px;color:var(--g400);padding:12px 0">No activities yet</div>'
    :Object.entries(types).sort((a,b)=>b[1]-a[1]).map(([type,count])=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px"><span style="font-weight:500">${esc(type)}</span><span style="color:var(--g400)">${count}</span></div><div class="pb2"><div class="pf" style="width:${Math.round(count/total*100)}%;background:${TCOLORS[type]||'#64748b'}"></div></div></div>`).join('');

  const recent=[...activities].sort((a,b)=>`${b.date}${b.time||''}`.localeCompare(`${a.date}${a.time||''}`)).slice(0,4);
  document.getElementById('dash-recent').innerHTML=recent.length===0
    ?'<div style="font-size:13px;color:var(--g400);padding:12px 0">No activities yet</div>'
    :recent.map(item=>`<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--g100);cursor:pointer" onclick="viewAct(${item.id})"><div style="width:6px;height:6px;border-radius:50%;background:${TCOLORS[item.type]||'#64748b'};margin-top:6px;flex-shrink:0"></div><div><div style="font-size:13px;font-weight:500;color:var(--g800)">${esc(item.title)}</div><div style="font-size:12px;color:var(--g400);margin-top:1px">${fmtDate(item.date)} · ${esc(item.type)} · ${esc(item.status||'pending')}</div></div></div>`).join('');

  const latest=[...activities].sort((a,b)=>`${b.date}${b.time||''}`.localeCompare(`${a.date}${a.time||''}`)).slice(0,5);
  document.getElementById('dash-table').innerHTML=latest.length===0
    ?'<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--g400)">No activities yet</td></tr>'
    :latest.map(item=>`<tr style="cursor:pointer" onclick="viewAct(${item.id})"><td class="tdt">${esc(item.title)}</td><td><span class="tp">${esc(item.type)}</span></td><td style="color:var(--g500);white-space:nowrap">${fmtDate(item.date)}${item.time?' '+fmtTime(item.time):''}</td><td style="color:var(--g500)">${esc(item.org||'—')}</td><td>${item.hours}h</td></tr>`).join('');
}

function getFiltered(){
  const query=(document.getElementById('act-search')?.value||'').toLowerCase();
  const type=document.getElementById('act-ftype')?.value||'';
  const year=document.getElementById('act-fyear')?.value||'';
  const sort=document.getElementById('act-fsort')?.value||'date-desc';
  let activities=visibleActivities();
  if(query)activities=activities.filter(item=>(item.title||'').toLowerCase().includes(query)||(item.desc||'').toLowerCase().includes(query)||(item.org||'').toLowerCase().includes(query)||(item.location||'').toLowerCase().includes(query));
  if(type)activities=activities.filter(item=>item.type===type);
  if(year)activities=activities.filter(item=>item.date?.startsWith(year));
  if(showUpcomingOnly){
    const today=new Date().toISOString().split('T')[0];
    activities=activities.filter(item=>item.type==='Meeting'&&item.date>=today);
  }
  if(sort==='date-desc')activities.sort((a,b)=>`${b.date}${b.time||''}`.localeCompare(`${a.date}${a.time||''}`));
  else if(sort==='date-asc')activities.sort((a,b)=>`${a.date}${a.time||''}`.localeCompare(`${b.date}${b.time||''}`));
  else if(sort==='type-asc')activities.sort((a,b)=>(a.type||'').localeCompare(b.type||''));
  else if(sort==='org-asc')activities.sort((a,b)=>(a.org||'').localeCompare(b.org||''));
  return activities;
}

function syncUpcomingButton(){
  const button=document.getElementById('act-upcoming');
  if(!button)return;
  button.classList.toggle('btn-p',showUpcomingOnly);
  button.classList.toggle('btn-g',!showUpcomingOnly);
  button.textContent=showUpcomingOnly?'Show All':'Upcoming Only';
}

function toggleUpcoming(){
  if(!requireLogin('view upcoming meetings'))return;
  showUpcomingOnly=!showUpcomingOnly;
  syncUpcomingButton();
  renderActivities();
}

function showUpcomingMeetings(){
  if(!requireLogin('view upcoming meetings'))return;
  showUpcomingOnly=true;
  showPage('activities');
  syncUpcomingButton();
  renderActivities();
}

function renderActivities(){
  syncUpcomingButton();
  const activities=getFiltered();
  const tbody=document.getElementById('act-tbody');
  const empty=document.getElementById('act-empty');
  if(activities.length===0){
    tbody.innerHTML='';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML=activities.map(item=>`<tr><td class="tdt" style="cursor:pointer;max-width:200px" onclick="viewAct(${item.id})">${esc(item.title)}</td><td><span class="tp">${esc(item.type)}</span></td><td style="color:var(--g500);white-space:nowrap">${fmtDate(item.date)}${item.time?'<br><span style="font-size:11px;color:var(--g400)">'+fmtTime(item.time)+'</span>':''}</td><td style="color:var(--g600)">${esc(item.org||'—')}</td><td style="color:var(--g600)">${esc(item.location||'—')}</td><td>${item.hours}h<br><span style="font-size:11px;color:var(--g400)">${esc(item.status||'pending')}</span></td><td><div class="ac"><button class="ib" onclick="viewAct(${item.id})" title="View">👁️</button><button class="ib" onclick="openEdit(${item.id})" title="Edit">✏️</button><button class="ib del" onclick="confirmDel(${item.id})" title="Delete">🗑️</button></div></td></tr>`).join('');
}

function clearActFilters(){
  ['act-search','act-ftype','act-fyear'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('act-fsort').value='date-desc';
  showUpcomingOnly=false;
  syncUpcomingButton();
  renderActivities();
}

function renderTimeline(){
  let activities=[...visibleActivities()];
  const year=document.getElementById('tl-fyear')?.value||'';
  const type=document.getElementById('tl-ftype')?.value||'';
  if(year)activities=activities.filter(item=>item.date?.startsWith(year));
  if(type)activities=activities.filter(item=>item.type===type);
  activities.sort((a,b)=>`${b.date}${b.time||''}`.localeCompare(`${a.date}${a.time||''}`));
  const container=document.getElementById('tl-container');
  if(activities.length===0){
    container.innerHTML='<div class="es"><div class="ei">🕐</div><div class="etitle">No activities to show</div><div class="edesc">Record activities to see them on the timeline.</div></div>';
    return;
  }
  const groups={};
  activities.forEach(item=>{const key=item.date?item.date.substring(0,7):'Unknown';if(!groups[key])groups[key]=[];groups[key].push(item);});
  container.innerHTML=Object.entries(groups).map(([month,items])=>`<div style="margin-bottom:8px"><div class="tl-mh">${fmtMonth(month)}</div><div class="timeline">${items.map(item=>`<div class="tl-item" onclick="viewAct(${item.id})"><div class="tl-dot" style="background:${TCOLORS[item.type]||'#64748b'};box-shadow:0 0 0 2px ${TCOLORS[item.type]||'#64748b'}"></div><div class="tl-card"><div class="tl-ct">${esc(item.title)}</div><div class="tl-cm"><span class="tp" style="font-size:11px;padding:2px 8px">${esc(item.type)}</span><span>📅 ${fmtDate(item.date)}${item.time?' · '+fmtTime(item.time):''}</span>${item.org?`<span>🏢 ${esc(item.org)}</span>`:''}${item.location?`<span>📍 ${esc(item.location)}</span>`:''}<span>⏱️ ${item.hours}h</span></div></div></div>`).join('')}</div></div>`).join('');
}

function openAdd(){
  if(!requireLogin('record an activity'))return;
  document.getElementById('modal-title').textContent='Record New Activity';
  document.getElementById('edit-id').value='';
  ['f-title','f-type','f-org','f-date','f-time','f-enddate','f-location','f-hours','f-desc','f-outcome'].forEach(id=>document.getElementById(id).value='');
  ['e-title','e-type','e-date','e-hours','e-desc'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('f-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('modal-act').classList.remove('hidden');
}

function openEdit(id){
  if(!requireLogin('edit an activity'))return;
  const activity=DB.acts().find(item=>item.id===id);
  const user=currentUser();
  if(!activity||(!isAdmin()&&activity.userId!==user.id))return;
  document.getElementById('modal-title').textContent='Edit Activity';
  document.getElementById('edit-id').value=id;
  document.getElementById('f-title').value=activity.title||'';
  document.getElementById('f-type').value=activity.type||'';
  document.getElementById('f-org').value=activity.org||'';
  document.getElementById('f-date').value=activity.date||'';
  document.getElementById('f-time').value=activity.time||'';
  document.getElementById('f-enddate').value=activity.endDate||'';
  document.getElementById('f-location').value=activity.location||'';
  document.getElementById('f-hours').value=activity.hours||'';
  document.getElementById('f-desc').value=activity.desc||'';
  document.getElementById('f-outcome').value=activity.outcome||'';
  document.getElementById('modal-act').classList.remove('hidden');
}

function saveActivity(){
  if(!requireLogin('save an activity'))return;
  const title=document.getElementById('f-title').value.trim();
  const type=document.getElementById('f-type').value;
  const date=document.getElementById('f-date').value;
  const hours=document.getElementById('f-hours').value;
  const desc=document.getElementById('f-desc').value.trim();
  let valid=true;
  ['e-title','e-type','e-date','e-hours','e-desc'].forEach(id=>document.getElementById(id).style.display='none');
  if(!title){document.getElementById('e-title').style.display='block';valid=false;}
  if(!type){document.getElementById('e-type').style.display='block';valid=false;}
  if(!date){document.getElementById('e-date').style.display='block';valid=false;}
  if(!hours||+hours<=0){document.getElementById('e-hours').style.display='block';valid=false;}
  if(!desc){document.getElementById('e-desc').style.display='block';valid=false;}
  if(!valid)return;

  const activities=DB.acts();
  const editId=Number(document.getElementById('edit-id').value||0);
  const user=currentUser();
  const record={title,type,org:document.getElementById('f-org').value.trim(),date,time:document.getElementById('f-time').value,endDate:document.getElementById('f-enddate').value,location:document.getElementById('f-location').value.trim(),hours:parseFloat(hours),desc,outcome:document.getElementById('f-outcome').value.trim()};

  if(editId){
    const index=activities.findIndex(item=>item.id===editId);
    if(index!==-1){
      activities[index]={...activities[index],...record,status:isAdmin()?activities[index].status:'pending',updatedAt:nowIso()};
      addAudit('activity.update',`Updated ${activities[index].title}`);
      toast('Activity updated','success');
    }
  }else{
    activities.push({...record,id:DB.nextId('activityId'),userId:user.id,status:isAdmin()?'approved':'pending',createdAt:nowIso(),verifiedBy:isAdmin()?user.id:null});
    addAudit('activity.create',`Created ${title}`);
    toast('Activity recorded','success');
  }

  DB.saveActs(activities);
  closeM('modal-act');
  renderDash();
  renderActivities();
  renderTimeline();
  renderAdmin();

  // Trigger sync after data changes
  setTimeout(() => syncToGoogleSheets(), 1000);
}

function viewAct(id){
  const activity=DB.acts().find(item=>item.id===id);
  if(!activity)return;
  const owner=DB.users().find(user=>user.id===activity.userId);
  document.getElementById('vw-title').textContent=activity.title;
  document.getElementById('vw-badges').innerHTML=`<span class="tp">${esc(activity.type)}</span><span class="tp">${esc(activity.status||'pending')}</span>`;
  document.getElementById('vw-body').innerHTML=`<div class="dg"><div><div class="df"><div class="dl">Description</div><div class="dv">${esc(activity.desc||'—')}</div></div>${activity.outcome?`<div class="df"><div class="dl">Outcome / Impact</div><div class="dv">${esc(activity.outcome)}</div></div>`:''}</div><div><div class="card" style="padding:16px 18px"><div class="df"><div class="dl">Date &amp; Time</div><div class="dv">${fmtDate(activity.date)}${activity.time?' at '+fmtTime(activity.time):''}${activity.endDate?' – '+fmtDate(activity.endDate):''}</div></div><div class="df"><div class="dl">Organisation</div><div class="dv">${esc(activity.org||'—')}</div></div><div class="df"><div class="dl">Location</div><div class="dv">${esc(activity.location||'—')}</div></div><div class="df"><div class="dl">Submitted By</div><div class="dv">${esc(owner?.name||'Unknown')}</div></div><div class="df"><div class="dl">Duration</div><div class="dv">${activity.hours} hours</div></div></div></div></div>`;
  document.getElementById('vw-footer').innerHTML=`<button class="btn btn-s" onclick="closeM('modal-view');openEdit(${activity.id})">Edit</button><button class="btn btn-s" onclick="closeM('modal-view')">Close</button>`;
  document.getElementById('modal-view').classList.remove('hidden');
}

function confirmDel(id){
  if(!requireLogin('delete an activity'))return;
  const activity=DB.acts().find(item=>item.id===id);
  if(!activity)return;
  document.getElementById('confirm-msg').innerHTML=`Are you sure you want to delete <strong>${esc(activity.title)}</strong>? This cannot be undone.`;
  document.getElementById('confirm-btn').onclick=()=>{
    DB.saveActs(DB.acts().filter(item=>item.id!==id));
    addAudit('activity.delete',`Deleted ${activity.title}`);
    closeM('modal-confirm');
    closeM('modal-view');
    toast('Activity deleted','success');
    renderDash();
    renderActivities();
    renderTimeline();
    renderAdmin();
  };
  document.getElementById('modal-confirm').classList.remove('hidden');
}

function renderReport(){
  let activities=[...visibleActivities()];
  const year=document.getElementById('rpt-year').value;
  const type=document.getElementById('rpt-type').value;
  const from=document.getElementById('rpt-from').value;
  const to=document.getElementById('rpt-to').value;
  if(year)activities=activities.filter(item=>item.date?.startsWith(year));
  if(type)activities=activities.filter(item=>item.type===type);
  if(from)activities=activities.filter(item=>item.date>=from);
  if(to)activities=activities.filter(item=>item.date<=to);
  activities.sort((a,b)=>`${b.date}${b.time||''}`.localeCompare(`${a.date}${a.time||''}`));
  const totalHours=activities.reduce((sum,item)=>sum+(+item.hours||0),0);
  const byType={};
  activities.forEach(item=>{byType[item.type]=(byType[item.type]||0)+1;});
  const period=year?year:(from||to)?`${from||'…'} to ${to||'…'}`:'All Time';
  document.getElementById('rpt-output').innerHTML=`<div class="card" style="padding:0;overflow:hidden"><div class="rh"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;opacity:.4;margin-bottom:8px">Engagement Activity Report</div><div style="font-size:22px;font-weight:600">Activity Summary Report</div><div style="font-size:13px;opacity:.6;margin-top:4px">Period: ${esc(period)} · Generated: ${new Date().toLocaleDateString('en-AU',{year:'numeric',month:'long',day:'numeric'})}</div><div style="display:flex;gap:28px;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.12)">${[['Total Activities',activities.length],['Total Hours',totalHours],['Activity Types',Object.keys(byType).length]].map(([label,value])=>`<div><div style="font-size:26px;font-weight:600">${value}</div><div style="font-size:11px;opacity:.5;text-transform:uppercase;letter-spacing:.05em">${label}</div></div>`).join('')}</div></div><div style="padding:22px">${activities.length===0?'<div class="es"><div class="ei">📄</div><div class="etitle">No activities match the selected filters</div></div>':`<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:26px"><thead><tr style="background:var(--g50)">${['Title','Type','Date & Time','Organisation','Status','Hours'].map(label=>`<th style="padding:9px 12px;text-align:left;border:1px solid var(--g200);font-weight:600;color:var(--g600)">${label}</th>`).join('')}</tr></thead><tbody>${activities.map((item,index)=>`<tr style="background:${index%2===0?'#fff':'var(--g50)'}"><td style="padding:9px 12px;border:1px solid var(--g200);font-weight:500;color:var(--g800)">${esc(item.title)}</td><td style="padding:9px 12px;border:1px solid var(--g200);color:var(--g600)">${esc(item.type)}</td><td style="padding:9px 12px;border:1px solid var(--g200);color:var(--g600);white-space:nowrap">${fmtDate(item.date)}${item.time?' '+fmtTime(item.time):''}</td><td style="padding:9px 12px;border:1px solid var(--g200);color:var(--g600)">${esc(item.org||'—')}</td><td style="padding:9px 12px;border:1px solid var(--g200);color:var(--g600)">${esc(item.status||'pending')}</td><td style="padding:9px 12px;border:1px solid var(--g200);text-align:center;font-weight:500;color:var(--g800)">${item.hours}</td></tr>`).join('')}<tr style="background:var(--g100)"><td colspan="5" style="padding:9px 12px;border:1px solid var(--g200);font-weight:600;text-align:right;color:var(--g700)">Total</td><td style="padding:9px 12px;border:1px solid var(--g200);text-align:center;font-weight:700;color:var(--navy)">${totalHours}</td></tr></tbody></table>`}</div></div>`;
}

function renderProfile(){
  const user=currentUser();
  if(!user)return;
  document.getElementById('profile-name').value=user.name||'';
  document.getElementById('profile-email').value=user.email||'';
  document.getElementById('profile-department').value=user.department||'';
  document.getElementById('profile-job').value=user.jobTitle||'';
  document.getElementById('profile-current-password').value='';
  document.getElementById('profile-new-password').value='';
  renderSyncSettings();
}

function saveProfile(){
  if(!requireLogin('update your profile'))return;
  const user=currentUser();
  const users=DB.users();
  const index=users.findIndex(item=>item.id===user.id);
  if(index===-1)return;
  const currentPassword=document.getElementById('profile-current-password').value;
  const newPassword=document.getElementById('profile-new-password').value;
  if(newPassword&&currentPassword!==users[index].password){
    toast('Current password is incorrect','error');
    return;
  }
  users[index]={...users[index],name:document.getElementById('profile-name').value.trim(),department:document.getElementById('profile-department').value.trim(),jobTitle:document.getElementById('profile-job').value.trim(),password:newPassword||users[index].password};
  DB.saveUsers(users);
  addAudit('profile.update',`Updated profile for ${users[index].email}`);
  toast('Profile updated','success');
  renderProfile();
  renderDash();
}

function showAdminTab(name){
  adminTab=name;
  document.querySelectorAll('[data-admin-tab]').forEach(button=>button.classList.toggle('active',button.dataset.adminTab===name));
  ['users','activities','audit'].forEach(key=>document.getElementById(`admin-${key}`).classList.toggle('hidden',key!==name));
}

function toggleUserRole(userId){
  const users=DB.users();
  const index=users.findIndex(user=>user.id===userId);
  if(index===-1)return;
  users[index].role=users[index].role==='admin'?'staff':'admin';
  DB.saveUsers(users);
  addAudit('user.role',`Changed ${users[index].email} to ${users[index].role}`);
  updateAuthUI();
  renderAdmin();
}

function toggleUserActive(userId){
  const users=DB.users();
  const index=users.findIndex(user=>user.id===userId);
  if(index===-1)return;
  users[index].active=!users[index].active;
  DB.saveUsers(users);
  addAudit('user.active',`${users[index].active?'Activated':'Deactivated'} ${users[index].email}`);
  renderAdmin();
}

function setActivityStatus(id,status){
  const activities=DB.acts();
  const index=activities.findIndex(item=>item.id===id);
  if(index===-1)return;
  activities[index].status=status;
  activities[index].verifiedBy=currentUser()?.id||null;
  activities[index].verifiedAt=nowIso();
  DB.saveActs(activities);
  addAudit('activity.review',`${status} ${activities[index].title}`);
  renderDash();
  renderActivities();
  renderAdmin();

  // Trigger sync after status change
  setTimeout(() => syncToGoogleSheets(), 1000);
}

function renderAdminUsers(){
  const users=DB.users();
  document.getElementById('admin-users').innerHTML=`<div class="card"><div style="font-size:14px;font-weight:600;margin-bottom:14px">User Management</div><div class="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${users.map(user=>`<tr><td class="tdt">${esc(user.name)}</td><td>${esc(user.email)}</td><td>${esc(user.role)}</td><td>${user.active?'Active':'Inactive'}</td><td><div class="ac"><button class="btn btn-g btn-sm" onclick="toggleUserRole(${user.id})">${user.role==='admin'?'Make Staff':'Make Admin'}</button><button class="btn btn-g btn-sm" onclick="toggleUserActive(${user.id})">${user.active?'Deactivate':'Activate'}</button></div></td></tr>`).join('')}</tbody></table></div></div>`;
}

function renderAdminActivities(){
  const query=(document.getElementById('admin-activity-search')?.value||'').toLowerCase();
  const activities=DB.acts().filter(activity=>{if(!query)return true;const owner=DB.users().find(user=>user.id===activity.userId);return [activity.title,activity.type,activity.org,owner?.name,owner?.email].join(' ').toLowerCase().includes(query);});
  document.getElementById('admin-activities').innerHTML=`<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><div style="font-size:14px;font-weight:600">All Activities</div><input type="text" class="fi" id="admin-activity-search" placeholder="Search activities" style="max-width:260px" value="${esc(query)}" oninput="renderAdminActivities()"></div><div class="tw"><table><thead><tr><th>Title</th><th>Owner</th><th>Type</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>${activities.map(activity=>{const owner=DB.users().find(user=>user.id===activity.userId);return `<tr><td class="tdt">${esc(activity.title)}</td><td>${esc(owner?.name||'Unknown')}</td><td>${esc(activity.type)}</td><td>${fmtDate(activity.date)}</td><td>${esc(activity.status||'pending')}</td><td><div class="ac"><button class="btn btn-g btn-sm" onclick="setActivityStatus(${activity.id},'approved')">Verify</button><button class="btn btn-d btn-sm" onclick="setActivityStatus(${activity.id},'rejected')">Reject</button></div></td></tr>`;}).join('')}</tbody></table></div></div>`;
}

function renderAuditLog(){
  const logs=DB.audit();
  document.getElementById('admin-audit').innerHTML=`<div class="card"><div style="font-size:14px;font-weight:600;margin-bottom:14px">Audit Log</div><div class="tw"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead><tbody>${logs.map(log=>`<tr><td>${fmtDateTime(log.at)}</td><td>${esc(log.actor)}</td><td>${esc(log.action)}</td><td>${esc(log.details||'—')}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function renderSyncSettings(){
  const activityTypes = [...new Set(DB.acts().map(a => a.type))];
  const statuses = ['pending', 'approved', 'rejected'];
  const savedUrl = DB.get('googleScriptUrl') || '';

  document.getElementById('profile-sync-settings').innerHTML=`<div class=\"card\" style=\"max-width:720px\">
    <div style=\"font-size:14px;font-weight:600;margin-bottom:20px;border-bottom:1px solid var(--g200);padding-bottom:14px\">☁️ Google Sheets Sync Configuration</div>
    
    <div style="margin-bottom:20px;padding:16px;background:var(--g50);border-radius:8px;border:1px solid var(--g200)">
      <label style="display:block;margin-bottom:8px;font-weight:500">📋 Your Google Apps Script URL</label>
      <p style="font-size:12px;color:var(--g500);margin-bottom:10px">Enter your personal Google Apps Script deployment URL. This allows you to sync data to your own Google Sheets.</p>
      <input type="text" id="google-script-url" value="${esc(savedUrl)}" placeholder="https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec" style="width:100%;padding:10px;border:1px solid var(--g200);border-radius:6px;font-size:12px;margin-bottom:10px;font-family:monospace" />
      <button class="btn btn-g" style="margin-right:5px" onclick="saveGoogleScriptUrl()">💾 Save URL</button>
      <button class="btn btn-s" onclick="testCustomSyncConnection()">🔗 Test Connection</button>
      ${savedUrl ? `<span style="font-size:12px;color:var(--g500);margin-left:10px">✓ URL saved</span>` : '<span style="font-size:12px;color:var(--red);margin-left:10px">⚠ No URL configured</span>'}
    </div>

    <div style="margin-bottom:20px">
      <label style="display:block;margin-bottom:8px;font-weight:500">⚙️ Sync Options</label>
      <div style="margin-bottom:12px">
        <label><input type="checkbox" id="auto-sync-enabled" ${SYNC_CONFIG.autoSyncEnabled ? 'checked' : ''} onchange="toggleAutoSync(this.checked)"> Enable automatic sync</label>
        <span style="font-size:12px;color:var(--g500)">Every ${SYNC_CONFIG.syncInterval/1000}s when online</span>
      </div>
    </div>

    <div style="margin-bottom:20px">
      <label style="display:block;margin-bottom:8px;font-weight:500">Exclude Activity Types from Sync</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${activityTypes.map(type => `<label style="display:flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid var(--g200);border-radius:6px;font-size:12px">
          <input type="checkbox" value="${esc(type)}" ${SYNC_CONFIG.excludeTypes.includes(type) ? 'checked' : ''} onchange="toggleExcludeType('${esc(type)}', this.checked)">
          ${esc(type)}
        </label>`).join('')}
      </div>
    </div>

    <div style="margin-bottom:20px">
      <label style="display:block;margin-bottom:8px;font-weight:500">Exclude Statuses from Sync</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${statuses.map(status => `<label style="display:flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid var(--g200);border-radius:6px;font-size:12px">
          <input type="checkbox" value="${status}" ${SYNC_CONFIG.excludeStatuses.includes(status) ? 'checked' : ''} onchange="toggleExcludeStatus('${status}', this.checked)">
          ${status}
        </label>`).join('')}
      </div>
    </div>

    <div style="margin-bottom:20px;padding:14px;background:var(--blue-muted);border-radius:8px">
      <label style="display:block;margin-bottom:8px;font-weight:500">📊 Sync Information</label>
      <div style="font-size:13px;color:var(--g600)">
        <div>Last sync: ${lastSyncTime ? fmtDateTime(lastSyncTime) : 'Never'}</div>
        <div>Activities to sync: ${DB.acts().filter(a => !SYNC_CONFIG.excludeTypes.includes(a.type) && !SYNC_CONFIG.excludeStatuses.includes(a.status || 'pending')).length}</div>
        <div>Connection: ${navigator.onLine ? '🟢 Online' : '🔴 Offline'}</div>
      </div>
    </div>

    <div style="margin-bottom:20px">
      <label style="display:block;margin-bottom:8px;font-weight:500">🔄 Sync Actions</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-p" onclick="manualSyncToGoogleSheets()">⬆️ Upload to Google Sheets</button>
        <button class="btn btn-g" onclick="downloadFromGoogleSheets()">⬇️ Download from Google Sheets</button>
        <button class="btn btn-s" onclick="exportDataAsJSON()">💾 Export as JSON</button>
        <button class="btn btn-s" onclick="importDataFromJSON()">📥 Import from JSON</button>
      </div>
    </div>
  </div>`;
}

function toggleAutoSync(enabled){
  SYNC_CONFIG.autoSyncEnabled = enabled;
  DB.set('syncConfig', SYNC_CONFIG);
  if(enabled){
    startAutoSync();
    toast('Auto-sync enabled','success');
  }else{
    toast('Auto-sync disabled','success');
  }
}

function toggleExcludeType(type, exclude){
  if(exclude){
    if(!SYNC_CONFIG.excludeTypes.includes(type)){
      SYNC_CONFIG.excludeTypes.push(type);
    }
  }else{
    SYNC_CONFIG.excludeTypes = SYNC_CONFIG.excludeTypes.filter(t => t !== type);
  }
  DB.set('syncConfig', SYNC_CONFIG);
  renderSyncSettings();
  toast(`Type "${type}" ${exclude ? 'excluded' : 'included'} from sync`,'success');
}

function toggleExcludeStatus(status, exclude){
  if(exclude){
    if(!SYNC_CONFIG.excludeStatuses.includes(status)){
      SYNC_CONFIG.excludeStatuses.push(status);
    }
  }else{
    SYNC_CONFIG.excludeStatuses = SYNC_CONFIG.excludeStatuses.filter(s => s !== status);
  }
  DB.set('syncConfig', SYNC_CONFIG);
  renderSyncSettings();
  toast(`Status "${status}" ${exclude ? 'excluded' : 'included'} from sync`,'success');
}

function saveGoogleScriptUrl(){
  const url = document.getElementById('google-script-url').value.trim();
  if(!url){
    toast('Please enter a Google Apps Script URL','error');
    return;
  }
  if(!url.includes('script.google.com')){
    toast('Invalid URL format. Must be from script.google.com','error');
    return;
  }
  DB.set('googleScriptUrl', url);
  toast('✓ Google Apps Script URL saved','success');
  renderSyncSettings();
}

async function testCustomSyncConnection(){
  const SCRIPT_URL = DB.get('googleScriptUrl');
  if(!SCRIPT_URL){
    toast('No URL configured. Please enter your Google Apps Script URL first.','error');
    return;
  }
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({test: true, timestamp: nowIso()})
    });
    if(response.ok){
      toast('✅ Connection successful to your Google Apps Script!','success');
    }else{
      throw new Error(`HTTP ${response.status}`);
    }
  } catch(error) {
    toast('❌ Connection failed: ' + error.message,'error');
  }
}

// (removed small wrapper testSyncConnection) use testCustomSyncConnection() directly where needed

function renderAdmin(){
  if(!isAdmin())return;
  showAdminTab(adminTab);
  renderAdminUsers();
  renderAdminActivities();
  renderAuditLog();
}

document.querySelectorAll('.mo').forEach(overlay=>{
  overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.classList.add('hidden');});
});

function toggleMobileMenu(){
  const sidebar=document.getElementById('sidebar');
  const overlay=document.getElementById('mob-overlay');
  const btn=document.getElementById('mob-menu-btn');
  sidebar.classList.toggle('show');
  overlay.classList.toggle('show');
  btn.classList.toggle('active');
  // Close menu when clicking nav items on mobile
  if(window.innerWidth<=860){
    sidebar.querySelectorAll('.nav-item').forEach(item=>{
      item.addEventListener('click',()=>{
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
        btn.classList.remove('active');
      });
    });
  }
}

// Close mobile menu when clicking outside on mobile
document.addEventListener('click',(e)=>{
  if(window.innerWidth<=860){
    const sidebar=document.getElementById('sidebar');
    const btn=document.getElementById('mob-menu-btn');
    const overlay=document.getElementById('mob-overlay');
    if(!sidebar.contains(e.target)&&!btn.contains(e.target)&&!overlay.contains(e.target)){
      sidebar.classList.remove('show');
      overlay.classList.remove('show');
      btn.classList.remove('active');
    }
  }
});

async function syncToGoogleSheets(manual = false){
  // manual: when true, show explicit toasts for success/failure regardless of auto-sync state
  const SCRIPT_URL = DB.get('googleScriptUrl');
  if(!SCRIPT_URL) return;

  if (syncInProgress) return;

  // Only attempt when online
  if (!navigator.onLine) return;

  syncInProgress = true;
  try {
    const activitiesToSync = DB.acts().filter(activity => {
      return !SYNC_CONFIG.excludeTypes.includes(activity.type) &&
             !SYNC_CONFIG.excludeStatuses.includes(activity.status || 'pending');
    });

    if (activitiesToSync.length === 0) return;

    const syncData = {
      activities: activitiesToSync,
      lastSyncTime: lastSyncTime,
      clientId: 'ears-' + Date.now(),
      action: 'sync'
    };

    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(syncData)
    });

    if (response.ok) {
      lastSyncTime = nowIso();
      DB.set('lastSyncTime', lastSyncTime);
      if (manual || !SYNC_CONFIG.autoSyncEnabled) toast('Data synced to Google Sheets','success');
    } else {
      throw new Error(`Sync failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Sync error:', error);
    if (manual || !SYNC_CONFIG.autoSyncEnabled) toast('Sync failed','error');
  } finally {
    syncInProgress = false;
  }
}

// Manual sync function (for button clicks)
async function manualSyncToGoogleSheets(){
  await syncToGoogleSheets(true);
}

// Download data from Google Sheets
async function downloadFromGoogleSheets(){
  const SCRIPT_URL = DB.get('googleScriptUrl');
  if(!SCRIPT_URL){
    toast('No URL configured. Please enter your Google Apps Script URL first.','error');
    return;
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'download', timestamp: nowIso()})
    });

    if(!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    if(data.activities && Array.isArray(data.activities)){
      const currentActivities = DB.acts();
      const mergedActivities = [...currentActivities];

      data.activities.forEach(remoteActivity => {
        const existingIndex = mergedActivities.findIndex(a => a.id === remoteActivity.id);
        if(existingIndex >= 0){
          // Update existing activity
          mergedActivities[existingIndex] = {...mergedActivities[existingIndex], ...remoteActivity};
        } else {
          // Add new activity
          mergedActivities.push(remoteActivity);
        }
      });

      DB.saveActs(mergedActivities);
      lastSyncTime = nowIso();
      DB.set('lastSyncTime', lastSyncTime);
      toast(`✓ Downloaded ${data.activities.length} activities from Google Sheets!`,'success');
      renderDash();
      renderActivities();
      renderTimeline();
      renderAdmin();
    } else {
      throw new Error('Invalid data format from Google Sheets');
    }
  } catch(error) {
    toast('Download failed: ' + error.message,'error');
    console.error('Download error:', error);
  }
}

// Export data as JSON file
function exportDataAsJSON(){
  const activities = DB.acts();
  const users = DB.users();
  const exportData = {
    exportDate: nowIso(),
    activities: activities,
    users: users.map(u => ({...u, password: '***'})), // Don't export passwords
    stats: {
      totalActivities: activities.length,
      totalHours: activities.reduce((s, a) => s + (a.hours || 0), 0),
      totalUsers: users.length
    }
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `EARS_backup_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);

  toast('✓ Data exported successfully!','success');
}

// Import data from JSON file
function importDataFromJSON(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if(!file) return;
      
      const text = await file.text();
      const importData = JSON.parse(text);
      
      if(!importData.activities || !Array.isArray(importData.activities)){
        throw new Error('Invalid JSON format: missing activities array');
      }
      
      // Merge with existing data
      const currentActivities = DB.acts();
      const mergedActivities = [...currentActivities];
      
      importData.activities.forEach(importedActivity => {
        const existingIndex = mergedActivities.findIndex(a => a.id === importedActivity.id);
        if(existingIndex >= 0){
          // Ask if user wants to update
          if(confirm(`Activity \"${importedActivity.title}\" already exists. Overwrite it?`)){
            mergedActivities[existingIndex] = importedActivity;
          }
        } else {
          mergedActivities.push(importedActivity);
        }
      });
      
      DB.saveActs(mergedActivities);
      toast(`✓ Imported ${importData.activities.length} activities!`,'success');
      renderDash();
      renderActivities();
      renderTimeline();
      renderAdmin();
    } catch(error) {
      toast('Import failed: ' + error.message,'error');
      console.error('Import error:', error);
    }
  };
  input.click();
}

// Start automatic sync
function startAutoSync(){
  if (!SYNC_CONFIG.autoSyncEnabled) return;

  // Sync immediately on start
  setTimeout(() => syncToGoogleSheets(), 2000);

  // Set up periodic sync
  setInterval(() => {
    syncToGoogleSheets();
  }, SYNC_CONFIG.syncInterval);

  // Sync when coming back online
  window.addEventListener('online', () => {
    setTimeout(() => syncToGoogleSheets(), 1000);
  });
}

function boot(){
  seedData();
  updateAuthUI();

  // Load sync settings
  const savedConfig = DB.get('syncConfig');
  if(savedConfig){
    Object.assign(SYNC_CONFIG, savedConfig);
  }
  lastSyncTime = DB.get('lastSyncTime');

  // Start automatic sync
  startAutoSync();

  if(isLoggedIn()){
    showPage(isAdmin()?'admin':'dashboard');
  }else{
    showLoginGate();
  }
  
  // Register service worker for offline functionality
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js')
      .then(() => {})
      .catch(() => {});
  }
}

boot();
