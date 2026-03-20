// ==UserScript==
// @name         AI Chat Export Helper
// @namespace    https://greasyfork.org/
// @version      0.2
// @description  Export your Microsoft Copilot chat as plain text or JSON with one click.
// @author       Micropolis AI Team
// @match        https://copilot.microsoft.com/*
// @match        https://www.copilot.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
	'use strict';

	function getChatContainer() {
		const main = document.querySelector('main');
		if (main) {
			const chatDiv = main.querySelector('[class*="@container/chat"]');
			if (chatDiv) return chatDiv;
			return main;
		}
		return document.body;
	}

	function preSanitize(clone) {
		clone.querySelectorAll('div[id$="-user-message"]').forEach(el => {
			if (el.parentElement && el.parentElement.getAttribute('data-ce-role') === 'user') {
				return;
			}
			const wrapper = document.createElement('div');
			wrapper.setAttribute('data-ce-role', 'user');
			while (el.firstChild) wrapper.appendChild(el.firstChild);
			el.replaceWith(wrapper);
		});

		clone.querySelectorAll('[class*="group/ai-message"]').forEach(el => {
			if (el.closest('[data-ce-role="ai"]') || el.getAttribute('data-ce-role') === 'ai') {
				return;
			}

			const wrapper = document.createElement('div');
			wrapper.setAttribute('data-ce-role', 'ai');
			while (el.firstChild) wrapper.appendChild(el.firstChild);
			el.replaceWith(wrapper);
		});
	}

	function cloneAndSanitize(node) {
		const clone = node.cloneNode(true);

		preSanitize(clone);

		clone.querySelectorAll(
			'button, .sr-only, nav, header, footer, script, style, iframe, noscript'
		).forEach(el => el.remove());

		const copilotChrome = [
			'[data-testid="sticky-header"]',
			'[data-testid="sentinel-div"]',
		];
		clone.querySelectorAll(copilotChrome.join(', ')).forEach(el => el.remove());

		clone.querySelectorAll('*').forEach(el => {
			[...el.attributes].forEach(attr => {
				if (attr.name.toLowerCase().startsWith('on')) {
					el.removeAttribute(attr.name);
				}
			});
		});

		return clone;
	}

	function htmlToText(html) {
	    const parser = new DOMParser();
	    const doc = parser.parseFromString(html, 'text/html');

	    const temp = doc.body;

	    temp.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, pre, code, br').forEach(el => {
		 if (el.tagName === 'BR') {
		     el.replaceWith(document.createTextNode('\n'));
		 } else {
		     const text = document.createTextNode('\n');
		     el.parentNode.insertBefore(text, el.nextSibling);
		 }
	    });

	    let text = temp.textContent || '';
	    text = text.replace(/\n{3,}/g, '\n\n');
	    text = text.replace(/[ \t]+/g, ' ');
	    text = text.trim();

	    return text;
	}

	function convertToText(clonedElem) {
		clonedElem.querySelectorAll('[data-ce-role="user"]').forEach(el => {
			const text = htmlToText(el.innerHTML);
			el.replaceWith(document.createTextNode(`\n\n═══════════════════════════\nYOU:\n───────────────────────────\n${text}\n`));
		});

		clonedElem.querySelectorAll('[data-ce-role="ai"]').forEach(el => {
			const text = htmlToText(el.innerHTML);
			el.replaceWith(document.createTextNode(`\n\n═══════════════════════════\nCOPILOT:\n───────────────────────────\n${text}\n`));
		});

		let result = clonedElem.textContent || '';

		result = result.replace(/\n{3,}/g, '\n\n');
		result = result.trim();

		return result;
	}

	function convertToJSON(clonedElem) {
	    const messages = [];

	    // preserve DOM order
	    clonedElem.querySelectorAll('[data-ce-role="user"], [data-ce-role="ai"]').forEach(el => {
		 const role = el.getAttribute('data-ce-role') === 'user' ? 'user' : 'assistant';
		 const text = htmlToText(el.innerHTML).trim();
		 if (text) {
		     messages.push({ role, message: text });
		 }
	    });

	    return JSON.stringify(messages, null, 2); // pretty print with 2-space indentation
	}

	function downloadFile(content, filename, mimeType) {
		const blob = new Blob([content], {
			type: mimeType
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.style.display = 'none';
		document.body.appendChild(a);
		a.click();
		setTimeout(() => {
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}, 500);
	}

	function injectStyles() {
		const style = document.createElement('style');
		style.textContent = `
      #ce-fab {
        position: fixed !important;
        bottom: 90px !important;
        right: 26px !important;
        z-index: 2147483647 !important;
        width: 50px; height: 50px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        background-color: #efeae7;
				box-shadow: 0 4px 18px rgba(15,108,189,0.45);
        display: flex !important;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s cubic-bezier(.3,2,.5,1), box-shadow 0.2s;
        user-select: none;
      }
      #ce-fab:hover {
        transform: scale(1.12);
        box-shadow: 0 8px 28px rgba(15,108,189,0.6);
      }
      #ce-fab:active { transform: scale(0.95); }

      #ce-fab .ce-tip {
        position: absolute;
        right: 58px;
        background-color: #efeae7;
        color: #272320;
        font-size: 11.5px;
        font-family: system-ui, sans-serif;
        padding: 5px 11px;
        border-radius: 8px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      }
      #ce-fab:hover .ce-tip { opacity: 1; }

      #ce-modal {
        display: none;
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483646 !important;
        background: rgba(0,0,0,0.55);
        align-items: center;
        justify-content: center;
        animation: ceFadeIn 0.15s ease;
      }
      #ce-modal.open { display: flex !important; }
      @keyframes ceFadeIn { from { opacity: 0; } to { opacity: 1; } }

      #ce-dialog {
        background: #0f1619;
        border: 1px solid rgba(15,108,189,0.35);
        border-radius: 18px;
        padding: 28px 26px 22px;
        width: 340px;
        max-width: calc(100vw - 32px);
        box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        animation: ceSlideUp 0.18s cubic-bezier(.3,2,.5,1);
        font-family: system-ui, -apple-system, sans-serif;
        color: #e2e8f0;
      }
      @keyframes ceSlideUp {
        from { transform: translateY(18px) scale(0.97); opacity: 0; }
        to   { transform: translateY(0)    scale(1);    opacity: 1; }
      }

      #ce-dialog h2 {
        margin: 0 0 6px;
        font-size: 15px;
        font-weight: 700;
        color: #eaeaea;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #ce-dialog p {
        margin: 0 0 20px;
        font-size: 12.5px;
        color: #666;
        line-height: 1.5;
      }

      .ce-btn-row {
        display: flex;
        gap: 10px;
        margin-bottom: 14px;
      }
      .ce-export-btn {
        flex: 1;
        padding: 13px 0;
        border-radius: 12px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
        transition: opacity 0.15s, transform 0.12s;
      }
      .ce-export-btn:active { transform: scale(0.96); }

      .ce-btn-md {
        background: rgba(148,163,184,0.1);
        border: 1px solid rgba(148,163,184,0.25) !important;
        color: #eaeaea;
      }
      .ce-btn-md:hover { background: rgba(148,163,184,0.18); }

      .ce-cancel {
        width: 100%;
        padding: 9px 0;
        border-radius: 10px;
        border: none;
        background: transparent;
        color: #dadada;
        font-size: 12.5px;
        cursor: pointer;
        transition: color 0.15s;
      }
      .ce-cancel:hover { color: #94a3b8; }

      .ce-status {
        font-size: 11.5px;
        text-align: center;
        min-height: 16px;
        margin-top: 8px;
        color: #dadada;
      }
      .ce-status.ok  { color: #34d399; }
      .ce-status.err { color: #f87171; }
		`;
		(document.head || document.documentElement).appendChild(style);
	}

	function injectUI() {
		if (document.getElementById('ce-fab')) return;

		const fab = document.createElement('button');
		fab.id = 'ce-fab';
		fab.innerHTML = `💾<span class="ce-tip">Export chat</span>`;
		fab.addEventListener('click', () => {
			document.getElementById('ce-modal').classList.add('open');
		});
		document.body.appendChild(fab);

		const modal = document.createElement('div');
		modal.id = 'ce-modal';
		modal.innerHTML = `
		<div id="ce-dialog">
			<h2>Export Chat</h2>
			<p>Choose a format to save your chat.</p>
			<div class="ce-btn-row">
				<button class="ce-export-btn ce-btn-md" id="ce-btn-txt">📄 Text</button>
				<button class="ce-export-btn ce-btn-md" id="ce-btn-json">{} JSON</button>
			</div>
			<button class="ce-cancel" id="ce-cancel">Cancel</button>
			<div class="ce-status" id="ce-status"></div>
		</div>
		`;
		document.body.appendChild(modal);

		modal.addEventListener('click', e => {
			if (e.target === modal) closeModal();
		});

		document.getElementById('ce-cancel').addEventListener('click', closeModal);
		document.getElementById('ce-btn-txt').addEventListener('click', () => runExport('txt'));
		document.getElementById('ce-btn-json').addEventListener('click', () => runExport('json'));
	}

	function closeModal() {
		const modal = document.getElementById('ce-modal');
		if (modal) modal.classList.remove('open');
		setStatus('');
	}

	function setStatus(msg, type = '') {
		const el = document.getElementById('ce-status');
		if (!el) return;
		el.className = 'ce-status' + (type ? ` ${type}` : '');
		el.textContent = msg;
	}

	function exportChat(format) {
		const clonedElem = cloneAndSanitize(getChatContainer());
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

		if (format === 'json') {
			downloadFile(convertToJSON(clonedElem), `copilot-chat-${timestamp}.json`, 'application/json');
		} else {
			downloadFile(convertToText(clonedElem), `copilot-chat-${timestamp}.txt`, 'text/plain');
		}
	}

	function runExport(format) {
		try {
			setStatus('⏳ Exporting…');
			exportChat(format);
			setStatus('✓ Download started!', 'ok');
			setTimeout(closeModal, 1200);
		} catch (err) {
			console.error('[ChatExporter]', err);
			setStatus('⚠ Export failed.', 'err');
		}
	}


	function init() {
		let attempts = 0;
		const timer = setInterval(() => {
			attempts++;
			if (document.body) {
				clearInterval(timer);
				injectStyles();
				injectUI();
				new MutationObserver(() => {
					if (!document.getElementById('ce-fab')) buildUI();
				}).observe(document.body, {
					childList: true,
					subtree: false
				});
			} else if (attempts >= 20) {
				clearInterval(timer);
			}
		}, 500);
	}

	init();

})();
