const { createBenchmark } = require('../common');

const { ColumnEncryptionCipher } = require('tedious/lib/always-encrypted/cipher');

const bench = createBenchmark(main, {
  n: [100000],
  operation: ['encrypt-deterministic', 'encrypt-randomized', 'decrypt'],
  size: [8, 100, 8000]
});

function main({ n, operation, size }) {
  const cipher = new ColumnEncryptionCipher(Buffer.alloc(32, 0x01));

  const plaintext = Buffer.alloc(size, 0x02);
  const cell = cipher.encrypt(plaintext, true);

  bench.start();

  switch (operation) {
    case 'encrypt-deterministic':
      for (let i = 0; i < n; i++) {
        cipher.encrypt(plaintext, true);
      }
      break;

    case 'encrypt-randomized':
      for (let i = 0; i < n; i++) {
        cipher.encrypt(plaintext, false);
      }
      break;

    case 'decrypt':
      for (let i = 0; i < n; i++) {
        cipher.decrypt(cell);
      }
      break;
  }

  bench.end(n);
}
