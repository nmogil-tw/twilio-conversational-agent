/**
 * End-to-end tests simulating real agent interactions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createFramework, EventTypes, createEvent, createPluginContext } from '../../src/index.js';
import { 
  PrimaryAgentPlugin, 
  GovernanceAgentPlugin, 
  SummarizationAgentPlugin,
  createSubconsciousManager 
} from '../../src/agents/index.js';
import type { Framework } from '../../src/types.js';

// Mock OpenAI to avoid real API calls
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async (params) => {
            if (params.stream) {
              // Mock streaming response
              return {
                async *[Symbol.asyncIterator]() {
                  yield {
                    choices: [{
                      delta: { content: 'Hello! ' },
                      finish_reason: null
                    }]
                  };
                  yield {
                    choices: [{
                      delta: { content: 'How can I help you today?' },
                      finish_reason: 'stop'
                    }]
                  };
                }
              };
            } else {
              // Mock non-streaming response
              return {
                choices: [{
                  message: {
                    content: JSON.stringify({
                      summary: 'Customer inquiry about account help',
                      topics: ['account_management', 'general_inquiry'],
                      sentiment: 'neutral',
                      resolution: 'in_progress'
                    })
                  },
                  finish_reason: 'stop'
                }]
              };
            }
          })
        }
      }
    }))
  };
});

describe('Agent Simulation E2E', () => {
  let framework: Framework;
  let tempConfigDir: string;

  beforeEach(async () => {
    tempConfigDir = join(process.cwd(), 'test-e2e-config');
    mkdirSync(tempConfigDir, { recursive: true });

    // Create test configuration
    writeFileSync(
      join(tempConfigDir, 'defaults.json'),
      JSON.stringify({
        framework: {
          name: 'E2E Test Framework'
        },
        agents: {
          primary: {
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 1000
          },
          governance: {
            model: 'gpt-4o-mini',
            frequency: 1000  // Fast for testing
          },
          summarization: {
            model: 'gpt-4o-mini',
            frequency: 1500  // Fast for testing
          }
        },
        integrations: {
          openai: {
            apiKey: 'test-api-key'
          }
        },
        logging: {
          level: 'debug'
        }
      })
    );

    framework = await createFramework({
      configDir: tempConfigDir,
      environment: 'test'
    });

    await framework.start();
  });

  afterEach(async () => {
    if (framework) {
      await framework.destroy();
    }
    rmSync(tempConfigDir, { recursive: true, force: true });
  });

  describe('Complete Conversation Flow', () => {
    it('should handle a full conversation session with all agents', async () => {
      const events: any[] = [];
      const sessionId = 'test-session-123';

      // Track all events
      framework.eventBus.subscribeToPattern('*', (event) => {
        events.push({
          type: event.type,
          sessionId: event.sessionId,
          agentId: event.agentId,
          timestamp: event.timestamp
        });
      });

      // Register agent plugins
      const pluginContext = createPluginContext(
        framework.config,
        framework.logger,
        framework.eventBus,
        framework.services
      );

      const primaryPlugin = new PrimaryAgentPlugin();
      const governancePlugin = new GovernanceAgentPlugin();
      const summarizationPlugin = new SummarizationAgentPlugin();

      await primaryPlugin.initialize(pluginContext);
      await governancePlugin.initialize(pluginContext);
      await summarizationPlugin.initialize(pluginContext);

      framework.plugins.registerAgentPlugin(primaryPlugin);
      framework.plugins.registerAgentPlugin(governancePlugin);
      framework.plugins.registerAgentPlugin(summarizationPlugin);

      // Create agent context
      const agentContext = {
        sessionId,
        eventBus: framework.eventBus,
        config: framework.config,
        logger: framework.logger.child({ sessionId }),
        services: framework.services
      };

      // Create and start primary agent
      const primaryAgent = await framework.plugins.createAgent('PrimaryConversationAgent', {
        id: `primary-${sessionId}`,
        type: 'PrimaryConversationAgent',
        enabled: true,
        settings: {},
        dependencies: []
      });

      await primaryAgent.initialize(agentContext);
      await primaryAgent.start();

      // Create subconscious agents
      const subconsciousManager = createSubconsciousManager(agentContext);

      const governanceAgent = await framework.plugins.createAgent('GovernanceAgent', {
        id: `governance-${sessionId}`,
        type: 'GovernanceAgent',
        enabled: true,
        settings: {},
        dependencies: []
      });

      const summarizationAgent = await framework.plugins.createAgent('SummarizationAgent', {
        id: `summary-${sessionId}`,
        type: 'SummarizationAgent',
        enabled: true,
        settings: {},
        dependencies: []
      });

      await subconsciousManager.registerAgent(governanceAgent as any);
      await subconsciousManager.registerAgent(summarizationAgent as any);
      await subconsciousManager.startAll();

      // Start conversation
      await framework.eventBus.publish(createEvent(
        EventTypes.CONVERSATION_START,
        sessionId,
        'system',
        { content: 'Hello! How can I help you today?' }
      ));

      // Simulate user turns
      await framework.eventBus.publish(createEvent(
        EventTypes.CONVERSATION_TURN,
        sessionId,
        'user',
        { role: 'human', content: 'I need help with my account' }
      ));

      // Wait for agents to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      await framework.eventBus.publish(createEvent(
        EventTypes.CONVERSATION_TURN,
        sessionId,
        'user',
        { role: 'human', content: 'I want to update my billing information' }
      ));

      // Wait for more processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // End conversation
      await framework.eventBus.publish(createEvent(
        EventTypes.CONVERSATION_END,
        sessionId,
        'system',
        {}
      ));

      // Cleanup
      await primaryAgent.stop();
      await subconsciousManager.stopAll();

      // Verify events occurred
      const conversationEvents = events.filter(e => e.type.startsWith('conversation.'));
      const analysisEvents = events.filter(e => e.type.startsWith('analysis.'));

      expect(conversationEvents.length).toBeGreaterThan(0);
      expect(analysisEvents.length).toBeGreaterThan(0);

      // Verify all events have correct session ID
      events.forEach(event => {
        expect(event.sessionId).toBe(sessionId);
      });
    }, 15000); // Extended timeout for complex test
  });

  describe('Agent Coordination', () => {
    it('should coordinate between primary and subconscious agents', async () => {
      const analysisResults: any[] = [];
      const sessionId = 'coordination-test';

      // Track analysis events
      framework.eventBus.subscribeToPattern('analysis.*', (event) => {
        analysisResults.push({
          type: event.type,
          data: event.data
        });
      });

      // Register plugins and create agents (simplified setup)
      const pluginContext = createPluginContext(
        framework.config,
        framework.logger,
        framework.eventBus,
        framework.services
      );

      const summarizationPlugin = new SummarizationAgentPlugin();
      await summarizationPlugin.initialize(pluginContext);
      framework.plugins.registerAgentPlugin(summarizationPlugin);

      const agentContext = {
        sessionId,
        eventBus: framework.eventBus,
        config: framework.config,
        logger: framework.logger.child({ sessionId }),
        services: framework.services
      };

      const summarizationAgent = await framework.plugins.createAgent('SummarizationAgent', {
        id: `summary-${sessionId}`,
        type: 'SummarizationAgent',
        enabled: true,
        settings: {},
        dependencies: []
      });

      const subconsciousManager = createSubconsciousManager(agentContext);
      await subconsciousManager.registerAgent(summarizationAgent as any);
      await subconsciousManager.startAll();

      // Simulate conversation
      await framework.eventBus.publish(createEvent(
        EventTypes.CONVERSATION_TURN,
        sessionId,
        'user',
        { role: 'human', content: 'I have a billing question about my account' }
      ));

      await framework.eventBus.publish(createEvent(
        EventTypes.CONVERSATION_TURN,
        sessionId,
        'assistant',
        { role: 'assistant', content: 'I can help you with billing questions. What specifically would you like to know?' }
      ));

      // Wait for analysis
      await new Promise(resolve => setTimeout(resolve, 2500));

      await subconsciousManager.stopAll();

      // Verify analysis occurred
      expect(analysisResults.length).toBeGreaterThan(0);
      
      const summaryAnalysis = analysisResults.find(r => r.type === 'analysis.summarization');
      expect(summaryAnalysis).toBeDefined();
      expect(summaryAnalysis.data.result.topics).toContain('account_management');
    }, 10000);
  });

  describe('Error Recovery', () => {
    it('should handle agent errors gracefully', async () => {
      const errors: any[] = [];
      const sessionId = 'error-test';

      // Track system errors
      framework.eventBus.subscribe(EventTypes.SYSTEM_ERROR, (event) => {
        errors.push(event.data);
      });

      // Simulate an error condition by publishing malformed events
      await framework.eventBus.publish({
        id: 'malformed-event',
        type: 'invalid.event.type',
        sessionId,
        agentId: 'test',
        timestamp: new Date(),
        data: { malformed: true }
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Framework should still be responsive
      const stats = framework.eventBus.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalEvents).toBeGreaterThan(0);
    });
  });

  describe('Performance and Metrics', () => {
    it('should track agent performance metrics', async () => {
      const sessionId = 'metrics-test';

      // Create a simple agent for metrics testing
      const pluginContext = createPluginContext(
        framework.config,
        framework.logger,
        framework.eventBus,
        framework.services
      );

      const primaryPlugin = new PrimaryAgentPlugin();
      await primaryPlugin.initialize(pluginContext);
      framework.plugins.registerAgentPlugin(primaryPlugin);

      const agentContext = {
        sessionId,
        eventBus: framework.eventBus,
        config: framework.config,
        logger: framework.logger.child({ sessionId }),
        services: framework.services
      };

      const primaryAgent = await framework.plugins.createAgent('PrimaryConversationAgent', {
        id: `primary-${sessionId}`,
        type: 'PrimaryConversationAgent',
        enabled: true,
        settings: {},
        dependencies: []
      });

      await primaryAgent.initialize(agentContext);
      await primaryAgent.start();

      // Process some events
      for (let i = 0; i < 5; i++) {
        await primaryAgent.handleEvent(createEvent(
          EventTypes.CONVERSATION_TURN,
          sessionId,
          'user',
          { role: 'human', content: `Message ${i + 1}` }
        ));
      }

      await primaryAgent.stop();

      // Check metrics
      const metrics = primaryAgent.getMetrics();
      expect(metrics.eventsProcessed).toBe(5);
      expect(metrics.uptime).toBeGreaterThan(0);
      expect(metrics.averageProcessingTime).toBeGreaterThanOrEqual(0);

      // Check event bus stats
      const eventStats = framework.eventBus.getStats();
      expect(eventStats.totalEvents).toBeGreaterThan(0);
      expect(eventStats.eventsPerSecond).toBeGreaterThanOrEqual(0);
    });
  });
});