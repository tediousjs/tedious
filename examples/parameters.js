var Connection = require('tedious').Connection,
	Request = require('tedious').Request,
	TYPES = require('tedious').TYPES;

var connection = new Connection({
	server: '192.168.1.212',
	userName: 'test',
	password: 'test'
});

connection.on('connect', function(err){
	var request = new Request("INSERT INTO MyTable (uniqueIdCol, intCol, nVarCharCol) VALUES (@uniqueIdVal, @intVal, @nVarCharVal)",
	function(err){
		if(err){
			console.log(err);
		};
	});

	request.addParameter('uniqueIdVal', TYPES.UniqueIdentifierN,'ba46b824-487b-4e7d-8fb9-703acdf954e5');
	request.addParameter('intVal', TYPES.Int, 435);
	request.addParameter('nVarCharVal', TYPES.NVarChar, 'hello world');

	connection.execSql(request);
});
