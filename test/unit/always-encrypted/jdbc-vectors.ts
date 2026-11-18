import { type ParameterOptions } from '../../../src/request';

// Values that the Microsoft JDBC driver (mssql-jdbc 12.8.1) wrote to columns
// with deterministic encryption, as they are stored by a SQL Server 2025:
// with a database collation of `SQL_Latin1_General_CP1_CI_AS`, and a JVM
// whose time zone is UTC and whose default charset is that of the database
// (which is what the driver encodes `char` and `varchar` values with).
//
// Deterministic encryption encrypts equal values to equal cells, so a
// driver that reads these values, and encrypts them to the very same cells,
// normalizes values the way the JDBC driver does.

/**
 * The column encryption key that the cells are encrypted with.
 */
export const COLUMN_ENCRYPTION_KEY = 'ad010a1798d07ec12264fdaf2f1411f97b9549ad022d698392a6e9c4d02baa5c';

/**
 * Appended to the type of the columns that have a collation.
 */
export const COLLATED = 'COLLATED';

export interface JdbcVector {
  /** The type of the column. */
  sqlType: string;

  /** The `TYPE_INFO` of the column, as hex. */
  typeInfo: string;

  /** The parameter that holds the value. */
  type: string;
  options?: ParameterOptions;
  value: unknown;

  /** The value as it is read, if that is not the value that was written. */
  read?: unknown;

  /** The cell that the JDBC driver wrote. */
  cell: string;

  /** Why tedious encrypts the value to another cell, if it does. */
  differs?: string;
}

/**
 * A date with the sub-millisecond part of a value that is written
 * (`nanosecondDelta`), which is also what a value that is read is expected
 * to have (as its `nanosecondsDelta`).
 */
export function date(value: string, nanosecondDelta = 0): Date {
  return Object.assign(new Date(value), { nanosecondDelta });
}

// The JDBC driver encrypts a magnitude of 15 bytes for the `decimal` and
// `numeric` parameters it sends, and of 16 bytes for the rows of a bulk copy.
const JDBC_DECIMAL = 'the JDBC driver encrypts a magnitude of 15 bytes, not of 16';

// A `datetime2` or `datetimeoffset` that rounds up to midnight is the first
// moment of the next day. The JDBC driver encrypts it as 24:00:00 of its day.
const JDBC_MIDNIGHT = 'the JDBC driver encrypts 24:00:00 instead of 00:00:00 of the next day';

// The offset of a `datetimeoffset` parameter is that of the local time zone.
const TIME_ZONE = 'time zone';
const OFFSET = 'the value has an offset of +05:30';

export const TIME_ZONE_DEPENDENT = TIME_ZONE;

export const JDBC_VECTORS: JdbcVector[] = [
  {
    sqlType: 'bit', typeInfo: '6801', type: 'Bit', value: true,
    cell: '01ee016dc3f93928873750db6d2233a6ae39089426c8bcba9b00a5e603335c9d07023f6943e90e8eb3b6342f482fe572d33a18f03d22a2fd5eddb1187c2c4a7ffa'
  },
  {
    sqlType: 'tinyint', typeInfo: '2601', type: 'TinyInt', value: 255,
    cell: '0162b5edebcf43a2ac348ab16ad5f769301c8af57ebdbca1d178dfb76202ae7a250cdbc8e7bb228c4290c874f20bb5aeb7103f48fcca55cd075563f50886bf0b5b'
  },
  {
    sqlType: 'smallint', typeInfo: '2602', type: 'SmallInt', value: -32768,
    cell: '0185c517f38551eba46a83e8a3e8e041749a6f4241183f74af4614850cb8cb4b95e76da6b11d1aff1a9c24985ec900b2b925a66b0c346e5f7bba9bd6fe6fd7dfd2'
  },
  {
    sqlType: 'int', typeInfo: '2604', type: 'Int', value: -2147483648,
    cell: '016f6c658eb71f64f0ee2df445a5ea176c14f07af832f15cbd867986472f2bb8f2955990aab77e5e604f238875e613d2cec5a857149aa817fb00cbb00f04569c44'
  },
  {
    sqlType: 'bigint', typeInfo: '2608', type: 'BigInt', value: '9007199254740991',
    cell: '01308ed68c64cb30f98b73f2fac782c9b1bed8c1f5e45ec94f1f814e625c665cbcf33bd5420ffeb90ed99ad173fa701bfc94753dff9df55598e5558ab20393b6f0'
  },
  {
    sqlType: 'real', typeInfo: '6d04', type: 'Real', value: -3.25,
    cell: '0179ab2055b54165fc1d83da258e2a6c2d71e0aa7ffb1a900cf82149bebf69b52bb6d23e94ed646601a8b52d2b7d62c3d8bca526d159a497f50d80a1b3144f2ba1'
  },
  {
    sqlType: 'float', typeInfo: '6d08', type: 'Float', value: 0.1,
    cell: '01b438e35d1941910fa05b974489d3bd0b1ba59145c2bfb4b7d52be8c8e2033a964a6dd0d8e75185452ee273d0577250663c7909cde03d9aff6f128345d578c8db'
  },
  {
    sqlType: 'decimal(10,2)', typeInfo: '6a090a02', type: 'Decimal', options: { precision: 10, scale: 2 }, value: 12345678.91, differs: JDBC_DECIMAL,
    cell: '0105c7d027c9c231890b61de4b6d1c45efa641a45e08d3fe57c7072475b2d23563c9fec5983ab5b3855cb3ad7ea40cc65b1a036d8f2fc776344cef26bd238d617d89df82681d400ca615445cc6b877211a'
  },
  {
    sqlType: 'decimal(10,2)', typeInfo: '6a090a02', type: 'Decimal', options: { precision: 10, scale: 2 }, value: -0.05, differs: JDBC_DECIMAL,
    cell: '01690757b34d2adf4bc4870e176b7903ea9f02d07aa9e56eafb4a4d5ac88490256e65055b00bfcec2ddb94238bbf4391fe47ac10a762ddd8d79f22094cdf46e4bd8dca7664ee1a423d1680ede968765f16'
  },
  {
    sqlType: 'decimal(38,10)', typeInfo: '6a11260a', type: 'Decimal', options: { precision: 38, scale: 10 }, value: 12345.0000000001, differs: JDBC_DECIMAL,
    cell: '01110efca52a7943c5e88c81d77a4bba495b1071019e05c5b80be27ff4eedb4e32961d4796b18f11398aaf3cf79ba5c639b7c8269bf264225f9afafc555041550079c0c876a24a4f5c1c8ee386d1978371'
  },
  {
    sqlType: 'numeric(18,0)', typeInfo: '6c091200', type: 'Numeric', options: { precision: 18, scale: 0 }, value: -1, differs: JDBC_DECIMAL,
    cell: '01a122e8eee65331eea17007df5aaaa09bb27ce7b4dcc9b597509e14b0eae52c382b01ac0b0d5eb4457f16518ffafa03ebfa879ea69c9e1fd7fee8b8b15eabfbb98d3f995dc8106ab2ee6dece92aaf83d5'
  },
  {
    sqlType: 'money', typeInfo: '6e08', type: 'Money', value: -0.0001,
    cell: '016c7494096b205e60906195e64e4d0834a13d6204620445d77ee84bd8af8ad12eb059c6faed1c9117fecce8b29c892eb4b1bb85a0c9e2d96973b1af578372f977'
  },
  {
    sqlType: 'smallmoney', typeInfo: '6e04', type: 'SmallMoney', value: 214748.3647,
    cell: '01f5a62e89007ec7e8bf838086b1f06f0647c5d80aaf8b70fbd13f3448645d9c079a7889e3d75667972bb85f952901e44f7fd1a99a4a7e97b21ef005782e649256'
  },
  {
    sqlType: 'char(10)', typeInfo: 'af0a00' + COLLATED, type: 'Char', options: { length: 10 }, value: 'abc', read: 'abc       ',
    cell: '01dad6784e41040514b5cfb1db55c9fc969218a73b72323d475ddb2488d5ba5e5568fa6688ff72a1fe4803a6bef17eb76139b9c04e845f63a83be44cff2d61ca9b'
  },
  {
    sqlType: 'varchar(50)', typeInfo: 'a73200' + COLLATED, type: 'VarChar', options: { length: 50 }, value: 'hello world',
    cell: '01abaef09c009e6b80f26e1ad5533c2dcf425a88d8c184535aa90d19592b039202beaaf58d510b4e6433c3143cd670f4e2fd66289bacefdeba9ec9c68a6b0ad78a'
  },
  {
    sqlType: 'varchar(50)', typeInfo: 'a73200' + COLLATED, type: 'VarChar', options: { length: 50 }, value: 'Ünïcödé €',
    cell: '01245549a5e71e31d45fc0cf8555955563cfc0d068e3b87e5227d1d7475718e95526b662905aec12a2cfe2145388dc44005f3cef9cc8050670f2eac0a98bd290db'
  },
  {
    sqlType: 'varchar(50)', typeInfo: 'a73200' + COLLATED, type: 'VarChar', options: { length: 50 }, value: '',
    cell: '0148ceaa69e4e9f212573cb511bb4580223957b52bb56d6216ae3393f51eba6da270745e42925deff50f7969feb66fb786b45daba94ad26cc4172ea9b4fcdd5646'
  },
  {
    sqlType: 'nchar(10)', typeInfo: 'ef1400' + COLLATED, type: 'NChar', options: { length: 10 }, value: 'こんにちは', read: 'こんにちは     ',
    cell: '01202d22bf4b4d978c14d557b2c57e669c820d9f3a11cc16a1d85da10a268a8491cddeee0da480dd97abfe4b27379c4fd4e5a24b7e133ce10247bf3941c2a53837'
  },
  {
    sqlType: 'nvarchar(50)', typeInfo: 'e76400' + COLLATED, type: 'NVarChar', options: { length: 50 }, value: 'hello wörld ☃',
    cell: '015e9bb5aa3ad372b06c06c40ff1a9cdf59be19e97ecc086c6340433931fd76bcdf279b14171ee68c3ba68335a4fe60da88b712cf4b3209e02bc8cbacd2d0aaa7ae6e845a70976b6955f4c7311d57d2d01'
  },
  {
    sqlType: 'binary(10)', typeInfo: 'ad0a00', type: 'Binary', options: { length: 10 }, value: Buffer.from('abcd', 'hex'), read: Buffer.from('abcd0000000000000000', 'hex'),
    cell: '0139f118ab4621b9fdfe8a7f175c7693275cec05b1aab3953b789f6a49808e5d83432132dae7f4ad9ec480140d16d717611515d758f60dcb9fca2174266fad6b67'
  },
  {
    sqlType: 'varbinary(50)', typeInfo: 'a53200', type: 'VarBinary', options: { length: 50 }, value: Buffer.from('deadbeef', 'hex'),
    cell: '0166cb767fcc9dd8ca116393ce626553a3b12c8330caab158d067ac67b29bd5eb1b2e1d5e97a5f5aa4d10d826b8ff17ea5ba47a69d8f4c7629b5b53b977f44e61e'
  },
  {
    sqlType: 'date', typeInfo: '28', type: 'Date', value: date('2024-02-29T00:00:00Z'),
    cell: '01d29f8fa4af183a662f7ed887c0e3a9f3a975b024811eb9584fe484cf77420b1922ad44f365d5776d983bcd0bc696a5bf507626f565a986658697a2575f708667'
  },
  {
    sqlType: 'date', typeInfo: '28', type: 'Date', value: date('9999-12-30T00:00:00Z'),
    cell: '01d35b4e80b17939fbd3e2dbe579b9e58d39d4707691f03be9a9f875f138a517defd5f39353910c026e0e72356f8185a83b6422d262f9de54cfc8711e80a57e187'
  },
  {
    sqlType: 'time(0)', typeInfo: '2900', type: 'Time', options: { scale: 0 }, value: date('1970-01-01T12:34:56Z'),
    cell: '01efcf9feb694dcb6d70b93300029ef0ba12670a3f6bd5f433e0d5aa6a7b4287f4218d2fd35fdd5b68edd693bce2d1597718dcb794b2db75b748ffbcd5326a8bae'
  },
  {
    sqlType: 'time(3)', typeInfo: '2903', type: 'Time', options: { scale: 3 }, value: date('1970-01-01T12:34:56.789Z'),
    cell: '01c4f8d44ebe2f69c9f0a02644887380b4a2ecd3dadd6d1b36018f4f5cd7fa78411e232ceb638b720a2e320b74cc0959cf5ac60e1f82eb0beffe13fbf59cbd90a8'
  },
  {
    sqlType: 'time(7)', typeInfo: '2907', type: 'Time', options: { scale: 7 }, value: date('1970-01-01T23:59:59.999Z'),
    cell: '011480809e4fff141b86f74f489a78030f218a7a9f2561f71f7b9411df9c521adb846a178429cf2d4d98a38471f5d8fda5922468ab01aea2ee78697822993a8cea'
  },
  {
    sqlType: 'datetime2(0)', typeInfo: '2a00', type: 'DateTime2', options: { scale: 0 }, value: date('2024-02-29T12:34:56Z'),
    cell: '010ea7de2424ee27dd5184ee80c1405b9649fc4250d56635c00c78045b4909e3f641ee416d14b08ea24b5babbb758f3274953565352960b62565af7b9c3f403286'
  },
  {
    sqlType: 'datetime2(7)', typeInfo: '2a07', type: 'DateTime2', options: { scale: 7 }, value: date('2024-02-29T12:34:56.123Z', 0.0004567),
    cell: '0105729e73f4dd3cb01b7a19dcc1f8225d7f36fdf4d69c984e847d643d795483f46d9ab57cabd0f530456d72ebdae4a7ef0841968315aff2151daa756bb3094f48'
  },
  {
    sqlType: 'datetime2(7)', typeInfo: '2a07', type: 'DateTime2', options: { scale: 7 }, value: date('1900-01-01T00:00:00Z', 0.0000001),
    cell: '019ecaef01b183982903de609c847fa30a58ee0dfa7072ca2b37b7de746c5f6be6676e1292337f294ab0234e5a35cd801ade0b547938aea989a2ed2528fc9e83f5'
  },
  {
    sqlType: 'datetimeoffset(7)', typeInfo: '2b07', type: 'DateTimeOffset', options: { scale: 7 }, value: date('2024-02-29T12:34:56.123Z', 0.0004567), differs: TIME_ZONE,
    cell: '0160344e2420f829b979ac67a86aeb78a9020b904223b7f908dad953dd3312d28694fe6f4dc59a3be984f0aa6e5e9fa96f70b07561a1cf348105230dd858f582c3'
  },
  {
    sqlType: 'datetimeoffset(7)', typeInfo: '2b07', type: 'DateTimeOffset', options: { scale: 7 }, value: date('2024-02-29T07:04:56.123Z', 0.0004567), differs: OFFSET,
    cell: '015355a57d06d6cb3354494403ec4cf033827d659b58b0b42fd4ee523f951fe50b2ef19f57466acd1a7e487df49f7c5d320f70de8420d43c0005edf00f2c490f50'
  },
  {
    sqlType: 'datetime', typeInfo: '6f08', type: 'DateTime', value: date('2024-02-29T12:34:56.123Z'),
    cell: '010a2c23a7cff633430e756ed51a5a9397b7b2958d25bf1ea6a94542492685d1bba666ee46300e4d9cdde0aaa6586d640a12de33e40c924665961df17fc5151ce8'
  },
  {
    sqlType: 'smalldatetime', typeInfo: '6f04', type: 'SmallDateTime', value: date('2024-02-29T12:34:00Z'),
    cell: '0119ac0fb3e582b1b2c1de32615a00360a54fbc713f41df5cf00a7521ef82ac4f0a3afc901fcbbd2ff508fadefa1991f48e1691c2d79e1a7b5a673fc5cb99d1f9c'
  },
  {
    sqlType: 'uniqueidentifier', typeInfo: '2410', type: 'UniqueIdentifier', value: '01234567-89AB-CDEF-0123-456789ABCDEF',
    cell: '018a19456c4cef7473b0950bf6cf2faa411d76ab2256712ce68dd708b82579f51d0d4c456fcf8b924285afcd2e38ede39e91b8c7745a5d52a53af68926e6d800cddec16d27d52988d0ca02aad68f6c9ecf'
  },
  {
    sqlType: 'time(0)', typeInfo: '2900', type: 'Time', options: { scale: 0 }, value: date('1970-01-01T12:34:56.500Z'), read: date('1970-01-01T12:34:57Z'),
    cell: '01fd0474d46a1ea6d3abe96b07b6c4c4a982eb267977ae27d6312517b677f90d0a868ec5bf21391897aa42db0942da4cadf492ccbdd37ea941607b1c544c7c31cb'
  },
  {
    sqlType: 'time(0)', typeInfo: '2900', type: 'Time', options: { scale: 0 }, value: date('1970-01-01T23:59:59.999Z'), read: date('1970-01-01T23:59:59Z'),
    cell: '01a2ae6ab4423e8566bcbf9fce03aefd83493a729e8957ff94007ba97c309ed842741f517dd3b17c2081963c66d5d7eb4d609d5bcd4e1a5b8366c00651a68e0329'
  },
  {
    sqlType: 'time(2)', typeInfo: '2902', type: 'Time', options: { scale: 2 }, value: date('1970-01-01T12:34:56.995Z'), read: date('1970-01-01T12:34:57Z'),
    cell: '01fd0474d46a1ea6d3abe96b07b6c4c4a982eb267977ae27d6312517b677f90d0a868ec5bf21391897aa42db0942da4cadf492ccbdd37ea941607b1c544c7c31cb'
  },
  {
    sqlType: 'datetime2(0)', typeInfo: '2a00', type: 'DateTime2', options: { scale: 0 }, value: date('2024-02-28T12:34:56.500Z'), read: date('2024-02-28T12:34:57Z'),
    cell: '01fee35ac4b97689a01fdc3381970b1b0b4bece2d28242f27652a21897866e5c0e47169b6d67e1ca06fd4b5b6e9477f2f89fea8d355cc5e1db5c366ec07ceeb165'
  },
  {
    sqlType: 'datetime2(0)', typeInfo: '2a00', type: 'DateTime2', options: { scale: 0 }, value: date('2024-02-28T23:59:59.999Z'), read: date('2024-02-29T00:00:00Z'), differs: JDBC_MIDNIGHT,
    cell: '01c42364bd0a8e2fd36f4c6fbc228f311131a72851317b08d56e3f9401d5f3be1eba4ec773518216889cbfc00dfa144ef82c8577aeb669bf63527d9775c847f7fd'
  },
  {
    sqlType: 'datetime2(2)', typeInfo: '2a02', type: 'DateTime2', options: { scale: 2 }, value: date('2024-02-28T12:34:56.123Z', 0.0004567), read: date('2024-02-28T12:34:56.120Z'),
    cell: '016146b277eab91bbface81fbcd47c9e9c6bd5b7a5d6be4061933ccb752768d370b919b10d2d77c6c30bfab3bd8cd1709b0b3068e960e8f53d36feb2504c91dc7b'
  }
];
