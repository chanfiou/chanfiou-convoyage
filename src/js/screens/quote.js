import {
  APPROACH_FREE_KILOMETERS,
  EXTRA_SERVICES,
  HOME_BASE,
  NIGHT_SURCHARGE,
  SCHEDULE_SURCHARGES,
  URGENCY_LEVELS,
  VEHICLE_CATEGORIES,
} from '../config/pricing.js';
import { escapeHtml, html, icon, onChange, onClick, onInput } from '../core/dom.js';
import {
  formatDistance,
  formatDuration,
  formatEuro,
  formatPercent,
} from '../core/format.js';
import { fromHtml, showToast } from '../core/ui.js';
import { getState, setState } from '../core/store.js';
import { navigate } from '../core/router.js';
import { computeQuote } from '../domain/quote.js';
import { estimateRoadDistance } from '../domain/geo.js';
import { TOTAL_LABEL, VAT_HEADLINE_NOTE, showsVatLines, vatRatePercent } from '../domain/vat.js';
import { bindCityField, cityFieldMarkup } from './city-input.js';

const DEFAULT_INPUT = {
  departure: '',
  arrival: '',
  kilometers: 0,
  distanceIsManual: false,
  vehicleId: 'citadine',
  urgencyId: 'standard',
  scheduleId: 'semaine',
  isNightDeparture: false,
  vehicleCount: 1,
  monthlyMissions: 0,
  extraIds: [],
  includeApproach: true,
  approachKilometers: 0,
};

const radioOption = (option, groupName, selectedId) => html`
  <label class="option ${option.id === selectedId ? 'option--selected' : ''}">
    <input
      type="radio"
      name="${groupName}"
      value="${option.id}"
      ${option.id === selectedId ? 'checked' : ''}
    />
    <span class="option__body">
      <span class="option__label">${escapeHtml(option.label)}</span>
      ${option.hint ? html`<span class="text-small text-muted">${escapeHtml(option.hint)}</span>` : ''}
    </span>
    ${option.surcharge > 0
      ? html`<span class="option__price">+${formatPercent(option.surcharge)}</span>`
      : ''}
  </label>
`;

const extraOption = (service, selectedIds) => html`
  <label class="option ${selectedIds.includes(service.id) ? 'option--selected' : ''}">
    <input type="checkbox" name="extra" value="${service.id}" ${selectedIds.includes(service.id) ? 'checked' : ''} />
    <span class="option__body">
      <span class="option__label">${escapeHtml(service.label)}</span>
      ${service.hint ? html`<span class="text-small text-muted">${escapeHtml(service.hint)}</span>` : ''}
    </span>
    <span class="option__price">
      ${service.discount ? `−${formatPercent(service.discount)}` : formatEuro(service.price)}
    </span>
  </label>
`;

const breakdownMarkup = (quote) => html`
  <div class="price-headline">
    <span class="text-small text-muted">Prix tout compris</span>
    <span class="price-headline__amount">${formatEuro(quote.totalIncludingVat)}</span>
    <span class="text-small text-muted">
      ${formatEuro(quote.pricePerKilometer)} par km — ${escapeHtml(VAT_HEADLINE_NOTE)}
    </span>
  </div>
  <hr class="divider" />
  <div class="price-summary">
    <div class="price-summary__line">
      <span>Convoyage par la route ${formatDistance(quote.kilometers)}</span>
      <span>${formatEuro(quote.base)}</span>
    </div>
    ${quote.surchargeLines.map(
      (line) => html`
        <div class="price-summary__line">
          <span class="text-muted">${escapeHtml(line.label)} (+${formatPercent(line.rate)})</span>
          <span class="text-muted">${formatEuro(line.amount)}</span>
        </div>
      `,
    )}
    ${quote.approachTotal > 0
      ? html`
          <div class="price-summary__line">
            <span class="text-muted">
              Approche et retour ${escapeHtml(HOME_BASE.city)} (${formatDistance(quote.approachKilometers)})
            </span>
            <span class="text-muted">${formatEuro(quote.approachTotal)}</span>
          </div>
        `
      : ''}
    ${quote.vehicleCount > 1
      ? html`
          <div class="price-summary__line">
            <span class="text-muted">
              ${quote.vehicleCount - 1} véhicule(s) supplémentaire(s), remise incluse
            </span>
            <span class="text-muted">${formatEuro(quote.additionalVehiclesPrice)}</span>
          </div>
        `
      : ''}
    ${quote.extras.map(
      (service) => html`
        <div class="price-summary__line">
          <span class="text-muted">${escapeHtml(service.label)}</span>
          <span class="text-muted">
            ${service.discount ? `−${formatPercent(service.discount)}` : formatEuro(service.price)}
          </span>
        </div>
      `,
    )}
    ${quote.totalDiscountRate > 0
      ? html`
          <div class="price-summary__line">
            <span class="text-accent">
              Remise ${formatPercent(quote.totalDiscountRate)}
              ${quote.volumeTier ? `— ${escapeHtml(quote.volumeTier.label)}` : ''}
            </span>
            <span class="text-accent">−${formatEuro(quote.discountAmount)}</span>
          </div>
        `
      : ''}
    ${showsVatLines
      ? html`
          <div class="price-summary__line">
            <span class="text-muted">Total HT</span>
            <span class="text-muted">${formatEuro(quote.totalExcludingVat)}</span>
          </div>
          <div class="price-summary__line">
            <span class="text-muted">TVA ${vatRatePercent} %</span>
            <span class="text-muted">${formatEuro(quote.vatAmount)}</span>
          </div>
        `
      : ''}
    <div class="price-summary__line price-summary__line--total">
      <span>${TOTAL_LABEL}</span>
      <span>${formatEuro(quote.totalIncludingVat)}</span>
    </div>
  </div>
  <p class="text-small text-muted">
    Durée de route estimée : ${formatDuration(quote.kilometers)}. Péages, carburant, assurance,
    procès-verbal photo et suivi inclus.
  </p>
`;

export const renderQuote = (params) => {
  const stored = getState().lastQuote;
  const input = { ...DEFAULT_INPUT, ...(params.reprendre === '1' && stored ? stored.input : {}) };

  const view = fromHtml(html`
    <div class="screen">
      <header class="screen__head">
        <h1>Votre devis instantané</h1>
        <p class="text-muted">
          Renseignez le trajet, nous calculons le prix ferme immédiatement. Aucun engagement.
        </p>
      </header>

      <section class="card">
        <h2 class="card-title">Trajet</h2>
        ${cityFieldMarkup({
          name: 'departure',
          label: 'Ville de départ',
          placeholder: 'Lyon, Bordeaux, 75…',
          value: input.departure,
        })}
        ${cityFieldMarkup({
          name: 'arrival',
          label: 'Ville d’arrivée',
          placeholder: 'Lille, Marseille, 33…',
          value: input.arrival,
        })}
        <div class="field">
          <label class="field__label" for="kilometers">Distance retenue</label>
          <input
            class="input"
            id="kilometers"
            name="kilometers"
            type="number"
            min="1"
            max="2000"
            step="1"
            inputmode="numeric"
            value="${input.kilometers || ''}"
          />
          <p class="field__hint" data-distance-hint>
            Choisissez deux villes pour une estimation automatique, ajustable à la main.
          </p>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Déplacement du convoyeur</h2>
        <p class="text-small">
          ${icon('check', 16)} L’approche et le retour depuis ${escapeHtml(HOME_BASE.city)} sont
          déjà compris dans le prix affiché — les ${APPROACH_FREE_KILOMETERS} premiers kilomètres
          sont offerts.
        </p>
        <p class="text-small text-muted" data-approach-detail>
          Choisissez les deux villes pour voir le détail du déplacement.
        </p>
      </section>

      <section class="card">
        <h2 class="card-title">Type de véhicule</h2>
        <div class="option-list" data-group="vehicle">
          ${VEHICLE_CATEGORIES.map((option) => radioOption(option, 'vehicleId', input.vehicleId))}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Délai souhaité</h2>
        <div class="option-list" data-group="urgency">
          ${URGENCY_LEVELS.map((option) => radioOption(option, 'urgencyId', input.urgencyId))}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Créneau de prise en charge</h2>
        <div class="option-list" data-group="schedule">
          ${SCHEDULE_SURCHARGES.map((option) => radioOption(option, 'scheduleId', input.scheduleId))}
        </div>
        <label class="option ${input.isNightDeparture ? 'option--selected' : ''}">
          <input type="checkbox" name="isNightDeparture" ${input.isNightDeparture ? 'checked' : ''} />
          <span class="option__body">
            <span class="option__label">${escapeHtml(NIGHT_SURCHARGE.label)}</span>
            <span class="text-small text-muted">${escapeHtml(NIGHT_SURCHARGE.hint)}</span>
          </span>
          <span class="option__price">+${formatPercent(NIGHT_SURCHARGE.surcharge)}</span>
        </label>
      </section>

      <section class="card">
        <h2 class="card-title">Prestations complémentaires</h2>
        <div class="option-list" data-group="extras">
          ${EXTRA_SERVICES.map((service) => extraOption(service, input.extraIds))}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Volume</h2>
        <div class="field">
          <label class="field__label" for="vehicleCount">Nombre de véhicules sur ce trajet</label>
          <input
            class="input"
            id="vehicleCount"
            name="vehicleCount"
            type="number"
            min="1"
            max="12"
            step="1"
            inputmode="numeric"
            value="${input.vehicleCount}"
          />
          <p class="field__hint">Remise de 10 % dès le deuxième véhicule sur le même trajet.</p>
        </div>
        <div class="field">
          <label class="field__label" for="monthlyMissions">
            Convoyages prévus par mois (compte professionnel)
          </label>
          <input
            class="input"
            id="monthlyMissions"
            name="monthlyMissions"
            type="number"
            min="0"
            max="400"
            step="1"
            inputmode="numeric"
            value="${input.monthlyMissions}"
          />
          <p class="field__hint">Remise de 7 % dès 10 convoyages, 12 % dès 30, 18 % dès 80.</p>
        </div>
      </section>

      <section class="card card--accent" data-quote-panel aria-live="polite"></section>

      <div class="stack-sm">
        <button type="button" class="button button--l button--primary button--full" data-request>
          ${icon('send', 24)} Demander ce convoyage
        </button>
        <button type="button" class="button button--m button--stroke button--full" data-reset>
          Réinitialiser le devis
        </button>
      </div>
    </div>
  `);

  const panel = view.querySelector('[data-quote-panel]');
  const distanceInput = view.querySelector('#kilometers');
  const distanceHint = view.querySelector('[data-distance-hint]');
  const approachDetail = view.querySelector('[data-approach-detail]');
  const approachState = { kilometers: input.approachKilometers ?? 0, outbound: 0, inbound: 0 };

  const refreshApproach = (departure, arrival) => {
    const outbound = estimateRoadDistance(HOME_BASE.label, departure);
    const inbound = estimateRoadDistance(arrival, HOME_BASE.label);
    if (departure && arrival && (outbound === null || inbound === null)) {
      approachState.outbound = 0;
      approachState.inbound = 0;
      approachState.kilometers = 0;
      approachDetail.textContent = `Une des deux villes n’est pas dans ma base. Choisissez une ville dans la liste proposée pour que le déplacement soit calculé.`;
      return;
    }
    approachState.outbound = outbound ?? 0;
    approachState.inbound = inbound ?? 0;
    approachState.kilometers = approachState.outbound + approachState.inbound;
    if (approachState.kilometers === 0) {
      approachDetail.textContent = `Choisissez les deux villes pour estimer le déplacement. Les ${APPROACH_FREE_KILOMETERS} premiers kilomètres sont offerts.`;
      return;
    }
    approachDetail.textContent = `${HOME_BASE.city} vers ${departure} : ${formatDistance(approachState.outbound)}. ${arrival} vers ${HOME_BASE.city} : ${formatDistance(approachState.inbound)}. Total ${formatDistance(approachState.kilometers)}, dont ${APPROACH_FREE_KILOMETERS} km offerts.`;
  };

  const readInput = () => {
    const extraIds = [...view.querySelectorAll('input[name="extra"]:checked')].map(
      (element) => element.value,
    );
    return {
      departure: view.querySelector('#city-departure').value.trim(),
      arrival: view.querySelector('#city-arrival').value.trim(),
      kilometers: Number(distanceInput.value) || 0,
      includeApproach: true,
      approachKilometers: approachState.kilometers,
      distanceIsManual: input.distanceIsManual,
      vehicleId: view.querySelector('input[name="vehicleId"]:checked').value,
      urgencyId: view.querySelector('input[name="urgencyId"]:checked').value,
      scheduleId: view.querySelector('input[name="scheduleId"]:checked').value,
      isNightDeparture: view.querySelector('input[name="isNightDeparture"]').checked,
      vehicleCount: Number(view.querySelector('#vehicleCount').value) || 1,
      monthlyMissions: Number(view.querySelector('#monthlyMissions').value) || 0,
      extraIds,
    };
  };

  const refreshSelectionStyles = () => {
    view.querySelectorAll('.option').forEach((option) => {
      const control = option.querySelector('input');
      option.classList.toggle('option--selected', control.checked);
    });
  };

  const render = () => {
    refreshApproach(
      view.querySelector('#city-departure').value.trim(),
      view.querySelector('#city-arrival').value.trim(),
    );
    const current = readInput();
    if (current.kilometers < 1) {
      panel.innerHTML = html`
        <div class="stack-sm">
          <h2 class="card-title">Distance manquante</h2>
          <p class="text-muted">
            Indiquez les villes de départ et d’arrivée, ou saisissez directement la distance en
            kilomètres pour afficher le prix.
          </p>
        </div>
      `;
      return;
    }
    const quote = computeQuote(current);
    panel.innerHTML = breakdownMarkup(quote);
    setState({ lastQuote: { input: current, quote } });
  };

  const applyEstimation = () => {
    const current = readInput();
    if (input.distanceIsManual) return;
    const estimated = estimateRoadDistance(current.departure, current.arrival);
    if (!estimated) return;
    distanceInput.value = estimated;
    distanceHint.textContent = `Estimation routière ${formatDistance(estimated)} entre ${current.departure} et ${current.arrival}. Ajustez si votre itinéraire diffère.`;
    render();
  };

  bindCityField(view, 'departure', applyEstimation);
  bindCityField(view, 'arrival', applyEstimation);

  onInput(view, '#kilometers', () => {
    input.distanceIsManual = true;
    render();
  });
  onInput(view, '#vehicleCount, #monthlyMissions', render);
  onChange(view, '.option input', () => {
    refreshSelectionStyles();
    render();
  });

  onClick(view, '[data-request]', () => {
    const current = readInput();
    if (current.kilometers < 1) {
      showToast('Renseignez la distance pour envoyer votre demande.', 'danger');
      return;
    }
    setState({ lastQuote: { input: current, quote: computeQuote(current) } });
    navigate('demande');
  });

  onClick(view, '[data-reset]', () => {
    setState({ lastQuote: null });
    navigate('devis');
    showToast('Devis réinitialisé.');
  });

  render();
  return view;
};
