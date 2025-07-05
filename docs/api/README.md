# API Documentation

## Core Framework

### createFramework(config)

Creates a new framework instance with the specified configuration.

**Parameters:**
- `config` (FrameworkConfig): Framework configuration options
  - `configDir?: string` - Directory containing configuration files
  - `environment?: string` - Environment name (development, production, etc.)
  - `logLevel?: string` - Logging level
  - `enableHotReload?: boolean` - Enable configuration hot reloading
  - `enableStructuredLogging?: boolean` - Enable structured JSON logging

**Returns:** `Promise<Framework>`

**Example:**
```typescript
const framework = await createFramework({
  configDir: './config',
  environment: 'development'
});
```

### Framework Interface

#### Methods

- `start(): Promise<void>` - Start all framework services
- `stop(): Promise<void>` - Stop all framework services
- `destroy(): Promise<void>` - Destroy and cleanup framework

#### Properties

- `eventBus: EventBus` - Central event communication system
- `config: Configuration` - Configuration management
- `services: ServiceRegistry` - Service dependency injection
- `plugins: PluginRegistry` - Plugin management system
- `logger: Logger` - Structured logging system

## Event System

### EventBus

Central event communication hub for all agents and services.

#### Methods

- `publish(event: AgentEvent): Promise<void>` - Publish an event
- `subscribe(eventType: string, handler: EventHandler): void` - Subscribe to specific event type
- `subscribeToPattern(pattern: string, handler: EventHandler): void` - Subscribe to event patterns
- `unsubscribe(eventType: string, handler: EventHandler): void` - Unsubscribe from events
- `getStats(): EventStats` - Get event bus performance statistics
- `getEventHistory(limit?: number): AgentEvent[]` - Get recent event history

#### Event Types

- `conversation.start` - Conversation session started
- `conversation.turn` - New conversation turn
- `conversation.end` - Conversation session ended
- `analysis.governance` - Governance analysis result
- `analysis.summarization` - Summarization result
- `system.error` - System error occurred
- `tool.execute` - Tool execution event

### createEvent(type, sessionId, agentId, data)

Factory function to create properly formatted events.

**Parameters:**
- `type: string` - Event type
- `sessionId: string` - Session identifier
- `agentId: string` - Agent identifier
- `data: Record<string, any>` - Event payload

**Returns:** `AgentEvent`

## Configuration

### Configuration Interface

Hierarchical configuration management with environment overrides.

#### Methods

- `get<T>(key: string, defaultValue?: T): T` - Get configuration value
- `set(key: string, value: any): void` - Set configuration value
- `has(key: string): boolean` - Check if configuration key exists
- `getSection<T>(section: string): T` - Get entire configuration section
- `watch(key: string, callback: (value: any) => void): void` - Watch for changes

## Agent System

### BaseAgent

Base class for creating custom agents.

#### Methods

- `initialize(context: AgentContext): Promise<void>` - Initialize agent
- `start(): Promise<void>` - Start agent processing
- `stop(): Promise<void>` - Stop agent processing
- `processEvent(event: AgentEvent): Promise<void>` - Process incoming events
- `getMetrics(): AgentMetrics` - Get agent performance metrics
- `getStatus(): AgentStatus` - Get current agent status

### BaseAgentPlugin

Base class for creating agent plugins.

#### Methods

- `initialize(context: PluginContext): Promise<void>` - Initialize plugin
- `createAgent(config: AgentConfig): Promise<BaseAgent>` - Create agent instance

## Service Registry

### ServiceRegistry Interface

Dependency injection container for services.

#### Methods

- `register<T>(name: string, factory: ServiceFactory<T>): void` - Register service factory
- `registerInstance<T>(name: string, instance: T): void` - Register service instance
- `get<T>(name: string): T` - Get service instance
- `has(name: string): boolean` - Check if service exists
- `list(): string[]` - List all registered services
- `initializeAll(): Promise<ServiceInitResult[]>` - Initialize all services
- `destroy(): Promise<void>` - Destroy all services

## Error Handling

All framework methods properly handle errors and provide meaningful error messages. The event system includes automatic error recovery and isolation to prevent individual agent failures from affecting the entire system.

## Performance

The framework is optimized for high-performance real-time applications:

- Event processing: >1000 events/second
- Agent coordination: <10ms latency
- Memory efficient: <50MB per agent
- Graceful error recovery

## TypeScript Support

The framework is written in TypeScript and provides comprehensive type definitions for all APIs. This ensures type safety and excellent developer experience with full IDE support.