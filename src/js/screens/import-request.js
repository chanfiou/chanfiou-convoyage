import { COMPANY } from '../config/company.js';
import { getSettings } from '../config/settings.js';
import { escapeHtml, html, icon, onClick } from '../core/dom.js';
import { formatDate, formatDistance, formatEuro } from '../core/format.js';
import { errorState, fromHtml, showToast } from '../core/ui.js';
import { getState, setState } from '../core/store.js';
import { navigate } from '../core/router.js';
import { createMission } from '../domain/mission.js';
import {
  alreadyImported,
  decodeRequest,
  missionPayloadFromRequest,
} from '../domain/handoff.js';
import { TOTAL_LABEL } from '../domain/vat.js';

const detailRow = (label, value) =>
  value
    ? html`<div class="price-summary__line">
        <span class="text-muted">${escapeHtml(label)}</span>
        <span>${escapeHtml(value)}</span>
      </div>`
    : '';

export const renderImportRequest = (params) => {
  const { request, error } = decodeRequest(params.d ?? '');

  if (error) {
    const view = fromHtml(html`
      <div class="screen">
        <header class="screen__head">
          <h1>Demande reçue</h1>
        </header>
        ${errorState({
          title: 'Lien inutilisable',
          text: error,
          actionLabel: 'Revenir aux missions',
          actionAttribute: 'data-goto="espace"',
        })}
      </div>
    `);
    onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));
    return view;
  }

  const state = getState();
  const quote = missionPayloadFromRequest(request).quote;
  const deja = alreadyImported(request, state.missions ?? []);
  const settings = getSettings();

  const view = fromHtml(html`
    <div class="screen">
      <header class="screen__head">
        <h1>Demande reçue</h1>
        <p class="text-muted">
          Vérifiez la demande puis ajoutez-la à vos missions. Rien n’est enregistré avant votre
          validation.
        </p>
      </header>

      <section class="card card--accent">
        <div class="card__row">
          <div class="stack-sm">
            <h2 class="card-title">${escapeHtml(request.dep)} → ${escapeHtml(request.arr)}</h2>
            <span class="text-small text-muted">
              ${formatDistance(quote.kilometers)} — ${escapeHtml(quote.vehicle.label)} —
              ${escapeHtml(quote.urgency.label)}
            </span>
          </div>
          <strong>${formatEuro(quote.totalIncludingVat)}</strong>
        </div>
        <div class="price-summary">
          ${detailRow('Client', request.c.co || request.c.n)}
          ${detailRow('Contact', request.c.n)}
          ${detailRow('Téléphone', request.c.p)}
          ${detailRow('Adresse électronique', request.c.e)}
          ${detailRow('SIREN', request.c.si)}
          ${detailRow('Véhicule', request.m.vm)}
          ${detailRow('Immatriculation', request.m.pl)}
          ${detailRow('Prise en charge', request.m.pd ? formatDate(request.m.pd) : '')}
          ${detailRow('Adresse de départ', request.m.pa)}
          ${detailRow('Adresse de livraison', request.m.da)}
          ${detailRow('Précisions', request.m.no)}
          <div class="price-summary__line price-summary__line--total">
            <span>${TOTAL_LABEL}</span>
            <span>${formatEuro(quote.totalIncludingVat)}</span>
          </div>
        </div>
      </section>

      ${deja
        ? html`
            <div class="card card--flat">
              <p class="text-small text-accent">
                ${icon('check', 16)} Cette demande est déjà dans vos missions. L’ajouter à nouveau
                créerait un doublon.
              </p>
              <button type="button" class="button button--m button--primary" data-goto="espace">
                Voir mes missions
              </button>
            </div>
          `
        : html`
            ${state.adminUnlocked
              ? ''
              : html`
                  <form class="card" data-unlock-form>
                    <div class="field">
                      <label class="field__label" for="importCode">Code d’accès</label>
                      <input
                        class="input"
                        id="importCode"
                        name="accessCode"
                        type="password"
                        inputmode="numeric"
                        autocomplete="off"
                        placeholder="••••"
                      />
                      <p class="field__hint">
                        Déverrouillez votre espace pour ajouter cette demande à vos missions.
                      </p>
                    </div>
                    <p class="field__error" data-unlock-error hidden></p>
                    <button type="submit" class="button button--m button--secondary">
                      ${icon('lock', 24)} Déverrouiller
                    </button>
                  </form>
                `}
            <button
              type="button"
              class="button button--l button--primary button--full"
              data-import
              ${state.adminUnlocked ? '' : 'disabled'}
            >
              ${icon('inbox', 24)} Ajouter à mes missions
            </button>
            <a class="button button--m button--stroke button--full" href="tel:${escapeHtml(request.c.p)}">
              ${icon('phone', 24)} Appeler le client
            </a>
          `}
    </div>
  `);

  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));

  const unlockForm = view.querySelector('[data-unlock-form]');
  if (unlockForm) {
    const errorLine = view.querySelector('[data-unlock-error]');
    unlockForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = view.querySelector('#importCode').value.trim();
      if (value !== (settings.adminAccessCode ?? COMPANY.adminAccessCode)) {
        errorLine.hidden = false;
        errorLine.innerHTML = `${icon('alert', 16)} Code incorrect. Vérifiez la saisie avant d’ajouter la demande.`;
        return;
      }
      setState({ adminUnlocked: true });
      navigate('importer', { d: params.d });
    });
  }

  onClick(view, '[data-import]', () => {
    if (!getState().adminUnlocked) {
      showToast('Déverrouillez votre espace avant d’ajouter la demande.', 'danger');
      return;
    }
    const mission = createMission(missionPayloadFromRequest(request));
    showToast(`Demande ajoutée sous la référence ${mission.reference}.`);
    navigate('espace');
  });

  return view;
};
