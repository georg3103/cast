// Hacky, but you cannot have a color as a layer, only a background image, which
//   the `linear-gradient()` is.
const emptyLayer = 'linear-gradient(transparent, transparent)';

/**
 * Returns a string of comma-separated values for the `background` property,
 * each of which is a range in the given time ranges.
 *
 * Each layer has the `color` that you specify in the argument.
 * The duration is needed to calculate relative positions of the segment.
 *
 * By leveraging the layering functionality of CSS `background`, we're able
 * to display multiple segments of buffered audio.
 */
export function renderTimeRanges(
  timeRanges: TimeRanges | undefined,
  duration: number,
  color: string
) {
  if (timeRanges === undefined) {
    return emptyLayer;
  }

  const backgroundColor = `linear-gradient(${color}, ${color})`;
  const backgroundHeight = '100%';

  const layers = [];
  for (let rangeIndex = 0; rangeIndex < timeRanges.length; ++rangeIndex) {
    const start = timeRanges.start(rangeIndex);
    const end = timeRanges.end(rangeIndex);
    const backgroundPositionX = `${(start / duration) * 100}%`;
    const backgroundWidth = `${((end - start) / duration) * 100}%`;

    layers.push(
      `${backgroundColor} ${backgroundPositionX} / ${backgroundWidth} ${backgroundHeight} no-repeat`
    );
  }

  return layers.join(',') || emptyLayer;
}
