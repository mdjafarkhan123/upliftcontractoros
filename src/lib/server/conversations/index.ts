export { touchConversationOnMessage } from './touchConversationOnMessage';
export {
	findOrCreateOpenConversation,
	type FindOrCreateOpenConversationInput,
	type FindOrCreateOpenConversationResult
} from './findOrCreateOpenConversation';
export { recordInboundMessage, type RecordInboundMessageInput } from './recordInboundMessage';
export { recordOutboundMessage, type RecordOutboundMessageInput } from './recordOutboundMessage';
export {
	computeChannelHints,
	hasActiveWebchatSession,
	type ChannelHints,
	type OutboundChannel
} from './resolveChannel';
