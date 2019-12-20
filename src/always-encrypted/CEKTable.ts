import { CEKTableEntry } from "./CEKTableEntry";

export class CEKTable {
  keyList: CEKTableEntry[];

  constructor(tableSize: number) {
    this.keyList = [];
    for (let i = 0; i < tableSize; i++) {
      this.keyList.push(new CEKTableEntry(i));
    }
  }

  getCEKTableEntry(index: number) {
    return this.keyList[index];
  }

  setCEKTableEntry(index: number, entry: CEKTableEntry) {
    this.keyList[index] = entry;
  }
}
