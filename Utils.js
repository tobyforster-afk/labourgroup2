/*************************************************************
 *
 * SAVED LOGIN
 *
 *************************************************************/

function saveCurrentUser(user) {
  try {
    localStorage.setItem(
      LG_SAVED_USER_KEY,
      JSON.stringify(user)
    );
  } catch (e) {}
}

function getSavedUser() {
  try {
    const saved = localStorage.getItem(LG_SAVED_USER_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    clearSavedUser();
    return null;
  }
}

function clearSavedUser() {
  try {
    localStorage.removeItem(LG_SAVED_USER_KEY);
  } catch (e) {}
}

function getAuthToken() {
  return currentUser && currentUser.token
    ? String(currentUser.token || '').trim()
    : '';
}

/*************************************************************
 *
 * HELPERS
 *
 *************************************************************/

function setLoading(text) {
  document.getElementById('content').innerHTML = `
    <div class="loading">
      ${escapeHtml(text || 'Loading...')}
    </div>
  `;
}

function showError(error) {
  alert(error && error.message ? error.message : error);
}

function valueOf(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeJs(value) {
  return String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'");
}
