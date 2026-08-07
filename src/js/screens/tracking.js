import { escapeHtml, html, icon, onClick } from '../core/dom.js';
import { formatDateTime, formatDistance, formatEuro } from '../core/format.js';
import { emptyState, errorState, fromHtml, openSheet, showToast } from '../core/ui.js';
import { PAYMENT } from '../config/company.js';
import { contractMarkup, printContract } from './contract-document.js';
import { printPv, pvMarkup, pvTitle } from './pv-document.js';
import { getState, setState } from '../core/store.js';
import { navigate, refresh } from '../core/router.js';
import { MISSION_STATUSES, findMissionByReference, statusById } from '../domain/mission.js';
import { TOTAL_LABEL } from '../domain/vat.js';
import {
  fetchTrackedMission,
  isConfigured,
  saveClientPushSubscription,
  signContract,
} from '../data/api.js';
import { bindSignaturePad } from './signature-pad.js';
import { invoiceDocumentMarkup, printInvoice } from './admin/invoice-document.js';
import { updateMission } from '../domain/mission.js';
import { subscribeToPush } from '../domain/push-client.js';

const TRACKED_STATUSES = MISSION_STATUSES.filter((status) => status.id !== 'annulee');

const contractSignatureCardMarkup = (mission) => html`
  <div class="card card--accent stack-sm" data-contract-card>
    <h3 class="card-title">${icon('receipt', 20)} Signature de votre contrat</h3>
    <p class="text-small text-muted">
      Votre convoyage est confirmé. Relisez le contrat, signez-le dans le cadre ci-dessous : votre
      facture est émise dès la signature.
    </p>
    <button type="button" class="button button--s button--stroke" data-doc="contract" data-doc-mission="${mission.id}">
      Lire le contrat de convoyage
    </button>
    <div class="field">
      <label class="field__label" for="contractSignatory">Nom du signataire</label>
      <input class="input" id="contractSignatory" type="text" value="${escapeHtml(mission.contactName ?? '')}" />
    </div>
    <div class="field">
      <span class="field__label">Votre signature</span>
      <canvas class="signature-pad" data-contract-signature></canvas>
      <button type="button" class="button button--xs button--link" data-clear-contract-signature>
        Effacer la signature
      </button>
    </div>
    <p class="field__error" data-contract-error hidden></p>
    <button type="button" class="button button--m button--primary" data-sign-contract="${mission.id}">
      ${icon('check', 24)} Signer le contrat
    </button>
  </div>
`;

const stepDocumentMarkup = (mission, statusId) => {
  if (statusId === 'confirmee' && mission.termsAcceptedAt && mission.status !== 'demande') {
    return html`<button type="button" class="button button--xs button--stroke" data-doc="contract" data-doc-mission="${mission.id}">
      ${icon('receipt', 16)} ${mission.contractSignedAt ? 'Contrat signé' : 'Voir le contrat de convoyage'}
    </button>`;
  }
  if (statusId === 'facturee' && mission.invoice) {
    return html`<button type="button" class="button button--xs button--stroke" data-doc="invoice" data-doc-mission="${mission.id}">
      ${icon('receipt', 16)} Facture ${escapeHtml(mission.invoice.number ?? '')}
    </button>`;
  }
  if (statusId === 'etat-des-lieux' && mission.departureReport) {
    return html`<button type="button" class="button button--xs button--stroke" data-doc="departure" data-doc-mission="${mission.id}">
      ${icon('camera', 16)} État des lieux signé
    </button>`;
  }
  if (statusId === 'livree' && mission.arrivalReport) {
    return html`<button type="button" class="button button--xs button--stroke" data-doc="arrival" data-doc-mission="${mission.id}">
      ${icon('camera', 16)} PV de livraison signé
    </button>`;
  }
  return '';
};

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
              ${stepDocumentMarkup(mission, status.id)}
            </div>
          </li>
        `;
      })}
    </ol>
  `;
};

const groupedIban = (iban) => iban.replace(/(.{4})/g, '$1 ').trim();

// Lien de suivi : la référence et le jeton privé du client, pour retrouver
// son convoyage depuis n'importe quel appareil.
export const trackingLink = (mission) => {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/suivi?reference=${encodeURIComponent(mission.reference)}&token=${encodeURIComponent(mission.trackingToken ?? '')}`;
};

const paymentCardMarkup = (mission) => html`
  <div class="card card--flat stack-sm">
    <h3 class="card-title">${icon('receipt', 20)} Règlement par virement</h3>
    <p class="text-small text-muted">
      Votre convoyage démarre dès réception du virement. Privilégiez le virement instantané,
      gratuit dans la plupart des banques.
    </p>
    <div class="price-summary__line price-summary__line--total">
      <span>Montant à régler</span>
      <span>${formatEuro(mission.invoice?.totals?.duePayable ?? mission.quote.totalIncludingVat)}</span>
    </div>
    ${mission.invoice
      ? html`<button type="button" class="button button--s button--stroke" data-doc="invoice" data-doc-mission="${mission.id}">
          ${icon('download', 20)} Facture ${escapeHtml(mission.invoice.number ?? '')} en PDF
        </button>`
      : html`<p class="text-small text-muted">Votre facture arrive dans les instants qui suivent.</p>`}
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
      ${['confirmee', 'facturee'].includes(mission.status) && !mission.contractSignedAt
        ? contractSignatureCardMarkup(mission)
        : ''}
      ${['confirmee', 'facturee'].includes(mission.status) && mission.contractSignedAt
        ? paymentCardMarkup(mission)
        : ''}
      ${mission.arrivalReport
        ? html`<p class="text-small text-muted">
            Livré le ${formatDateTime(mission.arrivalReport.completedAt)} — procès-verbal signé.
          </p>`
        : ''}
      ${mission.trackingToken && isConfigured() && !['livree', 'annulee'].includes(mission.status)
        ? html`
            <button type="button" class="button button--s button--stroke" data-notify="${mission.id}">
              ${icon('inbox', 20)} M’alerter à chaque étape
            </button>
            <p class="text-small text-muted" data-notify-state="${mission.id}" hidden></p>
          `
        : ''}
      ${mission.trackingToken
        ? html`
            <hr class="divider" />
            <p class="text-small text-muted">
              Conservez votre lien de suivi : il vous redonne accès à ce convoyage, à vos documents
              et à la signature, depuis n’importe quel téléphone ou ordinateur.
            </p>
            <div class="row row--wrap">
              <button type="button" class="button button--xs button--stroke" data-copy-link="${mission.id}">
                Copier mon lien de suivi
              </button>
              <a
                class="button button--xs button--stroke"
                href="mailto:?subject=${encodeURIComponent(`Suivi de mon convoyage ${mission.reference}`)}&body=${encodeURIComponent(trackingLink(mission))}"
              >
                ${icon('mail', 16)} Me l’envoyer par mail
              </a>
            </div>
          `
        : ''}
    </article>
  `;
};

// Ouverture d'un lien de suivi sur un nouvel appareil : le convoyage est
// récupéré auprès du serveur grâce au jeton contenu dans le lien.
const adoptSharedMission = async (reference, token) => {
  const { data, error } = await fetchTrackedMission(reference, token);
  if (error || !data?.mission) return false;
  const missions = getState().missions ?? [];
  if (missions.some((entry) => entry.reference === reference)) return false;
  setState({
    missions: [
      {
        ...data.mission,
        id: `partage-${reference}`,
        reference,
        trackingToken: token,
        origin: 'client',
        history: data.mission.history ?? [],
      },
      ...missions,
    ],
  });
  return true;
};

export const renderTracking = (params) => {
  const requested = params.reference ?? '';
  const { missions } = getState();
  const mission = requested ? findMissionByReference(requested) : null;

  if (requested && !mission && params.token && isConfigured()) {
    adoptSharedMission(requested, params.token).then((adopted) => {
      if (adopted) refresh();
    });
  }

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

  onClick(view, '[data-doc]', (target) => {
    const docMission = (getState().missions ?? []).find(
      (entry) => entry.id === target.dataset.docMission,
    );
    if (!docMission) return;
    const kind = target.dataset.doc;
    const title =
      kind === 'contract'
        ? `Contrat ${docMission.reference}`
        : kind === 'invoice'
          ? `Facture ${docMission.invoice?.number ?? ''}`
          : pvTitle(kind);
    const body =
      kind === 'contract'
        ? contractMarkup(docMission)
        : kind === 'invoice'
          ? invoiceDocumentMarkup(docMission.invoice)
          : pvMarkup(docMission, kind);
    const sheet = openSheet(
      title,
      html`
        <div class="stack-lg">
          <button type="button" class="button button--s button--primary" data-print-doc>
            ${icon('download', 20)} Imprimer / PDF
          </button>
          ${body}
        </div>
      `,
    );
    onClick(sheet.element, '[data-print-doc]', () => {
      const printed =
        kind === 'contract'
          ? printContract(docMission)
          : kind === 'invoice'
            ? printInvoice(docMission.invoice)
            : printPv(docMission, kind);
      if (!printed) showToast('Autorisez les fenêtres surgissantes pour imprimer.', 'danger');
    });
  });

  const contractCard = view.querySelector('[data-contract-card]');
  if (contractCard) {
    const pad = bindSignaturePad(contractCard.querySelector('[data-contract-signature]'));
    const contractError = contractCard.querySelector('[data-contract-error]');
    onClick(contractCard, '[data-clear-contract-signature]', () => pad.clear());
    onClick(contractCard, '[data-sign-contract]', async (target) => {
      const signed = (getState().missions ?? []).find((entry) => entry.id === target.dataset.signContract);
      if (!signed?.trackingToken) return;
      const signatoryName = contractCard.querySelector('#contractSignatory').value.trim();
      const showError = (text) => {
        contractError.hidden = false;
        contractError.innerHTML = `${icon('alert', 16)} ${escapeHtml(text)}`;
      };
      if (pad.isEmpty()) return showError('Signez dans le cadre avant de valider.');
      if (!signatoryName) return showError('Indiquez le nom du signataire.');

      target.disabled = true;
      const { data, error } = await signContract(
        signed.reference,
        signed.trackingToken,
        pad.toDataUrl(),
        signatoryName,
      );
      if (error) {
        target.disabled = false;
        showError(error);
        return;
      }
      updateMission(signed.id, {
        contractSignedAt: data.contractSignedAt,
        contractSignatoryName: signatoryName,
        contractSignature: pad.toDataUrl(),
      });
      showToast('Contrat signé. Votre facture arrive.');
      refresh();
    });
  }

  onClick(view, '[data-copy-link]', async (target) => {
    const shared = (getState().missions ?? []).find((entry) => entry.id === target.dataset.copyLink);
    if (!shared) return;
    try {
      await navigator.clipboard.writeText(trackingLink(shared));
      showToast('Lien de suivi copié. Conservez-le pour retrouver votre convoyage.');
    } catch {
      showToast('Copie impossible : notez votre référence et votre lien.', 'danger');
    }
  });

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

  // Toutes les missions affichées encore en cours sont réactualisées auprès
  // du serveur, pas seulement celle recherchée par référence.
  const trackedMissions = (mission ? [mission] : missions).filter(
    (entry) => entry.trackingToken && !['livree', 'annulee'].includes(entry.status),
  );
  if (isConfigured() && trackedMissions.length > 0) {
    Promise.all(
      trackedMissions.map(async (entry) => {
        const { data, error } = await fetchTrackedMission(entry.reference, entry.trackingToken);
        if (error || !data?.mission) return false;
        const distant = data.mission;
        const documentsChanged =
          Boolean(distant.departureReport) !== Boolean(entry.departureReport) ||
          Boolean(distant.arrivalReport) !== Boolean(entry.arrivalReport) ||
          (distant.invoice?.number ?? null) !== (entry.invoice?.number ?? null) ||
          (distant.contractSignedAt ?? null) !== (entry.contractSignedAt ?? null);
        if ((!distant.status || distant.status === entry.status) && !documentsChanged) return false;
        updateMission(entry.id, {
          status: distant.status ?? entry.status,
          history: distant.history ?? entry.history,
          departureReport: distant.departureReport ?? entry.departureReport ?? null,
          arrivalReport: distant.arrivalReport ?? entry.arrivalReport ?? null,
          invoice: distant.invoice ?? entry.invoice ?? null,
          contractSignedAt: distant.contractSignedAt ?? entry.contractSignedAt ?? null,
          contractSignatoryName: distant.contractSignatoryName ?? entry.contractSignatoryName ?? null,
        });
        // Demande confirmée : le devis qui lui a donné naissance est nettoyé.
        if (entry.status === 'demande' && distant.status !== 'demande') {
          const { lastQuote } = getState();
          if (lastQuote?.sentReference === entry.reference) setState({ lastQuote: null });
        }
        return true;
      }),
    ).then((changes) => {
      if (changes.some(Boolean)) refresh();
    });
  }

  view.querySelector('[data-search-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = view.querySelector('#reference').value.trim();
    navigate('suivi', value ? { reference: value } : {});
  });

  return view;
};
