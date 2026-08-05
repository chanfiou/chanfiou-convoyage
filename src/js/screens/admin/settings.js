import { escapeHtml, html, icon, onClick } from '../../core/dom.js';
import { fromHtml, showToast } from '../../core/ui.js';
import { openSheet } from '../../core/ui.js';
import { isSiretValid, getSettings, missingSettings, saveSettings } from '../../config/settings.js';
import { VAT_EXEMPTION_MENTION } from '../../config/pricing.js';

const FIELDS = [
  { id: 'legalName', label: 'Raison sociale', required: true },
  { id: 'legalForm', label: 'Forme juridique', required: false },
  { id: 'siret', label: 'Numéro de SIRET', required: true, hint: '14 chiffres, figurant sur votre Kbis', inputmode: 'numeric' },
  { id: 'addressLine', label: 'Adresse', required: true },
  { id: 'postalCode', label: 'Code postal', required: true, inputmode: 'numeric' },
  { id: 'city', label: 'Ville', required: true },
  { id: 'phone', label: 'Téléphone', required: false, type: 'tel' },
  { id: 'email', label: 'Adresse électronique', required: true, type: 'email' },
  { id: 'iban', label: 'IBAN', required: false, hint: 'Apparaît sur la facture pour le virement' },
  { id: 'bic', label: 'BIC', required: false },
  { id: 'paymentTermDays', label: 'Délai de paiement en jours', required: false, type: 'number' },
  { id: 'platformAccountReference', label: 'Identifiant de votre compte plateforme', required: false, hint: 'Pour retrouver vos dépôts, facultatif' },
  { id: 'adminAccessCode', label: 'Code d’accès à cet espace', required: true },
];

const fieldMarkup = (field, value) => html`
  <div class="field">
    <label class="field__label" for="setting-${field.id}">
      ${escapeHtml(field.label)}${field.required ? '' : ' (facultatif)'}
    </label>
    <input
      class="input"
      id="setting-${field.id}"
      name="${field.id}"
      type="${field.type ?? 'text'}"
      ${field.inputmode ? `inputmode="${field.inputmode}"` : ''}
      value="${escapeHtml(value ?? '')}"
    />
    ${field.hint ? html`<p class="field__hint">${escapeHtml(field.hint)}</p>` : ''}
  </div>
`;

export const settingsBannerMarkup = (settings) => {
  const missing = missingSettings(settings);
  if (missing.length === 0) return '';
  return html`
    <div class="error-state" role="alert">
      ${icon('alert', 24)}
      <div class="stack-sm">
        <h2 class="card-title">Vos factures ne sont pas encore valides</h2>
        <p>
          Il manque ${missing.length} information(s) obligatoire(s) sur l’émetteur. Complétez les
          réglages avant d’émettre une facture.
        </p>
      </div>
      <button type="button" class="button button--s button--stroke" data-open-settings>
        Compléter les réglages
      </button>
    </div>
  `;
};

export const openSettingsSheet = (onSaved) => {
  const settings = getSettings();

  const sheet = openSheet(
    'Réglages de l’entreprise',
    html`
      <form class="stack-lg" data-settings-form>
        <p class="text-small text-muted">
          Ces informations figurent sur chaque facture et dans le fichier transmis à la plateforme
          agréée. Régime de TVA appliqué : ${escapeHtml(VAT_EXEMPTION_MENTION)}.
        </p>
        ${FIELDS.map((field) => fieldMarkup(field, settings[field.id]))}
        <p class="field__error" data-settings-error hidden></p>
        <button type="submit" class="button button--m button--primary button--full">
          ${icon('check', 24)} Enregistrer les réglages
        </button>
      </form>
    `,
  );

  const root = sheet.element;
  const errorLine = root.querySelector('[data-settings-error]');

  root.querySelector('[data-settings-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const missing = FIELDS.filter(
      (field) => field.required && !String(data[field.id] ?? '').trim(),
    );

    root.querySelectorAll('.input').forEach((element) => element.removeAttribute('aria-invalid'));

    if (missing.length > 0) {
      missing.forEach((field) =>
        root.querySelector(`#setting-${field.id}`)?.setAttribute('aria-invalid', 'true'),
      );
      errorLine.hidden = false;
      errorLine.innerHTML = `${icon('alert', 16)} Renseignez ${missing.map((field) => field.label.toLowerCase()).join(', ')} pour que vos factures soient conformes.`;
      root.querySelector(`#setting-${missing[0].id}`)?.focus();
      return;
    }

    if (!isSiretValid(data.siret)) {
      root.querySelector('#setting-siret').setAttribute('aria-invalid', 'true');
      errorLine.hidden = false;
      errorLine.innerHTML = `${icon('alert', 16)} Ce SIRET est invalide. Recopiez les 14 chiffres exactement comme sur votre Kbis.`;
      root.querySelector('#setting-siret').focus();
      return;
    }

    saveSettings(data);
    sheet.close();
    showToast('Réglages enregistrés.');
    onSaved?.();
  });

  return sheet;
};

export const bindSettingsBanner = (root, onSaved) => {
  onClick(root, '[data-open-settings]', () => openSettingsSheet(onSaved));
};

export const settingsSummaryMarkup = (settings) => html`
  <section class="card card--flat">
    <div class="row row--between">
      <h2 class="card-title">Émetteur des factures</h2>
      <button type="button" class="button button--xs button--link" data-open-settings>
        Modifier
      </button>
    </div>
    <ul class="stack-sm text-small text-muted">
      <li>${escapeHtml(settings.legalName)} — ${escapeHtml(settings.legalForm)}</li>
      <li>SIRET ${escapeHtml(settings.siret || 'à renseigner')}</li>
      <li>
        ${escapeHtml(settings.addressLine || 'Adresse à renseigner')},
        ${escapeHtml(settings.postalCode)} ${escapeHtml(settings.city)}
      </li>
      <li>${escapeHtml(VAT_EXEMPTION_MENTION)}</li>
    </ul>
  </section>
`;

export const renderSettingsScreen = () =>
  fromHtml(html`<div class="screen">${settingsSummaryMarkup(getSettings())}</div>`);
