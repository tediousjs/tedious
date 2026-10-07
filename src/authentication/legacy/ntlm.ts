import { type AuthenticationPlugin } from '../plugin';
import { type AuthenticationProvider } from '../provider';
import { assertOptionalStringOption, assertStringOption } from '../options';
import { emitLegacyAuthenticationDeprecationWarning } from './deprecation';
import { createNTLMRequest } from './ntlm-negotiate';
import NTLMResponsePayload, { type Md4 } from './ntlm-response';
import { loadOptionalDependency } from './optional-dependency';

export interface NtlmAuthentication {
  type: 'ntlm';
  options: {
    /**
     * User name from your windows account.
     */
    userName: string;
    /**
     * Password from your windows account.
     */
    password: string;
    /**
     * Once you set domain for ntlm authentication type, driver will connect to SQL Server using domain login.
     *
     * This is necessary for forming a connection using ntlm type
     */
    domain: string;
  };
}

export interface NtlmChallenge {
  magic: string;
  type: number;
  domainLen: number;
  domainMax: number;
  domainOffset: number;
  flags: number;
  nonce: Buffer;
  zeroes: Buffer;
  targetLen: number;
  targetMax: number;
  targetOffset: number;
  oddData: Buffer;
  domain: string;
  target: Buffer;
}

/**
 * Parses an NTLM `CHALLENGE_MESSAGE` sent by the server.
 *
 * @private
 */
export function parseChallenge(buffer: Buffer): NtlmChallenge {
  const challenge: Partial<NtlmChallenge> = {};

  challenge.magic = buffer.slice(0, 8).toString('utf8');
  challenge.type = buffer.readInt32LE(8);
  challenge.domainLen = buffer.readInt16LE(12);
  challenge.domainMax = buffer.readInt16LE(14);
  challenge.domainOffset = buffer.readInt32LE(16);
  challenge.flags = buffer.readInt32LE(20);
  challenge.nonce = buffer.slice(24, 32);
  challenge.zeroes = buffer.slice(32, 40);
  challenge.targetLen = buffer.readInt16LE(40);
  challenge.targetMax = buffer.readInt16LE(42);
  challenge.targetOffset = buffer.readInt32LE(44);
  challenge.oddData = buffer.slice(48, 56);
  challenge.domain = buffer.slice(56, 56 + challenge.domainLen).toString('ucs2');
  challenge.target = buffer.slice(56 + challenge.domainLen, 56 + challenge.domainLen + challenge.targetLen);

  return challenge as NtlmChallenge;
}

async function loadMd4(): Promise<Md4> {
  const { default: md4 } = await loadOptionalDependency('js-md4', 'ntlm', () => import('js-md4'));
  return (data) => Buffer.from(md4.arrayBuffer(data));
}

/**
 * Performs the NTLM exchange: sends a `NEGOTIATE_MESSAGE`, and answers the
 * server's `CHALLENGE_MESSAGE` with an `AUTHENTICATE_MESSAGE`.
 */
function* ntlmExchange(options: NtlmAuthentication['options'], md4: Md4): Generator<Buffer, void, Buffer | undefined> {
  const challenge = yield createNTLMRequest({ domain: options.domain });
  if (challenge === undefined) {
    return;
  }

  const payload = new NTLMResponsePayload({
    domain: options.domain,
    userName: options.userName,
    password: options.password,
    ntlmpacket: parseChallenge(challenge)
  }, md4);

  yield payload.data;
}

/**
 * Implements the deprecated `ntlm` authentication type on top of the
 * authentication provider API.
 *
 * @private
 */
export function createNtlmAuthenticationProvider(options: NtlmAuthentication['options']): AuthenticationProvider {
  return {
    async getCredentials() {
      const md4 = await loadMd4();
      return { type: 'sspi', exchange: ntlmExchange(options, md4) };
    }
  };
}

/**
 * The deprecated `ntlm` authentication type.
 *
 * @private
 */
export const ntlmAuthenticationPlugin: AuthenticationPlugin<Record<string, unknown>> = {
  type: 'ntlm',

  createProvider(options) {
    assertStringOption(options, 'domain');
    assertOptionalStringOption(options, 'userName');
    assertOptionalStringOption(options, 'password');

    emitLegacyAuthenticationDeprecationWarning('ntlm');

    return createNtlmAuthenticationProvider({
      userName: options.userName as string,
      password: options.password as string,
      domain: (options.domain as string).toUpperCase()
    });
  }
};
