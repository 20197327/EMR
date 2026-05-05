/* ═══════════════════════════════════════════════
   NurseChart EMR — app.js
   ═══════════════════════════════════════════════ */
'use strict';

/* ─────────────────────────────────────────────
   STORAGE KEY
───────────────────────────────────────────── */
var STORE_KEY = 'nchart_patients';

/* ─────────────────────────────────────────────
   CURRENT RECORD  (in-memory working copy)
───────────────────────────────────────────── */
var S = makeBlank();

function makeBlank() {
  return {
    _id:      'pt_' + Date.now() + '_' + Math.floor(Math.random() * 99999),
    _savedAt: null,
    demo: {
      name:'', dob:'', sex:'', blood:'', weight:'', height:'',
      mrn:'',  room:'', doctor:'', admit:'', contact:'',
      status:'', diag:'', code:'', codeNotes:''
    },
    allergies:    [],
    intolerances: [],
    complaints:   [],
    vitals: { hr:'', bp:'', spo2:'', temp:'', rr:'', pain:'', time:'', note:'' },
    vLog:         [],
    htt: [
      {sys:'Neurological',         finding:'', status:''},
      {sys:'Cardiovascular',       finding:'', status:''},
      {sys:'Respiratory',          finding:'', status:''},
      {sys:'GI / Abdomen',         finding:'', status:''},
      {sys:'Genitourinary',        finding:'', status:''},
      {sys:'Integumentary / Skin', finding:'', status:''},
      {sys:'Musculoskeletal',      finding:'', status:''},
      {sys:'Pain',                 finding:'', status:''},
    ],
    assessTime:  '',
    assessNotes: '',
    meds:        [],
    ncp:         [],
    nurseNotes:  []
  };
}

/* ─────────────────────────────────────────────
   PATIENT LIST  (localStorage array)
───────────────────────────────────────────── */
function dbLoad() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function dbSave(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) {
    alert('Storage error – unable to save. Your browser storage may be full.');
  }
}

function dbFind(id) {
  return dbLoad().find(function (p) { return p._id === id; }) || null;
}

function dbUpsert(record) {
  var list = dbLoad();
  var idx  = list.findIndex(function (p) { return p._id === record._id; });
  var copy = JSON.parse(JSON.stringify(record)); /* always store a deep copy */
  if (idx >= 0) { list[idx] = copy; } else { list.unshift(copy); }
  dbSave(list);
}

function dbRemove(id) {
  dbSave(dbLoad().filter(function (p) { return p._id !== id; }));
}

/* ─────────────────────────────────────────────
   DOM → S  (pull every form field into S)
───────────────────────────────────────────── */
function collectAll() {
  /* Demographics */
  ['name','dob','sex','blood','weight','height',
   'mrn','room','doctor','admit','contact',
   'status','diag','code','codeNotes'].forEach(function (k) {
    var el = document.getElementById('d_' + k);
    if (el) S.demo[k] = el.value;
  });
  /* Vitals */
  ['hr','bp','spo2','temp','rr','pain'].forEach(function (k) {
    var el = document.getElementById('v_' + k);
    if (el) S.vitals[k] = el.value;
  });
  S.vitals.time  = gv('vTime');
  S.vitals.note  = gv('vNote');
  S.assessTime   = gv('assessTime');
  S.assessNotes  = gv('assessNotes');
  /* HTT */
  S.htt.forEach(function (r, i) {
    var f = document.getElementById('htt_f_' + i);
    var st= document.getElementById('htt_s_' + i);
    if (f)  r.finding = f.value;
    if (st) r.status  = st.value;
  });
}

/* ─────────────────────────────────────────────
   S → DOM  (push S into every form field)
───────────────────────────────────────────── */
function fillAll() {
  /* Demographics */
  ['name','dob','sex','blood','weight','height',
   'mrn','room','doctor','admit','contact',
   'status','diag','code','codeNotes'].forEach(function (k) {
    var el = document.getElementById('d_' + k);
    if (el) el.value = S.demo[k] || '';
  });
  /* Vitals */
  ['hr','bp','spo2','temp','rr','pain'].forEach(function (k) {
    var el = document.getElementById('v_' + k);
    if (el) el.value = S.vitals[k] || '';
  });
  sv('vTime',       S.vitals.time  || nowTime());
  sv('vNote',       S.vitals.note);
  sv('assessTime',  S.assessTime   || nowTime());
  sv('assessNotes', S.assessNotes);
}

/* ─────────────────────────────────────────────
   SAVE CURRENT RECORD
───────────────────────────────────────────── */
function saveAll() {
  /* 1. Pull DOM → S */
  collectAll();

  /* 2. Timestamp */
  S._savedAt = new Date().toISOString();

  /* 3. Persist */
  dbUpsert(S);

  /* 4. Remember last-open */
  try { localStorage.setItem('nchart_last', S._id); } catch (e) {}

  /* 5. UI */
  showSaved();
  toast('Record saved ✓');
  updateBadge();

  /* 6. Refresh patients panel if visible */
  var pp = document.getElementById('panel-patients');
  if (pp && pp.classList.contains('on')) renderPatientsList();
}

/* ─────────────────────────────────────────────
   LOAD A RECORD INTO THE UI
───────────────────────────────────────────── */
function loadRecordIntoUI(record) {
  S = JSON.parse(JSON.stringify(record)); /* work on a deep copy */
  fillAll();
  renderTags();
  updateAllergyCount();
  renderComplaints();
  renderHTT();
  renderVLog();
  evalVitals();
  renderMar();
  renderNcp();
  renderNurseNotes();
  refreshTopbar();
}

/* ─────────────────────────────────────────────
   APP STARTUP
───────────────────────────────────────────── */
function appInit() {
  /* Migrate old single-record format if present */
  try {
    var old = localStorage.getItem('nchart_v2');
    if (old) {
      var L = JSON.parse(old);
      if (L && L.demo) {
        var m = makeBlank();
        ['demo','allergies','intolerances','complaints','vitals',
         'vLog','htt','assessTime','assessNotes','meds','ncp','nurseNotes']
          .forEach(function (k) { if (L[k] !== undefined) m[k] = L[k]; });
        m._savedAt = new Date().toISOString();
        dbUpsert(m);
        localStorage.removeItem('nchart_v2');
      }
    }
  } catch (e) {}

  var list   = dbLoad();
  var lastId = '';
  try { lastId = localStorage.getItem('nchart_last') || ''; } catch (e) {}

  if (list.length > 0) {
    var toLoad = list.find(function (p) { return p._id === lastId; }) || list[0];
    loadRecordIntoUI(toLoad);
  } else {
    /* Truly fresh — seed defaults */
    S.demo.mrn   = 'MRN-' + Math.floor(Math.random() * 90000 + 10000);
    S.demo.admit = new Date().toISOString().split('T')[0];
    fillAll();
    refreshTopbar();
  }

  updateBadge();
  renderHTT();
}

/* ─────────────────────────────────────────────
   NEW / DELETE PATIENT
───────────────────────────────────────────── */
function newPatient() {
  if (!confirm('Start a new patient record?\nUnsaved changes to the current record will be lost.')) return;
  S = makeBlank();
  S.demo.mrn   = 'MRN-' + Math.floor(Math.random() * 90000 + 10000);
  S.demo.admit = new Date().toISOString().split('T')[0];
  loadRecordIntoUI(S);
  sv('vTime',     nowTime());
  sv('assessTime',nowTime());
  switchPanel('dashboard');
  toast('New patient record started');
}

function clearRecord() {
  if (!confirm('Delete this patient record permanently?\nThis cannot be undone.')) return;
  dbRemove(S._id);
  try { localStorage.removeItem('nchart_last'); } catch (e) {}
  var remaining = dbLoad();
  if (remaining.length > 0) {
    loadRecordIntoUI(remaining[0]);
  } else {
    S = makeBlank();
    S.demo.mrn   = 'MRN-' + Math.floor(Math.random() * 90000 + 10000);
    S.demo.admit = new Date().toISOString().split('T')[0];
    loadRecordIntoUI(S);
    sv('vTime',     nowTime());
    sv('assessTime',nowTime());
  }
  updateBadge();
  renderPatientsList();
  switchPanel('dashboard');
  toast('Record deleted');
}

/* ─────────────────────────────────────────────
   PATIENTS LIST PANEL
───────────────────────────────────────────── */
function updateBadge() {
  var n = dbLoad().length;
  ['patientsBadge','patientsBadgeMob'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = n;
    el.style.display = n > 0 ? 'flex' : 'none';
  });
}

function renderPatientsList() {
  var listEl  = document.getElementById('ptList');
  var emptyEl = document.getElementById('ptEmpty');
  if (!listEl) return;

  var q    = ((document.getElementById('ptSearch') || {}).value || '').toLowerCase().trim();
  var list = dbLoad();

  if (q) {
    list = list.filter(function (p) {
      var d = p.demo || {};
      return [(d.name||''),(d.mrn||''),(d.room||'')].join(' ').toLowerCase().includes(q);
    });
  }

  if (list.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  var statusCls = {
    Admitted:'b-grn', Emergency:'b-red', Discharged:'b-gry',
    Observation:'b-blu', Outpatient:'b-blu'
  };

  listEl.innerHTML = list.map(function (p) {
    var d        = p.demo || {};
    var name     = d.name  || 'Unnamed Patient';
    var isActive = (p._id === S._id);

    /* Avatar initials */
    var ini = name.replace(',','').trim().split(/\s+/)
                  .filter(Boolean).map(function (w) { return w[0]; })
                  .join('').slice(0,2).toUpperCase() || '?';

    /* Age */
    var ageStr = '';
    if (d.dob) {
      var age = Math.floor((Date.now() - new Date(d.dob)) / 31557600000);
      if (age >= 0 && age < 150) ageStr = age + ' yrs';
    }

    /* Saved time */
    var savedStr = '';
    if (p._savedAt) {
      var dt = new Date(p._savedAt);
      savedStr = dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
               + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    }

    var metaParts = [d.mrn, d.room?'Rm '+d.room:'',
                     d.doctor?(d.doctor.startsWith('Dr')?d.doctor:'Dr. '+d.doctor):'',
                     ageStr].filter(Boolean);

    return '<div class="pt-card' + (isActive?' pt-card-active':'') + '" onclick="openPatient(\'' + p._id + '\')">'
      + '<div class="pt-card-av">' + esc(ini) + '</div>'
      + '<div class="pt-card-body">'
        + '<div class="pt-card-name">' + esc(name)
          + (isActive ? '<span class="pt-active-chip">Editing</span>' : '')
        + '</div>'
        + (metaParts.length ? '<div class="pt-card-meta">' + esc(metaParts.join(' · ')) + '</div>' : '')
        + (d.diag  ? '<div class="pt-card-diag">'  + esc(d.diag.slice(0,80))  + (d.diag.length>80?'…':'')  + '</div>' : '')
        + (d.admit ? '<div class="pt-card-admit">Admitted: ' + esc(d.admit) + '</div>' : '')
      + '</div>'
      + '<div class="pt-card-right">'
        + (d.status ? '<span class="badge '+(statusCls[d.status]||'b-blu')+'" style="font-size:10px;margin-bottom:6px">'+esc(d.status)+'</span>' : '')
        + (savedStr ? '<div class="pt-card-saved">'  + esc(savedStr) + '</div>' : '')
        + '<button class="pt-del-btn" onclick="event.stopPropagation();deletePatient(\''+p._id+'\')" title="Delete">🗑</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function openPatient(id) {
  /* Auto-save current before switching */
  collectAll();
  S._savedAt = S._savedAt || new Date().toISOString();
  dbUpsert(S);

  var record = dbFind(id);
  if (!record) { toast('Record not found'); return; }
  loadRecordIntoUI(record);
  try { localStorage.setItem('nchart_last', id); } catch (e) {}
  switchPanel('dashboard');
  toast('Loaded: ' + (record.demo.name || 'Unnamed Patient'));
  updateBadge();
}

function deletePatient(id) {
  var rec  = dbFind(id);
  var name = (rec && rec.demo && rec.demo.name) ? rec.demo.name : 'this patient';
  if (!confirm('Delete record for ' + name + '?\nThis cannot be undone.')) return;
  dbRemove(id);
  if (id === S._id) {
    var remaining = dbLoad();
    if (remaining.length > 0) { loadRecordIntoUI(remaining[0]); }
    else {
      S = makeBlank();
      S.demo.mrn   = 'MRN-' + Math.floor(Math.random() * 90000 + 10000);
      S.demo.admit = new Date().toISOString().split('T')[0];
      loadRecordIntoUI(S);
    }
  }
  updateBadge();
  renderPatientsList();
  toast('Record deleted');
}

/* ─────────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────────── */
function nav(btn) {
  document.querySelectorAll('.s-btn[data-panel]').forEach(function (b) { b.classList.remove('on'); });
  document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('on'); });
  btn.classList.add('on');
  document.getElementById('panel-' + btn.dataset.panel).classList.add('on');
  syncMobNav(btn.dataset.panel);
  if (btn.dataset.panel === 'patients') renderPatientsList();
}

function navMob(btn) {
  var panel = btn.dataset.panel;
  document.querySelectorAll('.mob-btn').forEach(function (b) { b.classList.remove('on'); });
  document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('on'); });
  btn.classList.add('on');
  document.getElementById('panel-' + panel).classList.add('on');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.querySelectorAll('.s-btn[data-panel]').forEach(function (b) {
    b.classList.toggle('on', b.dataset.panel === panel);
  });
  if (panel === 'patients') renderPatientsList();
}

function syncMobNav(panel) {
  document.querySelectorAll('.mob-btn').forEach(function (b) {
    b.classList.toggle('on', b.dataset.panel === panel);
  });
}

function switchPanel(name) {
  document.querySelectorAll('.s-btn[data-panel]').forEach(function (b) {
    b.classList.toggle('on', b.dataset.panel === name);
  });
  document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('on'); });
  document.getElementById('panel-' + name).classList.add('on');
  syncMobNav(name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'patients') renderPatientsList();
}

/* ─────────────────────────────────────────────
   TOPBAR
───────────────────────────────────────────── */
function refreshTopbar() {
  var name = S.demo.name || 'New Patient';
  document.getElementById('topName').textContent = name;
  var ini = name.replace(',','').trim().split(/\s+/).filter(Boolean)
                .map(function (w) { return w[0]; }).join('').slice(0,2).toUpperCase() || '?';
  document.getElementById('topAv').textContent = ini;

  var meta = [];
  if (S.demo.mrn)    meta.push('MRN: ' + S.demo.mrn);
  if (S.demo.room)   meta.push('Rm ' + S.demo.room);
  if (S.demo.doctor) meta.push(S.demo.doctor.startsWith('Dr') ? S.demo.doctor : 'Dr. ' + S.demo.doctor);
  if (S.demo.dob) {
    var age = Math.floor((Date.now() - new Date(S.demo.dob)) / 31557600000);
    if (age >= 0 && age < 150) meta.push(age + ' yrs');
  }
  document.getElementById('topMeta').textContent =
    meta.length ? meta.join(' · ') : 'Complete the Patient Dashboard to begin';

  var b = document.getElementById('statusBadge');
  if (b) {
    b.textContent = S.demo.status || 'New Record';
    b.className   = 'badge ' + ({Admitted:'b-grn',Emergency:'b-red',Discharged:'b-gry'}[S.demo.status] || 'b-blu');
  }
}

function showSaved() {
  var el = document.getElementById('savedLbl');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(window._st);
  window._st = setTimeout(function () { el.classList.remove('show'); }, 2500);
}

/* ─────────────────────────────────────────────
   ALLERGIES
───────────────────────────────────────────── */
function addTag(type) {
  var inputId = type === 'a' ? 'allergyIn' : 'intoleranceIn';
  var v = gv(inputId).trim();
  if (!v) return;
  (type === 'a' ? S.allergies : S.intolerances).push(v);
  sv(inputId, '');
  renderTags();
  updateAllergyCount();
}

function removeTag(type, i) {
  (type === 'a' ? S.allergies : S.intolerances).splice(i, 1);
  renderTags();
  updateAllergyCount();
}

function renderTags() {
  document.getElementById('allergyList').innerHTML =
    S.allergies.map(function (a, i) {
      return '<div class="atag">⚠ ' + esc(a) +
             '<button class="tag-rm" onclick="removeTag(\'a\',' + i + ')">×</button></div>';
    }).join('');
  document.getElementById('intoleranceList').innerHTML =
    S.intolerances.map(function (a, i) {
      return '<div class="itag">' + esc(a) +
             '<button class="tag-rm" onclick="removeTag(\'i\',' + i + ')">×</button></div>';
    }).join('');
}

function updateAllergyCount() {
  var n  = S.allergies.length;
  var el = document.getElementById('allergyCount');
  if (!el) return;
  el.textContent = n + ' alert' + (n !== 1 ? 's' : '');
  el.className   = 'badge ' + (n > 0 ? 'b-red' : 'b-gry');
}

/* ─────────────────────────────────────────────
   COMPLAINTS
───────────────────────────────────────────── */
var priColor = { priority:'#c0392b', monitor:'#b35900', chronic:'#1a7a40', resolved:'#4a5568' };
var priBadge = { priority:'b-red',   monitor:'b-ora',   chronic:'b-grn',   resolved:'b-gry'  };

function addComplaint() {
  var text = gv('cIn').trim();
  if (!text) return;
  S.complaints.push({ text: text, pain: gv('cPain'), priority: gv('cPri') });
  sv('cIn',''); sv('cPain','');
  renderComplaints();
}

function removeComplaint(i) { S.complaints.splice(i, 1); renderComplaints(); }

function renderComplaints() {
  var el = document.getElementById('complaintList');
  if (!el) return;
  if (!S.complaints.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--muted2);padding:8px 0">No complaints recorded yet.</div>';
    return;
  }
  el.innerHTML = S.complaints.map(function (c, i) {
    return '<div class="c-item">'
      + '<div class="c-dot" style="background:' + priColor[c.priority||'priority'] + '"></div>'
      + '<div style="flex:1"><div class="c-text">' + esc(c.text) + '</div>'
      + '<div class="c-sub">' + (c.pain ? 'NRS ' + c.pain + '/10 &nbsp;·&nbsp; ' : '')
      + '<span class="badge ' + priBadge[c.priority||'priority'] + '" style="font-size:10px">'
      + cap(c.priority) + '</span></div></div>'
      + '<button class="rx" onclick="removeComplaint(' + i + ')">×</button></div>';
  }).join('');
}

/* ─────────────────────────────────────────────
   VITALS
───────────────────────────────────────────── */
function evalVitals() {
  var hr   = pf(gv('v_hr')),  spo2 = pf(gv('v_spo2')),
      temp = pf(gv('v_temp')),rr   = pf(gv('v_rr')),
      pain = pf(gv('v_pain')),bp   = gv('v_bp');

  setVS('vs_hr',   isNaN(hr)   ? null : hr<60   ? ['Bradycardia','b-red'] : hr>100  ? ['Tachycardia','b-red']  : ['Normal','b-grn']);
  setVS('vs_spo2', isNaN(spo2) ? null : spo2>=95 ? ['Normal','b-grn']     : spo2>=90 ? ['Low','b-ora']          : ['Critical','b-red']);
  setVS('vs_temp', isNaN(temp) ? null : temp<36  ? ['Hypothermia','b-ora']: temp>38.5? ['High Fever','b-red']   : temp>37.5 ? ['Fever','b-ora'] : ['Normal','b-grn']);
  setVS('vs_rr',   isNaN(rr)   ? null : rr<12   ? ['Bradypnea','b-ora']  : rr>20    ? ['Tachypnea','b-ora']    : ['Normal','b-grn']);
  setVS('vs_pain', isNaN(pain) ? null : pain<=3  ? ['Mild','b-grn']       : pain<=6  ? ['Moderate','b-ora']     : ['Severe','b-red']);

  var p = bp.split('/');
  if (p.length === 2) {
    var s = pf(p[0]), d = pf(p[1]);
    setVS('vs_bp', (isNaN(s)||isNaN(d)) ? null :
      s>=180||d>=120 ? ['Crisis','b-red'] : s>=140||d>=90 ? ['Elevated','b-ora'] :
      s<90 ? ['Hypotension','b-ora'] : ['Normal','b-grn']);
  } else { setVS('vs_bp', null); }
}

function setVS(id, v) {
  var el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = v
    ? '<span class="badge '+v[1]+'" style="font-size:9px;padding:1px 7px">'+v[0]+'</span>'
    : '';
}

function logVitals() {
  var e = {
    time: gv('vTime') || nowTime(),
    hr:   gv('v_hr'),  bp:   gv('v_bp'),
    spo2: gv('v_spo2'),temp: gv('v_temp'),
    rr:   gv('v_rr'),  pain: gv('v_pain'),
    note: gv('vNote')
  };
  S.vLog.unshift(e);
  renderVLog();
  toast('Vitals logged at ' + e.time);
}

function removeVLog(i) { S.vLog.splice(i, 1); renderVLog(); }

function renderVLog() {
  var w = document.getElementById('vlogWrap');
  var b = document.getElementById('vlogBody');
  if (!w || !b) return;
  if (!S.vLog.length) { w.style.display = 'none'; return; }
  w.style.display = 'block';
  b.innerHTML = S.vLog.map(function (e, i) {
    return '<tr>'
      + '<td class="mono" style="font-size:11px;white-space:nowrap">'+esc(e.time)+'</td>'
      + '<td>'+mv(e.hr,'bpm')+'</td><td>'+mv(e.bp,'')+'</td>'
      + '<td>'+mv(e.spo2,'%')+'</td><td>'+mv(e.temp,'°C')+'</td>'
      + '<td>'+mv(e.rr,'')+'</td><td>'+mv(e.pain,'/10')+'</td>'
      + '<td style="font-size:11px;color:var(--muted)">'+esc(e.note||'—')+'</td>'
      + '<td><button class="rx" onclick="removeVLog('+i+')">×</button></td>'
      + '</tr>';
  }).join('');
}

function mv(v, u) {
  return v
    ? '<span class="mono" style="font-size:11px">'+esc(v)+u+'</span>'
    : '<span style="color:var(--muted2)">—</span>';
}

/* ─────────────────────────────────────────────
   HEAD-TO-TOE
───────────────────────────────────────────── */
function renderHTT() {
  var el = document.getElementById('httRows');
  if (!el) return;
  el.innerHTML = S.htt.map(function (r, i) {
    return '<div class="htt-row">'
      + '<div class="htt-sys">'+esc(r.sys)+'</div>'
      + '<textarea id="htt_f_'+i+'" placeholder="Findings for '+r.sys.toLowerCase()+'..." oninput="S.htt['+i+'].finding=this.value">'+esc(r.finding||'')+'</textarea>'
      + '<select id="htt_s_'+i+'" class="htt-sel" onchange="S.htt['+i+'].status=this.value">'
        + '<option value="">— Status —</option>'
        + ['WNL','Abnormal','Monitor','N/A'].map(function(o){
            return '<option'+(r.status===o?' selected':'')+'>'+o+'</option>';
          }).join('')
      + '</select>'
      + '</div>';
  }).join('');
}

/* ─────────────────────────────────────────────
   MAR
───────────────────────────────────────────── */
var freqMap = {
  OD:['08:00'], BID:['06:00','18:00'], TID:['06:00','14:00','22:00'],
  QID:['06:00','12:00','18:00','22:00'], q4h:['06:00','10:00','14:00','18:00','22:00','02:00'],
  q6h:['06:00','12:00','18:00','00:00'], q8h:['06:00','14:00','22:00'],
  STAT:['STAT'], HS:['22:00'], PRN:['PRN']
};
var marP = { mi: null, ti: null };

function autoTimes() {
  var f = gv('m_freq'), t = freqMap[f];
  sv('m_times', t ? t.join(', ') : '');
}

function addMed() {
  var name = gv('m_name').trim();
  if (!name) { toast('Enter a drug name'); return; }
  var freq  = gv('m_freq');
  var raw   = gv('m_times').trim();
  var times = raw ? raw.split(',').map(function(t){return t.trim();}) : (freqMap[freq]||['08:00']);
  S.meds.push({
    name: name, cat: gv('m_cat'), dose: gv('m_dose'),
    freq: freq,  times: times,    notes: gv('m_notes'),
    admin: times.map(function(){return null;})
  });
  ['m_name','m_cat','m_dose','m_times','m_notes'].forEach(function(id){sv(id,'');});
  renderMar();
  toast('Medication order added');
}

function removeMed(i) {
  if (!confirm('Remove this medication order?')) return;
  S.meds.splice(i,1); renderMar();
}

function openMarModal(mi, ti) {
  marP = { mi: mi, ti: ti };
  var m = S.meds[mi];
  document.getElementById('marModalDrug').textContent = m.name+' — '+m.dose+' @ '+m.times[ti];
  sv('mr_nurse',''); sv('mr_route', m.dose.split(' ').pop()||'');
  sv('mr_notes',''); sv('mr_time', nowTime());
  document.getElementById('marModal').classList.add('open');
}

function marAction(action) {
  if (marP.mi === null) return;
  S.meds[marP.mi].admin[marP.ti] = {
    action: action, nurse: gv('mr_nurse'),
    time:   gv('mr_time'), route: gv('mr_route'), notes: gv('mr_notes')
  };
  closeMar(); renderMar();
  toast(action==='given'?'Administration confirmed ✓':'Medication held / refused');
}

function closeMar() { document.getElementById('marModal').classList.remove('open'); }

function renderMar() {
  var body  = document.getElementById('marBody');
  var tbl   = document.getElementById('marTbl');
  var empty = document.getElementById('marEmpty');
  var dateEl= document.getElementById('marDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
  if (!body||!tbl||!empty) return;

  if (!S.meds.length) { tbl.style.display='none'; empty.style.display='block'; return; }
  tbl.style.display=''; empty.style.display='none';

  body.innerHTML = S.meds.map(function(m,mi){
    var cells = m.times.map(function(t,ti){
      var a = m.admin[ti];
      if (!a) return '<button class="tb" onclick="openMarModal('+mi+','+ti+')">'+esc(t)+'</button>';
      return '<button class="tb '+a.action+'" title="'+esc((a.nurse||'Unknown RN')+' @ '+a.time+(a.notes?' — '+a.notes:''))+'">'
            +(a.action==='given'?'✓ ':'⊘ ')+esc(t)+'</button>';
    }).join('');
    return '<tr>'
      +'<td><div class="dn">'+esc(m.name)+'</div><div class="dc">'+esc(m.cat)+'</div>'
      +(m.notes?'<div style="font-size:10px;color:var(--muted);margin-top:3px">📋 '+esc(m.notes)+'</div>':'')+'</td>'
      +'<td><span class="dose-chip">'+esc(m.dose)+'</span></td>'
      +'<td>'+esc(m.freq)+'</td>'
      +'<td><div class="tw">'+cells+'</div></td>'
      +'<td><button class="rx" onclick="removeMed('+mi+')">×</button></td>'
      +'</tr>';
  }).join('');
}

/* ─────────────────────────────────────────────
   NCP
───────────────────────────────────────────── */
var templates = [
  {diag:'Decreased cardiac output',rf:'r/t altered heart rate, rhythm, or conduction',aeb:'AEB tachycardia/bradycardia, hypotension, chest pain, poor peripheral perfusion',status:'In progress',ivs:['Monitor vital signs and cardiac rhythm q1h or continuously','Administer prescribed antiarrhythmics, antihypertensives, or inotropes as ordered','Maintain bed rest; position in semi-Fowler\'s to reduce cardiac workload','Assess peripheral perfusion: pulses, cap refill, skin temperature q4h','Assist with 12-lead ECG; report rhythm changes to physician promptly'],outcomes:'HR 60–100 bpm; BP ≥90/60 mmHg; no dysrhythmias; improved peripheral perfusion within 4–8 hours'},
  {diag:'Impaired gas exchange',rf:'r/t ventilation-perfusion mismatch, alveolar hypoventilation',aeb:'AEB SpO₂ <95%, dyspnea, use of accessory muscles, abnormal breath sounds',status:'In progress',ivs:['Apply supplemental O₂ as ordered; titrate to SpO₂ ≥95%','Position patient in semi-Fowler\'s or high Fowler\'s to maximize lung expansion','Encourage deep breathing exercises and use of incentive spirometry q2h','Auscultate breath sounds q2–4h; report changes to physician','Monitor ABG results and report significant deviations'],outcomes:'SpO₂ ≥95%; RR 12–20 breaths/min; no accessory muscle use within 2–4 hours'},
  {diag:'Acute pain',rf:'r/t tissue ischemia, inflammation, injury, or post-surgical state',aeb:'AEB NRS ≥4, patient verbalization, guarding, diaphoresis, facial grimacing',status:'In progress',ivs:['Assess pain using NRS scale q1h and 30 min after each intervention','Administer analgesics as prescribed; document onset, duration, and effect','Position patient for comfort; support affected areas with pillows','Apply non-pharmacological measures: repositioning, relaxation, heat/cold therapy','Educate patient on pain reporting, analgesic schedule, and what to expect'],outcomes:'Patient reports NRS ≤3 within 1 hour of analgesic; able to rest and participate in care'},
  {diag:'Activity intolerance',rf:'r/t imbalance between O₂ supply and demand, deconditioning',aeb:'AEB dyspnea on exertion, fatigue, SpO₂ drop with activity, abnormal HR/BP response',status:'Ongoing',ivs:['Maintain bed rest with bedside commode during acute phase','Cluster nursing care to provide uninterrupted rest periods ≥90 minutes','Implement progressive mobility per physician order and patient tolerance','Monitor vital signs before, during, and after all activity','Educate on energy conservation and activity pacing techniques'],outcomes:'Tolerates light ADLs without dyspnea or SpO₂ drop; vital signs return to baseline within 3 min of rest'},
  {diag:'Risk for infection',rf:'r/t invasive devices, immunosuppression, or compromised skin integrity',aeb:'Risk diagnosis — no defining characteristics required',status:'Ongoing',ivs:['Maintain strict hand hygiene before and after all patient contact','Assess all invasive device sites q8h for signs of infection','Use aseptic technique for all invasive procedures and dressing changes','Monitor temperature, WBC trends, and culture results every shift','Administer antibiotics as ordered; monitor therapeutic effect and adverse reactions'],outcomes:'Patient remains afebrile; no local or systemic infection signs throughout hospitalization'},
  {diag:'Fluid volume excess',rf:'r/t compromised cardiac or renal regulatory mechanisms',aeb:'AEB bilateral edema, weight gain >0.5 kg/day, crackles, elevated BP',status:'In progress',ivs:['Strictly monitor and document I&O every shift; report imbalance','Weigh patient daily at same time; report gain >1 kg/day','Administer diuretics as ordered; monitor urine output and electrolytes','Restrict fluids and sodium per physician orders; educate patient','Auscultate lung sounds q4h; elevate HOB and legs appropriately'],outcomes:'Weight stable or decreasing; edema resolving; balanced I&O; lung bases clear within 24–48 hours'},
  {diag:'Deficient knowledge',rf:'r/t new diagnosis, unfamiliar treatment regimen, or health literacy barriers',aeb:'AEB patient questions, incorrect self-care demonstration, or non-adherence',status:'Ongoing',ivs:['Assess literacy level, language preference, and readiness to learn','Teach disease process, medications, diet, and activity in plain language','Use teach-back after each teaching session to confirm understanding','Provide written instructions in preferred language; reinforce verbally','Document all teaching, patient response, and remaining learning needs each shift'],outcomes:'Patient correctly describes disease process, medications, and self-care; demonstrates skills before discharge'},
];

function openTplModal() { 
  document.getElementById('ncpModal').classList.add('open');
  document.getElementById('tplList').innerHTML = templates.map(function(t,i){
    return '<button class="tpl-btn" onclick="applyTpl('+i+')">'
      +'<strong>'+esc(t.diag)+'</strong><span>'+esc(t.rf)+'</span></button>';
  }).join('');
}
function closeNcpModal() { document.getElementById('ncpModal').classList.remove('open'); }
function applyTpl(i) {
  var t = templates[i];
  S.ncp.push({diag:t.diag,rf:t.rf,aeb:t.aeb,status:t.status,ivs:t.ivs.slice(),outcomes:t.outcomes});
  renderNcp(); closeNcpModal(); toast('Nursing diagnosis added');
}
function addNcpBlank() {
  S.ncp.push({diag:'New Nursing Diagnosis',rf:'r/t ',aeb:'AEB ',status:'In progress',ivs:[''],outcomes:''});
  renderNcp();
}
function removeNcp(i) {
  if (!confirm('Remove this nursing diagnosis?')) return;
  S.ncp.splice(i,1); renderNcp();
}
function toggleNcp(i) {
  document.getElementById('nb_'+i).classList.toggle('open');
  document.getElementById('nc_'+i).classList.toggle('open');
}
function addIv(ni)      { S.ncp[ni].ivs.push(''); renderNcp(); }
function removeIv(ni,ii){ S.ncp[ni].ivs.splice(ii,1); renderNcp(); }

function renderNcp() {
  var el    = document.getElementById('ncpList');
  var empty = document.getElementById('ncpEmpty');
  if (!el) return;
  if (!S.ncp.length) { el.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  var sb={'In progress':'b-ora','Ongoing':'b-blu','Partially met':'b-grn','Met':'b-grn','Unmet':'b-red'};
  el.innerHTML = S.ncp.map(function(n,ni){
    var ivHtml = n.ivs.map(function(iv,ii){
      return '<div class="iv-row">'
        +'<textarea oninput="S.ncp['+ni+'].ivs['+ii+']=this.value" placeholder="Nursing intervention...">'+esc(iv)+'</textarea>'
        +'<button class="rx" onclick="removeIv('+ni+','+ii+')">×</button></div>';
    }).join('');
    var opts=['In progress','Ongoing','Partially met','Met','Unmet'].map(function(s){
      return '<option'+(n.status===s?' selected':'')+'>'+s+'</option>';
    }).join('');
    return '<div class="ncp-card">'
      +'<div class="ncp-hd" onclick="toggleNcp('+ni+')">'
        +'<div class="ncp-name">'+esc(n.diag)+'</div>'
        +'<span class="badge '+(sb[n.status]||'b-gry')+'" style="font-size:10px">'+esc(n.status)+'</span>'
        +'<button class="rx" onclick="event.stopPropagation();removeNcp('+ni+')">×</button>'
        +'<span class="chevron" id="nc_'+ni+'">▾</span>'
      +'</div>'
      +'<div class="ncp-body" id="nb_'+ni+'">'
        +'<div>'
          +'<div class="ncp-stitle">Diagnosis Details</div>'
          +'<div class="f"><label>Nursing Diagnosis Label</label>'
            +'<input type="text" value="'+esc(n.diag)+'" oninput="S.ncp['+ni+'].diag=this.value;this.closest(\'.ncp-card\').querySelector(\'.ncp-name\').textContent=this.value"></div>'
          +'<div class="f"><label>Related to (r/t)</label>'
            +'<input type="text" value="'+esc(n.rf)+'" oninput="S.ncp['+ni+'].rf=this.value"></div>'
          +'<div class="f"><label>As evidenced by (AEB)</label>'
            +'<textarea oninput="S.ncp['+ni+'].aeb=this.value">'+esc(n.aeb)+'</textarea></div>'
          +'<div class="f"><label>Expected Outcomes / Goals</label>'
            +'<textarea oninput="S.ncp['+ni+'].outcomes=this.value">'+esc(n.outcomes)+'</textarea></div>'
          +'<div class="f"><label>Status</label>'
            +'<select onchange="S.ncp['+ni+'].status=this.value;renderNcp()">'+opts+'</select></div>'
        +'</div>'
        +'<div>'
          +'<div class="ncp-stitle">Nursing Interventions</div>'
          +ivHtml
          +'<button class="add-btn" onclick="addIv('+ni+')">+ Add intervention</button>'
        +'</div>'
      +'</div>'
      +'</div>';
  }).join('');
}

/* ─────────────────────────────────────────────
   NURSE'S NOTES  (FDAR)
───────────────────────────────────────────── */
function addNurseNote() {
  var now  = new Date();
  var date = now.toISOString().split('T')[0];
  var time = now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  S.nurseNotes.unshift({id:Date.now(),date:date,time:time,nurse:'',focus:'',data:'',action:'',response:''});
  renderNurseNotes();
  toast('New FDAR note added');
}

function removeNurseNote(idx) {
  if (!confirm('Delete this nurse\'s note?')) return;
  S.nurseNotes.splice(idx,1); renderNurseNotes();
}

function toggleNurseNote(idx) {
  document.getElementById('nn_body_'+idx).classList.toggle('open');
  document.getElementById('nn_chev_'+idx).classList.toggle('open');
}

function renderNurseNotes() {
  var list  = document.getElementById('nnList');
  var empty = document.getElementById('nnEmpty');
  if (!list) return;
  if (!S.nurseNotes.length) { list.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  list.innerHTML = S.nurseNotes.map(function(n,idx){
    var preview = n.focus
      ? esc(n.focus).substring(0,60)+(n.focus.length>60?'…':'')
      : '<em style="color:var(--muted2)">No focus entered</em>';
    return '<div class="nn-entry">'
      +'<div class="nn-entry-hd" onclick="toggleNurseNote('+idx+')">'
        +'<div style="display:flex;flex-direction:column;gap:2px;flex:1">'
          +'<div class="nn-entry-title">'+preview+'</div>'
          +'<div style="font-size:10px;color:var(--muted)">'+esc(n.date||'—')+'&nbsp;&nbsp;'+esc(n.time||'—')
            +(n.nurse?'&nbsp;&nbsp;·&nbsp;&nbsp;RN: '+esc(n.nurse):'')+'</div>'
        +'</div>'
        +'<button class="rx" onclick="event.stopPropagation();removeNurseNote('+idx+')">×</button>'
        +'<span class="chevron" id="nn_chev_'+idx+'">▾</span>'
      +'</div>'
      +'<div class="nn-entry-body" id="nn_body_'+idx+'">'
        +'<div class="nn-meta">'
          +'<div class="f" style="margin:0;display:flex;align-items:center;gap:6px"><label style="white-space:nowrap;margin:0">Date</label>'
            +'<input type="date" value="'+esc(n.date)+'" onchange="S.nurseNotes['+idx+'].date=this.value;renderNurseNotes()" style="width:130px"></div>'
          +'<div class="f" style="margin:0;display:flex;align-items:center;gap:6px"><label style="white-space:nowrap;margin:0">Time</label>'
            +'<input type="time" value="'+esc(n.time)+'" onchange="S.nurseNotes['+idx+'].time=this.value;renderNurseNotes()" style="width:100px"></div>'
          +'<div class="f" style="margin:0;flex:1;display:flex;align-items:center;gap:6px"><label style="white-space:nowrap;margin:0">RN Name</label>'
            +'<input type="text" value="'+esc(n.nurse)+'" placeholder="Nurse\'s full name &amp; credentials" oninput="S.nurseNotes['+idx+'].nurse=this.value" style="flex:1"></div>'
        +'</div>'
        +'<div class="nn-fdar-grid">'
          +'<div class="nn-fdar-box"><div class="nn-fdar-label"><span class="fdar-pill pill-f">F</span>Focus</div>'
            +'<textarea placeholder="Identify the concern, problem, or nursing diagnosis being addressed…" oninput="S.nurseNotes['+idx+'].focus=this.value">'+esc(n.focus)+'</textarea></div>'
          +'<div class="nn-fdar-box"><div class="nn-fdar-label"><span class="fdar-pill pill-d">D</span>Data</div>'
            +'<textarea placeholder="Objective and subjective data supporting the focus…" oninput="S.nurseNotes['+idx+'].data=this.value">'+esc(n.data)+'</textarea></div>'
          +'<div class="nn-fdar-box"><div class="nn-fdar-label"><span class="fdar-pill pill-a">A</span>Action</div>'
            +'<textarea placeholder="Nursing interventions performed or planned…" oninput="S.nurseNotes['+idx+'].action=this.value">'+esc(n.action)+'</textarea></div>'
          +'<div class="nn-fdar-box"><div class="nn-fdar-label"><span class="fdar-pill pill-r">R</span>Response</div>'
            +'<textarea placeholder="Patient\'s response to the action…" oninput="S.nurseNotes['+idx+'].response=this.value">'+esc(n.response)+'</textarea></div>'
        +'</div>'
      +'</div>'
      +'</div>';
  }).join('');
}

/* ─────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────── */
function gv(id)    { var el=document.getElementById(id); return el?el.value:''; }
function sv(id,v)  { var el=document.getElementById(id); if(el) el.value=v||''; }
function esc(s)    { return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function cap(s)    { return s?s.charAt(0).toUpperCase()+s.slice(1):''; }
function pf(s)     { return parseFloat(s); }
function nowTime() { var d=new Date(); return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'); }
function toast(msg){
  var t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(function(){t.classList.remove('show');},2400);
}

/* ─────────────────────────────────────────────
   MODAL CLOSE ON BACKGROUND CLICK
───────────────────────────────────────────── */
document.getElementById('marModal').addEventListener('click',function(e){if(e.target===this)closeMar();});
document.getElementById('ncpModal').addEventListener('click',function(e){if(e.target===this)closeNcpModal();});

/* ─────────────────────────────────────────────
   AUTO-SAVE  (2 s after last keystroke)
───────────────────────────────────────────── */
document.addEventListener('input', function() {
  clearTimeout(window._as);
  window._as = setTimeout(saveAll, 2000);
});

/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */
(function () {
  sv('vTime',     nowTime());
  sv('assessTime',nowTime());
  var md = document.getElementById('marDate');
  if (md) md.textContent = new Date().toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
  autoTimes();
  renderComplaints();
  renderMar();
  renderNcp();
  renderNurseNotes();
  appInit();   /* loads saved data, fills DOM */
  renderHTT(); /* re-render HTT after htt array is populated */
}());
