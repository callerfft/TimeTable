// BMU Timetable - Application Logic
// Inspired by School Timetable design (Clean Blue Palette & Poppins font)

// Subject Color Generator for School-style Pastel Cells
const TimetableColors = {
  RULES: [
    { test: /program|python|comput|code|data|web|software|algorithm|cyber|network|mis|database|security/i, bg: '#E0F7FA', border: '#06B6D4' },
    { test: /account|financ|bank|tax|audit|invest|securit/i, bg: '#EFF6FF', border: '#3B82F6' },
    { test: /econom|micro|macro|math|quant|statist/i, bg: '#ECFDF5', border: '#10B981' },
    { test: /manage|market|business|leadership|entrepreneur|logist|project|pm/i, bg: '#FEF9C3', border: '#F59E0B' },
    { test: /english|communicat|writing|academic|literat/i, bg: '#FDF2F8', border: '#EC4899' },
    { test: /law|legal|philosoph|ethic|global/i, bg: '#F5F3FF', border: '#8B5CF6' },
    { test: /career|pers\s*dev|drop-in/i, bg: '#F3E8FF', border: '#A855F7' }
  ],

  getColors(subject) {
    const text = String(subject || '');
    for (const rule of this.RULES) {
      if (rule.test.test(text)) {
        return { bg: rule.bg, border: rule.border };
      }
    }
    // Fallback deterministic pastel color from text hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return {
      bg: `hsl(${hue}, 70%, 95%)`,
      border: `hsl(${hue}, 60%, 55%)`
    };
  },

  lessonStyle(subject) {
    const { bg, border } = this.getColors(subject);
    return `background-color: ${bg}; border-left: 3px solid ${border};`;
  }
};

// Initial state - default tab is 'rooms' (Кабинеты)
const state = {
  currentTab: 'rooms', // 'rooms' | 'groups' | 'finder'
  selectedGroupId: '*43', // Default: 2MIS1
  groupYearFilter: 'all', // 'all' | 'year2' | 'year3' | 'year4' | 'foundation'
  groupSearchQuery: '',
  
  selectedRoomId: '*14', // Default: Lecture Hall D201
  floorFilter: 'all',
  typeFilter: 'all',
  roomSearchQuery: '',
  
  finderDay: 0,
  finderPeriod: 1,
  finderFloorFilter: 'all',
  finderTypeFilter: 'all'
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  parseUrlParams();
  initRealtimeDefaults();
  initEventListeners();
  renderApp();
});

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (tab && ['groups', 'rooms', 'finder'].includes(tab)) {
    state.currentTab = tab;
  } else {
    state.currentTab = 'rooms';
  }

  const groupParam = params.get('group');
  if (groupParam && typeof TIMETABLE_DATA !== 'undefined' && TIMETABLE_DATA.classes) {
    const found = TIMETABLE_DATA.classes.find(c => 
      c.name.toLowerCase() === groupParam.toLowerCase() ||
      c.id === groupParam ||
      c.name.toLowerCase().startsWith(groupParam.toLowerCase())
    );
    if (found) {
      state.selectedGroupId = found.id;
    }
  } else {
    // Default group 2MIS1
    const mis = TIMETABLE_DATA.classes.find(c => c.name.toLowerCase().includes('2mis'));
    if (mis) state.selectedGroupId = mis.id;
  }

  const roomParam = params.get('room');
  if (roomParam && typeof TIMETABLE_DATA !== 'undefined' && TIMETABLE_DATA.classrooms) {
    const foundRoom = TIMETABLE_DATA.classrooms.find(r => 
      r.id === roomParam || 
      r.name.toLowerCase().includes(roomParam.toLowerCase()) ||
      r.short.toLowerCase().includes(roomParam.toLowerCase())
    );
    if (foundRoom) state.selectedRoomId = foundRoom.id;
  }
}

function updateUrlParams() {
  const params = new URLSearchParams();
  if (state.currentTab !== 'rooms') {
    params.set('tab', state.currentTab);
  }
  if (state.currentTab === 'groups') {
    const grp = TIMETABLE_DATA.classes.find(c => c.id === state.selectedGroupId);
    if (grp) params.set('group', grp.name);
  } else if (state.currentTab === 'rooms') {
    const rm = TIMETABLE_DATA.classrooms.find(r => r.id === state.selectedRoomId);
    if (rm) params.set('room', rm.short);
  }
  const query = params.toString();
  const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
  window.history.replaceState({}, '', newUrl);
}

function initRealtimeDefaults() {
  const now = new Date();
  const day = now.getDay();
  // Monday = 0, Friday = 4
  if (day >= 1 && day <= 5) {
    state.finderDay = day - 1;
  } else {
    state.finderDay = 0;
  }

  const totalMins = now.getHours() * 60 + now.getMinutes();
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
  // Navigation tabs (level-switch style)
  document.querySelectorAll('.level-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-switch-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentTab = btn.dataset.tab;
      updateUrlParams();
      renderApp();
    });
  });

  // Modal close handlers
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
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('active')) {
      modalOverlay.classList.remove('active');
    }
  });
}

function renderApp() {
  // Update header tab active state
  document.querySelectorAll('.level-switch-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.currentTab);
  });

  const container = document.getElementById('viewContent');
  if (!container) return;

  if (state.currentTab === 'groups') {
    renderGroupsView(container);
  } else if (state.currentTab === 'rooms') {
    renderRoomsView(container);
  } else if (state.currentTab === 'finder') {
    renderFinderView(container);
  }
}

/* ==========================================================================
   VIEW 1: GROUP SCHEDULE (По группам — Default: 2MIS1)
   ========================================================================== */
function renderGroupsView(container) {
  // Filter groups by Year and Search query
  const filteredGroups = TIMETABLE_DATA.classes.filter(c => {
    const name = c.name.toLowerCase();
    if (state.groupYearFilter === 'year2' && !name.startsWith('2')) return false;
    if (state.groupYearFilter === 'year3' && !name.startsWith('3')) return false;
    if (state.groupYearFilter === 'year4' && !name.startsWith('4')) return false;
    if (state.groupYearFilter === 'foundation' && !name.startsWith('f')) return false;

    if (state.groupSearchQuery) {
      const q = state.groupSearchQuery.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  // Ensure selectedGroupId is valid
  if (!filteredGroups.some(c => c.id === state.selectedGroupId)) {
    if (filteredGroups.length > 0) {
      state.selectedGroupId = filteredGroups[0].id;
    }
  }

  const selectedGroup = TIMETABLE_DATA.classes.find(c => c.id === state.selectedGroupId) || TIMETABLE_DATA.classes[0];
  const groupSchedule = TIMETABLE_DATA.classSchedule[selectedGroup.id] || {};

  // Count lessons for selected group
  let totalLessons = 0;
  let totalHours = 0;
  for (let d = 0; d < 5; d++) {
    const dayObj = groupSchedule[d] || {};
    const processedCards = new Set();
    for (let p = 1; p <= 9; p++) {
      const slot = dayObj[p];
      if (slot && !processedCards.has(slot.cardId)) {
        processedCards.add(slot.cardId);
        totalLessons++;
        totalHours += (slot.duration || 1);
      }
    }
  }

  // Quick group chips (show popular & related groups)
  const quickList = filteredGroups.slice(0, 15);

  // Build Grid Table (Period columns across the top, Days on the left)
  let tableRowsHtml = '';
  for (const day of TIMETABLE_DATA.days) {
    const did = day.id;
    const daySched = groupSchedule[did] || {};

    let rowCellsHtml = `<th>${escapeHtml(day.short)}<span class="day-full">${escapeHtml(day.name)}</span></th>`;
    let skipUntil = 0;

    for (const period of TIMETABLE_DATA.periods) {
      const pid = period.id;
      if (pid <= skipUntil) continue;

      const slot = daySched[pid];
      if (!slot) {
        rowCellsHtml += `<td class="break-col"><div class="cell empty"><span class="cell-dash">—</span></div></td>`;
      } else {
        const dur = Math.max(1, slot.duration || 1);
        const safeDur = Math.min(dur, 9 - pid + 1);
        if (safeDur > 1) {
          skipUntil = pid + safeDur - 1;
        }

        const colspanAttr = safeDur > 1 ? ` colspan="${safeDur}"` : '';
        const roomStr = slot.rooms && slot.rooms.length > 0 ? slot.rooms.join(', ') : '—';
        const teacherStr = slot.teachers && slot.teachers.length > 0 ? slot.teachers.join(', ') : '';
        const style = TimetableColors.lessonStyle(slot.subject);

        rowCellsHtml += `
          <td${colspanAttr}>
            <div class="cell">
              <div 
                class="lesson" 
                style="${style}"
                data-lesson-detail='${escapeHtml(JSON.stringify(slot))}'
                data-room-name="${escapeHtml(roomStr)}"
                data-day-name="${escapeHtml(day.name)}"
                data-period-str="${escapeHtml(slot.timeRange)}"
                title="Подробнее о занятии"
              >
                <div class="lesson-room">${escapeHtml(roomStr)}</div>
                <div class="lesson-subject">${escapeHtml(slot.subject)}</div>
                ${teacherStr ? `<div class="lesson-teacher">${escapeHtml(teacherStr)}</div>` : ''}
                ${safeDur > 1 ? `<div class="lesson-duration">${safeDur} ч · ${escapeHtml(slot.timeRange)}</div>` : ''}
              </div>
            </div>
          </td>
        `;
      }
    }

    tableRowsHtml += `<tr>${rowCellsHtml}</tr>`;
  }

  const html = `
    <!-- Group Search & Controls Bar -->
    <div class="controls-card">
      <div class="controls-row">
        <div class="search-filter-group">
          <input 
            type="text" 
            class="search-input" 
            placeholder="Поиск по группам (2MIS1, 2AF1, F101...)" 
            id="groupSearchInput" 
            value="${escapeHtml(state.groupSearchQuery)}"
          />

          <div class="filter-chips">
            <button class="chip-btn ${state.groupYearFilter === 'all' ? 'active' : ''}" data-filter-year="all">Все курсы</button>
            <button class="chip-btn ${state.groupYearFilter === 'year2' ? 'active' : ''}" data-filter-year="year2">Year 2</button>
            <button class="chip-btn ${state.groupYearFilter === 'year3' ? 'active' : ''}" data-filter-year="year3">Year 3</button>
            <button class="chip-btn ${state.groupYearFilter === 'year4' ? 'active' : ''}" data-filter-year="year4">Year 4</button>
            <button class="chip-btn ${state.groupYearFilter === 'foundation' ? 'active' : ''}" data-filter-year="foundation">Foundation</button>
          </div>
        </div>

        <select class="select-dropdown" id="groupSelectDropdown" aria-label="Выбрать группу">
          ${filteredGroups.map(c => `
            <option value="${c.id}" ${c.id === selectedGroup.id ? 'selected' : ''}>
              ${escapeHtml(c.name)}
            </option>
          `).join('')}
        </select>
      </div>

      <!-- Quick Group Chips -->
      <div class="quick-chips-row">
        ${quickList.map(c => `
          <button class="quick-chip ${c.id === selectedGroup.id ? 'active' : ''}" data-group-id="${c.id}">
            ${escapeHtml(c.name)}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- School-style Grade Block for Selected Group -->
    <section class="grade-block" id="group-${escapeHtml(selectedGroup.name)}">
      <div class="grade-head">
        <div class="grade-head-info">
          <h2>Группа ${escapeHtml(selectedGroup.name)}</h2>
          <p>British Management University · Учебное расписание недели</p>
        </div>
        <div class="grade-head-meta">
          <span class="badge badge-blue">${totalLessons} дисциплин / ${totalHours} ч в неделю</span>
        </div>
      </div>

      <div class="table-wrap">
        <table class="grid-table">
          <thead>
            <tr>
              <th class="corner-th">День</th>
              ${TIMETABLE_DATA.periods.map(p => `
                <th>
                  P${p.id}
                  <span class="time">${p.start}<br />${p.end}</span>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.innerHTML = html;
  attachGroupsViewEvents();
}

function attachGroupsViewEvents() {
  const searchInput = document.getElementById('groupSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.groupSearchQuery = e.target.value;
      renderApp();
      const el = document.getElementById('groupSearchInput');
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    });
  }

  document.querySelectorAll('[data-filter-year]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.groupYearFilter = btn.dataset.filterYear;
      renderApp();
    });
  });

  document.getElementById('groupSelectDropdown')?.addEventListener('change', (e) => {
    state.selectedGroupId = e.target.value;
    updateUrlParams();
    renderApp();
  });

  document.querySelectorAll('[data-group-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedGroupId = btn.dataset.groupId;
      updateUrlParams();
      renderApp();
    });
  });

  // Modal open on lesson card click
  document.querySelectorAll('.lesson').forEach(card => {
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
   VIEW 2: ROOM OCCUPANCY & TIMETABLE (Кабинеты)
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
  let currentLesson = null;
  if (currentDayIdx >= 0 && currentDayIdx < 5) {
    for (let p of TIMETABLE_DATA.periods) {
      const [sh, sm] = p.start.split(':').map(Number);
      const [eh, em] = p.end.split(':').map(Number);
      if (currentTotalMins >= sh * 60 + sm && currentTotalMins < eh * 60 + em) {
        if (roomSchedule[currentDayIdx] && roomSchedule[currentDayIdx][p.id]) {
          isCurrentlyBusy = true;
          currentLesson = roomSchedule[currentDayIdx][p.id];
        }
        break;
      }
    }
  }

  // Quick room chips
  const quickRooms = filteredRooms.slice(0, 16);

  // Build Grid Table
  let tableRowsHtml = '';
  for (const day of TIMETABLE_DATA.days) {
    const did = day.id;
    const daySched = roomSchedule[did] || {};

    let rowCellsHtml = `<th>${escapeHtml(day.short)}<span class="day-full">${escapeHtml(day.name)}</span></th>`;
    let skipUntil = 0;

    for (const period of TIMETABLE_DATA.periods) {
      const pid = period.id;
      if (pid <= skipUntil) continue;

      const slot = daySched[pid];
      if (!slot) {
        rowCellsHtml += `<td class="break-col"><div class="cell empty"><span class="cell-dash">—</span></div></td>`;
      } else {
        const dur = Math.max(1, slot.duration || 1);
        const safeDur = Math.min(dur, 9 - pid + 1);
        if (safeDur > 1) {
          skipUntil = pid + safeDur - 1;
        }

        const colspanAttr = safeDur > 1 ? ` colspan="${safeDur}"` : '';
        const groupsStr = slot.groups && slot.groups.length > 0 ? slot.groups.join(', ') : '';
        const teacherStr = slot.teachers && slot.teachers.length > 0 ? slot.teachers.join(', ') : '';
        const style = TimetableColors.lessonStyle(slot.subject);

        rowCellsHtml += `
          <td${colspanAttr}>
            <div class="cell">
              <div 
                class="lesson" 
                style="${style}"
                data-lesson-detail='${escapeHtml(JSON.stringify(slot))}'
                data-room-name="${escapeHtml(selectedRoom.name)}"
                data-day-name="${escapeHtml(day.name)}"
                data-period-str="${escapeHtml(slot.timeRange)}"
                title="Подробнее о занятии"
              >
                ${groupsStr ? `<div class="lesson-group">${escapeHtml(groupsStr)}</div>` : ''}
                <div class="lesson-subject">${escapeHtml(slot.subject)}</div>
                ${teacherStr ? `<div class="lesson-teacher">${escapeHtml(teacherStr)}</div>` : ''}
                ${safeDur > 1 ? `<div class="lesson-duration">${safeDur} ч · ${escapeHtml(slot.timeRange)}</div>` : ''}
              </div>
            </div>
          </td>
        `;
      }
    }

    tableRowsHtml += `<tr>${rowCellsHtml}</tr>`;
  }

  const html = `
    <!-- Controls Bar -->
    <div class="controls-card">
      <div class="controls-row">
        <div class="search-filter-group">
          <input 
            type="text" 
            class="search-input" 
            placeholder="Поиск аудитории (D201, Computer...)" 
            id="roomSearchInput" 
            value="${escapeHtml(state.roomSearchQuery)}"
          />

          <div class="filter-chips">
            <button class="chip-btn ${state.floorFilter === 'all' ? 'active' : ''}" data-filter-floor="all">Все этажи</button>
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

        <select class="select-dropdown" id="roomSelectDropdown" aria-label="Выбрать аудиторию">
          ${filteredRooms.map(r => `
            <option value="${r.id}" ${r.id === selectedRoom.id ? 'selected' : ''}>
              ${escapeHtml(r.name)} (${r.typeLabel})
            </option>
          `).join('')}
        </select>
      </div>

      <!-- Quick Room Chips -->
      <div class="quick-chips-row">
        ${quickRooms.map(r => `
          <button class="quick-chip ${r.id === selectedRoom.id ? 'active' : ''}" data-room-id="${r.id}">
            ${escapeHtml(r.short)}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Room Block -->
    <section class="grade-block" id="room-${escapeHtml(selectedRoom.id)}">
      <div class="grade-head">
        <div class="grade-head-info">
          <h2>${escapeHtml(selectedRoom.name)}</h2>
          <p>${selectedRoom.floor} этаж · ${selectedRoom.typeLabel} · British Management University</p>
        </div>
        <div class="grade-head-meta">
          <span class="badge ${isCurrentlyBusy ? 'badge-busy' : 'badge-free'}">
            ${isCurrentlyBusy ? `Сейчас занято: ${escapeHtml(currentLesson?.subject || '')}` : 'Сейчас свободно'}
          </span>
          <span class="badge badge-blue">Занятость: ${totalOccupiedHours}/45 ч (${occupancyPercent}%)</span>
        </div>
      </div>

      <div class="table-wrap">
        <table class="grid-table">
          <thead>
            <tr>
              <th class="corner-th">День</th>
              ${TIMETABLE_DATA.periods.map(p => `
                <th>
                  P${p.id}
                  <span class="time">${p.start}<br />${p.end}</span>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
    </section>
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
    updateUrlParams();
    renderApp();
  });

  document.querySelectorAll('[data-room-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedRoomId = btn.dataset.roomId;
      updateUrlParams();
      renderApp();
    });
  });

  // Modal open on lesson card click
  document.querySelectorAll('.lesson').forEach(card => {
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
   VIEW 3: ROOM FINDER (Свободные аудитории)
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

  const html = `
    <!-- Finder Controls Bar -->
    <div class="controls-card">
      <div class="finder-controls">
        <div class="control-field">
          <label for="finderDaySelect">День недели:</label>
          <select class="select-dropdown" id="finderDaySelect">
            ${TIMETABLE_DATA.days.map(d => `
              <option value="${d.id}" ${d.id === state.finderDay ? 'selected' : ''}>
                ${d.name}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="control-field">
          <label for="finderPeriodSelect">Пара / Время:</label>
          <select class="select-dropdown" id="finderPeriodSelect">
            ${TIMETABLE_DATA.periods.map(p => `
              <option value="${p.id}" ${p.id === state.finderPeriod ? 'selected' : ''}>
                Пара ${p.id} (${p.start}–${p.end})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="control-field">
          <label for="finderFloorSelect">Этаж:</label>
          <select class="select-dropdown" id="finderFloorSelect">
            <option value="all" ${state.finderFloorFilter === 'all' ? 'selected' : ''}>Все этажи</option>
            <option value="2" ${state.finderFloorFilter === '2' ? 'selected' : ''}>2 этаж</option>
            <option value="3" ${state.finderFloorFilter === '3' ? 'selected' : ''}>3 этаж</option>
            <option value="4" ${state.finderFloorFilter === '4' ? 'selected' : ''}>4 этаж</option>
            <option value="5" ${state.finderFloorFilter === '5' ? 'selected' : ''}>5 этаж</option>
          </select>
        </div>

        <div class="control-field">
          <label for="finderTypeSelect">Тип аудитории:</label>
          <select class="select-dropdown" id="finderTypeSelect">
            <option value="all" ${state.finderTypeFilter === 'all' ? 'selected' : ''}>Все типы</option>
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
        ${selectedDay.name} · Пара ${selectedPeriod.id} (${selectedPeriod.start}–${selectedPeriod.end})
      </div>
      <div class="finder-counts">
        <span class="badge badge-free">Свободно: ${freeRooms.length}</span>
        <span class="badge badge-busy">Занято: ${busyRooms.length}</span>
      </div>
    </div>

    <!-- 2 Columns Grid -->
    <div class="finder-grid">
      <!-- Free Rooms Column -->
      <div class="finder-column">
        <div class="finder-col-title">
          <span>Свободные аудитории</span>
          <span class="badge badge-free">${freeRooms.length}</span>
        </div>
        <div class="finder-cards-list">
          ${freeRooms.length === 0 ? `
            <div style="padding:16px; text-align:center; color:var(--muted); font-size:12px;">
              Нет свободных кабинетов
            </div>
          ` : freeRooms.map(r => `
            <div class="room-mini-card card-free" data-jump-room="${r.id}" title="Открыть расписание аудитории">
              <div class="room-mini-info">
                <div class="name">${escapeHtml(r.name)}</div>
                <div class="desc">${r.typeLabel} • ${r.floor} этаж</div>
              </div>
              <span class="badge badge-free">Свободно</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Busy Rooms Column -->
      <div class="finder-column">
        <div class="finder-col-title">
          <span>Занятые аудитории</span>
          <span class="badge badge-busy">${busyRooms.length}</span>
        </div>
        <div class="finder-cards-list">
          ${busyRooms.length === 0 ? `
            <div style="padding:16px; text-align:center; color:var(--muted); font-size:12px;">
              Все аудитории свободны
            </div>
          ` : busyRooms.map(item => `
            <div class="room-mini-card card-busy" data-jump-room="${item.room.id}" title="Открыть расписание аудитории">
              <div class="room-mini-info">
                <div class="name">${escapeHtml(item.room.name)}</div>
                <div class="desc" style="color:var(--ink); font-weight:600;">
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
      updateUrlParams();
      renderApp();
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

  const subject = data.subject || '—';
  const rooms = roomName || (data.rooms && data.rooms.length > 0 ? data.rooms.join(', ') : '—');
  const groups = data.groups && data.groups.length > 0 ? data.groups.join(', ') : '—';
  const teachers = data.teachers && data.teachers.length > 0 ? data.teachers.join(', ') : '—';
  const time = data.timeRange || periodStr || '—';
  const dur = data.duration || 1;
  const startP = data.startPeriod || 1;
  const endP = data.endPeriod || (startP + dur - 1);

  body.innerHTML = `
    <div class="detail-row">
      <span class="label">Дисциплина:</span>
      <span class="value" style="color:var(--blue);">${escapeHtml(subject)}</span>
    </div>
    <div class="detail-row">
      <span class="label">Аудитория:</span>
      <span class="value">${escapeHtml(rooms)}</span>
    </div>
    <div class="detail-row">
      <span class="label">День недели:</span>
      <span class="value">${escapeHtml(dayName || '')}</span>
    </div>
    <div class="detail-row">
      <span class="label">Время:</span>
      <span class="value">${escapeHtml(time)}</span>
    </div>
    <div class="detail-row">
      <span class="label">Группа:</span>
      <span class="value" style="color:var(--blue); font-weight:700;">${escapeHtml(groups)}</span>
    </div>
    <div class="detail-row">
      <span class="label">Преподаватель:</span>
      <span class="value">${escapeHtml(teachers)}</span>
    </div>
    <div class="detail-row">
      <span class="label">Длительность:</span>
      <span class="value">${dur} ${dur === 1 ? 'час' : 'часа'} (Пары ${startP}–${endP})</span>
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
