import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
// Only the Ionicons set (the package index would pull in every icon font)
import Ionicons from '@expo/vector-icons/Ionicons';
import type { IconProps as PhosphorProps, IconWeight } from 'phosphor-react-native';
// One file per glyph keeps the bundle to the icons actually used.
import { ArrowCircleDownIcon } from 'phosphor-react-native/src/icons/ArrowCircleDown';
import { ArrowCircleUpIcon } from 'phosphor-react-native/src/icons/ArrowCircleUp';
import { ArrowDownIcon } from 'phosphor-react-native/src/icons/ArrowDown';
import { ArrowRightIcon } from 'phosphor-react-native/src/icons/ArrowRight';
import { ArrowUpIcon } from 'phosphor-react-native/src/icons/ArrowUp';
import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { ArrowsDownUpIcon } from 'phosphor-react-native/src/icons/ArrowsDownUp';
import { ArrowsLeftRightIcon } from 'phosphor-react-native/src/icons/ArrowsLeftRight';
import { BasketIcon } from 'phosphor-react-native/src/icons/Basket';
import { BicycleIcon } from 'phosphor-react-native/src/icons/Bicycle';
import { CalendarBlankIcon } from 'phosphor-react-native/src/icons/CalendarBlank';
import { CaretLeftIcon } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { ChartPieIcon } from 'phosphor-react-native/src/icons/ChartPie';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { ChecksIcon } from 'phosphor-react-native/src/icons/Checks';
import { CloudArrowUpIcon } from 'phosphor-react-native/src/icons/CloudArrowUp';
import { CloudCheckIcon } from 'phosphor-react-native/src/icons/CloudCheck';
import { CloudSlashIcon } from 'phosphor-react-native/src/icons/CloudSlash';
import { ConfettiIcon } from 'phosphor-react-native/src/icons/Confetti';
import { CreditCardIcon } from 'phosphor-react-native/src/icons/CreditCard';
import { DotsThreeCircleIcon } from 'phosphor-react-native/src/icons/DotsThreeCircle';
import { DownloadSimpleIcon } from 'phosphor-react-native/src/icons/DownloadSimple';
import { DropIcon } from 'phosphor-react-native/src/icons/Drop';
import { FilePlusIcon } from 'phosphor-react-native/src/icons/FilePlus';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { FirstAidKitIcon } from 'phosphor-react-native/src/icons/FirstAidKit';
import { ForkKnifeIcon } from 'phosphor-react-native/src/icons/ForkKnife';
import { HandCoinsIcon } from 'phosphor-react-native/src/icons/HandCoins';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { InfoIcon } from 'phosphor-react-native/src/icons/Info';
import { KeyIcon } from 'phosphor-react-native/src/icons/Key';
import { LightningIcon } from 'phosphor-react-native/src/icons/Lightning';
import { ListBulletsIcon } from 'phosphor-react-native/src/icons/ListBullets';
import { LockOpenIcon } from 'phosphor-react-native/src/icons/LockOpen';
import { LockSimpleIcon } from 'phosphor-react-native/src/icons/LockSimple';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { PiggyBankIcon } from 'phosphor-react-native/src/icons/PiggyBank';
import { PlusCircleIcon } from 'phosphor-react-native/src/icons/PlusCircle';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { ReceiptIcon } from 'phosphor-react-native/src/icons/Receipt';
import { RepeatIcon } from 'phosphor-react-native/src/icons/Repeat';
import { ShoppingBagIcon } from 'phosphor-react-native/src/icons/ShoppingBag';
import { SignInIcon } from 'phosphor-react-native/src/icons/SignIn';
import { SignOutIcon } from 'phosphor-react-native/src/icons/SignOut';
import { SparkleIcon } from 'phosphor-react-native/src/icons/Sparkle';
import { SquaresFourIcon } from 'phosphor-react-native/src/icons/SquaresFour';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { TrendUpIcon } from 'phosphor-react-native/src/icons/TrendUp';
import { WalletIcon } from 'phosphor-react-native/src/icons/Wallet';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { XIcon } from 'phosphor-react-native/src/icons/X';

/** The app names icons by their Ionicons names; each one renders a Phosphor glyph. */
export type IconName = React.ComponentProps<typeof Ionicons>['name'];

const MAP: Partial<Record<IconName, React.FC<PhosphorProps>>> = {
  add: PlusIcon,
  'add-circle': PlusCircleIcon,
  'add-circle-outline': PlusCircleIcon,
  'alert-circle': WarningCircleIcon,
  'alert-circle-outline': WarningCircleIcon,
  'arrow-down': ArrowDownIcon,
  'arrow-down-circle-outline': ArrowCircleDownIcon,
  'arrow-forward': ArrowRightIcon,
  'arrow-up': ArrowUpIcon,
  'arrow-up-circle-outline': ArrowCircleUpIcon,
  'bag-handle-outline': ShoppingBagIcon,
  'bus-outline': BicycleIcon,
  calendar: CalendarBlankIcon,
  'calendar-outline': CalendarBlankIcon,
  'card-outline': CreditCardIcon,
  'cart-outline': BasketIcon,
  'cash-outline': HandCoinsIcon,
  checkmark: CheckIcon,
  'checkmark-done-outline': ChecksIcon,
  'chevron-back': CaretLeftIcon,
  'chevron-forward': CaretRightIcon,
  close: XIcon,
  'cloud-done-outline': CloudCheckIcon,
  'cloud-offline-outline': CloudSlashIcon,
  'cloud-upload': CloudArrowUpIcon,
  'cloud-upload-outline': CloudArrowUpIcon,
  'document-attach-outline': FilePlusIcon,
  'document-text-outline': FileTextIcon,
  'download-outline': DownloadSimpleIcon,
  'ellipsis-horizontal-circle-outline': DotsThreeCircleIcon,
  'film-outline': ConfettiIcon,
  'flash-outline': LightningIcon,
  grid: SquaresFourIcon,
  'grid-outline': SquaresFourIcon,
  'home-outline': HouseIcon,
  'information-circle-outline': InfoIcon,
  'key-outline': KeyIcon,
  list: ListBulletsIcon,
  'list-outline': ListBulletsIcon,
  'lock-closed-outline': LockSimpleIcon,
  'lock-open-outline': LockOpenIcon,
  'log-in-outline': SignInIcon,
  'log-out-outline': SignOutIcon,
  'medkit-outline': FirstAidKitIcon,
  'pie-chart-outline': ChartPieIcon,
  'receipt-outline': ReceiptIcon,
  'repeat-outline': RepeatIcon,
  'restaurant-outline': ForkKnifeIcon,
  search: MagnifyingGlassIcon,
  'sparkles-outline': SparkleIcon,
  'swap-horizontal-outline': ArrowsLeftRightIcon,
  'swap-vertical': ArrowsDownUpIcon,
  'sync-outline': ArrowsClockwiseIcon,
  'trash-outline': TrashIcon,
  'trending-up': TrendUpIcon,
  'trending-up-outline': PiggyBankIcon,
  wallet: WalletIcon,
  'wallet-outline': WalletIcon,
  'water-outline': DropIcon,
};

/** Ionicons "filled" names map to Phosphor's fill weight, which marks an active state. */
const FILLED = new Set<IconName>(['wallet', 'grid', 'list', 'calendar', 'cloud-upload', 'alert-circle', 'add-circle']);

export function Icon({
  name,
  size = 20,
  color,
  weight,
  duotoneColor,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  /** Default: `fill` for filled names, `regular` otherwise. Use `bold` beside semibold text, `duotone` in tiles. */
  weight?: IconWeight;
  duotoneColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const Glyph = MAP[name];
  if (!Glyph) return <Ionicons name={name} size={size} color={color} style={style as never} />;
  return (
    <Glyph
      size={size}
      color={color}
      weight={weight ?? (FILLED.has(name) ? 'fill' : 'regular')}
      duotoneColor={duotoneColor}
      duotoneOpacity={0.3}
      style={style}
    />
  );
}
