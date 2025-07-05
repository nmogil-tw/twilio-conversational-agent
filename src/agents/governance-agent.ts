/**
 * Governance agent plugin
 * Converts the original governance service to use the new framework
 */

import OpenAI from "openai";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import {
  BaseAgentPlugin
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
 * Governance agent configuration
 */
export interface GovernanceAgentConfig extends AgentConfig {
  model: string;
  frequency: number;
  instructionsPath?: string;
}

/**
 * Governance state and step types (simplified from original)
 */
export interface GovernanceState {
  rating: number;
  procedures: Record<string, GovernanceStep[]>;
  lastUpdated: Date;
}

export interface GovernanceStep {
  id: string;
  status: "pending" | "in-progress" | "complete" | "missed" | "unresolved" | "not-necessary";
  description: string;
  notes?: string;
}

/**
 * Governance agent that tracks conversation compliance and quality
 */
export class GovernanceAgent extends SubconsciousAgent {
  readonly id: string;
  readonly name = "GovernanceAgent";
  readonly version = "1.0.0";
  readonly capabilities: AgentCapability[] = ["analysis", "governance"];

  private openai: OpenAI;
  private instructions: string;
  private currentState: GovernanceState = {
    rating: 3,
    procedures: {},
    lastUpdated: new Date()
  };

  constructor(config: GovernanceAgentConfig, openaiApiKey: string) {
    super({
      ...config,
      analysisType: 'governance'
    });
    this.id = config.id;
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    
    // Load instructions
    const instructionsPath = config.instructionsPath || 
      join(dirname(__dirname), '..', 'modules', 'governance', 'instructions-subconscious.md');
    
    try {
      this.instructions = readFileSync(instructionsPath, 'utf-8');
    } catch (error) {
      this.instructions = `You are a governance agent that tracks conversation compliance and quality.
      
      Analyze the conversation transcript and return a JSON object with:
      - rating: Overall quality score from 1-5
      - procedures: Object mapping procedure names to arrays of steps
      - notes: Any observations about compliance or quality
      
      Focus on:
      - Procedure completion
      - Customer service quality
      - Policy compliance
      - Issue resolution effectiveness`;
    }
  }

  async initialize(context: AgentContext): Promise<void> {
    await super.initialize(context);
    
    // Subscribe to analysis events to update state
    context.eventBus.subscribe('analysis.governance', (event) => {
      if (event.data.result) {
        this.updateGovernanceState(event.data.result);
      }
    });
  }

  /**
   * Perform governance analysis on current conversation
   */
  protected async performAnalysis(): Promise<void> {
    if (!this.context) return;

    const transcript = this.getConversationTranscript();
    if (!transcript.trim()) {
      return; // Nothing to analyze
    }

    try {
      // Interpolate context into instructions
      const contextualInstructions = this.instructions
        .replace('{{transcript}}', transcript)
        .replace('{{currentState}}', JSON.stringify(this.currentState, null, 2));

      const completion = await this.openai.chat.completions.create({
        model: this.config.model || 'gpt-4o-mini',
        messages: [{ role: "user", content: contextualInstructions }],
        response_format: { type: "json_object" },
        stream: false,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        this.context.logger.warn("Governance analysis returned no content");
        return;
      }

      const result = JSON.parse(content) as Partial<GovernanceState>;
      
      // Calculate comprehensive governance score
      const governanceScore = this.calculateGovernanceScore(result);
      
      const governanceState: GovernanceState = {
        rating: governanceScore,
        procedures: { ...this.currentState.procedures, ...result.procedures },
        lastUpdated: new Date()
      };

      // Update current state
      this.updateGovernanceState(governanceState);

      // Publish analysis result
      await this.publishAnalysisResult(governanceState, governanceScore / 5);

      this.context.logger.debug(`Governance analysis completed. Score: ${governanceScore}`);

    } catch (error) {
      this.context.logger.error("Governance analysis failed", error as Error);
    }
  }

  /**
   * Update governance state and publish to session context
   */
  private updateGovernanceState(newState: Partial<GovernanceState>): void {
    this.currentState = {
      ...this.currentState,
      ...newState,
      lastUpdated: new Date()
    };

    // Publish state update event
    this.publishEvent('governance.state-updated', {
      state: this.currentState
    });
  }

  /**
   * Calculate comprehensive governance score (simplified from original)
   */
  private calculateGovernanceScore(governance: Partial<GovernanceState>): number {
    // Simplified scoring - in production, this would be more sophisticated
    const baseRating = governance.rating || this.currentState.rating;
    
    if (!governance.procedures) {
      return baseRating;
    }

    // Calculate procedure completion score
    const allSteps = Object.values(governance.procedures).flat();
    if (allSteps.length === 0) {
      return baseRating;
    }

    const completedSteps = allSteps.filter(step => step.status === 'complete').length;
    const procedureScore = (completedSteps / allSteps.length) * 5;

    // Average with base rating
    return Math.round(((baseRating + procedureScore) / 2) * 10) / 10;
  }

  /**
   * Get current governance state
   */
  getGovernanceState(): GovernanceState {
    return { ...this.currentState };
  }
}

/**
 * Governance agent plugin
 */
export class GovernanceAgentPlugin extends BaseAgentPlugin {
  readonly name = "GovernanceAgent";
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

    const governanceConfig: GovernanceAgentConfig = {
      ...config,
      model: this.context.config.get('agents.governance.model', 'gpt-4o-mini'),
      frequency: this.context.config.get('agents.governance.frequency', 5000),
      instructionsPath: this.context.config.get('agents.governance.instructionsPath')
    };

    return new GovernanceAgent(governanceConfig, openaiApiKey);
  }
}