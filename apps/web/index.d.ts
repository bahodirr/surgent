/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '*.svg' {
  const content: any;
  export const ReactComponent: any;
  export default content;
}

// Allow importing raw JSON themes for Monaco TODO: explain
declare module '*.json' {
  const value: any;
  export default value;
}
