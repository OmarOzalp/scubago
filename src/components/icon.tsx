/**
 * ScubaGo's icons: Phosphor (MIT), drawn in its duotone weight. The outline is in ink and a soft
 * colour wash fills part of each icon, like a field-guide sketch with watercolour. Each icon is
 * imported on its own so only the ones used here are bundled.
 */
import { View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { AirplaneTiltIcon } from 'phosphor-react-native/src/icons/AirplaneTilt';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { ArrowLineDownIcon } from 'phosphor-react-native/src/icons/ArrowLineDown';
import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { ArrowSquareOutIcon } from 'phosphor-react-native/src/icons/ArrowSquareOut';
import { BarbellIcon } from 'phosphor-react-native/src/icons/Barbell';
import { BellIcon } from 'phosphor-react-native/src/icons/Bell';
import { BinocularsIcon } from 'phosphor-react-native/src/icons/Binoculars';
import { BoatIcon } from 'phosphor-react-native/src/icons/Boat';
import { BookOpenTextIcon } from 'phosphor-react-native/src/icons/BookOpenText';
import { CalendarBlankIcon } from 'phosphor-react-native/src/icons/CalendarBlank';
import { CameraIcon } from 'phosphor-react-native/src/icons/Camera';
import { CameraPlusIcon } from 'phosphor-react-native/src/icons/CameraPlus';
import { CaretDoubleLeftIcon } from 'phosphor-react-native/src/icons/CaretDoubleLeft';
import { CaretDoubleRightIcon } from 'phosphor-react-native/src/icons/CaretDoubleRight';
import { CaretDownIcon } from 'phosphor-react-native/src/icons/CaretDown';
import { CaretLeftIcon } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { CheckCircleIcon } from 'phosphor-react-native/src/icons/CheckCircle';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { CompassIcon } from 'phosphor-react-native/src/icons/Compass';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { CrosshairIcon } from 'phosphor-react-native/src/icons/Crosshair';
import { CylinderIcon } from 'phosphor-react-native/src/icons/Cylinder';
import { DropIcon } from 'phosphor-react-native/src/icons/Drop';
import { EnvelopeSimpleIcon } from 'phosphor-react-native/src/icons/EnvelopeSimple';
import { ExportIcon } from 'phosphor-react-native/src/icons/Export';
import { EyeIcon } from 'phosphor-react-native/src/icons/Eye';
import { FishIcon } from 'phosphor-react-native/src/icons/Fish';
import { FunnelSimpleIcon } from 'phosphor-react-native/src/icons/FunnelSimple';
import { GaugeIcon } from 'phosphor-react-native/src/icons/Gauge';
import { GlobeHemisphereWestIcon } from 'phosphor-react-native/src/icons/GlobeHemisphereWest';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { ImageIcon } from 'phosphor-react-native/src/icons/Image';
import { InfoIcon } from 'phosphor-react-native/src/icons/Info';
import { KeyIcon } from 'phosphor-react-native/src/icons/Key';
import { ListBulletsIcon } from 'phosphor-react-native/src/icons/ListBullets';
import { LockSimpleIcon } from 'phosphor-react-native/src/icons/LockSimple';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { MapPinIcon } from 'phosphor-react-native/src/icons/MapPin';
import { MapPinPlusIcon } from 'phosphor-react-native/src/icons/MapPinPlus';
import { MapTrifoldIcon } from 'phosphor-react-native/src/icons/MapTrifold';
import { MedalIcon } from 'phosphor-react-native/src/icons/Medal';
import { NavigationArrowIcon } from 'phosphor-react-native/src/icons/NavigationArrow';
import { NoteIcon } from 'phosphor-react-native/src/icons/Note';
import { PauseIcon } from 'phosphor-react-native/src/icons/Pause';
import { PencilSimpleIcon } from 'phosphor-react-native/src/icons/PencilSimple';
import { PlayIcon } from 'phosphor-react-native/src/icons/Play';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { QrCodeIcon } from 'phosphor-react-native/src/icons/QrCode';
import { SealCheckIcon } from 'phosphor-react-native/src/icons/SealCheck';
import { SignatureIcon } from 'phosphor-react-native/src/icons/Signature';
import { SignOutIcon } from 'phosphor-react-native/src/icons/SignOut';
import { SparkleIcon } from 'phosphor-react-native/src/icons/Sparkle';
import { StampIcon } from 'phosphor-react-native/src/icons/Stamp';
import { StarIcon } from 'phosphor-react-native/src/icons/Star';
import { ThermometerIcon } from 'phosphor-react-native/src/icons/Thermometer';
import { TimerIcon } from 'phosphor-react-native/src/icons/Timer';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { TShirtIcon } from 'phosphor-react-native/src/icons/TShirt';
import { UserCircleIcon } from 'phosphor-react-native/src/icons/UserCircle';
import { UsersIcon } from 'phosphor-react-native/src/icons/Users';
import { WarningIcon } from 'phosphor-react-native/src/icons/Warning';
import { WavesIcon } from 'phosphor-react-native/src/icons/Waves';
import { WindIcon } from 'phosphor-react-native/src/icons/Wind';
import { XIcon } from 'phosphor-react-native/src/icons/X';

import { useTheme } from '@/hooks/use-theme';

const ICONS = {
  home: HouseIcon,
  airplane: AirplaneTiltIcon,
  back: ArrowLeftIcon,
  external: ArrowSquareOutIcon,
  sync: ArrowsClockwiseIcon,
  bell: BellIcon,
  binoculars: BinocularsIcon,
  boat: BoatIcon,
  logbook: BookOpenTextIcon,
  calendar: CalendarBlankIcon,
  camera: CameraIcon,
  addPhoto: CameraPlusIcon,
  chevronDown: CaretDownIcon,
  chevronLeft: CaretLeftIcon,
  chevronRight: CaretRightIcon,
  yearBack: CaretDoubleLeftIcon,
  yearForward: CaretDoubleRightIcon,
  check: CheckIcon,
  checkCircle: CheckCircleIcon,
  clock: ClockIcon,
  copy: CopyIcon,
  explore: CompassIcon,
  locate: CrosshairIcon,
  drop: DropIcon,
  email: EnvelopeSimpleIcon,
  filter: FunnelSimpleIcon,
  share: ExportIcon,
  eye: EyeIcon,
  fieldGuide: FishIcon,
  everyone: GlobeHemisphereWestIcon,
  image: ImageIcon,
  info: InfoIcon,
  key: KeyIcon,
  list: ListBulletsIcon,
  lock: LockSimpleIcon,
  search: MagnifyingGlassIcon,
  pin: MapPinIcon,
  addSite: MapPinPlusIcon,
  map: MapTrifoldIcon,
  medal: MedalIcon,
  directions: NavigationArrowIcon,
  notes: NoteIcon,
  pause: PauseIcon,
  edit: PencilSimpleIcon,
  play: PlayIcon,
  plus: PlusIcon,
  code: QrCodeIcon,
  verified: SealCheckIcon,
  signOut: SignOutIcon,
  signature: SignatureIcon,
  sparkle: SparkleIcon,
  stamp: StampIcon,
  thermometer: ThermometerIcon,
  timer: TimerIcon,
  trash: TrashIcon,
  account: UserCircleIcon,
  buddies: UsersIcon,
  warning: WarningIcon,
  waves: WavesIcon,
  current: WindIcon,
  close: XIcon,
  depth: ArrowLineDownIcon,
  gauge: GaugeIcon,
  star: StarIcon,
  suit: TShirtIcon,
  tank: CylinderIcon,
  weights: BarbellIcon,
} as const;

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  size?: number;
  /** The outline. Defaults to the theme's ink. */
  color?: ColorValue;
  /** The wash inside the icon. Defaults to the theme's wash; pass the outline colour for a quieter icon. */
  wash?: string;
  /** How strong the wash is (0–1). */
  washOpacity?: number;
  /** 'duotone' (default) for most places; 'bold' where an icon must read at a glance on a fill. */
  weight?: 'duotone' | 'regular' | 'bold' | 'fill';
  style?: StyleProp<ViewStyle>;
}

/** Decorative by default: the label next to an icon (or the button around it) says what it means. */
export function Icon({ name, size = 22, color, wash, washOpacity = 0.55, weight = 'duotone', style }: Props) {
  const theme = useTheme();
  const Component = ICONS[name];
  const ink = (color as string | undefined) ?? theme.text;
  return (
    <View aria-hidden style={[{ pointerEvents: 'none' }, style]}>
      <Component size={size} color={ink} weight={weight} duotoneColor={wash ?? theme.wash} duotoneOpacity={washOpacity} />
    </View>
  );
}
