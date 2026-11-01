import { localDateKey, normalizeFocus, secondsLeft, startTimer, pauseTimer, resetTimer, chooseDuration, finishTimer } from './focus-state.js';

export function createFocusDashboard({ getState, update, notify }) {
  const $ = selector => document.querySelector(selector);
  const run = fn => async event => { try { await fn(event); } catch (error) { notify(error.message, true); } };
  let completing = false, zen = false, previousDate = '', draftDate = localDateKey(), lastClock = '';
  const focusState = () => getState()?.focus || normalizeFocus();

  function updateClock() {
    const now = new Date(), today = localDateKey(now);
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (time !== lastClock) { $('#dashboardClock').textContent = time; $('#dashboardClock').dateTime = now.toISOString(); lastClock = time; }
    if (today !== previousDate) {
      $('#dashboardDate').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      $('#dayLabel').textContent = now.toLocaleDateString([], { weekday: 'long' }).toUpperCase() + ' / YOUR SPACE TO THINK';
      previousDate = today;
    }
    const hour = now.getHours();
    $('#greeting').textContent = hour < 12 ? 'A fresh start. A clear mind.' : hour < 18 ? 'Make room for what matters.' : 'A little space to slow down.';
  }

  function render() {
    const state = getState(); if (!state) return;
    updateClock(); const focus = focusState(), today = localDateKey();
    $('#focusPanel').hidden = !state.settings.showFocusPanel && !zen;
    const note = focus.intentionDate === today ? focus.intention : '';
    if (document.activeElement !== $('#dailyIntention')) { $('#dailyIntention').value = note; draftDate = today; }
    const sessions = focus.sessionDate === today ? focus.completedSessions : 0;
    $('#focusSessionCount').textContent = `${sessions} session${sessions === 1 ? '' : 's'} today`;
    const preset = `${focus.mode}:${focus.durationMinutes}`;
    if (document.activeElement !== $('#timerPreset') && !$('#customTimer').contains(document.activeElement)) {
      $('#timerPreset').value = [...$('#timerPreset').options].some(option => option.value === preset) ? preset : 'custom';
    }
    tick();
  }

  function tick() {
    if (!getState()) return;
    updateClock();
    const focus = focusState(), remaining = secondsLeft(focus);
    $('#timerTime').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    $('#timerState').textContent = focus.running ? focus.mode === 'break' ? 'Take a breath' : 'One thing at a time' : remaining < focus.durationMinutes * 60 ? 'Paused. No rush.' : focus.mode === 'break' ? 'Ready for a break' : 'Ready to focus';
    $('#timerToggle').textContent = focus.running ? 'Pause' : remaining < focus.durationMinutes * 60 ? 'Resume' : focus.mode === 'break' ? 'Start break' : 'Start focus';
    $('#timerToggle').setAttribute('aria-label', focus.running ? 'Pause timer' : remaining < focus.durationMinutes * 60 ? 'Resume timer' : 'Start timer');
    $('.timer-dial').style.setProperty('--timer-progress', Math.max(0, Math.min(1, remaining / (focus.durationMinutes * 60))));
    $('#timerPreset').disabled = focus.running;
    const today = localDateKey();
    const sessions = focus.sessionDate === today ? focus.completedSessions : 0;
    $('#focusSessionCount').textContent = `${sessions} session${sessions === 1 ? '' : 's'} today`;
    if (draftDate !== today && document.activeElement !== $('#dailyIntention')) { $('#dailyIntention').value = focus.intentionDate === today ? focus.intention : ''; draftDate = today; }
    if (focus.running && remaining === 0 && !completing) {
      completing = true;
      let finished = false;
      update(state => { finished = finishTimer(state.focus); }).then(() => {
        if (finished) notify(focus.mode === 'break' ? 'Break complete. Ready when you are.' : 'Focus session complete. Take a moment to recharge.');
      }).catch(error => notify(error.message, true)).finally(() => { completing = false; });
    }
  }

  async function saveIntention() {
    const note = $('#dailyIntention').value, date = draftDate;
    if (focusState().intention === note && focusState().intentionDate === date) return;
    $('#intentionStatus').textContent = 'Saving…';
    try { await update(state => { state.focus.intention = note; state.focus.intentionDate = date; }); $('#intentionStatus').textContent = 'Saved. Make a little room for it.'; }
    catch (error) { $('#intentionStatus').textContent = 'Could not save. Your note is still here.'; throw error; }
  }

  $('#intentionForm').addEventListener('submit', run(async event => { event.preventDefault(); await saveIntention(); }));
  $('#dailyIntention').addEventListener('input', () => { draftDate = localDateKey(); $('#intentionStatus').textContent = 'Press Enter or leave this field to save.'; });
  $('#dailyIntention').addEventListener('blur', run(saveIntention));
  $('#timerPreset').addEventListener('change', run(async event => {
    const value = event.target.value;
    $('#customTimer').hidden = value !== 'custom';
    if (value === 'custom') { $('#customMinutes').value = focusState().durationMinutes; $('#customMinutes').focus(); return; }
    const [mode, minutes] = value.split(':');
    await update(state => chooseDuration(state.focus, mode, Number(minutes)));
  }));
  const actions = {
    toggle: () => update(state => { if (state.focus.running) pauseTimer(state.focus); else startTimer(state.focus); }),
    reset: () => update(state => resetTimer(state.focus)),
    custom: async () => { const minutes = Number($('#customMinutes').value); await update(state => chooseDuration(state.focus, state.focus.mode, minutes)); $('#customTimer').hidden = true; },
    zen: () => {
      zen = !zen; document.body.classList.toggle('zen-mode', zen);
      const button = $('[data-focus-action="zen"]'); button.setAttribute('aria-pressed', String(zen));
      button.innerHTML = zen ? '<span aria-hidden="true">↙</span> Exit focus mode <kbd>Esc</kbd>' : '<span aria-hidden="true">↗</span> Enter focus mode';
      render();
    },
  };
  document.addEventListener('click', run(async event => { const button = event.target.closest('[data-focus-action]'); if (button && actions[button.dataset.focusAction]) await actions[button.dataset.focusAction](); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && zen && !$('#modal').open) { actions.zen(); $('[data-focus-action="zen"]').focus(); } });
  setInterval(tick, 250);
  return { render };
}
