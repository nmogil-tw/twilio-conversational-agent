/**
 * Basic usage example of the Twilio Agent Framework
 * This demonstrates the minimal setup needed to get started
 */

import { createFramework, createEvent, EventTypes } from '../../src/index.js';

async function basicExample() {
  console.log('🚀 Starting Basic Framework Example\n');

  // Create framework instance
  const framework = await createFramework({
    configDir: './config',
    environment: 'development'
  });

  // Start framework
  await framework.start();
  console.log('✅ Framework started\n');

  // Subscribe to events
  framework.eventBus.subscribe('conversation.turn', (event) => {
    console.log(`📝 Conversation Turn: "${event.data.content}"`);
  });

  framework.eventBus.subscribeToPattern('system.*', (event) => {
    console.log(`⚙️  System Event: ${event.type}`);
  });

  // Simulate a conversation
  console.log('💬 Simulating conversation...\n');

  await framework.eventBus.publish(createEvent(
    EventTypes.CONVERSATION_START,
    'example-session',
    'system',
    { content: 'Welcome! How can I help you today?' }
  ));

  await framework.eventBus.publish(createEvent(
    EventTypes.CONVERSATION_TURN,
    'example-session',
    'user',
    { content: 'I need help with my account' }
  ));

  await framework.eventBus.publish(createEvent(
    EventTypes.CONVERSATION_TURN,
    'example-session',
    'assistant', 
    { content: 'I\'d be happy to help you with your account. What specific issue are you experiencing?' }
  ));

  // Wait a moment to see events process
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Show statistics
  const stats = framework.eventBus.getStats();
  console.log('\n📊 Framework Statistics:');
  console.log(`   Total Events: ${stats.totalEvents}`);
  console.log(`   Events/Second: ${stats.eventsPerSecond}`);
  console.log(`   Error Count: ${stats.errorCount}\n`);

  // Clean shutdown
  await framework.stop();
  await framework.destroy();
  
  console.log('✅ Example completed successfully!');
}

// Run example
basicExample().catch(console.error);