export interface LineRecord {
  content: string;
  ending: string;
}

export function splitLineRecords(text: string): LineRecord[] {
  const records: LineRecord[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "\n") {
      continue;
    }
    const crlf = i > start && text[i - 1] === "\r";
    records.push({
      content: text.slice(start, crlf ? i - 1 : i),
      ending: crlf ? "\r\n" : "\n",
    });
    start = i + 1;
  }
  records.push({ content: text.slice(start), ending: "" });
  return records;
}

export function joinLineRecords(records: LineRecord[]): string {
  return records.map((record) => `${record.content}${record.ending}`).join("");
}
