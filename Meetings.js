/*************************************************************
 *
 * MEETINGS
 *
 *************************************************************/

let currentMeetingId = null;
let currentMeetingData = null;

function showMeetings() {
  stopMeetingPolling();
  currentScreen = 'meetings';

  closeMenu();
  showBackButton();

  LG_Data.loadApp(function(data) {
    renderMeetingsPage(data.meetings || []);
  });
}

function renderMeetingsPage(meetings) {
  const filtered = filterMeetingsPageList(meetings || []);

  document.getElementById('content').innerHTML = `
    <section class="page">
      <h1>Meetings</h1>
      <p class="lede">Upcoming council and committee meetings, with live vote planning.</p>

      <div class="card">
        ${renderMeetingsList(filtered)}
      </div>
    </section>
  `;
}

function filterMeetingsPageList(meetings) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (meetings || [])
    .filter(m => {
      const date = parseMeetingDate(m.date);
      return date && date >= today;
    })
    .filter(m => {
      const id = String(m.id || '').trim();
      const title = String(m.committeeTitle || '').toLowerCase();

      return (
        id !== '406' &&
        id !== '420' &&
        !title.includes('officer executive decisions') &&
        !title.includes('officer non executive decisions')
      );
    });
}

function renderMeetingsList(meetings) {
  if (!meetings || !meetings.length) {
    return `<p>No upcoming meetings found.</p>`;
  }

  return `
    <div class="meeting-list meeting-list-full">
      ${meetings.map(renderMeetingsListRow).join('')}
    </div>
  `;
}

function renderMeetingsListRow(m) {
  const vote = m.vote || {};

  return `
    <button class="meeting-row" onclick="showMeeting('${escapeJs(m.id)}')">
      <div class="meeting-icon">📅</div>

      <div class="meeting-text">
        <strong>${escapeHtml(m.committeeTitle || 'Meeting')}</strong>
        <span>${escapeHtml(formatMeetingDate(m.date))}${m.time ? ' · ' + escapeHtml(m.time) : ''}</span>
        <span>
          ${escapeHtml(getMeetingMajorityLabel(vote))}
          ${m.apologyCount || m.absentCount || m.possibleAbsenceCount ? ` · ${escapeHtml(getMeetingIssueLabel(m))}` : ''}
        </span>
      </div>

      <div class="meeting-risk-dot ${getMeetingRiskClass(vote.risk)}"></div>
    </button>
  `;
}

function showMeeting(meetingId) {
  currentScreen = 'meeting';
  currentMeetingId = meetingId;

  closeMenu();
  showBackButton();

  LG_Data.getMeeting(
    meetingId,
    renderMeeting
  );
}

function calculateMeetingVoteFromMembers(members) {
  const partyTotals = {};
  const dots = [];

  let labour = 0;
  let opposition = 0;
  let expected = 0;
  let uncertain = 0;
  let absent = 0;
  let apologies = 0;
  let substituted = 0;

  (members || []).forEach(member => {
    const status = String(member.status || 'EXPECTED').toUpperCase();
    const hasSubstitute = String(member.substituteCouncillorId || '').trim() !== '';

    if (status === 'POSSIBLE_ABSENCE') uncertain++;
    if (status === 'APOLOGY') apologies++;
    if (status === 'ABSENT') absent++;
    if (hasSubstitute) substituted++;

    const present = (
      hasSubstitute ||
      status === 'EXPECTED' ||
      status === 'PENDING_APOLOGY' ||
      status === 'POSSIBLE_ABSENCE' ||
      status === 'SUBSTITUTED'
    );

    const voteParty = hasSubstitute && member.substituteParty
      ? member.substituteParty
      : member.party;

    const isLabour =
      String(voteParty || (hasSubstitute ? '' : member.group) || '').toLowerCase().includes('labour');

    dots.push({
      name: hasSubstitute && member.substituteName ? member.substituteName : member.name,
      party: voteParty,
      colour: member.partyColour || getPartyColour(voteParty),
      present,
      possible: status === 'POSSIBLE_ABSENCE' || status === 'PENDING_APOLOGY',
      substituted: hasSubstitute,
      status
    });

    if (!present) {
      return;
    }

    expected++;

    partyTotals[voteParty] = (partyTotals[voteParty] || 0) + 1;

    if (isLabour) {
      labour++;
    } else {
      opposition++;
    }
  });

  const majority = labour - opposition;

  let result = 'Tie';
  let risk = 'TIE';

  if (majority > 1) {
    result = 'Labour majority';
    risk = 'SAFE';
  } else if (majority === 1) {
    result = 'Labour majority';
    risk = 'AT_RISK';
  } else if (majority === -1) {
    result = 'Opposition majority';
    risk = 'AT_RISK';
  } else if (majority < -1) {
    result = 'Opposition majority';
    risk = 'LOST';
  }

  return {
    labour,
    opposition,
    majority,
    majorityAbs: Math.abs(majority),
    result,
    risk,
    expected,
    uncertain,
    absent,
    apologies,
    substituted,
    partyTotals: Object.keys(partyTotals).map(party => ({
      party,
      count: partyTotals[party],
      colour: getPartyColour(party)
    })).sort((a, b) => b.count - a.count || a.party.localeCompare(b.party)),
    dots
  };
}

/*************************************************************
 * VOTE CARD
 *************************************************************/

function renderVoteCard(vote) {
  const majority = Number(vote.majority || 0);

  return `
    <div class="card vote-card">

      <div class="vote-kicker">${escapeHtml(getMeetingRiskLabel(vote.risk))}</div>

      <div class="vote-main">
        <span>${escapeHtml(vote.result || 'Vote position')}</span>
        <strong>${majority > 0 ? '+' : ''}${majority}</strong>
      </div>

      ${renderVoteDots(vote.dots || [])}

      <div class="vote-count-grid">
        <div>
          <span>Labour</span>
          <strong>${escapeHtml(vote.labour || 0)}</strong>
        </div>

        <div>
          <span>Opposition</span>
          <strong>${escapeHtml(vote.opposition || 0)}</strong>
        </div>
      </div>

      ${renderPartyTotals(vote.partyTotals || [])}

    </div>
  `;
}

function renderVoteDots(dots) {
  if (!dots || !dots.length) return '';

  const groups = groupVoteDotsByParty(dots);

  return `
    <div class="vote-dot-chamber">
      ${groups.map(group => `
        <div class="vote-dot-party">
          <div class="vote-dot-grid">
            ${group.dots.map(dot => `
              <span
                class="vote-block-dot ${dot.present ? '' : 'is-absent'} ${dot.substituted ? 'is-substituted' : ''} ${dot.possible ? 'is-possible' : ''}"
                title="${escapeHtml(dot.name || '')}"
                style="background:${escapeHtml(dot.colour || group.colour || '#999')}">
              </span>
            `).join('')}
          </div>

         
        </div>
      `).join('')}
    </div>
  `;
}

function groupVoteDotsByParty(dots) {
  const grouped = {};

  (dots || []).forEach(dot => {
    const party = String(dot.party || 'Unknown').trim();

    if (!grouped[party]) {
      grouped[party] = {
        party,
        shortName: getShortPartyName(party),
        colour: dot.colour || getPartyColour(party),
        total: 0,
        present: 0,
        dots: []
      };
    }

    grouped[party].total++;

    if (dot.present) {
      grouped[party].present++;
    }

    grouped[party].dots.push(dot);
  });

  Object.keys(grouped).forEach(party => {
  grouped[party].dots.sort((a, b) => {
    if (a.present !== b.present) return a.present ? -1 : 1;
    if (a.possible !== b.possible) return a.possible ? -1 : 1;
    if (a.substituted !== b.substituted) return a.substituted ? -1 : 1;

    return String(a.name || '').localeCompare(String(b.name || ''));
  });
});

  return Object.keys(grouped)
    .map(party => grouped[party])
    .sort((a, b) => {
      const aLab = a.party.toLowerCase().includes('labour');
      const bLab = b.party.toLowerCase().includes('labour');

      if (aLab !== bLab) return aLab ? -1 : 1;

      return b.present - a.present || a.party.localeCompare(b.party);
    });
}

function getShortPartyName(party) {
  const text = String(party || '').toLowerCase();

  if (text.includes('labour')) return 'Labour';
  if (text.includes('conservative')) return 'Con';
  if (text.includes('liberal') || text.includes('democrat')) return 'Lib Dem';
  if (text.includes('green')) return 'Green';
  if (text.includes('reform')) return 'Reform';
  if (text.includes('independent')) return 'Ind';

  return String(party || 'Other').trim();
}

function renderPartyTotals(totals) {
  if (!totals || !totals.length) {
    return '';
  }

  return `
    <div class="party-total-list">
      ${totals.map(t => `
        <div class="party-total-row">
          <span>
            <i style="background:${escapeHtml(t.colour || '#999')}"></i>
            ${escapeHtml(t.party)}
          </span>
          <strong>${escapeHtml(t.count)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderMeetingSummary(vote) {
  return `
    <div class="meeting-summary-grid">
      <div class="meeting-summary-card">
        <span>Expected</span>
        <strong>${escapeHtml(vote.expected || 0)}</strong>
      </div>

      <div class="meeting-summary-card">
        <span>Possible</span>
        <strong>${escapeHtml(vote.uncertain || 0)}</strong>
      </div>

      <div class="meeting-summary-card">
        <span>Apologies</span>
        <strong>${escapeHtml(vote.apologies || 0)}</strong>
      </div>

      <div class="meeting-summary-card">
        <span>Absent</span>
        <strong>${escapeHtml(vote.absent || 0)}</strong>
      </div>

      <div class="meeting-summary-card">
        <span>Subs</span>
        <strong>${escapeHtml(vote.substituted || 0)}</strong>
      </div>
    </div>
  `;
}

/*************************************************************
 * MEMBERS
 *************************************************************/

function renderMeetingAvatar(member) {
  const src = member.photoSmall || member.photoLarge || '';

  if (src) {
    return `
      <div class="avatar">
        <img src="${escapeHtml(src)}" alt="">
      </div>
    `;
  }

  return `
    <div class="avatar">
      ${escapeHtml(getInitials(cleanMeetingCouncillorName(member.name)))}
    </div>
  `;
}

function parseMeetingDate(value) {
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

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatMeetingDate(value) {
  const date = parseMeetingDate(value);

  if (!date) return String(value || '');

  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function getMeetingMajorityLabel(vote) {
  const majority = Number((vote || {}).majority || 0);

  if (majority > 0) return 'Labour +' + majority;
  if (majority < 0) return 'Opposition +' + Math.abs(majority);

  return 'Tie';
}

function getMeetingIssueLabel(m) {
  const parts = [];

  if (m.apologyCount) parts.push(m.apologyCount + ' apologies');
  if (m.absentCount) parts.push(m.absentCount + ' away');
  if (m.possibleAbsenceCount) parts.push(m.possibleAbsenceCount + ' possible');

  return parts.join(', ');
}

function getMeetingRiskClass(risk) {
  risk = String(risk || '').toUpperCase();

  if (risk === 'SAFE') return 'risk-safe';
  if (risk === 'AT_RISK') return 'risk-warning';
  if (risk === 'LOST') return 'risk-danger';
  if (risk === 'TIE') return 'risk-tie';

  return 'risk-neutral';
}

function getMeetingRiskLabel(risk) {
  risk = String(risk || '').toUpperCase();

  if (risk === 'SAFE') return 'Safe majority';
  if (risk === 'AT_RISK') return 'Majority at risk';
  if (risk === 'LOST') return 'Labour behind';
  if (risk === 'TIE') return 'Tie';

  return 'Vote position';
}

function getMemberStatusClass(status) {
  status = String(status || '').toUpperCase();

  if (status === 'POSSIBLE_ABSENCE') return 'status-possible';
  if (status === 'APOLOGY') return 'status-apology';
  if (status === 'PENDING_APOLOGY') return 'status-possible';
  if (status === 'ABSENT') return 'status-absent';
  if (status === 'SUBSTITUTED') return 'status-substituted';

  return 'status-expected';
}

function formatMemberStatus(status) {
  status = String(status || '').toUpperCase();

  if (status === 'POSSIBLE_ABSENCE') return 'Possible';
  if (status === 'APOLOGY') return 'Apology';
  if (status === 'PENDING_APOLOGY') return 'Pending approval';
  if (status === 'ABSENT') return 'Absent';
  if (status === 'SUBSTITUTED') return 'Subbed';

  return 'Expected';
}

function getPartyColour(party) {
  const text = String(party || '').toLowerCase();

  if (text.includes('labour')) return '#c40f3a';
  if (text.includes('conservative')) return '#1D70B8';
  if (text.includes('green')) return '#3BAA35';
  if (text.includes('liberal') || text.includes('democrat')) return '#F39206';
  if (text.includes('independent')) return '#777777';
  if (text.includes('reform')) return '#6f2dbd';

  return '#999999';
}

function cleanMeetingCouncillorName(name) {
  if (typeof cleanCouncillorName === 'function') {
    return cleanCouncillorName(name);
  }

  return String(name || '')
    .replace(/\bcouncillor\b/gi, '')
    .replace(/\bcllr\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}



/*************************************************************
 * MEETINGS - LIVE LOCAL SAVE / POLLING OVERRIDES
 *************************************************************/

let meetingPollTimer = null;
let meetingLastChangedAt = '';
let meetingLocalDirtyMembers = {};
let meetingPollBlockedUntil = 0;
let meetingSaveInFlight = 0;
let meetingActiveSubTargetId = '';
let meetingApologyDraft = null;

function renderMeeting(data) {
  stopMeetingPolling();

  currentMeetingData = normaliseMeetingData(data || {});
  const meeting = currentMeetingData.meeting || {};

  currentMeetingId = String(meeting.id || currentMeetingId || '').trim();
  meetingLastChangedAt = currentMeetingData.lastChangedAt || getLatestMeetingChangedAt(currentMeetingData.members || []);

  document.getElementById('content').innerHTML = `
    <section class="page meeting-page">
      <div class="page-header meeting-page-header">
        <h1>${escapeHtml(meeting.committeeTitle || meeting.title || 'Meeting')}</h1>

        <div class="page-header-meta">
          <span>${escapeHtml(formatMeetingDate(meeting.date))}</span>
          ${meeting.time ? `<span>${escapeHtml(meeting.time)}</span>` : ''}
          ${meeting.location ? `<span>${escapeHtml(meeting.location)}</span>` : ''}
        </div>

        <div class="page-header-links">
          ${meeting.meetingUrl ? `<a href="${escapeHtml(meeting.meetingUrl)}" target="_blank">Modern.Gov</a>` : ''}
        </div>
      </div>

      <div id="meetingVoteSlot"></div>
      <div id="meetingSummarySlot"></div>
      <div id="meetingBoardSlot"></div>
      ${renderMeetingSubstituteModal()}
      ${renderMeetingApologyModal()}

      <div class="meeting-live-save">
        <span class="meeting-live-save-dot"></span>
        <strong id="meetingSaveStatus">Saved</strong>
      </div>
    </section>
  `;

  renderMeetingDynamicParts();
  updateMeetingSaveStatus('Saved');
  startMeetingPolling();
}

function normaliseMeetingData(data) {
  data = data || {};
  data.members = data.members || [];
  data.substitutes = data.substitutes || [];
  data.vote = data.vote || calculateMeetingVoteFromMembers(data.members);
  data.lastChangedAt = data.lastChangedAt || getLatestMeetingChangedAt(data.members);
  return data;
}

function renderMeetingDynamicParts() {
  if (!currentMeetingData) return;

  currentMeetingData.vote = calculateMeetingVoteFromMembers(currentMeetingData.members || []);

  const voteSlot = document.getElementById('meetingVoteSlot');
  const summarySlot = document.getElementById('meetingSummarySlot');
  const boardSlot = document.getElementById('meetingBoardSlot');

  if (voteSlot) voteSlot.innerHTML = renderVoteCard(currentMeetingData.vote);
  if (summarySlot) summarySlot.innerHTML = renderMeetingSummary(currentMeetingData.vote);
  if (boardSlot) boardSlot.innerHTML = renderMeetingBoard(currentMeetingData);

}

function renderMeetingBoard(data) {
  const members = data.members || [];
  const labourMembers = members.filter(m => m.isLabour);
  const oppositionMembers = members.filter(m => !m.isLabour);

  return `
    <div class="card meeting-board-card">
      <div class="meeting-board-grid">
        <section class="meeting-board-column meeting-board-column-labour">
          <div class="meeting-board-column-head">
            <h2>Labour</h2>
            <strong>${escapeHtml(labourMembers.length)}</strong>
          </div>
          ${renderMeetingMemberList(labourMembers, true, data.substitutes || [])}
        </section>

        <section class="meeting-board-column meeting-board-column-opposition">
          <div class="meeting-board-column-head">
            <h2>Opposition</h2>
            <strong>${escapeHtml(oppositionMembers.length)}</strong>
          </div>
          ${renderMeetingMemberList(oppositionMembers, false, data.substitutes || [])}
        </section>
      </div>
    </div>
  `;
}

function renderMeetingMemberList(members, isLabourSection, substitutes) {
  if (!members || !members.length) {
    return `<p>No members found.</p>`;
  }

  return `
    <div class="meeting-member-list">
      ${members.map(member => renderMeetingMemberCard(member, isLabourSection, substitutes)).join('')}
    </div>
  `;
}

function renderMeetingMemberCard(member, isLabourSection, substitutes) {
  const status = String(member.status || 'EXPECTED').toUpperCase();
  const hasSub = String(member.substituteCouncillorId || '').trim() !== '';
  const roleBadge = getMeetingRoleBadge(member.role);
  const memberId = String(member.councillorId || '').trim();
  const dirty = isMeetingMemberDirty(memberId);
  const substitute = hasSub ? getMeetingSubstituteForMember(member) : null;

  return `
    <div
      class="meeting-member-card ${member.isLabour ? 'labour' : 'opposition'} ${getMemberStatusClass(status)} ${hasSub ? 'has-substitute' : ''} ${dirty ? 'is-saving' : ''}"
      id="meeting_member_${escapeHtml(memberId)}"
      data-councillor-id="${escapeHtml(memberId)}">

      <div class="meeting-member-stack">
        <div class="meeting-member-original ${hasSub ? 'is-covered' : ''}">
          <div class="meeting-member-main">
            ${renderMeetingAvatar(member)}

            <div class="meeting-member-text">
              <strong>${escapeHtml(cleanMeetingCouncillorName(member.name))}</strong>
              ${roleBadge ? `<span class="meeting-role-badge">${escapeHtml(roleBadge)}</span>` : ''}
              ${member.notes ? `<em>${escapeHtml(member.notes)}</em>` : ''}
            </div>
          </div>
        </div>

        ${hasSub ? `
          <div class="meeting-member-sub-card">
            <div class="meeting-member-main">
              ${renderMeetingAvatar({
                name: member.substituteName,
                photoSmall: member.substitutePhotoSmall || (substitute ? substitute.photoSmall : ''),
                photoLarge: member.substitutePhotoLarge || (substitute ? substitute.photoLarge : '')
              })}

              <div class="meeting-member-text">
                <strong>${escapeHtml(cleanMeetingCouncillorName(member.substituteName))}</strong>
                <span class="meeting-role-badge">Substitute</span>
                <em>for ${escapeHtml(cleanMeetingCouncillorName(member.name))}</em>
              </div>
            </div>
          </div>
        ` : ''}
      </div>

      ${status !== 'EXPECTED' ? `
        <div class="meeting-status-pill">
          ${escapeHtml(formatMemberStatus(status))}
        </div>
      ` : ''}

      <div class="meeting-member-actions">
        ${renderMeetingMemberActions(member, isLabourSection)}
      </div>
    </div>
  `;
}

function renderMeetingMemberActions(member, isLabourSection) {
  const id = escapeJs(member.councillorId);
  const status = String(member.status || 'EXPECTED').toUpperCase();
  const isApology = status === 'APOLOGY';
  const isAbsent = status === 'ABSENT';
  const isSubstituted = String(member.substituteCouncillorId || '').trim() !== '';

  const permissions = getMeetingMemberActionPermissions(member, isLabourSection);
  const buttons = [];

  if (permissions.canApology) {
    buttons.push(`
      <button
        type="button"
        class="small-action amber ${isApology ? 'is-active' : ''}"
        onclick="${getMeetingApologyButtonOnclick(member, isApology)}">
        ${isApology ? 'Clear' : 'Apology'}
      </button>
    `);
  } else {
    buttons.push(renderMeetingActionSpacer());
  }

  if (permissions.canAbsent) {
    buttons.push(`
      <button
        type="button"
        class="small-action danger ${isAbsent ? 'is-active' : ''}"
        onclick="patchMeetingMemberStatus('${id}', '${isAbsent ? 'EXPECTED' : 'ABSENT'}')">
        ${isAbsent ? 'Clear' : 'Absent'}
      </button>
    `);
  } else {
    buttons.push(renderMeetingActionSpacer());
  }

  if (permissions.canClearSubstitute && isSubstituted) {
    buttons.push(`
      <button type="button" class="small-action substitute is-active" onclick="patchMeetingClearSubstitute('${id}')">
        Clear sub
      </button>
    `);
  } else if (permissions.canSubstitute && !isSubstituted) {
    const subOnclick = isCurrentMeetingUserAdmin()
      ? `openMeetingSubstituteModal('${id}')`
      : `substituteCurrentMeetingUserFor('${id}')`;

    buttons.push(`
      <button type="button" class="small-action substitute" onclick="${subOnclick}">
        Sub
      </button>
    `);
  } else {
    buttons.push(renderMeetingActionSpacer());
  }

  if (!permissions.hasAnyAction) {
    return '';
  }

  return buttons.join('');
}


function getMeetingApologyButtonOnclick(member, isApology) {
  const id = escapeJs(member.councillorId);

  if (isApology || isCurrentMeetingUserAdmin()) {
    return `patchMeetingMemberStatus('${id}', '${isApology ? 'EXPECTED' : 'APOLOGY'}')`;
  }

  return `openMeetingApologyModal('${id}')`;
}

function renderMeetingActionSpacer() {
  return `<span class="small-action-spacer" aria-hidden="true"></span>`;
}

function getMeetingMemberActionPermissions(member, isLabourSection) {
  const role = String((currentUser && currentUser.role) || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  const status = String(member.status || 'EXPECTED').toUpperCase();
  const isLabour = isLabourSection || member.isLabour === true;
  const isSelf = isLoggedInMeetingMember(member);
  const isSubstituted = String(member.substituteCouncillorId || '').trim() !== '';
  const isUnavailableForSub = status === 'APOLOGY' || status === 'PENDING_APOLOGY' || status === 'ABSENT';
  const currentUserSubstitute = getCurrentUserMeetingSubstitute();
  const currentUserSubstituteId = currentUserSubstitute ? String(currentUserSubstitute.id || '').trim() : '';
  const substituteIsSelf = currentUserSubstituteId && String(member.substituteCouncillorId || '').trim() === currentUserSubstituteId;

  const canApology = isAdmin ? isLabour : isSelf;
  const canAbsent = isAdmin ? true : false;
  const canSubstitute = isAdmin
    ? isLabour
    : !!(isLabour && !isSelf && isUnavailableForSub && currentUserSubstituteId);
  const canClearSubstitute = isAdmin
    ? isLabour && isSubstituted
    : !!(isLabour && isSubstituted && substituteIsSelf);

  const adjustedCanAbsent = isAdmin
    ? (isLabour || !isLabour)
    : false;

  return {
    canApology,
    canAbsent: adjustedCanAbsent,
    canSubstitute,
    canClearSubstitute,
    hasAnyAction: canApology || adjustedCanAbsent || canSubstitute || canClearSubstitute
  };
}

function isLoggedInMeetingMember(member) {
  if (!member || !currentUser) return false;

  if (member.isCurrentUser === true) return true;

  const userEmail = String(currentUser.email || '').trim().toLowerCase();
  const memberEmail = String(member.email || member.loginEmail || '').trim().toLowerCase();

  if (userEmail && memberEmail && userEmail === memberEmail) {
    return true;
  }

  const userName = normaliseMeetingLoginName(currentUser.displayName || currentUser.username || '');
  const memberName = normaliseMeetingLoginName(member.name || '');

  return !!(userName && memberName && (memberName === userName || memberName.endsWith(' ' + userName)));
}

function getCurrentUserMeetingSubstitute() {
  const substitutes = (currentMeetingData && currentMeetingData.substitutes) || [];

  return substitutes.find(s => s.isCurrentUser === true) || substitutes.find(s => {
    if (!currentUser) return false;

    const userEmail = String(currentUser.email || '').trim().toLowerCase();
    const subEmail = String(s.email || s.loginEmail || '').trim().toLowerCase();

    if (userEmail && subEmail && userEmail === subEmail) return true;

    const userName = normaliseMeetingLoginName(currentUser.displayName || currentUser.username || '');
    const subName = normaliseMeetingLoginName(s.name || '');

    return !!(userName && subName && (subName === userName || subName.endsWith(' ' + userName)));
  }) || null;
}

function normaliseMeetingLoginName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bcouncillor\b/g, '')
    .replace(/\bcllr\b\.?/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderSubstitutePicker(member, substitutes) {
  return '';
}

function getMeetingRoleBadge(role) {
  const text = String(role || '').trim();
  const clean = text.toLowerCase();

  if (!text) return '';

  if (
    clean === 'member' ||
    clean === 'committee member' ||
    clean === 'ordinary member'
  ) {
    return '';
  }

  return text;
}

function getMeetingSubstituteForMember(member) {
  const substituteId = String(member.substituteCouncillorId || '').trim();
  const substituteName = cleanMeetingCouncillorName(member.substituteName || '').toLowerCase();

  return ((currentMeetingData && currentMeetingData.substitutes) || []).find(s =>
    String(s.id || '').trim() === substituteId ||
    cleanMeetingCouncillorName(s.name || '').toLowerCase() === substituteName
  ) || null;
}

function renderMeetingSubstituteModal() {
  return `
    <div id="meetingSubModal" class="meeting-sub-modal" onclick="closeMeetingSubstituteModal(event)">
      <div class="meeting-sub-sheet" onclick="event.stopPropagation()">
        <div class="meeting-sub-head">
          <strong>Choose substitute</strong>
          <button type="button" onclick="closeMeetingSubstituteModal()" aria-label="Close">×</button>
        </div>
        <div id="meetingSubList" class="meeting-sub-list"></div>
      </div>
    </div>
  `;
}


function renderMeetingApologyModal() {
  return `
    <div id="meetingApologyModal" class="meeting-sub-modal meeting-apology-modal" onclick="closeMeetingApologyModal(event)">
      <div class="meeting-sub-sheet meeting-apology-sheet" onclick="event.stopPropagation()">
        <div class="meeting-sub-head">
          <strong>Request apology</strong>
          <button type="button" onclick="closeMeetingApologyModal()" aria-label="Close">×</button>
        </div>
        <div id="meetingApologyContent"></div>
      </div>
    </div>
  `;
}

function openMeetingApologyModal(councillorId) {
  const member = getCurrentMeetingMemberById(councillorId);

  if (!member) {
    showError('Meeting member not found.');
    return;
  }

  meetingApologyDraft = {
    councillorId: String(councillorId || '').trim(),
    step: 'reason',
    reasonChoice: '',
    otherReason: '',
    preview: null
  };

  renderMeetingApologyReasonStep();

  const modal = document.getElementById('meetingApologyModal');
  if (modal) modal.classList.add('is-open');
  document.body.classList.add('meeting-sub-open');
}

function closeMeetingApologyModal(event) {
  if (event && event.target && event.target.id !== 'meetingApologyModal') {
    return;
  }

  const modal = document.getElementById('meetingApologyModal');
  if (modal) modal.classList.remove('is-open');

  meetingApologyDraft = null;
  document.body.classList.remove('meeting-sub-open');
}

function renderMeetingApologyReasonStep() {
  const slot = document.getElementById('meetingApologyContent');
  if (!slot || !meetingApologyDraft) return;

  const options = [
    'Illness',
    'Family commitment',
    'Work commitment',
    'Annual leave',
    'Caring responsibilities',
    'Emergency / unforeseen circumstances',
    'Other',
    'Prefer not to say'
  ];

  slot.innerHTML = `
    <div class="meeting-apology-intro">
      <p>Choose the reason you want sent to the Labour Group Whip.</p>
    </div>

    <div class="meeting-apology-options">
      ${options.map(option => `
        <button
          type="button"
          class="meeting-apology-option ${meetingApologyDraft.reasonChoice === option ? 'is-selected' : ''}"
          onclick="selectMeetingApologyReason('${escapeJs(option)}')">
          ${escapeHtml(option)}
        </button>
      `).join('')}
    </div>

    <div id="meetingApologyOtherSlot">
      ${renderMeetingApologyOtherField()}
    </div>

    <div class="meeting-apology-actions">
      <button type="button" class="action-plan-secondary-button" onclick="closeMeetingApologyModal()">Cancel</button>
      <button type="button" onclick="buildMeetingApologyPreview()">Continue</button>
    </div>
  `;
}

function selectMeetingApologyReason(reason) {
  if (!meetingApologyDraft) return;

  meetingApologyDraft.reasonChoice = String(reason || '').trim();

  const otherSlot = document.getElementById('meetingApologyOtherSlot');
  if (otherSlot) otherSlot.innerHTML = renderMeetingApologyOtherField();

  document.querySelectorAll('.meeting-apology-option').forEach(button => {
    button.classList.toggle('is-selected', button.textContent.trim() === meetingApologyDraft.reasonChoice);
  });
}

function renderMeetingApologyOtherField() {
  if (!meetingApologyDraft) return '';

  if (meetingApologyDraft.reasonChoice === 'Other') {
    return `
      <label>Please provide a reason</label>
      <textarea id="meetingApologyOtherReason" rows="4" oninput="meetingApologyDraft.otherReason = this.value">${escapeHtml(meetingApologyDraft.otherReason || '')}</textarea>
    `;
  }

  if (meetingApologyDraft.reasonChoice === 'Prefer not to say') {
    return `
      <div class="meeting-apology-warning">
        You do not have to provide a reason. However, apologies without a reason may be less likely to be approved by the Group Whip.
      </div>
    `;
  }

  return '';
}

function buildMeetingApologyPreview() {
  if (!meetingApologyDraft || !currentMeetingId) return;

  const choice = String(meetingApologyDraft.reasonChoice || '').trim();
  const otherEl = document.getElementById('meetingApologyOtherReason');
  const otherReason = otherEl ? String(otherEl.value || '').trim() : String(meetingApologyDraft.otherReason || '').trim();

  if (!choice) {
    alert('Choose a reason for the apology.');
    return;
  }

  if (choice === 'Other' && !otherReason) {
    alert('Please provide a reason.');
    return;
  }

  meetingApologyDraft.otherReason = otherReason;

  const slot = document.getElementById('meetingApologyContent');
  if (slot) {
    slot.innerHTML = `<div class="loading">Building preview...</div>`;
  }

  LG_API.run
    .withSuccessHandler(function(preview) {
      meetingApologyDraft.preview = preview || {};
      renderMeetingApologyPreviewStep();
    })
    .withFailureHandler(function(error) {
      renderMeetingApologyReasonStep();
      showError(error);
    })
    .LabourGroup_buildMeetingApologyEmailPreview(
      currentMeetingId,
      meetingApologyDraft.councillorId,
      choice,
      otherReason,
      getAuthToken()
    );
}

function renderMeetingApologyPreviewStep() {
  const slot = document.getElementById('meetingApologyContent');
  if (!slot || !meetingApologyDraft) return;

  const preview = meetingApologyDraft.preview || {};

  slot.innerHTML = `
    <div class="meeting-apology-preview">
      <label>Subject</label>
      <div class="meeting-apology-preview-line">${escapeHtml(preview.subject || '')}</div>

      <label>To</label>
      <div class="meeting-apology-preview-line">${escapeHtml(preview.to || '')}</div>

      <label>CC</label>
      <div class="meeting-apology-preview-line">${escapeHtml((preview.ccList || []).join(', ') || 'None')}</div>

      <label>Email preview</label>
      <pre>${escapeHtml(preview.body || '')}</pre>
    </div>

    <div class="meeting-apology-actions">
      <button type="button" class="action-plan-secondary-button" onclick="renderMeetingApologyReasonStep()">Back</button>
      <button type="button" onclick="sendMeetingApologyRequest()">Send request</button>
    </div>
  `;
}

function sendMeetingApologyRequest() {
  if (!meetingApologyDraft || !currentMeetingId) return;

  const slot = document.getElementById('meetingApologyContent');
  if (slot) {
    slot.innerHTML = `<div class="loading">Sending request...</div>`;
  }

  beginMeetingSave();

  LG_API.run
    .withSuccessHandler(function(data) {
      closeMeetingApologyModal();
      mergeMeetingProfile(data, meetingApologyDraft ? meetingApologyDraft.councillorId : '');
      alert('Your apology request has been sent.');
    })
    .withFailureHandler(function(error) {
      finishMeetingSave(false);
      renderMeetingApologyPreviewStep();
      showError(error);
    })
    .LabourGroup_sendMeetingApologyRequest(
      currentMeetingId,
      meetingApologyDraft.councillorId,
      meetingApologyDraft.reasonChoice,
      meetingApologyDraft.otherReason,
      getAuthToken()
    );
}

function getCurrentMeetingMemberById(councillorId) {
  return ((currentMeetingData && currentMeetingData.members) || []).find(member =>
    String(member.councillorId || '') === String(councillorId || '')
  ) || null;
}

function getAvailableMeetingSubstitutesForPicker(targetCouncillorId) {
  if (!currentMeetingData) return [];

  const blockedIds = {};

  (currentMeetingData.members || []).forEach(member => {
    blockedIds[String(member.councillorId || '')] = true;

    if (
      member.substituteCouncillorId &&
      String(member.councillorId || '') !== String(targetCouncillorId || '')
    ) {
      blockedIds[String(member.substituteCouncillorId || '')] = true;
    }
  });

  let substitutes = (currentMeetingData.substitutes || [])
    .filter(s => !blockedIds[String(s.id || '')]);

  if (!isCurrentMeetingUserAdmin()) {
    substitutes = substitutes.filter(s => s.isCurrentUser === true || isLoggedInMeetingMember({
      isCurrentUser: s.isCurrentUser,
      email: s.email || s.loginEmail || '',
      name: s.name || ''
    }));
  }

  return substitutes;
}

function isCurrentMeetingUserAdmin() {
  return String((currentUser && currentUser.role) || '').toUpperCase() === 'ADMIN';
}


function substituteCurrentMeetingUserFor(councillorId) {
  const substitute = getCurrentUserMeetingSubstitute();

  if (!substitute || !substitute.id) {
    showError('Your login is not linked to a councillor substitute record.');
    return;
  }

  patchMeetingAssignSubstitute(councillorId, substitute.id);
}

function openMeetingSubstituteModal(councillorId) {
  if (!isCurrentMeetingUserAdmin()) {
    substituteCurrentMeetingUserFor(councillorId);
    return;
  }

  const modal = document.getElementById('meetingSubModal');
  const list = document.getElementById('meetingSubList');

  if (!modal || !list) return;

  meetingActiveSubTargetId = String(councillorId || '').trim();

  const substitutes = getAvailableMeetingSubstitutesForPicker(councillorId);

  list.innerHTML = substitutes.length ? substitutes.map(s => `
    <button
      type="button"
      class="meeting-sub-option"
      onclick="patchMeetingAssignSubstitute('${escapeJs(councillorId)}', '${escapeJs(s.id)}')">
      ${renderMeetingAvatar(s)}
      <strong>${escapeHtml(cleanMeetingCouncillorName(s.name))}</strong>
    </button>
  `).join('') : `<p>No available substitutes found.</p>`;

  modal.classList.add('is-open');
  document.body.classList.add('meeting-sub-open');
}

function closeMeetingSubstituteModal(event) {
  if (event && event.target && event.target.id !== 'meetingSubModal') {
    return;
  }

  const modal = document.getElementById('meetingSubModal');

  if (modal) {
    modal.classList.remove('is-open');
  }

  meetingActiveSubTargetId = '';
  document.body.classList.remove('meeting-sub-open');
}

function patchMeetingMemberStatus(councillorId, status) {
  if (!currentMeetingId) return;

  status = String(status || 'EXPECTED').toUpperCase();

  patchMeetingMemberLocal(councillorId, function(member) {
    member.status = status;

    if (status !== 'APOLOGY' && status !== 'ABSENT') {
      member.substituteCouncillorId = '';
      member.substituteName = '';
      member.substituteParty = '';
      member.substitutePhotoSmall = '';
      member.substitutePhotoLarge = '';
    }

    return member;
  });

  LG_API.run
    .withSuccessHandler(function(data) {
      mergeMeetingProfile(data, councillorId);
    })
    .withFailureHandler(function(error) {
      handleMeetingPatchFailure(error);
    })
    .LabourGroup_setMeetingMemberStatus(
      currentMeetingId,
      councillorId,
      status,
      getAuthToken()
    );
}

function patchMeetingAssignSubstitute(councillorId, substituteId) {
  closeMeetingSubstituteModal();

  const substitute = ((currentMeetingData && currentMeetingData.substitutes) || [])
    .find(s => String(s.id || '') === String(substituteId || '')) || {};

  patchMeetingMemberLocal(councillorId, function(member) {
    const status = String(member.status || 'EXPECTED').toUpperCase();

    if (status !== 'APOLOGY' && status !== 'ABSENT') {
      member.status = 'APOLOGY';
    }

    member.substituteCouncillorId = substituteId;
    member.substituteName = substitute.name || '';
    member.substituteParty = substitute.party || substitute.group || '';
    member.substitutePhotoSmall = substitute.photoSmall || '';
    member.substitutePhotoLarge = substitute.photoLarge || '';
    return member;
  });

  LG_API.run
    .withSuccessHandler(function(data) {
      mergeMeetingProfile(data, councillorId);
    })
    .withFailureHandler(function(error) {
      handleMeetingPatchFailure(error);
    })
    .LabourGroup_assignMeetingSubstitute(
      currentMeetingId,
      councillorId,
      substituteId,
      getAuthToken()
    );
}

function patchMeetingClearSubstitute(councillorId) {
  patchMeetingMemberLocal(councillorId, function(member) {
    if (String(member.status || '').toUpperCase() === 'SUBSTITUTED') {
      member.status = 'APOLOGY';
    }

    member.substituteCouncillorId = '';
    member.substituteName = '';
    member.substituteParty = '';
    member.substitutePhotoSmall = '';
    member.substitutePhotoLarge = '';
    return member;
  });

  LG_API.run
    .withSuccessHandler(function(data) {
      mergeMeetingProfile(data, councillorId);
    })
    .withFailureHandler(function(error) {
      handleMeetingPatchFailure(error);
    })
    .LabourGroup_clearMeetingSubstitute(
      currentMeetingId,
      councillorId,
      getAuthToken()
    );
}

/* Backwards compatibility for old onclicks still in cached pages. */
function setMeetingMemberStatus(councillorId, status) {
  patchMeetingMemberStatus(councillorId, status);
}

function assignMeetingSubstitute(councillorId) {
  openMeetingSubstituteModal(councillorId);
}

function clearMeetingSubstitute(councillorId) {
  patchMeetingClearSubstitute(councillorId);
}

function patchMeetingMemberLocal(councillorId, updater) {
  if (!currentMeetingData || !currentMeetingData.members) return;

  markMeetingMemberDirty(councillorId);
  beginMeetingSave();

  currentMeetingData.members = currentMeetingData.members.map(member => {
    if (String(member.councillorId || '') !== String(councillorId || '')) {
      return member;
    }

    const next = Object.assign({}, member);
    return updater(next) || next;
  });

  currentMeetingData.vote = calculateMeetingVoteFromMembers(currentMeetingData.members || []);
  cacheCurrentMeetingData();
  renderMeetingDynamicParts();
}

function mergeMeetingProfile(data, dirtyCouncillorId) {
  if (!data || !currentMeetingData) return;

  data = normaliseMeetingData(data);

  const dirtyMap = Object.assign({}, meetingLocalDirtyMembers);

  currentMeetingData.meeting = data.meeting || currentMeetingData.meeting;
  currentMeetingData.committee = data.committee || currentMeetingData.committee;
  currentMeetingData.substitutes = data.substitutes || currentMeetingData.substitutes || [];
  currentMeetingData.lastChangedAt = data.lastChangedAt || currentMeetingData.lastChangedAt || '';
  meetingLastChangedAt = currentMeetingData.lastChangedAt || meetingLastChangedAt;

  currentMeetingData.members = mergeMeetingMemberRows(
    currentMeetingData.members || [],
    data.members || [],
    dirtyMap
  );

  currentMeetingData.vote = calculateMeetingVoteFromMembers(currentMeetingData.members || []);
  cacheCurrentMeetingData();
  renderMeetingDynamicParts();
  finishMeetingSave(true);

  if (dirtyCouncillorId) {
    setTimeout(function() {
      clearMeetingMemberDirty(dirtyCouncillorId);
      renderMeetingDynamicParts();
    }, 700);
  }

  if (!meetingSaveInFlight) {
    meetingPollBlockedUntil = Date.now() + 1000;
  }
}


function mergeMeetingMemberRows(existing, incoming, dirtyMap) {
  const byId = {};

  (incoming || []).forEach(member => {
    byId[String(member.councillorId || '')] = member;
  });

  return (existing || []).map(member => {
    const id = String(member.councillorId || '');
    const incomingMember = byId[id];

    if (!incomingMember) return member;
    if (dirtyMap && dirtyMap[id] && dirtyMap[id] > Date.now()) return member;

    return Object.assign({}, member, incomingMember);
  });
}

function handleMeetingPatchFailure(error) {
  finishMeetingSave(false);

  if (window.LG_Data && currentMeetingId) {
    delete LG_Data.meetings[String(currentMeetingId)];
    LG_Data.app = null;
  }

  showError(error);

  if (currentMeetingId) {
    LG_Data.getMeeting(currentMeetingId, renderMeeting, true);
  }
}

function cacheCurrentMeetingData() {
  if (window.LG_Data && currentMeetingId && currentMeetingData) {
    LG_Data.meetings[String(currentMeetingId)] = currentMeetingData;
    LG_Data.app = null;
  }
}

function markMeetingMemberDirty(councillorId) {
  meetingLocalDirtyMembers[String(councillorId || '')] = Date.now() + 5000;
}

function isMeetingMemberDirty(councillorId) {
  const key = String(councillorId || '');
  return meetingLocalDirtyMembers[key] && meetingLocalDirtyMembers[key] > Date.now();
}

function clearMeetingMemberDirty(councillorId) {
  delete meetingLocalDirtyMembers[String(councillorId || '')];
}

function getLatestMeetingChangedAt(members) {
  return (members || []).reduce(function(latest, member) {
    const updatedAt = String(member.updatedAt || '').trim();
    return updatedAt && updatedAt > latest ? updatedAt : latest;
  }, '');
}

function beginMeetingSave() {
  meetingSaveInFlight++;
  meetingPollBlockedUntil = Number.MAX_SAFE_INTEGER;
  updateMeetingSaveStatus('Saving...');
}

function finishMeetingSave(ok) {
  meetingSaveInFlight = Math.max(0, meetingSaveInFlight - 1);

  if (ok === false) {
    meetingPollBlockedUntil = 0;
    updateMeetingSaveStatus('Not saved');
    return;
  }

  if (meetingSaveInFlight > 0) {
    updateMeetingSaveStatus('Saving...');
    return;
  }

  meetingPollBlockedUntil = Date.now() + 1000;
  updateMeetingSaveStatus('Saved');
}

function updateMeetingSaveStatus(status) {
  const clean = String(status || 'Saved').trim();
  const el = document.getElementById('meetingSaveStatus');
  const bar = el ? el.closest('.meeting-live-save') : null;

  if (el) {
    el.textContent = clean;
  }

  if (bar) {
    bar.classList.toggle('is-saving', clean === 'Saving...');
    bar.classList.toggle('is-error', clean === 'Not saved');
    bar.classList.toggle('is-saved', clean === 'Saved');
  }
}

function startMeetingPolling() {
  stopMeetingPolling();

  if (!currentMeetingId) return;

  meetingPollTimer = setInterval(pollMeetingChanges, 5000);
}

function stopMeetingPolling() {
  if (meetingPollTimer) {
    clearInterval(meetingPollTimer);
    meetingPollTimer = null;
  }
}

function pollMeetingChanges() {
  if (!currentMeetingId) return;
  if (Date.now() < Number(meetingPollBlockedUntil || 0)) return;

  LG_API.run
    .withSuccessHandler(function(result) {
      result = result || {};

      if (!result.hasChanges && result.lastChangedAt) {
        meetingLastChangedAt = result.lastChangedAt;
        return;
      }

      if (!result.hasChanges) return;

      const changedMembers = result.changedMembers || result.members || [];

      currentMeetingData.members = mergeMeetingMemberRows(
        currentMeetingData.members || [],
        changedMembers,
        meetingLocalDirtyMembers
      );

      currentMeetingData.substitutes = result.substitutes || currentMeetingData.substitutes || [];
      currentMeetingData.lastChangedAt = result.lastChangedAt || currentMeetingData.lastChangedAt || '';
      meetingLastChangedAt = currentMeetingData.lastChangedAt || meetingLastChangedAt;
      currentMeetingData.vote = calculateMeetingVoteFromMembers(currentMeetingData.members || []);

      cacheCurrentMeetingData();
      renderMeetingDynamicParts();
    })
    .withFailureHandler(function() {})
    .LabourGroup_getMeetingChangesSince(
      currentMeetingId,
      meetingLastChangedAt || '',
      getAuthToken()
    );
}
