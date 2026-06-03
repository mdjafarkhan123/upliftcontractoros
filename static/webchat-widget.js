(function(){(function(){let e=document.currentScript,t=e?.getAttribute(`data-widget-token`);if(!t){console.warn(`[WebChat] Missing data-widget-token attribute.`);return}let n=e?.src?new URL(e.src).origin:window.location.origin,r=`wc_session_${t}`,i=`wc_cursor_${t}`,a=`wc_name_${t}`,o=null,s=!1,c=null,l=!1,u=!1,d=null;function f(){try{return localStorage.getItem(i)}catch{return null}}function p(e){try{let t=f();(!t||e>t)&&localStorage.setItem(i,e)}catch{}}function m(){try{localStorage.removeItem(i)}catch{}}let h=null,g=null,_=null,v=null,y=null;function b(e){return`
:host, .wc-host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
button { font: inherit; cursor: pointer; }
input, textarea { font: inherit; }

.wc-launcher {
	position: fixed; bottom: 24px; right: 24px;
	width: 60px; height: 60px; border-radius: 50%;
	background: linear-gradient(135deg, ${e} 0%, ${S(e,-18)} 100%);
	border: none;
	box-shadow: 0 10px 30px ${x(e,.35)}, 0 4px 10px rgba(15, 23, 42, 0.12);
	display: flex; align-items: center; justify-content: center;
	z-index: 2147483646;
	transition: transform .22s cubic-bezier(.2,.9,.3,1.4), box-shadow .22s ease;
	color: #fff;
}
.wc-launcher:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 14px 36px ${x(e,.45)}, 0 6px 14px rgba(15, 23, 42, 0.18); }
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
	background: linear-gradient(135deg, ${e} 0%, ${S(e,-22)} 100%);
	color: #fff;
	display: flex; align-items: center; gap: 12px;
	flex-shrink: 0;
}
.wc-header::after {
	content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 24px;
	background: linear-gradient(to bottom, ${x(e,0)} 0%, ${x(e,0)} 100%);
	pointer-events: none;
}
.wc-logo { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: rgba(255,255,255,.22); flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
.wc-logo-placeholder { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,.28); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,.15); font-size: 15px; font-weight: 600; color: #fff; letter-spacing: .02em; text-transform: uppercase; }
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
.wc-label::after { content: ' *'; color: ${e}; }
.wc-input {
	width: 100%; padding: 12px 14px;
	background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
	color: #0f172a; font-size: 14px;
	outline: none;
	transition: border-color .15s, background .15s, box-shadow .15s;
}
.wc-input::placeholder { color: #94a3b8; }
.wc-input:hover { border-color: #cbd5e1; }
.wc-input:focus { border-color: ${e}; background: #fff; box-shadow: 0 0 0 4px ${x(e,.12)}; }

.wc-submit {
	width: 100%; padding: 13px;
	background: linear-gradient(135deg, ${e} 0%, ${S(e,-18)} 100%);
	color: #fff; border: none; border-radius: 12px;
	font-size: 14px; font-weight: 600; letter-spacing: .01em;
	display: flex; align-items: center; justify-content: center; gap: 8px;
	box-shadow: 0 6px 16px ${x(e,.32)};
	transition: transform .15s, box-shadow .15s, opacity .15s;
}
.wc-submit:hover { transform: translateY(-1px); box-shadow: 0 8px 20px ${x(e,.42)}; }
.wc-submit:active { transform: translateY(0); }
.wc-submit:disabled { opacity: .6; cursor: not-allowed; transform: none; box-shadow: 0 4px 10px ${x(e,.22)}; }

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
	background: linear-gradient(135deg, ${e} 0%, ${S(e,-18)} 100%);
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
	background: linear-gradient(135deg, ${e} 0%, ${S(e,-12)} 100%);
	color: #fff;
	border-radius: 16px 16px 4px 16px;
	box-shadow: 0 2px 6px ${x(e,.25)};
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
.wc-textarea:focus { border-color: ${e}; background: #fff; box-shadow: 0 0 0 4px ${x(e,.12)}; }
.wc-send {
	width: 42px; height: 42px; flex-shrink: 0;
	background: linear-gradient(135deg, ${e} 0%, ${S(e,-18)} 100%);
	color: #fff; border: none; border-radius: 12px;
	display: flex; align-items: center; justify-content: center;
	box-shadow: 0 4px 10px ${x(e,.28)};
	transition: transform .15s, box-shadow .15s, opacity .15s;
}
.wc-send:hover { transform: translateY(-1px); box-shadow: 0 6px 14px ${x(e,.38)}; }
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
	background: linear-gradient(135deg, ${e} 0%, ${S(e,-18)} 100%);
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
`}function x(e,t){let n=e.replace(`#`,``),r=n.length===3?n.split(``).map(e=>e+e).join(``):n,i=parseInt(r.substring(0,2),16),a=parseInt(r.substring(2,4),16),o=parseInt(r.substring(4,6),16);return isNaN(i)||isNaN(a)||isNaN(o)?`rgba(99, 102, 241, ${t})`:`rgba(${i}, ${a}, ${o}, ${t})`}function S(e,t){let n=e.replace(`#`,``),r=n.length===3?n.split(``).map(e=>e+e).join(``):n,i=parseInt(r.substring(0,2),16),a=parseInt(r.substring(2,4),16),o=parseInt(r.substring(4,6),16);return isNaN(i)||isNaN(a)||isNaN(o)?e:(i=Math.max(0,Math.min(255,Math.round(i+i*t/100))),a=Math.max(0,Math.min(255,Math.round(a+a*t/100))),o=Math.max(0,Math.min(255,Math.round(o+o*t/100))),`#${i.toString(16).padStart(2,`0`)}${a.toString(16).padStart(2,`0`)}${o.toString(16).padStart(2,`0`)}`)}function C(){let e=document.createElement(`div`);return e.id=`contractor-os-webchat`,e.style.cssText=`all: initial; position: fixed; width: 0; height: 0; z-index: 2147483646;`,e.addEventListener(`wheel`,e=>{e.preventDefault(),_&&(_.scrollTop+=e.deltaY)},{passive:!1}),document.body.appendChild(e),e.attachShadow({mode:`open`})}function w(){let e=document.createElement(`button`);return e.className=`wc-launcher`,e.setAttribute(`aria-label`,`Open chat`),e.setAttribute(`type`,`button`),e.innerHTML=`<svg class="wc-icon wc-icon-chat" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><svg class="wc-icon wc-icon-close" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,e.addEventListener(`click`,L),e}function T(e){let t=document.createElement(`div`);t.className=`wc-panel`,t.setAttribute(`role`,`dialog`),t.setAttribute(`aria-label`,`${e.org_name} chat`);let n=document.createElement(`div`);if(n.className=`wc-header`,e.logo_url){let t=document.createElement(`img`);t.className=`wc-logo`,t.src=e.logo_url,t.alt=e.org_name,t.addEventListener(`error`,()=>{let n=document.createElement(`div`);n.className=`wc-logo-placeholder`,n.textContent=N(e.org_name),t.replaceWith(n)}),n.appendChild(t)}else{let t=document.createElement(`div`);t.className=`wc-logo-placeholder`,t.textContent=N(e.org_name),n.appendChild(t)}let r=document.createElement(`div`);r.className=`wc-header-text`;let i=document.createElement(`span`);i.className=`wc-org-name`,i.textContent=e.org_name,r.appendChild(i);let a=document.createElement(`span`);a.className=`wc-org-status`,a.innerHTML=`<span class="wc-status-dot"></span><span>${e.webchat_mode===`instant`?`We reply in minutes`:`We reply by text`}</span>`,r.appendChild(a),n.appendChild(r);let o=document.createElement(`button`);o.className=`wc-close`,o.setAttribute(`aria-label`,`Close chat`),o.setAttribute(`type`,`button`),o.innerHTML=`<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,o.addEventListener(`click`,L),n.appendChild(o),t.appendChild(n);let s=document.createElement(`div`);s.className=`wc-body`,t.appendChild(s),_=s;let c=document.createElement(`div`);return c.className=`wc-branding`,c.innerHTML=`Powered by <a href="https://contractorgrowth.app" target="_blank" rel="noopener">Contractor Growth OS</a>`,t.appendChild(c),t}function E(e){let t=document.createElement(`div`);t.className=`wc-form`;let n=document.createElement(`p`);n.className=`wc-form-intro`,n.textContent=e.intro_message||`Hi! Send us a message and we'll get back to you shortly.`,t.appendChild(n);let r=document.createElement(`div`);r.className=`wc-field`;let i=document.createElement(`label`);i.className=`wc-label`,i.textContent=`Your name`;let a=document.createElement(`input`);a.className=`wc-input`,a.type=`text`,a.placeholder=`Jane Smith`,a.autocomplete=`name`,r.append(i,a),t.appendChild(r);let o=document.createElement(`div`);o.className=`wc-field`;let s=document.createElement(`label`);s.className=`wc-label`,s.textContent=`Phone number`;let c=document.createElement(`input`);c.className=`wc-input`,c.type=`tel`,c.placeholder=`(555) 123-4567`,c.autocomplete=`tel`,o.append(s,c),t.appendChild(o);let l=document.createElement(`div`);l.className=`wc-error`,t.appendChild(l);let u=document.createElement(`button`);u.className=`wc-submit`,u.type=`button`;let d=e.webchat_mode===`instant`?`Start chat`:`Send message`;if(u.textContent=d,t.appendChild(u),e.webchat_mode===`asynchronous`&&e.offline_message){let n=document.createElement(`p`);n.className=`wc-mode-hint`,n.textContent=e.offline_message,t.appendChild(n)}let f=e=>{l.textContent=e,l.classList.add(`wc-visible`)},p=()=>l.classList.remove(`wc-visible`);return u.addEventListener(`click`,async()=>{I();let t=a.value.trim(),n=c.value.trim();if(!t||!n){f(`Please enter your name and phone number.`);return}p(),u.disabled=!0,u.textContent=`Starting…`;let r=await H(t,n,e);r&&(f(r),u.disabled=!1,u.textContent=d)}),[a,c].forEach(e=>{e.addEventListener(`click`,I),e.addEventListener(`keydown`,e=>{I(),e.key===`Enter`&&(e.preventDefault(),u.click())})}),t}function D(){if(!_||!o||!g)return;if(_.innerHTML=``,o.config.intro_message){let e=document.createElement(`div`);e.className=`wc-intro-bubble`,e.textContent=o.config.intro_message,_.appendChild(e)}for(let e of o.messages)O(e,e.direction===`inbound`?`out`:`in`);y&&y.remove(),y=document.createElement(`div`),y.className=`wc-composer`;let e=document.createElement(`textarea`);e.className=`wc-textarea`,e.placeholder=`Type your message…`,e.rows=1,y.appendChild(e);let t=document.createElement(`button`);t.className=`wc-send`,t.setAttribute(`aria-label`,`Send message`),t.setAttribute(`type`,`button`),t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,y.appendChild(t);let n=g.querySelector(`.wc-branding`);n?g.insertBefore(y,n):g.appendChild(y);let r=()=>U(e,t);t.addEventListener(`click`,r),e.addEventListener(`click`,I),e.addEventListener(`keydown`,e=>{I(),e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),r())}),e.addEventListener(`input`,()=>{I(),e.style.height=`auto`,e.style.height=Math.min(e.scrollHeight,120)+`px`}),k(),setTimeout(()=>e.focus(),100)}function O(e,t){if(!_||!o)return;let n=document.createElement(`div`);if(n.className=`wc-msg-row wc-${t}`,n.dataset.msgId=e.id,t===`in`){let e=document.createElement(`div`);e.className=`wc-msg-avatar wc-msg-avatar-org`;let t=o.config.logo_url,r=o.config.org_name;if(t){let n=document.createElement(`img`);n.src=t,n.alt=r,n.addEventListener(`error`,()=>{e.textContent=N(r),e.classList.add(`wc-msg-avatar-fallback`)}),e.appendChild(n)}else e.textContent=N(r),e.classList.add(`wc-msg-avatar-fallback`);n.appendChild(e)}let r=document.createElement(`div`);r.className=`wc-msg`;let i=document.createElement(`span`);i.textContent=e.body,r.appendChild(i);let a=document.createElement(`span`);if(a.className=`wc-msg-time`,a.textContent=M(e.sent_at),r.appendChild(a),n.appendChild(r),t===`out`){let e=document.createElement(`div`);e.className=`wc-msg-avatar wc-msg-avatar-visitor`,e.textContent=N(o.visitor_name||`?`),n.appendChild(e)}_.appendChild(n),k()}function k(){_&&requestAnimationFrame(()=>{_.scrollTop=_.scrollHeight})}function A(){if(!_||!o)return;j();let e=document.createElement(`div`);e.className=`wc-typing`,e.id=`wc-typing-indicator`;let t=document.createElement(`div`);t.className=`wc-typing-avatar`,t.textContent=N(o.config.org_name),e.appendChild(t);let n=document.createElement(`div`);n.className=`wc-typing-dots`;for(let e=0;e<3;e++){let e=document.createElement(`span`);e.className=`wc-typing-dot`,n.appendChild(e)}e.appendChild(n),_.appendChild(e),k()}function j(){if(!_)return;let e=_.querySelector(`#wc-typing-indicator`);e&&e.remove()}function M(e){try{return new Date(e).toLocaleTimeString([],{hour:`numeric`,minute:`2-digit`})}catch{return``}}function N(e){return e.split(/\s+/).map(e=>e[0]?.toUpperCase()??``).slice(0,2).join(``)||`?`}function P(){d&&=(clearTimeout(d),null)}function F(){P(),d=setTimeout(()=>{s&&L()},2e4)}function I(){s&&F()}function L(){s=!s,g&&g.setAttribute(`data-open`,String(s)),v&&(v.setAttribute(`data-open`,String(s)),v.setAttribute(`aria-label`,s?`Close chat`:`Open chat`)),s?F():P()}async function R(){h=C();let e=localStorage.getItem(r);if(e){try{let t=JSON.parse(e),n=await V(t.session_id,t.session_token);if(n){o=n;for(let e of n.messages)p(e.created_at);z(o.config),D(),G();return}}catch{}localStorage.removeItem(r),m()}let t=await B();t&&(z(t),_&&_.appendChild(E(t)))}function z(e){if(!h)return;let t=e.primary_color||`#6366f1`,n=document.createElement(`style`);n.textContent=b(t),h.appendChild(n),v=w(),g=T(e),h.appendChild(v),h.appendChild(g)}async function B(){try{let e=await fetch(`${n}/api/webchat/config?token=${t}`);return e.ok?(await e.json()).data??null:null}catch{return null}}async function V(e,t){try{let r=await fetch(`${n}/api/webchat/session/${e}/restore`,{headers:{Authorization:`Bearer ${t}`}});if(!r.ok)return null;let i=await r.json();if(!i.data)return null;let o=localStorage.getItem(a)||i.data.visitor_name||``;return!localStorage.getItem(a)&&i.data.visitor_name&&localStorage.setItem(a,i.data.visitor_name),{session_id:e,session_token:t,config:{org_name:i.data.org_name,logo_url:i.data.logo_url,primary_color:i.data.primary_color,intro_message:i.data.intro_message,offline_message:i.data.offline_message,webchat_mode:i.data.webchat_mode},messages:i.data.messages,visitor_name:o}}catch{return null}}async function H(e,i,s){try{let s=await fetch(`${n}/api/webchat/session/start`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({widget_token:t,name:e,phone:i})}),c=await s.json();return!s.ok||!c.data?s.status===429?`Too many requests. Please try again in a moment.`:c.error??`Failed to start chat. Please try again.`:(o={session_id:c.data.session_id,session_token:c.data.session_token,config:{org_name:c.data.org_name,logo_url:c.data.logo_url,primary_color:c.data.primary_color,intro_message:c.data.intro_message,offline_message:c.data.offline_message,webchat_mode:c.data.webchat_mode},messages:[],visitor_name:e},localStorage.setItem(r,JSON.stringify({session_id:o.session_id,session_token:o.session_token})),localStorage.setItem(a,e),m(),D(),G(),null)}catch{return`Network error. Please try again.`}}async function U(e,t){if(!o)return;let r=e.value.trim();if(!r)return;e.value=``,e.style.height=`auto`,t.disabled=!0;let i=new Date().toISOString(),a={id:`opt-${Date.now()}`,body:r,created_at:i,sent_at:i,direction:`inbound`};o.messages.push(a),O(a,`out`);try{(await fetch(`${n}/api/webchat/session/${o.session_id}/messages`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${o.session_token}`},body:JSON.stringify({body:r})})).ok||(W(a.id),e.value=r)}catch{W(a.id),e.value=r}finally{t.disabled=!1,e.focus()}}function W(e){if(!o||!_)return;o.messages=o.messages.filter(t=>t.id!==e);let t=_.querySelector(`.wc-msg-row[data-msg-id="${e}"]`);t&&t.remove()}function G(){o&&(K(),J())}function K(){c&&=(clearTimeout(c),null)}function q(){K(),c=setTimeout(()=>{J()},3e3)}async function J(){if(!o||l){q();return}l=!0;try{let e=f(),t=new URLSearchParams({});e&&t.set(`since`,e);let r=`${n}/api/webchat/session/${o.session_id}/messages${t.toString()?`?${t}`:``}`,i=await fetch(r,{headers:{Authorization:`Bearer ${o.session_token}`}});if(i.ok){let e=await i.json(),t=e.data?.messages??[];for(let e of t){if(!o)break;if(p(e.created_at),o.messages.some(t=>t.id===e.id))continue;let t={...e,direction:`outbound`};o.messages.push(t),O(t,`in`)}let n=e.data?.contractor_is_typing??!1;n!==u&&(u=n,n?A():j())}}catch{}finally{l=!1,o&&q()}}document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,()=>{R()}):R()})()})();