import { COMPANY } from './config/company.js';
import { html, icon, onClick } from './core/dom.js';
import { fromHtml } from './core/ui.js';
import { currentRoute, navigate, onNavigate, refresh, registerRoute, startRouter } from './core/router.js';
import { renderHome } from './screens/home.js';
import { renderQuote } from './screens/quote.js';
import { renderRequest } from './screens/request.js';
import { renderTracking } from './screens/tracking.js';
import { renderPricingGrid } from './screens/pricing-grid.js';
import { renderAdmin } from './screens/admin/dashboard.js';
import { renderInvoices } from './screens/admin/invoices.js';
import { renderImportRequest } from './screens/import-request.js';
import { renderLegal } from './screens/legal.js';
import { renderAvailability } from './screens/admin/availability.js';
import { renderConditions } from './screens/conditions.js';
import { startAutoSync } from './data/auto-sync.js';
import { IS_OPERATOR_HOST } from './config/host.js';

const TABS = IS_OPERATOR_HOST
  ? [{ path: 'espace', label: 'Espace convoyeur', icon: 'lock' }]
  : [
      { path: 'accueil', label: 'Accueil', icon: 'home' },
      { path: 'devis', label: 'Devis', icon: 'calculator' },
      { path: 'demande', label: 'Demande', icon: 'send' },
      { path: 'suivi', label: 'Suivi', icon: 'route' },
    ];

const renderNotFound = () =>
  fromHtml(html`
    <div class="screen">
      <div class="error-state" role="alert">
        ${icon('alert', 24)}
        <div class="stack-sm">
          <h4>Page introuvable</h4>
          <p>Cette page n’existe plus. Revenez à l’accueil pour reprendre votre parcours.</p>
        </div>
        <button type="button" class="button button--s button--stroke" data-goto="accueil">
          Revenir à l’accueil
        </button>
      </div>
    </div>
  `);

const buildShell = () => {
  const shell = fromHtml(html`
    <div class="app-shell">
      <header class="app-header">
        <div class="brand">
          <span class="brand__mark">${icon('truck', 20)}</span>
          <span class="wordmark">
            <span class="brand__name">Chanfiou<em>.</em></span>
            <span class="brand__meta">Entreprise de convoyage</span>
          </span>
        </div>
        <a class="button-icon" href="tel:${COMPANY.phone}" aria-label="Appeler ${COMPANY.name}">
          ${icon('phone', 24)}
        </a>
      </header>
      <main id="outlet"></main>
    </div>
  `);

  const tabBar = fromHtml(html`
    <nav class="tab-bar" aria-label="Navigation principale">
      ${TABS.map(
        (tab) => html`
          <button type="button" class="tab-bar__item" data-tab="${tab.path}">
            ${icon(tab.icon, 20)}
            <span>${tab.label}</span>
          </button>
        `,
      )}
    </nav>
  `);

  onClick(tabBar, '[data-tab]', (target) => navigate(target.dataset.tab));
  return { shell, tabBar };
};

const highlightActiveTab = (tabBar, path) => {
  tabBar.querySelectorAll('[data-tab]').forEach((button) => {
    if (button.dataset.tab === path) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
};

export const startApp = (root) => {
  if (IS_OPERATOR_HOST && !window.location.hash) {
    window.location.hash = '#/espace';
  }

  const { shell, tabBar } = buildShell();
  root.append(shell, tabBar);

  if (IS_OPERATOR_HOST) {
    // Le domaine convoyeur n'affiche jamais la page d'accueil clients.
    registerRoute('accueil', () => {
      navigate('espace');
      return null;
    });
  } else {
    registerRoute('accueil', renderHome);
  }
  registerRoute('devis', renderQuote);
  registerRoute('demande', renderRequest);
  registerRoute('suivi', renderTracking);
  registerRoute('tarifs', renderPricingGrid);
  registerRoute('espace', renderAdmin);
  registerRoute('factures', renderInvoices);
  registerRoute('importer', renderImportRequest);
  registerRoute('mentions', renderLegal);
  registerRoute('disponibilites', renderAvailability);
  registerRoute('conditions', renderConditions);

  onNavigate((route) => highlightActiveTab(tabBar, route.path));

  const outlet = shell.querySelector('#outlet');
  onClick(outlet, '[data-goto]', (target) => navigate(target.dataset.goto));

  startRouter(outlet, renderNotFound);
  highlightActiveTab(tabBar, currentRoute().path);
  startAutoSync();

  // L'écran de suivi se réactualise quand l'application revient au premier
  // plan ou qu'une notification arrive (le rendu relance la vérification serveur).
  const refreshTrackingScreen = () => {
    if (currentRoute().path === 'suivi') refresh();
  };
  window.addEventListener('focus', refreshTrackingScreen);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshTrackingScreen();
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'sync') refreshTrackingScreen();
    });

    // Dès qu'une nouvelle version prend le contrôle, la page se recharge
    // toute seule : une seule ouverture suffit pour être à jour.
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });
  }

  const splash = document.getElementById('splash');
  if (splash) {
    window.setTimeout(() => {
      splash.classList.add('splash--done');
      window.setTimeout(() => splash.remove(), 500);
    }, 2500);
  }
};
