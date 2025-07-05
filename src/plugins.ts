/**
 * Plugin system for extending agent framework functionality
 * Provides base classes and utilities for creating agent and tool plugins
 */

import type {
  Agent,
  AgentPlugin,
  ToolPlugin,
  Plugin,
  PluginContext,
  AgentContext,
  AgentConfig,
  ToolDefinition,
  ToolExecutionContext,
  EventBus,
  Configuration,
  ServiceRegistry,
  Logger,
  AgentStatus,
  AgentMetrics,
  AgentCapability,
  AgentEvent
} from "./types.js";

/**
 * Plugin registry for managing installed plugins
 */
export interface PluginRegistry {
  registerAgentPlugin(plugin: AgentPlugin): void;
  registerToolPlugin(plugin: ToolPlugin): void;
  getAgentPlugin(name: string): AgentPlugin | undefined;
  getToolPlugin(name: string): ToolPlugin | undefined;
  listAgentPlugins(): string[];
  listToolPlugins(): string[];
  createAgent(type: string, config: AgentConfig): Promise<Agent>;
  getAvailableTools(): ToolDefinition[];
  executeTool(name: string, args: any, context: ToolExecutionContext): Promise<any>;
}

/**
 * Base plugin implementation
 */
export abstract class BasePlugin implements Plugin {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly dependencies: string[];

  protected context?: PluginContext;
  protected initialized = false;

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    this.initialized = true;
    this.context.logger.info(`Plugin initialized: ${this.name} v${this.version}`);
  }

  async destroy(): Promise<void> {
    this.initialized = false;
    this.context?.logger.info(`Plugin destroyed: ${this.name}`);
  }

  protected ensureInitialized(): void {
    if (!this.initialized || !this.context) {
      throw new Error(`Plugin ${this.name} is not initialized`);
    }
  }
}

/**
 * Base agent implementation with common functionality
 */
export abstract class BaseAgent implements Agent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly capabilities: AgentCapability[];

  protected context?: AgentContext;
  protected status: AgentStatus = "initializing";
  private _metrics = {
    eventsProcessed: 0,
    eventsPerSecond: 0,
    averageProcessingTime: 0,
    errorCount: 0,
    lastActivity: new Date(),
    uptime: 0
  };
  protected startTime = Date.now();

  async initialize(context: AgentContext): Promise<void> {
    this.context = context;
    this.status = "initializing";
    
    // Subscribe to relevant events
    await this.setupEventSubscriptions();
    
    this.status = "running";
    this.context.logger.info(`Agent initialized: ${this.name} (${this.id})`);
  }

  async start(): Promise<void> {
    this.ensureInitialized();
    this.status = "running";
    this.context!.logger.info(`Agent started: ${this.name}`);
  }

  async stop(): Promise<void> {
    this.ensureInitialized();
    this.status = "stopping";
    
    // Cleanup subscriptions
    await this.cleanupEventSubscriptions();
    
    this.status = "stopped";
    this.context!.logger.info(`Agent stopped: ${this.name}`);
  }

  async destroy(): Promise<void> {
    await this.stop();
    this.context!.logger.info(`Agent destroyed: ${this.name}`);
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getMetrics(): AgentMetrics {
    const now = Date.now();
    const uptime = (now - this.startTime) / 1000; // seconds
    
    return {
      ...this._metrics,
      uptime,
      eventsPerSecond: this._metrics.eventsProcessed / Math.max(uptime, 1)
    };
  }

  async handleEvent(event: AgentEvent): Promise<void> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    try {
      await this.processEvent(event);
      this.updateMetrics(startTime, false);
    } catch (error) {
      this.updateMetrics(startTime, true);
      this.context!.logger.error(`Agent event processing error: ${this.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Abstract method for processing events - must be implemented by subclasses
   */
  protected abstract processEvent(event: AgentEvent): Promise<void>;

  /**
   * Setup event subscriptions - can be overridden by subclasses
   */
  protected async setupEventSubscriptions(): Promise<void> {
    // Default implementation - subclasses can override
  }

  /**
   * Cleanup event subscriptions - can be overridden by subclasses
   */
  protected async cleanupEventSubscriptions(): Promise<void> {
    // Default implementation - subclasses can override
  }

  protected ensureInitialized(): void {
    if (!this.context || this.status === "initializing") {
      throw new Error(`Agent ${this.name} is not initialized`);
    }
  }

  protected updateMetrics(startTime: number, isError: boolean): void {
    this._metrics.eventsProcessed++;
    this._metrics.lastActivity = new Date();
    
    if (isError) {
      this._metrics.errorCount++;
    }
    
    const processingTime = Date.now() - startTime;
    this._metrics.averageProcessingTime = 
      (this._metrics.averageProcessingTime + processingTime) / 2;
  }

  /**
   * Helper to publish events
   */
  protected async publishEvent(type: string, data: Record<string, any>): Promise<void> {
    if (!this.context) return;
    
    const event: AgentEvent = {
      id: `${this.id}-${Date.now()}`,
      type,
      sessionId: this.context.sessionId,
      agentId: this.id,
      timestamp: new Date(),
      data
    };
    
    await this.context.eventBus.publish(event);
  }
}

/**
 * Base agent plugin implementation
 */
export abstract class BaseAgentPlugin extends BasePlugin implements AgentPlugin {
  abstract createAgent(config: AgentConfig): Promise<Agent>;
}

/**
 * Base tool plugin implementation
 */
export abstract class BaseToolPlugin extends BasePlugin implements ToolPlugin {
  abstract readonly tools: ToolDefinition[];

  async executetool(name: string, args: any, context: ToolExecutionContext): Promise<any> {
    this.ensureInitialized();
    
    const tool = this.tools.find(t => t.name === name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found in plugin '${this.name}'`);
    }

    return this.executeToolImplementation(tool, args, context);
  }

  /**
   * Abstract method for tool execution - must be implemented by subclasses
   */
  protected abstract executeToolImplementation(
    tool: ToolDefinition, 
    args: any, 
    context: ToolExecutionContext
  ): Promise<any>;
}

/**
 * Plugin registry implementation
 */
export class DefaultPluginRegistry implements PluginRegistry {
  private agentPlugins = new Map<string, AgentPlugin>();
  private toolPlugins = new Map<string, ToolPlugin>();

  constructor(private logger?: Logger) {}

  registerAgentPlugin(plugin: AgentPlugin): void {
    if (this.agentPlugins.has(plugin.name)) {
      this.logger?.warn(`Agent plugin '${plugin.name}' is being re-registered`);
    }
    
    this.agentPlugins.set(plugin.name, plugin);
    this.logger?.info(`Agent plugin registered: ${plugin.name} v${plugin.version}`);
  }

  registerToolPlugin(plugin: ToolPlugin): void {
    if (this.toolPlugins.has(plugin.name)) {
      this.logger?.warn(`Tool plugin '${plugin.name}' is being re-registered`);
    }
    
    this.toolPlugins.set(plugin.name, plugin);
    this.logger?.info(`Tool plugin registered: ${plugin.name} v${plugin.version}`);
  }

  getAgentPlugin(name: string): AgentPlugin | undefined {
    return this.agentPlugins.get(name);
  }

  getToolPlugin(name: string): ToolPlugin | undefined {
    return this.toolPlugins.get(name);
  }

  listAgentPlugins(): string[] {
    return Array.from(this.agentPlugins.keys()).sort();
  }

  listToolPlugins(): string[] {
    return Array.from(this.toolPlugins.keys()).sort();
  }

  async createAgent(type: string, config: AgentConfig): Promise<Agent> {
    const plugin = this.agentPlugins.get(type);
    if (!plugin) {
      throw new Error(`No agent plugin found for type: ${type}`);
    }

    return plugin.createAgent(config);
  }

  getAvailableTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    
    for (const plugin of this.toolPlugins.values()) {
      tools.push(...plugin.tools);
    }
    
    return tools;
  }

  async executeTool(name: string, args: any, context: ToolExecutionContext): Promise<any> {
    // Find the plugin that provides this tool
    for (const plugin of this.toolPlugins.values()) {
      const tool = plugin.tools.find(t => t.name === name);
      if (tool) {
        return plugin.executetool(name, args, context);
      }
    }
    
    throw new Error(`No tool plugin found that provides tool: ${name}`);
  }
}

/**
 * Plugin loader for discovering and loading plugins
 */
export class PluginLoader {
  constructor(
    private registry: PluginRegistry,
    private logger?: Logger
  ) {}

  /**
   * Load and initialize a plugin
   */
  async loadPlugin(plugin: Plugin, context: PluginContext): Promise<void> {
    try {
      await plugin.initialize(context);
      
      if ('createAgent' in plugin) {
        this.registry.registerAgentPlugin(plugin as AgentPlugin);
      } else if ('tools' in plugin) {
        this.registry.registerToolPlugin(plugin as ToolPlugin);
      }
      
      this.logger?.info(`Plugin loaded successfully: ${plugin.name}`);
      
    } catch (error) {
      this.logger?.error(`Failed to load plugin: ${plugin.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Load multiple plugins
   */
  async loadPlugins(plugins: Plugin[], context: PluginContext): Promise<void> {
    for (const plugin of plugins) {
      await this.loadPlugin(plugin, context);
    }
  }
}

/**
 * Factory functions
 */
export function createPluginRegistry(logger?: Logger): PluginRegistry {
  return new DefaultPluginRegistry(logger);
}

export function createPluginLoader(registry: PluginRegistry, logger?: Logger): PluginLoader {
  return new PluginLoader(registry, logger);
}

/**
 * Helper function to create plugin context
 */
export function createPluginContext(
  config: Configuration,
  logger: Logger,
  eventBus: EventBus,
  services: ServiceRegistry
): PluginContext {
  return {
    config,
    logger,
    eventBus,
    services
  };
}