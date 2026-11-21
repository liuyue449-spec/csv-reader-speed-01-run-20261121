// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answer as csv-reader 1.0.0 for every input, faster: the baseline builds
// every field one character at a time with string concatenation. This reader
// instead slices plain unquoted fields and clean quoted fields straight out
// of the text (indexOf/slice run in native code) and only walks character by
// character down the rare paths: a field that holds a stray CR, a quoted field
// holding a doubled quote or a line break, junk after a closing quote, and a
// quote that never closes.
//
// Semantics, kept exactly as the baseline's:
// - U+FEFF at the very start is dropped.
// - A record ends at LF or CRLF; a line left with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped (error stray_cr).
// - A field opening with a quote runs to the next quote that is not doubled;
//   "" inside it is one quote, each CRLF or lone CR inside it reads as LF.
//   What follows its closing quote, up to the next comma or line break, is
//   appended as it stands (error quote_junk, when the field ends).
// - A quote that never closes is a literal character, and the text after it
//   is read again as unquoted (error unterminated_quote).
// - A quote inside an unquoted field is a literal character. Fields stay
//   strings, never trimmed or converted.
// - columns is the first record when header is true, else null; rows holds the
//   records after it, each padded with "" (short_row, with fields: its field
//   count) or cut (long_row, with extra: the cut fields) to the first
//   record's width.
// - Each error is {code, line, row}, in the order met, a field's quote_junk
//   when the field ends and a record's short_row or long_row when the record
//   ends: line the 1-based line its record starts on, counting every LF,
//   CRLF and lone CR inside quotes, and row its record's index in rows, null
//   for the header.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1; // the line the character at pos is on
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters onto `value` from pos up to the next comma or
  // line break, dropping a CR not followed by LF (error stray_cr). Only used
  // down the rare paths (junk after a closing quote, a quote that never
  // closes, a stray CR inside an otherwise plain field); the common path
  // slices instead. Returns {value, ended, added} with `added` the kept
  // characters appended here (not counting `value` as passed in).
  function readUnquoted(value) {
    let added = 0;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value, ended: COMMA, added };
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      if (c === 13) {
        if (pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          return { value, ended: LINE_BREAK, added };
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        continue;
      }
      value += text[pos];
      added += 1;
      pos += 1;
    }
    return { value, ended: END, added };
  }

  // Builds a quoted field's value from its raw content [from, to), handling
  // doubled quotes ("" -> one quote) and CRLF / lone CR inside quotes (each
  // one LF), and counts the line breaks inside it. Only used when the content
  // is known to hold a doubled quote or a line break; clean quoted fields
  // are sliced directly.
  function buildQuoted(from, to) {
    const parts = [];
    let start = from;
    let delta = 0;
    let i = from;
    while (i < to) {
      const c = text.charCodeAt(i);
      if (c === 34) {
        // A doubled quote: one quote in the value, and the scan continues.
        if (i + 1 < to && text.charCodeAt(i + 1) === 34) {
          parts.push(text.slice(start, i + 1));
          i += 2;
          start = i;
          continue;
        }
        // A lone quote inside [from, to) cannot happen: `to` is the closing
        // quote, so every quote before it is part of a doubled pair.
        i += 1;
        continue;
      }
      if (c === 13) {
        parts.push(text.slice(start, i));
        parts.push('\n');
        delta += 1;
        i += i + 1 < to && text.charCodeAt(i + 1) === 10 ? 2 : 1;
        // A CRLF that straddles the closing quote: the LF is the closing
        // quote's neighbour only when the CR is the last content character
        // and the next character is the closing quote, which is not an LF,
        // so the check above (i + 1 < to) is the right one; a CRLF ending
        // exactly at `to` has its LF at to - 1, inside the range.
        start = i;
        continue;
      }
      if (c === 10) {
        parts.push(text.slice(start, i));
        parts.push('\n');
        delta += 1;
        i += 1;
        start = i;
        continue;
      }
      i += 1;
    }
    parts.push(text.slice(start, to));
    return { value: parts.length === 1 ? parts[0] : parts.join(''), delta };
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted = false;
    do {
      if (text.charCodeAt(pos) === 34) {
        // Quoted field.
        quoted = true;
        const open = pos;
        const openLine = line;
        // Find the closing quote: the next quote that is not doubled.
        let close = -1;
        let scan = open + 1;
        let doubled = false;
        while (true) {
          const q = text.indexOf('"', scan);
          if (q === -1) break;
          if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
            doubled = true;
            scan = q + 2;
            continue;
          }
          close = q;
          break;
        }
        if (close === -1) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          const f = readUnquoted('"');
          fields.push(f.value);
          ended = f.ended;
          continue;
        }
        let value;
        if (!doubled) {
          value = text.slice(open + 1, close);
          if (value.indexOf('\n') !== -1 || value.indexOf('\r') !== -1) {
            const built = buildQuoted(open + 1, close);
            value = built.value;
            line += built.delta;
          }
        } else {
          const built = buildQuoted(open + 1, close);
          value = built.value;
          line += built.delta;
        }
        pos = close + 1;
        if (pos >= n) {
          fields.push(value);
          ended = END;
          continue;
        }
        const c = text.charCodeAt(pos);
        if (c === 44) {
          pos += 1;
          fields.push(value);
          ended = COMMA;
          continue;
        }
        if (c === 10) {
          pos += 1;
          line += 1;
          fields.push(value);
          ended = LINE_BREAK;
          continue;
        }
        if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          fields.push(value);
          ended = LINE_BREAK;
          continue;
        }
        // What follows the closing quote is appended as it stands, up to
        // the next comma or line break.
        const junk = readUnquoted(value);
        if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        fields.push(junk.value);
        ended = junk.ended;
        continue;
      }

      // Unquoted field: it ends at the first comma or LF, or at the end.
      quoted = false;
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      let end;
      if (comma === -1 && lf === -1) {
        end = n;
        ended = END;
      } else if (comma === -1) {
        end = lf;
        ended = LINE_BREAK;
      } else if (lf === -1) {
        end = comma;
        ended = COMMA;
      } else if (comma < lf) {
        end = comma;
        ended = COMMA;
      } else {
        end = lf;
        ended = LINE_BREAK;
      }
      // A CRLF line break: the CR belongs to the break, not the field.
      let fieldEnd = end;
      if (ended === LINE_BREAK && end > pos && text.charCodeAt(end - 1) === 13) fieldEnd = end - 1;
      const value = text.slice(pos, fieldEnd);
      if (value.indexOf('\r') === -1) {
        pos = end + (ended === END ? 0 : 1);
        if (ended === LINE_BREAK) line += 1;
        fields.push(value);
      } else {
        // A stray CR inside the field: walk it character by character.
        const f = readUnquoted('');
        fields.push(f.value);
        ended = f.ended;
      }
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
