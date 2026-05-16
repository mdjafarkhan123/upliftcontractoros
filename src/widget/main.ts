/**
 * Contractor Growth OS — Web Chat Widget
 * Plain TypeScript · No Svelte · No React · No external deps
 * Bundle target: <25KB gzipped
 */

// ─── Types ──────────────────────────────────────────────────────────────────

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
	sent_at: string;
}

interface SessionState {
	session_id: string;
	session_token: string;
	config: WidgetConfig;
	messages: WidgetMessage[];
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

(function () {
	const scriptEl = document.currentScript as HTMLScriptElement | null;
	const widgetToken = scriptEl?.getAttribute('data-widget-token');
	if (!widgetToken) {
		console.warn('[WebChat] Missing data-widget-token attribute.');
		return;
	}

	const BASE = scriptEl?.src
		? new URL(scriptEl.src).origin
		: window.location.origin;

	const SESSION_KEY = `wc_session_${widgetToken}`;

	// ─── State ──────────────────────────────────────────────────────────────

	let session: SessionState | null = null;
	let open = false;
	let sseSource: EventSource | null = null;
	let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let formError = '';

	// ─── CSS ────────────────────────────────────────────────────────────────

	function injectStyles(primary: string) {
		const id = 'wc-styles';
		if (document.getElementById(id)) return;
		const style = document.createElement('style');
		style.id = id;
		style.textContent = `
:root { --wc-primary: ${primary}; }
#wc-root *, #wc-root *::before, #wc-root *::after { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
#wc-btn { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 50%; background: var(--wc-primary); border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.28); display: flex; align-items: center; justify-content: center; z-index: 999998; transition: transform .15s ease, box-shadow .15s ease; }
#wc-btn:hover { transform: scale(1.07); box-shadow: 0 6px 20px rgba(0,0,0,.36); }
#wc-btn svg { width: 26px; height: 26px; fill: #fff; }
#wc-panel { position: fixed; bottom: 92px; right: 24px; width: 320px; height: 480px; background: #18181b; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,.48); display: flex; flex-direction: column; z-index: 999997; overflow: hidden; opacity: 0; transform: translateY(12px); pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
#wc-panel.wc-open { opacity: 1; transform: translateY(0); pointer-events: all; }
@media (max-width: 400px) { #wc-panel { right: 0; bottom: 0; left: 0; width: 100%; height: 100%; border-radius: 0; } }
#wc-header { background: var(--wc-primary); padding: 14px 16px; display: flex; align-items: center; gap: 10px; }
#wc-logo { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background: rgba(255,255,255,.2); flex-shrink: 0; }
#wc-logo-placeholder { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,.25); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
#wc-org-name { font-size: 14px; font-weight: 600; color: #fff; flex: 1; }
#wc-close { background: none; border: none; cursor: pointer; color: rgba(255,255,255,.8); display: flex; align-items: center; padding: 2px; border-radius: 4px; }
#wc-close:hover { color: #fff; }
#wc-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
#wc-form { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
#wc-form p { font-size: 13px; color: #a1a1aa; line-height: 1.5; }
.wc-input { width: 100%; padding: 10px 12px; background: #27272a; border: 1px solid #3f3f46; border-radius: 8px; color: #f4f4f5; font-size: 14px; outline: none; transition: border-color .15s; }
.wc-input:focus { border-color: var(--wc-primary); }
.wc-input::placeholder { color: #71717a; }
.wc-submit { width: 100%; padding: 10px; background: var(--wc-primary); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity .15s; }
.wc-submit:hover { opacity: .9; }
.wc-submit:disabled { opacity: .55; cursor: not-allowed; }
.wc-error { font-size: 12px; color: #f87171; }
.wc-mode-hint { font-size: 12px; color: #71717a; text-align: center; padding: 8px 16px 0; }
.wc-msg { max-width: 80%; padding: 9px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; word-break: break-word; }
.wc-msg-in { align-self: flex-start; background: #27272a; color: #f4f4f5; border-bottom-left-radius: 4px; }
.wc-msg-out { align-self: flex-end; background: var(--wc-primary); color: #fff; border-bottom-right-radius: 4px; }
.wc-msg-time { font-size: 10px; opacity: .55; margin-top: 3px; display: block; }
#wc-composer { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #27272a; background: #18181b; }
#wc-input { flex: 1; padding: 9px 11px; background: #27272a; border: 1px solid #3f3f46; border-radius: 8px; color: #f4f4f5; font-size: 13px; outline: none; resize: none; }
#wc-input:focus { border-color: var(--wc-primary); }
#wc-send { padding: 0 14px; background: var(--wc-primary); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; transition: opacity .15s; }
#wc-send:hover { opacity: .9; }
#wc-send:disabled { opacity: .5; cursor: not-allowed; }
`;
		document.head.appendChild(style);
	}

	// ─── Icon SVGs ──────────────────────────────────────────────────────────

	const chatIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
	const closeIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;

	// ─── DOM helpers ────────────────────────────────────────────────────────

	let panelEl: HTMLDivElement | null = null;
	let bodyEl: HTMLDivElement | null = null;
	let btnEl: HTMLButtonElement | null = null;

	function createRoot() {
		const root = document.createElement('div');
		root.id = 'wc-root';
		document.body.appendChild(root);
		return root;
	}

	function renderButton(primary: string) {
		btnEl = document.createElement('button');
		btnEl.id = 'wc-btn';
		btnEl.setAttribute('aria-label', 'Open chat');
		btnEl.innerHTML = chatIcon;
		btnEl.style.background = primary;
		btnEl.addEventListener('click', togglePanel);
		return btnEl;
	}

	function renderPanel(config: WidgetConfig) {
		panelEl = document.createElement('div');
		panelEl.id = 'wc-panel';

		// Header
		const header = document.createElement('div');
		header.id = 'wc-header';

		if (config.logo_url) {
			const logo = document.createElement('img');
			logo.id = 'wc-logo';
			logo.src = config.logo_url;
			logo.alt = config.org_name;
			header.appendChild(logo);
		} else {
			const ph = document.createElement('div');
			ph.id = 'wc-logo-placeholder';
			ph.innerHTML = `<svg width="16" height="16" fill="rgba(255,255,255,.7)" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>`;
			header.appendChild(ph);
		}

		const orgName = document.createElement('span');
		orgName.id = 'wc-org-name';
		orgName.textContent = config.org_name;
		header.appendChild(orgName);

		const closeBtn = document.createElement('button');
		closeBtn.id = 'wc-close';
		closeBtn.setAttribute('aria-label', 'Close chat');
		closeBtn.innerHTML = closeIcon;
		closeBtn.addEventListener('click', togglePanel);
		header.appendChild(closeBtn);

		panelEl.appendChild(header);

		// Body
		bodyEl = document.createElement('div');
		bodyEl.id = 'wc-body';
		panelEl.appendChild(bodyEl);

		return panelEl;
	}

	function renderPreChatForm(config: WidgetConfig): HTMLElement {
		const form = document.createElement('div');
		form.id = 'wc-form';

		const intro = document.createElement('p');
		intro.textContent = config.intro_message;
		form.appendChild(intro);

		const nameInput = document.createElement('input');
		nameInput.className = 'wc-input';
		nameInput.type = 'text';
		nameInput.placeholder = 'Your name *';
		nameInput.autocomplete = 'name';
		form.appendChild(nameInput);

		const phoneInput = document.createElement('input');
		phoneInput.className = 'wc-input';
		phoneInput.type = 'tel';
		phoneInput.placeholder = 'Your phone number *';
		phoneInput.autocomplete = 'tel';
		form.appendChild(phoneInput);

		const errorEl = document.createElement('span');
		errorEl.className = 'wc-error';
		errorEl.textContent = formError;
		form.appendChild(errorEl);

		const submitBtn = document.createElement('button');
		submitBtn.className = 'wc-submit';
		submitBtn.textContent = config.webchat_mode === 'instant' ? 'Chat with our team' : 'Send message';
		form.appendChild(submitBtn);

		const modeHint = document.createElement('p');
		modeHint.className = 'wc-mode-hint';
		modeHint.textContent = config.webchat_mode === 'instant'
			? 'Chat with our team'
			: config.offline_message;
		form.appendChild(modeHint);

		submitBtn.addEventListener('click', async () => {
			const name = nameInput.value.trim();
			const phone = phoneInput.value.trim();
			if (!name || !phone) {
				errorEl.textContent = 'Please enter your name and phone number.';
				return;
			}
			errorEl.textContent = '';
			submitBtn.disabled = true;
			submitBtn.textContent = 'Starting…';
			const err = await startSession(name, phone, config);
			if (err) {
				errorEl.textContent = err;
				submitBtn.disabled = false;
				submitBtn.textContent = config.webchat_mode === 'instant' ? 'Chat with our team' : 'Send message';
			}
		});

		return form;
	}

	function renderThread() {
		if (!bodyEl || !session) return;
		bodyEl.innerHTML = '';

		for (const msg of session.messages) {
			appendMessage(msg, 'in');
		}

		// Composer
		const composer = document.createElement('div');
		composer.id = 'wc-composer';

		const textarea = document.createElement('textarea');
		textarea.id = 'wc-input';
		textarea.placeholder = 'Type a message…';
		textarea.rows = 1;
		composer.appendChild(textarea);

		const sendBtn = document.createElement('button');
		sendBtn.id = 'wc-send';
		sendBtn.textContent = 'Send';
		composer.appendChild(sendBtn);

		if (panelEl) panelEl.appendChild(composer);

		sendBtn.addEventListener('click', () => sendMessage(textarea, sendBtn));
		textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage(textarea, sendBtn);
			}
		});

		scrollToBottom();
	}

	function appendMessage(msg: WidgetMessage, direction: 'in' | 'out') {
		if (!bodyEl) return;
		const wrap = document.createElement('div');
		wrap.className = `wc-msg wc-msg-${direction}`;

		const body = document.createElement('span');
		body.textContent = msg.body;
		wrap.appendChild(body);

		const time = document.createElement('span');
		time.className = 'wc-msg-time';
		time.textContent = formatTime(msg.sent_at);
		wrap.appendChild(time);

		bodyEl.appendChild(wrap);
		scrollToBottom();
	}

	function scrollToBottom() {
		if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
	}

	function formatTime(iso: string): string {
		try {
			return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {
			return '';
		}
	}

	// ─── Toggle ─────────────────────────────────────────────────────────────

	function togglePanel() {
		open = !open;
		if (panelEl) panelEl.classList.toggle('wc-open', open);
		if (open && session) {
			startSSE();
		} else {
			stopSSE();
		}
	}

	// ─── Session init ────────────────────────────────────────────────────────

	async function init(root: HTMLDivElement) {
		const stored = localStorage.getItem(SESSION_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as { session_id: string; session_token: string };
				const res = await restoreSession(parsed.session_id, parsed.session_token);
				if (res) {
					session = res;
					injectStyles(session.config.primary_color || '#6366f1');
					root.appendChild(renderButton(session.config.primary_color || '#6366f1'));
					root.appendChild(renderPanel(session.config));
					return;
				}
			} catch {
				// Invalid stored session
			}
			localStorage.removeItem(SESSION_KEY);
		}

		// Load widget config from a lightweight fetch before rendering UI
		const cfg = await fetchWidgetConfig();
		if (!cfg) return; // Org inactive or webchat disabled

		injectStyles(cfg.primary_color || '#6366f1');
		root.appendChild(renderButton(cfg.primary_color || '#6366f1'));
		root.appendChild(renderPanel(cfg));

		if (bodyEl) {
			bodyEl.appendChild(renderPreChatForm(cfg));
		}
	}

	async function fetchWidgetConfig(): Promise<WidgetConfig | null> {
		try {
			const res = await fetch(`${BASE}/api/webchat/config?token=${widgetToken}`);
			if (!res.ok) return null;
			const json = await res.json() as { data?: WidgetConfig };
			return json.data ?? null;
		} catch {
			return null;
		}
	}

	async function restoreSession(
		sessionId: string,
		sessionToken: string
	): Promise<SessionState | null> {
		try {
			const res = await fetch(`${BASE}/api/webchat/session/${sessionId}/restore`, {
				headers: { Authorization: `Bearer ${sessionToken}` }
			});
			if (!res.ok) return null;
			const json = await res.json() as {
				data?: {
					org_name: string;
					logo_url: string | null;
					primary_color: string;
					intro_message: string;
					offline_message: string;
					webchat_mode: 'instant' | 'asynchronous';
					messages: WidgetMessage[];
				}
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

	async function startSession(
		name: string,
		phone: string,
		config: WidgetConfig
	): Promise<string | null> {
		try {
			const res = await fetch(`${BASE}/api/webchat/session/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ widget_token: widgetToken, name, phone })
			});
			const json = await res.json() as {
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
				return json.error ?? 'Failed to start session. Please try again.';
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

			// Remove pre-chat form, show thread
			if (bodyEl) bodyEl.innerHTML = '';
			renderThread();
			startSSE();
			return null;
		} catch {
			return 'Network error. Please try again.';
		}
	}

	// ─── Send message ────────────────────────────────────────────────────────

	async function sendMessage(textarea: HTMLTextAreaElement, btn: HTMLButtonElement) {
		if (!session) return;
		const body = textarea.value.trim();
		if (!body) return;
		textarea.value = '';
		btn.disabled = true;

		// Optimistic
		const optimisticMsg: WidgetMessage = {
			id: `opt-${Date.now()}`,
			body,
			sent_at: new Date().toISOString()
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
				// Remove optimistic on failure
				removeOptimistic(optimisticMsg.id);
				textarea.value = body; // restore
			}
		} catch {
			removeOptimistic(optimisticMsg.id);
			textarea.value = body;
		} finally {
			btn.disabled = false;
		}
	}

	function removeOptimistic(id: string) {
		if (!session) return;
		session.messages = session.messages.filter((m) => m.id !== id);
		if (bodyEl) {
			// Rebuild messages display
			const msgs = bodyEl.querySelectorAll('.wc-msg');
			msgs.forEach((el) => el.remove());
			for (const m of session.messages) {
				appendMessage(m, 'out');
			}
		}
	}

	// ─── SSE stream ─────────────────────────────────────────────────────────

	function startSSE() {
		if (!session) return;
		stopSSE();

		const url = `${BASE}/api/webchat/session/${session.session_id}/stream?token=${session.session_token}`;
		sseSource = new EventSource(url);

		sseSource.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data) as WidgetMessage;
				if (!session) return;
				// Dedupe by id
				if (session.messages.some((m) => m.id === msg.id)) return;
				session.messages.push(msg);
				appendMessage(msg, 'in');
			} catch {
				// Ignore parse errors
			}
		};

		sseSource.onerror = () => {
			stopSSE();
			// Auto-reconnect after 3s
			sseReconnectTimer = setTimeout(() => {
				if (open && session) startSSE();
			}, 3000);
		};
	}

	function stopSSE() {
		if (sseSource) {
			sseSource.close();
			sseSource = null;
		}
		if (sseReconnectTimer) {
			clearTimeout(sseReconnectTimer);
			sseReconnectTimer = null;
		}
	}

	// ─── Entrypoint ─────────────────────────────────────────────────────────

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			void init(createRoot() as HTMLDivElement);
		});
	} else {
		void init(createRoot() as HTMLDivElement);
	}
})();
