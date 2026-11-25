import type { ReactNode } from 'react'

type PixelRoomScene = 'office' | 'studio' | 'meeting' | 'market'

type PixelPersonProps = {
  x: number
  y: number
  color?: string
  hair?: string
  flip?: boolean
  role?: 'producer' | 'artist' | 'market'
  scale?: number
}

export function PixelPerson({ x, y, color = '#496c68', hair = '#4a3d37', flip = false, role = 'producer', scale = .84 }: PixelPersonProps) {
  return <g className="pixel-person" transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`} aria-hidden="true">
    <ellipse cx="0" cy="1" rx="31" ry="8" fill="#392f29" opacity=".25" />
    <rect x="-22" y="-49" width="19" height="41" fill="#3f4b52" />
    <rect x="-22" y="-17" width="19" height="8" fill="#354047" />
    <rect x="4" y="-50" width="19" height="42" fill="#4b5960" />
    <rect x="4" y="-18" width="19" height="8" fill="#354047" />
    <rect x="-27" y="-12" width="26" height="12" fill="#302e32" />
    <rect x="2" y="-12" width="27" height="12" fill="#302e32" />
    <rect x="-25" y="-11" width="22" height="4" fill="#61564d" />
    <rect x="4" y="-11" width="23" height="4" fill="#61564d" />
    <rect x="-29" y="-105" width="57" height="60" fill="#3e3735" opacity=".35" />
    <rect x="-27" y="-103" width="53" height="58" fill={color} />
    <rect x="-33" y="-99" width="9" height="48" fill={color} />
    <rect x="24" y="-99" width="9" height="45" fill={color} />
    <rect x="16" y="-101" width="12" height="55" fill="#000000" opacity=".12" />
    <rect x="-27" y="-53" width="53" height="9" fill="#3c3b3d" />
    <rect x="-2" y="-52" width="12" height="8" fill="#c4a66d" />
    <rect x="-33" y="-58" width="11" height="13" fill="#e2b083" />
    <rect x="23" y="-57" width="11" height="13" fill="#e2b083" />
    <rect x="-13" y="-115" width="27" height="18" fill="#dba57c" />
    <rect x="-13" y="-111" width="27" height="7" fill="#c68e6c" />
    <rect x="-25" y="-146" width="51" height="39" fill="#4b3b35" />
    <rect x="-23" y="-144" width="47" height="36" fill="#e7b88d" />
    <rect x="13" y="-138" width="13" height="28" fill="#d79e75" />
    <rect x="-27" y="-134" width="7" height="14" fill="#d79e75" />
    <rect x="23" y="-134" width="7" height="14" fill="#d79e75" />
    <rect x="-26" y="-153" width="51" height="17" fill={hair} />
    <rect x="-30" y="-147" width="13" height="23" fill={hair} />
    <rect x="19" y="-148" width="14" height="20" fill={hair} />
    <rect x="-21" y="-158" width="22" height="8" fill={hair} />
    <rect x="4" y="-161" width="19" height="8" fill={hair} />
    <rect x="-17" y="-149" width="11" height="6" fill="#ffffff" opacity=".13" />
    <rect x="-13" y="-131" width="6" height="8" fill="#34323a" />
    <rect x="9" y="-131" width="6" height="8" fill="#34323a" />
    <rect x="-11" y="-130" width="2" height="3" fill="#ffffff" />
    <rect x="11" y="-130" width="2" height="3" fill="#ffffff" />
    <rect x="0" y="-126" width="5" height="6" fill="#cb8f69" />
    <rect x="-5" y="-116" width="12" height="3" fill="#a9675b" />
    <rect x="-18" y="-123" width="6" height="3" fill="#d9937f" />
    <rect x="15" y="-123" width="6" height="3" fill="#d9937f" />
    <path d="M-22-104l15 12-9 12-14-22zM22-104L7-92l9 12 14-22z" fill="#f0e6ce" />
    <rect x="-4" y="-96" width="9" height="22" fill="#a55d4f" />
    <path d="M-7-93l7 8 7-8-3 15H-4z" fill="#743f3b" />
    {role === 'producer' && <>
      <path d="M-17-101L0-79l17-22" fill="none" stroke="#d8cba9" strokeWidth="3" />
      <rect x="5" y="-86" width="17" height="23" fill="#eee7d4" />
      <rect x="8" y="-82" width="11" height="4" fill="#597e7a" />
      <rect x="8" y="-74" width="8" height="3" fill="#9b927d" />
    </>}
    {role === 'artist' && <>
      <rect x="-37" y="-84" width="23" height="18" fill="#e8d9b5" />
      <path d="M-34-77h15M-34-72h10" stroke="#74938a" strokeWidth="3" />
      <rect x="29" y="-111" width="4" height="26" fill="#d99a57" />
      <path d="M29-111l2-7 2 7z" fill="#eee0bd" />
    </>}
    {role === 'market' && <>
      <path d="M-18-103L0-78l18-25" fill="none" stroke="#d77051" strokeWidth="4" />
      <rect x="5" y="-87" width="18" height="25" fill="#f1d59c" />
      <path d="M9-78h10M9-73h7" stroke="#a66849" strokeWidth="3" />
    </>}
  </g>
}

function Cloud({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`} fill="#e9f4e8" opacity=".86">
    <rect x="0" y="18" width="116" height="24" /><rect x="18" y="4" width="74" height="24" /><rect x="38" y="-8" width="38" height="20" />
    <rect x="8" y="42" width="96" height="7" fill="#b9dfe0" opacity=".45" />
  </g>
}

function IsoBox({ x, y, width, depth, height, top, left, right }: {
  x: number; y: number; width: number; depth: number; height: number; top: string; left: string; right: string
}) {
  const half = width / 2
  const halfDepth = depth / 2
  return <g>
    <path d={`M${x - half} ${y}L${x} ${y - halfDepth} ${x + half} ${y} ${x} ${y + halfDepth}z`} fill={top} />
    <path d={`M${x - half} ${y}L${x} ${y + halfDepth}v${height}L${x - half} ${y + height}z`} fill={left} />
    <path d={`M${x} ${y + halfDepth}L${x + half} ${y}v${height}L${x} ${y + halfDepth + height}z`} fill={right} />
    <path d={`M${x - half} ${y}L${x} ${y - halfDepth} ${x + half} ${y}`} fill="none" stroke="#f3d69c" strokeWidth="3" opacity=".45" />
  </g>
}

function Plant({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cx="0" cy="3" rx="35" ry="10" fill="#5d4e38" opacity=".2" />
    <image className="asset-sprite" href="/assets/vendor/pixel-office/LARGE_PLANT.png" x="-48" y="-96" width="96" height="96" />
  </g>
}

function RoomShell({ children, studio = false }: { children: ReactNode; studio?: boolean }) {
  return <>
    <defs>
      <pattern id="iso-floor" width="160" height="80" patternUnits="userSpaceOnUse">
        <rect width="160" height="80" fill={studio ? '#c5a879' : '#c6a06e'} />
        <path d="M0 0l80 40L0 80M80 0l80 40-80 40M160 0L80 40l80 40" fill="none" stroke={studio ? '#ae8e65' : '#ad875e'} strokeWidth="3" />
        <path d="M18 19l44 22M104 43l38 19" stroke={studio ? '#d4b98c' : '#d7b783'} strokeWidth="3" />
      </pattern>
      <clipPath id="left-wall"><path d="M80 310L600 105V-70L80 135z" /></clipPath>
      <clipPath id="right-wall"><path d="M600 105L1120 310V135L600-70z" /></clipPath>
      <clipPath id="room-floor"><path d="M600 105L1120 310 600 525 80 310z" /></clipPath>
    </defs>
    <rect width="1200" height="560" fill="#9ed7e2" />
    <Cloud x={80} y={66} scale={1.2} /><Cloud x={930} y={46} scale={.85} /><Cloud x={515} y={20} scale={.62} />
    <path d="M80 310L600 525v27L80 337z" fill="#4b9cb5" />
    <path d="M600 525L1120 310v27L600 552z" fill="#347f9e" />
    <path d="M80 310L600 525 1120 310" fill="none" stroke="#77c2d2" strokeWidth="9" />
    <path d="M110 343L600 543 1090 343" fill="none" stroke="#2e708e" strokeWidth="5" opacity=".45" />
    <path d="M80 310L600 105V-70L80 135z" fill={studio ? '#c7d0b5' : '#dfcba6'} />
    <path d="M600 105L1120 310V135L600-70z" fill={studio ? '#b6c3ac' : '#cdbb96'} />
    <path d="M80 310L600 105 1120 310" fill="none" stroke="#82664b" strokeWidth="10" />
    <g clipPath="url(#room-floor)"><rect x="50" y="80" width="1100" height="470" fill="url(#iso-floor)" /></g>
    {children}
  </>
}

function StoryPanel({ x, y, color }: { x: number; y: number; color: string }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect width="86" height="67" fill="#735a43" /><rect x="6" y="6" width="74" height="55" fill="#f1e3bd" />
    <rect x="10" y="10" width="66" height="47" fill={color} />
    <path d="M10 45l20-20 15 13 14-15 17 19v15H10z" fill="#6e9586" />
    <circle cx="60" cy="22" r="6" fill="#e5c67c" />
    <path d="M20 51h45M20 56h31" stroke="#e6d4a9" strokeWidth="3" />
  </g>
}

function IsoDesk({ x, y, kind = 'monitor' }: { x: number; y: number; kind?: 'monitor' | 'lightbox' }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-89 0L0-43 89 0 0 43z" fill="#6f513d" />
    <path d="M-89 0L0 43v13L-89 13z" fill="#8b6245" />
    <path d="M0 43L89 0v13L0 56z" fill="#76533e" />
    <rect x="-65" y="12" width="11" height="57" fill="#6c4d3b" /><rect x="58" y="12" width="11" height="57" fill="#6c4d3b" />
    {kind === 'lightbox' ? <>
      <path d="M-60-7L-5-37 48-9-7 21z" fill="#394e4c" /><path d="M-54-6L-5-32 42-8-7 15z" fill="#c9eee1" />
      <path d="M-45-4L-17-18 9-8-12 7zM17 1L35-8 38-3 20 5z" fill="#7daaa0" />
      <path d="M-48-6L-11-25 29-4-8 16z" fill="#f3f4d2" opacity=".82" />
    </> : <>
      <path d="M-38-15v-63l62-14v64z" fill="#374648" /><path d="M-31-22v-48l48-11v49z" fill="#a9d6c8" />
      <path d="M-24-34h29M-24-25h35M-24-16h18" stroke="#6e9b91" strokeWidth="4" />
      <path d="M-4-14v20M-19 8h30" stroke="#425452" strokeWidth="7" /><path d="M-7-69l-8 6 33 8 10-8z" fill="#d9b56c" />
    </>}
    <path d="M47-5l28-14 14 7-28 15z" fill="#efe3bf" /><path d="M50-4l23-11M50 0l16-8" stroke="#ad9e80" strokeWidth="2" />
    <image className="asset-sprite" href="/assets/vendor/pixel-office/COFFEE.png" x="70" y="-22" width="16" height="16" />
    <path d="M-16-53l-4-34 38-9 4 34z" fill="#5b706a" /><path d="M-9-82l31-8 4 25-34 9z" fill="#71877c" />
    <path d="M-4-87v13M13-90v13M24-92v13" stroke="#4b615a" strokeWidth="5" />
  </g>
}

function Robot({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x="-22" y="-42" width="44" height="36" fill="#d9a72f" /><rect x="-17" y="-37" width="34" height="26" fill="#f2cf58" />
    <rect x="-12" y="-30" width="8" height="9" fill="#3f5652" /><rect x="5" y="-30" width="8" height="9" fill="#3f5652" />
    <rect x="-8" y="-15" width="17" height="4" fill="#a97627" /><rect x="-3" y="-49" width="6" height="8" fill="#657a70" />
    <rect x="-29" y="-36" width="7" height="21" fill="#c18d28" /><rect x="22" y="-36" width="7" height="21" fill="#c18d28" />
    <rect x="-17" y="-5" width="12" height="8" fill="#6c6652" /><rect x="5" y="-5" width="12" height="8" fill="#6c6652" />
  </g>
}

function Briefcase({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-7-29v-9h14v9" fill="none" stroke="#513d31" strokeWidth="5" />
    <rect x="-18" y="-29" width="36" height="29" fill="#76523b" />
    <rect x="-13" y="-24" width="26" height="19" fill="#9a6c49" />
    <path d="M-3-29v29M-18-20h36" stroke="#c39a62" strokeWidth="3" />
    <rect x="-4" y="-19" width="8" height="7" fill="#d7b66e" />
  </g>
}

function MaterialCrate({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <ellipse cx="0" cy="2" rx="24" ry="7" fill="#5d4e38" opacity=".22" />
    <image className="asset-sprite" href="/assets/vendor/pixel-adventure/Items/Boxes/Box1/Idle.png" x="-20" y="-34" width="40" height="34" />
  </g>
}

function iso(u: number, v: number, z = 0) {
  return { x: 600 + (u - v) * 104, y: 105 + (u + v) * 41 - z }
}

function OfficeRoom() {
  const deskAt = (u: number, v: number, kind: 'monitor' | 'lightbox' = 'monitor') => {
    const point = iso(u, v)
    return <IsoDesk x={point.x} y={point.y} kind={kind} />
  }
  const personAt = (u: number, v: number, props: Omit<PixelPersonProps, 'x' | 'y'>) => {
    const point = iso(u, v)
    return <PixelPerson x={point.x} y={point.y} {...props} />
  }
  const desks: { u: number; v: number; kind: 'monitor' | 'lightbox' }[] = [
    { u: 1.45, v: 1.35, kind: 'monitor' },
    { u: 3.45, v: 1.35, kind: 'lightbox' },
    { u: 1.45, v: 3.25, kind: 'monitor' },
    { u: 3.45, v: 3.25, kind: 'lightbox' },
  ]
  const items: { y: number; node: ReactNode }[] = [
    { y: iso(.5, 2.1).y, node: <Plant x={iso(.5, 2.1).x} y={iso(.5, 2.1).y} scale={.92} /> },
    { y: iso(4.55, .55).y, node: <g transform={`translate(${iso(4.55, .55).x} ${iso(4.55, .55).y})`}><rect width="58" height="70" fill="#6d7e76" /><rect x="8" y="8" width="42" height="54" fill="#b9d6d3" /><rect x="19" y="0" width="20" height="9" fill="#485d57" /><path d="M19 31h20v16H19z" fill="#7fa9b5" /></g> },
    { y: iso(4.55, 1.45).y, node: <g><IsoBox x={iso(4.55, 1.45).x} y={iso(4.55, 1.45).y} width={78} depth={62} height={78} top="#8b9a8a" left="#65786d" right="#4f635c" /><rect x={iso(4.55, 1.45).x - 20} y={iso(4.55, 1.45).y - 51} width="40" height="28" fill="#3f5550" /><rect x={iso(4.55, 1.45).x - 14} y={iso(4.55, 1.45).y - 45} width="28" height="16" fill="#b9d4c0" /></g> },
    { y: iso(1.45, .85).y, node: personAt(1.45, .85, { color: '#987252', hair: '#393139', role: 'producer', scale: .78 }) },
    { y: iso(3.45, .85).y, node: personAt(3.45, .85, { color: '#617b65', hair: '#574237', role: 'artist', scale: .76 }) },
    { y: iso(1.45, 2.75).y, node: personAt(1.45, 2.75, { color: '#536f70', hair: '#4a3d37', role: 'producer', scale: .78 }) },
    { y: iso(3.45, 2.75).y, node: personAt(3.45, 2.75, { color: '#6b7e9b', hair: '#353139', role: 'artist', scale: .78 }) },
    ...desks.map((desk, index) => ({ y: iso(desk.u, desk.v).y, node: <g>{deskAt(desk.u, desk.v, desk.kind)}{index === 0 && <Robot x={iso(desk.u, desk.v).x - 34} y={iso(desk.u, desk.v).y - 11} />}</g> })),
    { y: iso(3.45, 3.25).y + 66, node: <Briefcase x={iso(3.45, 3.25).x + 78} y={iso(3.45, 3.25).y + 66} /> },
    { y: iso(4.55, 2.55).y, node: <IsoBox x={iso(4.55, 2.55).x} y={iso(4.55, 2.55).y} width={132} depth={68} height={102} top="#b79a72" left="#8a7358" right="#6f5d49" /> },
    { y: iso(4.3, 4.2).y, node: <Plant x={iso(4.3, 4.2).x} y={iso(4.3, 4.2).y} scale={.82} /> },
  ]
  return <RoomShell>
    <g clipPath="url(#left-wall)">
      <g transform="translate(80 310) skewY(-21.5)">
        <rect x="34" y="-174" width="292" height="132" fill="#80674f" />
        <rect x="45" y="-163" width="270" height="110" fill="#86b9bd" />
        <path d="M45-79l47-37 36 22 38-30 46 32 44-20 59 31v24H45z" fill="#6f9b8d" />
        <path d="M45-61l52-17 43 18 48-12 50 19 77-17v8H45z" fill="#9db89b" />
        <rect x="45" y="-163" width="270" height="110" fill="none" stroke="#ead9b8" strokeWidth="8" />
        <path d="M180-163v110M45-108h270" stroke="#ead9b8" strokeWidth="8" />
        <rect x="350" y="-141" width="182" height="103" fill="#735b43" /><rect x="359" y="-132" width="164" height="85" fill="#e6d6ae" />
        <path d="M373-115h66M373-101h103M373-87h83M373-73h47" stroke="#8e9b7e" strokeWidth="6" />
        <rect x="373" y="-122" width="13" height="10" fill="#c77558" /><rect x="392" y="-122" width="13" height="10" fill="#d8b85b" />
      </g>
    </g>
    <g clipPath="url(#right-wall)">
      <g transform="translate(600 105) skewY(21.5)">
        <rect x="20" y="-158" width="222" height="116" fill="#80674f" />
        <rect x="30" y="-148" width="202" height="96" fill="#8fb9bb" />
        <path d="M30-76l43-29 31 18 42-25 46 27 40-16v24H30z" fill="#759a89" />
        <rect x="30" y="-148" width="202" height="96" fill="none" stroke="#ead9b8" strokeWidth="8" />
        <path d="M131-148v96M30-100h202" stroke="#ead9b8" strokeWidth="8" />
        <rect x="294" y="-143" width="196" height="116" fill="#71563e" /><rect x="305" y="-132" width="174" height="94" fill="#b68d5d" />
        {[0, 1, 2, 3].map((row) => <g key={row} transform={`translate(315 ${-119 + row * 23})`}>
          {[0, 1, 2, 3, 4, 5].map((column) => <rect key={column} x={column * 25} width="18" height="17" fill={['#bd735b', '#5c847a', '#d1aa5f', '#718ca0'][(row + column) % 4]} />)}
        </g>)}
        <rect x="255" y="-72" width="30" height="48" fill="#e4d6b3" /><circle cx="270" cy="-58" r="10" fill="#8b9d87" /><path d="M270-58v-7l6 4" stroke="#e4d6b3" strokeWidth="3" />
        <g transform="translate(322 -77)"><path d="M0 22h73v10H0zM12 32v28M61 32v28" fill="#7d6044" /><path d="M17 0h12v22H17zM36-8h15v30H36z" fill="#d0a74f" /><path d="M17 0l6-8 6 8zM36-8l8-9 7 9z" fill="#e4c66c" /></g>
      </g>
    </g>
    {items.sort((a, b) => a.y - b.y).map((item, index) => <g key={index}>{item.node}</g>)}
  </RoomShell>
}

function StudioRoom() {
  const deskAt = (u: number, v: number, kind: 'monitor' | 'lightbox' = 'monitor') => {
    const point = iso(u, v)
    return <IsoDesk x={point.x} y={point.y} kind={kind} />
  }
  const personAt = (u: number, v: number, props: Omit<PixelPersonProps, 'x' | 'y'>) => {
    const point = iso(u, v)
    return <PixelPerson x={point.x} y={point.y} {...props} />
  }
  const desks: { u: number; v: number; kind: 'monitor' | 'lightbox' }[] = [
    { u: 1.1, v: 1.1, kind: 'lightbox' }, { u: 2.6, v: 1.1, kind: 'monitor' }, { u: 4.1, v: 1.1, kind: 'lightbox' },
    { u: 1.1, v: 3.3, kind: 'monitor' }, { u: 2.6, v: 3.3, kind: 'lightbox' }, { u: 4.1, v: 3.3, kind: 'monitor' },
  ]
  const items: { y: number; node: ReactNode }[] = [
    ...desks.map((desk) => ({ y: iso(desk.u, desk.v).y, node: deskAt(desk.u, desk.v, desk.kind) })),
    { y: iso(.55, .55).y, node: <g transform={`translate(${iso(.55, .55).x - 46} ${iso(.55, .55).y})`}><path d="M0 0h92v126H0z" fill="#6e5942" /><path d="M9 11h74v104H9z" fill="#c1a172" />{[0, 1, 2, 3].map((index) => <g key={index} transform={`translate(17 ${24 + index * 23})`}><rect width="58" height="13" fill={index % 2 ? '#739287' : '#d5b36f'} /><rect x="47" width="7" height="13" fill="#eee1bb" /></g>)}</g> },
    { y: iso(1.3, .75).y, node: <MaterialCrate x={iso(1.3, .75).x} y={iso(1.3, .75).y} /> },
    { y: iso(4.25, 4.15).y, node: <Plant x={iso(4.25, 4.15).x} y={iso(4.25, 4.15).y} scale={.8} /> },
    { y: iso(1, 4.65).y, node: personAt(1, 4.65, { color: '#536f70', hair: '#4a3d37', role: 'artist', scale: .8 }) },
    { y: iso(3, 4.55).y, node: personAt(3, 4.55, { color: '#8d6357', hair: '#353139', flip: true, role: 'producer', scale: .82 }) },
    { y: iso(4.15, 2.3).y, node: personAt(4.15, 2.3, { color: '#6b7e9b', hair: '#574237', role: 'artist', scale: .74 }) },
    { y: iso(4.55, 2).y, node: <g><IsoBox x={iso(4.55, 2).x} y={iso(4.55, 2).y} width={108} depth={64} height={62} top="#c9a474" left="#98734f" right="#76583e" /><path d={`M${iso(4.55, 2).x - 54} ${iso(4.55, 2).y - 25}h108v16h-108z`} fill="#5f7770" /><path d={`M${iso(4.55, 2).x - 43} ${iso(4.55, 2).y - 39}h86v16h-86z`} fill="#d6dfc5" /><path d={`M${iso(4.55, 2).x - 33} ${iso(4.55, 2).y - 34}h64M${iso(4.55, 2).x - 33} ${iso(4.55, 2).y - 28}h42`} stroke="#8a9e8b" strokeWidth="3" /></g> },
  ]
  return <RoomShell studio>
    <g clipPath="url(#left-wall)">
      <g transform="translate(80 310) skewY(-21.5)">
        <rect x="32" y="-160" width="454" height="118" fill="#6f604b" /><rect x="43" y="-149" width="432" height="96" fill="#ae9369" />
        {[0, 1, 2, 3].map((index) => <g key={index} transform={`translate(${52 + index * 103} ${-139 + index * 2}) scale(${1.02 - index * .085})`}><StoryPanel x={0} y={0} color={['#83b4a5', '#cf956c', '#91a6b2', '#c7aa70'][index]} /></g>)}
        <rect x="40" y="-28" width="440" height="8" fill="#5b5143" />
      </g>
    </g>
    <g clipPath="url(#right-wall)">
      <g transform="translate(600 105) skewY(21.5)">
        <rect x="42" y="-151" width="426" height="115" fill="#6d5c47" /><rect x="54" y="-139" width="402" height="91" fill="#a68a63" />
        <path d="M64-124h382M64-68h382" stroke="#5d5142" strokeWidth="7" />
        {[0, 1, 2, 3, 4].map((index) => <g key={index} transform={`translate(${54 + index * 82} ${-137 + (4 - index) * 3}) scale(${.72 + index * .075})`}>
          <path d="M0 0h57v78H0z" fill="#b9ddd0" opacity=".78" />
          <path d="M8 16h40v7H8zM8 33h28v6H8zM8 49h40v7H8z" fill={['#bc6d57', '#5c8c83', '#d0a958', '#7188a1', '#a46d8e'][index]} />
          <rect x="23" y="0" width="10" height="8" fill="#514b41" />
        </g>)}
      </g>
    </g>
    {items.sort((a, b) => a.y - b.y).map((item, index) => <g key={index}>{item.node}</g>)}
  </RoomShell>
}

function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <rect x="-7" y="-62" width="14" height="70" fill="#75684d" />
    <rect x="-30" y="-98" width="60" height="42" fill="#6e9b73" />
    <rect x="-43" y="-82" width="86" height="35" fill="#7da878" />
    <rect x="-24" y="-119" width="48" height="34" fill="#85ac7c" />
    <rect x="8" y="-108" width="31" height="29" fill="#78a474" />
    <rect x="-16" y="-104" width="21" height="13" fill="#9bbb83" />
  </g>
}

function MeetingPaper({ x, y, width, height, color }: { x: number; y: number; width: number; height: number; color: string }) {
  const nearScale = .35 + (y - 250) * .65 / 270
  const farScale = .35 + (y - height - 250) * .65 / 270
  const ratio = farScale / nearScale
  const farWidth = width * ratio
  const farCenter = 600 + (x + width / 2 - 600) * ratio
  return <path data-meeting-paper d={`M${x} ${y}H${x + width}L${farCenter + farWidth / 2} ${y - height}H${farCenter - farWidth / 2}z`} fill={color} />
}

function MeetingRoom() {
  const chairs = [0.08, 0.25, 0.43, 0.62, 0.82, 0.98].map((depth) => ({
    y: 250 + depth * 230,
    left: 510 - depth * 245,
    right: 690 + depth * 245,
    size: .55 + depth * .45,
  }))
  const floorRows = [244, 270, 305, 350, 405, 472]
  const floorColumns = Array.from({ length: 13 }, (_, index) => -120 + index * 120)
  const floorBackLeft = 425.64
  const floorBackRight = 774.36
  const floorPath = `M${floorBackLeft} 228H${floorBackRight}L1200 560H0z`
  return <>
    <defs><clipPath id="meeting-floor"><path d={floorPath} /></clipPath></defs>
    <rect width="1200" height="560" fill="#b8d7d2" />
    <path d="M0 142h1200v74H0z" fill="#82b7aa" />
    <path d="M0 191h1200v55H0z" fill="#9bc6bd" />
    <path d="M0 216h1200v30H0z" fill="#afd1c6" />
    <Tree x={72} y={230} scale={1.12} /><Tree x={244} y={218} scale={.88} /><Tree x={405} y={226} scale={.72} />
    <Tree x={790} y={222} scale={.76} /><Tree x={972} y={218} scale={1.02} /><Tree x={1134} y={232} scale={.9} />
    <rect x="0" y="0" width="1200" height="228" fill="#d8ddca" />
    <path d="M0 0h1200v34H0z" fill="#eee9d6" /><path d="M0 34h1200" stroke="#b9b9a4" strokeWidth="6" />
    <rect x="487" y="67" width="226" height="117" fill="#596a64" /><rect x="500" y="80" width="200" height="91" fill="#d8e3ce" />
    <path d="M521 116h155M521 139h119" stroke="#849d8e" strokeWidth="7" />
    <rect x="516" y="93" width="12" height="12" fill="#c8795a" /><rect x="516" y="116" width="12" height="12" fill="#d7b65f" />
    <rect x="565" y="184" width="70" height="14" fill="#43534e" /><rect x="593" y="198" width="14" height="32" fill="#43534e" />
    <path d={`M0 228H${floorBackLeft}L0 560zM${floorBackRight} 228H1200L1200 560z`} fill="#9eb5a5" />
    <path data-meeting-floor d={floorPath} fill="#c4a277" />
    <g data-meeting-floor-seams clipPath="url(#meeting-floor)">
      <path d={floorColumns.map((x) => `M600 92L${x} 560`).join('')} stroke="#aa875f" strokeWidth="3" />
      {floorRows.map((y) => <path key={y} d={`M0 ${y}H1200`} stroke="#aa875f" strokeWidth="3" />)}
    </g>
    <path d={`M${floorBackLeft} 228L0 560M${floorBackRight} 228L1200 560`} fill="none" stroke="#92734f" strokeWidth="5" />
    <path d="M0 548H1200V560H0z" fill="#4b9cb5" />
    {chairs.map(({ y, left, right, size }, index) => <g key={index} data-meeting-chair>
      <g transform={`translate(${left - 37 * size} ${y + 15 * size}) scale(${size})`}>
        <rect x="-23" y="-34" width="46" height="40" fill="#405a54" /><rect x="-18" y="-29" width="36" height="29" fill="#57736b" />
        <rect x="-28" y="1" width="56" height="14" fill="#405a54" /><rect x="-19" y="15" width="8" height="25" fill="#334944" /><rect x="11" y="15" width="8" height="25" fill="#334944" />
        <path d="M-19 40v8M11 40v8M-27 48h8M8 48h8" stroke="#33443f" strokeWidth="4" />
      </g>
      <g transform={`translate(${right + 37 * size} ${y + 15 * size}) scale(${size})`}>
        <rect x="-23" y="-34" width="46" height="40" fill="#405a54" /><rect x="-18" y="-29" width="36" height="29" fill="#57736b" />
        <rect x="-28" y="1" width="56" height="14" fill="#405a54" /><rect x="-19" y="15" width="8" height="25" fill="#334944" /><rect x="11" y="15" width="8" height="25" fill="#334944" />
        <path d="M-19 40v8M11 40v8M-27 48h8M8 48h8" stroke="#33443f" strokeWidth="4" />
      </g>
    </g>)}
    <g data-meeting-person><PixelPerson x={170} y={526} color="#536f70" hair="#4b3b34" role="producer" scale={.96} /></g>
    <g data-meeting-person><PixelPerson x={1030} y={526} color="#987252" hair="#393339" flip role="artist" scale={.96} /></g>
    <g transform="translate(1030 475) scale(.55)">
      <rect width="73" height="86" fill="#6f563f" /><rect x="9" y="11" width="55" height="64" fill="#b89666" />
      <path d="M25 12V-35M44 12v-52M58 12V-24" stroke="#50735c" strokeWidth="9" />
      <path d="M25-25L11-10 25 2 40-10zM44-35L25-17l19 13 19-17zM58-18L45-4l13 11 17-15z" fill="#6e9473" />
    </g>
    <g data-meeting-table>
      <path d="M240 520H960V534H240z" fill="#654636" />
      <path d="M270 534V548M930 534V548" stroke="#543d31" strokeWidth="12" />
      <path data-meeting-tabletop d="M240 520L960 520 726 250H474z" fill="#8b6044" />
      <path d="M240 520L960 520 726 250H474z" fill="none" stroke="#543d31" strokeWidth="5" />
      {chairs.slice(2).map(({ y, size }, index) => {
        const paperY = y + 10 * size
        const scale = .35 + (paperY - 250) * .65 / 270
        const width = 42 * scale
        const leftEdge = 240 + (520 - paperY) * 234 / 270
        const rightEdge = 960 - (520 - paperY) * 234 / 270
        return <g key={index}>
          <MeetingPaper x={leftEdge + 26 * scale} y={paperY} width={width} height={24 * scale} color="#ede2c4" />
          <MeetingPaper x={rightEdge - 26 * scale - width} y={paperY} width={width} height={24 * scale} color="#d8cba9" />
        </g>
      })}
      <g transform="translate(600 305)">
        <rect x="-13" y="-21" width="26" height="31" fill="#e8dfc4" /><path d="M-6-9h12M-6-3h8" stroke="#809687" strokeWidth="3" />
        <rect x="-16" y="10" width="32" height="17" fill="#6f4d39" /><rect x="-12" y="14" width="24" height="4" fill="#c7ad82" />
      </g>
    </g>
  </>
}

function MarketCard({ x, y, color, rotate = 0 }: { x: number; y: number; color: string; rotate?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <rect x="-4" y="-4" width="126" height="88" fill="#6c513b" opacity=".35" />
    <rect width="118" height="80" fill="#f0dfb7" />
    <rect x="8" y="8" width="102" height="20" fill={color} />
    <path d="M17 40h77M17 51h60M17 62h70" stroke="#a29273" strokeWidth="5" />
    <rect x="51" y="-9" width="17" height="13" fill="#c66f53" /><rect x="55" y="-6" width="9" height="6" fill="#e8c681" />
  </g>
}

function MarketPoster({ x, y, color }: { x: number; y: number; color: string }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x="-4" y="-4" width="116" height="144" fill="#6c513b" opacity=".35" />
    <rect width="108" height="136" fill="#f0dfb7" /><rect x="8" y="8" width="92" height="94" fill={color} />
    <circle cx="70" cy="34" r="13" fill="#ebce83" /><path d="M8 82l29-32 21 20 18-24 16 28v28H8z" fill="#608c7c" />
    <path d="M20 116h68M20 126h45" stroke="#aa9572" strokeWidth="5" />
    <rect x="44" y="-9" width="19" height="13" fill="#c66f53" />
  </g>
}

function MarketRoom() {
  return <>
    <rect width="1200" height="560" fill="#9ed7e2" />
    <Cloud x={85} y={62} scale={1.15} /><Cloud x={952} y={48} scale={.82} />
    <path d="M174 463L600 565 1030 463 600 361z" fill="#4b9cb5" />
    <path d="M174 463L600 565v18L174 481zM600 565L1030 463v18L600 583z" fill="#347f9e" />
    <path d="M174 463L600 565 1030 463" fill="none" stroke="#77c2d2" strokeWidth="8" />
    <path d="M235 431v99M965 431v99" stroke="#73573e" strokeWidth="18" />
    <path d="M235 431l24 17v99l-24-17zM965 431l-24 17v99l24-17z" fill="#5d4937" />
    <rect x="218" y="66" width="748" height="374" fill="#6f523b" />
    <rect x="232" y="80" width="720" height="346" fill="#b88c5b" />
    <rect x="244" y="92" width="696" height="322" fill="#c9a06c" />
    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((row) => <g key={row}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((column) => <rect key={column} x={253 + column * 56 + (row % 2) * 13} y={100 + row * 34} width="4" height="4" fill="#a67e50" opacity=".6" />)}
    </g>)}
    <path d="M232 80L966 80 966 426 232 426z" fill="none" stroke="#8b6746" strokeWidth="6" />
    <MarketCard x={274} y={132} color="#c87558" rotate={-3} />
    <MarketCard x={420} y={119} color="#5b8c83" rotate={2} />
    <MarketPoster x={577} y={111} color="#c77a59" />
    <MarketCard x={755} y={125} color="#d1aa5d" rotate={-2} />
    <MarketCard x={286} y={276} color="#6d8da0" rotate={2} />
    <MarketPoster x={430} y={244} color="#628f83" />
    <g transform="translate(591 258)">
      <rect x="-5" y="-5" width="153" height="126" fill="#6c513b" opacity=".35" /><rect width="143" height="116" fill="#eee1bd" />
      <path d="M18 88V56M40 88V36M62 88V66M84 88V23M106 88V48M128 88V15" stroke="#6e9588" strokeWidth="13" />
      <path d="M14 91h120" stroke="#9e8c6c" strokeWidth="5" /><rect x="56" y="-9" width="22" height="13" fill="#c66f53" />
    </g>
    <MarketCard x={783} y={276} color="#a3718a" rotate={3} />
    <g transform="translate(988 272)">
      <path d="M0 0h132v17H0zM0 56h132v17H0zM0 112h132v17H0z" fill="#c59c68" />
      <path d="M9 0v145M123 0v145" stroke="#7f6043" strokeWidth="11" />
      {[0, 1, 2, 3, 4, 5].map((index) => <g key={index} transform={`translate(${21 + (index % 3) * 34} ${19 + Math.floor(index / 3) * 56})`}>
        <rect width="26" height="32" fill={['#5a857c', '#bf7659', '#d0a75d'][index % 3]} /><rect x="4" y="5" width="18" height="6" fill="#eddbb1" /><circle cx="13" cy="21" r="5" fill="#e5d2a9" />
      </g>)}
    </g>
    <g transform="translate(1042 412)">
      <path d="M0 0h94v78H0z" fill="#a77c51" /><path d="M0 0h94v15H0z" fill="#c39a64" /><path d="M47 0v78" stroke="#7e5d3e" strokeWidth="6" />
      <rect x="24" y="27" width="46" height="23" fill="#eee0bc" /><path d="M32 35h30M32 43h20" stroke="#a28e6d" strokeWidth="4" />
    </g>
    <Robot x={1100} y={500} />
    <PixelPerson x={507} y={520} color="#987252" hair="#393139" flip role="market" scale={.78} />
    <PixelPerson x={856} y={529} color="#536f70" hair="#4a3d37" role="producer" scale={.84} />
    <g transform="translate(154 382)">
      <path d="M0 0h65v72H0z" fill="#b87a53" /><path d="M5 5h55v62H5z" fill="#d49a68" />
      <path d="M12 20h41M12 32h28M12 44h35" stroke="#f0d7a3" strokeWidth="5" />
      <path d="M-8 72h81v12H-8zM24 84v33M50 84v33" fill="#73573e" />
    </g>
  </>
}

export function PixelRoom({ scene }: { scene: PixelRoomScene }) {
  const labels: Record<PixelRoomScene, string> = {
    office: '开罗游戏风等距动画公司办公室，接待台、经营看板、书架与蓝色底座',
    studio: '开罗游戏风等距动画工作室，整齐的透写台、显示器、分镜板与赛璐璐片架',
    meeting: '开罗像素风长会议室，玻璃幕墙、长桌与座椅沿纵深规则排列',
    market: '开罗像素风发行与市场公告板，钉有企划卡、海报、趋势图与媒体包装',
  }
  return <svg className="pixel-room" viewBox="0 0 1200 560" role="img" aria-label={labels[scene]} shapeRendering="crispEdges" preserveAspectRatio="xMidYMid slice">
    {scene === 'office' && <OfficeRoom />}
    {scene === 'studio' && <StudioRoom />}
    {scene === 'meeting' && <MeetingRoom />}
    {scene === 'market' && <MarketRoom />}
  </svg>
}
