// Phosphor's icon source passes `className` to <Svg> (used on web); react-native-svg's types omit it.
import 'react-native-svg';

declare module 'react-native-svg' {
  interface SvgProps {
    className?: string;
  }
}
