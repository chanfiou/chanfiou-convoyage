import { html, onClick } from '../../core/dom.js';
import { fromHtml, showToast } from '../../core/ui.js';
import { navigate } from '../../core/router.js';
import { fetchAvailabilityDetailed, isSignedIn, saveAvailability } from '../../data/api.js';
import { bindCalendar } from '../calendar.js';

export const renderAvailability = () => {
  const view = fromHtml(html`
    <div class="screen">
      <header class="screen__head">
        <div class="row row--between">
          <h1>Disponibilités</h1>
          <button type="button" class="button button--xs button--link" data-goto="espace">
            Retour aux missions
          </button>
        </div>
        <p class="text-muted">
          Touchez un jour pour le bloquer ou le libérer. Les clients ne peuvent choisir que les
          jours restés disponibles.
        </p>
      </header>

      <section class="card">
        <div data-availability-calendar>
          <p class="text-small text-muted">Chargement du calendrier…</p>
        </div>
        <div class="row row--wrap">
          <span class="chip chip--status chip--danger">Bloqué manuellement</span>
          <span class="chip chip--status chip--info">Réservé par une mission</span>
        </div>
        <p class="text-small text-muted">
          Les jours réservés se libèrent automatiquement quand la mission est annulée. Un appui
          sur un jour réservé le libère aussi manuellement, sans annuler la mission.
        </p>
      </section>
    </div>
  `);

  onClick(view, '[data-goto]', (target) => navigate(target.dataset.goto));

  const slot = view.querySelector('[data-availability-calendar]');

  if (!isSignedIn()) {
    slot.innerHTML = html`<p class="text-small text-muted">
      Connectez-vous à l’Espace convoyeur pour gérer vos disponibilités.
    </p>`;
    return view;
  }

  const blocked = new Set();
  const missions = new Map();
  let calendar = null;
  let busy = false;

  const handleDayClick = async (day, info) => {
    if (busy) return;
    busy = true;
    const nextBlocked = !info.blocked;
    if (info.missionReference && !nextBlocked) {
      showToast(`Journée libérée — la mission ${info.missionReference} reste confirmée.`);
    }
    const { error } = await saveAvailability(day, nextBlocked);
    busy = false;
    if (error) {
      showToast(error, 'danger');
      return;
    }
    if (nextBlocked) {
      blocked.add(day);
    } else {
      blocked.delete(day);
      missions.delete(day);
    }
    calendar.setBlocked(blocked, missions);
  };

  const now = new Date();
  const minDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  calendar = bindCalendar(slot, {
    mode: 'toggle',
    minDay,
    blocked,
    missions,
    onDayClick: handleDayClick,
  });

  fetchAvailabilityDetailed().then(({ data, error }) => {
    if (error) {
      showToast(error, 'danger');
      return;
    }
    (data?.days ?? []).forEach((row) => {
      blocked.add(row.day);
      if (row.reason === 'mission') missions.set(row.day, row.reference);
    });
    calendar.setBlocked(blocked, missions);
  });

  return view;
};
