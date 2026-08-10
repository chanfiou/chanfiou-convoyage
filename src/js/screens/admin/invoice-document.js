import { escapeHtml, html } from '../../core/dom.js';
import { formatDate, formatEuro } from '../../core/format.js';
import { showsVatLines, vatRatePercent } from '../../domain/vat.js';
import { MEDIATION } from '../../config/company.js';

const lineRow = (line) => html`
  <tr>
    <td>${escapeHtml(line.description)}</td>
    <td class="numeric">${escapeHtml(line.quantity)}</td>
    <td class="numeric">${formatEuro(line.unitPrice)}</td>
    <td class="numeric">${formatEuro(line.quantity * line.unitPrice)}</td>
  </tr>
`;

export const invoiceDocumentMarkup = (invoice) => {
  const isCredit = invoice.documentType === 'avoir';
  return html`
  <article class="invoice-document">
    <header class="invoice-document__head">
      <div>
        <h2>${isCredit ? 'Avoir' : 'Facture'} ${escapeHtml(invoice.number)}</h2>
        <p>
          Émis${isCredit ? '' : 'e'} le ${formatDate(invoice.issuedAt)}${isCredit ? '' : ` — échéance le ${formatDate(invoice.dueAt)}`}
        </p>
        ${isCredit
          ? html`<p>
              Annule ${invoice.isPartial ? 'partiellement ' : ''}la facture
              ${escapeHtml(invoice.invoiceNumber)} du ${formatDate(invoice.invoiceIssuedAt)}
            </p>
            <p>Motif : ${escapeHtml(invoice.reason)}</p>`
          : html`<p>Référence de mission : ${escapeHtml(invoice.missionReference)}</p>`}
      </div>
      <div class="invoice-document__total">
        <span>${isCredit ? 'Montant de l’avoir' : 'Net à payer'}</span>
        <strong>${formatEuro(invoice.totals.duePayable)}</strong>
      </div>
    </header>

    <div class="invoice-document__parties">
      <section>
        <h3>Émetteur</h3>
        <p><strong>${escapeHtml(invoice.seller.name)}</strong></p>
        <p>${escapeHtml(invoice.seller.legalForm)}</p>
        <p>${escapeHtml(invoice.seller.addressLine)}</p>
        <p>${escapeHtml(invoice.seller.postalCode)} ${escapeHtml(invoice.seller.city)}</p>
        <p>SIRET ${escapeHtml(invoice.seller.siret)}</p>
        ${invoice.seller.email ? html`<p>${escapeHtml(invoice.seller.email)}</p>` : ''}
        ${invoice.seller.phone ? html`<p>${escapeHtml(invoice.seller.phone)}</p>` : ''}
      </section>
      <section>
        <h3>Client</h3>
        <p><strong>${escapeHtml(invoice.buyer.name)}</strong></p>
        ${invoice.buyer.siren ? html`<p>SIREN ${escapeHtml(invoice.buyer.siren)}</p>` : ''}
        ${invoice.buyer.addressLine ? html`<p>${escapeHtml(invoice.buyer.addressLine)}</p>` : ''}
        ${invoice.buyer.postalCode || invoice.buyer.city
          ? html`<p>${escapeHtml(invoice.buyer.postalCode)} ${escapeHtml(invoice.buyer.city)}</p>`
          : ''}
        ${invoice.buyer.email ? html`<p>${escapeHtml(invoice.buyer.email)}</p>` : ''}
      </section>
    </div>

    <dl class="invoice-document__meta">
      <div><dt>Nature de l’opération</dt><dd>${escapeHtml(invoice.operationNature)}</dd></div>
      <div><dt>Adresse de livraison</dt><dd>${escapeHtml(invoice.deliveryAddress)}</dd></div>
      <div><dt>Date de la prestation</dt><dd>${formatDate(invoice.deliveredAt)}</dd></div>
    </dl>

    <table class="invoice-document__lines">
      <thead>
        <tr>
          <th scope="col">Désignation</th>
          <th scope="col" class="numeric">Qté</th>
          <th scope="col" class="numeric">Prix unitaire</th>
          <th scope="col" class="numeric">Montant</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.lines.map(lineRow)}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colspan="3">Sous-total</th>
          <td class="numeric">${formatEuro(invoice.totals.lineTotal)}</td>
        </tr>
        ${(invoice.allowances ?? []).map(
          (allowance) => html`
            <tr>
              <th scope="row" colspan="3">${escapeHtml(allowance.reason)}</th>
              <td class="numeric">−${formatEuro(allowance.amount)}</td>
            </tr>
          `,
        )}
        <tr>
          <th scope="row" colspan="3">Total ${showsVatLines ? 'hors taxes' : 'net de taxe'}</th>
          <td class="numeric">${formatEuro(invoice.totals.taxBasis)}</td>
        </tr>
        ${showsVatLines
          ? html`
              <tr>
                <th scope="row" colspan="3">TVA ${vatRatePercent} %</th>
                <td class="numeric">${formatEuro(invoice.totals.taxAmount)}</td>
              </tr>
            `
          : ''}
        <tr class="invoice-document__grand">
          <th scope="row" colspan="3">${isCredit ? 'Montant de l’avoir' : 'Net à payer'}</th>
          <td class="numeric">${formatEuro(invoice.totals.duePayable)}</td>
        </tr>
      </tfoot>
    </table>

    <section class="invoice-document__notes">
      <p><strong>${escapeHtml(invoice.vatMention)}</strong></p>
      <p>
        ${escapeHtml(invoice.paymentTerms)}${isCredit ? '.' : `, soit au plus tard le ${formatDate(invoice.dueAt)}.`}
      </p>
      ${invoice.seller.iban
        ? html`<p>
            Virement sur ${escapeHtml(invoice.seller.iban)}
            ${invoice.seller.bic ? `— BIC ${escapeHtml(invoice.seller.bic)}` : ''}. Référence à
            rappeler : ${escapeHtml(invoice.number)}.
          </p>`
        : ''}
      ${invoice.latePenaltyMention ? html`<p>${escapeHtml(invoice.latePenaltyMention)}</p>` : ''}
      ${invoice.recoveryIndemnityMention ? html`<p>${escapeHtml(invoice.recoveryIndemnityMention)}</p>` : ''}
      ${invoice.noDiscountMention ? html`<p>${escapeHtml(invoice.noDiscountMention)}</p>` : ''}
      <p>
        Médiation de la consommation : ${escapeHtml(MEDIATION.name)},
        ${escapeHtml(MEDIATION.addressLine)}, ${escapeHtml(MEDIATION.postalCode)}
        ${escapeHtml(MEDIATION.city)} — ${escapeHtml(MEDIATION.website)}.
      </p>
    </section>
  </article>
`;
};

export const printInvoice = (invoice) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')]
    .map((node) => node.outerHTML)
    .join('');

  const label = invoice.documentType === 'avoir' ? 'Avoir' : 'Facture';
  printWindow.document.write(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${label} ${escapeHtml(invoice.number)}</title>${styles}</head><body class="print-body">${invoiceDocumentMarkup(invoice)}</body></html>`,
  );
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 400);
  return true;
};
