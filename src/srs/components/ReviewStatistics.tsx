import { Loader, Stack } from "@mantine/core";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { ReviewCalendar } from "@/srs/components/ReviewCalendar";
import { useReviewStatistics } from "@/srs/hooks/useReviewStatistics";

export function ReviewStatistics() {
  const { data, error, loading, setYear } = useReviewStatistics();
  return (
    <Stack>
      <ErrorBox error={error} />
      {!data && !error && (
        <Loader size="sm" aria-label={t("srs_stats_loading")} />
      )}
      {data && (
        <ReviewCalendar
          calendar={data.calendar}
          today={data.today}
          loading={loading}
          onYear={setYear}
        />
      )}
    </Stack>
  );
}
