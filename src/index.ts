/**
 * Simplified Agent Framework
 * Core abstractions for building modular, event-driven AI agent systems
 */

import { createLoggerFromEnv } from "./logger.js";
import { createConfiguration } from "./configuration.js";
import { createEventBus } from "./event-bus.js";
import { createServiceRegistry, registerCoreServices } from "./service-registry.js";
import { createPluginRegistry, createPluginLoader } from "./plugins.js";

// Core types
export * from "./types.js";

// Event system
export * from "./event-bus.js";
export { createEventBus, createEvent, EventTypes } from "./event-bus.js";

// Configuration system
export * from "./configuration.js";
export { createConfiguration, createTypedConfig } from "./configuration.js";

// Service registry
export * from "./service-registry.js";
export { createServiceRegistry, registerCoreServices } from "./service-registry.js";

// Plugin system
export * from "./plugins.js";
export { 
  BasePlugin,
  BaseAgent,
  BaseAgentPlugin,
  BaseToolPlugin,
  DefaultPluginRegistry,
  PluginLoader,
  createPluginRegistry,
  createPluginLoader,
  createPluginContext
} from "./plugins.js";

// Logging
export * from "./logger.js";
export { createLogger, createLoggerFromEnv, LogLevel } from "./logger.js";

/**
 * Framework factory for creating a complete agent system
 */
export interface FrameworkConfig {
  configDir?: string;
  environment?: string;
  logLevel?: string;
  enableHotReload?: boolean;
  enableStructuredLogging?: boolean;
}

/**
 * Framework instance with all core services
 */
export interface Framework {
  eventBus: import('./types.js').EventBus;
  config: import('./types.js').Configuration;
  services: import('./types.js').ServiceRegistry;
  plugins: import('./plugins.js').PluginRegistry;
  logger: import('./types.js').Logger;
  
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * Create a complete framework instance
 */
export async function createFramework(config: FrameworkConfig = {}): Promise<Framework> {
  // Create logger first
  const logger = createLoggerFromEnv();
  
  // Create configuration
  const configuration = await createConfiguration({
    configDir: config.configDir,
    environment: config.environment,
    enableHotReload: config.enableHotReload
  }, logger);
  
  // Create event bus
  const eventBus = createEventBus({
    enablePatternMatching: true,
    enableEventHistory: true,
    historyLimit: 1000
  }, logger);
  
  // Create service registry
  const services = createServiceRegistry({
    enableCircularDependencyDetection: true,
    enableLazyLoading: true
  }, logger);
  
  // Create plugin registry
  const plugins = createPluginRegistry(logger);
  
  // Register core services
  registerCoreServices(services, eventBus, configuration, logger);
  services.registerInstance('plugins', plugins);
  
  const framework: Framework = {
    eventBus,
    config: configuration,
    services,
    plugins,
    logger,
    
    async start(): Promise<void> {
      logger.info('Starting agent framework');
      
      // Initialize all services
      await services.initializeAll();
      
      logger.info('Agent framework started successfully');
    },
    
    async stop(): Promise<void> {
      logger.info('Stopping agent framework');
      
      // Clear event bus
      eventBus.clear();
      
      logger.info('Agent framework stopped');
    },
    
    async destroy(): Promise<void> {
      logger.info('Destroying agent framework');
      
      // Destroy all services
      await services.destroy();
      
      // Clear all components
      eventBus.clear();
      configuration.clear();
      
      logger.info('Agent framework destroyed');
    }
  };
  
  return framework;
}

/**
 * Framework version
 */
export const VERSION = "1.0.0";

/**
 * Default framework configuration
 */
export const DEFAULT_CONFIG: FrameworkConfig = {
  configDir: "./config",
  environment: "development",
  enableHotReload: true,
  enableStructuredLogging: false
};