export const versions: { [key: string]: number } = {
  '7_1': 0x71000001,
  '7_2': 0x72090002,
  '7_3_A': 0x730A0003,
  '7_3_B': 0x730B0003,
  '7_4': 0x74000004
};

export const versionsByValue: { [key: number]: string } = {};

for (const name in versions) {
  versionsByValue[versions[name]] = name;
}
