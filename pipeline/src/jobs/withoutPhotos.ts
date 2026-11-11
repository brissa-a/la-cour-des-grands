import { communeConstituencyTable, constituencyContours, electoralRollFiles } from "./address/published.ts";
import { communes } from "./communes.ts";
import { hemicycle } from "./hemicycle.ts";
import { links } from "./links.ts";
import { majorVotes, votesByBill, votesCatalog } from "./votes.ts";

export const filesWithoutPhotos = [hemicycle, communes, links, votesCatalog, majorVotes, votesByBill, communeConstituencyTable, constituencyContours, electoralRollFiles];
