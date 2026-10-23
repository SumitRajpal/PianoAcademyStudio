# Blur

> react-native-skia **v3.5.0** docs · [online](https://wcandillon.github.io/react-native-skia/docs/image-filters/blur) · source `apps/docs/docs/image-filters/blur.md` · MIT licence, see [LICENSE.md](../../LICENSE.md)

Creates an image filter that blurs its input by the separate X and Y sigmas.
The provided tile mode is used when the blur kernel goes outside the input image.

| Name      | Type                 |  Description                                                  |
|:----------|:---------------------|:--------------------------------------------------------------|
| blur      | `number` or `Vector` | The Gaussian sigma blur value                                 |
| mode?     | `TileMode`           | `mirror`, `repeat`, `clamp`, or `decal` (default is `decal`). |
| children? | `ImageFilter`        | Optional image filter to be applied first.                    | 

## Simple Blur

```tsx twoslash
import { Canvas, Blur, Image, useImage } from "react-native-skia";

const BlurImageFilter = () => {
  const image = useImage(require("./assets/oslo.jpg"));
  if (!image) {
    return null;
  }
  return (
    <Canvas style={{ flex: 1 }}>
      <Image
        x={0}
        y={0}
        width={256}
        height={256}
        image={image}
        fit="cover"
      >
        <Blur blur={4} />
      </Image>
    </Canvas>
  );
};
```

![Simple Blur](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/docs/image-filters/assets/decal-blur.png)

## With mode="clamp"

![Clamp Blur](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/docs/image-filters/assets/clamp-blur.png)
