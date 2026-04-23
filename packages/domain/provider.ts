import {
  NormalizedOutageBatch,
  ParsedProviderBatch,
  ProviderKey,
  RawPayload,
  SyncRunResult,
  UtilityType,
} from "./types";

export interface ProviderAdapter {
  readonly key: ProviderKey;
  readonly utilityType: UtilityType;
  fetchRaw(): Promise<RawPayload>;
  parseRaw(raw: RawPayload): ParsedProviderBatch;
  normalize(batch: ParsedProviderBatch, raw: RawPayload): NormalizedOutageBatch;
  sync(): Promise<SyncRunResult>;
}
