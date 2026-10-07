import { type AuthenticationProvider } from '../provider';
import { createNTLMRequest } from './ntlm-negotiate';
import NTLMResponsePayload, { type Md4 } from './ntlm-response';
import { loadOptionalDependency } from './optional-dependency';

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
 * Implements the deprecated `ntlm` authentication type on top of the
 * authentication provider API.
 *
 * @private
 */
export function createNtlmAuthenticationProvider(options: { domain: string, userName: string, password: string }): AuthenticationProvider {
  return {
    async createSession() {
      const md4 = await loadMd4();

      return {
        type: 'sspi',
        initialToken: createNTLMRequest({ domain: options.domain }),
        handleChallenge(token) {
          const payload = new NTLMResponsePayload({
            domain: options.domain,
            userName: options.userName,
            password: options.password,
            ntlmpacket: parseChallenge(token)
          }, md4);

          return payload.data;
        }
      };
    }
  };
}
