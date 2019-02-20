var TYPE = require('../../src/data-type').typeByName;
var assert = require('chai').assert;

describe('Validations', function() {
  it('Bit', () => {
    var value = TYPE.Bit.validate(null);
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
    var value = TYPE.TinyInt.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.TinyInt.validate(15);
    assert.strictEqual(value, 15);

    value = TYPE.TinyInt.validate('15');
    assert.strictEqual(value, 15);

    value = TYPE.TinyInt.validate(256);
    assert.ok(value instanceof TypeError);
  });

  it('SmallInt', () => {
    var value = TYPE.SmallInt.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.SmallInt.validate(-32768);
    assert.strictEqual(value, -32768);

    value = TYPE.SmallInt.validate(-32769);
    assert.ok(value instanceof TypeError);
  });

  it('Int', () => {
    var value = TYPE.Int.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Int.validate(2147483647);
    assert.strictEqual(value, 2147483647);

    value = TYPE.Int.validate(2147483648);
    assert.ok(value instanceof TypeError);
  });

  it('BigInt', () => {
    var value = TYPE.BigInt.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.BigInt.validate(2147483647);
    assert.strictEqual(value, 2147483647);

    value = TYPE.BigInt.validate(-9007199254740991);
    assert.strictEqual(value, -9007199254740991);

    value = TYPE.BigInt.validate(9007199254740991);
    assert.strictEqual(value, 9007199254740991);

    value = TYPE.BigInt.validate(-9007199254740992);
    assert.ok(value instanceof TypeError);

    value = TYPE.BigInt.validate(9007199254740992);
    assert.ok(value instanceof TypeError);
  });

  it('SmallDateTime', () => {
    var value = TYPE.SmallDateTime.validate(null);
    assert.strictEqual(value, null);

    var date = new Date();
    value = TYPE.SmallDateTime.validate(date);
    assert.strictEqual(+value, +date);

    value = TYPE.SmallDateTime.validate('2015-02-12T16:43:13.632Z');
    assert.strictEqual(+value, 1423759393632);

    value = TYPE.SmallDateTime.validate('xxx');
    assert.ok(value instanceof TypeError);
  });

  it('DateTime', () => {
    var value = TYPE.DateTime.validate(null);
    assert.strictEqual(value, null);

    var date = new Date();
    value = TYPE.DateTime.validate(date);
    assert.strictEqual(+value, +date);

    value = TYPE.DateTime.validate('2015-02-12T16:43:13.632Z');
    assert.strictEqual(+value, 1423759393632);

    value = TYPE.DateTime.validate('xxx');
    assert.ok(value instanceof TypeError);
  });

  it('DateTime2', () => {
    var value = TYPE.DateTime2.validate(null);
    assert.strictEqual(value, null);

    var date = new Date();
    value = TYPE.DateTime2.validate(date);
    assert.strictEqual(+value, +date);

    value = TYPE.DateTime2.validate('2015-02-12T16:43:13.632Z');
    assert.strictEqual(+value, 1423759393632);

    value = TYPE.DateTime2.validate('xxx');
    assert.ok(value instanceof TypeError);
  });

  it('Time', () => {
    var value = TYPE.Time.validate(null);
    assert.strictEqual(value, null);

    var date = new Date();
    value = TYPE.Time.validate(date);
    assert.strictEqual(+value, +date);

    value = TYPE.Time.validate('2015-02-12T16:43:13.632Z');
    assert.strictEqual(+value, 1423759393632);

    value = TYPE.Time.validate('xxx');
    assert.ok(value instanceof TypeError);
  });

  it('DateTimeOffset', () => {
    var value = TYPE.DateTimeOffset.validate(null);
    assert.strictEqual(value, null);

    var date = new Date();
    value = TYPE.DateTimeOffset.validate(date);
    assert.strictEqual(+value, +date);

    value = TYPE.DateTimeOffset.validate('2015-02-12T16:43:13.632Z');
    assert.strictEqual(+value, 1423759393632);

    value = TYPE.DateTimeOffset.validate('xxx');
    assert.ok(value instanceof TypeError);
  });

  it('Real', () => {
    var value = TYPE.Real.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Real.validate(1516.61556);
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Real.validate('1516.61556');
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Real.validate('xxx');
    assert.ok(value instanceof TypeError);
  });

  it('Float', () => {
    var value = TYPE.Float.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Float.validate(1516.61556);
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Float.validate('1516.61556');
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Float.validate('xxx');
    assert.ok(value instanceof TypeError);
  });

  it('Decimal', () => {
    var value = TYPE.Decimal.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Decimal.validate(1516.61556);
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Decimal.validate('1516.61556');
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Decimal.validate('xxx');
    assert.ok(value instanceof TypeError);
  });

  it('Numeric', () => {
    var value = TYPE.Numeric.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Numeric.validate(1516.61556);
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Numeric.validate('1516.61556');
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Numeric.validate('xxx');
    assert.ok(value instanceof TypeError);
  });

  it('Money', () => {
    var value = TYPE.Money.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Money.validate(1516.61556);
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Money.validate('1516.61556');
    assert.strictEqual(value, 1516.61556);

    value = TYPE.Money.validate('xxx');
    assert.ok(value instanceof TypeError);
  });

  it('SmallMoney', () => {
    var value = TYPE.SmallMoney.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.SmallMoney.validate(214748.3647);
    assert.strictEqual(value, 214748.3647);

    value = TYPE.SmallMoney.validate(214748.3648);
    assert.ok(value instanceof TypeError);
  });

  it('Image', () => {
    var value = TYPE.Image.validate(null);
    assert.strictEqual(value, null);

    var buffer = Buffer.from([0x00, 0x01]);
    value = TYPE.Image.validate(buffer);
    assert.strictEqual(value, buffer);

    value = TYPE.Image.validate({});
    assert.ok(value instanceof TypeError);
  });

  it('Binary', () => {
    var value = TYPE.Binary.validate(null);
    assert.strictEqual(value, null);

    var buffer = Buffer.from([0x00, 0x01]);
    value = TYPE.Binary.validate(buffer);
    assert.strictEqual(value, buffer);

    value = TYPE.Binary.validate({});
    assert.ok(value instanceof TypeError);
  });

  it('VarBinary', () => {
    var value = TYPE.VarBinary.validate(null);
    assert.strictEqual(value, null);

    var buffer = Buffer.from([0x00, 0x01]);
    value = TYPE.VarBinary.validate(buffer);
    assert.strictEqual(value, buffer);

    value = TYPE.VarBinary.validate({});
    assert.ok(value instanceof TypeError);
  });

  it('Text', () => {
    var value = TYPE.Text.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Text.validate('asdf');
    assert.strictEqual(value, 'asdf');

    value = TYPE.Text.validate(Buffer.from('asdf', 'utf8'));
    assert.strictEqual(value, 'asdf');

    value = TYPE.Text.validate({ toString: null });
    assert.ok(value instanceof TypeError);
  });

  it('VarChar', () => {
    var value = TYPE.VarChar.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.VarChar.validate('asdf');
    assert.strictEqual(value, 'asdf');

    value = TYPE.VarChar.validate(Buffer.from('asdf', 'utf8'));
    assert.strictEqual(value, 'asdf');

    value = TYPE.VarChar.validate({ toString: null });
    assert.ok(value instanceof TypeError);
  });

  it('NVarChar', () => {
    var value = TYPE.NVarChar.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.NVarChar.validate('asdf');
    assert.strictEqual(value, 'asdf');

    value = TYPE.NVarChar.validate(Buffer.from('asdf', 'utf8'));
    assert.strictEqual(value, 'asdf');

    value = TYPE.NVarChar.validate({ toString: null });
    assert.ok(value instanceof TypeError);
  });

  it('Char', () => {
    var value = TYPE.Char.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.Char.validate('asdf');
    assert.strictEqual(value, 'asdf');

    value = TYPE.Char.validate(Buffer.from('asdf', 'utf8'));
    assert.strictEqual(value, 'asdf');

    value = TYPE.Char.validate({ toString: null });
    assert.ok(value instanceof TypeError);
  });

  it('NChar', () => {
    var value = TYPE.NChar.validate(null);
    assert.strictEqual(value, null);

    value = TYPE.NChar.validate('asdf');
    assert.strictEqual(value, 'asdf');

    value = TYPE.NChar.validate(Buffer.from('asdf', 'utf8'));
    assert.strictEqual(value, 'asdf');

    value = TYPE.NChar.validate({ toString: null });
    assert.ok(value instanceof TypeError);
  });

  it('TVP', () => {
    var value = TYPE.TVP.validate(null);
    assert.strictEqual(value, null);

    var table = { columns: [], rows: [] };
    value = TYPE.TVP.validate(table);
    assert.strictEqual(value, table);

    value = TYPE.TVP.validate({});
    assert.ok(value instanceof TypeError);
  });
});
