import { CHAINING_RADIUS_KILOMETERS, HOME_BASE } from '../../config/pricing.js';
import { escapeHtml, html, icon } from '../../core/dom.js';
import { formatDate, formatDistance, formatEuroRounded } from '../../core/format.js';
import { getState } from '../../core/store.js';
import { updateMission } from '../../domain/mission.js';
import {
  chainedApproachKilometers,
  chainingBenefit,
  emptyKilometreRatio,
  findChainCandidates,
  quoteInputFrom,
  soloApproachKilometers,
} from '../../domain/chaining.js';
import { computeQuote } from '../../domain/quote.js';

export const chainingOpportunities = (missions) =>
  missions
    .map((mission) => {
      if (mission.chainedToId) return null;
      const candidates = findChainCandidates(mission, missions);
      if (candidates.length === 0) return null;
      const best = candidates[0];
      const benefit = chainingBenefit(mission, best.candidate);
      if (!benefit || benefit.emptyKilometersSaved < 50) return null;
      return { mission, best, benefit };
    })
    .filter(Boolean)
    .sort((first, second) => second.benefit.emptyKilometersSaved - first.benefit.emptyKilometersSaved);

export const chainingPanelMarkup = (missions) => {
  const opportunities = chainingOpportunities(missions);
  const ratio = emptyKilometreRatio(missions);

  if (opportunities.length === 0) {
    return html`
      <section class="card card--flat">
        <div class="row row--between">
          <h2 class="card-title">Chaînage des missions</h2>
          ${ratio === null
            ? ''
            : html`<span class="chip chip--status chip--neutral">
                ${Math.round(ratio * 100)} % à vide
              </span>`}
        </div>
        <p class="text-small text-muted">
          Aucune mission chaînable pour le moment. Je surveille les demandes dont le lieu de départ
          est à moins de ${CHAINING_RADIUS_KILOMETERS} km d’une livraison déjà prévue.
        </p>
      </section>
    `;
  }

  return html`
    <section class="card card--accent">
      <div class="row row--between">
        <h2 class="card-title">${opportunities.length} mission(s) chaînable(s)</h2>
        ${ratio === null
          ? ''
          : html`<span class="chip chip--status chip--progress">
              ${Math.round(ratio * 100)} % à vide
            </span>`}
      </div>
      <p class="text-small text-muted">
        Enchaîner évite de rentrer à ${escapeHtml(HOME_BASE.city)} entre deux missions. Vous roulez
        moins à vide et vous pouvez baisser le prix sans perdre de marge.
      </p>
      <ul class="stack-lg">
        ${opportunities.map(
          ({ mission, best, benefit }) => html`
            <li class="card">
              <div class="stack-sm">
                <h2 class="card-title">${escapeHtml(mission.departure)} → ${escapeHtml(mission.arrival)}</h2>
                <span class="text-small text-muted">
                  ${escapeHtml(mission.reference)} — prise en charge ${formatDate(mission.pickupDate)}
                </span>
              </div>
              <div class="stack-sm text-small text-muted">
                <span>
                  ${icon('route', 16)} À enchaîner après ${escapeHtml(best.candidate.reference)}, livré à
                  ${escapeHtml(best.candidate.arrival)} le ${formatDate(best.candidate.pickupDate)}
                </span>
                <span>
                  ${icon('truck', 16)} ${formatDistance(best.detour)} seulement entre la livraison et
                  cette prise en charge
                </span>
                <span class="text-accent">
                  ${icon('check', 16)} ${formatDistance(benefit.emptyKilometersSaved)} à vide évités,
                  ${formatEuroRounded(benefit.clientSaving)} de moins pour le client
                </span>
              </div>
              <button
                type="button"
                class="button button--xs button--primary"
                data-chain="${escapeHtml(mission.id)}"
                data-chain-to="${escapeHtml(best.candidate.id)}"
              >
                Chaîner et recalculer le prix
              </button>
            </li>
          `,
        )}
      </ul>
    </section>
  `;
};

export const applyChaining = (missionId, previousMissionId) => {
  const { missions } = getState();
  const mission = missions.find((entry) => entry.id === missionId);
  const previous = missions.find((entry) => entry.id === previousMissionId);
  if (!mission || !previous) return null;

  const chainedKilometers = chainedApproachKilometers(previous, mission);
  if (chainedKilometers === null) return null;

  const quote = computeQuote({
    ...quoteInputFrom(mission),
    approachKilometers: chainedKilometers,
  });

  updateMission(missionId, {
    chainedToId: previousMissionId,
    chainedToReference: previous.reference,
    quote,
  });

  return quote;
};

export const undoChaining = (missionId) => {
  const { missions } = getState();
  const mission = missions.find((entry) => entry.id === missionId);
  if (!mission) return null;

  const soloKilometers = soloApproachKilometers(mission);
  if (soloKilometers === null) return null;

  const quote = computeQuote({
    ...quoteInputFrom(mission),
    approachKilometers: soloKilometers,
  });

  updateMission(missionId, { chainedToId: null, chainedToReference: null, quote });
  return quote;
};
