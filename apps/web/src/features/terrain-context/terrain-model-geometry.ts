type ProjectedPosition = [number, number];

export function isPointInRing(point: ProjectedPosition, ring: ProjectedPosition[]) {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const start = ring[index];
    const end = ring[previous];
    if (!start || !end) continue;
    const crossesLatitude = start[1] > point[1] !== end[1] > point[1];
    if (!crossesLatitude) continue;
    const intersection =
      ((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) + start[0];
    if (point[0] < intersection) inside = !inside;
  }
  return inside;
}
