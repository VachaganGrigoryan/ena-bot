export type UtilityType = "electricity" | "water";
export type ProviderKey = "ena";
export type MatchMode = "contains" | "exact";
export type SyncRunStatus = "started" | "succeeded" | "failed";
export type NotificationStatus = "sent" | "failed";

export interface RawPayload {
  content: string;
  fetchedAt: Date;
  sourceUrl: string;
}

export interface ParsedLocation {
  timeSlot: string;
  addresses: string[];
}

export interface ParsedRegion {
  name: string;
  locations: ParsedLocation[];
}

export interface ParsedProviderEvent {
  title: string;
  dateText: string;
  regions: ParsedRegion[];
}

export interface ParsedProviderBatch {
  providerKey: ProviderKey;
  utilityType: UtilityType;
  events: ParsedProviderEvent[];
}

export interface AffectedLocation {
  address: string;
  normalizedSearchText: string;
}

export interface OutageWindow {
  regionName: string;
  timeSlot: string;
  affectedLocations: AffectedLocation[];
}

export interface OutageEvent {
  sourceEventKey: string;
  title: string;
  dateText: string;
  eventDate: Date | null;
  windows: OutageWindow[];
  rawPayload?: unknown;
}

export interface NormalizedOutageBatch {
  providerKey: ProviderKey;
  utilityType: UtilityType;
  fetchedAt: Date;
  sourceUrl: string;
  events: OutageEvent[];
}

export interface AddressFormattingCandidate {
  regionName: string;
  timeSlot: string;
  addresses: string[];
}

export interface AddressFormatter {
  refine(candidate: AddressFormattingCandidate): Promise<string[]>;
}

export interface SyncRunResult {
  providerKey: ProviderKey;
  utilityType: UtilityType;
  fetchedAt: Date;
  eventCount: number;
  windowCount: number;
  locationCount: number;
}

export interface SearchQuery {
  utilityType: UtilityType;
  providerKey: ProviderKey;
  text: string;
  regionId?: number;
  settlementId?: number;
}

export interface SubscriptionTarget {
  utilityType: UtilityType;
  providerKey: ProviderKey;
  queryText: string;
  matchMode: MatchMode;
}

export interface NotificationMessage {
  subscriptionId: number;
  outageWindowId: number;
  locale: string;
  messageText: string;
}

export interface SubscriptionRecord {
  id: number;
  userId: number;
  chatId: string;
  providerKey: ProviderKey;
  utilityType: UtilityType;
  queryText: string;
  matchMode: MatchMode;
  isPaused: boolean;
}

export interface OutageSearchRecord {
  eventId: number;
  windowId: number;
  title: string;
  dateText: string;
  eventDate: Date | null;
  regionName: string;
  timeSlot: string;
  addresses: string[];
}
