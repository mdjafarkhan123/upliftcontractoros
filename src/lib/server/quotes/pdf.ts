import puppeteer, { type Browser } from 'puppeteer';
import { presignDownloadUrl, uploadBuffer } from '$lib/server/r2/client';

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
	if (_browser && _browser.connected) return _browser;
	_browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});
	return _browser;
}

function escapeHtml(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export type QuotePdfData = {
	org: {
		name: string;
		address: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
		twilio_phone_number: string | null;
	};
	quote: {
		id: string;
		quote_number_display: string;
		title: string;
		subtotal: string;
		tax_rate: string;
		tax_amount: string;
		total: string;
		notes: string | null;
		deposit_required: boolean;
		deposit_amount: string | null;
		created_at: Date;
	};
	contact: { full_name: string; email: string | null; phone: string | null };
	lineItems: { description: string; quantity: string; unit_price: string; total: string }[];
};

function fmtMoney(n: string): string {
	const v = Number(n);
	return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function renderHtml(d: QuotePdfData): string {
	const orgAddress = [d.org.address, [d.org.city, d.org.state, d.org.zip].filter(Boolean).join(' ')]
		.filter(Boolean)
		.join(' · ');
	const rows = d.lineItems
		.map(
			(li) => `<tr>
				<td>${escapeHtml(li.description)}</td>
				<td class="num">${escapeHtml(li.quantity)}</td>
				<td class="num">${fmtMoney(li.unit_price)}</td>
				<td class="num">${fmtMoney(li.total)}</td>
			</tr>`
		)
		.join('');
	const taxPct = (Number(d.quote.tax_rate) * 100).toFixed(2) + '%';

	return `<!doctype html>
<html><head><meta charset="utf-8"><style>
	* { box-sizing: border-box; }
	body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; padding:40px; margin:0; }
	.header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #e2e8f0; padding-bottom:16px; margin-bottom:24px; }
	h1 { font-size:24px; margin:0 0 4px; }
	.muted { color:#64748b; font-size:12px; }
	.meta { margin:0 0 24px; font-size:13px; color:#334155; }
	table { width:100%; border-collapse:collapse; margin-top:16px; font-size:13px; }
	th { text-align:left; padding:10px 8px; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-weight:600; color:#475569; }
	td { padding:10px 8px; border-bottom:1px solid #f1f5f9; }
	td.num, th.num { text-align:right; }
	.totals { margin-top:16px; margin-left:auto; width:280px; font-size:13px; }
	.totals .row { display:flex; justify-content:space-between; padding:6px 0; }
	.totals .row.grand { border-top:1px solid #e2e8f0; margin-top:8px; padding-top:12px; font-weight:700; font-size:15px; }
	.notes { margin-top:32px; padding:16px; background:#f8fafc; border-radius:8px; font-size:13px; color:#334155; white-space:pre-wrap; }
</style></head><body>
	<div class="header">
		<div>
			<h1>${escapeHtml(d.org.name)}</h1>
			<div class="muted">${escapeHtml(orgAddress)}</div>
			${d.org.twilio_phone_number ? `<div class="muted">${escapeHtml(d.org.twilio_phone_number)}</div>` : ''}
		</div>
		<div style="text-align:right;">
			<div class="muted">Quote</div>
			<div style="font-size:22px;font-weight:700;">${escapeHtml(d.quote.quote_number_display)}</div>
			<div class="muted">${d.quote.created_at.toLocaleDateString('en-US')}</div>
		</div>
	</div>
	<div class="meta">
		<strong>${escapeHtml(d.contact.full_name)}</strong><br>
		${d.contact.phone ? escapeHtml(d.contact.phone) : ''}${d.contact.email ? (d.contact.phone ? '<br>' : '') + escapeHtml(d.contact.email) : ''}
	</div>
	<div style="font-weight:600;font-size:16px;margin-bottom:8px;">${escapeHtml(d.quote.title)}</div>
	<table>
		<thead><tr>
			<th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th>
		</tr></thead>
		<tbody>${rows}</tbody>
	</table>
	<div class="totals">
		<div class="row"><span>Subtotal</span><span>${fmtMoney(d.quote.subtotal)}</span></div>
		<div class="row"><span>Tax (${taxPct})</span><span>${fmtMoney(d.quote.tax_amount)}</span></div>
		<div class="row grand"><span>Total</span><span>${fmtMoney(d.quote.total)}</span></div>
		${d.quote.deposit_required && d.quote.deposit_amount ? `<div class="row"><span>Deposit due</span><span>${fmtMoney(d.quote.deposit_amount)}</span></div>` : ''}
	</div>
	${d.quote.notes ? `<div class="notes">${escapeHtml(d.quote.notes)}</div>` : ''}
</body></html>`;
}

export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
	const browser = await getBrowser();
	const page = await browser.newPage();
	try {
		await page.setContent(renderHtml(data), { waitUntil: 'networkidle0' });
		const pdf = await page.pdf({
			format: 'Letter',
			printBackground: true,
			margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' }
		});
		return Buffer.from(pdf);
	} finally {
		await page.close();
	}
}

export async function generateAndStoreQuotePdf(
	data: QuotePdfData
): Promise<{ url: string; key: string }> {
	const pdf = await renderQuotePdf(data);
	const key = `quotes/${data.quote.id}/${Date.now()}.pdf`;
	await uploadBuffer(key, pdf, 'application/pdf');
	const url = await presignDownloadUrl(key, 3600);
	return { url, key };
}
