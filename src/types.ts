/**
 * Core framework types for the simplified agent architecture
 */

import type { EventEmitter } from "events";

// ===== AGENT FRAMEWORK TYPES =====

/**
 * Generic agent interface that all agents must implement
 */
export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: AgentCapability[];
  
  initialize(context: AgentContext): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  
  handleEvent(event: AgentEvent): Promise<void>;
  getStatus(): AgentStatus;
  getMetrics(): AgentMetrics;
}

/**
 * Agent capabilities that define what an agent can do
 */
export type AgentCapability = 
  | "conversation"      // Can handle conversation turns
  | "analysis"         // Can analyze conversation data  
  | "summarization"    // Can create summaries
  | "governance"       // Can track compliance
  | "tool-execution"   // Can execute tools
  | "context-enrichment" // Can provide context
  | "human-handoff";   // Can facilitate human transfer

/**
 * Agent execution context containing dependencies and configuration
 */
export interface AgentContext {
  readonly sessionId: string;
  readonly eventBus: EventBus;
  readonly config: Configuration;
  readonly logger: Logger;
  readonly services: ServiceRegistry;
}

/**
 * Agent runtime status
 */
export type AgentStatus = 
  | "initializing"
  | "running" 
  | "paused"
  | "stopping"
  | "stopped"
  | "error";

/**
 * Agent performance metrics
 */
export interface AgentMetrics {
  readonly eventsProcessed: number;
  readonly eventsPerSecond: number;
  readonly averageProcessingTime: number;
  readonly errorCount: number;
  readonly lastActivity: Date;
  readonly uptime: number;
}

// ===== EVENT SYSTEM TYPES =====

/**
 * Event bus for agent communication
 */
export interface EventBus extends EventEmitter {
  publish(event: AgentEvent): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
  unsubscribe(eventType: string, handler: EventHandler): void;
  subscribeToPattern(pattern: string, handler: EventHandler): void;
  unsubscribeFromPattern(pattern: string, handler: EventHandler): void;
  getStats(): { totalEvents: number; eventsPerSecond: number; averageProcessingTime: number; errorCount: number; subscriberCount: number };
  getEventHistory(limit?: number): AgentEvent[];
  clear(): void;
}

/**
 * Generic event handler function
 */
export type EventHandler = (event: AgentEvent) => Promise<void> | void;

/**
 * Base agent event structure
 */
export interface AgentEvent {
  readonly id: string;
  readonly type: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly timestamp: Date;
  readonly data: Record<string, any>;
  readonly metadata?: Record<string, any>;
}

/**
 * Specific event types for conversation flow
 */
export interface ConversationEvent extends AgentEvent {
  type: 'conversation.turn' | 'conversation.start' | 'conversation.end';
  data: {
    turnId?: string;
    content?: string;
    role?: 'human' | 'assistant';
    toolCalls?: any[];
  };
}

export interface AnalysisEvent extends AgentEvent {
  type: 'analysis.governance' | 'analysis.summary' | 'analysis.context';
  data: {
    analysisType: string;
    result: any;
    confidence?: number;
  };
}

export interface SystemEvent extends AgentEvent {
  type: 'system.agent.started' | 'system.agent.stopped' | 'system.error';
  data: {
    agentId: string;
    status?: AgentStatus;
    error?: string;
  };
}

// ===== PLUGIN SYSTEM TYPES =====

/**
 * Plugin interface for extending agent functionality
 */
export interface Plugin {
  readonly name: string;
  readonly version: string;
  readonly dependencies: string[];
  
  initialize(context: PluginContext): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * Plugin execution context
 */
export interface PluginContext {
  readonly config: Configuration;
  readonly logger: Logger;
  readonly eventBus: EventBus;
  readonly services: ServiceRegistry;
}

/**
 * Agent plugin that can be registered with the agent framework
 */
export interface AgentPlugin extends Plugin {
  createAgent(config: AgentConfig): Promise<Agent>;
}

/**
 * Tool plugin for extending agent capabilities
 */
export interface ToolPlugin extends Plugin {
  readonly tools: ToolDefinition[];
  executetool(name: string, args: any, context: ToolExecutionContext): Promise<any>;
}

// ===== CONFIGURATION TYPES =====

/**
 * Hierarchical configuration system
 */
export interface Configuration {
  get<T = any>(key: string, defaultValue?: T): T;
  has(key: string): boolean;
  set(key: string, value: any): void;
  getSection(section: string): Record<string, any>;
  watch(key: string, callback: (value: any) => void): void;
  clear(): void;
}

/**
 * Agent-specific configuration
 */
export interface AgentConfig {
  readonly id: string;
  readonly type: string;
  readonly enabled: boolean;
  readonly settings: Record<string, any>;
  readonly dependencies: string[];
}

// ===== SERVICE REGISTRY TYPES =====

/**
 * Service registry for dependency injection
 */
export interface ServiceRegistry {
  register<T>(name: string, factory: ServiceFactory<T>): void;
  registerInstance<T>(name: string, instance: T): void;
  get<T>(name: string): T;
  has(name: string): boolean;
  list(): string[];
  initializeAll(): Promise<Array<{ name: string; success: boolean; error?: Error }>>;
  destroy(): Promise<void>;
  getServiceInfo(name: string): { name: string; hasInstance: boolean; lifecycle: string } | undefined;
}

/**
 * Service factory function
 */
export type ServiceFactory<T> = (registry: ServiceRegistry) => T | Promise<T>;

// ===== TOOL SYSTEM TYPES =====

/**
 * Tool definition for agent capabilities
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: any; // JSON Schema
  readonly category: string;
  readonly capabilities: string[];
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  readonly sessionId: string;
  readonly agentId: string;
  readonly config: Configuration;
  readonly logger: Logger;
  readonly services: ServiceRegistry;
}

// ===== LOGGING TYPES =====

/**
 * Structured logger interface
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, error?: Error, ...args: any[]): void;
  child(context: Record<string, any>): Logger;
}

// ===== COMMON TYPES =====

/**
 * Generic result type for operations that can fail
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Health check status
 */
export interface HealthStatus {
  readonly healthy: boolean;
  readonly timestamp: Date;
  readonly checks: Record<string, boolean>;
  readonly errors?: string[];
}