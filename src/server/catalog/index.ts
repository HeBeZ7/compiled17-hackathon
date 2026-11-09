import "server-only";
import {
  notConnected,
  type CatalogEntry,
  type CatalogPage,
  type CatalogSearchQuery,
  type ModelLookupQuery,
  type ModelPreparation,
  type ModelPreparationRequest,
  type RequestContext,
  type ServiceResult,
} from "@/shared/contracts";

// E owns this module. Until a real source is wired, every call reports NOT_CONNECTED.

export async function searchCatalog(_input: CatalogSearchQuery, _ctx: RequestContext): Promise<ServiceResult<CatalogPage>> {
  return notConnected("모델 카탈로그");
}

export async function lookupCatalogEntry(_input: ModelLookupQuery, _ctx: RequestContext): Promise<ServiceResult<CatalogEntry>> {
  return notConnected("모델 카탈로그");
}

export async function createModelPreparation(_input: ModelPreparationRequest, _ctx: RequestContext): Promise<ServiceResult<ModelPreparation>> {
  return notConnected("모델 준비");
}

export async function getModelPreparation(_preparationId: string, _ctx: RequestContext): Promise<ServiceResult<ModelPreparation>> {
  return notConnected("모델 준비");
}
