import { AddressFormatter, AddressFormattingCandidate } from "../domain/types";

export class DeterministicAddressFormatter implements AddressFormatter {
  async refine(candidate: AddressFormattingCandidate): Promise<string[]> {
    return candidate.addresses;
  }
}
