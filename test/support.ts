import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

export async function withTempDir(
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xanoscriptlint-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function writeXs(
  dir: string,
  rel: string,
  text: string,
): Promise<string> {
  const full = path.join(dir, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, text, "utf8");
  return full;
}

export const CLEAN_XS = `// Clean example
function "example" {
  input {
  }

  stack {
    var $ok {
      value = 1
    }
  }

  response = $ok
}`;

export const EMPTY_RUN_XS = `function "example" {
  input {
  }

  stack {
    function.run ""
  }

  response = null
}`;

export const VAR_RESPONSE_XS = `function "example" {
  input {
  }

  stack {
    var $response {
      value = 1
    }
  }

  response = $response
}`;

export function collectStream(): {
  stream: Writable;
  text: () => string;
} {
  let data = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      data += String(chunk);
      callback();
    },
  });
  return {
    stream,
    text: () => data,
  };
}
