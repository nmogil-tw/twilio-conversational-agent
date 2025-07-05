/**
 * Unit tests for Service Registry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServiceRegistry } from '../../src/service-registry.js';
import type { ServiceRegistry } from '../../src/types.js';

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = createServiceRegistry();
  });

  describe('Service Registration', () => {
    it('should register and retrieve services', () => {
      const testService = { name: 'test', value: 42 };
      
      registry.registerInstance('testService', testService);
      
      expect(registry.has('testService')).toBe(true);
      expect(registry.get('testService')).toBe(testService);
    });

    it('should register service factories', () => {
      const factory = vi.fn().mockReturnValue({ name: 'factory-service' });
      
      registry.register('factoryService', factory);
      const service = registry.get('factoryService');
      
      expect(factory).toHaveBeenCalledWith(registry);
      expect(service.name).toBe('factory-service');
    });

    it('should cache factory-created services', () => {
      const factory = vi.fn().mockReturnValue({ name: 'cached-service' });
      
      registry.register('cachedService', factory);
      
      const service1 = registry.get('cachedService');
      const service2 = registry.get('cachedService');
      
      expect(factory).toHaveBeenCalledTimes(1);
      expect(service1).toBe(service2);
    });
  });

  describe('Dependency Injection', () => {
    it('should inject dependencies into factories', () => {
      const configService = { setting: 'test-value' };
      const loggerService = { log: vi.fn() };
      
      registry.registerInstance('config', configService);
      registry.registerInstance('logger', loggerService);
      
      registry.register('dependentService', (registry) => {
        const config = registry.get('config');
        const logger = registry.get('logger');
        return { config, logger, name: 'dependent' };
      });
      
      const service = registry.get('dependentService');
      
      expect(service.config).toBe(configService);
      expect(service.logger).toBe(loggerService);
      expect(service.name).toBe('dependent');
    });

    it('should detect circular dependencies', () => {
      registry.register('serviceA', (registry) => {
        return { name: 'A', b: registry.get('serviceB') };
      });
      
      registry.register('serviceB', (registry) => {
        return { name: 'B', a: registry.get('serviceA') };
      });
      
      expect(() => registry.get('serviceA')).toThrow(/circular dependency/i);
    });
  });

  describe('Service Lifecycle', () => {
    it('should list all registered services', () => {
      registry.registerInstance('service1', {});
      registry.registerInstance('service2', {});
      registry.register('service3', () => ({}));
      
      const services = registry.list();
      
      expect(services).toContain('service1');
      expect(services).toContain('service2');
      expect(services).toContain('service3');
      expect(services).toHaveLength(3);
    });

    it('should initialize all services', async () => {
      const factory1 = vi.fn().mockReturnValue({ name: 'service1' });
      const factory2 = vi.fn().mockReturnValue({ name: 'service2' });
      
      registry.register('service1', factory1);
      registry.register('service2', factory2);
      
      const results = await registry.initializeAll();
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(factory1).toHaveBeenCalled();
      expect(factory2).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      const goodFactory = vi.fn().mockReturnValue({ name: 'good' });
      const badFactory = vi.fn().mockImplementation(() => {
        throw new Error('Initialization failed');
      });
      
      registry.register('goodService', goodFactory);
      registry.register('badService', badFactory);
      
      const results = await registry.initializeAll();
      
      expect(results).toHaveLength(2);
      
      const goodResult = results.find(r => r.name === 'goodService');
      const badResult = results.find(r => r.name === 'badService');
      
      expect(goodResult?.success).toBe(true);
      expect(badResult?.success).toBe(false);
      expect(badResult?.error?.message).toBe('Initialization failed');
    });
  });

  describe('Service Information', () => {
    it('should provide service information', () => {
      registry.registerInstance('testService', { name: 'test' });
      
      const info = registry.getServiceInfo('testService');
      
      expect(info).toBeDefined();
      expect(info?.name).toBe('testService');
      expect(info?.hasInstance).toBe(true);
      expect(info?.lifecycle).toBe('initialized');
    });

    it('should return undefined for non-existent services', () => {
      const info = registry.getServiceInfo('nonExistent');
      expect(info).toBeUndefined();
    });
  });

  describe('Service Destruction', () => {
    it('should destroy services with destroy method', async () => {
      const destroyMock = vi.fn();
      const serviceWithDestroy = {
        name: 'destroyable',
        destroy: destroyMock
      };
      
      registry.registerInstance('destroyableService', serviceWithDestroy);
      
      await registry.destroy();
      
      expect(destroyMock).toHaveBeenCalled();
    });

    it('should handle destroy errors gracefully', async () => {
      const badDestroyService = {
        name: 'bad-destroy',
        destroy: vi.fn().mockRejectedValue(new Error('Destroy failed'))
      };
      
      registry.registerInstance('badService', badDestroyService);
      
      // Should not throw
      await expect(registry.destroy()).resolves.toBeUndefined();
    });
  });
});