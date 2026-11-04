import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { CORE_D, FACETS, G_D } from "./markData";
import { WORDMARK_PATHS } from "./wordmarkPaths";

// The full logo (mark + "DraftGem"), one vector, from assets/logo.svg (viewBox 640x140).
export function DraftGemLogo({ height = 28 }: { height?: number }) {
  const width = (height * 640) / 140;
  return (
    <Svg width={width} height={height} viewBox="0 0 640 140" fill="none">
      <Defs>
        {FACETS.map((f, i) => (
          <LinearGradient key={i} id={`logoFacet${i}`} x1={f.grad.x1} y1={f.grad.y1} x2={f.grad.x2} y2={f.grad.y2} gradientUnits="userSpaceOnUse">
            <Stop stopColor={f.grad.from} />
            <Stop offset="1" stopColor={f.grad.to} />
          </LinearGradient>
        ))}
      </Defs>
      {WORDMARK_PATHS.map((d, i) => (
        <Path key={i} d={d} fill="white" />
      ))}
      <Path d={CORE_D} fill="black" />
      {FACETS.map((f, i) => (
        <Path key={i} d={f.d} fill={`url(#logoFacet${i})`} />
      ))}
      <Path d={G_D} fill="white" />
    </Svg>
  );
}

// Just the "DraftGem" lettering of the logo (its x 182–640): the desktop sidebar draws it next to the mark and fades it out when folding.
export function DraftGemWordmark({ height = 28 }: { height?: number }) {
  const width = (height * 458) / 140;
  return (
    <Svg width={width} height={height} viewBox="182 0 458 140" fill="none">
      {WORDMARK_PATHS.map((d, i) => (
        <Path key={i} d={d} fill="white" />
      ))}
    </Svg>
  );
}

// The gem mark on its own (assets/mark.svg, viewBox 136x140): the desktop sidebar's logo.
export function DraftGemMark({ height = 28 }: { height?: number }) {
  const width = (height * 136) / 140;
  return (
    <Svg width={width} height={height} viewBox="0 0 136 140" fill="none">
      <Defs>
        {FACETS.map((f, i) => (
          <LinearGradient key={i} id={`markFacet${i}`} x1={f.grad.x1} y1={f.grad.y1} x2={f.grad.x2} y2={f.grad.y2} gradientUnits="userSpaceOnUse">
            <Stop stopColor={f.grad.from} />
            <Stop offset="1" stopColor={f.grad.to} />
          </LinearGradient>
        ))}
      </Defs>
      <Path d={CORE_D} fill="black" />
      {FACETS.map((f, i) => (
        <Path key={i} d={f.d} fill={`url(#markFacet${i})`} />
      ))}
      <Path d={G_D} fill="white" />
    </Svg>
  );
}
