import { COMMITMENTS, COMPANY, PRO_ARGUMENTS, SERVICES } from '../config/company.js';
import { MINIMUM_FEE } from '../config/pricing.js';
import { BASE_SUFFIX } from '../domain/vat.js';
import { escapeHtml, html, icon, onClick } from '../core/dom.js';
import { formatEuroRounded } from '../core/format.js';
import { fromHtml } from '../core/ui.js';
import { getState } from '../core/store.js';
import { navigate } from '../core/router.js';
import { missionsThisMonth } from '../domain/mission.js';

const commitmentCard = (commitment) => html`
  <li class="card card--flat">
    <div class="row">
      <span class="text-accent">${icon(commitment.icon, 24)}</span>
      <h2 class="card-title">${escapeHtml(commitment.title)}</h2>
    </div>
    <p class="text-muted">${escapeHtml(commitment.text)}</p>
  </li>
`;

const serviceCard = (service) => html`
  <li class="card">
    <h2 class="card-title">${escapeHtml(service.title)}</h2>
    <p class="text-muted">${escapeHtml(service.text)}</p>
  </li>
`;

export const renderHome = () => {
  const { missions } = getState();
  const deliveredCount = missions.filter((mission) =>
    mission.status === 'livree',
  ).length;
  const monthCount = missionsThisMonth(missions).length;

  const view = fromHtml(html`
    <div class="screen">
      <section class="card card--accent">
        <div class="stack-sm">
          <span class="chip chip--accent">Devis en 30 secondes</span>
          <h1>Le convoyeur de votre atelier, pas d’une plateforme</h1>
          <p class="text-muted">
            ${escapeHtml(COMPANY.tagline)}. Péages, carburant et assurance inclus dans le prix
            annoncé, à partir de ${formatEuroRounded(MINIMUM_FEE)} ${BASE_SUFFIX}.
          </p>
        </div>
        <div class="row row--wrap">
          <button type="button" class="button button--l button--primary" data-goto="devis">
            ${icon('calculator', 24)} Calculer mon devis
          </button>
          <button type="button" class="button button--l button--stroke" data-goto="suivi">
            ${icon('search', 24)} Suivre un convoyage
          </button>
        </div>
      </section>

      <section class="card card--flat">
        <h2 class="card-title">Pour les professionnels</h2>
        <ul class="steps text-small text-muted">
          ${PRO_ARGUMENTS.map((argument) => html`<li>${escapeHtml(argument)}</li>`)}
        </ul>
        <button type="button" class="button button--m button--primary" data-goto="devis">
          ${icon('calculator', 24)} Chiffrer un convoyage
        </button>
      </section>

      <section class="section">
        <h2>Nos engagements</h2>
        <ul class="grid-2">
          ${COMMITMENTS.map(commitmentCard)}
        </ul>
      </section>

      <section class="section">
        <div class="section__title">
          <h2>Nos prestations</h2>
          <button type="button" class="button button--link" data-goto="tarifs">
            Voir la grille tarifaire
          </button>
        </div>
        <ul class="stack-lg">
          ${SERVICES.map(serviceCard)}
        </ul>
      </section>

      <section class="section">
        <h2>En chiffres</h2>
        <div class="stat-grid">
          <div class="stat">
            <span class="stat__label">Convoyages livrés</span>
            <span class="stat__value">${deliveredCount}</span>
          </div>
          <div class="stat">
            <span class="stat__label">Missions ce mois</span>
            <span class="stat__value">${monthCount}</span>
          </div>
        </div>
        <p class="text-small text-muted">
          Les compteurs se remplissent au fur et à mesure des missions enregistrées dans
          l’application.
        </p>
      </section>

      <section class="card">
        <h2 class="card-title">Besoin d’un accompagnement immédiat ?</h2>
        <p class="text-muted">${escapeHtml(COMPANY.supportHours)}</p>
        <div class="row row--wrap">
          <a class="button button--m button--secondary" href="tel:${escapeHtml(COMPANY.phone)}">
            ${icon('phone', 24)} Appeler
          </a>
          <a class="button button--m button--stroke" href="mailto:${escapeHtml(COMPANY.email)}">
            ${icon('mail', 24)} Écrire un message
          </a>
        </div>
      </section>

      <p class="text-small text-muted" style="text-align: center">
        <button type="button" class="button button--xs button--link" data-goto="mentions">
          Mentions légales et données personnelles
        </button>
      </p>
    </div>
  `);

  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));
  return view;
};
