# Hello World

> react-native-skia **v3.5.0** docs · [online](https://wcandillon.github.io/react-native-skia/docs/getting-started/hello-world) · source `apps/docs/docs/getting-started/hello-world.md` · MIT licence, see [LICENSE.md](../../LICENSE.md)

React Native Skia provides a declarative API using its own React Renderer.

```tsx twoslash
import React from "react";
import { Canvas, Circle, Group } from "react-native-skia";

const App = () => {
  const width = 256;
  const height = 256;
  const r = width * 0.33;
  return (
    <Canvas style={{ width, height }}>
      <Group blendMode="multiply">
        <Circle cx={r} cy={r} r={r} color="cyan" />
        <Circle cx={width - r} cy={r} r={r} color="magenta" />
        <Circle cx={width / 2} cy={width - r} r={r} color="yellow" />
      </Group>
    </Canvas>
  );
};

export default App;
```

### Result

![Hello World](https://raw.githubusercontent.com/wcandillon/react-native-skia/v3.5.0/apps/docs/static/img/getting-started/hello-world/blend-modes.png)
