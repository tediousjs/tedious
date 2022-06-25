declare module 'js-md4' {
  declare const md4: {
    hex(message: string | ArrayBuffer): string;
  };

  export = md4;
}
