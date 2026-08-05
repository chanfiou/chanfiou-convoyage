export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const html = (strings, ...values) =>
  strings.reduce((accumulator, chunk, index) => {
    if (index === 0) return chunk;
    const value = values[index - 1];
    const rendered = Array.isArray(value) ? value.join('') : String(value ?? '');
    return accumulator + rendered + chunk;
  }, '');

export const select = (selector, root = document) => root.querySelector(selector);

export const selectAll = (selector, root = document) => [...root.querySelectorAll(selector)];

export const onClick = (root, selector, handler) => {
  root.addEventListener('click', (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(target, event);
  });
};

export const onInput = (root, selector, handler) => {
  root.addEventListener('input', (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(target, event);
  });
};

export const onChange = (root, selector, handler) => {
  root.addEventListener('change', (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(target, event);
  });
};

export const icon = (name, size = 20) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
