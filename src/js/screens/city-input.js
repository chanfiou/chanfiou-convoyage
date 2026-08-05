import { escapeHtml, html } from '../core/dom.js';
import { searchCities } from '../domain/geo.js';

export const cityFieldMarkup = ({ name, label, placeholder, value = '' }) => html`
  <div class="field autocomplete" data-city-field="${name}">
    <label class="field__label" for="city-${name}">${escapeHtml(label)}</label>
    <input
      class="input"
      id="city-${name}"
      name="${name}"
      type="text"
      autocomplete="off"
      placeholder="${escapeHtml(placeholder)}"
      value="${escapeHtml(value)}"
    />
    <div class="autocomplete__list" hidden></div>
  </div>
`;

export const bindCityField = (root, name, onSelected) => {
  const field = root.querySelector(`[data-city-field="${name}"]`);
  if (!field) return;
  const input = field.querySelector('input');
  const list = field.querySelector('.autocomplete__list');

  const closeList = () => {
    list.hidden = true;
    list.innerHTML = '';
  };

  const openList = (cities) => {
    if (cities.length === 0) {
      closeList();
      return;
    }
    list.innerHTML = cities
      .map(
        (city) => html`
          <button type="button" class="autocomplete__option" data-city-label="${escapeHtml(city.label)}">
            <span>${escapeHtml(city.name)}</span>
            <span class="text-small text-muted">${escapeHtml(city.dept)}</span>
          </button>
        `,
      )
      .join('');
    list.hidden = false;
  };

  input.addEventListener('input', () => {
    openList(searchCities(input.value));
  });

  input.addEventListener('blur', () => {
    window.setTimeout(closeList, 160);
  });

  list.addEventListener('click', (event) => {
    const option = event.target.closest('[data-city-label]');
    if (!option) return;
    input.value = option.dataset.cityLabel;
    closeList();
    onSelected(input.value);
  });
};
