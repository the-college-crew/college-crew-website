import { describe, expect, it } from "vitest";

import {
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_VIDEO_BYTES,
  messageAttachments,
  validateChatFiles,
} from "./attachments";

function file(name: string, type: string, size: number) {
  return { name, type, size } as File;
}

describe("chat media validation", () => {
  it("allows up to four supported images", () => {
    expect(
      validateChatFiles([
        file("one.jpg", "image/jpeg", MAX_CHAT_IMAGE_BYTES),
        file("two.png", "image/png", 20),
        file("three.webp", "image/webp", 20),
        file("four.jpg", "image/jpeg", 20),
      ]),
    ).toBeNull();
  });

  it("allows one supported video by itself", () => {
    expect(
      validateChatFiles([
        file("walkthrough.mp4", "video/mp4", MAX_CHAT_VIDEO_BYTES),
      ]),
    ).toBeNull();
    expect(
      validateChatFiles([
        file("walkthrough.mp4", "video/mp4", 100),
        file("photo.jpg", "image/jpeg", 100),
      ]),
    ).toContain("one video");
  });

  it("rejects unsupported and oversized files", () => {
    expect(validateChatFiles([file("note.pdf", "application/pdf", 100)])).toContain(
      "JPEG",
    );
    expect(
      validateChatFiles([
        file("large.jpg", "image/jpeg", MAX_CHAT_IMAGE_BYTES + 1),
      ]),
    ).toContain("10 MB");
  });

  it("keeps legacy image messages visible", () => {
    expect(
      messageAttachments({ attachments: [], image_path: "thread/photo.jpg" }),
    ).toMatchObject([{ path: "thread/photo.jpg", kind: "image" }]);
  });
});
