import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords } from "@/lib/csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded commas and line breaks", () => {
    const text = 'code,name\r\nRM-1,"Resin, grade ""A"""\nRM-2,"two\nlines"\n';
    expect(parseCsv(text)).toEqual([
      ["code", "name"],
      ["RM-1", 'Resin, grade "A"'],
      ["RM-2", "two\nlines"],
    ]);
  });

  it("strips an Excel BOM, keeps empty cells and drops blank lines", () => {
    expect(parseCsv("﻿a,b,c\n1,,3\n\n  \n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("parses a last line without a trailing newline", () => {
    expect(parseCsv("a\n1")).toEqual([["a"], ["1"]]);
  });
});

describe("parseCsvRecords", () => {
  it("normalises headers and reports file line numbers", () => {
    const { headers, records } = parseCsvRecords("Code, Batch Tracked ,GST-Rate\nRM-1, yes ,18\n");
    expect(headers).toEqual(["code", "batch_tracked", "gst_rate"]);
    expect(records).toEqual([{ line: 2, values: { code: "RM-1", batch_tracked: "yes", gst_rate: "18" } }]);
  });
});
