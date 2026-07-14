// Shared presentation types for the revenue-document detail screens (quotes +
// invoices) that render the shared Document* layout components.

export type DocumentHeaderDate = {
	label: string;
	value: string;
	tone?: 'default' | 'success' | 'danger' | 'signed';
	icon?: string;
};
