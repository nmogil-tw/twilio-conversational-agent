/**
 * Hierarchical configuration system with environment support
 * Provides type-safe configuration access with hot reloading capabilities
 */

import { readFileSync, watchFile, existsSync } from "fs";
import { join, resolve } from "path";
import type { Configuration, Logger } from "./types.js";

/**
 * Configuration source types
 */
export type ConfigSource = 
  | "file"
  | "environment"
  | "runtime"
  | "default";

/**
 * Configuration entry with metadata
 */
interface ConfigEntry {
  value: any;
  source: ConfigSource;
  updatedAt: Date;
}

/**
 * Configuration change listener
 */
type ConfigChangeListener = (key: string, newValue: any, oldValue: any) => void;

/**
 * Configuration loader options
 */
export interface ConfigurationOptions {
  configDir?: string;
  environment?: string;
  enableHotReload?: boolean;
  enableEnvironmentVariables?: boolean;
  envPrefix?: string;
}

/**
 * Hierarchical configuration implementation
 */
export class HierarchicalConfiguration implements Configuration {
  private config = new Map<string, ConfigEntry>();
  private listeners = new Map<string, Set<ConfigChangeListener>>();
  private watchedFiles = new Set<string>();

  constructor(
    private options: ConfigurationOptions = {},
    private logger?: Logger
  ) {
    this.options = {
      configDir: "./config",
      environment: process.env.NODE_ENV || "development",
      enableHotReload: true,
      enableEnvironmentVariables: true,
      envPrefix: "AGENT_",
      ...options
    };
  }

  /**
   * Load configuration from various sources
   */
  async load(): Promise<void> {
    try {
      // Load in priority order: defaults -> environment-specific -> environment variables -> runtime overrides
      await this.loadDefaults();
      await this.loadEnvironmentConfig();
      if (this.options.enableEnvironmentVariables) {
        this.loadEnvironmentVariables();
      }
      
      this.logger?.info('Configuration loaded successfully', {
        environment: this.options.environment,
        entriesCount: this.config.size
      });
      
    } catch (error) {
      this.logger?.error('Failed to load configuration', error as Error);
      throw error;
    }
  }

  /**
   * Get configuration value with optional default
   */
  get<T = any>(key: string, defaultValue?: T): T {
    const entry = this.config.get(key);
    if (entry !== undefined) {
      return entry.value as T;
    }
    
    // Try nested key access (e.g., "agent.primary.model")
    const nestedValue = this.getNestedValue(key);
    if (nestedValue !== undefined) {
      return nestedValue as T;
    }
    
    if (defaultValue !== undefined) {
      // Store default value for future access
      this.set(key, defaultValue, "default");
      return defaultValue;
    }
    
    throw new Error(`Configuration key '${key}' not found and no default provided`);
  }

  /**
   * Check if configuration key exists
   */
  has(key: string): boolean {
    return this.config.has(key) || this.getNestedValue(key) !== undefined;
  }

  /**
   * Set configuration value
   */
  set(key: string, value: any, source: ConfigSource = "runtime"): void {
    const oldEntry = this.config.get(key);
    const oldValue = oldEntry?.value;
    
    const entry: ConfigEntry = {
      value,
      source,
      updatedAt: new Date()
    };
    
    this.config.set(key, entry);
    
    // Notify listeners
    if (oldValue !== value) {
      this.notifyListeners(key, value, oldValue);
    }
    
    this.logger?.debug(`Configuration updated: ${key}`, { 
      value, 
      source, 
      oldValue 
    });
  }

  /**
   * Get entire configuration section
   */
  getSection(section: string): Record<string, any> {
    const result: Record<string, any> = {};
    const prefix = section + '.';
    
    for (const [key, entry] of this.config) {
      if (key.startsWith(prefix)) {
        const subKey = key.substring(prefix.length);
        result[subKey] = entry.value;
      }
    }
    
    return result;
  }

  /**
   * Watch for configuration changes
   */
  watch(key: string, callback: (value: any) => void): void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    const listener: ConfigChangeListener = (changedKey, newValue) => {
      if (changedKey === key) {
        callback(newValue);
      }
    };
    
    this.listeners.get(key)!.add(listener);
    
    this.logger?.debug(`Added watcher for configuration key: ${key}`);
  }

  /**
   * Stop watching configuration changes
   */
  unwatch(key: string, _callback: (value: any) => void): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      // Note: In a full implementation, we would match the specific callback
      // For simplicity, we remove all listeners for the key
      listeners.clear();
      this.listeners.delete(key);
    }
  }

  /**
   * Get configuration metadata
   */
  getMetadata(key: string): { source: ConfigSource; updatedAt: Date } | undefined {
    const entry = this.config.get(key);
    if (entry) {
      return {
        source: entry.source,
        updatedAt: entry.updatedAt
      };
    }
    return undefined;
  }

  /**
   * List all configuration keys
   */
  listKeys(): string[] {
    return Array.from(this.config.keys()).sort();
  }

  /**
   * Export current configuration
   */
  export(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, entry] of this.config) {
      result[key] = entry.value;
    }
    return result;
  }

  /**
   * Clear all configuration
   */
  clear(): void {
    this.config.clear();
    this.listeners.clear();
    this.clearFileWatchers();
    this.logger?.info('Configuration cleared');
  }

  /**
   * Load default configuration
   */
  private async loadDefaults(): Promise<void> {
    const defaultsPath = join(this.options.configDir!, 'defaults.json');
    await this.loadConfigFile(defaultsPath, "default");
  }

  /**
   * Load environment-specific configuration
   */
  private async loadEnvironmentConfig(): Promise<void> {
    const envConfigPath = join(this.options.configDir!, `${this.options.environment}.json`);
    await this.loadConfigFile(envConfigPath, "file");
  }

  /**
   * Load configuration from file
   */
  private async loadConfigFile(filePath: string, source: ConfigSource): Promise<void> {
    const resolvedPath = resolve(filePath);
    
    if (!existsSync(resolvedPath)) {
      this.logger?.debug(`Configuration file not found: ${resolvedPath}`);
      return;
    }

    try {
      const content = readFileSync(resolvedPath, 'utf-8');
      const config = JSON.parse(content);
      
      this.flattenAndStore(config, "", source);
      
      // Set up hot reloading
      if (this.options.enableHotReload && !this.watchedFiles.has(resolvedPath)) {
        this.setupFileWatcher(resolvedPath, source);
      }
      
      this.logger?.info(`Loaded configuration from: ${resolvedPath}`);
      
    } catch (error) {
      this.logger?.error(`Failed to load configuration file: ${resolvedPath}`, error as Error);
      throw error;
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadEnvironmentVariables(): void {
    const prefix = this.options.envPrefix!;
    let count = 0;
    
    for (const [envKey, envValue] of Object.entries(process.env)) {
      if (envKey.startsWith(prefix)) {
        const configKey = envKey
          .substring(prefix.length)
          .toLowerCase()
          .replace(/_/g, '.');
        
        // Try to parse as JSON, fall back to string
        let value: any = envValue;
        try {
          value = JSON.parse(envValue!);
        } catch {
          // Keep as string if not valid JSON
        }
        
        this.set(configKey, value, "environment");
        count++;
      }
    }
    
    this.logger?.debug(`Loaded ${count} environment variables with prefix '${prefix}'`);
  }

  /**
   * Flatten nested object and store in config
   */
  private flattenAndStore(obj: any, prefix: string, source: ConfigSource): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively flatten nested objects
        this.flattenAndStore(value, fullKey, source);
      } else {
        this.set(fullKey, value, source);
      }
    }
  }

  /**
   * Get nested value using dot notation
   */
  private getNestedValue(key: string): any {
    const parts = key.split('.');
    
    // Try to find the value by building up the path
    for (let i = parts.length; i > 0; i--) {
      const parentKey = parts.slice(0, i).join('.');
      const remainingPath = parts.slice(i);
      
      const parentEntry = this.config.get(parentKey);
      if (parentEntry && typeof parentEntry.value === 'object') {
        let current = parentEntry.value;
        
        for (const part of remainingPath) {
          if (current && typeof current === 'object' && part in current) {
            current = current[part];
          } else {
            current = undefined;
            break;
          }
        }
        
        if (current !== undefined) {
          return current;
        }
      }
    }
    
    return undefined;
  }

  /**
   * Set up file watcher for hot reloading
   */
  private setupFileWatcher(filePath: string, source: ConfigSource): void {
    watchFile(filePath, { interval: 1000 }, () => {
      this.logger?.info(`Configuration file changed, reloading: ${filePath}`);
      this.loadConfigFile(filePath, source).catch(error => {
        this.logger?.error(`Failed to reload configuration file: ${filePath}`, error);
      });
    });
    
    this.watchedFiles.add(filePath);
  }

  /**
   * Clear all file watchers
   */
  private clearFileWatchers(): void {
    // Note: Node.js doesn't provide a direct way to unwatchFile by path
    // This is a limitation we accept for simplicity
    this.watchedFiles.clear();
  }

  /**
   * Notify configuration change listeners
   */
  private notifyListeners(key: string, newValue: any, oldValue: any): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(key, newValue, oldValue);
        } catch (error) {
          this.logger?.error('Configuration change listener error', error as Error, { key });
        }
      }
    }
  }
}

/**
 * Factory function to create configuration instance
 */
export async function createConfiguration(
  options: ConfigurationOptions = {},
  logger?: Logger
): Promise<Configuration> {
  const config = new HierarchicalConfiguration(options, logger);
  await config.load();
  return config;
}

/**
 * Helper function to create typed configuration access
 */
export function createTypedConfig<T extends Record<string, any>>(
  config: Configuration,
  section: string
): T {
  return new Proxy({} as T, {
    get(_target, prop: string) {
      const key = section ? `${section}.${prop}` : prop;
      return config.get(key);
    },
    
    set(_target, prop: string, value: any) {
      const key = section ? `${section}.${prop}` : prop;
      config.set(key, value);
      return true;
    },
    
    has(_target, prop: string) {
      const key = section ? `${section}.${prop}` : prop;
      return config.has(key);
    }
  });
}