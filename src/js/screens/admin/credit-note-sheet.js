import { escapeHtml, html, icon, onChange, onClick } from '../../core/dom.js';
import { formatEuro } from '../../core/format.js';
import { openSheet, showToast } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import {
  CREDIT_REASONS,
  createCreditNote,
  remainingCreditable,
} from '../../domain/credit-note.js';

export const openCreditNoteSheet = (invoice, onCreated) => {
  const creditNotes = getState().creditNotes ?? [];
  const remaining = remainingCreditable(invoice, creditNotes);

  if (remaining <= 0.01) {
    showToast(`La facture ${invoice.number} est déjà entièrement créditée.`, 'danger');
    return null;
  }

  const sheet = openSheet(
    `Avoir sur ${invoice.number}`,
    html`
      <form class="stack-lg" data-credit-form novalidate>
        <p class="text-small text-muted">
          Une facture émise ne se modifie pas : on émet un avoir qui l’annule en tout ou partie.
          L’avoir porte sa propre numérotation et référence la facture d’origine.
        </p>

        <div class="card card--flat">
          <div class="price-summary__line">
            <span class="text-muted">Montant de la facture</span>
            <span class="text-muted">${formatEuro(invoice.totals.duePayable)}</span>
          </div>
          <div class="price-summary__line price-summary__line--total">
            <span>Reste créditable</span>
            <span>${formatEuro(remaining)}</span>
          </div>
        </div>

        <div class="field">
          <span class="field__label">Étendue de l’avoir</span>
          <div class="option-list">
            <label class="option option--selected">
              <input type="radio" name="scope" value="total" checked />
              <span class="option__body">
                <span class="option__label">Avoir total</span>
                <span class="text-small text-muted">
                  Annule la totalité, soit ${formatEuro(remaining)}
                </span>
              </span>
            </label>
            <label class="option">
              <input type="radio" name="scope" value="partiel" />
              <span class="option__body">
                <span class="option__label">Avoir partiel</span>
                <span class="text-small text-muted">Vous saisissez le montant à créditer</span>
              </span>
            </label>
          </div>
        </div>

        <div class="field" data-amount-field hidden>
          <label class="field__label" for="creditAmount">Montant à créditer</label>
          <input
            class="input"
            id="creditAmount"
            name="amount"
            type="number"
            min="0.01"
            max="${remaining}"
            step="0.01"
            inputmode="decimal"
          />
          <p class="field__hint">Au maximum ${formatEuro(remaining)}.</p>
        </div>

        <div class="field">
          <label class="field__label" for="creditReason">Motif de l’avoir</label>
          <select class="select" id="creditReason" name="reasonId">
            ${CREDIT_REASONS.map(
              (reason) => html`<option value="${reason.id}">${escapeHtml(reason.label)}</option>`,
            )}
          </select>
        </div>

        <div class="field" data-custom-reason hidden>
          <label class="field__label" for="customReason">Précisez le motif</label>
          <input class="input" id="customReason" name="customReason" type="text" />
        </div>

        <p class="field__error" data-credit-error hidden></p>

        <button type="submit" class="button button--m button--primary button--full">
          ${icon('receipt', 24)} Émettre l’avoir
        </button>
      </form>
    `,
  );

  const root = sheet.element;
  const amountField = root.querySelector('[data-amount-field]');
  const customReasonField = root.querySelector('[data-custom-reason]');
  const errorLine = root.querySelector('[data-credit-error]');

  onChange(root, 'input[name="scope"]', () => {
    const isPartial = root.querySelector('input[name="scope"]:checked').value === 'partiel';
    amountField.hidden = !isPartial;
    root.querySelectorAll('.option').forEach((option) => {
      option.classList.toggle('option--selected', option.querySelector('input').checked);
    });
    if (isPartial) root.querySelector('#creditAmount').focus();
  });

  onChange(root, '#creditReason', () => {
    customReasonField.hidden = root.querySelector('#creditReason').value !== 'autre';
  });

  onClick(root, '[data-sheet-close]', () => {});

  root.querySelector('[data-credit-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const isPartial = data.scope === 'partiel';
    const amount = isPartial ? Number(data.amount) : remaining;

    if (isPartial && (!Number.isFinite(amount) || amount <= 0)) {
      errorLine.hidden = false;
      errorLine.innerHTML = `${icon('alert', 16)} Saisissez le montant à créditer, supérieur à zéro.`;
      root.querySelector('#creditAmount').focus();
      return;
    }
    if (isPartial && amount > remaining + 0.01) {
      errorLine.hidden = false;
      errorLine.innerHTML = `${icon('alert', 16)} Le montant dépasse le reste créditable de ${formatEuro(remaining)}. Réduisez-le.`;
      root.querySelector('#creditAmount').focus();
      return;
    }

    const selected = CREDIT_REASONS.find((reason) => reason.id === data.reasonId);
    const reason =
      data.reasonId === 'autre' && String(data.customReason ?? '').trim()
        ? String(data.customReason).trim()
        : selected.label;

    const note = createCreditNote(invoice, { reason, amount, isPartial });
    sheet.close();
    showToast(`Avoir ${note.number} émis pour ${formatEuro(note.totals.duePayable)}.`);
    onCreated?.(note);
  });

  return sheet;
};
