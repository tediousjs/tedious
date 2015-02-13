TYPE = require('../../src/data-type').typeByName

exports.Bit = (test) ->
  value = TYPE.Bit.validate null
  test.strictEqual value, null
  
  value = TYPE.Bit.validate true
  test.strictEqual value, true
  
  value = TYPE.Bit.validate "asdf"
  test.strictEqual value, true
  
  value = TYPE.Bit.validate ""
  test.strictEqual value, false
  
  value = TYPE.Bit.validate 55
  test.strictEqual value, true
  
  value = TYPE.Bit.validate 0
  test.strictEqual value, false

  test.done()
  
exports.TinyInt = (test) ->
  value = TYPE.TinyInt.validate null
  test.strictEqual value, null
  
  value = TYPE.TinyInt.validate 15
  test.strictEqual value, 15
  
  value = TYPE.TinyInt.validate "15"
  test.strictEqual value, 15
  
  value = TYPE.TinyInt.validate 256
  test.ok value instanceof TypeError

  test.done()

exports.SmallInt = (test) ->
  value = TYPE.SmallInt.validate null
  test.strictEqual value, null
  
  value = TYPE.SmallInt.validate -32768
  test.strictEqual value, -32768
  
  value = TYPE.SmallInt.validate -32769
  test.ok value instanceof TypeError

  test.done()

exports.Int = (test) ->
  value = TYPE.Int.validate null
  test.strictEqual value, null
  
  value = TYPE.Int.validate 2147483647
  test.strictEqual value, 2147483647
  
  value = TYPE.Int.validate 2147483648
  test.ok value instanceof TypeError

  test.done()

exports.BigInt = (test) ->
  value = TYPE.BigInt.validate null
  test.strictEqual value, null
  
  value = TYPE.BigInt.validate 2147483647
  test.strictEqual value, 2147483647

  test.done()

exports.SmallDateTime = (test) ->
  value = TYPE.SmallDateTime.validate null
  test.strictEqual value, null
  
  date = new Date()
  value = TYPE.SmallDateTime.validate date
  test.strictEqual +value, +date
  
  value = TYPE.SmallDateTime.validate "2015-02-12T16:43:13.632Z"
  test.strictEqual +value, 1423759393632
  
  value = TYPE.SmallDateTime.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.DateTime = (test) ->
  value = TYPE.DateTime.validate null
  test.strictEqual value, null
  
  date = new Date()
  value = TYPE.DateTime.validate date
  test.strictEqual +value, +date
  
  value = TYPE.DateTime.validate "2015-02-12T16:43:13.632Z"
  test.strictEqual +value, 1423759393632
  
  value = TYPE.DateTime.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.DateTime = (test) ->
  value = TYPE.DateTime.validate null
  test.strictEqual value, null
  
  date = new Date()
  value = TYPE.DateTime.validate date
  test.strictEqual +value, +date
  
  value = TYPE.DateTime.validate "2015-02-12T16:43:13.632Z"
  test.strictEqual +value, 1423759393632
  
  value = TYPE.DateTime.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.DateTime2 = (test) ->
  value = TYPE.DateTime2.validate null
  test.strictEqual value, null
  
  date = new Date()
  value = TYPE.DateTime2.validate date
  test.strictEqual +value, +date
  
  value = TYPE.DateTime2.validate "2015-02-12T16:43:13.632Z"
  test.strictEqual +value, 1423759393632
  
  value = TYPE.DateTime2.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.Time = (test) ->
  value = TYPE.Time.validate null
  test.strictEqual value, null
  
  date = new Date()
  value = TYPE.Time.validate date
  test.strictEqual +value, +date
  
  value = TYPE.Time.validate "2015-02-12T16:43:13.632Z"
  test.strictEqual +value, 1423759393632
  
  value = TYPE.Time.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.DateTimeOffset = (test) ->
  value = TYPE.DateTimeOffset.validate null
  test.strictEqual value, null
  
  date = new Date()
  value = TYPE.DateTimeOffset.validate date
  test.strictEqual +value, +date
  
  value = TYPE.DateTimeOffset.validate "2015-02-12T16:43:13.632Z"
  test.strictEqual +value, 1423759393632
  
  value = TYPE.DateTimeOffset.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.Real = (test) ->
  value = TYPE.Real.validate null
  test.strictEqual value, null
  
  value = TYPE.Real.validate 1516.61556
  test.strictEqual value, 1516.61556
  
  value = TYPE.Real.validate "1516.61556"
  test.strictEqual value, 1516.61556
  
  value = TYPE.Real.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.Float = (test) ->
  value = TYPE.Float.validate null
  test.strictEqual value, null
  
  value = TYPE.Float.validate 1516.61556
  test.strictEqual value, 1516.61556
  
  value = TYPE.Float.validate "1516.61556"
  test.strictEqual value, 1516.61556
  
  value = TYPE.Float.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.Decimal = (test) ->
  value = TYPE.Decimal.validate null
  test.strictEqual value, null
  
  value = TYPE.Decimal.validate 1516.61556
  test.strictEqual value, 1516.61556
  
  value = TYPE.Decimal.validate "1516.61556"
  test.strictEqual value, 1516.61556
  
  value = TYPE.Decimal.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.Numeric = (test) ->
  value = TYPE.Numeric.validate null
  test.strictEqual value, null
  
  value = TYPE.Numeric.validate 1516.61556
  test.strictEqual value, 1516.61556
  
  value = TYPE.Numeric.validate "1516.61556"
  test.strictEqual value, 1516.61556
  
  value = TYPE.Numeric.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.Money = (test) ->
  value = TYPE.Money.validate null
  test.strictEqual value, null
  
  value = TYPE.Money.validate 1516.61556
  test.strictEqual value, 1516.61556
  
  value = TYPE.Money.validate "1516.61556"
  test.strictEqual value, 1516.61556
  
  value = TYPE.Money.validate "xxx"
  test.ok value instanceof TypeError

  test.done()

exports.SmallMoney = (test) ->
  value = TYPE.SmallMoney.validate null
  test.strictEqual value, null
  
  value = TYPE.SmallMoney.validate 214748.3647
  test.strictEqual value, 214748.3647
  
  value = TYPE.SmallMoney.validate 214748.3648
  test.ok value instanceof TypeError

  test.done()

exports.Image = (test) ->
  value = TYPE.Image.validate null
  test.strictEqual value, null
  
  buffer = new Buffer [0x00, 0x01]
  value = TYPE.Image.validate buffer
  test.strictEqual value, buffer
  
  value = TYPE.Image.validate {}
  test.ok value instanceof TypeError

  test.done()

exports.Binary = (test) ->
  value = TYPE.Binary.validate null
  test.strictEqual value, null
  
  buffer = new Buffer [0x00, 0x01]
  value = TYPE.Binary.validate buffer
  test.strictEqual value, buffer
  
  value = TYPE.Binary.validate {}
  test.ok value instanceof TypeError

  test.done()

exports.VarBinary = (test) ->
  value = TYPE.VarBinary.validate null
  test.strictEqual value, null
  
  buffer = new Buffer [0x00, 0x01]
  value = TYPE.VarBinary.validate buffer
  test.strictEqual value, buffer
  
  value = TYPE.VarBinary.validate {}
  test.ok value instanceof TypeError

  test.done()

exports.Text = (test) ->
  value = TYPE.Text.validate null
  test.strictEqual value, null
  
  value = TYPE.Text.validate "asdf"
  test.strictEqual value, "asdf"
  
  value = TYPE.Text.validate new Buffer "asdf", "utf8"
  test.strictEqual value, "asdf"
  
  value = TYPE.Text.validate {toString: null}
  test.ok value instanceof TypeError

  test.done()

exports.VarChar = (test) ->
  value = TYPE.VarChar.validate null
  test.strictEqual value, null
  
  value = TYPE.VarChar.validate "asdf"
  test.strictEqual value, "asdf"
  
  value = TYPE.VarChar.validate new Buffer "asdf", "utf8"
  test.strictEqual value, "asdf"
  
  value = TYPE.VarChar.validate {toString: null}
  test.ok value instanceof TypeError

  test.done()

exports.NVarChar = (test) ->
  value = TYPE.NVarChar.validate null
  test.strictEqual value, null
  
  value = TYPE.NVarChar.validate "asdf"
  test.strictEqual value, "asdf"
  
  value = TYPE.NVarChar.validate new Buffer "asdf", "utf8"
  test.strictEqual value, "asdf"
  
  value = TYPE.NVarChar.validate {toString: null}
  test.ok value instanceof TypeError

  test.done()

exports.Char = (test) ->
  value = TYPE.Char.validate null
  test.strictEqual value, null
  
  value = TYPE.Char.validate "asdf"
  test.strictEqual value, "asdf"
  
  value = TYPE.Char.validate new Buffer "asdf", "utf8"
  test.strictEqual value, "asdf"
  
  value = TYPE.Char.validate {toString: null}
  test.ok value instanceof TypeError

  test.done()

exports.NChar = (test) ->
  value = TYPE.NChar.validate null
  test.strictEqual value, null
  
  value = TYPE.NChar.validate "asdf"
  test.strictEqual value, "asdf"
  
  value = TYPE.NChar.validate new Buffer "asdf", "utf8"
  test.strictEqual value, "asdf"
  
  value = TYPE.NChar.validate {toString: null}
  test.ok value instanceof TypeError

  test.done()

exports.TVP = (test) ->
  value = TYPE.TVP.validate null
  test.strictEqual value, null
  
  table = {columns: [], rows: []}
  value = TYPE.TVP.validate table
  test.strictEqual value, table
  
  value = TYPE.TVP.validate {}
  test.ok value instanceof TypeError

  test.done()