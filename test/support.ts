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

export const NULL_RESPONSE_XS = `function "example" {
  input {
  }

  stack {
  }

  response = null
}`;

export const MOCK_SHORT_NAME = '"checkout short"';
export const MOCK_LONG_NAME = '"checkout longest_scenario_name"';
export const MOCK_NAME_PAD = MOCK_LONG_NAME.length - MOCK_SHORT_NAME.length;

export function wrapMockBlock(entries: string): string {
  return `function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {
${entries}
      }
    }
  }

  response = $item
}`;
}

export function wrapInputDecls(decls: string): string {
  return `function "example" {
  input {
${decls}
  }

  stack {
  }

  response = $ok
}`;
}

export const ZERO_DEFAULT_DECLS = `    int retry_count?=0
    decimal offset?=0.0
    int? page?=0
    int[] ids?=0
    int cap?=0 filters=min:1
    int quoted?="0"`;

export const ZERO_DEFAULT_FIXED_DECLS = `    int retry_count?
    decimal offset?
    int? page?
    int[] ids?
    int cap? filters=min:1
    int quoted?`;

export const ZERO_DEFAULT_XS = wrapInputDecls(ZERO_DEFAULT_DECLS);
export const ZERO_DEFAULT_FIXED_XS = wrapInputDecls(ZERO_DEFAULT_FIXED_DECLS);

export const NEGATIVE_DEFAULT_DECLS = `    int quantity?=-1
    decimal drift?=-2.5
    int? floor?=-3
    int[] slots?=-4
    int retries?=-1 filters=min:0
    int owner_id?=-1 {
      table = "user"
    }`;

export const NEGATIVE_DEFAULT_FIXED_DECLS = `    int quantity?="-1"
    decimal drift?="-2.5"
    int? floor?="-3"
    int[] slots?="-4"
    int retries?="-1" filters=min:0
    int owner_id?="-1" {
      table = "user"
    }`;

export const NEGATIVE_DEFAULT_XS = wrapInputDecls(NEGATIVE_DEFAULT_DECLS);
export const NEGATIVE_DEFAULT_FIXED_XS = wrapInputDecls(NEGATIVE_DEFAULT_FIXED_DECLS);

export function wrapInputBlock(entries: string): string {
  return `function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {
${entries}
      }
    } as $dispatch
  }

  response = $dispatch
}`;
}

export const ALIGNED_MOCK_ENTRIES = `        ${MOCK_SHORT_NAME}${" ".repeat(MOCK_NAME_PAD)}: {id: 1}
        ${MOCK_LONG_NAME}: {id: 2}`;

export const ALIGNED_MOCK_XS = wrapMockBlock(ALIGNED_MOCK_ENTRIES);

export const UNDERPADDED_MOCK_XS = wrapMockBlock(
  `        ${MOCK_SHORT_NAME}: {id: 1}
        ${MOCK_LONG_NAME}: {id: 2}`,
);

export const OVERPADDED_LONG_MOCK_XS = wrapMockBlock(
  `        ${MOCK_SHORT_NAME}${" ".repeat(MOCK_NAME_PAD)}: {id: 1}
        ${MOCK_LONG_NAME}  : {id: 2}`,
);

export const AFTER_COLON_SPACES_MOCK_XS = wrapMockBlock(
  `        ${MOCK_SHORT_NAME}:    {id: 1}
        ${MOCK_LONG_NAME}: {id: 2}`,
);

export const UNFENCED_MULTILINE_OBJECT_ENTRIES = `        "checkout applies gift wrap": {
          issued              : []
          already_issued      : []
          skipped             : []
          failed              : []
          issued_count        : 0
          already_issued_count: 0
          skipped_count       : 0
          failed_count        : 0
        }`;

export const FENCED_MULTILINE_OBJECT_ENTRIES = `        "checkout applies gift wrap": \`\`\`
          {
            issued              : []
            already_issued      : []
            skipped             : []
            failed              : []
            issued_count        : 0
            already_issued_count: 0
            skipped_count       : 0
            failed_count        : 0
          }
          \`\`\``;

export const UNFENCED_MULTILINE_OBJECT_XS = wrapMockBlock(UNFENCED_MULTILINE_OBJECT_ENTRIES);
export const FENCED_MULTILINE_OBJECT_XS = wrapMockBlock(FENCED_MULTILINE_OBJECT_ENTRIES);

export const UNFENCED_MULTILINE_ARRAY_ENTRIES = `        "checkout lists open carts": [
          {id: 8}
        ]`;

export const FENCED_MULTILINE_ARRAY_ENTRIES = `        "checkout lists open carts": \`\`\`
          [
            {id: 8}
          ]
          \`\`\``;

export const UNFENCED_MULTILINE_ARRAY_XS = wrapMockBlock(UNFENCED_MULTILINE_ARRAY_ENTRIES);
export const FENCED_MULTILINE_ARRAY_XS = wrapMockBlock(FENCED_MULTILINE_ARRAY_ENTRIES);

export const UNFENCED_INPUT_OBJECT_ENTRIES = `        payload: {
          user_id: 7
          reason : "manual"
        }`;

export const FENCED_INPUT_OBJECT_ENTRIES = `        payload: \`\`\`
          {
            user_id: 7
            reason : "manual"
          }
          \`\`\``;

export const UNFENCED_INPUT_ARRAY_ENTRIES = `        items: [
          {id: 1}
        ]`;

export const FENCED_INPUT_ARRAY_ENTRIES = `        items: \`\`\`
          [
            {id: 1}
          ]
          \`\`\``;

export const UNFENCED_INPUT_OBJECT_XS = wrapInputBlock(UNFENCED_INPUT_OBJECT_ENTRIES);
export const FENCED_INPUT_OBJECT_XS = wrapInputBlock(FENCED_INPUT_OBJECT_ENTRIES);
export const UNFENCED_INPUT_ARRAY_XS = wrapInputBlock(UNFENCED_INPUT_ARRAY_ENTRIES);
export const FENCED_INPUT_ARRAY_XS = wrapInputBlock(FENCED_INPUT_ARRAY_ENTRIES);

export const NONCANONICAL_MULTILINE_MOCK_XS = wrapMockBlock(
  `        "checkout applies gift wrap": {issued: []
          skipped: []
        }`,
);

export const MISALIGNED_UNFENCED_MULTILINE_XS = wrapMockBlock(
  `        ${MOCK_SHORT_NAME}: {
          id: 1
        }
        ${MOCK_LONG_NAME}: []`,
);

export const ALIGNED_FENCED_MULTILINE_XS = wrapMockBlock(
  `        ${MOCK_SHORT_NAME}${" ".repeat(MOCK_NAME_PAD)}: \`\`\`
          {
            id: 1
          }
          \`\`\`
        ${MOCK_LONG_NAME}: []`,
);

export const MISALIGNED_UNFENCED_INPUT_XS = wrapInputBlock(
  `        id: 7
        payload: {
          inner: 1
        }`,
);

export const ALIGNED_FENCED_INPUT_XS = wrapInputBlock(
  `        id     : 7
        payload: \`\`\`
          {
            inner: 1
          }
          \`\`\``,
);

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
