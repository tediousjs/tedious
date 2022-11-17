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

function chooseEnvChangeType(type: number): Parser<EnvChangeToken> {
  switch (type) {
    case 7: {
      return new Map(new Sequence<[Buffer, Buffer]>([new BVarbyte(), new BVarbyte()]), buildCollationChangeToken);
    }

    case 4: {
      return new Map(new Sequence<[string, string]>([new BVarchar(), new BVarchar()]), buildPacketSizeChangeToken);
    }

    default: {
      throw new Error('unreachable');
    }
  }
}
