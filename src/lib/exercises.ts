import raw from '../data/musclewiki.txt?raw'
import type { Equipment, Exercise } from './types'

// Catálogo de ejercicios importado de MuscleWiki (https://musclewiki.com/es-es): solo datos factuales
// (nombre, músculos, equipamiento, dificultad, mecánica). Las instrucciones técnicas de MuscleWiki no se copian;
// cada ejercicio enlaza a su página original para ver vídeo y técnica. Las indicaciones propias de ATHLETIQ
// por patrón de movimiento son orientativas y están escritas por nosotros.

export const MUSCLE_LABEL: Record<string, string> = {
  pe: 'Pecho', do: 'Dorsales', em: 'Espalda media', tp: 'Trapecio', lu: 'Zona lumbar',
  hf: 'Deltoides anterior', hl: 'Deltoides lateral', hp: 'Deltoides posterior',
  bi: 'Bíceps', tr: 'Tríceps', an: 'Antebrazos', cu: 'Cuádriceps', is: 'Isquiotibiales',
  gl: 'Glúteos', ge: 'Gemelos', ad: 'Aductores', ab: 'Abdominales', ob: 'Oblicuos',
}
export const MUSCLES = Object.keys(MUSCLE_LABEL)

const EQUIP: Equipment[] = ['barbell', 'bodyweight', 'dumbbells', 'machine', 'cables', 'kettlebells', 'band', 'smith-machine', 'plate', 'trx']
export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barra', bodyweight: 'Peso corporal', dumbbells: 'Mancuernas', machine: 'Máquina', cables: 'Polea',
  kettlebells: 'Kettlebell', band: 'Banda', 'smith-machine': 'Máquina Smith', plate: 'Disco', trx: 'TRX', other: 'Otro',
}
const DIFF = ['beginner', 'beginner', 'intermediate', 'advanced'] as const // MuscleWiki: Beginner, Novice, Intermediate, Advanced
export const DIFFICULTY_LABEL = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' }

/** Incremento mínimo realista por equipamiento (kg). Configurable por ejercicio. */
const INCREMENT: Record<Equipment, number> = {
  barbell: 2.5, 'smith-machine': 2.5, dumbbells: 2, kettlebells: 4, machine: 5, cables: 2.5, plate: 2.5,
  bodyweight: 0, band: 0, trx: 0, other: 2.5,
}

export const PATTERN_LABEL: Record<string, string> = {
  horizontal_push: 'Empuje horizontal', vertical_push: 'Empuje vertical', horizontal_pull: 'Tracción horizontal',
  vertical_pull: 'Tracción vertical', squat: 'Sentadilla / dominante de rodilla', lunge: 'Zancada / unilateral',
  hinge: 'Bisagra de cadera', hip_extension: 'Extensión de cadera', knee_flexion: 'Flexión de rodilla',
  knee_extension: 'Extensión de rodilla', elbow_flexion: 'Flexión de codo', elbow_extension: 'Extensión de codo',
  lateral_raise: 'Elevación lateral', rear_delt: 'Deltoides posterior', shrug: 'Elevación escapular',
  calf: 'Flexión plantar', core_flexion: 'Flexión de tronco', core_anti: 'Antiextensión / antirrotación',
  core_rotation: 'Rotación', hip_abduction: 'Abducción de cadera', hip_adduction: 'Aducción de cadera',
  fly: 'Aperturas', pullover: 'Pullover', wrist: 'Muñeca', carry: 'Acarreo', other: 'Otro',
}

function inferPattern(slug: string, prim: string[]): string {
  const s = slug
  const has = (...k: string[]) => k.some((x) => s.includes(x))
  if (has('calf', 'calve')) return 'calf'
  if (has('wrist')) return 'wrist'
  if (has('carry')) return 'carry'
  if (has('shrug')) return 'shrug'
  if (has('pallof', 'plank', 'rollout', 'roll-out', 'hollow')) return 'core_anti'
  if (has('twist', 'chopper', 'windmill', 'side-bend')) return 'core_rotation'
  if (has('crunch', 'situp', 'leg-raise', 'knee-raise', 'knee-tuck')) return 'core_flexion'
  if (has('abduction', 'clamshell', 'side-walk')) return 'hip_abduction'
  if (has('adduction')) return 'hip_adduction'
  if (has('pullover', 'lat-prayer')) return 'pullover'
  if (has('fly') && prim.includes('pe')) return 'fly'
  if (has('rear-delt', 'face-pull', 'pull-apart', 'reverse-fly', 'w-raise')) return 'rear_delt'
  if (has('lateral-raise', 'upright-row', 'y-raise', 'halo')) return 'lateral_raise'
  if (has('front-raise')) return 'lateral_raise'
  if (has('curl') && has('leg-curl', 'hamstring-curl', 'nordic')) return 'knee_flexion'
  if (has('curl')) return 'elbow_flexion'
  if (has('glute-ham')) return 'knee_flexion'
  if (has('pushdown', 'push-downs', 'skullcrusher', 'skull-crusher', 'tricep-extension', 'triceps-extension', 'bench-dips')) return 'elbow_extension'
  if (has('leg-extension', 'sissy')) return 'knee_extension'
  if (has('hip-thrust', 'glute-bridge', 'kickback', 'gluteator')) return 'hip_extension'
  if (has('lunge', 'split-squat', 'step-up', 'cossack')) return 'lunge'
  if (has('squat', 'leg-press')) return 'squat'
  if (has('deadlift', 'good-morning', 'swing', 'pull-through', 'pullthrough', 'back-extension', 'hyperextension', 'superman', 'snatch')) return 'hinge'
  if (has('overhead-press', 'military', 'pike-press', 'z-press')) return 'vertical_push'
  if (has('pull-up', 'pullup', 'chin-up', 'pulldown')) return 'vertical_pull'
  if (has('row', 'high-pull')) return 'horizontal_pull'
  if (has('press', 'push-up', 'pushup', 'dips')) return 'horizontal_push'
  return 'other'
}

/** Indicaciones técnicas generales por patrón (redacción propia de ATHLETIQ, orientativa). */
export const PATTERN_GUIDE: Record<string, { cues: string[]; mistakes: string[]; safety?: string }> = {
  horizontal_push: {
    cues: ['Escápulas estables y pies firmes', 'Baja con control hasta un rango cómodo', 'Empuja manteniendo muñecas sobre los codos'],
    mistakes: ['Rebotar la carga', 'Abrir excesivamente los codos', 'Perder la posición de los hombros al final'],
    safety: 'Con barra libre pesada usa un compañero o topes de seguridad.',
  },
  vertical_push: {
    cues: ['Abdomen y glúteos activos para no arquear la zona lumbar', 'Trayectoria vertical cerca de la cara', 'Bloquea arriba sin encoger los hombros'],
    mistakes: ['Hiperextender la zona lumbar', 'Rango parcial por exceso de carga'],
  },
  horizontal_pull: {
    cues: ['Tronco estable durante toda la serie', 'Lleva los codos hacia la cadera', 'Pausa breve con la escápula retraída'],
    mistakes: ['Usar impulso del tronco', 'Encoger los hombros hacia las orejas'],
  },
  vertical_pull: {
    cues: ['Inicia deprimiendo la escápula', 'Lleva el pecho hacia la barra', 'Extiende completamente los brazos abajo'],
    mistakes: ['Balancearse', 'Recortar el rango en la parte baja'],
  },
  squat: {
    cues: ['Reparte el peso en todo el pie', 'Rodillas en la dirección de los pies', 'Profundidad que permita mantener la espalda neutra'],
    mistakes: ['Talones que se despegan', 'Colapso de rodillas hacia dentro', 'Perder la tensión del tronco'],
    safety: 'Con barra usa barras de seguridad en el rack.',
  },
  lunge: {
    cues: ['Paso estable y torso controlado', 'La rodilla delantera sigue la línea del pie', 'Empuja con todo el pie delantero'],
    mistakes: ['Base demasiado estrecha', 'Rebote en la parte baja'],
  },
  hinge: {
    cues: ['Lleva la cadera hacia atrás con la espalda neutra', 'Carga cerca del cuerpo', 'Termina extendiendo cadera, no la zona lumbar'],
    mistakes: ['Redondear la zona lumbar con carga', 'Separar la carga de las piernas', 'Hiperextender arriba'],
    safety: 'Si aparece dolor lumbar, detén el ejercicio y reduce la carga o el rango.',
  },
  hip_extension: { cues: ['Barbilla neutra y costillas abajo', 'Extiende cadera apretando glúteos', 'Pausa arriba'], mistakes: ['Arquear la zona lumbar en lugar de extender la cadera'] },
  knee_flexion: { cues: ['Cadera fija en el apoyo', 'Controla la fase excéntrica'], mistakes: ['Levantar la cadera', 'Usar impulso'] },
  knee_extension: { cues: ['Ajusta el eje de la máquina a la rodilla', 'Sube controlado y baja lento'], mistakes: ['Golpear la carga abajo'] },
  elbow_flexion: { cues: ['Codos estables junto al cuerpo', 'Rango completo con control'], mistakes: ['Balancear el torso', 'Recortar el rango'] },
  elbow_extension: { cues: ['Codos fijos', 'Extiende completamente sin bloquear de golpe'], mistakes: ['Abrir los codos', 'Usar los hombros para mover la carga'] },
  lateral_raise: { cues: ['Ligera inclinación al frente', 'Sube hasta la altura del hombro con el codo guiando'], mistakes: ['Encoger el trapecio', 'Balanceo'] },
  rear_delt: { cues: ['Movimiento desde el hombro, no desde la espalda baja', 'Pausa con brazos abiertos'], mistakes: ['Usar demasiada carga y retraer solo escápulas'] },
  shrug: { cues: ['Sube los hombros recto hacia las orejas', 'Pausa arriba'], mistakes: ['Rotar los hombros'] },
  calf: { cues: ['Estira abajo con pausa', 'Sube a la punta completa'], mistakes: ['Rebotar', 'Rango corto'] },
  core_flexion: { cues: ['Flexiona el tronco vértebra a vértebra', 'Exhala al contraer'], mistakes: ['Tirar del cuello'] },
  core_anti: { cues: ['Costillas abajo, glúteos activos', 'Respira sin perder la posición'], mistakes: ['Hundir la cadera'] },
  core_rotation: { cues: ['Rota desde el tronco con cadera estable', 'Controla la vuelta'], mistakes: ['Velocidad sin control'] },
  hip_abduction: { cues: ['Pelvis estable', 'Movimiento lento'], mistakes: ['Inclinar el tronco para compensar'] },
  hip_adduction: { cues: ['Rango cómodo', 'Control en la apertura'], mistakes: ['Forzar el estiramiento'] },
  fly: { cues: ['Codos ligeramente flexionados y fijos', 'Abre hasta notar estiramiento cómodo'], mistakes: ['Convertirlo en un press', 'Bajar más allá de un rango cómodo'] },
  pullover: { cues: ['Codos ligeramente flexionados', 'Movimiento desde el hombro'], mistakes: ['Arquear la zona lumbar'] },
  wrist: { cues: ['Antebrazo apoyado', 'Rango completo y lento'], mistakes: ['Usar cargas que obligan a rebotar'] },
  carry: { cues: ['Postura erguida', 'Pasos cortos y controlados'], mistakes: ['Inclinarse hacia un lado'] },
  other: { cues: ['Controla el rango completo'], mistakes: ['Priorizar la carga sobre la técnica'] },
}

function parse(): Exercise[] {
  return raw
    .trim()
    .split('\n')
    .map((line) => {
      const [slug, name, eq, diff, force, mech, prim, sec] = line.split('~')
      const equipment = EQUIP[Number(eq)] ?? 'other'
      const primary = prim ? prim.split(',') : []
      const pattern = inferPattern(slug, primary)
      const mechanic = mech === 'c' ? 'compound' : 'isolation'
      const isCore = pattern.startsWith('core') || pattern === 'carry'
      const repRange: [number, number] = isCore ? [8, 15] : mechanic === 'compound' ? (equipment === 'bodyweight' ? [6, 15] : [6, 10]) : [10, 15]
      const g = PATTERN_GUIDE[pattern] ?? PATTERN_GUIDE.other
      return {
        id: `mw-${slug}`,
        name,
        primary,
        secondary: sec ? sec.split(',') : [],
        equipment,
        pattern,
        mechanic,
        force: force === 'P' ? (slug.includes('row') || slug.includes('pull') || slug.includes('curl') ? 'pull' : 'push') : force === 'H' ? 'static' : 'other',
        difficulty: DIFF[Number(diff)] ?? 'intermediate',
        repRange,
        increment: INCREMENT[equipment],
        cues: g.cues,
        mistakes: g.mistakes,
        safety: g.safety,
        source: 'musclewiki',
        sourceUrl: `https://musclewiki.com/es-es/exercise/${slug}`,
      } satisfies Exercise
    })
}

export const EXERCISES: Exercise[] = parse()
const byId = new Map(EXERCISES.map((e) => [e.id, e]))
export const getExercise = (id: string) => byId.get(id)

/** Sustituciones: mismo patrón y músculo principal, priorizando equipamiento disponible. */
export function substitutesFor(id: string, available?: Equipment[], limit = 6): Exercise[] {
  const ex = byId.get(id)
  if (!ex) return []
  return EXERCISES.filter((e) => e.id !== id && e.pattern === ex.pattern && e.primary.some((m) => ex.primary.includes(m)))
    .filter((e) => !available || available.includes(e.equipment) || e.equipment === 'bodyweight')
    .sort((a, b) => Number(b.mechanic === ex.mechanic) - Number(a.mechanic === ex.mechanic))
    .slice(0, limit)
}

export function filterExercises(q: { text?: string; muscle?: string; equipment?: string; difficulty?: string; pattern?: string }) {
  const t = q.text?.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  return EXERCISES.filter(
    (e) =>
      (!t || e.name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(t)) &&
      (!q.muscle || e.primary.includes(q.muscle) || e.secondary.includes(q.muscle)) &&
      (!q.equipment || e.equipment === q.equipment) &&
      (!q.difficulty || e.difficulty === q.difficulty) &&
      (!q.pattern || e.pattern === q.pattern),
  )
}
