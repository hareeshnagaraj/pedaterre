import type { BlockPayload, Lot } from "./schema.ts";

export interface BlockSelection {
  payload: BlockPayload;
  addressedGroup: Lot | null;
  partial: boolean;
}

export function selectAddressedGroup(
  payload: BlockPayload,
  requestedLot: number | null,
): BlockSelection {
  if (requestedLot == null) {
    return { payload, addressedGroup: null, partial: false };
  }
  const groupIndex = payload.lotToGroup[String(requestedLot)];
  const addressedGroup =
    Number.isInteger(groupIndex) && payload.lots[groupIndex]
      ? payload.lots[groupIndex]
      : null;
  if (!addressedGroup) {
    return {
      payload: {
        ...payload,
        lots: payload.lots.map(({ you: _you, ...lot }) => lot),
      },
      addressedGroup: null,
      partial: true,
    };
  }
  return {
    payload: {
      ...payload,
      lots: payload.lots.map((lot, index) => ({
        ...lot,
        you: index === groupIndex || undefined,
      })),
    },
    addressedGroup,
    partial: false,
  };
}
