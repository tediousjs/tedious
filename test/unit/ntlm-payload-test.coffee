NTLMPayload = require('../../src/ntlm-payload')

exports.respondToChallenge = (test) ->
    challenge =
        domain: 'domain'
        userName: 'username'
        password: 'password'
        ntlmpacket:
            target: new Buffer([170, 170, 170, 170]) # aa aa aa aa
            nonce: new Buffer([187, 187, 187, 187, 187, 187, 187, 187])

    response = new NTLMPayload(challenge)

    expectedLength = 
        8 +                 # NTLM protocol header
        4 +                 # NTLM message type
        8 +                 # lmv index
        8 +                 # ntlm index
        8 +                 # domain index
        8 +                 # user index
        16 +                # header index
        4 +                 # flags
        ( 2 * 6 ) +         # domain
        ( 2 * 8 ) +         # username
        24 +                # lmv2 data
        16 +                # ntlmv2 data
        8 +                 # flags
        8 +                 # timestamp
        8 +                 # client nonce
        4 +                 # placeholder
        4 +                 # target data
        4                   # placeholder

    domainName = response.data.slice(64, 76).toString('ucs2')
    userName = response.data.slice(76, 92).toString('ucs2')
    targetData = response.data.slice(160, 164).toString('hex')

    test.strictEqual(domainName, 'domain')
    test.strictEqual(userName, 'username')
    test.strictEqual(targetData, 'aaaaaaaa')
    
    test.strictEqual(expectedLength, response.data.length)

    test.done()