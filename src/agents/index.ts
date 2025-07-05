/**
 * Agent implementations for the simplified framework
 */

// Primary conversation agent
export * from "./primary-agent.js";
export { PrimaryAgent, PrimaryAgentPlugin } from "./primary-agent.js";

// Subconscious agent framework
export * from "./subconscious-framework.js";
export { 
  SubconsciousAgent,
  SubconsciousAgentManager,
  SubconsciousFrameworkPlugin,
  createSubconsciousManager
} from "./subconscious-framework.js";

// Governance agent
export * from "./governance-agent.js";
export { GovernanceAgent, GovernanceAgentPlugin } from "./governance-agent.js";

// Summarization agent
export * from "./summarization-agent.js";
export { SummarizationAgent, SummarizationAgentPlugin } from "./summarization-agent.js";