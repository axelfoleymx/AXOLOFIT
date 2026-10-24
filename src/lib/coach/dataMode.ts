import { EXERCISES, getExercise } from '../exercises'
import { repo } from '../db/db'
import { findExercise, runTool } from './tools'
import type { CoachToolName } from './toolDefs'

// "Modo datos": responde sin IA a preguntas frecuentes, enrutando por palabras clave a las mismas herramientas
// deterministas que usa el coach con IA. Las respuestas son plantillas sobre resultados calculados.

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface DataAnswer { text: string; tools: CoachToolName[] }

async function exerciseFromText(userId: string, q: string) {
  const sessions = await repo.list('sessions', userId)
  const used = [...new Set(sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))]
  const nq = norm(q)
  // Primero ejercicios usados por la persona cuyo nombre (o palabras clave) aparezcan en la pregunta
  const candidates = [...used.map((id) => getExercise(id)!).filter(Boolean), ...EXERCISES]
  const KEY: [RegExp, string][] = [[/press de banca|banca|bench/, 'press de banca'], [/sentadilla|squat/, 'sentadilla'], [/peso muerto|deadlift/, 'peso muerto'], [/dominada|pull.?up/, 'dominadas'], [/militar|overhead/, 'press militar'], [/remo/, 'remo'], [/hip thrust/, 'hip thrust'], [/curl/, 'curl']]
  for (const [re, name] of KEY) if (re.test(nq)) {
    const hit = candidates.find((e) => norm(e.name).includes(name))
    if (hit) return hit
  }
  return candidates.find((e) => nq.includes(norm(e.name))) ?? null
}

export async function answerWithData(userId: string, today: string, question: string): Promise<DataAnswer> {
  const q = norm(question)
  const call = (n: CoachToolName, i: Record<string, unknown> = {}) => runTool(userId, today, n, i) as Promise<Any>

  if (/(solo|sólo)? ?puedo entrenar (\d)|(\d) dias? (a la|por) semana/.test(q)) {
    const d = Number(q.match(/(\d)/)?.[1] ?? 3)
    const r = await call('preview_routine', { days: d })
    return { tools: ['preview_routine'], text: `Con ${d} día(s) por semana te propongo **${r.division}**:\n${r.dias.map((x: Any) => `• ${x.nombre}: ${x.ejercicios.slice(0, 4).join('; ')}${x.ejercicios.length > 4 ? '…' : ''}`).join('\n')}\n\nPuedes generarla y guardarla en Entrenar → Generar rutina.` }
  }
  if (/en lugar de|sustitu|alternativ|reemplaz|cambiar el ejercicio/.test(q)) {
    const ex = await exerciseFromText(userId, question)
    if (!ex) return { tools: [], text: '¿Qué ejercicio quieres sustituir? Escribe su nombre (por ejemplo «sustituto para sentadilla con barra»).' }
    const r = await call('get_substitutes', { exercise: ex.id })
    return { tools: ['get_substitutes'], text: r.alternativas.length ? `Alternativas a **${r.ejercicio}** con tu equipamiento (mismo patrón y músculo principal):\n${r.alternativas.map((a: Any) => `• ${a.nombre}`).join('\n')}` : `No encontré alternativas con tu equipamiento para ${r.ejercicio}.` }
  }
  if (/proteina|me falta|me queda|restante|cuantas calorias|macros/.test(q) && !/cenar|comer|desayun/.test(q)) {
    const r = await call('get_day_nutrition')
    if (!r.objetivo) return { tools: ['get_day_nutrition'], text: 'No tienes objetivos nutricionales definidos. Configúralos en Perfil.' }
    return { tools: ['get_day_nutrition'], text: `Hoy llevas **${r.consumido.kcal} kcal** y **${r.consumido.proteina_g} g de proteína** (${r.registros} registros).\nTe faltan **${Math.max(0, r.restante.kcal)} kcal** y **${Math.max(0, r.restante.proteina_g)} g de proteína** para tus objetivos (${r.objetivo.kcal} kcal · ${r.objetivo.proteina_g} g).${r.nota_datos ? `\nNota: ${r.nota_datos}.` : ''}\nNo hace falta clavarlo al gramo: lo importante es la tendencia semanal.` }
  }
  if (/cenar|cena|comer|que como|desayun|colacion|snack/.test(q)) {
    const meal = /desayun/.test(q) ? 'desayuno' : /colacion|snack/.test(q) ? 'colacion_pm' : /comer|comida/.test(q) && !/cena/.test(q) ? 'comida' : 'cena'
    const r = await call('suggest_meals', { meal })
    if (r.error) return { tools: ['suggest_meals'], text: r.error }
    if (!r.opciones.length) return { tools: ['suggest_meals'], text: `Te quedan ${r.restante_kcal} kcal. ${r.restante_kcal < 100 ? 'Ya estás muy cerca de tu objetivo; si tienes hambre, elige verduras o una proteína ligera.' : 'No encontré recetas compatibles con tus preferencias.'}` }
    return { tools: ['suggest_meals'], text: `Te quedan **${r.restante_kcal} kcal** y **${Math.max(0, r.restante_proteina_g)} g de proteína**. Opciones del recetario mexicano:\n${r.opciones.map((o: Any) => `• **${o.receta}** (×${o.escala}): ${o.kcal} kcal, ${o.proteina_g} g proteína`).join('\n')}\n\nRegístrala en Nutrición → Planificador cuando la comas.` }
  }
  if (/cuanto peso|que peso|aumentar|subir (el )?peso|subir carga|repeticiones o|progres|estanc|sin progresar|no avanzo/.test(q)) {
    const ex = await exerciseFromText(userId, question)
    if (!ex) {
      const r = await call('get_training_overview')
      return { tools: ['get_training_overview'], text: `¿De qué ejercicio? Por ejemplo: «¿cuánto peso uso en press de banca?».${r.siguiente_dia ? ` Tu siguiente día es **${r.siguiente_dia.nombre}**.` : ''}` }
    }
    const r = await call('get_exercise_recommendation', { exercise: ex.id })
    if (r.error) return { tools: ['get_exercise_recommendation'], text: r.error }
    return { tools: ['get_exercise_recommendation'], text: `**${r.ejercicio}** — ${r.recomendacion.titulo}\n${r.recomendacion.mensaje}\n\nPara progresar: ${r.recomendacion.condicion_progreso}\nRendimiento: ${r.analisis.estado}${r.analisis.detalle ? ` — ${r.analisis.detalle}` : ''}${r.analisis.hipotesis.length ? `\n${r.analisis.hipotesis.map((h: string) => `• ${h}`).join('\n')}` : ''}\n(Confianza ${({ high: 'alta', medium: 'media', low: 'baja' } as Any)[r.recomendacion.confianza]}. Revisa y acepta tú la carga.)` }
  }
  if (/entren(o|ar) hoy|que entreno|toca hoy|siguiente entren/.test(q)) {
    const r = await call('get_training_overview')
    if (!r.siguiente_dia) return { tools: ['get_training_overview'], text: 'No tienes una rutina activa. Ve a Entrenar → Generar rutina.' }
    return { tools: ['get_training_overview'], text: `Hoy toca **${r.siguiente_dia.nombre}**${r.dias_desde_ultimo != null ? ` (último entrenamiento hace ${r.dias_desde_ultimo} día(s))` : ''}:\n${r.siguiente_dia.ejercicios.map((e: Any) => `• ${e.ejercicio}: ${e.peso_kg != null ? `${e.peso_kg} kg, ` : ''}${e.series} series ${e.reps_objetivo ? `(${e.reps_objetivo.join('/')})` : `${e.rango[0]}–${e.rango[1]} reps`}`).join('\n')}` }
  }
  if (/recuper|sueno|dormi|fatiga|cansad/.test(q)) {
    const r = await call('get_recovery', { days: 14 })
    if (!r.registros) return { tools: ['get_recovery'], text: 'No has registrado sueño ni fatiga en las últimas 2 semanas. Regístralos desde Inicio → Sueño y recuperación para poder analizarlos.' }
    return { tools: ['get_recovery'], text: `Últimos 14 días (${r.registros} registros): sueño medio **${r.sueno_promedio_h ?? '—'} h**, fatiga ${r.fatiga_promedio_1a5 ?? '—'}/5, dolor muscular ${r.dolor_muscular_1a5 ?? '—'}/5.${r.sueno_promedio_h != null && r.sueno_promedio_h < 7 ? '\nDormir menos de 7 h de forma habitual puede limitar la recuperación.' : ''}${r.molestias_en_series.length ? `\nRegistraste molestias en: ${r.molestias_en_series.map((m: Any) => m.ejercicio).join(', ')}. No entrenes con dolor; si persiste, consulta a un profesional.` : ''}` }
  }
  if (/mes pasado|ultimo mes|este mes/.test(q) || /como voy|esta semana|semana pasada/.test(q)) {
    const period = /mes/.test(q) ? 'month' : 'week'
    const r = await call('compare_periods', { period })
    const a = r.actual, b = r.anterior
    const d = (x: number | null, y: number | null, u = '') => (x == null || y == null ? '—' : `${x - y >= 0 ? '+' : ''}${Math.round((x - y) * 10) / 10}${u}`)
    return { tools: ['compare_periods'], text: `${period === 'month' ? 'Últimos 30 días vs. los 30 anteriores' : 'Esta semana vs. la anterior'}:\n• Días con registro: ${a.dias_registrados} (antes ${b.dias_registrados})\n• Calorías medias: ${a.kcal_media ?? '—'} (${d(a.kcal_media, b.kcal_media)})\n• Proteína media: ${a.proteina_media ?? '—'} g (${d(a.proteina_media, b.proteina_media, ' g')})\n• Peso medio: ${a.peso_medio ?? '—'} kg (${d(a.peso_medio, b.peso_medio, ' kg')})\n• Sesiones: ${a.sesiones} (antes ${b.sesiones}) · Volumen ${a.volumen_kg} kg\nSon asociaciones; una semana aislada no define tu progreso.` }
  }
  if (/peso|bascula|kilos|adelgac|engord/.test(q)) {
    const r = await call('get_weight_trend', { days: 60 })
    if (!r.ultimo) return { tools: ['get_weight_trend'], text: 'Aún no hay pesajes registrados.' }
    return { tools: ['get_weight_trend'], text: `Último pesaje ${r.ultimo.kg} kg (${r.ultimo.fecha}); promedio de 7 días ${r.ultimo.promedio_7d} kg. Tendencia: **${r.tendencia}**${r.kg_por_semana != null ? ` (${r.kg_por_semana} kg/semana)` : ''}. ${r.nota}` }
  }
  void findExercise
  return { tools: [], text: 'En modo datos puedo responder, con tus registros reales:\n• ¿Qué debería entrenar hoy?\n• ¿Cuánto peso uso en press de banca?\n• ¿Por qué no progreso en sentadilla?\n• ¿Cuánta proteína me falta hoy?\n• ¿Qué puedo cenar con lo que me queda?\n• ¿Cómo voy esta semana? / ¿Qué cambió respecto al mes pasado?\n• ¿Estoy recuperándome bien?\n• Alternativas a un ejercicio\n• ¿Cómo ajusto mi rutina si solo puedo entrenar 3 días?' }
}
