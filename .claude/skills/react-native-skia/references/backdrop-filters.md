# Backdrop Filters

> react-native-skia **v3.5.0** docs · [online](https://wcandillon.github.io/react-native-skia/docs/backdrops-filters) · source `apps/docs/docs/backdrop-filters.md` · MIT licence, see [LICENSE.md](../LICENSE.md)

In Skia, backdrop filters are equivalent to their [CSS counterpart](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter). They allow you to apply image filters such as blurring to the area behind a [clipping mask](group.md#clipping-operations). A backdrop filter extends the [Group component](group.md#clipping-operations). All properties from the [group component](group.md) can be applied to a backdrop filter.

The [clipping mask](group.md#clipping-operations) will be used to restrict the area of the backdrop filter.

## Backdrop Filter

Applies an image filter to the area behind the canvas or behind a defined clipping mask. The first child of a backdrop filter is the image filter to use. All properties from the [group component](group.md) can be applied to a backdrop filter.

### Example

Apply a black and white color matrix to the clipping area:

```tsx twoslash
import {
  Canvas,
  BackdropFilter,
  Image,
  ColorMatrix,
  useImage,
} from "react-native-skia";

// https://kazzkiq.github.io/svg-color-filter/
const BLACK_AND_WHITE = [
  0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0,
];

export const Filter = () => {
  const image = useImage(require("./assets/oslo.jpg"));

  return (
    <Canvas style={{ width: 256, height: 256 }}>
      <Image image={image} x={0} y={0} width={256} height={256} fit="cover" />
      <BackdropFilter
        clip={{ x: 0, y: 128, width: 256, height: 128 }}
        filter={<ColorMatrix matrix={BLACK_AND_WHITE} />}
      />
    </Canvas>
  );
};
```

![black-and-white-backdrop-filter.png](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/static/img/black-and-white-backdrop-filter.png)

## Backdrop Blur

Creates a backdrop blur. All properties from the [group component](group.md) can be applied to a backdrop filter.

| Name | Type     | Description |
| :--- | :------- | :---------- |
| blur | `number` | Blur radius |

## Example

```tsx twoslash
import {
  Canvas,
  Fill,
  Image,
  BackdropBlur,
  useImage,
} from "react-native-skia";

export const Filter = () => {
  const image = useImage(require("./assets/oslo.jpg"));

  return (
    <Canvas style={{ width: 256, height: 256 }}>
      <Image image={image} x={0} y={0} width={256} height={256} fit="cover" />
      <BackdropBlur blur={4} clip={{ x: 0, y: 128, width: 256, height: 128 }}>
        <Fill color="rgba(0, 0, 0, 0.2)" />
      </BackdropBlur>
    </Canvas>
  );
};
```

![blur-backdrop-filter.png](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/static/img/blur-backdrop-filter.png)
