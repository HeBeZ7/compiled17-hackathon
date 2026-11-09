import { getRuntimeStatus, loadArtifactRuntime } from "@/server/artifacts";
import { handler } from "../../../_lib/route";

export const GET = handler<{ artifactId: string }>(({ ctx, params }) => getRuntimeStatus(params.artifactId, ctx));

export const POST = handler<{ artifactId: string }>(({ ctx, params }) => loadArtifactRuntime(params.artifactId, ctx));
