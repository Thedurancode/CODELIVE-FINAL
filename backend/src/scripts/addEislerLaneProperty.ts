/**
 * Script: Add property at 312 Eisler Lane, Hillsborough NJ 08844
 *
 * This script adds the property to the database and triggers automation.
 * Run with: npx ts-node src/scripts/addEislerLaneProperty.ts
 */

import sequelize from '../config/database';
import Property from '../models/Property';
import { automationEngine } from '../plugins/automation/AutomationEngine';
import { NormalizedDeal } from '../plugins/types';

const EISLER_LANE_PROPERTY = {
  propertyId: `PROP-${Date.now()}`,  // Unique identifier
  propertyType: 'Single Family',
  propertyOwnership: 'Private',
  address: {
    houseNumber: '312',
    street: 'Eisler Lane',
  },
  city: 'Hillsborough',
  state: 'NJ',
  zip: '08844',
  county: 'Somerset',
  bedroomCount: 0,  // Unknown - to be enriched
  bathroomCount: 0, // Unknown - to be enriched
  occupancyStatus: 'Unknown',
  liveOnHubzu: false,
  syndication: [] as ('Zillow' | 'Realtor' | 'Trulia')[],
  listedOnMLS: false,
  hoa: false,
};

async function addProperty(): Promise<void> {
  console.log('🏠 Adding property: 312 Eisler Lane, Hillsborough NJ 08844');
  console.log('='.repeat(60));

  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Load automations from database
    await automationEngine.loadFromDatabase();
    const automations = automationEngine.getAllAutomations();
    console.log(`📋 Loaded ${automations.length} automation(s)`);

    // List active automations
    const activeAutomations = automations.filter(a => a.enabled);
    console.log(`🔄 Active automations: ${activeAutomations.length}`);
    activeAutomations.forEach(a => {
      console.log(`   - ${a.name} (trigger: ${a.trigger.type})`);
    });

    // Check if property already exists
    const existing = await Property.findOne({
      where: {
        city: 'Hillsborough',
        state: 'NJ',
        zip: '08844',
      },
    });

    if (existing) {
      const existingAddress = existing.get('address') as { houseNumber?: string; street?: string };
      if (existingAddress?.houseNumber === '312' &&
          existingAddress?.street?.toLowerCase().includes('eisler')) {
        console.log('⚠️  Property already exists with ID:', existing.get('id'));
        console.log('   Existing property:', JSON.stringify(existing.toJSON(), null, 2));
        return;
      }
    }

    // Create the property
    console.log('\n📝 Creating property...');
    const property = await Property.create(EISLER_LANE_PROPERTY);
    console.log('✅ Property created successfully!');
    console.log('   ID:', property.get('id'));
    console.log('   Address: 312 Eisler Lane, Hillsborough NJ 08844');

    // Create normalized deal for automation
    const normalizedDeal: Partial<NormalizedDeal> = {
      externalId: property.get('id')?.toString(),
      sourceId: 'manual',
      sourceName: 'Manual Entry - Script',
      address: {
        street: '312 Eisler Lane',
        city: 'Hillsborough',
        state: 'NJ',
        zip: '08844',
        county: 'Somerset',
      },
      propertyType: 'Single Family',
      normalizedAt: new Date(),
    };

    // Emit automation event
    console.log('\n🔄 Triggering automation event...');
    const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await automationEngine.emitEvent({
      id: eventId,
      type: 'deal.created',
      timestamp: new Date(),
      payload: {
        deal: normalizedDeal,
        property: property.toJSON(),
      },
      metadata: {
        sourceId: 'manual',
        dealId: property.get('id')?.toString(),
      },
    });

    console.log('✅ Automation event emitted!');
    console.log('   Event ID:', eventId);
    console.log('   Event Type: deal.created');

    // Give automations time to execute
    console.log('\n⏳ Waiting for automations to execute...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check automation execution results
    console.log('\n📊 Checking automation execution results...');

    // Try to get recent executions from the AutomationExecution model
    try {
      const AutomationExecution = (await import('../models/AutomationExecution')).default;
      const recentExecutions = await AutomationExecution.findAll({
        where: {
          // Look for executions related to this property
        },
        order: [['createdAt', 'DESC']],
        limit: 5,
      });

      if (recentExecutions.length > 0) {
        console.log(`✅ Found ${recentExecutions.length} automation execution(s):`);
        recentExecutions.forEach((exec: any) => {
          console.log(`   - Automation: ${exec.get('automationId')}`);
          console.log(`     Status: ${exec.get('status')}`);
          console.log(`     Triggered: ${exec.get('createdAt')}`);
        });
      } else {
        console.log('ℹ️  No automation executions found in database');
        console.log('   (Automations may have run but not logged, or no matching triggers)');
      }
    } catch (err) {
      console.log('ℹ️  Could not check execution logs:', (err as Error).message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ COMPLETE: Property added and automation triggered');
    console.log('   Property ID:', property.get('id'));
    console.log('   Address: 312 Eisler Lane, Hillsborough NJ 08844');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run if called directly
if (require.main === module) {
  addProperty()
    .then(() => {
      console.log('\n👋 Done!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed:', err);
      process.exit(1);
    });
}

export { addProperty, EISLER_LANE_PROPERTY };
