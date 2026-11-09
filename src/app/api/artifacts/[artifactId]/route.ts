import { getArtifact } from "@/server/artifacts";
import { handler } from "../../_lib/route";

export const GET = handler<{ artifactId: string }>(({ ctx, params }) => getArtifact(params.artifactId, ctx));
