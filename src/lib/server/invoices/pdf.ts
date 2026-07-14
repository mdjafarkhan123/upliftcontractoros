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
		twilio_phone_number: string | null;
	};
	invoice: {
		id: string;
		invoice_number_display: string;
		title: string;
		status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
		subtotal: string;
		discount_type: string;
		discount_value: string | null;
		discount_amount: string | null;
		discount_label: string | null;
		tax_rate: string;
		tax_amount: string;
		total: string;
		amount_paid: string;
		amount_due: string;
		// Tips collected (M7). Extra money on top of the balance — its own row, never in Total.
		tip_total: string;
		// Late fee charged (M8). Real money added after tax — its own row, already in Total.
		late_fee_total: string;
		notes: string | null;
		terms: string | null;
		due_date: string | null;
		created_at: Date;
	};
	contact: { full_name: string; email: string | null; phone: string | null };
	lineItems: {
		description: string;
		quantity: string;
		unit_price: string;
		total: string;
		taxable?: boolean;
	}[];
	payments: {
		amount: string;
		tip_amount?: string;
		payment_method: string;
		paid_at: Date;
		notes: string | null;
	}[];
	// Client sign-off carried over from the linked job (Session 6). Null when the job wasn't
	// signed off, or the invoice has no linked job. `signature_url` is a short-lived signed R2 URL.
	signoff?: {
		signer_name: string | null;
		signed_at: string;
		signature_url: string;
	} | null;
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
	// Only hint tax-exempt lines when tax actually applies to this invoice.
	const hasTax = Number(d.invoice.tax_rate) > 0;
	const rows = d.lineItems
		.map(
			(li) => `<tr>
				<td>${escapeHtml(li.description)}${
					hasTax && li.taxable === false ? '<span class="taxexempt">Tax exempt</span>' : ''
				}</td>
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
							<td class="num">${fmtMoney(p.amount)}${
								Number(p.tip_amount ?? 0) > 0 ? ` <span class="muted">(+${fmtMoney(p.tip_amount ?? '0')} tip)</span>` : ''
							}</td>
						</tr>`
					)
					.join('')}</tbody>
			</table>`
		: '';

	const signoffHtml = d.signoff
		? `<div class="signoff">
				<div class="section-title">Client sign-off</div>
				<img class="signoff-img" src="${escapeHtml(d.signoff.signature_url)}" alt="Client signature" />
				<div class="muted">Signed${
					d.signoff.signer_name ? ` by ${escapeHtml(d.signoff.signer_name)}` : ''
				} on ${fmtDate(new Date(d.signoff.signed_at))}</div>
			</div>`
		: '';

	// Invoice-level discount row — shown only when a real dollars-off amount exists.
	const discountNum = Number(d.invoice.discount_amount ?? 0);
	const discountLabel = (() => {
		const base = d.invoice.discount_label?.trim() || 'Discount';
		if (d.invoice.discount_type === 'percent' && d.invoice.discount_value) {
			const v = Number(d.invoice.discount_value);
			return `${base} (${v.toFixed(v % 1 === 0 ? 0 : 2)}%)`;
		}
		return base;
	})();
	const discountRow =
		discountNum > 0
			? `<div class="row discount"><span>${escapeHtml(discountLabel)}</span><span>−${fmtMoney(
					d.invoice.discount_amount ?? '0'
				)}</span></div>`
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
	.taxexempt { display:inline-block; margin-left:8px; padding:1px 7px; border-radius:999px; font-size:10px; font-weight:600; background:#f1f5f9; color:#64748b; vertical-align:middle; }
	.totals { margin-top:16px; margin-left:auto; width:280px; font-size:13px; }
	.totals .row { display:flex; justify-content:space-between; padding:6px 0; }
	.totals .row.paid { color:#047857; }
	.totals .row.discount { color:#047857; }
	.totals .row.grand { border-top:1px solid #e2e8f0; margin-top:8px; padding-top:12px; font-weight:700; font-size:15px; }
	.notes { margin-top:32px; padding:16px; background:#f8fafc; border-radius:8px; font-size:13px; color:#334155; white-space:pre-wrap; }
	.terms { margin-top:24px; padding:16px; background:#f8fafc; border-radius:8px; font-size:12px; color:#334155; white-space:pre-wrap; line-height:1.5; }
	.terms .terms-title { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#64748b; font-weight:600; margin-bottom:6px; }
	.status-pill { display:inline-block; padding:2px 10px; border-radius:999px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; background:#e0f2fe; color:#075985; }
	.status-paid { background:#dcfce7; color:#15803d; }
	.status-overdue { background:#fee2e2; color:#b91c1c; }
	.signoff { margin-top:32px; }
	.signoff-img { display:block; max-width:280px; max-height:120px; object-fit:contain; border:1px solid #e2e8f0; border-radius:8px; background:#fff; padding:8px; margin-bottom:6px; }
</style></head><body>
	<div class="header">
		<div>
			<h1>${escapeHtml(d.org.name)}</h1>
			<div class="muted">${escapeHtml(orgAddress)}</div>
			${d.org.twilio_phone_number ? `<div class="muted">${escapeHtml(d.org.twilio_phone_number)}</div>` : ''}
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
		${discountRow}
		<div class="row"><span>Tax (${taxPct})</span><span>${fmtMoney(d.invoice.tax_amount)}</span></div>
		${Number(d.invoice.late_fee_total) > 0 ? `<div class="row"><span>Late fee</span><span>${fmtMoney(d.invoice.late_fee_total)}</span></div>` : ''}
		<div class="row grand"><span>Total</span><span>${fmtMoney(d.invoice.total)}</span></div>
		${Number(d.invoice.amount_paid) > 0 ? `<div class="row paid"><span>Paid</span><span>−${fmtMoney(d.invoice.amount_paid)}</span></div>` : ''}
		${Number(d.invoice.amount_paid) > 0 ? `<div class="row grand"><span>Balance due</span><span>${fmtMoney(d.invoice.amount_due)}</span></div>` : ''}
		${Number(d.invoice.tip_total) > 0 ? `<div class="row paid"><span>Tip</span><span>${fmtMoney(d.invoice.tip_total)}</span></div>` : ''}
	</div>
	${paymentsHtml}
	${d.invoice.notes ? `<div class="notes">${escapeHtml(d.invoice.notes)}</div>` : ''}
	${
		d.invoice.terms?.trim()
			? `<div class="terms"><div class="terms-title">Terms &amp; Conditions</div>${escapeHtml(d.invoice.terms)}</div>`
			: ''
	}
	${signoffHtml}
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
