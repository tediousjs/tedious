// s2.2.7.16

export default function*(parser) {
  const value = yield parser.readInt32LE();

  return {
    name: 'RETURNSTATUS',
    event: 'returnStatus',
    value: value
  };
}
