import { relations } from "drizzle-orm/relations";
import { orgMembers, opportunities, contacts, organizations, pipelineStages, automationSettings, contactAddresses, contactNotes, jobs, conversations, messages, quotes, quoteLineItems, quoteViews, quoteTemplates, quoteTemplateLineItems, invoices, invoiceLineItems, payments, appointments, reviewRequests, reviews, privateFeedback, media, growthFeedItems, internalActivityLog, automationJobs, outboxEvents, orgCounters, notifications } from "./schema";

export const opportunitiesRelations = relations(opportunities, ({one, many}) => ({
	orgMember: one(orgMembers, {
		fields: [opportunities.assignedTo],
		references: [orgMembers.id]
	}),
	contact: one(contacts, {
		fields: [opportunities.contactId],
		references: [contacts.id]
	}),
	organization: one(organizations, {
		fields: [opportunities.orgId],
		references: [organizations.id]
	}),
	pipelineStage: one(pipelineStages, {
		fields: [opportunities.stageId],
		references: [pipelineStages.id]
	}),
	jobs: many(jobs),
	quotes: many(quotes),
	invoices: many(invoices),
}));

export const orgMembersRelations = relations(orgMembers, ({one, many}) => ({
	opportunities: many(opportunities),
	organization: one(organizations, {
		fields: [orgMembers.orgId],
		references: [organizations.id]
	}),
	contacts: many(contacts),
	contactNotes: many(contactNotes),
	jobs: many(jobs),
	conversations: many(conversations),
	messages: many(messages),
	quotes: many(quotes),
	quoteTemplates: many(quoteTemplates),
	invoices: many(invoices),
	payments: many(payments),
	appointments: many(appointments),
	reviewRequests: many(reviewRequests),
	privateFeedbacks: many(privateFeedback),
	media: many(media),
	notifications: many(notifications),
}));

export const contactsRelations = relations(contacts, ({one, many}) => ({
	opportunities: many(opportunities),
	contactAddresses: many(contactAddresses),
	orgMember: one(orgMembers, {
		fields: [contacts.assignedTo],
		references: [orgMembers.id]
	}),
	organization: one(organizations, {
		fields: [contacts.orgId],
		references: [organizations.id]
	}),
	contactNotes: many(contactNotes),
	jobs: many(jobs),
	conversations: many(conversations),
	quotes: many(quotes),
	invoices: many(invoices),
	appointments: many(appointments),
	reviewRequests: many(reviewRequests),
	reviews: many(reviews),
	privateFeedbacks: many(privateFeedback),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	opportunities: many(opportunities),
	automationSettings: many(automationSettings),
	contactAddresses: many(contactAddresses),
	pipelineStages: many(pipelineStages),
	orgMembers: many(orgMembers),
	contacts: many(contacts),
	contactNotes: many(contactNotes),
	jobs: many(jobs),
	conversations: many(conversations),
	messages: many(messages),
	quotes: many(quotes),
	quoteLineItems: many(quoteLineItems),
	quoteViews: many(quoteViews),
	quoteTemplates: many(quoteTemplates),
	quoteTemplateLineItems: many(quoteTemplateLineItems),
	invoices: many(invoices),
	invoiceLineItems: many(invoiceLineItems),
	payments: many(payments),
	appointments: many(appointments),
	reviewRequests: many(reviewRequests),
	reviews: many(reviews),
	privateFeedbacks: many(privateFeedback),
	media: many(media),
	growthFeedItems: many(growthFeedItems),
	internalActivityLogs: many(internalActivityLog),
	automationJobs: many(automationJobs),
	outboxEvents: many(outboxEvents),
	orgCounters: many(orgCounters),
	notifications: many(notifications),
}));

export const pipelineStagesRelations = relations(pipelineStages, ({one, many}) => ({
	opportunities: many(opportunities),
	organization: one(organizations, {
		fields: [pipelineStages.orgId],
		references: [organizations.id]
	}),
}));

export const automationSettingsRelations = relations(automationSettings, ({one}) => ({
	organization: one(organizations, {
		fields: [automationSettings.orgId],
		references: [organizations.id]
	}),
}));

export const contactAddressesRelations = relations(contactAddresses, ({one}) => ({
	contact: one(contacts, {
		fields: [contactAddresses.contactId],
		references: [contacts.id]
	}),
	organization: one(organizations, {
		fields: [contactAddresses.orgId],
		references: [organizations.id]
	}),
}));

export const contactNotesRelations = relations(contactNotes, ({one}) => ({
	orgMember: one(orgMembers, {
		fields: [contactNotes.authorId],
		references: [orgMembers.id]
	}),
	contact: one(contacts, {
		fields: [contactNotes.contactId],
		references: [contacts.id]
	}),
	organization: one(organizations, {
		fields: [contactNotes.orgId],
		references: [organizations.id]
	}),
}));

export const jobsRelations = relations(jobs, ({one, many}) => ({
	orgMember: one(orgMembers, {
		fields: [jobs.assignedTo],
		references: [orgMembers.id]
	}),
	contact: one(contacts, {
		fields: [jobs.contactId],
		references: [contacts.id]
	}),
	opportunity: one(opportunities, {
		fields: [jobs.opportunityId],
		references: [opportunities.id]
	}),
	organization: one(organizations, {
		fields: [jobs.orgId],
		references: [organizations.id]
	}),
	invoices: many(invoices),
	appointments: many(appointments),
	reviewRequests: many(reviewRequests),
	reviews: many(reviews),
	privateFeedbacks: many(privateFeedback),
	media: many(media),
}));

export const conversationsRelations = relations(conversations, ({one, many}) => ({
	orgMember: one(orgMembers, {
		fields: [conversations.assignedTo],
		references: [orgMembers.id]
	}),
	contact: one(contacts, {
		fields: [conversations.contactId],
		references: [contacts.id]
	}),
	organization: one(organizations, {
		fields: [conversations.orgId],
		references: [organizations.id]
	}),
	messages: many(messages),
}));

export const messagesRelations = relations(messages, ({one}) => ({
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id]
	}),
	organization: one(organizations, {
		fields: [messages.orgId],
		references: [organizations.id]
	}),
	orgMember: one(orgMembers, {
		fields: [messages.sentBy],
		references: [orgMembers.id]
	}),
}));

export const quotesRelations = relations(quotes, ({one, many}) => ({
	contact: one(contacts, {
		fields: [quotes.contactId],
		references: [contacts.id]
	}),
	orgMember: one(orgMembers, {
		fields: [quotes.issuedBy],
		references: [orgMembers.id]
	}),
	opportunity: one(opportunities, {
		fields: [quotes.opportunityId],
		references: [opportunities.id]
	}),
	organization: one(organizations, {
		fields: [quotes.orgId],
		references: [organizations.id]
	}),
	quoteLineItems: many(quoteLineItems),
	quoteViews: many(quoteViews),
	invoices: many(invoices),
	media: many(media),
}));

export const quoteLineItemsRelations = relations(quoteLineItems, ({one}) => ({
	organization: one(organizations, {
		fields: [quoteLineItems.orgId],
		references: [organizations.id]
	}),
	quote: one(quotes, {
		fields: [quoteLineItems.quoteId],
		references: [quotes.id]
	}),
}));

export const quoteViewsRelations = relations(quoteViews, ({one}) => ({
	organization: one(organizations, {
		fields: [quoteViews.orgId],
		references: [organizations.id]
	}),
	quote: one(quotes, {
		fields: [quoteViews.quoteId],
		references: [quotes.id]
	}),
}));

export const quoteTemplatesRelations = relations(quoteTemplates, ({one, many}) => ({
	orgMember: one(orgMembers, {
		fields: [quoteTemplates.createdBy],
		references: [orgMembers.id]
	}),
	organization: one(organizations, {
		fields: [quoteTemplates.orgId],
		references: [organizations.id]
	}),
	quoteTemplateLineItems: many(quoteTemplateLineItems),
}));

export const quoteTemplateLineItemsRelations = relations(quoteTemplateLineItems, ({one}) => ({
	organization: one(organizations, {
		fields: [quoteTemplateLineItems.orgId],
		references: [organizations.id]
	}),
	quoteTemplate: one(quoteTemplates, {
		fields: [quoteTemplateLineItems.templateId],
		references: [quoteTemplates.id]
	}),
}));

export const invoicesRelations = relations(invoices, ({one, many}) => ({
	contact: one(contacts, {
		fields: [invoices.contactId],
		references: [contacts.id]
	}),
	orgMember: one(orgMembers, {
		fields: [invoices.issuedBy],
		references: [orgMembers.id]
	}),
	job: one(jobs, {
		fields: [invoices.jobId],
		references: [jobs.id]
	}),
	opportunity: one(opportunities, {
		fields: [invoices.opportunityId],
		references: [opportunities.id]
	}),
	organization: one(organizations, {
		fields: [invoices.orgId],
		references: [organizations.id]
	}),
	quote: one(quotes, {
		fields: [invoices.quoteId],
		references: [quotes.id]
	}),
	invoiceLineItems: many(invoiceLineItems),
	payments: many(payments),
	media: many(media),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({one}) => ({
	invoice: one(invoices, {
		fields: [invoiceLineItems.invoiceId],
		references: [invoices.id]
	}),
	organization: one(organizations, {
		fields: [invoiceLineItems.orgId],
		references: [organizations.id]
	}),
}));

export const paymentsRelations = relations(payments, ({one}) => ({
	invoice: one(invoices, {
		fields: [payments.invoiceId],
		references: [invoices.id]
	}),
	organization: one(organizations, {
		fields: [payments.orgId],
		references: [organizations.id]
	}),
	orgMember: one(orgMembers, {
		fields: [payments.recordedBy],
		references: [orgMembers.id]
	}),
}));

export const appointmentsRelations = relations(appointments, ({one}) => ({
	orgMember: one(orgMembers, {
		fields: [appointments.assignedTo],
		references: [orgMembers.id]
	}),
	contact: one(contacts, {
		fields: [appointments.contactId],
		references: [contacts.id]
	}),
	job: one(jobs, {
		fields: [appointments.jobId],
		references: [jobs.id]
	}),
	organization: one(organizations, {
		fields: [appointments.orgId],
		references: [organizations.id]
	}),
}));

export const reviewRequestsRelations = relations(reviewRequests, ({one, many}) => ({
	contact: one(contacts, {
		fields: [reviewRequests.contactId],
		references: [contacts.id]
	}),
	job: one(jobs, {
		fields: [reviewRequests.jobId],
		references: [jobs.id]
	}),
	organization: one(organizations, {
		fields: [reviewRequests.orgId],
		references: [organizations.id]
	}),
	orgMember: one(orgMembers, {
		fields: [reviewRequests.sentByMemberId],
		references: [orgMembers.id]
	}),
	reviews: many(reviews),
	privateFeedbacks: many(privateFeedback),
}));

export const reviewsRelations = relations(reviews, ({one}) => ({
	contact: one(contacts, {
		fields: [reviews.contactId],
		references: [contacts.id]
	}),
	job: one(jobs, {
		fields: [reviews.jobId],
		references: [jobs.id]
	}),
	organization: one(organizations, {
		fields: [reviews.orgId],
		references: [organizations.id]
	}),
	reviewRequest: one(reviewRequests, {
		fields: [reviews.reviewRequestId],
		references: [reviewRequests.id]
	}),
}));

export const privateFeedbackRelations = relations(privateFeedback, ({one}) => ({
	contact: one(contacts, {
		fields: [privateFeedback.contactId],
		references: [contacts.id]
	}),
	job: one(jobs, {
		fields: [privateFeedback.jobId],
		references: [jobs.id]
	}),
	organization: one(organizations, {
		fields: [privateFeedback.orgId],
		references: [organizations.id]
	}),
	orgMember: one(orgMembers, {
		fields: [privateFeedback.resolvedBy],
		references: [orgMembers.id]
	}),
	reviewRequest: one(reviewRequests, {
		fields: [privateFeedback.reviewRequestId],
		references: [reviewRequests.id]
	}),
}));

export const mediaRelations = relations(media, ({one}) => ({
	invoice: one(invoices, {
		fields: [media.invoiceId],
		references: [invoices.id]
	}),
	job: one(jobs, {
		fields: [media.jobId],
		references: [jobs.id]
	}),
	organization: one(organizations, {
		fields: [media.orgId],
		references: [organizations.id]
	}),
	quote: one(quotes, {
		fields: [media.quoteId],
		references: [quotes.id]
	}),
	orgMember: one(orgMembers, {
		fields: [media.uploadedBy],
		references: [orgMembers.id]
	}),
}));

export const growthFeedItemsRelations = relations(growthFeedItems, ({one}) => ({
	organization: one(organizations, {
		fields: [growthFeedItems.orgId],
		references: [organizations.id]
	}),
}));

export const internalActivityLogRelations = relations(internalActivityLog, ({one}) => ({
	organization: one(organizations, {
		fields: [internalActivityLog.orgId],
		references: [organizations.id]
	}),
}));

export const automationJobsRelations = relations(automationJobs, ({one}) => ({
	organization: one(organizations, {
		fields: [automationJobs.orgId],
		references: [organizations.id]
	}),
}));

export const outboxEventsRelations = relations(outboxEvents, ({one}) => ({
	organization: one(organizations, {
		fields: [outboxEvents.orgId],
		references: [organizations.id]
	}),
}));

export const orgCountersRelations = relations(orgCounters, ({one}) => ({
	organization: one(organizations, {
		fields: [orgCounters.orgId],
		references: [organizations.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	orgMember: one(orgMembers, {
		fields: [notifications.memberId],
		references: [orgMembers.id]
	}),
	organization: one(organizations, {
		fields: [notifications.orgId],
		references: [organizations.id]
	}),
}));