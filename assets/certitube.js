let youtubeReady;

function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeReady) return youtubeReady;
  youtubeReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => { clearTimeout(timer); script.remove(); reject(new Error("YouTube unavailable")); };
    const timer = setTimeout(fail, 15000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); resolve(window.YT); };
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = fail;
    document.head.append(script);
  });
  return youtubeReady;
}

export function selectedMoment(hash, moments) {
  return /^#t-(0|[1-9]\d*)$/.test(hash) ? moments.get(Number(hash.slice(3))) : undefined;
}

export function playbackMoment(time, moments, duration) {
  if (!Number.isFinite(time) || time < 0 || time > duration) return undefined;
  return [...moments.values()].findLast(moment => moment.seconds <= time);
}

function onMomentLink(event, moments, fromHash) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.composedPath().find(node => node.tagName === "A");
  if (!link || link.target === "_blank") return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.search) return;
  if (!selectedMoment(url.hash, moments)) return;
  event.preventDefault();
  if (location.hash !== url.hash) history.pushState(null, "", url.hash);
  fromHash();
}

function showChapter(root, seconds, reveal) {
  const previous = root.dataset.activeMoment;
  const smooth = previous && previous !== String(seconds) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const description = root.querySelector(".tube-description");
  const height = smooth ? description.getBoundingClientRect().height : 0;
  if (smooth) for (const animation of description.getAnimations({ subtree: true })) animation.cancel();
  root.dataset.activeMoment = String(seconds);
  for (const link of root.querySelectorAll("[data-tube-time]")) {
    if (Number(link.dataset.tubeTime) === seconds) {
      link.setAttribute("aria-current", "true");
      if (reveal) {
        const box = link.getBoundingClientRect(), strip = link.parentElement.getBoundingClientRect();
        if (box.left < strip.left || box.right > strip.right) link.parentElement.scrollBy({ left: box.left - strip.left, behavior: "instant" });
      }
    } else link.removeAttribute("aria-current");
  }
  for (const panel of root.querySelectorAll("[data-tube-description]")) panel.hidden = Number(panel.dataset.tubeDescription) !== seconds;
  if (smooth) {
    description.animate([{ height: `${height}px` }, { height: `${description.getBoundingClientRect().height}px` }], { duration: 240, easing: "cubic-bezier(.22, 1, .36, 1)" });
    description.querySelector("[data-tube-description]:not([hidden])").animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "ease-out" });
  }
}

function trackPlayback(root, player, moments, duration, external) {
  let timer, stopped = false;
  function sync() {
    const moment = playbackMoment(player.getCurrentTime(), moments, duration);
    if (!moment || root.dataset.activeMoment === String(moment.seconds)) return;
    showChapter(root, moment.seconds, true);
    external.href = `https://www.youtube.com/watch?v=${root.dataset.videoId}&t=${moment.seconds}s`;
  }
  function state(value) {
    window.clearInterval(timer);
    if (stopped || document.hidden) return;
    if ([0, 1, 2].includes(value)) sync();
    if (value === 1) timer = window.setInterval(sync, 500);
  }
  document.addEventListener("visibilitychange", () => state(player.getPlayerState()));
  window.addEventListener("pagehide", () => window.clearInterval(timer));
  return { state, stop() { stopped = true; window.clearInterval(timer); } };
}

export function mountPlayer(root) {
  const external = root.querySelector("[data-tube-external]"), status = root.querySelector("[data-tube-status]"), message = root.querySelector("[data-tube-message]");
  const spinner = root.querySelector("[data-tube-loading]");
  const duration = Number(root.dataset.duration), videoId = root.dataset.videoId;
  const moments = new Map([...document.querySelectorAll("[data-tube-time]")].map(link => [Number(link.dataset.tubeTime), { seconds: Number(link.dataset.tubeTime), label: link.querySelector("span").textContent }]));
  let player, playback, ready = false, pending, wanted = false, failed = false;
  const inform = (text, link = false) => { message.textContent = text; status.hidden = !text; external.hidden = !link; };
  const fallback = text => { clearTimeout(loading); spinner.hidden = true; playback?.stop(); failed = true; inform(text, true); };
  const loading = setTimeout(() => fallback("YouTube está tardando en responder. Puedes abrir el video con el enlace."), 20000);

  function playMoment() {
    if (!ready || failed || !wanted) return;
    const seconds = pending?.seconds ?? 0;
    const actualDuration = player.getDuration();
    if (actualDuration > 0 && seconds >= actualDuration) {
      wanted = false; player.pauseVideo(); inform("Este momento ya no está disponible en el video."); return;
    }
    player.seekTo(seconds, true);
    player.playVideo();
  }

  function select(moment) {
    pending = moment; wanted = Boolean(moment);
    external.href = `https://www.youtube.com/watch?v=${videoId}${moment ? `&t=${moment.seconds}s` : ""}`;
    const displayed = moment ?? moments.values().next().value;
    showChapter(root, displayed.seconds, Boolean(moment));
    if (!moment) { if (ready) player.pauseVideo(); return; }
    root.scrollIntoView({ block: "start", behavior: "instant" });
    root.focus({ preventScroll: true });
    playMoment();
  }

  function fromHash() {
    const moment = selectedMoment(location.hash, moments);
    select(moment && moment.seconds < duration ? moment : undefined);
  }

  const events = {
    onReady(event) {
      clearTimeout(loading); spinner.hidden = true; failed = false;
      player = event.target; ready = true;
      playback = trackPlayback(root, player, moments, duration, external);
      player.getIframe().title = "Video del caso en YouTube";
      inform("");
      playMoment();
    },
    onStateChange(event) { if (event.data === 1) inform(""); playback?.state(event.data); },
    onAutoplayBlocked() { inform("Pulsa reproducir en el video para ver el momento seleccionado."); },
    onError() { fallback("No se puede reproducir aquí. Puedes abrir este momento en YouTube."); },
  };
  document.addEventListener("click", event => onMomentLink(event, moments, fromHash));
  window.addEventListener("hashchange", fromHash);
  // Native initial-fragment/history scrolling happens after module initialization.
  window.addEventListener("pageshow", event => {
    if (event.persisted || selectedMoment(location.hash, moments)) window.requestAnimationFrame(fromHash);
  });
  window.addEventListener("pagehide", () => { if (ready) player.pauseVideo(); });
  fromHash();
  loadYouTube().then(YT => {
    player = new YT.Player("tube-youtube", {
      videoId, width: "100%", height: "100%",
      playerVars: { origin: location.origin, playsinline: 1, autoplay: 0 }, events,
    });
  }).catch(() => fallback("No se pudo conectar con YouTube. Usa el enlace para abrir el video."));
}

function mountChapterScroll(root) {
  const list = root.querySelector(".tube-chapter-list"), buttons = [...root.querySelectorAll("[data-tube-scroll]")];
  function update() {
    const { scrollLeft, scrollWidth, clientWidth } = list;
    buttons[0].disabled = scrollLeft <= 4;
    buttons[1].disabled = scrollLeft >= scrollWidth - clientWidth - 4;
  }
  for (const button of buttons) button.addEventListener("click", () => list.scrollBy({ left: Number(button.dataset.tubeScroll) * list.clientWidth * .8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }));
  list.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(list);
  update();
}

if (typeof document !== "undefined") {
  const root = document.querySelector("[data-tube-player]");
  if (root) { mountChapterScroll(root); mountPlayer(root); }
}
