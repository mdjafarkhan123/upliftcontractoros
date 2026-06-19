// Domain 1 — Organization & Identity
export {
	orgStatusEnum,
	smsApprovalStatusEnum,
	memberRoleEnum,
	organizations,
	orgMembers,
	automationSettings,
	orgUsage,
	smsCreditEntryTypeEnum,
	orgSmsCredit,
	smsCreditLedger
} from './01_org_identity';
export type {
	Organization,
	NewOrganization,
	OrgMember,
	NewOrgMember,
	AutomationSettings,
	NewAutomationSettings,
	OrgUsage,
	NewOrgUsage,
	OrgSmsCredit,
	NewOrgSmsCredit,
	SmsCreditLedger,
	NewSmsCreditLedger
} from './01_org_identity';

// Domain 2 — Contacts
export {
	contactStatusEnum,
	addressLabelEnum,
	leadSourceTypeEnum,
	contactImportStatusEnum,
	contacts,
	contactAddresses,
	contactNotes,
	contactImports
} from './02_contacts';
export type {
	Contact,
	NewContact,
	ContactAddress,
	NewContactAddress,
	ContactNote,
	NewContactNote,
	ContactImport,
	NewContactImport,
	ContactImportErrorRow
} from './02_contacts';

// Domain 3 — Pipeline
export {
	pipelineStatusEnum,
	pipelineLostReasonEnum,
	pipelineStages,
	opportunities,
	followUpOutcomeEnum,
	opportunityFollowUps
} from './03_pipeline';
export type {
	PipelineStage,
	NewPipelineStage,
	Opportunity,
	NewOpportunity,
	OpportunityFollowUp,
	NewOpportunityFollowUp
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
	callOutcomeEnum,
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
	quoteVersions,
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
	QuoteVersion,
	NewQuoteVersion,
	QuoteVersionLineItem,
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
	appointments,
	appointmentAssignees
} from './07_appointments';
export type {
	Appointment,
	NewAppointment,
	AppointmentAssignee,
	NewAppointmentAssignee
} from './07_appointments';

// Domain 8 — Reputation
export {
	reviewRequestStatusEnum,
	reviewEventTypeEnum,
	reviewRequests,
	reviews,
	privateFeedback,
	reviewEvents
} from './08_reputation';
export type {
	ReviewRequestStatus,
	ReviewEventType,
	ReviewRequest,
	NewReviewRequest,
	Review,
	NewReview,
	PrivateFeedback,
	NewPrivateFeedback,
	ReviewEvent,
	NewReviewEvent
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

// Domain 13 — Quick Replies (Inbox)
export { quickReplies } from './13_quick_replies';
export type { QuickReply, NewQuickReply } from './13_quick_replies';

// Domain 14 — Email Domains (per-tenant Brevo sending/receiving)
export { emailDomainStatusEnum, emailDomains } from './14_email_domains';
export type { EmailDomain, NewEmailDomain, EmailDnsRecord } from './14_email_domains';

// Domain 16 — Email Change Requests (contractor → PO domain setup/change)
export {
	emailChangeRequestTypeEnum,
	emailChangeRequestStatusEnum,
	emailChangeRequests
} from './16_email_change_requests';
export type { EmailChangeRequest, NewEmailChangeRequest } from './16_email_change_requests';

// Domain 17 — Email Sender Addresses (extra branded From-addresses per org)
export { emailSenderAddresses } from './17_email_sender_addresses';
export type { EmailSenderAddress, NewEmailSenderAddress } from './17_email_sender_addresses';

// Domain 15 — Messenger (per-tenant Facebook Page link + PSID identity)
export {
	messengerIntegrationStatusEnum,
	messengerIntegrations,
	messengerContacts
} from './15_messenger';
export type {
	MessengerIntegration,
	NewMessengerIntegration,
	MessengerContact,
	NewMessengerContact
} from './15_messenger';

// Domain 18 — Automation Engine (card/template multi-step sequences)
export {
	automationStepChannelEnum,
	automationEnrollmentStatusEnum,
	automationSequences,
	automationSequenceSteps,
	automationEnrollments
} from './18_automation_engine';
export type {
	AutomationSequence,
	NewAutomationSequence,
	AutomationSequenceStep,
	NewAutomationSequenceStep,
	AutomationEnrollment,
	NewAutomationEnrollment
} from './18_automation_engine';

// Domain 10 — Growth, Automation & System
export {
	growthFeedTypeEnum,
	automationJobStatusEnum,
	automationJobTypeEnum,
	outboxEventStatusEnum,
	growthFeedItems,
	internalActivityLog,
	activityEvents,
	notifications,
	memberNotificationPreferences,
	pushSubscriptions,
	notificationDeliveryState,
	automationJobs,
	outboxEvents,
	orgCounters,
	platformSettings
} from './10_system';
export type {
	GrowthFeedItem,
	NewGrowthFeedItem,
	InternalActivityLog,
	NewInternalActivityLog,
	ActivityEvent,
	NewActivityEvent,
	Notification,
	NewNotification,
	MemberNotificationPreference,
	NewMemberNotificationPreference,
	PushSubscription,
	NewPushSubscription,
	NotificationDeliveryState,
	NewNotificationDeliveryState,
	AutomationJob,
	NewAutomationJob,
	OutboxEvent,
	NewOutboxEvent,
	OrgCounter,
	NewOrgCounter,
	PlatformSettings,
	NewPlatformSettings
} from './10_system';
