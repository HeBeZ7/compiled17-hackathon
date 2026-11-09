import { searchCatalog } from "@/server/catalog";
import { CatalogSearchQuery } from "@/shared/contracts";
import { handler, parseQuery } from "../../_lib/route";

export const GET = handler(async ({ req, ctx }) => {
  const input = parseQuery(req, CatalogSearchQuery);
  return input.ok ? searchCatalog(input.data, ctx) : input;
});
