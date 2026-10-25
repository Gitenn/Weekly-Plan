const savedSchedule = window.ROSE_RIBBON_DATA || {};

function parseWeekStart(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime()) || date.getDay() !== 1 || keyFor(date) !== value) return null;
  return date;
}

const state = {
  schedule: {
    events: Array.isArray(savedSchedule.events) ? savedSchedule.events : [],
    plans: savedSchedule.plans && typeof savedSchedule.plans === 'object' ? savedSchedule.plans : {},
    showWeekends: false,
    displayWeek: parseWeekStart(savedSchedule.displayWeek) ? savedSchedule.displayWeek : null
  },
  currentWeekStart: parseWeekStart(savedSchedule.displayWeek) || mondayOf(new Date()),
  selectedDate: new Date(),
  editingEventId: null
};

const scheduleUrl = 'http://127.0.0.1:41731/api/schedule';

const weekGrid = document.getElementById('week-grid');
const weekLabel = document.getElementById('week-label');
const statusNode = document.getElementById('status');
const editor = document.getElementById('editor');
const scrim = document.getElementById('scrim');
const eventList = document.getElementById('event-list');
const selectedDateNode = document.getElementById('selected-date');
const eventForm = document.getElementById('event-form');
const plansForm = document.getElementById('plans-form');
const eventTitle = document.getElementById('event-title');
const eventTime = document.getElementById('event-time');
const eventCategory = document.getElementById('event-category');
const eventNote = document.getElementById('event-note');
const focusPlan = document.getElementById('focus-plan');
const saveEventButton = document.getElementById('save-event');
const cancelEditButton = document.getElementById('cancel-edit');
const eventFormHeading = document.getElementById('event-form-heading');

function keyFor(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function renderStatus(message) {
  statusNode.textContent = message === 'Synced' || message === 'Saved' ? '' : message;
}

function sortedEvents(dateKey) {
  return [...(state.schedule.events || [])]
    .filter(event => event.date === dateKey)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}

function weekDates() {
  const monday = state.currentWeekStart;
  const days = [];
  for (let i = 0; i < 5; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function renderWeek() {
  const days = weekDates();
  const start = days[0];
  const end = days[days.length - 1];
  weekLabel.textContent = `${formatShortDate(start)} — ${formatShortDate(end)}`;

  weekGrid.innerHTML = days.map(date => {
    const key = keyFor(date);
    const events = sortedEvents(key);
    const plan = (state.schedule.plans || {})[key] || {};

    const visibleEvents = events.slice(0, 2);
    const items = events.length
      ? visibleEvents.map(event => `
          <div class="event-item">
            <span class="event-time">${escapeHtml(event.time || '—')}</span>
            <span>
              <strong>${escapeHtml(event.title)}</strong>
            </span>
          </div>
        `).join('') + (events.length > visibleEvents.length
          ? `<div class="event-more">+ ${events.length - visibleEvents.length} more in your day</div>`
          : '')
      : '<div class="event-placeholder">A little breathing room</div>';

    return `
      <article class="day-card ${keyFor(new Date()) === key ? 'today' : ''}" data-date="${key}" tabindex="0" role="button">
        <div class="day-head">
          <div class="day-name">${new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)}</div>
          <span class="day-date">${formatShortDate(date)}</span>
        </div>
        <div class="day-body">
          ${items}
          <div class="focus-box">
            <span class="focus-label">Today's focus</span>
            <div>${escapeHtml(plan.focus || 'A quiet moment')}</div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  weekGrid.querySelectorAll('.day-card').forEach(card => {
    card.addEventListener('click', () => openEditor(card.dataset.date));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openEditor(card.dataset.date);
      }
    });
  });
}

function refreshSchedule() {
  return fetch(scheduleUrl, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('Server unavailable');
      return r.json();
    })
    .then(data => {
      state.schedule = {
        events: Array.isArray(data.events) ? data.events : [],
        plans: data.plans && typeof data.plans === 'object' ? data.plans : {},
        showWeekends: false,
        displayWeek: parseWeekStart(data.displayWeek) ? data.displayWeek : null
      };
      state.currentWeekStart = parseWeekStart(data.displayWeek) || state.currentWeekStart;
      renderStatus('Synced');
      renderWeek();
      if (!editor.hidden) syncEditor();
      return data;
    })
    .catch(() => {
      renderStatus('Using last saved schedule');
      console.error('Could not refresh planner schedule.');
      renderWeek();
      return null;
    });
}

function openEditor(dateKey) {
  state.selectedDate = new Date(dateKey);
  selectedDateNode.textContent = formatLongDate(state.selectedDate);
  syncEditor();
  editor.hidden = false;
  scrim.hidden = false;
  eventTitle.focus();
}

function closeEditor() {
  editor.hidden = true;
  scrim.hidden = true;
  state.editingEventId = null;
  eventForm.reset();
  saveEventButton.textContent = 'Add appointment';
  eventFormHeading.textContent = 'Add an appointment';
  cancelEditButton.hidden = true;
  syncEditor();
}

function syncEditor() {
  const key = keyFor(state.selectedDate);
  const items = sortedEvents(key);
  const plans = (state.schedule.plans || {})[key] || {};
  eventList.innerHTML = items.length
    ? items.map(item => `
      <div class="event-item">
        <span class="event-time">${escapeHtml(item.time || '—')}</span>
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          ${item.category ? `<small>${escapeHtml(item.category)}</small>` : ''}
          ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}
          <div class="form-actions">
            <button type="button" data-edit="${item.id}">Edit</button>
            <button type="button" data-delete="${item.id}">Delete</button>
          </div>
        </span>
      </div>
    `).join('')
    : '<p class="empty-state">No appointments yet.</p>';

  focusPlan.value = plans.focus || '';

  eventList.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => startEditing(btn.dataset.edit));
  });
  eventList.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteEvent(btn.dataset.delete));
  });
}

function saveSchedule() {
  return fetch(scheduleUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.schedule)
  }).then(async res => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Could not save.');
    }
    renderStatus('Saved');
  });
}

function startEditing(eventId) {
  const item = (state.schedule.events || []).find(e => e.id === eventId);
  if (!item) return;
  state.editingEventId = eventId;
  eventTitle.value = item.title || '';
  eventTime.value = item.time || '';
  eventCategory.value = item.category || 'Appointment';
  eventNote.value = item.note || '';
  saveEventButton.textContent = 'Save changes';
  eventFormHeading.textContent = 'Edit appointment';
  cancelEditButton.hidden = false;
  eventTitle.focus();
}

function handleEventSubmit(event) {
  event.preventDefault();
  const title = eventTitle.value.trim();
  if (!title) return;

  const key = keyFor(state.selectedDate);
  const payload = {
    id: state.editingEventId || `event-${Date.now()}`,
    date: key,
    title,
    time: eventTime.value,
    category: eventCategory.value,
    note: eventNote.value.trim()
  };

  const existing = [...(state.schedule.events || [])];
  if (state.editingEventId) {
    const idx = existing.findIndex(item => item.id === state.editingEventId);
    if (idx >= 0) existing[idx] = payload;
  } else {
    existing.push(payload);
  }
  state.schedule.events = existing;

  saveSchedule()
    .then(() => refreshSchedule())
    .then(() => closeEditor())
    .catch(err => renderStatus(err.message || 'Save failed'));
}

function deleteEvent(eventId) {
  state.schedule.events = (state.schedule.events || []).filter(item => item.id !== eventId);
  saveSchedule()
    .then(() => refreshSchedule())
    .catch(err => renderStatus(err.message || 'Delete failed'));
}

function handlePlanSubmit(event) {
  event.preventDefault();
  const key = keyFor(state.selectedDate);
  const plans = { ...(state.schedule.plans || {}) };
  const next = focusPlan.value.trim();

  if (next) {
    plans[key] = { ...(plans[key] || {}), focus: next };
  } else {
    const copy = { ...(plans[key] || {}) };
    delete copy.focus;
    if (Object.keys(copy).length) {
      plans[key] = copy;
    } else {
      delete plans[key];
    }
  }

  state.schedule.plans = plans;
  saveSchedule()
    .then(() => refreshSchedule())
    .catch(err => renderStatus(err.message || 'Plan save failed'));
}

function setDisplayedWeek(weekStart) {
  state.currentWeekStart = mondayOf(weekStart);
  state.schedule.displayWeek = keyFor(state.currentWeekStart);
  renderWeek();
  saveSchedule().catch(err => renderStatus(err.message || 'Could not sync displayed week'));
}

document.getElementById('previous-week').addEventListener('click', () => {
  const weekStart = new Date(state.currentWeekStart);
  weekStart.setDate(weekStart.getDate() - 7);
  setDisplayedWeek(weekStart);
});

document.getElementById('next-week').addEventListener('click', () => {
  const weekStart = new Date(state.currentWeekStart);
  weekStart.setDate(weekStart.getDate() + 7);
  setDisplayedWeek(weekStart);
});

document.getElementById('this-week').addEventListener('click', () => {
  setDisplayedWeek(mondayOf(new Date()));
});

document.getElementById('open-editor').addEventListener('click', () => openEditor(keyFor(state.currentWeekStart)));
document.getElementById('close-editor').addEventListener('click', closeEditor);
scrim.addEventListener('click', closeEditor);

cancelEditButton.addEventListener('click', () => {
  state.editingEventId = null;
  eventForm.reset();
  saveEventButton.textContent = 'Add appointment';
  eventFormHeading.textContent = 'Add an appointment';
  cancelEditButton.hidden = true;
});

eventForm.addEventListener('submit', handleEventSubmit);
plansForm.addEventListener('submit', handlePlanSubmit);
state.selectedDate = new Date();
renderWeek();
refreshSchedule();
window.setInterval(refreshSchedule, 10000);
