// State Management
const state = {
  currentTab: 'rooms', // 'rooms' | 'finder' | 'groups'
  selectedRoomId: '*14', // Default: Lecture Hall D201
  floorFilter: 'all',
  typeFilter: 'all',
  roomSearchQuery: '',
  finderDay: 0,
  finderPeriod: 1,
  finderTypeFilter: 'all',
  finderFloorFilter: 'all',
  selectedGroupId: '*36', // Default: 2AF1
  
  // Mobile enhancements
  viewMode: window.innerWidth <= 768 ? 'day' : 'week', // 'day' | 'week'
  selectedDayTab: 0 // 0 = Monday, ...
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initRealtimeDefaults();
  initEventListeners();
  renderApp();
});

function initRealtimeDefaults() {
  const now = new Date();
  const day = now.getDay();
  if (day >= 1 && day <= 5) {
    state.finderDay = day - 1;
    state.selectedDayTab = day - 1;
  } else {
    state.finderDay = 0;
    state.selectedDayTab = 0;
  }

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMins = hours * 60 + minutes;

  for (let p of TIMETABLE_DATA.periods) {
    const [startH, startM] = p.start.split(':').map(Number);
    const [endH, endM] = p.end.split(':').map(Number);
    if (totalMins >= startH * 60 + startM && totalMins < endH * 60 + endM) {
      state.finderPeriod = p.id;
      break;
    }
  }
}

function initEventListeners() {
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentTab = btn.dataset.tab;
      renderApp();
    });
  });

  const modalClose = document.getElementById('modalCloseBtn');
  const modalOverlay = document.getElementById('modalOverlay');
  if (modalClose) {
    modalClose.addEventListener('click', () => modalOverlay.classList.remove('active'));
  }
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) modalOverlay.classList.remove('active');
    });
  }

  // Handle window resize dynamically
  window.addEventListener('resize', debounce(() => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile && state.viewMode !== 'day' && !state.userExplicitMode) {
      state.viewMode = 'day';
      renderApp();
    }
  }, 250));
}

function renderApp() {
  const container = document.getElementById('viewContent');
  if (!container) return;

  if (state.currentTab === 'rooms') {
    renderRoomsView(container);
  } else if (state.currentTab === 'finder') {
    renderFinderView(container);
  } else if (state.currentTab === 'groups') {
    renderGroupsView(container);
  }
}

/* ==========================================================================
   VIEW 1: ROOM OCCUPANCY & TIMETABLE (Кабинеты)
   ========================================================================== */
function renderRoomsView(container) {
  const filteredRooms = TIMETABLE_DATA.classrooms.filter(cr => {
    if (state.floorFilter !== 'all' && cr.floor !== parseInt(state.floorFilter)) return false;
    if (state.typeFilter !== 'all' && cr.type !== state.typeFilter) return false;
    if (state.roomSearchQuery) {
      const q = state.roomSearchQuery.toLowerCase();
      if (!cr.name.toLowerCase().includes(q) && !cr.short.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (!filteredRooms.some(r => r.id === state.selectedRoomId)) {
    if (filteredRooms.length > 0) {
      state.selectedRoomId = filteredRooms[0].id;
    }
  }

  const selectedRoom = TIMETABLE_DATA.classrooms.find(r => r.id === state.selectedRoomId) || TIMETABLE_DATA.classrooms[0];
  const roomSchedule = TIMETABLE_DATA.roomSchedule[selectedRoom.id] || {};

  // Compute stats
  let totalOccupiedHours = 0;
  for (let d = 0; d < 5; d++) {
    for (let p = 1; p <= 9; p++) {
      if (roomSchedule[d] && roomSchedule[d][p]) {
        totalOccupiedHours++;
      }
    }
  }
  const totalWeeklyHours = 45;
  const occupancyPercent = Math.round((totalOccupiedHours / totalWeeklyHours) * 100);

  // Status now
  const now = new Date();
  const currentDayIdx = now.getDay() - 1;
  const currentTotalMins = now.getHours() * 60 + now.getMinutes();

  let isCurrentlyBusy = false;
  let currentLessonName = '';
  if (currentDayIdx >= 0 && currentDayIdx < 5) {
    for (let p of TIMETABLE_DATA.periods) {
      const [sh, sm] = p.start.split(':').map(Number);
      const [eh, em] = p.end.split(':').map(Number);
      if (currentTotalMins >= sh * 60 + sm && currentTotalMins < eh * 60 + em) {
        if (roomSchedule[currentDayIdx] && roomSchedule[currentDayIdx][p.id]) {
          isCurrentlyBusy = true;
          currentLessonName = roomSchedule[currentDayIdx][p.id].subject;
        }
        break;
      }
    }
  }

  // Mobile Day Selector & View Mode Switcher
  const viewBarHtml = `
    <div class="mobile-view-bar">
      ${state.viewMode === 'day' ? `
        <div class="day-pills-container">
          ${TIMETABLE_DATA.days.map((d, idx) => `
            <button class="day-pill-btn ${idx === state.selectedDayTab ? 'active' : ''}" data-day-tab="${idx}">
              ${d.short}
            </button>
          `).join('')}
        </div>
      ` : `<div style="font-size:12px; font-weight:600; color:var(--text-muted); padding-left:4px;">Вся неделя (5 дней)</div>`}

      <div class="view-mode-toggle">
        <button class="mode-btn ${state.viewMode === 'day' ? 'active' : ''}" data-set-view-mode="day">День</button>
        <button class="mode-btn ${state.viewMode === 'week' ? 'active' : ''}" data-set-view-mode="week">Неделя</button>
      </div>
    </div>
  `;

  // Render Schedule (Day Timeline OR Week Grid)
  let scheduleContentHtml = '';

  if (state.viewMode === 'day') {
    // Single Day Vertical Timeline (Ideal for mobile)
    const dayObj = TIMETABLE_DATA.days[state.selectedDayTab];
    const daySched = roomSchedule[state.selectedDayTab] || {};

    let timelineItemsHtml = '';
    const skipPeriods = new Set();

    for (let period of TIMETABLE_DATA.periods) {
      const pid = period.id;
      if (skipPeriods.has(pid)) continue;

      const slot = daySched[pid];
      if (!slot) {
        timelineItemsHtml += `
          <div class="timeline-item free">
            <div class="timeline-time-col">
              <span class="period-tag">Пара ${pid}</span>
              <span class="hours">${period.start}–${period.end}</span>
            </div>
            <div class="timeline-info-col">
              <div class="timeline-title" style="color:var(--free-text);">Свободно</div>
              <div class="timeline-subtitle">Аудитория доступна для занятий</div>
            </div>
          </div>
        `;
      } else {
        const dur = slot.duration || 1;
        if (dur > 1) {
          for (let sp = pid + 1; sp < pid + dur; sp++) {
            skipPeriods.add(sp);
          }
        }

        timelineItemsHtml += `
          <div 
            class="timeline-item busy" 
            data-lesson-detail='${escapeHtml(JSON.stringify(slot))}'
            data-room-name="${escapeHtml(selectedRoom.name)}"
            data-day-name="${escapeHtml(dayObj.name)}"
            data-period-str="${slot.timeRange}"
            style="cursor:pointer;"
          >
            <div class="timeline-time-col">
              <span class="period-tag">${dur > 1 ? `Пары ${slot.startPeriod}-${slot.endPeriod}` : `Пара ${pid}`}</span>
              <span class="hours">${slot.timeRange}</span>
            </div>
            <div class="timeline-info-col">
              <div class="timeline-title">${escapeHtml(slot.subject)}</div>
              <div class="timeline-subtitle">
                <span style="color:#BFDBFE; font-weight:600;">${escapeHtml(slot.groups.join(', '))}</span> • ${escapeHtml(slot.teachers.join(', '))}
              </div>
            </div>
          </div>
        `;
      }
    }

    scheduleContentHtml = `
      <div class="mobile-timeline">
        ${timelineItemsHtml}
      </div>
    `;
  } else {
    // 5-Day Week Grid (with Rowspan & Horizontal Scroll)
    const skipUntil = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let rowsHtml = '';

    for (let period of TIMETABLE_DATA.periods) {
      const pid = period.id;
      rowsHtml += `<tr>`;
      rowsHtml += `
        <td class="time-cell">
          <div class="period-num">Пара ${pid}</div>
          <div class="period-hours">${period.start}–${period.end}</div>
        </td>
      `;

      for (let day of TIMETABLE_DATA.days) {
        const did = day.id;
        if (pid <= skipUntil[did]) continue;

        const slot = roomSchedule[did] ? roomSchedule[did][pid] : null;
        if (!slot) {
          rowsHtml += `
            <td>
              <div class="slot-free" title="Свободно">
                <span class="free-tag">Свободно</span>
              </div>
            </td>
          `;
        } else {
          const dur = slot.duration || 1;
          if (dur > 1) {
            skipUntil[did] = pid + dur - 1;
          }
          const rowspanAttr = dur > 1 ? `rowspan="${dur}"` : '';

          rowsHtml += `
            <td ${rowspanAttr}>
              <div 
                class="slot-busy"
                data-lesson-detail='${escapeHtml(JSON.stringify(slot))}'
                data-room-name="${escapeHtml(selectedRoom.name)}"
                data-day-name="${escapeHtml(day.name)}"
                data-period-str="${slot.timeRange}"
                title="Нажмите для деталей"
              >
                <div class="busy-subject">${escapeHtml(slot.subject)}</div>
                <div class="busy-details">
                  <div class="busy-groups">${escapeHtml(slot.groups.join(', '))}</div>
                  <div class="busy-teacher">${escapeHtml(slot.teachers.join(', '))}</div>
                </div>
                <div class="busy-meta">
                  <span>${escapeHtml(slot.timeRange)}</span>
                  ${dur > 1 ? `<span>${dur} ч</span>` : ''}
                </div>
              </div>
            </td>
          `;
        }
      }
      rowsHtml += `</tr>`;
    }

    scheduleContentHtml = `
      <div class="schedule-container">
        <table class="schedule-table">
          <thead>
            <tr>
              <th class="time-col-header">Время</th>
              ${TIMETABLE_DATA.days.map(d => `<th>${d.name}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  let html = `
    <!-- Controls Bar -->
    <div class="controls-card">
      <div class="controls-row">
        <div class="search-filter-group">
          <div class="input-wrapper">
            <input 
              type="text" 
              class="search-input" 
              placeholder="Поиск (D201, Computer...)" 
              id="roomSearchInput" 
              value="${escapeHtml(state.roomSearchQuery)}"
            />
          </div>

          <div class="filter-chips">
            <button class="chip-btn ${state.floorFilter === 'all' ? 'active' : ''}" data-filter-floor="all">Все</button>
            <button class="chip-btn ${state.floorFilter === '2' ? 'active' : ''}" data-filter-floor="2">2 эт</button>
            <button class="chip-btn ${state.floorFilter === '3' ? 'active' : ''}" data-filter-floor="3">3 эт</button>
            <button class="chip-btn ${state.floorFilter === '4' ? 'active' : ''}" data-filter-floor="4">4 эт</button>
            <button class="chip-btn ${state.floorFilter === '5' ? 'active' : ''}" data-filter-floor="5">5 эт</button>
          </div>

          <div class="filter-chips">
            <button class="chip-btn ${state.typeFilter === 'all' ? 'active' : ''}" data-filter-type="all">Все типы</button>
            <button class="chip-btn ${state.typeFilter === 'lecture' ? 'active' : ''}" data-filter-type="lecture">Лекции</button>
            <button class="chip-btn ${state.typeFilter === 'computer' ? 'active' : ''}" data-filter-type="computer">Компьютерные</button>
            <button class="chip-btn ${state.typeFilter === 'seminar' ? 'active' : ''}" data-filter-type="seminar">Семинары</button>
          </div>
        </div>

        <select class="select-dropdown" id="roomSelectDropdown">
          ${filteredRooms.map(r => `
            <option value="${r.id}" ${r.id === selectedRoom.id ? 'selected' : ''}>
              ${escapeHtml(r.name)} (${r.typeLabel})
            </option>
          `).join('')}
        </select>
      </div>

      <!-- Quick Room Chips (Scrollable) -->
      <div class="room-quick-list">
        ${filteredRooms.slice(0, 16).map(r => `
          <button class="room-quick-chip ${r.id === selectedRoom.id ? 'active' : ''}" data-room-id="${r.id}">
            ${escapeHtml(r.short)}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Room Header -->
    <div class="room-header-card">
      <div class="room-title-area">
        <h2>${escapeHtml(selectedRoom.name)}</h2>
        <span class="badge badge-${selectedRoom.type}">${selectedRoom.typeLabel}</span>
        <span class="badge" style="background:#1E293B; color:#94A3B8;">${selectedRoom.floor} этаж</span>
      </div>

      <div class="room-stats-area">
        <div class="stat-item">
          <span class="stat-label">Сейчас:</span>
          <span class="stat-value" style="color: ${isCurrentlyBusy ? '#F87171' : 'var(--free-text)'};">
            ${isCurrentlyBusy ? `Занято` : 'Свободно'}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Занятость:</span>
          <span class="stat-value">${totalOccupiedHours}/45 ч (${occupancyPercent}%)</span>
        </div>
      </div>
    </div>

    ${viewBarHtml}
    ${scheduleContentHtml}
  `;

  container.innerHTML = html;
  attachRoomsViewEvents();
}

function attachRoomsViewEvents() {
  const searchInput = document.getElementById('roomSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.roomSearchQuery = e.target.value;
      renderApp();
      const el = document.getElementById('roomSearchInput');
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    });
  }

  document.querySelectorAll('[data-filter-floor]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.floorFilter = btn.dataset.filterFloor;
      renderApp();
    });
  });

  document.querySelectorAll('[data-filter-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.typeFilter = btn.dataset.filterType;
      renderApp();
    });
  });

  document.getElementById('roomSelectDropdown')?.addEventListener('change', (e) => {
    state.selectedRoomId = e.target.value;
    renderApp();
  });

  document.querySelectorAll('.room-quick-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedRoomId = btn.dataset.roomId;
      renderApp();
    });
  });

  // Day Tab selection
  document.querySelectorAll('[data-day-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedDayTab = parseInt(btn.dataset.dayTab);
      renderApp();
    });
  });

  // View Mode selection (Day vs Week)
  document.querySelectorAll('[data-set-view-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.setViewMode;
      state.userExplicitMode = true;
      renderApp();
    });
  });

  // Lesson Card click -> Modal
  document.querySelectorAll('.slot-busy, .timeline-item.busy').forEach(card => {
    card.addEventListener('click', () => {
      const dataStr = card.getAttribute('data-lesson-detail');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      showLessonModal(
        data, 
        card.getAttribute('data-room-name'), 
        card.getAttribute('data-day-name'),
        card.getAttribute('data-period-str')
      );
    });
  });
}

/* ==========================================================================
   VIEW 2: ROOM FINDER ("Найти свободный кабинет")
   ========================================================================== */
function renderFinderView(container) {
  const selectedDay = TIMETABLE_DATA.days.find(d => d.id === state.finderDay) || TIMETABLE_DATA.days[0];
  const selectedPeriod = TIMETABLE_DATA.periods.find(p => p.id === state.finderPeriod) || TIMETABLE_DATA.periods[0];

  const freeRooms = [];
  const busyRooms = [];

  TIMETABLE_DATA.classrooms.forEach(cr => {
    if (state.finderFloorFilter !== 'all' && cr.floor !== parseInt(state.finderFloorFilter)) return;
    if (state.finderTypeFilter !== 'all' && cr.type !== state.finderTypeFilter) return;

    const roomSched = TIMETABLE_DATA.roomSchedule[cr.id] || {};
    const slot = roomSched[state.finderDay] ? roomSched[state.finderDay][state.finderPeriod] : null;

    if (slot) {
      busyRooms.push({ room: cr, slot });
    } else {
      freeRooms.push(cr);
    }
  });

  let html = `
    <div class="controls-card">
      <div class="finder-controls">
        <div class="control-field">
          <label>День:</label>
          <select class="select-dropdown" id="finderDaySelect">
            ${TIMETABLE_DATA.days.map(d => `
              <option value="${d.id}" ${d.id === state.finderDay ? 'selected' : ''}>
                ${d.name}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="control-field">
          <label>Время:</label>
          <select class="select-dropdown" id="finderPeriodSelect">
            ${TIMETABLE_DATA.periods.map(p => `
              <option value="${p.id}" ${p.id === state.finderPeriod ? 'selected' : ''}>
                Пара ${p.id} (${p.start}–${p.end})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="control-field">
          <label>Этаж:</label>
          <select class="select-dropdown" id="finderFloorSelect">
            <option value="all" ${state.finderFloorFilter === 'all' ? 'selected' : ''}>Все</option>
            <option value="2" ${state.finderFloorFilter === '2' ? 'selected' : ''}>2 этаж</option>
            <option value="3" ${state.finderFloorFilter === '3' ? 'selected' : ''}>3 этаж</option>
            <option value="4" ${state.finderFloorFilter === '4' ? 'selected' : ''}>4 этаж</option>
            <option value="5" ${state.finderFloorFilter === '5' ? 'selected' : ''}>5 этаж</option>
          </select>
        </div>

        <div class="control-field">
          <label>Тип:</label>
          <select class="select-dropdown" id="finderTypeSelect">
            <option value="all" ${state.finderTypeFilter === 'all' ? 'selected' : ''}>Все</option>
            <option value="lecture" ${state.finderTypeFilter === 'lecture' ? 'selected' : ''}>Лекции</option>
            <option value="computer" ${state.finderTypeFilter === 'computer' ? 'selected' : ''}>Компьютерные</option>
            <option value="seminar" ${state.finderTypeFilter === 'seminar' ? 'selected' : ''}>Семинары</option>
          </select>
        </div>

        <button class="btn-now" id="btnSetNow">Прямо сейчас</button>
      </div>
    </div>

    <!-- Summary Bar -->
    <div class="finder-summary-bar">
      <div class="finder-summary-title">
        ${selectedDay.name}, Пара ${selectedPeriod.id} (${selectedPeriod.start}–${selectedPeriod.end})
      </div>
      <div class="finder-counts">
        <span class="count-free">Свободно: ${freeRooms.length}</span>
        <span class="count-busy">Занято: ${busyRooms.length}</span>
      </div>
    </div>

    <!-- 2 Columns Grid -->
    <div class="finder-grid">
      <!-- Free Rooms Column -->
      <div class="finder-column">
        <div class="finder-col-title">
          <span>Свободные кабинеты</span>
          <span class="badge" style="background:var(--free-badge); color:var(--free-text);">${freeRooms.length}</span>
        </div>
        <div class="finder-cards-list">
          ${freeRooms.length === 0 ? `
            <div style="padding:16px; text-align:center; color:var(--text-muted); font-size:12px;">
              Нет свободных кабинетов
            </div>
          ` : freeRooms.map(r => `
            <div class="room-mini-card card-free" data-jump-room="${r.id}" title="Открыть расписание">
              <div class="room-mini-info">
                <div class="name">${escapeHtml(r.name)}</div>
                <div class="desc">${r.typeLabel} • ${r.floor} этаж</div>
              </div>
              <span class="free-tag">Свободно</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Busy Rooms Column -->
      <div class="finder-column">
        <div class="finder-col-title">
          <span>Занятые кабинеты</span>
          <span class="badge" style="background:rgba(239, 68, 68, 0.15); color:#F87171;">${busyRooms.length}</span>
        </div>
        <div class="finder-cards-list">
          ${busyRooms.length === 0 ? `
            <div style="padding:16px; text-align:center; color:var(--text-muted); font-size:12px;">
              Все кабинеты свободны
            </div>
          ` : busyRooms.map(item => `
            <div class="room-mini-card card-busy" data-jump-room="${item.room.id}" title="Открыть расписание">
              <div class="room-mini-info">
                <div class="name">${escapeHtml(item.room.name)}</div>
                <div class="desc" style="color:var(--text-main); font-weight:500;">
                  ${escapeHtml(item.slot.subject)}
                </div>
                <div class="desc">
                  ${escapeHtml(item.slot.groups.join(', '))} • ${escapeHtml(item.slot.teachers.join(', '))}
                </div>
              </div>
              <span class="badge badge-${item.room.type}">${item.room.typeLabel}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  attachFinderViewEvents();
}

function attachFinderViewEvents() {
  document.getElementById('finderDaySelect')?.addEventListener('change', (e) => {
    state.finderDay = parseInt(e.target.value);
    renderApp();
  });

  document.getElementById('finderPeriodSelect')?.addEventListener('change', (e) => {
    state.finderPeriod = parseInt(e.target.value);
    renderApp();
  });

  document.getElementById('finderFloorSelect')?.addEventListener('change', (e) => {
    state.finderFloorFilter = e.target.value;
    renderApp();
  });

  document.getElementById('finderTypeSelect')?.addEventListener('change', (e) => {
    state.finderTypeFilter = e.target.value;
    renderApp();
  });

  document.getElementById('btnSetNow')?.addEventListener('click', () => {
    initRealtimeDefaults();
    renderApp();
  });

  document.querySelectorAll('[data-jump-room]').forEach(card => {
    card.addEventListener('click', () => {
      state.selectedRoomId = card.dataset.jumpRoom;
      state.currentTab = 'rooms';
      document.querySelectorAll('.nav-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'rooms');
      });
      renderApp();
    });
  });
}

/* ==========================================================================
   VIEW 3: GROUP SCHEDULE (По группам)
   ========================================================================== */
function renderGroupsView(container) {
  const selectedGroup = TIMETABLE_DATA.classes.find(c => c.id === state.selectedGroupId) || TIMETABLE_DATA.classes[0];
  const groupSchedule = TIMETABLE_DATA.classSchedule[selectedGroup.id] || {};

  // View Bar
  const viewBarHtml = `
    <div class="mobile-view-bar">
      ${state.viewMode === 'day' ? `
        <div class="day-pills-container">
          ${TIMETABLE_DATA.days.map((d, idx) => `
            <button class="day-pill-btn ${idx === state.selectedDayTab ? 'active' : ''}" data-day-tab="${idx}">
              ${d.short}
            </button>
          `).join('')}
        </div>
      ` : `<div style="font-size:12px; font-weight:600; color:var(--text-muted); padding-left:4px;">Вся неделя (5 дней)</div>`}

      <div class="view-mode-toggle">
        <button class="mode-btn ${state.viewMode === 'day' ? 'active' : ''}" data-set-view-mode="day">День</button>
        <button class="mode-btn ${state.viewMode === 'week' ? 'active' : ''}" data-set-view-mode="week">Неделя</button>
      </div>
    </div>
  `;

  let scheduleContentHtml = '';

  if (state.viewMode === 'day') {
    const dayObj = TIMETABLE_DATA.days[state.selectedDayTab];
    const daySched = groupSchedule[state.selectedDayTab] || {};

    let timelineItemsHtml = '';
    const skipPeriods = new Set();

    for (let period of TIMETABLE_DATA.periods) {
      const pid = period.id;
      if (skipPeriods.has(pid)) continue;

      const slot = daySched[pid];
      if (!slot) {
        timelineItemsHtml += `
          <div class="timeline-item free" style="border-left-color: var(--border-color); background: rgba(255,255,255,0.02);">
            <div class="timeline-time-col">
              <span class="period-tag" style="color:var(--text-light);">Пара ${pid}</span>
              <span class="hours">${period.start}–${period.end}</span>
            </div>
            <div class="timeline-info-col">
              <div class="timeline-title" style="color:var(--text-light); font-weight:500;">Нет пары</div>
            </div>
          </div>
        `;
      } else {
        const dur = slot.duration || 1;
        if (dur > 1) {
          for (let sp = pid + 1; sp < pid + dur; sp++) {
            skipPeriods.add(sp);
          }
        }
        const roomsStr = slot.rooms.join(', ');
        const teacherStr = slot.teachers.join(', ');

        timelineItemsHtml += `
          <div 
            class="timeline-item busy"
            data-lesson-detail='${escapeHtml(JSON.stringify(slot))}'
            data-room-name="${escapeHtml(roomsStr)}"
            data-day-name="${escapeHtml(dayObj.name)}"
            data-period-str="${slot.timeRange}"
            style="cursor:pointer;"
          >
            <div class="timeline-time-col">
              <span class="period-tag">${dur > 1 ? `Пары ${slot.startPeriod}-${slot.endPeriod}` : `Пара ${pid}`}</span>
              <span class="hours">${slot.timeRange}</span>
            </div>
            <div class="timeline-info-col">
              <div class="timeline-title">${escapeHtml(slot.subject)}</div>
              <div class="timeline-subtitle">
                <span style="color:#60A5FA; font-weight:600;">Кабинет: ${escapeHtml(roomsStr)}</span> • ${escapeHtml(teacherStr)}
              </div>
            </div>
          </div>
        `;
      }
    }

    scheduleContentHtml = `
      <div class="mobile-timeline">
        ${timelineItemsHtml}
      </div>
    `;
  } else {
    const skipUntil = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let rowsHtml = '';

    for (let period of TIMETABLE_DATA.periods) {
      const pid = period.id;
      rowsHtml += `<tr>`;
      rowsHtml += `
        <td class="time-cell">
          <div class="period-num">Пара ${pid}</div>
          <div class="period-hours">${period.start}–${period.end}</div>
        </td>
      `;

      for (let day of TIMETABLE_DATA.days) {
        const did = day.id;
        if (pid <= skipUntil[did]) continue;

        const slot = groupSchedule[did] ? groupSchedule[did][pid] : null;
        if (!slot) {
          rowsHtml += `
            <td>
              <div class="slot-free" style="background:rgba(255,255,255,0.02); border-color:var(--border-subtle);">
                <span style="font-size:11px; color:var(--text-light);">—</span>
              </div>
            </td>
          `;
        } else {
          const dur = slot.duration || 1;
          if (dur > 1) {
            skipUntil[did] = pid + dur - 1;
          }
          const rowspanAttr = dur > 1 ? `rowspan="${dur}"` : '';
          const roomsStr = slot.rooms.join(', ');
          const teacherStr = slot.teachers.join(', ');

          rowsHtml += `
            <td ${rowspanAttr}>
              <div 
                class="slot-busy"
                data-lesson-detail='${escapeHtml(JSON.stringify(slot))}'
                data-room-name="${escapeHtml(roomsStr)}"
                data-day-name="${escapeHtml(day.name)}"
                data-period-str="${slot.timeRange}"
              >
                <div class="busy-subject">${escapeHtml(slot.subject)}</div>
                <div class="busy-details">
                  <div class="busy-groups" style="color:#60A5FA;">Кабинет: ${escapeHtml(roomsStr)}</div>
                  <div class="busy-teacher">${escapeHtml(teacherStr)}</div>
                </div>
                <div class="busy-meta">
                  <span>${escapeHtml(slot.timeRange)}</span>
                  ${dur > 1 ? `<span>${dur} ч</span>` : ''}
                </div>
              </div>
            </td>
          `;
        }
      }
      rowsHtml += `</tr>`;
    }

    scheduleContentHtml = `
      <div class="schedule-container">
        <table class="schedule-table">
          <thead>
            <tr>
              <th class="time-col-header">Время</th>
              ${TIMETABLE_DATA.days.map(d => `<th>${d.name}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  let html = `
    <div class="controls-card">
      <div class="controls-row">
        <div class="search-filter-group">
          <label style="font-weight:600; font-size:13px; color:var(--text-muted);">Группа:</label>
          <select class="select-dropdown" id="groupSelectDropdown">
            ${TIMETABLE_DATA.classes.map(c => `
              <option value="${c.id}" ${c.id === selectedGroup.id ? 'selected' : ''}>
                ${escapeHtml(c.name)}
              </option>
            `).join('')}
          </select>
        </div>
        <div style="font-size:14px; font-weight:700; color:var(--text-main);">
          Расписание: ${escapeHtml(selectedGroup.name)}
        </div>
      </div>
    </div>

    ${viewBarHtml}
    ${scheduleContentHtml}
  `;

  container.innerHTML = html;

  document.getElementById('groupSelectDropdown')?.addEventListener('change', (e) => {
    state.selectedGroupId = e.target.value;
    renderApp();
  });

  document.querySelectorAll('[data-day-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedDayTab = parseInt(btn.dataset.dayTab);
      renderApp();
    });
  });

  document.querySelectorAll('[data-set-view-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.setViewMode;
      state.userExplicitMode = true;
      renderApp();
    });
  });

  document.querySelectorAll('.slot-busy, .timeline-item.busy').forEach(card => {
    card.addEventListener('click', () => {
      const dataStr = card.getAttribute('data-lesson-detail');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      showLessonModal(
        data, 
        card.getAttribute('data-room-name'), 
        card.getAttribute('data-day-name'),
        card.getAttribute('data-period-str')
      );
    });
  });
}

/* ==========================================================================
   MODAL DIALOG
   ========================================================================== */
function showLessonModal(data, roomName, dayName, periodStr) {
  const modal = document.getElementById('modalOverlay');
  const body = document.getElementById('modalBody');
  if (!modal || !body) return;

  body.innerHTML = `
    <div class="detail-row">
      <span class="label">Предмет:</span>
      <span class="value" style="color:var(--primary-hover);">${escapeHtml(data.subject)}</span>
    </div>
    <div class="detail-row">
      <span class="label">Кабинет:</span>
      <span class="value">${escapeHtml(roomName || data.rooms?.join(', ') || '—')}</span>
    </div>
    <div class="detail-row">
      <span class="label">День:</span>
      <span class="value">${escapeHtml(dayName)}</span>
    </div>
    <div class="detail-row">
      <span class="label">Время:</span>
      <span class="value">${escapeHtml(data.timeRange || periodStr)}</span>
    </div>
    <div class="detail-row">
      <span class="label">Группы:</span>
      <span class="value">${escapeHtml(data.groups?.join(', ') || '—')}</span>
    </div>
    <div class="detail-row">
      <span class="label">Преподаватель:</span>
      <span class="value">${escapeHtml(data.teachers?.join(', ') || '—')}</span>
    </div>
    <div class="detail-row">
      <span class="label">Длительность:</span>
      <span class="value">${data.duration} ч (Пары ${data.startPeriod}–${data.endPeriod})</span>
    </div>
  `;

  modal.classList.add('active');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
