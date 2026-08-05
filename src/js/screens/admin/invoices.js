import { escapeHtml, html, icon, onClick } from '../../core/dom.js';
import { formatDate, formatEuro, formatEuroRounded } from '../../core/format.js';
import { emptyState, fromHtml, openSheet, showToast } from '../../core/ui.js';
import { getSettings, missingSettings } from '../../config/settings.js';
import { getState } from '../../core/store.js';
import { navigate, refresh } from '../../core/router.js';
import {
  INVOICE_STATUSES,
  advanceInvoiceStatus,
  createInvoiceForMissions,
  groupInvoiceableMissions,
  invoiceStatusById,
  isInvoiceOverdue,
  updateInvoice,
} from '../../domain/invoice.js';
import { isSignedIn, transmitInvoiceToAbby } from '../../data/api.js';
import { buildFacturXXml, facturXFileName } from '../../domain/facturx.js';
import { invoiceDocumentMarkup, printInvoice } from './invoice-document.js';
import { bindSettingsBanner, settingsBannerMarkup, settingsSummaryMarkup } from './settings.js';
import { openCreditNoteSheet } from './credit-note-sheet.js';
import { creditedAmountFor, isFullyCredited } from '../../domain/credit-note.js';
import { backupPanelMarkup, bindBackupPanel } from './backup-panel.js';

const downloadFile = (fileName, content, mimeType) => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const invoiceCard = (invoice, creditNotes) => {
  const status = invoiceStatusById(invoice.status);
  const credited = creditedAmountFor(invoice.id, creditNotes);
  const fullyCredited = isFullyCredited(invoice, creditNotes);
  const overdue = !fullyCredited && isInvoiceOverdue(invoice);
  return html`
    <article class="card">
      <div class="card__row">
        <div class="stack-sm">
          <h2 class="card-title">${escapeHtml(invoice.number)}</h2>
          <span class="text-small text-muted">${escapeHtml(invoice.buyer.name)}</span>
          <span class="text-small text-muted">
            ${escapeHtml(
              (invoice.missionReferences ?? [invoice.missionReference]).length > 1
                ? `${invoice.missionReferences.length} missions : ${invoice.missionReferences.join(', ')}`
                : `Mission ${invoice.missionReference}`,
            )}
          </span>
          <span class="text-small text-muted">Émise le ${formatDate(invoice.issuedAt)}</span>
        </div>
        <div class="stack-sm" style="align-items: flex-end">
          <span class="chip chip--status chip--${status.tone}">
            ${icon('dot', 16)} ${escapeHtml(status.label)}
          </span>
          <strong>${formatEuroRounded(invoice.totals.duePayable)}</strong>
        </div>
      </div>
      ${fullyCredited
        ? html`<p class="text-small text-accent">
            ${icon('receipt', 16)} Annulée par avoir, ${formatEuro(credited)} crédités
          </p>`
        : credited > 0
          ? html`<p class="text-small text-accent">
              ${icon('receipt', 16)} ${formatEuro(credited)} déjà crédités, reste
              ${formatEuro(invoice.totals.duePayable - credited)}
            </p>`
          : ''}
      ${overdue
        ? html`<p class="field__error">
            ${icon('alert', 16)} Échéance dépassée depuis le ${formatDate(invoice.dueAt)}. Relancez
            le client ou enregistrez le paiement.
          </p>`
        : fullyCredited
          ? ''
          : html`<p class="text-small text-muted">
              ${icon('calendar', 16)} Échéance le ${formatDate(invoice.dueAt)}
            </p>`}
      <div class="row row--wrap">
        <button type="button" class="button button--xs button--stroke" data-preview="${invoice.id}">
          Aperçu
        </button>
        <button type="button" class="button button--xs button--stroke" data-print="${invoice.id}">
          ${icon('download', 20)} PDF
        </button>
        <button type="button" class="button button--xs button--primary" data-xml="${invoice.id}">
          ${icon('download', 20)} Factur-X
        </button>
        ${invoice.status === 'emise' && !fullyCredited
          ? html`<button type="button" class="button button--xs button--secondary" data-abby="${invoice.id}">
              ${icon('send', 20)} Transmettre à Abby
            </button>`
          : ''}
        ${status.next && !fullyCredited
          ? html`<button type="button" class="button button--xs button--secondary" data-advance-invoice="${invoice.id}" data-next="${status.next}">
              ${escapeHtml(invoiceStatusById(status.next).label)}
            </button>`
          : ''}
        ${fullyCredited
          ? ''
          : html`<button type="button" class="button button--xs button--danger" data-credit="${invoice.id}">
              Émettre un avoir
            </button>`}
      </div>
    </article>
  `;
};

const creditNoteCard = (note) => html`
  <article class="card">
    <div class="card__row">
      <div class="stack-sm">
        <h2 class="card-title">${escapeHtml(note.number)}</h2>
        <span class="text-small text-muted">${escapeHtml(note.buyer.name)}</span>
        <span class="text-small text-muted">
          ${note.isPartial ? 'Avoir partiel' : 'Avoir total'} sur ${escapeHtml(note.invoiceNumber)} —
          ${formatDate(note.issuedAt)}
        </span>
        <span class="text-small text-muted">Motif : ${escapeHtml(note.reason)}</span>
      </div>
      <div class="stack-sm" style="align-items: flex-end">
        <span class="chip chip--status chip--danger">${icon('dot', 16)} Avoir</span>
        <strong>−${formatEuroRounded(note.totals.duePayable)}</strong>
      </div>
    </div>
    <div class="row row--wrap">
      <button type="button" class="button button--xs button--stroke" data-preview-credit="${note.id}">
        Aperçu
      </button>
      <button type="button" class="button button--xs button--stroke" data-print-credit="${note.id}">
        ${icon('download', 20)} PDF
      </button>
      <button type="button" class="button button--xs button--primary" data-xml-credit="${note.id}">
        ${icon('download', 20)} Factur-X
      </button>
    </div>
  </article>
`;

const platformPanelMarkup = (settings, pendingCount) => html`
  <section class="card card--accent">
    <h2 class="card-title">Transmission à votre plateforme agréée</h2>
    <p class="text-small text-muted">
      ${escapeHtml(settings.platformName)} est votre plateforme agréée, immatriculée par la DGFiP.
      Le bouton « Transmettre à Abby » de chaque facture la crée directement en brouillon dans
      votre compte : il ne reste qu’à la finaliser là-bas pour l’envoyer au client. En secours,
      vous pouvez toujours télécharger le lot Factur-X et le déposer à la main.
    </p>
    <div class="row row--wrap">
      <button type="button" class="button button--s button--primary" data-export-batch>
        ${icon('download', 24)} Télécharger le lot (${pendingCount})
      </button>
      <a
        class="button button--s button--stroke"
        href="${escapeHtml(settings.platformUrl)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${icon('send', 24)} Ouvrir ${escapeHtml(settings.platformName)}
      </a>
    </div>
    <p class="text-small text-muted">
      Rappel réglementaire : la réception de factures électroniques via une plateforme agréée est
      obligatoire depuis le 1er septembre 2026, l’émission le devient le 1er septembre 2027 pour les
      micro-entreprises.
    </p>
  </section>
`;

const groupPanelMarkup = (groups) => {
  if (groups.length === 0) return '';
  return html`
    <section class="card card--accent">
      <h2 class="card-title">Facturation mensuelle groupée</h2>
      <p class="text-small text-muted">
        Vos clients professionnels préfèrent une facture par mois plutôt qu’une par mission. Voici
        les regroupements possibles sur les missions livrées non encore facturées.
      </p>
      <ul class="stack-lg">
        ${groups.map(
          (group) => html`
            <li class="card card--flat">
              <div class="card__row">
                <div class="stack-sm">
                  <h2 class="card-title">${escapeHtml(group.client)}</h2>
                  <span class="text-small text-muted">
                    ${group.missions.length} mission(s) — période ${escapeHtml(group.period)}
                  </span>
                  <span class="text-small text-muted">
                    ${escapeHtml(group.missions.map((mission) => mission.reference).join(', '))}
                  </span>
                </div>
                <strong>
                  ${formatEuroRounded(
                    group.missions.reduce((sum, mission) => sum + mission.quote.totalExcludingVat, 0),
                  )}
                </strong>
              </div>
              <button
                type="button"
                class="button button--xs button--primary"
                data-group-invoice="${escapeHtml(group.missions.map((mission) => mission.id).join('|'))}"
              >
                ${icon('receipt', 20)} Émettre une facture groupée
              </button>
            </li>
          `,
        )}
      </ul>
    </section>
  `;
};

export const renderInvoices = () => {
  const settings = getSettings();
  const state = getState();
  const invoices = state.invoices ?? [];
  const creditNotes = state.creditNotes ?? [];
  const groups = groupInvoiceableMissions(state.missions ?? [], invoices);
  const pending = [
    ...invoices.filter((invoice) => invoice.status === 'emise'),
    ...creditNotes.filter((note) => note.status === 'emise'),
  ];
  const outstanding = invoices
    .filter((invoice) => invoice.status !== 'payee')
    .filter((invoice) => !isFullyCredited(invoice, creditNotes))
    .reduce(
      (sum, invoice) => sum + invoice.totals.duePayable - creditedAmountFor(invoice.id, creditNotes),
      0,
    );
  const collected = invoices
    .filter((invoice) => invoice.status === 'payee')
    .reduce((sum, invoice) => sum + invoice.totals.duePayable, 0);

  const view = fromHtml(html`
    <div class="screen">
      <header class="screen__head">
        <div class="row row--between">
          <h1>Factures</h1>
          <button type="button" class="button button--xs button--link" data-goto="espace">
            Retour aux missions
          </button>
        </div>
        <p class="text-muted">
          Facturez vos missions livrées et transmettez-les à votre plateforme agréée.
        </p>
      </header>

      ${settingsBannerMarkup(settings)}

      <section class="stat-grid">
        <div class="stat">
          <span class="stat__label">Encaissé</span>
          <span class="stat__value">${formatEuroRounded(collected)}</span>
        </div>
        <div class="stat">
          <span class="stat__label">Reste à encaisser</span>
          <span class="stat__value">${formatEuroRounded(outstanding)}</span>
        </div>
      </section>

      ${groupPanelMarkup(groups)}

      ${platformPanelMarkup(settings, pending.length)}

      <section class="section">
        <h2>Toutes les factures</h2>
        ${invoices.length === 0
          ? emptyState({
              title: 'Aucune facture émise',
              text: 'Marquez une mission comme livrée puis utilisez le bouton Facturer pour créer sa facture.',
              actionLabel: 'Voir les missions',
              actionAttribute: 'data-goto="espace"',
            })
          : invoices.map((invoice) => invoiceCard(invoice, creditNotes)).join('')}
      </section>

      ${creditNotes.length === 0
        ? ''
        : html`
            <section class="section">
              <h2>Avoirs émis</h2>
              ${creditNotes.map(creditNoteCard).join('')}
            </section>
          `}

      ${backupPanelMarkup(state)}

      ${settingsSummaryMarkup(settings)}
    </div>
  `);

  const findInvoice = (invoiceId) => invoices.find((invoice) => invoice.id === invoiceId);
  const findCreditNote = (noteId) => creditNotes.find((note) => note.id === noteId);

  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));
  bindSettingsBanner(view, refresh);
  bindBackupPanel(view, refresh);

  onClick(view, '[data-preview]', (target) => {
    const invoice = findInvoice(target.dataset.preview);
    if (invoice) openSheet(`Facture ${invoice.number}`, invoiceDocumentMarkup(invoice));
  });

  onClick(view, '[data-print]', (target) => {
    const invoice = findInvoice(target.dataset.print);
    if (!invoice) return;
    if (!printInvoice(invoice)) {
      showToast('Autorisez les fenêtres surgissantes pour imprimer la facture en PDF.', 'danger');
    }
  });

  onClick(view, '[data-xml]', (target) => {
    const invoice = findInvoice(target.dataset.xml);
    if (!invoice) return;
    if (missingSettings(settings).length > 0) {
      showToast('Complétez les réglages de l’entreprise avant de générer le Factur-X.', 'danger');
      return;
    }
    downloadFile(facturXFileName(invoice), buildFacturXXml(invoice), 'application/xml');
    showToast(`Fichier Factur-X de ${invoice.number} téléchargé.`);
  });

  onClick(view, '[data-credit]', (target) => {
    const invoice = findInvoice(target.dataset.credit);
    if (invoice) openCreditNoteSheet(invoice, refresh);
  });

  onClick(view, '[data-preview-credit]', (target) => {
    const note = findCreditNote(target.dataset.previewCredit);
    if (note) openSheet(`Avoir ${note.number}`, invoiceDocumentMarkup(note));
  });

  onClick(view, '[data-print-credit]', (target) => {
    const note = findCreditNote(target.dataset.printCredit);
    if (!note) return;
    if (!printInvoice(note)) {
      showToast('Autorisez les fenêtres surgissantes pour imprimer l’avoir en PDF.', 'danger');
    }
  });

  onClick(view, '[data-xml-credit]', (target) => {
    const note = findCreditNote(target.dataset.xmlCredit);
    if (!note) return;
    downloadFile(facturXFileName(note), buildFacturXXml(note), 'application/xml');
    showToast(`Fichier Factur-X de l’avoir ${note.number} téléchargé.`);
  });

  onClick(view, '[data-group-invoice]', (target) => {
    if (missingSettings(settings).length > 0) {
      showToast('Complétez les réglages de l’entreprise avant de facturer.', 'danger');
      return;
    }
    const ids = target.dataset.groupInvoice.split('|');
    const missions = (getState().missions ?? []).filter((mission) => ids.includes(mission.id));
    const invoice = createInvoiceForMissions(missions);
    showToast(`Facture ${invoice.number} créée pour ${missions.length} mission(s).`);
    refresh();
  });
  onClick(view, '[data-abby]', async (target) => {
    const invoice = findInvoice(target.dataset.abby);
    if (!invoice) return;
    if (!isSignedIn()) {
      showToast('Connectez-vous dans l’Espace convoyeur avant de transmettre à Abby.', 'danger');
      return;
    }
    target.disabled = true;
    showToast(`Transmission de ${invoice.number} à Abby…`);
    const { data, error } = await transmitInvoiceToAbby(invoice);
    if (error) {
      target.disabled = false;
      showToast(error, 'danger');
      return;
    }
    updateInvoice(invoice.id, { abbyBillingId: data.abbyBillingId });
    advanceInvoiceStatus(invoice.id, 'transmise');
    showToast(`Facture ${invoice.number} créée en brouillon dans Abby. Finalisez-la depuis votre compte Abby.`);
    refresh();
  });

  onClick(view, '[data-advance-invoice]', (target) => {
    advanceInvoiceStatus(target.dataset.advanceInvoice, target.dataset.next);
    showToast(`Facture ${invoiceStatusById(target.dataset.next).label.toLowerCase()}.`);
    refresh();
  });

  onClick(view, '[data-export-batch]', () => {
    if (pending.length === 0) {
      showToast('Aucune facture en attente de transmission.', 'danger');
      return;
    }
    if (missingSettings(settings).length > 0) {
      showToast('Complétez les réglages de l’entreprise avant de générer le lot.', 'danger');
      return;
    }
    pending.forEach((invoice, index) => {
      window.setTimeout(
        () => downloadFile(facturXFileName(invoice), buildFacturXXml(invoice), 'application/xml'),
        index * 300,
      );
    });
    showToast(`${pending.length} fichier(s) Factur-X en téléchargement.`);
  });

  const statusLegend = INVOICE_STATUSES.map((status) => status.label).join(' · ');
  view.querySelector('.section')?.setAttribute('aria-description', statusLegend);

  return view;
};
