import { COMPANY } from '../config/company.js';
import { escapeHtml, html, icon, onClick } from '../core/dom.js';
import { formatDistance, formatEuro } from '../core/format.js';
import { showToast } from '../core/ui.js';
import { handoffLink } from '../domain/handoff.js';

const messageFor = (mission, link) =>
  [
    `Demande de convoyage ${mission.reference}`,
    `${mission.departure} vers ${mission.arrival} (${formatDistance(mission.quote.kilometers)})`,
    `Véhicule : ${mission.vehicleModel || mission.quote.vehicle.label}${mission.plate ? ` — ${mission.plate}` : ''}`,
    `Prise en charge souhaitée : ${mission.pickupDate}`,
    `Montant : ${formatEuro(mission.quote.totalIncludingVat)}`,
    `Contact : ${mission.contactName} — ${mission.contactPhone}`,
    '',
    'Lien à ouvrir pour enregistrer la demande :',
    link,
  ].join('\n');

export const handoffPanelMarkup = (mission, link) => html`
  <section class="card card--accent" data-handoff>
    <div class="row row--between">
      <h2 class="card-title">Transmettre la demande</h2>
      <span class="chip chip--accent">${escapeHtml(mission.reference)}</span>
    </div>
    <p class="text-small text-muted">
      Envoyez ce lien à ${escapeHtml(COMPANY.name)}. En l’ouvrant, la demande entre directement dans
      son planning, sans ressaisie.
    </p>
    <div class="row row--wrap">
      <a
        class="button button--m button--primary"
        href="sms:${escapeHtml(COMPANY.phone)}?&body=${encodeURIComponent(messageFor(mission, link))}"
      >
        ${icon('send', 24)} Envoyer par SMS
      </a>
      <a
        class="button button--m button--secondary"
        href="https://wa.me/?text=${encodeURIComponent(messageFor(mission, link))}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${icon('send', 24)} WhatsApp
      </a>
      <a
        class="button button--m button--secondary"
        href="mailto:${escapeHtml(COMPANY.email)}?subject=${encodeURIComponent(`Demande de convoyage ${mission.reference}`)}&body=${encodeURIComponent(messageFor(mission, link))}"
      >
        ${icon('mail', 24)} Par mail
      </a>
      <button type="button" class="button button--m button--stroke" data-copy-link>
        Copier le lien
      </button>
    </div>
    <label class="field">
      <span class="field__label" for="handoffLink">Lien de la demande</span>
      <textarea class="textarea" id="handoffLink" readonly rows="3">${escapeHtml(link)}</textarea>
    </label>
  </section>
`;

export const bindHandoffPanel = (root, link) => {
  onClick(root, '[data-copy-link]', async () => {
    try {
      await navigator.clipboard.writeText(link);
      showToast('Lien copié, collez-le dans votre message.');
    } catch {
      const field = root.querySelector('#handoffLink');
      field?.select();
      showToast('Sélectionnez le lien affiché puis copiez-le à la main.', 'danger');
    }
  });
};

export const buildHandoffLink = (mission) => handoffLink(mission, window.location.href);
