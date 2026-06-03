export type MediaRecord = {
	id: string;
	r2_key: string;
	thumbnail_key: string | null;
	web_key: string | null;
	original_filename: string;
	file_size_bytes: number;
	media_type: 'photo' | 'pdf' | 'attachment';
	mime_type: string;
	purpose_tag: string;
	created_at: string;
};

/** A media item as it lives in the UI — may be an in-flight upload or a persisted record */
export type LocalMediaItem = {
	/** Stable client-side ID (UUID for persisted, random string for optimistic) */
	localId: string;
	/** Server-assigned ID once persisted */
	id?: string;
	status: 'uploading' | 'done' | 'error';
	progress?: number;
	errorMsg?: string;
	retry?: () => void;

	// From server record
	r2_key?: string;
	thumbnail_key?: string | null;
	web_key?: string | null;
	original_filename?: string;
	file_size_bytes?: number;
	media_type?: 'photo' | 'pdf' | 'attachment';
	mime_type?: string;
	purpose_tag?: string;
	created_at?: string;

	// Client-side URLs
	previewUrl?: string; // local blob URL for optimistic preview
	thumbnailUrl?: string; // presigned R2 URL (fetched lazily)
	webUrl?: string; // presigned R2 URL for lightbox
};
