/*************************************************************
 *
 * COUNCILLORS
 *
 *************************************************************/

function showCouncillors(forceRefresh) {
  currentScreen = 'councillors';

  closeMenu();
  showBackButton();

  loadCouncillorAppData(
    renderCouncillors,
    forceRefresh === true
  );
}

function renderCouncillors(data) {
  data = data || {};

  const grouped = groupCouncillorsByWard(
    data.labourCouncillors || []
  );

  document.getElementById('content').innerHTML = `
    <section class="page">
      <h1>Councillors</h1>
      <p class="lede">Browse Labour Group members by ward.</p>

      ${Object.keys(grouped).map(ward => `
        <section class="ward-section">
          <h2 class="ward-title">${escapeHtml(ward)}</h2>

          <div class="ward-card">
            ${grouped[ward].map(renderCouncillorRow).join('')}
          </div>
        </section>
      `).join('')}
    </section>
  `;
}

function loadCouncillorAppData(callback, forceRefresh) {
  if (typeof callback !== 'function') {
    return;
  }

  /*
   * Use the in-memory app payload immediately whenever it exists. This avoids
   * another Apps Script round trip when moving between the dashboard,
   * councillor list and councillor profiles.
   */
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

function groupCouncillorsByWard(councillors) {
  const grouped = {};

  (councillors || [])
    .slice()
    .sort((a, b) =>
      String(a.ward || '').localeCompare(String(b.ward || '')) ||
      String(a.name || '').localeCompare(String(b.name || ''))
    )
    .forEach(c => {
      const ward = c.ward || 'Unknown ward';

      if (!grouped[ward]) {
        grouped[ward] = [];
      }

      grouped[ward].push(c);
    });

  return grouped;
}

function renderCouncillorRow(c) {
  const label = cleanCouncillorLabel(
    c.party ||
    c.group ||
    'Labour'
  );

  return `
    <button
      class="councillor-row"
      onclick="showCouncillor('${escapeJs(c.id)}')">

      ${renderAvatar(c)}

      <div class="councillor-row-text">
        <strong>${escapeHtml(cleanCouncillorName(c.name))}</strong>
        <span>${escapeHtml(label)}</span>
      </div>

      <em>›</em>
    </button>
  `;
}

function showCouncillor(councillorId, forceRefresh) {
  const id = String(councillorId || '').trim();

  if (!id) {
    showError('Missing councillor ID.');
    return;
  }

  currentScreen = 'councillor';

  closeMenu();
  showBackButton();

  loadCouncillorAppData(function(data) {
    renderCouncillor(
      buildCouncillorProfileFromAppData(id, data)
    );
  }, forceRefresh === true);
}

function buildCouncillorProfileFromAppData(councillorId, data) {
  data = data || {};

  const id = String(councillorId || '').trim();

  const councillor =
    (data.councillorsById && data.councillorsById[id]) ||
    (data.councillors || []).find(c =>
      String(c.id || '').trim() === id
    ) ||
    {};

  const committees =
    (data.councillorCommittees &&
      data.councillorCommittees[id]) ||
    [];

  const committeeIds = {};

  committees.forEach(c => {
    const committeeId = String(c.committeeId || '').trim();

    if (committeeId) {
      committeeIds[committeeId] = true;
    }
  });

  /*
   * Prefer allUpcomingMeetings where it exists. For councillor logins,
   * upcomingMeetings can be filtered to the logged-in member only.
   */
  const meetingSource =
    data.allUpcomingMeetings ||
    data.upcomingMeetings ||
    [];

  const upcomingMeetings = meetingSource.filter(m =>
    committeeIds[String(m.committeeId || '').trim()]
  );

  return {
    councillor,
    committees,
    upcomingMeetings
  };
}

function renderCouncillor(data) {
  data = data || {};

  const c = data.councillor || {};
  const label = cleanCouncillorLabel(
    c.party ||
    c.group ||
    'Labour'
  );

  const meetings = filterAndSortCouncillorUpcomingMeetings(
    data.upcomingMeetings || []
  );

  document.getElementById('content').innerHTML = `
    <section class="page">
      <div class="profile-hero">
        ${renderAvatar(c, 'large')}

        <div class="profile-hero-text">
          <h1>${escapeHtml(cleanCouncillorName(c.name))}</h1>
          <p>${escapeHtml(label)}</p>
          <span>${escapeHtml(c.ward || '')}</span>
        </div>
      </div>

      <div class="card">
        <h2>Contact</h2>

        ${c.email ? `
          <p>
            <strong>Email:</strong>
            <a href="mailto:${escapeHtml(c.email)}">
              ${escapeHtml(c.email)}
            </a>
          </p>
        ` : ''}

        ${c.phone ? `
          <p>
            <strong>Phone:</strong>
            <a href="tel:${escapeHtml(c.phone)}">
              ${escapeHtml(c.phone)}
            </a>
          </p>
        ` : ''}

        ${c.mobile ? `
          <p>
            <strong>Mobile:</strong>
            <a href="tel:${escapeHtml(c.mobile)}">
              ${escapeHtml(c.mobile)}
            </a>
          </p>
        ` : ''}

        ${c.profileUrl ? `
          <p>
            <a href="${escapeHtml(c.profileUrl)}" target="_blank">
              Open Modern.Gov profile
            </a>
          </p>
        ` : ''}
      </div>

      <div class="card">
        <h2>Committees</h2>
        ${renderCouncillorCommitteeList(data.committees || [])}
      </div>

      <div class="card">
        <h2>Upcoming meetings</h2>
        ${renderCouncillorUpcomingMeetings(meetings)}
      </div>
    </section>
  `;
}

function cleanCouncillorName(name) {
  return String(name || '')
    .replace(/\bcouncillor\b/gi, '')
    .replace(/\bcllr\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCouncillorLabel(value) {
  return String(value || '')
    .replace(/\bcouncillor\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderAvatar(c, size) {
  c = c || {};

  const src = c.photoLarge || c.photoSmall || '';
  const largeClass = size === 'large' ? 'avatar-large' : '';

  if (!src) {
    return `
      <div class="avatar ${largeClass}">
        ${escapeHtml(getInitials(cleanCouncillorName(c.name)))}
      </div>
    `;
  }

  return `
    <div class="avatar ${largeClass}">
      <img
        src="${escapeHtml(src)}"
        alt=""
        loading="${size === 'large' ? 'eager' : 'lazy'}">
    </div>
  `;
}

function getInitials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');
}

function renderCouncillorCommitteeList(committees) {
  if (!committees || !committees.length) {
    return `<p>No committees found.</p>`;
  }

  return `
    <div class="list">
      ${committees.map(c => `
        <button
          class="list-row"
          onclick="showCommittee('${escapeJs(c.committeeId)}')">

          <div>
            <strong>${escapeHtml(c.title)}</strong>
            <span>${escapeHtml(c.role || 'Member')}</span>
          </div>

          <em>›</em>
        </button>
      `).join('')}
    </div>
  `;
}

function renderCouncillorUpcomingMeetings(meetings) {
  if (!meetings || !meetings.length) {
    return `<p>No upcoming meetings found.</p>`;
  }

  return `
    <div class="meeting-list">
      ${meetings.map(renderCouncillorUpcomingMeetingRow).join('')}
    </div>
  `;
}

function renderCouncillorUpcomingMeetingRow(m) {
  return `
    <button
      class="meeting-row"
      onclick="showMeeting('${escapeJs(m.id)}')">

      <div class="meeting-icon">📅</div>

      <div class="meeting-text">
        <strong>
          ${escapeHtml(m.committeeTitle || m.title || 'Meeting')}
        </strong>

        <span>
          ${escapeHtml(formatCouncillorMeetingDate(m.date))}
          ${m.time ? ' · ' + escapeHtml(m.time) : ''}
        </span>

        ${m.status ? `
          <span>${escapeHtml(m.status)}</span>
        ` : ''}
      </div>

      <em>›</em>
    </button>
  `;
}

function filterAndSortCouncillorUpcomingMeetings(meetings) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (meetings || [])
    .filter(m => {
      const date = parseCouncillorMeetingDate(m.date);
      return date && date >= today;
    })
    .sort((a, b) =>
      parseCouncillorMeetingDate(a.date) -
        parseCouncillorMeetingDate(b.date) ||
      String(a.time || '').localeCompare(String(b.time || ''))
    );
}

function parseCouncillorMeetingDate(value) {
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

function formatCouncillorMeetingDate(value) {
  const date = parseCouncillorMeetingDate(value);

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
