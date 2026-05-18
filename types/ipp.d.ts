declare module 'ipp' {
  export function Printer(url: string, options?: Record<string, unknown>): void;
  export function serialize(msg: Record<string, unknown>): Buffer;
  export function parse(buf: Buffer): Record<string, unknown>;
  // Minimal types for usage in print.ts
  export class Printer {
    constructor(url: string, options?: Record<string, unknown>);
    execute(operation: string, msg: Record<string, unknown>, cb: (err: Error | null, res: Record<string, unknown>) => void): void;
  }
}
