import { Stack } from "@mantine/core";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { ReviewCalendar } from "@/srs/components/ReviewCalendar";
import { useReviewStatistics } from "@/srs/hooks/useReviewStatistics";
import { memo } from "react";
import { useTranslation } from "react-i18next";

export const ReviewStatistics = memo(function ReviewStatistics() {
  useTranslation();
  const { data, error, loading, setYear } = useReviewStatistics();
  return (
    <Stack>
      <ErrorBox error={error} />
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
});
