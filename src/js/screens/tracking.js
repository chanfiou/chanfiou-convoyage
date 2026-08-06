import { escapeHtml, html, icon, onClick } from '../core/dom.js';
import { formatDateTime, formatDistance, formatEuro } from '../core/format.js';
import { emptyState, errorState, fromHtml, showToast } from '../core/ui.js';
import { PAYMENT } from '../config/company.js';
import { getState } from '../core/store.js';
import { navigate, refresh } from '../core/router.js';
import { MISSION_STATUSES, findMissionByReference, statusById } from '../domain/mission.js';
import { TOTAL_LABEL } from '../domain/vat.js';
import { fetchTrackedMission, isConfigured, saveClientPushSubscription } from '../data/api.js';
import { updateMission } from '../domain/mission.js';
import { subscribeToPush } from '../domain/push-client.js';

const TRACKED_STATUSES = MISSION_STATUSES.filter((status) => status.id !== 'annulee');

const timelineMarkup = (mission) => {
  const currentIndex = TRACKED_STATUSES.findIndex((status) => status.id === mission.status);
  return html`
    <ol class="timeline">
      ${TRACKED_STATUSES.map((status, index) => {
        const entry = mission.history.find((item) => item.status === status.id);
        const stateClass =
          index < currentIndex ? 'timeline__step--done' : index === currentIndex ? 'timeline__step--current' : '';
        return html`
          <li class="timeline__step ${stateClass}">
            <span class="timeline__bullet">
              ${index <= currentIndex ? icon('check', 16) : html`<span class="text-small">${index + 1}</span>`}
            </span>
            <div class="stack-sm">
              <strong>${escapeHtml(status.label)}</strong>
              <span class="text-small text-muted">
                ${entry ? formatDateTime(entry.at) : 'À venir'}
              </span>
            </div>
          </li>
        `;
      })}
    </ol>
  `;
};

const groupedIban = (iban) => iban.replace(/(.{4})/g, '$1 ').trim();

const paymentCardMarkup = (mission) => html`
  <div class="card card--flat stack-sm">
    <h3 class="card-title">${icon('receipt', 20)} Règlement par virement</h3>
    <p class="text-small text-muted">
      Votre convoyage démarre dès réception du virement. Privilégiez le virement instantané,
      gratuit dans la plupart des banques.
    </p>
    <div class="price-summary__line price-summary__line--total">
      <span>Montant à régler</span>
      <span>${formatEuro(mission.quote.totalIncludingVat)}</span>
    </div>
    <p class="text-small">Bénéficiaire : <strong>${escapeHtml(PAYMENT.holder)}</strong></p>
    <p class="text-small">IBAN : <strong>${escapeHtml(groupedIban(PAYMENT.iban))}</strong></p>
    <p class="text-small">BIC : <strong>${escapeHtml(PAYMENT.bic)}</strong></p>
    <p class="text-small">
      Référence à indiquer : <strong>${escapeHtml(mission.reference)}</strong>
    </p>
    <button type="button" class="button button--s button--secondary" data-copy-iban>
      Copier l’IBAN
    </button>
  </div>
`;

const missionCard = (mission) => {
  const status = statusById(mission.status);
  return html`
    <article class="card">
      <div class="card__row">
        <div class="stack-sm">
          <h2 class="card-title">${escapeHtml(mission.departure)} → ${escapeHtml(mission.arrival)}</h2>
          <span class="text-small text-muted">
            ${escapeHtml(mission.reference)} — ${formatDistance(mission.quote.kilometers)}
          </span>
        </div>
        <span class="chip chip--status chip--${status.tone}">
          ${icon('dot', 16)} ${escapeHtml(status.label)}
        </span>
      </div>
      ${timelineMarkup(mission)}
      <hr class="divider" />
      <div class="price-summary__line price-summary__line--total">
        <span>Montant ${TOTAL_LABEL.toLowerCase()}</span>
        <span>${formatEuro(mission.quote.totalIncludingVat)}</span>
      </div>
      ${mission.status === 'confirmee' ? paymentCardMarkup(mission) : ''}
      ${mission.arrivalReport
        ? html`<p class="text-small text-muted">
            Livré le ${formatDateTime(mission.arrivalReport.completedAt)} — procès-verbal signé.
          </p>`
        : ''}
      ${mission.trackingToken && isConfigured() && !['livree', 'facturee', 'annulee'].includes(mission.status)
        ? html`
            <button type="button" class="button button--s button--stroke" data-notify="${mission.id}">
              ${icon('inbox', 20)} M’alerter à chaque étape
            </button>
            <p class="text-small text-muted" data-notify-state="${mission.id}" hidden></p>
          `
        : ''}
    </article>
  `;
};

export const renderTracking = (params) => {
  const requested = params.reference ?? '';
  const { missions } = getState();
  const mission = requested ? findMissionByReference(requested) : null;

  const resultMarkup = () => {
    if (requested && !mission) {
      return errorState({
        title: 'Référence introuvable',
        text: `Aucun convoyage ne correspond à « ${requested} ». Vérifiez la référence reçue par message, elle commence par CHF.`,
        actionLabel: 'Voir toutes mes demandes',
        actionAttribute: 'data-goto="suivi"',
      });
    }
    if (mission) return missionCard(mission);
    if (missions.length === 0) {
      return emptyState({
        title: 'Aucun convoyage en cours',
        text: 'Vos demandes apparaîtront ici avec leur avancement en temps réel.',
        actionLabel: 'Calculer mon devis',
        actionAttribute: 'data-goto="devis"',
      });
    }
    return missions.map(missionCard).join('');
  };

  const view = fromHtml(html`
    <div class="screen">
      <header class="screen__head">
        <h1>Suivre un convoyage</h1>
        <p class="text-muted">Saisissez votre référence ou consultez vos demandes enregistrées.</p>
      </header>

      <form class="card" data-search-form>
        <div class="field">
          <label class="field__label" for="reference">Référence du convoyage</label>
          <input
            class="input"
            id="reference"
            name="reference"
            type="text"
            placeholder="CHF-2608-001"
            value="${escapeHtml(requested)}"
          />
        </div>
        <button type="submit" class="button button--m button--primary">
          ${icon('search', 24)} Rechercher
        </button>
      </form>

      <section class="section" aria-live="polite">${resultMarkup()}</section>
    </div>
  `);

  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));

  onClick(view, '[data-copy-iban]', async () => {
    try {
      await navigator.clipboard.writeText(PAYMENT.iban);
      showToast('IBAN copié. Collez-le dans votre application bancaire.');
    } catch {
      showToast('Copie impossible : sélectionnez l’IBAN à la main.', 'danger');
    }
  });

  onClick(view, '[data-notify]', async (target) => {
    const tracked = (getState().missions ?? []).find((entry) => entry.id === target.dataset.notify);
    if (!tracked?.trackingToken) return;
    const stateLine = view.querySelector(`[data-notify-state="${tracked.id}"]`);
    const show = (text) => {
      stateLine.hidden = false;
      stateLine.textContent = text;
    };
    target.disabled = true;
    const { subscription, error } = await subscribeToPush();
    if (error) {
      target.disabled = false;
      show(error);
      return;
    }
    const saved = await saveClientPushSubscription(tracked.reference, tracked.trackingToken, subscription);
    if (saved.error) {
      target.disabled = false;
      show(saved.error);
      return;
    }
    show('C’est noté : vous serez prévenu sur cet appareil à chaque étape de votre convoyage. ✓');
  });

  if (mission?.trackingToken && isConfigured()) {
    fetchTrackedMission(mission.reference, mission.trackingToken).then(({ data, error }) => {
      if (error || !data?.mission) return;
      const distant = data.mission;
      if (distant.status && distant.status !== mission.status) {
        updateMission(mission.id, { status: distant.status, history: distant.history ?? mission.history });
        refresh();
      }
    });
  }

  view.querySelector('[data-search-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = view.querySelector('#reference').value.trim();
    navigate('suivi', value ? { reference: value } : {});
  });

  return view;
};
