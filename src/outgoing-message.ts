import BufferList from 'bl';
import Debug from './debug';
import { HEADER_LENGTH, Packet } from './packet';

export default class OutgoingMessage implements Iterable<Buffer> {
  packetSize: number;
  debug: Debug;
  bl: BufferList;
  payload: Iterable<Buffer>;

  type: number;
  resetConnection: boolean;
  ignore: boolean;

  constructor(debug: Debug, { packetSize, type, resetConnection = false }: { type: number, resetConnection?: boolean, packetSize: number }, payload: Iterable<Buffer>) {
    this.packetSize = packetSize;
    this.debug = debug;
    this.bl = new BufferList();

    this.type = type;
    this.resetConnection = resetConnection;

    this.ignore = false;
    this.payload = payload;
  }

  *[Symbol.iterator]() {
    const length = this.packetSize - HEADER_LENGTH;
    let packetNumber = 0;

    let buffer = Buffer.alloc(length);

    for (const chunk of this.payload) {
      if (this.ignore) {
        break;
      }

      this.bl.append(chunk);

      while (this.bl.length > length) {
        this.bl.copy(buffer, 0, 0, length);
        this.bl.consume(length);

        // TODO: Get rid of creating `Packet` instances here.
        const packet = new Packet(this.type);
        packet.packetId(packetNumber += 1);
        packet.resetConnection(this.resetConnection);
        packet.addData(buffer);

        this.debug.packet('Sent', packet);
        this.debug.data(packet);

        yield packet.buffer;
      }
    }

    buffer = buffer.slice(0, this.bl.length);
    this.bl.copy(buffer);
    this.bl.consume();

    // TODO: Get rid of creating `Packet` instances here.
    const packet = new Packet(this.type);
    packet.packetId(packetNumber += 1);
    packet.resetConnection(this.resetConnection);
    packet.last(true);
    packet.ignore(this.ignore);
    packet.addData(buffer);

    this.debug.packet('Sent', packet);
    this.debug.data(packet);

    yield packet.buffer;
  }
}
