import { Carousel } from "@mantine/carousel";
import { Anchor, Box, Image } from "@mantine/core";
import { Maximize } from "lucide-react";
import { useState } from "react";
import classes from "./ScreenshotGallery.module.css";

type ScreenshotProps = {
  src: string;
  label: string;
  alt: string;
  width: number;
  height: number;
  crop?: { x: number; y: number; sourceWidth: number };
};

const reading: ScreenshotProps = {
  src: "/reading-lookup.png",
  label: "Reading",
  alt: "Dictionary popup for Fähigkeit over a highlighted German article",
  width: 764,
  height: 587,
  crop: { x: 281, y: 118, sourceWidth: 1280 },
};

const study: ScreenshotProps = {
  src: "/study.png",
  label: "Study dashboard",
  alt: "Study dashboard with German decks and a review activity calendar",
  width: 823,
  height: 377,
  crop: { x: 363, y: 84, sourceWidth: 1280 },
};

const review: ScreenshotProps = {
  src: "/review.png",
  label: "Review card",
  alt: "Dark review card for der Erfolg with definitions, an example sentence, and grading buttons",
  width: 714,
  height: 904,
};

const dictionaries: ScreenshotProps = {
  src: "/dictionaries.png",
  label: "Dictionaries",
  alt: "Dictionary settings with installed dictionaries and sentence examples",
  width: 1017,
  height: 746,
  crop: { x: 133, y: 0, sourceWidth: 1280 },
};

const screenshots = [reading, study, review, dictionaries];

function Screenshot({ src, label, alt, width, height, crop }: ScreenshotProps) {
  const { x, y, sourceWidth } = crop ?? { x: 0, y: 0, sourceWidth: width };
  const maxWidth = Math.min(
    1,
    (width / height) * (reading.height / reading.width),
  );

  return (
    <Anchor
      className={classes.crop}
      href={src}
      aria-label={`Open full-size ${label.toLowerCase()} screenshot`}
      style={{ aspectRatio: width / height, width: `${maxWidth * 100}%` }}
    >
      <Image
        src={src}
        alt={alt}
        draggable={false}
        h="auto"
        className={classes.image}
        style={{
          width: `${(sourceWidth / width) * 100}%`,
          left: `${(-x / width) * 100}%`,
          top: `${(-y / height) * 100}%`,
        }}
      />
      <Box className={classes.expand} aria-hidden="true">
        <Maximize size={16} />
      </Box>
    </Anchor>
  );
}

export function ScreenshotGallery() {
  const [activeSlide, setActiveSlide] = useState(0);

  return (
    <Carousel
      aria-label="SrsReader screenshots"
      withIndicators
      controlSize={36}
      slideGap="sm"
      emblaOptions={{
        loop: true,
        breakpoints: { "(prefers-reduced-motion: reduce)": { duration: 0 } },
      }}
      onSlideChange={setActiveSlide}
      getIndicatorProps={(index) => ({
        "aria-label": screenshots[index].label,
      })}
      classNames={{
        root: classes.gallery,
        container: classes.container,
        controls: classes.controls,
        control: classes.control,
        indicators: classes.indicators,
        indicator: classes.indicator,
      }}
    >
      {screenshots.map((screenshot, index) => (
        <Carousel.Slide
          key={screenshot.src}
          aria-label={screenshot.label}
          inert={activeSlide !== index}
        >
          <Screenshot {...screenshot} />
        </Carousel.Slide>
      ))}
    </Carousel>
  );
}
