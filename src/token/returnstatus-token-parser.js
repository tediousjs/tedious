// s2.2.7.16

export default function(parser, colMetadata, options, callback) {
  parser.readInt32LE((value) => {
    callback({
      name: 'RETURNSTATUS',
      event: 'returnStatus',
      value: value
    });
  });
}
