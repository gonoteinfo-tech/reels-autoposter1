import path from "node:path";
export const DATA_DIR = path.resolve(
  /*turbopackIgnore: true*/ process.env.DATA_DIR ||
    path.join(process.cwd(), "data"),
);
