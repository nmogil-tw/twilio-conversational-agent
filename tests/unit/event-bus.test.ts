/**
 * Unit tests for EventBus implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEventBus, createEvent, EventTypes } from '../../src/event-bus.js';
import type { EventBus, AgentEvent } from '../../src/types.js';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = createEventBus({
      enablePatternMatching: true,
      enableEventHistory: true,
      historyLimit: 100
    });
  });

  afterEach(() => {
    eventBus.clear();
  });

  describe('Event Publishing and Subscription', () => {
    it('should publish and receive events', async () => {
      const handler = vi.fn();
      const testEvent = createEvent(
        'test.event',
        'session-123',
        'agent-1',
        { message: 'hello' }
      );

      eventBus.subscribe('test.event', handler);
      await eventBus.publish(testEvent);

      expect(handler).toHaveBeenCalledWith(testEvent);
    });

    it('should support multiple subscribers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const testEvent = createEvent('test.event', 'session-123', 'agent-1', {});

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);
      await eventBus.publish(testEvent);

      expect(handler1).toHaveBeenCalledWith(testEvent);
      expect(handler2).toHaveBeenCalledWith(testEvent);
    });

    it('should handle unsubscription', async () => {
      const handler = vi.fn();
      const testEvent = createEvent('test.event', 'session-123', 'agent-1', {});

      eventBus.subscribe('test.event', handler);
      eventBus.unsubscribe('test.event', handler);
      await eventBus.publish(testEvent);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Pattern Matching', () => {
    it('should match wildcard patterns', async () => {
      const handler = vi.fn();
      const conversationEvent = createEvent(
        EventTypes.CONVERSATION_TURN,
        'session-123',
        'agent-1',
        { content: 'hello' }
      );

      eventBus.subscribeToPattern('conversation.*', handler);
      await eventBus.publish(conversationEvent);

      expect(handler).toHaveBeenCalledWith(conversationEvent);
    });

    it('should not match non-matching patterns', async () => {
      const handler = vi.fn();
      const systemEvent = createEvent(
        EventTypes.SYSTEM_ERROR,
        'session-123',
        'agent-1',
        { error: 'test error' }
      );

      eventBus.subscribeToPattern('conversation.*', handler);
      await eventBus.publish(systemEvent);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Event History', () => {
    it('should store event history when enabled', async () => {
      const testEvent = createEvent('test.event', 'session-123', 'agent-1', {});
      
      await eventBus.publish(testEvent);
      const history = eventBus.getEventHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        type: 'test.event',
        sessionId: 'session-123',
        agentId: 'agent-1'
      });
    });

    it('should limit history size', async () => {
      const limitedEventBus = createEventBus({
        enableEventHistory: true,
        historyLimit: 2
      });

      // Publish 3 events
      for (let i = 0; i < 3; i++) {
        await limitedEventBus.publish(
          createEvent(`test.event.${i}`, 'session-123', 'agent-1', {})
        );
      }

      const history = limitedEventBus.getEventHistory();
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('test.event.1');
      expect(history[1].type).toBe('test.event.2');
    });
  });

  describe('Error Handling', () => {
    it('should handle handler errors gracefully', async () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const goodHandler = vi.fn();
      const testEvent = createEvent('test.event', 'session-123', 'agent-1', {});

      eventBus.subscribe('test.event', errorHandler);
      eventBus.subscribe('test.event', goodHandler);
      
      await eventBus.publish(testEvent);

      // Good handler should still be called despite error in first handler
      expect(goodHandler).toHaveBeenCalledWith(testEvent);
      
      // Stats should track the error
      const stats = eventBus.getStats();
      expect(stats.errorCount).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should track event statistics', async () => {
      const testEvent = createEvent('test.event', 'session-123', 'agent-1', {});
      
      await eventBus.publish(testEvent);
      const stats = eventBus.getStats();

      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsPerSecond).toBeGreaterThan(0);
      expect(stats.errorCount).toBe(0);
    });
  });
});