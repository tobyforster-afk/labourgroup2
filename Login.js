/*************************************************************
 *
 * LOGIN / FIRST ADMIN
 *
 *************************************************************/

function showLogin() {
  currentScreen = 'login';

  closeMenu();
  hideBackButton();

  document.getElementById('content').innerHTML = `
    <section class="page">
      <h1>Welcome back</h1>
      <p class="lede">Sign in to Labour.Group.</p>

      <div class="card">
        <label>Username</label>
        <input
          id="loginUsername"
          type="text"
          autocomplete="username"
          onkeydown="handleLoginKeydown(event)"
        >

        <label>Password</label>
        <input
          id="loginPassword"
          type="password"
          autocomplete="current-password"
          onkeydown="handleLoginKeydown(event)"
        >

        <button type="button" onclick="login()">
          Login
        </button>
      </div>
    </section>
  `;

  const usernameField = document.getElementById('loginUsername');

  if (usernameField) {
    usernameField.focus();
  }
}

function handleLoginKeydown(event) {
  if (event && event.key === 'Enter') {
    event.preventDefault();
    login();
  }
}

/*************************************************************
 * FIRST ADMIN
 *************************************************************/

function showFirstAdmin() {
  currentScreen = 'firstAdmin';

  closeMenu();
  hideBackButton();

  document.getElementById('content').innerHTML = `
    <section class="page">
      <h1>Create administrator</h1>

      <p class="lede">
        This is the first setup for Labour.Group.
      </p>

      <div class="card">
        <label>Display name</label>
        <input
          id="firstName"
          type="text"
          autocomplete="name"
        >

        <label>Username</label>
        <input
          id="firstUsername"
          type="text"
          autocomplete="username"
        >

        <label>Email</label>
        <input
          id="firstEmail"
          type="email"
          autocomplete="email"
        >

        <label>Password</label>
        <input
          id="firstPassword"
          type="password"
          autocomplete="new-password"
          onkeydown="handleFirstAdminKeydown(event)"
        >

        <button type="button" onclick="createFirstAdmin()">
          Create Administrator
        </button>
      </div>
    </section>
  `;
}

function handleFirstAdminKeydown(event) {
  if (event && event.key === 'Enter') {
    event.preventDefault();
    createFirstAdmin();
  }
}

function createFirstAdmin() {
  const displayName = valueOf('firstName');
  const username = valueOf('firstUsername');
  const email = valueOf('firstEmail');
  const password = valueOf('firstPassword');

  if (!displayName || !username || !password) {
    alert('Display name, username and password are required.');
    return;
  }

  setLoading('Creating administrator...');

  LG_API.run
    .withSuccessHandler(function(user) {
      completeLogin(user);
    })
    .withFailureHandler(function(error) {
      showFirstAdmin();

      alert(
        error && error.message
          ? error.message
          : error
      );
    })
    .LG_createFirstAdmin(
      username,
      displayName,
      email,
      password
    );
}

/*************************************************************
 * LOGIN
 *************************************************************/

function login() {
  const username = valueOf('loginUsername');
  const password = valueOf('loginPassword');

  if (!username || !password) {
    alert('Enter username and password.');
    return;
  }

  setLoading('Signing in...');

  LG_API.run
    .withSuccessHandler(function(user) {
      completeLogin(user);
    })
    .withFailureHandler(function(error) {
      showLogin();

      alert(
        error && error.message
          ? error.message
          : error
      );
    })
    .LG_login(
      username,
      password
    );
}

/*************************************************************
 * SUCCESSFUL LOGIN
 *************************************************************/

function completeLogin(user) {
  if (!user || !user.token) {
    showLogin();
    alert('The server did not return a valid login.');
    return;
  }

  resetClientDataForUserChange();

  /*
   * activateUser is defined in App.js. It records the active
   * token and prevents data from another user being restored.
   */
  if (typeof activateUser === 'function') {
    activateUser(user);
  } else {
    currentUser = user;
  }

  saveCurrentUser(user);

  /*
   * This reads the current browser URL. Therefore:
   *
   * /ar/july26
   *
   * returns to that Action Report after login. A normal visit
   * to the homepage opens the dashboard.
   */
  openInitialRouteOrDashboard(true);
}

/*************************************************************
 * USER CHANGE CACHE RESET
 *************************************************************/

function resetClientDataForUserChange() {
  if (
    window.LG_Data &&
    typeof LG_Data.clear === 'function'
  ) {
    try {
      LG_Data.clear();
    } catch (error) {
      console.error(
        'Could not clear data for user change:',
        error
      );
    }
  }
}
