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
        <input id="loginUsername" type="text" autocomplete="username">

        <label>Password</label>
        <input id="loginPassword" type="password" autocomplete="current-password">

        <button onclick="login()">Login</button>
      </div>
    </section>
  `;
}

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
        <input id="firstName" type="text" autocomplete="name">

        <label>Username</label>
        <input id="firstUsername" type="text" autocomplete="username">

        <label>Email</label>
        <input id="firstEmail" type="email" autocomplete="email">

        <label>Password</label>
        <input id="firstPassword" type="password" autocomplete="new-password">

        <button onclick="createFirstAdmin()">
          Create Administrator
        </button>
      </div>
    </section>
  `;
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
      currentUser = user;
      saveCurrentUser(user);
      showDashboard();
    })
    .withFailureHandler(function(error) {
      showFirstAdmin();
      alert(error.message);
    })
    .LG_createFirstAdmin(
      username,
      displayName,
      email,
      password
    );
}

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
      currentUser = user;
      saveCurrentUser(user);
      openInitialRouteOrDashboard();
    })
    .withFailureHandler(function(error) {
      showLogin();
      alert(error.message);
    })
    .LG_login(username, password);
}

function logout() {
  currentUser = null;
  clearSavedUser();
  closeMenu();
  showLogin();
}
