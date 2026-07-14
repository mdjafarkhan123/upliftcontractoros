// Page-level inline-edit coordinator. One instance is created per detail page and
// shared by every editable surface on it (header name, details rows, …). It keeps
// the "only one field open at a time + a SINGLE Save/Cancel" rule consistent across
// the whole page instead of each panel owning its own save button.
//
// Usage:
//   const edit = new InlineEditController();
//   edit.begin('company', seedDraftFn, saveFn)   // pencil click
//   edit.isEditing('company')                    // for the row's `editing` prop
//   edit.commit() / edit.cancel()                // wired to the one shared bar
export class InlineEditController {
	editingKey = $state<string | null>(null);
	saving = $state(false);
	error = $state<string | null>(null);
	private activeSave: (() => Promise<string | null>) | null = null;

	get editing(): boolean {
		return this.editingKey !== null;
	}

	isEditing(key: string): boolean {
		return this.editingKey === key;
	}

	// Open a field for editing. `seed` fills the draft state; `saveFn` returns an
	// error string to keep the field open, or null on success. Opening a field
	// replaces any other open one (single-open).
	begin(key: string, seed: () => void, saveFn: () => Promise<string | null>): void {
		if (this.saving) return;
		seed();
		this.activeSave = saveFn;
		this.error = null;
		this.editingKey = key;
	}

	async commit(): Promise<void> {
		if (!this.activeSave || this.saving) return;
		this.saving = true;
		this.error = null;
		try {
			const err = await this.activeSave();
			if (err) {
				this.error = err;
				return;
			}
			this.editingKey = null;
			this.activeSave = null;
		} finally {
			this.saving = false;
		}
	}

	cancel(): void {
		if (this.saving) return;
		this.error = null;
		this.editingKey = null;
		this.activeSave = null;
	}
}
