import { escapeHtml, html } from '../core/dom.js';
import { formatDateTime } from '../core/format.js';
import { CHECKLIST_ITEMS } from '../domain/mission.js';

export const pvTitle = (stage) =>
  stage === 'departure' ? 'Procès-verbal de prise en charge' : 'Procès-verbal de livraison';

const photoSource = (entry) => (typeof entry === 'string' ? entry : entry?.url ?? '');

export const pvMarkup = (mission, stage) => {
  const report = stage === 'departure' ? mission.departureReport : mission.arrivalReport;
  if (!report) return html`<p class="text-muted">Procès-verbal non établi.</p>`;
  return html`
    <article class="invoice-document">
      <header class="invoice-document__head">
        <div>
          <h2>${pvTitle(stage)}</h2>
          <p>Convoyage ${escapeHtml(mission.reference ?? '')} — établi le ${formatDateTime(report.completedAt)}</p>
          <p>${escapeHtml(mission.departure ?? '')} vers ${escapeHtml(mission.arrival ?? '')}</p>
        </div>
      </header>

      <dl class="invoice-document__meta">
        <div>
          <dt>Véhicule</dt>
          <dd>
            ${escapeHtml(mission.vehicleModel?.trim() || mission.quote?.vehicle?.label || 'À préciser')}
            ${mission.plate ? ` — ${escapeHtml(mission.plate)}` : ''}
          </dd>
        </div>
        <div>
          <dt>Kilométrage</dt>
          <dd>${Number(report.mileage ?? 0).toLocaleString('fr-FR')} km</dd>
        </div>
        <div>
          <dt>Carburant</dt>
          <dd>${escapeHtml(report.fuelLevel ?? '—')}</dd>
        </div>
      </dl>

      <section class="invoice-document__section">
        <h3>Points de contrôle</h3>
        <ul>
          ${CHECKLIST_ITEMS.map(
            (item) => html`
              <li>${report.checklist?.[item.id] ? '✔' : '✘'} ${escapeHtml(item.label)}</li>
            `,
          ).join('')}
        </ul>
      </section>

      <section class="invoice-document__section">
        <h3>Réserves et dommages constatés</h3>
        <p>${escapeHtml(report.damages?.trim() || 'Aucune réserve.')}</p>
      </section>

      ${(report.photos ?? []).length > 0
        ? html`
            <section class="invoice-document__section">
              <h3>Photographies horodatées (${report.photos.length})</h3>
              <div class="photo-grid">
                ${report.photos
                  .map(
                    (entry, index) => html`
                      <div class="photo-grid__item">
                        <img src="${photoSource(entry)}" alt="Photo ${index + 1} du véhicule" />
                      </div>
                    `,
                  )
                  .join('')}
              </div>
            </section>
          `
        : ''}

      <section class="invoice-document__section">
        <h3>Signature</h3>
        ${report.signature
          ? html`<img src="${report.signature}" alt="Signature" style="max-width: 240px; background: #ffffff; border-radius: 8px;" />`
          : html`<p>Signature non recueillie.</p>`}
        <p>${escapeHtml(report.signatoryName?.trim() || 'Signataire non précisé')}</p>
      </section>
    </article>
  `;
};

export const printPv = (mission, stage) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')]
    .map((node) => node.outerHTML)
    .join('');
  printWindow.document.write(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${pvTitle(stage)} ${escapeHtml(mission.reference ?? '')}</title>${styles}</head><body class="print-body">${pvMarkup(mission, stage)}</body></html>`,
  );
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 400);
  return true;
};
