/**
 * Summarization agent plugin
 * Converts the original summarization service to use the new framework
 */

import OpenAI from "openai";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import {
  BaseAgentPlugin,
  EventTypes
} from "../index.js";
import { SubconsciousAgent } from "./subconscious-framework.js";
import type {
  Agent,
  AgentConfig,
  AgentContext,
  AgentCapability
} from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Summarization agent configuration
 */
export interface SummarizationAgentConfig extends AgentConfig {
  model: string;
  frequency: number;
  instructionsPath?: string;
  topicsListPath?: string;
}

/**
 * Call summary structure
 */
export interface CallSummary {
  summary: string;
  topics: string[];
  keyPoints: string[];
  sentiment: "positive" | "negative" | "neutral";
  resolution: "resolved" | "unresolved" | "escalated";
  customerSatisfaction?: number;
  lastUpdated: Date;
}

/**
 * Summarization agent that creates conversation summaries and extracts topics
 */
export class SummarizationAgent extends SubconsciousAgent {
  readonly id: string;
  readonly name = "SummarizationAgent";
  readonly version = "1.0.0";
  readonly capabilities: AgentCapability[] = ["analysis", "summarization"];

  private openai: OpenAI;
  private instructions: string;
  private topicsList: string;
  private currentSummary: CallSummary = {
    summary: "",
    topics: [],
    keyPoints: [],
    sentiment: "neutral",
    resolution: "unresolved",
    lastUpdated: new Date()
  };

  constructor(config: SummarizationAgentConfig, openaiApiKey: string) {
    super({
      ...config,
      analysisType: 'summarization'
    });
    this.id = config.id;
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    
    // Load instructions
    const instructionsPath = config.instructionsPath || 
      join(dirname(__dirname), '..', 'modules', 'summarization', 'instructions.md');
    
    try {
      this.instructions = readFileSync(instructionsPath, 'utf-8');
    } catch (error) {
      this.instructions = `You are a summarization agent that creates concise summaries of customer service conversations.
      
      Analyze the conversation transcript and return a JSON object with:
      - summary: Brief description of the conversation
      - topics: Array of main topics discussed
      - keyPoints: Important points or decisions made
      - sentiment: Overall customer sentiment (positive/negative/neutral)
      - resolution: Whether the issue was resolved, unresolved, or escalated
      - customerSatisfaction: Estimated satisfaction score from 1-10
      
      Focus on:
      - Main customer issues or requests
      - Actions taken by the agent
      - Resolution status
      - Customer emotions and satisfaction`;
    }

    // Load topics list
    const topicsListPath = config.topicsListPath || 
      join(dirname(__dirname), '..', 'modules', 'summarization', 'topics_list.csv');
    
    try {
      this.topicsList = readFileSync(topicsListPath, 'utf-8');
    } catch (error) {
      this.topicsList = `account_management,billing,technical_support,product_inquiry,complaint,refund,dispute,order_status,shipping,returns,password_reset,account_access,payment_issue,service_cancellation,upgrade_request,feature_request,bug_report,general_inquiry`;
    }
  }

  async initialize(context: AgentContext): Promise<void> {
    await super.initialize(context);
    
    // Subscribe to analysis events to update summary
    context.eventBus.subscribe('analysis.summary', (event) => {
      if (event.data.result) {
        this.updateSummary(event.data.result);
      }
    });

    // Subscribe to conversation end to store final summary
    context.eventBus.subscribe(EventTypes.CONVERSATION_END, () => {
      this.storeFinalSummary();
    });
  }

  /**
   * Perform summarization analysis on current conversation
   */
  protected async performAnalysis(): Promise<void> {
    if (!this.context) return;

    const transcript = this.getConversationTranscript();
    if (!transcript.trim()) {
      return; // Nothing to summarize
    }

    try {
      // Interpolate context into instructions
      const contextualInstructions = this.instructions
        .replace('{{transcript}}', transcript)
        .replace('{{topics_list}}', this.topicsList)
        .replace('{{currentSummary}}', JSON.stringify(this.currentSummary, null, 2));

      const completion = await this.openai.chat.completions.create({
        model: this.config.model || 'gpt-4o-mini',
        messages: [{ role: "user", content: contextualInstructions }],
        response_format: { type: "json_object" },
        stream: false,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        this.context.logger.warn("Summarization analysis returned no content");
        return;
      }

      const result = JSON.parse(content) as Partial<CallSummary>;
      
      const summary: CallSummary = {
        summary: result.summary || this.currentSummary.summary,
        topics: this.mergeTopics(this.currentSummary.topics, result.topics || []),
        keyPoints: result.keyPoints || this.currentSummary.keyPoints,
        sentiment: result.sentiment || this.currentSummary.sentiment,
        resolution: result.resolution || this.currentSummary.resolution,
        customerSatisfaction: result.customerSatisfaction || this.currentSummary.customerSatisfaction,
        lastUpdated: new Date()
      };

      // Update current summary
      this.updateSummary(summary);

      // Publish analysis result
      await this.publishAnalysisResult(summary, 1.0);

      this.context.logger.debug(`Summarization analysis completed. Topics: ${summary.topics.join(', ')}`);

    } catch (error) {
      this.context.logger.error("Summarization analysis failed", error as Error);
    }
  }

  /**
   * Update summary and publish to session context
   */
  private updateSummary(newSummary: Partial<CallSummary>): void {
    this.currentSummary = {
      ...this.currentSummary,
      ...newSummary,
      lastUpdated: new Date()
    };

    // Publish summary update event
    this.publishEvent('summary.updated', {
      summary: this.currentSummary
    });
  }

  /**
   * Merge topics, avoiding duplicates
   */
  private mergeTopics(existingTopics: string[], newTopics: string[]): string[] {
    const allTopics = [...existingTopics, ...newTopics];
    return [...new Set(allTopics)]; // Remove duplicates
  }

  /**
   * Store final summary (would integrate with vector store in production)
   */
  private async storeFinalSummary(): Promise<void> {
    if (!this.context) return;

    try {
      // In production, this would store the summary in the vector database
      await this.publishEvent('summary.final', {
        summary: this.currentSummary,
        sessionId: this.context.sessionId
      });

      this.context.logger.info("Final summary stored", {
        topics: this.currentSummary.topics,
        resolution: this.currentSummary.resolution,
        sentiment: this.currentSummary.sentiment
      });

    } catch (error) {
      this.context.logger.error("Failed to store final summary", error as Error);
    }
  }

  /**
   * Get current summary
   */
  getCurrentSummary(): CallSummary {
    return { ...this.currentSummary };
  }

  /**
   * Reset summary for new conversation
   */
  resetSummary(): void {
    this.currentSummary = {
      summary: "",
      topics: [],
      keyPoints: [],
      sentiment: "neutral",
      resolution: "unresolved",
      lastUpdated: new Date()
    };
  }
}

/**
 * Summarization agent plugin
 */
export class SummarizationAgentPlugin extends BaseAgentPlugin {
  readonly name = "SummarizationAgent";
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

    const summarizationConfig: SummarizationAgentConfig = {
      ...config,
      model: this.context.config.get('agents.summarization.model', 'gpt-4o-mini'),
      frequency: this.context.config.get('agents.summarization.frequency', 15000),
      instructionsPath: this.context.config.get('agents.summarization.instructionsPath'),
      topicsListPath: this.context.config.get('agents.summarization.topicsListPath')
    };

    return new SummarizationAgent(summarizationConfig, openaiApiKey);
  }
}