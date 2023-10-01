const { createBenchmark } = require('../common');

const { Parser } = require('tedious/lib/token/token-stream-parser');

const bench = createBenchmark(main, {
  n: [10, 100, 1000]
});

async function * repeat(data, n) {
  for (let i = 0; i < n; i++) {
    yield data;
  }
}

function main({ n }) {
  const data = Buffer.from([
    '810300000000001000380269006400000000000900E7C8000904D00034046E00',
    '61006D006500000000000900E7FFFF0904D000340B6400650073006300720069',
    '007000740069006F006E00D1010000000A0052006F0077002000300044000000',
    '00000000440000004500780061006D0070006C00650020005400650073007400',
    '20004400650073006300720069007000740069006F006E00200066006F007200',
    '200052006F0077002000300000000000D1020000000A0052006F007700200031',
    '004400000000000000440000004500780061006D0070006C0065002000540065',
    '007300740020004400650073006300720069007000740069006F006E00200066',
    '006F007200200052006F0077002000310000000000D1030000000A0052006F00',
    '7700200032004400000000000000440000004500780061006D0070006C006500',
    '2000540065007300740020004400650073006300720069007000740069006F00',
    '6E00200066006F007200200052006F0077002000320000000000D1040000000A',
    '0052006F007700200033004400000000000000440000004500780061006D0070',
    '006C006500200054006500730074002000440065007300630072006900700074',
    '0069006F006E00200066006F007200200052006F0077002000330000000000D1',
    '050000000A0052006F0077002000340044000000000000004400000045007800',
    '61006D0070006C00650020005400650073007400200044006500730063007200',
    '69007000740069006F006E00200066006F007200200052006F00770020003400',
    '00000000D1060000000A0052006F007700200035004400000000000000440000',
    '004500780061006D0070006C0065002000540065007300740020004400650073',
    '006300720069007000740069006F006E00200066006F007200200052006F0077',
    '002000350000000000D1070000000A0052006F00770020003600440000000000',
    '0000440000004500780061006D0070006C006500200054006500730074002000',
    '4400650073006300720069007000740069006F006E00200066006F0072002000',
    '52006F0077002000360000000000D1080000000A0052006F0077002000370044',
    '00000000000000440000004500780061006D0070006C00650020005400650073',
    '00740020004400650073006300720069007000740069006F006E00200066006F',
    '007200200052006F0077002000370000000000D1090000000A0052006F007700',
    '200038004400000000000000440000004500780061006D0070006C0065002000',
    '540065007300740020004400650073006300720069007000740069006F006E00',
    '200066006F007200200052006F0077002000380000000000D10A0000000A0052',
    '006F007700200039004400000000000000440000004500780061006D0070006C',
    '0065002000540065007300740020004400650073006300720069007000740069',
    '006F006E00200066006F007200200052006F0077002000390000000000D10B00',
    '00000C0052006F00770020003100300046000000000000004600000045007800',
    '61006D0070006C00650020005400650073007400200044006500730063007200',
    '69007000740069006F006E00200066006F007200200052006F00770020003100',
    '300000000000D10C0000000C0052006F00770020003100310046000000000000',
    '00460000004500780061006D0070006C00650020005400650073007400200044',
    '00650073006300720069007000740069006F006E00200066006F007200200052',
    '006F00770020003100310000000000D10D0000000C0052006F00770020003100',
    '32004600000000000000460000004500780061006D0070006C00650020005400',
    '65007300740020004400650073006300720069007000740069006F006E002000',
    '66006F007200200052006F00770020003100320000000000D10E0000000C0052',
    '006F0077002000310033004600000000000000460000004500780061006D0070',
    '006C006500200054006500730074002000440065007300630072006900700074',
    '0069006F006E00200066006F007200200052006F007700200031003300000000',
    '00D10F0000000C0052006F007700200031003400460000000000000046000000',
    '4500780061006D0070006C006500200054006500730074002000440065007300',
    '6300720069007000740069006F006E00200066006F007200200052006F007700',
    '20003100340000000000D1100000000C0052006F007700200031003500460000',
    '0000000000460000004500780061006D0070006C006500200054006500730074',
    '0020004400650073006300720069007000740069006F006E00200066006F0072',
    '00200052006F00770020003100350000000000D1110000000C0052006F007700',
    '2000310036004600000000000000460000004500780061006D0070006C006500',
    '2000540065007300740020004400650073006300720069007000740069006F00',
    '6E00200066006F007200200052006F00770020003100360000000000D1120000',
    '000C0052006F0077002000310037004600000000000000460000004500780061',
    '006D0070006C0065002000540065007300740020004400650073006300720069',
    '007000740069006F006E00200066006F007200200052006F0077002000310037',
    '0000000000D1130000000C0052006F0077002000310038004600000000000000',
    '460000004500780061006D0070006C0065002000540065007300740020004400',
    '650073006300720069007000740069006F006E00200066006F00720020005200',
    '6F00770020003100380000000000D1140000000C0052006F0077002000310039',
    '004600000000000000460000004500780061006D0070006C0065002000540065',
    '007300740020004400650073006300720069007000740069006F006E00200066',
    '006F007200200052006F00770020003100390000000000D1150000000C005200',
    '6F0077002000320030004600000000000000460000004500780061006D007000',
    '6C00650020005400650073007400200044006500730063007200690070007400',
    '69006F006E00200066006F007200200052006F00770020003200300000000000',
    'D1160000000C0052006F00770020003200310046000000000000004600000045',
    '00780061006D0070006C00650020005400650073007400200044006500730063',
    '00720069007000740069006F006E00200066006F007200200052006F00770020',
    '003200310000000000D1170000000C0052006F00770020003200320046000000',
    '00000000460000004500780061006D0070006C00650020005400650073007400',
    '20004400650073006300720069007000740069006F006E00200066006F007200',
    '200052006F00770020003200320000000000D1180000000C0052006F00770020',
    '00320033004600000000000000460000004500780061006D0070006C00650020',
    '00540065007300740020004400650073006300720069007000740069006F006E',
    '00200066006F007200200052006F00770020003200330000000000D119000000',
    '0C0052006F007700200032003400460000000000000046000000450078006100',
    '6D0070006C006500200054006500730074002000440065007300630072006900',
    '7000740069006F006E00200066006F007200200052006F007700200032003400',
    '00000000D11A0000000C0052006F007700200032003500460000000000000046',
    '0000004500780061006D0070006C006500200054006500730074002000440065',
    '0073006300720069007000740069006F006E00200066006F007200200052006F',
    '00770020003200350000000000D11B0000000C0052006F007700200032003600',
    '4600000000000000460000004500780061006D0070006C006500200054006500',
    '7300740020004400650073006300720069007000740069006F006E0020006600',
    '6F007200200052006F00770020003200360000000000D11C0000000C0052006F',
    '0077002000320037004600000000000000460000004500780061006D0070006C',
    '0065002000540065007300740020004400650073006300720069007000740069',
    '006F006E00200066006F007200200052006F00770020003200370000000000D1',
    '1D0000000C0052006F0077002000320038004600000000000000460000004500',
    '780061006D0070006C0065002000540065007300740020004400650073006300',
    '720069007000740069006F006E00200066006F007200200052006F0077002000',
    '3200380000000000D11E0000000C0052006F0077002000320039004600000000',
    '000000460000004500780061006D0070006C0065002000540065007300740020',
    '004400650073006300720069007000740069006F006E00200066006F00720020',
    '0052006F00770020003200390000000000D11F0000000C0052006F0077002000',
    '330030004600000000000000460000004500780061006D0070006C0065002000',
    '540065007300740020004400650073006300720069007000740069006F006E00',
    '200066006F007200200052006F00770020003300300000000000D1200000000C',
    '0052006F0077002000330031004600000000000000460000004500780061006D',
    '0070006C00650020005400650073007400200044006500730063007200690070',
    '00740069006F006E00200066006F007200200052006F00770020003300310000',
    '000000D1210000000C0052006F00770020003300320046000000000000004600',
    '00004500780061006D0070006C00650020005400650073007400200044006500',
    '73006300720069007000740069006F006E00200066006F007200200052006F00',
    '770020003300320000000000D1220000000C0052006F00770020003300330046',
    '00000000000000460000004500780061006D0070006C00650020005400650073',
    '00740020004400650073006300720069007000740069006F006E00200066006F',
    '007200200052006F00770020003300330000000000D1230000000C0052006F00',
    '77002000330034004600000000000000460000004500780061006D0070006C00',
    '6500200054006500730074002000440065007300630072006900700074006900',
    '6F006E00200066006F007200200052006F00770020003300340000000000D124',
    '0000000C0052006F007700200033003500460000000000000046000000450078',
    '0061006D0070006C006500200054006500730074002000440065007300630072',
    '0069007000740069006F006E00200066006F007200200052006F007700200033',
    '00350000000000D1250000000C0052006F007700200033003600460000000000',
    '0000460000004500780061006D0070006C006500200054006500730074002000',
    '4400650073006300720069007000740069006F006E00200066006F0072002000',
    '52006F00770020003300360000000000D1260000000C0052006F007700200033',
    '0037004600000000000000460000004500780061006D0070006C006500200054',
    '0065007300740020004400650073006300720069007000740069006F006E0020',
    '0066006F007200200052006F00770020003300370000000000D1270000000C00',
    '52006F0077002000330038004600000000000000200000004500780061006D00',
    '70006C006500200054006500730074002000440065007300',
    '260000006300720069007000740069006F006E00200066006F00720020005200',
    '6F00770020003300380000000000D1280000000C0052006F0077002000330039',
    '004600000000000000460000004500780061006D0070006C0065002000540065',
    '007300740020004400650073006300720069007000740069006F006E00200066',
    '006F007200200052006F00770020003300390000000000D1290000000C005200',
    '6F0077002000340030004600000000000000460000004500780061006D007000',
    '6C00650020005400650073007400200044006500730063007200690070007400',
    '69006F006E00200066006F007200200052006F00770020003400300000000000',
    'D12A0000000C0052006F00770020003400310046000000000000004600000045',
    '00780061006D0070006C00650020005400650073007400200044006500730063',
    '00720069007000740069006F006E00200066006F007200200052006F00770020',
    '003400310000000000D12B0000000C0052006F00770020003400320046000000',
    '00000000460000004500780061006D0070006C00650020005400650073007400',
    '20004400650073006300720069007000740069006F006E00200066006F007200',
    '200052006F00770020003400320000000000D12C0000000C0052006F00770020',
    '00340033004600000000000000460000004500780061006D0070006C00650020',
    '00540065007300740020004400650073006300720069007000740069006F006E',
    '00200066006F007200200052006F00770020003400330000000000D12D000000',
    '0C0052006F007700200034003400460000000000000046000000450078006100',
    '6D0070006C006500200054006500730074002000440065007300630072006900',
    '7000740069006F006E00200066006F007200200052006F007700200034003400',
    '00000000D12E0000000C0052006F007700200034003500460000000000000046',
    '0000004500780061006D0070006C006500200054006500730074002000440065',
    '0073006300720069007000740069006F006E00200066006F007200200052006F',
    '00770020003400350000000000D12F0000000C0052006F007700200034003600',
    '4600000000000000460000004500780061006D0070006C006500200054006500',
    '7300740020004400650073006300720069007000740069006F006E0020006600',
    '6F007200200052006F00770020003400360000000000D1300000000C0052006F',
    '0077002000340037004600000000000000460000004500780061006D0070006C',
    '0065002000540065007300740020004400650073006300720069007000740069',
    '006F006E00200066006F007200200052006F00770020003400370000000000D1',
    '310000000C0052006F0077002000340038004600000000000000460000004500',
    '780061006D0070006C0065002000540065007300740020004400650073006300',
    '720069007000740069006F006E00200066006F007200200052006F0077002000',
    '3400380000000000D1320000000C0052006F0077002000340039004600000000',
    '000000460000004500780061006D0070006C0065002000540065007300740020',
    '004400650073006300720069007000740069006F006E00200066006F00720020',
    '0052006F00770020003400390000000000D1330000000C0052006F0077002000',
    '350030004600000000000000460000004500780061006D0070006C0065002000',
    '540065007300740020004400650073006300720069007000740069006F006E00',
    '200066006F007200200052006F00770020003500300000000000D1340000000C',
    '0052006F0077002000350031004600000000000000460000004500780061006D',
    '0070006C00650020005400650073007400200044006500730063007200690070',
    '00740069006F006E00200066006F007200200052006F00770020003500310000',
    '000000D1350000000C0052006F00770020003500320046000000000000004600',
    '00004500780061006D0070006C00650020005400650073007400200044006500',
    '73006300720069007000740069006F006E00200066006F007200200052006F00',
    '770020003500320000000000D1360000000C0052006F00770020003500330046',
    '00000000000000460000004500780061006D0070006C00650020005400650073',
    '00740020004400650073006300720069007000740069006F006E00200066006F',
    '007200200052006F00770020003500330000000000D1370000000C0052006F00',
    '77002000350034004600000000000000460000004500780061006D0070006C00',
    '6500200054006500730074002000440065007300630072006900700074006900',
    '6F006E00200066006F007200200052006F00770020003500340000000000D138',
    '0000000C0052006F007700200035003500460000000000000046000000450078',
    '0061006D0070006C006500200054006500730074002000440065007300630072',
    '0069007000740069006F006E00200066006F007200200052006F007700200035',
    '00350000000000D1390000000C0052006F007700200035003600460000000000',
    '0000460000004500780061006D0070006C006500200054006500730074002000',
    '4400650073006300720069007000740069006F006E00200066006F0072002000',
    '52006F00770020003500360000000000D13A0000000C0052006F007700200035',
    '0037004600000000000000460000004500780061006D0070006C006500200054',
    '0065007300740020004400650073006300720069007000740069006F006E0020',
    '0066006F007200200052006F00770020003500370000000000D13B0000000C00',
    '52006F0077002000350038004600000000000000460000004500780061006D00',
    '70006C0065002000540065007300740020004400650073006300720069007000',
    '740069006F006E00200066006F007200200052006F0077002000350038000000',
    '0000D13C0000000C0052006F0077002000350039004600000000000000460000',
    '004500780061006D0070006C0065002000540065007300740020004400650073',
    '006300720069007000740069006F006E00200066006F007200200052006F0077',
    '0020003500390000000000D13D0000000C0052006F0077002000360030004600',
    '000000000000460000004500780061006D0070006C0065002000540065007300',
    '740020004400650073006300720069007000740069006F006E00200066006F00',
    '7200200052006F00770020003600300000000000D13E0000000C0052006F0077',
    '002000360031004600000000000000460000004500780061006D0070006C0065',
    '002000540065007300740020004400650073006300720069007000740069006F',
    '006E00200066006F007200200052006F00770020003600310000000000D13F00',
    '00000C0052006F00770020003600320046000000000000004600000045007800',
    '61006D0070006C00650020005400650073007400200044006500730063007200',
    '69007000740069006F006E00200066006F007200200052006F00770020003600',
    '320000000000D1400000000C0052006F00770020003600330046000000000000',
    '00460000004500780061006D0070006C00650020005400650073007400200044',
    '00650073006300720069007000740069006F006E00200066006F007200200052',
    '006F00770020003600330000000000D1410000000C0052006F00770020003600',
    '34004600000000000000460000004500780061006D0070006C00650020005400',
    '65007300740020004400650073006300720069007000740069006F006E002000',
    '66006F007200200052006F00770020003600340000000000D1420000000C0052',
    '006F0077002000360035004600000000000000460000004500780061006D0070',
    '006C006500200054006500730074002000440065007300630072006900700074',
    '0069006F006E00200066006F007200200052006F007700200036003500000000',
    '00D1430000000C0052006F007700200036003600460000000000000046000000',
    '4500780061006D0070006C006500200054006500730074002000440065007300',
    '6300720069007000740069006F006E00200066006F007200200052006F007700',
    '20003600360000000000D1440000000C0052006F007700200036003700460000',
    '0000000000460000004500780061006D0070006C006500200054006500730074',
    '0020004400650073006300720069007000740069006F006E00200066006F0072',
    '00200052006F00770020003600370000000000D1450000000C0052006F007700',
    '2000360038004600000000000000460000004500780061006D0070006C006500',
    '2000540065007300740020004400650073006300720069007000740069006F00',
    '6E00200066006F007200200052006F00770020003600380000000000D1460000',
    '000C0052006F0077002000360039004600000000000000460000004500780061',
    '006D0070006C0065002000540065007300740020004400650073006300720069',
    '007000740069006F006E00200066006F007200200052006F0077002000360039',
    '0000000000D1470000000C0052006F0077002000370030004600000000000000',
    '460000004500780061006D0070006C0065002000540065007300740020004400',
    '650073006300720069007000740069006F006E00200066006F00720020005200',
    '6F00770020003700300000000000D1480000000C0052006F0077002000370031',
    '004600000000000000460000004500780061006D0070006C0065002000540065',
    '007300740020004400650073006300720069007000740069006F006E00200066',
    '006F007200200052006F00770020003700310000000000D1490000000C005200',
    '6F0077002000370032004600000000000000460000004500780061006D007000',
    '6C00650020005400650073007400200044006500730063007200690070007400',
    '69006F006E00200066006F007200200052006F00770020003700320000000000',
    'D14A0000000C0052006F00770020003700330046000000000000004600000045',
    '00780061006D0070006C00650020005400650073007400200044006500730063',
    '00720069007000740069006F006E00200066006F007200200052006F00770020',
    '003700330000000000D14B0000000C0052006F00770020003700340046000000',
    '00000000460000004500780061006D0070006C00650020005400650073007400',
    '20004400650073006300720069007000740069006F006E00200066006F007200',
    '200052006F00770020003700340000000000D14C0000000C0052006F00770020',
    '00370035004600000000000000460000004500780061006D0070006C00650020',
    '00540065007300740020004400650073006300720069007000740069006F006E',
    '00200066006F007200200052006F00770020003700350000000000D14D000000',
    '0C0052006F007700200037003600460000000000000046000000450078006100',
    '6D0070006C006500200054006500730074002000440065007300630072006900',
    '7000740069006F006E00200066006F007200200052006F007700200037003600',
    '00000000D14E0000000C0052006F007700200037003700460000000000000015',
    '0000004500780061006D0070006C00650020005400650073',
    '3100000000740020004400650073006300720069007000740069006F006E0020',
    '0066006F007200200052006F00770020003700370000000000D14F0000000C00',
    '52006F0077002000370038004600000000000000460000004500780061006D00',
    '70006C0065002000540065007300740020004400650073006300720069007000',
    '740069006F006E00200066006F007200200052006F0077002000370038000000',
    '0000D1500000000C0052006F0077002000370039004600000000000000460000',
    '004500780061006D0070006C0065002000540065007300740020004400650073',
    '006300720069007000740069006F006E00200066006F007200200052006F0077',
    '0020003700390000000000D1510000000C0052006F0077002000380030004600',
    '000000000000460000004500780061006D0070006C0065002000540065007300',
    '740020004400650073006300720069007000740069006F006E00200066006F00',
    '7200200052006F00770020003800300000000000D1520000000C0052006F0077',
    '002000380031004600000000000000460000004500780061006D0070006C0065',
    '002000540065007300740020004400650073006300720069007000740069006F',
    '006E00200066006F007200200052006F00770020003800310000000000D15300',
    '00000C0052006F00770020003800320046000000000000004600000045007800',
    '61006D0070006C00650020005400650073007400200044006500730063007200',
    '69007000740069006F006E00200066006F007200200052006F00770020003800',
    '320000000000D1540000000C0052006F00770020003800330046000000000000',
    '00460000004500780061006D0070006C00650020005400650073007400200044',
    '00650073006300720069007000740069006F006E00200066006F007200200052',
    '006F00770020003800330000000000D1550000000C0052006F00770020003800',
    '34004600000000000000460000004500780061006D0070006C00650020005400',
    '65007300740020004400650073006300720069007000740069006F006E002000',
    '66006F007200200052006F00770020003800340000000000D1560000000C0052',
    '006F0077002000380035004600000000000000460000004500780061006D0070',
    '006C006500200054006500730074002000440065007300630072006900700074',
    '0069006F006E00200066006F007200200052006F007700200038003500000000',
    '00D1570000000C0052006F007700200038003600460000000000000046000000',
    '4500780061006D0070006C006500200054006500730074002000440065007300',
    '6300720069007000740069006F006E00200066006F007200200052006F007700',
    '20003800360000000000D1580000000C0052006F007700200038003700460000',
    '0000000000460000004500780061006D0070006C006500200054006500730074',
    '0020004400650073006300720069007000740069006F006E00200066006F0072',
    '00200052006F00770020003800370000000000D1590000000C0052006F007700',
    '2000380038004600000000000000460000004500780061006D0070006C006500',
    '2000540065007300740020004400650073006300720069007000740069006F00',
    '6E00200066006F007200200052006F00770020003800380000000000D15A0000',
    '000C0052006F0077002000380039004600000000000000460000004500780061',
    '006D0070006C0065002000540065007300740020004400650073006300720069',
    '007000740069006F006E00200066006F007200200052006F0077002000380039',
    '0000000000D15B0000000C0052006F0077002000390030004600000000000000',
    '460000004500780061006D0070006C0065002000540065007300740020004400',
    '650073006300720069007000740069006F006E00200066006F00720020005200',
    '6F00770020003900300000000000D15C0000000C0052006F0077002000390031',
    '004600000000000000460000004500780061006D0070006C0065002000540065',
    '007300740020004400650073006300720069007000740069006F006E00200066',
    '006F007200200052006F00770020003900310000000000D15D0000000C005200',
    '6F0077002000390032004600000000000000460000004500780061006D007000',
    '6C00650020005400650073007400200044006500730063007200690070007400',
    '69006F006E00200066006F007200200052006F00770020003900320000000000',
    'D15E0000000C0052006F00770020003900330046000000000000004600000045',
    '00780061006D0070006C00650020005400650073007400200044006500730063',
    '00720069007000740069006F006E00200066006F007200200052006F00770020',
    '003900330000000000D15F0000000C0052006F00770020003900340046000000',
    '00000000460000004500780061006D0070006C00650020005400650073007400',
    '20004400650073006300720069007000740069006F006E00200066006F007200',
    '200052006F00770020003900340000000000D1600000000C0052006F00770020',
    '00390035004600000000000000460000004500780061006D0070006C00650020',
    '00540065007300740020004400650073006300720069007000740069006F006E',
    '00200066006F007200200052006F00770020003900350000000000D161000000',
    '0C0052006F007700200039003600460000000000000046000000450078006100',
    '6D0070006C006500200054006500730074002000440065007300630072006900',
    '7000740069006F006E00200066006F007200200052006F007700200039003600',
    '00000000D1620000000C0052006F007700200039003700460000000000000046',
    '0000004500780061006D0070006C006500200054006500730074002000440065',
    '0073006300720069007000740069006F006E00200066006F007200200052006F',
    '00770020003900370000000000D1630000000C0052006F007700200039003800',
    '4600000000000000460000004500780061006D0070006C006500200054006500',
    '7300740020004400650073006300720069007000740069006F006E0020006600',
    '6F007200200052006F00770020003900380000000000D1640000000C0052006F',
    '0077002000390039004600000000000000460000004500780061006D0070006C',
    '0065002000540065007300740020004400650073006300720069007000740069',
    '006F006E00200066006F007200200052006F00770020003900390000000000FF',
    '1100C10064000000000000007900000000FE0000E0000000000000000000'
  ].join(''), 'hex');

  const parser = new Parser(repeat(data, n), { token: function() { } }, {}, {});

  bench.start();

  parser.on('end', () => {
    bench.end(n);
  });
}
