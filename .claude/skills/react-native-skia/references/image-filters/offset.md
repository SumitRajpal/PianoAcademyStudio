# Offset

> react-native-skia **v3.5.0** docs · [online](https://wcandillon.github.io/react-native-skia/docs/image-filters/offset) · source `apps/docs/docs/image-filters/offset.md` · MIT licence, see [LICENSE.md](../../LICENSE.md)

This offset filter is identical to its [SVG counterpart](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feOffset). It allows offsetting the filtered image. 

| Name      | Type           |  Description                               |
|:----------|:---------------|:-------------------------------------------|
| x         | `number`       | Offset along the X axis.                   |
| y         | `number`       | Offset along the Y axis.                   |
| children? | `ImageFilter`  | Optional image filter to be applied first. | 

## Example

```tsx twoslash
import { Canvas, Image, Offset, useImage, Fill } from "react-native-skia";

const Filter = () => {
  const image = useImage(require("./assets/oslo.jpg"));
  if (!image) {
    return null;
  }
  return (
    <Canvas style={{ width: 256, height: 256 }}>
      <Fill color="lightblue" />
      <Image
        image={image}
        x={0}
        y={0}
        width={256}
        height={256}
        fit="cover"
      >
        <Offset x={64} y={64} />
      </Image>
    </Canvas>
  );
};
```

![offset.png](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/static/img/image-filters/offset.png)
