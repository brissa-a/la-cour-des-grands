import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDelimited, parseDelimitedLine, readTable } from "./delimited.ts";

test("quoted separators, escaped quotes and CRLF", () => {
  assert.deepEqual(parseDelimited('a,"b, c","say ""hi"""\r\n1,2,3\r\n', ","), [
    ["a", "b, c", 'say "hi"'],
    ["1", "2", "3"],
  ]);
});

test("a quoted field spanning several lines", () => {
  assert.deepEqual(parseDelimited('x\t"line 1\r\nline 2"\ty\r\n', "\t"), [["x", "line 1\r\nline 2", "y"]]);
});

test("empty fields and a last line without newline", () => {
  assert.deepEqual(parseDelimited("a,,c\n,,", ","), [
    ["a", "", "c"],
    ["", "", ""],
  ]);
});

test("a streamed line must hold exactly one record", () => {
  assert.deepEqual(parseDelimitedLine('75115,"104 Rue Blomet, bât. B",housenumber', ","), ["75115", "104 Rue Blomet, bât. B", "housenumber"]);
  assert.throws(() => parseDelimitedLine('75115,"104 Rue Blomet', ","), /Unterminated quoted field/);
  assert.throws(() => parseDelimitedLine("a\nb", ","), /Expected one record, got 2/);
});

test("readTable picks columns by name and rejects ragged rows", () => {
  assert.deepEqual(readTable("﻿id\tname\tcode\r\n1\tA\tx\r\n", "\t", ["code", "id"]), [{ code: "x", id: "1" }]);
  assert.throws(() => readTable("id,name\n1\n", ",", ["id"]), /1 fields, expected 2/);
  assert.throws(() => readTable("id,name\n", ",", ["code"]), /Missing column code/);
});
