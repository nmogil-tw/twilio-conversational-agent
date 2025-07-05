/**
 * Event bus implementation for agent communication
 * Provides structured event handling with pattern matching and async support
 */

import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import type { 
  EventBus, 
  AgentEvent, 
  EventHandler, 
  Logger
} from "./types.js";

/**
 * Event bus configuration
 */
export interface EventBusConfig {
  maxListeners?: number;
  enablePatternMatching?: boolean;
  enableEventHistory?: boolean;
  historyLimit?: number;
}

/**
 * Event statistics for monitoring
 */
export interface EventStats {
  totalEvents: number;
  eventsPerSecond: number;
  averageProcessingTime: number;
  errorCount: number;
  subscriberCount: number;
}

/**
 * In-memory event bus implementation using Node.js EventEmitter
 */
export class InMemoryEventBus extends EventEmitter implements EventBus {
  private patternSubscriptions = new Map<string, Set<EventHandler>>();
  private eventHistory: AgentEvent[] = [];
  private stats = {
    totalEvents: 0,
    errorCount: 0,
    startTime: Date.now(),
    processingTimes: [] as number[]
  };

  constructor(
    private config: EventBusConfig = {},
    private logger?: Logger
  ) {
    super();
    
    // Set max listeners to prevent memory leak warnings
    this.setMaxListeners(config.maxListeners || 100);
    
    // Enable error handling
    this.on('error', (error) => {
      this.stats.errorCount++;
      this.logger?.error('EventBus error', error);
    });
  }

  /**
   * Publish an event to all subscribers
   */
  async publish(event: AgentEvent): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Validate event structure
      this.validateEvent(event);
      
      // Store in history if enabled
      if (this.config.enableEventHistory) {
        this.addToHistory(event);
      }
      
      // Emit to direct subscribers with safe handling
      await this.handleDirectSubscriptions(event);
      
      // Handle pattern subscriptions if enabled
      if (this.config.enablePatternMatching) {
        await this.handlePatternSubscriptions(event);
      }
      
      // Update statistics
      this.updateStats(startTime);
      
      this.logger?.debug(`Published event ${event.type}`, { 
        eventId: event.id, 
        sessionId: event.sessionId 
      });
      
    } catch (error) {
      this.stats.errorCount++;
      this.logger?.error(`Failed to publish event ${event.type}`, error as Error);
      throw error;
    }
  }

  /**
   * Subscribe to events of a specific type
   */
  subscribe(eventType: string, handler: EventHandler): void {
    this.on(eventType, handler);
    this.logger?.debug(`Subscribed to event type: ${eventType}`);
  }

  /**
   * Unsubscribe from events of a specific type
   */
  unsubscribe(eventType: string, handler: EventHandler): void {
    this.off(eventType, handler);
    this.logger?.debug(`Unsubscribed from event type: ${eventType}`);
  }

  /**
   * Subscribe to events matching a pattern (e.g., "conversation.*", "system.agent.*")
   */
  subscribeToPattern(pattern: string, handler: EventHandler): void {
    if (!this.patternSubscriptions.has(pattern)) {
      this.patternSubscriptions.set(pattern, new Set());
    }
    this.patternSubscriptions.get(pattern)!.add(handler);
    this.logger?.debug(`Subscribed to pattern: ${pattern}`);
  }

  /**
   * Unsubscribe from pattern-based events
   */
  unsubscribeFromPattern(pattern: string, handler: EventHandler): void {
    const handlers = this.patternSubscriptions.get(pattern);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.patternSubscriptions.delete(pattern);
      }
    }
    this.logger?.debug(`Unsubscribed from pattern: ${pattern}`);
  }

  /**
   * Get event bus statistics
   */
  getStats(): EventStats {
    const now = Date.now();
    const uptime = (now - this.stats.startTime) / 1000; // seconds
    const eventsPerSecond = this.stats.totalEvents / uptime;
    const averageProcessingTime = this.stats.processingTimes.length > 0
      ? this.stats.processingTimes.reduce((a, b) => a + b, 0) / this.stats.processingTimes.length
      : 0;

    return {
      totalEvents: this.stats.totalEvents,
      eventsPerSecond: Math.round(eventsPerSecond * 100) / 100,
      averageProcessingTime: Math.round(averageProcessingTime * 100) / 100,
      errorCount: this.stats.errorCount,
      subscriberCount: this.listenerCount('*') // approximate
    };
  }

  /**
   * Get recent event history (if enabled)
   */
  getEventHistory(limit?: number): AgentEvent[] {
    if (!this.config.enableEventHistory) {
      return [];
    }
    return limit ? this.eventHistory.slice(-limit) : [...this.eventHistory];
  }

  /**
   * Clear all subscriptions and reset state
   */
  clear(): void {
    this.removeAllListeners();
    this.patternSubscriptions.clear();
    this.eventHistory = [];
    this.resetStats();
    this.logger?.info('EventBus cleared');
  }

  /**
   * Validate event structure
   */
  private validateEvent(event: AgentEvent): void {
    if (!event.id || !event.type || !event.sessionId || !event.timestamp) {
      throw new Error('Invalid event structure: missing required fields');
    }
    
    if (typeof event.data !== 'object') {
      throw new Error('Invalid event structure: data must be an object');
    }
  }

  /**
   * Handle direct subscriptions safely
   */
  private async handleDirectSubscriptions(event: AgentEvent): Promise<void> {
    const listeners = this.listeners(event.type);
    if (listeners.length === 0) {
      return;
    }
    
    const promises: Promise<void>[] = [];
    for (const listener of listeners) {
      promises.push(this.safeCallHandler(listener as EventHandler, event));
    }
    
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Handle pattern-based subscriptions
   */
  private async handlePatternSubscriptions(event: AgentEvent): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [pattern, handlers] of this.patternSubscriptions) {
      if (this.matchesPattern(event.type, pattern)) {
        for (const handler of handlers) {
          promises.push(this.safeCallHandler(handler, event));
        }
      }
    }
    
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Check if event type matches pattern
   */
  private matchesPattern(eventType: string, pattern: string): boolean {
    // Convert glob-style pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')  // Escape dots
      .replace(/\*/g, '.*');  // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(eventType);
  }

  /**
   * Safely call event handler with error handling
   */
  private async safeCallHandler(handler: EventHandler, event: AgentEvent): Promise<void> {
    try {
      const result = handler(event);
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      this.stats.errorCount++;
      this.logger?.error('Event handler error', error as Error, { 
        eventType: event.type, 
        eventId: event.id 
      });
      // Don't rethrow - we don't want one bad handler to break others
    }
  }

  /**
   * Add event to history
   */
  private addToHistory(event: AgentEvent): void {
    this.eventHistory.push(event);
    
    // Trim history if it exceeds limit
    const limit = this.config.historyLimit || 1000;
    if (this.eventHistory.length > limit) {
      this.eventHistory = this.eventHistory.slice(-limit);
    }
  }

  /**
   * Update performance statistics
   */
  private updateStats(startTime: number): void {
    this.stats.totalEvents++;
    
    const processingTime = Date.now() - startTime;
    this.stats.processingTimes.push(processingTime);
    
    // Keep only recent processing times for average calculation
    if (this.stats.processingTimes.length > 100) {
      this.stats.processingTimes = this.stats.processingTimes.slice(-100);
    }
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      totalEvents: 0,
      errorCount: 0,
      startTime: Date.now(),
      processingTimes: []
    };
  }
}

/**
 * Factory function to create event bus instances
 */
export function createEventBus(
  config: EventBusConfig = {}, 
  logger?: Logger
): EventBus {
  return new InMemoryEventBus(config, logger);
}

/**
 * Helper function to create structured events
 */
export function createEvent(
  type: string,
  sessionId: string,
  agentId: string,
  data: Record<string, any>,
  metadata?: Record<string, any>
): AgentEvent {
  return {
    id: uuidv4(),
    type,
    sessionId,
    agentId,
    timestamp: new Date(),
    data,
    metadata
  };
}

/**
 * Common event type constants
 */
export const EventTypes = {
  // Conversation events
  CONVERSATION_START: 'conversation.start',
  CONVERSATION_TURN: 'conversation.turn',
  CONVERSATION_END: 'conversation.end',
  
  // Analysis events
  ANALYSIS_GOVERNANCE: 'analysis.governance',
  ANALYSIS_SUMMARY: 'analysis.summary',
  ANALYSIS_CONTEXT: 'analysis.context',
  
  // System events
  SYSTEM_AGENT_STARTED: 'system.agent.started',
  SYSTEM_AGENT_STOPPED: 'system.agent.stopped',
  SYSTEM_ERROR: 'system.error',
  
  // Tool events
  TOOL_EXECUTION_START: 'tool.execution.start',
  TOOL_EXECUTION_COMPLETE: 'tool.execution.complete',
  TOOL_EXECUTION_ERROR: 'tool.execution.error'
} as const;