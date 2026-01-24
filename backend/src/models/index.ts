/**
 * Models Index
 *
 * Central registration and association setup for all models.
 * Import this file to ensure all models and their relationships are loaded.
 */

import sequelize from '../config/database';

// Import all models
import Property from './Property';
import MarketplaceUser from './MarketplaceUser';
import UserBuyBox from './UserBuyBox';
import DealAction from './DealAction';
import DealOffer from './DealOffer';
import Fund from './Fund';
import HedgeFundBuyBox from './HedgeFundBuyBox';
import Automation from './Automation';
import WorkflowExecution from './WorkflowExecution';

// ML Models
import FundFeedback from './FundFeedback';
import MLPrediction from './MLPrediction';
import ModelVersion from './ModelVersion';
import TrainingRun from './TrainingRun';

// Agent Models
import ConversationHistory from './ConversationHistory';
import Conversation from './Conversation';
import AgentMetric from './AgentMetric';

// Pipeline & Portfolio Models
import DealPipeline from './DealPipeline';
import Portfolio from './Portfolio';

// Match Models
import DealMatch from './DealMatch';

// Team Assignment Models
import DealAssignment from './DealAssignment';

// Forward Tracking Models
import DealForward from './DealForward';

// Document Models
import PropertyDocument from './PropertyDocument';

// Market Data Models
import PropertyLookup from './PropertyLookup';

// Settings & Automation Models
import Settings from './Settings';
import AutomationExecution from './AutomationExecution';
import DeadLetterQueue from './DeadLetterQueue';

// Follow-up Models
import FollowUpChain from './FollowUpChain';
import FollowUpExecution from './FollowUpExecution';

// Compliance Models
import StateComplianceRule from './StateComplianceRule';
import StateKnowledge from './StateKnowledge';
import StateDocumentTemplate from './StateDocumentTemplate';
import ComplianceCheck from './ComplianceCheck';
import ComplianceIssueReview from './ComplianceIssueReview';
import ComplianceAuditLog from './ComplianceAuditLog';
import ComplianceAlert from './ComplianceAlert';
import { ComplianceWebhook, WebhookDeliveryLog } from './ComplianceWebhook';
import ComplianceRuleVersion from './ComplianceRuleVersion';
import ComplianceEvent from './ComplianceEvent';
import SanctionsScreening from './SanctionsScreening';
import EscalationPolicy, { EscalationExecution } from './EscalationPolicy';
import FraudSignal from './FraudSignal';
import PropertyFieldQuality from './PropertyFieldQuality';
import ComplianceExtractionProfile from './ComplianceExtractionProfile';
import ComplianceReport from './ComplianceReport';
import ComplianceReportSchedule from './ComplianceReportSchedule';
import ComplianceWorkflow, { ComplianceWorkflowExecution } from './ComplianceWorkflow';

// Contract Models
import DocuSealSubmission from './DocuSealSubmission';

// Broker-Mediated Compliance Models
import BrokerProfile from './BrokerProfile';
import BrokerAssistant from './BrokerAssistant';
import TransactionCoordinator from './TransactionCoordinator';
import DealBrokerMSA from './DealBrokerMSA';
import DealCommunication from './DealCommunication';
import DealFeeTracking from './DealFeeTracking';

// Organization Model
import Organization from './Organization';

// CRM Models
import Contact from './Contact';
import ContactActivity from './ContactActivity';
import PropertyContact from './PropertyContact';
import SignatureRequest from './SignatureRequest';

// Buyer Models
import Buyer from './Buyer';
import BuyerContact from './BuyerContact';

// Inquiry Models (Multi-Agent Buyer-Seller Communication)
import PropertyInquiry from './PropertyInquiry';

// Email Inbox Models
import EmailInbox from './EmailInbox';

// Deal Source Models
import DealSource from './DealSource';

// Email Client Models
import Email from './Email';
import UserEmailConfig from './UserEmailConfig';

// Team Communication Models
import TeamConversation from './TeamConversation';
import TeamMessage from './TeamMessage';
import GuestSession from './GuestSession';

// Public Deal Link Models
import PublicDealLink from './PublicDealLink';

// Outbox for transactional event delivery
import Outbox from './Outbox';

// Magic Link Token for passwordless auth
import MagicLinkToken from './MagicLinkToken';

// Notification Queue for batched delivery
import NotificationQueue from './NotificationQueue';

// Permission System Models
import Permission from './Permission';
import Role from './Role';
import UserRole from './UserRole';

// Webhook Models
import { Webhook, WebhookDelivery } from './Webhook';

// Task Management Models
import Task from './Task';

// Reminder Models
import Reminder from './Reminder';

// Activity Feed Models
import ActivityFeed from './ActivityFeed';

// Deal Note Models
import DealNote from './DealNote';

// Contact Note Models
import ContactNote from './ContactNote';

// Project Management Models
import Project from './Project';
import ProjectContact from './ProjectContact';
import ProjectNote from './ProjectNote';
import ProjectMember from './ProjectMember';
import ProjectClient from './ProjectClient';

// Deal Team Member Models
import DealTeamMember from './DealTeamMember';

// Agent Feature Models
import ScheduledTask from './ScheduledTask';
import HumanApprovalRequest from './HumanApprovalRequest';
import CalendarConnection from './CalendarConnection';

// Persona & User Modeling
import UserPersonaPreference from './UserPersonaPreference';

// Admin Tracking Models
import SearchQuery from './SearchQuery';
import UserSession from './UserSession';

// Coding Task Models (Claude Agent SDK Integration)
import CodingTask from './CodingTask';

// Sprites Integration Models
import ProjectSprite from './ProjectSprite';
import SpriteTask from './SpriteTask';

// State Compliance Workflow Models
import StateDealCompliance, { initStateDealCompliance } from './StateDealCompliance';
import StateWorkflowState, { initStateWorkflowState } from './StateWorkflowState';

// Initialize state compliance models
initStateDealCompliance(sequelize);
initStateWorkflowState(sequelize);

// ============================================================================
// DEFINE ASSOCIATIONS
// ============================================================================

// Fund -> HedgeFundBuyBox (one-to-many)
Fund.hasMany(HedgeFundBuyBox, {
  foreignKey: 'fundId',
  as: 'buyBoxes',
  onDelete: 'SET NULL',
});
HedgeFundBuyBox.belongsTo(Fund, {
  foreignKey: 'fundId',
  as: 'fund',
});

// MarketplaceUser -> Fund (optional, for Fast Buy Box users)
MarketplaceUser.belongsTo(Fund, {
  foreignKey: 'fundId',
  as: 'fund',
  constraints: false,
});
Fund.hasMany(MarketplaceUser, {
  foreignKey: 'fundId',
  as: 'users',
});

// Organization -> MarketplaceUser (one-to-many)
Organization.hasMany(MarketplaceUser, {
  foreignKey: 'organizationId',
  as: 'members',
  onDelete: 'SET NULL',
});
MarketplaceUser.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// Organization -> Contact (one-to-many) - Contacts are team-shared
Organization.hasMany(Contact, {
  foreignKey: 'organizationId',
  as: 'contacts',
  onDelete: 'CASCADE',
});
Contact.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// MarketplaceUser -> Contact (one-to-many) - Track who created the contact
MarketplaceUser.hasMany(Contact, {
  foreignKey: 'createdById',
  as: 'createdContacts',
  onDelete: 'SET NULL',
});
Contact.belongsTo(MarketplaceUser, {
  foreignKey: 'createdById',
  as: 'createdBy',
});

// MarketplaceUser -> UserBuyBox (one-to-many)
MarketplaceUser.hasMany(UserBuyBox, {
  foreignKey: 'userId',
  as: 'buyBoxes',
  onDelete: 'CASCADE',
});
UserBuyBox.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// MarketplaceUser -> DealAction (one-to-many)
MarketplaceUser.hasMany(DealAction, {
  foreignKey: 'userId',
  as: 'actions',
  onDelete: 'CASCADE',
});
DealAction.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// MarketplaceUser -> DealOffer (one-to-many)
MarketplaceUser.hasMany(DealOffer, {
  foreignKey: 'userId',
  as: 'offers',
  onDelete: 'CASCADE',
});
DealOffer.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// Property -> PropertyContact (one-to-many)
Property.hasMany(PropertyContact, {
  foreignKey: 'propertyId',
  as: 'assignedContacts',
  onDelete: 'CASCADE',
});
PropertyContact.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// Contact -> PropertyContact (one-to-many)
Contact.hasMany(PropertyContact, {
  foreignKey: 'contactId',
  as: 'propertyAssignments',
  onDelete: 'CASCADE',
});
PropertyContact.belongsTo(Contact, {
  foreignKey: 'contactId',
  as: 'contact',
});

// Contact -> ContactActivity (one-to-many)
Contact.hasMany(ContactActivity, {
  foreignKey: 'contactId',
  as: 'activities',
  onDelete: 'CASCADE',
});
ContactActivity.belongsTo(Contact, {
  foreignKey: 'contactId',
  as: 'contact',
});

// Contact -> SignatureRequest (one-to-many)
Contact.hasMany(SignatureRequest, {
  foreignKey: 'contactId',
  as: 'signatureRequests',
  onDelete: 'CASCADE',
});
SignatureRequest.belongsTo(Contact, {
  foreignKey: 'contactId',
  as: 'contact',
});

// Organization -> SignatureRequest (one-to-many)
Organization.hasMany(SignatureRequest, {
  foreignKey: 'organizationId',
  as: 'signatureRequests',
  onDelete: 'CASCADE',
});
SignatureRequest.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// MarketplaceUser -> SignatureRequest (one-to-many, requester)
MarketplaceUser.hasMany(SignatureRequest, {
  foreignKey: 'requestedById',
  as: 'signatureRequests',
  onDelete: 'CASCADE',
});
SignatureRequest.belongsTo(MarketplaceUser, {
  foreignKey: 'requestedById',
  as: 'requestedBy',
});

// DealAction -> DealOffer (optional reference)
DealAction.belongsTo(DealOffer, {
  foreignKey: 'offerId',
  as: 'offer',
  constraints: false, // offerId is optional
});

// Property -> DealAction (optional reference)
DealAction.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
  constraints: false, // propertyId is optional
});

// Property -> DealOffer (optional reference)
DealOffer.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
  constraints: false, // propertyId is optional
});

// ============================================================================
// ML MODEL ASSOCIATIONS
// ============================================================================

// TrainingRun -> ModelVersion
TrainingRun.belongsTo(ModelVersion, {
  foreignKey: 'modelVersionId',
  as: 'modelVersion',
  constraints: false,
});

ModelVersion.hasMany(TrainingRun, {
  foreignKey: 'modelVersionId',
  as: 'trainingRuns',
});

// FundFeedback -> Property (optional)
FundFeedback.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
  constraints: false,
});

// ============================================================================
// DOCUMENT ASSOCIATIONS
// ============================================================================

// Property -> PropertyDocument (one-to-many)
Property.hasMany(PropertyDocument, {
  foreignKey: 'propertyId',
  as: 'documents',
  onDelete: 'CASCADE',
});
PropertyDocument.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// Property -> ComplianceCheck (one-to-many)
Property.hasMany(ComplianceCheck, {
  foreignKey: 'propertyId',
  as: 'complianceChecks',
  onDelete: 'CASCADE',
});
ComplianceCheck.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// Property -> PropertyFieldQuality (one-to-many)
Property.hasMany(PropertyFieldQuality, {
  foreignKey: 'propertyId',
  as: 'fieldQuality',
  onDelete: 'CASCADE',
});
PropertyFieldQuality.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// Property -> PublicDealLink (one-to-many)
Property.hasMany(PublicDealLink, {
  foreignKey: 'propertyId',
  as: 'publicLinks',
  onDelete: 'CASCADE',
});
PublicDealLink.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// MarketplaceUser -> PublicDealLink (one-to-many)
MarketplaceUser.hasMany(PublicDealLink, {
  foreignKey: 'createdBy',
  as: 'createdPublicLinks',
  onDelete: 'CASCADE',
});
PublicDealLink.belongsTo(MarketplaceUser, {
  foreignKey: 'createdBy',
  as: 'creator',
});

// ComplianceCheck -> ComplianceIssueReview (one-to-many)
ComplianceCheck.hasMany(ComplianceIssueReview, {
  foreignKey: 'checkId',
  as: 'issueReviews',
  onDelete: 'CASCADE',
});
ComplianceIssueReview.belongsTo(ComplianceCheck, {
  foreignKey: 'checkId',
  as: 'check',
});

// Property -> ComplianceIssueReview (one-to-many)
Property.hasMany(ComplianceIssueReview, {
  foreignKey: 'propertyId',
  as: 'complianceIssueReviews',
  onDelete: 'CASCADE',
});
ComplianceIssueReview.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// ============================================================================
// PIPELINE & PORTFOLIO ASSOCIATIONS
// ============================================================================

// MarketplaceUser -> DealPipeline (one-to-many)
MarketplaceUser.hasMany(DealPipeline, {
  foreignKey: 'userId',
  as: 'pipelines',
  onDelete: 'CASCADE',
});
DealPipeline.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// DealPipeline -> Property (optional)
DealPipeline.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
  constraints: false,
});

// MarketplaceUser -> Portfolio (one-to-many)
MarketplaceUser.hasMany(Portfolio, {
  foreignKey: 'userId',
  as: 'portfolio',
  onDelete: 'CASCADE',
});
Portfolio.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// Portfolio -> Property (optional)
Portfolio.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
  constraints: false,
});

// Portfolio -> DealPipeline (optional, if came from pipeline)
Portfolio.belongsTo(DealPipeline, {
  foreignKey: 'dealPipelineId',
  as: 'pipelineSource',
  constraints: false,
});

// ============================================================================
// CONTRACT ASSOCIATIONS
// ============================================================================

// DocuSealSubmission -> Property (optional)
DocuSealSubmission.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
  constraints: false,
});

// Property -> DocuSealSubmission (one-to-many)
Property.hasMany(DocuSealSubmission, {
  foreignKey: 'propertyId',
  as: 'contractSubmissions',
});

// DocuSealSubmission -> DealPipeline (optional)
DocuSealSubmission.belongsTo(DealPipeline, {
  foreignKey: 'pipelineId',
  as: 'pipeline',
  constraints: false,
});

// DocuSealSubmission -> MarketplaceUser (optional)
DocuSealSubmission.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
  constraints: false,
});

// ============================================================================
// BROKER-MEDIATED COMPLIANCE ASSOCIATIONS
// ============================================================================

// MarketplaceUser -> BrokerProfile (one-to-one)
MarketplaceUser.hasOne(BrokerProfile, {
  foreignKey: 'userId',
  as: 'brokerProfile',
  onDelete: 'CASCADE',
});
BrokerProfile.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// MarketplaceUser -> BrokerAssistant (one-to-one)
MarketplaceUser.hasOne(BrokerAssistant, {
  foreignKey: 'userId',
  as: 'brokerAssistant',
  onDelete: 'CASCADE',
});
BrokerAssistant.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// MarketplaceUser -> TransactionCoordinator (one-to-one)
MarketplaceUser.hasOne(TransactionCoordinator, {
  foreignKey: 'userId',
  as: 'transactionCoordinator',
  onDelete: 'CASCADE',
});
TransactionCoordinator.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// BrokerProfile -> BrokerAssistant (one-to-many)
BrokerProfile.hasMany(BrokerAssistant, {
  foreignKey: 'brokerId',
  as: 'assistants',
  onDelete: 'CASCADE',
});
BrokerAssistant.belongsTo(BrokerProfile, {
  foreignKey: 'brokerId',
  as: 'broker',
});

// BrokerProfile -> DealBrokerMSA (one-to-many)
BrokerProfile.hasMany(DealBrokerMSA, {
  foreignKey: 'brokerId',
  as: 'msas',
  onDelete: 'SET NULL',
});
DealBrokerMSA.belongsTo(BrokerProfile, {
  foreignKey: 'brokerId',
  as: 'broker',
});

// MarketplaceUser (wholesaler) -> DealBrokerMSA (one-to-many)
MarketplaceUser.hasMany(DealBrokerMSA, {
  foreignKey: 'wholesalerId',
  as: 'wholesalerMsas',
  onDelete: 'SET NULL',
});
DealBrokerMSA.belongsTo(MarketplaceUser, {
  foreignKey: 'wholesalerId',
  as: 'wholesaler',
});

// Property -> DealBrokerMSA (one-to-many)
Property.hasMany(DealBrokerMSA, {
  foreignKey: 'propertyId',
  as: 'brokerMsas',
  onDelete: 'CASCADE',
});
DealBrokerMSA.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// DealBrokerMSA -> DealCommunication (one-to-many)
DealBrokerMSA.hasMany(DealCommunication, {
  foreignKey: 'msaId',
  as: 'communications',
  onDelete: 'CASCADE',
});
DealCommunication.belongsTo(DealBrokerMSA, {
  foreignKey: 'msaId',
  as: 'msa',
});

// Property -> DealCommunication (one-to-many)
Property.hasMany(DealCommunication, {
  foreignKey: 'propertyId',
  as: 'dealCommunications',
  onDelete: 'CASCADE',
});
DealCommunication.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// DealBrokerMSA -> DealFeeTracking (one-to-many)
DealBrokerMSA.hasMany(DealFeeTracking, {
  foreignKey: 'msaId',
  as: 'fees',
  onDelete: 'CASCADE',
});
DealFeeTracking.belongsTo(DealBrokerMSA, {
  foreignKey: 'msaId',
  as: 'msa',
});

// Property -> DealFeeTracking (one-to-many)
Property.hasMany(DealFeeTracking, {
  foreignKey: 'propertyId',
  as: 'dealFees',
  onDelete: 'CASCADE',
});
DealFeeTracking.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// ============================================================================
// INQUIRY ASSOCIATIONS (Multi-Agent Buyer-Seller Communication)
// ============================================================================

// Property -> PropertyInquiry (one-to-many)
Property.hasMany(PropertyInquiry, {
  foreignKey: 'propertyId',
  as: 'inquiries',
  onDelete: 'CASCADE',
});
PropertyInquiry.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// MarketplaceUser (buyer) -> PropertyInquiry (one-to-many)
MarketplaceUser.hasMany(PropertyInquiry, {
  foreignKey: 'buyerId',
  as: 'inquiries',
  onDelete: 'CASCADE',
});
PropertyInquiry.belongsTo(MarketplaceUser, {
  foreignKey: 'buyerId',
  as: 'buyer',
});

// ============================================================================
// BUYER ASSOCIATIONS
// ============================================================================

// Buyer -> BuyerContact (one-to-many)
Buyer.hasMany(BuyerContact, {
  foreignKey: 'buyerId',
  as: 'contacts',
  onDelete: 'CASCADE',
});
BuyerContact.belongsTo(Buyer, {
  foreignKey: 'buyerId',
  as: 'buyer',
});

// ============================================================================
// USER EMAIL CONFIG ASSOCIATIONS
// ============================================================================

// MarketplaceUser -> UserEmailConfig (one-to-one)
MarketplaceUser.hasOne(UserEmailConfig, {
  foreignKey: 'userId',
  as: 'emailConfig',
  onDelete: 'CASCADE',
});
UserEmailConfig.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// ============================================================================
// TEAM COMMUNICATION ASSOCIATIONS
// ============================================================================

// Property -> TeamConversation (one-to-many)
Property.hasMany(TeamConversation, {
  foreignKey: 'propertyId',
  as: 'teamConversations',
  onDelete: 'SET NULL',
});
TeamConversation.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// TeamConversation -> TeamMessage (one-to-many)
TeamConversation.hasMany(TeamMessage, {
  foreignKey: 'conversationId',
  as: 'messages',
  onDelete: 'CASCADE',
});
TeamMessage.belongsTo(TeamConversation, {
  foreignKey: 'conversationId',
  as: 'conversation',
});

// MarketplaceUser -> TeamMessage (one-to-many, sender)
MarketplaceUser.hasMany(TeamMessage, {
  foreignKey: 'senderId',
  as: 'teamMessages',
  onDelete: 'SET NULL',
});
TeamMessage.belongsTo(MarketplaceUser, {
  foreignKey: 'senderId',
  as: 'sender',
});

// MarketplaceUser -> GuestSession (one-to-one, linked user)
MarketplaceUser.hasOne(GuestSession, {
  foreignKey: 'linkedUserId',
  as: 'guestSession',
  onDelete: 'SET NULL',
});
GuestSession.belongsTo(MarketplaceUser, {
  foreignKey: 'linkedUserId',
  as: 'linkedUser',
});

// ============================================================================
// STATE COMPLIANCE WORKFLOW ASSOCIATIONS
// ============================================================================

// Property -> StateDealCompliance (one-to-many)
Property.hasMany(StateDealCompliance, {
  foreignKey: 'dealId',
  as: 'stateCompliance',
  onDelete: 'CASCADE',
});
StateDealCompliance.belongsTo(Property, {
  foreignKey: 'dealId',
  as: 'property',
});

// Property -> StateWorkflowState (one-to-many)
Property.hasMany(StateWorkflowState, {
  foreignKey: 'dealId',
  as: 'workflowStates',
  onDelete: 'CASCADE',
});
StateWorkflowState.belongsTo(Property, {
  foreignKey: 'dealId',
  as: 'property',
});

// StateDealCompliance -> StateWorkflowState (one-to-one per state)
// Note: Both share dealId + state as the linking key

// ============================================================================
// PERMISSION SYSTEM ASSOCIATIONS
// ============================================================================

// Organization -> Role (one-to-many for custom roles)
Organization.hasMany(Role, {
  foreignKey: 'organizationId',
  as: 'customRoles',
  onDelete: 'CASCADE',
});
Role.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// MarketplaceUser -> UserRole (one-to-many)
MarketplaceUser.hasMany(UserRole, {
  foreignKey: 'userId',
  as: 'userRoles',
  onDelete: 'CASCADE',
});
UserRole.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// Role -> UserRole (one-to-many)
Role.hasMany(UserRole, {
  foreignKey: 'roleId',
  as: 'userAssignments',
  onDelete: 'CASCADE',
});
UserRole.belongsTo(Role, {
  foreignKey: 'roleId',
  as: 'role',
});

// Organization -> UserRole (one-to-many for context)
Organization.hasMany(UserRole, {
  foreignKey: 'organizationId',
  as: 'roleAssignments',
  onDelete: 'CASCADE',
});
UserRole.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// MarketplaceUser -> Role (created by)
MarketplaceUser.hasMany(Role, {
  foreignKey: 'createdBy',
  as: 'createdRoles',
  onDelete: 'SET NULL',
});
Role.belongsTo(MarketplaceUser, {
  foreignKey: 'createdBy',
  as: 'creator',
});

// ============================================================================
// TASK MANAGEMENT ASSOCIATIONS
// ============================================================================

// MarketplaceUser -> Task (assigned to)
MarketplaceUser.hasMany(Task, {
  foreignKey: 'assignedTo',
  as: 'assignedTasks',
  onDelete: 'SET NULL',
});
Task.belongsTo(MarketplaceUser, {
  foreignKey: 'assignedTo',
  as: 'assignee',
});

// MarketplaceUser -> Task (created by)
MarketplaceUser.hasMany(Task, {
  foreignKey: 'createdBy',
  as: 'createdTasks',
  onDelete: 'SET NULL',
});
Task.belongsTo(MarketplaceUser, {
  foreignKey: 'createdBy',
  as: 'creator',
});

// Property -> Task (one-to-many for deal tasks)
Property.hasMany(Task, {
  foreignKey: 'propertyId',
  as: 'tasks',
  onDelete: 'CASCADE',
});
Task.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// Buyer -> Task (one-to-many for buyer tasks)
Buyer.hasMany(Task, {
  foreignKey: 'buyerId',
  as: 'tasks',
  onDelete: 'CASCADE',
});
Task.belongsTo(Buyer, {
  foreignKey: 'buyerId',
  as: 'buyer',
});

// ComplianceCheck -> Task (one-to-many for compliance tasks)
ComplianceCheck.hasMany(Task, {
  foreignKey: 'complianceCheckId',
  as: 'tasks',
  onDelete: 'CASCADE',
});
Task.belongsTo(ComplianceCheck, {
  foreignKey: 'complianceCheckId',
  as: 'complianceCheck',
});

// Organization -> Task (one-to-many for team tasks)
Organization.hasMany(Task, {
  foreignKey: 'organizationId',
  as: 'tasks',
  onDelete: 'CASCADE',
});
Task.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// Task -> Task (self-referencing for parent tasks)
Task.hasMany(Task, {
  foreignKey: 'parentTaskId',
  as: 'childTasks',
  onDelete: 'SET NULL',
});
Task.belongsTo(Task, {
  foreignKey: 'parentTaskId',
  as: 'parentTask',
});

// ============================================================================
// REMINDER ASSOCIATIONS
// ============================================================================

// MarketplaceUser -> Reminder (one-to-many)
MarketplaceUser.hasMany(Reminder, {
  foreignKey: 'userId',
  as: 'reminders',
  onDelete: 'CASCADE',
});
Reminder.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// Property -> Reminder (one-to-many for deal reminders)
Property.hasMany(Reminder, {
  foreignKey: 'propertyId',
  as: 'reminders',
  onDelete: 'CASCADE',
});
Reminder.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// Task -> Reminder (one-to-many for task reminders)
Task.hasMany(Reminder, {
  foreignKey: 'taskId',
  as: 'reminders',
  onDelete: 'CASCADE',
});
Reminder.belongsTo(Task, {
  foreignKey: 'taskId',
  as: 'task',
});

// Buyer -> Reminder (one-to-many for buyer reminders)
Buyer.hasMany(Reminder, {
  foreignKey: 'buyerId',
  as: 'reminders',
  onDelete: 'CASCADE',
});
Reminder.belongsTo(Buyer, {
  foreignKey: 'buyerId',
  as: 'buyer',
});

// Organization -> Reminder (one-to-many)
Organization.hasMany(Reminder, {
  foreignKey: 'organizationId',
  as: 'reminders',
  onDelete: 'CASCADE',
});
Reminder.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// Reminder -> Reminder (self-referencing for recurring reminders)
Reminder.hasMany(Reminder, {
  foreignKey: 'parentReminderId',
  as: 'childReminders',
  onDelete: 'SET NULL',
});
Reminder.belongsTo(Reminder, {
  foreignKey: 'parentReminderId',
  as: 'parentReminder',
});

// ============================================================================
// DEAL NOTE ASSOCIATIONS
// ============================================================================

// Property -> DealNote (one-to-many)
Property.hasMany(DealNote, {
  foreignKey: 'propertyId',
  as: 'dealNotes',
  onDelete: 'CASCADE',
});
DealNote.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// MarketplaceUser -> DealNote (one-to-many, author)
MarketplaceUser.hasMany(DealNote, {
  foreignKey: 'userId',
  as: 'dealNotes',
  onDelete: 'CASCADE',
});
DealNote.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'author',
});

// Organization -> DealNote (one-to-many)
Organization.hasMany(DealNote, {
  foreignKey: 'organizationId',
  as: 'dealNotes',
  onDelete: 'CASCADE',
});
DealNote.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// ============================================================================
// CONTACT NOTE ASSOCIATIONS
// ============================================================================

// Contact -> ContactNote (one-to-many)
Contact.hasMany(ContactNote, {
  foreignKey: 'contactId',
  as: 'contactNotes',
  onDelete: 'CASCADE',
});
ContactNote.belongsTo(Contact, {
  foreignKey: 'contactId',
  as: 'contact',
});

// MarketplaceUser -> ContactNote (one-to-many, author)
MarketplaceUser.hasMany(ContactNote, {
  foreignKey: 'userId',
  as: 'contactNotes',
  onDelete: 'CASCADE',
});
ContactNote.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'author',
});

// Organization -> ContactNote (one-to-many)
Organization.hasMany(ContactNote, {
  foreignKey: 'organizationId',
  as: 'contactNotes',
  onDelete: 'CASCADE',
});
ContactNote.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// ============================================================================
// PROJECT ASSOCIATIONS
// ============================================================================

// Organization -> Project (one-to-many)
Organization.hasMany(Project, {
  foreignKey: 'organizationId',
  as: 'projects',
  onDelete: 'CASCADE',
});
Project.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// MarketplaceUser -> Project (one-to-many, creator)
MarketplaceUser.hasMany(Project, {
  foreignKey: 'createdById',
  as: 'createdProjects',
  onDelete: 'SET NULL',
});
Project.belongsTo(MarketplaceUser, {
  foreignKey: 'createdById',
  as: 'createdBy',
});

// Project <-> Contact (many-to-many through ProjectContact)
Project.belongsToMany(Contact, {
  through: ProjectContact,
  foreignKey: 'projectId',
  otherKey: 'contactId',
  as: 'contacts',
});
Contact.belongsToMany(Project, {
  through: ProjectContact,
  foreignKey: 'contactId',
  otherKey: 'projectId',
  as: 'projects',
});

// Project -> ProjectContact (one-to-many for direct access)
Project.hasMany(ProjectContact, {
  foreignKey: 'projectId',
  as: 'projectContacts',
  onDelete: 'CASCADE',
});
ProjectContact.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project',
});

// Contact -> ProjectContact (one-to-many for direct access)
Contact.hasMany(ProjectContact, {
  foreignKey: 'contactId',
  as: 'projectAssignments',
  onDelete: 'CASCADE',
});
ProjectContact.belongsTo(Contact, {
  foreignKey: 'contactId',
  as: 'contact',
});

// MarketplaceUser -> ProjectContact (one-to-many, who added)
MarketplaceUser.hasMany(ProjectContact, {
  foreignKey: 'addedById',
  as: 'addedProjectContacts',
  onDelete: 'SET NULL',
});
ProjectContact.belongsTo(MarketplaceUser, {
  foreignKey: 'addedById',
  as: 'addedBy',
});

// Project -> ProjectNote (one-to-many)
Project.hasMany(ProjectNote, {
  foreignKey: 'projectId',
  as: 'notes',
  onDelete: 'CASCADE',
});
ProjectNote.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project',
});

// MarketplaceUser -> ProjectNote (one-to-many, author)
MarketplaceUser.hasMany(ProjectNote, {
  foreignKey: 'userId',
  as: 'projectNotes',
  onDelete: 'CASCADE',
});
ProjectNote.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'author',
});

// Organization -> ProjectNote (one-to-many)
Organization.hasMany(ProjectNote, {
  foreignKey: 'organizationId',
  as: 'projectNotes',
  onDelete: 'CASCADE',
});
ProjectNote.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// Project -> Task (one-to-many)
Project.hasMany(Task, {
  foreignKey: 'projectId',
  as: 'tasks',
  onDelete: 'CASCADE',
});
Task.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project',
});

// Project <-> MarketplaceUser (many-to-many through ProjectMember)
Project.belongsToMany(MarketplaceUser, {
  through: ProjectMember,
  foreignKey: 'projectId',
  otherKey: 'userId',
  as: 'members',
});
MarketplaceUser.belongsToMany(Project, {
  through: ProjectMember,
  foreignKey: 'userId',
  otherKey: 'projectId',
  as: 'memberProjects',
});

// Project -> ProjectMember (one-to-many for direct access)
Project.hasMany(ProjectMember, {
  foreignKey: 'projectId',
  as: 'projectMembers',
  onDelete: 'CASCADE',
});
ProjectMember.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project',
});

// MarketplaceUser -> ProjectMember (one-to-many for direct access)
MarketplaceUser.hasMany(ProjectMember, {
  foreignKey: 'userId',
  as: 'projectMemberships',
  onDelete: 'CASCADE',
});
ProjectMember.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// MarketplaceUser -> ProjectMember (assigned by)
MarketplaceUser.hasMany(ProjectMember, {
  foreignKey: 'assignedBy',
  as: 'projectMemberAssignments',
  onDelete: 'SET NULL',
});
ProjectMember.belongsTo(MarketplaceUser, {
  foreignKey: 'assignedBy',
  as: 'assigner',
});

// ============================================================================
// PROJECT CLIENT ASSOCIATIONS (Client Portal)
// ============================================================================

// Project -> ProjectClient (one-to-many)
Project.hasMany(ProjectClient, {
  foreignKey: 'projectId',
  as: 'clients',
  onDelete: 'CASCADE',
});
ProjectClient.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project',
});

// MarketplaceUser (client) -> ProjectClient (one-to-many)
MarketplaceUser.hasMany(ProjectClient, {
  foreignKey: 'clientUserId',
  as: 'clientProjects',
  onDelete: 'CASCADE',
});
ProjectClient.belongsTo(MarketplaceUser, {
  foreignKey: 'clientUserId',
  as: 'client',
});

// MarketplaceUser (inviter) -> ProjectClient (one-to-many)
MarketplaceUser.hasMany(ProjectClient, {
  foreignKey: 'invitedByUserId',
  as: 'invitedClients',
  onDelete: 'CASCADE',
});
ProjectClient.belongsTo(MarketplaceUser, {
  foreignKey: 'invitedByUserId',
  as: 'invitedBy',
});

// ============================================================================
// CODING TASK ASSOCIATIONS (Claude Agent SDK)
// ============================================================================

// Project -> CodingTask (one-to-many)
Project.hasMany(CodingTask, {
  foreignKey: 'projectId',
  as: 'codingTasks',
  onDelete: 'CASCADE',
});
CodingTask.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project',
});

// ============================================================================
// SPRITES INTEGRATION ASSOCIATIONS
// ============================================================================

// Project -> ProjectSprite (one-to-many)
Project.hasMany(ProjectSprite, {
  foreignKey: 'projectId',
  as: 'sprites',
  onDelete: 'CASCADE',
});
ProjectSprite.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project',
});

// Organization -> ProjectSprite (one-to-many)
Organization.hasMany(ProjectSprite, {
  foreignKey: 'organizationId',
  as: 'sprites',
  onDelete: 'CASCADE',
});
ProjectSprite.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// MarketplaceUser -> ProjectSprite (one-to-many, creator)
MarketplaceUser.hasMany(ProjectSprite, {
  foreignKey: 'createdById',
  as: 'createdSprites',
  onDelete: 'SET NULL',
});
ProjectSprite.belongsTo(MarketplaceUser, {
  foreignKey: 'createdById',
  as: 'createdBy',
});

// MarketplaceUser -> ProjectSprite (one-to-many, last accessed by)
MarketplaceUser.hasMany(ProjectSprite, {
  foreignKey: 'lastAccessedById',
  as: 'lastAccessedSprites',
  onDelete: 'SET NULL',
});
ProjectSprite.belongsTo(MarketplaceUser, {
  foreignKey: 'lastAccessedById',
  as: 'lastAccessedBy',
});

// ProjectSprite -> SpriteTask (one-to-many)
ProjectSprite.hasMany(SpriteTask, {
  foreignKey: 'spriteId',
  as: 'tasks',
  onDelete: 'SET NULL',
});
SpriteTask.belongsTo(ProjectSprite, {
  foreignKey: 'spriteId',
  as: 'sprite',
});

// Project -> SpriteTask (one-to-many)
Project.hasMany(SpriteTask, {
  foreignKey: 'projectId',
  as: 'spriteTasks',
  onDelete: 'CASCADE',
});
SpriteTask.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project',
});

// Organization -> SpriteTask (one-to-many)
Organization.hasMany(SpriteTask, {
  foreignKey: 'organizationId',
  as: 'spriteTasks',
  onDelete: 'CASCADE',
});
SpriteTask.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// MarketplaceUser -> SpriteTask (one-to-many, creator)
MarketplaceUser.hasMany(SpriteTask, {
  foreignKey: 'createdById',
  as: 'createdSpriteTasks',
  onDelete: 'SET NULL',
});
SpriteTask.belongsTo(MarketplaceUser, {
  foreignKey: 'createdById',
  as: 'createdBy',
});

// MarketplaceUser -> CodingTask (one-to-many, creator)
MarketplaceUser.hasMany(CodingTask, {
  foreignKey: 'createdById',
  as: 'codingTasks',
  onDelete: 'SET NULL',
});
CodingTask.belongsTo(MarketplaceUser, {
  foreignKey: 'createdById',
  as: 'createdBy',
});

// ============================================================================
// DEAL TEAM MEMBER ASSOCIATIONS
// ============================================================================

// Property -> DealTeamMember (one-to-many)
Property.hasMany(DealTeamMember, {
  foreignKey: 'propertyId',
  as: 'teamMembers',
  onDelete: 'CASCADE',
});
DealTeamMember.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
});

// MarketplaceUser -> DealTeamMember (one-to-many)
MarketplaceUser.hasMany(DealTeamMember, {
  foreignKey: 'userId',
  as: 'dealAssignments',
  onDelete: 'CASCADE',
});
DealTeamMember.belongsTo(MarketplaceUser, {
  foreignKey: 'userId',
  as: 'user',
});

// MarketplaceUser -> DealTeamMember (assigned by)
MarketplaceUser.hasMany(DealTeamMember, {
  foreignKey: 'assignedBy',
  as: 'dealAssignmentsMade',
  onDelete: 'SET NULL',
});
DealTeamMember.belongsTo(MarketplaceUser, {
  foreignKey: 'assignedBy',
  as: 'assigner',
});

// ============================================================================
// SYNC FUNCTION
// ============================================================================

/**
 * Sync all models with the database
 * @param options - Sequelize sync options
 */
export async function syncDatabase(options: { force?: boolean; alter?: boolean } = {}) {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Try full sync first
    try {
      await sequelize.sync(options);
      console.log('✅ All models synchronized');
    } catch (syncError: any) {
      console.warn('⚠️ Full sync had issues:', syncError.message);
      console.log('   Attempting to sync individual models...');

      // Sync ML, Agent, Settings, Pipeline, Portfolio, Market Data, and Compliance models individually (they're likely new tables that don't exist yet)
      const mlModels = [
        Fund,
        HedgeFundBuyBox,
        PropertyDocument,
        FundFeedback,
        MLPrediction,
        ModelVersion,
        TrainingRun,
        ConversationHistory,
        Conversation,
        PropertyLookup,
        Settings,
        AutomationExecution,
        DeadLetterQueue,
        FollowUpChain,
        FollowUpExecution,
        AgentMetric,
        DealPipeline,
        Portfolio,
        DealMatch,
        StateComplianceRule,
        StateKnowledge,
        StateDocumentTemplate,
        ComplianceCheck,
        ComplianceIssueReview,
        ComplianceAuditLog,
        ComplianceAlert,
        ComplianceWebhook,
        WebhookDeliveryLog,
        ComplianceRuleVersion,
        ComplianceEvent,
        SanctionsScreening,
        EscalationPolicy,
        EscalationExecution,
        FraudSignal,
        PropertyFieldQuality,
        ComplianceReport,
        ComplianceReportSchedule,
        ComplianceWorkflow,
        ComplianceWorkflowExecution,
        DocuSealSubmission,
        // Broker-Mediated Compliance Models
        BrokerProfile,
        BrokerAssistant,
        TransactionCoordinator,
        DealBrokerMSA,
        DealCommunication,
        DealFeeTracking,
        // CRM Models
        PropertyContact,
        SignatureRequest,
        // Buyer Models
        Buyer,
        BuyerContact,
        // Inquiry Models
        PropertyInquiry,
        // Email Inbox Models
        EmailInbox,
        // Deal Source Models
        DealSource,
        // Email Client Models
        Email,
        UserEmailConfig,
        // Outbox
        Outbox,
        // Magic Link Token
        MagicLinkToken,
        // Notification Queue
        NotificationQueue,
        // Admin Tracking Models
        SearchQuery,
        UserSession,
        // Team Communication Models
        TeamConversation,
        TeamMessage,
        GuestSession,
        // Public Deal Link Models
        PublicDealLink,
        // State Compliance Workflow Models
        StateDealCompliance,
        StateWorkflowState,
        // Permission System Models
        Permission,
        Role,
        UserRole,
        // Webhook Models
        Webhook,
        WebhookDelivery,
        // Task Management Models
        Task,
        // Reminder Models
        Reminder,
        // Activity Feed Models
        ActivityFeed,
        // Agent Feature Models
        ScheduledTask,
        HumanApprovalRequest,
        CalendarConnection,
        // Deal Note Models
        DealNote,
        // Project Management Models
        Project,
        ProjectContact,
        ProjectNote,
        ProjectMember,
        // Coding Task Models
        CodingTask,
        // Sprites Integration Models
        ProjectSprite,
        SpriteTask,
        // Client Portal Models
        ProjectClient,
      ];
      for (const model of mlModels) {
        try {
          await model.sync(options);
          console.log(`   ✅ Synced ${model.tableName}`);
        } catch (modelError: any) {
          console.warn(`   ⚠️ Failed to sync ${model.tableName}:`, modelError.message);
        }
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Database sync failed:', error);
    throw error;
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  sequelize,
  Property,
  MarketplaceUser,
  UserBuyBox,
  DealAction,
  DealOffer,
  Fund,
  HedgeFundBuyBox,
  Automation,
  WorkflowExecution,
  // ML Models
  FundFeedback,
  MLPrediction,
  ModelVersion,
  TrainingRun,
  // Agent Models
  ConversationHistory,
  Conversation,
  AgentMetric,
  // Document Models
  PropertyDocument,
  // Market Data Models
  PropertyLookup,
  // Settings & Automation Models
  Settings,
  AutomationExecution,
  DeadLetterQueue,
  // Follow-up Models
  FollowUpChain,
  FollowUpExecution,
  // Pipeline & Portfolio Models
  DealPipeline,
  Portfolio,
  // Match Models
  DealMatch,
  // Team Assignment Models
  DealAssignment,
  // Forward Tracking Models
  DealForward,
  // Compliance Models
  StateComplianceRule,
  StateKnowledge,
  StateDocumentTemplate,
  ComplianceCheck,
  ComplianceIssueReview,
  ComplianceAuditLog,
  ComplianceAlert,
  ComplianceWebhook,
  WebhookDeliveryLog,
  ComplianceRuleVersion,
  ComplianceEvent,
  SanctionsScreening,
  EscalationPolicy,
  EscalationExecution,
  FraudSignal,
  PropertyFieldQuality,
  ComplianceReport,
  ComplianceReportSchedule,
  ComplianceWorkflow,
  ComplianceWorkflowExecution,
  // Contract Models
  DocuSealSubmission,
  // Broker-Mediated Compliance Models
  BrokerProfile,
  BrokerAssistant,
  TransactionCoordinator,
  DealBrokerMSA,
  DealCommunication,
  DealFeeTracking,
  // Organization Model
  Organization,
  // CRM Models
  Contact,
  ContactActivity,
  PropertyContact,
  SignatureRequest,
  // Buyer Models
  Buyer,
  BuyerContact,
  // Inquiry Models
  PropertyInquiry,
  // Email Inbox Models
  EmailInbox,
  // Deal Source Models
  DealSource,
  // Email Client Models
  Email,
  UserEmailConfig,
  // Outbox
  Outbox,
  // Magic Link Token
  MagicLinkToken,
  // Notification Queue
  NotificationQueue,
  // Admin Tracking Models
  SearchQuery,
  UserSession,
  // Team Communication Models
  TeamConversation,
  TeamMessage,
  GuestSession,
  // Public Deal Link Models
  PublicDealLink,
  // State Compliance Workflow Models
  StateDealCompliance,
  StateWorkflowState,
  // Permission System Models
  Permission,
  Role,
  UserRole,
  // Webhook Models
  Webhook,
  WebhookDelivery,
  // Task Management Models
  Task,
  // Reminder Models
  Reminder,
  // Activity Feed Models
  ActivityFeed,
  // Agent Feature Models
  ScheduledTask,
  HumanApprovalRequest,
  CalendarConnection,
  // Deal Note Models
  DealNote,
  // Contact Note Models
  ContactNote,
  // Project Management Models
  Project,
  ProjectContact,
  ProjectNote,
  ProjectMember,
  ProjectClient,
  // Deal Team Member Models
  DealTeamMember,
  // Persona & User Modeling
  UserPersonaPreference,
  // Coding Task Models
  CodingTask,
  // Sprites Integration Models
  ProjectSprite,
  SpriteTask,
};

export default {
  sequelize,
  Property,
  MarketplaceUser,
  UserBuyBox,
  DealAction,
  DealOffer,
  Fund,
  HedgeFundBuyBox,
  Automation,
  WorkflowExecution,
  // ML Models
  FundFeedback,
  MLPrediction,
  ModelVersion,
  TrainingRun,
  // Agent Models
  ConversationHistory,
  Conversation,
  AgentMetric,
  // Document Models
  PropertyDocument,
  // Market Data Models
  PropertyLookup,
  // Settings & Automation Models
  Settings,
  AutomationExecution,
  DeadLetterQueue,
  // Follow-up Models
  FollowUpChain,
  FollowUpExecution,
  // Pipeline & Portfolio Models
  DealPipeline,
  Portfolio,
  // Match Models
  DealMatch,
  // Team Assignment Models
  DealAssignment,
  // Forward Tracking Models
  DealForward,
  // Compliance Models
  StateComplianceRule,
  StateKnowledge,
  StateDocumentTemplate,
  ComplianceCheck,
  ComplianceIssueReview,
  ComplianceAuditLog,
  ComplianceAlert,
  ComplianceWebhook,
  WebhookDeliveryLog,
  ComplianceRuleVersion,
  ComplianceEvent,
  SanctionsScreening,
  EscalationPolicy,
  EscalationExecution,
  FraudSignal,
  PropertyFieldQuality,
  ComplianceExtractionProfile,
  ComplianceReport,
  ComplianceReportSchedule,
  // Contract Models
  DocuSealSubmission,
  // Broker-Mediated Compliance Models
  BrokerProfile,
  BrokerAssistant,
  TransactionCoordinator,
  DealBrokerMSA,
  DealCommunication,
  DealFeeTracking,
  // Organization Model
  Organization,
  // CRM Models
  Contact,
  ContactActivity,
  PropertyContact,
  SignatureRequest,
  // Buyer Models
  Buyer,
  BuyerContact,
  // Inquiry Models
  PropertyInquiry,
  // Email Inbox Models
  EmailInbox,
  // Deal Source Models
  DealSource,
  // Email Client Models
  Email,
  UserEmailConfig,
  // Outbox
  Outbox,
  // Magic Link Token
  MagicLinkToken,
  // Notification Queue
  NotificationQueue,
  // Admin Tracking Models
  SearchQuery,
  UserSession,
  // Team Communication Models
  TeamConversation,
  TeamMessage,
  GuestSession,
  // Public Deal Link Models
  PublicDealLink,
  // State Compliance Workflow Models
  StateDealCompliance,
  StateWorkflowState,
  // Permission System Models
  Permission,
  Role,
  UserRole,
  // Webhook Models
  Webhook,
  WebhookDelivery,
  // Task Management Models
  Task,
  // Reminder Models
  Reminder,
  // Activity Feed Models
  ActivityFeed,
  // Agent Feature Models
  ScheduledTask,
  HumanApprovalRequest,
  CalendarConnection,
  // Deal Note Models
  DealNote,
  // Project Management Models
  Project,
  ProjectContact,
  ProjectNote,
  ProjectMember,
  ProjectClient,
  // Persona & User Modeling
  UserPersonaPreference,
  // Coding Task Models
  CodingTask,
  // Sprites Integration Models
  ProjectSprite,
  SpriteTask,
  syncDatabase,
  testConnection,
};
