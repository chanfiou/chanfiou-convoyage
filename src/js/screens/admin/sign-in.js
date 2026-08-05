import { escapeHtml, html, icon, onClick } from '../../core/dom.js';
import { formatDateTime } from '../../core/format.js';
import { fromHtml, showToast } from '../../core/ui.js';
import { getState, setState } from '../../core/store.js';
import { navigate } from '../../core/router.js';
import { checkHealth, isConfigured, signIn } from '../../data/api.js';

export const signInScreenMarkup = () => html`
  <div class="screen">
    <header class="screen__head">
      <h1>Espace convoyeur</h1>
      <p class="text-muted">
        Connectez-vous pour retrouver vos missions et recevoir les demandes de vos clients.
      </p>
    </header>

    <form class="card" data-server-form>
      <h2 class="card-title">Serveur</h2>
      <p class="field__hint" data-server-state>
        L’application est déjà reliée à votre serveur. En cas de doute, lancez un test.
      </p>
      <button type="submit" class="button button--s button--secondary">
        ${icon('route', 24)} Tester la connexion au serveur
      </button>
    </form>

    <form class="card" data-signin-form novalidate>
      <h2 class="card-title">Connexion</h2>
      <div class="field">
        <label class="field__label" for="operatorEmail">Adresse électronique</label>
        <input
          class="input"
          id="operatorEmail"
          name="email"
          type="email"
          autocomplete="username"
          inputmode="email"
        />
      </div>
      <div class="field">
        <label class="field__label" for="operatorPassword">Mot de passe</label>
        <input
          class="input"
          id="operatorPassword"
          name="password"
          type="password"
          autocomplete="current-password"
        />
      </div>
      <p class="field__error" data-signin-error hidden></p>
      <button type="submit" class="button button--m button--primary">
        ${icon('lock', 24)} Se connecter
      </button>
    </form>

    <section class="card card--flat">
      <h2 class="card-title">Sans serveur</h2>
      <p class="text-small text-muted">
        Vous pouvez travailler hors ligne sur cet appareil, puis vous connecter plus tard pour tout
        remonter. Les demandes reçues par lien restent importables.
      </p>
      <button type="button" class="button button--s button--stroke" data-local-only>
        Continuer sur cet appareil seulement
      </button>
    </section>
  </div>
`;

export const renderSignIn = () => {
  const view = fromHtml(signInScreenMarkup());
  const serverState = view.querySelector('[data-server-state]');
  const errorLine = view.querySelector('[data-signin-error]');

  view.querySelector('[data-server-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    serverState.textContent = 'Test en cours…';
    const { data, error } = await checkHealth();
    serverState.textContent = error
      ? `Serveur injoignable : ${error}`
      : `Serveur joignable (${data.service ?? 'ok'}). Vous pouvez vous connecter.`;
  });

  view.querySelector('[data-signin-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = view.querySelector('#operatorEmail').value.trim();
    const password = view.querySelector('#operatorPassword').value;

    if (!email || !password) {
      errorLine.hidden = false;
      errorLine.innerHTML = `${icon('alert', 16)} Renseignez votre adresse et votre mot de passe.`;
      return;
    }
    if (!isConfigured()) {
      errorLine.hidden = false;
      errorLine.innerHTML = `${icon('alert', 16)} Le serveur n’est pas configuré sur cet appareil. Testez la connexion au-dessus.`;
      return;
    }

    errorLine.hidden = true;
    const { error } = await signIn(email, password);
    if (error) {
      errorLine.hidden = false;
      errorLine.innerHTML = `${icon('alert', 16)} ${escapeHtml(error)}`;
      return;
    }
    showToast('Connexion réussie.');
    navigate('espace');
  });

  onClick(view, '[data-local-only]', () => {
    setState({ adminUnlocked: true });
    showToast('Mode appareil seul. Connectez-vous plus tard pour synchroniser.');
    navigate('espace');
  });

  return view;
};

export const sessionBadgeMarkup = () => {
  const state = getState();
  if (!state.session?.token) {
    return html`<span class="chip chip--status chip--warning">Appareil seul</span>`;
  }
  return html`
    <span class="chip chip--status chip--success" title="Dernière synchronisation ${state.lastSyncAt ? formatDateTime(state.lastSyncAt) : 'jamais'}">
      ${icon('check', 16)} Connecté
    </span>
  `;
};
