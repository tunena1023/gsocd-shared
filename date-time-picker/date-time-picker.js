(function () {
  'use strict';

  if (window.GSDateTimePicker) return;

  var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var state = {};

  function styleTag() {
    if (document.getElementById('gs-dtp-style')) return;
    var style = document.createElement('style');
    style.id = 'gs-dtp-style';
    style.textContent =
      '.gs-dtp-rel{position:relative}' +
      '.gs-dtp-trigger{width:100%;padding:8px 10px;border:1px solid var(--border,#E0D9CC);border-radius:3px;font-size:13px;font-family:inherit;background:var(--white,#fff);text-align:left;cursor:pointer;color:var(--black,#111)}' +
      '.gs-dtp-trigger:hover{border-color:var(--gold,#C9A84C)}' +
      '.gs-dtp-popover{display:none;position:fixed;margin-top:8px;background:var(--white,#fff);border:1px solid var(--border,#E0D9CC);border-radius:10px;padding:18px;box-shadow:0 6px 24px rgba(0,0,0,.18);z-index:9999;width:min(260px,calc(100vw - 40px))}' +
      '.gs-dtp-popover.open{display:block}' +
      '.gs-dtp-title{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gray,#6B6B6B);text-align:center;margin-bottom:14px}' +
      '.gs-dtp-clock-row{display:flex;justify-content:center;margin-bottom:14px}' +
      '.gs-dtp-clock-face{position:relative;width:190px;height:190px;border-radius:22px;background:var(--off,#F7F6F3);border:1px solid var(--border,#E0D9CC);flex-shrink:0;margin:0 auto}' +
      '.gs-dtp-num{position:absolute;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border-radius:50%;cursor:pointer;color:var(--black,#111)}' +
      '.gs-dtp-num:hover,.gs-dtp-num.selected{background:var(--gold,#C9A84C);color:var(--black,#111)}' +
      '.gs-dtp-num.minute-tick{font-size:10px;color:var(--gray,#6B6B6B);font-weight:500}' +
      '.gs-dtp-center{position:absolute;width:6px;height:6px;background:var(--gold-dk,#8C6F2A);border-radius:50%;top:50%;left:50%;transform:translate(-50%,-50%)}' +
      '.gs-dtp-bottom-row{display:flex;align-items:center;justify-content:center;gap:10px}' +
      '.gs-dtp-ampm{display:flex;flex-direction:row;gap:6px}' +
      '.gs-dtp-ampm button{padding:8px 14px;border:1px solid var(--border,#E0D9CC);background:var(--white,#fff);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;color:var(--black,#111);font-family:inherit}' +
      '.gs-dtp-ampm button.active{background:var(--gold,#C9A84C);color:var(--black,#111);border-color:var(--gold,#C9A84C)}' +
      '.gs-dtp-readout{font-family:"Cormorant Garamond",serif;font-size:24px;font-weight:600;color:var(--black,#111)}' +
      '.gs-dtp-readout .part{padding:2px 4px;border-radius:4px;cursor:pointer}' +
      '.gs-dtp-readout .part.active{background:rgba(201,168,76,.2);color:var(--gold-dk,#8C6F2A)}' +
      '.gs-dtp-cal-card{border-radius:22px;padding:4px}' +
      '.gs-dtp-cal-header{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:12px}' +
      '.gs-dtp-cal-nav{display:flex;align-items:center;gap:2px;background:var(--off,#F7F6F3);border-radius:20px;padding:3px}' +
      '.gs-dtp-cal-nav button{background:none;border:none;font-size:15px;color:var(--gold-dk,#8C6F2A);cursor:pointer;width:22px;height:22px;border-radius:50%}' +
      '.gs-dtp-cal-nav button:hover{background:rgba(201,168,76,.2)}' +
      '.gs-dtp-cal-month,.gs-dtp-cal-year{font-family:"Cormorant Garamond",serif;font-size:15px;font-weight:600;text-align:center;color:var(--black,#111)}' +
      '.gs-dtp-cal-month{min-width:78px}' +
      '.gs-dtp-cal-year{min-width:40px}' +
      '.gs-dtp-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}' +
      '.gs-dtp-cal-dow{font-size:9px;color:var(--gray,#6B6B6B);text-align:center;text-transform:uppercase;font-weight:700;padding-bottom:4px}' +
      '.gs-dtp-cal-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:12px;border-radius:8px;cursor:pointer;color:var(--black,#111)}' +
      '.gs-dtp-cal-day:hover{background:rgba(201,168,76,.18)}' +
      '.gs-dtp-cal-day.selected{background:var(--gold,#C9A84C);color:var(--black,#111);font-weight:700}' +
      '.gs-dtp-cal-day.muted{color:#C9C2B4;cursor:default}' +
      '.gs-dtp-cal-day.muted:hover{background:none}';
    document.head.appendChild(style);
  }

  function stateFor(fieldId) {
    if (!state[fieldId]) {
      var now = new Date();
      state[fieldId] = {
        calViewYear: now.getFullYear(), calViewMonth: now.getMonth(),
        calSelYear: null, calSelMonth: null, calSelDay: null,
        hour: 8, minute: 0, ampm: 'AM', clockStep: 'hour'
      };
    }
    return state[fieldId];
  }

  function parseISODate(iso) {
    if (!iso) return null;
    var parts = iso.split('-');
    if (parts.length !== 3) return null;
    return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) - 1, day: parseInt(parts[2], 10) };
  }

  function parseHHMM(hhmm) {
    if (!hhmm) return null;
    var parts = hhmm.split(':');
    if (parts.length !== 2) return null;
    var h24 = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var ampm = h24 >= 12 ? 'PM' : 'AM';
    var h12 = h24 % 12; if (h12 === 0) h12 = 12;
    return { hour: h12, minute: m, ampm: ampm };
  }

  function fmtDateDisplay(year, month, day) {
    return MONTH_NAMES[month].slice(0, 3) + ' ' + day + ', ' + year;
  }

  function fmtTimeDisplay(h24, m) {
    var isPM = h24 >= 12;
    var h12 = h24 % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + (isPM ? 'PM' : 'AM');
  }

  function el(id) { return document.getElementById(id); }

  function closeAllPopovers() {
    Array.prototype.forEach.call(document.querySelectorAll('.gs-dtp-popover.open'), function (pop) {
      pop.classList.remove('open');
    });
  }

  function positionPopover(fieldId, pop) {
    var trigger = el('gs-dtp-trigger-' + fieldId);
    if (!trigger) return;
    var r = trigger.getBoundingClientRect();
    pop.style.top = (r.bottom + 8) + 'px';
    pop.style.left = r.left + 'px';
    var popWidth = 260;
    var overflowRight = (r.left + popWidth) - window.innerWidth + 16;
    if (overflowRight > 0) pop.style.left = (r.left - overflowRight) + 'px';
  }

  function toggleCal(fieldId) {
    var pop = el('gs-dtp-calpop-' + fieldId);
    if (!pop) return;
    var wasOpen = pop.classList.contains('open');
    closeAllPopovers();
    if (!wasOpen) {
      positionPopover(fieldId, pop);
      pop.classList.add('open');
      renderCalGrid(fieldId);
    }
  }

  function toggleClock(fieldId) {
    var pop = el('gs-dtp-clockpop-' + fieldId);
    if (!pop) return;
    var wasOpen = pop.classList.contains('open');
    closeAllPopovers();
    if (!wasOpen) {
      positionPopover(fieldId, pop);
      pop.classList.add('open');
      var st = stateFor(fieldId);
      st.clockStep = 'hour';
      updateClockStepUI(fieldId);
      renderClockHourFace(fieldId);
    }
  }

  function renderCalGrid(fieldId) {
    var st = stateFor(fieldId);
    var monthLabel = el('gs-dtp-calmonth-' + fieldId);
    var yearLabel = el('gs-dtp-calyear-' + fieldId);
    if (monthLabel) monthLabel.textContent = MONTH_NAMES[st.calViewMonth];
    if (yearLabel) yearLabel.textContent = st.calViewYear;
    var grid = el('gs-dtp-calgrid-' + fieldId);
    if (!grid) return;
    grid.innerHTML = '';
    ['S','M','T','W','T','F','S'].forEach(function (d) {
      var dEl = document.createElement('div');
      dEl.className = 'gs-dtp-cal-dow';
      dEl.textContent = d;
      grid.appendChild(dEl);
    });
    var firstDay = new Date(st.calViewYear, st.calViewMonth, 1).getDay();
    var daysInMonth = new Date(st.calViewYear, st.calViewMonth + 1, 0).getDate();
    for (var i = 0; i < firstDay; i++) {
      var blank = document.createElement('div');
      blank.className = 'gs-dtp-cal-day muted';
      grid.appendChild(blank);
    }
    for (var d = 1; d <= daysInMonth; d++) {
      (function (day) {
        var dayEl = document.createElement('div');
        var isSel = st.calSelDay === day && st.calSelMonth === st.calViewMonth && st.calSelYear === st.calViewYear;
        dayEl.className = 'gs-dtp-cal-day' + (isSel ? ' selected' : '');
        dayEl.textContent = day;
        dayEl.onclick = function () { pickDay(fieldId, st.calViewYear, st.calViewMonth, day); };
        grid.appendChild(dayEl);
      })(d);
    }
  }

  function calPrevMonth(fieldId) { var st = stateFor(fieldId); st.calViewMonth--; if (st.calViewMonth < 0) { st.calViewMonth = 11; st.calViewYear--; } renderCalGrid(fieldId); }
  function calNextMonth(fieldId) { var st = stateFor(fieldId); st.calViewMonth++; if (st.calViewMonth > 11) { st.calViewMonth = 0; st.calViewYear++; } renderCalGrid(fieldId); }
  function calPrevYear(fieldId) { var st = stateFor(fieldId); st.calViewYear--; renderCalGrid(fieldId); }
  function calNextYear(fieldId) { var st = stateFor(fieldId); st.calViewYear++; renderCalGrid(fieldId); }

  function pickDay(fieldId, year, month, day) {
    var st = stateFor(fieldId);
    st.calSelYear = year; st.calSelMonth = month; st.calSelDay = day;
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var hidden = el(fieldId);
    if (hidden) hidden.value = dateStr;
    var trigger = el('gs-dtp-trigger-' + fieldId);
    if (trigger) trigger.textContent = fmtDateDisplay(year, month, day);
    renderCalGrid(fieldId);
    var pop = el('gs-dtp-calpop-' + fieldId);
    if (pop) pop.classList.remove('open');
    if (hidden) hidden.dispatchEvent(new Event('change', { bubbles: true }));
    document.dispatchEvent(new CustomEvent('gs-date-picked', { detail: { fieldId: fieldId, value: dateStr } }));
  }

  function clockPolarPos(idx, count, r) {
    var angle = (idx / count) * 2 * Math.PI - Math.PI / 2;
    return { x: 95 + r * Math.cos(angle) - 15, y: 95 + r * Math.sin(angle) - 15 };
  }

  function renderClockHourFace(fieldId) {
    var st = stateFor(fieldId);
    var face = el('gs-dtp-clockface-' + fieldId);
    if (!face) return;
    Array.prototype.forEach.call(face.querySelectorAll('.gs-dtp-num'), function (n) { n.remove(); });
    for (var h = 1; h <= 12; h++) {
      (function (hour) {
        var pos = clockPolarPos(hour % 12, 12, 74);
        var hEl = document.createElement('div');
        hEl.className = 'gs-dtp-num' + (hour === st.hour ? ' selected' : '');
        hEl.style.left = pos.x + 'px'; hEl.style.top = pos.y + 'px';
        hEl.textContent = hour;
        hEl.onclick = function () {
          st.hour = hour;
          var readout = el('gs-dtp-readouthour-' + fieldId);
          if (readout) readout.textContent = hour;
          st.clockStep = 'minute';
          updateClockStepUI(fieldId);
          renderClockMinuteFace(fieldId);
        };
        face.appendChild(hEl);
      })(h);
    }
  }

  function renderClockMinuteFace(fieldId) {
    var st = stateFor(fieldId);
    var face = el('gs-dtp-clockface-' + fieldId);
    if (!face) return;
    Array.prototype.forEach.call(face.querySelectorAll('.gs-dtp-num'), function (n) { n.remove(); });
    [0,5,10,15,20,25,30,35,40,45,50,55].forEach(function (m, i) {
      var pos = clockPolarPos(i, 12, 74);
      var mEl = document.createElement('div');
      mEl.className = 'gs-dtp-num minute-tick' + (m === st.minute ? ' selected' : '');
      mEl.style.left = pos.x + 'px'; mEl.style.top = pos.y + 'px';
      mEl.textContent = String(m).padStart(2, '0');
      mEl.onclick = function () { pickMinute(fieldId, m); };
      face.appendChild(mEl);
    });
  }

  function updateClockStepUI(fieldId) {
    var st = stateFor(fieldId);
    var hourEl = el('gs-dtp-readouthour-' + fieldId);
    var minEl = el('gs-dtp-readoutmin-' + fieldId);
    if (hourEl) hourEl.classList.toggle('active', st.clockStep === 'hour');
    if (minEl) minEl.classList.toggle('active', st.clockStep === 'minute');
  }

  function goToStep(fieldId, which) {
    var st = stateFor(fieldId);
    st.clockStep = which;
    updateClockStepUI(fieldId);
    if (which === 'hour') renderClockHourFace(fieldId); else renderClockMinuteFace(fieldId);
  }

  function setAmpm(fieldId, value, btn) {
    stateFor(fieldId).ampm = value;
    var group = btn.parentElement;
    Array.prototype.forEach.call(group.querySelectorAll('button'), function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
  }

  function pickMinute(fieldId, m) {
    var st = stateFor(fieldId);
    st.minute = m;
    var pop = el('gs-dtp-clockpop-' + fieldId);
    if (pop) pop.classList.remove('open');
    var h24 = st.hour % 12; if (st.ampm === 'PM') h24 += 12;
    var value = String(h24).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    var hidden = el(fieldId);
    if (hidden) hidden.value = value;
    var trigger = el('gs-dtp-trigger-' + fieldId);
    if (trigger) trigger.textContent = fmtTimeDisplay(h24, m);
    if (hidden) hidden.dispatchEvent(new Event('change', { bubbles: true }));
    document.dispatchEvent(new CustomEvent('gs-time-picked', { detail: { fieldId: fieldId, value: value } }));
  }

  function dateHtml(fieldId, initialISO, placeholder) {
    styleTag();
    var st = stateFor(fieldId);
    var parsed = parseISODate(initialISO);
    var triggerText = placeholder || 'Pick a date';
    if (parsed) {
      st.calSelYear = parsed.year; st.calSelMonth = parsed.month; st.calSelDay = parsed.day;
      st.calViewYear = parsed.year; st.calViewMonth = parsed.month;
      triggerText = fmtDateDisplay(parsed.year, parsed.month, parsed.day);
    } else {
      var now = new Date();
      st.calSelYear = null; st.calSelMonth = null; st.calSelDay = null;
      st.calViewYear = now.getFullYear(); st.calViewMonth = now.getMonth();
    }
    return '' +
      '<div class="gs-dtp-rel">' +
      '<input type="hidden" id="' + fieldId + '" value="' + (initialISO || '') + '">' +
      '<button type="button" class="gs-dtp-trigger" id="gs-dtp-trigger-' + fieldId + '" onclick="GSDateTimePicker.toggleCal(\'' + fieldId + '\')">' + triggerText + '</button>' +
      '<div class="gs-dtp-popover" id="gs-dtp-calpop-' + fieldId + '">' +
      '<div class="gs-dtp-title">Pick a date</div>' +
      '<div class="gs-dtp-cal-card">' +
      '<div class="gs-dtp-cal-header">' +
      '<div class="gs-dtp-cal-nav">' +
      '<button type="button" onclick="GSDateTimePicker.calPrevMonth(\'' + fieldId + '\')">\u2039</button>' +
      '<div class="gs-dtp-cal-month" id="gs-dtp-calmonth-' + fieldId + '"></div>' +
      '<button type="button" onclick="GSDateTimePicker.calNextMonth(\'' + fieldId + '\')">\u203a</button>' +
      '</div>' +
      '<div class="gs-dtp-cal-nav">' +
      '<button type="button" onclick="GSDateTimePicker.calPrevYear(\'' + fieldId + '\')">\u2039</button>' +
      '<div class="gs-dtp-cal-year" id="gs-dtp-calyear-' + fieldId + '"></div>' +
      '<button type="button" onclick="GSDateTimePicker.calNextYear(\'' + fieldId + '\')">\u203a</button>' +
      '</div>' +
      '</div>' +
      '<div class="gs-dtp-cal-grid" id="gs-dtp-calgrid-' + fieldId + '"></div>' +
      '</div></div></div>';
  }

  function timeHtml(fieldId, initialHHMM, placeholder) {
    styleTag();
    var st = stateFor(fieldId);
    var parsed = parseHHMM(initialHHMM);
    var triggerText = placeholder || 'Pick a time';
    if (parsed) {
      st.hour = parsed.hour; st.minute = parsed.minute; st.ampm = parsed.ampm;
      triggerText = fmtTimeDisplay(parsed.ampm === 'PM' && parsed.hour !== 12 ? parsed.hour + 12 : (parsed.ampm === 'AM' && parsed.hour === 12 ? 0 : parsed.hour), parsed.minute);
    } else {
      st.hour = 8; st.minute = 0; st.ampm = 'AM'; st.clockStep = 'hour';
    }
    return '' +
      '<div class="gs-dtp-rel">' +
      '<input type="hidden" id="' + fieldId + '" value="' + (initialHHMM || '') + '">' +
      '<button type="button" class="gs-dtp-trigger" id="gs-dtp-trigger-' + fieldId + '" onclick="GSDateTimePicker.toggleClock(\'' + fieldId + '\')">' + triggerText + '</button>' +
      '<div class="gs-dtp-popover" id="gs-dtp-clockpop-' + fieldId + '">' +
      '<div class="gs-dtp-title">Pick a time</div>' +
      '<div class="gs-dtp-clock-row">' +
      '<div class="gs-dtp-clock-face" id="gs-dtp-clockface-' + fieldId + '"><div class="gs-dtp-center"></div></div>' +
      '</div>' +
      '<div class="gs-dtp-bottom-row">' +
      '<div class="gs-dtp-ampm">' +
      '<button type="button" class="' + (st.ampm !== 'PM' ? 'active' : '') + '" onclick="GSDateTimePicker.setAmpm(\'' + fieldId + '\',\'AM\',this)">AM</button>' +
      '<button type="button" class="' + (st.ampm === 'PM' ? 'active' : '') + '" onclick="GSDateTimePicker.setAmpm(\'' + fieldId + '\',\'PM\',this)">PM</button>' +
      '</div>' +
      '<div class="gs-dtp-readout">' +
      '<span class="part active" id="gs-dtp-readouthour-' + fieldId + '" onclick="GSDateTimePicker.goToStep(\'' + fieldId + '\',\'hour\')">' + st.hour + '</span>' +
      '<span class="part" id="gs-dtp-readoutmin-' + fieldId + '" onclick="GSDateTimePicker.goToStep(\'' + fieldId + '\',\'minute\')">:' + String(st.minute).padStart(2, '0') + '</span>' +
      '</div></div></div></div>';
  }

  function syncDate(fieldId) {
    var hidden = el(fieldId);
    var trigger = el('gs-dtp-trigger-' + fieldId);
    if (!hidden) return;
    var parsed = parseISODate(hidden.value);
    var st = stateFor(fieldId);
    if (!parsed) {
      st.calSelYear = null; st.calSelMonth = null; st.calSelDay = null;
      var now = new Date();
      st.calViewYear = now.getFullYear(); st.calViewMonth = now.getMonth();
      if (trigger) trigger.textContent = 'Pick a date';
      return;
    }
    st.calSelYear = parsed.year; st.calSelMonth = parsed.month; st.calSelDay = parsed.day;
    st.calViewYear = parsed.year; st.calViewMonth = parsed.month;
    if (trigger) trigger.textContent = fmtDateDisplay(parsed.year, parsed.month, parsed.day);
  }

  function syncTime(fieldId) {
    var hidden = el(fieldId);
    var trigger = el('gs-dtp-trigger-' + fieldId);
    if (!hidden) return;
    var parsed = parseHHMM(hidden.value);
    var st = stateFor(fieldId);
    if (!parsed) {
      st.hour = 8; st.minute = 0; st.ampm = 'AM'; st.clockStep = 'hour';
      if (trigger) trigger.textContent = 'Pick a time';
      return;
    }
    st.hour = parsed.hour; st.minute = parsed.minute; st.ampm = parsed.ampm;
    var h24 = parsed.ampm === 'PM' && parsed.hour !== 12 ? parsed.hour + 12 : (parsed.ampm === 'AM' && parsed.hour === 12 ? 0 : parsed.hour);
    if (trigger) trigger.textContent = fmtTimeDisplay(h24, parsed.minute);
  }

  function getDate(fieldId) {
    var hidden = el(fieldId);
    return hidden && hidden.value ? hidden.value : null;
  }

  function getTime(fieldId) {
    var hidden = el(fieldId);
    return hidden && hidden.value ? hidden.value : null;
  }

  document.addEventListener('click', function (e) {
    Array.prototype.forEach.call(document.querySelectorAll('.gs-dtp-popover.open'), function (pop) {
      var wrap = pop.closest('.gs-dtp-rel');
      if (wrap && !wrap.contains(e.target)) pop.classList.remove('open');
    });
  });

  window.GSDateTimePicker = {
    dateHtml: dateHtml,
    timeHtml: timeHtml,
    toggleCal: toggleCal,
    toggleClock: toggleClock,
    calPrevMonth: calPrevMonth,
    calNextMonth: calNextMonth,
    calPrevYear: calPrevYear,
    calNextYear: calNextYear,
    setAmpm: setAmpm,
    goToStep: goToStep,
    getDate: getDate,
    getTime: getTime,
    syncDate: syncDate,
    syncTime: syncTime
  };
})();
