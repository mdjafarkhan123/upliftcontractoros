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

export type InvoicePdfData = {
	org: {
		name: string;
		address: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
		twilio_phone_number: string;
	};
	invoice: {
		id: string;
		invoice_number_display: string;
		title: string;
		status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
		subtotal: string;
		tax_rate: string;
		tax_amount: string;
		total: string;
		amount_paid: string;
		amount_due: string;
		notes: string | null;
		due_date: string | null;
		created_at: Date;
	};
	contact: { full_name: string; email: string | null; phone: string | null };
	lineItems: { description: string; quantity: string; unit_price: string; total: string }[];
	payments: { amount: string; payment_method: string; paid_at: Date; notes: string | null }[];
};

function fmtMoney(n: string): string {
	const v = Number(n);
	return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(d: Date): string {
	return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderHtml(d: InvoicePdfData): string {
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
	const taxPct = (Number(d.invoice.tax_rate) * 100).toFixed(2) + '%';

	const paymentsHtml = d.payments.length
		? `<div class="section-title">Payment history</div>
			<table class="payments">
				<thead><tr>
					<th>Date</th><th>Method</th><th>Note</th><th class="num">Amount</th>
				</tr></thead>
				<tbody>${d.payments
					.map(
						(p) => `<tr>
							<td>${fmtDate(p.paid_at)}</td>
							<td>${escapeHtml(p.payment_method)}</td>
							<td>${escapeHtml(p.notes ?? '')}</td>
							<td class="num">${fmtMoney(p.amount)}</td>
						</tr>`
					)
					.join('')}</tbody>
			</table>`
		: '';

	const statusLabel = d.invoice.status === 'partially_paid' ? 'Partially paid' : d.invoice.status;
	const dueDateLine = d.invoice.due_date
		? `<div class="muted">Due ${fmtDate(new Date(d.invoice.due_date + 'T00:00:00'))}</div>`
		: '';

	return `<!doctype html>
<html><head><meta charset="utf-8"><style>
	* { box-sizing: border-box; }
	body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; padding:40px; margin:0; }
	.header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #e2e8f0; padding-bottom:16px; margin-bottom:24px; }
	h1 { font-size:24px; margin:0 0 4px; }
	.muted { color:#64748b; font-size:12px; }
	.meta { margin:0 0 24px; font-size:13px; color:#334155; }
	.section-title { margin:24px 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:#64748b; font-weight:600; }
	table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
	th { text-align:left; padding:10px 8px; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-weight:600; color:#475569; }
	td { padding:10px 8px; border-bottom:1px solid #f1f5f9; }
	td.num, th.num { text-align:right; }
	.totals { margin-top:16px; margin-left:auto; width:280px; font-size:13px; }
	.totals .row { display:flex; justify-content:space-between; padding:6px 0; }
	.totals .row.paid { color:#047857; }
	.totals .row.grand { border-top:1px solid #e2e8f0; margin-top:8px; padding-top:12px; font-weight:700; font-size:15px; }
	.notes { margin-top:32px; padding:16px; background:#f8fafc; border-radius:8px; font-size:13px; color:#334155; white-space:pre-wrap; }
	.status-pill { display:inline-block; padding:2px 10px; border-radius:999px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; background:#e0f2fe; color:#075985; }
	.status-paid { background:#dcfce7; color:#15803d; }
	.status-overdue { background:#fee2e2; color:#b91c1c; }
</style></head><body>
	<div class="header">
		<div>
			<h1>${escapeHtml(d.org.name)}</h1>
			<div class="muted">${escapeHtml(orgAddress)}</div>
			<div class="muted">${escapeHtml(d.org.twilio_phone_number)}</div>
		</div>
		<div style="text-align:right;">
			<div class="muted">Invoice</div>
			<div style="font-size:22px;font-weight:700;">${escapeHtml(d.invoice.invoice_number_display)}</div>
			<div class="muted">${fmtDate(d.invoice.created_at)}</div>
			${dueDateLine}
			<div style="margin-top:6px;"><span class="status-pill status-${d.invoice.status}">${escapeHtml(statusLabel)}</span></div>
		</div>
	</div>
	<div class="meta">
		<strong>${escapeHtml(d.contact.full_name)}</strong><br>
		${d.contact.phone ? escapeHtml(d.contact.phone) : ''}${d.contact.email ? (d.contact.phone ? '<br>' : '') + escapeHtml(d.contact.email) : ''}
	</div>
	<div style="font-weight:600;font-size:16px;margin-bottom:8px;">${escapeHtml(d.invoice.title)}</div>
	<table>
		<thead><tr>
			<th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th>
		</tr></thead>
		<tbody>${rows}</tbody>
	</table>
	<div class="totals">
		<div class="row"><span>Subtotal</span><span>${fmtMoney(d.invoice.subtotal)}</span></div>
		<div class="row"><span>Tax (${taxPct})</span><span>${fmtMoney(d.invoice.tax_amount)}</span></div>
		<div class="row grand"><span>Total</span><span>${fmtMoney(d.invoice.total)}</span></div>
		${Number(d.invoice.amount_paid) > 0 ? `<div class="row paid"><span>Paid</span><span>−${fmtMoney(d.invoice.amount_paid)}</span></div>` : ''}
		${Number(d.invoice.amount_paid) > 0 ? `<div class="row grand"><span>Balance due</span><span>${fmtMoney(d.invoice.amount_due)}</span></div>` : ''}
	</div>
	${paymentsHtml}
	${d.invoice.notes ? `<div class="notes">${escapeHtml(d.invoice.notes)}</div>` : ''}
</body></html>`;
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
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

export async function generateAndStoreInvoicePdf(
	data: InvoicePdfData
): Promise<{ url: string; key: string }> {
	const pdf = await renderInvoicePdf(data);
	const key = `invoices/${data.invoice.id}/${Date.now()}.pdf`;
	await uploadBuffer(key, pdf, 'application/pdf');
	const url = await presignDownloadUrl(key, 3600);
	return { url, key };
}
