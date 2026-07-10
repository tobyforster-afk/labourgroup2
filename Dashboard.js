/*************************************************************
 *
 * DASHBOARD
 *
 *************************************************************/

function showDashboard(forceRefresh) {
  currentScreen = 'dashboard';

  closeMenu();
  hideBackButton();

  LG_Data.loadApp(
    renderDashboard,
    forceRefresh === true
  );
}

function renderDashboard(data) {
  data = data || {};
  data.stats = data.stats || {};
  data.attendance = data.attendance || {};
  data.dashboardMeetingLists = data.dashboardMeetingLists || {};

  const meetings = filterDashboardMeetings(data.upcomingMeetings || []);
  const isCouncillor = data.isCouncillorLogin === true;

  document.getElementById('content').innerHTML = `
    <section class="page dashboard-page">

      <h1>Dashboard</h1>

      <p class="lede">
        Welcome, ${escapeHtml((data.user && data.user.displayName) || 'there')}.
      </p>

      <p class="cache-note">
        Cache refreshed:
        ${escapeHtml(data.cacheLastRefreshed || 'Never')}
      </p>

      ${renderDashboardAttendanceStrip(data.attendance)}

      <div class="dashboard-section-label">Overview</div>

      <div class="dashboard-widget-grid dashboard-widget-grid-neutral">

        <button class="dashboard-widget dashboard-widget-neutral" onclick="showCouncillors()">
          <span>${escapeHtml(data.stats.labourCouncillors || 0)}</span>
          <strong>Labour Members</strong>
        </button>

        <button class="dashboard-widget dashboard-widget-neutral" onclick="showMeetings()">
          <span>${escapeHtml(data.stats.meetings || 0)}</span>
          <strong>${isCouncillor ? 'My Meetings' : 'Meetings'}</strong>
        </button>

        <button class="dashboard-widget dashboard-widget-neutral" onclick="showActionPlans()">
          <span>${escapeHtml(data.stats.actionReports || 0)}</span>
          <strong>Action Reports</strong>
        </button>

      </div>

      <div class="dashboard-section-label">Needs attention</div>

      <div class="dashboard-widget-grid dashboard-widget-grid-action">

        <button class="dashboard-widget dashboard-widget-amber" onclick="showDashboardMeetingList('apologies')">
          <span>${escapeHtml(data.stats.meetingsWithApologies || 0)}</span>
          <strong>Meetings with Apologies</strong>
        </button>

        <button class="dashboard-widget dashboard-widget-red" onclick="showDashboardMeetingList('absences')">
          <span>${escapeHtml(data.stats.meetingsWithAbsences || 0)}</span>
          <strong>Meetings with Absences</strong>
        </button>

        <button class="dashboard-widget dashboard-widget-blue" onclick="showDashboardMeetingList('substitutes')">
          <span>${escapeHtml(data.stats.meetingsWithSubstitutes || 0)}</span>
          <strong>Meetings with Subs</strong>
        </button>

      </div>

      ${renderDashboardMonthlyPanels(meetings, isCouncillor)}

    </section>
  `;
}

function renderDashboardAttendanceStrip(attendance) {
  attendance = attendance || {};

  if (!attendance.expected && !attendance.attended && !attendance.apologies && !attendance.absent && !attendance.subbed) {
    return '';
  }

  return `
    <section class="dashboard-attendance-card">
      <div class="dashboard-attendance-head">
        <div>
          <strong>${escapeHtml(attendance.title || 'Attendance')}</strong>
          <span>${escapeHtml(attendance.subtitle || 'Current civic year to today')}</span>
        </div>

        <div class="dashboard-attendance-score">
          ${escapeHtml(formatDashboardAttendancePercent(attendance.percentage))}
        </div>
      </div>

      <div class="dashboard-attendance-grid">
        ${renderDashboardAttendanceMetric('Expected', attendance.expected)}
        ${renderDashboardAttendanceMetric('Attended', attendance.attended)}
        ${renderDashboardAttendanceMetric('Apologies', attendance.apologies)}
        ${renderDashboardAttendanceMetric('Absent', attendance.absent)}
        ${renderDashboardAttendanceMetric('Subbed', attendance.subbed)}
      </div>
    </section>
  `;
}

function renderDashboardAttendanceMetric(label, value) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || 0)}</strong>
    </div>
  `;
}

function formatDashboardAttendancePercent(value) {
  const number = Number(value || 0);

  if (!number) {
    return '0%';
  }

  return (Number.isInteger(number) ? String(number) : number.toFixed(1)) + '%';
}

function showDashboardMeetingList(type) {
  currentScreen = 'dashboardMeetingList';

  closeMenu();
  showBackButton();

  LG_Data.loadApp(function(data) {
    renderDashboardMeetingList(type, data || {});
  });
}

function renderDashboardMeetingList(type, data) {
  data = data || {};
  const lists = data.dashboardMeetingLists || {};
  const meetings = filterDashboardMeetings(lists[type] || []);
  const config = getDashboardMeetingListConfig(type);

  document.getElementById('content').innerHTML = `
    <section class="page dashboard-filter-page">
      <h1>${escapeHtml(config.title)}</h1>
      <p class="lede">${escapeHtml(config.lede)}</p>

      <div class="card dashboard-filter-card">
        ${renderDashboardFilteredMeetings(meetings, type)}
      </div>
    </section>
  `;
}

function getDashboardMeetingListConfig(type) {
  if (type === 'absences') {
    return {
      title: 'Meetings with Absences',
      lede: 'Upcoming meetings where one or more members are marked absent.'
    };
  }

  if (type === 'substitutes') {
    return {
      title: 'Meetings with Substitutes',
      lede: 'Upcoming meetings where a substitute has been assigned.'
    };
  }

  return {
    title: 'Meetings with Apologies',
    lede: 'Upcoming meetings where one or more members have apologies marked.'
  };
}

function renderDashboardFilteredMeetings(meetings, type) {
  if (!meetings || !meetings.length) {
    return `<p>No matching meetings found.</p>`;
  }

  return `
    <div class="dashboard-meeting-panel">
      ${meetings.map(meeting => renderDashboardFilteredMeetingRow(meeting, type)).join('')}
    </div>
  `;
}

function renderDashboardFilteredMeetingRow(m, type) {
  return `
    <button class="dashboard-meeting-row dashboard-filter-row" onclick="showMeeting('${escapeJs(m.id)}')">

      <div class="meeting-icon ${getDashboardMeetingIconClass(type)}">${getDashboardMeetingIcon(type)}</div>

      <div class="meeting-text">
        <strong>${escapeHtml(m.committeeTitle || m.title || 'Meeting')}</strong>
        <span>${escapeHtml(formatDashboardMeetingDate(m.date))}${m.time ? ' · ' + escapeHtml(m.time) : ''}</span>
        <span>${escapeHtml(getDashboardMeetingIssueSummary(m, type))}</span>
      </div>

      <em>›</em>

    </button>
  `;
}

function getDashboardMeetingIssueSummary(m, type) {
  if (type === 'absences') {
    return formatDashboardIssuePeople(m.absentMembers || [], 'absent');
  }

  if (type === 'substitutes') {
    const subs = (m.substitutedMembers || []).map(row => {
      const original = cleanDashboardPersonName(row.name || '');
      const sub = cleanDashboardPersonName(row.substituteName || '');

      return sub && original
        ? sub + ' for ' + original
        : (sub || original);
    }).filter(Boolean);

    if (subs.length) {
      return subs.join(', ');
    }

    return (m.substitutedCount || 0) + ' substitute' + (Number(m.substitutedCount || 0) === 1 ? '' : 's');
  }

  return formatDashboardIssuePeople(m.apologyMembers || [], 'apology');
}

function formatDashboardIssuePeople(people, fallbackLabel) {
  people = people || [];

  const names = people
    .map(row => cleanDashboardPersonName(row.name || ''))
    .filter(Boolean);

  if (names.length) {
    return names.join(', ');
  }

  return fallbackLabel || '';
}

function cleanDashboardPersonName(name) {
  if (typeof cleanCouncillorName === 'function') {
    return cleanCouncillorName(name);
  }

  return String(name || '')
    .replace(/\bcouncillor\b/gi, '')
    .replace(/\bcllr\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDashboardMeetingIcon(type) {
  if (type === 'absences') return '!';
  if (type === 'substitutes') return '↔';
  return '!';
}

function getDashboardMeetingIconClass(type) {
  if (type === 'absences') return 'dashboard-meeting-icon-red';
  if (type === 'substitutes') return 'dashboard-meeting-icon-blue';
  return 'dashboard-meeting-icon-amber';
}

function filterDashboardMeetings(meetings) {
  return (meetings || []).filter(m => {
    const id = String(m.id || '').trim();

    const title = String(
      m.committeeTitle ||
      m.title ||
      m.name ||
      ''
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    return (
      id !== '406' &&
      id !== '420' &&
      !title.includes('officer executive decisions') &&
      !title.includes('officer non executive decisions')
    );
  });
}

function renderDashboardMonthlyPanels(meetings, isCouncillor) {
  const grouped = groupDashboardMeetingsForCurrentAndNextMonth(meetings);

  return `
    <div class="dashboard-month-grid">

      <div class="card dashboard-month-card">
        <h2>${escapeHtml(isCouncillor ? 'My meetings this month' : grouped.current.label)}</h2>
        ${renderDashboardMonthMeetings(grouped.current.meetings, isCouncillor)}
      </div>

      <div class="card dashboard-month-card">
        <h2>${escapeHtml(isCouncillor ? 'My meetings next month' : grouped.next.label)}</h2>
        ${renderDashboardMonthMeetings(grouped.next.meetings, isCouncillor)}
      </div>

    </div>
  `;
}

function renderDashboardMonthMeetings(meetings, isCouncillor) {
  if (!meetings || !meetings.length) {
    return `<p>No meetings found.</p>`;
  }

  return `
    <div class="dashboard-meeting-panel">
      ${meetings.map(m => renderDashboardMeetingPanelRow(m, isCouncillor)).join('')}
    </div>
  `;
}

function renderDashboardMeetingPanelRow(m, isCouncillor) {
  return `
    <button class="dashboard-meeting-row" onclick="showMeeting('${escapeJs(m.id)}')">

      <div class="meeting-icon">📅</div>

      <div class="meeting-text">
        <strong>${escapeHtml(m.committeeTitle || m.title || 'Meeting')}</strong>
        <span>${escapeHtml(formatDashboardMeetingDate(m.date))}${m.time ? ' · ' + escapeHtml(m.time) : ''}</span>
        ${renderDashboardMeetingMetaLine(m, isCouncillor)}
      </div>

      <em>›</em>

    </button>
  `;
}

function renderDashboardMeetingMetaLine(m, isCouncillor) {
  const parts = [];

  if (isCouncillor && m.currentUserMeetingStatus) {
    parts.push(formatDashboardMeetingStatus(m.currentUserMeetingStatus));
  } else if (m.status) {
    parts.push(m.status);
  }

  const issues = [];
  if (m.apologyCount) issues.push(m.apologyCount + ' apologies');
  if (m.absentCount) issues.push(m.absentCount + ' absent');
  if (m.substitutedCount) issues.push(m.substitutedCount + ' subs');

  if (issues.length) {
    parts.push(issues.join(', '));
  }

  if (!parts.length) {
    return '';
  }

  return `<span>${escapeHtml(parts.join(' · '))}</span>`;
}

function formatDashboardMeetingStatus(status) {
  status = String(status || '').toUpperCase();

  if (status === 'POSSIBLE_ABSENCE') return 'Possible absence';
  if (status === 'APOLOGY') return 'Apology marked';
  if (status === 'PENDING_APOLOGY') return 'Apology pending';
  if (status === 'ABSENT') return 'Absent';
  if (status === 'SUBSTITUTED') return 'Substituted';

  return 'Expected';
}

function groupDashboardMeetingsForCurrentAndNextMonth(meetings) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthAfterNextStart = new Date(now.getFullYear(), now.getMonth() + 2, 1);

  const current = [];
  const next = [];

  meetings
    .slice()
    .sort((a, b) =>
      String(a.date || '').localeCompare(String(b.date || '')) ||
      String(a.time || '').localeCompare(String(b.time || ''))
    )
    .forEach(m => {
      const d = parseDashboardMeetingDate(m.date);

      if (!d) {
        return;
      }

      if (d >= now && d >= currentMonthStart && d < nextMonthStart) {
        current.push(m);
        return;
      }

      if (d >= nextMonthStart && d < monthAfterNextStart) {
        next.push(m);
      }
    });

  return {
    current: {
      label: currentMonthStart.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric'
      }),
      meetings: current
    },
    next: {
      label: nextMonthStart.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric'
      }),
      meetings: next
    }
  };
}

function parseDashboardMeetingDate(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (iso) {
    return new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3])
    );
  }

  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (uk) {
    return new Date(
      Number(uk[3]),
      Number(uk[2]) - 1,
      Number(uk[1])
    );
  }

  const parsed = new Date(raw);

  if (isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatDashboardMeetingDate(value) {
  const d = parseDashboardMeetingDate(value);

  if (!d) {
    return String(value || '');
  }

  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
}
