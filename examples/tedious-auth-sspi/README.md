# tedious-auth-sspi (draft)

A minimal [`tedious`](https://github.com/tediousjs/tedious) authentication
plugin for **Windows integrated authentication**. It calls the Windows SSPI
API (`secur32.dll`) through [koffi](https://koffi.dev), so it needs no native
build step, and `tedious` itself does not depend on it.

It logs in as the Windows user the Node.js process runs as, using Kerberos
when possible and falling back to NTLM (the `Negotiate` package).

## Usage

```sh
npm install tedious-auth-sspi
```

```json
{
  "server": "db.example.com",
  "authentication": { "type": "sspi" }
}
```

`tedious` loads the `tedious-auth-sspi` package for the `sspi` authentication
type. No code is needed beyond passing the configuration to `new Connection()`.

### Options

| Option    | Default                    | Description |
| --------- | -------------------------- | ----------- |
| `package` | `Negotiate`                | The SSPI package: `Negotiate`, `Kerberos` or `NTLM`. |
| `spn`     | `MSSQLSvc/<server>:<port>` | The server's service principal name. |
| `library` | `secur32.dll`              | The SSPI library to load. Mostly useful for testing. |

## How it works

`getCredentials()` returns `sspi` credentials whose `exchange` is an async
generator around `InitializeSecurityContextW`:

1. `AcquireCredentialsHandleW` gets the current user's outbound credentials.
2. The first call to `InitializeSecurityContextW` produces the token sent in
   the LOGIN7 message.
3. Every token the server sends back is passed to `InitializeSecurityContextW`
   again, and its output is sent to the server. That includes the final token
   sent along with the login acknowledgement, which completes mutual
   authentication (`ISC_REQ_MUTUAL_AUTH`).
4. The `finally` block calls `DeleteSecurityContext` and
   `FreeCredentialsHandle` when the login attempt ends. `tedious` calls
   `return()` on the generator in every case, including timeouts and aborts.

The SSPI calls run on a worker thread (koffi's `.async()`), because acquiring
a Kerberos ticket can involve a round trip to the domain controller.

## Limitations of this draft

- **Not yet run on Windows.** The FFI layer and the exchange were tested on
  Linux against a stand-in library with the same signatures as `secur32.dll`,
  including a full login through `tedious` against a fake TDS server.
- **The SPN uses the server name as configured.** Kerberos needs the server's
  fully qualified domain name (and a registered SPN). Given a short name or an
  IP address, `Negotiate` silently falls back to NTLM. Microsoft's drivers
  canonicalize the name via DNS first. Set `spn` explicitly if needed.
- **Current user only.** Logging in as a different Windows user (explicit
  `SEC_WINNT_AUTH_IDENTITY` credentials) is not supported.
- **No channel binding.** SQL Server configured with Extended Protection set
  to *Required* rejects logins that do not include a channel binding token.
- **No delegation.** `ISC_REQ_DELEGATE` is not requested, so linked server
  queries cannot use the caller's identity.
