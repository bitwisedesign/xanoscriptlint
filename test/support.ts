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

export const ENUM_V62 = ["alpha", "bravo", "x".repeat(42)];
export const ENUM_V63 = ["alpha", "bravo", "x".repeat(43)];
export const ENUM_V64 = ["alpha", "bravo", "x".repeat(44)];

export const ASSIGN_LINE_62 = "x".repeat(41);
export const ASSIGN_LINE_63 = "x".repeat(42);
export const ASSIGN_LINE_64 = "x".repeat(43);

export function inlineAssignObj(pad: string): string {
  return `{k: "${pad}"}`;
}

export function wrappedAssignObj(pad: string): string {
  return `{
        k: "${pad}"
      }`;
}

export function inlineAssignArr(pad: string): string {
  return `["${pad}"]`;
}

export function wrappedAssignArr(pad: string): string {
  return `[
        "${pad}"
      ]`;
}

export function wrapAssign(owner: string, value: string): string {
  return `function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      ${owner} = ${value}
    } as $dispatch
  }

  response = $dispatch
}`;
}

export function wrapVarValue(value: string): string {
  return `function "example" {
  input {
  }

  stack {
    var $order {
      value = ${value}
    }
  }

  response = $order
}`;
}

export const PIPE_33 = `|concat:"${"x".repeat(23)}"`;
export const PIPE_34 = `|concat:"${"x".repeat(24)}"`;
export const PIPE_BYTES_33 = `|concat:"${"•".repeat(7)}xx"`;
export const PIPE_BYTES_34 = `|concat:"${"•".repeat(8)}"`;

export function inlinePiped(base: string, ...filters: string[]): string {
  return `${base}${filters.join("")}`;
}

export function wrappedPiped(base: string, ...filters: string[]): string {
  return `${base}\n        ${filters.join("\n        ")}`;
}

export function wrapReturn(value: string): string {
  return `function "example" {
  input {
  }

  stack {
    return ${value}
  }

  response = $ok
}`;
}

export function inlineEnumDecl(opener: string, values: string[]): string {
  return `    ${opener} {
      values = [${values.map((value) => JSON.stringify(value)).join(", ")}]
    }`;
}

export function wrappedEnumDecl(
  opener: string,
  values: string[],
  blank = true,
): string {
  const items = values.map((value) => `        ${JSON.stringify(value)}`).join("\n");
  const blankLine = blank ? "    \n" : "";
  return `    ${opener} {
      values = [
${items}
      ]
${blankLine}    }`;
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

export const UNFENCED_MULTILINE_ARRAY_ENTRIES = `        "checkout lists open carts for the current user id": [
          {id: 8}
        ]`;

export const FENCED_MULTILINE_ARRAY_ENTRIES = `        "checkout lists open carts for the current user id": \`\`\`
          [
            {id: 8}
          ]
          \`\`\``;

export const UNFENCED_MULTILINE_ARRAY_XS = wrapMockBlock(UNFENCED_MULTILINE_ARRAY_ENTRIES);
export const FENCED_MULTILINE_ARRAY_XS = wrapMockBlock(FENCED_MULTILINE_ARRAY_ENTRIES);

export const UNFENCED_INPUT_OBJECT_ENTRIES = `        checkout_payload_for_the_current_user: {
          user_id: 7
          reason : "manual"
        }`;

export const FENCED_INPUT_OBJECT_ENTRIES = `        checkout_payload_for_the_current_user: \`\`\`
          {
            user_id: 7
            reason : "manual"
          }
          \`\`\``;

export const UNFENCED_INPUT_ARRAY_ENTRIES = `        checkout_line_items_for_the_current_user_order_id: [
          {id: 1}
        ]`;

export const FENCED_INPUT_ARRAY_ENTRIES = `        checkout_line_items_for_the_current_user_order_id: \`\`\`
          [
            {id: 1}
          ]
          \`\`\``;

export const UNFENCED_INPUT_OBJECT_XS = wrapInputBlock(UNFENCED_INPUT_OBJECT_ENTRIES);
export const FENCED_INPUT_OBJECT_XS = wrapInputBlock(FENCED_INPUT_OBJECT_ENTRIES);
export const UNFENCED_INPUT_ARRAY_XS = wrapInputBlock(UNFENCED_INPUT_ARRAY_ENTRIES);
export const FENCED_INPUT_ARRAY_XS = wrapInputBlock(FENCED_INPUT_ARRAY_ENTRIES);

export const NONCANONICAL_MULTILINE_MOCK_XS = wrapMockBlock(
  `        "checkout applies gift wrap today!": {issued: []
          skipped: []
        }`,
);

export const MISALIGNED_UNFENCED_MULTILINE_XS = wrapMockBlock(
  `        ${MOCK_SHORT_NAME}: {
          id: 1
        }
        ${MOCK_LONG_NAME}: [0]`,
);

export const ALIGNED_FENCED_MULTILINE_XS = wrapMockBlock(
  `        ${MOCK_SHORT_NAME}${" ".repeat(MOCK_NAME_PAD)}: \`\`\`
          {
            id: 1
          }
          \`\`\`
        ${MOCK_LONG_NAME}: [0]`,
);

export const MISALIGNED_UNFENCED_INPUT_XS = wrapInputBlock(
  `        id: 7
        payload: {
          inner: 1
        }
        comment: "keep_parent_assignment_wrapped"`,
);

export const ALIGNED_FENCED_INPUT_XS = wrapInputBlock(
  `        id     : 7
        payload: \`\`\`
          {
            inner: 1
          }
          \`\`\`
        comment: "keep_parent_assignment_wrapped"`,
);

export const VALID_SIBLING_FENCES_XS = `function "example" {
  input {
  }

  stack {
    db.query cart {
      mock = {
        "checkout marks cart paid": \`\`\`
          {
            id     : 1
            status : "open"
          }
          \`\`\`
        "checkout applies gift wrap to open cart": \`\`\`
          {
            id          : 1
            status      : "open"
            coupon_code : "SAVE10"
          }
          \`\`\`
      }
    }
  }

  response = $cart
}`;

export const INVALID_DOUBLE_OPENER_XS = `function "example" {
  input {
  }

  stack {
    db.query cart {
      mock = {
        "checkout marks cart paid"               : \`\`\`
        "checkout applies gift wrap to open cart": \`\`\`
          {
            id          : 1
            status      : "open"
            coupon_code : "SAVE10"
          }
          \`\`\`
      }
    }
  }

  response = $cart
}`;

export const VALID_FUNCTION_RUN_COMPACT_MOCK_XS = `function "example" {
  input {
  }

  stack {
    conditional {
      if ($ok) {
        foreach ($items) {
          each {
            function.run "Orders/apply_discounts" {
              input = {
                user_id: $cart_user_id
                reason : "manual"
              }

              mock = {
                "checkout empty cart"                    : {queued: [], sent: [], done: false}
                "checkout applies gift wrap to open cart": {queued: [{sku: "box"}], sent: [{sku: "box"}], done: true}
              }
            } as $discount_result
          }
        }
      }
    }
  }

  response = $ok
}`;

export const INVALID_FUNCTION_RUN_OUTDENTED_MOCK_XS = `function "example" {
  input {
  }

  stack {
    conditional {
      if ($ok) {
        foreach ($items) {
          each {
            function.run "Orders/apply_discounts" {
              input = {
                user_id: $cart_user_id
                reason : "manual"
              }

          mock = {
            "checkout empty cart"                    : \`\`\`
              {
                queued : []
                sent   : []
                done   : false
              }
              \`\`\`
            "checkout applies gift wrap to open cart": \`\`\`
              {
                queued : [{sku: "box"}]
                sent   : [{sku: "box"}]
                done   : true
              }
              \`\`\`
          }
            } as $discount_result
          }
        }
      }
    }
  }

  response = $ok
}`;

export const UNFENCED_FUNCTION_RUN_MULTILINE_MOCK_XS = `function "example" {
  input {
  }

  stack {
    conditional {
      if ($ok) {
        foreach ($items) {
          each {
            function.run "Orders/apply_discounts" {
              input = {
                user_id: $cart_user_id
                reason : "manual"
              }

              mock = {
                "checkout empty cart": {
                  queued: []
                  sent: []
                  done: false
                }
                "checkout applies gift wrap to open cart": {
                  queued: [{sku: "box"}]
                  sent: [{sku: "box"}]
                  done: true
                }
              }
            } as $discount_result
          }
        }
      }
    }
  }

  response = $ok
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
