// A faster drop-in for csv-reader 1.0.0 (make.fun's own reference program).
// run(input) returns exactly csv-reader's answer {columns, rows, errors} for
// {text, header}: BOM dropped, LF/CRLF record ends, empty lines are no record,
// stray CR outside quotes dropped (stray_cr), quoted-field rules with doubled
// quotes, CRLF/lone CR inside quotes read as LF, quote_junk appended,
// unterminated quote read as a literal and re-read as unquoted
// (unterminated_quote), quotes inside unquoted fields literal, fields stay
// strings, rows padded (short_row) or cut (long_row) to the first record's
// width, errors {code, line, row} in the order met.
//
// Speed comes from never building a field one character at a time (the
// reference does `value += c` per character): an unquoted field is found by
// one charCodeAt scan to its terminator and taken with a single String.slice,
// a quoted field by the native indexOf to its closing quote, and a record
// whose line holds no quote and no stray CR is split natively in one go.
// Slow paths (stray CRs, doubled quotes, line breaks inside quotes, quote
// junk, unterminated quotes) are rare in the drawn sets and are handled by
// small exact routines that mirror the reference step for step.

/** Append text[a..b) to parts, turning each CR (or CRLF) inside it into one LF; returns how many lines it spans. */
function appendSeg(text, parts, a, b) {
  const ri = text.indexOf('\r', a);
  const ni = text.indexOf('\n', a);
  if ((ri === -1 || ri >= b) && (ni === -1 || ni >= b)) {
    if (b > a) parts.push(text.slice(a, b));
    return 0;
  }
  let nl = 0;
  let s = a;
  for (let i = a; i < b; i++) {
    const cc = text.charCodeAt(i);
    if (cc === 13) {
      if (i > s) parts.push(text.slice(s, i));
      parts.push('\n');
      nl++;
      if (text.charCodeAt(i + 1) === 10) i++;
      s = i + 1;
    } else if (cc === 10) {
      nl++;
    }
  }
  if (s < b) parts.push(text.slice(s, b));
  return nl;
}

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const N = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (N > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  while (pos < N) {
    // Lines with no characters are no records.
    while (pos < N) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= N) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;

    let fields = null;
    let lastQuoted = false;

    // Fast path: this record's line holds no quote and no stray CR, so every
    // field is unquoted and the record ends at the line break (or EOF).
    const nlPos = text.indexOf('\n', pos);
    const lineEnd = nlPos === -1 ? N : nlPos;
    const qPos = text.indexOf('"', pos);
    if (qPos === -1 || qPos >= lineEnd) {
      const rPos = text.indexOf('\r', pos);
      const crlf = nlPos !== -1 && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13;
      if (rPos === -1 || rPos >= lineEnd || (crlf && rPos === lineEnd - 1)) {
        const end = crlf ? lineEnd - 1 : lineEnd;
        fields = [];
        let s = pos;
        for (;;) {
          const cm = text.indexOf(',', s);
          if (cm === -1 || cm >= end) {
            fields.push(text.slice(s, end));
            break;
          }
          fields.push(text.slice(s, cm));
          s = cm + 1;
        }
        pos = nlPos === -1 ? N : nlPos + 1;
        if (nlPos !== -1) line++;
      }
    }

    if (fields === null) {
      // Field-by-field path: the line holds a quote (or a stray CR).
      fields = [];
      let ended = 0; // 0: comma, 1: line break, 2: end of text
      do {
        const quoted = text.charCodeAt(pos) === 34;
        let value;
        let cleanClose = false;
        // Unquoted read (also the re-read after an unterminated quote and
        // the junk after a closing quote): start here, initial value uInit.
        let uInit = '';
        let uPos = pos;
        let isJunk = false;

        if (quoted) {
          const open = pos;
          let qi = pos + 1;
          let segStart = qi;
          let parts = null;
          let nl = 0;
          let closedQ = -1;
          for (;;) {
            const q = text.indexOf('"', qi);
            if (q === -1) break;
            if (text.charCodeAt(q + 1) === 34) {
              if (parts === null) parts = [];
              nl += appendSeg(text, parts, segStart, q);
              parts.push('"');
              qi = q + 2;
              segStart = qi;
              continue;
            }
            closedQ = q;
            break;
          }
          if (closedQ === -1) {
            // The quote never closes: it is a literal character, and the
            // text after it is read again as unquoted.
            errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
            uInit = '"';
            uPos = open + 1;
          } else {
            let qv;
            if (parts === null) {
              const ri = text.indexOf('\r', segStart);
              const ni = text.indexOf('\n', segStart);
              if ((ri === -1 || ri >= closedQ) && (ni === -1 || ni >= closedQ)) {
                qv = text.slice(segStart, closedQ);
              } else {
                parts = [];
                nl += appendSeg(text, parts, segStart, closedQ);
                qv = parts.join('');
              }
            } else {
              nl += appendSeg(text, parts, segStart, closedQ);
              qv = parts.join('');
            }
            line += nl;
            pos = closedQ + 1;
            if (pos >= N) {
              value = qv;
              ended = 2;
              cleanClose = true;
            } else {
              const tc = text.charCodeAt(pos);
              if (tc === 44) {
                value = qv;
                ended = 0;
                pos++;
                cleanClose = true;
              } else if (tc === 10) {
                value = qv;
                ended = 1;
                pos++;
                line++;
                cleanClose = true;
              } else if (tc === 13 && text.charCodeAt(pos + 1) === 10) {
                value = qv;
                ended = 1;
                pos += 2;
                line++;
                cleanClose = true;
              } else {
                // What follows the closing quote is appended as it stands.
                uInit = qv;
                uPos = pos;
                isJunk = true;
              }
            }
          }
        }

        if (!cleanClose) {
          // Read unquoted characters from uPos onto uInit up to the next
          // comma or line break; a CR not followed by LF is dropped
          // (stray_cr). Fast when no stray CR lies before the terminator.
          let p0 = uPos;
          let cc0 = -1;
          while (p0 < N) {
            cc0 = text.charCodeAt(p0);
            if (cc0 === 44 || cc0 === 10 || cc0 === 13) break;
            p0++;
          }
          if (p0 >= N) {
            value = uInit + text.slice(uPos, N);
            ended = 2;
            pos = N;
          } else if (cc0 === 44) {
            value = uInit + text.slice(uPos, p0);
            ended = 0;
            pos = p0 + 1;
          } else if (cc0 === 10) {
            value = uInit + text.slice(uPos, p0);
            ended = 1;
            pos = p0 + 1;
            line++;
          } else if (text.charCodeAt(p0 + 1) === 10) {
            value = uInit + text.slice(uPos, p0);
            ended = 1;
            pos = p0 + 2;
            line++;
          } else {
            const sp = uInit ? [uInit] : [];
            let seg = uPos;
            let p = uPos;
            for (;;) {
              if (p >= N) {
                if (p > seg) sp.push(text.slice(seg, p));
                ended = 2;
                pos = N;
                break;
              }
              const cc = text.charCodeAt(p);
              if (cc === 44) {
                if (p > seg) sp.push(text.slice(seg, p));
                ended = 0;
                pos = p + 1;
                break;
              }
              if (cc === 10) {
                if (p > seg) sp.push(text.slice(seg, p));
                ended = 1;
                pos = p + 1;
                line++;
                break;
              }
              if (cc === 13) {
                if (text.charCodeAt(p + 1) === 10) {
                  if (p > seg) sp.push(text.slice(seg, p));
                  ended = 1;
                  pos = p + 2;
                  line++;
                  break;
                }
                errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
                if (p > seg) sp.push(text.slice(seg, p));
                p++;
                seg = p;
                continue;
              }
              p++;
            }
            value = sp.length === 0 ? '' : sp.length === 1 ? sp[0] : sp.join('');
          }
          if (isJunk && value.length > uInit.length) {
            errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
          }
        }

        fields.push(value);
        lastQuoted = quoted;
      } while (ended === 0);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

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
