let currentUser = null;
let currentScreen = 'loading';

const LG_SAVED_USER_KEY = 'labourGroupUser';

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

function openInitialRouteOrDashboard() {
  const meetingId = getInitialMeetingId();

  if (meetingId) {
    showMeeting(meetingId);
    return;
  }

  showDashboard();
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
    currentUser = savedUser;

    restoreClientCacheIfAvailable();
    openInitialRouteOrDashboard();
    verifyBootstrapInBackground();
    return;
  }

  loadBootstrap(true);
}

function restoreClientCacheIfAvailable() {
  if (!window.LG_Data) {
    return;
  }

  try {
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
    /* Old or corrupt browser cache must not stop the app opening. */
  }
}

function verifyBootstrapInBackground() {
  LG_API.run
    .withSuccessHandler(function(status) {
      handleBootstrapStatus(status, false);
    })
    .withFailureHandler(function() {
      /*
       * Keep the already-rendered cached screen visible if this lightweight
       * verification call fails. Normal data calls will still report errors.
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
      currentUser = null;
      clearSavedUser();

      if (window.LG_Data && typeof LG_Data.clear === 'function') {
        LG_Data.clear();
      }

      showFirstAdmin();
      return;
    }

    const savedUser = currentUser || getSavedUser();

    if (savedUser && savedUser.token) {
      currentUser = savedUser;

      if (blocking) {
        restoreClientCacheIfAvailable();
        openInitialRouteOrDashboard();
      }

      return;
    }

    currentUser = null;
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
        <p>${escapeHtml(error && error.message ? error.message : error)}</p>
      </div>
    </section>
  `;
}

/*************************************************************
 * CACHE / VISIBILITY HELPERS
 *************************************************************/

document.addEventListener('visibilitychange', function() {
  if (document.hidden || !window.LG_Data) {
    return;
  }

  if (
    currentUser &&
    currentUser.token &&
    typeof LG_Data.refreshAppInBackground === 'function'
  ) {
    LG_Data.refreshAppInBackground();
  }
});

window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    restoreClientCacheIfAvailable();
  }
});
