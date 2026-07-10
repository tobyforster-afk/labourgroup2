/*************************************************************
 *
 * NAVIGATION
 *
 *************************************************************/

function goBack() {

  switch (currentScreen) {

    case 'dashboard':
      return;

    case 'councillors':
    case 'committees':
    case 'meetings':
    case 'actionPlans':
      showDashboard();
      break;

    case 'councillor':
      showCouncillors();
      break;

    case 'committee':
      showCommittees();
      break;

    case 'meeting':
      showMeetings();
      break;

    case 'actionPlan':
      showActionPlans();
      break;

    default:
      showDashboard();

  }

}

function toggleMenu() {
  document.body.classList.toggle('menu-open');
}

function closeMenu() {
  document.body.classList.remove('menu-open');
}

function showBackButton() {
  const button = document.getElementById('backButton');

  if (button) {
    button.classList.remove('hidden');
  }
}

function hideBackButton() {
  const button = document.getElementById('backButton');

  if (button) {
    button.classList.add('hidden');
  }
}
