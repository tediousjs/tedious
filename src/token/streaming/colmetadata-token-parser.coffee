# s2.2.7.4

metadataParse = require('./metadata-parser')

readTableName = ->
  if @options.tdsVersion >= '7_2'
    @uint8 "tableNameParts"

    @vars.tableName = []
    @loop (end) ->
      return end(true) if @vars.tableName.length == @vars.tableNameParts

      @usVarchar("part").tap -> @vars.tableName.push(@vars.part)

    @tap ->
      # Cleanup
      delete @vars.part
      delete @vars.tableNameParts
  else
    @usVarchar "tableName"

readColumnName = (c) ->
  @bVarchar "colName"
  if @options.columnNameReplacer
    @tap -> @vars.colName = @options.columnNameReplacer(@vars.colName, c, @vars.metadata)
  else if @options.camelCaseColumns
    @tap -> @vars.colName = @vars.colName.replace /^[A-Z]/, (s) -> s.toLowerCase()

module.exports = (buffer, colMetadata, options) ->
  @uint16le "columnCount"
  @tap ->
    @vars.columns = []
    @loop (end) ->
      if @vars.columns.length == @vars.columnCount
        return end(true)

      metadataParse.call(@)

      @tap ->
        if @vars.metadata.type.hasTableName
          readTableName.call(@)

      readColumnName.call(@, @vars.columns.length)

      @tap ->
        @vars.columns.push
          userType: @vars.metadata.userType
          flags: @vars.metadata.flags
          type: @vars.metadata.type
          colName: @vars.colName
          collation: @vars.metadata.collation
          precision: @vars.metadata.precision
          scale: @vars.metadata.scale
          udtInfo: @vars.metadata.udtInfo
          dataLength: @vars.metadata.dataLength
          tableName: @vars.tableName

  @tap ->

    @colMetadata = @vars.columns
    @push
      name: 'COLMETADATA'
      event: 'columnMetadata'
      columns: @vars.columns
