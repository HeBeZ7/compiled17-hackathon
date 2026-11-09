import { lookupCatalogEntry } from "@/server/catalog";
import { ModelLookupQuery } from "@/shared/contracts";
import { handler, parseQuery } from "../../_lib/route";

export const GET = handler(async ({ req, ctx }) => {
  const input = parseQuery(req, ModelLookupQuery);
  return input.ok ? lookupCatalogEntry(input.data, ctx) : input;
});
