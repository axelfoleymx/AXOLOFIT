import { Badge, Card, Note } from '../../components/ui'

type Level = 'sólida' | 'moderada' | 'limitada' | 'práctica razonable'

interface Entry { topic: string; rule: string; level: Level; population: string; limits: string; sources: string[] }

// Base de conocimiento usada por los motores. Las referencias se citan por autor, año, título y revista.
// No incluimos DOI para no introducir errores de transcripción; verifica cada referencia antes de publicarla.
const ENTRIES: Entry[] = [
  { topic: 'Metabolismo basal', rule: 'Mifflin-St Jeor como ecuación principal; Katch-McArdle solo con % de grasa medido.', level: 'sólida', population: 'Adultos sanos con y sin obesidad', limits: 'Error individual ±10 % o más; no es una medición directa.', sources: ['Mifflin MD, St Jeor ST et al. (1990). A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr.'] },
  { topic: 'Gasto por actividad', rule: 'Factor de actividad cotidiana sin ejercicio + ejercicio neto por MET (MET − 1) para evitar doble conteo.', level: 'moderada', population: 'Adultos', limits: 'Los MET son promedios; el entrenamiento de fuerza varía mucho según densidad y descansos.', sources: ['Ainsworth BE et al. (2011). 2011 Compendium of Physical Activities. Med Sci Sports Exerc.'] },
  { topic: 'Balance energético', rule: '≈7 700 kcal por kg como aproximación para ritmos de cambio; ajustes por tendencia de 2–3 semanas.', level: 'moderada', population: 'Adultos', limits: 'El contenido energético del tejido perdido varía y el gasto se adapta; por eso los ajustes son pequeños y revisables.', sources: ['Hall KD et al. (2011). Quantification of the effect of energy imbalance on bodyweight. Lancet.'] },
  { topic: 'Proteína', rule: '1.4–2.0 g/kg/día para quien entrena fuerza; parte alta en déficit. Peso de referencia si IMC ≥ 30.', level: 'sólida', population: 'Adultos sanos que entrenan', limits: 'Rango general, no prescripción. Personas con enfermedad renal requieren indicación médica.', sources: ['Jäger R et al. (2017). International Society of Sports Nutrition Position Stand: protein and exercise. J Int Soc Sports Nutr.', 'Morton RW et al. (2018). A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength. Br J Sports Med.', 'Helms ER et al. (2014). Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. J Int Soc Sports Nutr.'] },
  { topic: 'Fibra', rule: '~14 g por cada 1 000 kcal como referencia.', level: 'sólida', population: 'Población general', limits: 'Algunas condiciones digestivas requieren ajustes individuales.', sources: ['Institute of Medicine (2005). Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids.'] },
  { topic: 'Progresión de carga', rule: 'Progresión doble: acumular repeticiones en un rango y subir la carga mínima disponible al completar el máximo con el esfuerzo objetivo.', level: 'práctica razonable', population: 'Entrenamiento de fuerza en general', limits: 'Método práctico consistente con el principio de sobrecarga progresiva; no hay ensayos que lo comparen con todas las alternativas.', sources: ['American College of Sports Medicine (2009). Progression models in resistance training for healthy adults. Med Sci Sports Exerc.'] },
  { topic: 'Proximidad al fallo (RIR)', rule: 'Objetivo por defecto RIR 1–3; no forzar progresión si el RIR registrado es mucho menor.', level: 'moderada', population: 'Adultos entrenados y no entrenados', limits: 'La estimación de RIR es subjetiva y mejora con la práctica.', sources: ['Refalo MC et al. (2023). Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis. Sports Med.'] },
  { topic: 'Volumen semanal', rule: 'Volumen inicial conservador con techos orientativos por experiencia (≈10–20 series/músculo/semana).', level: 'moderada', population: 'Adultos', limits: 'Relación dosis-respuesta con gran variabilidad individual; más no siempre es mejor.', sources: ['Schoenfeld BJ, Ogborn D, Krieger JW (2017). Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis. J Sports Sci.'] },
  { topic: 'Frecuencia', rule: 'Repartir el volumen en ≥ 2 sesiones por músculo cuando los días lo permiten.', level: 'moderada', population: 'Adultos', limits: 'Con volumen igualado, la frecuencia parece tener un efecto pequeño.', sources: ['Schoenfeld BJ, Grgic J, Krieger J (2019). How many times per week should a muscle be trained to maximize muscle hypertrophy? A systematic review and meta-analysis. J Sports Sci.'] },
  { topic: 'Descansos', rule: '≈2–3 min en compuestos y ≈1–2 min en aislamiento por defecto; configurable.', level: 'limitada', population: 'Adultos entrenados', limits: 'Evidencia heterogénea; prima poder mantener el rendimiento en las series.', sources: ['Grgic J et al. (2018). Effects of rest interval duration in resistance training on measures of muscular hypertrophy: a systematic review. Sports Med.'] },
  { topic: '1RM estimado', rule: 'Fórmula de Epley con repeticiones hasta el fallo ≈ reps + RIR, solo para comparar sesiones.', level: 'práctica razonable', population: '—', limits: 'Menos precisa por encima de ~12 repeticiones y entre ejercicios distintos.', sources: ['Epley B (1985). Poundage Chart. Boyd Epley Workout.'] },
  { topic: 'Estancamiento y descarga', rule: 'No declarar estancamiento con < 4 sesiones; caída de 3 sesiones seguidas se presenta como hipótesis y se revisan sueño, nutrición y técnica antes de cambiar el programa.', level: 'práctica razonable', population: '—', limits: 'Reglas heurísticas conservadoras; la decisión final es de la persona.', sources: [] },
  { topic: 'Ejercicios', rule: 'Catálogo de nombres, músculos y equipamiento importado de MuscleWiki; sin atribuir activaciones exactas.', level: 'práctica razonable', population: '—', limits: 'El EMG no es prueba definitiva de hipertrofia; la clasificación de músculos es orientativa.', sources: ['MuscleWiki — https://musclewiki.com/es-es (datos de catálogo; técnica y vídeos en su sitio).'] },
]

const TONE: Record<Level, 'lime' | 'info' | 'warn' | 'muted'> = { sólida: 'lime', moderada: 'info', limitada: 'warn', 'práctica razonable': 'muted' }

export default function Science() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="h-display text-2xl font-bold">Base científica</h1>
      <Note>Cada regla de la app indica su nivel de evidencia, la población estudiada y sus limitaciones. Los cálculos se hacen con código verificable; ninguna recomendación es una prescripción médica. Las referencias se citan sin DOI; verifícalas antes de citarlas en otros contextos.</Note>
      {ENTRIES.map((e) => (
        <Card key={e.topic} title={e.topic} action={<Badge tone={TONE[e.level]}>Evidencia {e.level}</Badge>}>
          <p className="text-sm">{e.rule}</p>
          <p className="mt-2 text-xs text-muted"><b>Población:</b> {e.population} · <b>Limitaciones:</b> {e.limits}</p>
          {e.sources.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px] text-soft">{e.sources.map((s) => <li key={s}>{s}</li>)}</ul>}
        </Card>
      ))}
    </div>
  )
}
