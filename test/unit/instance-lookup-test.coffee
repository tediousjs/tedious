parse = require('../../src/instance-lookup').parseBrowserResponse

assert = require("chai").assert

describe "parseBrowserResponse", ->
  it "extracts the port for the given server instance", ->
    response = 'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;'
    assert.strictEqual(parse(response, 'sqlexpress'), 1433)

    response = [
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;',
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;'
    ].join()
    assert.strictEqual(parse(response, 'sqlexpress'), 1433)

    response = [
      'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;',
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;'
    ].join()
    assert.strictEqual(parse(response, 'sqlexpress'), 1433)

  it "returns undefined if the given instance is not found", ->
    response = [
      'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;1433;;',
      'ServerName;WINDOWS2;InstanceName;YYYYYYYYYY;IsClustered;No;Version;10.50.2500.0;tcp;0;;'
    ].join()
    assert.isUndefined(parse(response, 'sqlexpress'), undefined)
