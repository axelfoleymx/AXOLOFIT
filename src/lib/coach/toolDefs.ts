// Definiciones de herramientas del coach. Las comparten el servidor (que las envía al modelo) y el cliente
// (que las ejecuta sobre los datos del usuario). El modelo nunca ve datos que no vengan de estas herramientas.

export const COACH_SYSTEM = `Eres el coach de ATHLETIQ: entrenador de fuerza y guía nutricional orientativa.
Responde en español, claro, amable, motivador y directo, sin culpabilizar ni fomentar conductas obsesivas.

Reglas:
- Antes de cualquier recomendación personalizada consulta las herramientas. Nunca inventes entrenamientos, comidas, pesos, marcas ni resultados.
- Los números (calorías, macros, promedios, cargas recomendadas) vienen calculados por las herramientas con código verificable: cítalos tal cual, no los recalcules a ojo.
- Si los datos son insuficientes, dilo y pide datos concretos.
- Presenta correlaciones como hipótesis, no como causas. No diagnostiques enfermedades ni lesiones.
- Si hay dolor, síntomas preocupantes o agotamiento extremo, recomienda no entrenar con dolor y consultar a un profesional.
- No prescribas dietas extremas. En menores de edad, no sugieras déficits agresivos.
- Las recomendaciones de carga requieren que la persona las revise y acepte en la app.
- Sé breve: 2–6 frases o una lista corta.`

export const COACH_TOOLS = [
  { name: 'get_profile', description: 'Perfil, preferencias, objetivo, equipamiento y objetivos nutricionales vigentes del usuario.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_day_nutrition', description: 'Totales nutricionales registrados en un día (consumido, objetivo y restante) y lista de alimentos.', input_schema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD; omitir para hoy' } }, additionalProperties: false } },
  { name: 'get_nutrition_summary', description: 'Promedios de calorías y proteína y días registrados en los últimos N días.', input_schema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90 } }, required: ['days'], additionalProperties: false } },
  { name: 'get_weight_trend', description: 'Pesajes, promedio de 7 días y tendencia de las últimas semanas.', input_schema: { type: 'object', properties: { days: { type: 'integer', minimum: 7, maximum: 365 } }, required: ['days'], additionalProperties: false } },
  { name: 'get_training_overview', description: 'Rutina activa, próximo día sugerido, sesiones recientes y días desde el último entrenamiento.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_exercise_recommendation', description: 'Historial reciente de un ejercicio, recomendación de progresión calculada y análisis de estancamiento.', input_schema: { type: 'object', properties: { exercise: { type: 'string', description: 'Nombre o id del ejercicio' } }, required: ['exercise'], additionalProperties: false } },
  { name: 'get_substitutes', description: 'Ejercicios alternativos con el mismo patrón y músculo principal, según el equipamiento del usuario.', input_schema: { type: 'object', properties: { exercise: { type: 'string' } }, required: ['exercise'], additionalProperties: false } },
  { name: 'get_recovery', description: 'Registros de sueño, fatiga, hambre y molestias de los últimos N días.', input_schema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 60 } }, required: ['days'], additionalProperties: false } },
  { name: 'suggest_meals', description: 'Propuestas de comida del catálogo mexicano que encajan con las calorías y proteína restantes del día, respetando alergias y preferencias.', input_schema: { type: 'object', properties: { meal: { type: 'string', enum: ['desayuno', 'comida', 'cena', 'colacion_am', 'colacion_pm'] } }, additionalProperties: false } },
  { name: 'compare_periods', description: 'Compara la última semana o mes con el periodo anterior (peso, calorías, proteína, sesiones, volumen).', input_schema: { type: 'object', properties: { period: { type: 'string', enum: ['week', 'month'] } }, required: ['period'], additionalProperties: false } },
  { name: 'preview_routine', description: 'Genera (sin guardar) una rutina para N días por semana con el equipamiento y nivel del usuario.', input_schema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 6 } }, required: ['days'], additionalProperties: false } },
] as const

export type CoachToolName = (typeof COACH_TOOLS)[number]['name']
