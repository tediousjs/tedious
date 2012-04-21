parse = require('../../src/instance-lookup').parseBrowserResponse

exports.oneInstanceFound = (test) ->
  response = 'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;'
  test.strictEqual(parse(response, 'sqlexpress'), 1433)
  test.done()

exports.twoInstancesFoundInFirst = (test) ->
  response =
    'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;' +
    'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;'
  test.strictEqual(parse(response, 'sqlexpress'), 1433)
  test.done()

exports.twoInstancesFoundInSecond = (test) ->
  response =
    'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
    'ServerName;WINDOWS2;InstanceName;SQLEXPRESS;IsClustered;No;Version;10.50.2500.0;tcp;1433;;'
  test.strictEqual(parse(response, 'sqlexpress'), 1433)
  test.done()

exports.twoInstancesNotFound = (test) ->
  response =
    'ServerName;WINDOWS2;InstanceName;XXXXXXXXXX;IsClustered;No;Version;10.50.2500.0;tcp;0;;' +
    'ServerName;WINDOWS2;InstanceName;YYYYYYYYYY;IsClustered;No;Version;10.50.2500.0;tcp;0;;'
  test.strictEqual(parse(response, 'sqlexpress'), undefined)
  test.done()
