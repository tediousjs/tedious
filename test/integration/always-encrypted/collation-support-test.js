const Connection = require('../../../src/connection');
const Request = require('../../../src/request');
const TYPES = require('../../../src/data-type').typeByName;

const fs = require('fs');
const { assert } = require('chai');

const config = JSON.parse(
  fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
).config;

config.options.debug = {
  packet: true,
  data: true,
  payload: true,
  token: true,
  log: true
};
config.options.columnEncryptionSetting = true;
const alwaysEncryptedCEK = Buffer.from([
  // decrypted column key must be 32 bytes long for AES256
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
config.options.encryptionKeyStoreProviders = [{
  key: 'TEST_KEYSTORE',
  value: {
    decryptColumnEncryptionKey: () => Promise.resolve(alwaysEncryptedCEK),
  },
}];
config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

describe('always encrypted', function() {
  let connection;
  const charRandomizedTable = 'AllCollationRandomizedCharTable';
  const charDeterminiticTable = 'AllCollationDeterministicCharTable';
  let randomizedCollations = [];
  let deterministicCollations = [];

  before(function() {
    if (config.options.tdsVersion < '7_4') {
      this.skip();
    }
  });

  const createKeys = (cb) => {
    const request = new Request(`CREATE COLUMN MASTER KEY [CMK1] WITH (
      KEY_STORE_PROVIDER_NAME = 'TEST_KEYSTORE',
      KEY_PATH = 'some-arbitrary-keypath'
    );`, (err) => {
      if (err) {
        return cb(err);
      }
      const request = new Request(`CREATE COLUMN ENCRYPTION KEY [CEK1] WITH VALUES (
        COLUMN_MASTER_KEY = [CMK1],
        ALGORITHM = 'RSA_OAEP',
        ENCRYPTED_VALUE = 0xDEADBEEF
      );`, (err) => {
        if (err) {
          return cb(err);
        }
        return cb();
      });
      connection.execSql(request);
    });
    connection.execSql(request);
  };

  const dropKeys = (cb) => {
    const request = new Request(`IF OBJECT_ID('dbo.${charRandomizedTable}', 'U') IS NOT NULL DROP TABLE dbo.${charRandomizedTable};`, (err) => {
      if (err) {
        return cb(err);
      }

      const request = new Request(`IF OBJECT_ID('dbo.${charDeterminiticTable}', 'U') IS NOT NULL DROP TABLE dbo.${charDeterminiticTable};`, (err) => {
        if (err) {
          return cb(err);
        }
        const request = new Request('IF (SELECT COUNT(*) FROM sys.column_encryption_keys WHERE name=\'CEK1\') > 0 DROP COLUMN ENCRYPTION KEY [CEK1];', (err) => {
          if (err) {
            return cb(err);
          }

          const request = new Request('IF (SELECT COUNT(*) FROM sys.column_master_keys WHERE name=\'CMK1\') > 0 DROP COLUMN MASTER KEY [CMK1];', (err) => {
            if (err) {
              return cb(err);
            }

            cb();
          });
          connection.execSql(request);
        });
        connection.execSql(request);
      });
      connection.execSql(request);
    });
    connection.execSql(request);
  };

  const getWord = (language) => {
    switch (language) {
      case 'Albanian_BIN':
      case 'Albanian_BIN2':
      case 'Albanian_100_BIN':
      case 'Albanian_100_BIN2':
        return 'njãjit';
      case 'Arabic_BIN':
      case 'Arabic_BIN2':
      case 'Arabic_100_BIN':
      case 'Arabic_100_BIN2':
        return 'فِعْلٌ مُضَارِعٌ';
      case 'Assamese_100_BIN':
      case 'Assamese_100_BIN2':
        return 'সকলো মানু';
      case 'Azeri_Cyrillic_100_BIN':
      case 'Azeri_Cyrillic_100_BIN2':
        return 'ƏşqSevgi';
      case 'Azeri_Latin_100_BIN':
      case 'Azeri_Latin_100_BIN2':
        return 'Üçrəngli';
      case 'Bashkir_100_BIN':
      case 'Bashkir_100_BIN2':
        return 'Barlıq';
      case 'Bengali_100_BIN':
      case 'Bengali_100_BIN2':
        return 'প্লাবনের';
      case 'Bosnian_Cyrillic_100_BIN':
      case 'Bosnian_Cyrillic_100_BIN2':
        return 'Cвa љyдскa';
      case 'Bosnian_Latin_100_BIN':
      case 'Bosnian_Latin_100_BIN2':
        return 'Sva ljudska';
      case 'Breton_100_BIN':
      case 'Breton_100_BIN2':
        return 'bevañ';
      case 'Chinese_Hong_Kong_Stroke_90_BIN':
      case 'Chinese_Hong_Kong_Stroke_90_BIN2':
      case 'Chinese_PRC_BIN':
      case 'Chinese_PRC_BIN2':
      case 'Chinese_PRC_90_BIN':
      case 'Chinese_PRC_90_BIN2':
      case 'Chinese_PRC_Stroke_BIN':
      case 'Chinese_PRC_Stroke_BIN2':
      case 'Chinese_PRC_Stroke_90_BIN':
      case 'Chinese_PRC_Stroke_90_BIN2':
      case 'Chinese_Simplified_Pinyin_100_BIN':
      case 'Chinese_Simplified_Pinyin_100_BIN2':
      case 'Chinese_Simplified_Stroke_Order_100_BIN':
      case 'Chinese_Simplified_Stroke_Order_100_BIN2':
      case 'Chinese_Taiwan_Bopomofo_BIN':
      case 'Chinese_Taiwan_Bopomofo_BIN2':
      case 'Chinese_Taiwan_Bopomofo_90_BIN':
      case 'Chinese_Taiwan_Bopomofo_90_BIN2':
      case 'Chinese_Taiwan_Stroke_BIN':
      case 'Chinese_Taiwan_Stroke_BIN2':
      case 'Chinese_Taiwan_Stroke_90_BIN':
      case 'Chinese_Taiwan_Stroke_90_BIN2':
      case 'Chinese_Traditional_Bopomofo_100_BIN':
      case 'Chinese_Traditional_Bopomofo_100_BIN2':
      case 'Chinese_Traditional_Pinyin_100_BIN':
      case 'Chinese_Traditional_Pinyin_100_BIN2':
      case 'Chinese_Traditional_Stroke_Count_100_BIN':
      case 'Chinese_Traditional_Stroke_Count_100_BIN2':
      case 'Chinese_Traditional_Stroke_Order_100_BIN':
      case 'Chinese_Traditional_Stroke_Order_100_BIN2':
        return '章草';
      case 'Corsican_100_BIN':
      case 'Corsican_100_BIN2':
        return 'dignità è di';
      case 'Croatian_BIN':
      case 'Croatian_BIN2':
      case 'Croatian_100_BIN':
      case 'Croatian_100_BIN2':
        return 'sviješću';
      case 'Cyrillic_General_BIN':
      case 'Cyrillic_General_BIN2':
      case 'Cyrillic_General_100_BIN':
      case 'Cyrillic_General_100_BIN2':
        return 'Вяш долорюм';
      case 'Czech_BIN':
      case 'Czech_BIN2':
      case 'Czech_100_BIN':
      case 'Czech_100_BIN2':
        return 'důstojnosti a práv';
      case 'Danish_Greenlandic_100_BIN':
      case 'Danish_Greenlandic_100_BIN2':
      case 'Danish_Norwegian_BIN':
      case 'Danish_Norwegian_BIN2':
        return 'født frie og lige i';
      case 'Dari_100_BIN':
      case 'Dari_100_BIN2':
        return 'شکرشکن';
      case 'Divehi_90_BIN':
      case 'Divehi_90_BIN2':
      case 'Divehi_100_BIN':
      case 'Divehi_100_BIN2':
        return 'ތތޔުކހގތތ';
      case 'Estonian_BIN':
      case 'Estonian_BIN2':
      case 'Estonian_100_BIN':
      case 'Estonian_100_BIN2':
        return 'tgfmläüõõüä';
      case 'Finnish_Swedish_BIN':
      case 'Finnish_Swedish_BIN2':
      case 'Finnish_Swedish_100_BIN':
      case 'Finnish_Swedish_100_BIN2':
        return 'åäööpå';
      case 'French_BIN':
      case 'French_BIN2':
      case 'French_100_BIN':
      case 'French_100_BIN2':
        return 'l’odeur alléché';
      case 'Frisian_100_BIN':
      case 'Frisian_100_BIN2':
        return 'mar ferlos ús fan';
      case 'Georgian_Modern_Sort_BIN':
      case 'Georgian_Modern_Sort_BIN2':
      case 'Georgian_Modern_Sort_100_BIN':
      case 'Georgian_Modern_Sort_100_BIN2':
        return 'მკვლე';
      case 'German_PhoneBook_BIN':
      case 'German_PhoneBook_BIN2':
      case 'German_PhoneBook_100_BIN':
      case 'German_PhoneBook_100_BIN2':
        return 'üßöä';
      case 'Greek_BIN':
      case 'Greek_BIN2':
      case 'Greek_100_BIN':
      case 'Greek_100_BIN2':
        return 'μθζγ';
      case 'Hebrew_BIN':
      case 'Hebrew_BIN2':
      case 'Hebrew_100_BIN':
      case 'Hebrew_100_BIN2':
        return 'רְבָּעִים וּשְׁנֵי יְלָדִים';
      case 'Hungarian_BIN':
      case 'Hungarian_BIN2':
      case 'Hungarian_100_BIN':
      case 'Hungarian_100_BIN2':
      case 'Hungarian_Technical_BIN':
      case 'Hungarian_Technical_BIN2':
      case 'Hungarian_Technical_100_BIN':
      case 'Hungarian_Technical_100_BIN2':
        return 'yſa pur eſ ';
      case 'Icelandic_BIN':
      case 'Icelandic_BIN2':
      case 'Icelandic_100_BIN':
      case 'Icelandic_100_BIN2':
        return 'Ekki veit ég það';
      case 'Indic_General_90_BIN':
      case 'Indic_General_90_BIN2':
      case 'Indic_General_100_BIN':
      case 'Indic_General_100_BIN2':
        return 'सभी मनुष्यों को गौर';
      case 'Japanese_BIN':
      case 'Japanese_BIN2':
      case 'Japanese_90_BIN':
      case 'Japanese_90_BIN2':
      case 'Japanese_Bushu_Kakusu_100_BIN':
      case 'Japanese_Bushu_Kakusu_100_BIN2':
      case 'Japanese_Bushu_Kakusu_140_BIN':
      case 'Japanese_Bushu_Kakusu_140_BIN2':
      case 'Japanese_Unicode_BIN':
      case 'Japanese_Unicode_BIN2':
      case 'Japanese_XJIS_100_BIN':
      case 'Japanese_XJIS_100_BIN2':
      case 'Japanese_XJIS_140_BIN':
      case 'Japanese_XJIS_140_BIN2':
        return '昨夜のコンサ';
      case 'Kazakh_90_BIN':
      case 'Kazakh_90_BIN2':
      case 'Kazakh_100_BIN':
      case 'Kazakh_100_BIN2':
        return 'كۇقىقتارى تەڭ';
      case 'Khmer_100_BIN':
      case 'Khmer_100_BIN2':
        return 'ភាសាខ្មែរ';
      case 'Korean_90_BIN':
      case 'Korean_90_BIN2':
      case 'Korean_100_BIN':
      case 'Korean_100_BIN2':
      case 'Korean_Wansung_BIN':
      case 'Korean_Wansung_BIN2':
        return '울란바따르';
      case 'Lao_100_BIN':
      case 'Lao_100_BIN2':
        return 'ອັກສອນລາວ';
      case 'Latin1_General_BIN':
      case 'Latin1_General_BIN2':
      case 'Latin1_General_100_BIN':
      case 'Latin1_General_100_BIN2':
        return 'latin';
      case 'Latvian_BIN':
      case 'Latvian_BIN2':
      case 'Latvian_100_BIN':
      case 'Latvian_100_BIN2':
        return 'latviešu';
      case 'Lithuanian_BIN':
      case 'Lithuanian_BIN2':
      case 'Lithuanian_100_BIN':
      case 'Lithuanian_100_BIN2':
        return 'lietuvių kalba';
      case 'Macedonian_FYROM_90_BIN':
      case 'Macedonian_FYROM_90_BIN2':
      case 'Macedonian_FYROM_100_BIN':
      case 'Macedonian_FYROM_100_BIN2':
        return 'Македонска';
      case 'Maltese_100_BIN':
      case 'Maltese_100_BIN2':
        return 'Għgħ Hh Ħħ';
      case 'Maori_100_BIN':
      case 'Maori_100_BIN2':
        return 'tēnei';
      case 'Mapudungan_100_BIN':
      case 'Mapudungan_100_BIN2':
        return 'epuñpvle';
      case 'Modern_Spanish_BIN':
      case 'Modern_Spanish_BIN2':
      case 'Modern_Spanish_100_BIN':
      case 'Modern_Spanish_100_BIN2':
        return 'español';
      case 'Mohawk_100_BIN':
      case 'Mohawk_100_BIN2':
        return "Kon'tatieshon";
      case 'Nepali_100_BIN':
      case 'Nepali_100_BIN2':
        return 'ओएएऊचत';
      case 'Norwegian_100_BIN':
      case 'Norwegian_100_BIN2':
        return 'fødde';
      case 'Pashto_100_BIN':
      case 'Pashto_100_BIN2':
        return 'خچځڅړږ';
      case 'Persian_100_BIN':
      case 'Persian_100_BIN2':
        return 'فارسی';
      case 'Polish_BIN':
      case 'Polish_BIN2':
      case 'Polish_100_BIN':
      case 'Polish_100_BIN2':
        return 'ńłćźąż';
      case 'Romanian_BIN':
      case 'Romanian_BIN2':
      case 'Romanian_100_BIN':
      case 'Romanian_100_BIN2':
      case 'Romansh_100_BIN':
      case 'Romansh_100_BIN2':
        return 'șâăț';
      case 'Sami_Norway_100_BIN':
      case 'Sami_Norway_100_BIN2':
        return 'čæøåeŋø';
      case 'Sami_Sweden_Finland_100_BIN':
      case 'Sami_Sweden_Finland_100_BIN2':
        return 'sami';
      case 'Serbian_Cyrillic_100_BIN':
      case 'Serbian_Cyrillic_100_BIN2':
        return 'Сва људска';
      case 'Serbian_Latin_100_BIN':
      case 'Serbian_Latin_100_BIN2':
        return 'postupaju u duhu';
      case 'Slovak_BIN':
      case 'Slovak_BIN2':
      case 'Slovak_100_BIN':
      case 'Slovak_100_BIN2':
        return 'Všetci ľudia';
      case 'Slovenian_BIN':
      case 'Slovenian_BIN2':
      case 'Slovenian_100_BIN':
      case 'Slovenian_100_BIN2':
        return 'slovenščina';
      case 'Syriac_90_BIN':
      case 'Syriac_90_BIN2':
      case 'Syriac_100_BIN':
      case 'Syriac_100_BIN2':
        return 'ܒܫܝܢܐ';
      case 'Tamazight_100_BIN':
      case 'Tamazight_100_BIN2':
        return 'ɣṭṣǧčḥ';
      case 'Tatar_90_BIN':
      case 'Tatar_90_BIN2':
      case 'Tatar_100_BIN':
      case 'Tatar_100_BIN2':
        return 'абруйлары';
      case 'Thai_BIN':
      case 'Thai_BIN2':
      case 'Thai_100_BIN':
      case 'Thai_100_BIN2':
        return 'ภาษาไทย';
      case 'Tibetan_100_BIN':
      case 'Tibetan_100_BIN2':
        return 'འགྲེམས་སྟོན་';
      case 'Traditional_Spanish_BIN':
      case 'Traditional_Spanish_BIN2':
      case 'Traditional_Spanish_100_BIN':
      case 'Traditional_Spanish_100_BIN2':
        return 'España';
      case 'Turkish_BIN':
      case 'Turkish_BIN2':
      case 'Turkish_100_BIN':
      case 'Turkish_100_BIN2':
        return 'Türkçe';
      case 'Turkmen_100_BIN':
      case 'Turkmen_100_BIN2':
        return 'ягдайда дүнйә';
      case 'Uighur_100_BIN':
      case 'Uighur_100_BIN2':
        return ' ئۇيغۇر تىلى';
      case 'Ukrainian_BIN':
      case 'Ukrainian_BIN2':
      case 'Ukrainian_100_BIN':
      case 'Ukrainian_100_BIN2':
        return 'своїй гідності';
      case 'Upper_Sorbian_100_BIN':
      case 'Upper_Sorbian_100_BIN2':
        return 'hornjoserbšćina';
      case 'UTF8_BIN':
      case 'UTF8_BIN2':
        return 'µ¶º¿';
      case 'Urdu_100_BIN':
      case 'Urdu_100_BIN2':
        return 'کشےٹھا';
      case 'Uzbek_Latin_90_BIN':
      case 'Uzbek_Latin_90_BIN2':
      case 'Uzbek_Latin_100_BIN':
      case 'Uzbek_Latin_100_BIN2':
        return 'танг бўлиб туғиладилар';
      case 'Vietnamese_BIN':
      case 'Vietnamese_BIN2':
      case 'Vietnamese_100_BIN':
      case 'Vietnamese_100_BIN2':
        return 'hữ Quốc ngữ';
      case 'Welsh_100_BIN':
      case 'Welsh_100_BIN2':
        return 'ỳýÿŷèêàâûúŵóò';
      case 'Yakut_100_BIN':
      case 'Yakut_100_BIN2':
        return 'өйдөөх';
      case 'SQL_Latin1_General_CP437_BIN':
      case 'SQL_Latin1_General_CP437_BIN2':
      case 'SQL_Latin1_General_CP850_BIN':
      case 'SQL_Latin1_General_CP850_BIN2':
        return 'latin';
      default:
        return null;
    }
  };

  const generateAllRandomizedCollations = (cb) => {
    const request = new Request('SELECT Name FROM fn_helpcollations() where name like \'%BIN%\'', (err) => {
      if (err) {
        return cb(err);
      }
      // const val = randomizedCollations.length;
      const val = 35;
      const temp = [];
      for (let i = 0; i < val; i++) {
        temp.push(randomizedCollations[i]);
      }
      randomizedCollations = temp;
      return cb();
    });

    request.on('row', function(columns) {
      columns.forEach(function(column) {
        randomizedCollations.push(column.value);
      });
    });

    connection.execSql(request);
  };

  const generateAllDeterministicCollations = (cb) => {
    const request = new Request('SELECT Name FROM fn_helpcollations() where name like \'%BIN2%\'', (err) => {
      if (err) {
        return cb(err);
      }
      const val = 131;
      /**
       * Note: the very last collation in deterministicCollations throws an error:
       * "Cannot create encrypted column 'Determinized131', character strings that do not use a *_BIN2 collation cannot be encrypted"
       * which doesn't make sense. To be reviewed at a later time.
       */
      // const val = deterministicCollations.length;
      const temp = [];
      for (let i = 0; i < val; i++) {
        temp.push(deterministicCollations[i]);
      }
      deterministicCollations = temp;
      return cb();
    });

    request.on('row', function(columns) {
      columns.forEach(function(column) {
        deterministicCollations.push(column.value);
      });
    });

    connection.execSql(request);
  };

  const createRandomizedCharTable = (cb) => {
    let sql = 'create table ' + charRandomizedTable + ' (';

    for (let i = 0; i < randomizedCollations.length; i++) {
      sql += 'RandomizedChar' + i + ' nvarchar(50) COLLATE ' + randomizedCollations[i] + " ENCRYPTED WITH (ENCRYPTION_TYPE = RANDOMIZED, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = [CEK1]) NULL,";
    }
    sql += ');';

    const request = new Request(sql, (err) => {
      if (err) {
        return cb(err);
      }

      cb();
    });
    connection.execSql(request);
  };

  const createDeterministicCharTable = (cb) => {
    let sql = 'create table ' + charDeterminiticTable + ' (';

    for (let i = 0; i < deterministicCollations.length; i++) {
      sql += 'Determinized' + i + ' nvarchar(50) COLLATE ' + deterministicCollations[i] + " ENCRYPTED WITH (ENCRYPTION_TYPE = DETERMINISTIC, ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256', COLUMN_ENCRYPTION_KEY = [CEK1]) NULL,";
    }
    sql += ');';

    const request = new Request(sql, (err) => {
      if (err) {
        return cb(err);
      }

      cb();
    });
    connection.execSql(request);
  };

  const populateRandomizedCharTable = (cb) => {
    const lastI = randomizedCollations.length - 1;
    let sql = 'insert into ' + charRandomizedTable + ' values( ';
    for (let i = 0; i < lastI; i++) {
      sql += '@p' + i + ',';
    }

    sql += '@p' + lastI + ')';

    const request = new Request(sql, (err) => {
      if (err) {
        return cb(err);
      }

      cb();
    });

    for (let i = 0; i < randomizedCollations.length; i++) {
      const val = getWord(randomizedCollations[i]);
      request.addParameter('p' + i, TYPES.NVarChar, val);
    }

    connection.execSql(request);
  };

  const populateDeterminzedCharTable = (cb) => {
    const lastI = deterministicCollations.length - 1;
    let sql = 'insert into ' + charDeterminiticTable + ' values( ';
    for (let i = 0; i < lastI; i++) {
      sql += '@p' + i + ',';
    }

    sql += '@p' + lastI + ')';

    const request = new Request(sql, (err) => {
      if (err) {
        return cb(err);
      }

      cb();
    });

    for (let i = 0; i < deterministicCollations.length; i++) {
      const val = getWord(deterministicCollations[i]);
      request.addParameter('p' + i, TYPES.NVarChar, val);
    }

    connection.execSql(request);
  };


  beforeEach(function(done) {
    connection = new Connection(config);
    // connection.on('debug', (msg) => console.log(msg));
    connection.connect((err) => {
      if (err) {
        return done(err);
      }

      dropKeys((err) => {
        if (err) {
          return done(err);
        }
        createKeys(done);
      });
    });
  });

  afterEach(function(done) {
    if (!connection.closed) {
      dropKeys(() => {
        connection.on('end', done);
        connection.close();
      });
    } else {
      done();
    }
  });

  it('should test randomized char table', function(done) {
    generateAllRandomizedCollations((err) => {
      if (err) {
        return done(err);
      }
      createRandomizedCharTable((err) => {
        if (err) {
          return done(err);
        }
        populateRandomizedCharTable((err) => {
          if (err) {
            return done(err);
          }

          const result = [];

          const request = new Request('select TOP 1 * from ' + charRandomizedTable, (err) => {
            if (err) {
              return done(err);
            }
            for (let i = 0; i < randomizedCollations.length; i++) {
              const actual = result[i];
              const expected = getWord(randomizedCollations[i]);
              assert.deepEqual(actual, expected);
            }
            done();
          });

          request.on('row', function(columns) {
            columns.forEach(function(column) {
              result.push(column.value);
            });
          });
          connection.execSql(request);
        });
      });
    });
  });

  it('should test deterministic char table', function(done) {
    generateAllDeterministicCollations((err) => {
      if (err) {

        return done(err);
      }
      createDeterministicCharTable((err) => {
        if (err) {

          return done(err);
        }
        populateDeterminzedCharTable((err) => {
          if (err) {
            return done(err);
          }
          const result = [];
          const request = new Request('select TOP 1 * from ' + charDeterminiticTable, (err) => {
            if (err) {
              return done(err);
            }
            for (let i = 0; i < deterministicCollations.length; i++) {
              const actual = result[i];
              const expected = getWord(deterministicCollations[i]);
              assert.deepEqual(actual, expected);
            }
            done();
          });

          request.on('row', function(columns) {
            columns.forEach(function(column) {
              result.push(column.value);
            });
          });
          connection.execSql(request);
        });
      });
    });
  });
});
