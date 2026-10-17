require('react-native-reanimated').setUpTests();

// Skia's mock leaves out usePathValue: build the path once from an empty
// builder, as the first frame would.
const skia = require('react-native-skia');
skia.usePathValue = build => {
  const builder = skia.Skia.PathBuilder.Make();
  build(builder);
  return { value: builder.build() };
};
