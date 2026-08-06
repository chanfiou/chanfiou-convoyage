import { html } from '../core/dom.js';

const MONTH_LABELS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const DAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const toIso = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Calendrier mensuel partagé : mode 'select' (client, jours bloqués
// inertes) ou 'toggle' (convoyeur, chaque jour est cliquable).
export const bindCalendar = (container, options) => {
  const state = {
    view: new Date(),
    selected: options.selected ?? null,
    blocked: options.blocked ?? new Set(),
    missions: options.missions ?? new Map(),
    minDay: options.minDay ?? null,
  };
  state.view.setDate(1);

  const render = () => {
    const year = state.view.getFullYear();
    const month = state.view.getMonth();
    const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    DAY_HEADERS.forEach((header) => cells.push(`<span class="calendar__header">${header}</span>`));
    for (let blank = 0; blank < leadingBlanks; blank += 1) cells.push('<span></span>');
    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
      const day = toIso(new Date(year, month, dayNumber));
      const isPast = state.minDay && day < state.minDay;
      const isBlocked = state.blocked.has(day);
      const isMission = state.missions.has(day);
      const isSelected = state.selected === day;
      const disabled = isPast || (options.mode === 'select' && isBlocked);
      const classes = [
        'calendar__day',
        isPast ? 'calendar__day--muted' : '',
        isBlocked && !isMission ? 'calendar__day--blocked' : '',
        isMission ? 'calendar__day--mission' : '',
        isSelected ? 'calendar__day--selected' : '',
      ]
        .filter(Boolean)
        .join(' ');
      cells.push(
        `<button type="button" class="${classes}" data-day="${day}" ${disabled ? 'disabled' : ''}>${dayNumber}</button>`,
      );
    }

    container.innerHTML = html`
      <div class="calendar">
        <div class="calendar__head">
          <button type="button" class="button button--xs button--stroke" data-cal-prev aria-label="Mois précédent">‹</button>
          <strong>${MONTH_LABELS[month]} ${year}</strong>
          <button type="button" class="button button--xs button--stroke" data-cal-next aria-label="Mois suivant">›</button>
        </div>
        <div class="calendar__grid">${cells.join('')}</div>
      </div>
    `;

    container.querySelector('[data-cal-prev]').addEventListener('click', () => {
      state.view = new Date(year, month - 1, 1);
      render();
    });
    container.querySelector('[data-cal-next]').addEventListener('click', () => {
      state.view = new Date(year, month + 1, 1);
      render();
    });
    container.querySelectorAll('[data-day]').forEach((button) => {
      button.addEventListener('click', () => {
        const day = button.dataset.day;
        options.onDayClick?.(day, {
          blocked: state.blocked.has(day),
          missionReference: state.missions.get(day) ?? null,
        });
      });
    });
  };

  render();

  return {
    select(day) {
      state.selected = day;
      render();
    },
    setBlocked(blocked, missions) {
      state.blocked = blocked;
      if (missions) state.missions = missions;
      render();
    },
  };
};
