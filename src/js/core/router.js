const routes = new Map();
const listeners = new Set();

const readRoute = () => {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return {
    path: path || 'accueil',
    params: Object.fromEntries(new URLSearchParams(query)),
  };
};

let renderCurrentView = () => {};

export const registerRoute = (path, render) => routes.set(path, render);

export const onNavigate = (listener) => listeners.add(listener);

export const refresh = () => renderCurrentView();

export const navigate = (path, params = {}) => {
  const query = new URLSearchParams(params).toString();
  const target = query ? `#/${path}?${query}` : `#/${path}`;
  if (window.location.hash === target) {
    renderCurrentView();
    return;
  }
  window.location.hash = target;
};

export const currentRoute = readRoute;

export const startRouter = (outlet, notFoundRender) => {
  const render = () => {
    const route = readRoute();
    const renderRoute = routes.get(route.path) ?? notFoundRender;
    outlet.innerHTML = '';
    const view = renderRoute(route.params);
    if (view) outlet.append(view);
    outlet.scrollTop = 0;
    window.scrollTo({ top: 0 });
    listeners.forEach((listener) => listener(route));
  };

  renderCurrentView = render;
  window.addEventListener('hashchange', render);
  render();
};
