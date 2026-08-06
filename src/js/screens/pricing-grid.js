import { COMPANY } from '../config/company.js';
import {
  DISTANCE_BRACKETS,
  EXTRA_SERVICES,
  MINIMUM_FEE,
  MINIMUM_FEE_DISTANCE,
  APPROACH_FREE_KILOMETERS,
  APPROACH_MAX_FEE,
  APPROACH_PRICE_PER_KM,
  HOME_BASE,
  NIGHT_SURCHARGE,
  SCHEDULE_SURCHARGES,
  SECOND_VEHICLE_DISCOUNT,
  URGENCY_LEVELS,
  VEHICLE_CATEGORIES,
  VOLUME_DISCOUNTS,
  WAITING_FEE_FREE_MINUTES,
  WAITING_FEE_PER_HOUR,
} from '../config/pricing.js';
import { escapeHtml, html, icon, onClick } from '../core/dom.js';
import { formatEuro, formatEuroRounded, formatPercent } from '../core/format.js';
import { fromHtml } from '../core/ui.js';
import { navigate } from '../core/router.js';
import { roadBasePrice } from '../domain/quote.js';
import { BASE_SUFFIX, VAT_GRID_NOTE, showsVatLines } from '../domain/vat.js';

const EXAMPLE_DISTANCES = [80, 150, 300, 500, 750, 1000];

const bracketLabel = (bracket, index) => {
  const from = index === 0 ? MINIMUM_FEE_DISTANCE + 1 : DISTANCE_BRACKETS[index - 1].upTo + 1;
  return bracket.upTo === Infinity ? `Au-delà de ${from - 1} km` : `De ${from} à ${bracket.upTo} km`;
};

export const renderPricingGrid = () => {
  const view = fromHtml(html`
    <div class="screen">
      <header class="screen__head">
        <h1>Grille tarifaire</h1>
        <p class="text-muted">
          ${escapeHtml(VAT_GRID_NOTE)} Péages, carburant, assurance et procès-verbal photo toujours
          inclus.
        </p>
      </header>

      <section class="card">
        <h2 class="card-title">Barème kilométrique dégressif</h2>
        <table class="table">
          <caption class="visually-hidden">Prix au kilomètre par tranche de distance</caption>
          <thead>
            <tr>
              <th scope="col">Tranche</th>
              <th scope="col">Prix au km</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Jusqu’à ${MINIMUM_FEE_DISTANCE} km</td>
              <td>${formatEuroRounded(MINIMUM_FEE)} forfait</td>
            </tr>
            ${DISTANCE_BRACKETS.map(
              (bracket, index) => html`
                <tr>
                  <td>${bracketLabel(bracket, index)}</td>
                  <td>${formatEuro(bracket.pricePerKm)}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
        <p class="text-small text-muted">
          Le barème est dégressif par tranche cumulée : seuls les kilomètres au-delà d’un seuil
          passent au tarif inférieur.
        </p>
      </section>

      <section class="card">
        <h2 class="card-title">Exemples de trajets, citadine en semaine</h2>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Distance</th>
              <th scope="col">Prix ${BASE_SUFFIX}</th>
              ${showsVatLines ? '<th scope="col">Prix TTC</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${EXAMPLE_DISTANCES.map((distance) => {
              const base = roadBasePrice(distance);
              return html`
                <tr>
                  <td>${distance} km</td>
                  <td>${formatEuroRounded(base)}</td>
                  ${showsVatLines ? `<td>${formatEuroRounded(base * 1.2)}</td>` : ''}
                </tr>
              `;
            })}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2 class="card-title">Majorations véhicule</h2>
        <ul class="stack-sm">
          ${VEHICLE_CATEGORIES.map(
            (category) => html`
              <li class="row row--between">
                <span>${escapeHtml(category.label)}</span>
                <strong>${category.surcharge === 0 ? 'Tarif de base' : `+${formatPercent(category.surcharge)}`}</strong>
              </li>
            `,
          )}
        </ul>
      </section>

      <section class="card">
        <h2 class="card-title">Frais d’approche et de retour</h2>
        <p class="text-small text-muted">
          Je pars de ${escapeHtml(HOME_BASE.city)} pour prendre votre véhicule et je rentre à
          ${escapeHtml(HOME_BASE.city)} après la livraison. Ces deux trajets sont facturés au tarif
          réduit ci-dessous, les ${APPROACH_FREE_KILOMETERS} premiers kilomètres étant offerts.
        </p>
        <ul class="stack-sm">
          <li class="row row--between">
            <span>Trajet ${escapeHtml(HOME_BASE.city)} vers le lieu de prise en charge</span>
            <strong>${formatEuro(APPROACH_PRICE_PER_KM)}/km</strong>
          </li>
          <li class="row row--between">
            <span>Retour du lieu de livraison vers ${escapeHtml(HOME_BASE.city)}</span>
            <strong>${formatEuro(APPROACH_PRICE_PER_KM)}/km</strong>
          </li>
          <li class="row row--between">
            <span>Franchise offerte sur le cumul des deux trajets</span>
            <strong>${APPROACH_FREE_KILOMETERS} km</strong>
          </li>
          <li class="row row--between">
            <span>Plafond des frais de déplacement</span>
            <strong>${formatEuroRounded(APPROACH_MAX_FEE)}</strong>
          </li>
        </ul>
      </section>

      <section class="card">
        <h2 class="card-title">Majorations délai et créneau</h2>
        <ul class="stack-sm">
          ${[...URGENCY_LEVELS, ...SCHEDULE_SURCHARGES, NIGHT_SURCHARGE]
            .filter((entry) => entry.surcharge > 0)
            .map(
              (entry) => html`
                <li class="row row--between">
                  <span>${escapeHtml(entry.label)}${entry.hint ? ` — ${escapeHtml(entry.hint)}` : ''}</span>
                  <strong>+${formatPercent(entry.surcharge)}</strong>
                </li>
              `,
            )}
        </ul>
      </section>

      <section class="card">
        <h2 class="card-title">Prestations complémentaires</h2>
        <ul class="stack-sm">
          ${EXTRA_SERVICES.map(
            (service) => html`
              <li class="row row--between">
                <span>${escapeHtml(service.label)}</span>
                <strong>
                  ${service.discount ? `−${formatPercent(service.discount)}` : formatEuroRounded(service.price)}
                </strong>
              </li>
            `,
          )}
          <li class="row row--between">
            <span>Attente sur place au-delà de ${WAITING_FEE_FREE_MINUTES} minutes</span>
            <strong>${formatEuroRounded(WAITING_FEE_PER_HOUR)} par heure</strong>
          </li>
        </ul>
      </section>

      <section class="card card--accent">
        <h2 class="card-title">Remises volume, comptes professionnels</h2>
        <ul class="stack-sm">
          <li class="row row--between">
            <span>Deuxième véhicule sur le même trajet</span>
            <strong>−${formatPercent(SECOND_VEHICLE_DISCOUNT)}</strong>
          </li>
          ${VOLUME_DISCOUNTS.map(
            (tier) => html`
              <li class="row row--between">
                <span>${escapeHtml(tier.label)}</span>
                <strong>−${formatPercent(tier.discount)}</strong>
              </li>
            `,
          )}
        </ul>
        <button type="button" class="button button--m button--primary" data-goto="devis">
          ${icon('calculator', 24)} Simuler mon tarif
        </button>
      </section>

      <section class="card card--flat">
        <h2 class="card-title">Toujours inclus</h2>
        <ul class="stack-sm text-muted">
          <li>Péages et carburant du trajet</li>
          <li>
            Responsabilité civile professionnelle et garantie du véhicule confié à hauteur de
            ${formatEuroRounded(COMPANY.insurance.coverage)}
          </li>
          <li>Procès-verbal numérique signé au départ et à l’arrivée</li>
          <li>Reportage photo horodaté et suivi de la mission</li>
        </ul>
      </section>
    </div>
  `);

  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));
  return view;
};
