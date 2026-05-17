/**
 * Contractor Growth OS — Web Chat Widget
 * Plain TypeScript · No framework deps · Shadow DOM isolated
 * Bundle target: <30KB gzipped
 */

interface WidgetConfig {
	org_name: string;
	logo_url: string | null;
	primary_color: string;
	intro_message: string;
	offline_message: string;
	webchat_mode: 'instant' | 'asynchronous';
}

interface WidgetMessage {
	id: string;
	body: string;
	// Authoritative for ordering and cursor advancement. Always present
	// for server-persisted messages; optimistic visitor messages set this
	// to "now" until the POST confirms.
	created_at: string;
	// Display-only timestamp. Falls back to created_at when null.
	sent_at: string;
	// 'outbound' = contractor → render as 'in' (incoming bubble)
	// 'inbound'  = visitor    → render as 'out' (outgoing bubble)
	direction: 'inbound' | 'outbound';
}

interface SessionState {
	session_id: string;
	session_token: string;
	config: WidgetConfig;
	messages: WidgetMessage[];
}

(function () {
	const scriptEl = document.currentScript as HTMLScriptElement | null;
	const widgetToken = scriptEl?.getAttribute('data-widget-token');
	if (!widgetToken) {
		console.warn('[WebChat] Missing data-widget-token attribute.');
		return;
	}

	const BASE = scriptEl?.src ? new URL(scriptEl.src).origin : window.location.origin;
	const SESSION_KEY = `wc_session_${widgetToken}`;
	const CURSOR_KEY = `wc_cursor_${widgetToken}`;

	let session: SessionState | null = null;
	let open = false;
	let sseSource: EventSource | null = null;
	let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;

	function loadCursor(): string | null {
		try {
			return localStorage.getItem(CURSOR_KEY);
		} catch {
			return null;
		}
	}

	function saveCursor(iso: string) {
		try {
			const prev = loadCursor();
			if (!prev || iso > prev) localStorage.setItem(CURSOR_KEY, iso);
		} catch { /* ignore */ }
	}

	function clearCursor() {
		try {
			localStorage.removeItem(CURSOR_KEY);
		} catch { /* ignore */ }
	}

	let shadow: ShadowRoot | null = null;
	let panelEl: HTMLDivElement | null = null;
	let bodyEl: HTMLDivElement | null = null;
	let btnEl: HTMLButtonElement | null = null;
	let composerEl: HTMLDivElement | null = null;

	// ── Styles (scoped inside Shadow DOM, cannot leak in/out) ───────────────

	function buildStyles(primary: string) {
		return `
:host, .wc-host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
button { font: inherit; cursor: pointer; }
input, textarea { font: inherit; }

.wc-launcher {
	position: fixed; bottom: 24px; right: 24px;
	width: 60px; height: 60px; border-radius: 50%;
	background: linear-gradient(135deg, ${primary} 0%, ${shadeColor(primary, -18)} 100%);
	border: none;
	box-shadow: 0 10px 30px ${hexToRgba(primary, 0.35)}, 0 4px 10px rgba(15, 23, 42, 0.12);
	display: flex; align-items: center; justify-content: center;
	z-index: 2147483646;
	transition: transform .22s cubic-bezier(.2,.9,.3,1.4), box-shadow .22s ease;
	color: #fff;
}
.wc-launcher:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 14px 36px ${hexToRgba(primary, 0.45)}, 0 6px 14px rgba(15, 23, 42, 0.18); }
.wc-launcher:active { transform: translateY(0) scale(.98); }
.wc-launcher .wc-icon { width: 28px; height: 28px; transition: opacity .18s, transform .22s; }
.wc-launcher .wc-icon-close { position: absolute; opacity: 0; transform: rotate(-45deg) scale(.6); }
.wc-launcher[data-open="true"] .wc-icon-chat { opacity: 0; transform: rotate(45deg) scale(.6); }
.wc-launcher[data-open="true"] .wc-icon-close { opacity: 1; transform: rotate(0) scale(1); }

.wc-panel {
	position: fixed; bottom: 100px; right: 24px;
	width: 380px; max-width: calc(100vw - 32px);
	height: 600px; max-height: calc(100vh - 130px);
	background: #ffffff;
	border-radius: 20px;
	box-shadow: 0 30px 80px rgba(15, 23, 42, 0.18), 0 12px 30px rgba(15, 23, 42, 0.10), 0 0 0 1px rgba(15, 23, 42, 0.04);
	display: flex; flex-direction: column;
	z-index: 2147483645;
	overflow: hidden;
	opacity: 0;
	transform: translateY(16px) scale(.98);
	transform-origin: bottom right;
	pointer-events: none;
	transition: opacity .22s ease, transform .26s cubic-bezier(.2,.9,.3,1.2);
}
.wc-panel[data-open="true"] { opacity: 1; transform: translateY(0) scale(1); pointer-events: all; }

@media (max-width: 480px) {
	.wc-panel { right: 12px; left: 12px; bottom: 92px; width: auto; max-width: none; height: calc(100vh - 110px); border-radius: 18px; }
	.wc-launcher { bottom: 18px; right: 18px; width: 56px; height: 56px; }
}

.wc-header {
	position: relative;
	padding: 22px 20px 22px;
	background: linear-gradient(135deg, ${primary} 0%, ${shadeColor(primary, -22)} 100%);
	color: #fff;
	display: flex; align-items: center; gap: 12px;
	flex-shrink: 0;
}
.wc-header::after {
	content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 24px;
	background: linear-gradient(to bottom, ${hexToRgba(primary, 0)} 0%, ${hexToRgba(primary, 0)} 100%);
	pointer-events: none;
}
.wc-logo { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: rgba(255,255,255,.22); flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
.wc-logo-placeholder { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,.22); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
.wc-header-text { flex: 1; min-width: 0; }
.wc-org-name { font-size: 15px; font-weight: 600; letter-spacing: -.01em; line-height: 1.2; display: block; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
.wc-org-status { font-size: 12px; opacity: .85; margin-top: 2px; display: flex; align-items: center; gap: 6px; }
.wc-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 0 2px rgba(74, 222, 128, .25); }
.wc-close {
	background: rgba(255,255,255,.16);
	border: none; color: #fff;
	width: 32px; height: 32px; border-radius: 10px;
	display: flex; align-items: center; justify-content: center;
	transition: background .15s;
}
.wc-close:hover { background: rgba(255,255,255,.28); }

.wc-body {
	flex: 1; overflow-y: auto; overflow-x: hidden;
	padding: 20px 18px 12px;
	display: flex; flex-direction: column; gap: 10px;
	background: linear-gradient(to bottom, #fafbfc 0%, #ffffff 100%);
	scroll-behavior: smooth;
}
.wc-body::-webkit-scrollbar { width: 6px; }
.wc-body::-webkit-scrollbar-track { background: transparent; }
.wc-body::-webkit-scrollbar-thumb { background: rgba(15, 23, 42, .12); border-radius: 999px; }
.wc-body::-webkit-scrollbar-thumb:hover { background: rgba(15, 23, 42, .22); }

.wc-form { padding: 24px 22px 22px; display: flex; flex-direction: column; gap: 14px; background: #ffffff; }
.wc-form-intro { font-size: 14px; color: #475569; line-height: 1.55; }
.wc-field { display: flex; flex-direction: column; gap: 6px; }
.wc-label { font-size: 12px; font-weight: 500; color: #475569; letter-spacing: .01em; }
.wc-label::after { content: ' *'; color: ${primary}; }
.wc-input {
	width: 100%; padding: 12px 14px;
	background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
	color: #0f172a; font-size: 14px;
	outline: none;
	transition: border-color .15s, background .15s, box-shadow .15s;
}
.wc-input::placeholder { color: #94a3b8; }
.wc-input:hover { border-color: #cbd5e1; }
.wc-input:focus { border-color: ${primary}; background: #fff; box-shadow: 0 0 0 4px ${hexToRgba(primary, 0.12)}; }

.wc-submit {
	width: 100%; padding: 13px;
	background: linear-gradient(135deg, ${primary} 0%, ${shadeColor(primary, -18)} 100%);
	color: #fff; border: none; border-radius: 12px;
	font-size: 14px; font-weight: 600; letter-spacing: .01em;
	display: flex; align-items: center; justify-content: center; gap: 8px;
	box-shadow: 0 6px 16px ${hexToRgba(primary, 0.32)};
	transition: transform .15s, box-shadow .15s, opacity .15s;
}
.wc-submit:hover { transform: translateY(-1px); box-shadow: 0 8px 20px ${hexToRgba(primary, 0.42)}; }
.wc-submit:active { transform: translateY(0); }
.wc-submit:disabled { opacity: .6; cursor: not-allowed; transform: none; box-shadow: 0 4px 10px ${hexToRgba(primary, 0.22)}; }

.wc-error { font-size: 12.5px; color: #dc2626; padding: 6px 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; display: none; }
.wc-error.wc-visible { display: block; }
.wc-mode-hint { font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5; padding-top: 4px; }

.wc-msg-row { display: flex; max-width: 100%; animation: wcSlideIn .26s cubic-bezier(.2,.9,.3,1.2); }
.wc-msg-row.wc-in { justify-content: flex-start; }
.wc-msg-row.wc-out { justify-content: flex-end; }
.wc-msg {
	max-width: 82%;
	padding: 10px 14px;
	font-size: 14px; line-height: 1.45; word-wrap: break-word; overflow-wrap: break-word;
	position: relative;
}
.wc-msg-in .wc-msg {
	background: #f1f5f9; color: #0f172a;
	border-radius: 16px 16px 16px 4px;
	box-shadow: 0 1px 2px rgba(15, 23, 42, .05);
}
.wc-msg-out .wc-msg {
	background: linear-gradient(135deg, ${primary} 0%, ${shadeColor(primary, -12)} 100%);
	color: #fff;
	border-radius: 16px 16px 4px 16px;
	box-shadow: 0 2px 6px ${hexToRgba(primary, 0.25)};
}
.wc-msg-time { font-size: 10.5px; opacity: .65; display: block; margin-top: 4px; letter-spacing: .02em; }

@keyframes wcSlideIn {
	from { opacity: 0; transform: translateY(8px); }
	to { opacity: 1; transform: translateY(0); }
}

.wc-intro-bubble {
	margin-bottom: 8px;
	padding: 14px 16px;
	background: #f1f5f9;
	border-radius: 16px 16px 16px 4px;
	font-size: 14px; line-height: 1.5; color: #0f172a;
	align-self: flex-start;
	max-width: 88%;
}

.wc-composer {
	display: flex; align-items: flex-end; gap: 8px;
	padding: 12px 14px 14px;
	background: #ffffff;
	border-top: 1px solid #e2e8f0;
	flex-shrink: 0;
}
.wc-textarea {
	flex: 1; padding: 11px 14px;
	background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px;
	color: #0f172a; font-size: 14px; line-height: 1.4;
	resize: none; outline: none;
	max-height: 120px; min-height: 42px;
	transition: border-color .15s, background .15s, box-shadow .15s;
	font-family: inherit;
}
.wc-textarea::placeholder { color: #94a3b8; }
.wc-textarea:focus { border-color: ${primary}; background: #fff; box-shadow: 0 0 0 4px ${hexToRgba(primary, 0.12)}; }
.wc-send {
	width: 42px; height: 42px; flex-shrink: 0;
	background: linear-gradient(135deg, ${primary} 0%, ${shadeColor(primary, -18)} 100%);
	color: #fff; border: none; border-radius: 12px;
	display: flex; align-items: center; justify-content: center;
	box-shadow: 0 4px 10px ${hexToRgba(primary, 0.28)};
	transition: transform .15s, box-shadow .15s, opacity .15s;
}
.wc-send:hover { transform: translateY(-1px); box-shadow: 0 6px 14px ${hexToRgba(primary, 0.38)}; }
.wc-send:active { transform: translateY(0); }
.wc-send:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.wc-send svg { width: 18px; height: 18px; }

.wc-branding {
	text-align: center; padding: 8px 0 10px;
	font-size: 11px; color: #94a3b8; background: #ffffff;
	border-top: 1px solid #f1f5f9;
	flex-shrink: 0;
}
.wc-branding a { color: #64748b; text-decoration: none; font-weight: 500; }
.wc-branding a:hover { color: ${primary}; }
`;
	}

	// ── Color helpers ───────────────────────────────────────────────────────

	function hexToRgba(hex: string, alpha: number): string {
		const h = hex.replace('#', '');
		const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
		const r = parseInt(full.substring(0, 2), 16);
		const g = parseInt(full.substring(2, 4), 16);
		const b = parseInt(full.substring(4, 6), 16);
		if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(99, 102, 241, ${alpha})`;
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	function shadeColor(hex: string, percent: number): string {
		const h = hex.replace('#', '');
		const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
		let r = parseInt(full.substring(0, 2), 16);
		let g = parseInt(full.substring(2, 4), 16);
		let b = parseInt(full.substring(4, 6), 16);
		if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
		r = Math.max(0, Math.min(255, Math.round(r + (r * percent) / 100)));
		g = Math.max(0, Math.min(255, Math.round(g + (g * percent) / 100)));
		b = Math.max(0, Math.min(255, Math.round(b + (b * percent) / 100)));
		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
	}

	// ── Icon SVGs ───────────────────────────────────────────────────────────

	const chatIcon = `<svg class="wc-icon wc-icon-chat" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
	const closeIcon = `<svg class="wc-icon wc-icon-close" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
	const closeIconSmall = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
	const sendIcon = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
	const logoIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="rgba(255,255,255,.95)"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 5a3 3 0 1 1-3 3 3 3 0 0 1 3-3zm0 13a7 7 0 0 1-5.6-2.8c0-1.86 3.73-2.88 5.6-2.88s5.6 1 5.6 2.88A7 7 0 0 1 12 20z"/></svg>`;

	// ── DOM construction ────────────────────────────────────────────────────

	function createHost(): ShadowRoot {
		const host = document.createElement('div');
		host.id = 'contractor-os-webchat';
		host.style.cssText = 'all: initial; position: fixed; width: 0; height: 0; z-index: 2147483646;';
		document.body.appendChild(host);
		return host.attachShadow({ mode: 'open' });
	}

	function renderLauncher(): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.className = 'wc-launcher';
		btn.setAttribute('aria-label', 'Open chat');
		btn.setAttribute('type', 'button');
		btn.innerHTML = chatIcon + closeIcon;
		btn.addEventListener('click', togglePanel);
		return btn;
	}

	function renderPanel(config: WidgetConfig): HTMLDivElement {
		const panel = document.createElement('div');
		panel.className = 'wc-panel';
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-label', `${config.org_name} chat`);

		const header = document.createElement('div');
		header.className = 'wc-header';

		if (config.logo_url) {
			const logo = document.createElement('img');
			logo.className = 'wc-logo';
			logo.src = config.logo_url;
			logo.alt = config.org_name;
			logo.addEventListener('error', () => {
				const ph = document.createElement('div');
				ph.className = 'wc-logo-placeholder';
				ph.innerHTML = logoIcon;
				logo.replaceWith(ph);
			});
			header.appendChild(logo);
		} else {
			const ph = document.createElement('div');
			ph.className = 'wc-logo-placeholder';
			ph.innerHTML = logoIcon;
			header.appendChild(ph);
		}

		const headerText = document.createElement('div');
		headerText.className = 'wc-header-text';
		const orgName = document.createElement('span');
		orgName.className = 'wc-org-name';
		orgName.textContent = config.org_name;
		headerText.appendChild(orgName);
		const status = document.createElement('span');
		status.className = 'wc-org-status';
		status.innerHTML = `<span class="wc-status-dot"></span><span>${config.webchat_mode === 'instant' ? 'We reply in minutes' : 'We reply by text'}</span>`;
		headerText.appendChild(status);
		header.appendChild(headerText);

		const closeBtn = document.createElement('button');
		closeBtn.className = 'wc-close';
		closeBtn.setAttribute('aria-label', 'Close chat');
		closeBtn.setAttribute('type', 'button');
		closeBtn.innerHTML = closeIconSmall;
		closeBtn.addEventListener('click', togglePanel);
		header.appendChild(closeBtn);

		panel.appendChild(header);

		const body = document.createElement('div');
		body.className = 'wc-body';
		panel.appendChild(body);
		bodyEl = body;

		const branding = document.createElement('div');
		branding.className = 'wc-branding';
		branding.innerHTML = `Powered by <a href="https://contractorgrowth.app" target="_blank" rel="noopener">Contractor Growth OS</a>`;
		panel.appendChild(branding);

		return panel;
	}

	function renderPreChatForm(config: WidgetConfig): HTMLElement {
		const form = document.createElement('div');
		form.className = 'wc-form';

		const intro = document.createElement('p');
		intro.className = 'wc-form-intro';
		intro.textContent = config.intro_message || `Hi! Send us a message and we'll get back to you shortly.`;
		form.appendChild(intro);

		const nameField = document.createElement('div');
		nameField.className = 'wc-field';
		const nameLabel = document.createElement('label');
		nameLabel.className = 'wc-label';
		nameLabel.textContent = 'Your name';
		const nameInput = document.createElement('input');
		nameInput.className = 'wc-input';
		nameInput.type = 'text';
		nameInput.placeholder = 'Jane Smith';
		nameInput.autocomplete = 'name';
		nameField.append(nameLabel, nameInput);
		form.appendChild(nameField);

		const phoneField = document.createElement('div');
		phoneField.className = 'wc-field';
		const phoneLabel = document.createElement('label');
		phoneLabel.className = 'wc-label';
		phoneLabel.textContent = 'Phone number';
		const phoneInput = document.createElement('input');
		phoneInput.className = 'wc-input';
		phoneInput.type = 'tel';
		phoneInput.placeholder = '(555) 123-4567';
		phoneInput.autocomplete = 'tel';
		phoneField.append(phoneLabel, phoneInput);
		form.appendChild(phoneField);

		const errorEl = document.createElement('div');
		errorEl.className = 'wc-error';
		form.appendChild(errorEl);

		const submitBtn = document.createElement('button');
		submitBtn.className = 'wc-submit';
		submitBtn.type = 'button';
		const submitLabel = config.webchat_mode === 'instant' ? 'Start chat' : 'Send message';
		submitBtn.textContent = submitLabel;
		form.appendChild(submitBtn);

		if (config.webchat_mode === 'asynchronous' && config.offline_message) {
			const hint = document.createElement('p');
			hint.className = 'wc-mode-hint';
			hint.textContent = config.offline_message;
			form.appendChild(hint);
		}

		const showError = (msg: string) => {
			errorEl.textContent = msg;
			errorEl.classList.add('wc-visible');
		};
		const hideError = () => errorEl.classList.remove('wc-visible');

		submitBtn.addEventListener('click', async () => {
			const name = nameInput.value.trim();
			const phone = phoneInput.value.trim();
			if (!name || !phone) {
				showError('Please enter your name and phone number.');
				return;
			}
			hideError();
			submitBtn.disabled = true;
			submitBtn.textContent = 'Starting…';
			const err = await startSession(name, phone, config);
			if (err) {
				showError(err);
				submitBtn.disabled = false;
				submitBtn.textContent = submitLabel;
			}
		});

		[nameInput, phoneInput].forEach((el) => {
			el.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					submitBtn.click();
				}
			});
		});

		return form;
	}

	function renderThread() {
		if (!bodyEl || !session || !panelEl) return;
		bodyEl.innerHTML = '';

		if (session.config.intro_message) {
			const intro = document.createElement('div');
			intro.className = 'wc-intro-bubble';
			intro.textContent = session.config.intro_message;
			bodyEl.appendChild(intro);
		}

		for (const msg of session.messages) {
			appendMessage(msg, msg.direction === 'inbound' ? 'out' : 'in');
		}

		if (composerEl) composerEl.remove();
		composerEl = document.createElement('div');
		composerEl.className = 'wc-composer';

		const textarea = document.createElement('textarea');
		textarea.className = 'wc-textarea';
		textarea.placeholder = 'Type your message…';
		textarea.rows = 1;
		composerEl.appendChild(textarea);

		const sendBtn = document.createElement('button');
		sendBtn.className = 'wc-send';
		sendBtn.setAttribute('aria-label', 'Send message');
		sendBtn.setAttribute('type', 'button');
		sendBtn.innerHTML = sendIcon;
		composerEl.appendChild(sendBtn);

		const branding = panelEl.querySelector('.wc-branding');
		if (branding) panelEl.insertBefore(composerEl, branding);
		else panelEl.appendChild(composerEl);

		const send = () => sendMessage(textarea, sendBtn);
		sendBtn.addEventListener('click', send);
		textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				send();
			}
		});
		textarea.addEventListener('input', () => {
			textarea.style.height = 'auto';
			textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
		});

		scrollToBottom();
		setTimeout(() => textarea.focus(), 100);
	}

	function appendMessage(msg: WidgetMessage, direction: 'in' | 'out') {
		if (!bodyEl) return;
		const row = document.createElement('div');
		row.className = `wc-msg-row wc-${direction}`;
		row.dataset.msgId = msg.id;

		const bubble = document.createElement('div');
		bubble.className = 'wc-msg';

		const text = document.createElement('span');
		text.textContent = msg.body;
		bubble.appendChild(text);

		const time = document.createElement('span');
		time.className = 'wc-msg-time';
		time.textContent = formatTime(msg.sent_at);
		bubble.appendChild(time);

		row.appendChild(bubble);
		bodyEl.appendChild(row);
		scrollToBottom();
	}

	function scrollToBottom() {
		if (bodyEl) requestAnimationFrame(() => { bodyEl!.scrollTop = bodyEl!.scrollHeight; });
	}

	function formatTime(iso: string): string {
		try {
			return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
		} catch {
			return '';
		}
	}

	// ── Toggle ──────────────────────────────────────────────────────────────

	function togglePanel() {
		open = !open;
		if (panelEl) panelEl.setAttribute('data-open', String(open));
		if (btnEl) {
			btnEl.setAttribute('data-open', String(open));
			btnEl.setAttribute('aria-label', open ? 'Close chat' : 'Open chat');
		}
		// SSE lifecycle is bound to session existence (see init/startSession),
		// not panel visibility. Minimizing must NOT drop realtime sync.
	}

	// ── Bootstrap ───────────────────────────────────────────────────────────

	async function init() {
		shadow = createHost();

		const stored = localStorage.getItem(SESSION_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as { session_id: string; session_token: string };
				const res = await restoreSession(parsed.session_id, parsed.session_token);
				if (res) {
					session = res;
					// Seed cursor from restored history so SSE resumes from the
					// newest message we already have, not "now".
					for (const m of res.messages) saveCursor(m.created_at);
					mount(session.config);
					renderThread();
					startSSE();
					return;
				}
			} catch { /* invalid */ }
			localStorage.removeItem(SESSION_KEY);
			clearCursor();
		}

		const cfg = await fetchWidgetConfig();
		if (!cfg) return;

		mount(cfg);
		if (bodyEl) bodyEl.appendChild(renderPreChatForm(cfg));
	}

	function mount(config: WidgetConfig) {
		if (!shadow) return;
		const primary = config.primary_color || '#6366f1';
		const style = document.createElement('style');
		style.textContent = buildStyles(primary);
		shadow.appendChild(style);
		btnEl = renderLauncher();
		panelEl = renderPanel(config);
		shadow.appendChild(btnEl);
		shadow.appendChild(panelEl);
	}

	async function fetchWidgetConfig(): Promise<WidgetConfig | null> {
		try {
			const res = await fetch(`${BASE}/api/webchat/config?token=${widgetToken}`);
			if (!res.ok) return null;
			const json = (await res.json()) as { data?: WidgetConfig };
			return json.data ?? null;
		} catch {
			return null;
		}
	}

	async function restoreSession(sessionId: string, sessionToken: string): Promise<SessionState | null> {
		try {
			const res = await fetch(`${BASE}/api/webchat/session/${sessionId}/restore`, {
				headers: { Authorization: `Bearer ${sessionToken}` }
			});
			if (!res.ok) return null;
			const json = (await res.json()) as {
				data?: {
					org_name: string;
					logo_url: string | null;
					primary_color: string;
					intro_message: string;
					offline_message: string;
					webchat_mode: 'instant' | 'asynchronous';
					messages: Array<{
						id: string;
						body: string;
						direction: 'inbound' | 'outbound';
						created_at: string;
						sent_at: string;
					}>;
				};
			};
			if (!json.data) return null;
			return {
				session_id: sessionId,
				session_token: sessionToken,
				config: {
					org_name: json.data.org_name,
					logo_url: json.data.logo_url,
					primary_color: json.data.primary_color,
					intro_message: json.data.intro_message,
					offline_message: json.data.offline_message,
					webchat_mode: json.data.webchat_mode
				},
				messages: json.data.messages
			};
		} catch {
			return null;
		}
	}

	async function startSession(name: string, phone: string, _config: WidgetConfig): Promise<string | null> {
		try {
			const res = await fetch(`${BASE}/api/webchat/session/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ widget_token: widgetToken, name, phone })
			});
			const json = (await res.json()) as {
				data?: {
					session_id: string;
					session_token: string;
					org_name: string;
					primary_color: string;
					logo_url: string | null;
					intro_message: string;
					offline_message: string;
					webchat_mode: 'instant' | 'asynchronous';
				};
				error?: string;
			};
			if (!res.ok || !json.data) {
				if (res.status === 429) return 'Too many requests. Please try again in a moment.';
				return json.error ?? 'Failed to start chat. Please try again.';
			}

			session = {
				session_id: json.data.session_id,
				session_token: json.data.session_token,
				config: {
					org_name: json.data.org_name,
					logo_url: json.data.logo_url,
					primary_color: json.data.primary_color,
					intro_message: json.data.intro_message,
					offline_message: json.data.offline_message,
					webchat_mode: json.data.webchat_mode
				},
				messages: []
			};

			localStorage.setItem(
				SESSION_KEY,
				JSON.stringify({ session_id: session.session_id, session_token: session.session_token })
			);
			// Fresh session — clear any stale cursor from a prior session
			clearCursor();

			renderThread();
			startSSE();
			return null;
		} catch {
			return 'Network error. Please try again.';
		}
	}

	async function sendMessage(textarea: HTMLTextAreaElement, btn: HTMLButtonElement) {
		if (!session) return;
		const body = textarea.value.trim();
		if (!body) return;
		textarea.value = '';
		textarea.style.height = 'auto';
		btn.disabled = true;

		const nowIso = new Date().toISOString();
		const optimisticMsg: WidgetMessage = {
			id: `opt-${Date.now()}`,
			body,
			created_at: nowIso,
			sent_at: nowIso,
			direction: 'inbound'
		};
		session.messages.push(optimisticMsg);
		appendMessage(optimisticMsg, 'out');

		try {
			const res = await fetch(`${BASE}/api/webchat/session/${session.session_id}/messages`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${session.session_token}`
				},
				body: JSON.stringify({ body })
			});
			if (!res.ok) {
				removeOptimistic(optimisticMsg.id);
				textarea.value = body;
			}
		} catch {
			removeOptimistic(optimisticMsg.id);
			textarea.value = body;
		} finally {
			btn.disabled = false;
			textarea.focus();
		}
	}

	function removeOptimistic(id: string) {
		if (!session || !bodyEl) return;
		session.messages = session.messages.filter((m) => m.id !== id);
		const row = bodyEl.querySelector(`.wc-msg-row[data-msg-id="${id}"]`);
		if (row) row.remove();
	}

	function startSSE() {
		if (!session) return;
		stopSSE();
		// Resume from persisted cursor — guarantees no message gap across the
		// 60s max-lifetime cycle, the 3s reconnect window, or a tab reload.
		const since = loadCursor();
		const params = new URLSearchParams({ token: session.session_token });
		if (since) params.set('since', since);
		const url = `${BASE}/api/webchat/session/${session.session_id}/stream?${params}`;
		sseSource = new EventSource(url);
		sseSource.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data) as WidgetMessage;
				if (!session) return;
				// Advance + persist cursor first so a render error can't
				// cause us to re-deliver the same message on next reconnect.
				saveCursor(msg.created_at);
				if (session.messages.some((m) => m.id === msg.id)) return;
				// SSE only pushes contractor (outbound) messages → render 'in'.
				const incoming: WidgetMessage = { ...msg, direction: 'outbound' };
				session.messages.push(incoming);
				appendMessage(incoming, 'in');
			} catch { /* ignore */ }
		};
		sseSource.onerror = () => {
			stopSSE();
			// Reconnect whenever a session exists — independent of panel state.
			sseReconnectTimer = setTimeout(() => {
				if (session) startSSE();
			}, 3000);
		};
	}

	function stopSSE() {
		if (sseSource) { sseSource.close(); sseSource = null; }
		if (sseReconnectTimer) { clearTimeout(sseReconnectTimer); sseReconnectTimer = null; }
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => { void init(); });
	} else {
		void init();
	}
})();
