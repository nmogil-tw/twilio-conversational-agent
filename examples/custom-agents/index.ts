/**
 * Custom Agent Example
 * Shows how to create and register custom agents
 */

import { 
  createFramework, 
  createEvent, 
  EventTypes,
  BaseAgent,
  BaseAgentPlugin,
  type AgentConfig,
  type AgentEvent,
  type PluginContext
} from '../../src/index.js';

// Custom agent that responds to greetings
class GreetingAgent extends BaseAgent {
  async processEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'conversation.turn' && event.data.role === 'human') {
      const content = event.data.content.toLowerCase();
      
      if (content.includes('hello') || content.includes('hi')) {
        // Respond with a greeting
        await this.eventBus.publish(createEvent(
          'conversation.response',
          event.sessionId,
          this.id,
          { 
            content: `Hello! I'm the greeting agent. Nice to meet you!`,
            agentType: 'greeting'
          }
        ));
        
        this.updateMetrics({ eventsProcessed: this.metrics.eventsProcessed + 1 });
      }
    }
  }
}

// Plugin to create greeting agents
class GreetingAgentPlugin extends BaseAgentPlugin {
  name = 'GreetingAgent';
  version = '1.0.0';
  
  async createAgent(config: AgentConfig): Promise<GreetingAgent> {
    return new GreetingAgent(config, this.context);
  }
}

async function customAgentExample() {
  console.log('🤖 Starting Custom Agent Example\n');

  // Create framework
  const framework = await createFramework({
    configDir: './config',
    environment: 'development'
  });

  await framework.start();

  // Register custom plugin
  const plugin = new GreetingAgentPlugin();
  await plugin.initialize({
    config: framework.config,
    logger: framework.logger,
    eventBus: framework.eventBus,
    services: framework.services
  });
  
  framework.plugins.registerAgentPlugin(plugin);
  console.log('✅ Custom plugin registered\n');

  // Create custom agent instance
  const greetingAgent = await framework.plugins.createAgent('GreetingAgent', {
    id: 'greeting-1',
    type: 'GreetingAgent',
    enabled: true,
    settings: {},
    dependencies: []
  });

  await greetingAgent.initialize({
    sessionId: 'custom-example',
    eventBus: framework.eventBus,
    config: framework.config,
    logger: framework.logger,
    services: framework.services
  });

  await greetingAgent.start();
  console.log('✅ Custom agent started\n');

  // Set up event monitoring
  framework.eventBus.subscribe('conversation.response', (event) => {
    console.log(`🎯 Agent Response: "${event.data.content}"`);
    console.log(`   From: ${event.data.agentType} agent\n`);
  });

  // Test the custom agent
  console.log('💬 Testing custom agent...\n');

  await framework.eventBus.publish(createEvent(
    EventTypes.CONVERSATION_TURN,
    'custom-example',
    'user',
    { 
      role: 'human',
      content: 'Hello there!' 
    }
  ));

  await framework.eventBus.publish(createEvent(
    EventTypes.CONVERSATION_TURN,
    'custom-example', 
    'user',
    { 
      role: 'human',
      content: 'How are you doing?' 
    }
  ));

  await framework.eventBus.publish(createEvent(
    EventTypes.CONVERSATION_TURN,
    'custom-example',
    'user', 
    { 
      role: 'human',
      content: 'Hi everyone!' 
    }
  ));

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Show agent metrics
  const metrics = greetingAgent.getMetrics();
  console.log('📊 Custom Agent Metrics:');
  console.log(`   Events Processed: ${metrics.eventsProcessed}`);
  console.log(`   Uptime: ${metrics.uptime.toFixed(2)}s`);
  console.log(`   Status: ${greetingAgent.getStatus()}\n`);

  // Cleanup
  await greetingAgent.stop();
  await framework.stop();
  await framework.destroy();

  console.log('✅ Custom agent example completed!');
}

// Run example
customAgentExample().catch(console.error);