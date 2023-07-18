import { BVarbyte, FlatMap, Map, Sequence, UInt8, UsVarbyte, Parser, BVarchar } from '..';
import { Collation } from '../../collation';
import { DatabaseEnvChangeToken, LanguageEnvChangeToken, CharsetEnvChangeToken, PacketSizeEnvChangeToken, BeginTransactionEnvChangeToken, CommitTransactionEnvChangeToken, RollbackTransactionEnvChangeToken, DatabaseMirroringPartnerEnvChangeToken, ResetConnectionEnvChangeToken, RoutingEnvChangeToken, CollationChangeToken } from '../../token/token';

type EnvChangeToken =
  DatabaseEnvChangeToken |
  LanguageEnvChangeToken |
  CharsetEnvChangeToken |
  PacketSizeEnvChangeToken |
  BeginTransactionEnvChangeToken |
  CommitTransactionEnvChangeToken |
  RollbackTransactionEnvChangeToken |
  DatabaseMirroringPartnerEnvChangeToken |
  ResetConnectionEnvChangeToken |
  RoutingEnvChangeToken |
  CollationChangeToken;

export class EnvChangeTokenParser extends Map<Buffer, EnvChangeToken> {
  constructor() {
    super(new UsVarbyte(), parseEnvChangeBody);
  }
}

class EnvChangeBodyParser extends FlatMap<number, EnvChangeToken> {
  constructor() {
    super(new UInt8(), chooseEnvChangeType);
  }
}

function parseEnvChangeBody(buffer: Buffer): EnvChangeToken {
  const result = new EnvChangeBodyParser().parse(buffer, 0);

  if (!result.done) {
    throw new Error('unreachable');
  }

  return result.value;
}

function buildCollationChangeToken([newValue, oldValue]: [Buffer, Buffer]) {
  const newCollation = newValue.length ? Collation.fromBuffer(newValue) : undefined;
  const oldCollation = oldValue.length ? Collation.fromBuffer(oldValue) : undefined;

  return new CollationChangeToken(newCollation, oldCollation);
}

function buildPacketSizeChangeToken([newValue, oldValue]: [string, string]) {
  return new PacketSizeEnvChangeToken(parseInt(newValue), parseInt(oldValue));
}

function buildBeginTransactionEnvChangeToken([newValue, oldValue]: [Buffer, Buffer]) {
  return new BeginTransactionEnvChangeToken(newValue, oldValue);
}

function buildCommitTransactionEnvChangeToken([newValue, oldValue]: [Buffer, Buffer]) {
  return new CommitTransactionEnvChangeToken(newValue, oldValue);
}

function buildRollbackTransactionEnvChangeToken([newValue, oldValue]: [Buffer, Buffer]) {
  return new RollbackTransactionEnvChangeToken(newValue, oldValue);
}

function buildResetConnectionEnvChangeToken([newValue, oldValue]: [Buffer, Buffer]) {
  return new ResetConnectionEnvChangeToken(newValue, oldValue);
}

function buildDatabaseEnvChangeToken([newValue, oldValue]: [string, string]) {
  return new DatabaseEnvChangeToken(newValue, oldValue);
}

function buildLanguageEnvChangeToken([newValue, oldValue]: [string, string]) {
  return new LanguageEnvChangeToken(newValue, oldValue);
}

function buildCharsetEnvChangeToken([newValue, oldValue]: [string, string]) {
  return new CharsetEnvChangeToken(newValue, oldValue);
}

function buildDatabaseMirroringPartnerEnvChangeToken([newValue, oldValue]: [string, string]) {
  return new DatabaseMirroringPartnerEnvChangeToken(newValue, oldValue);
}

function buildRoutingEnvChangeToken([newValue, oldValue]: [Buffer, Buffer]) {
  const protocol = newValue.readUInt8(0);

  if (protocol !== 0) {
    throw new Error('Unknown protocol byte in routing change event');
  }

  const port = newValue.readUInt16LE(1);
  const serverLen = newValue.readUInt16LE(3);
  // 2 bytes per char, starting at offset 5
  const server = newValue.toString('ucs2', 5, 5 + (serverLen * 2));

  const newTokenValue = {
    protocol: protocol,
    port: port,
    server: server
  };

  return new RoutingEnvChangeToken(newTokenValue, oldValue);
}


function chooseEnvChangeType(type: number): Parser<EnvChangeToken> {
  switch (type) {
    case 1: {
      return new Map(new Sequence<[string, string]>([new BVarchar(), new BVarchar()]), buildDatabaseEnvChangeToken);
    }

    case 2: {
      return new Map(new Sequence<[string, string]>([new BVarchar(), new BVarchar()]), buildLanguageEnvChangeToken);
    }

    case 3: {
      return new Map(new Sequence<[string, string]>([new BVarchar(), new BVarchar()]), buildCharsetEnvChangeToken);
    }

    case 4: {
      return new Map(new Sequence<[string, string]>([new BVarchar(), new BVarchar()]), buildPacketSizeChangeToken);
    }

    case 7: {
      return new Map(new Sequence<[Buffer, Buffer]>([new BVarbyte(), new BVarbyte()]), buildCollationChangeToken);
    }

    case 8: {
      return new Map(new Sequence<[Buffer, Buffer]>([new BVarbyte(), new BVarbyte()]), buildBeginTransactionEnvChangeToken);
    }

    case 9: {
      return new Map(new Sequence<[Buffer, Buffer]>([new BVarbyte(), new BVarbyte()]), buildCommitTransactionEnvChangeToken);
    }

    case 10: {
      return new Map(new Sequence<[Buffer, Buffer]>([new BVarbyte(), new BVarbyte()]), buildRollbackTransactionEnvChangeToken);
    }


    case 13: {
      return new Map(new Sequence<[string, string]>([new BVarchar(), new BVarchar()]), buildDatabaseMirroringPartnerEnvChangeToken);
    }

    case 18: {
      return new Map(new Sequence<[Buffer, Buffer]>([new BVarbyte(), new BVarbyte()]), buildResetConnectionEnvChangeToken);
    }

    case 20: {
      return new Map(new Sequence<[Buffer, Buffer]>([new UsVarbyte(), new UsVarbyte()]), buildRoutingEnvChangeToken);
    }

    default: {
      throw new Error('unreachable');
    }
  }
}
