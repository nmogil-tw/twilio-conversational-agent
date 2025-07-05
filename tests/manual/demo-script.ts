/**
 * Manual testing demo script
 * Run this to see the framework in action with real interactions
 */

import {
  createFramework,
  createPluginContext,
  EventTypes,
  createEvent,
  LogLevel
} from '../../src/index.js';
import {
  PrimaryAgentPlugin,
  GovernanceAgentPlugin,
  SummarizationAgentPlugin,
  createSubconsciousManager
} from '../../src/agents/index.js';
import type { Framework } from '../../src/types.js';

class DemoRunner {
  private framework?: Framework;
  private sessionId = `demo-${Date.now()}`;
  private agents: any[] = [];

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Demo Framework...\n');

    // Create framework with demo configuration
    this.framework = await createFramework({
      configDir: './config',
      environment: 'development',
      enableHotReload: false,
      enableStructuredLogging: false
    });

    // Set demo configuration
    this.framework.config.set('integrations.openai.apiKey', process.env.OPENAI_API_KEY || 'demo-key');
    this.framework.config.set('agents.primary.model', 'gpt-4o-mini');
    this.framework.config.set('agents.governance.frequency', 3000);
    this.framework.config.set('agents.summarization.frequency', 5000);

    await this.framework.start();

    this.setupEventMonitoring();
    await this.registerPlugins();

    console.log('✅ Framework initialized successfully\n');
  }

  private setupEventMonitoring(): void {
    if (!this.framework) return;

    console.log('📊 Setting up event monitoring...\n');

    // Monitor conversation events
    this.framework.eventBus.subscribeToPattern('conversation.*', (event) => {
      console.log(`🗣️  [CONVERSATION] ${event.type}`);
      if (event.data.content) {
        console.log(`   Content: "${event.data.content}"`);
      }
      console.log(`   Session: ${event.sessionId}, Agent: ${event.agentId}\n`);
    });

    // Monitor analysis events
    this.framework.eventBus.subscribeToPattern('analysis.*', (event) => {
      console.log(`🔍 [ANALYSIS] ${event.type}`);
      console.log(`   Confidence: ${event.data.confidence || 'N/A'}`);
      if (event.data.result?.topics) {
        console.log(`   Topics: ${event.data.result.topics.join(', ')}`);
      }
      if (event.data.result?.rating) {
        console.log(`   Rating: ${event.data.result.rating}/5`);
      }
      console.log();
    });

    // Monitor system events
    this.framework.eventBus.subscribeToPattern('system.*', (event) => {
      if (event.type === 'system.error') {
        console.log(`❌ [ERROR] ${event.data.error}`);
      } else {
        console.log(`⚙️  [SYSTEM] ${event.type} - Agent: ${event.data.agentId}`);
      }
      console.log();
    });

    // Monitor tool execution
    this.framework.eventBus.subscribeToPattern('tool.*', (event) => {
      console.log(`🔧 [TOOL] ${event.type}`);
      if (event.data.toolName) {
        console.log(`   Tool: ${event.data.toolName}`);
      }
      console.log();
    });
  }

  private async registerPlugins(): Promise<void> {
    if (!this.framework) return;

    console.log('🔌 Registering agent plugins...\n');

    const pluginContext = createPluginContext(
      this.framework.config,
      this.framework.logger,
      this.framework.eventBus,
      this.framework.services
    );

    // Register plugins
    const primaryPlugin = new PrimaryAgentPlugin();
    const governancePlugin = new GovernanceAgentPlugin();
    const summarizationPlugin = new SummarizationAgentPlugin();

    await primaryPlugin.initialize(pluginContext);
    await governancePlugin.initialize(pluginContext);
    await summarizationPlugin.initialize(pluginContext);

    this.framework.plugins.registerAgentPlugin(primaryPlugin);
    this.framework.plugins.registerAgentPlugin(governancePlugin);
    this.framework.plugins.registerAgentPlugin(summarizationPlugin);

    console.log('✅ Plugins registered successfully\n');
  }

  async startConversationSession(): Promise<void> {
    if (!this.framework) return;

    console.log(`🎬 Starting conversation session: ${this.sessionId}\n`);

    const agentContext = {
      sessionId: this.sessionId,
      eventBus: this.framework.eventBus,
      config: this.framework.config,
      logger: this.framework.logger.child({ sessionId: this.sessionId }),
      services: this.framework.services
    };

    // Create primary agent
    try {
      const primaryAgent = await this.framework.plugins.createAgent('PrimaryConversationAgent', {
        id: `primary-${this.sessionId}`,
        type: 'PrimaryConversationAgent',
        enabled: true,
        settings: {},
        dependencies: []
      });

      await primaryAgent.initialize(agentContext);
      await primaryAgent.start();
      this.agents.push(primaryAgent);

      console.log('✅ Primary conversation agent started\n');
    } catch (error) {
      console.log('⚠️  Primary agent creation failed (OpenAI API key needed for full demo)');
      console.log('   Continuing with event flow demonstration...\n');
    }

    // Create subconscious agents
    const subconsciousManager = createSubconsciousManager(agentContext);

    try {
      const governanceAgent = await this.framework.plugins.createAgent('GovernanceAgent', {
        id: `governance-${this.sessionId}`,
        type: 'GovernanceAgent',
        enabled: true,
        settings: {},
        dependencies: []
      });

      const summarizationAgent = await this.framework.plugins.createAgent('SummarizationAgent', {
        id: `summary-${this.sessionId}`,
        type: 'SummarizationAgent',
        enabled: true,
        settings: {},
        dependencies: []
      });

      await subconsciousManager.registerAgent(governanceAgent as any);
      await subconsciousManager.registerAgent(summarizationAgent as any);
      await subconsciousManager.startAll();

      this.agents.push(subconsciousManager);
      console.log('✅ Subconscious agents started\n');
    } catch (error) {
      console.log('⚠️  Subconscious agents creation failed (OpenAI API key needed)');
      console.log('   Continuing with event flow demonstration...\n');
    }

    // Start conversation
    await this.framework.eventBus.publish(createEvent(
      EventTypes.CONVERSATION_START,
      this.sessionId,
      'system',
      { content: 'Hello! How can I help you today?' }
    ));
  }

  async simulateConversation(): Promise<void> {
    if (!this.framework) return;

    console.log('💬 Simulating conversation turns...\n');

    const conversationTurns = [
      { role: 'human', content: 'Hi, I need help with my account' },
      { role: 'assistant', content: 'I\'d be happy to help you with your account. What specific issue are you experiencing?' },
      { role: 'human', content: 'I want to update my billing information' },
      { role: 'assistant', content: 'I can help you update your billing information. For security purposes, I\'ll need to verify your identity first.' },
      { role: 'human', content: 'Sure, what do you need?' },
      { role: 'assistant', content: 'Can you please provide me with the email address associated with your account?' },
      { role: 'human', content: 'It\'s john.doe@email.com' },
      { role: 'assistant', content: 'Thank you. I\'ve located your account. Now I can help you update your billing information. What would you like to change?' }
    ];

    for (let i = 0; i < conversationTurns.length; i++) {
      const turn = conversationTurns[i];
      
      console.log(`💭 Turn ${i + 1}: ${turn.role} says "${turn.content}"`);
      
      await this.framework.eventBus.publish(createEvent(
        EventTypes.CONVERSATION_TURN,
        this.sessionId,
        turn.role === 'human' ? 'user' : 'assistant',
        {
          role: turn.role,
          content: turn.content,
          turnId: `turn-${i + 1}`
        }
      ));

      // Wait between turns to see processing
      await this.wait(2000);
    }

    console.log('\n⏳ Waiting for background analysis to complete...\n');
    await this.wait(8000);
  }

  async demonstrateFrameworkFeatures(): Promise<void> {
    if (!this.framework) return;

    console.log('📈 Framework Statistics:\n');

    // Event bus statistics
    const eventStats = this.framework.eventBus.getStats();
    console.log('📊 Event Bus Stats:');
    console.log(`   Total Events: ${eventStats.totalEvents}`);
    console.log(`   Events/Second: ${eventStats.eventsPerSecond.toFixed(2)}`);
    console.log(`   Average Processing Time: ${eventStats.averageProcessingTime.toFixed(2)}ms`);
    console.log(`   Error Count: ${eventStats.errorCount}`);
    console.log();

    // Service registry
    const services = this.framework.services.list();
    console.log('🏗️  Registered Services:');
    services.forEach(service => {
      console.log(`   - ${service}`);
    });
    console.log();

    // Plugin registry
    const agentPlugins = this.framework.plugins.listAgentPlugins();
    console.log('🔌 Agent Plugins:');
    agentPlugins.forEach(plugin => {
      console.log(`   - ${plugin}`);
    });
    console.log();

    // Configuration
    console.log('⚙️  Configuration Sample:');
    console.log(`   Framework Name: ${this.framework.config.get('framework.name', 'Unknown')}`);
    console.log(`   Primary Model: ${this.framework.config.get('agents.primary.model', 'Unknown')}`);
    console.log(`   Environment: ${this.framework.config.get('framework.environment', 'Unknown')}`);
    console.log();

    // Agent metrics (if agents are running)
    if (this.agents.length > 0) {
      console.log('🤖 Agent Metrics:');
      this.agents.forEach((agent, index) => {
        if (agent.getMetrics) {
          const metrics = agent.getMetrics();
          console.log(`   Agent ${index + 1}:`);
          console.log(`     Events Processed: ${metrics.eventsProcessed}`);
          console.log(`     Uptime: ${metrics.uptime.toFixed(2)}s`);
          console.log(`     Status: ${agent.getStatus()}`);
        }
      });
      console.log();
    }
  }

  async endConversation(): Promise<void> {
    if (!this.framework) return;

    console.log('🏁 Ending conversation session...\n');

    await this.framework.eventBus.publish(createEvent(
      EventTypes.CONVERSATION_END,
      this.sessionId,
      'system',
      {}
    ));

    // Stop agents
    for (const agent of this.agents) {
      try {
        if (agent.stop) {
          await agent.stop();
        }
        if (agent.stopAll) {
          await agent.stopAll();
        }
      } catch (error) {
        console.log(`⚠️  Error stopping agent: ${error}`);
      }
    }

    console.log('✅ Conversation ended and agents stopped\n');
  }

  async cleanup(): Promise<void> {
    if (!this.framework) return;

    console.log('🧹 Cleaning up framework...\n');

    await this.framework.stop();
    await this.framework.destroy();

    console.log('✅ Framework cleanup complete\n');
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runFullDemo(): Promise<void> {
    try {
      console.log('🎭 AGENT FRAMEWORK DEMO\n');
      console.log('='.repeat(50) + '\n');

      await this.initialize();
      await this.startConversationSession();
      await this.simulateConversation();
      await this.demonstrateFrameworkFeatures();
      await this.endConversation();
      await this.cleanup();

      console.log('🎉 Demo completed successfully!');
      console.log('\nTo run with full AI capabilities, set OPENAI_API_KEY environment variable.');
      
    } catch (error) {
      console.error('❌ Demo failed:', error);
      
      if (this.framework) {
        await this.cleanup();
      }
      
      process.exit(1);
    }
  }
}

// Performance benchmark
async function runPerformanceBenchmark(): Promise<void> {
  console.log('\n🏃 Running Performance Benchmark...\n');

  const framework = await createFramework({
    environment: 'test'
  });

  await framework.start();

  const startTime = Date.now();
  const eventCount = 1000;

  // Publish many events
  for (let i = 0; i < eventCount; i++) {
    await framework.eventBus.publish(createEvent(
      'benchmark.event',
      'benchmark-session',
      'benchmark-agent',
      { index: i }
    ));
  }

  const endTime = Date.now();
  const duration = endTime - startTime;
  const eventsPerSecond = (eventCount / duration) * 1000;

  console.log(`📊 Benchmark Results:`);
  console.log(`   Events: ${eventCount}`);
  console.log(`   Duration: ${duration}ms`);
  console.log(`   Rate: ${eventsPerSecond.toFixed(2)} events/second`);

  const stats = framework.eventBus.getStats();
  console.log(`   Actual Events/Second: ${stats.eventsPerSecond.toFixed(2)}`);
  console.log(`   Average Processing Time: ${stats.averageProcessingTime.toFixed(2)}ms`);

  await framework.destroy();
}

// Main execution
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--benchmark')) {
    await runPerformanceBenchmark();
  } else {
    const demo = new DemoRunner();
    await demo.runFullDemo();
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { DemoRunner, runPerformanceBenchmark, main };