import { assert } from 'chai';

import { instanceLookup } from '../../src/instance-lookup';

import defaultConfig from '../config';

const RESERVED_IP_ADDRESS = '192.0.2.0'; // Can never be used, so guaranteed to fail.

function getConfig() {
  return {
    server: defaultConfig.server,
    instanceName: defaultConfig.options?.instanceName
  };
}

describe('Instance Lookup Test', function() {
  it('should test good instance', async function() {
    const config = getConfig();

    if (!config.instanceName) {
      // Config says don't do this test (probably because SQL Server Browser is not available).
      return this.skip();
    }

    const controller = new AbortController();
    const port = await instanceLookup({
      server: config.server,
      instanceName: config.instanceName,
      signal: controller.signal
    });

    assert.isDefined(port);
  });

  it('should test bad Instance', async function() {
    const config = getConfig();

    const controller = new AbortController();

    let error: Error | undefined;
    try {
      await instanceLookup({
        server: config.server,
        instanceName: 'badInstanceName',
        timeout: 100,
        retries: 1,
        signal: controller.signal
      });
    } catch (err) {
      error = err as Error;
    }

    assert.instanceOf(error, Error);
  });

  it('should test bad Server', async function() {
    const controller = new AbortController();

    let error: Error | undefined;
    try {
      await instanceLookup({
        server: RESERVED_IP_ADDRESS,
        instanceName: 'badInstanceName',
        timeout: 100,
        retries: 1,
        signal: controller.signal
      });
    } catch (err) {
      error = err as Error;
    }

    assert.instanceOf(error, Error);
  });
});
