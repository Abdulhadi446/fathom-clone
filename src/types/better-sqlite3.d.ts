declare module "better-sqlite3" {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement<Row = unknown> {
    all(...params: unknown[]): Row[];
    get(...params: unknown[]): Row | undefined;
    run(...params: unknown[]): RunResult;
    iterate(...params: unknown[]): IterableIterator<Row>;
    pluck(toggle?: boolean): this;
    expand(toggle?: boolean): this;
    raw(toggle?: boolean): this;
    readonly source: string;
  }

  class Database {
    constructor(filename: string, options?: Record<string, unknown>);
    readonly name: string;
    readonly open: boolean;
    readonly inTransaction: boolean;
    pragma(source: string, options?: Record<string, unknown>): unknown;
    exec(sql: string): this;
    prepare<Row = unknown>(source: string): Statement<Row>;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
    close(): this;
  }

  namespace Database {
    export type { RunResult, Statement };
  }

  export = Database;
}
