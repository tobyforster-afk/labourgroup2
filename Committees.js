/*************************************************************
 *
 * COMMITTEES
 *
 *************************************************************/

function showCommittees(forceRefresh) {
  currentScreen = 'committees';

  closeMenu();
  showBackButton();

  loadCommitteeAppData(function(data) {
    renderCommittees(data.committees || []);
  }, forceRefresh === true);
}

function loadCommitteeAppData(callback, forceRefresh) {
  if (typeof callback !== 'function') {
    return;
  }

  if (
    !forceRefresh &&
    window.LG_Data &&
    LG_Data.app
  ) {
    callback(LG_Data.app);
    return;
  }

  LG_Data.loadApp(
    callback,
    forceRefresh === true
  );
}

function renderCommittees(committees) {
  document.getElementById('content').innerHTML = `
    <section class="page">
      <h1>Committees</h1>

      <div class="card">
        ${renderCommitteeList(committees)}
      </div>
    </section>
  `;
}

function renderCommitteeList(committees) {
  if (!committees || !committees.length) {
    return `<p>No committees found.</p>`;
  }

  return `
    <div class="list">
      ${committees.map(c => `
        <button
          class="list-row"
          onclick="showCommittee('${escapeJs(c.id)}')">

          <div>
            <strong>${escapeHtml(c.title)}</strong>
            <span>${escapeHtml(c.category || '')}</span>
          </div>

          <em>›</em>
        </button>
      `).join('')}
    </div>
  `;
}

function showCommittee(committeeId, forceRefresh) {
  const id = String(committeeId || '').trim();

  if (!id) {
    showError('Missing committee ID.');
    return;
  }

  currentScreen = 'committee';

  closeMenu();
  showBackButton();

  loadCommitteeAppData(function(data) {
    renderCommittee(
      buildCommitteeProfileFromAppData(id, data)
    );
  }, forceRefresh === true);
}

function buildCommitteeProfileFromAppData(committeeId, data) {
  data = data || {};

  const id = String(committeeId || '').trim();

  const committee =
    (data.committeesById && data.committeesById[id]) ||
    (data.committees || []).find(c =>
      String(c.id || '').trim() === id
    ) ||
    {};

  const members =
    (data.committeeMembers && data.committeeMembers[id]) ||
    [];

  const meetings =
    (data.committeeMeetings && data.committeeMeetings[id]) ||
    [];

  return {
    committee,
    members,
    meetings: filterAndSortCommitteeUpcomingMeetings(meetings)
  };
}

function renderCommittee(data) {
  data = data || {};

  const committee = data.committee || {};

  document.getElementById('content').innerHTML = `
    <section class="page">

      <h1>${escapeHtml(committee.title || 'Committee')}</h1>

      <div class="card">
        <p>
          <strong>Category:</strong>
          ${escapeHtml(committee.category || '')}
        </p>

        ${committee.detailsUrl ? `
          <p>
            <a
              href="${escapeHtml(committee.detailsUrl)}"
              target="_blank">
              Open on Modern.Gov
            </a>
          </p>
        ` : ''}
      </div>

      <div class="card">
        <h2>Members</h2>
        ${renderCommitteeMembers(data.members || [])}
      </div>

      <div class="card">
        <h2>Upcoming meetings</h2>
        ${renderCommitteeMeetings(data.meetings || [])}
      </div>

    </section>
  `;
}

function renderCommitteeMembers(members) {
  if (!members || !members.length) {
    return `<p>No members found.</p>`;
  }

  return `
    <div class="list">
      ${members.map(m => `
        <button
          class="list-row"
          onclick="showCouncillor('${escapeJs(m.councillorId)}')">

          <div>
            <strong>${escapeHtml(m.name)}</strong>

            <span>
              ${escapeHtml(m.role || 'Member')}
              ${m.ward ? ' · ' + escapeHtml(m.ward) : ''}
            </span>
          </div>

          <em>›</em>
        </button>
      `).join('')}
    </div>
  `;
}

function renderCommitteeMeetings(meetings) {
  if (!meetings || !meetings.length) {
    return `<p>No upcoming meetings found.</p>`;
  }

  return `
    <div class="meeting-list">
      ${meetings.map(m => `
        <button
          class="meeting-row"
          onclick="showMeeting('${escapeJs(m.id)}')">

          <div class="meeting-icon">📅</div>

          <div class="meeting-text">
            <strong>
              ${escapeHtml(formatCommitteeMeetingDate(m.date))}
            </strong>

            <span>
              ${escapeHtml(m.time || '')}
              ${m.status ? ' · ' + escapeHtml(m.status) : ''}
            </span>
          </div>

          <em>›</em>
        </button>
      `).join('')}
    </div>
  `;
}

function filterAndSortCommitteeUpcomingMeetings(meetings) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (meetings || [])
    .filter(m => {
      const date = parseCommitteeMeetingDate(m.date);
      return date && date >= today;
    })
    .sort((a, b) =>
      parseCommitteeMeetingDate(a.date) -
        parseCommitteeMeetingDate(b.date) ||
      String(a.time || '').localeCompare(String(b.time || ''))
    );
}

function parseCommitteeMeetingDate(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();

  const iso = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})/
  );

  if (iso) {
    return new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3])
    );
  }

  const uk = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})/
  );

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

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
}

function formatCommitteeMeetingDate(value) {
  const date = parseCommitteeMeetingDate(value);

  if (!date) {
    return String(value || '');
  }

  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
