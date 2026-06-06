declare module 'qrcode-terminal' {
  interface GenerateOptions {
    small?: boolean;
  }
  function generate(input: string, options?: GenerateOptions, callback?: (qrcode: string) => void): void;
  export default { generate };
  export { generate };
}
