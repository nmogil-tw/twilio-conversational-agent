/**
 * Temporary agent configuration compatibility layer
 * TODO: Replace with new framework agent configuration
 */

// Placeholder function to satisfy existing imports
export function getAgentConfig() {
  return {
    model: "gpt-4o-mini",
    temperature: 0.1,
    maxTokens: 1000
  };
}

// Re-export other necessary items
export * from "./types.js";