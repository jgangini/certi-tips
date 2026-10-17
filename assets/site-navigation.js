import { t, siteBase, prepareLocale } from "./i18n.js";

let navigate;
export function navigateSite(url, options) { return navigate ? navigate(url, options) : Promise.resolve(false); }

function supportedURL(value) {
  let url;
  try { url = new URL(value, location.href); } catch { return null; }
  if (url.origin !== location.origin || !url.pathname.startsWith(siteBase) || !/\/$|\.html$/.test(url.pathname) || /\/(?:assets|certiquiz)\//.test(url.pathname)) return null;
  return url;
}
async function pageModules(doc) {
  const mounts = [];
  if (doc.querySelector('#quiz')) mounts.push((await import('./quiz.js')).mountQuiz);
  if (doc.querySelector('[data-tube-player]')) mounts.push((await import('./certitube.js')).mountTube);
  if (doc.querySelector('[data-knowledge-graph]')) mounts.push((await import('./certichat-explorer.js')).mountExplorer);
  return mounts;
}
async function stylesFor(doc, signal) {
  // These shared stylesheet nodes must outlive the body view that originally loaded them.
  document.head.append(...document.body.querySelectorAll('link[rel="stylesheet"]'));
  for (const source of doc.querySelectorAll('link[rel="stylesheet"]')) {
    if (signal.aborted) throw new DOMException('Navigation canceled', 'AbortError');
    const url = new URL(source.getAttribute('href'), location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(`${siteBase}assets/`) || !url.pathname.endsWith('.css')) throw new Error('Invalid page stylesheet');
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === url.href)) continue;
    await new Promise((resolve, reject) => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = url.href;
      const timer = setTimeout(() => done(new Error('Stylesheet unavailable')), 8000);
      const abort = () => done(signal.reason);
      function done(error) { clearTimeout(timer); signal.removeEventListener('abort', abort); link.onload = link.onerror = null; if (error) { link.remove(); reject(error); } else resolve(); }
      link.onload = () => done(); link.onerror = () => done(new Error('Stylesheet unavailable'));
      signal.addEventListener('abort', abort, { once: true }); document.head.append(link);
    });
  }
}
function staticChatLabels(fresh) {
  for (const selector of ['.certichat-heading', '[data-chat-confirm]', '[data-chat-clear-error-message]']) {
    const live = document.querySelector(selector), next = fresh.querySelector(selector);
    if (!live || !next) continue;
    const left = document.createTreeWalker(live, NodeFilter.SHOW_TEXT), right = fresh.createTreeWalker(next, NodeFilter.SHOW_TEXT);
    let a, b; while ((a = left.nextNode()) && (b = right.nextNode())) a.nodeValue = b.nodeValue;
    const elements = [live, ...live.querySelectorAll('*')], sources = [next, ...next.querySelectorAll('*')];
    elements.forEach((element, i) => { for (const name of ['aria-label', 'title']) if (sources[i]?.hasAttribute(name)) element.setAttribute(name, sources[i].getAttribute(name)); });
  }
}
function replacePage(fresh) {
  const keep = [...document.querySelectorAll('[data-certichat], [data-voice-edge], #diagram-viewer, #site-search')];
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  document.body.append(...keep);
  staticChatLabels(fresh);
  for (const node of keep.filter(node => node.matches('dialog'))) {
    const next = fresh.getElementById(node.id);
    node.replaceChildren(...next.childNodes);
    for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name);
    for (const attribute of next.attributes) node.setAttribute(attribute.name, attribute.value);
  }
  const children = [...fresh.body.children].filter(node => !node.matches('script, link, [data-certichat], [data-voice-edge], #diagram-viewer, #site-search'));
  document.body.replaceChildren(...children, ...keep);
  for (const attribute of [...document.body.attributes]) document.body.removeAttribute(attribute.name);
  for (const attribute of fresh.body.attributes) document.body.setAttribute(attribute.name, attribute.value);
  try { if (sessionStorage.getItem('certitips:course-nav:compact') === 'true') document.body.classList.add('is-compact-nav'); } catch { /* Optional preference. */ }
  document.documentElement.lang = fresh.documentElement.lang;
  document.title = fresh.title;
  const selector = 'link[rel="canonical"], link[rel="alternate"], meta[name="description"], meta[property^="og:"]';
  document.head.querySelectorAll(selector).forEach(node => node.remove());
  document.head.append(...fresh.head.querySelectorAll(selector));
}

export function installPageNavigation(mountSite) {
  let enabled = false, pageScope = new AbortController(), request, currentURL = new URL(location.href), scrollTimer;
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const remember = () => history.replaceState({ ...history.state, certitipsPage: { url: location.href, scroll: [scrollX, scrollY] } }, '', location.href);
  const mount = async mounts => { const signal = pageScope.signal; mountSite(signal); await Promise.all(mounts.map(fn => fn(signal))); if (!signal.aborted) document.body.dataset.pageReady = 'true'; };
  void pageModules(document).then(mount);
  window.addEventListener('certivoice:state', event => {
    if (!event.detail?.active || enabled) return;
    enabled = true; history.scrollRestoration = 'manual'; remember();
  });
  const reportFailure = () => {
    const main = document.querySelector('#main');
    let notice = main.querySelector('[data-navigation-error]');
    if (!notice) { notice = document.createElement('p'); notice.dataset.navigationError = ''; notice.setAttribute('role', 'alert'); main.prepend(notice); }
    notice.textContent = t('Sin conexión. Vuelve a intentarlo.');
  };
  navigate = async (value, options = {}) => {
    const target = supportedURL(value);
    if (!enabled || !target) return false;
    request?.abort();
    if (target.pathname === currentURL.pathname && target.search === currentURL.search) {
      if (target.hash !== location.hash) location.hash = target.hash;
      else if (!target.hash) scrollTo(0, 0);
      currentURL = new URL(location.href); return true;
    }
    const operation = request = new AbortController();
    const signal = operation.signal; let timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; operation.abort(); }, 15000);
    const detail = { url: target.href, source: options.source || 'link' };
    emit('site:will-navigate', detail);
    document.documentElement.classList.add('is-page-loading');
    try {
      const response = await fetch(target, { signal, headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error('Page unavailable');
      if (!response.headers.get('Content-Type')?.includes('text/html') || !supportedURL(response.url)) return false;
      const text = await response.text();
      if (text.length > 4000000) throw new Error('Page too large');
      const fresh = new DOMParser().parseFromString(text, 'text/html');
      if (!fresh.querySelector('#main') || !fresh.querySelector('[data-certichat]') || !fresh.querySelector('#diagram-viewer') || !fresh.querySelector('#site-search')) return false;
      const entry = 'script[type="module"][src*="/assets/site.js"]';
      const source = document.querySelector(entry)?.getAttribute('src');
      if (!source || fresh.querySelector(entry)?.getAttribute('src') !== source) return false;
      const [mounts, applyLocale] = await Promise.all([pageModules(fresh), prepareLocale(fresh, signal), stylesFor(fresh, signal)]);
      if (signal.aborted) throw new DOMException('Navigation canceled', 'AbortError');
      if (options.history !== 'pop') { clearTimeout(scrollTimer); remember(); }
      pageScope.abort();
      replacePage(fresh); applyLocale();
      if (options.history !== 'pop') history.pushState({ certitipsPage: { url: target.href, scroll: [0, 0] } }, '', target);
      currentURL = new URL(target); pageScope = new AbortController();
      await mount(mounts);
      if (signal.aborted || request !== operation) throw new DOMException('Navigation canceled', 'AbortError');
      emit('site:page', detail);
      let fragment;
      try { fragment = target.hash && document.getElementById(decodeURIComponent(target.hash.slice(1))); } catch { /* An invalid fragment does not undo a valid page change. */ }
      if (Array.isArray(options.scroll) && options.scroll.length === 2 && options.scroll.every(Number.isFinite)) scrollTo(...options.scroll); else if (fragment) fragment.scrollIntoView({ block: 'start' }); else scrollTo(0, 0);
      document.querySelector('#main').focus({ preventScroll: true }); remember();
      return true;
    } catch (error) {
      if (timedOut || !operation.signal.aborted) reportFailure();
      throw error;
    } finally {
      clearTimeout(deadline);
      if (request === operation) { request = undefined; document.documentElement.classList.remove('is-page-loading'); emit('site:did-navigate', detail); await detail.completion; }
    }
  };
  document.addEventListener('click', event => {
    if (!enabled || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.composedPath().find(node => node.matches?.('a[href]'));
    if (!link || link.hasAttribute('download') || link.target && link.target.toLowerCase() !== '_self') return;
    const target = supportedURL(link.href);
    if (!target) return;
    if (target.pathname === currentURL.pathname && target.search === currentURL.search) {
      if (!target.hash) { event.preventDefault(); request?.abort(); history.replaceState(history.state, '', target); currentURL = new URL(target); scrollTo(0, 0); }
      return;
    }
    event.preventDefault();
    void navigate(target, { source: 'link' }).then(moved => { if (!moved) location.assign(target); }).catch(() => {});
  });
  window.addEventListener('popstate', event => {
    if (!enabled) return;
    clearTimeout(scrollTimer);
    if (location.pathname === currentURL.pathname && location.search === currentURL.search) {
      currentURL = new URL(location.href);
      const position = event.state?.certitipsPage?.scroll;
      if (Array.isArray(position) && position.length === 2 && position.every(Number.isFinite)) scrollTo(...position);
      return;
    }
    void navigate(location.href, { history: 'pop', source: 'history', scroll: event.state?.certitipsPage?.scroll }).then(moved => { if (!moved) location.reload(); }).catch(() => history.replaceState(history.state, '', currentURL));
  });
  window.addEventListener('scroll', () => { if (enabled && !request) { clearTimeout(scrollTimer); scrollTimer = setTimeout(remember, 120); } }, { passive: true });
}
