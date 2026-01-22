/**
 * Migration: Add unique constraint on team_conversations (propertyId, isPublic)
 * This ensures only ONE team chat per property, preventing duplicates.
 *
 * Run with: npx ts-node src/migrations/add-unique-property-conversation.ts
 */

import sequelize from '../config/database';

async function addUniquePropertyConversationConstraint() {
  try {
    console.log('🔧 Adding unique constraint for property conversations...');

    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Step 1: Check if constraint already exists
    const [existingConstraints] = await sequelize.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'team_conversations'
      AND constraint_name = 'unique_property_conversation'
    `);

    if ((existingConstraints as any[]).length > 0) {
      console.log('⏭️  Constraint already exists, skipping');
      await sequelize.close();
      process.exit(0);
    }

    // Step 2: Find and merge duplicate conversations
    console.log('🔍 Checking for duplicate property conversations...');

    const [duplicates] = await sequelize.query(`
      SELECT "propertyId", "isPublic", COUNT(*) as count,
             ARRAY_AGG(id ORDER BY "lastMessageAt" DESC NULLS LAST, "createdAt" DESC) as conversation_ids
      FROM team_conversations
      WHERE "propertyId" IS NOT NULL
      GROUP BY "propertyId", "isPublic"
      HAVING COUNT(*) > 1
    `);

    if ((duplicates as any[]).length > 0) {
      console.log(`⚠️  Found ${(duplicates as any[]).length} properties with duplicate conversations`);

      for (const dup of duplicates as any[]) {
        const conversationIds = dup.conversation_ids;
        const keepId = conversationIds[0]; // Keep the one with most recent activity
        const deleteIds = conversationIds.slice(1);

        console.log(`  Property ${dup.propertyId}: keeping ${keepId}, merging ${deleteIds.length} duplicates`);

        // Move messages from duplicate conversations to the kept one
        for (const deleteId of deleteIds) {
          await sequelize.query(`
            UPDATE team_messages
            SET "conversationId" = :keepId
            WHERE "conversationId" = :deleteId
          `, {
            replacements: { keepId, deleteId }
          });

          // Merge participantIds
          await sequelize.query(`
            UPDATE team_conversations
            SET "participantIds" = (
              SELECT ARRAY(
                SELECT DISTINCT unnest("participantIds" ||
                  (SELECT "participantIds" FROM team_conversations WHERE id = :deleteId)
                )
              )
            )
            WHERE id = :keepId
          `, {
            replacements: { keepId, deleteId }
          });
        }

        // Delete the duplicate conversations
        await sequelize.query(`
          DELETE FROM team_conversations
          WHERE id = ANY(:deleteIds)
        `, {
          replacements: { deleteIds }
        });
      }

      console.log('✅ Merged all duplicate conversations');
    } else {
      console.log('✅ No duplicate conversations found');
    }

    // Step 3: Add the unique constraint
    console.log('🔧 Adding unique constraint...');

    await sequelize.query(`
      CREATE UNIQUE INDEX unique_property_conversation
      ON team_conversations ("propertyId", "isPublic")
      WHERE "propertyId" IS NOT NULL
    `);

    console.log('✅ Successfully added unique constraint');

    // Step 4: Recalculate lastMessageAt for merged conversations
    console.log('🔧 Updating conversation metadata...');

    await sequelize.query(`
      UPDATE team_conversations tc
      SET
        "lastMessageAt" = (
          SELECT MAX("createdAt")
          FROM team_messages
          WHERE "conversationId" = tc.id
        ),
        "lastMessagePreview" = (
          SELECT LEFT(content, 200)
          FROM team_messages
          WHERE "conversationId" = tc.id
          ORDER BY "createdAt" DESC
          LIMIT 1
        ),
        "lastMessageSender" = (
          SELECT "senderName"
          FROM team_messages
          WHERE "conversationId" = tc.id
          ORDER BY "createdAt" DESC
          LIMIT 1
        )
      WHERE "propertyId" IS NOT NULL
    `);

    console.log('✅ Migration completed successfully');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addUniquePropertyConversationConstraint();
