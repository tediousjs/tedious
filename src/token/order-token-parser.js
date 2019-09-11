// s2.2.7.14

const { OrderToken } = require('./token');

module.exports = function(parser, colMetadata, options, callback) {
  parser.readUInt16LE((length) => {
    const columnCount = length / 2;
    const orderColumns = [];

    let i = 0;
    function next(done) {
      if (i === columnCount) {
        return done();
      }

      parser.readUInt16LE((column) => {
        orderColumns.push(column);

        i++;

        next(done);
      });
    }

    next(() => {
      callback(new OrderToken(orderColumns));
    });
  });
};
