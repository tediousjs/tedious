EventEmitter = require('events').EventEmitter
WritableTrackingBuffer = require('./tracking-buffer/tracking-buffer').WritableTrackingBuffer;

TOKEN_TYPE = require('./token/token').TYPE;

FLAGS =
  nullable: 1 << 0
  caseSen: 1 << 1
  updateableReadWrite: 1 << 2
  updateableUnknown: 1 << 3
  identity: 1 << 4
  computed: 1 << 5         # introduced in TDS 7.2
  fixedLenCLRType: 1 << 8  # introduced in TDS 7.2
  sparseColumnSet: 1 << 10 # introduced in TDS 7.3.B
  hidden: 1 << 13          # introduced in TDS 7.2
  key: 1 << 14             # introduced in TDS 7.2
  nullableUnknown: 1 << 15 # introduced in TDS 7.2

DONE_STATUS =
  FINAL: 0x00
  MORE: 0x1
  ERROR: 0x2
  INXACT: 0x4
  COUNT: 0x10
  ATTN: 0x20
  SRVERROR: 0x100

class BulkLoad extends EventEmitter
  error: null
  canceled: false
  
  constructor: (@table, @options, @callback) ->
    @columns = []
    @columnsByName = {}
    @rowsData = new WritableTrackingBuffer(1024, 'ucs2', true)
    @firstRowWritten = false
  
  addColumn: (name, type, options = {}) ->
    if @firstRowWritten
      throw new Error('Columns cannot be added to bulk insert after the first row has been written.')
      
    column =
      type: type
      name: name
      value: null
      output: options.output ||= false
      length: options.length
      precision: options.precision
      scale: options.scale
      objName: options.objName || name
      nullable: options.nullable
    
    if (type.id & 0x30) == 0x20 # Variable length
      column.length = column.length ? type.resolveLength? column
      
    if type.hasPrecision
      column.precision = column.precision ? type.resolvePrecision? column
      
    if type.hasScale
      column.scale = column.scale ? type.resolveScale? column

    @columns.push(column)
    @columnsByName[name] = column
  
  addRow: (row) ->
    @firstRowWritten = true
    if arguments.length > 1 || !row || typeof row != 'object'
      # convert arguments to array in a way the optimizer can handle
      arrTemp = new Array(arguments.length);
      for c, i in arguments
        arrTemp[i] = c
      row = arrTemp;
    
    # write row token
    @rowsData.writeUInt8(TOKEN_TYPE.ROW)
    
    # write each column
    arr = row instanceof Array
    for c, i in @columns
      c.type.writeParameterData(@rowsData, {
        length: c.length
        scale: c.scale
        precision: c.precision
        value: row[if arr then i else c.objName]
      }, @options)

  getBulkInsertSql: () ->
    sql = 'insert bulk ' + @table + '('
    for c, i in @columns
      if i != 0
        sql += ', '
      sql += "[#{c.name}] #{c.type.declaration(c)}"
    sql += ')'
    return sql
  
  getTableCreationSql: () ->
    sql = 'CREATE TABLE ' + @table + '(\n'
    for c, i in @columns
      if i != 0
        sql += ',\n'
      sql += "[#{c.name}] #{c.type.declaration(c)}"
      if (c.nullable != undefined)
        sql += " " + (if c.nullable then "NULL" else "NOT NULL")
    sql += '\n)'
    return sql

  getPayload: () ->
    # Create COLMETADATA token
    metaData = @getColMetaData()
    length = metaData.length
    
    # row data
    rows = @rowsData.data
    length += rows.length
    
    # Create DONE token
    # It might be nice to make DoneToken a class if anything needs to create them, but for now, just do it here
    tBuf = new WritableTrackingBuffer(if @options.tdsVersion < "7_2" then 9 else 13)
    tBuf.writeUInt8(TOKEN_TYPE.DONE)
    status = DONE_STATUS.FINAL
    tBuf.writeUInt16LE(status)
    tBuf.writeUInt16LE(0) # CurCmd (TDS ignores this)
    tBuf.writeUInt32LE(0) # row count - doesn't really matter
    if @options.tdsVersion >= "7_2"
      tBuf.writeUInt32LE(0) # row count is 64 bits in >= TDS 7.2

    done = tBuf.data
    length += done.length
    
    # composite payload
    payload = new WritableTrackingBuffer(length)
    payload.copyFrom(metaData)
    payload.copyFrom(rows)
    payload.copyFrom(done)
    
    return payload
  
  getColMetaData: () ->
    tBuf = new WritableTrackingBuffer(100, null, true)
    # TokenType
    tBuf.writeUInt8(TOKEN_TYPE.COLMETADATA)
    # Count
    tBuf.writeUInt16LE(@columns.length)
    
    for c in @columns
      # UserType
      if @options.tdsVersion < "7_2"
        tBuf.writeUInt16LE(0)
      else
        tBuf.writeUInt32LE(0)
      
      # Flags
      flags = FLAGS.updateableReadWrite
      if c.nullable
        flags |= FLAGS.nullable
      else if c.nullable == undefined && @options.tdsVersion >= "7_2"
        flags |= FLAGS.nullableUnknown # this seems prudent to set, not sure if there are performance consequences
      tBuf.writeUInt16LE(flags)
      
      # TYPE_INFO
      c.type.writeTypeInfo(tBuf, c, @options)
      
      # ColName
      tBuf.writeBVarchar(c.name, 'ucs2')
    
    return tBuf.data

module.exports = BulkLoad
