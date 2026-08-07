import { COMPANY } from '../../config/company.js';
import { escapeHtml, html, icon, onClick } from '../../core/dom.js';
import { formatDate, formatDateTime, formatEuroRounded } from '../../core/format.js';
import { emptyState, fromHtml, openSheet, showToast } from '../../core/ui.js';
import { contractMarkup, printContract } from '../contract-document.js';
import { getState, resetState, setState } from '../../core/store.js';
import { navigate, refresh } from '../../core/router.js';
import {
  MISSION_STATUSES,
  advanceMissionStatus,
  missionRevenue,
  missionsThisMonth,
  removeMission,
  statusById,
  updateMission,
} from '../../domain/mission.js';
import { BASE_SUFFIX } from '../../domain/vat.js';
import { invoiceForMission } from '../../domain/invoice.js';
import { issueInvoiceForMissions } from '../../domain/invoice-issue.js';
import { HOLD_HOURS, holdLabel, pendingHolds } from '../../domain/reminders.js';
import { deleteMissionOnServer, saveAvailability } from '../../data/api.js';
import { getSettings, missingSettings } from '../../config/settings.js';
import { bindSettingsBanner, openSettingsSheet, settingsBannerMarkup } from './settings.js';
import { applyChaining, chainingPanelMarkup, undoChaining } from './chaining-panel.js';
import { backupReminderMarkup } from './backup-panel.js';
import { renderSignIn, sessionBadgeMarkup } from './sign-in.js';
import {
  isConfigured,
  isSignedIn,
  savePushSubscription,
  sendTestPush,
  signOut,
} from '../../data/api.js';
import { subscribeToPush } from '../../domain/push-client.js';
import { markPending, newRequestCount, syncNow } from '../../data/sync.js';
import { exportMissionsCsv, seedDemoMissions } from './demo-data.js';
import { openReportSheet } from './report-sheet.js';

const FILTERS = [
  { id: 'toutes', label: 'Toutes' },
  { id: 'a-traiter', label: 'À traiter', statuses: ['demande', 'confirmee', 'facturee', 'payee'] },
  { id: 'en-cours', label: 'En route', statuses: ['etat-des-lieux', 'en-cours'] },
  { id: 'terminees', label: 'Terminées', statuses: ['livree'] },
];

const gateMarkup = () => html`
  <div class="screen">
    <header class="screen__head">
      <h1>Espace convoyeur</h1>
      <p class="text-muted">
        Accès réservé à l’équipe ${escapeHtml(COMPANY.name)}. Saisissez votre code d’accès.
      </p>
    </header>
    <form class="card" data-gate-form>
      <div class="field">
        <label class="field__label" for="accessCode">Code d’accès</label>
        <input
          class="input"
          id="accessCode"
          name="accessCode"
          type="password"
          inputmode="numeric"
          autocomplete="off"
          placeholder="••••"
        />
        <p class="field__hint">Code par défaut : ${escapeHtml(COMPANY.adminAccessCode)}. À personnaliser avant mise en service.</p>
      </div>
      <p class="field__error" data-gate-error hidden></p>
      <button type="submit" class="button button--m button--primary">
        ${icon('lock', 24)} Déverrouiller l’espace
      </button>
    </form>
  </div>
`;

const missionRow = (mission) => {
  const status = statusById(mission.status);
  return html`
    <article class="card">
      <div class="card__row">
        <div class="stack-sm">
          <h2 class="card-title">${escapeHtml(mission.departure)} → ${escapeHtml(mission.arrival)}</h2>
          <span class="text-small text-muted">
            ${escapeHtml(mission.reference)} —
            ${escapeHtml(mission.company?.trim() || mission.contactName || 'Client à préciser')}
            ${mission.company?.trim() && mission.contactName ? `(${escapeHtml(mission.contactName)})` : ''}
          </span>
          ${mission.origin === 'client'
            ? html`<span class="text-small text-accent">${icon('inbox', 16)} Reçue par l’application</span>`
            : ''}
          <span class="text-small text-muted">
            ${escapeHtml(mission.vehicleModel || mission.quote?.vehicle?.label || 'Véhicule à préciser')}
            ${mission.plate ? `— ${escapeHtml(mission.plate)}` : ''}
          </span>
        </div>
        <div class="stack-sm" style="align-items: flex-end">
          <span class="chip chip--status chip--${status.tone}">
            ${icon('dot', 16)} ${escapeHtml(status.label)}
          </span>
          <strong>${formatEuroRounded(mission.quote.totalExcludingVat)} ${BASE_SUFFIX}</strong>
        </div>
      </div>
      <div class="row row--between">
        <span class="text-small text-muted">
          ${icon('calendar', 16)} Prise en charge ${formatDate(mission.pickupDate)}
        </span>
        <span class="text-small text-muted">${mission.quote.kilometers} km</span>
      </div>
      ${mission.chainedToId
        ? html`<p class="text-small text-accent">
            ${icon('route', 16)} Chaînée après ${escapeHtml(mission.chainedToReference ?? '')} —
            approche réduite à ${mission.quote.approachKilometers} km
            <button type="button" class="button button--xs button--link" data-unchain="${mission.id}">
              Annuler le chaînage
            </button>
          </p>`
        : ''}
      ${['confirmee', 'facturee'].includes(mission.status)
        ? html`<p class="text-small ${mission.contractSignedAt ? 'text-accent' : 'field__error'}">
            ${mission.contractSignedAt
              ? html`${icon('check', 16)} Contrat signé par
                  ${escapeHtml(mission.contractSignatoryName ?? 'le client')} le
                  ${formatDateTime(mission.contractSignedAt)}`
              : html`${icon('alert', 16)} Contrat en attente de signature du client — facturation
                  bloquée.`}
          </p>`
        : ''}
      <div class="row row--wrap">
        ${status.next
          ? html`<button type="button" class="button button--xs button--primary" data-advance="${mission.id}" data-next="${status.next}">
              ${escapeHtml(statusById(status.next).label)}
            </button>`
          : ''}
        <button type="button" class="button button--xs button--stroke" data-report="departure" data-mission="${mission.id}">
          ${mission.departureReport ? 'Voir l’état des lieux' : 'État des lieux'}
        </button>
        <button type="button" class="button button--xs button--stroke" data-report="arrival" data-mission="${mission.id}">
          ${mission.arrivalReport ? 'Voir le PV de livraison' : 'PV de livraison'}
        </button>
        ${mission.termsAcceptedAt && mission.status !== 'annulee'
          ? html`<button type="button" class="button button--xs button--stroke" data-contract="${mission.id}">
              ${icon('receipt', 20)} Contrat
            </button>`
          : ''}
        <a class="button button--xs button--stroke" href="tel:${escapeHtml(mission.contactPhone ?? '')}">
          ${icon('phone', 20)} Appeler
        </a>
        ${['confirmee', 'facturee', 'payee', 'etat-des-lieux', 'en-cours', 'livree'].includes(mission.status)
          ? html`<button type="button" class="button button--xs button--secondary" data-invoice="${mission.id}">
              ${icon('receipt', 20)} ${invoiceForMission(mission.id) ? 'Voir la facture' : 'Facturer'}
            </button>`
          : ''}
        ${!['annulee', 'livree'].includes(mission.status)
          ? html`<button type="button" class="button button--xs button--danger" data-cancel="${mission.id}">
              Annuler
            </button>`
          : ''}
        ${mission.status === 'annulee' && !invoiceForMission(mission.id)
          ? html`<button type="button" class="button button--xs button--danger" data-delete="${mission.id}">
              ${icon('close', 20)} Supprimer définitivement
            </button>`
          : ''}
      </div>
    </article>
  `;
};

const holdsPanelMarkup = (holds) => {
  if (holds.length === 0) return '';
  return html`
    <section class="card card--accent">
      <div class="row row--between">
        <h2 class="card-title">${icon('alert', 20)} Dates réservées à relancer</h2>
        <span class="chip chip--status chip--warning">${holds.length}</span>
      </div>
      <p class="text-small text-muted">
        Vos conditions générales tiennent la date ${HOLD_HOURS} heures. Au-delà, relancez le client
        ou libérez la journée pour la remettre à la vente.
      </p>
      <ul class="stack-lg">
        ${holds
          .map(
            ({ mission, kind, hours }) => html`
              <li class="card card--flat">
                <div class="card__row">
                  <div class="stack-sm">
                    <h3 class="card-title">${escapeHtml(mission.reference)} — ${escapeHtml(holdLabel(kind))}</h3>
                    <span class="text-small text-muted">
                      ${escapeHtml(mission.company?.trim() || mission.contactName || 'Client')} —
                      prise en charge du ${mission.pickupDate ? formatDate(mission.pickupDate) : 'à préciser'}
                    </span>
                    <span class="text-small text-muted">Depuis ${hours} heures</span>
                  </div>
                </div>
                <div class="row row--wrap">
                  <a class="button button--xs button--primary" href="tel:${escapeHtml(mission.contactPhone ?? '')}">
                    ${icon('phone', 20)} Relancer
                  </a>
                  ${mission.pickupDate
                    ? html`<button
                        type="button"
                        class="button button--xs button--stroke"
                        data-release-day="${escapeHtml(mission.pickupDate.slice(0, 10))}"
                      >
                        ${icon('calendar', 20)} Libérer la date
                      </button>`
                    : ''}
                  <button type="button" class="button button--xs button--danger" data-cancel="${mission.id}">
                    Annuler la mission
                  </button>
                </div>
              </li>
            `,
          )
          .join('')}
      </ul>
    </section>
  `;
};

export const renderAdmin = (params) => {
  const state = getState();

  if (!state.adminUnlocked && !isSignedIn()) return renderSignIn();

  const activeFilterId = params.filtre ?? 'toutes';
  const activeFilter = FILTERS.find((filter) => filter.id === activeFilterId) ?? FILTERS[0];
  const visibleMissions = activeFilter.statuses
    ? state.missions.filter((mission) => activeFilter.statuses.includes(mission.status))
    : state.missions;

  const nouvellesDemandes = newRequestCount(state.missions ?? []);
  const monthMissions = missionsThisMonth(state.missions);
  const monthRevenue = missionRevenue(monthMissions);
  const pendingCount = state.missions.filter((mission) =>
    ['demande', 'confirmee'].includes(mission.status),
  ).length;
  const averageTicket = monthMissions.length > 0 ? monthRevenue / monthMissions.length : 0;

  const view = fromHtml(html`
    <div class="screen">
      <header class="screen__head">
        <div class="row row--between">
          <h1>Espace convoyeur</h1>
          <button type="button" class="button button--xs button--link" data-lock>
            ${isSignedIn() ? 'Se déconnecter' : 'Verrouiller'}
          </button>
        </div>
        <div class="row row--wrap">
          ${sessionBadgeMarkup()}
          ${nouvellesDemandes > 0
            ? html`<span class="chip chip--status chip--progress">
                ${icon('inbox', 16)} ${nouvellesDemandes} nouvelle(s) demande(s)
              </span>`
            : ''}
          ${isSignedIn()
            ? html`<button type="button" class="button button--xs button--stroke" data-sync>
                ${icon('route', 20)} Synchroniser
              </button>`
            : ''}
        </div>
      </header>

      ${settingsBannerMarkup(getSettings())}

      ${backupReminderMarkup(state)}

      ${holdsPanelMarkup(pendingHolds(state.missions))}

      ${chainingPanelMarkup(state.missions)}

      <section class="stat-grid">
        <div class="stat">
          <span class="stat__label">Chiffre d’affaires du mois</span>
          <span class="stat__value">${formatEuroRounded(monthRevenue)}</span>
          <span class="text-small text-muted">${monthMissions.length} mission(s) enregistrée(s)</span>
        </div>
        <div class="stat">
          <span class="stat__label">À traiter</span>
          <span class="stat__value">${pendingCount}</span>
          <span class="text-small text-muted">Demandes et missions confirmées</span>
        </div>
        <div class="stat">
          <span class="stat__label">Panier moyen</span>
          <span class="stat__value">${formatEuroRounded(averageTicket)}</span>
          <span class="text-small text-muted">Sur le mois en cours</span>
        </div>
        <div class="stat">
          <span class="stat__label">Total missions</span>
          <span class="stat__value">${state.missions.length}</span>
          <span class="text-small text-muted">Depuis la mise en service</span>
        </div>
      </section>

      <section class="section">
        <div class="row row--wrap">
          ${FILTERS.map(
            (filter) => html`
              <button
                type="button"
                class="chip chip--filter"
                aria-pressed="${filter.id === activeFilter.id}"
                data-filter="${filter.id}"
              >
                ${escapeHtml(filter.label)}
              </button>
            `,
          )}
        </div>
        ${visibleMissions.length === 0
          ? emptyState({
              title: 'Aucune mission dans ce filtre',
              text: 'Changez de filtre, ou chargez un jeu de démonstration pour découvrir l’espace.',
              actionLabel: 'Charger des missions de démonstration',
              actionAttribute: 'data-seed',
            })
          : visibleMissions.map(missionRow).join('')}
      </section>

      <section class="card card--flat">
        <h2 class="card-title">Outils</h2>
        <div class="row row--wrap">
          <button type="button" class="button button--s button--primary" data-goto="factures">
            ${icon('receipt', 24)} Factures
          </button>
          <button type="button" class="button button--s button--secondary" data-goto="disponibilites">
            ${icon('calendar', 24)} Disponibilités
          </button>
          <button type="button" class="button button--s button--secondary" data-open-settings>
            ${icon('settings', 24)} Réglages
          </button>
          <button type="button" class="button button--s button--secondary" data-export>
            ${icon('download', 24)} Exporter en CSV
          </button>
          <button type="button" class="button button--s button--stroke" data-seed>
            ${icon('inbox', 24)} Charger la démonstration
          </button>
          <button type="button" class="button button--s button--danger" data-reset-all>
            Effacer toutes les données
          </button>
        </div>
        <p class="text-small text-muted">
          Les données restent sur cet appareil. L’export CSV s’ouvre dans un tableur pour la
          facturation.
        </p>
      </section>

      <section class="card card--flat">
        <h2 class="card-title">Notifications</h2>
        <p class="text-small text-muted">
          Recevez une notification sur cet appareil à chaque nouvelle demande de convoyage,
          même quand l’application est fermée.
        </p>
        <div class="row row--wrap">
          <button type="button" class="button button--s button--primary" data-push-enable>
            ${icon('inbox', 24)} Activer sur cet appareil
          </button>
          <button type="button" class="button button--s button--stroke" data-push-test>
            Recevoir une notification de test
          </button>
        </div>
        <p class="text-small text-muted" data-push-state></p>
      </section>
    </div>
  `);

  const reload = () => refresh();

  const marquerASynchroniser = (missionId) => {
    if (!isConfigured()) return;
    const missions = getState().missions ?? [];
    setState({
      missions: missions.map((mission) =>
        mission.id === missionId ? markPending(mission) : mission,
      ),
    });
  };

  bindSettingsBanner(view, reload);
  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));
  onClick(view, '[data-invoice]', async (target) => {
    const mission = getState().missions.find((entry) => entry.id === target.dataset.invoice);
    if (!mission) return;
    if (invoiceForMission(mission.id)) {
      navigate('factures');
      return;
    }
    if (missingSettings(getSettings()).length > 0) {
      showToast('Complétez les réglages de l’entreprise avant de facturer.', 'danger');
      openSettingsSheet(reload);
      return;
    }
    // Pas de facture sans contrat signé par le client.
    if (!mission.contractSignedAt) {
      showToast(
        'Le client n’a pas encore signé le contrat. La facture ne peut pas être émise.',
        'danger',
      );
      return;
    }
    target.disabled = true;
    showToast('Émission de la facture chez votre plateforme agréée…');
    const { invoice, official, error } = await issueInvoiceForMissions([mission]);
    target.disabled = false;
    if (!invoice) {
      showToast(error ?? 'Facture impossible.', 'danger');
      return;
    }
    if (['demande', 'confirmee'].includes(mission.status)) advanceMissionStatus(mission.id, 'facturee');
    marquerASynchroniser(mission.id);
    showToast(
      official
        ? `Facture ${invoice.number} émise et transmise au client.`
        : `${error} La facture reste à transmettre depuis l’écran Factures.`,
      official ? 'success' : 'danger',
    );
    navigate('factures');
  });
  onClick(view, '[data-chain]', (target) => {
    const quote = applyChaining(target.dataset.chain, target.dataset.chainTo);
    if (!quote) return;
    showToast(`Mission chaînée, nouveau prix ${Math.round(quote.totalExcludingVat)} €.`);
    reload();
  });
  onClick(view, '[data-unchain]', (target) => {
    undoChaining(target.dataset.unchain);
    showToast('Chaînage annulé, prix recalculé.');
    reload();
  });
  onClick(view, '[data-filter]', (target) => navigate('espace', { filtre: target.dataset.filter }));
  onClick(view, '[data-lock]', () => {
    if (isSignedIn()) signOut();
    else setState({ adminUnlocked: false });
    navigate('espace');
  });

  const pushState = view.querySelector('[data-push-state]');

  onClick(view, '[data-push-enable]', async () => {
    if (!isSignedIn()) {
      showToast('Connectez-vous d’abord à l’Espace convoyeur.', 'danger');
      return;
    }
    const { subscription, error } = await subscribeToPush();
    if (error) {
      pushState.textContent = error;
      return;
    }
    const saved = await savePushSubscription(subscription);
    if (saved.error) {
      pushState.textContent = saved.error;
      return;
    }
    pushState.textContent = 'Notifications activées sur cet appareil. ✓';
    showToast('Notifications activées.');
  });

  onClick(view, '[data-push-test]', async () => {
    if (!isSignedIn()) {
      showToast('Connectez-vous d’abord à l’Espace convoyeur.', 'danger');
      return;
    }
    const { error } = await sendTestPush();
    if (error) showToast(error, 'danger');
    else showToast('Notification de test envoyée — elle arrive dans quelques secondes.');
  });

  onClick(view, '[data-sync]', async () => {
    showToast('Synchronisation en cours…');
    const resultat = await syncNow();
    if (resultat.error) {
      showToast(resultat.error, 'danger');
      return;
    }
    const recues = resultat.added ?? 0;
    showToast(
      recues > 0
        ? `${recues} demande(s) reçue(s), ${resultat.pushed ?? 0} mise(s) à jour envoyée(s).`
        : `À jour. ${resultat.pushed ?? 0} mise(s) à jour envoyée(s).`,
    );
    reload();
  });
  onClick(view, '[data-advance]', (target) => {
    const mission = getState().missions.find((entry) => entry.id === target.dataset.advance);
    const next = target.dataset.next;
    // Chaque étape a son garde-fou documentaire.
    if (next === 'facturee' && mission && !mission.contractSignedAt) {
      showToast('Le client doit d’abord signer son contrat de convoyage.', 'danger');
      return;
    }
    if (next === 'en-cours' && mission && !mission.departureReport?.signature) {
      showToast('État des lieux de prise en charge à faire signer par le client.', 'danger');
      openReportSheet(mission, 'departure', reload);
      return;
    }
    if (next === 'livree' && mission && !mission.arrivalReport?.signature) {
      showToast('PV de livraison à faire signer par le client.', 'danger');
      openReportSheet(mission, 'arrival', reload);
      return;
    }
    advanceMissionStatus(target.dataset.advance, next);
    marquerASynchroniser(target.dataset.advance);
    showToast(`Statut mis à jour : ${statusById(next).label}.`);
    if (next === 'etat-des-lieux' && mission && !mission.departureReport) {
      openReportSheet(mission, 'departure', reload);
    }
    reload();
  });

  onClick(view, '[data-delete]', async (target) => {
    const mission = getState().missions.find((entry) => entry.id === target.dataset.delete);
    if (!mission) return;
    const confirmed = window.confirm(
      `Supprimer définitivement ${mission.reference} ? Les données du client, ses photos de procès-verbal et son suivi seront effacés, ici comme sur le serveur. Cette action est irréversible.`,
    );
    if (!confirmed) return;

    target.disabled = true;
    if (isConfigured() && isSignedIn()) {
      const { error } = await deleteMissionOnServer(mission.reference);
      if (error) {
        target.disabled = false;
        showToast(error, 'danger');
        return;
      }
    }
    removeMission(mission.id);
    showToast(`${mission.reference} supprimée définitivement.`);
    reload();
  });

  onClick(view, '[data-release-day]', async (target) => {
    const day = target.dataset.releaseDay;
    target.disabled = true;
    const { error } = await saveAvailability(day, false);
    target.disabled = false;
    if (error) {
      showToast(error, 'danger');
      return;
    }
    showToast(`Journée du ${formatDate(day)} libérée : elle est de nouveau réservable.`);
    reload();
  });

  onClick(view, '[data-contract]', (target) => {
    const mission = getState().missions.find((entry) => entry.id === target.dataset.contract);
    if (!mission) return;
    const sheet = openSheet(
      `Contrat ${mission.reference}`,
      html`
        <div class="stack-lg">
          <button type="button" class="button button--s button--primary" data-print-doc>
            ${icon('download', 20)} Imprimer / PDF
          </button>
          ${contractMarkup(mission)}
        </div>
      `,
    );
    onClick(sheet.element, '[data-print-doc]', () => {
      if (!printContract(mission)) {
        showToast('Autorisez les fenêtres surgissantes pour imprimer le contrat.', 'danger');
      }
    });
  });
  onClick(view, '[data-cancel]', (target) => {
    advanceMissionStatus(target.dataset.cancel, 'annulee');
    marquerASynchroniser(target.dataset.cancel);
    showToast('Mission annulée.', 'danger');
    reload();
  });
  onClick(view, '[data-report]', (target) => {
    const mission = getState().missions.find((entry) => entry.id === target.dataset.mission);
    if (!mission) return;
    openReportSheet(mission, target.dataset.report, reload);
  });
  onClick(view, '[data-export]', () => {
    if (state.missions.length === 0) {
      showToast('Aucune mission à exporter pour le moment.', 'danger');
      return;
    }
    exportMissionsCsv(state.missions);
  });
  onClick(view, '[data-seed]', () => {
    const count = seedDemoMissions();
    showToast(`${count} missions de démonstration ajoutées.`);
    reload();
  });
  onClick(view, '[data-reset-all]', () => {
    resetState();
    showToast('Toutes les données ont été effacées.', 'danger');
    navigate('espace');
  });

  const statusLegend = MISSION_STATUSES.map((status) => status.label).join(' · ');
  view.querySelector('.section')?.setAttribute('aria-description', statusLegend);

  return view;
};
