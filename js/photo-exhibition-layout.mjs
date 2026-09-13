// A fixed architectural cylinder; catalogue length must not change its curvature.
export const SCREEN_RADIUS = 6.3;
export const TOUR_SPEED = .042; // radians / second, constant even between different formats
export const wrap = (n, count) => ((n % count) + count) % count;

export function createScreenLayout(photos, aspects = {}) {
    let cursor = 0;
    const items = photos.map(photo => {
        const ratio = aspects[photo.src] > 0 ? aspects[photo.src] : 1.4;
        const width = Math.min(4.8, 2.65 * ratio);
        const slot = Math.max(.7, width);
        const item = { width, height: width / ratio, arc: width / SCREEN_RADIUS,
            angle: (cursor + slot / 2) / SCREEN_RADIUS };
        cursor += slot + .48;
        return item;
    });
    const cycleAngle = cursor / SCREEN_RADIUS;
    function angleAt(position) {
        if (!items.length) return 0;
        const index = Math.floor(position), fraction = position - index;
        const i = wrap(index, items.length), j = wrap(index + 1, items.length);
        const cycle = Math.floor(index / items.length) * cycleAngle;
        const a = items[i].angle + cycle;
        const b = items[j].angle + cycle + (j === 0 ? cycleAngle : 0);
        return a + (b - a) * fraction;
    }
    function positionAt(angle) {
        if (!items.length) return 0;
        const cycle = Math.floor((angle - items[0].angle) / cycleAngle);
        const local = angle - cycle * cycleAngle;
        let low = 0, high = items.length;
        while (low + 1 < high) {
            const mid = (low + high) >> 1;
            if (items[mid].angle <= local) low = mid; else high = mid;
        }
        const a = items[low].angle;
        const b = low + 1 < items.length ? items[low + 1].angle : items[0].angle + cycleAngle;
        return cycle * items.length + low + (local - a) / (b - a);
    }
    function visibleIndices(position) {
        if (!items.length) return [];
        if (items.length === 1) return [0];
        const center = Math.round(position), angle = angleAt(position), result = [center];
        // Include a preload margin, measured in wall arc rather than photo count.
        for (const direction of [-1, 1]) {
            let i = center + direction;
            while (Math.abs(angleAt(i) - angle) < 2.6) {
                result.push(i);
                i += direction;
            }
        }
        return result;
    }
    return { items, cycleAngle, angleAt, positionAt, visibleIndices,
        advance(position, seconds) {
            return items.length > 1 ? positionAt(angleAt(position) + TOUR_SPEED * seconds) : position;
        }
    };
}
