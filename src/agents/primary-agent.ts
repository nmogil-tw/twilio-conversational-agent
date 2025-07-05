/**
 * Primary conversation agent implementation
 * Refactored from the original OpenAI conscious loop to use the new framework
 */

import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/index";
import type { Stream } from "openai/streaming";
import { v4 as uuidv4 } from "uuid";

import {
  BaseAgent,
  BaseAgentPlugin,
  EventTypes
} from "../index.js";
import type {
  Agent,
  AgentConfig,
  AgentContext,
  AgentEvent,
  ConversationEvent,
  AgentCapability,
  ToolDefinition,
  ToolExecutionContext
} from "../types.js";

/**
 * Primary agent configuration
 */
export interface PrimaryAgentConfig extends AgentConfig {
  model: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Primary conversation agent that handles main conversation flow
 */
export class PrimaryAgent extends BaseAgent {
  readonly id: string;
  readonly name = "PrimaryConversationAgent";
  readonly version = "1.0.0";
  readonly capabilities: AgentCapability[] = ["conversation", "tool-execution", "human-handoff"];

  private openai: OpenAI;
  private config: PrimaryAgentConfig;
  private stream?: Stream<ChatCompletionChunk>;
  private conversationHistory: ChatCompletionMessageParam[] = [];

  constructor(config: PrimaryAgentConfig, openaiApiKey: string) {
    super();
    this.id = config.id;
    this.config = config;
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  async initialize(context: AgentContext): Promise<void> {
    await super.initialize(context);
    
    // Load conversation system instructions
    const instructions = context.config.get('agents.primary.instructions', 
      'You are a helpful AI assistant for customer service.');
    
    this.conversationHistory = [{
      role: "system",
      content: instructions
    }];

    this.context!.logger.info(`Primary agent initialized with model: ${this.config.model}`);
  }

  protected async setupEventSubscriptions(): Promise<void> {
    if (!this.context) return;

    // Subscribe to conversation events
    this.context.eventBus.subscribe(EventTypes.CONVERSATION_TURN, (event) => {
      this.handleEvent(event);
    });

    this.context.eventBus.subscribe(EventTypes.CONVERSATION_START, (event) => {
      this.handleEvent(event);
    });
  }

  protected async processEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case EventTypes.CONVERSATION_START:
        await this.handleConversationStart(event as ConversationEvent);
        break;
        
      case EventTypes.CONVERSATION_TURN:
        await this.handleConversationTurn(event as ConversationEvent);
        break;
        
      default:
        this.context!.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Handle conversation start event
   */
  private async handleConversationStart(event: ConversationEvent): Promise<void> {
    this.context!.logger.info(`Starting conversation for session: ${event.sessionId}`);
    
    // Add welcome message or greeting logic here
    if (event.data.content) {
      this.conversationHistory.push({
        role: "assistant",
        content: event.data.content
      });
    }
  }

  /**
   * Handle conversation turn event
   */
  private async handleConversationTurn(event: ConversationEvent): Promise<void> {
    if (event.data.role === 'human' && event.data.content) {
      // Add human message to history
      this.conversationHistory.push({
        role: "user",
        content: event.data.content
      });

      // Generate response
      await this.generateResponse();
    }
  }

  /**
   * Generate AI response using OpenAI
   */
  private async generateResponse(): Promise<void> {
    if (!this.context) return;

    const completionId = uuidv4();

    try {
      // Get available tools
      const tools = this.getAvailableTools();
      
      const args = {
        model: this.config.model,
        messages: this.conversationHistory,
        stream: true,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      };

      this.stream = await this.openai.chat.completions.create(args) as Stream<ChatCompletionChunk>;

      let assistantMessage = "";
      let toolCalls: any[] = [];

      // Process streaming response
      if (this.stream) {
        for await (const chunk of this.stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;
        const delta = choice.delta;

        // Handle text content
        if (delta.content) {
          assistantMessage += delta.content;
          
          // Publish text chunk event for real-time UI updates
          await this.publishEvent('conversation.text-chunk', {
            content: delta.content,
            fullText: assistantMessage,
            isComplete: false
          });
        }

        // Handle tool calls
        if (delta.tool_calls) {
          // Tool call logic here
          toolCalls.push(...delta.tool_calls);
        }

        // Handle completion
        if (choice?.finish_reason === "stop") {
          this.conversationHistory.push({
            role: "assistant",
            content: assistantMessage
          });

          await this.publishEvent('conversation.text-chunk', {
            content: "",
            fullText: assistantMessage,
            isComplete: true
          });

          await this.publishEvent(EventTypes.CONVERSATION_TURN, {
            role: 'assistant',
            content: assistantMessage,
            turnId: uuidv4()
          });
        }

        if (choice?.finish_reason === "tool_calls") {
          await this.handleToolExecution(toolCalls);
          
          // Continue conversation after tool execution
          await this.generateResponse();
        }
        }
      }

    } catch (error) {
      this.context.logger.error("Error generating response", error as Error);
      
      await this.publishEvent('system.error', {
        error: (error as Error).message,
        agentId: this.id
      });
    } finally {
      this.stream = undefined;
    }
  }

  /**
   * Handle tool execution
   */
  private async handleToolExecution(toolCalls: any[]): Promise<void> {
    if (!this.context) return;

    const plugins = this.context.services.get('plugins') as any;
    
    for (const toolCall of toolCalls) {
      try {
        const toolExecutionContext: ToolExecutionContext = {
          sessionId: this.context.sessionId,
          agentId: this.id,
          config: this.context.config,
          logger: this.context.logger,
          services: this.context.services
        };

        const args = JSON.parse(toolCall.function.arguments);
        const result = await plugins.executeTool(
          toolCall.function.name,
          args,
          toolExecutionContext
        );

        // Add tool result to conversation history
        this.conversationHistory.push({
          role: "assistant",
          tool_calls: [toolCall]
        });

        this.conversationHistory.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: toolCall.id
        });

        await this.publishEvent(EventTypes.TOOL_EXECUTION_COMPLETE, {
          toolName: toolCall.function.name,
          result,
          toolCallId: toolCall.id
        });

      } catch (error) {
        this.context.logger.error(`Tool execution error: ${toolCall.function.name}`, error as Error);
        
        await this.publishEvent(EventTypes.TOOL_EXECUTION_ERROR, {
          toolName: toolCall.function.name,
          error: (error as Error).message,
          toolCallId: toolCall.id
        });
      }
    }
  }

  /**
   * Get available tools from plugin registry
   */
  private getAvailableTools(): ChatCompletionTool[] {
    if (!this.context) return [];

    try {
      const plugins = this.context.services.get('plugins') as any;
      const toolDefinitions = plugins.getAvailableTools();
      
      return toolDefinitions.map(this.convertToolDefinition);
    } catch (error) {
      this.context.logger.warn("Could not load tools", error as Error);
      return [];
    }
  }

  /**
   * Convert framework tool definition to OpenAI format
   */
  private convertToolDefinition(tool: ToolDefinition): ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    };
  }

  /**
   * Abort current completion
   */
  async abort(): Promise<void> {
    if (this.stream && !this.stream.controller.signal.aborted) {
      this.stream.controller.abort();
    }
    
    this.stream = undefined;
    
    this.context?.logger.info("Primary agent completion aborted");
  }
}

/**
 * Primary agent plugin for registering with the framework
 */
export class PrimaryAgentPlugin extends BaseAgentPlugin {
  readonly name = "PrimaryConversationAgent";
  readonly version = "1.0.0";
  readonly dependencies = ["config", "logger"];

  async createAgent(config: AgentConfig): Promise<Agent> {
    if (!this.context) {
      throw new Error("Plugin not initialized");
    }

    const openaiApiKey = this.context.config.get('integrations.openai.apiKey');
    if (!openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const primaryConfig: PrimaryAgentConfig = {
      ...config,
      model: this.context.config.get('agents.primary.model', 'gpt-4o'),
      maxTokens: this.context.config.get('agents.primary.maxTokens', 4096),
      temperature: this.context.config.get('agents.primary.temperature', 0.7),
      maxRetries: this.context.config.get('agents.primary.maxRetries', 3),
      retryDelay: this.context.config.get('agents.primary.retryDelay', 1000)
    };

    return new PrimaryAgent(primaryConfig, openaiApiKey);
  }
}