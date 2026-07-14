import puppeteer, { type Browser } from 'puppeteer';
import { presignDownloadUrl, uploadBuffer } from '$lib/server/r2/client';
import { resolveBrandTheme } from '$lib/utils/brandColor';

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
		/** Resolved (signed) logo URL, or null. */
		logo_url: string | null;
		tagline: string | null;
		primary_color: string | null;
		// Business "Authorized by" signature block (org-level). Only rendered when
		// enabled and a name is set. signatureImageUrl is a resolved (signed) URL.
		signatureEnabled: boolean;
		signatureName: string | null;
		signatureTitle: string | null;
		signatureStatement: string | null;
		signatureImageUrl: string | null;
	};
	quote: {
		id: string;
		quote_number_display: string;
		title: string;
		subtotal: string;
		discount_type: string;
		discount_value: string | null;
		discount_amount: string | null;
		discount_label: string | null;
		tax_rate: string;
		tax_amount: string;
		total: string;
		notes: string | null;
		terms: string | null;
		deposit_required: boolean;
		deposit_amount: string | null;
		created_at: Date;
	};
	contact: { full_name: string; email: string | null; phone: string | null };
	serviceAddress: {
		address_line_1: string;
		address_line_2: string | null;
		city: string;
		state: string;
		zip: string;
	} | null;
	lineItems: {
		description: string;
		details?: string | null;
		quantity: string;
		unit: string | null;
		section_label: string | null;
		is_optional: boolean;
		// Per-line tax flag. Only taxable lines feed the quote's tax base; false shows a
		// "Tax exempt" hint on the PDF. Absent = taxable (the default).
		taxable?: boolean;
		// Good-Better-Best: the tier this line belongs to (null on a simple quote).
		package_id?: string | null;
		unit_price: string;
		total: string;
		// Per-line photos (resolved/signed URLs) rendered as small thumbnails under the
		// description. Empty/absent for lines without photos.
		photos?: { url: string }[];
	}[];
	// Good-Better-Best tiers. Empty on a simple quote; 2–3 entries on a tiered quote. When
	// present the PDF renders one block per tier instead of a single totals table.
	packages?: {
		id: string;
		name: string;
		is_recommended: boolean;
		subtotal: string;
		total: string;
	}[];
	// The customer's acceptance, rendered as a signed "Accepted by" block only when the quote is
	// accepted with a signature on file. imageUrl is the resolved (signed) URL of the drawn
	// signature (in-person "sign on this device"); null on a typed online acceptance. Null on
	// offline "mark approved" (no signature was captured).
	acceptance?: {
		signerName: string;
		signedAt: Date;
		imageUrl: string | null;
		inPerson: boolean;
	} | null;
};

function fmtMoney(n: string): string {
	const v = Number(n);
	return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function renderHtml(d: QuotePdfData): string {
	const orgAddress = [d.org.address, [d.org.city, d.org.state, d.org.zip].filter(Boolean).join(' ')]
		.filter(Boolean)
		.join(' · ');
	// Group line items into sections, preserving order. Items arrive ordered by position,
	// so a section's items are contiguous; we still group by label defensively. A null
	// label = ungrouped (no heading, no subtotal).
	type PdfLine = QuotePdfData['lineItems'][number];
	const photoStrip = (li: PdfLine): string =>
		li.photos && li.photos.length > 0
			? `<div class="linephotos">${li.photos
					.map((p) => `<img src="${escapeHtml(p.url)}" alt="" />`)
					.join('')}</div>`
			: '';
	const lineDetails = (li: PdfLine): string =>
		li.details && li.details.trim()
			? `<div class="linedetails">${escapeHtml(li.details)}</div>`
			: '';
	// Only surface "Tax exempt" when the quote actually charges tax — otherwise it's noise.
	const quoteHasTax = Number(d.quote.tax_rate) > 0;
	const taxExemptHint = (li: PdfLine): string =>
		quoteHasTax && li.taxable === false ? `<div class="linetaxexempt">Tax exempt</div>` : '';
	const lineRow = (li: PdfLine): string => `<tr>
				<td><div class="linetitle">${escapeHtml(li.description)}</div>${lineDetails(li)}${taxExemptHint(li)}${photoStrip(li)}</td>
				<td class="num">${escapeHtml(li.quantity)}${li.unit ? ' ' + escapeHtml(li.unit) : ''}</td>
				<td class="num">${fmtMoney(li.unit_price)}</td>
				<td class="num">${fmtMoney(li.total)}</td>
			</tr>`;
	// Render a set of required lines grouped into their sections (contiguous by position),
	// with a per-section subtotal row for labelled sections.
	const renderSectionRows = (lines: PdfLine[]): string => {
		const sections: { label: string | null; items: PdfLine[] }[] = [];
		for (const li of lines) {
			const label = li.section_label?.trim() || null;
			const last = sections[sections.length - 1];
			if (last && last.label === label) last.items.push(li);
			else sections.push({ label, items: [li] });
		}
		return sections
			.map((sec) => {
				const body = sec.items.map(lineRow).join('');
				if (sec.label === null) return body;
				const secTotal = sec.items.reduce((sum, li) => sum + Number(li.total), 0);
				return `<tr class="section"><td colspan="4">${escapeHtml(sec.label)}</td></tr>
				${body}
				<tr class="section-subtotal"><td colspan="3">${escapeHtml(sec.label)} subtotal</td><td class="num">${fmtMoney(String(secTotal))}</td></tr>`;
			})
			.join('');
	};
	const optionalBlockFor = (lines: PdfLine[]): string =>
		lines.length > 0
			? `<table style="margin-top:24px;">
			<thead><tr>
				<th colspan="4" style="background:#fffbeb;color:#92400e;">Optional add-ons — not included in total</th>
			</tr></thead>
			<tbody>${lines.map(lineRow).join('')}</tbody>
		</table>`
			: '';
	const taxPct = (Number(d.quote.tax_rate) * 100).toFixed(2) + '%';
	const discountAmt = Number(d.quote.discount_amount ?? 0);
	const discountLabel =
		(d.quote.discount_label?.trim() || 'Discount') +
		(d.quote.discount_type === 'percent' && d.quote.discount_value
			? ` (${Number(d.quote.discount_value).toFixed(Number(d.quote.discount_value) % 1 === 0 ? 0 : 2)}%)`
			: '');

	const isTiered = (d.packages?.length ?? 0) > 0;

	// Simple quote → single table + totals (today's layout). Tiered quote → one block per
	// package (the customer picks one), each with its own lines + price; no single grand total
	// since nothing is chosen yet. Applicable discount/deposit are settled at acceptance.
	let bodyContent: string;
	if (!isTiered) {
		const requiredLines = d.lineItems.filter((li) => !li.is_optional);
		const optionalLines = d.lineItems.filter((li) => li.is_optional);
		bodyContent = `<table>
			<thead><tr>
				<th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th>
			</tr></thead>
			<tbody>${renderSectionRows(requiredLines)}</tbody>
		</table>
		<div class="totals">
			<div class="row"><span>Subtotal</span><span>${fmtMoney(d.quote.subtotal)}</span></div>
			${discountAmt > 0 ? `<div class="row"><span>${escapeHtml(discountLabel)}</span><span>−${fmtMoney(String(discountAmt))}</span></div>` : ''}
			<div class="row"><span>Tax (${taxPct})</span><span>${fmtMoney(d.quote.tax_amount)}</span></div>
			<div class="row grand"><span>Total</span><span class="amt">${fmtMoney(d.quote.total)}</span></div>
			${d.quote.deposit_required && d.quote.deposit_amount ? `<div class="row"><span>Deposit due</span><span>${fmtMoney(d.quote.deposit_amount)}</span></div>` : ''}
		</div>
		${optionalBlockFor(optionalLines)}`;
	} else {
		const blocks = (d.packages ?? [])
			.map((pkg) => {
				const pkgLines = d.lineItems.filter((li) => li.package_id === pkg.id);
				const required = pkgLines.filter((li) => !li.is_optional);
				const optional = pkgLines.filter((li) => li.is_optional);
				return `<div class="pkg">
				<div class="pkghead">
					<span class="pkgname">${escapeHtml(pkg.name)}</span>
					${pkg.is_recommended ? `<span class="pkgbadge">★ Recommended</span>` : ''}
				</div>
				<table>
					<thead><tr>
						<th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th>
					</tr></thead>
					<tbody>${renderSectionRows(required)}</tbody>
				</table>
				<div class="pkgtotal"><span>${escapeHtml(pkg.name)} total (before tax)</span><span class="amt">${fmtMoney(pkg.subtotal)}</span></div>
				${optionalBlockFor(optional)}
			</div>`;
			})
			.join('');
		bodyContent = `<div class="pkgcaption">Choose one package below. ${escapeHtml(`Tax (${taxPct})`)} and any deposit are applied to the option you select when you accept.</div>${blocks}`;
	}
	const sa = d.serviceAddress;
	const serviceAddressText = sa
		? [sa.address_line_1, sa.address_line_2, [sa.city, sa.state, sa.zip].filter(Boolean).join(' ')]
				.filter(Boolean)
				.join(', ')
		: null;
	const sig = d.org;
	const signatureBlock =
		sig.signatureEnabled && sig.signatureName
			? `<div class="signature">
				<div class="siglabel">Authorized by</div>
				${sig.signatureImageUrl ? `<img class="sigimg" src="${escapeHtml(sig.signatureImageUrl)}" alt="Authorized signature" />` : ''}
				<div class="signame">${escapeHtml(sig.signatureName)}${sig.signatureTitle ? ` <span class="sigtitle">· ${escapeHtml(sig.signatureTitle)}</span>` : ''}</div>
				${sig.signatureStatement ? `<div class="sigstatement">${escapeHtml(sig.signatureStatement)}</div>` : ''}
			</div>`
			: '';
	// Customer "Accepted by" block — the signed proof. Drawn signature image when signed in
	// person; otherwise the typed name. The caption states how + when for dispute protection.
	const acc = d.acceptance;
	const acceptanceBlock = acc
		? `<div class="signature">
					<div class="siglabel">Accepted by</div>
					${acc.imageUrl ? `<img class="sigimg" src="${escapeHtml(acc.imageUrl)}" alt="Customer signature" />` : ''}
					<div class="signame">${escapeHtml(acc.signerName)}</div>
					<div class="sigstatement">${acc.inPerson ? 'Signed in person' : 'Signed electronically'} on ${escapeHtml(acc.signedAt.toLocaleDateString('en-US'))}</div>
				</div>`
		: '';
	// Both signatures sit side by side (two-party agreement). Renders whichever exist.
	const signatureColumns = [signatureBlock, acceptanceBlock].filter(Boolean).join('');
	const signaturesArea = signatureColumns ? `<div class="sigrow">${signatureColumns}</div>` : '';
	const brand = resolveBrandTheme(d.org.primary_color);
	const logoBlock = d.org.logo_url
		? `<img src="${escapeHtml(d.org.logo_url)}" alt="${escapeHtml(d.org.name)}" style="max-height:56px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px;" />`
		: '';

	return `<!doctype html>
<html><head><meta charset="utf-8"><style>
	* { box-sizing: border-box; }
	body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; padding:0; margin:0; }
	.page { padding:40px; }
	.brandbar { height:6px; background:${brand.accent}; }
	.header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #e2e8f0; padding-bottom:16px; margin-bottom:24px; }
	h1 { font-size:22px; margin:0 0 2px; }
	.tagline { color:#64748b; font-size:12px; margin:0 0 6px; }
	.muted { color:#64748b; font-size:12px; }
	.meta { margin:0 0 24px; font-size:13px; color:#334155; }
	table { width:100%; border-collapse:collapse; margin-top:16px; font-size:13px; }
	th { text-align:left; padding:10px 8px; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-weight:600; color:#475569; }
	td { padding:10px 8px; border-bottom:1px solid #f1f5f9; }
	td.num, th.num { text-align:right; }
	.linetitle { font-weight:600; color:#0f172a; }
	.linedetails { margin-top:3px; font-size:12px; color:#64748b; white-space:pre-wrap; }
	.linetaxexempt { margin-top:3px; font-size:11px; font-weight:600; color:#94a3b8; }
	.linephotos { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
	.linephotos img { width:46px; height:46px; object-fit:cover; border-radius:4px; border:1px solid #e2e8f0; }
	tr.section td { padding-top:16px; font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#475569; border-bottom:1px solid #e2e8f0; }
	tr.section-subtotal td { font-weight:600; color:#334155; border-bottom:1px solid #e2e8f0; background:#f8fafc; }
	.totals { margin-top:16px; margin-left:auto; width:280px; font-size:13px; }
	.totals .row { display:flex; justify-content:space-between; padding:6px 0; }
	.totals .row.grand { margin-top:8px; padding:10px 12px; font-weight:700; font-size:15px; border-radius:8px; background:color-mix(in srgb, ${brand.accent} 12%, transparent); }
	.totals .row.grand .amt { color:${brand.accent}; }
	.notes { margin-top:32px; padding:16px; background:#f8fafc; border-radius:8px; font-size:13px; color:#334155; white-space:pre-wrap; }
	.terms { margin-top:20px; padding:16px; border:1px solid #e2e8f0; border-radius:8px; page-break-inside:avoid; }
	.terms h4 { margin:0 0 8px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#64748b; }
	.terms .body { font-size:12px; line-height:1.6; color:#334155; white-space:pre-wrap; }
	.sigrow { display:flex; gap:40px; flex-wrap:wrap; page-break-inside:avoid; }
	.sigrow .signature { flex:1 1 220px; }
	.signature { margin-top:32px; padding-top:16px; border-top:1px solid #e2e8f0; }
	.signature .siglabel { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#94a3b8; margin-bottom:6px; }
	.signature .sigimg { max-height:56px; max-width:240px; object-fit:contain; display:block; margin-bottom:6px; }
	.signature .signame { font-size:13px; font-weight:600; color:#0f172a; }
	.signature .sigtitle { font-weight:400; color:#64748b; }
	.signature .sigstatement { font-size:12px; color:#64748b; margin-top:4px; }
	.pkgcaption { margin-top:8px; font-size:12px; color:#64748b; }
	.pkg { margin-top:20px; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; page-break-inside:avoid; }
	.pkghead { display:flex; align-items:center; gap:8px; }
	.pkghead .pkgname { font-size:15px; font-weight:700; color:#0f172a; }
	.pkghead .pkgbadge { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:${brand.accent}; background:color-mix(in srgb, ${brand.accent} 12%, transparent); padding:2px 8px; border-radius:999px; }
	.pkgtotal { display:flex; justify-content:space-between; margin-top:10px; padding:8px 12px; font-weight:700; font-size:14px; border-radius:8px; background:color-mix(in srgb, ${brand.accent} 10%, transparent); }
	.pkgtotal .amt { color:${brand.accent}; }
</style></head><body>
	<div class="brandbar"></div>
	<div class="page">
	<div class="header">
		<div>
			${logoBlock}
			<h1>${escapeHtml(d.org.name)}</h1>
			${d.org.tagline ? `<div class="tagline">${escapeHtml(d.org.tagline)}</div>` : ''}
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
		${serviceAddressText ? `<br><span class="muted">Service address:</span> ${escapeHtml(serviceAddressText)}` : ''}
	</div>
	<div style="font-weight:600;font-size:16px;margin-bottom:8px;">${escapeHtml(d.quote.title)}</div>
	${bodyContent}
	${d.quote.notes ? `<div class="notes">${escapeHtml(d.quote.notes)}</div>` : ''}
	${d.quote.terms ? `<div class="terms"><h4>Terms &amp; Conditions</h4><div class="body">${escapeHtml(d.quote.terms)}</div></div>` : ''}
	${signaturesArea}
	</div>
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
