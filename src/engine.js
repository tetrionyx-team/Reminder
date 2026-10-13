'use strict';
const CHARACTERS = ['character1', 'character2', 'character3', 'character4', 'character5', 'character6', 'character7', 'character8'];
const defaults = { 
  userName: 'Friend', 
  interval: 45, 
  customIntervalMinutes: 75, 
  reminderTime: '10:00',
  pauseWhenInactive: true, 
  inactivityThresholdMinutes: 12, 
  reminderCharacter: 'character1', 
  cheerMessage: 'Nice! 💙',
  autoStartOnBoot: true 
};

const DEFAULT_HEALTH_REMINDERS = [
  {
    id: 'health_water',
    userName: 'Water Hydration',
    cheerMessage: 'Drink a fresh glass of water! Stay hydrated & energized 💧',
    interval: 45,
    customIntervalMinutes: 45,
    reminderTime: '10:00',
    reminderCharacter: 'character2',
    enabled: true
  },
  {
    id: 'health_screen_break',
    userName: 'Screen & Eye Rest',
    cheerMessage: 'Rest your eyes! Look 20ft away & take a deep breath 👀✨',
    interval: 60,
    customIntervalMinutes: 60,
    reminderTime: '11:30',
    reminderCharacter: 'character1',
    enabled: true
  },
  {
    id: 'health_lunch',
    userName: 'Lunch Time',
    cheerMessage: 'Time for healthy lunch! Nourish your body & relax 🥗🍱',
    interval: 'time',
    customIntervalMinutes: 60,
    reminderTime: '13:00',
    reminderCharacter: 'character3',
    enabled: true
  },
  {
    id: 'health_posture',
    userName: 'Posture & Stretch',
    cheerMessage: 'Stand up, roll your shoulders & stretch your back! 🧘‍♂️',
    interval: 90,
    customIntervalMinutes: 90,
    reminderTime: '16:00',
    reminderCharacter: 'character4',
    enabled: true
  },
  {
    id: 'health_sleep',
    userName: 'Night Sleep Time',
    cheerMessage: 'Turn off screens & get peaceful, restful sleep 🌙😴',
    interval: 'time',
    customIntervalMinutes: 60,
    reminderTime: '22:30',
    reminderCharacter: 'character5',
    enabled: true
  }
];

function clamp(value, min, max, fallback) { 
  const n = Number(value); 
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback; 
}

function validate(input = {}) {
  let char = input.reminderCharacter;
  const base = {
    userName: typeof input.userName === 'string' ? input.userName.slice(0, 80) : defaults.userName,
    interval: [45, 60, 90, 120, 'custom', 'time'].includes(input.interval) ? input.interval : 45,
    customIntervalMinutes: clamp(input.customIntervalMinutes, 1, 1440, 75),
    reminderTime: typeof input.reminderTime === 'string' && /^\d{1,2}:\d{2}$/.test(input.reminderTime) ? input.reminderTime : defaults.reminderTime,
    pauseWhenInactive: typeof input.pauseWhenInactive === 'boolean' ? input.pauseWhenInactive : true,
    inactivityThresholdMinutes: clamp(input.inactivityThresholdMinutes, 1, 120, 12),
    reminderCharacter: CHARACTERS.includes(char) ? char : defaults.reminderCharacter,
    cheerMessage: typeof input.cheerMessage === 'string' ? input.cheerMessage.slice(0, 120) : defaults.cheerMessage,
    autoStartOnBoot: typeof input.autoStartOnBoot === 'boolean' ? input.autoStartOnBoot : true
  };

  let inputReminders = Array.isArray(input.reminders) ? input.reminders.filter(Boolean) : null;
  let reminders;

  if (!inputReminders || inputReminders.length === 0) {
    reminders = DEFAULT_HEALTH_REMINDERS.map(r => ({ ...r }));
  } else {
    reminders = inputReminders.map((r, i) => ({
      id: typeof r.id === 'string' ? r.id : 'rem_' + (i + 1) + '_' + Math.random().toString(36).slice(2, 6),
      userName: typeof r.userName === 'string' && r.userName.trim() ? r.userName.trim().slice(0, 80) : '',
      cheerMessage: typeof r.cheerMessage === 'string' && r.cheerMessage.trim() ? r.cheerMessage.trim().slice(0, 120) : '',
      interval: [45, 60, 90, 120, 'custom', 'time'].includes(r.interval) ? r.interval : base.interval,
      customIntervalMinutes: clamp(r.customIntervalMinutes, 1, 1440, base.customIntervalMinutes),
      reminderTime: typeof r.reminderTime === 'string' && /^\d{1,2}:\d{2}$/.test(r.reminderTime) ? r.reminderTime : base.reminderTime,
      reminderCharacter: CHARACTERS.includes(r.reminderCharacter) ? r.reminderCharacter : base.reminderCharacter,
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true
    })).filter(r => Boolean(r.userName && r.cheerMessage));
  }

  const activeRem = reminders[0] || base;
  return {
    ...base,
    userName: activeRem.userName || base.userName,
    cheerMessage: activeRem.cheerMessage || base.cheerMessage,
    interval: activeRem.interval,
    customIntervalMinutes: activeRem.customIntervalMinutes,
    reminderTime: activeRem.reminderTime || base.reminderTime,
    reminderCharacter: activeRem.reminderCharacter,
    reminders
  };
}

/**
 * Calculates which reminder is currently due or upcoming next from the current time.
 */
function findCurrentOrNextReminder(settings, clock = Date.now) {
  const activeReminders = Array.isArray(settings.reminders) && settings.reminders.length > 0
    ? settings.reminders.filter(r => r.enabled !== false && r.userName && r.cheerMessage)
    : [];

  if (activeReminders.length === 0) return null;

  const now = new Date(clock());
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const msSinceMidnight = Math.max(0, now.getTime() - midnight);

  const candidates = activeReminders.map((r, idx) => {
    if (r.interval === 'time' && r.reminderTime) {
      const [hStr, mStr] = String(r.reminderTime).split(':');
      const h = parseInt(hStr, 10) || 0;
      const m = parseInt(mStr, 10) || 0;
      let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0).getTime();
      
      // If time was within the last 2 minutes, it's due right now!
      if (now.getTime() - target >= 2 * 60000) {
        // Already passed earlier today, next occurrence is tomorrow
        target += 24 * 60 * 60000;
      }
      const dueInMs = Math.max(1000, target - now.getTime());
      return { reminder: r, index: idx, dueInMs, nextTimestamp: target, type: 'time' };
    } else {
      // Interval-based calculation
      const mins = r.interval === 'custom' ? (Number(r.customIntervalMinutes) || 10) : (Number(r.interval) || 45);
      const intervalMs = Math.max(1, mins) * 60000;

      // Next interval boundary from midnight
      const totalSlots = Math.floor(msSinceMidnight / intervalMs);
      const nextBoundary = midnight + (totalSlots + 1) * intervalMs;
      let dueInMs = Math.max(1000, nextBoundary - now.getTime());

      if (activeReminders.length > 1) {
        const slotIndexForList = totalSlots % activeReminders.length;
        if (idx !== slotIndexForList) {
          const steps = (idx - slotIndexForList + activeReminders.length) % activeReminders.length;
          dueInMs += steps * intervalMs;
        }
      }

      return { 
        reminder: r, 
        index: idx, 
        dueInMs: Math.max(1000, dueInMs), 
        nextTimestamp: now.getTime() + dueInMs, 
        type: 'interval' 
      };
    }
  });

  // Sort candidate reminders by due time
  candidates.sort((a, b) => a.dueInMs - b.dueInMs);
  return candidates[0] || null;
}

class ReminderEngine {
  constructor(settings, onReminder, clock = Date.now) {
    this.settings = settings;
    this.onReminder = onReminder;
    this.clock = clock;
    this.paused = false;
    this.inactive = false;
    this.remaining = null;
    this.currentReminder = null;
    this.currentReminderIndex = 0;
    this.schedule();
  }

  hasActiveReminders() {
    return Array.isArray(this.settings.reminders) && this.settings.reminders.some(r => r.enabled !== false && r.userName && r.cheerMessage);
  }

  getCurrentSchedule() {
    return findCurrentOrNextReminder(this.settings, this.clock);
  }

  interval() {
    const sched = this.getCurrentSchedule();
    if (sched) return Math.max(1000, sched.dueInMs);
    const activeReminders = Array.isArray(this.settings.reminders) && this.settings.reminders.length > 0
      ? this.settings.reminders.filter(r => r.enabled !== false)
      : [];
    if (activeReminders.length > 0) {
      const mins = activeReminders.map(r => (r.interval === 'custom' ? r.customIntervalMinutes : r.interval === 'time' ? 60 : r.interval));
      const minInterval = Math.min(...mins);
      return (Number.isFinite(minInterval) && minInterval > 0 ? minInterval : 45) * 60000;
    }
    return (this.settings.interval === 'custom' ? this.settings.customIntervalMinutes : this.settings.interval === 'time' ? 60 : this.settings.interval) * 60000;
  }

  get suspended() { 
    return this.paused || this.inactive || !this.hasActiveReminders(); 
  }

  snapshot() {
    const hasRem = this.hasActiveReminders();
    let status = 'empty';
    if (hasRem) {
      status = this.paused ? 'paused' : this.inactive ? 'inactive' : 'active';
    }
    const sched = hasRem ? this.getCurrentSchedule() : null;
    let remaining = 0;
    if (hasRem) {
      if (this.suspended) {
        remaining = this.remaining ?? (sched ? sched.dueInMs : this.interval());
      } else {
        remaining = (typeof this.next === 'number' && Number.isFinite(this.next)) ? Math.max(0, this.next - this.clock()) : (sched ? sched.dueInMs : this.interval());
      }
    }
    return {
      status,
      hasReminders: hasRem,
      remaining: Math.max(0, Math.round(Number(remaining) || 0)),
      next: hasRem ? (this.next || (this.clock() + remaining)) : 0,
      currentReminder: this.currentReminder || (sched ? sched.reminder : null),
      currentReminderIndex: this.currentReminderIndex
    };
  }

  setSuspension(key, value) {
    const was = this.suspended;
    if (this[key] === value) return;
    if (!was) this.remaining = Math.max(0, this.next - this.clock());
    this[key] = value;
    if (was && !this.suspended) {
      this.next = this.clock() + (this.remaining ?? this.interval());
      this.remaining = null;
    }
  }

  togglePause() { this.setSuspension('paused', !this.paused); }
  setInactive(value) { this.setSuspension('inactive', value); }

  schedule(delay = null) {
    if (!this.hasActiveReminders()) {
      this.remaining = null;
      this.currentReminder = null;
      return;
    }
    const sched = this.getCurrentSchedule();
    if (!sched) {
      this.remaining = null;
      return;
    }
    this.currentReminder = sched.reminder;
    this.currentReminderIndex = sched.index;

    const finalDelay = delay !== null ? delay : Math.max(1000, sched.dueInMs);
    this.next = this.clock() + finalDelay;
    if (this.suspended) this.remaining = finalDelay;
    else this.remaining = null;
  }

  update(settings) {
    this.settings = settings;
    if (this.hasActiveReminders()) {
      this.schedule();
    } else {
      this.remaining = null;
      this.currentReminder = null;
    }
    if (!settings.pauseWhenInactive) this.setInactive(false);
  }

  trigger() {
    if (!this.hasActiveReminders()) return;
    const sched = this.getCurrentSchedule();
    if (sched) {
      this.currentReminder = sched.reminder;
      this.currentReminderIndex = sched.index;
    }
    const remToPresent = this.currentReminder;
    // Schedule for next reminder:
    this.schedule();
    this.onReminder(remToPresent);
  }

  tick() {
    if (!this.hasActiveReminders()) return;
    if (!this.suspended && this.clock() >= this.next) this.trigger();
  }
}

module.exports = { defaults, validate, ReminderEngine, findCurrentOrNextReminder, CHARACTERS };
