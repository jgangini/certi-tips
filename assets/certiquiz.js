const app = document.querySelector('#app');
const apiOrigin = document.querySelector('.certiquiz-app').dataset.apiOrigin;
const siteBase = document.body.dataset.base;
const nameSegments = new Intl.Segmenter('es', { granularity: 'grapheme' });
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const certiQuizBrand = 'Certi<span class="brand-accent">Quiz</span>';
const welcome = (role, inRoom = false) => `<section class="welcome"><nav class="certiquiz-breadcrumb" aria-label="Ruta de navegación"><a href="${siteBase}">Home</a><span aria-hidden="true">/</span>${role ? `<a class="certiquiz-mark" href="${siteBase}certiquiz/">${certiQuizBrand}</a><span aria-hidden="true">/</span>${inRoom ? `<a href="${siteBase}certiquiz/#${role === 'host' ? 'host' : 'participant'}" data-entry-role="${role}">${role === 'host' ? 'Anfitrión' : 'Participante'}</a>` : `<span aria-current="page">${role === 'host' ? 'Anfitrión' : 'Participante'}</span>`}${inRoom ? '<span aria-hidden="true">/</span><span aria-current="page">Sala</span>' : ''}` : `<span class="certiquiz-mark" aria-current="page">${certiQuizBrand}</span>`}</nav></section>`;
const warningNoticeIcon = '<svg viewBox="-0.5 0 25 25" fill="none" aria-hidden="true" focusable="false"><path d="M18.2202 21.25H5.78015c-.638.0275-1.27181-.1153-1.83642-.4136-.56462-.2983-1.03971-.7414-1.37659-1.2838-.33688-.5425-.52342-1.1649-.54047-1.8032-.01704-.6384.13603-1.2697.44348-1.8294l6.21998-10.81c.34482-.5692.83064-1.0399 1.41047-1.3665A3.744 3.744 0 0 1 12.0001 3.245c.6655 0 1.3198.1716 1.8996.4983.5798.3266 1.0652.7973 1.4101 1.3665l6.22 10.81c.3074.5597.4605 1.191.4435 1.8294-.017  .6383-.2036 1.2607-.5405 1.8032-.3369.5424-.812.9855-1.3766 1.2838-.5646.2983-1.1984.4411-1.8364.4136Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.8809 17.15a1.13 1.13 0 0 1 1.13-1.12 1.13 1.13 0 0 1 0 2.26 1.13 1.13 0 0 1-1.13-1.14Zm.36-2.73-.14-5.22a.9.9 0 0 1 1.79 0l-.13 5.22a.76.76 0 0 1-1.52 0Z" fill="currentColor"/></svg>';
const errorNoticeIcon = '<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" focusable="false"><path d="M32.085 56.058c6.165-.059 12.268-2.619 16.657-6.966 5.213-5.164 7.897-12.803 6.961-20.096-1.605-12.499-11.855-20.98-23.772-20.98-9.053 0-17.853 5.677-21.713 13.909-2.955 6.302-2.96 13.911 0 20.225 3.832 8.174 12.488 13.821 21.559 13.908h.308Zm-.282-4.003c-9.208-.089-17.799-7.227-19.508-16.378-1.204-6.452 1.07-13.433 5.805-18.015 5.53-5.35 14.22-7.143 21.445-4.11 6.466 2.714 11.304 9.014 12.196 15.955.764 5.949-1.366 12.184-5.551 16.48-3.672 3.767-8.82 6.016-14.131 6.068h-.256Zm-12.382-10.29 9.734-9.734-9.744-9.744 2.804-2.803 9.744 9.744 10.078-10.078 2.808 2.807-10.078 10.079 10.098 10.098-2.803 2.804-10.099-10.099-9.734 9.734-2.808-2.808Z"/></svg>';
const hostRoleIcon = '<svg viewBox="0 0 31.381 31.381" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5.2" cy="25.988" r="3.638"/><circle cx="15.767" cy="25.988" r="3.638"/><circle cx="26.158" cy="25.988" r="3.638"/><rect x="24.253" y="18.292" width=".769" height="1.57"/><path d="M0 1.754v18.107h22.064v-2.779h-.193l-.287-5.589h-5.256V9.987h7.221l1.165 1.352 1.128-1.352 2.475.325.16 5.629h-1.267v3.92h4.171V1.754H0zm24.661 7.773a3.058 3.058 0 1 1 0-6.115 3.058 3.058 0 0 1 0 6.115z"/></svg>';
const playerRoleIcon = '<svg viewBox="0 0 297 297" fill="currentColor" aria-hidden="true" focusable="false"><path d="m119.306 51.203-1.612 21.974a4.94 4.94 0 0 0 2.037 4.387 4.94 4.94 0 0 0 4.801.582l20.401-8.325 20.401 8.325a4.94 4.94 0 0 0 4.801-.582 4.94 4.94 0 0 0 2.037-4.387l-1.612-21.974 14.221-16.831a4.94 4.94 0 0 0 .93-4.745 4.94 4.94 0 0 0-3.542-3.293l-21.397-5.257-11.613-18.725A4.94 4.94 0 0 0 144.933 0a4.94 4.94 0 0 0-4.226 2.352l-11.611 18.725-21.399 5.257a4.94 4.94 0 0 0-3.542 3.293 4.94 4.94 0 0 0 .93 4.745z"/><path d="M288.732 177.902h-71.919V97.219a6.962 6.962 0 0 0-6.962-6.962H87.148a6.962 6.962 0 0 0-6.962 6.962v45.625H8.268a6.962 6.962 0 0 0-6.962 6.962v140.232a6.962 6.962 0 0 0 6.962 6.962h280.465a6.962 6.962 0 0 0 6.962-6.962V184.864a6.962 6.962 0 0 0-6.963-6.962zM74.799 239.825a7.459 7.459 0 0 1-7.459 7.459H54.252v6.969H67.34a7.459 7.459 0 1 1 0 14.918H46.793a7.459 7.459 0 0 1-7.459-7.459v-21.887a7.459 7.459 0 0 1 7.459-7.459h13.088v-7.415H46.793a7.459 7.459 0 1 1 0-14.918H67.34a7.459 7.459 0 0 1 7.459 7.459zm81.16-73.793a7.459 7.459 0 1 1-14.918 0v-24.274h-1.676a7.459 7.459 0 1 1 0-14.918h9.135a7.459 7.459 0 0 1 7.459 7.459zm103.762 95.68a7.459 7.459 0 0 1-7.459 7.459h-20.548a7.459 7.459 0 1 1 0-14.918h13.089v-6.969h-13.089a7.459 7.459 0 1 1 0-14.918h13.089v-7.415h-13.089a7.459 7.459 0 1 1 0-14.918h20.548a7.459 7.459 0 0 1 7.459 7.459z"/></svg>';
const roomIcon = `<svg class="room-icon" fill="currentColor" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M17.7540247,11 C18.720523,11 19.5040247,11.7835017 19.5040247,12.75 L19.5040247,19.4989513 C19.5040247,22.5370966 17.0411213,25 14.002976,25 C10.9648308,25 8.50192738,22.5370966 8.50192738,19.4989513 L8.50192738,12.75 C8.50192738,11.7835017 9.28542907,11 10.2519274,11 L17.7540247,11 Z M3.75,11 L8.13210827,10.9980646 C7.78221386,11.420954 7.55643325,11.9502867 7.51057947,12.5302496 L7.50192738,12.75 L7.50192738,19.4989513 C7.50192738,20.6323434 7.79196393,21.6979939 8.30186513,22.6257307 C7.75085328,22.8662539 7.14166566,23 6.50123996,23 C4.01527377,23 2,20.9847262 2,18.49876 L2,12.75 C2,11.7835017 2.78350169,11 3.75,11 Z M19.8738438,10.9980646 L24.25,11 C25.2164983,11 26,11.7835017 26,12.75 L26,18.5 C26,20.9852814 23.9852814,23 21.5,23 C20.8609276,23 20.2529701,22.8667819 19.7023824,22.6266008 L19.7581025,22.5253735 C20.1867892,21.7118524 20.4480368,20.7963864 20.4959995,19.8248213 L20.5040247,19.4989513 L20.5040247,12.75 C20.5040247,12.084283 20.267475,11.4738152 19.8738438,10.9980646 Z M14,3 C15.9329966,3 17.5,4.56700338 17.5,6.5 C17.5,8.43299662 15.9329966,10 14,10 C12.0670034,10 10.5,8.43299662 10.5,6.5 C10.5,4.56700338 12.0670034,3 14,3 Z M22.0029842,4 C23.6598384,4 25.0029842,5.34314575 25.0029842,7 C25.0029842,8.65685425 23.6598384,10 22.0029842,10 C20.3461299,10 19.0029842,8.65685425 19.0029842,7 C19.0029842,5.34314575 20.3461299,4 22.0029842,4 Z M5.99701582,4 C7.65387007,4 8.99701582,5.34314575 8.99701582,7 C8.99701582,8.65685425 7.65387007,10 5.99701582,10 C4.34016157,10 2.99701582,8.65685425 2.99701582,7 C2.99701582,5.34314575 4.34016157,4 5.99701582,4 Z"/></svg>`;
let catalog;
let session = { host: false, roomCode: null };
let room = null;
let stage = '';
let rankingOrder = [];
let rankingCode;
let busy = false;
let pollTimer;
let clock = { server: 0, received: 0 };
let remaining = 0;
const entryUrl = new URL(location.href);
const prefilledCode = entryUrl.searchParams.get('room') || '';
let draftCode = /^\d{6}$/.test(prefilledCode) ? prefilledCode : '';
const routeRole = () => ({ '#host': 'host', '#participant': 'player' }[location.hash] || null);
let selectedRole = draftCode ? 'player' : routeRole();
const initialLoadingDuration = 320;

function prepareNotices() {
  const target = app.querySelector('form') || app.querySelector('section.card');
  target?.insertAdjacentHTML('beforeend', '<div class="notice error" data-error role="alert" hidden></div><p class="connection" id="connection" role="status" aria-live="polite"></p><p class="visually-hidden" id="announcement" role="status" aria-live="polite"></p>');
}
function showNotice(message, tone = 'error') {
  const notice = document.querySelector('[data-confirm][open] [data-error]') || app.querySelector('[data-error]');
  if (!notice) return;
  notice.className = `notice ${tone}`;
  notice.innerHTML = message ? `${tone === 'warning' ? warningNoticeIcon : errorNoticeIcon}<span>${escape(message)}</span>` : '';
  notice.hidden = !message;
}
function showError(message) { showNotice(message); }
function showWarning(message) { showNotice(message, 'warning'); }
function announce(message) { const node = app.querySelector('#announcement'); if (node) node.textContent = message; }
function setConnection(message) { const node = app.querySelector('#connection'); if (node) node.textContent = message; }
function retryAfterMessage(seconds) {
  const [amount, unit] = seconds % 3600 === 0 ? [seconds / 3600, 'hora'] : seconds % 60 === 0 ? [seconds / 60, 'minuto'] : [seconds, 'segundo'];
  return `Demasiados intentos. Vuelve a intentarlo en ${amount} ${unit}${amount === 1 ? '' : 's'}.`;
}
async function request(path, body) {
  const start = performance.now();
  let response;
  try {
    response = await fetch(`${apiOrigin}${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CertiQuiz': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  } catch { throw new Error('No podemos conectar. Revisa tu conexión e inténtalo de nuevo.'); }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After'));
    const detail = typeof data.detail === 'string' ? data.detail : typeof data.error === 'string' ? data.error : '';
    const message = response.status === 429 && Number.isInteger(retryAfter) && retryAfter > 0 && detail.startsWith('Demasiados intentos.') ? retryAfterMessage(retryAfter) : detail || (response.status === 429 ? 'Demasiados intentos. Espera un momento antes de volver a probar.' : 'No se pudo completar la acción. Revisa los datos e inténtalo de nuevo.');
    const error = new Error(message); error.status = response.status; throw error;
  }
  if (Number.isFinite(data.serverNow)) { data.clockServer = data.serverNow + (performance.now() - start) / 2; data.clockReceived = performance.now(); }
  return data;
}

async function action(callback, button) {
  if (busy) return;
  busy = true; showError(''); app.setAttribute('aria-busy', 'true');
  const disabled = button?.disabled;
  if (button) button.disabled = true;
  try { await callback(); }
  catch (error) { (error.status === 429 ? showWarning : showError)(error.message); }
  finally {
    busy = false; app.setAttribute('aria-busy', 'false');
    if (button?.isConnected) button.disabled = disabled;
    if (room) updateRoom();
  }
}
function bindForm(id, callback) {
  document.querySelector(`#${id}`)?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    action(() => callback(new FormData(form), form), form.querySelector('[type="submit"]'));
  });
}
function joinUrl() { const url = new URL(`${siteBase}certiquiz/`, location.origin); url.searchParams.set('room', room.code); return url.href; }
function roomPath(suffix = '') { return `/api/rooms/${encodeURIComponent(room.code)}${suffix}`; }
const cookieMessage = 'Tu navegador no pudo guardar el acceso seguro a CertiQuiz. Actualízalo y permite las cookies de CertiQuiz para este sitio antes de volver a intentarlo.';
async function enterRoom(snapshot) {
  session = await request('/api/session');
  if (session.roomCode !== snapshot.code || (snapshot.role === 'host' && !session.host)) throw new Error(cookieMessage);
  let restored;
  try { restored = await request(`/api/rooms/${encodeURIComponent(snapshot.code)}`); }
  catch (error) { if ([401, 403].includes(error.status)) throw new Error(cookieMessage); throw error; }
  if (restored.role !== snapshot.role || restored.me?.id !== snapshot.me?.id) throw new Error(cookieMessage);
  showRoom(restored); schedulePoll();
}
function roomHeader() { return room.status === 'lobby' || room.status === 'finished' ? welcome(room.role, true) : ''; }
function invitationQr(url) {
  if (typeof window.qrcode !== 'function') return '';
  const qr = window.qrcode(0, 'H');
  qr.addData(url); qr.make();
  return `<figure class="invite-qr"><button class="invite-qr-toggle" type="button" data-invite-qr aria-pressed="false" aria-label="Ampliar código QR de invitación"><span class="invite-qr-code">${qr.createSvgTag({ cellSize: 4, margin: 10, scalable: true, title: 'Código QR de invitación', alt: 'Escanea para abrir la sala' })}</span></button><span class="invite-qr-logo" aria-hidden="true"><svg viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="currentColor"/><path d="M13 13h12a8 8 0 0 1 8 8v14H21a8 8 0 0 1-8-8Z" fill="none" stroke="#fff" stroke-width="3"/><path d="m19 24 4 4 9-10" fill="none" stroke="#fff" stroke-width="3"/></svg></span></figure>`;
}
function roomFacts(questionCount, secondsPerQuestion) { return `<div class="fact-row"><span><strong>${questionCount}</strong> preguntas</span><span><strong>${secondsPerQuestion} s</strong> por pregunta</span></div>`; }

function entry(role = selectedRole) {
  document.querySelector('[data-confirm]')?.close();
  clearTimeout(pollTimer); stage = ''; room = null; rankingOrder = [];
  selectedRole = role;
  if (role !== 'player' || !draftCode) history.replaceState(null, '', `${siteBase}certiquiz/${role === 'host' ? '#host' : role === 'player' ? '#participant' : ''}`);
  const limits = catalog.limits;
  if (!role) {
    app.innerHTML = `${welcome()}<div class="entry-grid role-options"><button class="card join-card role-card" type="button" data-role="host" aria-label="Crear una partida como anfitrión"><span class="role-icon" aria-hidden="true">${hostRoleIcon}</span><span class="role-copy"><strong class="role-title">Anfitrión</strong><span class="muted">Elige un quiz, genera el código e invita a tu equipo.</span></span></button><button class="card join-card role-card" type="button" data-role="player" aria-label="Unirme a una partida como participante"><span class="role-icon" aria-hidden="true">${playerRoleIcon}</span><span class="role-copy"><strong class="role-title">Participante</strong><span class="muted">Ingresa el código de la sala y pon a prueba tus ideas.</span></span></button></div>`;
    app.querySelectorAll('[data-role]').forEach(button => button.addEventListener('click', () => { if (busy) return; entry(button.dataset.role); app.querySelector('#course, input:not([type="hidden"])')?.focus(); }));
    return;
  }
  const maxQuestions = Math.min(limits.maxQuestions, catalog.courses[0]?.questionCount || 1);
  const joinForm = `<span class="eyebrow">INGRESO DE PARTICIPANTE</span><h2 id="form-title">Únete a la Sala</h2><form id="join-form"><div class="field"><input class="code-input" id="room-code" name="code" aria-label="Código de la sala" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" placeholder="000000" value="${escape(draftCode)}" required></div><div class="field"><label for="nickname">Tu nombre o alias</label><input id="nickname" name="nickname" autocomplete="nickname" minlength="2" maxlength="25" pattern="[\\p{L}\\p{N} ]+" placeholder="¿Cómo te llamamos?" required></div><div class="actions join-actions"><button class="button" type="submit">Entrar</button></div></form>`;
  const hostForm = `<h2 id="form-title">Anfitrión</h2><p class="muted">Configura la partida y genera un código para invitar al equipo.</p><form id="create-form"><ol class="certification-list"><li class="certification-item"><div><span class="certification-number" aria-hidden="true"></span><span id="course-label" class="setup-label">Certificación</span><p id="course-hint">Elige qué certificación practicará tu equipo.</p></div><details class="path-group course-picker"><summary id="course" aria-labelledby="course-label course-title" aria-describedby="course-hint"><span id="course-title">${escape(catalog.courses[0]?.title || 'Sin certificaciones disponibles')}</span></summary><input type="hidden" name="courseId" value="${escape(catalog.courses[0]?.id)}"><div class="path-group-panel" role="group" aria-labelledby="course-label">${catalog.courses.map((course, index) => `<button type="button" data-course="${escape(course.id)}" aria-pressed="${index === 0}">${escape(course.title)}</button>`).join('')}</div></details></li><li class="certification-item"><div><span class="certification-number" aria-hidden="true"></span><label for="question-count">Número de preguntas</label><p id="question-count-hint">Las preguntas se seleccionan del banco de la certificación.</p></div><input id="question-count" name="questionCount" type="number" min="1" max="${maxQuestions}" value="${Math.min(12, maxQuestions)}" aria-describedby="question-count-hint" required></li><li class="certification-item"><div><span class="certification-number" aria-hidden="true"></span><label for="seconds">Segundos por pregunta</label><p id="seconds-hint">Tiempo que tendrá cada participante para responder.</p></div><input id="seconds" name="secondsPerQuestion" type="number" min="${limits.minSeconds}" max="${limits.maxSeconds}" value="${Math.min(limits.maxSeconds, Math.max(limits.minSeconds, 10))}" aria-describedby="seconds-hint" required></li><li class="certification-item setup-actions"><div><span class="certification-number" aria-hidden="true"></span><span class="setup-label">Generar Sala</span><p class="hint">Hasta ${limits.maxPlayers} participantes. Gana quien consigue más puntos; los empates comparten posición.</p></div><button class="button" type="submit" ${catalog.courses.length ? '' : 'disabled'}>Comenzar</button></li></ol></form>`;
  app.innerHTML = `${welcome(role)}<section class="card join-card entry-card ${role}-entry" aria-labelledby="form-title">${role === 'host' ? hostForm : joinForm}</section>`;
  prepareNotices();
  const nickname = app.querySelector('#nickname');
  nickname?.addEventListener('input', () => { nickname.value = nickname.value.replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 25); });
  bindForm('join-form', async data => { const snapshot = await request(`/api/rooms/${encodeURIComponent(String(data.get('code')).trim())}/join`, { nickname: String(data.get('nickname')).trim() }); await enterRoom(snapshot); });
  bindForm('create-form', async data => {
    try { await enterRoom(await request('/api/rooms', { courseId: data.get('courseId'), questionCount: Number(data.get('questionCount')), secondsPerQuestion: Number(data.get('secondsPerQuestion')) })); }
    catch (error) {
      if (error.status === 409) {
        try {
          const current = await request('/api/session');
          if (current.host && /^\d{6}$/.test(current.roomCode)) {
            const ownRoom = await request(`/api/rooms/${current.roomCode}`);
            if (ownRoom.role === 'host' && ownRoom.status !== 'finished') {
              const form = app.querySelector('#create-form');
              const picker = form.querySelector('.course-picker');
              form.querySelector('#course-title').textContent = ownRoom.courseTitle;
              picker.open = false; picker.inert = true; picker.setAttribute('aria-disabled', 'true');
              const questionCount = form.querySelector('#question-count'); questionCount.value = ownRoom.questionCount; questionCount.disabled = true;
              const seconds = form.querySelector('#seconds'); seconds.value = ownRoom.secondsPerQuestion; seconds.disabled = true;
              const resume = form.querySelector('.setup-actions .button'); resume.type = 'button'; resume.textContent = 'Retomar';
              resume.onclick = () => action(() => enterRoom(ownRoom), resume);
            }
          }
        } catch {}
      }
      throw error;
    }
  });
  bindCoursePicker();
}

function bindCoursePicker() {
  const picker = app.querySelector('.course-picker');
  if (!picker) return;
  picker.addEventListener('click', event => {
    const option = event.target.closest('button[data-course]');
    if (!option || busy) return;
    const chosen = catalog.courses.find(course => course.id === option.dataset.course);
    picker.querySelector('[name="courseId"]').value = chosen.id;
    picker.querySelector('#course-title').textContent = chosen.title;
    picker.querySelectorAll('[data-course]').forEach(button => button.setAttribute('aria-pressed', String(button === option)));
    const count = app.querySelector('#question-count'); count.max = Math.min(catalog.limits.maxQuestions, chosen.questionCount); count.value = Math.min(Number(count.value) || 12, Number(count.max));
    picker.open = false;
    picker.querySelector('summary').focus();
  });
  picker.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !picker.open) return;
    event.preventDefault(); picker.open = false; picker.querySelector('summary').focus();
  });
  picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget)) picker.open = false; });
}
document.addEventListener('click', event => {
  const picker = app.querySelector('.course-picker[open]');
  if (picker && !picker.contains(event.target)) picker.open = false;
});

function lobby() {
  const invite = room.role === 'host' ? joinUrl() : '';
  const hostInvitation = `<div class="invite-overview"><div class="invite-code"><strong class="pin">${escape(room.code)}</strong>${invitationQr(invite)}</div><label for="join-address">Enlace de invitación</label><div class="invite-link"><input id="join-address" type="url" value="${escape(invite)}" readonly><button type="button" data-copy aria-label="Copiar enlace de invitación" title="Copiar enlace de invitación"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="8" width="12" height="13" rx="2"/><path d="M9 5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2"/></svg></button></div></div>`;
  const facts = roomFacts(room.questionCount, room.secondsPerQuestion);
  const hostFooter = `<div class="lobby-footer">${facts}<div class="actions game-actions"><button class="button secondary" type="button" data-exit>Finalizar</button><button class="button" type="button" data-start>Comenzar</button></div></div>`;
  return `${roomHeader()}<div class="room-grid"><section class="card join-card">${room.role === 'player' ? '<button class="text-button room-exit" type="button" data-exit>Salir de la sala</button>' : ''}<span class="eyebrow">${room.role === 'host' ? 'INVITA A PARTICIPANTES' : 'YA ESTÁS DENTRO'}</span><h2 id="stage-title" tabindex="-1">${room.role === 'host' ? 'Comparte este código' : `¡Todo listo, ${escape(room.me?.nickname)}!`}</h2>${room.role === 'host' ? hostInvitation : '<p class="muted">El anfitrión iniciará la primera pregunta. Mantén esta página abierta para responder.</p>'}${room.role === 'host' ? hostFooter : facts}</section><div class="room-side"><div data-players></div></div></div>`;
}
function questionView() {
  const question = room.question;
  const revealed = room.status === 'reveal';
  return `${roomHeader()}<section class="card"><div class="game-toolbar"><span data-answer-count></span><span class="${revealed ? 'brand' : 'timer'}"${revealed ? '' : ' data-timer role="timer" aria-live="off"'}>${revealed ? 'Certi<span class="brand-accent">Quiz</span>' : ''}</span></div><progress data-timer-meter max="${room.secondsPerQuestion}" value="${revealed ? 0 : room.secondsPerQuestion}" aria-label="Tiempo restante"></progress><h2 class="question" id="question-title" tabindex="-1">${room.questionIndex + 1}. ${escape(question.text)}</h2><form id="answer-form"><fieldset aria-labelledby="question-title"><div class="options">${question.options.map((option, index) => `<label class="option${revealed && option.id === question.correctOption ? ' correct' : ''}${revealed && option.id === room.me?.answer && option.id !== question.correctOption ? ' incorrect' : ''}"><input type="radio" name="optionId" value="${escape(option.id)}" ${room.me?.answer === option.id ? 'checked' : ''} ${revealed || room.role === 'host' || room.me?.answer ? 'disabled' : ''} required><span class="option-letter" aria-hidden="true">${String.fromCharCode(65 + index)}</span><span>${escape(option.text)}${revealed && option.id === question.correctOption ? '<span class="visually-hidden">Respuesta correcta</span>' : ''}</span></label>`).join('')}</div></fieldset>${room.role === 'player' && !revealed ? '<div class="actions game-actions"><button class="button" type="submit" data-send>Enviar</button></div>' : ''}</form>${!revealed ? '<p class="answer-note" data-answer-note role="status"></p>' : ''}${revealed ? `<div class="explanation"><strong>Explicación</strong><p>${escape(question.explanation || '')}</p></div>` : ''}${room.role === 'host' ? `<div class="actions game-actions"><button class="button secondary" type="button" data-finish>Finalizar</button>${revealed ? '<button class="button" type="button" data-next>Siguiente</button>' : ''}</div>` : ''}</section>`;
}

function ranking() {
  return `<section class="card ranking-card" id="stage-title" tabindex="-1" aria-label="Clasificación por puntos">${leaderboard()}${room.role === 'host' ? '<div class="actions game-actions"><button class="button secondary" type="button" data-finish>Finalizar</button><button class="button" type="button" data-next>Siguiente</button></div>' : ''}</section>`;
}

function leaderboard() {
  return `<table class="leaderboard"><caption class="visually-hidden">Clasificación por puntos; los empates comparten posición.</caption><thead><tr><th scope="col">Ranking</th><th scope="col">Participante</th><th scope="col">Puntos</th></tr></thead><tbody>${room.leaderboard.map(player => `<tr data-player-id="${escape(player.id)}"${player.id === room.me?.id ? ' class="is-me"' : ''}><td class="place">#${String(player.rank).padStart(3, '0')}</td><th scope="row">${escape(player.nickname)}${player.id === room.me?.id ? ' (tú)' : ''}</th><td>${player.score}</td></tr>`).join('')}</tbody></table>`;
}

function animateLeaderboard(previousOrder = room.code === rankingCode ? rankingOrder : []) {
  const nodes = [...app.querySelectorAll('.leaderboard tbody tr')];
  if (!nodes.length) return;
  rankingOrder = nodes.map(node => node.dataset.playerId); rankingCode = room.code;
  if (!previousOrder.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rows = nodes.map(node => ({ node, id: node.dataset.playerId, rect: node.getBoundingClientRect() }));
  const byId = new Map(rows.map(row => [row.id, row]));
  const previousIds = new Set(previousOrder);
  const positions = new Map();
  let top = 0;
  for (const id of [...previousOrder.filter(id => byId.has(id)), ...rows.filter(row => !previousIds.has(row.id)).map(row => row.id)]) {
    positions.set(id, top); top += byId.get(id).rect.height;
  }
  for (const row of rows) {
    const offset = positions.get(row.id) - (row.rect.top - rows[0].rect.top);
    if (Math.abs(offset) < 1) continue;
    const flat = 'inset 0 1px transparent, 0 8px 18px transparent';
    const lifted = 'inset 0 1px var(--line), 0 8px 18px var(--row-shadow)';
    row.node.animate([
      { transform: `translateY(${offset}px)`, zIndex: offset > 0 ? 2 : 1, boxShadow: flat, offset: 0, easing: 'cubic-bezier(.22, 1, .36, 1)' },
      { boxShadow: lifted, offset: .12 }, { boxShadow: lifted, offset: .78 },
      { transform: 'translateY(0)', zIndex: offset > 0 ? 2 : 1, boxShadow: flat, offset: 1 },
    ],
      { duration: 1700, delay: 300, fill: 'backwards' });
  }
}

function podium() {
  return `<ol class="podium" aria-label="Podio final">${[2, 1, 3].map(rank => {
    const players = room.leaderboard.filter(player => player.rank === rank);
    if (!players.length) return '';
    return `<li class="podium-place podium-${rank}"><strong class="podium-name">${players.map(player => `<span>${escape(player.nickname)}${player.id === room.me?.id ? ' (tú)' : ''}</span>`).join('')}</strong><div class="podium-step"><img class="podium-medal" src="${siteBase}assets/certiquiz-medal-${rank}.svg" alt="${rank === 1 ? 'Primer' : rank === 2 ? 'Segundo' : 'Tercer'} puesto${players.length > 1 ? ' compartido' : ''}" width="88" height="88"><strong class="podium-score">${players[0].score}</strong><span>puntos</span></div></li>`;
  }).join('')}</ol>`;
}

function confetti() {
  return `<div class="confetti" aria-hidden="true">${Array.from({ length: 60 }, (_, index) => `<i style="--left:${(index * 37) % 100}%;--delay:${(index % 12) * .2}s;--duration:${4 + (index % 5) * .4}s;--drift:${(index % 9 - 4) * 18}px;--color:${['#c74634', '#fccd1d', '#22684c', '#4974c4', '#9b65c4'][index % 5]}"></i>`).join('')}</div>`;
}

function finished() {
  const leaders = room.leaderboard.filter(player => player.rank === 1);
  const title = leaders.length > 1 ? '¡Primer puesto compartido!' : leaders.length ? `¡Bien hecho, ${escape(leaders[0].nickname)}!` : 'Gracias por practicar en equipo.';
  return `${roomHeader()}<section class="result-banner"><h2 id="stage-title" tabindex="-1">${title}</h2><p>${leaders.length ? `${leaders[0].score} puntos en esta partida.${leaders.length > 1 ? ' Los empates comparten la misma posición.' : ''}` : 'Cada pregunta cuenta para seguir aprendiendo.'}</p>${room.courseTitle ? `<p class="result-course">${escape(room.courseTitle)}</p>` : ''}${leaders.length ? podium() + confetti() : ''}</section><section class="card">${leaderboard()}<div class="actions game-actions"><button class="button" type="button" data-exit>Salir</button></div></section>`;
}

function showRoom(snapshot) {
  if (room?.code === snapshot.code && snapshot.version < room.version) return;
  const nextStage = `${snapshot.code}:${snapshot.status}:${snapshot.questionIndex}`;
  const changed = stage !== nextStage;
  const answered = snapshot.me?.answer && snapshot.me.answer !== room?.me?.answer;
  room = snapshot; clock = { server: snapshot.clockServer || snapshot.serverNow, received: snapshot.clockReceived || performance.now() };
  session.roomCode = snapshot.code;
  selectedRole = snapshot.role;
  if (new URL(location.href).searchParams.get('room') !== snapshot.code) history.replaceState(null, '', joinUrl());
  if (room.status === 'finished') document.querySelector('[data-confirm]')?.close();
  if (changed) {
    stage = nextStage;
    app.innerHTML = room.status === 'lobby' ? lobby() : room.status === 'ranking' ? ranking() : room.status === 'finished' ? finished() : questionView();
    animateLeaderboard();
    prepareNotices();
    bindRoom();
    if (room.status !== 'lobby' && !document.querySelector('[data-confirm][open]')) (document.querySelector('#question-title') || document.querySelector('#stage-title'))?.focus({ preventScroll: true });
    announce(room.status === 'question' ? `Pregunta ${room.questionIndex + 1}. Tienes ${room.secondsPerQuestion} segundos.` : room.status === 'reveal' ? 'Se cerró la pregunta. Puedes revisar la respuesta.' : room.status === 'ranking' ? 'Puntuaciones actualizadas. Puedes revisar la clasificación.' : room.status === 'finished' ? 'Partida terminada. Ya puedes consultar los resultados.' : 'Te has unido a la sala.');
  }
  updateRoom();
  if (answered) { showError(''); announce('Respuesta registrada. Espera a que termine el tiempo.'); }
  app.setAttribute('aria-busy', 'false');
}

function updateRoom() {
  if (!room) return;
  const playerCount = room.playerCount ?? room.players.length;
  const players = document.querySelector('[data-players]');
  if (players) {
    updatePlayers(players);
    const start = document.querySelector('[data-start]'); if (start) start.disabled = !playerCount || busy;
  }
  const count = document.querySelector('[data-answer-count]');
  if (count) count.textContent = `${room.answeredCount} de ${playerCount} han respondido`;
  tick();
  const note = document.querySelector('[data-answer-note]');
  if (!note) return;
  const answered = Boolean(room.me?.answer);
  if (room.status === 'question') {
    const locked = answered || remaining <= 0 || room.role === 'host';
    document.querySelectorAll('#answer-form input').forEach(input => { input.disabled = locked; if (answered) input.checked = input.value === room.me.answer; });
    const send = document.querySelector('[data-send]'); if (send) { send.disabled = locked || busy; send.textContent = answered ? 'Respuesta registrada ✓' : 'Enviar'; }
    const message = room.role === 'host' ? 'Las respuestas se cierran al terminar el tiempo.' : answered ? 'Respuesta registrada. Espera a que termine el tiempo.' : remaining <= 0 ? 'Tiempo terminado. Preparando la respuesta…' : '';
    if (note.textContent !== message) note.textContent = message;
  }
}

function updatePlayers(container) {
  rankingOrder = room.players.map(player => player.id); rankingCode = room.code;
  if (!room.players.length) {
    if (container.firstChild) container.replaceChildren();
    return;
  }
  if (!container.querySelector('.player-list')) container.innerHTML = '<ul class="player-list" tabindex="0" aria-label="Participantes de la sala"><li class="player-total"><span class="team-total" role="status" aria-live="polite"></span></li></ul>';
  const list = container.querySelector('.player-list');
  const total = list.querySelector('.team-total');
  const count = String(room.playerCount ?? room.players.length);
  if (total.textContent !== count) {
    total.textContent = count; total.setAttribute('aria-label', `${count} ${count === '1' ? 'participante' : 'participantes'}`);
    // ponytail: cap growth at 124px; expand the roster layout before increasing this ceiling.
    list.style.setProperty('--total-size', `${Math.min(124, 64 + Math.sqrt(Number(count)) * 6)}px`);
  }
  const current = new Map([...list.querySelectorAll('[data-player-id]')].map(node => [node.dataset.playerId, node]));
  for (const player of room.players) {
    // ponytail: room nicknames cannot change; keep existing nodes to preserve focus and motion.
    if (current.delete(player.id)) continue;
    const words = player.nickname.split(' ');
    const initials = (words.length > 1 ? [words[0], words.at(-1)] : words).map(word => [...nameSegments.segment(word)][0].segment).join('').toLocaleUpperCase('es');
    const seed = parseInt(player.id.slice(-4), 16);
    const item = document.createElement('li');
    item.dataset.playerId = player.id;
    item.innerHTML = `<span class="player-avatar avatar-tone-${seed % 6}" role="img" aria-label="${escape(player.nickname)}" style="--float-delay: -${seed % 40 / 10}s; --float-duration: ${4 + seed % 4}s"><span class="avatar-initials" aria-hidden="true">${escape(initials)}</span><span class="avatar-name" aria-hidden="true"><span>${escape(player.nickname)}</span></span></span>`;
    list.append(item);
  }
  for (const node of current.values()) node.remove();
}

function tick() {
  if (!room) return;
  const timer = document.querySelector('[data-timer]');
  if (!timer) return;
  const seconds = room.status === 'question' && room.deadline ? Math.max(0, (room.deadline - clock.server - (performance.now() - clock.received)) / 1000) : 0;
  remaining = Math.ceil(seconds);
  const label = `${remaining} s`; if (timer.textContent !== label) timer.textContent = label;
  timer.classList.toggle('urgent', room.status === 'question' && remaining <= 5);
  document.querySelector('[data-timer-meter]').value = seconds;
  if (remaining <= 0) { document.querySelectorAll('#answer-form input, [data-send]').forEach(input => { input.disabled = true; }); }
}

function bindRoom() {
  document.querySelector('[data-entry-role]')?.addEventListener('click', event => { event.preventDefault(); if (!busy) entry(event.currentTarget.dataset.entryRole); });
  document.querySelector('[data-invite-qr]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const invitation = button.closest('.invite-code');
    if (!invitation) return;
    const expanded = invitation.classList.toggle('qr-expanded');
    button.setAttribute('aria-pressed', String(expanded));
    button.setAttribute('aria-label', expanded ? 'Mostrar código de invitación' : 'Ampliar código QR de invitación');
    announce(expanded ? 'Código QR ampliado.' : 'Código de invitación mostrado.');
  });
  document.querySelector('[data-copy]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    action(async () => {
      try { await navigator.clipboard.writeText(joinUrl()); }
      catch { throw new Error('No se pudo copiar. Selecciona y copia el enlace del campo de invitación para compartir la sala.'); }
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
      button.title = 'Enlace copiado'; button.setAttribute('aria-label', 'Enlace copiado'); announce('Enlace de invitación copiado.');
    }, button);
  });
  for (const command of ['start', 'next']) document.querySelector(`[data-${command}]`)?.addEventListener('click', event => action(async () => showRoom(await request(roomPath(`/${command}`), {})), event.currentTarget));
  bindForm('answer-form', async data => {
    if (room.status !== 'question' || room.role !== 'player') return;
    showRoom(await request(roomPath('/answers'), { questionId: room.question.id, optionId: data.get('optionId') }));
  });
  document.querySelector('[data-finish]')?.addEventListener('click', event => {
    confirmRoomAction(event.currentTarget, 'La partida terminará para todos y se mostrarán los resultados de las preguntas respondidas.', 'Finalizar partida', async () => showRoom(await request(roomPath('/finish'), {})));
  });
  document.querySelector('[data-exit]')?.addEventListener('click', event => {
    if (room.role === 'host' && room.status !== 'finished') confirmRoomAction(event.currentTarget, 'Si sales, esta partida terminará para todos. Después podrás crear otra sala.', 'Salir', () => logout('host'));
    else action(() => logout(room.status === 'finished' ? null : room.role), event.currentTarget);
  });
}

function confirmRoomAction(button, message, label, callback) {
  if (busy || document.querySelector('[data-confirm]')) return;
  showError('');
  const dialog = document.createElement('dialog'); dialog.className = 'confirmation'; dialog.dataset.confirm = '';
  dialog.setAttribute('aria-labelledby', 'confirmation-title'); dialog.setAttribute('aria-describedby', 'confirmation-message');
  dialog.innerHTML = `<div class="confirmation-body"><span class="confirmation-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 16h.01"/></svg></span><h2 id="confirmation-title">${button.hasAttribute('data-exit') ? '¿Salir de la sala?' : '¿Finalizar la partida?'}</h2><p id="confirmation-message">${escape(message)}</p><div class="notice error" data-error role="alert" hidden></div></div><div class="confirmation-actions"><button class="button secondary" type="button" data-confirm-no autofocus>Cancelar</button><button class="button" type="button" data-confirm-yes>${escape(label)}</button></div>`;
  app.closest('.certiquiz-app').append(dialog);
  const confirm = dialog.querySelector('[data-confirm-yes]');
  const cancel = dialog.querySelector('[data-confirm-no]');
  confirm.addEventListener('click', () => action(async () => {
    cancel.disabled = true; dialog.setAttribute('aria-busy', 'true');
    try { await callback(); dialog.close(); }
    finally { cancel.disabled = false; dialog.setAttribute('aria-busy', 'false'); }
  }, confirm));
  cancel.addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || busy) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    (button.isConnected ? button : app.querySelector('#question-title, #stage-title, #course, #room-code'))?.focus({ preventScroll: true });
  });
  dialog.showModal();
}
async function logout(role) {
  await request('/api/logout', {}); session = { host: false, roomCode: null }; draftCode = ''; entry(role); app.querySelector(role === 'host' ? '#course' : role === 'player' ? '#room-code' : '[data-role]')?.focus();
}
function schedulePoll(delay = 1000) { clearTimeout(pollTimer); if (room?.code && room.status !== 'finished') pollTimer = setTimeout(poll, delay); }
async function poll() {
  if (!room) return;
  const code = room.code;
  if (busy) { schedulePoll(); return; }
  let retry = 1000;
  try {
    const snapshot = await request(roomPath(`?version=${room.version}`));
    if (!room || room.code !== code) return;
    if (snapshot) showRoom(snapshot);
    setConnection('');
  } catch (error) {
    if (!room || room.code !== code) return;
    if ([401, 403, 404, 410].includes(error.status)) {
      const role = room.role; draftCode = role === 'player' ? code : ''; session = { host: false, roomCode: null }; entry(role); showWarning('La sala o tu acceso ya no están disponibles. Puedes volver a entrar con el código o crear otra sala.'); return;
    }
    setConnection('Reconectando… Tu respuesta solo se registra cuando recibes la confirmación.'); retry = 2500;
  }
  schedulePoll(retry);
}

async function load() {
  const loadingUntil = performance.now() + initialLoadingDuration;
  const finishLoading = () => new Promise(resolve => setTimeout(resolve, Math.max(0, loadingUntil - performance.now())));
  showError(''); app.setAttribute('aria-busy', 'true');
  try {
    [catalog, session] = await Promise.all([request('/api/catalog'), request('/api/session')]);
    if (session.roomCode && entryUrl.searchParams.has('room') && (!prefilledCode || prefilledCode === session.roomCode)) {
      try { const snapshot = await request(`/api/rooms/${encodeURIComponent(session.roomCode)}`); await finishLoading(); showRoom(snapshot); schedulePoll(); return; }
      catch (error) { if (![401, 403, 404, 410].includes(error.status)) throw error; session.roomCode = null; }
    }
    await finishLoading(); entry();
  } catch {
    app.innerHTML = `<section class="loading loading-full loading-error"><h1><span>Volvamos a intentarlo</span></h1><p class="muted" role="alert">CertiQuiz no se pudo cargar. Revisa tu conexión e inténtalo de nuevo.</p><p class="hint">Recarga la página desde tu navegador o pulsa <kbd>F5</kbd> para volver a intentarlo.</p></section>`;
    app.querySelector('h1').prepend(document.querySelector('#certiquiz-rocket').content.cloneNode(true));
  } finally { app.setAttribute('aria-busy', 'false'); }
}
requestAnimationFrame(function frame() { tick(); requestAnimationFrame(frame); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && room) schedulePoll(0); });
window.addEventListener('hashchange', () => { if (catalog && !busy) entry(routeRole()); });
load();
