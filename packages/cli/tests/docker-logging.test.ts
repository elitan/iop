import { describe, it, expect } from 'bun:test';
import { createProxyLoggingConfig, createServiceLoggingConfig, DockerClient } from '../src/docker';
import { ServiceEntry, IopSecrets } from '../src/config/types';

describe('Docker Logging Configuration', () => {
  it('should create proxy logging configuration with correct values', () => {
    const config = createProxyLoggingConfig();
    
    expect(config.logDriver).toBe('json-file');
    expect(config.logOpts['max-size']).toBe('5m');
    expect(config.logOpts['max-file']).toBe('5');
  });

  it('should create service logging configuration with correct values', () => {
    const config = createServiceLoggingConfig();
    
    expect(config.logDriver).toBe('json-file');
    expect(config.logOpts['max-size']).toBe('10m');
    expect(config.logOpts['max-file']).toBe('3');
  });

  it('should include logging configuration in service container options', () => {
    const serviceEntry: ServiceEntry = {
      name: 'test-service',
      image: 'nginx:latest'
    };
    
    const secrets: IopSecrets = {};
    const projectName = 'test-project';
    
    const containerOptions = DockerClient.serviceToContainerOptions(
      serviceEntry,
      projectName,
      secrets
    );
    
    expect(containerOptions.logDriver).toBe('json-file');
    expect(containerOptions.logOpts).toBeDefined();
    expect(containerOptions.logOpts!['max-size']).toBe('10m');
    expect(containerOptions.logOpts!['max-file']).toBe('3');
  });
});