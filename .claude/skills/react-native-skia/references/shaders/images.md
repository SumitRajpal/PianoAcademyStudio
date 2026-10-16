# Image Shaders

> react-native-skia **v3.5.0** docs · [online](https://wcandillon.github.io/react-native-skia/docs/shaders/images) · source `apps/docs/docs/shaders/images.md` · MIT licence, see [LICENSE.md](../../LICENSE.md)

## Image

Returns an image as a shader with the specified tiling.
It will use cubic sampling.

| Name       | Type           |  Description                       |
|:-----------|:---------------|:-----------------------------------|
| image      | `SkImage`      | Image instance. |
| tx?        | `TileMode`     | Can be `clamp`, `repeat`, `mirror`, or `decal`. |
| ty?        | `TileMode`     | Can be `clamp`, `repeat`, `mirror`, or `decal`. |
| fit?       | `Fit`          | Calculate the transformation matrix to fit the rectangle defined by `fitRect`. See [images](../image.md). |
| rect?      | `SkRect`       | The destination rectangle to calculate the transformation matrix via the `fit` property. |
| transform? | `Transforms2d` | see [transformations](../group.md#transformations). |
| sampling? | `Sampling` | The method used to sample the image. see ([sampling options](../image.md#sampling-options)). |

### Example
```tsx twoslash
import {
  Canvas,
  Circle,
  ImageShader,
  Skia,
  Shader,
  useImage
} from "react-native-skia";

const ImageShaderDemo = () => {
  const image = useImage(require("../../assets/oslo.jpg"));
  if (image === null) {
    return null;
  }
  return (
    <Canvas style={{ flex: 1 }}>
      <Circle cx={128} cy={128} r={128}>
        <ImageShader
          image={image}
          fit="cover"
          rect={{ x: 0, y: 0, width: 256, height: 256 }}
        />
      </Circle>
    </Canvas>
  );
};
```
### Result
![Image Shader](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/docs/shaders/assets/image.png)
