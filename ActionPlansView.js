/*************************************************************
 * COUNCIL ACTION PLANS
 *************************************************************/

let currentActionPlanId = null;
let currentActionPlanData = null;
let actionPlanSpeakerDrafts = {};
let editingActionPlanPanels = {};

let actionPlanPollTimer = null;
let actionPlanSaveTimer = null;
let actionPlanSaveInFlight = false;
let actionPlanPendingPatches = {};
let actionPlanLastChangedAt = '';
let actionPlanLastRenderedPanels = [];
let actionPlanLiveItemId = '';
let actionPlanAmendmentDrafts = {};
let actionPlanAmendmentSpeakerDrafts = {};
let actionPlanLocalDirtyItems = {};
let actionPlanPollBlockedUntil = 0;
let actionPlanPollBusy = false;
let actionPlanHomeData = null;
let actionPlanHomeLoadedAt = 0;
const ACTION_PLAN_HOME_TTL_MS = 60000;

function showActionPlans(forceRefresh) {
  stopActionPlanPolling();
  currentScreen = 'actionPlans';
  closeMenu();
  showBackButton();

  const useCachedHome = (
    forceRefresh !== true &&
    actionPlanHomeData &&
    Date.now() - actionPlanHomeLoadedAt < ACTION_PLAN_HOME_TTL_MS
  );

  if (useCachedHome) {
    renderActionPlansHome(actionPlanHomeData);
    refreshActionPlansHomeInBackground();
    return;
  }

  setLoading('Loading action plans...');
  loadActionPlansHome(false);
}

function loadActionPlansHome(quiet) {
  LG_API.run
    .withSuccessHandler(function(data) {
      actionPlanHomeData = data || {};
      actionPlanHomeLoadedAt = Date.now();

      if (currentScreen === 'actionPlans') {
        renderActionPlansHome(actionPlanHomeData);
      }
    })
    .withFailureHandler(function(error) {
      if (!quiet) {
        showError(error);
      }
    })
    .LabourGroup_getActionPlansHome(getAuthToken());
}

function refreshActionPlansHomeInBackground() {
  loadActionPlansHome(true);
}

function invalidateActionPlansHomeCache() {
  actionPlanHomeData = null;
  actionPlanHomeLoadedAt = 0;
}

function renderActionPlansHome(data) {
  data = data || {};
  actionPlanHomeData = data;
  actionPlanHomeLoadedAt = Date.now();

  const plans = data.actionPlans || data.plans || [];
  const meetingsWithoutPlans = data.meetingsWithoutPlans || [];

  document.getElementById('content').innerHTML = `
    <section class="page action-plan-home">
      <h1>Council Action Plans</h1>
      <p class="lede">Generate and open Full Council action plans.</p>

      <div class="card action-plan-home-card">
        <h2>Existing action plans</h2>
        ${renderActionPlanList(plans)}
      </div>

      <div class="card action-plan-home-card">
        <h2>Generate new action plan</h2>
        ${renderCouncilMeetingsToGenerate(meetingsWithoutPlans)}
      </div>
    </section>
  `;
}

function renderActionPlanList(plans) {
  if (!plans || !plans.length) {
    return `<p>No action plans generated yet.</p>`;
  }

  return `
    <div class="list action-plan-list">
      ${plans.map(plan => `
        <button class="list-row" onclick="showActionPlan('${escapeJs(plan.actionPlanId || plan.id)}')">
          <div>
            <strong>${escapeHtml(plan.title || plan.committeeTitle || 'Council')}</strong>
            <span>
              ${escapeHtml(formatActionPlanDate(plan.meetingDate || plan.date))}
              ${plan.meetingTime || plan.time ? ' · ' + escapeHtml(plan.meetingTime || plan.time) : ''}
            </span>
          </div>
          <em>›</em>
        </button>
      `).join('')}
    </div>
  `;
}

function renderCouncilMeetingsToGenerate(meetings) {
  if (!meetings || !meetings.length) {
    return `<p>Every Council meeting in the cache already has an action plan.</p>`;
  }

  return `
    <div class="list action-plan-list">
      ${meetings.map(meeting => `
        <div class="list-row action-plan-generate-row">
          <div>
            <strong>${escapeHtml(meeting.committeeTitle || 'Council')}</strong>
            <span>
              ${escapeHtml(formatActionPlanDate(meeting.date))}
              ${meeting.time ? ' · ' + escapeHtml(meeting.time) : ''}
              ${meeting.status ? ' · ' + escapeHtml(meeting.status) : ''}
            </span>
          </div>

          <button
            type="button"
            class="small-action"
            onclick="generateActionPlanFromMeeting('${escapeJs(meeting.meetingId || meeting.id)}')">
            Generate
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

function generateActionPlanFromMeeting(meetingId) {
  if (!meetingId) return;

  setLoading('Generating action plan...');

  LG_API.run
    .withSuccessHandler(function(data) {
      invalidateActionPlansHomeCache();
      cacheActionPlanData(data);
      renderActionPlan(data);
    })
    .withFailureHandler(showError)
    .LabourGroup_generateCouncilActionPlanFromMeeting(meetingId, getAuthToken());
}

function showActionPlan(actionPlanId, forceRefresh) {
  stopActionPlanPolling();

  const id = String(actionPlanId || '').trim();

  if (!id) {
    showError('Missing action plan ID.');
    return;
  }

  currentScreen = 'actionPlan';
  currentActionPlanId = id;

  closeMenu();
  showBackButton();

  const cached = getCachedActionPlanData(id);

  if (cached && forceRefresh !== true) {
    renderActionPlan(cached);
    return;
  }

  setLoading('Loading action plan...');

  if (window.LG_Data && typeof LG_Data.getActionPlan === 'function') {
    LG_Data.getActionPlan(id, renderActionPlan, forceRefresh === true);
    return;
  }

  LG_API.run
    .withSuccessHandler(function(data) {
      cacheActionPlanData(data, id);
      renderActionPlan(data);
    })
    .withFailureHandler(showError)
    .LabourGroup_getActionPlanProfile(id, getAuthToken());
}

function getCachedActionPlanData(actionPlanId) {
  const id = String(actionPlanId || '').trim();

  if (
    window.LG_Data &&
    LG_Data.actionPlans &&
    LG_Data.actionPlans[id]
  ) {
    return LG_Data.actionPlans[id];
  }

  return null;
}

function cacheActionPlanData(data, fallbackId) {
  if (!data) return;

  const id = String(
    fallbackId ||
    (data.plan && (data.plan.actionPlanId || data.plan.id)) ||
    currentActionPlanId ||
    ''
  ).trim();

  if (!id) return;

  if (window.LG_Data) {
    if (typeof LG_Data.setActionPlan === 'function') {
      LG_Data.setActionPlan(id, data);
    } else {
      LG_Data.actionPlans = LG_Data.actionPlans || {};
      LG_Data.actionPlans[id] = data;
    }
  }
}

function renderActionPlan(data) {
  currentActionPlanData = data || {};

  const plan = currentActionPlanData.plan || {};
  cacheActionPlanData(currentActionPlanData, plan.actionPlanId || plan.id);
  const items = currentActionPlanData.items || [];
  const panels = buildActionPlanPanels(items);

  currentActionPlanId = plan.actionPlanId || plan.id || currentActionPlanId || '';
  actionPlanLastChangedAt = currentActionPlanData.lastChangedAt || getLatestActionPlanChangedAt(items);
  actionPlanLastRenderedPanels = panels;
  actionPlanLiveItemId = String((plan.liveItemId || plan.livePanelId || '')).trim();
  actionPlanSpeakerDrafts = {};
  actionPlanAmendmentDrafts = {};
  actionPlanAmendmentSpeakerDrafts = {};

  items.forEach(item => {
    actionPlanSpeakerDrafts[item.itemId] = getActionPlanItemSpeakers(item);

    const amendments = normaliseActionPlanAmendments(item.amendments || []);
    actionPlanAmendmentDrafts[item.itemId] = amendments;
    actionPlanAmendmentSpeakerDrafts[item.itemId] = {};

    amendments.forEach(function(amendment, index) {
      actionPlanAmendmentSpeakerDrafts[item.itemId][index] =
        (amendment.speakers || []).slice();
    });
  });

  document.getElementById('content').innerHTML = `
    <section class="page action-plan-page">
      <div class="page-header action-plan-page-header">
        <h1>${escapeHtml(plan.title || 'Council Action Plan')}</h1>

        <div class="page-header-meta">
          ${plan.meetingDate || plan.date ? `<span>${escapeHtml(formatActionPlanDate(plan.meetingDate || plan.date))}</span>` : ''}
          ${plan.meetingTime || plan.time ? `<span>${escapeHtml(plan.meetingTime || plan.time)}</span>` : ''}
        </div>
      </div>

      ${renderActionPlanLiveBar()}

      ${renderActionPlanNavigator(panels)}

      <div class="action-plan-items">
        ${panels.length ? panels.map((panel, index) => renderActionPlanPanel(panel, index)).join('') : `
          <div class="card">
            <p>No action plan items found.</p>
          </div>
        `}
      </div>
    </section>
  `;

  attachActionPlanAutosaveHandlers();
  applyActionPlanLiveUi();
  startActionPlanPolling();
  updateActionPlanSaveStatus('Saved');
}

function renderActionPlanLiveBar() {
  return `
    <div class="action-plan-live-bar">
      <span class="action-plan-live-dot"></span>
      <strong>Live action plan</strong>
      <em id="actionPlanSaveStatus">Saved</em>
    </div>
  `;
}

function buildActionPlanPanels(items) {
  const panels = [];
  const groupMap = {};

  (items || []).forEach((item, index) => {
    const type = String(item.type || item.itemType || '').toUpperCase();
    const number = String(item.itemNumber || item.number || '').trim();
    const parentNumber = number.replace(/\.\d+$/, '');

    if (type === 'PUBLIC_QUESTIONS' || type === 'MEMBER_QUESTIONS') {
      const key = type + '::' + parentNumber;

      if (!groupMap[key]) {
        groupMap[key] = {
          panelId: 'q_' + type + '_' + parentNumber.replace(/[^a-z0-9]/gi, '_'),
          type,
          parentNumber,
          displayKey: parentNumber || ('question_' + index),
          title: formatActionPlanItemType(type),
          items: [],
          firstIndex: index,
          isQuestionGroup: true
        };
        panels.push(groupMap[key]);
      }

      groupMap[key].items.push(item);
      return;
    }

    panels.push({
      panelId: item.itemId,
      type,
      parentNumber: number,
      displayKey: parentNumber || ('item_' + index),
      title: item.title || 'Agenda item',
      items: [item],
      firstIndex: index,
      isQuestionGroup: false
    });
  });

  return assignActionPlanDisplayNumbers(panels);
}

function assignActionPlanDisplayNumbers(panels) {
  const numbersByKey = {};
  let nextNumber = 1;

  (panels || []).forEach(panel => {
    const key = String(panel.displayKey || panel.parentNumber || panel.panelId || '').trim();
    const cleanKey = key || ('panel_' + nextNumber);

    if (!numbersByKey[cleanKey]) {
      numbersByKey[cleanKey] = String(nextNumber);
      nextNumber++;
    }

    panel.displayNumber = numbersByKey[cleanKey];
  });

  return panels;
}

function renderActionPlanNavigator(panels) {
  if (!panels || panels.length < 2) return '';

  return `
    <nav class="action-plan-nav" aria-label="Agenda items">
      ${panels.map(panel => `
        <button
          type="button"
          class="action-plan-nav-pill ${isActionPlanPanelLive(panel) ? 'is-live' : ''}"
          onclick="scrollToActionPlanPanel('${escapeJs(panel.panelId)}')">
          <strong>${escapeHtml(getActionPlanNavigatorNumber(panel))}</strong>
          <span>${escapeHtml(getShortActionPlanNavLabel(panel))}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

function getActionPlanNavigatorNumber(panel) {
  return String(panel && panel.displayNumber ? panel.displayNumber : '').trim();
}

function getShortActionPlanNavLabel(panel) {
  const item = panel && panel.items && panel.items.length ? panel.items[0] : {};
  const type = String(panel.type || item.type || item.itemType || '').toUpperCase();
  const title = String(panel.title || item.title || '').trim();

  if (type === 'PUBLIC_QUESTIONS') return 'Public Qs';
  if (type === 'MEMBER_QUESTIONS') return 'Member Qs';

  return shortenActionPlanNavTitle(title || formatActionPlanItemType(type));
}

function shortenActionPlanNavTitle(title) {
  let text = String(title || '').trim();

  text = text
    .replace(/^Leader['']?s\s+report$/i, 'Leader')
    .replace(/^Leader['']?s\s+announcements$/i, 'Leader')
    .replace(/^Apologies\s+for\s+absence$/i, 'Apologies')
    .replace(/^Declarations\s+of\s+Disclosable\s+Pecuniary\s+Interests.*$/i, 'Declarations')
    .replace(/^Record\s+of\s+meeting$/i, 'Minutes')
    .replace(/^Public\s+questions$/i, 'Public Qs')
    .replace(/^Members['']?\s+questions$/i, 'Member Qs')
    .replace(/^Exclusion\s+of\s+the\s+Press\s+and\s+Public$/i, 'Exclusion')
    .replace(/^Annual\s+Overview\s+and\s+Scrutiny\s+Report$/i, 'O&S report')
    .replace(/^Review\s+of\s+Polling\s+District\s+and\s+Polling\s+Places$/i, 'Polling')
    .replace(/^HRA\s+Acquisition.*$/i, 'HRA')
    .replace(/^Motion\s+([A-Z]).*$/i, 'Motion $1');

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 3) {
    text = words.slice(0, 3).join(' ');
  }

  return text || 'Item';
}

function scrollToActionPlanPanel(panelId) {
  const el = document.getElementById('api_panel_' + panelId);
  if (!el) return;

  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderActionPlanPanel(panel, index) {
  const isEditing = editingActionPlanPanels[panel.panelId] === true;
  const item = panel.items[0] || {};
  const type = String(panel.type || item.type || item.itemType || '').toUpperCase();
  const panelClass = (isEditing ? 'is-editing' : 'is-viewing') + (isActionPlanPanelLive(panel) ? ' is-live' : '');

  if (panel.isQuestionGroup) {
    return renderQuestionGroupPanel(panel, index, isEditing);
  }

  return `
    <article class="action-plan-item ${panelClass}" id="api_panel_${escapeHtml(panel.panelId)}">
      <div class="action-plan-item-head">
        <div>
          <div class="action-plan-kicker">
            <span class="action-plan-running-number">${escapeHtml(panel.displayNumber || String(index + 1))}</span>
            <h2>${escapeHtml(item.title || 'Agenda item')}</h2>
          </div>
        </div>

        ${renderActionPlanPanelActions(panel.panelId, isEditing, panel)}
      </div>

      ${renderActionPlanDocumentLinks(item)}

      ${item.agendaText ? `
        <div class="action-plan-text action-plan-description">
          ${formatActionPlanText(item.agendaText)}
        </div>
      ` : ''}

      ${isEditing ? renderEditFieldsForItem(item, type, panel.panelId) : renderViewFieldsForItem(item, type)}
    </article>
  `;
}

function renderQuestionGroupPanel(panel, index, isEditing) {
  const questions = panel.items || [];
  const type = String(panel.type || '').toUpperCase();
  const title = formatActionPlanItemType(type);

  return `
    <article class="action-plan-item action-plan-question-group ${isEditing ? 'is-editing' : 'is-viewing'} ${isActionPlanPanelLive(panel) ? 'is-live' : ''}" id="api_panel_${escapeHtml(panel.panelId)}">
      <div class="action-plan-item-head">
        <div>
          <div class="action-plan-kicker">
            <span class="action-plan-running-number">${escapeHtml(panel.displayNumber || String(index + 1))}</span>
            <h2>${escapeHtml(title)}</h2>
          </div>
        </div>

        ${renderActionPlanPanelActions(panel.panelId, isEditing, panel)}
      </div>

      <div class="action-plan-question-list">
        ${questions.map((question, qIndex) => renderQuestionRow(question, qIndex, isEditing, type)).join('')}
      </div>

      ${isEditing ? renderActionPlanPanelEditToolbar(panel.panelId) : ''}
    </article>
  `;
}

function renderQuestionRow(item, index, isEditing, groupType) {
  const type = String(groupType || item.type || item.itemType || '').toUpperCase();
  const questionLabel = getActionPlanQuestionLabel(index);
  const answerer = getQuestionAnsweringCouncillorName(item) || 'To be confirmed';
  const asker = type === 'MEMBER_QUESTIONS'
    ? (getQuestionAskerName(item) || 'Member')
    : 'Member of the public';

  return `
    <section class="action-plan-question-row">
    

      ${renderActionPlanQuestionCard(answerer, asker, questionLabel, type)}

      ${item.agendaText ? `
        <div class="action-plan-text action-plan-description">
          ${formatActionPlanText(item.agendaText)}
        </div>
      ` : ''}

      ${isEditing ? `
        ${renderAgendaTextEdit(item)}
        <label>Answer</label>
        <textarea id="answer_${escapeHtml(item.itemId)}" rows="7">${escapeHtml(item.answer || '')}</textarea>
      ` : renderAnswerView(item)}
    </section>
  `;
}

function renderActionPlanQuestionCard(answererName, askerName, questionLabel, type) {
  const answererCouncillor = findActionPlanCouncillorByName(answererName);
  const isPublicQuestion = String(type || '').toUpperCase() === 'PUBLIC_QUESTIONS';
  const askerCouncillor = isPublicQuestion ? null : findActionPlanCouncillorByName(askerName);

  return `
    <div class="action-plan-question-card">
      <div class="action-plan-question-title">
        ${escapeHtml(questionLabel)}
      </div>

      <div class="action-plan-question-grid">
        ${renderActionPlanQuestionPersonRow(answererName, answererCouncillor, 'Answering', 'answering', false)}
        ${renderActionPlanQuestionPersonRow(askerName, askerCouncillor, 'Asking', 'asking', isPublicQuestion)}
      </div>
    </div>
  `;
}

function renderActionPlanQuestionPersonRow(name, councillor, questionLabel, role, usePublicPlaceholder) {
  return `
    <div class="action-plan-question-person action-plan-question-person-${escapeHtml(role || '')}">
      ${usePublicPlaceholder
        ? renderActionPlanPublicAvatar()
        : renderActionPlanPersonAvatar(councillor, name)}

      <div class="action-plan-question-person-text">
        <strong>${escapeHtml(cleanCouncillorName(name || ''))}</strong>
        ${questionLabel ? `<span>${escapeHtml(questionLabel)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderActionPlanPublicAvatar() {
  return `
    <div class="action-plan-person-avatar action-plan-person-avatar-public" aria-hidden="true">
      ?
    </div>
  `;
}

function getActionPlanQuestionLabel(index) {
  let n = Number(index || 0) + 1;
  let label = '';

  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }

  return 'Question ' + label;
}

function renderActionPlanPanelActions(panelId, isEditing, panel) {
  if (isEditing) {
    return `
      <div class="action-plan-card-actions">
        <button
          type="button"
          class="action-plan-icon-button"
          onclick="cancelActionPlanPanelEdit('${escapeJs(panelId)}')"
          aria-label="Close edit">
          ✕
        </button>
      </div>
    `;
  }

  const item = panel && panel.items && panel.items.length ? panel.items[0] : {};
  const live = isActionPlanPanelLive(panel);
  const speakState = getActionPlanPanelSpeakState(panel);

  return `
    <div class="action-plan-card-actions">
      ${item.votingInstruction ? `
        <div class="action-plan-top-vote">
          ${renderVoteBadge(item.votingInstruction)}
        </div>
      ` : ''}

      <button
        type="button"
        class="action-plan-speak-button ${speakState.isSpeaking ? 'is-speaking' : ''}"
        onclick="toggleActionPlanSpeakForPanel('${escapeJs(panelId)}')"
        aria-label="Request to speak">
        ${speakState.isSpeaking ? 'Speaking' : 'Speak'}
      </button>

      <button
        type="button"
        class="action-plan-live-button ${live ? 'is-live' : ''}"
        onclick="setActionPlanLivePanel('${escapeJs(panelId)}')"
        aria-label="Toggle this item live">
        Live
      </button>

      <button
        type="button"
        class="action-plan-icon-button"
        onclick="editActionPlanPanel('${escapeJs(panelId)}')"
        aria-label="Edit item">
        ✎
      </button>
    </div>
  `;
}

function isActionPlanPanelLive(panel) {
  const liveId = String(actionPlanLiveItemId || '').trim();
  if (!liveId || !panel) return false;

  if (String(panel.panelId || '') === liveId) return true;

  return (panel.items || []).some(item => {
    const itemId = String(item.itemId || '').trim();
    return liveId === itemId || liveId.indexOf(itemId + '::') === 0;
  });
}

function setActionPlanLivePanel(panelId) {
  const panel = (actionPlanLastRenderedPanels || []).find(row => String(row.panelId) === String(panelId));
  const item = panel && panel.items && panel.items.length ? panel.items[0] : null;
  const targetId = item ? String(item.itemId || '').trim() : '';

  if (!currentActionPlanId || !targetId) return;

  const nextLiveId = String(actionPlanLiveItemId || '').trim() === targetId ? '' : targetId;
  saveActionPlanLiveTarget(nextLiveId);
}


function saveActionPlanLiveTarget(nextLiveId) {
  nextLiveId = String(nextLiveId || '').trim();

  actionPlanLiveItemId = nextLiveId;
  actionPlanPollBlockedUntil = Number.MAX_SAFE_INTEGER;

  if (currentActionPlanData && currentActionPlanData.plan) {
    currentActionPlanData.plan.liveItemId = nextLiveId;
    currentActionPlanData.plan.livePanelId = nextLiveId;
  }

  applyActionPlanLiveUi();

  LG_API.run
    .withSuccessHandler(function(data) {
      currentActionPlanData = data || currentActionPlanData;

      if (currentActionPlanData && currentActionPlanData.plan) {
        actionPlanLiveItemId = String(
          currentActionPlanData.plan.liveItemId ||
          currentActionPlanData.plan.livePanelId ||
          nextLiveId
        ).trim();
      }

      cacheActionPlanData(currentActionPlanData);

      setTimeout(function() {
        actionPlanPollBlockedUntil = 0;
        applyActionPlanLiveUi();
      }, 1000);
    })
    .withFailureHandler(function(error) {
      actionPlanPollBlockedUntil = 0;
      showError(error);
      pollActionPlanChanges();
    })
    .LabourGroup_setActionPlanLiveItem(
      currentActionPlanId,
      nextLiveId,
      getAuthToken()
    );
}

function setActionPlanLiveAmendment(itemId, amendmentId) {
  const targetId = String(itemId || '').trim() + '::' + String(amendmentId || '').trim();
  const nextLiveId = String(actionPlanLiveItemId || '').trim() === targetId ? '' : targetId;
  saveActionPlanLiveTarget(nextLiveId);
}

function isActionPlanAmendmentLive(itemId, amendmentId) {
  const targetId = String(itemId || '').trim() + '::' + String(amendmentId || '').trim();
  return String(actionPlanLiveItemId || '').trim() === targetId;
}

function getActionPlanPanelSpeakState(panel) {
  const target = getActionPlanSpeakTargetForPanel(panel);
  const speaker = getCurrentActionPlanSpeakerName();

  return {
    target,
    speaker,
    isSpeaking: target && speaker
      ? isCurrentActionPlanSpeakerInList(target.speakers || [])
      : false
  };
}

function getActionPlanSpeakTargetForPanel(panel) {
  const item = panel && panel.items && panel.items.length ? panel.items[0] : null;
  if (!item) return null;

  const liveId = String(actionPlanLiveItemId || '').trim();

  if (liveId.indexOf(String(item.itemId || '') + '::') === 0) {
    const amendmentId = liveId.split('::')[1] || '';
    const amendment = normaliseActionPlanAmendments(item.amendments || []).find(row =>
      String(row.amendmentId || '') === amendmentId
    );

    if (amendment) {
      return {
        kind: 'amendment',
        itemId: item.itemId,
        amendmentId: amendment.amendmentId,
        speakers: amendment.speakers || []
      };
    }
  }

  return {
    kind: 'item',
    itemId: item.itemId,
    speakers: getActionPlanItemSpeakers(item)
  };
}

function toggleActionPlanSpeakForPanel(panelId) {
  const panel = (actionPlanLastRenderedPanels || []).find(row => String(row.panelId) === String(panelId));
  const target = getActionPlanSpeakTargetForPanel(panel);

  if (!target) return;

  if (target.kind === 'amendment') {
    toggleActionPlanSpeakForAmendment(target.itemId, target.amendmentId);
    return;
  }

  toggleActionPlanSpeakForItem(target.itemId);
}

function toggleActionPlanSpeakForItem(itemId) {
  const speaker = getCurrentActionPlanSpeakerName();
  if (!speaker || !itemId) return;

  const item = getCurrentActionPlanItemById(itemId);
  if (!item) return;

  actionPlanPollBlockedUntil = Number.MAX_SAFE_INTEGER;

  const speakers = toggleNameInActionPlanSpeakerList(getActionPlanItemSpeakers(item), speaker);

  item.speakers = speakers.join('\n');
  item.speakerList = speakers.slice();
  actionPlanSpeakerDrafts[itemId] = speakers.slice();

  refreshActionPlanItemViewSpeakers(itemId, speakers);
  patchActionPlanItemNow(itemId, { speakers });
}

function refreshActionPlanItemViewSpeakers(itemId, speakers) {
  const panelEl = getActionPlanPanelElementForItem(itemId);
  if (!panelEl) return;

  speakers = (speakers || []).map(String).map(s => s.trim()).filter(Boolean);

  const speakButton = panelEl.querySelector('.action-plan-speak-button');
  const isSpeaking = isCurrentActionPlanSpeakerInList(speakers);

  if (speakButton) {
    speakButton.classList.toggle('is-speaking', isSpeaking);
    speakButton.textContent = isSpeaking ? 'Speaking' : 'Speak';
  }

  let debateView = panelEl.querySelector('.action-plan-view-grid');

  if (!debateView && speakers.length) {
    const emptyNote = panelEl.querySelector('.action-plan-empty-note');

    if (emptyNote) {
      emptyNote.outerHTML = `
        <div class="action-plan-view-grid action-plan-speaker-only-view"></div>
      `;
    } else {
      panelEl.insertAdjacentHTML(
        'beforeend',
        `<div class="action-plan-view-grid action-plan-speaker-only-view"></div>`
      );
    }

    debateView = panelEl.querySelector('.action-plan-view-grid');
  }

  if (!debateView) return;

  const existingSpeakerBlock = debateView.querySelector('.action-plan-view-block-wide');

  if (!speakers.length) {
    if (existingSpeakerBlock) {
      existingSpeakerBlock.remove();
    }

    if (!debateView.children.length) {
      debateView.outerHTML = `<div class="action-plan-empty-note">No mover, seconder or speakers added yet.</div>`;
    }

    return;
  }

  const html = `
    <div class="action-plan-view-block action-plan-view-block-wide">
      <span>Speakers</span>
      <div class="action-plan-view-speakers">
        ${speakers.map(name => renderPersonMini(name)).join('')}
      </div>
    </div>
  `;

  if (existingSpeakerBlock) {
    existingSpeakerBlock.outerHTML = html;
  } else {
    debateView.insertAdjacentHTML('beforeend', html);
  }
}

function getActionPlanPanelElementForItem(itemId) {
  const direct = document.getElementById('api_panel_' + itemId);
  if (direct) return direct;

  const panel = (actionPlanLastRenderedPanels || []).find(panel =>
    (panel.items || []).some(item => String(item.itemId || '') === String(itemId || ''))
  );

  return panel ? document.getElementById('api_panel_' + panel.panelId) : null;
}

function markActionPlanItemDirty(itemId) {
  actionPlanLocalDirtyItems[String(itemId || '')] = Date.now() + 5000;
}

function isActionPlanItemDirty(itemId) {
  const key = String(itemId || '');
  return actionPlanLocalDirtyItems[key] && actionPlanLocalDirtyItems[key] > Date.now();
}

function clearActionPlanItemDirty(itemId) {
  delete actionPlanLocalDirtyItems[String(itemId || '')];
}

function toggleActionPlanSpeakForAmendment(itemId, amendmentId) {
  const speaker = getCurrentActionPlanSpeakerName();
  if (!speaker || !itemId || !amendmentId) return;

  const item = getCurrentActionPlanItemById(itemId);
  if (!item) return;

  actionPlanPollBlockedUntil = Number.MAX_SAFE_INTEGER;

  const amendments = normaliseActionPlanAmendments(item.amendments || []);
  const amendment = amendments.find(row => String(row.amendmentId || '') === String(amendmentId || ''));
  if (!amendment) return;

  amendment.speakers = toggleNameInActionPlanSpeakerList(amendment.speakers || [], speaker);

  item.amendments = amendments;
  actionPlanAmendmentDrafts[itemId] = amendments.slice();

  refreshActionPlanAmendmentViewCard(itemId, amendmentId, amendment);

  patchActionPlanItemNow(itemId, {
    amendmentSpeakers: amendment.speakers.join('\n')
  });
}

function refreshActionPlanAmendmentViewCard(itemId, amendmentId, amendment) {
  const card = document.getElementById('api_amendment_' + itemId + '_' + amendmentId);
  if (!card) return;

  const speakButton = card.querySelector('.action-plan-speak-button');
  const isSpeaking = isCurrentActionPlanSpeakerInList(amendment.speakers || []);

  if (speakButton) {
    speakButton.classList.toggle('is-speaking', isSpeaking);
    speakButton.textContent = isSpeaking ? 'Speaking' : 'Speak';
  }

  const grid = card.querySelector('.action-plan-view-grid');
  if (!grid) return;

  grid.innerHTML = `
    ${amendment.mover ? renderPersonView('Mover', amendment.mover) : ''}
    ${amendment.seconder ? renderPersonView('Seconder', amendment.seconder) : ''}
    ${amendment.speakers && amendment.speakers.length ? `
      <div class="action-plan-view-block action-plan-view-block-wide">
        <span>Speakers</span>
        <div class="action-plan-view-speakers">
          ${amendment.speakers.map(name => renderPersonMini(name)).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function patchActionPlanItemNow(itemId, fields) {
  markActionPlanItemDirty(itemId);
  applyActionPlanItemPatchLocally(itemId, fields || {});
  updateActionPlanSaveStatus('Saving...');

  LG_API.run
    .withSuccessHandler(function(result) {
      mergeActionPlanPatchResult(result);
      updateActionPlanSaveStatus('Saved');
      applyActionPlanLiveUi();

      setTimeout(function() {
        clearActionPlanItemDirty(itemId);
      }, 1200);
    })
    .withFailureHandler(function(error) {
      updateActionPlanSaveStatus('Not saved');
      showError(error);
    })
    .LabourGroup_patchActionPlanItems(
      currentActionPlanId,
      [{ itemId: itemId, updates: fields || {} }],
      getAuthToken()
    );
}

function getCurrentActionPlanItemById(itemId) {
  return currentActionPlanData && currentActionPlanData.items
    ? currentActionPlanData.items.find(row => String(row.itemId || '') === String(itemId || ''))
    : null;
}

function toggleNameInActionPlanSpeakerList(list, name) {
  const cleanName = cleanCouncillorName(name || '');
  const key = cleanName.toLowerCase();
  const existing = (list || []).map(String).map(s => s.trim()).filter(Boolean);
  const already = existing.some(row => cleanCouncillorName(row).toLowerCase() === key);

  if (already) {
    return existing.filter(row => cleanCouncillorName(row).toLowerCase() !== key);
  }

  existing.push(cleanName);
  return existing;
}

function isCurrentActionPlanSpeakerInList(list) {
  const speaker = getCurrentActionPlanSpeakerName();
  const key = cleanCouncillorName(speaker || '').toLowerCase();

  if (!key) return false;

  return (list || []).some(name =>
    cleanCouncillorName(name || '').toLowerCase() === key
  );
}

function getCurrentActionPlanSpeakerName() {
  const user = currentUser || (currentActionPlanData && currentActionPlanData.user) || {};
  const username = String(user.username || '').trim().toLowerCase();
  const displayName = cleanCouncillorName(user.displayName || '');
  const usernameName = usernameToActionPlanDisplayName(username);
  const candidates = [usernameName, displayName].filter(Boolean);

  for (let i = 0; i < candidates.length; i++) {
    const matched = findActionPlanCouncillorByUsernameName(candidates[i]);
    if (matched) return cleanCouncillorName(matched.name || matched.displayName || candidates[i]);
  }

  return candidates[0] || 'Toby Forster';
}

function usernameToActionPlanDisplayName(username) {
  const clean = String(username || '').trim();
  if (!clean) return '';

  return clean
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function findActionPlanCouncillorByUsernameName(name) {
  const clean = cleanCouncillorName(name || '').toLowerCase();
  if (!clean) return null;

  const councillors = getActionPlanCouncillors();

  return councillors.find(c => {
    const councillorName = cleanCouncillorName(c.name || c.displayName || '').toLowerCase();
    return councillorName === clean || councillorName.endsWith(' ' + clean);
  }) || null;
}

function editActionPlanPanel(panelId) {
  editingActionPlanPanels[panelId] = true;
  renderActionPlan(currentActionPlanData);
}

function cancelActionPlanPanelEdit(panelId) {
  closeActionPlanPanelEdit(panelId);
}

function closeActionPlanPanelEdit(panelId) {
  flushActionPlanAutosave();
  delete editingActionPlanPanels[panelId];
  renderActionPlan(currentActionPlanData);
}

function renderViewFieldsForItem(item, type) {
  if (type === 'PUBLIC_QUESTIONS' || type === 'MEMBER_QUESTIONS') {
    return renderAnswerView(item) + renderSpeakerOnlyView(item);
  }

  if (actionPlanItemNeedsDebateControls(item, type)) {
    return renderDebateView(item);
  }

  return renderSpeakerOnlyView(item) + renderExplanationView(item, 'Notes');
}

function renderSpeakerOnlyView(item) {
  const speakers = getActionPlanItemSpeakers(item);

  if (!speakers.length) {
    return '';
  }

  return `
    <div class="action-plan-view-grid action-plan-speaker-only-view">
      <div class="action-plan-view-block action-plan-view-block-wide">
        <span>Speakers</span>
        <div class="action-plan-view-speakers">
          ${speakers.map(name => renderPersonMini(name)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderEditFieldsForItem(item, type, panelId) {
  if (type === 'PUBLIC_QUESTIONS' || type === 'MEMBER_QUESTIONS') {
    return `
      ${renderAgendaTextEdit(item)}
      <label>Answer</label>
      <textarea id="answer_${escapeHtml(item.itemId)}" rows="8">${escapeHtml(item.answer || '')}</textarea>
      ${renderActionPlanPanelEditToolbar(panelId)}
    `;
  }

  if (actionPlanItemNeedsDebateControls(item, type)) {
    return `
      ${renderAgendaTextEdit(item)}
      ${renderDebateEdit(item)}
      ${renderActionPlanPanelEditToolbar(panelId)}
    `;
  }

  return `
    ${renderAgendaTextEdit(item)}
    <label>Notes</label>
    <textarea id="explanation_${escapeHtml(item.itemId)}" rows="4">${escapeHtml(item.explanation || '')}</textarea>
    ${renderActionPlanPanelEditToolbar(panelId)}
  `;
}

function renderAgendaTextEdit(item) {
  return `
    <label>Agenda text</label>
    <textarea id="agendaText_${escapeHtml(item.itemId)}" rows="6">${escapeHtml(item.agendaText || '')}</textarea>
  `;
}

function actionPlanItemNeedsDebateControls(item, type) {
  const cleanType = String(type || item.type || item.itemType || '').toUpperCase();
  const title = normaliseActionPlanControlTitle(item.title || '');

  const noDebateTitles = [
    'apologies for absence',
    'declarations of disclosable pecuniary interests',
    'declarations of disclose',
    'record of meeting',
    'mayors announcements',
    'mayors annoucements',
    'mayor announcements',
    'mayor annoucements',
    'leaders announcement',
    'leaders announcements',
    'leader announcement',
    'leader announcements',
    'petitions'
  ];

  if (noDebateTitles.some(value => title === value || title.indexOf(value) === 0)) {
    return false;
  }

  return cleanType === 'MOTIONS' || cleanType === 'REPORT' || cleanType === 'LEADER_REPORT';
}

function normaliseActionPlanControlTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderActionPlanPanelEditToolbar(panelId) {
  return `
    <div class="action-plan-edit-toolbar">
      <button type="button" class="action-plan-secondary-button" onclick="closeActionPlanPanelEdit('${escapeJs(panelId)}')">Close</button>
    </div>
  `;
}

function renderActionPlanDocumentLinks(item) {
  const links = [];

  if (item.documentUrl) {
    links.push(`<a href="${escapeHtml(item.documentUrl)}" target="_blank">Source PDF</a>`);
  }

  (item.additionalDocumentUrls || []).forEach((url, index) => {
    links.push(`<a href="${escapeHtml(url)}" target="_blank">Appendix ${index + 1}</a>`);
  });

  if (!links.length) return '';

  return `
    <div class="action-plan-doc-links">
      ${links.join('')}
    </div>
  `;
}

function renderAnswerView(item) {
  if (!item.answer) {
    return `<div class="action-plan-empty-note">No answer added yet.</div>`;
  }

  return `
    <details class="action-plan-view-details" open>
      <summary>Answer</summary>
      <div class="action-plan-answer-text">
        ${formatActionPlanText(item.answer)}
      </div>
    </details>
  `;
}

function renderDebateView(item) {
  const speakers = getActionPlanItemSpeakers(item);
  const blocks = [];

  if (item.mover) {
    blocks.push(renderPersonView('Mover', item.mover));
  }

  if (item.seconder) {
    blocks.push(renderPersonView('Seconder', item.seconder));
  }

  if (speakers.length) {
    blocks.push(`
      <div class="action-plan-view-block action-plan-view-block-wide">
        <span>Speakers</span>
        <div class="action-plan-view-speakers">
          ${speakers.map(name => renderPersonMini(name)).join('')}
        </div>
      </div>
    `);
  }

  const content = blocks.length ? `
    <div class="action-plan-view-grid">
      ${blocks.join('')}
    </div>
  ` : `<div class="action-plan-empty-note">No mover, seconder or speakers added yet.</div>`;

  return `
    ${content}
    ${renderActionPlanAmendmentsView(item)}
    ${renderExplanationView(item, 'Notes')}
  `;
}

function renderActionPlanAmendmentsView(item) {
  const amendments = normaliseActionPlanAmendments(item.amendments || []);

  if (!amendments.length) return '';

  return `
    <section class="action-plan-amendments-view">
      <h3>Amendments</h3>
      ${amendments.map((amendment, index) => {
        const amendmentLive = isActionPlanAmendmentLive(item.itemId, amendment.amendmentId);
        const amendmentSpeaking = isCurrentActionPlanSpeakerInList(amendment.speakers || []);

        return `
          <article class="action-plan-amendment-card ${amendmentLive ? 'is-live' : ''}" id="api_amendment_${escapeHtml(item.itemId)}_${escapeHtml(amendment.amendmentId)}" data-item-id="${escapeHtml(item.itemId)}" data-amendment-id="${escapeHtml(amendment.amendmentId)}">
            <div class="action-plan-amendment-head">
              <strong>${escapeHtml(amendment.title || ('Amendment ' + (index + 1)))}</strong>

              <div class="action-plan-amendment-actions">
                ${amendment.votingInstruction ? renderVoteBadge(amendment.votingInstruction) : ''}

                <button
                  type="button"
                  class="action-plan-speak-button ${amendmentSpeaking ? 'is-speaking' : ''}"
                  onclick="toggleActionPlanSpeakForAmendment('${escapeJs(item.itemId)}', '${escapeJs(amendment.amendmentId)}')">
                  ${amendmentSpeaking ? 'Speaking' : 'Speak'}
                </button>

                <button
                  type="button"
                  class="action-plan-live-button ${amendmentLive ? 'is-live' : ''}"
                  onclick="setActionPlanLiveAmendment('${escapeJs(item.itemId)}', '${escapeJs(amendment.amendmentId)}')">
                  Live
                </button>
              </div>
            </div>

            ${amendment.text ? `
              <div class="action-plan-text action-plan-amendment-text">
                ${formatActionPlanText(amendment.text)}
              </div>
            ` : ''}

            <div class="action-plan-view-grid">
              ${amendment.mover ? renderPersonView('Mover', amendment.mover) : ''}
              ${amendment.seconder ? renderPersonView('Seconder', amendment.seconder) : ''}
              ${amendment.speakers && amendment.speakers.length ? `
                <div class="action-plan-view-block action-plan-view-block-wide">
                  <span>Speakers</span>
                  <div class="action-plan-view-speakers">
                    ${amendment.speakers.map(name => renderPersonMini(name)).join('')}
                  </div>
                </div>
              ` : ''}
            </div>

            ${amendment.explanation ? `
              <div class="action-plan-answer-text">
                ${formatActionPlanText(amendment.explanation)}
              </div>
            ` : ''}
          </article>
        `;
      }).join('')}
    </section>
  `;
}

function renderExplanationView(item, label) {
  if (!item.explanation) return '';

  return `
    <details class="action-plan-view-details">
      <summary>${escapeHtml(label || 'Notes')}</summary>
      <div class="action-plan-answer-text">
        ${formatActionPlanText(item.explanation)}
      </div>
    </details>
  `;
}

function renderPersonView(label, name) {
  return `
    <div class="action-plan-view-block">
      <span>${escapeHtml(label)}</span>
      ${renderPersonMini(name)}
    </div>
  `;
}

function renderPersonMini(name) {
  const councillor = findActionPlanCouncillorByName(name);

  return `
    <div class="action-plan-person-mini">
      ${renderActionPlanPersonAvatar(councillor, name)}
      <strong>${escapeHtml(cleanCouncillorName(name))}</strong>
    </div>
  `;
}

function getQuestionAskerName(item) {
  const text = String((item && item.agendaText) || '');
  const firstLine = getQuestionFirstLine_(text);

  const match = firstLine.match(/\bCouncillor\s+(.+?)\s+will\s+ask\b/i);
  if (!match) return '';

  return findFullActionPlanCouncillorNameBySurname(match[1]);
}

function getQuestionAnsweringCouncillorName(item) {
  const text = String((item && item.agendaText) || '');
  const firstLine = getQuestionFirstLine_(text);

  let match = firstLine.match(/\bwill\s+ask\s+.*?\bCouncillor\s+(.+?)\s*,?\s+the\s+following/i);

  if (!match) {
    match = firstLine.match(/\bwill\s+ask\s+.*?\bCouncillor\s+(.+?)(?:,|$)/i);
  }

  if (!match) return '';

  return findFullActionPlanCouncillorNameBySurname(match[1]);
}

function getQuestionFirstLine_(text) {
  return String(text || '')
    .split(/\n|"/)[0]
    .trim();
}

function findFullActionPlanCouncillorNameBySurname(value) {
  let cleanValue = cleanCouncillorName(value || '').toLowerCase();

  cleanValue = cleanValue
    .replace(/^cllr\s+/i, '')
    .replace(/^councillor\s+/i, '')
    .replace(/^mr\s+/i, '')
    .replace(/^mrs\s+/i, '')
    .replace(/^ms\s+/i, '')
    .replace(/^miss\s+/i, '')
    .trim();

  if (!cleanValue) return '';

  const councillors = getAllActionPlanCouncillorsForMatching_();

  const exact = councillors.find(c => {
    const name = cleanCouncillorName(c.name || c.displayName || '').toLowerCase();
    return name === cleanValue;
  });

  if (exact) {
    return cleanCouncillorName(exact.name || exact.displayName || '');
  }

  const surnameMatch = councillors.find(c => {
    const name = cleanCouncillorName(c.name || c.displayName || '').toLowerCase();
    return name.endsWith(' ' + cleanValue) || name === cleanValue;
  });

  return surnameMatch
    ? cleanCouncillorName(surnameMatch.name || surnameMatch.displayName || '')
    : value;
}

function getAllActionPlanCouncillorsForMatching_() {
  return (
    currentActionPlanData &&
    (
      currentActionPlanData.councillors ||
      currentActionPlanData.allCouncillors ||
      currentActionPlanData.labourCouncillors ||
      []
    )
  ) || [];
}

function escapeRegExpForActionPlan(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderVoteBadge(value) {
  const clean = String(value || '').toUpperCase();
  const cls = clean === 'FOR' ? 'for' : clean === 'AGAINST' ? 'against' : clean === 'ABSTAIN' ? 'abstain' : 'free';
  const label = clean === 'FREE VOTE'
    ? 'FREE VOTE'
    : clean;

  return `<strong class="action-plan-vote-badge vote-${escapeHtml(cls)}">${escapeHtml(label)}</strong>`;
}

function renderDebateEdit(item) {
  return `
    ${renderMoverSeconderFields(item)}
    ${renderSpeakerPicker(item)}
    ${renderVotingField(item)}
    ${renderActionPlanAmendmentsEdit(item)}

    <label>Notes / explanation</label>
    <textarea id="explanation_${escapeHtml(item.itemId)}" rows="5">${escapeHtml(item.explanation || '')}</textarea>
  `;
}


function renderActionPlanAmendmentsEdit(item) {
  const amendments = actionPlanAmendmentDrafts[item.itemId] || normaliseActionPlanAmendments(item.amendments || []);

  return `
    <section class="action-plan-amendments-edit">
      <div class="action-plan-section-title-row">
        <h3>Amendments</h3>
        <button type="button" class="action-plan-secondary-button" onclick="addActionPlanAmendment('${escapeJs(item.itemId)}')">
          Add amendment
        </button>
      </div>

      <div id="amendmentsWrap_${escapeHtml(item.itemId)}">
        ${renderActionPlanAmendmentEditorList(item.itemId, amendments)}
      </div>

      <input type="hidden" id="amendments_${escapeHtml(item.itemId)}" value="${escapeHtml(JSON.stringify(amendments))}">
    </section>
  `;
}

function renderActionPlanAmendmentEditorList(itemId, amendments) {
  if (!amendments || !amendments.length) {
    return `<p class="action-plan-empty-note">No amendments added yet.</p>`;
  }

  return amendments.map((amendment, index) => renderActionPlanAmendmentEditor(itemId, amendment, index)).join('');
}

function renderActionPlanAmendmentEditor(itemId, amendment, index) {
  const baseId = 'amendment_' + itemId + '_' + index;

  return `
    <article class="action-plan-amendment-editor" data-item-id="${escapeHtml(itemId)}" data-amendment-index="${escapeHtml(index)}">
      <div class="action-plan-amendment-editor-head">
        <strong>Amendment ${escapeHtml(index + 1)}</strong>
        <button type="button" class="action-plan-remove-speaker" onclick="removeActionPlanAmendment('${escapeJs(itemId)}', ${index})">Remove</button>
      </div>

      <label>Amendment title</label>
      <input id="${escapeHtml(baseId)}_title" value="${escapeHtml(amendment.title || ('Amendment ' + (index + 1)))}" oninput="updateActionPlanAmendmentDraft('${escapeJs(itemId)}')">

      <label>Amendment text</label>
      <textarea id="${escapeHtml(baseId)}_text" rows="5" oninput="updateActionPlanAmendmentDraft('${escapeJs(itemId)}')">${escapeHtml(amendment.text || '')}</textarea>

      <div class="action-plan-people-grid">
        <div>
          <label>Mover</label>
          ${renderCouncillorPickerWithPreview(baseId + '_mover', amendment.mover || '')}
        </div>
        <div>
          <label>Seconder</label>
          ${renderCouncillorPickerWithPreview(baseId + '_seconder', amendment.seconder || '')}
        </div>
      </div>

      ${renderActionPlanAmendmentSpeakerPicker(itemId, index, amendment.speakers || [])}

      ${renderAmendmentVotingField(itemId, index, amendment.votingInstruction || '')}

      <label>Notes / explanation</label>
      <textarea id="${escapeHtml(baseId)}_explanation" rows="3" oninput="updateActionPlanAmendmentDraft('${escapeJs(itemId)}')">${escapeHtml(amendment.explanation || '')}</textarea>
    </article>
  `;
}

function renderAmendmentVotingField(itemId, index, selectedValue) {
  const selected = String(selectedValue || '').toUpperCase();
  const options = [
    { value: 'FOR', label: 'For', className: 'for' },
    { value: 'AGAINST', label: 'Against', className: 'against' },
    { value: 'ABSTAIN', label: 'Abstain', className: 'abstain' },
    { value: 'FREE VOTE', label: 'Free vote', className: 'free' }
  ];

  return `
    <label>Voting instruction</label>
    <div class="action-plan-vote-buttons" id="amendmentVoteButtons_${escapeHtml(itemId)}_${escapeHtml(index)}">
      ${options.map(option => `
        <button
          type="button"
          data-vote-value="${escapeHtml(option.value)}"
          class="vote-choice vote-${escapeHtml(option.className)} ${selected === option.value ? 'selected' : ''}"
          onclick="setActionPlanAmendmentVote('${escapeJs(itemId)}', ${index}, '${escapeJs(option.value)}')">
          ${escapeHtml(option.label)}
        </button>
      `).join('')}
    </div>
    <input type="hidden" id="amendment_${escapeHtml(itemId)}_${escapeHtml(index)}_voting" value="${escapeHtml(selected)}">
  `;
}

function renderActionPlanAmendmentSpeakerPicker(itemId, index, speakers) {
  speakers = (speakers || []).map(String).map(s => s.trim()).filter(Boolean);
  const pickerId = 'amendmentSpeakerPicker_' + itemId + '_' + index;

  return `
    <label>Speakers</label>

    <div class="action-plan-speaker-picker">
      ${renderCouncillorSelect(pickerId, '')}

      <button
        class="action-plan-add-speaker"
        type="button"
        onclick="addActionPlanAmendmentSpeaker(this, '${escapeJs(itemId)}', ${index})">
        Add speaker
      </button>
    </div>

    <div class="action-plan-speaker-list">
      ${renderActionPlanAmendmentSpeakerList(itemId, index, speakers)}
    </div>

    <input
      type="hidden"
      class="action-plan-amendment-speakers-hidden"
      value="${escapeHtml(speakers.join('\n'))}">
  `;
}

function addActionPlanAmendmentSpeaker(button, itemId, index) {
  const editor = button.closest('.action-plan-amendment-editor');
  if (!editor) return;

  const picker = editor.querySelector('select[id^="amendmentSpeakerPicker_"]');
  const list = editor.querySelector('.action-plan-speaker-list');
  const hidden = editor.querySelector('.action-plan-amendment-speakers-hidden');

  const name = picker ? String(picker.value || '').trim() : '';
  if (!name) return;

  const speakers = hidden && hidden.value
    ? hidden.value.split('\n').map(s => s.trim()).filter(Boolean)
    : [];

  const key = cleanCouncillorName(name).toLowerCase();

  if (!speakers.some(s => cleanCouncillorName(s).toLowerCase() === key)) {
    speakers.push(name);
  }

  if (picker) picker.value = '';
  if (hidden) hidden.value = speakers.join('\n');

  if (list) {
    list.innerHTML = renderActionPlanAmendmentSpeakerList(itemId, index, speakers);
  }

  updateActionPlanSaveStatus('Saving...');

  LG_API.run
    .withSuccessHandler(function(result) {
      mergeActionPlanPatchResult(result);
      updateActionPlanSaveStatus('Saved');
    })
    .withFailureHandler(function(error) {
      updateActionPlanSaveStatus('Not saved');
      showError(error);
    })
    .LabourGroup_patchActionPlanItems(
      currentActionPlanId,
      [{
        itemId: itemId,
        updates: {
          amendmentSpeakers: speakers.join('\n')
        }
      }],
      getAuthToken()
    );
}

function renderActionPlanAmendmentSpeakerList(itemId, index, speakers) {
  if (!speakers || !speakers.length) {
    return `<p>No speakers added yet.</p>`;
  }

  return speakers.map((name, speakerIndex) => {
    const councillor = findActionPlanCouncillorByName(name);

    return `
      <div class="action-plan-speaker-chip">
        ${renderActionPlanPersonAvatar(councillor, name)}
        <span>${escapeHtml(cleanCouncillorName(name))}</span>

        <button
          class="action-plan-remove-speaker"
          type="button"
          onclick="removeActionPlanAmendmentSpeaker(this, '${escapeJs(itemId)}', ${index}, ${speakerIndex})">
          Remove
        </button>
      </div>
    `;
  }).join('');
}

function getActionPlanAmendmentSpeakerDraft(itemId, index) {
  if (!actionPlanAmendmentSpeakerDrafts[itemId]) {
    actionPlanAmendmentSpeakerDrafts[itemId] = {};
  }

  if (!actionPlanAmendmentSpeakerDrafts[itemId][index]) {
    const amendments = actionPlanAmendmentDrafts[itemId] || [];
    const amendment = amendments[index] || {};
    actionPlanAmendmentSpeakerDrafts[itemId][index] =
      (amendment.speakers || []).map(String).map(s => s.trim()).filter(Boolean);
  }

  return actionPlanAmendmentSpeakerDrafts[itemId][index];
}

function removeActionPlanAmendmentSpeaker(button, itemId, index, speakerIndex) {
  const editor = button.closest('.action-plan-amendment-editor');
  if (!editor) return;

  const list = editor.querySelector('.action-plan-speaker-list');
  const hidden = editor.querySelector('.action-plan-amendment-speakers-hidden');

  const speakers = hidden && hidden.value
    ? hidden.value.split('\n').map(s => s.trim()).filter(Boolean)
    : [];

  speakers.splice(speakerIndex, 1);

  if (hidden) hidden.value = speakers.join('\n');

  if (list) {
    list.innerHTML = renderActionPlanAmendmentSpeakerList(itemId, index, speakers);
  }

  updateActionPlanSaveStatus('Saving...');

  LG_API.run
    .withSuccessHandler(function(result) {
      mergeActionPlanPatchResult(result);
      updateActionPlanSaveStatus('Saved');
    })
    .withFailureHandler(function(error) {
      updateActionPlanSaveStatus('Not saved');
      showError(error);
    })
    .LabourGroup_patchActionPlanItems(
      currentActionPlanId,
      [{
        itemId: itemId,
        updates: {
          amendmentSpeakers: speakers.join('\n')
        }
      }],
      getAuthToken()
    );
}

function refreshActionPlanAmendmentSpeakerList(itemId, index, speakers) {
  speakers = (speakers || []).map(String).map(s => s.trim()).filter(Boolean);

  if (!actionPlanAmendmentSpeakerDrafts[itemId]) {
    actionPlanAmendmentSpeakerDrafts[itemId] = {};
  }
  actionPlanAmendmentSpeakerDrafts[itemId][index] = speakers.slice();

  const hidden = document.getElementById('amendment_' + itemId + '_' + index + '_speakers');
  if (hidden) hidden.value = speakers.join('\n');

  const list = document.getElementById('amendmentSpeakerList_' + itemId + '_' + index);
  if (list) list.innerHTML = renderActionPlanAmendmentSpeakerList(itemId, index, speakers);
}


function addActionPlanAmendment(itemId) {
  const amendments = collectActionPlanAmendmentEditors(itemId).slice(0, 1);

  if (!amendments.length) {
    amendments.push({
      amendmentId: 'amendment_1',
      title: 'Amendment',
      text: '',
      mover: '',
      seconder: '',
      speakers: [],
      votingInstruction: '',
      explanation: ''
    });
  }

  amendments[0].amendmentId = 'amendment_1';

  actionPlanAmendmentDrafts[itemId] = amendments;
  actionPlanAmendmentSpeakerDrafts[itemId] = {};
  amendments.forEach(function(amendment, amendmentIndex) {
    actionPlanAmendmentSpeakerDrafts[itemId][amendmentIndex] =
      (amendment.speakers || []).slice();
  });
  rerenderActionPlanAmendmentEditors(itemId);
  updateActionPlanAmendmentsHidden(itemId, amendments);
  queueActionPlanItemAutosave(itemId);
}

function removeActionPlanAmendment(itemId, index) {
  const amendments = collectActionPlanAmendmentEditors(itemId);
  amendments.splice(index, 1);
  actionPlanAmendmentDrafts[itemId] = amendments;
  actionPlanAmendmentSpeakerDrafts[itemId] = {};
  amendments.forEach(function(amendment, amendmentIndex) {
    actionPlanAmendmentSpeakerDrafts[itemId][amendmentIndex] =
      (amendment.speakers || []).slice();
  });
  rerenderActionPlanAmendmentEditors(itemId);
  updateActionPlanAmendmentsHidden(itemId, amendments);
  queueActionPlanItemAutosave(itemId);
}

function setActionPlanAmendmentVote(itemId, index, value) {
  const cleanValue = String(value || '').toUpperCase();
  const input = document.getElementById('amendment_' + itemId + '_' + index + '_voting');
  if (input) input.value = cleanValue;

  const wrap = document.getElementById('amendmentVoteButtons_' + itemId + '_' + index);
  if (wrap) {
    wrap.querySelectorAll('.vote-choice').forEach(button => {
      button.classList.toggle(
        'selected',
        String(button.getAttribute('data-vote-value') || '').toUpperCase() === cleanValue
      );
    });
  }

  updateActionPlanAmendmentDraft(itemId);

  const amendments = collectActionPlanAmendmentEditors(itemId);
  const amendment = amendments[index] || {};

  patchActionPlanItemNow(itemId, {
    amendments: amendments,
    amendmentText: amendment.text || '',
    amendmentMover: amendment.mover || '',
    amendmentSeconder: amendment.seconder || '',
    amendmentSpeakers: Array.isArray(amendment.speakers) ? amendment.speakers.join('\n') : String(amendment.speakers || ''),
    amendmentVotingInstruction: cleanValue
  });
}

function updateActionPlanAmendmentDraft(itemId) {
  const amendments = collectActionPlanAmendmentEditors(itemId);
  actionPlanAmendmentDrafts[itemId] = amendments;
  updateActionPlanAmendmentsHidden(itemId, amendments);
  queueActionPlanItemAutosave(itemId);
}

function collectActionPlanAmendmentEditors(itemId) {
  const wrap = document.getElementById('amendmentsWrap_' + itemId);
  if (!wrap) return actionPlanAmendmentDrafts[itemId] || [];

  return Array.from(wrap.querySelectorAll('.action-plan-amendment-editor')).map((el, index) => {
    const baseId = 'amendment_' + itemId + '_' + index;
    const existing = actionPlanAmendmentDrafts[itemId] && actionPlanAmendmentDrafts[itemId][index]
      ? actionPlanAmendmentDrafts[itemId][index]
      : {};

    return {
      amendmentId: 'amendment_1',
      title: valueOf(baseId + '_title') || 'Amendment',
      text: valueOf(baseId + '_text'),
      mover: valueOf(baseId + '_mover'),
      seconder: valueOf(baseId + '_seconder'),
      speakers: getActionPlanAmendmentSpeakerDraft(itemId, index),
      votingInstruction: valueOf(baseId + '_voting'),
      explanation: valueOf(baseId + '_explanation')
    };
  });
}

function rerenderActionPlanAmendmentEditors(itemId) {
  const wrap = document.getElementById('amendmentsWrap_' + itemId);
  if (!wrap) return;
  wrap.innerHTML = renderActionPlanAmendmentEditorList(itemId, actionPlanAmendmentDrafts[itemId] || []);
}

function updateActionPlanAmendmentsHidden(itemId, amendments) {
  const input = document.getElementById('amendments_' + itemId);
  if (input) input.value = JSON.stringify(normaliseActionPlanAmendments(amendments || []));
}

function normaliseActionPlanAmendments(value) {
  const rows = Array.isArray(value) ? value.slice(0, 1) : [];

  return rows.map((row) => {
    row = row || {};
    return {
      amendmentId: 'amendment_1',
      title: String(row.title || 'Amendment').trim(),
      text: String(row.text || row.amendmentText || '').trim(),
      mover: String(row.mover || '').trim(),
      seconder: String(row.seconder || '').trim(),
      speakers: Array.isArray(row.speakers)
        ? row.speakers.map(String).map(s => s.trim()).filter(Boolean)
        : String(row.speakers || '').split('\n').map(s => s.trim()).filter(Boolean),
      votingInstruction: String(row.votingInstruction || '').trim().toUpperCase(),
      explanation: String(row.explanation || '').trim()
    };
  }).filter(row =>
    row.text || row.mover || row.seconder ||
    row.speakers.length || row.votingInstruction || row.explanation
  );
}

function renderMoverSeconderFields(item) {
  return `
    <div class="action-plan-people-grid">
      <div>
        <label>Mover</label>
        ${renderCouncillorPickerWithPreview('mover_' + item.itemId, item.mover || '')}
      </div>

      <div>
        <label>Seconder</label>
        ${renderCouncillorPickerWithPreview('seconder_' + item.itemId, item.seconder || '')}
      </div>
    </div>
  `;
}

function renderCouncillorPickerWithPreview(id, selectedValue) {
  return `
    <div class="action-plan-person-picker">
      ${renderCouncillorSelect(id, selectedValue)}
      <div id="${escapeHtml(id)}_preview" class="action-plan-person-preview">
        ${renderSelectedCouncillorPreview(selectedValue)}
      </div>
    </div>
  `;
}

function renderVotingField(item) {
  const selected = String(item.votingInstruction || '').toUpperCase();
  const options = [
    { value: 'FOR', label: 'For', className: 'for' },
    { value: 'AGAINST', label: 'Against', className: 'against' },
    { value: 'ABSTAIN', label: 'Abstain', className: 'abstain' },
    { value: 'FREE VOTE', label: 'Free vote', className: 'free' }
  ];

  return `
    <label>Voting instruction</label>

    <div class="action-plan-vote-buttons" id="voteButtons_${escapeHtml(item.itemId)}">
      ${options.map(option => `
        <button
          type="button"
          class="vote-choice vote-${escapeHtml(option.className)} ${selected === option.value ? 'selected' : ''}"
          onclick="setActionPlanVote('${escapeJs(item.itemId)}', '${escapeJs(option.value)}')">
          ${escapeHtml(option.label)}
        </button>
      `).join('')}
    </div>

    <input type="hidden" id="voting_${escapeHtml(item.itemId)}" value="${escapeHtml(selected)}">
  `;
}

function setActionPlanVote(itemId, value) {
  const input = document.getElementById('voting_' + itemId);
  if (input) input.value = value;

  const wrap = document.getElementById('voteButtons_' + itemId);
  if (!wrap) return;

  wrap.querySelectorAll('.vote-choice').forEach(button => {
    button.classList.toggle(
      'selected',
      String(button.textContent || '').trim().toUpperCase() === String(value || '').toUpperCase()
    );
  });

  queueActionPlanItemAutosave(itemId);
}

function renderSpeakerPicker(item) {
  const speakers = actionPlanSpeakerDrafts[item.itemId] || getActionPlanItemSpeakers(item);

  return `
    <label>Speakers</label>

    <div class="action-plan-speaker-picker">
      ${renderCouncillorSelect('speakerPicker_' + item.itemId, '')}

      <button
        class="action-plan-add-speaker"
        type="button"
        onclick="addActionPlanSpeaker('${escapeJs(item.itemId)}')">
        Add speaker
      </button>
    </div>

    <div id="speakerList_${escapeHtml(item.itemId)}" class="action-plan-speaker-list">
      ${renderSpeakerList(item.itemId, speakers)}
    </div>

    <input type="hidden" id="speakers_${escapeHtml(item.itemId)}" value="${escapeHtml(speakers.join('\n'))}">
  `;
}

function renderSpeakerList(itemId, speakers) {
  if (!speakers || !speakers.length) {
    return `<p>No speakers added yet.</p>`;
  }

  return speakers.map((name, index) => {
    const councillor = findActionPlanCouncillorByName(name);

    return `
      <div class="action-plan-speaker-chip">
        ${renderActionPlanPersonAvatar(councillor, name)}
        <span>${escapeHtml(cleanCouncillorName(name))}</span>
        <button
          type="button"
          class="action-plan-remove-speaker"
          onclick="removeActionPlanSpeaker('${escapeJs(itemId)}', ${index})">
          Remove
        </button>
      </div>
    `;
  }).join('');
}

function renderCouncillorSelect(id, selectedValue) {
  const councillors = getActionPlanCouncillors();
  const selected = String(selectedValue || '');

  return `
    <select id="${escapeHtml(id)}" onchange="refreshActionPlanPersonPreview('${escapeJs(id)}')">
      <option value="">Choose councillor...</option>
      ${councillors.map(c => {
        const name = cleanCouncillorName(c.name || c.displayName || '');
        return `
          <option value="${escapeHtml(name)}" ${selected === name ? 'selected' : ''}>
            ${escapeHtml(name)}
          </option>
        `;
      }).join('')}
    </select>
  `;
}

function refreshActionPlanPersonPreview(id) {
  const select = document.getElementById(id);
  const preview = document.getElementById(id + '_preview');

  if (!select || !preview) return;

  preview.innerHTML = renderSelectedCouncillorPreview(select.value);

  const amendmentMatch = String(id || '').match(/^amendment_(.+)_([0-9]+)_(mover|seconder)$/);
  if (amendmentMatch) {
    updateActionPlanAmendmentDraft(amendmentMatch[1]);
  }
}

function renderSelectedCouncillorPreview(name) {
  if (!name) return `<span>No one selected</span>`;

  const councillor = findActionPlanCouncillorByName(name);

  return `
    ${renderActionPlanPersonAvatar(councillor, name)}
    <strong>${escapeHtml(cleanCouncillorName(name))}</strong>
  `;
}

function findActionPlanCouncillorByName(name) {
  const clean = cleanCouncillorName(name).toLowerCase();

  return getActionPlanCouncillors().find(c =>
    cleanCouncillorName(c.name || c.displayName || '').toLowerCase() === clean
  ) || null;
}

function renderActionPlanPersonAvatar(councillor, fallbackName) {
  const src = councillor
    ? councillor.photoSmall || councillor.photoLarge || ''
    : '';

  if (src) {
    return `
      <div class="action-plan-person-avatar">
        <img src="${escapeHtml(src)}" alt="" loading="lazy">
      </div>
    `;
  }

  return `
    <div class="action-plan-person-avatar">
      ${escapeHtml(getInitials(fallbackName || ''))}
    </div>
  `;
}

function addActionPlanSpeaker(itemId) {
  const picker = document.getElementById('speakerPicker_' + itemId);
  const name = picker ? String(picker.value || '').trim() : '';

  if (!name) return;

  const item = getCurrentActionPlanItemById(itemId) || {};
  const speakers = actionPlanSpeakerDrafts[itemId] || getActionPlanItemSpeakers(item);
  const nameKey = cleanCouncillorName(name).toLowerCase();

  if (!speakers.some(row => cleanCouncillorName(row).toLowerCase() === nameKey)) {
    speakers.push(name);
  }

  actionPlanSpeakerDrafts[itemId] = speakers.slice();

  if (picker) picker.value = '';

  refreshActionPlanSpeakerList(itemId);

  applyActionPlanItemPatchLocally(itemId, {
    speakers: speakers.join('\n')
  });

  updateActionPlanSaveStatus('Saving...');

  LG_API.run
    .withSuccessHandler(function(result) {
      mergeActionPlanPatchResult(result);
      updateActionPlanSaveStatus('Saved');
    })
    .withFailureHandler(function(error) {
      updateActionPlanSaveStatus('Not saved');
      showError(error);
    })
    .LabourGroup_patchActionPlanItems(
      currentActionPlanId,
      [{
        itemId: itemId,
        updates: {
          speakers: speakers.join('\n')
        }
      }],
      getAuthToken()
    );
}

function removeActionPlanSpeaker(itemId, index) {
  const item = getCurrentActionPlanItemById(itemId) || {};
  const speakers = actionPlanSpeakerDrafts[itemId] || getActionPlanItemSpeakers(item);

  speakers.splice(index, 1);
  actionPlanSpeakerDrafts[itemId] = speakers.slice();

  refreshActionPlanSpeakerList(itemId);

  applyActionPlanItemPatchLocally(itemId, {
    speakers: speakers.join('\n')
  });

  updateActionPlanSaveStatus('Saving...');

  LG_API.run
    .withSuccessHandler(function(result) {
      mergeActionPlanPatchResult(result);
      updateActionPlanSaveStatus('Saved');
    })
    .withFailureHandler(function(error) {
      updateActionPlanSaveStatus('Not saved');
      showError(error);
    })
    .LabourGroup_patchActionPlanItems(
      currentActionPlanId,
      [{
        itemId: itemId,
        updates: {
          speakers: speakers.join('\n')
        }
      }],
      getAuthToken()
    );
}

function refreshActionPlanSpeakerList(itemId) {
  const speakers = actionPlanSpeakerDrafts[itemId] || [];

  const list = document.getElementById('speakerList_' + itemId);
  if (list) {
    list.innerHTML = renderSpeakerList(itemId, speakers);
  }

  const hidden = document.getElementById('speakers_' + itemId);
  if (hidden) {
    hidden.value = speakers.join('\n');
  }
}

function getActionPlanItemSpeakers(item) {
  if (Array.isArray(item.speakerList)) {
    return item.speakerList.slice().map(s => String(s || '').trim()).filter(Boolean);
  }

  return String(item.speakers || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

function getActionPlanCouncillors() {
  return (
    currentActionPlanData &&
    (
      currentActionPlanData.labourCouncillors ||
      currentActionPlanData.councillors ||
      []
    )
  ) || [];
}

function attachActionPlanAutosaveHandlers() {
  const root = document.querySelector('.action-plan-page');
  if (!root) return;

  root.querySelectorAll('textarea[id^="answer_"], textarea[id^="explanation_"], textarea[id^="agendaText_"]').forEach(field => {
    field.addEventListener('input', function() {
      const itemId = getActionPlanItemIdFromFieldId(field.id);
      if (itemId) queueActionPlanItemAutosave(itemId);
    });

    field.addEventListener('blur', function() {
      flushActionPlanAutosave();
    });
  });

  root.querySelectorAll('select[id^="mover_"], select[id^="seconder_"]').forEach(field => {
    field.addEventListener('change', function() {
      const itemId = getActionPlanItemIdFromFieldId(field.id);
      if (itemId) queueActionPlanItemAutosave(itemId);
    });
  });
}

function getActionPlanItemIdFromFieldId(id) {
  return String(id || '').replace(/^(answer|explanation|agendaText|mover|seconder|voting|speakers)_/, '');
}

function queueActionPlanItemAutosave(itemId) {
  if (!currentActionPlanId || !itemId) return;

  const fields = collectActionPlanItemFields(itemId);
  applyActionPlanItemPatchLocally(itemId, fields);

  actionPlanPendingPatches[itemId] = {
    itemId,
    updates: fields
  };

  updateActionPlanSaveStatus('Saving...');

  if (actionPlanSaveTimer) {
    clearTimeout(actionPlanSaveTimer);
  }

  actionPlanSaveTimer = setTimeout(flushActionPlanAutosave, 650);
}

function flushActionPlanAutosave() {
  if (actionPlanSaveTimer) {
    clearTimeout(actionPlanSaveTimer);
    actionPlanSaveTimer = null;
  }

  if (actionPlanSaveInFlight) {
    return;
  }

  const patches = Object.keys(actionPlanPendingPatches).map(key => actionPlanPendingPatches[key]);
  actionPlanPendingPatches = {};

  if (!patches.length || !currentActionPlanId) {
    return;
  }

  actionPlanSaveInFlight = true;
  updateActionPlanSaveStatus('Saving...');

  LG_API.run
    .withSuccessHandler(function(result) {
      actionPlanSaveInFlight = false;
      mergeActionPlanPatchResult(result);
      updateActionPlanSaveStatus('Saved');

      if (Object.keys(actionPlanPendingPatches).length) {
        flushActionPlanAutosave();
      }
    })
    .withFailureHandler(function(error) {
      actionPlanSaveInFlight = false;
      patches.forEach(patch => {
        actionPlanPendingPatches[patch.itemId] = patch;
      });
      updateActionPlanSaveStatus('Not saved');
      showError(error);
    })
    .LabourGroup_patchActionPlanItems(
      currentActionPlanId,
      patches,
      getAuthToken()
    );
}

function collectActionPlanItemFields(itemId) {
  const fields = {};

  collectActionPlanFieldIfPresent(fields, 'agendaText', 'agendaText_' + itemId);
  collectActionPlanFieldIfPresent(fields, 'answer', 'answer_' + itemId);
  collectActionPlanFieldIfPresent(fields, 'votingInstruction', 'voting_' + itemId);
  collectActionPlanFieldIfPresent(fields, 'mover', 'mover_' + itemId);
  collectActionPlanFieldIfPresent(fields, 'seconder', 'seconder_' + itemId);
  collectActionPlanFieldIfPresent(fields, 'speakers', 'speakers_' + itemId);
  collectActionPlanFieldIfPresent(fields, 'explanation', 'explanation_' + itemId);
  collectActionPlanFieldIfPresent(fields, 'amendments', 'amendments_' + itemId);

  collectFirstActionPlanAmendmentFieldsIfPresent(fields, itemId);

  fields.status = 'OPEN';
  return fields;
}

function collectFirstActionPlanAmendmentFieldsIfPresent(fields, itemId) {
  const title = valueOf('amendment_' + itemId + '_0_title');
  const text = valueOf('amendment_' + itemId + '_0_text');
  const mover = valueOf('amendment_' + itemId + '_0_mover');
  const seconder = valueOf('amendment_' + itemId + '_0_seconder');
  const speakers = valueOf('amendment_' + itemId + '_0_speakers');
  const vote = valueOf('amendment_' + itemId + '_0_voting');

  if (title || text || mover || seconder || speakers || vote) {
    fields.amendmentText = text;
    fields.amendmentMover = mover;
    fields.amendmentSeconder = seconder;
    fields.amendmentSpeakers = speakers;
    fields.amendmentVotingInstruction = vote;
  }
}

function collectActionPlanFieldIfPresent(fields, key, id) {
  const el = document.getElementById(id);
  if (!el) return;
  fields[key] = String(el.value || '').trim();
}

function applyActionPlanItemPatchLocally(itemId, fields) {
  if (!currentActionPlanData || !currentActionPlanData.items) return;

  const item = currentActionPlanData.items.find(i => String(i.itemId) === String(itemId));
  if (!item) return;

  fields = fields || {};

  if (fields.agendaText !== undefined) item.agendaText = fields.agendaText;
  if (fields.answer !== undefined) item.answer = fields.answer;
  if (fields.votingInstruction !== undefined) item.votingInstruction = fields.votingInstruction;
  if (fields.mover !== undefined) item.mover = fields.mover;
  if (fields.seconder !== undefined) item.seconder = fields.seconder;
  if (fields.speakers !== undefined) {
    item.speakers = fields.speakers;
    item.speakerList = String(fields.speakers || '').split('\n').filter(Boolean);
    actionPlanSpeakerDrafts[itemId] = item.speakerList.slice();
  }
  if (fields.explanation !== undefined) item.explanation = fields.explanation;
  if (fields.amendments !== undefined) {
    try {
      item.amendments = normaliseActionPlanAmendments(JSON.parse(fields.amendments || '[]'));
    } catch (e) {
      item.amendments = [];
    }
    actionPlanAmendmentDrafts[itemId] = item.amendments.slice();
  }

  if (
    fields.amendmentText !== undefined ||
    fields.amendmentMover !== undefined ||
    fields.amendmentSeconder !== undefined ||
    fields.amendmentSpeakers !== undefined ||
    fields.amendmentVotingInstruction !== undefined
  ) {
    const amendment = normaliseActionPlanAmendments(item.amendments || [])[0] || {
      amendmentId: 'amendment_1',
      title: 'Amendment',
      text: '',
      mover: '',
      seconder: '',
      speakers: [],
      votingInstruction: '',
      explanation: ''
    };

    if (fields.amendmentText !== undefined) amendment.text = fields.amendmentText;
    if (fields.amendmentMover !== undefined) amendment.mover = fields.amendmentMover;
    if (fields.amendmentSeconder !== undefined) amendment.seconder = fields.amendmentSeconder;
    if (fields.amendmentSpeakers !== undefined) {
      amendment.speakers = String(fields.amendmentSpeakers || '').split('\n').map(s => s.trim()).filter(Boolean);
    }
    if (fields.amendmentVotingInstruction !== undefined) amendment.votingInstruction = fields.amendmentVotingInstruction;

    item.amendments = normaliseActionPlanAmendments([amendment]);
    actionPlanAmendmentDrafts[itemId] = item.amendments.slice();
  }

  if (fields.status !== undefined) item.status = fields.status;

  cacheActionPlanData(currentActionPlanData);
}

function mergeActionPlanPatchResult(result) {
  result = result || {};

  if (result.lastChangedAt) {
    actionPlanLastChangedAt = result.lastChangedAt;
    if (currentActionPlanData) currentActionPlanData.lastChangedAt = result.lastChangedAt;
  }

  const items = result.updatedItems || result.items || [];

  const safeItems = items.filter(item => {
    return item && !isActionPlanItemDirty(item.itemId);
  });

  mergeChangedActionPlanItems(safeItems, false);
  cacheActionPlanData(currentActionPlanData);
}

function startActionPlanPolling() {
  stopActionPlanPolling();

  if (!currentActionPlanId) return;

  actionPlanPollBusy = false;
  pollActionPlanChanges();
  actionPlanPollTimer = setInterval(pollActionPlanChanges, 2500);
}

function stopActionPlanPolling() {
  if (actionPlanPollTimer) {
    clearInterval(actionPlanPollTimer);
    actionPlanPollTimer = null;
  }

  actionPlanPollBusy = false;
}

function pollActionPlanChanges() {
  if (
    currentScreen !== 'actionPlan' ||
    !currentActionPlanId ||
    actionPlanPollBusy ||
    document.hidden
  ) {
    return;
  }

  actionPlanPollBusy = true;

  LG_API.run
    .withSuccessHandler(function(result) {
      actionPlanPollBusy = false;
      result = result || {};

      const blocked = Date.now() <= actionPlanPollBlockedUntil;

      const incomingLiveItemId = String(result.liveItemId || '').trim();
      const currentLiveItemId = String(actionPlanLiveItemId || '').trim();

      if (incomingLiveItemId !== currentLiveItemId) {
        actionPlanLiveItemId = incomingLiveItemId;

        if (currentActionPlanData && currentActionPlanData.plan) {
          currentActionPlanData.plan.liveItemId = incomingLiveItemId;
          currentActionPlanData.plan.livePanelId = incomingLiveItemId;
        }

        if (!blocked) {
          applyActionPlanLiveUi();
        }
      }

      if (result.hasChanges && !blocked) {
        mergeChangedActionPlanItems(
          result.changedItems || result.items || [],
          true
        );

        if (result.lastChangedAt) {
          actionPlanLastChangedAt = result.lastChangedAt;

          if (currentActionPlanData) {
            currentActionPlanData.lastChangedAt = result.lastChangedAt;
          }
        }

        cacheActionPlanData(currentActionPlanData);
        applyActionPlanLiveUi();
      }
    })
    .withFailureHandler(function() {
      actionPlanPollBusy = false;
    })
    .LabourGroup_getActionPlanChangesSince(
      currentActionPlanId,
      actionPlanLastChangedAt || '',
      getAuthToken()
    );
}

document.addEventListener('visibilitychange', function() {
  if (
    !document.hidden &&
    currentScreen === 'actionPlan' &&
    currentActionPlanId
  ) {
    pollActionPlanChanges();
  }
});

function applyActionPlanLiveUi() {
  const panels = actionPlanLastRenderedPanels || [];

  panels.forEach(function(panel) {
    const live = isActionPlanPanelLive(panel);
    const panelEl = document.getElementById('api_panel_' + panel.panelId);

    if (panelEl) {
      panelEl.classList.toggle('is-live', live);

      const liveButton = panelEl.querySelector('.action-plan-live-button');
      if (liveButton) {
        liveButton.classList.toggle('is-live', live);
      }
    }
  });

  document.querySelectorAll('.action-plan-nav-pill').forEach(function(button, index) {
    const panel = panels[index];
    if (!panel) return;
    button.classList.toggle('is-live', isActionPlanPanelLive(panel));
  });

  document.querySelectorAll('.action-plan-amendment-card').forEach(function(card) {
    const itemId = card.getAttribute('data-item-id') || '';
    const amendmentId = card.getAttribute('data-amendment-id') || '';

    if (!itemId || !amendmentId) return;

    const live = isActionPlanAmendmentLive(itemId, amendmentId);
    card.classList.toggle('is-live', live);

    const liveButton = card.querySelector('.action-plan-live-button');
    if (liveButton) {
      liveButton.classList.toggle('is-live', live);
    }
  });
}

function mergeChangedActionPlanItems(items, rerenderPanels) {
  if (
    !items ||
    !items.length ||
    !currentActionPlanData ||
    !currentActionPlanData.items
  ) {
    return;
  }

  const byId = {};

  currentActionPlanData.items.forEach(function(item, index) {
    byId[String(item.itemId)] = index;
  });

  const changedIds = [];

  items.forEach(function(item) {
    const id = String(item.itemId || '');

    if (!id || byId[id] === undefined || isActionPlanItemDirty(id)) {
      return;
    }

    currentActionPlanData.items[byId[id]] = item;
    actionPlanSpeakerDrafts[id] = getActionPlanItemSpeakers(item);
    actionPlanAmendmentDrafts[id] =
      normaliseActionPlanAmendments(item.amendments || []);

    changedIds.push(id);

    if (
      window.LG_Data &&
      typeof LG_Data.updateActionPlanItem === 'function'
    ) {
      LG_Data.updateActionPlanItem(currentActionPlanId, item);
    }
  });

  if (!changedIds.length) {
    return;
  }

  cacheActionPlanData(currentActionPlanData);

  if (!rerenderPanels) {
    return;
  }

  refreshChangedActionPlanPanels(changedIds);
}

function refreshChangedActionPlanPanels(changedItemIds) {
  const changedMap = {};

  (changedItemIds || []).forEach(function(id) {
    changedMap[String(id)] = true;
  });

  const rebuiltPanels = buildActionPlanPanels(
    currentActionPlanData.items || []
  );

  rebuiltPanels.forEach(function(panel, index) {
    const containsChange = (panel.items || []).some(function(item) {
      return changedMap[String(item.itemId || '')];
    });

    if (!containsChange || editingActionPlanPanels[panel.panelId]) {
      return;
    }

    const existing = document.getElementById(
      'api_panel_' + panel.panelId
    );

    if (!existing) {
      return;
    }

    const active = document.activeElement;

    if (active && existing.contains(active)) {
      return;
    }

    existing.outerHTML = renderActionPlanPanel(panel, index);
  });

  actionPlanLastRenderedPanels = rebuiltPanels;
  applyActionPlanLiveUi();
}

function updateActionPlanSaveStatus(text) {
  const clean = String(text || 'Saved').trim();
  const el = document.getElementById('actionPlanSaveStatus');

  if (el) {
    el.textContent = clean;
  }

  if (clean === 'Saving...') {
    actionPlanPollBlockedUntil = Number.MAX_SAFE_INTEGER;
  }

  if (clean === 'Saved') {
    actionPlanPollBlockedUntil = Date.now() + 1000;
  }

  if (clean === 'Not saved') {
    actionPlanPollBlockedUntil = 0;
  }
}

function getLatestActionPlanChangedAt(items) {
  return (items || []).reduce((latest, item) => {
    const updatedAt = String(item.updatedAt || '').trim();
    return updatedAt && updatedAt > latest ? updatedAt : latest;
  }, '');
}

function saveActionPlanPanel(panelId) {
  closeActionPlanPanelEdit(panelId);
}

function saveActionPlanItem(itemId) {
  queueActionPlanItemAutosave(itemId);
  flushActionPlanAutosave();
}

function formatActionPlanItemType(type) {
  type = String(type || '').toUpperCase();

  if (type === 'PUBLIC_QUESTIONS') return 'Public questions';
  if (type === 'MEMBER_QUESTIONS') return "Members' questions";
  if (type === 'MOTIONS') return 'Motion';
  if (type === 'LEADER_REPORT') return "Leader's report";
  if (type === 'REPORT') return 'Report';
  if (type === 'ROUTINE') return 'Routine';

  return 'Agenda';
}

function formatActionPlanDate(value) {
  const date = parseDashboardMeetingDate(value);

  if (!date) return String(value || '');

  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatActionPlanText(value) {
  let text = String(value || '').trim();

  if (!text) return '';

  text = normaliseActionPlanDisplayText(text);

  return text
    .split(/\n{2,}/)
    .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function normaliseActionPlanDisplayText(value) {
  let text = String(value || '').trim();

  if (!text) return '';

  text = text
    .replace(/\u00c2/g, '')
    .replace(/\u00e2\u20ac[\u02dc\u2122]/g, "'")
    .replace(/\u00e2\u20ac[\u0153\u009d]/g, '"')
    .replace(/\u00e2\u20ac[\u201c\u201d]/g, '-')
    .replace(/\u00e2\u20ac\u00a2/g, '-')
    .replace(/\u00f0\u0178[\s\S]?/g, '')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+(Motion\s+[A-Z]\s*[---]\s*)/gi, '\n\n$1')
    .replace(/\s+((?:Councillor|Cllr)\s+[A-Z][A-Za-z''.-]+(?:\s+[A-Z][A-Za-z''.-]+){0,4}\s+has\s+submitted\s+the\s+following\s*[:.]?)/gi, '\n\n$1')
    .replace(/\s+(This Council further notes(?: that)?)/gi, '\n\n$1')
    .replace(/\s+(This Council also notes(?: that)?)/gi, '\n\n$1')
    .replace(/\s+(This Council notes(?: that)?)/gi, '\n\n$1')
    .replace(/\s+(This Council believes(?: that)?)/gi, '\n\n$1')
    .replace(/\s+(This Council recognises(?: that)?)/gi, '\n\n$1')
    .replace(/\s+(This Council resolves(?: to)?)/gi, '\n\n$1')
    .replace(/\s+(This Council therefore resolves(?: to)?)/gi, '\n\n$1')
    .replace(/\s+(This Council calls(?: on| for)?)/gi, '\n\n$1')
    .replace(/\s+(Council is asked to)/gi, '\n\n$1')
    .replace(/\s+(Question\s*(?:No\.?|Number)?\s*(?:\d+|[A-Z])\b)/gi, '\n\n$1')
    .replace(/\s+(Question:)/gi, '\n\n$1')
    .replace(/\s+(Answer:)/gi, '\n\n$1')
    .replace(/\s+(Asked by)/gi, '\n\n$1')
    .replace(/\s+(Submitted by)/gi, '\n\n$1')
    .replace(/\s+(Supplementary question:)/gi, '\n\n$1')
    .replace(/\s+(Can the Portfolio Holder|Could the Portfolio Holder|Would the Portfolio Holder|Will the Portfolio Holder|Can the Leader|Could the Leader|Would the Leader|Will the Leader)\b/gi, '\n\n$1')
    .replace(/\s+((?:\d+|[a-z])\)\s+)/gi, '\n$1')
    .replace(/\s+(\([a-z]\))/gi, '\n$1')
    .replace(/\s+([--])\s*/g, '\n$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}
