const StreamParser = require('../../../src/token/stream-parser');
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const { Connection } = require('../../../src/tedious');
const Message = require('../../../src/message');
const Login7TokenHandler = require('../../../src/token/handler').Login7TokenHandler;
const assert = require('chai').assert;

describe('Env Change Token Parser', () => {
  it('should write to database', async () => {
    const oldDb = 'old';
    const newDb = 'new';

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0x01); // Database
    buffer.writeBVarchar(newDb);
    buffer.writeBVarchar(oldDb);

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = StreamParser.parseTokens([data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    assert.strictEqual(token.type, 'DATABASE');
    assert.strictEqual(token.oldValue, 'old');
    assert.strictEqual(token.newValue, 'new');
  });

  it('should write with correct packet size', async () => {
    const oldSize = '1024';
    const newSize = '2048';

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0x04); // Packet size
    buffer.writeBVarchar(newSize);
    buffer.writeBVarchar(oldSize);

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = StreamParser.parseTokens([data], {}, {});
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;

    assert.strictEqual(token.type, 'PACKET_SIZE');
    assert.strictEqual(token.oldValue, 1024);
    assert.strictEqual(token.newValue, 2048);
  });

  it('should be of bad type', async () => {
    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xe3);
    buffer.writeUInt16LE(0); // Length written later
    buffer.writeUInt8(0xff); // Bad type

    const data = buffer.data;
    data.writeUInt16LE(data.length - 3, 1);

    const parser = StreamParser.parseTokens([data], {}, {});
    const result = await parser.next();
    assert.isTrue(result.done);
  });

  it('Test if routing data capture the correct instance name value', async function() {
    const valueBuffer = new WritableTrackingBuffer(0);
    valueBuffer.writeUInt8(0); // Protocol
    valueBuffer.writeUInt16LE(1433); // Port
    valueBuffer.writeUsVarchar('127.0.0.1\\instanceNameA', 'ucs-2');

    const envValueDataBuffer = new WritableTrackingBuffer(0);
    envValueDataBuffer.writeUInt8(20); // Type
    envValueDataBuffer.writeUsVarbyte(valueBuffer.data);
    envValueDataBuffer.writeUsVarbyte(Buffer.alloc(0));

    const envChangeBuffer = new WritableTrackingBuffer(0);
    envChangeBuffer.writeUInt8(0xE3); // TokenType
    envChangeBuffer.writeUsVarbyte(envValueDataBuffer.data); // Length + EnvValueData

    const responseMessage = new Message({ type: 0x04 });
    responseMessage.end(envChangeBuffer.data);
    const parser = StreamParser.parseTokens(responseMessage, {}, {});
    const result = await parser.next();
    const handler = new Login7TokenHandler(new Connection({ server: 'servername' }));
    handler[result.value.handlerName](result.value);
    assert.strictEqual(handler.routingData.instanceName, 'instanceNameA');
    assert.isTrue((await parser.next()).done);
  });
});
