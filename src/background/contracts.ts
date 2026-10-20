import {
  requests as audioRequests,
  type Responses as audioResponses,
} from "@/audio/contracts";
import {
  requests as backgroundRequests,
  type Responses as backgroundResponses,
} from "@/background/system-contracts";
import {
  requests as dictionariesRequests,
  type Responses as dictionariesResponses,
} from "@/dictionaries/contracts";
import {
  requests as examplesRequests,
  type Responses as examplesResponses,
} from "@/examples/contracts";
import {
  requests as languagesRequests,
  type Responses as languagesResponses,
} from "@/languages/contracts";
import {
  requests as lookupRequests,
  type Responses as lookupResponses,
} from "@/lookup/contracts";
import {
  requests as readerRequests,
  type Responses as readerResponses,
} from "@/reader/contracts";
import {
  requests as settingsRequests,
  type Responses as settingsResponses,
} from "@/settings/contracts";
import {
  requests as srsRequests,
  type Responses as srsResponses,
} from "@/srs/contracts";
import {
  requests as vocabularyRequests,
  type Responses as vocabularyResponses,
} from "@/vocabulary/contracts";
import { z } from "zod";

export const requestSchema = z.discriminatedUnion("action", [
  ...settingsRequests,
  ...dictionariesRequests,
  ...readerRequests,
  ...languagesRequests,
  ...examplesRequests,
  ...lookupRequests,
  ...vocabularyRequests,
  ...srsRequests,
  ...audioRequests,
  ...backgroundRequests,
]);
export type Request = z.infer<typeof requestSchema>;
export type Responses = settingsResponses &
  dictionariesResponses &
  readerResponses &
  languagesResponses &
  examplesResponses &
  lookupResponses &
  vocabularyResponses &
  srsResponses &
  audioResponses &
  backgroundResponses;
