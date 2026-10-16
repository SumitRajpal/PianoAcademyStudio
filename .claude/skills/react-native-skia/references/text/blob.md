# Text Blob

> react-native-skia **v3.5.0** docs · [online](https://wcandillon.github.io/react-native-skia/docs/text/blob) · source `apps/docs/docs/text/blob.md` · MIT licence, see [LICENSE.md](../../LICENSE.md)

A text blob contains glyphs, positions, and paint attributes specific to the text.

| Name        | Type       |  Description                                                 |
|:------------|:-----------|:-------------------------------------------------------------|
| blob        | `TextBlob` | Text blob                                                    |
| x?          | `number`   | x coordinate of the origin of the entire run. Default is 0   |
| y?          | `number`   | y coordinate of the origin of the entire run. Default is 0   |

## Example

```tsx twoslash
import {Canvas, TextBlob, Skia, useFont} from "react-native-skia";


export const HelloWorld = () => {
  const font = useFont(require("./SF-Pro.ttf"), 24);
  if (font === null) {
    return null;
  }
  const blob = Skia.TextBlob.MakeFromText("Hello World!", font);
  return (
      <Canvas style={{ flex: 1 }}>
        <TextBlob
          blob={blob}
          color="blue"
        />
      </Canvas>
  );
};
```
