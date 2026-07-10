let currentUser = null;
let currentScreen = 'loading';

const LG_SAVED_USER_KEY = 'labourGroupUser';
const LG_ACTIVE_TOKEN_KEY = 'labourGroupActiveToken';

document.addEventListener('DOMContentLoaded', initialiseApp);

function initialiseApp() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <header id="topBar">
      <button id="backButton" class="hidden" onclick="goBack()">←</button>
      <div id="title">LABOUR.GROUP</div>
      <button id="menuButton" onclick="toggleMenu()">☰</button>
    </header>

    <div id="menuOverlay" onclick="closeMenu()"></div>

    <nav id="mainMenu">
      <button onclick="showDashboard()">Dashboard</button>
      <button onclick="logout()">Logout</button>
    </nav>

    <main id="content"></main>
  `;

  startFastBootstrap();
}

/*************************************************************
 * INITIAL ROUTING
 *************************************************************/

function getInitialMeetingId() {
  return String(
    typeof LG_INITIAL_MEETING_ID !== 'undefined'
      ? LG_INITIAL_MEETING_ID
      : ''
  ).trim();
}

function openInitialRouteOrDashboard(forceRefresh) {
  const meetingId = getInitialMeetingId();

  if (meetingId) {
    showMeeting(meetingId);
    return;
  }

  showDashboard(forceRefresh === true);
}

/*************************************************************
 * ACTIVE USER TRACKING
 *************************************************************/

function getCurrentUserToken() {
  return String(
    currentUser && currentUser.token
      ? currentUser.token
      : ''
  ).trim();
}

function getActiveBrowserToken() {
  try {
    return String(
      sessionStorage.getItem(LG_ACTIVE_TOKEN_KEY) || ''
    ).trim();
  } catch (error) {
    return '';
  }
}

function setActiveBrowserToken(token) {
  try {
    const cleanToken = String(token || '').trim();

    if (cleanToken) {
      sessionStorage.setItem(LG_ACTIVE_TOKEN_KEY, cleanToken);
    } else {
      sessionStorage.removeItem(LG_ACTIVE_TOKEN_KEY);
    }
  } catch (error) {}
}

function hasUserChanged(user) {
  const nextToken = String(
    user && user.token
      ? user.token
      : ''
  ).trim();

  const previousToken = getActiveBrowserToken();

  return !!(
    previousToken &&
    nextToken &&
    previousToken !== nextToken
  );
}

function clearClientData() {
  if (
    window.LG_Data &&
    typeof LG_Data.clear === 'function'
  ) {
    try {
      LG_Data.clear();
    } catch (error) {
      console.error('Could not clear client cache:', error);
    }
  }
}

function activateUser(user) {
  const changed = hasUserChanged(user);

  if (changed) {
    clearClientData();
  }

  currentUser = user || null;

  const token = getCurrentUserToken();
  setActiveBrowserToken(token);

  return changed;
}

/*************************************************************
 * FAST BOOTSTRAP
 *************************************************************/

function startFastBootstrap() {
  let savedUser = null;

  try {
    savedUser = getSavedUser();
  } catch (error) {
    savedUser = null;
  }

  if (savedUser && savedUser.token) {
    const changed = activateUser(savedUser);

    if (!changed) {
      restoreClientCacheIfAvailable();
    }

    openInitialRouteOrDashboard(changed);
    verifyBootstrapInBackground();
    return;
  }

  setActiveBrowserToken('');
  loadBootstrap(true);
}

function restoreClientCacheIfAvailable() {
  if (
    !window.LG_Data ||
    !currentUser ||
    !currentUser.token
  ) {
    return;
  }

  try {
    if (typeof LG_Data.restoreSessionCache === 'function') {
      LG_Data.restoreSessionCache();
      return;
    }

    if (typeof LG_Data.restore === 'function') {
      LG_Data.restore();
      return;
    }

    if (typeof LG_Data.restoreFromStorage === 'function') {
      LG_Data.restoreFromStorage();
      return;
    }

    if (typeof LG_Data.hydrate === 'function') {
      LG_Data.hydrate();
    }
  } catch (error) {
    /*
     * Old or corrupt browser cache must not stop the app
     * from opening.
     */
  }
}

function verifyBootstrapInBackground() {
  LG_API.run
    .withSuccessHandler(function(status) {
      handleBootstrapStatus(status, false);
    })
    .withFailureHandler(function() {
      /*
       * Keep the already-rendered screen visible if this
       * lightweight verification call fails.
       */
    })
    .LabourGroup_getBootstrapStatus();
}

/*************************************************************
 * SERVER BOOTSTRAP
 *************************************************************/

function loadBootstrap(showLoadingScreen) {
  if (showLoadingScreen !== false) {
    setLoading('Loading Labour.Group...');
  }

  LG_API.run
    .withSuccessHandler(function(status) {
      handleBootstrapStatus(status, true);
    })
    .withFailureHandler(function(error) {
      renderBootstrapError('Server error', error);
    })
    .LabourGroup_getBootstrapStatus();
}

function handleBootstrapStatus(status, blocking) {
  try {
    status = status || {};

    if (status.needsFirstAdmin) {
      clearClientData();

      currentUser = null;
      clearSavedUser();
      setActiveBrowserToken('');

      showFirstAdmin();
      return;
    }

    const savedUser = currentUser || getSavedUser();

    if (savedUser && savedUser.token) {
      const changed = activateUser(savedUser);

      if (blocking) {
        if (!changed) {
          restoreClientCacheIfAvailable();
        }

        openInitialRouteOrDashboard(changed);
      }

      return;
    }

    clearClientData();

    currentUser = null;
    clearSavedUser();
    setActiveBrowserToken('');

    showLogin();
  } catch (error) {
    renderBootstrapError('Java error', error);
  }
}

function renderBootstrapError(title, error) {
  const content = document.getElementById('content');

  if (!content) {
    return;
  }

  content.innerHTML = `
    <section class="page">
      <div class="card">
        <h1>${escapeHtml(title || 'Error')}</h1>
        <p>${escapeHtml(
          error && error.message
            ? error.message
            : error
        )}</p>
      </div>
    </section>
  `;
}

/*************************************************************
 * LOGOUT
 *
 * This deliberately reloads the page after clearing the
 * login. Reloading cancels any requests still running for
 * the previous user.
 *************************************************************/

function logout() {
  closeMenu();

  /*
   * Clear the cache while currentUser still contains the old
   * token, so the correct token-specific session cache is
   * removed.
   */
  clearClientData();

  currentUser = null;
  clearSavedUser();
  setActiveBrowserToken('');

  /*
   * A real page reload prevents an old API request completing
   * after logout and putting the previous user's data back
   * into memory.
   */
  window.location.reload();
}

/*************************************************************
 * CACHE / VISIBILITY HELPERS
 *************************************************************/

document.addEventListener('visibilitychange', function() {
  if (
    document.hidden ||
    !window.LG_Data ||
    !currentUser ||
    !currentUser.token ||
    currentScreen === 'login'
  ) {
    return;
  }

  if (
    typeof LG_Data.refreshAppInBackground === 'function'
  ) {
    LG_Data.refreshAppInBackground();
  }
});

window.addEventListener('pageshow', function(event) {
  if (
    !event.persisted ||
    !currentUser ||
    !currentUser.token ||
    currentScreen === 'login'
  ) {
    return;
  }

  restoreClientCacheIfAvailable();
});
