import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalizeUrl as extensionCanonicalize } from "../extensions/shared/src/url.ts";
import { canonicalizeUrl as serverCanonicalize } from "../server/src/url.ts";

// The server and extension each carry a copy of the canonicalizer (they have
// no shared package). These cases lock in the expected output and ensure the
// two copies cannot drift.
const cases: { input: string; expected: string }[] = [
  {
    input: "https://youtu.be/dQw4w9WgXcQ?si=abc",
    expected: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42&si=x",
    expected: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    input: "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=4&t=90",
    expected:
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=4",
  },
  {
    input: "https://youtube.com/shorts/dQw4w9WgXcQ?feature=share",
    expected: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    input: "https://www.youtube.com/embed/dQw4w9WgXcQ?start=10",
    expected: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    input: "https://www.youtube.com/live/dQw4w9WgXcQ?si=live",
    expected: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    input: "https://www.youtube.com/playlist?list=PL123&si=x",
    expected: "https://www.youtube.com/playlist?list=PL123",
  },
  {
    input: "https://example.com/video/?utm_source=x&fbclid=y",
    expected: "https://example.com/video",
  },
  {
    input: "https://www.example.com/video/#t=10",
    expected: "https://example.com/video#t=10",
  },
  {
    input: "https://example.com/watch?t=30",
    expected: "https://example.com/watch?t=30",
  },
  {
    input: "https://example.com:8443/a/?UTM_Source=x",
    expected: "https://example.com:8443/a",
  },
  {
    input: "https://vimeo.com/123456789?share=copy",
    expected: "https://vimeo.com/123456789?share=copy",
  },
  { input: "not a url", expected: "not a url" },
  {
    input: "https://www.youtube.com/watch?v=abc",
    expected: "https://youtube.com/watch?v=abc",
  },
];

const implementations = {
  server: serverCanonicalize,
  extension: extensionCanonicalize,
};

for (const [name, canonicalize] of Object.entries(implementations)) {
  test(`${name} canonicalizer matches the expected cases`, () => {
    for (const { input, expected } of cases) {
      assert.equal(canonicalize(input), expected, input);
    }
  });
}

test("server and extension canonicalizers agree", () => {
  for (const { input } of cases) {
    assert.equal(
      serverCanonicalize(input),
      extensionCanonicalize(input),
      input,
    );
  }
});
