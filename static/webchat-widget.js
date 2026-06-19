(function(){(function(){let e=document.currentScript,t=e?.getAttribute(`data-widget-token`);if(!t){console.warn(`[WebChat] Missing data-widget-token attribute.`);return}let n=e?.src?new URL(e.src).origin:window.location.origin,r=`wc_session_${t}`,i=`wc_cursor_${t}`,a=`wc_name_${t}`,o=null,s=!1,c=null,l=!1,u=!1,d=0,f=null,p=null,m=`wc_greeted_${t}`;function h(){try{return localStorage.getItem(i)}catch{return null}}function g(e){try{let t=h();(!t||e>t)&&localStorage.setItem(i,e)}catch{}}function _(){try{localStorage.removeItem(i)}catch{}}let v=null,y=null,b=null,x=null,S=null,C=null,w=null;function T(e){return`
:host, .wc-host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
button { font: inherit; cursor: pointer; }
input, textarea { font: inherit; }

.wc-launcher {
	position: fixed; bottom: 24px; right: 24px;
	width: 60px; height: 60px; border-radius: 50%;
	background: linear-gradient(135deg, ${e} 0%, ${D(e,-18)} 100%);
	border: none;
	box-shadow: 0 10px 30px ${E(e,.35)}, 0 4px 10px rgba(15, 23, 42, 0.12);
	display: flex; align-items: center; justify-content: center;
	z-index: 2147483646;
	transition: transform .22s cubic-bezier(.2,.9,.3,1.4), box-shadow .22s ease;
	color: #fff;
}
.wc-launcher:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 14px 36px ${E(e,.45)}, 0 6px 14px rgba(15, 23, 42, 0.18); }
.wc-launcher:active { transform: translateY(0) scale(.98); }
.wc-launcher .wc-icon { width: 28px; height: 28px; transition: opacity .18s, transform .22s; }

.wc-badge {
	position: absolute; top: -2px; right: -2px;
	min-width: 22px; height: 22px; padding: 0 6px;
	border-radius: 999px;
	background: #ef4444; color: #fff;
	font-size: 12px; font-weight: 700; line-height: 22px; text-align: center;
	box-shadow: 0 2px 6px rgba(239, 68, 68, .5), 0 0 0 2px #fff;
	display: none;
	transform: scale(0);
	transition: transform .2s cubic-bezier(.2,.9,.3,1.6);
}
.wc-badge[data-show="true"] { display: block; transform: scale(1); }

.wc-greeting {
	position: fixed; bottom: 96px; right: 24px;
	max-width: 260px;
	background: #ffffff; color: #0f172a;
	padding: 14px 38px 14px 16px;
	border-radius: 16px 16px 4px 16px;
	box-shadow: 0 18px 44px rgba(15, 23, 42, .18), 0 0 0 1px rgba(15, 23, 42, .04);
	font-size: 14px; line-height: 1.5;
	z-index: 2147483644;
	cursor: pointer;
	opacity: 0;
	transform: translateY(10px) scale(.96);
	transform-origin: bottom right;
	transition: opacity .26s ease, transform .3s cubic-bezier(.2,.9,.3,1.3);
}
.wc-greeting[data-show="true"] { opacity: 1; transform: translateY(0) scale(1); }
.wc-greeting-close {
	position: absolute; top: 8px; right: 8px;
	width: 20px; height: 20px; border-radius: 50%;
	background: #f1f5f9; color: #64748b; border: none;
	display: flex; align-items: center; justify-content: center;
	transition: background .15s;
}
.wc-greeting-close:hover { background: #e2e8f0; }
@media (max-width: 480px) {
	.wc-greeting { right: 18px; bottom: 84px; max-width: calc(100vw - 84px); }
}
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
	background: linear-gradient(135deg, ${e} 0%, ${D(e,-22)} 100%);
	color: #fff;
	display: flex; align-items: center; gap: 12px;
	flex-shrink: 0;
}
.wc-logo { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: rgba(255,255,255,.22); flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
.wc-logo-placeholder { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,.28); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,.15); font-size: 15px; font-weight: 600; color: #fff; letter-spacing: .02em; text-transform: uppercase; }
.wc-header-text { flex: 1; min-width: 0; }
.wc-org-name { font-size: 15px; font-weight: 600; letter-spacing: -.01em; line-height: 1.2; display: block; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
.wc-org-status { font-size: 12px; opacity: .85; margin-top: 2px; display: flex; align-items: center; gap: 6px; }
.wc-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 0 2px rgba(74, 222, 128, .25); }
.wc-status-dot.wc-status-async { background: #fbbf24; box-shadow: 0 0 0 2px rgba(251, 191, 36, .25); }
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
.wc-label.wc-required::after { content: ' *'; color: ${e}; }
.wc-field-hint { font-size: 12px; color: #94a3b8; line-height: 1.5; margin-top: -4px; }
.wc-consent { display: flex; align-items: flex-start; gap: 9px; cursor: pointer; }
.wc-consent-check { width: 17px; height: 17px; margin: 1px 0 0; flex-shrink: 0; accent-color: ${e}; cursor: pointer; }
.wc-consent-text { font-size: 12px; color: #64748b; line-height: 1.5; }
.wc-input {
	width: 100%; padding: 12px 14px;
	background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
	color: #0f172a; font-size: 14px;
	outline: none;
	transition: border-color .15s, background .15s, box-shadow .15s;
}
.wc-input::placeholder { color: #94a3b8; }
.wc-input:hover { border-color: #cbd5e1; }
.wc-input:focus { border-color: ${e}; background: #fff; box-shadow: 0 0 0 4px ${E(e,.12)}; }

.wc-submit {
	width: 100%; padding: 13px;
	background: linear-gradient(135deg, ${e} 0%, ${D(e,-18)} 100%);
	color: #fff; border: none; border-radius: 12px;
	font-size: 14px; font-weight: 600; letter-spacing: .01em;
	display: flex; align-items: center; justify-content: center; gap: 8px;
	box-shadow: 0 6px 16px ${E(e,.32)};
	transition: transform .15s, box-shadow .15s, opacity .15s;
}
.wc-submit:hover { transform: translateY(-1px); box-shadow: 0 8px 20px ${E(e,.42)}; }
.wc-submit:active { transform: translateY(0); }
.wc-submit:disabled { opacity: .6; cursor: not-allowed; transform: none; box-shadow: 0 4px 10px ${E(e,.22)}; }

.wc-error { font-size: 12.5px; color: #dc2626; padding: 6px 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; display: none; }
.wc-error.wc-visible { display: block; }
.wc-mode-hint { font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5; padding-top: 4px; }

.wc-msg-row { display: flex; max-width: 100%; animation: wcSlideIn .26s cubic-bezier(.2,.9,.3,1.2); align-items: flex-end; }
.wc-msg-row.wc-in { justify-content: flex-start; }
.wc-msg-row.wc-out { justify-content: flex-end; }
.wc-msg {
	max-width: 78%;
	padding: 10px 14px;
	font-size: 14px; line-height: 1.45; word-wrap: break-word; overflow-wrap: break-word;
	position: relative;
}
.wc-msg-avatar {
	width: 28px; height: 28px; min-width: 28px; border-radius: 50%;
	flex-shrink: 0;
	display: flex; align-items: center; justify-content: center;
	font-size: 11px; font-weight: 600; letter-spacing: .02em;
	overflow: hidden;
}
.wc-msg-avatar img {
	width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
}
.wc-msg-avatar-org {
	margin-right: 8px;
	background: linear-gradient(135deg, ${e} 0%, ${D(e,-18)} 100%);
	color: #fff;
	box-shadow: 0 1px 3px rgba(0,0,0,.12);
}
.wc-msg-avatar-visitor {
	margin-left: 8px;
	background: #e2e8f0;
	color: #64748b;
}
.wc-msg-in .wc-msg {
	background: #f1f5f9; color: #0f172a;
	border-radius: 16px 16px 16px 4px;
	box-shadow: 0 1px 2px rgba(15, 23, 42, .05);
}
.wc-msg-out .wc-msg {
	background: linear-gradient(135deg, ${e} 0%, ${D(e,-12)} 100%);
	color: #fff;
	border-radius: 16px 16px 4px 16px;
	box-shadow: 0 2px 6px ${E(e,.25)};
}
.wc-msg-time { font-size: 10.5px; opacity: .65; display: block; margin-top: 4px; letter-spacing: .02em; }

/* Consecutive bubbles from the same sender collapse under one avatar. */
.wc-msg-row.wc-grouped { margin-top: -6px; }
.wc-msg-avatar-spacer { width: 28px; min-width: 28px; }
.wc-msg-avatar-spacer.wc-org { margin-right: 8px; }
.wc-msg-avatar-spacer.wc-visitor { margin-left: 8px; }
.wc-msg-grouped.wc-msg-in .wc-msg { border-top-left-radius: 6px; }
.wc-msg-grouped.wc-msg-out .wc-msg { border-top-right-radius: 6px; }

/* Links inside message bodies. */
.wc-msg a { color: inherit; text-decoration: underline; text-underline-offset: 2px; word-break: break-word; }
.wc-msg-out .wc-msg a { color: #fff; }
.wc-msg-in .wc-msg a { color: ${D(e,-10)}; }

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
.wc-textarea:focus { border-color: ${e}; background: #fff; box-shadow: 0 0 0 4px ${E(e,.12)}; }
.wc-send {
	width: 42px; height: 42px; flex-shrink: 0;
	background: linear-gradient(135deg, ${e} 0%, ${D(e,-18)} 100%);
	color: #fff; border: none; border-radius: 12px;
	display: flex; align-items: center; justify-content: center;
	box-shadow: 0 4px 10px ${E(e,.28)};
	transition: transform .15s, box-shadow .15s, opacity .15s;
}
.wc-send:hover { transform: translateY(-1px); box-shadow: 0 6px 14px ${E(e,.38)}; }
.wc-send:active { transform: translateY(0); }
.wc-send:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.wc-send svg { width: 18px; height: 18px; }

.wc-typing {
	display: flex; align-items: flex-end; gap: 6px;
	padding: 4px 0 8px 18px;
	animation: wcSlideIn .22s cubic-bezier(.2,.9,.3,1.2);
}
.wc-typing-avatar {
	width: 28px; height: 28px; min-width: 28px; border-radius: 50%;
	background: linear-gradient(135deg, ${e} 0%, ${D(e,-18)} 100%);
	color: #fff; font-size: 11px; font-weight: 600;
	display: flex; align-items: center; justify-content: center;
	box-shadow: 0 1px 3px rgba(0,0,0,.12);
}
.wc-typing-dots {
	display: flex; align-items: center; gap: 4px;
	background: #f1f5f9; border-radius: 16px 16px 16px 4px;
	padding: 12px 16px;
	box-shadow: 0 1px 2px rgba(15, 23, 42, .05);
}
.wc-typing-dot {
	width: 7px; height: 7px; border-radius: 50%;
	background: #94a3b8;
	animation: wcTypingBounce 1.4s infinite ease-in-out both;
}
.wc-typing-dot:nth-child(1) { animation-delay: -0.32s; }
.wc-typing-dot:nth-child(2) { animation-delay: -0.16s; }
.wc-typing-dot:nth-child(3) { animation-delay: 0s; }
@keyframes wcTypingBounce {
	0%, 80%, 100% { transform: scale(0.6); opacity: .4; }
	40% { transform: scale(1); opacity: 1; }
}
.wc-branding {
	text-align: center; padding: 8px 0 10px;
	font-size: 11px; color: #94a3b8; background: #ffffff;
	border-top: 1px solid #f1f5f9;
	flex-shrink: 0;
}
.wc-branding a { color: #64748b; text-decoration: none; font-weight: 500; }
.wc-branding a:hover { color: ${e}; }
`}function E(e,t){let n=e.replace(`#`,``),r=n.length===3?n.split(``).map(e=>e+e).join(``):n,i=parseInt(r.substring(0,2),16),a=parseInt(r.substring(2,4),16),o=parseInt(r.substring(4,6),16);return isNaN(i)||isNaN(a)||isNaN(o)?`rgba(99, 102, 241, ${t})`:`rgba(${i}, ${a}, ${o}, ${t})`}function D(e,t){let n=e.replace(`#`,``),r=n.length===3?n.split(``).map(e=>e+e).join(``):n,i=parseInt(r.substring(0,2),16),a=parseInt(r.substring(2,4),16),o=parseInt(r.substring(4,6),16);return isNaN(i)||isNaN(a)||isNaN(o)?e:(i=Math.max(0,Math.min(255,Math.round(i+i*t/100))),a=Math.max(0,Math.min(255,Math.round(a+a*t/100))),o=Math.max(0,Math.min(255,Math.round(o+o*t/100))),`#${i.toString(16).padStart(2,`0`)}${a.toString(16).padStart(2,`0`)}${o.toString(16).padStart(2,`0`)}`)}let O=`<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;function ee(){let e=document.createElement(`div`);return e.id=`contractor-os-webchat`,e.style.cssText=`all: initial; position: fixed; width: 0; height: 0; z-index: 2147483646;`,e.addEventListener(`wheel`,e=>{e.preventDefault(),b&&(b.scrollTop+=e.deltaY)},{passive:!1}),document.body.appendChild(e),e.attachShadow({mode:`open`})}function k(){let e=document.createElement(`button`);e.className=`wc-launcher`,e.setAttribute(`aria-label`,`Open chat`),e.setAttribute(`type`,`button`),e.innerHTML=`<svg class="wc-icon wc-icon-chat" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><svg class="wc-icon wc-icon-close" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;let t=document.createElement(`span`);return t.className=`wc-badge`,t.setAttribute(`aria-hidden`,`true`),e.appendChild(t),S=t,e.addEventListener(`click`,H),e}function A(e){let t=document.createElement(`div`);t.className=`wc-panel`,t.setAttribute(`role`,`dialog`),t.setAttribute(`aria-label`,`${e.org_name} chat`);let n=document.createElement(`div`);if(n.className=`wc-header`,e.logo_url){let t=document.createElement(`img`);t.className=`wc-logo`,t.src=e.logo_url,t.alt=e.org_name,t.addEventListener(`error`,()=>{let n=document.createElement(`div`);n.className=`wc-logo-placeholder`,n.textContent=R(e.org_name),t.replaceWith(n)}),n.appendChild(t)}else{let t=document.createElement(`div`);t.className=`wc-logo-placeholder`,t.textContent=R(e.org_name),n.appendChild(t)}let r=document.createElement(`div`);r.className=`wc-header-text`;let i=document.createElement(`span`);i.className=`wc-org-name`,i.textContent=e.org_name,r.appendChild(i);let a=document.createElement(`span`);a.className=`wc-org-status`;let o=e.webchat_mode===`instant`,s=document.createElement(`span`);s.className=o?`wc-status-dot`:`wc-status-dot wc-status-async`;let c=document.createElement(`span`);c.textContent=o?`Online · replies in minutes`:`Replies by text`,a.append(s,c),r.appendChild(a),n.appendChild(r);let l=document.createElement(`button`);l.className=`wc-close`,l.setAttribute(`aria-label`,`Close chat`),l.setAttribute(`type`,`button`),l.innerHTML=O,l.addEventListener(`click`,H),n.appendChild(l),t.appendChild(n);let u=document.createElement(`div`);u.className=`wc-body`,t.appendChild(u),b=u;let d=document.createElement(`div`);return d.className=`wc-branding`,d.innerHTML=`Powered by <a href="https://contractorgrowth.app" target="_blank" rel="noopener">Contractor Growth OS</a>`,t.appendChild(d),t}function j(e){let t=document.createElement(`div`);t.className=`wc-form`;let n=document.createElement(`p`);n.className=`wc-form-intro`,n.textContent=e.intro_message||`Hi! Send us a message and we'll get back to you shortly.`,t.appendChild(n);let r=document.createElement(`div`);r.className=`wc-field`;let i=document.createElement(`label`);i.className=`wc-label wc-required`,i.textContent=`Your name`;let a=document.createElement(`input`);a.className=`wc-input`,a.type=`text`,a.placeholder=`Jane Smith`,a.autocomplete=`name`,r.append(i,a),t.appendChild(r);let o=document.createElement(`div`);o.className=`wc-field`;let s=document.createElement(`label`);s.className=`wc-label`,s.textContent=`Phone number`;let c=document.createElement(`input`);c.className=`wc-input`,c.type=`tel`,c.placeholder=`(555) 123-4567`,c.autocomplete=`tel`,o.append(s,c),t.appendChild(o);let l=document.createElement(`div`);l.className=`wc-field`;let u=document.createElement(`label`);u.className=`wc-label`,u.textContent=`Email`;let d=document.createElement(`input`);d.className=`wc-input`,d.type=`email`,d.placeholder=`you@example.com`,d.autocomplete=`email`,l.append(u,d),t.appendChild(l);let f=document.createElement(`p`);f.className=`wc-field-hint`,f.textContent=`Add a phone number or email so we can get back to you.`,t.appendChild(f);let p=document.createElement(`label`);p.className=`wc-consent`;let m=document.createElement(`input`);m.type=`checkbox`,m.className=`wc-consent-check`;let h=document.createElement(`span`);h.className=`wc-consent-text`,h.textContent=`I agree to receive text messages and emails from ${e.org_name} about my inquiry. Message & data rates may apply; reply STOP to opt out.`,p.append(m,h),t.appendChild(p);let g=document.createElement(`div`);g.className=`wc-error`,t.appendChild(g);let _=document.createElement(`button`);_.className=`wc-submit`,_.type=`button`;let v=e.webchat_mode===`instant`?`Start chat`:`Send message`;if(_.textContent=v,t.appendChild(_),e.webchat_mode===`asynchronous`&&e.offline_message){let n=document.createElement(`p`);n.className=`wc-mode-hint`,n.textContent=e.offline_message,t.appendChild(n)}let y=e=>{g.textContent=e,g.classList.add(`wc-visible`)},b=()=>g.classList.remove(`wc-visible`);return _.addEventListener(`click`,async()=>{let t=a.value.trim(),n=c.value.trim(),r=d.value.trim();if(!t){y(`Please enter your name.`);return}if(!n&&!r){y(`Add a phone number or email so we can reply.`);return}if(r&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)){y(`Please enter a valid email address.`);return}if(!m.checked){y(`Please tick the box to agree to be contacted.`);return}b(),_.disabled=!0,_.textContent=`Starting…`;let i=await ie(t,n,r,m.checked,e);i&&(y(i),_.disabled=!1,_.textContent=v)}),[a,c,d].forEach(e=>{e.addEventListener(`keydown`,e=>{e.key===`Enter`&&(e.preventDefault(),_.click())})}),t}function M(){if(!b||!o||!y)return;if(b.innerHTML=``,o.config.intro_message){let e=document.createElement(`div`);e.className=`wc-intro-bubble`,P(e,o.config.intro_message),b.appendChild(e)}f=null;for(let e of o.messages)N(e,e.direction===`inbound`?`out`:`in`);w&&w.remove(),w=document.createElement(`div`),w.className=`wc-composer`;let e=document.createElement(`textarea`);e.className=`wc-textarea`,e.placeholder=`Type your message…`,e.rows=1,w.appendChild(e);let t=document.createElement(`button`);t.className=`wc-send`,t.setAttribute(`aria-label`,`Send message`),t.setAttribute(`type`,`button`),t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,w.appendChild(t);let n=y.querySelector(`.wc-branding`);n?y.insertBefore(w,n):y.appendChild(w);let r=()=>ae(e,t);t.addEventListener(`click`,r),e.addEventListener(`keydown`,e=>{e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),r())}),e.addEventListener(`input`,()=>{e.style.height=`auto`,e.style.height=Math.min(e.scrollHeight,120)+`px`}),F(),setTimeout(()=>e.focus(),100)}function N(e,t){if(!b||!o)return;let n=t===f;f=t;let r=document.createElement(`div`);if(r.className=`wc-msg-row wc-${t} wc-msg-${t}`,n&&r.classList.add(`wc-grouped`,`wc-msg-grouped`),r.dataset.msgId=e.id,t===`in`)if(n){let e=document.createElement(`div`);e.className=`wc-msg-avatar-spacer wc-org`,r.appendChild(e)}else{let e=document.createElement(`div`);e.className=`wc-msg-avatar wc-msg-avatar-org`;let t=o.config.logo_url,n=o.config.org_name;if(t){let r=document.createElement(`img`);r.src=t,r.alt=n,r.addEventListener(`error`,()=>{e.textContent=R(n),e.classList.add(`wc-msg-avatar-fallback`)}),e.appendChild(r)}else e.textContent=R(n),e.classList.add(`wc-msg-avatar-fallback`);r.appendChild(e)}let i=document.createElement(`div`);i.className=`wc-msg`;let a=document.createElement(`span`);P(a,e.body),i.appendChild(a);let s=document.createElement(`span`);if(s.className=`wc-msg-time`,s.textContent=L(e.sent_at),i.appendChild(s),r.appendChild(i),t===`out`)if(n){let e=document.createElement(`div`);e.className=`wc-msg-avatar-spacer wc-visitor`,r.appendChild(e)}else{let e=document.createElement(`div`);e.className=`wc-msg-avatar wc-msg-avatar-visitor`,e.textContent=R(o.visitor_name||`?`),r.appendChild(e)}b.appendChild(r),F()}function P(e,t){let n=/(https?:\/\/[^\s]+|www\.[^\s]+)/gi;t.split(`
`).forEach((t,r)=>{r>0&&e.appendChild(document.createElement(`br`));let i=0,a;for(n.lastIndex=0;(a=n.exec(t))!==null;){a.index>i&&e.appendChild(document.createTextNode(t.slice(i,a.index)));let n=a[0],r=n.replace(/[.,!?;:)\]]+$/,``),o=r.startsWith(`http`)?r:`https://${r}`,s=document.createElement(`a`);s.href=o,s.target=`_blank`,s.rel=`noopener noreferrer`,s.textContent=r,e.appendChild(s),n.length>r.length&&e.appendChild(document.createTextNode(n.slice(r.length))),i=a.index+n.length}i<t.length&&e.appendChild(document.createTextNode(t.slice(i)))})}function F(){b&&requestAnimationFrame(()=>{b.scrollTop=b.scrollHeight})}function te(){if(!b||!o)return;I();let e=document.createElement(`div`);e.className=`wc-typing`,e.id=`wc-typing-indicator`;let t=document.createElement(`div`);t.className=`wc-typing-avatar`,t.textContent=R(o.config.org_name),e.appendChild(t);let n=document.createElement(`div`);n.className=`wc-typing-dots`;for(let e=0;e<3;e++){let e=document.createElement(`span`);e.className=`wc-typing-dot`,n.appendChild(e)}e.appendChild(n),b.appendChild(e),F()}function I(){if(!b)return;let e=b.querySelector(`#wc-typing-indicator`);e&&e.remove()}function L(e){try{return new Date(e).toLocaleTimeString([],{hour:`numeric`,minute:`2-digit`})}catch{return``}}function R(e){return e.split(/\s+/).map(e=>e[0]?.toUpperCase()??``).slice(0,2).join(``)||`?`}function z(){S&&(d>0&&!s?(S.textContent=d>9?`9+`:String(d),S.setAttribute(`data-show`,`true`),x&&x.setAttribute(`aria-label`,`Open chat, ${d} new message${d===1?``:`s`}`)):S.setAttribute(`data-show`,`false`))}function B(e){let t=e.intro_message?.trim();if(t){try{if(localStorage.getItem(m))return}catch{}p=setTimeout(()=>{if(s||!v)return;try{localStorage.setItem(m,`1`)}catch{}let e=document.createElement(`div`);e.className=`wc-greeting`,e.setAttribute(`role`,`button`),e.setAttribute(`tabindex`,`0`);let n=document.createElement(`span`);P(n,t),e.appendChild(n);let r=document.createElement(`button`);r.className=`wc-greeting-close`,r.setAttribute(`aria-label`,`Dismiss`),r.setAttribute(`type`,`button`),r.innerHTML=O,r.addEventListener(`click`,e=>{e.stopPropagation(),V()}),e.appendChild(r),e.addEventListener(`click`,()=>{V(),s||H()}),C=e,v.appendChild(e),requestAnimationFrame(()=>e.setAttribute(`data-show`,`true`))},6e3)}}function V(){if(p&&=(clearTimeout(p),null),C){let e=C;C=null,e.setAttribute(`data-show`,`false`),setTimeout(()=>e.remove(),300)}}function H(){s=!s,y&&y.setAttribute(`data-open`,String(s)),x&&x.setAttribute(`data-open`,String(s)),s?(V(),d=0,z(),o&&X(),U()):(z(),x&&x.setAttribute(`aria-label`,`Open chat`),o&&Q(),x&&x.focus())}function U(){setTimeout(()=>{y&&(y.querySelector(`textarea, input, button.wc-submit`)??y).focus()},80)}function W(){return y?Array.from(y.querySelectorAll(`a[href], button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])`)).filter(e=>e.offsetParent!==null||e===document.activeElement):[]}function G(e){if(s){if(e.key===`Escape`){e.preventDefault(),H();return}if(e.key===`Tab`){let t=W();if(t.length===0)return;let n=t[0],r=t[t.length-1],i=v?.activeElement??document.activeElement;e.shiftKey&&i===n?(e.preventDefault(),r.focus()):!e.shiftKey&&i===r&&(e.preventDefault(),n.focus())}}}async function K(){v=ee();let e=localStorage.getItem(r);if(e){try{let t=JSON.parse(e),n=await re(t.session_id,t.session_token);if(n){o=n;for(let e of n.messages)g(e.created_at);q(o.config),M(),X();return}}catch{}localStorage.removeItem(r),_()}let t=await ne();t&&(q(t),b&&b.appendChild(j(t)),B(t))}function q(e){if(!v)return;let t=e.primary_color||`#6366f1`,n=document.createElement(`style`);n.textContent=T(t),v.appendChild(n),x=k(),y=A(e),v.appendChild(x),v.appendChild(y),document.addEventListener(`keydown`,G),document.addEventListener(`visibilitychange`,J)}function J(){o&&(document.hidden?Z():X())}async function ne(){try{let e=await fetch(`${n}/api/webchat/config?token=${t}`);return e.ok?(await e.json()).data??null:null}catch{return null}}async function re(e,t){try{let r=await fetch(`${n}/api/webchat/session/${e}/restore`,{headers:{Authorization:`Bearer ${t}`}});if(!r.ok)return null;let i=await r.json();if(!i.data)return null;let o=localStorage.getItem(a)||i.data.visitor_name||``;return!localStorage.getItem(a)&&i.data.visitor_name&&localStorage.setItem(a,i.data.visitor_name),{session_id:e,session_token:t,config:{org_name:i.data.org_name,logo_url:i.data.logo_url,primary_color:i.data.primary_color,intro_message:i.data.intro_message,offline_message:i.data.offline_message,webchat_mode:i.data.webchat_mode},messages:i.data.messages,visitor_name:o}}catch{return null}}async function ie(e,i,s,c,l){try{let l=await fetch(`${n}/api/webchat/session/start`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({widget_token:t,name:e,phone:i||void 0,email:s||void 0,consent:c})}),u=await l.json();return!l.ok||!u.data?l.status===429?`Too many requests. Please try again in a moment.`:u.error??`Failed to start chat. Please try again.`:(o={session_id:u.data.session_id,session_token:u.data.session_token,config:{org_name:u.data.org_name,logo_url:u.data.logo_url,primary_color:u.data.primary_color,intro_message:u.data.intro_message,offline_message:u.data.offline_message,webchat_mode:u.data.webchat_mode},messages:[],visitor_name:e},localStorage.setItem(r,JSON.stringify({session_id:o.session_id,session_token:o.session_token})),localStorage.setItem(a,e),_(),M(),X(),null)}catch{return`Network error. Please try again.`}}async function ae(e,t){if(!o)return;let r=e.value.trim();if(!r)return;e.value=``,e.style.height=`auto`,t.disabled=!0;let i=new Date().toISOString(),a={id:`opt-${Date.now()}`,body:r,created_at:i,sent_at:i,direction:`inbound`};o.messages.push(a),N(a,`out`);try{(await fetch(`${n}/api/webchat/session/${o.session_id}/messages`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${o.session_token}`},body:JSON.stringify({body:r})})).ok||(Y(a.id),e.value=r)}catch{Y(a.id),e.value=r}finally{t.disabled=!1,e.focus()}}function Y(e){if(!o||!b)return;o.messages=o.messages.filter(t=>t.id!==e);let t=b.querySelector(`.wc-msg-row[data-msg-id="${e}"]`);t&&t.remove()}function X(){o&&(Z(),$())}function Z(){c&&=(clearTimeout(c),null)}function Q(){Z(),!document.hidden&&(c=setTimeout(()=>{$()},s?3e3:2e4))}async function $(){if(!o||l){Q();return}l=!0;try{let e=h(),t=new URLSearchParams({});e&&t.set(`since`,e);let r=`${n}/api/webchat/session/${o.session_id}/messages${t.toString()?`?${t}`:``}`,i=await fetch(r,{headers:{Authorization:`Bearer ${o.session_token}`}});if(i.ok){let e=await i.json(),t=e.data?.messages??[],n=0;for(let e of t){if(!o)break;if(g(e.created_at),o.messages.some(t=>t.id===e.id))continue;let t={...e,direction:`outbound`};o.messages.push(t),N(t,`in`),s||n++}n>0&&(d+=n,z());let r=e.data?.contractor_is_typing??!1;r!==u&&(u=r,r?te():I())}}catch{}finally{l=!1,o&&Q()}}document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>{K()}):K()})()})();