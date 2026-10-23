# Glyphs

> react-native-skia **v3.5.0** docs · [online](https://wcandillon.github.io/react-native-skia/docs/text/glyphs) · source `apps/docs/docs/text/glyphs.md` · MIT licence, see [LICENSE.md](../../LICENSE.md)

This component draws a run of glyphs, at corresponding positions, in a given font.

| Name        | Type       |  Description                                                           |
|:------------|:-----------|:-----------------------------------------------------------------------|
| glyphs      | `Glyph[]`  | Glyphs to draw                                                         |
| x?          | `number`  | x coordinate of the origin of the entire run. Default is 0             |
| y?          | `number`  | y coordinate of the origin of the entire run. Default is 0             |
| font        | `SkFont`     | Font to use                                                          |

## Draw text vertically

```tsx twoslash
import {Canvas, Glyphs, vec, useFont} from "react-native-skia";

export const HelloWorld = () => {
  const fontSize = 32;
  const font = useFont(require("./my-font.otf"), fontSize);
  if (font === null) {
    return null;
  }
  const glyphs = font
    .getGlyphIDs("Hello World!")
    .map((id, i) => ({ id, pos: vec(0, (i + 1) * fontSize) }));
  return (
    <Canvas style={{ flex:  1 }}>
      <Glyphs
        font={font}
        glyphs={glyphs}
      />
    </Canvas>
  );
}
```

![hello-world-vertical.png](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/static/img/text/hello-world-vertical.png)
