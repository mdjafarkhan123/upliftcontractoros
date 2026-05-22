// Domain 1 — Organization & Identity
export {
	orgStatusEnum,
	memberRoleEnum,
	organizations,
	orgMembers,
	automationSettings,
	orgUsage
} from './01_org_identity';
export type {
	Organization,
	NewOrganization,
	OrgMember,
	NewOrgMember,
	AutomationSettings,
	NewAutomationSettings,
	OrgUsage,
	NewOrgUsage
} from './01_org_identity';

// Domain 2 — Contacts
export {
	contactStatusEnum,
	addressLabelEnum,
	leadSourceTypeEnum,
	contacts,
	contactAddresses,
	contactNotes
} from './02_contacts';
export type {
	Contact,
	NewContact,
	ContactAddress,
	NewContactAddress,
	ContactNote,
	NewContactNote
} from './02_contacts';

// Domain 3 — Pipeline
export { pipelineStages, opportunities } from './03_pipeline';
export type {
	PipelineStage,
	NewPipelineStage,
	Opportunity,
	NewOpportunity
} from './03_pipeline';

// Domain 4 — Jobs
export { jobStatusEnum, jobs } from './04_jobs';
export type { Job, NewJob } from './04_jobs';

// Domain 5 — Communication
export {
	conversationStatusEnum,
	messageChannelEnum,
	messageDirectionEnum,
	messageStatusEnum,
	conversations,
	messages,
	inboundCommunicationEvents
} from './05_communication';
export type {
	Conversation,
	NewConversation,
	Message,
	NewMessage,
	InboundCommunicationEvent,
	NewInboundCommunicationEvent
} from './05_communication';

// Domain 6 — Revenue
export {
	quoteStatusEnum,
	invoiceStatusEnum,
	paymentMethodEnum,
	quotes,
	quoteLineItems,
	quoteViews,
	quoteChangeRequests,
	quoteTemplates,
	quoteTemplateLineItems,
	invoices,
	invoiceLineItems,
	invoiceViews,
	payments
} from './06_revenue';
export type {
	Quote,
	NewQuote,
	QuoteLineItem,
	NewQuoteLineItem,
	QuoteView,
	NewQuoteView,
	QuoteChangeRequest,
	NewQuoteChangeRequest,
	QuoteTemplate,
	NewQuoteTemplate,
	QuoteTemplateLineItem,
	NewQuoteTemplateLineItem,
	Invoice,
	NewInvoice,
	InvoiceLineItem,
	NewInvoiceLineItem,
	InvoiceView,
	NewInvoiceView,
	Payment,
	NewPayment
} from './06_revenue';

// Domain 7 — Appointments
export {
	appointmentTypeEnum,
	appointmentStatusEnum,
	bookingSourceEnum,
	appointments
} from './07_appointments';
export type { Appointment, NewAppointment } from './07_appointments';

// Domain 8 — Reputation
export {
	reviewRequestStatusEnum,
	reviewRequests,
	reviews,
	privateFeedback
} from './08_reputation';
export type {
	ReviewRequest,
	NewReviewRequest,
	Review,
	NewReview,
	PrivateFeedback,
	NewPrivateFeedback
} from './08_reputation';

// Domain 9 — Files & Media
export { mediaTypeEnum, mediaPurposeTagEnum, media } from './09_media';
export type { Media, NewMedia } from './09_media';

// Domain 11 — Webchat
export { webchatWidgets, webchatSessions } from './11_webchat';
export type {
	WebchatWidget,
	NewWebchatWidget,
	WebchatSession,
	NewWebchatSession
} from './11_webchat';

// Domain 12 — Booking
export { bookingLinks, availabilityWindows, availabilityOverrides } from './12_booking';
export type {
	BookingLink,
	NewBookingLink,
	AvailabilityWindow,
	NewAvailabilityWindow,
	AvailabilityOverride,
	NewAvailabilityOverride
} from './12_booking';

// Domain 10 — Growth, Automation & System
export {
	growthFeedTypeEnum,
	automationJobStatusEnum,
	automationJobTypeEnum,
	outboxEventStatusEnum,
	growthFeedItems,
	internalActivityLog,
	notifications,
	automationJobs,
	outboxEvents,
	orgCounters
} from './10_system';
export type {
	GrowthFeedItem,
	NewGrowthFeedItem,
	InternalActivityLog,
	NewInternalActivityLog,
	Notification,
	NewNotification,
	AutomationJob,
	NewAutomationJob,
	OutboxEvent,
	NewOutboxEvent,
	OrgCounter,
	NewOrgCounter
} from './10_system';
