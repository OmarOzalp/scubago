import { TAP_SLOP } from './tap-target';

/**
 * A tap anywhere on the scene that no animal takes (the Home card: open the island full screen). An
 * invisible floor far below the seabed, so a tap reaches any animal's tap target first, and the
 * animals stop the taps they take. A press that moves more than TAP_SLOP is a drag (or the page
 * scrolling), not a tap.
 */
export function TapAnywhere({ onTap }: { onTap: () => void }) {
  return <mesh visible={false} position={[0, -20, 0]} rotation={[-Math.PI / 2, 0, 0]}
    onClick={(event) => { if (event.delta > TAP_SLOP) return; event.stopPropagation(); onTap(); }}>
    <planeGeometry args={[400, 400]} />
  </mesh>;
}
