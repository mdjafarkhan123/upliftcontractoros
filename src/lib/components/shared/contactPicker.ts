// Shared shape for the client/contact picker (see ContactPicker.svelte). Kept in a
// plain module so both the component and its consumers can import the type.
export type ContactHit = {
	id: string;
	full_name: string;
	phone: string | null;
	email: string | null;
};
