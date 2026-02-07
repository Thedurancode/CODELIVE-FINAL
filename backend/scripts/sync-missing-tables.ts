/**
 * Sync Missing Tables Script
 *
 * Creates missing tables in the correct dependency order.
 */

import sequelize from '../src/config/database';

// Import models in dependency order
import Organization from '../src/models/Organization';
import MarketplaceUser from '../src/models/MarketplaceUser';
import Property from '../src/models/Property';
import Contact from '../src/models/Contact';
import ContactActivity from '../src/models/ContactActivity';
import ContactNote from '../src/models/ContactNote';
import DealPipeline from '../src/models/DealPipeline';
import Portfolio from '../src/models/Portfolio';
import DealAssignment from '../src/models/DealAssignment';
import DealForward from '../src/models/DealForward';
import DealTeamMember from '../src/models/DealTeamMember';
import DealNote from '../src/models/DealNote';
import PropertyContact from '../src/models/PropertyContact';
import PropertyInquiry from '../src/models/PropertyInquiry';
import DocuSealSubmission from '../src/models/DocuSealSubmission';
import ContractSigner from '../src/models/ContractSigner';
import SignatureRequest from '../src/models/SignatureRequest';
import { Webhook, WebhookDelivery } from '../src/models/Webhook';
import Task from '../src/models/Task';
import CodeliveSync from '../src/models/CodeliveSync';
import Reminder from '../src/models/Reminder';
import Role from '../src/models/Role';
import UserRole from '../src/models/UserRole';
import Project from '../src/models/Project';
import ProjectContact from '../src/models/ProjectContact';
import ProjectNote from '../src/models/ProjectNote';
import ProjectNoteAttachment from '../src/models/ProjectNoteAttachment';
import ProjectNoteAudio from '../src/models/ProjectNoteAudio';
import ProjectEnvVariable from '../src/models/ProjectEnvVariable';
import ProjectBrandAsset from '../src/models/ProjectBrandAsset';
import ProjectMember from '../src/models/ProjectMember';
import ProjectClient from '../src/models/ProjectClient';
import CodingTask from '../src/models/CodingTask';
import ProjectSprite from '../src/models/ProjectSprite';
import SpriteTask from '../src/models/SpriteTask';
import SpriteSession from '../src/models/SpriteSession';
import SpriteMcpServer from '../src/models/SpriteMcpServer';
import DeployHook from '../src/models/DeployHook';
import ApiKey from '../src/models/ApiKey';
import HomeAssistantConfig from '../src/models/HomeAssistantConfig';
import Meeting from '../src/models/Meeting';
import MeetingParticipant from '../src/models/MeetingParticipant';
import MeetingRoom from '../src/models/MeetingRoom';
import UserPersonaPreference from '../src/models/UserPersonaPreference';
import ComplianceExtractionProfile from '../src/models/ComplianceExtractionProfile';
import ComplianceWorkflow, { ComplianceWorkflowExecution } from '../src/models/ComplianceWorkflow';

async function syncTable(model: any, name: string) {
  try {
    await model.sync({ force: true });
    console.log(`   ✅ Created ${name}`);
  } catch (error: any) {
    console.log(`   ⚠️ Failed ${name}: ${error.message}`);
  }
}

async function main() {
  console.log('🚀 Syncing missing tables in dependency order...');
  console.log('');

  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    console.log('');

    // Group 1: Base tables (no dependencies)
    console.log('📦 Group 1: Base tables');
    await syncTable(Organization, 'organizations');
    await syncTable(ApiKey, 'api_keys');
    await syncTable(HomeAssistantConfig, 'home_assistant_configs');
    await syncTable(UserPersonaPreference, 'user_persona_preferences');
    await syncTable(ComplianceExtractionProfile, 'compliance_extraction_profiles');
    await syncTable(ComplianceWorkflow, 'compliance_workflows');
    await syncTable(ComplianceWorkflowExecution, 'compliance_workflow_executions');

    console.log('');
    console.log('📦 Group 2: Tables depending on Organization/MarketplaceUser');
    await syncTable(Contact, 'contacts');
    await syncTable(ContactActivity, 'contact_activities');
    await syncTable(Role, 'roles');
    await syncTable(UserRole, 'user_roles');

    console.log('');
    console.log('📦 Group 3: Tables depending on Property');
    await syncTable(DealPipeline, 'deal_pipelines');
    await syncTable(Portfolio, 'portfolios');
    await syncTable(DealAssignment, 'deal_assignments');
    await syncTable(DealForward, 'deal_forwards');
    await syncTable(DealTeamMember, 'deal_team_members');
    await syncTable(DealNote, 'deal_notes');
    await syncTable(PropertyContact, 'property_contacts');
    await syncTable(PropertyInquiry, 'property_inquiries');

    console.log('');
    console.log('📦 Group 4: Tables depending on Contact');
    await syncTable(ContactNote, 'contact_notes');
    await syncTable(SignatureRequest, 'signature_requests');

    console.log('');
    console.log('📦 Group 5: Contract tables');
    await syncTable(DocuSealSubmission, 'docuseal_submissions');
    await syncTable(ContractSigner, 'contract_signers');

    console.log('');
    console.log('📦 Group 6: Webhook tables');
    await syncTable(Webhook, 'webhooks');
    await syncTable(WebhookDelivery, 'webhook_deliveries');

    console.log('');
    console.log('📦 Group 7: Task & Reminder tables');
    await syncTable(Task, 'tasks');
    await syncTable(CodeliveSync, 'codelive_syncs');
    await syncTable(Reminder, 'reminders');

    console.log('');
    console.log('📦 Group 8: Project tables');
    await syncTable(Project, 'projects');
    await syncTable(ProjectContact, 'project_contacts');
    await syncTable(ProjectNote, 'project_notes');
    await syncTable(ProjectNoteAttachment, 'project_note_attachments');
    await syncTable(ProjectNoteAudio, 'project_note_audio');
    await syncTable(ProjectEnvVariable, 'project_env_variables');
    await syncTable(ProjectBrandAsset, 'project_brand_assets');
    await syncTable(ProjectMember, 'project_members');
    await syncTable(ProjectClient, 'project_clients');
    await syncTable(CodingTask, 'coding_tasks');
    await syncTable(DeployHook, 'deploy_hooks');

    console.log('');
    console.log('📦 Group 9: Sprite tables');
    await syncTable(ProjectSprite, 'project_sprites');
    await syncTable(SpriteTask, 'sprite_tasks');
    await syncTable(SpriteSession, 'sprite_sessions');
    await syncTable(SpriteMcpServer, 'sprite_mcp_servers');

    console.log('');
    console.log('📦 Group 10: Meeting tables');
    await syncTable(Meeting, 'meetings');
    await syncTable(MeetingParticipant, 'meeting_participants');
    await syncTable(MeetingRoom, 'meeting_rooms');

    console.log('');
    console.log('✅ All missing tables synced!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

main();
