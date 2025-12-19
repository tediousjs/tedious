import { Collation } from '../../src/collation';
import { typeByName as TYPE } from '../../src/data-type';
import { assert } from 'chai';

describe('Validations', function() {
  it('Bit', () => {
    let value = TYPE.Bit.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Bit.validate(true);
    assert.strictEqual(value, true);

    value = TYPE.Bit.validate('asdf');
    assert.strictEqual(value, true);

    value = TYPE.Bit.validate('');
    assert.strictEqual(value, false);

    value = TYPE.Bit.validate(55);
    assert.strictEqual(value, true);

    value = TYPE.Bit.validate(0);
    assert.strictEqual(value, false);
  });

  it('TinyInt', () => {
    let value = TYPE.TinyInt.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.TinyInt.validate(15);
    assert.strictEqual(value, 15);

    value = TYPE.TinyInt.validate('15');
    assert.strictEqual(value, 15);

    assert.throws(() => {
      TYPE.TinyInt.validate(256);
    }, TypeError, 'Value must be between 0 and 255, inclusive.');
  });

  it('SmallInt', () => {
    let value = TYPE.SmallInt.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.SmallInt.validate(-32768);
    assert.strictEqual(value, -32768);

    assert.throws(() => {
      TYPE.SmallInt.validate(-32769);
    }, TypeError, 'Value must be between -32768 and 32767, inclusive.');
  });

  it('Int', () => {
    let value = TYPE.Int.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Int.validate(2147483647);
    assert.strictEqual(value, 2147483647);

    assert.throws(() => {
      TYPE.Int.validate(2147483648);
    }, TypeError, 'Value must be between -2147483648 and 2147483647, inclusive.');
  });

  it('BigInt', () => {
    let value = TYPE.BigInt.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.BigInt.validate(2147483647);
    assert.strictEqual(value, 2147483647n);

    value = TYPE.BigInt.validate(-9223372036854775808n);
    assert.strictEqual(value, -9223372036854775808n);

    value = TYPE.BigInt.validate(9223372036854775807n);
    assert.strictEqual(value, 9223372036854775807n);

    assert.throws(() => {
      TYPE.BigInt.validate(-9223372036854775809n);
    }, TypeError, 'Value must be between -9223372036854775808 and 9223372036854775807, inclusive.');

    assert.throws(() => {
      TYPE.BigInt.validate(9223372036854775808n);
    }, TypeError, 'Value must be between -9223372036854775808 and 9223372036854775807, inclusive.');

    assert.throws(() => {
      TYPE.BigInt.validate(0.5);
    }, RangeError, 'The number 0.5 cannot be converted to a BigInt because it is not an integer');
  });

  it('SmallDateTime', () => {
    let value = TYPE.SmallDateTime.validate(null);
    assert.strictEqual(value, null);

    const date = new Date();
    value = TYPE.SmallDateTime.validate(date);
    assert.strictEqual(+value!, +date);

    value = TYPE.SmallDateTime.validate('2015-02-12T16:43:13.632Z');
    assert.strictEqual(+value!, 1423759393632);

    assert.throws(() => {
      TYPE.SmallDateTime.validate('xxx');
    }, TypeError, 'Invalid date.');
  });

  it('DateTime', () => {
    let value = TYPE.DateTime.validate(null);
    assert.strictEqual(value, null);

    const date = new Date();
    value = TYPE.DateTime.validate(date);
    assert.strictEqual(+value!, +date);

    value = TYPE.DateTime.validate('2015-02-12T16:43:13.632Z');
    assert.strictEqual(+value!, 1423759393632);

    assert.throws(() => {
      TYPE.DateTime.validate('xxx');
    }, TypeError, 'Invalid date.');
  });

  it('DateTime2', () => {
    let value = TYPE.DateTime2.validate(null);
    assert.strictEqual(value, null);

    const date = new Date();
    value = TYPE.DateTime2.validate(date);
    assert.strictEqual(+value!, +date);

    value = TYPE.DateTime2.validate('2015-02-12T16:43:13.632Z');
    assert.strictEqual(+value!, 1423759393632);

    assert.throws(() => {
      TYPE.DateTime2.validate('xxx');
    }, TypeError, 'Invalid date.');
  });

  it('Time', () => {
    let value = TYPE.Time.validate(null);
    assert.strictEqual(value, null);

    const date = new Date();
    value = TYPE.Time.validate(date);
    assert.strictEqual(+value!, +date);

    value = TYPE.Time.validate('2015-02-12T16:43:13.632Z');
    assert.strictEqual(+value!, 1423759393632);

    assert.throws(() => {
      TYPE.Time.validate('xxx');
    }, TypeError, 'Invalid time.');
  });

  it('DateTimeOffset', () => {
    let value = TYPE.DateTimeOffset.validate(null);
    assert.strictEqual(value, null);

    const date = new Date();
    value = TYPE.DateTimeOffset.validate(date);
    assert.strictEqual(+value!, +date);

    value = TYPE.DateTimeOffset.validate('2015-02-12T16:43:13.632Z');
    assert.strictEqual(+value!, 1423759393632);

    assert.throws(() => {
      TYPE.DateTimeOffset.validate('xxx');
    }, TypeError, 'Invalid date.');
  });

  it('Real', () => {
    let value = TYPE.Real.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Real.validate(1516.61556);
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Real.validate('1516.61556');
    assert.strictEqual(value, 1516.61556);

    assert.throws(() => {
      TYPE.Real.validate('xxx');
    }, TypeError, 'Invalid number.');
  });

  it('Float', () => {
    let value = TYPE.Float.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Float.validate(1516.61556);
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Float.validate('1516.61556');
    assert.strictEqual(value, 1516.61556);

    assert.throws(() => {
      TYPE.Float.validate('xxx');
    }, TypeError, 'Invalid number.');
  });

  it('Decimal', () => {
    let value = TYPE.Decimal.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Decimal.validate(1516.61556);
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Decimal.validate('1516.61556');
    assert.strictEqual(value, 1516.61556);

    assert.throws(() => {
      TYPE.Decimal.validate('xxx');
    }, TypeError, 'Invalid number.');
  });

  it('Numeric', () => {
    let value = TYPE.Numeric.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Numeric.validate(1516.61556);
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Numeric.validate('1516.61556');
    assert.strictEqual(value, 1516.61556);

    assert.throws(() => {
      TYPE.Numeric.validate('xxx');
    }, TypeError, 'Invalid number.');
  });

  it('Money', () => {
    let value = TYPE.Money.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Money.validate(1516.61556);
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Money.validate('1516.61556');
    assert.strictEqual(value, 1516.61556);

    assert.throws(() => {
      TYPE.Money.validate('xxx');
    }, TypeError, 'Invalid number.');
  });

  it('SmallMoney', () => {
    let value = TYPE.SmallMoney.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.SmallMoney.validate(214748.3647);
    assert.strictEqual(value, 214748.3647);

    assert.throws(() => {
      TYPE.SmallMoney.validate(214748.3648);
    }, TypeError, 'Value must be between -214748.3648 and 214748.3647');
  });

  it('Image', () => {
    let value = TYPE.Image.validate(null);
    assert.strictEqual(value, null);

    const buffer = Buffer.from([0x00, 0x01]);
    value = TYPE.Image.validate(buffer);
    assert.strictEqual(value, buffer);

    assert.throws(() => {
      TYPE.Image.validate({});
    }, TypeError, 'Invalid buffer.');
  });

  it('Binary', () => {
    let value = TYPE.Binary.validate(null);
    assert.strictEqual(value, null);

    const buffer = Buffer.from([0x00, 0x01]);
    value = TYPE.Binary.validate(buffer);
    assert.strictEqual(value, buffer);

    assert.throws(() => {
      TYPE.Binary.validate({});
    }, TypeError, 'Invalid buffer.');
  });

  it('VarBinary', () => {
    let value = TYPE.VarBinary.validate(null);
    assert.strictEqual(value, null);

    const buffer = Buffer.from([0x00, 0x01]);
    value = TYPE.VarBinary.validate(buffer);
    assert.strictEqual(value, buffer);

    assert.throws(() => {
      TYPE.VarBinary.validate({});
    }, TypeError, 'Invalid buffer.');
  });

  it('Text', () => {
    // SQL_Latin1_General_CP1_CI_AS
    const collation = Collation.fromBuffer(Buffer.from([ 0x09, 0x04, 0xd0, 0x00, 0x34 ]));

    let value = TYPE.Text.validate(null, collation);
    assert.isNull(value);

    value = TYPE.Text.validate('asdf', collation);
    assert.deepEqual(value, Buffer.from('asdf', 'ascii'));

    assert.throws(() => {
      TYPE.Text.validate(Buffer.from('asdf'), collation);
    }, TypeError, 'Invalid string.');

    assert.throws(() => {
      TYPE.Text.validate({ toString: null }, collation);
    }, TypeError, 'Invalid string.');
  });

  it('VarChar', () => {
    // SQL_Latin1_General_CP1_CI_AS
    const collation = Collation.fromBuffer(Buffer.from([ 0x09, 0x04, 0xd0, 0x00, 0x34 ]));

    let value = TYPE.VarChar.validate(null, collation);
    assert.isNull(value);

    value = TYPE.VarChar.validate('asdf', collation);
    assert.deepEqual(value, Buffer.from('asdf', 'ascii'));

    assert.throws(() => {
      TYPE.VarChar.validate(Buffer.from('asdf'), collation);
    }, TypeError, 'Invalid string.');

    assert.throws(() => {
      TYPE.VarChar.validate({ toString: null }, collation);
    }, TypeError, 'Invalid string.');
  });

  it('NVarChar', () => {
    let value = TYPE.NVarChar.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.NVarChar.validate('asdf');
    assert.strictEqual(value, 'asdf');

    assert.throws(() => {
      TYPE.NVarChar.validate(Buffer.from('asdf', 'utf8'));
    }, TypeError, 'Invalid string.');

    assert.throws(() => {
      TYPE.NVarChar.validate({ toString: null });
    }, TypeError, 'Invalid string.');
  });

  it('Char', () => {
    // SQL_Latin1_General_CP1_CI_AS
    const collation = Collation.fromBuffer(Buffer.from([ 0x09, 0x04, 0xd0, 0x00, 0x34 ]));

    let value = TYPE.Char.validate(null, collation);
    assert.isNull(value);

    value = TYPE.Char.validate('asdf', collation);
    assert.deepEqual(value, Buffer.from('asdf', 'ascii'));

    assert.throws(() => {
      TYPE.Char.validate(Buffer.from('asdf'), collation);
    }, TypeError, 'Invalid string.');

    assert.throws(() => {
      TYPE.Char.validate({ toString: null }, collation);
    }, TypeError, 'Invalid string.');
  });

  it('NChar', () => {
    let value = TYPE.NChar.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.NChar.validate('asdf');
    assert.strictEqual(value, 'asdf');

    assert.throws(() => {
      TYPE.NChar.validate(Buffer.from('asdf', 'utf8'));
    }, TypeError, 'Invalid string.');

    assert.throws(() => {
      TYPE.NChar.validate({ toString: null });
    }, TypeError, 'Invalid string.');
  });

  it('TVP', () => {
    let value = TYPE.TVP.validate(null);
    assert.strictEqual(value, null);

    const table = { columns: [], rows: [] };
    value = TYPE.TVP.validate(table);
    assert.strictEqual(value, table);

    assert.throws(() => {
      TYPE.TVP.validate({});
    }, TypeError, 'Invalid table.');
  });
});
