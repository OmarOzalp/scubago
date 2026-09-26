import { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { HABITATS, type Habitat } from '@/lib/home';

function Palm({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <G transform={`translate(${x} ${y}) scale(${scale})`}>
    <Ellipse cx="15" cy="23" rx="24" ry="5" fill="#7C9470" opacity=".16" transform="rotate(-20)" />
    <Path d="M0 24 Q8 0 2 -21" stroke="#A88C61" strokeWidth="5" fill="none" strokeLinecap="round" />
    <Path d="M2 -22 Q-23 -42 -34 -15 Q-14 -25 2 -22Z" fill="#4D896D" />
    <Path d="M2 -22 Q-22 -18 -24 0 Q-12 -13 2 -22Z" fill="#6F9E75" />
    <Path d="M2 -22 Q-5 -48 14 -48 Q9 -32 2 -22Z" fill="#79A67B" />
    <Path d="M2 -22 Q30 -45 39 -19 Q19 -28 2 -22Z" fill="#548E6C" />
    <Path d="M2 -22 Q34 -18 28 4 Q18 -12 2 -22Z" fill="#3D7D62" />
    <Circle cx="2" cy="-20" r="3" fill="#A08B58" />
  </G>;
}
function Coral({ x, y, color = '#C89484', scale = 1 }: { x: number; y: number; color?: string; scale?: number }) {
  return <G transform={`translate(${x} ${y}) scale(${scale})`}>
    <Ellipse cy="4" rx="17" ry="6" fill="#598F88" opacity=".13" />
    <Path d="M0 3 L0 -19 M0 -7 Q-13 -6 -11 -20 M0 -12 Q11 -9 12 -24 M-10 -12 L-17 -17 M10 -15 L17 -18" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
  </G>;
}

export function IslandArt({ habitat, level = 1 }: { habitat: Habitat; level?: number }) {
  const id = useId().replace(/:/g, '');
  const sandId = `${id}-sand`;
  const shallowsId = `${id}-shallows`;
  const palette = HABITATS.find((h) => h.id === habitat)!;
  const rocky = habitat === 'cove';
  const lagoon = habitat === 'lagoon';
  const growth = 0.85 + Math.min(level, 6) * .035;
  return <Svg width="100%" height="100%" viewBox="0 0 420 390">
    <Defs>
      <LinearGradient id={shallowsId} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#DDF1E5" /><Stop offset="1" stopColor={palette.deep} /></LinearGradient>
      <LinearGradient id={sandId} x1="0" y1="0" x2=".8" y2="1"><Stop offset="0" stopColor="#F7EED3" /><Stop offset="1" stopColor="#E3D5B3" /></LinearGradient>
    </Defs>
    <G fill="none" stroke="#FFFFFF" strokeWidth="1.3" opacity=".35" strokeLinecap="round">
      <Path d="M37 100 Q46 103 55 100 M312 76 Q324 79 336 76 M348 284 Q361 287 375 284 M61 308 Q70 311 79 308 M141 48 Q150 51 159 48 M306 339 Q317 342 328 339" />
    </G>
    <G transform={`translate(210 200) scale(${growth}) translate(-210 -200)`}>
      <Ellipse cx="213" cy="224" rx={level >= 3 ? 168 : 148} ry={level >= 3 ? 112 : 96} fill={palette.deep} opacity=".24" />
      <Path d="M73 198 C64 158 112 120 173 124 C223 106 314 125 338 173 C363 220 322 283 249 294 C175 312 99 279 77 243 C68 228 67 213 73 198Z" fill={`url(#${shallowsId})`} />
      <Path d="M79 199 C70 162 114 128 174 132 C226 115 309 132 331 177 C350 218 315 274 248 286 C176 302 106 273 85 239" fill="none" stroke="#E7F5E9" strokeWidth="2" opacity=".6" />
      <Ellipse cx="216" cy="219" rx="105" ry="56" fill="#649D90" opacity=".18" />
      <Path d={lagoon ? 'M114 200 C116 157 178 142 230 151 C290 151 321 188 301 215 C290 220 282 207 269 192 C240 173 195 176 175 195 C159 209 157 230 135 229 C121 227 113 214 114 200Z' : 'M110 201 C105 168 150 143 191 148 C220 130 282 148 297 181 C334 211 300 241 262 252 C211 271 170 248 143 242 C121 233 109 221 110 201Z'} fill="#CEBD98" />
      <Path d={lagoon ? 'M114 194 C116 151 178 136 230 145 C290 145 321 182 301 209 C290 214 282 201 269 186 C240 167 195 170 175 189 C159 203 157 224 135 223 C121 221 113 208 114 194Z' : 'M110 195 C105 162 150 137 191 142 C220 124 282 142 297 175 C334 205 300 235 262 246 C211 265 170 242 143 236 C121 227 109 215 110 195Z'} fill={`url(#${sandId})`} />
      <Path d="M133 202 Q155 218 168 218 M259 228 Q279 225 289 215" fill="none" stroke="#FFF7E1" strokeWidth="2" strokeLinecap="round" opacity=".8" />
      {rocky ? <G>
        <Path d="M170 179 L187 122 L218 111 L249 163 L235 198 L193 203Z" fill="#8B9E94" />
        <Path d="M187 122 L218 111 L209 176 L170 179Z" fill="#A8B6A8" />
        <Path d="M218 111 L249 163 L235 198 L209 176Z" fill="#738C84" />
        <Path d="M251 190 L269 159 L287 188 L274 211Z" fill="#9AA99A" />
        <Palm x={156} y={188} scale={.65} />
      </G> : <>
        <Path d="M163 180 Q190 155 230 169 Q252 182 238 196 Q192 212 163 192Z" fill="#A9BC89" opacity=".5" />
        <Palm x={201} y={178} scale={1.12} />
        <Palm x={239} y={189} scale={.82} />
      </>}
      <G fill="#C4B690" opacity=".55"><Ellipse cx="152" cy="214" rx="4" ry="2" /><Ellipse cx="260" cy="212" rx="5" ry="2.5" /><Circle cx="174" cy="224" r="1.4" /></G>
      {(level >= 2 || lagoon) && <><Coral x={119} y={265} /><Coral x={143} y={274} color="#D1AA84" scale={.7} /><Coral x={300} y={247} color="#87A98D" /></>}
      {level >= 3 && <><Coral x={83} y={224} color="#7FAE96" scale={.7} /><Coral x={282} y={285} scale={.65} /></>}
      {level >= 4 && <><Palm x={167} y={194} scale={.7} /><Palm x={265} y={187} scale={.6} /></>}
    </G>
    {level >= 5 && <G><Ellipse cx="337" cy="112" rx="39" ry="23" fill="#D9EDDD" opacity=".6" /><Ellipse cx="337" cy="111" rx="27" ry="15" fill={`url(#${sandId})`} /><Palm x={336} y={107} scale={.47} /></G>}
    {level >= 6 && <G><Ellipse cx="78" cy="301" rx="41" ry="25" fill="#D9EDDD" opacity=".6" /><Ellipse cx="78" cy="298" rx="26" ry="15" fill={`url(#${sandId})`} /><Palm x={77} y={295} scale={.48} /></G>}
  </Svg>;
}
