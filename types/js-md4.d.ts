declare module 'js-md4' {
  declare const md4: {
    arrayBuffer(message: string | ArrayBuffer): string;
  };

  export = md4;
}
