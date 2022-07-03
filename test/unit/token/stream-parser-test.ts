import { assert } from 'chai';
import { AbortController, AbortSignal } from 'node-abort-controller';
import Debug from '../../../src/debug';
import StreamParser, { ParserOptions } from '../../../src/token/stream-parser';

describe('StreamParser', function() {
  describe('.parseTokens', function() {
    let debug: Debug;
    let input: Buffer[];
    let controller: AbortController;
    let signal: AbortSignal;
    let options: ParserOptions;

    beforeEach(function() {
      debug = new Debug();
      input = [
        Buffer.from('FE0000E0000000000000000000', 'hex'),
        Buffer.from('FE0000E0000000000000000000', 'hex'),
        Buffer.from('FE0000E0000000000000000000', 'hex')
      ];

      controller = new AbortController();
      signal = controller.signal;
      options = {
        tdsVersion: '7_2',
        useUTC: true,
        lowerCaseGuids: true,
        useColumnNames: false,
        camelCaseColumns: false,
        columnNameReplacer: undefined
      };
    });

    it('yields parsed tokens', async function() {
      const iterable = StreamParser.parseTokens(input, debug, options, signal);

      const tokens = [];
      for await (const token of iterable) {
        tokens.push(token);
      }

      assert.lengthOf(tokens, 3);
    });

    it('aborts parsing when the signal is aborted', async function() {
      const iterable = StreamParser.parseTokens(input, debug, options, signal);

      const tokens = [];

      let hadError = false;
      try {
        for await (const token of iterable) {
          tokens.push(token);
          controller.abort();
        }
      } catch (err: any) {
        hadError = true;

        assert.instanceOf(err, Error);
        assert.strictEqual(err.message, 'aborted');
      }

      assert.isTrue(hadError);
      assert.lengthOf(tokens, 1);
    });

    it('immediately aborts parsing when the signal is aborted from the start', async function() {
      controller.abort();

      const iterable = StreamParser.parseTokens(input, debug, options, signal);
      const tokens = [];

      let hadError = false;
      try {
        for await (const token of iterable) {
          tokens.push(token);
        }
      } catch (err: any) {
        hadError = true;

        assert.instanceOf(err, Error);
        assert.strictEqual(err.message, 'aborted');
      }

      assert.isTrue(hadError);
      assert.lengthOf(tokens, 0);
    });
  });
});
