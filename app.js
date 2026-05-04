/* ═══════════════════════════════════════════════
   NurseChart EMR — Shared JavaScript (app.js)
   ═══════════════════════════════════════════════ */
'use strict';

/* ═══════════════ BLANK RECORD FACTORY ═══════════════ */
function blankRecord(id) {
  return {
    _id:   id || ('pt_' + Date.now() + '_' + Math.floor(Math.random()*9999)),
    _savedAt: null,
    demo:    { name:'',dob:'',sex:'',blood:'',weight:'',height:'',mrn:'',room:'',doctor:'',admit:'',contact:'',status:'',diag:'',code:'',codeNotes:'' },
    allergies:    [],
    intolerances: [],
    complaints:   [],
    vitals:  { hr:'',bp:'',spo2:'',temp:'',rr:'',pain:'',time:'',note:'' },
    vLog:    [],
    htt: [
      {sys:'Neurological',        finding:'', status:''},
      {sys:'Cardiovascular',      finding:'', status:''},
      {sys:'Respiratory',         finding:'', status:''},
      {sys:'GI / Abdomen',        finding:'', status:''},
      {sys:'Genitourinary',       finding:'', status:''},
      {sys:'Integumentary / Skin',finding:'', status:''},
      {sys:'Musculoskeletal',     finding:'', status:''},
      {sys:'Pain',                finding:'', status:''},
    ],
    assessTime: '',
    assessNotes: '',
    meds:        [],
    ncp:         [],
    nurseNotes:  []
  };
}

/* ═══════════════ STATE ═══════════════ */
/* S = currently open record (one patient at a time) */
var S = blankRecord();

/* All saved patient records index stored in localStorage */
/* Key: 'nchart_patients'  Value: array of record objects */
var PATIENTS_KEY = 'nchart_patients';

/* ═══════════════ NAVIGATION ═══════════════ */
function nav(btn) {
  document.querySelectorAll('.s-btn[data-panel]').forEach(function(b) { b.classList.remove('on'); });
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('on'); });
  btn.classList.add('on');
  document.getElementById('panel-' + btn.dataset.panel).classList.add('on');
  syncMobNav(btn.dataset.panel);
  if (btn.dataset.panel === 'patients') renderPatientsList();
}

function navMob(btn) {
  var panel = btn.dataset.panel;
  document.querySelectorAll('.mob-btn').forEach(function(b) { b.classList.remove('on'); });
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('on'); });
  btn.classList.add('on');
  document.getElementById('panel-' + panel).classList.add('on');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.querySelectorAll('.s-btn[data-panel]').forEach(function(b) {
    b.classList.toggle('on', b.dataset.panel === panel);
  });
  if (panel === 'patients') renderPatientsList();
}

function syncMobNav(panel) {
  document.querySelectorAll('.mob-btn').forEach(function(b) {
    b.classList.toggle('on', b.dataset.panel === panel);
  });
}

function switchPanel(panelName) {
  document.querySelectorAll('.s-btn[data-panel]').forEach(function(b) {
    b.classList.toggle('on', b.dataset.panel === panelName);
  });
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('on'); });
  document.getElementById('panel-' + panelName).classList.add('on');
  syncMobNav(panelName);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════════ MULTI-PATIENT STORAGE ═══════════════ */
function getAllPatients() {
  try {
    var raw = localStorage.getItem(PATIENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function saveAllPatients(patients) {
  try { localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients)); } catch(e) {}
}

function getPatientById(id) {
  return getAllPatients().find(function(p) { return p._id === id; }) || null;
}

/* ═══════════════ SAVE / LOAD CURRENT RECORD ═══════════════ */
function collectAll() {
  ['name','dob','sex','blood','weight','height','mrn','room','doctor','admit','contact','status','diag','code','codeNotes'].forEach(function(k) {
    var el = document.getElementById('d_' + k);
    if (el) S.demo[k] = el.value;
  });
  ['hr','bp','spo2','temp','rr','pain'].forEach(function(k) {
    var el = document.getElementById('v_' + k);
    if (el) S.vitals[k] = el.value;
  });
  S.vitals.time  = gv('vTime');
  S.vitals.note  = gv('vNote');
  S.assessTime   = gv('assessTime');
  S.assessNotes  = gv('assessNotes');
  S.htt.forEach(function(r, i) {
    var f = document.getElementById('htt_f_' + i);
    var s = document.getElementById('htt_s_' + i);
    if (f) r.finding = f.value;
    if (s) r.status  = s.value;
  });
}

function saveAll() {
  /* 1. Pull all form values into S */
  collectAll();

  /* 2. Stamp timestamp */
  S._savedAt = new Date().toISOString();

  /* 3. Upsert into the patients array */
  var patients = getAllPatients();
  var idx = patients.findIndex(function(p) { return p._id === S._id; });
  if (idx >= 0) {
    patients[idx] = JSON.parse(JSON.stringify(S)); /* store a deep copy */
  } else {
    patients.unshift(JSON.parse(JSON.stringify(S)));
  }
  saveAllPatients(patients);

  /* 4. Remember which record is open */
  try { localStorage.setItem('nchart_last', S._id); } catch(e) {}

  /* 5. UI feedback */
  showSaved();
  toast('Record saved');
  renderPatientsBadge();

  /* 6. Refresh patients list if that panel is currently visible */
  var ptPanel = document.getElementById('panel-patients');
  if (ptPanel && ptPanel.classList.contains('on')) {
    renderPatientsList();
  }
}

function loadRecordIntoUI(record) {
  /* Deep-copy so edits don't mutate the store directly */
  S = JSON.parse(JSON.stringify(record));

  fillDemo(); fillVitals();
  renderTags(); updateAllergyCount();
  renderComplaints(); renderHTT(); renderVLog(); evalVitals();
  renderMar(); renderNcp(); renderNurseNotes();
  refreshTopbar();
}

function loadAll() {
  var lastId;
  try { lastId = localStorage.getItem('nchart_last'); } catch(e) {}

  var patients = getAllPatients();

  /* ── Migrate legacy single-record (nchart_v2) ── */
  try {
    var legacy = localStorage.getItem('nchart_v2');
    if (legacy) {
      var L = JSON.parse(legacy);
      if (L && L.demo) {
        var migrated      = blankRecord();
        migrated._id      = 'pt_legacy_' + Date.now();
        migrated._savedAt = new Date().toISOString();
        /* Copy known keys */
        ['demo','allergies','intolerances','complaints','vitals','vLog',
         'htt','assessTime','assessNotes','meds','ncp','nurseNotes'].forEach(function(k) {
          if (L[k] !== undefined) migrated[k] = L[k];
        });
        patients.unshift(migrated);
        saveAllPatients(patients);
        localStorage.removeItem('nchart_v2');
        if (!lastId) lastId = migrated._id;
      }
    }
  } catch(e) { console.warn('Legacy migration failed:', e); }

  /* ── No saved records at all — set up a clean blank record ── */
  if (patients.length === 0) {
    S = blankRecord();
    /* Push defaults into DOM so collectAll() picks them up on first save */
    S.demo.mrn   = 'MRN-' + Math.floor(Math.random() * 90000 + 10000);
    S.demo.admit = new Date().toISOString().split('T')[0];
    fillDemo();
    sv('vTime',      nowTime());
    sv('assessTime', nowTime());
    refreshTopbar();
    renderPatientsBadge();
    return;
  }

  /* ── Load last-opened or most recent ── */
  var toLoad = (lastId && patients.find(function(p) { return p._id === lastId; }))
               || patients[0];
  loadRecordIntoUI(toLoad);
  renderPatientsBadge();
}

function fillDemo() {
  ['name','dob','sex','blood','weight','height','mrn','room','doctor','admit','contact','status','diag','code','codeNotes'].forEach(function(k) {
    var el = document.getElementById('d_' + k);
    if (el && S.demo[k] !== undefined) el.value = S.demo[k];
  });
}

function fillVitals() {
  ['hr','bp','spo2','temp','rr','pain'].forEach(function(k) {
    var el = document.getElementById('v_' + k);
    if (el) el.value = S.vitals[k] || '';
  });
  sv('vTime',      S.vitals.time);
  sv('vNote',      S.vitals.note);
  sv('assessTime', S.assessTime);
  sv('assessNotes',S.assessNotes);
}

/* New Patient — clear the form with a brand-new blank record */
function newPatient() {
  if (!confirm('Start a new patient record? Unsaved changes to the current record will be lost.')) return;
  S = blankRecord();
  S.demo.mrn   = 'MRN-' + Math.floor(Math.random() * 90000 + 10000);
  S.demo.admit = new Date().toISOString().split('T')[0];
  /* Use loadRecordIntoUI so all panels are cleared cleanly */
  loadRecordIntoUI(S);
  /* Override time fields after load */
  sv('vTime',      nowTime());
  sv('assessTime', nowTime());
  switchPanel('dashboard');
  toast('New patient record started');
}

/* Clear / delete current record */
function clearRecord() {
  if (!confirm('Delete this patient record permanently? This cannot be undone.')) return;
  var patients = getAllPatients();
  patients = patients.filter(function(p) { return p._id !== S._id; });
  saveAllPatients(patients);
  try { localStorage.removeItem('nchart_last'); } catch(e) {}

  /* Load next record or start fresh */
  if (patients.length > 0) {
    loadRecordIntoUI(patients[0]);
    toast('Record deleted');
  } else {
    S = blankRecord();
    S.demo.mrn   = 'MRN-' + Math.floor(Math.random() * 90000 + 10000);
    S.demo.admit = new Date().toISOString().split('T')[0];
    loadRecordIntoUI(S);
    sv('vTime', nowTime());
    sv('assessTime', nowTime());
    toast('Record deleted');
  }
  renderPatientsBadge();
  switchPanel('dashboard');
}

/* ═══════════════ PATIENTS LIST PANEL ═══════════════ */
function renderPatientsBadge() {
  var n = getAllPatients().length;
  var badge    = document.getElementById('patientsBadge');
  var badgeMob = document.getElementById('patientsBadgeMob');
  [badge, badgeMob].forEach(function(b) {
    if (!b) return;
    b.textContent    = n;
    b.style.display  = n > 0 ? 'flex' : 'none';
  });
}

function renderPatientsList() {
  var el    = document.getElementById('ptList');
  var empty = document.getElementById('ptEmpty');
  var search = (document.getElementById('ptSearch') || {value:''}).value.toLowerCase().trim();
  if (!el) return;

  var patients = getAllPatients();

  /* Filter by search */
  if (search) {
    patients = patients.filter(function(p) {
      var name = (p.demo && p.demo.name) ? p.demo.name.toLowerCase() : '';
      var mrn  = (p.demo && p.demo.mrn)  ? p.demo.mrn.toLowerCase()  : '';
      var room = (p.demo && p.demo.room) ? p.demo.room.toLowerCase() : '';
      return name.includes(search) || mrn.includes(search) || room.includes(search);
    });
  }

  if (patients.length === 0) {
    el.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  var statusColors = {
    Admitted:'b-grn', Emergency:'b-red', Discharged:'b-gry',
    Observation:'b-blu', Outpatient:'b-blu'
  };

  el.innerHTML = patients.map(function(p) {
    var d       = p.demo || {};
    var name    = d.name  || 'Unnamed Patient';
    var mrn     = d.mrn   || '—';
    var room    = d.room  || '';
    var doc     = d.doctor|| '';
    var status  = d.status|| '';
    var diag    = d.diag  || '';
    var admit   = d.admit || '';
    var isActive = (p._id === S._id);

    /* Initials avatar */
    var ini = name.replace(',','').trim().split(/\s+/).filter(Boolean)
                  .map(function(w){ return w[0]; }).join('').substring(0,2).toUpperCase() || '?';

    /* Age */
    var ageStr = '';
    if (d.dob) {
      var age = Math.floor((Date.now() - new Date(d.dob)) / 31557600000);
      if (age >= 0 && age < 150) ageStr = age + ' yrs';
    }

    /* Saved timestamp */
    var savedStr = '';
    if (p._savedAt) {
      var dt = new Date(p._savedAt);
      savedStr = dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
               + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    }

    var meta = [mrn, room ? 'Rm ' + room : '', doc ? (doc.startsWith('Dr')?doc:'Dr. '+doc) : '', ageStr]
               .filter(Boolean).join(' · ');

    return '<div class="pt-card' + (isActive ? ' pt-card-active' : '') + '" onclick="openPatient(\'' + p._id + '\')">'
      + '<div class="pt-card-av">' + esc(ini) + '</div>'
      + '<div class="pt-card-body">'
        + '<div class="pt-card-name">' + esc(name)
          + (isActive ? '<span class="pt-active-chip">Editing</span>' : '')
        + '</div>'
        + (meta ? '<div class="pt-card-meta">' + esc(meta) + '</div>' : '')
        + (diag ? '<div class="pt-card-diag">' + esc(diag.substring(0,80)) + (diag.length>80?'…':'') + '</div>' : '')
        + (admit ? '<div class="pt-card-admit">Admitted: ' + esc(admit) + '</div>' : '')
      + '</div>'
      + '<div class="pt-card-right">'
        + (status ? '<span class="badge ' + (statusColors[status]||'b-blu') + '" style="font-size:10px;margin-bottom:6px">' + esc(status) + '</span>' : '')
        + (savedStr ? '<div class="pt-card-saved">' + esc(savedStr) + '</div>' : '')
        + '<button class="pt-del-btn" onclick="event.stopPropagation();deletePatient(\'' + p._id + '\')" title="Delete record">🗑</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function openPatient(id) {
  var record = getPatientById(id);
  if (!record) { toast('Record not found'); return; }
  /* Auto-save current unsaved changes first */
  collectAll();
  var patients = getAllPatients();
  var idx = patients.findIndex(function(p) { return p._id === S._id; });
  if (idx >= 0) { patients[idx] = S; saveAllPatients(patients); }

  loadRecordIntoUI(record);
  try { localStorage.setItem('nchart_last', id); } catch(e) {}
  switchPanel('dashboard');
  toast('Loaded: ' + (record.demo.name || 'Unnamed Patient'));
}

function deletePatient(id) {
  var record = getPatientById(id);
  var name = (record && record.demo && record.demo.name) ? record.demo.name : 'this patient';
  if (!confirm('Delete record for ' + name + '? This cannot be undone.')) return;

  var patients = getAllPatients().filter(function(p) { return p._id !== id; });
  saveAllPatients(patients);

  /* If we deleted the currently open record, load next or start fresh */
  if (id === S._id) {
    if (patients.length > 0) {
      loadRecordIntoUI(patients[0]);
    } else {
      S = blankRecord();
      S.demo.mrn   = 'MRN-' + Math.floor(Math.random() * 90000 + 10000);
      S.demo.admit = new Date().toISOString().split('T')[0];
      loadRecordIntoUI(S);
    }
  }

  renderPatientsBadge();
  renderPatientsList();
  toast('Record deleted');
}

/* ═══════════════ TOPBAR ═══════════════ */
function refreshTopbar() {
  var name = gv('d_name') || 'New Patient';
  document.getElementById('topName').textContent = name;
  var ini = name.replace(',','').trim().split(/\s+/).filter(Boolean)
                .map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase() || '?';
  document.getElementById('topAv').textContent = ini;

  var meta = [];
  var mrn    = gv('d_mrn'),    room   = gv('d_room'),
      doc    = gv('d_doctor'), dob    = gv('d_dob'),
      status = gv('d_status');
  if (mrn)  meta.push('MRN: ' + mrn);
  if (room) meta.push('Rm ' + room);
  if (doc)  meta.push(doc.startsWith('Dr') ? doc : 'Dr. ' + doc);
  if (dob) {
    var age = Math.floor((Date.now() - new Date(dob)) / 31557600000);
    if (age >= 0 && age < 150) meta.push(age + ' yrs');
  }
  document.getElementById('topMeta').textContent =
    meta.length ? meta.join(' · ') : 'Complete the Patient Dashboard to begin';

  var b = document.getElementById('statusBadge');
  if (status) {
    b.textContent  = status;
    b.className    = 'badge ' + ({Admitted:'b-grn', Emergency:'b-red', Discharged:'b-gry'}[status] || 'b-blu');
  } else {
    b.textContent  = 'New Record';
    b.className    = 'badge b-blu';
  }
}

function showSaved() {
  var el = document.getElementById('savedLbl');
  el.classList.add('show');
  clearTimeout(window._st);
  window._st = setTimeout(function() { el.classList.remove('show'); }, 2500);
}

/* ═══════════════ ALLERGIES ═══════════════ */
function addTag(type) {
  var id = type === 'a' ? 'allergyIn' : 'intoleranceIn';
  var v  = gv(id).trim();
  if (!v) return;
  (type === 'a' ? S.allergies : S.intolerances).push(v);
  sv(id, '');
  renderTags();
  updateAllergyCount();
}

function removeTag(type, i) {
  (type === 'a' ? S.allergies : S.intolerances).splice(i, 1);
  renderTags();
  updateAllergyCount();
}

function renderTags() {
  document.getElementById('allergyList').innerHTML = S.allergies.map(function(a, i) {
    return '<div class="atag">⚠ ' + esc(a) + '<button class="tag-rm" onclick="removeTag(\'a\',' + i + ')">×</button></div>';
  }).join('');
  document.getElementById('intoleranceList').innerHTML = S.intolerances.map(function(a, i) {
    return '<div class="itag">' + esc(a) + '<button class="tag-rm" onclick="removeTag(\'i\',' + i + ')">×</button></div>';
  }).join('');
}

function updateAllergyCount() {
  var n  = S.allergies.length;
  var el = document.getElementById('allergyCount');
  el.textContent = n + ' alert' + (n !== 1 ? 's' : '');
  el.className   = 'badge ' + (n > 0 ? 'b-red' : 'b-gry');
}

/* ═══════════════ COMPLAINTS ═══════════════ */
var priColor = { priority:'#c0392b', monitor:'#b35900', chronic:'#1a7a40', resolved:'#4a5568' };
var priBadge = { priority:'b-red',   monitor:'b-ora',   chronic:'b-grn',  resolved:'b-gry'  };

function addComplaint() {
  var text = gv('cIn').trim();
  if (!text) return;
  S.complaints.push({ text:text, pain:gv('cPain'), priority:gv('cPri') });
  sv('cIn',''); sv('cPain','');
  renderComplaints();
}

function removeComplaint(i) { S.complaints.splice(i, 1); renderComplaints(); }

function renderComplaints() {
  var el = document.getElementById('complaintList');
  if (!S.complaints.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--muted2);padding:8px 0">No complaints recorded yet.</div>';
    return;
  }
  el.innerHTML = S.complaints.map(function(c, i) {
    return '<div class="c-item"><div class="c-dot" style="background:' + priColor[c.priority||'priority'] + '"></div>'
      + '<div style="flex:1"><div class="c-text">' + esc(c.text) + '</div>'
      + '<div class="c-sub">' + (c.pain ? 'NRS ' + c.pain + '/10 &nbsp;·&nbsp; ' : '')
      + '<span class="badge ' + priBadge[c.priority||'priority'] + '" style="font-size:10px">' + cap(c.priority) + '</span></div></div>'
      + '<button class="rx" onclick="removeComplaint(' + i + ')">×</button></div>';
  }).join('');
}

/* ═══════════════ VITALS ═══════════════ */
function evalVitals() {
  var hr   = pf(gv('v_hr')),  spo2 = pf(gv('v_spo2')),
      temp = pf(gv('v_temp')),rr   = pf(gv('v_rr')),
      pain = pf(gv('v_pain')),bp   = gv('v_bp');

  setVS('vs_hr',   isNaN(hr)   ? null : hr   <  60 ? ['Bradycardia','b-red']  : hr   > 100 ? ['Tachycardia','b-red']  : ['Normal','b-grn']);
  setVS('vs_spo2', isNaN(spo2) ? null : spo2 >= 95 ? ['Normal','b-grn']       : spo2 >=  90 ? ['Low','b-ora']          : ['Critical','b-red']);
  setVS('vs_temp', isNaN(temp) ? null : temp <  36 ? ['Hypothermia','b-ora']  : temp > 38.5 ? ['High Fever','b-red']   : temp > 37.5 ? ['Fever','b-ora'] : ['Normal','b-grn']);
  setVS('vs_rr',   isNaN(rr)   ? null : rr   <  12 ? ['Bradypnea','b-ora']    : rr   >  20  ? ['Tachypnea','b-ora']    : ['Normal','b-grn']);
  setVS('vs_pain', isNaN(pain) ? null : pain <=  3 ? ['Mild','b-grn']         : pain <=   6 ? ['Moderate','b-ora']     : ['Severe','b-red']);

  var p = bp.split('/');
  if (p.length === 2) {
    var s = pf(p[0]), d = pf(p[1]);
    setVS('vs_bp', isNaN(s)||isNaN(d) ? null : s >= 180||d >= 120 ? ['Crisis','b-red'] : s >= 140||d >= 90 ? ['Elevated','b-ora'] : s < 90 ? ['Hypotension','b-ora'] : ['Normal','b-grn']);
  } else {
    setVS('vs_bp', null);
  }
}

function setVS(id, v) {
  document.getElementById(id).innerHTML = v
    ? '<span class="badge ' + v[1] + '" style="font-size:9px;padding:1px 7px">' + v[0] + '</span>'
    : '';
}

function logVitals() {
  var e = {
    time:  gv('vTime') || nowTime(),
    hr:    gv('v_hr'),  bp:   gv('v_bp'),
    spo2:  gv('v_spo2'),temp: gv('v_temp'),
    rr:    gv('v_rr'),  pain: gv('v_pain'),
    note:  gv('vNote')
  };
  S.vLog.unshift(e);
  renderVLog();
  toast('Vitals logged at ' + e.time);
}

function removeVLog(i) { S.vLog.splice(i, 1); renderVLog(); }

function renderVLog() {
  var w = document.getElementById('vlogWrap');
  var b = document.getElementById('vlogBody');
  if (!S.vLog.length) { w.style.display = 'none'; return; }
  w.style.display = 'block';
  b.innerHTML = S.vLog.map(function(e, i) {
    return '<tr>'
      + '<td class="mono" style="font-size:11px;white-space:nowrap">' + esc(e.time) + '</td>'
      + '<td>' + mv(e.hr,  'bpm') + '</td>'
      + '<td>' + mv(e.bp,  '')    + '</td>'
      + '<td>' + mv(e.spo2,'%')   + '</td>'
      + '<td>' + mv(e.temp,'°C')  + '</td>'
      + '<td>' + mv(e.rr,  '')    + '</td>'
      + '<td>' + mv(e.pain,'/10') + '</td>'
      + '<td style="font-size:11px;color:var(--muted)">' + esc(e.note || '—') + '</td>'
      + '<td><button class="rx" onclick="removeVLog(' + i + ')">×</button></td>'
      + '</tr>';
  }).join('');
}

function mv(v, u) {
  return v
    ? '<span class="mono" style="font-size:11px">' + esc(v) + u + '</span>'
    : '<span style="color:var(--muted2)">—</span>';
}

/* ═══════════════ HEAD-TO-TOE ═══════════════ */
function renderHTT() {
  document.getElementById('httRows').innerHTML = S.htt.map(function(r, i) {
    return '<div class="htt-row">'
      + '<div class="htt-sys">' + esc(r.sys) + '</div>'
      + '<textarea id="htt_f_' + i + '" placeholder="Findings for ' + r.sys.toLowerCase() + '..." oninput="S.htt[' + i + '].finding=this.value">' + esc(r.finding || '') + '</textarea>'
      + '<select id="htt_s_' + i + '" class="htt-sel" onchange="S.htt[' + i + '].status=this.value">'
        + '<option value="">— Status —</option>'
        + '<option' + (r.status === 'WNL'      ? ' selected' : '') + '>WNL</option>'
        + '<option' + (r.status === 'Abnormal'  ? ' selected' : '') + '>Abnormal</option>'
        + '<option' + (r.status === 'Monitor'   ? ' selected' : '') + '>Monitor</option>'
        + '<option' + (r.status === 'N/A'       ? ' selected' : '') + '>N/A</option>'
      + '</select>'
      + '</div>';
  }).join('');
}

/* ═══════════════ MAR ═══════════════ */
var freqMap = {
  OD:['08:00'], BID:['06:00','18:00'], TID:['06:00','14:00','22:00'],
  QID:['06:00','12:00','18:00','22:00'], q4h:['06:00','10:00','14:00','18:00','22:00','02:00'],
  q6h:['06:00','12:00','18:00','00:00'], q8h:['06:00','14:00','22:00'],
  STAT:['STAT'], HS:['22:00'], PRN:['PRN']
};
var marP = { mi:null, ti:null };

function autoTimes() {
  var f = gv('m_freq'), t = freqMap[f];
  sv('m_times', t ? t.join(', ') : '');
}

function addMed() {
  var name = gv('m_name').trim();
  if (!name) { toast('Enter a drug name'); return; }
  var freq  = gv('m_freq'), raw = gv('m_times').trim();
  var times = raw ? raw.split(',').map(function(t) { return t.trim(); }) : (freqMap[freq] || ['08:00']);
  S.meds.push({
    name:name, cat:gv('m_cat'), dose:gv('m_dose'),
    freq:freq, times:times, notes:gv('m_notes'),
    admin:times.map(function() { return null; })
  });
  ['m_name','m_cat','m_dose','m_times','m_notes'].forEach(function(id) { sv(id,''); });
  renderMar();
  toast('Medication order added');
}

function removeMed(i) {
  if (!confirm('Remove this medication order?')) return;
  S.meds.splice(i, 1);
  renderMar();
}

function openMarModal(mi, ti) {
  marP = { mi:mi, ti:ti };
  var m = S.meds[mi];
  document.getElementById('marModalDrug').textContent = m.name + ' — ' + m.dose + ' @ ' + m.times[ti];
  sv('mr_nurse',''); sv('mr_route', m.dose.split(' ').pop() || '');
  sv('mr_notes',''); sv('mr_time', nowTime());
  document.getElementById('marModal').classList.add('open');
}

function marAction(action) {
  if (marP.mi === null) return;
  S.meds[marP.mi].admin[marP.ti] = {
    action:action, nurse:gv('mr_nurse'),
    time:gv('mr_time'), route:gv('mr_route'), notes:gv('mr_notes')
  };
  closeMar();
  renderMar();
  toast(action === 'given' ? 'Administration confirmed ✓' : 'Medication held / refused');
}

function closeMar() { document.getElementById('marModal').classList.remove('open'); }

function renderMar() {
  var body  = document.getElementById('marBody');
  var tbl   = document.getElementById('marTbl');
  var empty = document.getElementById('marEmpty');
  document.getElementById('marDate').textContent = new Date().toLocaleDateString('en-US', {day:'numeric',month:'short',year:'numeric'});

  if (!S.meds.length) { tbl.style.display = 'none'; empty.style.display = 'block'; return; }
  tbl.style.display = ''; empty.style.display = 'none';

  body.innerHTML = S.meds.map(function(m, mi) {
    var cells = m.times.map(function(t, ti) {
      var a = m.admin[ti];
      if (!a) return '<button class="tb" onclick="openMarModal(' + mi + ',' + ti + ')">' + esc(t) + '</button>';
      return '<button class="tb ' + a.action + '" title="' + esc((a.nurse||'Unknown RN') + ' @ ' + a.time + (a.notes ? ' — ' + a.notes : '')) + '">'
        + (a.action === 'given' ? '✓ ' : '⊘ ') + esc(t) + '</button>';
    }).join('');
    var noteHtml = m.notes ? '<div style="font-size:10px;color:var(--muted);margin-top:3px">📋 ' + esc(m.notes) + '</div>' : '';
    return '<tr>'
      + '<td><div class="dn">' + esc(m.name) + '</div><div class="dc">' + esc(m.cat) + '</div>' + noteHtml + '</td>'
      + '<td><span class="dose-chip">' + esc(m.dose) + '</span></td>'
      + '<td>' + esc(m.freq) + '</td>'
      + '<td><div class="tw">' + cells + '</div></td>'
      + '<td><button class="rx" onclick="removeMed(' + mi + ')">×</button></td>'
      + '</tr>';
  }).join('');
}

/* ═══════════════ NCP ═══════════════ */
var templates = [
  {diag:'Decreased cardiac output',rf:'r/t altered heart rate, rhythm, or conduction',aeb:'AEB tachycardia/bradycardia, hypotension, chest pain, poor peripheral perfusion',status:'In progress',
   ivs:['Monitor vital signs and cardiac rhythm q1h or continuously','Administer prescribed antiarrhythmics, antihypertensives, or inotropes as ordered','Maintain bed rest; position in semi-Fowler\'s to reduce cardiac workload','Assess peripheral perfusion: pulses, cap refill, skin temperature q4h','Assist with 12-lead ECG; report rhythm changes to physician promptly'],
   outcomes:'HR 60–100 bpm; BP ≥90/60 mmHg; no dysrhythmias; improved peripheral perfusion within 4–8 hours'},
  {diag:'Impaired gas exchange',rf:'r/t ventilation-perfusion mismatch, alveolar hypoventilation',aeb:'AEB SpO₂ <95%, dyspnea, use of accessory muscles, abnormal breath sounds',status:'In progress',
   ivs:['Apply supplemental O₂ as ordered; titrate to SpO₂ ≥95%','Position patient in semi-Fowler\'s or high Fowler\'s to maximize lung expansion','Encourage deep breathing exercises and use of incentive spirometry q2h','Auscultate breath sounds q2–4h; report changes to physician','Monitor ABG results and report significant deviations'],
   outcomes:'SpO₂ ≥95%; RR 12–20 breaths/min; no accessory muscle use within 2–4 hours'},
  {diag:'Acute pain',rf:'r/t tissue ischemia, inflammation, injury, or post-surgical state',aeb:'AEB NRS ≥4, patient verbalization, guarding, diaphoresis, facial grimacing',status:'In progress',
   ivs:['Assess pain using NRS scale q1h and 30 min after each intervention','Administer analgesics as prescribed; document onset, duration, and effect','Position patient for comfort; support affected areas with pillows','Apply non-pharmacological measures: repositioning, relaxation, heat/cold therapy','Educate patient on pain reporting, analgesic schedule, and what to expect'],
   outcomes:'Patient reports NRS ≤3 within 1 hour of analgesic; able to rest and participate in care'},
  {diag:'Activity intolerance',rf:'r/t imbalance between O₂ supply and demand, deconditioning',aeb:'AEB dyspnea on exertion, fatigue, SpO₂ drop with activity, abnormal HR/BP response',status:'Ongoing',
   ivs:['Maintain bed rest with bedside commode during acute phase','Cluster nursing care to provide uninterrupted rest periods ≥90 minutes','Implement progressive mobility per physician order and patient tolerance','Monitor vital signs before, during, and after all activity','Educate on energy conservation and activity pacing techniques'],
   outcomes:'Tolerates light ADLs without dyspnea or SpO₂ drop; vital signs return to baseline within 3 min of rest'},
  {diag:'Risk for infection',rf:'r/t invasive devices, immunosuppression, or compromised skin integrity',aeb:'Risk diagnosis — no defining characteristics required',status:'Ongoing',
   ivs:['Maintain strict hand hygiene before and after all patient contact','Assess all invasive device sites q8h for signs of infection','Use aseptic technique for all invasive procedures and dressing changes','Monitor temperature, WBC trends, and culture results every shift','Administer antibiotics as ordered; monitor therapeutic effect and adverse reactions'],
   outcomes:'Patient remains afebrile; no local or systemic infection signs throughout hospitalization'},
  {diag:'Fluid volume excess',rf:'r/t compromised cardiac or renal regulatory mechanisms',aeb:'AEB bilateral edema, weight gain >0.5 kg/day, crackles, elevated BP',status:'In progress',
   ivs:['Strictly monitor and document I&O every shift; report imbalance','Weigh patient daily at same time; report gain >1 kg/day','Administer diuretics as ordered; monitor urine output and electrolytes','Restrict fluids and sodium per physician orders; educate patient','Auscultate lung sounds q4h; elevate HOB and legs appropriately'],
   outcomes:'Weight stable or decreasing; edema resolving; balanced I&O; lung bases clear within 24–48 hours'},
  {diag:'Deficient knowledge',rf:'r/t new diagnosis, unfamiliar treatment regimen, or health literacy barriers',aeb:'AEB patient questions, incorrect self-care demonstration, or non-adherence',status:'Ongoing',
   ivs:['Assess literacy level, language preference, and readiness to learn','Teach disease process, medications, diet, and activity in plain language','Use teach-back after each teaching session to confirm understanding','Provide written instructions in preferred language; reinforce verbally','Document all teaching, patient response, and remaining learning needs each shift'],
   outcomes:'Patient correctly describes disease process, medications, and self-care; demonstrates skills before discharge'},
];

function openTplModal() {
  document.getElementById('ncpModal').classList.add('open');
  document.getElementById('tplList').innerHTML = templates.map(function(t, i) {
    return '<button class="tpl-btn" onclick="applyTpl(' + i + ')">'
      + '<strong>' + esc(t.diag) + '</strong><span>' + esc(t.rf) + '</span></button>';
  }).join('');
}

function closeNcpModal() { document.getElementById('ncpModal').classList.remove('open'); }

function applyTpl(i) {
  var t = templates[i];
  S.ncp.push({ diag:t.diag, rf:t.rf, aeb:t.aeb, status:t.status, ivs:t.ivs.slice(), outcomes:t.outcomes });
  renderNcp();
  closeNcpModal();
  toast('Nursing diagnosis added');
}

function addNcpBlank() {
  S.ncp.push({ diag:'New Nursing Diagnosis', rf:'r/t ', aeb:'AEB ', status:'In progress', ivs:[''], outcomes:'' });
  renderNcp();
}

function removeNcp(i) {
  if (!confirm('Remove this nursing diagnosis?')) return;
  S.ncp.splice(i, 1);
  renderNcp();
}

function toggleNcp(i) {
  var b = document.getElementById('nb_' + i);
  var c = document.getElementById('nc_' + i);
  b.classList.toggle('open');
  c.classList.toggle('open');
}

function addIv(ni) { S.ncp[ni].ivs.push(''); renderNcp(); }
function removeIv(ni, ii) { S.ncp[ni].ivs.splice(ii, 1); renderNcp(); }

function renderNcp() {
  var el    = document.getElementById('ncpList');
  var empty = document.getElementById('ncpEmpty');
  if (!S.ncp.length) { el.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  var sb = {'In progress':'b-ora','Ongoing':'b-blu','Partially met':'b-grn','Met':'b-grn','Unmet':'b-red'};
  el.innerHTML = S.ncp.map(function(n, ni) {
    var ivHtml = n.ivs.map(function(iv, ii) {
      return '<div class="iv-row">'
        + '<textarea oninput="S.ncp[' + ni + '].ivs[' + ii + ']=this.value" placeholder="Nursing intervention...">' + esc(iv) + '</textarea>'
        + '<button class="rx" onclick="removeIv(' + ni + ',' + ii + ')">×</button>'
        + '</div>';
    }).join('');
    var opts = ['In progress','Ongoing','Partially met','Met','Unmet'].map(function(s) {
      return '<option' + (n.status === s ? ' selected' : '') + '>' + s + '</option>';
    }).join('');

    return '<div class="ncp-card">'
      + '<div class="ncp-hd" onclick="toggleNcp(' + ni + ')">'
        + '<div class="ncp-name">' + esc(n.diag) + '</div>'
        + '<span class="badge ' + (sb[n.status]||'b-gry') + '" style="font-size:10px">' + esc(n.status) + '</span>'
        + '<button class="rx" onclick="event.stopPropagation();removeNcp(' + ni + ')">×</button>'
        + '<span class="chevron" id="nc_' + ni + '">▾</span>'
      + '</div>'
      + '<div class="ncp-body" id="nb_' + ni + '">'
        + '<div>'
          + '<div class="ncp-stitle">Diagnosis Details</div>'
          + '<div class="f"><label>Nursing Diagnosis Label</label><input type="text" value="' + esc(n.diag) + '" oninput="S.ncp[' + ni + '].diag=this.value;this.closest(\'.ncp-card\').querySelector(\'.ncp-name\').textContent=this.value"></div>'
          + '<div class="f"><label>Related to (r/t)</label><input type="text" value="' + esc(n.rf) + '" oninput="S.ncp[' + ni + '].rf=this.value"></div>'
          + '<div class="f"><label>As evidenced by (AEB)</label><textarea oninput="S.ncp[' + ni + '].aeb=this.value">' + esc(n.aeb) + '</textarea></div>'
          + '<div class="f"><label>Expected Outcomes / Goals</label><textarea oninput="S.ncp[' + ni + '].outcomes=this.value">' + esc(n.outcomes) + '</textarea></div>'
          + '<div class="f"><label>Status</label><select onchange="S.ncp[' + ni + '].status=this.value;renderNcp()">' + opts + '</select></div>'
        + '</div>'
        + '<div>'
          + '<div class="ncp-stitle">Nursing Interventions</div>'
          + ivHtml
          + '<button class="add-btn" onclick="addIv(' + ni + ')">+ Add intervention</button>'
        + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

/* ═══════════════ NURSE'S NOTES (FDAR) ═══════════════ */
function addNurseNote() {
  var now  = new Date();
  var date = now.toISOString().split('T')[0];
  var time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  S.nurseNotes.unshift({
    id:    Date.now(),
    date:  date,
    time:  time,
    nurse: '',
    focus: '',
    data:  '',
    action:'',
    response:''
  });
  renderNurseNotes();
  toast('New FDAR note added');
}

function removeNurseNote(idx) {
  if (!confirm('Delete this nurse\'s note?')) return;
  S.nurseNotes.splice(idx, 1);
  renderNurseNotes();
}

function toggleNurseNote(idx) {
  var body    = document.getElementById('nn_body_' + idx);
  var chevron = document.getElementById('nn_chev_' + idx);
  body.classList.toggle('open');
  chevron.classList.toggle('open');
}

function renderNurseNotes() {
  var list  = document.getElementById('nnList');
  var empty = document.getElementById('nnEmpty');
  if (!S.nurseNotes.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = S.nurseNotes.map(function(n, idx) {
    var preview = n.focus ? esc(n.focus).substring(0, 60) + (n.focus.length > 60 ? '…' : '') : '<em style="color:var(--muted2)">No focus entered</em>';
    return '<div class="nn-entry">'
      /* ── Entry Header ── */
      + '<div class="nn-entry-hd" onclick="toggleNurseNote(' + idx + ')">'
        + '<div style="display:flex;flex-direction:column;gap:2px;flex:1">'
          + '<div class="nn-entry-title">' + preview + '</div>'
          + '<div style="font-size:10px;color:var(--muted)">'
            + esc(n.date || '—') + '&nbsp;&nbsp;' + esc(n.time || '—')
            + (n.nurse ? '&nbsp;&nbsp;·&nbsp;&nbsp;RN: ' + esc(n.nurse) : '')
          + '</div>'
        + '</div>'
        + '<button class="rx" onclick="event.stopPropagation();removeNurseNote(' + idx + ')">×</button>'
        + '<span class="chevron" id="nn_chev_' + idx + '">▾</span>'
      + '</div>'
      /* ── Entry Body ── */
      + '<div class="nn-entry-body" id="nn_body_' + idx + '">'
        /* Metadata row */
        + '<div class="nn-meta">'
          + '<div class="f" style="margin:0;display:flex;align-items:center;gap:6px">'
            + '<label style="white-space:nowrap;margin:0">Date</label>'
            + '<input type="date" value="' + esc(n.date) + '" onchange="S.nurseNotes[' + idx + '].date=this.value;renderNurseNotes()" style="width:130px">'
          + '</div>'
          + '<div class="f" style="margin:0;display:flex;align-items:center;gap:6px">'
            + '<label style="white-space:nowrap;margin:0">Time</label>'
            + '<input type="time" value="' + esc(n.time) + '" onchange="S.nurseNotes[' + idx + '].time=this.value;renderNurseNotes()" style="width:100px">'
          + '</div>'
          + '<div class="f" style="margin:0;flex:1;display:flex;align-items:center;gap:6px">'
            + '<label style="white-space:nowrap;margin:0">RN Name</label>'
            + '<input type="text" value="' + esc(n.nurse) + '" placeholder="Nurse\'s full name &amp; credentials" oninput="S.nurseNotes[' + idx + '].nurse=this.value" style="flex:1">'
          + '</div>'
        + '</div>'
        /* FDAR grid */
        + '<div class="nn-fdar-grid">'
          /* Focus */
          + '<div class="nn-fdar-box">'
            + '<div class="nn-fdar-label"><span class="fdar-pill pill-f">F</span>Focus</div>'
            + '<textarea placeholder="Identify the concern, problem, or nursing diagnosis being addressed…" oninput="S.nurseNotes[' + idx + '].focus=this.value">' + esc(n.focus) + '</textarea>'
          + '</div>'
          /* Data */
          + '<div class="nn-fdar-box">'
            + '<div class="nn-fdar-label"><span class="fdar-pill pill-d">D</span>Data</div>'
            + '<textarea placeholder="Objective and subjective data supporting the focus (vitals, patient statements, lab values, observations)…" oninput="S.nurseNotes[' + idx + '].data=this.value">' + esc(n.data) + '</textarea>'
          + '</div>'
          /* Action */
          + '<div class="nn-fdar-box">'
            + '<div class="nn-fdar-label"><span class="fdar-pill pill-a">A</span>Action</div>'
            + '<textarea placeholder="Nursing interventions performed or planned in response to the focus…" oninput="S.nurseNotes[' + idx + '].action=this.value">' + esc(n.action) + '</textarea>'
          + '</div>'
          /* Response */
          + '<div class="nn-fdar-box">'
            + '<div class="nn-fdar-label"><span class="fdar-pill pill-r">R</span>Response</div>'
            + '<textarea placeholder="Patient\'s response to the action; progress toward expected outcomes…" oninput="S.nurseNotes[' + idx + '].response=this.value">' + esc(n.response) + '</textarea>'
          + '</div>'
        + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

/* ═══════════════ UTILITIES ═══════════════ */
function gv(id)    { var el = document.getElementById(id); return el ? el.value : ''; }
function sv(id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; }
function esc(s)    { return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function cap(s)    { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function pf(s)     { return parseFloat(s); }
function nowTime() { var d = new Date(); return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0'); }
function toast(msg){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt = setTimeout(function() { t.classList.remove('show'); }, 2200);
}

/* ═══════════════ MODAL CLOSE ON BG CLICK ═══════════════ */
document.getElementById('marModal').addEventListener('click', function(e) { if (e.target === this) closeMar(); });
document.getElementById('ncpModal').addEventListener('click', function(e) { if (e.target === this) closeNcpModal(); });

/* ═══════════════ AUTO-SAVE ═══════════════ */
document.addEventListener('input', function() {
  clearTimeout(window._as);
  window._as = setTimeout(saveAll, 2000);
});

/* ═══════════════ INIT ═══════════════ */
(function() {
  /* Set time fields to now as a default; loadAll may override */
  sv('vTime',      nowTime());
  sv('assessTime', nowTime());

  document.getElementById('marDate').textContent =
    new Date().toLocaleDateString('en-US', {day:'numeric', month:'short', year:'numeric'});

  autoTimes();

  /* Render all dynamic panels with empty state first */
  renderHTT();
  renderComplaints();
  renderMar();
  renderNcp();
  renderNurseNotes();
  refreshTopbar();

  /* Load saved data — this will populate everything if records exist */
  loadAll();
})();
