const guidParser = require('../../src/guid-parser');
const assert = require('chai').assert;

const lowerGuids = [
  'e062ae34-6de5-47f3-8ba3-29d25f77e71a',
  'ba571367-38ba-40dc-aa89-b288f859479a',
  '3e217d7f-1a9a-4d9c-ae84-c0b1ed48bca6',
  'b08d287f-b58e-423d-955f-044effd55321',
  'aaeb5cea-9f29-4cd2-9404-855b47059b03',
  '13cba970-9175-47d5-a744-30d81041a75d',
  'ac334f73-16d6-4931-b49c-9df4d3f45ee5',
  '25f289bb-87a0-48bc-89ad-aae19beafb35',
  '3de421c7-2657-4d6b-9ac0-fad15f011ebe',
  '9560482b-91c6-4869-a372-e99d627ba863',
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'ffffffff-ffff-ffff-ffff-ffffffffffff'
];

const upperGuids = lowerGuids.map((g) => g.toUpperCase());

const mixedGuids = lowerGuids.map(
  (g) => g.substr(0, 10) + g.substr(10).toUpperCase()
);

const arrays = [
  [52, 174, 98, 224, 229, 109, 243, 71, 139, 163, 41, 210, 95, 119, 231, 26],
  [103, 19, 87, 186, 186, 56, 220, 64, 170, 137, 178, 136, 248, 89, 71, 154],
  [127, 125, 33, 62, 154, 26, 156, 77, 174, 132, 192, 177, 237, 72, 188, 166],
  [127, 40, 141, 176, 142, 181, 61, 66, 149, 95, 4, 78, 255, 213, 83, 33],
  [234, 92, 235, 170, 41, 159, 210, 76, 148, 4, 133, 91, 71, 5, 155, 3],
  [112, 169, 203, 19, 117, 145, 213, 71, 167, 68, 48, 216, 16, 65, 167, 93],
  [115, 79, 51, 172, 214, 22, 49, 73, 180, 156, 157, 244, 211, 244, 94, 229],
  [187, 137, 242, 37, 160, 135, 188, 72, 137, 173, 170, 225, 155, 234, 251, 53],
  [199, 33, 228, 61, 87, 38, 107, 77, 154, 192, 250, 209, 95, 1, 30, 190],
  [43, 72, 96, 149, 198, 145, 105, 72, 163, 114, 233, 157, 98, 123, 168, 99],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [
    170,
    170,
    170,
    170,
    170,
    170,
    170,
    170,
    170,
    170,
    170,
    170,
    170,
    170,
    170,
    170
  ],
  [
    187,
    187,
    187,
    187,
    187,
    187,
    187,
    187,
    187,
    187,
    187,
    187,
    187,
    187,
    187,
    187
  ],
  [
    204,
    204,
    204,
    204,
    204,
    204,
    204,
    204,
    204,
    204,
    204,
    204,
    204,
    204,
    204,
    204
  ],
  [
    221,
    221,
    221,
    221,
    221,
    221,
    221,
    221,
    221,
    221,
    221,
    221,
    221,
    221,
    221,
    221
  ],
  [
    238,
    238,
    238,
    238,
    238,
    238,
    238,
    238,
    238,
    238,
    238,
    238,
    238,
    238,
    238,
    238
  ],
  [
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255,
    255
  ]
];

describe('Guid Parser Test', function() {
  it('guidToArray', () => {
    for (let i = 0; i < lowerGuids.length; i++) {
      const guid = lowerGuids[i];
      assert.deepEqual(guidParser.guidToArray(guid), arrays[i]);
    }

    for (let i = 0; i < upperGuids.length; i++) {
      const guid = upperGuids[i];
      assert.deepEqual(guidParser.guidToArray(guid), arrays[i]);
    }

    for (let i = 0; i < mixedGuids.length; i++) {
      const guid = mixedGuids[i];
      assert.deepEqual(guidParser.guidToArray(guid), arrays[i]);
    }
  });

  it('bufferToLowerCaseGuid', () => {
    for (let i = 0; i < arrays.length; i++) {
      const array = arrays[i];
      assert.strictEqual(guidParser.bufferToLowerCaseGuid(array), lowerGuids[i]);
    }
  });

  it('bufferToUpperCaseGuid', () => {
    for (let i = 0; i < arrays.length; i++) {
      const array = arrays[i];
      assert.strictEqual(guidParser.bufferToUpperCaseGuid(array), upperGuids[i]);
    }
  });
});
