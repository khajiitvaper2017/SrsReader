export type ParsingCandidate = {
  term: string;
  forms: string[];
  verbOnly?: boolean;
  perfectiveOnly?: boolean;
};

export type ParsingRule = Omit<ParsingCandidate, "term"> & {
  pattern: RegExp;
  replacement: string;
};
