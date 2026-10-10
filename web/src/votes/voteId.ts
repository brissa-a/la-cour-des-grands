export type VoteId = string & { readonly __brand: "VoteId" }

const VOTE_ID = /^VTANR\d+L\d+V\d+$/

export function voteId(value: string): VoteId | null {
  if (!VOTE_ID.test(value)) return null
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the VOTE_ID test above proves the format
  return value as VoteId
}
