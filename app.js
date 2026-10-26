const savedSchedule = window.ROSE_RIBBON_DATA || {};
function emptyDefaultPlans() {
  return { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] };
}

function weekdayKeyForDate(date) {
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][date.getDay()];
}

function parseWeekStart(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime()) || date.getDay() !== 1 || keyFor(date) !== value) return null;
  return date;
}

const state = {
  schedule: {
    version: Number.isInteger(savedSchedule.version) ? savedSchedule.version : 2,
    revision: Number.isInteger(savedSchedule.revision) ? savedSchedule.revision : 0,
    events: Array.isArray(savedSchedule.events) ? savedSchedule.events : [],
    plans: savedSchedule.plans && typeof savedSchedule.plans === 'object' ? savedSchedule.plans : {},
    defaultPlans: savedSchedule.defaultPlans && typeof savedSchedule.defaultPlans === 'object' ? savedSchedule.defaultPlans : { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] },
    daySettings: savedSchedule.daySettings && typeof savedSchedule.daySettings === 'object' ? savedSchedule.daySettings : {},
    showWeekends: false,
    displayWeek: parseWeekStart(savedSchedule.displayWeek) ? savedSchedule.displayWeek : null
  },
  currentWeekStart: parseWeekStart(savedSchedule.displayWeek) || mondayOf(new Date()),
  selectedDate: new Date(),
  editingEventId: null,
  editingDefaultWeekday: null,
  editorTab: 'specific',
  defaultWeekday: ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()],
  dateLocale: localStorage.getItem('rose-ribbon-date-locale') === 'en-GB' ? 'en-GB' : 'nb-NO',
  returnFocusTarget: null,
  returnFocusDate: null,
  pendingDeleteId: null,
  pendingDefaultDeleteId: null,
  dayModeMessage: ''
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
const DEFAULT_FOCUS = [
  'Rose',       // Sunday
  'Jasmine',    // Monday
  'Bergamot',   // Tuesday
  'Neroli',     // Wednesday
  'Yuzu',       // Thursday
  'Vetiver',    // Friday
  'Tea'         // Saturday
];
function defaultFocus(date) {
  const value = DEFAULT_FOCUS[date.getDay()];
  return value || 'A quiet moment';
}
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
        ? { day: 'numeric', month: 'short' }
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
  if (event.time && event.endTime) return `${event.time}â€“${event.endTime}`;
  return event.time || 'â€”';
}
function timeSpanHtml(item) {
  if (!item || !item.time) return '';
  return `<span class="event-time">${escapeHtml(formatEventTime(item))}</span>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function renderStatus(message) {
  if (message === 'Synced') {
    statusNode.textContent = 'Live';
    statusNode.style.opacity = '0.6';
  } else if (message === 'Saved') {
    statusNode.textContent = '';
  } else {
    statusNode.textContent = message;
    statusNode.style.opacity = '1';
  }
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
    const customMode = isCustomMode(key);
    const defaultMode = isDefaultMode(key);
    const weekday = weekdayKeyForDate(date);
    const events = customMode ? sortedEvents(key) : (defaultMode ? sortedDefaultItems(weekday) : sortedEvents(key));
    const plan = (state.schedule.plans || {})[key] || {};

    const visibleEvents = events.slice(0, 5);
    const compactEvents = events.length >= 4;
    const items = events.length
      ? visibleEvents.map(event => `
          <div class="event-item${compactEvents ? ' event-item--compact' : ''}${defaultMode ? ' event-item--default' : ''}">
            ${event.time ? `<span class="event-time" title="${escapeHtml(formatEventTime(event))}">${escapeHtml(formatEventTime(event))}</span>` : ''}
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
          <div class="focus-text" title="${escapeHtml(plan.focus || defaultFocus(date))}">${escapeHtml(plan.focus || defaultFocus(date))}</div>
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

const isWallpaperMode = window.location.protocol === 'file:';

function refreshSchedule() {
  return fetch(scheduleUrl, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('Server unavailable');
      return r.json();
    })
    .then(data => {
      state.schedule = {
        version: Number.isInteger(data.version) ? data.version : state.schedule.version,
        revision: Number.isInteger(data.revision) ? data.revision : state.schedule.revision,
        events: Array.isArray(data.events) ? data.events : [],
        plans: data.plans && typeof data.plans === 'object' ? data.plans : {},
        defaultPlans: data.defaultPlans && typeof data.defaultPlans === 'object' ? data.defaultPlans : state.schedule.defaultPlans,
        daySettings: data.daySettings && typeof data.daySettings === 'object' ? data.daySettings : state.schedule.daySettings,
        showWeekends: false,
        displayWeek: isWallpaperMode ? null : (parseWeekStart(data.displayWeek) ? data.displayWeek : null)
      };
      if (!isWallpaperMode) {
        state.currentWeekStart = parseWeekStart(data.displayWeek) || state.currentWeekStart;
      } else {
        state.currentWeekStart = mondayOf(new Date());
      }
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
  state.editorTab = 'specific';
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
  const plans = (state.schedule.plans || {})[key] || {};
  viewedDate.value = key;
  viewedDate.lang = dateLocaleAttribute();
  selectedDateNode.lang = dateLocaleAttribute();
  selectedDateNode.textContent = formatDate(state.selectedDate);
  if (!state.editingEventId) eventDate.value = key;

  // Tabs
  const tabDefault = document.getElementById('tab-default');
  const tabSpecific = document.getElementById('tab-specific');
  const panelDefault = document.getElementById('panel-default');
  const panelSpecific = document.getElementById('panel-specific');
  if (tabDefault && tabSpecific && panelDefault && panelSpecific) {
    const isDefaultTab = state.editorTab === 'default';
    tabDefault.setAttribute('aria-selected', String(isDefaultTab));
    tabSpecific.setAttribute('aria-selected', String(!isDefaultTab));
    tabDefault.tabIndex = isDefaultTab ? 0 : -1;
    tabSpecific.tabIndex = isDefaultTab ? -1 : 0;
    panelDefault.hidden = !isDefaultTab;
    panelSpecific.hidden = isDefaultTab;
  }

  // Weekday chips
  document.querySelectorAll('.chip').forEach(chip => {
    const wd = chip.dataset.weekday;
    chip.setAttribute('aria-pressed', String(wd === state.defaultWeekday));
    chip.classList.toggle('chip--active', wd === state.defaultWeekday);
  });

  // Default tab list
  const defaultList = document.getElementById('default-event-list');
  if (defaultList) {
    const items = sortedDefaultItems(state.defaultWeekday);
    defaultList.innerHTML = items.length
      ? items.map(item => `
        <div class="event-item">
          ${timeSpanHtml(item)}
          <span>
            <strong>${escapeHtml(item.title)}</strong>
            ${item.category ? `<small>${escapeHtml(item.category)}</small>` : ''}
            ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}
            <div class="event-actions">
              <button type="button" class="btn btn--secondary btn--small" data-default-edit="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.title)}">Edit</button>
              ${state.pendingDefaultDeleteId === item.id
                ? `<span class="delete-confirmation">Delete?</span>
                   <button type="button" class="btn btn--quiet-destructive btn--small" data-default-confirm-delete="${escapeHtml(item.id)}" aria-label="Yes, delete ${escapeHtml(item.title)}">Yes</button>
                   <button type="button" class="btn btn--secondary btn--small" data-default-keep="${escapeHtml(item.id)}" aria-label="Keep ${escapeHtml(item.title)}">Keep it</button>`
                : `<button type="button" class="btn btn--quiet-destructive btn--small" data-default-delete="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.title)}">Delete</button>`}
            </div>
          </span>
        </div>
      `).join('')
      : '<p class="empty-state">No default items yet.</p>';
    defaultList.querySelectorAll('[data-default-edit]').forEach(btn => {
      btn.addEventListener('click', () => startEditingDefault(btn.dataset.defaultEdit));
    });
    defaultList.querySelectorAll('[data-default-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.pendingDefaultDeleteId = btn.dataset.defaultDelete;
        syncEditor();
      });
    });
    defaultList.querySelectorAll('[data-default-confirm-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.pendingDefaultDeleteId = null;
        deleteDefaultItem(btn.dataset.defaultConfirmDelete);
      });
    });
    defaultList.querySelectorAll('[data-default-keep]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.pendingDefaultDeleteId = null;
        syncEditor();
      });
    });
  }

  // Specific tab
  const specificList = document.getElementById('specific-event-list');
  const defaultPreview = document.getElementById('default-preview');
  const useDefaultSwitch = document.getElementById('use-default-switch');
  const startFromDefaultBtn = document.getElementById('start-from-default');
  const dayModeMessage = document.getElementById('day-mode-message');
  const customMode = isCustomMode(key);
  const defaultMode = !customMode;
  if (useDefaultSwitch) {
    useDefaultSwitch.setAttribute('aria-checked', String(defaultMode));
    useDefaultSwitch.classList.toggle('switch--on', defaultMode);
  }
  if (dayModeMessage) {
    if (state.dayModeMessage) {
      dayModeMessage.textContent = state.dayModeMessage;
      dayModeMessage.hidden = false;
    } else {
      dayModeMessage.hidden = true;
    }
  }
  if (defaultPreview) {
    if (defaultMode) {
      const ditems = sortedDefaultItems(weekdayKeyForDate(state.selectedDate));
      defaultPreview.hidden = ditems.length === 0;
      defaultPreview.innerHTML = ditems.length
        ? ditems.map(item => `
          <div class="event-item event-item--default">
            ${timeSpanHtml(item)}
            <span><strong>${escapeHtml(item.title)}</strong></span>
          </div>
        `).join('')
        : '';
    } else {
      defaultPreview.hidden = true;
      defaultPreview.innerHTML = '';
    }
  }
  if (specificList) {
    const items = customMode ? sortedEvents(key) : [];
    specificList.innerHTML = customMode
      ? (items.length ? items.map(item => `
        <div class="event-item">
          ${timeSpanHtml(item)}
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
      `).join('') : '<p class="empty-state">No appointments yet.</p>')
      : '';
    specificList.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => startEditing(btn.dataset.edit));
    });
    specificList.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.pendingDeleteId = btn.dataset.delete;
        syncEditor();
      });
    });
    specificList.querySelectorAll('[data-confirm-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.pendingDeleteId = null;
        deleteEvent(btn.dataset.confirmDelete);
      });
    });
    specificList.querySelectorAll('[data-keep]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.pendingDeleteId = null;
        syncEditor();
      });
    });
  }
  if (startFromDefaultBtn) {
    const customWithZero = customMode && sortedEvents(key).length === 0;
    startFromDefaultBtn.hidden = !customWithZero;
  }
  // Form date field visibility
  const dateField = document.getElementById('event-date-field');
  if (dateField) dateField.hidden = state.editorTab === 'default';

  if (document.activeElement !== focusPlan) {
    focusPlan.value = plans.focus || '';
  }

  // Plan save button binding handled separately
}function setEditorDate(date) {
  state.dayModeMessage = '';
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
  if (state.editorTab !== 'default' && !parseDateInput(eventDate.value)) {
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

function startEditingDefault(itemId) {
  const weekday = state.defaultWeekday;
  const item = (state.schedule.defaultPlans[weekday] || []).find(e => e.id === itemId);
  if (!item) return;
  state.editingEventId = itemId;
  clearFormErrors();
  eventTitle.value = item.title || '';
  eventTime.value = item.time || '';
  eventEndTime.value = item.endTime || '';
  setEndTimeVisible(Boolean(item.endTime));
  eventCategory.value = item.category || 'Appointment';
  eventNote.value = item.note || '';
  updateTitleCount();
  saveEventButton.textContent = 'Save changes';
  eventFormHeading.textContent = 'Edit default item';
  cancelEditButton.hidden = false;
  eventTitle.focus();
}

function deleteDefaultItem(itemId) {
  const weekday = state.defaultWeekday;
  const list = (state.schedule.defaultPlans[weekday] || []).filter(item => item.id !== itemId);
  state.schedule.defaultPlans = { ...(state.schedule.defaultPlans || {}), [weekday]: list };
  state.pendingDefaultDeleteId = null;
  saveSchedule()
    .then(() => refreshSchedule())
    .catch(err => renderStatus(err.message || 'Delete failed'));
}


function handleEventSubmit(event) {
  event.preventDefault();
  if (!validateEventForm()) return;
  const title = eventTitle.value.trim();

  if (state.editorTab === 'default') {
    const weekday = state.defaultWeekday;
    const list = [...(state.schedule.defaultPlans[weekday] || [])];
    const payload = {
      id: state.editingEventId || `default-${Date.now()}`,
      title,
      time: eventTime.value,
      category: eventCategory.value,
      note: eventNote.value.trim()
    };
    if (eventEndTime.value) payload.endTime = eventEndTime.value;
    if (state.editingEventId) {
      const idx = list.findIndex(item => item.id === state.editingEventId);
      if (idx >= 0) list[idx] = payload;
    } else {
      list.push(payload);
    }
    state.schedule.defaultPlans = { ...(state.schedule.defaultPlans || emptyDefaultPlans()), [weekday]: list };
    saveSchedule()
      .then(() => refreshSchedule())
      .then(() => {
        state.editingEventId = null;
        eventForm.reset();
        clearFormErrors();
        setEndTimeVisible(false);
        saveEventButton.textContent = 'Save appointment';
        eventFormHeading.textContent = 'Add an appointment';
        cancelEditButton.hidden = true;
        syncEditor();
      })
      .catch(err => renderStatus(err.message || 'Save failed'));
    return;
  }

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

  // Adding/editing a custom event switches that day to custom mode.
  const daySettings = { ...(state.schedule.daySettings || {}) };
  daySettings[eventDate.value] = { useDefault: false };
  state.schedule.daySettings = daySettings;

  // Follow the edited day's week so the new event is visible.
  state.currentWeekStart = mondayOf(parseDateInput(eventDate.value) || new Date());
  state.schedule.displayWeek = keyFor(state.currentWeekStart);

  saveSchedule()
    .then(() => refreshSchedule())
    .then(() => {
      state.editingEventId = null;
      eventForm.reset();
      clearFormErrors();
      setEndTimeVisible(false);
      saveEventButton.textContent = 'Save appointment';
      eventFormHeading.textContent = 'Add an appointment';
      cancelEditButton.hidden = true;
      closeEditor();
    })
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
// Tab switching
function setEditorTab(tab) {
  state.editorTab = tab;
  state.editingEventId = null;
  eventForm.reset();
  clearFormErrors();
  setEndTimeVisible(false);
  saveEventButton.textContent = 'Save appointment';
  eventFormHeading.textContent = 'Add an appointment';
  cancelEditButton.hidden = true;
  syncEditor();
}
const tabDefaultBtn = document.getElementById('tab-default');
const tabSpecificBtn = document.getElementById('tab-specific');
if (tabDefaultBtn) tabDefaultBtn.addEventListener('click', () => setEditorTab('default'));
if (tabSpecificBtn) tabSpecificBtn.addEventListener('click', () => setEditorTab('specific'));

// Arrow-key support for tabs
const tabList = document.querySelector('.editor-tabs');
if (tabList) {
  tabList.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setEditorTab(state.editorTab === 'default' ? 'specific' : 'default');
    const nextTab = state.editorTab === 'default' ? tabDefaultBtn : tabSpecificBtn;
    nextTab?.focus();
  });
}

// Weekday chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    state.defaultWeekday = chip.dataset.weekday;
    state.editingEventId = null;
    eventForm.reset();
    clearFormErrors();
    setEndTimeVisible(false);
    syncEditor();
  });
});

// Copy to all weekdays
const copyAllBtn = document.getElementById('copy-default-all');
if (copyAllBtn) {
  copyAllBtn.addEventListener('click', () => {
    const items = state.schedule.defaultPlans[state.defaultWeekday] || [];
    const copy = items.map(item => ({ ...item, id: `default-${Date.now()}-${Math.random().toString(16).slice(2)}` }));
    const next = { ...(state.schedule.defaultPlans || emptyDefaultPlans()) };
    ['monday','tuesday','wednesday','thursday','friday'].forEach(wd => { next[wd] = copy.map(i => ({ ...i })); });
    state.schedule.defaultPlans = next;
    saveSchedule().then(() => refreshSchedule()).catch(err => renderStatus(err.message || 'Save failed'));
  });
}

// Switch
const useDefaultSwitch = document.getElementById('use-default-switch');
if (useDefaultSwitch) {
  useDefaultSwitch.addEventListener('click', () => {
    const key = keyFor(state.selectedDate);
    const custom = isCustomMode(key);
    const daySettings = { ...(state.schedule.daySettings || {}) };
    if (custom) {
      // switch ON: keep custom items, hide them
      daySettings[key] = { useDefault: true };
      const hasCustom = (state.schedule.events || []).some(e => e.date === key);
      state.dayModeMessage = hasCustom ? 'Your own plans for this day are kept, just hidden.' : '';
    } else {
      // switch OFF: custom mode
      daySettings[key] = { useDefault: false };
      state.dayModeMessage = '';
    }
    state.schedule.daySettings = daySettings;
    saveSchedule().then(() => refreshSchedule()).then(() => {
      if (custom) {
        // keep message visible after refresh? reset after next sync? keep state
      } else {
        state.dayModeMessage = '';
      }
      syncEditor();
    }).catch(err => renderStatus(err.message || 'Save failed'));
  });
}

// Start from default
const startFromDefaultBtn = document.getElementById('start-from-default');
if (startFromDefaultBtn) {
  startFromDefaultBtn.addEventListener('click', () => {
    const key = keyFor(state.selectedDate);
    const weekday = weekdayKeyForDate(state.selectedDate);
    const defaults = sortedDefaultItems(weekday);
    const copies = defaults.map(item => ({
      id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date: key,
      title: item.title,
      time: item.time,
      category: item.category,
      note: item.note,
      ...(item.endTime ? { endTime: item.endTime } : {})
    }));
    const daySettings = { ...(state.schedule.daySettings || {}) };
    daySettings[key] = { useDefault: false };
    state.schedule.daySettings = daySettings;
    state.schedule.events = [...(state.schedule.events || []), ...copies];
    state.dayModeMessage = '';
    saveSchedule().then(() => refreshSchedule()).catch(err => renderStatus(err.message || 'Save failed'));
  });
}

// Save day plan button
const saveDayPlanBtn = document.getElementById('save-day-plan');
if (saveDayPlanBtn) {
  saveDayPlanBtn.addEventListener('click', () => handlePlanSubmit(new Event('submit')));
}

// clear dayModeMessage on date change? Keep simple.

// plansForm no longer submits
// eventForm already bound

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
// plansForm no longer submits; save-day-plan button handles it
document.getElementById('language-no').setAttribute('aria-pressed', String(state.dateLocale === 'nb-NO'));
document.getElementById('language-en').setAttribute('aria-pressed', String(state.dateLocale === 'en-GB'));
updateTitleCount();
state.selectedDate = new Date();
renderWeek();
refreshSchedule();
window.setInterval(refreshSchedule, 5000);




function isCustomMode(dateKey) {
  return !!(state.schedule.daySettings && state.schedule.daySettings[dateKey] && state.schedule.daySettings[dateKey].useDefault === false);
}

function isDefaultMode(dateKey) {
  const date = parseDateInput(dateKey);
  const weekday = date ? weekdayKeyForDate(date) : null;
  return !!weekday && ['monday','tuesday','wednesday','thursday','friday'].includes(weekday) && !isCustomMode(dateKey);
}

function defaultItemsForWeekday(weekday) {
  if (!weekday || !state.schedule.defaultPlans || !state.schedule.defaultPlans[weekday]) return [];
  return state.schedule.defaultPlans[weekday];
}

function sortedDefaultItems(weekday) {
  return [...defaultItemsForWeekday(weekday)].sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
}

function itemsForDate(dateKey) {
  if (isCustomMode(dateKey)) return sortedEvents(dateKey);
  const date = parseDateInput(dateKey);
  const weekday = date ? weekdayKeyForDate(date) : null;
  if (!weekday || !['monday','tuesday','wednesday','thursday','friday'].includes(weekday)) return sortedEvents(dateKey);
  return sortedDefaultItems(weekday);
}



