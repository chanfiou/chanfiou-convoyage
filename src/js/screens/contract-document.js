import { escapeHtml, html } from '../core/dom.js';
import { formatDate, formatDateTime, formatDistance, formatEuro } from '../core/format.js';
import { getSettings } from '../config/settings.js';
import { COMPANY, PAYMENT } from '../config/company.js';
import { TOTAL_LABEL } from '../domain/vat.js';

export const contractMarkup = (mission) => {
  const settings = getSettings();
  const quote = mission.quote ?? {};
  return html`
    <article class="invoice-document">
      <header class="invoice-document__head">
        <div>
          <h2>Contrat de convoyage ${escapeHtml(mission.reference ?? '')}</h2>
          <p>Établi le ${formatDate(mission.createdAt ?? new Date().toISOString())}</p>
          <p>Conditions générales de convoyage acceptées en ligne.</p>
        </div>
        <div class="invoice-document__total">
          <span>Prix ${escapeHtml(TOTAL_LABEL.toLowerCase())}</span>
          <strong>${formatEuro(quote.totalIncludingVat ?? 0)}</strong>
        </div>
      </header>

      <div class="invoice-document__parties">
        <section>
          <h3>Le convoyeur</h3>
          <p><strong>${escapeHtml(settings.legalName)}</strong></p>
          <p>${escapeHtml(settings.legalForm)}</p>
          <p>${escapeHtml(settings.addressLine)}</p>
          <p>${escapeHtml(settings.postalCode)} ${escapeHtml(settings.city)}</p>
          <p>SIRET ${escapeHtml(settings.siret)}</p>
          <p>${escapeHtml(COMPANY.phone)} — ${escapeHtml(COMPANY.email)}</p>
        </section>
        <section>
          <h3>Le client</h3>
          <p><strong>${escapeHtml(mission.company?.trim() || mission.contactName || 'À préciser')}</strong></p>
          ${mission.company?.trim() && mission.contactName
            ? html`<p>Représenté par ${escapeHtml(mission.contactName)}</p>`
            : ''}
          ${mission.buyerSiren ? html`<p>SIREN ${escapeHtml(mission.buyerSiren)}</p>` : ''}
          ${mission.contactPhone ? html`<p>${escapeHtml(mission.contactPhone)}</p>` : ''}
          ${mission.contactEmail ? html`<p>${escapeHtml(mission.contactEmail)}</p>` : ''}
        </section>
      </div>

      <dl class="invoice-document__meta">
        <div>
          <dt>Véhicule</dt>
          <dd>
            ${escapeHtml(mission.vehicleModel?.trim() || quote.vehicle?.label || 'À préciser')}
            ${mission.plate ? ` — ${escapeHtml(mission.plate)}` : ''}
          </dd>
        </div>
        <div>
          <dt>Trajet</dt>
          <dd>
            ${escapeHtml(mission.departure ?? '')} vers ${escapeHtml(mission.arrival ?? '')}
            (${formatDistance(quote.kilometers ?? 0)})
          </dd>
        </div>
        <div>
          <dt>Prise en charge</dt>
          <dd>
            ${mission.pickupDate ? formatDate(mission.pickupDate) : 'À convenir'}
            ${mission.pickupAddress ? ` — ${escapeHtml(mission.pickupAddress)}` : ''}
          </dd>
        </div>
        <div>
          <dt>Livraison</dt>
          <dd>${escapeHtml(mission.dropAddress?.trim() || mission.arrival || 'À convenir')}</dd>
        </div>
      </dl>

      <section class="invoice-document__section">
        <h3>Conditions essentielles</h3>
        <p>
          Prix ferme incluant péages, carburant et assurance (véhicule confié garanti
          ${COMPANY.insurance.coverage.toLocaleString('fr-FR')} € par sinistre). TVA non
          applicable, article 293 B du CGI. Prestation payable avant le départ par virement au
          bénéfice de ${escapeHtml(PAYMENT.holder)}. Procès-verbaux contradictoires de prise en
          charge et de livraison, avec photographies horodatées et signatures ; réserves à
          formuler au plus tard 48 heures après la livraison. Convoyage exécuté personnellement,
          sans sous-traitance. Les conditions générales publiées sur
          chanfiou-convoyage.fr/#/conditions font partie intégrante du présent contrat.
        </p>
      </section>

      <section class="invoice-document__section">
        <h3>Acceptation et signature</h3>
        <p>
          ${mission.termsAcceptedAt
            ? `Conditions acceptées en ligne par le client le ${formatDateTime(mission.termsAcceptedAt)}${
                mission.termsVersion ? ` (version ${escapeHtml(mission.termsVersion)})` : ''
              }, lors de l’envoi de la demande ${escapeHtml(mission.reference ?? '')}.`
            : 'Acceptation recueillie lors de la commande.'}
          Les procès-verbaux signés de prise en charge et de livraison sont annexés au présent
          contrat.
        </p>
        ${mission.contractSignedAt
          ? html`
              <p>
                Contrat signé électroniquement le ${formatDateTime(mission.contractSignedAt)} par
                ${escapeHtml(mission.contractSignatoryName ?? 'le client')}.
              </p>
              ${mission.contractSignature
                ? html`<img
                    src="${escapeHtml(mission.contractSignature)}"
                    alt="Signature du client"
                    style="max-width: 240px; background: #ffffff; border-radius: 8px;"
                  />`
                : ''}
            `
          : html`<p>En attente de la signature du client.</p>`}
      </section>
    </article>
  `;
};

export const printContract = (mission) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')]
    .map((node) => node.outerHTML)
    .join('');
  printWindow.document.write(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Contrat ${escapeHtml(mission.reference ?? '')}</title>${styles}</head><body class="print-body">${contractMarkup(mission)}</body></html>`,
  );
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 400);
  return true;
};
