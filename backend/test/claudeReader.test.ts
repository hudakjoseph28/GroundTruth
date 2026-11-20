import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_READER_MODEL,
  createClaudeDocumentReader,
} from "../src/documents/claudeReader.js";
import { SAMPLE_DOCUMENTS } from "./support/samplePdf.js";

const pdf = readFileSync(
  new URL(
    `./fixtures/documents/${SAMPLE_DOCUMENTS.mismatched.file}`,
    import.meta.url,
  ),
);

const facts = {
  parcelId: "230-004411",
  address: "12 Sample Lane, Galloway, OH 43119",
  documentType: "Boundary survey plat",
  keyFinding: "A shed encroaches 14 ft onto the north line.",
};

function readerWith(parse: ReturnType<typeof vi.fn>) {
  const client = { beta: { messages: { parse } } } as unknown as Anthropic;
  return createClaudeDocumentReader({ apiKey: "unused", client });
}

describe("createClaudeDocumentReader", () => {
  it("sends the PDF itself (not its filename) to Claude and returns the parsed facts", async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: facts,
    });
    const reader = readerWith(parse);

    await expect(
      reader.read({ bytes: pdf, contentType: "application/pdf" }),
    ).resolves.toEqual(facts);

    const params = parse.mock.calls[0]![0];
    expect(params.model).toBe(DOCUMENT_READER_MODEL);
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.output_config.format).toBeDefined();
    expect(params.system).toMatch(/untrusted/);
    const [file, prompt] = params.messages[0].content;
    expect(file).toEqual({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdf.toString("base64"),
      },
    });
    expect(prompt.type).toBe("text");
    expect(JSON.stringify(params)).not.toContain(
      SAMPLE_DOCUMENTS.mismatched.file,
    );
  });

  it("sends an image as an image block", async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: facts,
    });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await readerWith(parse).read({ bytes: png, contentType: "image/png" });
    expect(parse.mock.calls[0]![0].messages[0].content[0]).toEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: png.toString("base64"),
      },
    });
  });

  it("does not send an image over the API's 5 MB limit", async () => {
    const parse = vi.fn();
    await expect(
      readerWith(parse).read({
        bytes: Buffer.alloc(5 * 1024 * 1024 + 1),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
    expect(parse).not.toHaveBeenCalled();
  });

  it.each([
    [{ stop_reason: "refusal", parsed_output: null }, "REFUSED"],
    [{ stop_reason: "max_tokens", parsed_output: null }, "TRUNCATED"],
    [{ stop_reason: "end_turn", parsed_output: null }, "UNPARSEABLE"],
  ])(
    "turns %o into a failed read (%s), never a finding",
    async (response, code) => {
      const parse = vi.fn().mockResolvedValue(response);
      await expect(
        readerWith(parse).read({ bytes: pdf, contentType: "application/pdf" }),
      ).rejects.toMatchObject({ code });
    },
  );

  it("names an API failure by a reason code", async () => {
    const parse = vi
      .fn()
      .mockRejectedValue(new Anthropic.APIConnectionTimeoutError());
    await expect(
      readerWith(parse).read({ bytes: pdf, contentType: "application/pdf" }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
