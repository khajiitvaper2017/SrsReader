import type { FsrsConfig, Schedule } from "@/srs/model";
import type { SchedulingPreferences as Settings } from "@/srs/preferences";
import { DAY, dayStart, studyDay } from "@/srs/study-day";
import {
  dateChrono,
  defineChrono,
  defineMiddleware,
  defineScheduler,
  type AnyModel,
  type AnySchedulerCore,
} from "ts-fsrs";
import {
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerStatsMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
} from "ts-fsrs/middlewares";
import { FSRS6Model, FSRS6_DEFAULT_WEIGHTS } from "ts-fsrs/models/fsrs-6";
import { FSRS7Model, FSRS7_DEFAULT_WEIGHTS } from "ts-fsrs/models/fsrs-7";
import { z } from "zod";

const chrono = defineChrono({
  schema: {
    ...dateChrono.schema,
    config: z.object({
      fractionalDays: z.boolean(),
      rolloverHour: z.number().int().min(0).max(23),
    }),
  },
  normalize: dateChrono.normalize,
  defaultValue: dateChrono.defaultValue,
  create({ config }) {
    return {
      ...dateChrono.create({ config }),
      difference: (from: Date, to: Date) =>
        Math.max(
          0,
          config.fractionalDays
            ? (to.getTime() - from.getTime()) / DAY
            : studyDay(to.getTime(), config.rolloverHour) -
                studyDay(from.getTime(), config.rolloverHour),
        ),
      add: (from: Date, days: number) =>
        new Date(
          config.fractionalDays || days < 1
            ? from.getTime() + days * DAY
            : dayStart(
                studyDay(from.getTime(), config.rolloverHour) +
                  Math.round(days),
                config.rolloverHour,
              ),
        ),
    };
  },
});

const rwkvCandidates = new WeakSet<object>();
const rwkvIntervalsMiddleware = defineMiddleware({
  name: "rwkv-intervals",
  schema: {
    config: z.object({
      rwkvIntervals: z
        .array(z.number().finite().nonnegative())
        .length(4)
        .optional(),
    }),
  },
  handlers: {
    nextInterval(ctx, next) {
      const intervals = ctx.config.rwkvIntervals;
      const candidate = ctx.candidate;
      if (intervals && !rwkvCandidates.has(candidate)) {
        Object.assign(candidate, {
          nextInterval: (memory: Readonly<Record<string, unknown>>) =>
            intervals[candidate.findGrade(memory)! - 1]!,
        });
        rwkvCandidates.add(candidate);
      }
      next();
    },
  },
});

function definition<M extends AnyModel>(model: M) {
  return defineScheduler({ model, chrono }).use(
    rwkvIntervalsMiddleware,
    schedulerDesiredRetentionMiddleware,
    schedulerFuzzingMiddleware,
    schedulerStatsMiddleware,
    schedulerScheduledDaysMiddleware,
    schedulerLearningStepsMiddleware,
    schedulerMaximumIntervalMiddleware,
    schedulerMonotonicIntervalMiddleware,
  );
}
const definitions = {
  "6": definition(FSRS6Model),
  "7": definition(FSRS7Model),
};
const weights = {
  "6": FSRS6_DEFAULT_WEIGHTS,
  "7": FSRS7_DEFAULT_WEIGHTS,
};

export const fsrsScheduler = (version: Settings["fsrsVersion"]) =>
  `ts-fsrs@6.0.0/FSRS-${version}` as const;
export const fsrsConfig = (version: Settings["fsrsVersion"]): FsrsConfig => ({
  version,
  weights: [...weights[version]],
});

export function createScheduler(
  settings: Settings,
  retention: number,
  model = fsrsConfig(settings.fsrsVersion),
  rwkvIntervals?: number[],
): AnySchedulerCore {
  const config = {
    weights: model.weights,
    rwkvIntervals,
    fractionalDays: model.version === "7",
    rolloverHour: settings.rolloverHour,
    enableShortTerm: true,
    numRelearningSteps: settings.relearningSteps.length,
    desiredRetention: retention,
    learningSteps: settings.learningSteps,
    relearningSteps: settings.relearningSteps,
    enableFuzz: settings.intervalFuzz,
    maximumInterval: settings.maximumInterval,
    graduatingInterval: Math.min(
      settings.minimumInterval,
      settings.maximumInterval,
    ),
    allowModelOverride: false,
    clearStatsOnForget: false,
  };
  if (model.version === "7") return definitions["7"].create({ config });
  return definitions["6"].create({ config });
}
export type Fsrs = ReturnType<(typeof definitions)["6"]["create"]>;
export type FsrsCard = ReturnType<Fsrs["newCard"]> & { stabilityFast?: number };
export type FsrsLog = ReturnType<Fsrs["review"]>["revlog"] & {
  stabilityFast?: number;
};
export type StoredFsrsLog = Omit<
  FsrsLog,
  "dueAt" | "lastReviewAt" | "reviewTime"
> & {
  dueAt: number;
  lastReviewAt: number | null;
  reviewTime: number;
};

export function toFsrsCard(id: string, card: Schedule, model: FsrsConfig) {
  const parsed = definitions[model.version].schema.card.parse({
    ...card,
    cardId: id,
    dueAt: new Date(card.dueAt),
    lastReviewAt:
      card.state === 0 || card.lastReviewAt === null
        ? null
        : new Date(card.lastReviewAt),
  });
  return {
    ...parsed,
    stabilityFast:
      "stabilityFast" in parsed && typeof parsed.stabilityFast === "number"
        ? parsed.stabilityFast
        : 0,
  };
}
export function fromFsrsCard(
  card: FsrsCard,
  model: FsrsConfig,
  settings: Settings,
): Schedule {
  const lastReviewAt = card.lastReviewAt?.getTime() ?? null;
  return {
    dueAt: card.dueAt.getTime(),
    lastReviewAt,
    lastReviewDay:
      lastReviewAt === null
        ? null
        : studyDay(lastReviewAt, settings.rolloverHour),
    scheduledDays: card.scheduledDays,
    learningStep: card.learningStep,
    state: card.state,
    scheduleStatus: card.scheduleStatus,
    reps: card.reps,
    lapses: card.lapses,
    interday:
      card.scheduleStatus === "learning" &&
      lastReviewAt !== null &&
      studyDay(card.dueAt.getTime(), settings.rolloverHour) >
        studyDay(lastReviewAt, settings.rolloverHour),
    stability: card.stability,
    difficulty: card.difficulty,
    ...("stabilityFast" in card ? { stabilityFast: card.stabilityFast } : {}),
    fsrs: model,
  };
}
export function scheduleAnswers(
  id: string,
  card: Schedule,
  now: number,
  retention: number,
  settings: Settings,
  rwkvIntervals?: number[],
) {
  const model = card.state === 0 ? fsrsConfig(settings.fsrsVersion) : card.fsrs;
  const scheduler = createScheduler(settings, retention, model, rwkvIntervals);
  const input =
    card.state === 0
      ? {
          ...scheduler.newCard({ cardId: id, now: new Date(card.dueAt) }),
          reps: card.reps,
          lapses: card.lapses,
        }
      : toFsrsCard(id, card, model);
  return [...scheduler.preview({ card: input, now: new Date(now) })]
    .sort((a, b) => a.grade - b.grade)
    .map(({ grade, card: next, revlog }) => {
      const log = definitions[model.version].schema.revlog.parse(revlog);
      return {
        grade,
        schedule: fromFsrsCard(
          definitions[model.version].schema.card.parse(next),
          model,
          settings,
        ),
        revlog: {
          ...log,
          dueAt: log.dueAt.getTime(),
          lastReviewAt: log.lastReviewAt?.getTime() ?? null,
          reviewTime: log.reviewTime.getTime(),
        },
      };
    });
}
export function rollbackFsrs(
  id: string,
  card: Schedule,
  log: StoredFsrsLog,
  retention: number,
  settings: Settings,
) {
  const scheduler = createScheduler(settings, retention, card.fsrs);
  const revlog = definitions[card.fsrs.version].schema.revlog.parse({
    ...log,
    dueAt: new Date(log.dueAt),
    lastReviewAt: log.lastReviewAt === null ? null : new Date(log.lastReviewAt),
    reviewTime: new Date(log.reviewTime),
  });
  const rolled = scheduler.rollback({
    card: toFsrsCard(id, card, card.fsrs),
    revlog,
  });
  return fromFsrsCard(
    definitions[card.fsrs.version].schema.card.parse(rolled),
    card.fsrs,
    settings,
  );
}
