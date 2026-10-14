/**
 * A small CSV reader (RFC 4180): quoted fields, commas and line breaks inside quotes, "" for a quote,
 * a byte-order mark at the start, CRLF or LF at the end of each row. No dependencies.
 */

export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  let sawAnything = false;

  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      sawAnything = true;
      i++;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      sawAnything = true;
      i++;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      row.push(field);
      field = '';
      if (!(row.length === 1 && row[0] === '' && !sawAnything)) rows.push(row);
      row = [];
      sawAnything = false;
    } else {
      field += ch;
      sawAnything = true;
      i++;
    }
  }
  if (quoted) throw new Error('The file ends inside a quoted field.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
