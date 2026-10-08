'use strict';

// A minimal `tedious` authentication plugin for Windows integrated
// authentication, implemented on top of the Windows SSPI API via FFI.
//
// Usage (e.g. from a JSON configuration):
//
//   { "server": "db.example.com", "authentication": { "type": "sspi" } }
//
// This logs in as the Windows user the Node.js process runs as. It is a
// draft: see README.md for what it does and does not do.

const koffi = require('koffi');

const SEC_E_OK = 0x00000000;
const SEC_I_CONTINUE_NEEDED = 0x00090312;
const SEC_I_COMPLETE_NEEDED = 0x00090313;
const SEC_I_COMPLETE_AND_CONTINUE = 0x00090314;

const SECPKG_CRED_OUTBOUND = 0x2;
const SECURITY_NATIVE_DREP = 0x10;
const SECBUFFER_VERSION = 0;
const SECBUFFER_TOKEN = 2;

const ISC_REQ_MUTUAL_AUTH = 0x00000002;
const ISC_REQ_ALLOCATE_MEMORY = 0x00000100;
const ISC_REQ_CONNECTION = 0x00000800;

const CONTEXT_REQUIREMENTS = ISC_REQ_MUTUAL_AUTH | ISC_REQ_CONNECTION | ISC_REQ_ALLOCATE_MEMORY;

const ERROR_NAMES = {
  0x80090303: 'SEC_E_TARGET_UNKNOWN',
  0x80090304: 'SEC_E_INTERNAL_ERROR',
  0x80090308: 'SEC_E_INVALID_TOKEN',
  0x8009030C: 'SEC_E_LOGON_DENIED',
  0x8009030E: 'SEC_E_NO_CREDENTIALS',
  0x80090311: 'SEC_E_NO_AUTHENTICATING_AUTHORITY',
  0x80090322: 'SEC_E_WRONG_PRINCIPAL',
  0x80090305: 'SEC_E_SECPKG_NOT_FOUND'
};

// `CredHandle` and `CtxtHandle` are both `SecHandle`s.
const SecHandle = koffi.struct('SecHandle', {
  dwLower: 'uintptr_t',
  dwUpper: 'uintptr_t'
});

const TimeStamp = koffi.struct('TimeStamp', {
  LowPart: 'uint32_t',
  HighPart: 'int32_t'
});

const SecBuffer = koffi.struct('SecBuffer', {
  cbBuffer: 'uint32_t',
  BufferType: 'uint32_t',
  pvBuffer: 'void *'
});

const SecBufferDesc = koffi.struct('SecBufferDesc', {
  ulVersion: 'uint32_t',
  cBuffers: 'uint32_t',
  pBuffers: 'SecBuffer *'
});

const libraries = new Map();

function loadSspi(path) {
  let sspi = libraries.get(path);
  if (sspi !== undefined) {
    return sspi;
  }

  const lib = koffi.load(path);
  sspi = {
    AcquireCredentialsHandleW: lib.func('int32_t __stdcall AcquireCredentialsHandleW(str16 pszPrincipal, str16 pszPackage, uint32_t fCredentialUse, void *pvLogonId, void *pAuthData, void *pGetKeyFn, void *pvGetKeyArgument, _Out_ SecHandle *phCredential, _Out_ TimeStamp *ptsExpiry)'),
    InitializeSecurityContextW: lib.func('int32_t __stdcall InitializeSecurityContextW(SecHandle *phCredential, SecHandle *phContext, str16 pszTargetName, uint32_t fContextReq, uint32_t Reserved1, uint32_t TargetDataRep, SecBufferDesc *pInput, uint32_t Reserved2, _Out_ SecHandle *phNewContext, SecBufferDesc *pOutput, _Out_ uint32_t *pfContextAttr, _Out_ TimeStamp *ptsExpiry)'),
    CompleteAuthToken: lib.func('int32_t __stdcall CompleteAuthToken(SecHandle *phContext, SecBufferDesc *pToken)'),
    FreeContextBuffer: lib.func('int32_t __stdcall FreeContextBuffer(void *pvContextBuffer)'),
    DeleteSecurityContext: lib.func('int32_t __stdcall DeleteSecurityContext(SecHandle *phContext)'),
    FreeCredentialsHandle: lib.func('int32_t __stdcall FreeCredentialsHandle(SecHandle *phCredential)')
  };

  libraries.set(path, sspi);
  return sspi;
}

/**
 * Runs a native function on a worker thread, as acquiring credentials and
 * security tokens can involve network round trips (e.g. to a Kerberos KDC).
 */
function callAsync(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn.async(...args, (err, result) => {
      err ? reject(err) : resolve(result);
    });
  });
}

function check(status, functionName) {
  if (status === SEC_E_OK || status === SEC_I_CONTINUE_NEEDED || status === SEC_I_COMPLETE_NEEDED || status === SEC_I_COMPLETE_AND_CONTINUE) {
    return status;
  }

  const code = status >>> 0;
  const name = ERROR_NAMES[code] ?? 'unknown error';
  const error = new Error(`${functionName} failed with ${name} (0x${code.toString(16).toUpperCase().padStart(8, '0')}).`);
  error.code = code;
  throw error;
}

/**
 * Allocates a native `SecBuffer` holding a copy of `data` (or an empty
 * token buffer for SSPI to fill if `data` is `undefined`).
 */
function allocSecBuffer(data) {
  const buffer = koffi.alloc(SecBuffer, 1);
  let bytes = null;

  if (data !== undefined && data.length > 0) {
    bytes = koffi.alloc('uint8_t', data.length);
    new Uint8Array(koffi.view(bytes, data.length)).set(data);
  }

  koffi.encode(buffer, SecBuffer, {
    cbBuffer: data === undefined ? 0 : data.length,
    BufferType: SECBUFFER_TOKEN,
    pvBuffer: bytes
  });

  return {
    desc: { ulVersion: SECBUFFER_VERSION, cBuffers: 1, pBuffers: buffer },
    read() {
      return koffi.decode(buffer, SecBuffer);
    },
    free() {
      koffi.free(buffer);
      if (bytes !== null) {
        koffi.free(bytes);
      }
    }
  };
}

/**
 * Drives the SSPI exchange. See `SspiExchange` in `tedious` for the protocol.
 */
async function* sspiExchange(sspi, packageName, spn) {
  const credential = {};
  check(await callAsync(sspi.AcquireCredentialsHandleW, null, packageName, SECPKG_CRED_OUTBOUND, null, null, null, null, credential, {}), 'AcquireCredentialsHandle');

  let context = null;

  async function step(serverToken) {
    const input = serverToken === undefined ? null : allocSecBuffer(serverToken);
    const output = allocSecBuffer(undefined);

    try {
      const newContext = {};
      const status = check(await callAsync(
        sspi.InitializeSecurityContextW,
        credential, context, spn, CONTEXT_REQUIREMENTS, 0, SECURITY_NATIVE_DREP,
        input && input.desc, 0, newContext, output.desc, [0], {}
      ), 'InitializeSecurityContext');
      context = newContext;

      if (status === SEC_I_COMPLETE_NEEDED || status === SEC_I_COMPLETE_AND_CONTINUE) {
        check(sspi.CompleteAuthToken(context, output.desc), 'CompleteAuthToken');
      }

      const { cbBuffer, pvBuffer } = output.read();
      if (pvBuffer === null) {
        return Buffer.alloc(0);
      }

      try {
        // Copy the token out of the memory SSPI allocated, before freeing it.
        return Buffer.from(new Uint8Array(koffi.view(pvBuffer, cbBuffer)));
      } finally {
        sspi.FreeContextBuffer(pvBuffer);
      }
    } finally {
      output.free();
      input?.free();
    }
  }

  try {
    // The first token goes into the LOGIN7 message. Every token the server
    // sends back gets answered, including the final one sent along with the
    // login acknowledgement (which completes mutual authentication).
    let serverToken = yield await step(undefined);
    while (serverToken !== undefined) {
      serverToken = yield await step(serverToken);
    }
  } finally {
    if (context !== null) {
      sspi.DeleteSecurityContext(context);
    }
    sspi.FreeCredentialsHandle(credential);
  }
}

/**
 * Creates the authentication provider. Called by `tedious` with the
 * `authentication.options` from the connection configuration.
 *
 * @param {object} options
 * @param {string} [options.package] The SSPI package to use: `Negotiate`
 *   (default), `Kerberos` or `NTLM`.
 * @param {string} [options.spn] The service principal name of the server.
 *   Defaults to `MSSQLSvc/<server>:<port>`.
 * @param {string} [options.library] The SSPI library to load. Defaults to
 *   `secur32.dll`.
 */
exports.createProvider = function createProvider(options) {
  const { package: packageName = 'Negotiate', spn, library } = options;

  if (typeof packageName !== 'string') {
    throw new TypeError('The "config.authentication.options.package" property must be of type string.');
  }

  if (spn !== undefined && typeof spn !== 'string') {
    throw new TypeError('The "config.authentication.options.spn" property must be of type string.');
  }

  if (library !== undefined && typeof library !== 'string') {
    throw new TypeError('The "config.authentication.options.library" property must be of type string.');
  }

  if (library === undefined && process.platform !== 'win32') {
    throw new Error('The `sspi` authentication type is only supported on Windows.');
  }

  // Load the library right away, so a missing library is reported when
  // the connection is created.
  const sspi = loadSspi(library ?? 'secur32.dll');

  return {
    getCredentials({ server, port }) {
      return {
        type: 'sspi',
        exchange: sspiExchange(sspi, packageName, spn ?? `MSSQLSvc/${server}:${port}`)
      };
    }
  };
};
