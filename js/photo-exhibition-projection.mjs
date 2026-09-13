// Coordinates calibrated to photo-exhibition-screen.jpg (1672 x 941).
// x is the full background plate's horizontal coordinate in [-1, 1].
export const WALL = {
    aspect: 1672 / 941, top: .359, topQuadratic: -.186, topQuartic: -.010,
    bottom: .638, bottomQuadratic: .067, bottomQuartic: .003,
    inset: .028, captionReserve: .052, captionGap: .008, captionHeight: .038
};
export function screenBand(x) {
    const x2 = x * x;
    const wallTop = WALL.top + WALL.topQuadratic * x2 + WALL.topQuartic * x2 * x2;
    const slope = (2 * WALL.topQuadratic * x + 4 * WALL.topQuartic * x * x2) * 2 / WALL.aspect;
    // Offset perpendicular to the cornice, not an ever-widening vertical gap.
    const top = wallTop + WALL.inset * Math.sqrt(1 + slope * slope);
    const bottom = WALL.bottom + WALL.bottomQuadratic * x2 + WALL.bottomQuartic * x2 * x2 - WALL.captionReserve;
    return { wallTop, slope, top, bottom };
}
export function coverScale(width, height) {
    return [Math.max(1, WALL.aspect * height / width), Math.max(1, width / (height * WALL.aspect))];
}

// Keep cylindrical x/z motion and perspective. Calibrate only its vertical
// projection to the photographic architecture, on the GPU for every segment.
export function calibrateScreenMaterial(material, cover, heightRatio, isCaption = false) {
    const uniforms = {
        galleryCover: { value: cover },
        galleryHeightRatio: { value: heightRatio },
        galleryCaption: { value: isCaption ? 1 : 0 }
    };
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `uniform vec2 galleryCover;
uniform float galleryHeightRatio;
uniform float galleryCaption;
` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
#include <project_vertex>
float galleryX = gl_Position.x / gl_Position.w / galleryCover.x;
float galleryX2 = galleryX * galleryX;
float galleryTop = ${WALL.top} + (${WALL.topQuadratic}) * galleryX2 + (${WALL.topQuartic}) * galleryX2 * galleryX2;
float gallerySlope = (${2 * WALL.topQuadratic} * galleryX + (${4 * WALL.topQuartic}) * galleryX * galleryX2) * ${2 / WALL.aspect};
galleryTop += ${WALL.inset} * sqrt(1.0 + gallerySlope * gallerySlope);
float galleryBottom = ${WALL.bottom - WALL.captionReserve} + ${WALL.bottomQuadratic} * galleryX2 + ${WALL.bottomQuartic} * galleryX2 * galleryX2;
float galleryImageHeight = (galleryBottom - galleryTop) * galleryHeightRatio;
float galleryV = galleryTop + (1.0 - uv.y) * galleryImageHeight;
if (galleryCaption > 0.5) galleryV = galleryTop + galleryImageHeight + ${WALL.captionGap} + (1.0 - uv.y) * ${WALL.captionHeight};
gl_Position.y = (1.0 - 2.0 * galleryV) * galleryCover.y * gl_Position.w;
`);
    };
    material.customProgramCacheKey = () => 'photographic-wall-v6';
    return ratio => { uniforms.galleryHeightRatio.value = ratio; };
}
