import BufferList from 'bl';
import { Packet, HEADER_LENGTH } from './packet';
import Debug from './debug';
import Message from './message';

export async function * packetTransform(message: Message, debug: Debug, packetSize: number) {
  const bl = new BufferList();
  const length = packetSize - HEADER_LENGTH;

  let packetNumber = 0;
  let chunk: Buffer;
  for await (chunk of message) {
    if (message.ignore) {
      break;
    }

    bl.append(chunk);

    while (bl.length > length) {
      const data = bl.slice(0, length);
      bl.consume(length);

      // TODO: Get rid of creating `Packet` instances here.
      const packet = new Packet(message.type);
      packet.packetId(packetNumber += 1);
      packet.resetConnection(message.resetConnection);
      packet.addData(data);

      debug.packet('Sent', packet);
      debug.data(packet);

      yield packet.buffer;
    }
  }

  const data = bl.slice();
  bl.consume(data.length);

  // TODO: Get rid of creating `Packet` instances here.
  const packet = new Packet(message.type);
  packet.packetId(packetNumber += 1);
  packet.resetConnection(message.resetConnection);
  packet.last(true);
  packet.ignore(message.ignore);
  packet.addData(data);

  debug.packet('Sent', packet);
  debug.data(packet);

  yield packet.buffer;
}
