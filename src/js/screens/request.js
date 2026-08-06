import { COMPANY } from '../config/company.js';
import { escapeHtml, html, icon, onClick } from '../core/dom.js';
import { formatDate, formatDistance, formatEuro } from '../core/format.js';
import { emptyState, fromHtml, showToast } from '../core/ui.js';
import { getState, setState } from '../core/store.js';
import { navigate } from '../core/router.js';
import { createMission } from '../domain/mission.js';
import { bindHandoffPanel, buildHandoffLink, handoffPanelMarkup } from './request-sent.js';
import { fetchAvailability, isConfigured, submitRequest } from '../data/api.js';
import { bindCalendar } from './calendar.js';
import { updateMission } from '../domain/mission.js';
import { quoteInputFrom } from '../domain/chaining.js';

const REQUIRED_FIELDS = ['contactName', 'contactPhone', 'pickupDate'];

const fieldMarkup = ({ id, label, type = 'text', placeholder = '', hint = '', required = false }) => html`
  <div class="field">
    <label class="field__label" for="${id}">
      ${escapeHtml(label)}${required ? '' : ' (facultatif)'}
    </label>
    <input
      class="input"
      id="${id}"
      name="${id}"
      type="${type}"
      placeholder="${escapeHtml(placeholder)}"
      ${required ? 'required' : ''}
    />
    ${hint ? html`<p class="field__hint">${escapeHtml(hint)}</p>` : ''}
  </div>
`;

export const renderRequest = () => {
  const { lastQuote } = getState();

  if (!lastQuote) {
    return fromHtml(html`
      <div class="screen">
        <header class="screen__head">
          <h1>Demande de convoyage</h1>
        </header>
        ${emptyState({
          title: 'Aucun devis en cours',
          text: 'Calculez d’abord votre devis, puis revenez ici pour envoyer la demande.',
          actionLabel: 'Calculer mon devis',
          actionAttribute: 'data-goto="devis"',
        })}
      </div>
    `);
  }

  const { input, quote } = lastQuote;

  const view = fromHtml(html`
    <div class="screen">
      <header class="screen__head">
        <h1>Demande de convoyage</h1>
        <p class="text-muted">
          Nous confirmons votre créneau sous ${COMPANY.responseDelayHours} heures ouvrées.
        </p>
      </header>

      <section class="card card--accent">
        <div class="card__row">
          <div class="stack-sm">
            <h2 class="card-title">${escapeHtml(input.departure || 'Départ')} → ${escapeHtml(input.arrival || 'Arrivée')}</h2>
            <p class="text-small text-muted">
              ${formatDistance(quote.kilometers)} — ${escapeHtml(quote.vehicle.label)} —
              ${escapeHtml(quote.urgency.label)}
            </p>
          </div>
          <strong>${formatEuro(quote.totalIncludingVat)}</strong>
        </div>
        <button type="button" class="button button--s button--link" data-goto="devis">
          Modifier le devis
        </button>
      </section>

      <form class="card" data-request-form novalidate>
        <h2 class="card-title">Vos coordonnées</h2>
        ${fieldMarkup({ id: 'contactName', label: 'Nom et prénom', required: true, placeholder: 'Mouss Chanfiou' })}
        ${fieldMarkup({ id: 'contactPhone', label: 'Téléphone', type: 'tel', required: true, placeholder: '06 12 34 56 78' })}
        ${fieldMarkup({ id: 'contactEmail', label: 'Adresse électronique', type: 'email', placeholder: 'vous@exemple.fr' })}
        ${fieldMarkup({ id: 'company', label: 'Société' })}
        ${fieldMarkup({
          id: 'buyerSiren',
          label: 'SIREN de la société',
          placeholder: '732 829 320',
          hint: 'Obligatoire sur les factures entre professionnels à partir de septembre 2027. Laissez vide pour un particulier.',
        })}
        ${fieldMarkup({ id: 'buyerAddressLine', label: 'Adresse de facturation' })}
        <div class="grid-2">
          ${fieldMarkup({ id: 'buyerPostalCode', label: 'Code postal' })}
          ${fieldMarkup({ id: 'buyerCity', label: 'Ville' })}
        </div>
        <hr class="divider" />
        <h2 class="card-title">Le véhicule</h2>
        ${fieldMarkup({ id: 'vehicleModel', label: 'Marque et modèle', placeholder: 'Peugeot 3008' })}
        ${fieldMarkup({ id: 'plate', label: 'Immatriculation', placeholder: 'AB-123-CD' })}
        <hr class="divider" />
        <h2 class="card-title">Logistique</h2>
        <div class="field">
          <label class="field__label">Date de prise en charge</label>
          <input type="hidden" id="pickupDate" name="pickupDate" />
          <div data-pickup-calendar></div>
          <p class="field__hint" data-pickup-hint>
            Seuls les jours où le convoyeur est disponible sont sélectionnables.
          </p>
        </div>
        ${fieldMarkup({ id: 'pickupAddress', label: 'Adresse exacte de départ', placeholder: '12 rue des Ateliers' })}
        ${fieldMarkup({ id: 'dropAddress', label: 'Adresse exacte de livraison' })}
        <div class="field">
          <label class="field__label" for="notes">Précisions (facultatif)</label>
          <textarea
            class="textarea"
            id="notes"
            name="notes"
            placeholder="Code d’accès, personne à contacter sur place, particularité du véhicule…"
          ></textarea>
        </div>
        <p class="field__error" data-form-error hidden></p>
        <button type="submit" class="button button--l button--primary button--full">
          ${icon('send', 24)} Envoyer ma demande
        </button>
      </form>

      <div data-handoff-slot></div>
    </div>
  `);

  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));

  const calendarSlot = view.querySelector('[data-pickup-calendar]');
  const pickupInput = view.querySelector('#pickupDate');
  const pickupHint = view.querySelector('[data-pickup-hint]');
  const now = new Date();
  const minDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const calendar = bindCalendar(calendarSlot, {
    mode: 'select',
    minDay,
    onDayClick: (day) => {
      pickupInput.value = day;
      calendar.select(day);
      pickupHint.textContent = `Prise en charge le ${formatDate(day)}.`;
    },
  });
  if (isConfigured()) {
    fetchAvailability().then(({ data }) => {
      if (data?.days) calendar.setBlocked(new Set(data.days));
    });
  }

  const form = view.querySelector('[data-request-form]');
  const errorLine = view.querySelector('[data-form-error]');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const missing = REQUIRED_FIELDS.filter((field) => !String(data[field] ?? '').trim());

    view.querySelectorAll('.input').forEach((element) => element.removeAttribute('aria-invalid'));
    if (missing.length > 0) {
      missing.forEach((field) => {
        view.querySelector(`#${field}`)?.setAttribute('aria-invalid', 'true');
      });
      errorLine.hidden = false;
      errorLine.innerHTML = `${icon('alert', 16)} Complétez votre nom, votre téléphone et la date de prise en charge pour que nous puissions vous rappeler.`;
      view.querySelector(`#${missing[0]}`)?.focus();
      return;
    }

    errorLine.hidden = true;
    const mission = createMission({
      departure: input.departure,
      arrival: input.arrival,
      quote,
      ...data,
    });

    const slot = view.querySelector('[data-handoff-slot]');
    form.hidden = true;

    const afficherLien = (raison) => {
      const link = buildHandoffLink(mission);
      slot.innerHTML = html`
        ${raison
          ? html`<div class="card card--flat">
              <p class="text-small text-muted">${icon('alert', 16)} ${escapeHtml(raison)}</p>
            </div>`
          : ''}
        ${handoffPanelMarkup(mission, link)}
      `;
      bindHandoffPanel(slot, link);
      slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (!isConfigured()) {
      afficherLien('');
      showToast(`Demande ${mission.reference} prête à être transmise.`);
      return;
    }

    slot.innerHTML = html`
      <div class="card card--flat" aria-live="polite">
        <p class="text-small text-muted">Envoi de votre demande…</p>
        <div class="skeleton"></div>
      </div>
    `;

    submitRequest({
      ...mission,
      clientRequestId: mission.clientRequestId ?? mission.id,
      quoteInput: quoteInputFrom(mission),
    }).then(
      ({ data, error }) => {
        if (error) {
          afficherLien(
            `Votre demande n’a pas pu être envoyée automatiquement : ${error} Transmettez-la par le lien ci-dessous.`,
          );
          showToast('Envoi impossible, utilisez le lien de transmission.', 'danger');
          return;
        }
        updateMission(mission.id, {
          reference: data.reference,
          trackingToken: data.token,
          sentToServerAt: new Date().toISOString(),
        });
        // Le devis est rattaché à la demande envoyée : il sera nettoyé
        // automatiquement à la confirmation du convoyage.
        const { lastQuote: currentQuote } = getState();
        if (currentQuote) {
          setState({ lastQuote: { ...currentQuote, sentReference: data.reference } });
        }
        slot.innerHTML = html`
          <section class="card card--accent" aria-live="polite">
            <h2 class="card-title">Demande envoyée</h2>
            <p class="text-small text-muted">
              ${escapeHtml(COMPANY.name)} l’a reçue dans son planning sous la référence
              ${escapeHtml(data.reference)}. Vous serez rappelé sous
              ${COMPANY.responseDelayHours} heures ouvrées.
            </p>
            <button type="button" class="button button--m button--primary" data-goto-suivi>
              ${icon('route', 24)} Suivre ma demande
            </button>
          </section>
        `;
        slot.querySelector('[data-goto-suivi]').addEventListener('click', () => {
          navigate('suivi', { reference: data.reference });
        });
        showToast(`Demande ${data.reference} envoyée.`);
        slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    );
  });

  return view;
};
