import { escapeHtml, html, icon, onClick } from '../../core/dom.js';
import { formatDateTime } from '../../core/format.js';
import { showToast } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import {
  BACKUP_STALE_DAYS,
  applyBackup,
  backupFileName,
  currentBackup,
  daysSinceBackup,
  isBackupStale,
  markBackupDone,
  parseBackup,
} from '../../domain/backup.js';
import { fetchBackup, isSignedIn } from '../../data/api.js';

const downloadJson = (fileName, content) => {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const backupPanelMarkup = (state) => {
  const missionCount = (state.missions ?? []).length;
  const stale = isBackupStale(state.lastBackupAt, missionCount);
  const days = daysSinceBackup(state.lastBackupAt);

  return html`
    <section class="card ${stale ? 'card--accent' : 'card--flat'}">
      <div class="row row--between">
        <h2 class="card-title">Sauvegarde de vos données</h2>
        ${stale
          ? html`<span class="chip chip--status chip--progress">À faire</span>`
          : html`<span class="chip chip--status chip--success">${icon('check', 16)} À jour</span>`}
      </div>

      <p class="text-small text-muted">
        Tant que vous êtes connecté, vos factures, avoirs et réglages sont sauvegardés
        automatiquement sur votre serveur toutes les quinze minutes. Vos factures devant être
        conservées dix ans, gardez en plus une copie hors ligne de temps en temps.
      </p>

      <p class="text-small ${stale ? 'text-accent' : 'text-muted'}">
        ${state.lastBackupAt
          ? `Dernière sauvegarde le ${formatDateTime(state.lastBackupAt)}${days >= 1 ? `, il y a ${days} jour(s)` : ''}.`
          : missionCount === 0
            ? 'Aucune donnée à sauvegarder pour le moment.'
            : `Aucune sauvegarde effectuée. Faites-la maintenant, vous avez ${missionCount} mission(s) enregistrée(s).`}
      </p>

      <div class="row row--wrap">
        <button type="button" class="button button--s button--primary" data-backup-export>
          ${icon('download', 24)} Sauvegarder maintenant
        </button>
        <label class="button button--s button--stroke">
          ${icon('inbox', 24)} Restaurer un fichier
          <input class="visually-hidden" type="file" accept="application/json,.json" data-backup-import />
        </label>
        <button type="button" class="button button--s button--stroke" data-backup-restore-server>
          ${icon('route', 24)} Restaurer depuis le serveur
        </button>
      </div>

      <p class="text-small text-muted">
        Rappel : une sauvegarde de plus de ${BACKUP_STALE_DAYS} jours est signalée ici. La
        restauration remplace toutes les données de cet appareil.
      </p>
    </section>
  `;
};

export const bindBackupPanel = (root, onRestored) => {
  onClick(root, '[data-backup-export]', () => {
    const state = getState();
    if ((state.missions ?? []).length === 0 && (state.invoices ?? []).length === 0) {
      showToast('Aucune donnée à sauvegarder pour le moment.', 'danger');
      return;
    }
    const { backup, exportedAt } = currentBackup();
    downloadJson(backupFileName(exportedAt), JSON.stringify(backup, null, 2));
    markBackupDone(exportedAt);
    showToast(
      `Sauvegarde de ${backup.counts.missions} mission(s) et ${backup.counts.invoices} facture(s) téléchargée.`,
    );
    onRestored?.();
  });

  onClick(root, '[data-backup-restore-server]', async (target) => {
    if (!isSignedIn()) {
      showToast('Connectez-vous pour récupérer la sauvegarde du serveur.', 'danger');
      return;
    }
    target.disabled = true;
    const { data, error } = await fetchBackup();
    target.disabled = false;
    if (error) {
      showToast(error, 'danger');
      return;
    }
    if (!data || data.backup === null || !data.data) {
      showToast('Aucune sauvegarde automatique disponible sur le serveur pour le moment.', 'danger');
      return;
    }
    const summary = applyBackup(data);
    showToast(
      `Sauvegarde du ${formatDateTime(data.savedAt ?? data.exportedAt)} restaurée : ${summary.missions} mission(s), ${summary.invoices} facture(s), ${summary.creditNotes} avoir(s).`,
    );
    onRestored?.();
  });

  const input = root.querySelector('[data-backup-import]');
  if (!input) return;

  input.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    let rawText;
    try {
      rawText = await file.text();
    } catch {
      showToast('Ce fichier n’a pas pu être lu. Réessayez avec une autre copie.', 'danger');
      return;
    }

    const { backup, error } = parseBackup(rawText);
    if (error) {
      showToast(error, 'danger');
      return;
    }

    const summary = applyBackup(backup);
    showToast(
      `Sauvegarde restaurée : ${summary.missions} mission(s), ${summary.invoices} facture(s), ${summary.creditNotes} avoir(s).`,
    );
    onRestored?.();
  });
};

export const backupReminderMarkup = (state) => {
  if (!isBackupStale(state.lastBackupAt, (state.missions ?? []).length)) return '';
  return html`
    <div class="error-state" role="alert">
      ${icon('alert', 24)}
      <div class="stack-sm">
        <h2 class="card-title">Vos données ne sont pas sauvegardées</h2>
        <p>
          Tout est stocké sur ce seul appareil. Téléchargez une sauvegarde et rangez-la ailleurs,
          dans votre boîte mail ou un disque.
        </p>
      </div>
      <button type="button" class="button button--s button--stroke" data-goto="factures">
        Aller à la sauvegarde
      </button>
    </div>
  `;
};

export const escapeForToast = escapeHtml;
