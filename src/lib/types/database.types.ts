export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: '14.5';
	};
	public: {
		Tables: {
			appointments: {
				Row: {
					assigned_to: string | null;
					cancelled_at: string | null;
					contact_id: string;
					created_at: string;
					deleted_at: string | null;
					id: string;
					job_id: string | null;
					location: string | null;
					notes: string | null;
					org_id: string;
					reminder_1h_sent: boolean;
					reminder_24h_sent: boolean;
					scheduled_end: string | null;
					scheduled_start: string;
					status: Database['public']['Enums']['appointment_status'];
					title: string;
					type: Database['public']['Enums']['appointment_type'];
					updated_at: string;
				};
				Insert: {
					assigned_to?: string | null;
					cancelled_at?: string | null;
					contact_id: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					job_id?: string | null;
					location?: string | null;
					notes?: string | null;
					org_id: string;
					reminder_1h_sent?: boolean;
					reminder_24h_sent?: boolean;
					scheduled_end?: string | null;
					scheduled_start: string;
					status?: Database['public']['Enums']['appointment_status'];
					title: string;
					type: Database['public']['Enums']['appointment_type'];
					updated_at?: string;
				};
				Update: {
					assigned_to?: string | null;
					cancelled_at?: string | null;
					contact_id?: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					job_id?: string | null;
					location?: string | null;
					notes?: string | null;
					org_id?: string;
					reminder_1h_sent?: boolean;
					reminder_24h_sent?: boolean;
					scheduled_end?: string | null;
					scheduled_start?: string;
					status?: Database['public']['Enums']['appointment_status'];
					title?: string;
					type?: Database['public']['Enums']['appointment_type'];
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'appointments_assigned_to_fkey';
						columns: ['assigned_to'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'appointments_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'appointments_job_id_fkey';
						columns: ['job_id'];
						isOneToOne: false;
						referencedRelation: 'jobs';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'appointments_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			automation_jobs: {
				Row: {
					attempts: number;
					bull_job_id: string;
					completed_at: string | null;
					created_at: string;
					failed_at: string | null;
					id: string;
					last_error: string | null;
					org_id: string;
					resource_id: string;
					resource_type: string;
					scheduled_for: string | null;
					started_at: string | null;
					status: Database['public']['Enums']['automation_job_status'];
					type: Database['public']['Enums']['automation_job_type'];
					updated_at: string;
				};
				Insert: {
					attempts?: number;
					bull_job_id: string;
					completed_at?: string | null;
					created_at?: string;
					failed_at?: string | null;
					id?: string;
					last_error?: string | null;
					org_id: string;
					resource_id: string;
					resource_type: string;
					scheduled_for?: string | null;
					started_at?: string | null;
					status?: Database['public']['Enums']['automation_job_status'];
					type: Database['public']['Enums']['automation_job_type'];
					updated_at?: string;
				};
				Update: {
					attempts?: number;
					bull_job_id?: string;
					completed_at?: string | null;
					created_at?: string;
					failed_at?: string | null;
					id?: string;
					last_error?: string | null;
					org_id?: string;
					resource_id?: string;
					resource_type?: string;
					scheduled_for?: string | null;
					started_at?: string | null;
					status?: Database['public']['Enums']['automation_job_status'];
					type?: Database['public']['Enums']['automation_job_type'];
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'automation_jobs_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			automation_settings: {
				Row: {
					appointment_reminder_enabled: boolean;
					appointment_reminder_hours_before: number;
					appointment_reminder_message: string;
					created_at: string;
					id: string;
					invoice_reminder_delay_days: number;
					invoice_reminder_enabled: boolean;
					invoice_reminder_message: string;
					missed_call_textback_enabled: boolean;
					missed_call_textback_message: string;
					org_id: string;
					quote_followup_delay_1_hours: number;
					quote_followup_delay_2_hours: number;
					quote_followup_enabled: boolean;
					quote_followup_message: string;
					review_funnel_delay_hours: number;
					review_funnel_enabled: boolean;
					review_funnel_message: string;
					speed_to_lead_enabled: boolean;
					speed_to_lead_message: string;
					updated_at: string;
				};
				Insert: {
					appointment_reminder_enabled?: boolean;
					appointment_reminder_hours_before?: number;
					appointment_reminder_message?: string;
					created_at?: string;
					id?: string;
					invoice_reminder_delay_days?: number;
					invoice_reminder_enabled?: boolean;
					invoice_reminder_message?: string;
					missed_call_textback_enabled?: boolean;
					missed_call_textback_message?: string;
					org_id: string;
					quote_followup_delay_1_hours?: number;
					quote_followup_delay_2_hours?: number;
					quote_followup_enabled?: boolean;
					quote_followup_message?: string;
					review_funnel_delay_hours?: number;
					review_funnel_enabled?: boolean;
					review_funnel_message?: string;
					speed_to_lead_enabled?: boolean;
					speed_to_lead_message?: string;
					updated_at?: string;
				};
				Update: {
					appointment_reminder_enabled?: boolean;
					appointment_reminder_hours_before?: number;
					appointment_reminder_message?: string;
					created_at?: string;
					id?: string;
					invoice_reminder_delay_days?: number;
					invoice_reminder_enabled?: boolean;
					invoice_reminder_message?: string;
					missed_call_textback_enabled?: boolean;
					missed_call_textback_message?: string;
					org_id?: string;
					quote_followup_delay_1_hours?: number;
					quote_followup_delay_2_hours?: number;
					quote_followup_enabled?: boolean;
					quote_followup_message?: string;
					review_funnel_delay_hours?: number;
					review_funnel_enabled?: boolean;
					review_funnel_message?: string;
					speed_to_lead_enabled?: boolean;
					speed_to_lead_message?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'automation_settings_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			contact_addresses: {
				Row: {
					address_line_1: string;
					address_line_2: string | null;
					city: string;
					contact_id: string;
					created_at: string;
					deleted_at: string | null;
					id: string;
					is_primary: boolean;
					label: Database['public']['Enums']['address_label'];
					org_id: string;
					state: string;
					updated_at: string;
					zip: string;
				};
				Insert: {
					address_line_1: string;
					address_line_2?: string | null;
					city: string;
					contact_id: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					is_primary?: boolean;
					label?: Database['public']['Enums']['address_label'];
					org_id: string;
					state: string;
					updated_at?: string;
					zip: string;
				};
				Update: {
					address_line_1?: string;
					address_line_2?: string | null;
					city?: string;
					contact_id?: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					is_primary?: boolean;
					label?: Database['public']['Enums']['address_label'];
					org_id?: string;
					state?: string;
					updated_at?: string;
					zip?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'contact_addresses_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'contact_addresses_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			contact_notes: {
				Row: {
					author_id: string;
					contact_id: string;
					content: string;
					created_at: string;
					deleted_at: string | null;
					id: string;
					org_id: string;
					updated_at: string;
				};
				Insert: {
					author_id: string;
					contact_id: string;
					content: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					org_id: string;
					updated_at?: string;
				};
				Update: {
					author_id?: string;
					contact_id?: string;
					content?: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					org_id?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'contact_notes_author_id_fkey';
						columns: ['author_id'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'contact_notes_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'contact_notes_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			contacts: {
				Row: {
					assigned_to: string | null;
					created_at: string;
					deleted_at: string | null;
					email: string | null;
					full_name: string;
					id: string;
					lead_source: Database['public']['Enums']['lead_source_type'];
					notes: string | null;
					org_id: string;
					phone: string;
					sms_opt_out: boolean;
					sms_opt_out_at: string | null;
					sms_opt_out_source: string | null;
					sms_opted_in_at: string | null;
					status: Database['public']['Enums']['contact_status'];
					tags: string[];
					updated_at: string;
				};
				Insert: {
					assigned_to?: string | null;
					created_at?: string;
					deleted_at?: string | null;
					email?: string | null;
					full_name: string;
					id?: string;
					lead_source?: Database['public']['Enums']['lead_source_type'];
					notes?: string | null;
					org_id: string;
					phone: string;
					sms_opt_out?: boolean;
					sms_opt_out_at?: string | null;
					sms_opt_out_source?: string | null;
					sms_opted_in_at?: string | null;
					status?: Database['public']['Enums']['contact_status'];
					tags?: string[];
					updated_at?: string;
				};
				Update: {
					assigned_to?: string | null;
					created_at?: string;
					deleted_at?: string | null;
					email?: string | null;
					full_name?: string;
					id?: string;
					lead_source?: Database['public']['Enums']['lead_source_type'];
					notes?: string | null;
					org_id?: string;
					phone?: string;
					sms_opt_out?: boolean;
					sms_opt_out_at?: string | null;
					sms_opt_out_source?: string | null;
					sms_opted_in_at?: string | null;
					status?: Database['public']['Enums']['contact_status'];
					tags?: string[];
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'contacts_assigned_to_fkey';
						columns: ['assigned_to'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'contacts_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			conversations: {
				Row: {
					assigned_to: string | null;
					channel: Database['public']['Enums']['conversation_channel'];
					contact_id: string;
					created_at: string;
					deleted_at: string | null;
					id: string;
					last_message_at: string | null;
					org_id: string;
					status: Database['public']['Enums']['conversation_status'];
					subject: string | null;
					tags: string[];
					unread_count: number;
					updated_at: string;
				};
				Insert: {
					assigned_to?: string | null;
					channel: Database['public']['Enums']['conversation_channel'];
					contact_id: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					last_message_at?: string | null;
					org_id: string;
					status?: Database['public']['Enums']['conversation_status'];
					subject?: string | null;
					tags?: string[];
					unread_count?: number;
					updated_at?: string;
				};
				Update: {
					assigned_to?: string | null;
					channel?: Database['public']['Enums']['conversation_channel'];
					contact_id?: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					last_message_at?: string | null;
					org_id?: string;
					status?: Database['public']['Enums']['conversation_status'];
					subject?: string | null;
					tags?: string[];
					unread_count?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'conversations_assigned_to_fkey';
						columns: ['assigned_to'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'conversations_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'conversations_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			growth_feed_items: {
				Row: {
					body: string;
					created_at: string;
					id: string;
					is_monthly_summary: boolean;
					media_url: string | null;
					org_id: string;
					published_at: string;
					title: string;
					type: Database['public']['Enums']['growth_feed_type'];
					updated_at: string;
				};
				Insert: {
					body: string;
					created_at?: string;
					id?: string;
					is_monthly_summary?: boolean;
					media_url?: string | null;
					org_id: string;
					published_at?: string;
					title: string;
					type: Database['public']['Enums']['growth_feed_type'];
					updated_at?: string;
				};
				Update: {
					body?: string;
					created_at?: string;
					id?: string;
					is_monthly_summary?: boolean;
					media_url?: string | null;
					org_id?: string;
					published_at?: string;
					title?: string;
					type?: Database['public']['Enums']['growth_feed_type'];
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'growth_feed_items_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			internal_activity_log: {
				Row: {
					activity_type: string;
					author_id: string;
					body: string | null;
					created_at: string;
					id: string;
					metadata: Json | null;
					org_id: string;
					title: string;
				};
				Insert: {
					activity_type: string;
					author_id: string;
					body?: string | null;
					created_at?: string;
					id?: string;
					metadata?: Json | null;
					org_id: string;
					title: string;
				};
				Update: {
					activity_type?: string;
					author_id?: string;
					body?: string | null;
					created_at?: string;
					id?: string;
					metadata?: Json | null;
					org_id?: string;
					title?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'internal_activity_log_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			invoice_line_items: {
				Row: {
					created_at: string;
					deleted_at: string | null;
					description: string;
					id: string;
					invoice_id: string;
					org_id: string;
					position: number;
					quantity: number;
					total: number;
					unit_price: number;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					deleted_at?: string | null;
					description: string;
					id?: string;
					invoice_id: string;
					org_id: string;
					position?: number;
					quantity?: number;
					total: number;
					unit_price: number;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					deleted_at?: string | null;
					description?: string;
					id?: string;
					invoice_id?: string;
					org_id?: string;
					position?: number;
					quantity?: number;
					total?: number;
					unit_price?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'invoice_line_items_invoice_id_fkey';
						columns: ['invoice_id'];
						isOneToOne: false;
						referencedRelation: 'invoices';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'invoice_line_items_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			invoices: {
				Row: {
					amount_due: number;
					amount_paid: number;
					contact_id: string;
					created_at: string;
					deleted_at: string | null;
					due_date: string | null;
					id: string;
					invoice_number: number;
					issued_by: string | null;
					job_id: string | null;
					notes: string | null;
					opportunity_id: string | null;
					org_id: string;
					paid_at: string | null;
					quote_id: string | null;
					sent_at: string | null;
					status: Database['public']['Enums']['invoice_status'];
					stripe_payment_link_url: string | null;
					subtotal: number;
					tax_amount: number;
					tax_rate: number;
					title: string;
					total: number;
					updated_at: string;
				};
				Insert: {
					amount_due?: number;
					amount_paid?: number;
					contact_id: string;
					created_at?: string;
					deleted_at?: string | null;
					due_date?: string | null;
					id?: string;
					invoice_number: number;
					issued_by?: string | null;
					job_id?: string | null;
					notes?: string | null;
					opportunity_id?: string | null;
					org_id: string;
					paid_at?: string | null;
					quote_id?: string | null;
					sent_at?: string | null;
					status?: Database['public']['Enums']['invoice_status'];
					stripe_payment_link_url?: string | null;
					subtotal?: number;
					tax_amount?: number;
					tax_rate?: number;
					title: string;
					total?: number;
					updated_at?: string;
				};
				Update: {
					amount_due?: number;
					amount_paid?: number;
					contact_id?: string;
					created_at?: string;
					deleted_at?: string | null;
					due_date?: string | null;
					id?: string;
					invoice_number?: number;
					issued_by?: string | null;
					job_id?: string | null;
					notes?: string | null;
					opportunity_id?: string | null;
					org_id?: string;
					paid_at?: string | null;
					quote_id?: string | null;
					sent_at?: string | null;
					status?: Database['public']['Enums']['invoice_status'];
					stripe_payment_link_url?: string | null;
					subtotal?: number;
					tax_amount?: number;
					tax_rate?: number;
					title?: string;
					total?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'invoices_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'invoices_issued_by_fkey';
						columns: ['issued_by'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'invoices_job_id_fkey';
						columns: ['job_id'];
						isOneToOne: false;
						referencedRelation: 'jobs';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'invoices_opportunity_id_fkey';
						columns: ['opportunity_id'];
						isOneToOne: false;
						referencedRelation: 'opportunities';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'invoices_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'invoices_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					}
				];
			};
			jobs: {
				Row: {
					assigned_to: string | null;
					cancelled_at: string | null;
					completed_at: string | null;
					contact_id: string;
					created_at: string;
					deleted_at: string | null;
					id: string;
					notes: string | null;
					opportunity_id: string;
					org_id: string;
					scheduled_end: string | null;
					scheduled_start: string | null;
					scope_of_work: string | null;
					service_address_city: string | null;
					service_address_line_1: string | null;
					service_address_line_2: string | null;
					service_address_state: string | null;
					service_address_zip: string | null;
					status: Database['public']['Enums']['job_status'];
					title: string;
					updated_at: string;
				};
				Insert: {
					assigned_to?: string | null;
					cancelled_at?: string | null;
					completed_at?: string | null;
					contact_id: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					notes?: string | null;
					opportunity_id: string;
					org_id: string;
					scheduled_end?: string | null;
					scheduled_start?: string | null;
					scope_of_work?: string | null;
					service_address_city?: string | null;
					service_address_line_1?: string | null;
					service_address_line_2?: string | null;
					service_address_state?: string | null;
					service_address_zip?: string | null;
					status?: Database['public']['Enums']['job_status'];
					title: string;
					updated_at?: string;
				};
				Update: {
					assigned_to?: string | null;
					cancelled_at?: string | null;
					completed_at?: string | null;
					contact_id?: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					notes?: string | null;
					opportunity_id?: string;
					org_id?: string;
					scheduled_end?: string | null;
					scheduled_start?: string | null;
					scope_of_work?: string | null;
					service_address_city?: string | null;
					service_address_line_1?: string | null;
					service_address_line_2?: string | null;
					service_address_state?: string | null;
					service_address_zip?: string | null;
					status?: Database['public']['Enums']['job_status'];
					title?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'jobs_assigned_to_fkey';
						columns: ['assigned_to'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'jobs_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'jobs_opportunity_id_fkey';
						columns: ['opportunity_id'];
						isOneToOne: false;
						referencedRelation: 'opportunities';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'jobs_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			media: {
				Row: {
					created_at: string;
					deleted_at: string | null;
					file_size_bytes: number;
					id: string;
					invoice_id: string | null;
					job_id: string | null;
					media_type: Database['public']['Enums']['media_type'];
					mime_type: string;
					org_id: string;
					original_filename: string;
					purpose_tag: Database['public']['Enums']['media_purpose_tag'];
					quote_id: string | null;
					r2_key: string;
					thumbnail_key: string | null;
					updated_at: string;
					uploaded_by: string | null;
					web_key: string | null;
				};
				Insert: {
					created_at?: string;
					deleted_at?: string | null;
					file_size_bytes: number;
					id?: string;
					invoice_id?: string | null;
					job_id?: string | null;
					media_type: Database['public']['Enums']['media_type'];
					mime_type: string;
					org_id: string;
					original_filename: string;
					purpose_tag: Database['public']['Enums']['media_purpose_tag'];
					quote_id?: string | null;
					r2_key: string;
					thumbnail_key?: string | null;
					updated_at?: string;
					uploaded_by?: string | null;
					web_key?: string | null;
				};
				Update: {
					created_at?: string;
					deleted_at?: string | null;
					file_size_bytes?: number;
					id?: string;
					invoice_id?: string | null;
					job_id?: string | null;
					media_type?: Database['public']['Enums']['media_type'];
					mime_type?: string;
					org_id?: string;
					original_filename?: string;
					purpose_tag?: Database['public']['Enums']['media_purpose_tag'];
					quote_id?: string | null;
					r2_key?: string;
					thumbnail_key?: string | null;
					updated_at?: string;
					uploaded_by?: string | null;
					web_key?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'media_invoice_id_fkey';
						columns: ['invoice_id'];
						isOneToOne: false;
						referencedRelation: 'invoices';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'media_job_id_fkey';
						columns: ['job_id'];
						isOneToOne: false;
						referencedRelation: 'jobs';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'media_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'media_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'media_uploaded_by_fkey';
						columns: ['uploaded_by'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					}
				];
			};
			messages: {
				Row: {
					body: string | null;
					channel: Database['public']['Enums']['message_channel'];
					conversation_id: string;
					created_at: string;
					direction: Database['public']['Enums']['message_direction'];
					id: string;
					is_internal_note: boolean;
					media_urls: string[] | null;
					org_id: string;
					read_at: string | null;
					sent_at: string | null;
					sent_by: string | null;
					status: Database['public']['Enums']['message_status'];
					twilio_message_sid: string | null;
					updated_at: string;
				};
				Insert: {
					body?: string | null;
					channel: Database['public']['Enums']['message_channel'];
					conversation_id: string;
					created_at?: string;
					direction: Database['public']['Enums']['message_direction'];
					id?: string;
					is_internal_note?: boolean;
					media_urls?: string[] | null;
					org_id: string;
					read_at?: string | null;
					sent_at?: string | null;
					sent_by?: string | null;
					status: Database['public']['Enums']['message_status'];
					twilio_message_sid?: string | null;
					updated_at?: string;
				};
				Update: {
					body?: string | null;
					channel?: Database['public']['Enums']['message_channel'];
					conversation_id?: string;
					created_at?: string;
					direction?: Database['public']['Enums']['message_direction'];
					id?: string;
					is_internal_note?: boolean;
					media_urls?: string[] | null;
					org_id?: string;
					read_at?: string | null;
					sent_at?: string | null;
					sent_by?: string | null;
					status?: Database['public']['Enums']['message_status'];
					twilio_message_sid?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'messages_conversation_id_fkey';
						columns: ['conversation_id'];
						isOneToOne: false;
						referencedRelation: 'conversations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'messages_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'messages_sent_by_fkey';
						columns: ['sent_by'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					}
				];
			};
			notifications: {
				Row: {
					body: string | null;
					created_at: string;
					id: string;
					member_id: string;
					org_id: string;
					read_at: string | null;
					resource_id: string | null;
					resource_type: string | null;
					title: string;
					type: string;
				};
				Insert: {
					body?: string | null;
					created_at?: string;
					id?: string;
					member_id: string;
					org_id: string;
					read_at?: string | null;
					resource_id?: string | null;
					resource_type?: string | null;
					title: string;
					type: string;
				};
				Update: {
					body?: string | null;
					created_at?: string;
					id?: string;
					member_id?: string;
					org_id?: string;
					read_at?: string | null;
					resource_id?: string | null;
					resource_type?: string | null;
					title?: string;
					type?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'notifications_member_id_fkey';
						columns: ['member_id'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'notifications_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			opportunities: {
				Row: {
					assigned_to: string | null;
					closed_at: string | null;
					contact_id: string;
					created_at: string;
					deleted_at: string | null;
					id: string;
					lost_reason: string | null;
					org_id: string;
					stage_id: string;
					title: string;
					updated_at: string;
					value: number | null;
				};
				Insert: {
					assigned_to?: string | null;
					closed_at?: string | null;
					contact_id: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					lost_reason?: string | null;
					org_id: string;
					stage_id: string;
					title: string;
					updated_at?: string;
					value?: number | null;
				};
				Update: {
					assigned_to?: string | null;
					closed_at?: string | null;
					contact_id?: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					lost_reason?: string | null;
					org_id?: string;
					stage_id?: string;
					title?: string;
					updated_at?: string;
					value?: number | null;
				};
				Relationships: [
					{
						foreignKeyName: 'opportunities_assigned_to_fkey';
						columns: ['assigned_to'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'opportunities_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'opportunities_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'opportunities_stage_id_fkey';
						columns: ['stage_id'];
						isOneToOne: false;
						referencedRelation: 'pipeline_stages';
						referencedColumns: ['id'];
					}
				];
			};
			org_counters: {
				Row: {
					created_at: string;
					next_invoice_number: number;
					next_quote_number: number;
					org_id: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					next_invoice_number?: number;
					next_quote_number?: number;
					org_id: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					next_invoice_number?: number;
					next_quote_number?: number;
					org_id?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'org_counters_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: true;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			org_members: {
				Row: {
					avatar_url: string | null;
					can_create_appointments: boolean;
					can_create_contacts: boolean;
					can_create_invoices: boolean;
					can_create_opportunities: boolean;
					can_create_quotes: boolean;
					can_create_team_members: boolean;
					can_delete_contacts: boolean;
					can_delete_conversations: boolean;
					can_delete_files: boolean;
					can_delete_invoices: boolean;
					can_delete_quotes: boolean;
					can_delete_team_members: boolean;
					can_edit_contacts: boolean;
					can_edit_quotes: boolean;
					can_edit_team_members: boolean;
					can_move_pipeline_stages: boolean;
					can_record_payments: boolean;
					can_reschedule_appointments: boolean;
					can_send_invoices: boolean;
					can_send_messages: boolean;
					can_send_quotes: boolean;
					can_send_review_requests: boolean;
					can_upload_files: boolean;
					can_view_all_appointments: boolean;
					can_view_all_contacts: boolean;
					can_view_all_conversations: boolean;
					can_view_all_files: boolean;
					can_view_all_invoices: boolean;
					can_view_all_quotes: boolean;
					can_view_assigned_appointments: boolean;
					can_view_assigned_conversations: boolean;
					can_view_assigned_jobs: boolean;
					can_view_assigned_opportunities: boolean;
					can_view_dashboard: boolean;
					can_view_full_pipeline: boolean;
					can_view_growth_feed: boolean;
					can_view_negative_feedback: boolean;
					can_view_pipeline_snapshot: boolean;
					can_view_revenue: boolean;
					can_view_reviews: boolean;
					can_view_team_members: boolean;
					created_at: string;
					deleted_at: string | null;
					email: string;
					full_name: string;
					id: string;
					is_active: boolean;
					org_id: string;
					role: Database['public']['Enums']['member_role'];
					supabase_user_id: string;
					updated_at: string;
				};
				Insert: {
					avatar_url?: string | null;
					can_create_appointments?: boolean;
					can_create_contacts?: boolean;
					can_create_invoices?: boolean;
					can_create_opportunities?: boolean;
					can_create_quotes?: boolean;
					can_create_team_members?: boolean;
					can_delete_contacts?: boolean;
					can_delete_conversations?: boolean;
					can_delete_files?: boolean;
					can_delete_invoices?: boolean;
					can_delete_quotes?: boolean;
					can_delete_team_members?: boolean;
					can_edit_contacts?: boolean;
					can_edit_quotes?: boolean;
					can_edit_team_members?: boolean;
					can_move_pipeline_stages?: boolean;
					can_record_payments?: boolean;
					can_reschedule_appointments?: boolean;
					can_send_invoices?: boolean;
					can_send_messages?: boolean;
					can_send_quotes?: boolean;
					can_send_review_requests?: boolean;
					can_upload_files?: boolean;
					can_view_all_appointments?: boolean;
					can_view_all_contacts?: boolean;
					can_view_all_conversations?: boolean;
					can_view_all_files?: boolean;
					can_view_all_invoices?: boolean;
					can_view_all_quotes?: boolean;
					can_view_assigned_appointments?: boolean;
					can_view_assigned_conversations?: boolean;
					can_view_assigned_jobs?: boolean;
					can_view_assigned_opportunities?: boolean;
					can_view_dashboard?: boolean;
					can_view_full_pipeline?: boolean;
					can_view_growth_feed?: boolean;
					can_view_negative_feedback?: boolean;
					can_view_pipeline_snapshot?: boolean;
					can_view_revenue?: boolean;
					can_view_reviews?: boolean;
					can_view_team_members?: boolean;
					created_at?: string;
					deleted_at?: string | null;
					email: string;
					full_name: string;
					id?: string;
					is_active?: boolean;
					org_id: string;
					role: Database['public']['Enums']['member_role'];
					supabase_user_id: string;
					updated_at?: string;
				};
				Update: {
					avatar_url?: string | null;
					can_create_appointments?: boolean;
					can_create_contacts?: boolean;
					can_create_invoices?: boolean;
					can_create_opportunities?: boolean;
					can_create_quotes?: boolean;
					can_create_team_members?: boolean;
					can_delete_contacts?: boolean;
					can_delete_conversations?: boolean;
					can_delete_files?: boolean;
					can_delete_invoices?: boolean;
					can_delete_quotes?: boolean;
					can_delete_team_members?: boolean;
					can_edit_contacts?: boolean;
					can_edit_quotes?: boolean;
					can_edit_team_members?: boolean;
					can_move_pipeline_stages?: boolean;
					can_record_payments?: boolean;
					can_reschedule_appointments?: boolean;
					can_send_invoices?: boolean;
					can_send_messages?: boolean;
					can_send_quotes?: boolean;
					can_send_review_requests?: boolean;
					can_upload_files?: boolean;
					can_view_all_appointments?: boolean;
					can_view_all_contacts?: boolean;
					can_view_all_conversations?: boolean;
					can_view_all_files?: boolean;
					can_view_all_invoices?: boolean;
					can_view_all_quotes?: boolean;
					can_view_assigned_appointments?: boolean;
					can_view_assigned_conversations?: boolean;
					can_view_assigned_jobs?: boolean;
					can_view_assigned_opportunities?: boolean;
					can_view_dashboard?: boolean;
					can_view_full_pipeline?: boolean;
					can_view_growth_feed?: boolean;
					can_view_negative_feedback?: boolean;
					can_view_pipeline_snapshot?: boolean;
					can_view_revenue?: boolean;
					can_view_reviews?: boolean;
					can_view_team_members?: boolean;
					created_at?: string;
					deleted_at?: string | null;
					email?: string;
					full_name?: string;
					id?: string;
					is_active?: boolean;
					org_id?: string;
					role?: Database['public']['Enums']['member_role'];
					supabase_user_id?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'org_members_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			organizations: {
				Row: {
					address: string | null;
					city: string | null;
					created_at: string;
					deleted_at: string | null;
					deletion_scheduled_at: string | null;
					id: string;
					is_setup_complete: boolean;
					logo_url: string | null;
					name: string;
					plan: string;
					primary_color: string | null;
					slug: string;
					state: string | null;
					status: Database['public']['Enums']['org_status'];
					stripe_account_id: string | null;
					stripe_connected_at: string | null;
					stripe_publishable_key: string | null;
					stripe_restricted_key: string | null;
					stripe_webhook_secret: string | null;
					suspended_at: string | null;
					timezone: string;
					trade_type: string;
					twilio_phone_number: string;
					updated_at: string;
					zip: string | null;
				};
				Insert: {
					address?: string | null;
					city?: string | null;
					created_at?: string;
					deleted_at?: string | null;
					deletion_scheduled_at?: string | null;
					id?: string;
					is_setup_complete?: boolean;
					logo_url?: string | null;
					name: string;
					plan?: string;
					primary_color?: string | null;
					slug: string;
					state?: string | null;
					status?: Database['public']['Enums']['org_status'];
					stripe_account_id?: string | null;
					stripe_connected_at?: string | null;
					stripe_publishable_key?: string | null;
					stripe_restricted_key?: string | null;
					stripe_webhook_secret?: string | null;
					suspended_at?: string | null;
					timezone?: string;
					trade_type: string;
					twilio_phone_number: string;
					updated_at?: string;
					zip?: string | null;
				};
				Update: {
					address?: string | null;
					city?: string | null;
					created_at?: string;
					deleted_at?: string | null;
					deletion_scheduled_at?: string | null;
					id?: string;
					is_setup_complete?: boolean;
					logo_url?: string | null;
					name?: string;
					plan?: string;
					primary_color?: string | null;
					slug?: string;
					state?: string | null;
					status?: Database['public']['Enums']['org_status'];
					stripe_account_id?: string | null;
					stripe_connected_at?: string | null;
					stripe_publishable_key?: string | null;
					stripe_restricted_key?: string | null;
					stripe_webhook_secret?: string | null;
					suspended_at?: string | null;
					timezone?: string;
					trade_type?: string;
					twilio_phone_number?: string;
					updated_at?: string;
					zip?: string | null;
				};
				Relationships: [];
			};
			outbox_events: {
				Row: {
					attempts: number;
					available_at: string;
					created_at: string;
					dead_lettered_at: string | null;
					event_type: string;
					event_version: number;
					id: string;
					idempotency_key: string;
					last_error: string | null;
					max_attempts: number;
					org_id: string | null;
					payload: Json;
					processed_at: string | null;
					resource_id: string;
					resource_type: string;
					sequence: number;
					status: Database['public']['Enums']['outbox_event_status'];
					updated_at: string;
				};
				Insert: {
					attempts?: number;
					available_at?: string;
					created_at?: string;
					dead_lettered_at?: string | null;
					event_type: string;
					event_version?: number;
					id?: string;
					idempotency_key: string;
					last_error?: string | null;
					max_attempts?: number;
					org_id?: string | null;
					payload: Json;
					processed_at?: string | null;
					resource_id: string;
					resource_type: string;
					sequence?: number;
					status?: Database['public']['Enums']['outbox_event_status'];
					updated_at?: string;
				};
				Update: {
					attempts?: number;
					available_at?: string;
					created_at?: string;
					dead_lettered_at?: string | null;
					event_type?: string;
					event_version?: number;
					id?: string;
					idempotency_key?: string;
					last_error?: string | null;
					max_attempts?: number;
					org_id?: string | null;
					payload?: Json;
					processed_at?: string | null;
					resource_id?: string;
					resource_type?: string;
					sequence?: number;
					status?: Database['public']['Enums']['outbox_event_status'];
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'outbox_events_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			payments: {
				Row: {
					amount: number;
					created_at: string;
					id: string;
					invoice_id: string;
					notes: string | null;
					org_id: string;
					paid_at: string;
					payment_method: Database['public']['Enums']['payment_method'];
					recorded_by: string | null;
					stripe_payment_intent_id: string | null;
				};
				Insert: {
					amount: number;
					created_at?: string;
					id?: string;
					invoice_id: string;
					notes?: string | null;
					org_id: string;
					paid_at?: string;
					payment_method: Database['public']['Enums']['payment_method'];
					recorded_by?: string | null;
					stripe_payment_intent_id?: string | null;
				};
				Update: {
					amount?: number;
					created_at?: string;
					id?: string;
					invoice_id?: string;
					notes?: string | null;
					org_id?: string;
					paid_at?: string;
					payment_method?: Database['public']['Enums']['payment_method'];
					recorded_by?: string | null;
					stripe_payment_intent_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'payments_invoice_id_fkey';
						columns: ['invoice_id'];
						isOneToOne: false;
						referencedRelation: 'invoices';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'payments_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'payments_recorded_by_fkey';
						columns: ['recorded_by'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					}
				];
			};
			pipeline_stages: {
				Row: {
					color: string;
					created_at: string;
					deleted_at: string | null;
					id: string;
					is_default: boolean;
					is_lost: boolean;
					is_won: boolean;
					name: string;
					org_id: string;
					position: number;
					updated_at: string;
				};
				Insert: {
					color: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					is_default?: boolean;
					is_lost?: boolean;
					is_won?: boolean;
					name: string;
					org_id: string;
					position: number;
					updated_at?: string;
				};
				Update: {
					color?: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					is_default?: boolean;
					is_lost?: boolean;
					is_won?: boolean;
					name?: string;
					org_id?: string;
					position?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'pipeline_stages_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			private_feedback: {
				Row: {
					body: string | null;
					contact_id: string;
					created_at: string;
					deleted_at: string | null;
					id: string;
					is_resolved: boolean;
					job_id: string;
					org_id: string;
					resolved_at: string | null;
					resolved_by: string | null;
					review_request_id: string | null;
					score: number;
					updated_at: string;
				};
				Insert: {
					body?: string | null;
					contact_id: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					is_resolved?: boolean;
					job_id: string;
					org_id: string;
					resolved_at?: string | null;
					resolved_by?: string | null;
					review_request_id?: string | null;
					score: number;
					updated_at?: string;
				};
				Update: {
					body?: string | null;
					contact_id?: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					is_resolved?: boolean;
					job_id?: string;
					org_id?: string;
					resolved_at?: string | null;
					resolved_by?: string | null;
					review_request_id?: string | null;
					score?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'private_feedback_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'private_feedback_job_id_fkey';
						columns: ['job_id'];
						isOneToOne: false;
						referencedRelation: 'jobs';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'private_feedback_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'private_feedback_resolved_by_fkey';
						columns: ['resolved_by'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'private_feedback_review_request_id_fkey';
						columns: ['review_request_id'];
						isOneToOne: false;
						referencedRelation: 'review_requests';
						referencedColumns: ['id'];
					}
				];
			};
			quote_line_items: {
				Row: {
					created_at: string;
					deleted_at: string | null;
					description: string;
					id: string;
					org_id: string;
					position: number;
					quantity: number;
					quote_id: string;
					total: number;
					unit_price: number;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					deleted_at?: string | null;
					description: string;
					id?: string;
					org_id: string;
					position?: number;
					quantity?: number;
					quote_id: string;
					total: number;
					unit_price: number;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					deleted_at?: string | null;
					description?: string;
					id?: string;
					org_id?: string;
					position?: number;
					quantity?: number;
					quote_id?: string;
					total?: number;
					unit_price?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'quote_line_items_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quote_line_items_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					}
				];
			};
			quote_template_line_items: {
				Row: {
					created_at: string;
					deleted_at: string | null;
					description: string;
					id: string;
					org_id: string;
					position: number;
					quantity: number;
					template_id: string;
					total: number;
					unit_price: number;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					deleted_at?: string | null;
					description: string;
					id?: string;
					org_id: string;
					position?: number;
					quantity?: number;
					template_id: string;
					total: number;
					unit_price: number;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					deleted_at?: string | null;
					description?: string;
					id?: string;
					org_id?: string;
					position?: number;
					quantity?: number;
					template_id?: string;
					total?: number;
					unit_price?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'quote_template_line_items_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quote_template_line_items_template_id_fkey';
						columns: ['template_id'];
						isOneToOne: false;
						referencedRelation: 'quote_templates';
						referencedColumns: ['id'];
					}
				];
			};
			quote_templates: {
				Row: {
					created_at: string;
					created_by: string | null;
					deleted_at: string | null;
					description: string | null;
					id: string;
					name: string;
					org_id: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					created_by?: string | null;
					deleted_at?: string | null;
					description?: string | null;
					id?: string;
					name: string;
					org_id: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					created_by?: string | null;
					deleted_at?: string | null;
					description?: string | null;
					id?: string;
					name?: string;
					org_id?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'quote_templates_created_by_fkey';
						columns: ['created_by'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quote_templates_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			quote_views: {
				Row: {
					created_at: string;
					id: string;
					ip_hash: string | null;
					notification_sent: boolean;
					notification_sent_at: string | null;
					org_id: string;
					quote_id: string;
					user_agent_hash: string | null;
					viewed_at: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					ip_hash?: string | null;
					notification_sent?: boolean;
					notification_sent_at?: string | null;
					org_id: string;
					quote_id: string;
					user_agent_hash?: string | null;
					viewed_at?: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					ip_hash?: string | null;
					notification_sent?: boolean;
					notification_sent_at?: string | null;
					org_id?: string;
					quote_id?: string;
					user_agent_hash?: string | null;
					viewed_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'quote_views_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quote_views_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					}
				];
			};
			quotes: {
				Row: {
					accepted_at: string | null;
					contact_id: string;
					created_at: string;
					declined_at: string | null;
					deleted_at: string | null;
					deposit_amount: number | null;
					deposit_required: boolean;
					expires_at: string | null;
					id: string;
					internal_notes: string | null;
					issued_by: string | null;
					notes: string | null;
					opportunity_id: string | null;
					org_id: string;
					public_token_hash: string;
					quote_number: number;
					sent_at: string | null;
					status: Database['public']['Enums']['quote_status'];
					subtotal: number;
					tax_amount: number;
					tax_rate: number;
					title: string;
					total: number;
					updated_at: string;
					viewed_at: string | null;
				};
				Insert: {
					accepted_at?: string | null;
					contact_id: string;
					created_at?: string;
					declined_at?: string | null;
					deleted_at?: string | null;
					deposit_amount?: number | null;
					deposit_required?: boolean;
					expires_at?: string | null;
					id?: string;
					internal_notes?: string | null;
					issued_by?: string | null;
					notes?: string | null;
					opportunity_id?: string | null;
					org_id: string;
					public_token_hash: string;
					quote_number: number;
					sent_at?: string | null;
					status?: Database['public']['Enums']['quote_status'];
					subtotal?: number;
					tax_amount?: number;
					tax_rate?: number;
					title: string;
					total?: number;
					updated_at?: string;
					viewed_at?: string | null;
				};
				Update: {
					accepted_at?: string | null;
					contact_id?: string;
					created_at?: string;
					declined_at?: string | null;
					deleted_at?: string | null;
					deposit_amount?: number | null;
					deposit_required?: boolean;
					expires_at?: string | null;
					id?: string;
					internal_notes?: string | null;
					issued_by?: string | null;
					notes?: string | null;
					opportunity_id?: string | null;
					org_id?: string;
					public_token_hash?: string;
					quote_number?: number;
					sent_at?: string | null;
					status?: Database['public']['Enums']['quote_status'];
					subtotal?: number;
					tax_amount?: number;
					tax_rate?: number;
					title?: string;
					total?: number;
					updated_at?: string;
					viewed_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'quotes_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quotes_issued_by_fkey';
						columns: ['issued_by'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quotes_opportunity_id_fkey';
						columns: ['opportunity_id'];
						isOneToOne: false;
						referencedRelation: 'opportunities';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quotes_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					}
				];
			};
			review_requests: {
				Row: {
					contact_id: string;
					created_at: string;
					deleted_at: string | null;
					id: string;
					job_id: string;
					org_id: string;
					responded_at: string | null;
					response_score: number | null;
					sent_at: string | null;
					sent_by_automation: boolean;
					sent_by_member_id: string | null;
					status: Database['public']['Enums']['review_request_status'];
					updated_at: string;
				};
				Insert: {
					contact_id: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					job_id: string;
					org_id: string;
					responded_at?: string | null;
					response_score?: number | null;
					sent_at?: string | null;
					sent_by_automation?: boolean;
					sent_by_member_id?: string | null;
					status?: Database['public']['Enums']['review_request_status'];
					updated_at?: string;
				};
				Update: {
					contact_id?: string;
					created_at?: string;
					deleted_at?: string | null;
					id?: string;
					job_id?: string;
					org_id?: string;
					responded_at?: string | null;
					response_score?: number | null;
					sent_at?: string | null;
					sent_by_automation?: boolean;
					sent_by_member_id?: string | null;
					status?: Database['public']['Enums']['review_request_status'];
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'review_requests_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'review_requests_job_id_fkey';
						columns: ['job_id'];
						isOneToOne: false;
						referencedRelation: 'jobs';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'review_requests_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'review_requests_sent_by_member_id_fkey';
						columns: ['sent_by_member_id'];
						isOneToOne: false;
						referencedRelation: 'org_members';
						referencedColumns: ['id'];
					}
				];
			};
			reviews: {
				Row: {
					body: string | null;
					contact_id: string;
					created_at: string;
					google_review_link_sent: boolean;
					id: string;
					job_id: string;
					org_id: string;
					platform: string | null;
					review_request_id: string | null;
					review_url: string | null;
					score: number;
				};
				Insert: {
					body?: string | null;
					contact_id: string;
					created_at?: string;
					google_review_link_sent?: boolean;
					id?: string;
					job_id: string;
					org_id: string;
					platform?: string | null;
					review_request_id?: string | null;
					review_url?: string | null;
					score: number;
				};
				Update: {
					body?: string | null;
					contact_id?: string;
					created_at?: string;
					google_review_link_sent?: boolean;
					id?: string;
					job_id?: string;
					org_id?: string;
					platform?: string | null;
					review_request_id?: string | null;
					review_url?: string | null;
					score?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'reviews_contact_id_fkey';
						columns: ['contact_id'];
						isOneToOne: false;
						referencedRelation: 'contacts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'reviews_job_id_fkey';
						columns: ['job_id'];
						isOneToOne: false;
						referencedRelation: 'jobs';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'reviews_org_id_fkey';
						columns: ['org_id'];
						isOneToOne: false;
						referencedRelation: 'organizations';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'reviews_review_request_id_fkey';
						columns: ['review_request_id'];
						isOneToOne: false;
						referencedRelation: 'review_requests';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			get_my_member_id: { Args: never; Returns: string };
			get_my_org_id: { Args: never; Returns: string };
		};
		Enums: {
			address_label: 'billing' | 'service' | 'mailing' | 'other';
			appointment_status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
			appointment_type: 'estimate' | 'job_start' | 'follow_up' | 'inspection' | 'other';
			automation_job_status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
			automation_job_type:
				| 'missed_call_textback'
				| 'speed_to_lead'
				| 'quote_followup'
				| 'invoice_reminder'
				| 'review_request'
				| 'appointment_reminder';
			contact_status: 'lead' | 'customer' | 'archived';
			conversation_channel: 'sms' | 'missed_call' | 'email' | 'webchat';
			conversation_status: 'open' | 'closed' | 'archived';
			growth_feed_type:
				| 'gbp_post'
				| 'seo'
				| 'social'
				| 'website'
				| 'blog'
				| 'review_response'
				| 'monthly_summary';
			invoice_status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
			job_status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
			lead_source_type:
				| 'website_form'
				| 'live_chat'
				| 'missed_call'
				| 'manual'
				| 'referral'
				| 'other';
			media_purpose_tag:
				| 'job_photo'
				| 'before'
				| 'after'
				| 'marketing_asset'
				| 'quote_attachment'
				| 'invoice_attachment';
			media_type: 'photo' | 'pdf' | 'attachment';
			member_role: 'admin' | 'manager' | 'member';
			message_channel: 'sms' | 'email' | 'webchat';
			message_direction: 'inbound' | 'outbound';
			message_status: 'sent' | 'delivered' | 'failed' | 'received' | 'queued' | 'bounced';
			org_status: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
			outbox_event_status: 'pending' | 'processing' | 'processed' | 'failed' | 'dead_lettered';
			payment_method: 'stripe' | 'cash' | 'check' | 'bank_transfer' | 'other';
			quote_status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
			review_request_status: 'pending' | 'sent' | 'responded' | 'failed' | 'no_response';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		| keyof DefaultSchema['Enums']
		| { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
		: never = never
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
		? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema['CompositeTypes']
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
		: never = never
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
		? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {
			address_label: ['billing', 'service', 'mailing', 'other'],
			appointment_status: ['scheduled', 'completed', 'cancelled', 'no_show'],
			appointment_type: ['estimate', 'job_start', 'follow_up', 'inspection', 'other'],
			automation_job_status: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
			automation_job_type: [
				'missed_call_textback',
				'speed_to_lead',
				'quote_followup',
				'invoice_reminder',
				'review_request',
				'appointment_reminder'
			],
			contact_status: ['lead', 'customer', 'archived'],
			conversation_channel: ['sms', 'missed_call', 'email', 'webchat'],
			conversation_status: ['open', 'closed', 'archived'],
			growth_feed_type: [
				'gbp_post',
				'seo',
				'social',
				'website',
				'blog',
				'review_response',
				'monthly_summary'
			],
			invoice_status: ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'],
			job_status: ['scheduled', 'in_progress', 'completed', 'cancelled'],
			lead_source_type: ['website_form', 'live_chat', 'missed_call', 'manual', 'referral', 'other'],
			media_purpose_tag: [
				'job_photo',
				'before',
				'after',
				'marketing_asset',
				'quote_attachment',
				'invoice_attachment'
			],
			media_type: ['photo', 'pdf', 'attachment'],
			member_role: ['admin', 'manager', 'member'],
			message_channel: ['sms', 'email', 'webchat'],
			message_direction: ['inbound', 'outbound'],
			message_status: ['sent', 'delivered', 'failed', 'received', 'queued', 'bounced'],
			org_status: ['active', 'suspended', 'pending_deletion', 'deleted'],
			outbox_event_status: ['pending', 'processing', 'processed', 'failed', 'dead_lettered'],
			payment_method: ['stripe', 'cash', 'check', 'bank_transfer', 'other'],
			quote_status: ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'],
			review_request_status: ['pending', 'sent', 'responded', 'failed', 'no_response']
		}
	}
} as const;
