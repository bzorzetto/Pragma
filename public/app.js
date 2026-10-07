const usersBody = document.querySelector('#users-body');
const notice = document.querySelector('#notice');
const userDialog = document.querySelector('#user-dialog');
const userForm = document.querySelector('#user-form');
const tokenDialog = document.querySelector('#token-dialog');
const accessDialog = document.querySelector('#access-dialog');
let activeAccessUserId = null;
let users = [];
let gates = [];
let readers = [];
const accessLogPageSize = 50;
let accessLogOffset = 0;
let accessLogsExhausted = false;
let accessLogRequestVersion = 0;
let logFilterTimer = null;

const navigationLinks = [...document.querySelectorAll('.sidebar .nav-item[href^="#"]')];

function activateNavigation(link) {
  navigationLinks.forEach(item => {
    const active = item === link;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'location');
    else item.removeAttribute('aria-current');
  });
}

navigationLinks.forEach(link => link.addEventListener('click', event => {
  const section = document.getElementById(decodeURIComponent(link.hash.slice(1)));
  if (!section) return;
  event.preventDefault();
  history.pushState(null, '', link.hash);
  activateNavigation(link);
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

window.addEventListener('popstate', () => {
  const link = navigationLinks.find(item => item.hash === window.location.hash) || navigationLinks[0];
  activateNavigation(link);
});

activateNavigation(navigationLinks.find(link => link.hash === window.location.hash) || navigationLinks[0]);

async function api(path, options = {}) {
  const response = await fetch(new URL(path.replace(/^\/+/, ''), document.baseURI), {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const data = response.status === 204 ? null : await response.json();
  if (response.status === 401) { window.location.assign(new URL('login', document.baseURI)); throw new Error('Sessione scaduta.'); }
  if (!response.ok) throw new Error(data?.error || `Richiesta non riuscita (${response.status}).`);
  return data;
}

document.querySelector('#logout').addEventListener('click', async () => {
  try { await fetch(new URL('api/auth/logout', document.baseURI), { method: 'POST' }); }
  finally { window.location.assign(new URL('login', document.baseURI)); }
});

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

const accessLogReasons = {
  OPENED: 'Comando di apertura inviato',
  GATE_NOT_FOUND: 'Varco inesistente',
  READER_GATE_MISMATCH: 'Varco non assegnato al lettore',
  GATE_DISABLED: 'Varco disabilitato',
  INVALID_DIRECTION: 'Direzione non valida',
  UNKNOWN_TAG: 'Badge sconosciuto',
  TOKEN_DISABLED: 'Badge disabilitato',
  USER_DISABLED: 'Utente disabilitato',
  USER_NOT_AUTHORIZED_FOR_GATE: 'Utente non autorizzato al varco',
  NO_ACTIVE_ACCESS_RULE: 'Nessuna regola di accesso valida',
  RELAY_ERROR: 'Errore nell’attivazione del dispositivo'
};

function renderAccessLogs(logs, append = false) {
  const body = document.querySelector('#access-logs-body');
  if (!logs.length && !append && accessLogOffset === 0) {
    body.innerHTML = '<tr><td colspan="7" class="empty">Nessun evento corrisponde ai filtri selezionati.</td></tr>';
    return;
  }
  const rows = logs.map(log => {
    const timestamp = new Date(`${String(log.timestamp).replace(' ', 'T')}Z`);
    const formattedTimestamp = Number.isNaN(timestamp.getTime()) ? log.timestamp : timestamp.toLocaleString('it-IT');
    const userName = [log.first_name, log.last_name].filter(Boolean).join(' ') || 'Utente non identificato';
    const identity = log.token_value ? `${userName} · ${log.token_value}` : userName;
    const direction = ({ ENTRY: 'Ingresso', EXIT: 'Uscita' })[log.direction] || '—';
    const result = log.result === 'GRANTED' ? 'Consentito' : 'Negato';
    const reason = accessLogReasons[log.reason] || log.reason || '—';
    const gateName = log.gate_name ? `${log.gate_name} · #${log.gate_id}` : '—';
    return `<tr><td>${escapeHtml(formattedTimestamp)}</td><td><span class="status ${log.result === 'GRANTED' ? 'enabled' : 'disabled'}">${result}</span></td><td>${escapeHtml(identity)}</td><td>${escapeHtml(gateName)}</td><td>${direction}</td><td>${escapeHtml(log.reader_name || '—')}</td><td>${escapeHtml(reason)}</td></tr>`;
  }).join('');
  if (append) body.insertAdjacentHTML('beforeend', rows);
  else body.innerHTML = rows;
}

async function loadAccessLogs({ reset = false } = {}) {
  const status = document.querySelector('#logs-status');
  const loadMore = document.querySelector('#load-more-logs');
  if (reset) { accessLogOffset = 0; accessLogsExhausted = false; }
  const requestVersion = ++accessLogRequestVersion;
  const parameters = new URLSearchParams({ limit: String(accessLogPageSize), offset: String(accessLogOffset) });
  const name = document.querySelector('#log-name-filter').value.trim();
  const dateFrom = document.querySelector('#log-date-from').value;
  const dateTo = document.querySelector('#log-date-to').value;
  const gateId = document.querySelector('#log-gate-filter').value;
  if (name) parameters.set('name', name);
  if (dateFrom) parameters.set('dateFrom', localDateBoundary(dateFrom));
  if (dateTo) parameters.set('dateUntil', localDateBoundary(dateTo, 1));
  if (gateId) parameters.set('gateId', gateId);
  status.textContent = 'Caricamento…';
  loadMore.disabled = true;
  try {
    const logs = await api(`/api/access-logs?${parameters}`);
    if (requestVersion !== accessLogRequestVersion) return;
    renderAccessLogs(logs, accessLogOffset > 0);
    accessLogOffset += logs.length;
    accessLogsExhausted = logs.length < accessLogPageSize;
    status.textContent = accessLogOffset ? `${accessLogOffset} eventi visualizzati` : 'Nessun evento da visualizzare';
    loadMore.hidden = accessLogsExhausted;
  } catch (error) {
    if (requestVersion !== accessLogRequestVersion) return;
    status.textContent = `Impossibile caricare il registro: ${error.message}`;
    if (accessLogOffset === 0) document.querySelector('#access-logs-body').innerHTML = '';
    loadMore.hidden = true;
  } finally {
    if (requestVersion === accessLogRequestVersion) loadMore.disabled = false;
  }
}

function localDateBoundary(value, dayOffset = 0) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day + dayOffset);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function showNotice(message, type = 'success') {
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => { notice.hidden = true; }, 4500);
}

function renderUsers() {
  const query = document.querySelector('#search').value.trim().toLocaleLowerCase('it');
  const filtered = users.filter(user => [
    user.first_name, user.last_name, user.company, user.email, user.phone,
    ...user.tokens.flatMap(token => [token.token, token.description])
  ].filter(Boolean).join(' ').toLocaleLowerCase('it').includes(query));
  document.querySelector('#user-count').textContent = users.length;
  document.querySelector('#token-count').textContent = users.reduce((count, user) => count + user.tokens.filter(token => token.enabled).length, 0);
  const emptyState = document.querySelector('#empty-state');
  emptyState.hidden = filtered.length !== 0;
  emptyState.querySelector('strong').textContent = query ? 'Nessun utente corrispondente' : 'Nessun utente registrato';
  emptyState.querySelector('p').textContent = query ? 'Prova a modificare i termini di ricerca.' : 'Aggiungi un utente per iniziare a configurare gli accessi.';
  document.querySelector('#empty-add').hidden = Boolean(query);
  usersBody.hidden = filtered.length === 0;
  usersBody.innerHTML = filtered.map(user => {
    const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toLocaleUpperCase('it');
    const tokens = user.tokens.length
      ? user.tokens.map(token => `<span class="token-chip" title="${escapeHtml(token.description || '')}">${escapeHtml(token.token)}</span>${token.enabled ? `<button class="text-button danger" data-action="disable-token" data-id="${token.id}" title="Disattiva badge">Disattiva</button>` : '<span class="status disabled">Disattivo</span>'}`).join('')
      : '<span class="token-none">Nessun badge</span>';
    return `<tr>
      <td><div class="user-cell"><span class="avatar">${escapeHtml(initials)}</span><div><div class="user-name">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</div><div class="user-company">${escapeHtml(user.company || 'Privato')}</div></div></div></td>
      <td><div class="contact-email">${escapeHtml(user.email || '—')}</div><div class="user-company">${escapeHtml(user.phone || '')}</div></td>
      <td><div class="token-list">${tokens}<button class="text-button" data-action="add-token" data-id="${user.id}">＋ Associa</button></div></td>
      <td><span class="status ${user.enabled ? 'enabled' : 'disabled'}">${user.enabled ? 'Abilitato' : 'Disabilitato'}</span></td>
      <td><div class="row-actions"><button class="text-button" data-action="access" data-id="${user.id}">Accessi</button><button class="text-button" data-action="edit" data-id="${user.id}">Modifica</button><button class="text-button danger" data-action="delete-user" data-id="${user.id}">Elimina</button></div></td>
    </tr>`;
  }).join('');
}

async function loadUsers() {
  try { users = await api('/api/users'); renderUsers(); }
  catch (error) { usersBody.innerHTML = `<tr><td colspan="5" class="empty">${escapeHtml(error.message)}</td></tr>`; showNotice(error.message, 'error'); }
}

async function loadGates() {
  const container = document.querySelector('#gates-list');
  try {
    gates = await api('/api/gates');
    document.querySelector('#gate-count').textContent = gates.length;
    const gateFilter = document.querySelector('#log-gate-filter');
    gateFilter.replaceChildren(new Option('Tutti i varchi', ''));
    gates.forEach(gate => gateFilter.add(new Option(`${gate.name} · #${gate.id}`, String(gate.id))));
    container.innerHTML = gates.length ? gates.map(gate => `<article class="gate-card"><span class="gate-symbol">⇄</span><div class="gate-info"><div class="gate-name">${escapeHtml(gate.name)} · #${gate.id}</div><div class="gate-direction">${escapeHtml(({ ENTRY: 'Ingresso', EXIT: 'Uscita', BOTH: 'Entrata e uscita' })[gate.direction] || gate.direction)} · ${gate.enabled ? 'Abilitato' : 'Disabilitato'}</div><div class="gate-relay">${gate.ha_service ? `Home Assistant · ${escapeHtml(gate.ha_service)} · ${escapeHtml(gate.ha_entity_id || '')}` : gate.relay_type === 'SHELLY_RPC' ? `Shelly · ${escapeHtml(gate.relay_host || 'host mancante')} · uscita ${gate.relay_channel} · impulso ${gate.pulse_ms} ms` : 'Nessun dispositivo di uscita'}</div></div><button class="text-button" data-gate-edit="${gate.id}">Modifica</button><button class="text-button danger" data-gate-delete="${gate.id}">Elimina</button></article>`).join('') : '<span class="muted">Nessun varco configurato.</span>';
    container.dataset.gates = JSON.stringify(gates);
  } catch { document.querySelector('#gate-count').textContent = '—'; container.innerHTML = '<span class="muted">Impossibile caricare i varchi.</span>'; }
}

async function loadReaders() {
  try {
    readers = await api('/api/readers');
    renderReaders();
  } catch (error) {
    document.querySelector('#readers-list').innerHTML = `<span class="muted">${escapeHtml(error.message)}</span>`;
  }
}

function renderReaders() {
  const container = document.querySelector('#readers-list');
  container.innerHTML = readers.length ? readers.map(reader => {
    const assigned = reader.gateIds.map(id => gates.find(gate => gate.id === id)?.name || `Varco ${id}`).join(', ');
    return `<article class="gate-card reader-card"><span class="gate-symbol">▣</span><div class="gate-info"><div class="gate-name">${escapeHtml(reader.name)} · #${reader.id}</div><div class="gate-direction">${reader.enabled ? 'Abilitato' : 'Disabilitato'}</div><div class="gate-relay">Varchi: ${escapeHtml(assigned || 'nessuno')}</div></div><button class="text-button" data-reader-edit="${reader.id}">Modifica</button>${reader.enabled ? `<button class="text-button danger" data-reader-disable="${reader.id}">Disattiva</button>` : ''}<button class="text-button danger" data-reader-delete="${reader.id}">Elimina</button></article>`;
  }).join('') : '<span class="muted">Nessun lettore registrato.</span>';
}

const gateDialog = document.querySelector('#gate-dialog');
const gateForm = document.querySelector('#gate-form');

function updateRelayFields() {
  const outputType = gateForm.elements.relayType.value;
  const usesShelly = outputType === 'SHELLY_RPC';
  const usesHomeAssistant = outputType === 'HOME_ASSISTANT';
  gateForm.querySelectorAll('.relay-field').forEach(field => { field.hidden = !usesShelly; });
  gateForm.querySelectorAll('.ha-field').forEach(field => { field.hidden = !usesHomeAssistant; });
  gateForm.elements.relayHost.required = usesShelly;
  gateForm.elements.haService.required = usesHomeAssistant;
  gateForm.elements.haEntityId.required = usesHomeAssistant;
}

function openGateForm(gate = null) {
  gateForm.reset();
  gateForm.elements.id.value = gate?.id || '';
  gateForm.elements.name.value = gate?.name || '';
  gateForm.elements.direction.value = gate?.direction || 'ENTRY';
  gateForm.elements.relayType.value = gate?.ha_service ? 'HOME_ASSISTANT' : gate?.relay_type || 'NONE';
  gateForm.elements.relayHost.value = gate?.relay_host || '';
  gateForm.elements.relayChannel.value = gate?.relay_channel ?? 0;
  gateForm.elements.pulseMs.value = gate?.pulse_ms ?? 1000;
  gateForm.elements.haService.value = gate?.ha_service || 'switch.turn_on';
  gateForm.elements.haEntityId.value = gate?.ha_entity_id || '';
  gateForm.elements.notes.value = gate?.notes || '';
  gateForm.elements.enabled.checked = gate ? Boolean(gate.enabled) : true;
  document.querySelector('#gate-dialog-title').textContent = gate ? 'Modifica varco' : 'Nuovo varco';
  updateRelayFields();
  gateDialog.showModal();
}

document.querySelector('#new-gate').addEventListener('click', () => openGateForm());
document.querySelector('#close-gate').addEventListener('click', () => gateDialog.close());
document.querySelector('#cancel-gate').addEventListener('click', () => gateDialog.close());
gateForm.elements.relayType.addEventListener('change', updateRelayFields);
document.querySelector('#gates-list').addEventListener('click', event => {
  const button = event.target.closest('[data-gate-edit]');
  if (button) {
    const gates = JSON.parse(event.currentTarget.dataset.gates || '[]');
    openGateForm(gates.find(gate => gate.id === Number(button.dataset.gateEdit)));
    return;
  }
  const remove = event.target.closest('[data-gate-delete]');
  if (!remove) return;
  const gate = gates.find(item => item.id === Number(remove.dataset.gateDelete));
  if (!gate || !window.confirm(`Eliminare definitivamente il varco “${gate.name} · #${gate.id}”? Saranno rimosse anche le assegnazioni a utenti e lettori. I log di accesso resteranno, senza il collegamento al varco. L’operazione non si può annullare.`)) return;
  api(`/api/gates/${gate.id}`, { method: 'DELETE' }).then(async () => {
    await loadGates(); renderReaders(); showNotice('Varco eliminato.');
  }).catch(error => showNotice(error.message, 'error'));
});
gateForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = gateForm.elements.id.value;
  const data = Object.fromEntries(new FormData(gateForm));
  data.enabled = gateForm.elements.enabled.checked;
  data.relayChannel = Number(data.relayChannel);
  data.pulseMs = Number(data.pulseMs);
  try {
    await api(id ? `/api/gates/${id}` : '/api/gates', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    gateDialog.close();
    showNotice(id ? 'Varco aggiornato.' : 'Varco creato.');
    await loadGates();
    renderReaders();
  } catch (error) { showNotice(error.message, 'error'); }
});

const readerDialog = document.querySelector('#reader-dialog');
const readerForm = document.querySelector('#reader-form');
readerDialog.addEventListener('close', () => { document.querySelector('#reader-secret-value').value = ''; });

function renderReaderGateOptions(selectedIds = []) {
  const container = document.querySelector('#reader-gate-options');
  if (!gates.length) {
    container.innerHTML = '<p class="rules-empty">Configura prima almeno un varco.</p>';
    return;
  }
  const selected = new Set(selectedIds);
  container.innerHTML = gates.map(gate => `<label class="gate-option ${gate.enabled ? '' : 'gate-option-disabled'}"><input type="checkbox" value="${gate.id}" ${selected.has(gate.id) ? 'checked' : ''}><span><strong>${escapeHtml(gate.name)}</strong><small>${escapeHtml(({ ENTRY: 'Ingresso', EXIT: 'Uscita', BOTH: 'Entrata e uscita' })[gate.direction] || gate.direction)}${gate.enabled ? '' : ' · varco disabilitato'}</small></span></label>`).join('');
}

function openReaderForm(reader = null) {
  readerForm.reset();
  readerForm.elements.id.value = reader?.id || '';
  readerForm.elements.name.value = reader?.name || '';
  readerForm.elements.enabled.checked = reader ? Boolean(reader.enabled) : true;
  document.querySelector('#reader-enabled-wrap').hidden = !reader;
  document.querySelector('#reader-dialog-title').textContent = reader ? 'Modifica lettore' : 'Registra lettore';
  renderReaderGateOptions(reader?.gateIds || []);
  document.querySelector('#reader-secret').hidden = true;
  readerForm.hidden = false;
  readerDialog.showModal();
}

document.querySelector('#new-reader').addEventListener('click', () => openReaderForm());
document.querySelector('#close-reader').addEventListener('click', () => readerDialog.close());
document.querySelector('#cancel-reader').addEventListener('click', () => readerDialog.close());
document.querySelector('#finish-reader').addEventListener('click', () => readerDialog.close());
document.querySelector('#copy-reader-secret').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#reader-secret-value').value);
    showNotice('Credenziale copiata negli appunti.');
  } catch { showNotice('Copia non disponibile: seleziona e copia la credenziale manualmente.', 'error'); }
});
document.querySelector('#readers-list').addEventListener('click', async event => {
  const edit = event.target.closest('[data-reader-edit]');
  const disable = event.target.closest('[data-reader-disable]');
  const remove = event.target.closest('[data-reader-delete]');
  if (edit) {
    const reader = readers.find(item => item.id === Number(edit.dataset.readerEdit));
    if (reader) openReaderForm(reader);
  }
  if (disable) {
    const reader = readers.find(item => item.id === Number(disable.dataset.readerDisable));
    if (!reader || !window.confirm(`Disattivare il lettore “${reader.name}”? Le sue richieste HTTPS verranno rifiutate.`)) return;
    try { await api(`/api/readers/${reader.id}`, { method: 'DELETE' }); await loadReaders(); showNotice('Lettore disattivato.'); }
    catch (error) { showNotice(error.message, 'error'); }
  }
  if (remove) {
    const reader = readers.find(item => item.id === Number(remove.dataset.readerDelete));
    if (!reader || !window.confirm(`Eliminare definitivamente il lettore “${reader.name} · #${reader.id}”? La sua credenziale verrà revocata e i log resteranno senza il collegamento al lettore. L’operazione non si può annullare.`)) return;
    try { await api(`/api/readers/${reader.id}`, { method: 'DELETE' }); await loadReaders(); showNotice('Lettore eliminato.'); }
    catch (error) { showNotice(error.message, 'error'); }
  }
});

readerForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = readerForm.elements.id.value;
  const gateIds = [...document.querySelectorAll('#reader-gate-options input:checked')].map(input => Number(input.value));
  if (!gateIds.length) { window.alert('Associa almeno un varco al lettore.'); return; }
  const data = { name: readerForm.elements.name.value, gateIds, enabled: readerForm.elements.enabled.checked };
  try {
    const saved = await api(id ? `/api/readers/${id}` : '/api/readers', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    await loadReaders();
    if (!id) {
      readerForm.hidden = true;
      document.querySelector('#reader-secret-value').value = saved.credential;
      document.querySelector('#reader-secret').hidden = false;
    } else {
      readerDialog.close(); showNotice('Lettore aggiornato.');
    }
  } catch (error) { showNotice(error.message, 'error'); }
});

function openNewUser() {
  userForm.reset();
  document.querySelector('#user-id').value = '';
  document.querySelector('#enabled-wrap').hidden = true;
  document.querySelector('#dialog-title').textContent = 'Nuovo utente';
  userDialog.showModal();
}

function openEditUser(user) {
  userForm.reset();
  document.querySelector('#user-id').value = user.id;
  for (const field of ['firstName', 'lastName', 'company', 'phone', 'email', 'notes']) {
    const key = field === 'firstName' ? 'first_name' : field === 'lastName' ? 'last_name' : field;
    userForm.elements[field].value = user[key] || '';
  }
  userForm.elements.enabled.checked = Boolean(user.enabled);
  document.querySelector('#enabled-wrap').hidden = false;
  document.querySelector('#dialog-title').textContent = 'Modifica utente';
  userDialog.showModal();
}

const weekdayNames = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

function renderAccessRules(user) {
  const rules = user.accessRules || [];
  const rulesList = document.querySelector('#rules-list');
  rulesList.innerHTML = rules.length ? rules.map(rule => `<article class="rule-card ${rule.enabled ? '' : 'rule-disabled'}"><div class="rule-card-heading"><div><strong>${escapeHtml(rule.name)}</strong><p>Dal ${escapeHtml(rule.valid_from)}${rule.valid_until ? ` al ${escapeHtml(rule.valid_until)}` : ' · senza scadenza'}</p></div>${rule.enabled ? `<button class="text-button danger" data-rule-action="disable" data-id="${rule.id}">Disattiva regola</button>` : '<span class="status disabled">Disattivata</span>'}</div>${rule.schedules?.length ? `<ul class="schedule-list">${rule.schedules.map(schedule => `<li><span>${weekdayNames[schedule.day_of_week - 1]}</span><time>${escapeHtml(schedule.time_from)} – ${escapeHtml(schedule.time_until)}</time><button class="text-button danger" data-schedule-action="delete" data-id="${schedule.id}" aria-label="Elimina fascia">Elimina</button></li>`).join('')}</ul>` : '<p class="no-schedules">Nessuna fascia oraria: la regola non limita l’accesso a giorni e orari specifici.</p>'}</article>`).join('') : '<div class="rules-empty">Nessuna regola di accesso. Crea una regola per assegnare i permessi a questa persona.</div>';
  const enabledRules = rules.filter(rule => rule.enabled);
  const select = document.querySelector('#schedule-form [name="ruleId"]');
  select.innerHTML = enabledRules.map(rule => `<option value="${rule.id}">${escapeHtml(rule.name)}</option>`).join('');
  document.querySelector('#schedule-form button[type="submit"]').disabled = enabledRules.length === 0;
}

function renderUserGateOptions(user) {
  const container = document.querySelector('#user-gate-options');
  if (!gates.length) {
    container.innerHTML = '<p class="rules-empty">Prima configura almeno un varco nella sezione Varchi.</p>';
    document.querySelector('#save-user-gates').disabled = true;
    return;
  }
  document.querySelector('#save-user-gates').disabled = false;
  const assigned = new Set(user.gateIds || []);
  container.innerHTML = gates.map(gate => `<label class="gate-option ${gate.enabled ? '' : 'gate-option-disabled'}"><input type="checkbox" value="${gate.id}" ${assigned.has(gate.id) ? 'checked' : ''}><span><strong>${escapeHtml(gate.name)}</strong><small>${escapeHtml(({ ENTRY: 'Ingresso', EXIT: 'Uscita', BOTH: 'Entrata e uscita' })[gate.direction] || gate.direction)}${gate.enabled ? '' : ' · varco disabilitato'}</small></span></label>`).join('');
}

async function openAccess(user) {
  activeAccessUserId = user.id;
  document.querySelector('#access-user-name').textContent = `${user.first_name} ${user.last_name}`;
  renderUserGateOptions(user);
  renderAccessRules(user);
  document.querySelector('#rule-form [name="validFrom"]').value = new Date().toISOString().slice(0, 10);
  accessDialog.showModal();
}

function refreshAccessDialog() {
  const user = users.find(item => item.id === activeAccessUserId);
  if (user) { renderUserGateOptions(user); renderAccessRules(user); }
}

document.querySelector('#new-user').addEventListener('click', openNewUser);
document.querySelector('#empty-add').addEventListener('click', openNewUser);
document.querySelector('#close-dialog').addEventListener('click', () => userDialog.close());
document.querySelector('#cancel-dialog').addEventListener('click', () => userDialog.close());
document.querySelector('#search').addEventListener('input', renderUsers);
document.querySelector('#refresh-logs').addEventListener('click', () => loadAccessLogs({ reset: true }));
document.querySelector('#load-more-logs').addEventListener('click', () => loadAccessLogs());
document.querySelector('#log-name-filter').addEventListener('input', () => {
  window.clearTimeout(logFilterTimer);
  logFilterTimer = window.setTimeout(() => loadAccessLogs({ reset: true }), 250);
});
for (const filterId of ['log-date-from', 'log-date-to', 'log-gate-filter']) {
  document.querySelector(`#${filterId}`).addEventListener('change', () => loadAccessLogs({ reset: true }));
}
document.querySelector('#clear-log-filters').addEventListener('click', () => {
  window.clearTimeout(logFilterTimer);
  document.querySelector('#log-name-filter').value = '';
  document.querySelector('#log-date-from').value = '';
  document.querySelector('#log-date-to').value = '';
  document.querySelector('#log-gate-filter').value = '';
  loadAccessLogs({ reset: true });
});

userForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(userForm);
  const id = document.querySelector('#user-id').value;
  const data = Object.fromEntries(['firstName', 'lastName', 'company', 'phone', 'email', 'notes'].map(key => [key, form.get(key)]));
  if (id) data.enabled = userForm.elements.enabled.checked;
  try {
    await api(id ? `/api/users/${id}` : '/api/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    userDialog.close();
    showNotice(id ? 'Dati utente aggiornati.' : 'Utente creato.');
    await loadUsers();
  } catch (error) { showNotice(error.message, 'error'); }
});

usersBody.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const user = users.find(item => item.id === Number(button.dataset.id));
  try {
    if (button.dataset.action === 'edit' && user) openEditUser(user);
    if (button.dataset.action === 'access' && user) openAccess(user);
    if (button.dataset.action === 'add-token' && user) {
      const form = document.querySelector('#token-form');
      form.reset(); form.elements.userId.value = user.id;
      document.querySelector('#token-user-name').textContent = `${user.first_name} ${user.last_name}`;
      tokenDialog.showModal();
    }
    if (button.dataset.action === 'disable-token') {
      await api(`/api/tokens/${button.dataset.id}`, { method: 'DELETE' });
      showNotice('Badge disattivato.');
      await loadUsers();
    }
    if (button.dataset.action === 'delete-user' && user) {
      const details = [
        `${user.tokens.length} badge`,
        `${user.accessRules.length} regole di accesso`,
        `${user.vehicle_count || 0} veicoli`
      ].join(', ');
      if (!window.confirm(`Eliminare definitivamente ${user.first_name} ${user.last_name}? Saranno eliminati anche i dati collegati (${details}). Le righe del registro accessi resteranno, ma senza il collegamento all’utente. L’operazione non si può annullare.`)) return;
      await api(`/api/users/${user.id}`, { method: 'DELETE' });
      showNotice('Utente e dati collegati eliminati. Il registro accessi è stato conservato.');
      await loadUsers();
    }
  } catch (error) { showNotice(error.message, 'error'); }
});

document.querySelectorAll('[data-close-token]').forEach(button => button.addEventListener('click', () => tokenDialog.close()));
document.querySelector('#token-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api(`/api/users/${form.elements.userId.value}/tokens`, { method: 'POST', body: JSON.stringify({ token: form.elements.token.value, description: form.elements.description.value }) });
    tokenDialog.close(); showNotice('Badge associato all’utente.'); await loadUsers();
  } catch (error) { showNotice(error.message, 'error'); }
});

document.querySelector('#close-access').addEventListener('click', () => accessDialog.close());
document.querySelector('#save-user-gates').addEventListener('click', async () => {
  const gateIds = [...document.querySelectorAll('#user-gate-options input:checked')].map(input => Number(input.value));
  try {
    await api(`/api/users/${activeAccessUserId}/gates`, { method: 'PUT', body: JSON.stringify({ gateIds }) });
    showNotice('Varchi autorizzati aggiornati.');
    await loadUsers();
    refreshAccessDialog();
  } catch (error) { showNotice(error.message, 'error'); }
});
document.querySelector('#rules-list').addEventListener('click', async event => {
  const button = event.target.closest('button[data-rule-action], button[data-schedule-action]');
  if (!button) return;
  try {
    if (button.dataset.ruleAction === 'disable') {
      if (!window.confirm('Disattivare questa regola di accesso?')) return;
      await api(`/api/access-rules/${button.dataset.id}`, { method: 'DELETE' });
    } else if (button.dataset.scheduleAction === 'delete') {
      if (!window.confirm('Eliminare questa fascia oraria?')) return;
      await api(`/api/schedules/${button.dataset.id}`, { method: 'DELETE' });
    }
    await loadUsers(); refreshAccessDialog();
  } catch (error) { showNotice(error.message, 'error'); }
});

document.querySelector('#rule-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api(`/api/users/${activeAccessUserId}/access-rules`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset(); form.elements.validFrom.value = new Date().toISOString().slice(0, 10);
    await loadUsers(); refreshAccessDialog(); showNotice('Regola di accesso creata.');
  } catch (error) { showNotice(error.message, 'error'); }
});

document.querySelector('#schedule-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api(`/api/access-rules/${form.elements.ruleId.value}/schedules`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    await loadUsers(); refreshAccessDialog(); showNotice('Fascia oraria aggiunta.');
  } catch (error) { showNotice(error.message, 'error'); }
});

async function start() {
await Promise.all([loadUsers(), loadGates(), loadReaders(), loadAccessLogs({ reset: true })]);
renderReaders();
}

start();
