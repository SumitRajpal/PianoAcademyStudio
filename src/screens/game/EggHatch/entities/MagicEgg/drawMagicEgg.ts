/**
 * The enchanted egg, drawn centred on (0,0).
 * Rendered in 3D CGI stylized cartoon aesthetic (Pixar / The Incredibles standard):
 * - Spherical 3D form modeling with off-center key light.
 * - Subsurface scattering (warm ruby-magenta glow through shell).
 * - Embossed 3D gold filigree with metallic specular sweeps.
 * - Faceted 3D ruby medallion with internal refraction facets and diamond gleam.
 * - Glossy ceramic specular highlight lobe and crisp Fresnel rim kicker.
 * - Ambient bounce light from lotus petals below.
 */

import {
  BlendMode,
  BlurStyle,
  ClipOp,
  PaintStyle,
  PathOp,
  Skia,
  TileMode,
  type SkCanvas,
  type SkPath,
} from 'react-native-skia';

import {
  blurred,
  drawGlow,
  fill,
  linearGradient,
  stroke,
  twoPointConicalGradient,
  type Point,
} from '../../shared/paperKit';
import { eggPath, leafPath, sparklePath } from '../../shared/paperShapes';
import { SHATTER_LINES } from './eggCracks';
import { MAGIC_EGG_SIZE } from './eggGeometry';
import { MAGIC_EGG_LOOK, type MagicEggLook } from './magicEggLook';

export { MAGIC_EGG_SIZE };

/** Where the ruby sits, for its glint. */
export const EGG_GEM = { x: 0, y: MAGIC_EGG_SIZE.height * 0.12 };

function polyline(points: Point[]): SkPath {
  const b = Skia.PathBuilder.Make().moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) b.lineTo(p.x, p.y);
  return b.build();
}

const [WAIST, ...CUTS] = SHATTER_LINES;
const FAR = 120;

function waistBetween(x0: number, x1: number): Point[] {
  return WAIST.filter(p => p.x > x0 && p.x < x1);
}

export type EggPart = 'whole' | 'cup' | number;
export const EGG_SHARD_COUNT = CUTS.length + 1;

function partRegion(part: Exclude<EggPart, 'whole'>): SkPath {
  if (part === 'cup') {
    return Skia.Path.Polygon(
      [
        { x: -FAR, y: WAIST[0].y },
        ...WAIST,
        { x: FAR, y: WAIST[WAIST.length - 1].y },
        { x: FAR, y: FAR },
        { x: -FAR, y: FAR },
      ],
      true,
    );
  }
  const leftCut = part > 0 ? CUTS[part - 1] : null;
  const rightCut = part < CUTS.length ? CUTS[part] : null;
  const leftX = leftCut ? leftCut[leftCut.length - 1].x : -FAR;
  const rightX = rightCut ? rightCut[rightCut.length - 1].x : FAR;
  const pts: Point[] = [];
  if (leftCut) {
    pts.push({ x: leftCut[0].x, y: -FAR }, ...leftCut);
  } else {
    pts.push({ x: -FAR, y: -FAR }, { x: -FAR, y: WAIST[0].y });
  }
  pts.push(...waistBetween(leftX, rightX));
  if (rightCut) {
    pts.push(...[...rightCut].reverse(), { x: rightCut[0].x, y: -FAR });
  } else {
    pts.push({ x: FAR, y: WAIST[WAIST.length - 1].y }, { x: FAR, y: -FAR });
  }
  return Skia.Path.Polygon(pts, true);
}

export function eggPartCentre(part: Exclude<EggPart, 'whole'>): Point {
  const { width: w, height: h } = MAGIC_EGG_SIZE;
  const piece = Skia.Path.MakeFromOp(
    eggPath({ x: 0, y: 0 }, w, h),
    partRegion(part),
    PathOp.Intersect,
  );
  const b = piece
    ? piece.computeTightBounds()
    : { x: 0, y: 0, width: 0, height: 0 };
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function spiralPath(
  center: Point,
  radius: number,
  turns: number,
  flip: 1 | -1,
): SkPath {
  const b = Skia.PathBuilder.Make();
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2 * flip;
    const r = radius * (1 - t * 0.85);
    const x = center.x + Math.cos(a) * r;
    const y = center.y + Math.sin(a) * r;
    if (i === 0) b.moveTo(x, y);
    else b.lineTo(x, y);
  }
  return b.build();
}

/** Draws embossed 3D metallic gold and glossy enamel ornaments. */
function drawOrnaments(
  canvas: SkCanvas,
  w: number,
  h: number,
  look: MagicEggLook,
  goldOnly = false,
) {
  const goldStroke = stroke(look.gold, 1.8);
  const goldFill = fill(look.gold);
  const goldShade = stroke(look.goldDeep, 1.8);
  const tealFill = fill(look.teal, goldOnly ? 0 : 1);

  // Top: a small crown of gold dots and a teal teardrop with specular glint.
  for (let i = -2; i <= 2; i++) {
    const dx = i * 7;
    const dy = -h * 0.43 + Math.abs(i) * 3;
    // 3D sphere dot
    canvas.drawCircle(dx + 0.3, dy + 0.5, 2.0, fill(look.goldDeep));
    canvas.drawCircle(dx, dy, 1.9, goldFill);
    canvas.drawCircle(dx - 0.5, dy - 0.5, 0.7, fill(look.goldHighlight));
  }
  const topDrop = leafPath({ x: 0, y: -h * 0.52 }, 13, 8, 90, 0, 0.6);
  if (!goldOnly) {
    canvas.drawPath(
      topDrop,
      linearGradient({ x: 0, y: -h * 0.56 }, { x: 0, y: -h * 0.48 }, [
        look.tealLight,
        look.teal,
        look.tealDeep,
      ]),
    );
  }
  canvas.drawPath(topDrop, stroke(look.gold, 1.2));

  // Gold scallop band with embossed 3D drop highlights.
  const scallopY = -h * 0.3;
  for (let x = -w / 2; x < w / 2; x += 9) {
    canvas.drawArc(
      { x, y: scallopY - 4, width: 9, height: 9 },
      0,
      180,
      false,
      goldShade,
    );
    canvas.drawArc(
      { x, y: scallopY - 5, width: 9, height: 9 },
      0,
      180,
      false,
      goldStroke,
    );
    canvas.drawCircle(x + 4.5, scallopY + 9, 1.6, fill(look.goldDeep));
    canvas.drawCircle(x + 4.5, scallopY + 8.5, 1.4, goldFill);
    canvas.drawCircle(x + 4.0, scallopY + 8.0, 0.6, fill(look.goldHighlight));
  }

  // Teal enamel band with 3D gold borders and glossy enamel beads.
  const bandY = -h * 0.12;
  if (!goldOnly) {
    canvas.drawRect(
      { x: -w, y: bandY - 6, width: w * 2, height: 12 },
      linearGradient({ x: 0, y: bandY - 6 }, { x: 0, y: bandY + 6 }, [
        look.tealDeep,
        look.teal,
        look.tealDeep,
      ]),
    );
  }
  canvas.drawLine(-w, bandY - 6, w, bandY - 6, stroke(look.goldDeep, 1.5));
  canvas.drawLine(-w, bandY - 7, w, bandY - 7, stroke(look.goldHighlight, 1.2));
  canvas.drawLine(-w, bandY + 6, w, bandY + 6, stroke(look.goldDeep, 1.5));
  canvas.drawLine(-w, bandY + 5, w, bandY + 5, stroke(look.gold, 1.2));

  for (let x = -w / 2; x < w / 2; x += 7) {
    canvas.drawCircle(
      x + 0.4,
      bandY + 0.4,
      1.8,
      fill(look.tealDeep, goldOnly ? 0 : 1),
    );
    canvas.drawCircle(x, bandY, 1.7, tealFill);
    if (!goldOnly) {
      canvas.drawCircle(x - 0.5, bandY - 0.5, 0.6, fill('#ffffff', 0.8));
    }
  }

  // The 3D Ruby Medallion with teal teardrops and gold filigree swirls.
  const m = { x: 0, y: h * 0.12 };
  for (const side of [-1, 1] as const) {
    const drop = leafPath(
      { x: m.x + side * 8, y: m.y },
      24,
      15,
      side > 0 ? 0 : 180,
      0.2 * side,
      0.55,
    );
    if (!goldOnly) {
      canvas.drawPath(
        drop,
        linearGradient(
          { x: m.x + side * 5, y: m.y - 6 },
          { x: m.x + side * 15, y: m.y + 6 },
          [look.tealLight, look.teal, look.tealDeep],
        ),
      );
    }
    canvas.drawPath(drop, stroke(look.goldDeep, 1.4));
    canvas.drawPath(drop, stroke(look.gold, 1.1));

    // Gold filigree swirls with embossed highlight and shadow
    const s1 = spiralPath({ x: m.x + side * 22, y: m.y - 16 }, 7, 1.4, side);
    const s2 = spiralPath(
      { x: m.x + side * 22, y: m.y + 17 },
      6,
      1.3,
      -side as 1 | -1,
    );
    canvas.drawPath(s1, stroke(look.goldDeep, 1.8));
    canvas.drawPath(s1, stroke(look.gold, 1.2));
    canvas.drawPath(s2, stroke(look.goldDeep, 1.8));
    canvas.drawPath(s2, stroke(look.gold, 1.2));
  }

  // Faceted 3D Diamond-Cut Ruby Gem
  const gemTop = { x: m.x, y: m.y - 14 };
  const gemRight = { x: m.x + 9, y: m.y };
  const gemBottom = { x: m.x, y: m.y + 14 };
  const gemLeft = { x: m.x - 9, y: m.y };
  const gemCenter = { x: m.x - 1, y: m.y - 1 };

  // Bezel setting shadow & gold border
  const gemOutline = Skia.Path.Polygon(
    [gemTop, gemRight, gemBottom, gemLeft],
    true,
  );
  canvas.drawPath(gemOutline, stroke(look.goldDeep, 3.2));
  canvas.drawPath(gemOutline, stroke(look.goldHighlight, 1.5));

  if (!goldOnly) {
    // 4 Facets with physically simulated refraction lighting:
    // Top-Left facet (Direct key reflection: bright ruby)
    const facetTL = Skia.Path.Polygon([gemTop, gemLeft, gemCenter], true);
    canvas.drawPath(facetTL, fill(look.gemFacetLight));

    // Top-Right facet (Translucent core: vivid ruby)
    const facetTR = Skia.Path.Polygon([gemTop, gemRight, gemCenter], true);
    canvas.drawPath(facetTR, fill(look.gem));

    // Bottom-Left facet (Internal caustic reflection)
    const facetBL = Skia.Path.Polygon([gemBottom, gemLeft, gemCenter], true);
    canvas.drawPath(facetBL, fill(look.gemDeep));

    // Bottom-Right facet (Deep absorption shadow)
    const facetBR = Skia.Path.Polygon([gemBottom, gemRight, gemCenter], true);
    canvas.drawPath(facetBR, fill(look.gemShadow));

    // Crisp diamond specular glint
    const glint = Skia.Path.Polygon(
      [
        { x: m.x - 1, y: m.y - 9 },
        { x: m.x - 5, y: m.y - 2 },
        { x: m.x - 1, y: m.y - 3 },
      ],
      true,
    );
    canvas.drawPath(glint, fill('#ffffff', 0.95));
  }

  // Zigzag hem with 3D embossed gold points and teal enamel beads.
  const hemY = h * 0.33;
  const zig: Point[] = [];
  for (let x = -w / 2, i = 0; x <= w / 2; x += 6, i++) {
    zig.push({ x, y: hemY + (i % 2 ? 4 : -4) });
  }
  canvas.drawPath(polyline(zig), stroke(look.goldDeep, 1.8));
  canvas.drawPath(polyline(zig), stroke(look.gold, 1.3));
  for (let x = -w / 2 + 3; x < w / 2; x += 12) {
    canvas.drawCircle(x, hemY + 10, 2.0, fill(look.tealDeep, goldOnly ? 0 : 1));
    canvas.drawCircle(x, hemY + 9.6, 1.8, tealFill);
    if (!goldOnly) {
      canvas.drawCircle(x - 0.5, hemY + 9.2, 0.7, fill('#ffffff', 0.8));
    }
  }
}

export function drawMagicEgg(
  canvas: SkCanvas,
  part: EggPart = 'whole',
  look: MagicEggLook = MAGIC_EGG_LOOK,
) {
  const { width: w, height: h } = MAGIC_EGG_SIZE;
  const shell = eggPath({ x: 0, y: 0 }, w, h);
  canvas.save();
  if (part !== 'whole')
    canvas.clipPath(partRegion(part), ClipOp.Intersect, true);

  // 1. Soft Volumetric Ground / Lotus Contact Shadow under the egg
  canvas.drawPath(shell, blurred(fill(look.coreShadow, 0.65), 8));

  // 2. Volumetric 3D Spherical Shell Gradient (Conical / Off-center Key Light)
  const sphereShading = twoPointConicalGradient(
    { x: -w * 0.22, y: -h * 0.28 },
    0, // Focal highlight point
    { x: 0, y: 0 },
    h * 0.82, // Enclosing sphere boundary
    [
      look.shell[0], // Bright berry highlight
      look.shell[1], // Saturated berry midtone
      look.shell[2], // Deep berry core
      look.shell[3], // Shadow
    ],
    [0.0, 0.35, 0.72, 1.0],
  );
  canvas.drawPath(shell, sphereShading);

  // 3. Subsurface Scattering (SSS): Warm radiant ruby-crimson light bleeding through the shell
  const sssPaint = Skia.Paint();
  sssPaint.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: w * 0.1, y: h * 0.15 },
      h * 0.75,
      [Skia.Color('transparent'), Skia.Color(look.sss)],
      [0.4, 1.0],
      TileMode.Clamp,
    ),
  );
  sssPaint.setAlphaf(look.sssAlpha);
  sssPaint.setBlendMode(BlendMode.Screen);
  canvas.drawPath(shell, sssPaint);

  // 4. Ambient Bounce Light from the glowing pink lotus petals below
  const lotusBounce = Skia.Paint();
  lotusBounce.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: 0, y: h * 0.5 },
      { x: 0, y: 0 },
      [Skia.Color(look.bounceLotus), Skia.Color('transparent')],
      [0.0, 1.0],
      TileMode.Clamp,
    ),
  );
  lotusBounce.setAlphaf(look.bounceAlpha);
  lotusBounce.setBlendMode(BlendMode.Screen);
  canvas.drawPath(shell, lotusBounce);

  // 5. Draw 3D Embossed Ornaments clipped to the shell
  canvas.save();
  canvas.clipPath(shell, ClipOp.Intersect, true);
  drawOrnaments(canvas, w, h, look);

  // 6. Volumetric Form Shadow & Terminator Line (carving the right side of the egg)
  const terminatorPaint = Skia.Paint();
  terminatorPaint.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: -w * 0.05, y: -h * 0.1 },
      { x: w * 0.52, y: h * 0.35 },
      [Skia.Color('transparent'), Skia.Color(look.coreShadow)],
      [0.2, 1.0],
      TileMode.Clamp,
    ),
  );
  terminatorPaint.setAlphaf(0.55);
  terminatorPaint.setBlendMode(BlendMode.Multiply);
  canvas.drawRect(
    { x: -w, y: -h, width: w * 2, height: h * 2 },
    terminatorPaint,
  );

  // 7. Blinn-Phong Glossy Ceramic Specular Highlight
  const specLobe = Skia.Paint();
  specLobe.setColor(Skia.Color(look.highlight));
  specLobe.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 5, true));
  specLobe.setBlendMode(BlendMode.Plus);
  specLobe.setAlphaf(0.85);
  canvas.drawOval(
    { x: -w * 0.36, y: -h * 0.46, width: w * 0.28, height: h * 0.24 },
    specLobe,
  );

  // Sharp secondary specular pinpoint
  const sharpGlint = Skia.Paint();
  sharpGlint.setColor(Skia.Color('#ffffff'));
  sharpGlint.setBlendMode(BlendMode.Plus);
  canvas.drawCircle(-w * 0.24, -h * 0.38, 2.5, sharpGlint);

  canvas.restore();

  // 8. Fresnel Rim Kicker Light carving the outer contour from the dark trees
  const rimPaint = Skia.Paint();
  rimPaint.setStyle(PaintStyle.Stroke);
  rimPaint.setStrokeWidth(1.6);
  rimPaint.setColor(Skia.Color(look.highlightRim));
  rimPaint.setBlendMode(BlendMode.Plus);
  canvas.drawPath(shell, rimPaint);

  // Broken shell pieces glow with internal energy and god rays
  if (part !== 'whole') {
    canvas.clipPath(shell, ClipOp.Intersect, true);
    for (const line of SHATTER_LINES) {
      canvas.drawPath(
        polyline(line),
        blurred(stroke(look.crackGlow, 8, 0.95), 4),
      );
      canvas.drawPath(polyline(line), stroke(look.inside, 2.2));
    }
  }
  canvas.restore();
}

/** Only the gold ornaments: the mask the shimmer sweeps across. */
export function drawEggGold(
  canvas: SkCanvas,
  look: MagicEggLook = MAGIC_EGG_LOOK,
) {
  const { width: w, height: h } = MAGIC_EGG_SIZE;
  canvas.save();
  canvas.clipPath(eggPath({ x: 0, y: 0 }, w, h), ClipOp.Intersect, true);
  drawOrnaments(canvas, w, h, look, true);
  canvas.restore();
}

/** A soft diagonal band of light, centred on (0,0): swept across the gold mask. */
export function drawShimmerBand(
  canvas: SkCanvas,
  look: MagicEggLook = MAGIC_EGG_LOOK,
) {
  const { height: h } = MAGIC_EGG_SIZE;
  canvas.save();
  canvas.rotate(22, 0, 0);
  canvas.drawRect(
    { x: -9, y: -h, width: 18, height: h * 2 },
    linearGradient({ x: -9, y: 0 }, { x: 9, y: 0 }, [
      '#fff8e000',
      look.shimmer,
      '#fff8e000',
    ]),
  );
  canvas.restore();
}

/** The golden aura around the egg, with volumetric bloom and sparkles. */
export function drawEggAura(
  canvas: SkCanvas,
  look: MagicEggLook = MAGIC_EGG_LOOK,
) {
  const { width: w, height: h } = MAGIC_EGG_SIZE;
  drawGlow(
    canvas,
    { x: 0, y: -h * 0.05 },
    h * 1.35,
    look.aura,
    look.auraAlpha,
    BlendMode.Plus,
  );
  drawGlow(
    canvas,
    { x: 0, y: -h * 0.05 },
    h * 0.75,
    look.aura,
    look.auraAlpha * 0.9,
    BlendMode.Plus,
  );
  const sparkle = fill(look.inside, 0.95);
  for (const [x, y, r] of [
    [-w * 0.78, -h * 0.4, 5],
    [w * 0.8, -h * 0.2, 4],
    [-w * 0.62, h * 0.18, 3],
    [w * 0.66, h * 0.3, 3.5],
    [w * 0.3, -h * 0.72, 3],
  ]) {
    canvas.drawPath(sparklePath({ x, y }, r), sparkle);
  }
}
