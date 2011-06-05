var Packet = require('./packet').Packet,
    TYPE = require('./packet').TYPE,
    jspack = require('./jspack').jspack,
    textToUnicode = require('./unicode').textToUnicode
    
    OPTION_FLAGS = {
      NONE: 0x00,
      WITH_RECOMPILE: 0x01,
      NO_METADATA: 0x02,
      REUSE_METADATA: 0x04
    },
    optionFlags = OPTION_FLAGS.NONE,

    STATUS_FLAGS = {
      NONE: 0x00,
      BY_REF_VALUE: 0x01,
      DEFAULT_VALUE: 0x02
    };

var RpcRequestPacket = function(headerFields, requestData) {
  var length,
      headersData = buildHeaders(),
      requestBatchData = buildRequestBatch(),
      data = headersData.concat(requestBatchData);
  
  return new Packet(TYPE.RPC_REQUEST, data, headerFields);
};

function buildHeaders() {
  var data,
      txnDescriptorHeader = buildTxnDescriptorHeader();
  
  data = jspack.Pack('<L', [4 + txnDescriptorHeader.length]);
  data = data.concat(txnDescriptorHeader);
  
  return data;
}

function buildTxnDescriptorHeader() {
  var outstandingRequestCount = 1,
      txnDescriptorHigh = 0,
      txnDescriptorLow = 0,
      data = jspack.Pack('<L<L<L', [txnDescriptorLow, txnDescriptorHigh, outstandingRequestCount]);

  return buildHeader(2, data);
}

function buildHeader(type, headerData) {
  var data = [];
  
  data = data.concat(jspack.Pack('<LH', [4 + 2 + headerData.length, type]));
  data = data.concat(headerData);

  return data;
}

function buildRequestBatch() {
  var data = [];

  var procName = 'sp_who2';
  
  data = jspack.Pack('<H', [procName.length]);
  data = data.concat(textToUnicode(procName));

  data = data.concat(jspack.Pack('<H', [optionFlags]));
  
  return data;
}

exports.RpcRequestPacket = RpcRequestPacket;
