/**
 * Service registry for dependency injection
 * Provides lifecycle management and dependency resolution for services
 */

import type { ServiceRegistry, ServiceFactory, Logger } from "./types.js";

/**
 * Service lifecycle states
 */
type ServiceLifecycle = "registered" | "initializing" | "initialized" | "error";

/**
 * Service registration entry
 */
interface ServiceEntry {
  factory: ServiceFactory<any>;
  instance?: any;
  lifecycle: ServiceLifecycle;
  dependencies: string[];
  createdAt: Date;
  error?: Error;
}

/**
 * Service registry configuration
 */
export interface ServiceRegistryConfig {
  enableCircularDependencyDetection?: boolean;
  enableLazyLoading?: boolean;
  enableLifecycleLogging?: boolean;
}

/**
 * Dependency injection container implementation
 */
export class DependencyInjectionContainer implements ServiceRegistry {
  private services = new Map<string, ServiceEntry>();
  private initializationStack: string[] = [];

  constructor(
    private config: ServiceRegistryConfig = {},
    private logger?: Logger
  ) {
    this.config = {
      enableCircularDependencyDetection: true,
      enableLazyLoading: true,
      enableLifecycleLogging: true,
      ...config
    };
  }

  /**
   * Register a service factory
   */
  register<T>(name: string, factory: ServiceFactory<T>): void {
    if (this.services.has(name)) {
      this.logger?.warn(`Service '${name}' is being re-registered`);
    }

    const entry: ServiceEntry = {
      factory,
      lifecycle: "registered",
      dependencies: this.extractDependencies(factory),
      createdAt: new Date()
    };

    this.services.set(name, entry);

    if (this.config.enableLifecycleLogging) {
      this.logger?.debug(`Service registered: ${name}`, { 
        dependencies: entry.dependencies 
      });
    }
  }

  /**
   * Register a service instance directly
   */
  registerInstance<T>(name: string, instance: T): void {
    if (this.services.has(name)) {
      this.logger?.warn(`Service '${name}' is being re-registered with instance`);
    }

    const entry: ServiceEntry = {
      factory: () => instance,
      instance,
      lifecycle: "initialized",
      dependencies: [],
      createdAt: new Date()
    };

    this.services.set(name, entry);

    if (this.config.enableLifecycleLogging) {
      this.logger?.debug(`Service instance registered: ${name}`);
    }
  }

  /**
   * Get service instance, creating it if necessary
   */
  get<T>(name: string): T {
    const entry = this.services.get(name);
    if (!entry) {
      throw new Error(`Service '${name}' is not registered`);
    }

    // Return existing instance if available
    if (entry.instance) {
      return entry.instance as T;
    }

    // Create instance if lazy loading is enabled or forced
    if (this.config.enableLazyLoading || entry.lifecycle === "registered") {
      return this.createInstance<T>(name, entry);
    }

    throw new Error(`Service '${name}' is not initialized and lazy loading is disabled`);
  }

  /**
   * Check if service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * List all registered service names
   */
  list(): string[] {
    return Array.from(this.services.keys()).sort();
  }

  /**
   * Get service lifecycle information
   */
  getServiceInfo(name: string): ServiceInfo | undefined {
    const entry = this.services.get(name);
    if (!entry) {
      return undefined;
    }

    return {
      name,
      lifecycle: entry.lifecycle,
      dependencies: [...entry.dependencies],
      hasInstance: !!entry.instance,
      createdAt: entry.createdAt,
      error: entry.error
    };
  }

  /**
   * Initialize all registered services
   */
  async initializeAll(): Promise<ServiceInitializationResult[]> {
    const results: ServiceInitializationResult[] = [];
    const serviceNames = this.list();

    // Sort by dependency order
    const sortedNames = this.topologicalSort(serviceNames);

    for (const name of sortedNames) {
      try {
        const startTime = Date.now();
        this.get(name); // This will create the instance
        const duration = Date.now() - startTime;

        results.push({
          name,
          success: true,
          duration
        });

        this.logger?.info(`Service initialized: ${name} (${duration}ms)`);

      } catch (error) {
        results.push({
          name,
          success: false,
          error: error as Error,
          duration: 0
        });

        this.logger?.error(`Failed to initialize service: ${name}`, error as Error);
      }
    }

    return results;
  }

  /**
   * Destroy all services and clear registry
   */
  async destroy(): Promise<void> {
    // Destroy in reverse dependency order
    const serviceNames = this.list().reverse();

    for (const name of serviceNames) {
      const entry = this.services.get(name);
      if (entry?.instance && typeof entry.instance.destroy === 'function') {
        try {
          await entry.instance.destroy();
          this.logger?.debug(`Service destroyed: ${name}`);
        } catch (error) {
          this.logger?.error(`Failed to destroy service: ${name}`, error as Error);
        }
      }
    }

    this.services.clear();
    this.initializationStack = [];
    this.logger?.info('Service registry destroyed');
  }

  /**
   * Create service instance with dependency injection
   */
  private createInstance<T>(name: string, entry: ServiceEntry): T {
    // Check for circular dependencies
    if (this.config.enableCircularDependencyDetection) {
      if (this.initializationStack.includes(name)) {
        const cycle = [...this.initializationStack, name].join(' -> ');
        throw new Error(`Circular dependency detected: ${cycle}`);
      }
    }

    try {
      entry.lifecycle = "initializing";
      this.initializationStack.push(name);

      // Create instance using factory
      const result = entry.factory(this);
      
      // Handle async factories
      if (result instanceof Promise) {
        throw new Error(`Async service factories are not supported yet. Service: ${name}`);
      }

      entry.instance = result;
      entry.lifecycle = "initialized";

      if (this.config.enableLifecycleLogging) {
        this.logger?.debug(`Service created: ${name}`);
      }

      return result as T;

    } catch (error) {
      entry.lifecycle = "error";
      entry.error = error as Error;
      this.logger?.error(`Failed to create service: ${name}`, error as Error);
      throw error;

    } finally {
      // Remove from initialization stack
      const index = this.initializationStack.indexOf(name);
      if (index >= 0) {
        this.initializationStack.splice(index, 1);
      }
    }
  }

  /**
   * Extract dependencies from factory function (simple heuristic)
   */
  private extractDependencies(factory: ServiceFactory<any>): string[] {
    // This is a simple implementation that looks for common patterns
    // In a production system, you might want to use more sophisticated dependency analysis
    const factoryString = factory.toString();
    const dependencies: string[] = [];

    // Look for registry.get('serviceName') patterns
    const getMatches = factoryString.match(/registry\.get\(['"`]([^'"`]+)['"`]\)/g);
    if (getMatches) {
      for (const match of getMatches) {
        const serviceName = match.match(/['"`]([^'"`]+)['"`]/)?.[1];
        if (serviceName && !dependencies.includes(serviceName)) {
          dependencies.push(serviceName);
        }
      }
    }

    return dependencies;
  }

  /**
   * Topological sort for dependency-ordered initialization
   */
  private topologicalSort(serviceNames: string[]): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (name: string) => {
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected involving: ${name}`);
      }
      
      if (visited.has(name)) {
        return;
      }

      visiting.add(name);
      
      const entry = this.services.get(name);
      if (entry) {
        for (const dep of entry.dependencies) {
          if (serviceNames.includes(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(name);
      visited.add(name);
      result.push(name);
    };

    for (const name of serviceNames) {
      if (!visited.has(name)) {
        visit(name);
      }
    }

    return result;
  }
}

/**
 * Service information for introspection
 */
export interface ServiceInfo {
  name: string;
  lifecycle: ServiceLifecycle;
  dependencies: string[];
  hasInstance: boolean;
  createdAt: Date;
  error?: Error;
}

/**
 * Service initialization result
 */
export interface ServiceInitializationResult {
  name: string;
  success: boolean;
  duration: number;
  error?: Error;
}

/**
 * Factory function to create service registry
 */
export function createServiceRegistry(
  config: ServiceRegistryConfig = {},
  logger?: Logger
): ServiceRegistry {
  return new DependencyInjectionContainer(config, logger);
}

/**
 * Helper function to register common services
 */
export function registerCoreServices(
  registry: ServiceRegistry,
  eventBus: any,
  config: any,
  logger?: Logger
): void {
  // Register core framework services
  registry.registerInstance('eventBus', eventBus);
  registry.registerInstance('config', config);
  
  if (logger) {
    registry.registerInstance('logger', logger);
  }
}