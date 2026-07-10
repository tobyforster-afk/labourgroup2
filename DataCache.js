/*************************************************************
 *
 * DATA CACHE V2
 *
 * Browser-first cache for Labour.Group.
 *
 * - Renders cached app data immediately.
 * - Refreshes stale data quietly in the background.
 * - Deduplicates simultaneous server requests.
 * - Persists safe screen data in sessionStorage.
 * - Warms likely meeting screens without flooding Apps Script.
 * - Keeps live polling and explicit force-refresh behaviour.
 *
 *************************************************************/

const LG_Data = {
  app: null,
  meetings: {},
  actionPlans: {},

  appLoadedAt: 0,
  meetingLoadedAt: {},
  actionPlanLoadedAt: {},

  loadingApp: false,
  appCallbacks: [],
  meetingCallbacks: {},
  actionPlanCallbacks: {},

  warmingMeetings: false,
  warmQueue: [],
  warmActive: 0,
  warmMaxConcurrent: 2,

  appMaxAgeMs: 5 * 60 * 1000,
  meetingMaxAgeMs: 10 * 60 * 1000,
  actionPlanMaxAgeMs: 2 * 60 * 1000,
  storageVersion: 2,

  actionPlanPollTimer: null,
  actionPlanPollPlanId: '',
  actionPlanPollSince: '',
  actionPlanPollBusy: false,
  actionPlanPollCallback: null,
  actionPlanPollIntervalMs: 5000,

  initialise() {
    this.restoreSessionCache();
  },

  clear() {
    this.stopActionPlanPolling();

    this.app = null;
    this.meetings = {};
    this.actionPlans = {};

    this.appLoadedAt = 0;
    this.meetingLoadedAt = {};
    this.actionPlanLoadedAt = {};

    this.loadingApp = false;
    this.appCallbacks = [];
    this.meetingCallbacks = {};
    this.actionPlanCallbacks = {};

    this.warmingMeetings = false;
    this.warmQueue = [];
    this.warmActive = 0;

    this.removeSessionCache();
  },

  /*************************************************************
   * STORAGE
   *************************************************************/

  getStorageKey() {
    const token = String(typeof getAuthToken === 'function' ? getAuthToken() : '').trim();
    return 'labourGroupDataCacheV' + this.storageVersion + ':' + token;
  },

  restoreSessionCache() {
    try {
      const raw = sessionStorage.getItem(this.getStorageKey());
      if (!raw) return;

      const saved = JSON.parse(raw);
      if (!saved || Number(saved.version) !== this.storageVersion) return;

      this.app = saved.app || null;
      this.meetings = saved.meetings || {};
      this.actionPlans = saved.actionPlans || {};

      this.appLoadedAt = Number(saved.appLoadedAt || 0);
      this.meetingLoadedAt = saved.meetingLoadedAt || {};
      this.actionPlanLoadedAt = saved.actionPlanLoadedAt || {};
    } catch (error) {
      this.removeSessionCache();
    }
  },

  persistSessionCache() {
    try {
      const payload = {
        version: this.storageVersion,
        savedAt: Date.now(),
        app: this.app,
        meetings: this.limitObject(this.meetings, this.meetingLoadedAt, 25),
        actionPlans: this.limitObject(this.actionPlans, this.actionPlanLoadedAt, 5),
        appLoadedAt: this.appLoadedAt,
        meetingLoadedAt: this.limitTimestamps(this.meetingLoadedAt, 25),
        actionPlanLoadedAt: this.limitTimestamps(this.actionPlanLoadedAt, 5)
      };

      sessionStorage.setItem(this.getStorageKey(), JSON.stringify(payload));
    } catch (error) {
      /* Storage is an optimisation only. */
    }
  },

  removeSessionCache() {
    try {
      sessionStorage.removeItem(this.getStorageKey());
    } catch (error) {}
  },

  limitObject(source, timestamps, limit) {
    const out = {};
    const keys = Object.keys(source || {})
      .sort((a, b) => Number((timestamps || {})[b] || 0) - Number((timestamps || {})[a] || 0))
      .slice(0, limit);

    keys.forEach(key => {
      out[key] = source[key];
    });

    return out;
  },

  limitTimestamps(source, limit) {
    const out = {};
    Object.keys(source || {})
      .sort((a, b) => Number(source[b] || 0) - Number(source[a] || 0))
      .slice(0, limit)
      .forEach(key => {
        out[key] = source[key];
      });
    return out;
  },

  isFresh(loadedAt, maxAgeMs) {
    const time = Number(loadedAt || 0);
    return time > 0 && Date.now() - time < maxAgeMs;
  },

  /*************************************************************
   * APP DATA
   *************************************************************/

  loadApp(callback, forceRefresh) {
    callback = typeof callback === 'function' ? callback : function() {};

    const hasCachedApp = !!this.app;
    const fresh = this.isFresh(this.appLoadedAt, this.appMaxAgeMs);

    /* Always make navigation immediate when we already have usable data. */
    if (hasCachedApp) {
      callback(this.app);
      this.warmUpcomingMeetings();

      if (!forceRefresh && fresh) {
        return;
      }

      /* A forced/stale refresh happens quietly after the cached render. */
      this.fetchApp(null, true);
      return;
    }

    this.fetchApp(callback, false);
  },

  fetchApp(callback, silent) {
    if (typeof callback === 'function') {
      this.appCallbacks.push(callback);
    }

    if (this.loadingApp) return;

    this.loadingApp = true;

    if (!silent) {
      setLoading('Loading Labour.Group...');
    }

    LG_API.run
      .withSuccessHandler(data => {
        this.loadingApp = false;
        this.app = data || {};
        this.appLoadedAt = Date.now();

        const callbacks = this.appCallbacks.slice();
        this.appCallbacks = [];

        callbacks.forEach(fn => {
          try {
            fn(this.app);
          } catch (error) {
            console.error(error);
          }
        });

        this.persistSessionCache();

        setTimeout(() => {
          this.warmUpcomingMeetings();
        }, 150);
      })
      .withFailureHandler(error => {
        this.loadingApp = false;
        this.appCallbacks = [];

        if (!silent || !this.app) {
          showError(error);
        }
      })
      .LabourGroup_getAppData(getAuthToken());
  },

  invalidateApp() {
    this.app = null;
    this.appLoadedAt = 0;
    this.persistSessionCache();
  },

  /*************************************************************
   * MEETINGS
   *************************************************************/

  getMeeting(meetingId, callback, forceRefresh) {
    const id = String(meetingId || '').trim();
    callback = typeof callback === 'function' ? callback : function() {};

    if (!id) {
      showError('Missing meeting ID.');
      return;
    }

    const cached = this.meetings[id];
    const fresh = this.isFresh(this.meetingLoadedAt[id], this.meetingMaxAgeMs);

    if (cached) {
      callback(cached);

      if (!forceRefresh && fresh) {
        return;
      }

      this.fetchMeeting(id, null, true);
      return;
    }

    this.fetchMeeting(id, callback, false);
  },

  fetchMeeting(meetingId, callback, silent) {
    const id = String(meetingId || '').trim();

    if (!this.meetingCallbacks[id]) {
      this.meetingCallbacks[id] = [];
    }

    if (typeof callback === 'function') {
      this.meetingCallbacks[id].push(callback);
    }

    if (this.meetingCallbacks[id].loading) return;
    this.meetingCallbacks[id].loading = true;

    if (!silent) {
      setLoading('Loading meeting...');
    }

    LG_API.run
      .withSuccessHandler(data => {
        const callbacks = (this.meetingCallbacks[id] || []).slice();
        delete this.meetingCallbacks[id];

        this.meetings[id] = data || {};
        this.meetingLoadedAt[id] = Date.now();
        this.persistSessionCache();

        callbacks.forEach(fn => {
          try {
            fn(this.meetings[id]);
          } catch (error) {
            console.error(error);
          }
        });
      })
      .withFailureHandler(error => {
        delete this.meetingCallbacks[id];
        if (!silent || !this.meetings[id]) {
          showError(error);
        }
      })
      .LabourGroup_getMeetingProfile(id, getAuthToken());
  },

  setMeeting(meetingId, data) {
    const id = String(meetingId || '').trim();
    if (!id) return;

    this.meetings[id] = data || {};
    this.meetingLoadedAt[id] = Date.now();
    this.persistSessionCache();
  },

  invalidateMeeting(meetingId) {
    const id = String(meetingId || '').trim();

    if (id) {
      delete this.meetings[id];
      delete this.meetingLoadedAt[id];
    }

    this.invalidateApp();
  },

  warmUpcomingMeetings() {
    if (this.warmingMeetings || !this.app) return;

    const meetings = this.app.upcomingMeetings || this.app.meetings || [];
    if (!meetings.length) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 45);

    this.warmQueue = meetings
      .filter(meeting => {
        const date = parseDataCacheDate(meeting.date);
        return date && date <= cutoff;
      })
      .map(meeting => String(meeting.id || '').trim())
      .filter(Boolean)
      .filter(id => !this.meetings[id] || !this.isFresh(this.meetingLoadedAt[id], this.meetingMaxAgeMs))
      .slice(0, 10);

    if (!this.warmQueue.length) return;

    this.warmingMeetings = true;
    this.pumpMeetingWarmQueue();
  },

  pumpMeetingWarmQueue() {
    while (this.warmActive < this.warmMaxConcurrent && this.warmQueue.length) {
      const id = this.warmQueue.shift();
      this.warmActive++;

      this.fetchMeetingForWarm(id, () => {
        this.warmActive--;

        if (!this.warmQueue.length && this.warmActive === 0) {
          this.warmingMeetings = false;
          return;
        }

        setTimeout(() => this.pumpMeetingWarmQueue(), 120);
      });
    }
  },

  fetchMeetingForWarm(meetingId, done) {
    const id = String(meetingId || '').trim();

    if (!id || this.meetingCallbacks[id]) {
      done();
      return;
    }

    this.meetingCallbacks[id] = [];
    this.meetingCallbacks[id].loading = true;

    LG_API.run
      .withSuccessHandler(data => {
        delete this.meetingCallbacks[id];
        this.meetings[id] = data || {};
        this.meetingLoadedAt[id] = Date.now();
        this.persistSessionCache();
        done();
      })
      .withFailureHandler(() => {
        delete this.meetingCallbacks[id];
        done();
      })
      .LabourGroup_getMeetingProfile(id, getAuthToken());
  },

  /*************************************************************
   * ACTION PLANS
   *************************************************************/

  getActionPlan(actionPlanId, callback, forceRefresh) {
    const id = String(actionPlanId || '').trim();
    callback = typeof callback === 'function' ? callback : function() {};

    if (!id) {
      showError('Missing action plan ID.');
      return;
    }

    const cached = this.actionPlans[id];
    const fresh = this.isFresh(this.actionPlanLoadedAt[id], this.actionPlanMaxAgeMs);

    if (cached) {
      callback(cached);

      if (!forceRefresh && fresh) return;

      this.fetchActionPlan(id, null, true);
      return;
    }

    this.fetchActionPlan(id, callback, false);
  },

  fetchActionPlan(actionPlanId, callback, silent) {
    const id = String(actionPlanId || '').trim();

    if (!this.actionPlanCallbacks[id]) {
      this.actionPlanCallbacks[id] = [];
    }

    if (typeof callback === 'function') {
      this.actionPlanCallbacks[id].push(callback);
    }

    if (this.actionPlanCallbacks[id].loading) return;
    this.actionPlanCallbacks[id].loading = true;

    if (!silent) {
      setLoading('Loading action plan...');
    }

    LG_API.run
      .withSuccessHandler(data => {
        const callbacks = (this.actionPlanCallbacks[id] || []).slice();
        delete this.actionPlanCallbacks[id];

        this.setActionPlan(id, data);

        callbacks.forEach(fn => {
          try {
            fn(this.actionPlans[id]);
          } catch (error) {
            console.error(error);
          }
        });
      })
      .withFailureHandler(error => {
        delete this.actionPlanCallbacks[id];
        if (!silent || !this.actionPlans[id]) {
          showError(error);
        }
      })
      .LabourGroup_getActionPlanProfile(id, getAuthToken());
  },

  setActionPlan(actionPlanId, data) {
    const id = String(
      actionPlanId ||
      (data && data.plan && (data.plan.actionPlanId || data.plan.id)) ||
      ''
    ).trim();

    if (!id) return;

    data = data || {};
    data.items = data.items || [];
    data.documents = data.documents || [];
    data.itemMap = {};
    data.latestUpdatedAt = String(data.lastChangedAt || data.latestUpdatedAt || '').trim();

    data.items.forEach(item => {
      const itemId = String(item.itemId || '').trim();
      if (itemId) data.itemMap[itemId] = item;

      const updatedAt = String(item.updatedAt || '').trim();
      if (updatedAt && updatedAt > data.latestUpdatedAt) {
        data.latestUpdatedAt = updatedAt;
      }
    });

    this.actionPlans[id] = data;
    this.actionPlanLoadedAt[id] = Date.now();
    this.persistSessionCache();
  },

  updateActionPlanItem(actionPlanId, item) {
    const id = String(actionPlanId || '').trim();
    const itemId = String(item && item.itemId ? item.itemId : '').trim();

    if (!id || !itemId || !this.actionPlans[id]) return;

    const plan = this.actionPlans[id];
    plan.items = plan.items || [];
    plan.itemMap = plan.itemMap || {};

    const existingIndex = plan.items.findIndex(row =>
      String(row.itemId || '').trim() === itemId
    );

    if (existingIndex >= 0) {
      plan.items[existingIndex] = Object.assign({}, plan.items[existingIndex], item);
      plan.itemMap[itemId] = plan.items[existingIndex];
    } else {
      plan.items.push(item);
      plan.itemMap[itemId] = item;
    }

    const updatedAt = String(item.updatedAt || '').trim();
    if (updatedAt && updatedAt > String(plan.latestUpdatedAt || '')) {
      plan.latestUpdatedAt = updatedAt;
    }

    this.actionPlanLoadedAt[id] = Date.now();
  },

  updateActionPlanItems(actionPlanId, items) {
    (items || []).forEach(item => this.updateActionPlanItem(actionPlanId, item));
    this.persistSessionCache();
  },

  invalidateActionPlan(actionPlanId) {
    const id = String(actionPlanId || '').trim();

    if (id) {
      delete this.actionPlans[id];
      delete this.actionPlanLoadedAt[id];
    }

    this.invalidateApp();
  },

  /*************************************************************
   * ACTION PLAN LIVE POLLING
   *************************************************************/

  startActionPlanPolling(actionPlanId, since, callback, intervalMs) {
    const id = String(actionPlanId || '').trim();
    if (!id) return;

    this.stopActionPlanPolling();

    this.actionPlanPollPlanId = id;
    this.actionPlanPollSince = String(since || '').trim();
    this.actionPlanPollCallback = typeof callback === 'function' ? callback : null;
    this.actionPlanPollIntervalMs = Math.max(3000, Number(intervalMs || 5000) || 5000);
    this.actionPlanPollBusy = false;

    this.actionPlanPollTimer = setInterval(() => {
      this.pollActionPlanChanges();
    }, this.actionPlanPollIntervalMs);
  },

  stopActionPlanPolling() {
    if (this.actionPlanPollTimer) {
      clearInterval(this.actionPlanPollTimer);
    }

    this.actionPlanPollTimer = null;
    this.actionPlanPollPlanId = '';
    this.actionPlanPollSince = '';
    this.actionPlanPollBusy = false;
    this.actionPlanPollCallback = null;
  },

  pollActionPlanChanges() {
    if (
      this.actionPlanPollBusy ||
      !this.actionPlanPollPlanId ||
      currentScreen !== 'actionPlan' ||
      document.hidden
    ) {
      return;
    }

    this.actionPlanPollBusy = true;

    LG_API.run
      .withSuccessHandler(result => {
        this.actionPlanPollBusy = false;
        result = result || {};

        const changedItems = result.items || result.changedItems || [];
        const latestUpdatedAt = String(
          result.lastChangedAt || result.latestUpdatedAt || ''
        ).trim();

        if (changedItems.length) {
          this.updateActionPlanItems(this.actionPlanPollPlanId, changedItems);

          if (this.actionPlanPollCallback) {
            this.actionPlanPollCallback(changedItems, result);
          }
        }

        if (latestUpdatedAt) {
          this.actionPlanPollSince = latestUpdatedAt;

          const cached = this.actionPlans[this.actionPlanPollPlanId];
          if (cached) {
            cached.latestUpdatedAt = latestUpdatedAt;
            cached.lastChangedAt = latestUpdatedAt;
          }
        }
      })
      .withFailureHandler(() => {
        this.actionPlanPollBusy = false;
      })
      .LabourGroup_getActionPlanChanges(
        this.actionPlanPollPlanId,
        this.actionPlanPollSince,
        getAuthToken()
      );
  }
};

function parseDataCacheDate(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (uk) {
    return new Date(Number(uk[3]), Number(uk[2]) - 1, Number(uk[1]));
  }

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return null;

  return parsed;
}

/* Restore any same-session cache before the first screen asks for data. */
LG_Data.initialise();
