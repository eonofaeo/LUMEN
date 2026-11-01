// Pure timer state helpers shared by persistence, imports, UI, and checks.
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function normalizeFocus(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const durationMinutes = Number.isFinite(raw.durationMinutes) && raw.durationMinutes >= 1 ? raw.durationMinutes : 25;
  const remainingSeconds = Number.isFinite(raw.remainingSeconds) && raw.remainingSeconds >= 0 ? raw.remainingSeconds : durationMinutes * 60;
  const endAt = Number.isFinite(raw.endAt) && raw.endAt > 0 ? raw.endAt : null;
  return {
    mode: raw.mode === 'break' ? 'break' : 'focus',
    durationMinutes,
    remainingSeconds,
    running: raw.running === true && endAt !== null,
    endAt,
    intention: typeof raw.intention === 'string' ? raw.intention.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '') : '',
    intentionDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.intentionDate || '') ? raw.intentionDate : localDateKey(),
    completedSessions: Number.isSafeInteger(raw.completedSessions) && raw.completedSessions >= 0 ? raw.completedSessions : 0,
    sessionDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.sessionDate || '') ? raw.sessionDate : localDateKey(),
    lastCompletedAt: Number.isFinite(raw.lastCompletedAt) ? raw.lastCompletedAt : 0,
  };
}

export function secondsLeft(focus, now = Date.now()) {
  return Math.max(0, Math.ceil(focus.running ? (focus.endAt - now) / 1000 : focus.remainingSeconds));
}

export function startTimer(focus, now = Date.now()) {
  if (focus.running) return;
  if (focus.remainingSeconds <= 0) focus.remainingSeconds = focus.durationMinutes * 60;
  focus.endAt = now + focus.remainingSeconds * 1000;
  focus.running = true;
}

export function finishTimer(focus, now = Date.now()) {
  if (!focus.running || focus.endAt > now) return false;
  if (focus.mode === 'focus') {
    const today = localDateKey(new Date(now));
    focus.completedSessions = focus.sessionDate === today ? focus.completedSessions + 1 : 1;
    focus.sessionDate = today;
  }
  focus.running = false;
  focus.endAt = null;
  focus.remainingSeconds = focus.durationMinutes * 60;
  focus.lastCompletedAt = now;
  return true;
}

export function pauseTimer(focus, now = Date.now()) {
  if (finishTimer(focus, now)) return;
  focus.remainingSeconds = secondsLeft(focus, now);
  focus.running = false;
  focus.endAt = null;
}

export function resetTimer(focus) {
  focus.running = false;
  focus.endAt = null;
  focus.remainingSeconds = focus.durationMinutes * 60;
}

export function chooseDuration(focus, mode, minutes) {
  if (!Number.isFinite(minutes) || minutes < 1) throw new Error('Choose a duration of at least one minute.');
  focus.mode = mode === 'break' ? 'break' : 'focus';
  focus.durationMinutes = minutes;
  resetTimer(focus);
}
