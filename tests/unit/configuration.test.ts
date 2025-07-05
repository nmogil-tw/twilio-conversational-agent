/**
 * Unit tests for Configuration system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createConfiguration, createTypedConfig } from '../../src/configuration.js';
import type { Configuration } from '../../src/types.js';

describe('Configuration', () => {
  let config: Configuration;
  let tempConfigDir: string;

  beforeEach(async () => {
    tempConfigDir = join(process.cwd(), 'test-config');
    mkdirSync(tempConfigDir, { recursive: true });

    // Create test config files
    writeFileSync(
      join(tempConfigDir, 'defaults.json'),
      JSON.stringify({
        app: {
          name: 'Test App',
          version: '1.0.0'
        },
        database: {
          host: 'localhost',
          port: 5432
        }
      })
    );

    writeFileSync(
      join(tempConfigDir, 'test.json'),
      JSON.stringify({
        app: {
          name: 'Test App - Test Mode'
        },
        database: {
          host: 'test-db'
        },
        features: {
          newFeature: true
        }
      })
    );

    config = await createConfiguration({
      configDir: tempConfigDir,
      environment: 'test',
      enableHotReload: false
    });
  });

  afterEach(() => {
    config.clear();
    rmSync(tempConfigDir, { recursive: true, force: true });
  });

  describe('Configuration Loading', () => {
    it('should load default configuration', () => {
      expect(config.get('app.version')).toBe('1.0.0');
      expect(config.get('database.port')).toBe(5432);
    });

    it('should override defaults with environment config', () => {
      expect(config.get('app.name')).toBe('Test App - Test Mode');
      expect(config.get('database.host')).toBe('test-db');
    });

    it('should load environment-specific keys', () => {
      expect(config.get('features.newFeature')).toBe(true);
    });
  });

  describe('Configuration Access', () => {
    it('should get configuration values', () => {
      expect(config.get('app.name')).toBe('Test App - Test Mode');
      expect(config.get('nonexistent', 'default')).toBe('default');
    });

    it('should check if configuration exists', () => {
      expect(config.has('app.name')).toBe(true);
      expect(config.has('nonexistent')).toBe(false);
    });

    it('should set configuration values', () => {
      config.set('runtime.setting', 'test-value');
      expect(config.get('runtime.setting')).toBe('test-value');
    });

    it('should get configuration sections', () => {
      const appSection = config.getSection('app');
      expect(appSection).toEqual({
        name: 'Test App - Test Mode',
        version: '1.0.0'
      });
    });
  });

  describe('Environment Variables', () => {
    beforeEach(async () => {
      // Set test environment variables
      process.env.AGENT_TEST_VALUE = 'env-value';
      process.env.AGENT_NESTED_SETTING = '{"enabled": true}';

      config = await createConfiguration({
        configDir: tempConfigDir,
        environment: 'test',
        enableEnvironmentVariables: true,
        envPrefix: 'AGENT_'
      });
    });

    afterEach(() => {
      delete process.env.AGENT_TEST_VALUE;
      delete process.env.AGENT_NESTED_SETTING;
    });

    it('should load environment variables', () => {
      expect(config.get('test.value')).toBe('env-value');
    });

    it('should parse JSON environment variables', () => {
      expect(config.get('nested.setting')).toEqual({ enabled: true });
    });
  });

  describe('Configuration Watching', () => {
    it('should support configuration watchers', (done) => {
      let callCount = 0;
      config.watch('test.dynamic', (value) => {
        callCount++;
        expect(value).toBe('watched-value');
        if (callCount === 1) done();
      });

      config.set('test.dynamic', 'watched-value');
    });
  });

  describe('Typed Configuration', () => {
    interface AppConfig {
      name: string;
      version: string;
    }

    it('should create typed configuration access', () => {
      const appConfig = createTypedConfig<AppConfig>(config, 'app');
      
      expect(appConfig.name).toBe('Test App - Test Mode');
      expect(appConfig.version).toBe('1.0.0');
    });

    it('should support typed configuration updates', () => {
      const appConfig = createTypedConfig<AppConfig>(config, 'app');
      
      appConfig.name = 'Updated Name';
      expect(config.get('app.name')).toBe('Updated Name');
    });
  });
});