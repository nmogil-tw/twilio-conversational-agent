/**
 * Integration tests for the complete framework
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createFramework, EventTypes, createEvent } from '../../src/index.js';
import type { Framework } from '../../src/types.js';

describe('Framework Integration', () => {
  let framework: Framework;
  let tempConfigDir: string;

  beforeEach(async () => {
    tempConfigDir = join(process.cwd(), 'test-framework-config');
    mkdirSync(tempConfigDir, { recursive: true });

    // Create minimal test configuration
    writeFileSync(
      join(tempConfigDir, 'defaults.json'),
      JSON.stringify({
        framework: {
          name: 'Test Framework',
          version: '1.0.0'
        },
        agents: {
          primary: {
            model: 'gpt-4o-mini',
            temperature: 0.7
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
  });

  afterEach(async () => {
    if (framework) {
      await framework.destroy();
    }
    rmSync(tempConfigDir, { recursive: true, force: true });
  });

  describe('Framework Initialization', () => {
    it('should initialize all core services', async () => {
      await framework.start();

      // Check that all core services are available
      expect(framework.services.has('eventBus')).toBe(true);
      expect(framework.services.has('config')).toBe(true);
      expect(framework.services.has('logger')).toBe(true);
      expect(framework.services.has('plugins')).toBe(true);

      // Check configuration loading
      expect(framework.config.get('framework.name')).toBe('Test Framework');
      expect(framework.config.get('agents.primary.model')).toBe('gpt-4o-mini');
    });

    it('should provide access to all framework components', () => {
      expect(framework.eventBus).toBeDefined();
      expect(framework.config).toBeDefined();
      expect(framework.services).toBeDefined();
      expect(framework.plugins).toBeDefined();
      expect(framework.logger).toBeDefined();
    });
  });

  describe('Event System Integration', () => {
    beforeEach(async () => {
      await framework.start();
    });

    it('should handle conversation flow events', async () => {
      const events: any[] = [];

      // Subscribe to conversation events
      framework.eventBus.subscribeToPattern('conversation.*', (event) => {
        events.push(event);
      });

      // Simulate conversation flow
      await framework.eventBus.publish(createEvent(
        EventTypes.CONVERSATION_START,
        'test-session',
        'system',
        { content: 'Hello! How can I help?' }
      ));

      await framework.eventBus.publish(createEvent(
        EventTypes.CONVERSATION_TURN,
        'test-session',
        'user',
        { role: 'human', content: 'I need help with my account' }
      ));

      await framework.eventBus.publish(createEvent(
        EventTypes.CONVERSATION_END,
        'test-session',
        'system',
        {}
      ));

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe(EventTypes.CONVERSATION_START);
      expect(events[1].type).toBe(EventTypes.CONVERSATION_TURN);
      expect(events[2].type).toBe(EventTypes.CONVERSATION_END);
    });

    it('should provide event statistics', async () => {
      await framework.eventBus.publish(createEvent(
        'test.event',
        'test-session',
        'test-agent',
        {}
      ));

      const stats = framework.eventBus.getStats();
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.eventsPerSecond).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Configuration Integration', () => {
    beforeEach(async () => {
      await framework.start();
    });

    it('should support runtime configuration changes', async () => {
      // Initial value
      expect(framework.config.get('runtime.test', 'default')).toBe('default');

      // Set runtime value
      framework.config.set('runtime.test', 'updated');
      expect(framework.config.get('runtime.test')).toBe('updated');
    });

    it('should support configuration watching', (done) => {
      framework.config.watch('test.watched', (value) => {
        expect(value).toBe('watched-value');
        done();
      });

      framework.config.set('test.watched', 'watched-value');
    });
  });

  describe('Service Registry Integration', () => {
    beforeEach(async () => {
      await framework.start();
    });

    it('should allow custom service registration', () => {
      const customService = {
        name: 'custom',
        processData: (data: string) => data.toUpperCase()
      };

      framework.services.registerInstance('customService', customService);

      const retrieved = framework.services.get('customService') as typeof customService;
      expect(retrieved.processData('hello')).toBe('HELLO');
    });

    it('should support service factories with dependencies', () => {
      framework.services.register('dependentService', (registry) => {
        const config = registry.get('config');
        const logger = registry.get('logger');
        
        return {
          name: 'dependent',
          config,
          logger
        };
      });

      const service = framework.services.get('dependentService') as any;
      expect(service.name).toBe('dependent');
      expect(service.config).toBe(framework.config);
      expect(service.logger).toBe(framework.logger);
    });
  });

  describe('Plugin System Integration', () => {
    beforeEach(async () => {
      await framework.start();
    });

    it('should support plugin registration', async () => {
      // Mock plugin
      const mockPlugin = {
        name: 'TestPlugin',
        version: '1.0.0',
        dependencies: [],
        async initialize() {},
        async destroy() {},
        async createAgent() {
          return {
            id: 'test-agent',
            name: 'TestAgent',
            version: '1.0.0',
            capabilities: ['test'],
            async initialize() {},
            async start() {},
            async stop() {},
            async destroy() {},
            async handleEvent() {},
            getStatus: () => 'running' as const,
            getMetrics: () => ({
              eventsProcessed: 0,
              eventsPerSecond: 0,
              averageProcessingTime: 0,
              errorCount: 0,
              lastActivity: new Date(),
              uptime: 0
            })
          };
        }
      };

      framework.plugins.registerAgentPlugin(mockPlugin);

      expect(framework.plugins.listAgentPlugins()).toContain('TestPlugin');
    });
  });

  describe('Lifecycle Management', () => {
    it('should handle start/stop/destroy cycle', async () => {
      // Start framework
      await framework.start();
      
      // Verify it's running
      const stats = framework.eventBus.getStats();
      expect(stats).toBeDefined();

      // Stop framework
      await framework.stop();

      // Destroy framework
      await framework.destroy();
      
      // Should not throw errors
    });

    it('should handle multiple start/stop cycles', async () => {
      await framework.start();
      await framework.stop();
      await framework.start();
      await framework.stop();
      
      // Should not throw errors
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await framework.start();
    });

    it('should handle event publishing errors gracefully', async () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });

      framework.eventBus.subscribe('error.test', errorHandler);

      // Should not throw
      await framework.eventBus.publish(createEvent(
        'error.test',
        'test-session',
        'test-agent',
        {}
      ));

      const stats = framework.eventBus.getStats();
      expect(stats.errorCount).toBeGreaterThan(0);
    });

    it('should handle service initialization errors', async () => {
      framework.services.register('errorService', () => {
        throw new Error('Service initialization failed');
      });

      const results = await framework.services.initializeAll();
      const errorResult = results.find(r => r.name === 'errorService');
      
      expect(errorResult?.success).toBe(false);
      expect(errorResult?.error?.message).toBe('Service initialization failed');
    });
  });
});