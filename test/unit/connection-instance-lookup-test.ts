import { assert } from 'chai';
import * as dgram from 'dgram';
import { Connection, ConnectionError } from '../../src/tedious';

describe('Connecting to a named instance', function() {
  describe('when the SQL Server Browser does not respond', function() {
    let browser: dgram.Socket | undefined;

    beforeEach(function(done) {
      // A SQL Server Browser that receives requests but never answers them.
      const socket = dgram.createSocket('udp4');
      socket.once('error', () => {
        // The Browser port is already in use on this machine (e.g. by a real
        // SQL Server Browser), so this scenario can't be simulated here.
        socket.close();
        browser = undefined;
        done();
      });
      socket.bind(1434, '127.0.0.1', () => {
        socket.removeAllListeners('error');
        browser = socket;
        done();
      });
    });

    afterEach(function(done) {
      if (browser) {
        browser.close(() => done());
      } else {
        done();
      }
    });

    it('fails with a timeout error that names the SQL Server Browser', function(done) {
      if (!browser) {
        return this.skip();
      }

      const connection = new Connection({
        server: '127.0.0.1',
        options: {
          instanceName: 'SQLEXPRESS',
          connectTimeout: 500,
          encrypt: false
        }
      });

      connection.connect((err) => {
        connection.close();

        try {
          assert.instanceOf(err, ConnectionError);
          assert.strictEqual((err as ConnectionError).code, 'ETIMEOUT');
          assert.strictEqual(
            err!.message,
            'Failed to connect to 127.0.0.1\\SQLEXPRESS in 500ms: timed out waiting for the SQL Server Browser on 127.0.0.1 (UDP port 1434) to return the port of instance \'SQLEXPRESS\''
          );
        } catch (assertionError) {
          return done(assertionError);
        }

        done();
      });
    });
  });
});
