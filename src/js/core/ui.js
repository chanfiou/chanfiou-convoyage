import { escapeHtml, html, icon } from './dom.js';

const TOAST_DURATION_MS = 3200;

let activeToastTimer = null;

export const showToast = (message, tone = 'success') => {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  if (activeToastTimer) window.clearTimeout(activeToastTimer);

  const toast = document.createElement('div');
  toast.className = `toast toast--${tone}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = html`
    ${icon(tone === 'danger' ? 'alert' : 'check', 20)}
    <span>${escapeHtml(message)}</span>
  `;
  document.body.append(toast);
  activeToastTimer = window.setTimeout(() => toast.remove(), TOAST_DURATION_MS);
};

export const openSheet = (title, bodyHtml) => {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = html`
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header class="sheet__head">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="button-icon" data-sheet-close aria-label="Fermer">
          ${icon('close', 24)}
        </button>
      </header>
      <div class="sheet__body">${bodyHtml}</div>
    </section>
  `;

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('[data-sheet-close]')) close();
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') close();
    },
    { once: true },
  );

  document.body.append(backdrop);
  return { element: backdrop, close };
};

export const emptyState = ({ title, text, actionLabel, actionAttribute }) => html`
  <div class="empty-state">
    ${icon('inbox', 24)}
    <div class="stack-sm">
      <h4>${escapeHtml(title)}</h4>
      <p class="text-muted">${escapeHtml(text)}</p>
    </div>
    ${actionLabel
      ? html`<button type="button" class="button button--s button--stroke" ${actionAttribute}>
          ${escapeHtml(actionLabel)}
        </button>`
      : ''}
  </div>
`;

export const errorState = ({ title, text, actionLabel, actionAttribute }) => html`
  <div class="error-state" role="alert">
    ${icon('alert', 24)}
    <div class="stack-sm">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(text)}</p>
    </div>
    ${actionLabel
      ? html`<button type="button" class="button button--s button--stroke" ${actionAttribute}>
          ${escapeHtml(actionLabel)}
        </button>`
      : ''}
  </div>
`;

export const skeletonBlock = (lines = 3) => html`
  <div class="card" aria-hidden="true">
    ${Array.from({ length: lines }, (_, index) =>
      html`<div class="skeleton" style="width: ${100 - index * 12}%"></div>`,
    )}
  </div>
`;

export const fromHtml = (markup) => {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
};
