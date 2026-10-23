# Mask Filters

> react-native-skia **v3.5.0** docs · [online](https://wcandillon.github.io/react-native-skia/docs/mask-filters) · source `apps/docs/docs/mask-filters.md` · MIT licence, see [LICENSE.md](../LICENSE.md)

Mask filters are effects that manipulate the geometry and alpha channel of graphical objects. 

## BlurMask

Creates a blur mask filter.

| Name        | Type        |  Description                                          |
|:------------|:------------|:------------------------------------------------------|
| blur        | `number`    | Standard deviation of the Gaussian blur. Must be > 0. |
| style?      | `BlurStyle` | Can be `normal`, `solid`, `outer`, or `inner` (default is `normal`).        |
| respectCTM? | `boolean`   | if true the blur's sigma is modified by the CTM (default is `true`).      |

### Example

```tsx twoslash
import {Canvas, Fill, Circle, BlurMask, vec} from "react-native-skia";

const MaskFilterDemo = () => {
  return (
    <Canvas style={{ flex: 1}}>
      <Circle c={vec(128)} r={128} color="lightblue">
        <BlurMask blur={20} style="normal" />
      </Circle>
    </Canvas>
  );
};
```

| Style  |  Result                           |       |                                  |
|:-------|:----------------------------------|:----- |:---------------------------------|
| normal | ![Normal](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/docs/assets/mask-filters/blur-normal.png) | inner | ![Inner](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/docs/assets/mask-filters/blur-inner.png)  |
| solid  | ![Solid](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/docs/assets/mask-filters/blur-solid.png)   | outer | ![Outer](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/docs/assets/mask-filters/blur-outer.png)  |
