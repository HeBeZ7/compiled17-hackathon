import { readAvatarBlob } from "@/server/store";
import { AvatarVariant, fail } from "@/shared/contracts";
import { handler, toResponse } from "../../../_lib/route";

export const GET = handler<{ assetId: string; variant: string }>(async ({ ctx, params }) => {
  const variant = AvatarVariant.safeParse(params.variant);
  const blob = variant.success ? readAvatarBlob(params.assetId, variant.data, ctx) : null;
  if (!blob) return toResponse(fail("NOT_FOUND", "Avatar image not found"));
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      "content-type": blob.mimeType,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});
