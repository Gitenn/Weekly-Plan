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
  editingEventId: null,
  dateLocale: localStorage.getItem('rose-ribbon-date-locale') === 'en-GB' ? 'en-GB' : 'nb-NO',
  returnFocusTarget: null,
  returnFocusDate: null,
  pendingDeleteId: null
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
const eventEndTime = document.getElementById('event-end-time');
const eventDate = document.getElementById('event-date');
const viewedDate = document.getElementById('editor-date');
const eventCategory = document.getElementById('event-category');
const eventNote = document.getElementById('event-note');
const focusPlan = document.getElementById('focus-plan');
const saveEventButton = document.getElementById('save-event');
const cancelEditButton = document.getElementById('cancel-edit');
const eventFormHeading = document.getElementById('event-form-heading');
const endTimeField = document.getElementById('end-time-field');
const toggleEndTimeButton = document.getElementById('toggle-end-time');
const titleCount = document.getElementById('event-title-count');
const cancelEditorButton = document.getElementById('cancel-editor');
const closeEditorButton = document.getElementById('close-editor');

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

function formatDate(date, style = 'long') {
  const options = style === 'weekday'
    ? { weekday: 'short' }
    : style === 'day'
      ? { day: 'numeric' }
      : style === 'range'
        ? { weekday: 'long', day: 'numeric', month: 'long' }
        : { weekday: 'long', day: 'numeric', month: 'long' };
  const formatter = new Intl.DateTimeFormat(state.dateLocale, options);
  if (state.dateLocale !== 'en-GB' || (style !== 'long' && style !== 'range')) {
    return formatter.format(date);
  }

  const parts = formatter.formatToParts(date);
  const day = date.getDate();
  const pluralCategory = new Intl.PluralRules('en-GB', { type: 'ordinal' }).select(day);
  const suffix = pluralCategory === 'one' ? 'st' : pluralCategory === 'two' ? 'nd' : pluralCategory === 'few' ? 'rd' : 'th';
  return parts.map(part => part.type === 'day' ? `${part.value}${suffix}` : part.value).join('');
}

function dateLocaleAttribute() {
  return state.dateLocale === 'en-GB' ? 'en-GB' : 'nb-NO';
}

function parseDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) || keyFor(date) !== value ? null : date;
}

function formatEventTime(event) {
  if (event.time && event.endTime) return `${event.time}–${event.endTime}`;
  return event.time || '—';
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
  weekLabel.lang = dateLocaleAttribute();
  weekLabel.textContent = `${formatDate(start, 'range')} — ${formatDate(end, 'range')}`;

  weekGrid.innerHTML = days.map(date => {
    const key = keyFor(date);
    const events = sortedEvents(key);
    const plan = (state.schedule.plans || {})[key] || {};

    const visibleEvents = events.slice(0, 5);
    const compactEvents = events.length >= 4;
    const items = events.length
      ? visibleEvents.map(event => `
          <div class="event-item${compactEvents ? ' event-item--compact' : ''}">
            <span class="event-time" title="${escapeHtml(formatEventTime(event))}">${escapeHtml(formatEventTime(event))}</span>
            <span>
              <strong title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</strong>
            </span>
          </div>
        `).join('') + (events.length > visibleEvents.length
          ? `<button type="button" class="event-more" aria-label="${events.length - visibleEvents.length} more appointments on ${escapeHtml(formatDate(date))}, open day">+${events.length - visibleEvents.length} more</button>`
          : '')
      : '<div class="event-placeholder">A little breathing room</div>';

    return `
      <article class="day-card ${keyFor(new Date()) === key ? 'today' : ''}" data-date="${key}" tabindex="0" aria-label="${escapeHtml(formatDate(date))}">
        <div class="day-head">
          <div class="day-name" lang="${dateLocaleAttribute()}">${escapeHtml(formatDate(date, 'weekday'))}</div>
          <span class="day-date" lang="${dateLocaleAttribute()}" title="${escapeHtml(formatDate(date))}">${escapeHtml(formatDate(date, 'day'))}</span>
          ${keyFor(new Date()) === key ? '<span class="today-marker">Today</span>' : ''}
        </div>
        <div class="day-body">
          ${items}
        </div>
        <div class="focus-box">
          <span class="focus-label">Today's focus</span>
          <div class="focus-text" title="${escapeHtml(plan.focus || 'A quiet moment')}">${escapeHtml(plan.focus || 'A quiet moment')}</div>
        </div>
      </article>
    `;
  }).join('');

  weekGrid.querySelectorAll('.day-card').forEach(card => {
    card.addEventListener('click', event => {
      if (!event.target.closest('.event-more')) openEditor(card.dataset.date);
    });
    card.addEventListener('keydown', e => {
      if (e.target === card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openEditor(card.dataset.date);
      }
    });
  });

  weekGrid.querySelectorAll('.event-more').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openEditor(button.closest('.day-card').dataset.date);
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
  state.returnFocusTarget = document.activeElement;
  state.returnFocusDate = state.returnFocusTarget.closest?.('.day-card')?.dataset.date || null;
  state.editingEventId = null;
  eventForm.reset();
  clearFormErrors();
  setEndTimeVisible(false);
  eventFormHeading.textContent = 'Add an appointment';
  saveEventButton.textContent = 'Save appointment';
  cancelEditButton.hidden = true;
  eventDate.value = dateKey;
  setEditorDate(parseDateInput(dateKey) || new Date());
  editor.hidden = false;
  scrim.hidden = false;
  document.body.classList.add('editor-open');
  document.documentElement.classList.add('editor-open');
  eventTitle.focus();
  updateTitleCount();
}

function closeEditor() {
  editor.hidden = true;
  scrim.hidden = true;
  document.body.classList.remove('editor-open');
  document.documentElement.classList.remove('editor-open');
  state.editingEventId = null;
  state.pendingDeleteId = null;
  eventForm.reset();
  clearFormErrors();
  setEndTimeVisible(false);
  saveEventButton.textContent = 'Save appointment';
  eventFormHeading.textContent = 'Add an appointment';
  cancelEditButton.hidden = true;
  syncEditor();
  const target = state.returnFocusTarget;
  const fallback = state.returnFocusDate
    ? weekGrid.querySelector(`.day-card[data-date="${state.returnFocusDate}"]`)
    : document.getElementById('open-editor');
  state.returnFocusTarget = null;
  state.returnFocusDate = null;
  if (target?.isConnected) target.focus();
  else if (fallback?.isConnected) fallback.focus();
}

function syncEditor() {
  const key = keyFor(state.selectedDate);
  const items = sortedEvents(key);
  const plans = (state.schedule.plans || {})[key] || {};
  viewedDate.value = key;
  viewedDate.lang = dateLocaleAttribute();
  selectedDateNode.lang = dateLocaleAttribute();
  selectedDateNode.textContent = formatDate(state.selectedDate);
  if (!state.editingEventId) eventDate.value = key;
  eventList.innerHTML = items.length
    ? items.map(item => `
      <div class="event-item">
        <span class="event-time">${escapeHtml(formatEventTime(item))}</span>
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          ${item.category ? `<small>${escapeHtml(item.category)}</small>` : ''}
          ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}
          <div class="event-actions">
            <button type="button" class="btn btn--secondary btn--small" data-edit="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.title)}">Edit</button>
            ${state.pendingDeleteId === item.id
              ? `<span class="delete-confirmation">Delete?</span>
                 <button type="button" class="btn btn--quiet-destructive btn--small" data-confirm-delete="${escapeHtml(item.id)}" aria-label="Yes, delete ${escapeHtml(item.title)}">Yes</button>
                 <button type="button" class="btn btn--secondary btn--small" data-keep="${escapeHtml(item.id)}" aria-label="Keep ${escapeHtml(item.title)}">Keep it</button>`
              : `<button type="button" class="btn btn--quiet-destructive btn--small" data-delete="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.title)}">Delete</button>`}
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
    btn.addEventListener('click', () => {
      state.pendingDeleteId = btn.dataset.delete;
      syncEditor();
      eventList.querySelector('[data-confirm-delete]')?.focus();
    });
  });
  eventList.querySelectorAll('[data-confirm-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.pendingDeleteId = null;
      deleteEvent(btn.dataset.confirmDelete);
    });
  });
  eventList.querySelectorAll('[data-keep]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.pendingDeleteId = null;
      syncEditor();
    });
  });
}

function setEditorDate(date) {
  state.selectedDate = date;
  syncEditor();
}

function setEndTimeVisible(visible) {
  endTimeField.hidden = !visible;
  toggleEndTimeButton.setAttribute('aria-expanded', String(visible));
  toggleEndTimeButton.textContent = visible ? 'Remove end time' : 'Add end time';
  if (!visible) eventEndTime.value = '';
}

function clearFormErrors() {
  [
    ['event-title', 'event-title-error'],
    ['event-date', 'event-date-error'],
    ['event-time', 'event-time-error'],
    ['event-end-time', 'event-end-time-error']
  ].forEach(([fieldId, errorId]) => {
    clearFieldError(fieldId, errorId);
  });
}

function clearFieldError(fieldId, errorId) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  const describedBy = (field.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter(id => id && id !== errorId);
  if (describedBy.length) field.setAttribute('aria-describedby', describedBy.join(' '));
  else field.removeAttribute('aria-describedby');
  field.removeAttribute('aria-invalid');
  error.hidden = true;
  error.textContent = '';
}

function setFieldError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  const describedBy = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  describedBy.add(errorId);
  field.setAttribute('aria-describedby', [...describedBy].join(' '));
  field.setAttribute('aria-invalid', 'true');
  error.textContent = message;
  error.hidden = false;
}

function validateEventForm() {
  clearFormErrors();
  const invalidFields = [];
  if (!eventTitle.value.trim()) {
    setFieldError('event-title', 'event-title-error', 'Please enter a short title.');
    invalidFields.push(eventTitle);
  }
  if (!parseDateInput(eventDate.value)) {
    setFieldError('event-date', 'event-date-error', 'Please choose a valid date.');
    invalidFields.push(eventDate);
  }
  if (eventEndTime.value && !eventTime.value) {
    setFieldError('event-time', 'event-time-error', 'Add a start time before the end time.');
    invalidFields.push(eventTime);
  } else if (eventEndTime.value && eventEndTime.value <= eventTime.value) {
    setFieldError('event-end-time', 'event-end-time-error', 'End time must be later than start time.');
    invalidFields.push(eventEndTime);
  }
  if (invalidFields.length) invalidFields[0].focus();
  return invalidFields.length === 0;
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
  clearFormErrors();
  eventTitle.value = item.title || '';
  eventTime.value = item.time || '';
  eventEndTime.value = item.endTime || '';
  setEndTimeVisible(Boolean(item.endTime));
  eventDate.value = item.date || keyFor(state.selectedDate);
  eventCategory.value = item.category || 'Appointment';
  eventNote.value = item.note || '';
  updateTitleCount();
  saveEventButton.textContent = 'Save changes';
  eventFormHeading.textContent = 'Edit appointment';
  cancelEditButton.hidden = false;
  eventTitle.focus();
}

function handleEventSubmit(event) {
  event.preventDefault();
  if (!validateEventForm()) return;
  const title = eventTitle.value.trim();

  const payload = {
    id: state.editingEventId || `event-${Date.now()}`,
    date: eventDate.value,
    title,
    time: eventTime.value,
    category: eventCategory.value,
    note: eventNote.value.trim()
  };
  if (eventEndTime.value) payload.endTime = eventEndTime.value;

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

function updateTitleCount() {
  titleCount.textContent = `${eventTitle.value.length}/40`;
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

function setDateLocale(locale) {
  state.dateLocale = locale;
  localStorage.setItem('rose-ribbon-date-locale', locale);
  document.getElementById('language-no').setAttribute('aria-pressed', String(locale === 'nb-NO'));
  document.getElementById('language-en').setAttribute('aria-pressed', String(locale === 'en-GB'));
  renderWeek();
  if (!editor.hidden) syncEditor();
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
closeEditorButton.addEventListener('click', closeEditor);
cancelEditorButton.addEventListener('click', closeEditor);
scrim.addEventListener('click', closeEditor);

cancelEditButton.addEventListener('click', () => {
  state.editingEventId = null;
  eventForm.reset();
  clearFormErrors();
  setEndTimeVisible(false);
  eventDate.value = keyFor(state.selectedDate);
  updateTitleCount();
  saveEventButton.textContent = 'Save appointment';
  eventFormHeading.textContent = 'Add an appointment';
  cancelEditButton.hidden = true;
});

document.getElementById('previous-day').addEventListener('click', () => {
  const date = new Date(state.selectedDate);
  date.setDate(date.getDate() - 1);
  setEditorDate(date);
});

document.getElementById('next-day').addEventListener('click', () => {
  const date = new Date(state.selectedDate);
  date.setDate(date.getDate() + 1);
  setEditorDate(date);
});

viewedDate.addEventListener('change', () => {
  const date = parseDateInput(viewedDate.value);
  if (date) setEditorDate(date);
});

document.getElementById('language-no').addEventListener('click', () => setDateLocale('nb-NO'));
document.getElementById('language-en').addEventListener('click', () => setDateLocale('en-GB'));

toggleEndTimeButton.addEventListener('click', () => {
  const showEndTime = endTimeField.hidden;
  setEndTimeVisible(showEndTime);
  if (showEndTime) eventEndTime.focus();
  else {
    clearFieldError('event-end-time', 'event-end-time-error');
  }
});

eventTitle.addEventListener('input', updateTitleCount);
eventTitle.addEventListener('input', () => {
  if (eventTitle.value.trim()) {
    clearFieldError('event-title', 'event-title-error');
  }
});

eventDate.addEventListener('change', () => {
  if (parseDateInput(eventDate.value)) {
    clearFieldError('event-date', 'event-date-error');
  }
});

eventTime.addEventListener('change', () => {
  if (!eventEndTime.value || (eventTime.value && eventEndTime.value > eventTime.value)) {
    clearFieldError('event-time', 'event-time-error');
    clearFieldError('event-end-time', 'event-end-time-error');
  }
});

eventEndTime.addEventListener('change', () => {
  if (eventEndTime.value && eventTime.value && eventEndTime.value > eventTime.value) {
    clearFieldError('event-time', 'event-time-error');
    clearFieldError('event-end-time', 'event-end-time-error');
  }
});

editor.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeEditor();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...editor.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hidden && element.getClientRects().length > 0);
  if (!focusable.length) {
    event.preventDefault();
    closeEditorButton.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !editor.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !editor.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
});

eventForm.addEventListener('submit', handleEventSubmit);
plansForm.addEventListener('submit', handlePlanSubmit);
document.getElementById('language-no').setAttribute('aria-pressed', String(state.dateLocale === 'nb-NO'));
document.getElementById('language-en').setAttribute('aria-pressed', String(state.dateLocale === 'en-GB'));
updateTitleCount();
state.selectedDate = new Date();
renderWeek();
refreshSchedule();
window.setInterval(refreshSchedule, 10000);
