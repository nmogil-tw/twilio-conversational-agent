/**
 * Subconscious agent framework for background processing
 * Handles governance, summarization, and other background analysis tasks
 */

import {
  BaseAgent,
  BaseAgentPlugin,
  EventTypes,
  createEvent
} from "../index.js";
import type {
  Agent,
  AgentConfig,
  AgentContext,
  AgentEvent,
  ConversationEvent,
  AnalysisEvent
} from "../types.js";

/**
 * Subconscious agent configuration
 */
export interface SubconsciousAgentConfig extends AgentConfig {
  frequency: number; // Processing frequency in milliseconds
  analysisType: string; // Type of analysis to perform
  model?: string;
  batchSize?: number;
  autoStart?: boolean;
}

/**
 * Base class for subconscious agents that run background analysis
 */
export abstract class SubconsciousAgent extends BaseAgent {
  protected config: SubconsciousAgentConfig;
  protected processingTimer?: NodeJS.Timeout;
  protected conversationBuffer: ConversationEvent[] = [];

  constructor(config: SubconsciousAgentConfig) {
    super();
    this.config = config;
  }

  async initialize(context: AgentContext): Promise<void> {
    await super.initialize(context);
    
    if (this.config.autoStart !== false) {
      await this.start();
    }
  }

  async start(): Promise<void> {
    await super.start();
    this.startProcessingTimer();
  }

  async stop(): Promise<void> {
    this.stopProcessingTimer();
    await super.stop();
  }

  protected async setupEventSubscriptions(): Promise<void> {
    if (!this.context) return;

    // Subscribe to conversation events to build analysis buffer
    this.context.eventBus.subscribe(EventTypes.CONVERSATION_TURN, (event) => {
      this.bufferConversationEvent(event as ConversationEvent);
    });

    this.context.eventBus.subscribe(EventTypes.CONVERSATION_START, (event) => {
      this.handleConversationStart(event as ConversationEvent);
    });

    this.context.eventBus.subscribe(EventTypes.CONVERSATION_END, (event) => {
      this.handleConversationEnd(event as ConversationEvent);
    });
  }

  protected async processEvent(event: AgentEvent): Promise<void> {
    // Subconscious agents primarily work on timers, but can respond to specific events
    switch (event.type) {
      case 'analysis.request':
        if (event.data.analysisType === this.config.analysisType) {
          await this.performAnalysis();
        }
        break;
    }
  }

  /**
   * Buffer conversation events for batch processing
   */
  private bufferConversationEvent(event: ConversationEvent): void {
    this.conversationBuffer.push(event);
    
    // Limit buffer size
    const maxBufferSize = this.config.batchSize || 50;
    if (this.conversationBuffer.length > maxBufferSize) {
      this.conversationBuffer = this.conversationBuffer.slice(-maxBufferSize);
    }
  }

  /**
   * Handle conversation start
   */
  private async handleConversationStart(event: ConversationEvent): Promise<void> {
    this.conversationBuffer = []; // Reset buffer for new conversation
    this.context?.logger.debug(`${this.name} reset for new conversation: ${event.sessionId}`);
  }

  /**
   * Handle conversation end
   */
  private async handleConversationEnd(event: ConversationEvent): Promise<void> {
    // Perform final analysis
    await this.performAnalysis();
    this.conversationBuffer = [];
    this.context?.logger.info(`${this.name} completed final analysis for: ${event.sessionId}`);
  }

  /**
   * Start periodic processing timer
   */
  private startProcessingTimer(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
    }

    this.processingTimer = setInterval(async () => {
      try {
        await this.performAnalysis();
      } catch (error) {
        this.context?.logger.error(`${this.name} processing error`, error as Error);
      }
    }, this.config.frequency);

    this.context?.logger.info(`${this.name} started with frequency: ${this.config.frequency}ms`);
  }

  /**
   * Stop processing timer
   */
  private stopProcessingTimer(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }
  }

  /**
   * Abstract method for performing analysis - implemented by subclasses
   */
  protected abstract performAnalysis(): Promise<void>;

  /**
   * Helper method to publish analysis results
   */
  protected async publishAnalysisResult(result: any, confidence?: number): Promise<void> {
    if (!this.context) return;

    const analysisEvent: AnalysisEvent = {
      id: `${this.id}-${Date.now()}`,
      type: `analysis.${this.config.analysisType}` as any,
      sessionId: this.context.sessionId,
      agentId: this.id,
      timestamp: new Date(),
      data: {
        analysisType: this.config.analysisType,
        result,
        confidence
      }
    };

    await this.context.eventBus.publish(analysisEvent);
  }

  /**
   * Get conversation transcript for analysis
   */
  protected getConversationTranscript(): string {
    return this.conversationBuffer
      .filter(event => event.data.content)
      .map(event => {
        const role = event.data.role?.toUpperCase() || 'UNKNOWN';
        return `[${role}]: ${event.data.content}`;
      })
      .join('\n\n');
  }
}

/**
 * Agent manager for coordinating multiple subconscious agents
 */
export class SubconsciousAgentManager {
  private agents = new Map<string, SubconsciousAgent>();

  constructor(private context: AgentContext) {}

  /**
   * Register a subconscious agent
   */
  async registerAgent(agent: SubconsciousAgent): Promise<void> {
    await agent.initialize(this.context);
    this.agents.set(agent.id, agent);
    
    this.context.logger.info(`Subconscious agent registered: ${agent.name}`);
  }

  /**
   * Start all agents
   */
  async startAll(): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.start();
    }
    
    this.context.logger.info(`Started ${this.agents.size} subconscious agents`);
  }

  /**
   * Stop all agents
   */
  async stopAll(): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.stop();
    }
    
    this.context.logger.info("Stopped all subconscious agents");
  }

  /**
   * Get agent by ID
   */
  getAgent(id: string): SubconsciousAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * List all registered agents
   */
  listAgents(): Array<{ id: string; name: string; status: string }> {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      status: agent.getStatus()
    }));
  }

  /**
   * Request analysis from specific agent type
   */
  async requestAnalysis(analysisType: string, data?: any): Promise<void> {
    const analysisRequestEvent = createEvent(
      'analysis.request',
      this.context.sessionId,
      'system',
      { analysisType, ...data }
    );

    await this.context.eventBus.publish(analysisRequestEvent);
  }

  /**
   * Destroy all agents
   */
  async destroy(): Promise<void> {
    await this.stopAll();
    
    for (const agent of this.agents.values()) {
      await agent.destroy();
    }
    
    this.agents.clear();
    this.context.logger.info("Destroyed all subconscious agents");
  }
}

/**
 * Plugin for the subconscious agent framework
 */
export class SubconsciousFrameworkPlugin extends BaseAgentPlugin {
  readonly name = "SubconsciousFramework";
  readonly version = "1.0.0";
  readonly dependencies = ["config", "logger", "eventBus"];


  async initialize(context: any): Promise<void> {
    await super.initialize(context);
    
    // Register the manager as a service
    this.context!.services.register('subconsciousManager', (registry) => {
      const eventBus = registry.get('eventBus') as any;
      const config = registry.get('config') as any;
      const logger = registry.get('logger') as any;
      
      const agentContext: AgentContext = {
        sessionId: 'system', // Manager operates at system level
        eventBus,
        config,
        logger,
        services: registry
      };
      
      return new SubconsciousAgentManager(agentContext);
    });
  }

  async createAgent(_config: AgentConfig): Promise<Agent> {
    throw new Error("SubconsciousFramework does not create agents directly. Use SubconsciousAgentManager instead.");
  }
}

/**
 * Factory function to create subconscious agent manager
 */
export function createSubconsciousManager(context: AgentContext): SubconsciousAgentManager {
  return new SubconsciousAgentManager(context);
}