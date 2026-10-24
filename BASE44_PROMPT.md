# Prompt para Base44 — ATHLETIQ

Copia todo lo que está debajo de la línea en Base44.

---

Construye **ATHLETIQ**, una app de fitness con tema oscuro (fondo #0b0c0e, superficies #181b1f, acento lima #c6f432, rosa de la mascota #f59bb8). Usa las fuentes Inter y Space Grotesk. Diseña primero para móvil con navegación inferior y, en escritorio, con barra lateral. La mascota es un ajolote musculoso: usa las imágenes listadas en «Archivos fuente» en el inicio, la carga, los estados vacíos y los logros, sin que tapen los datos. El código de referencia completo está en https://github.com/axelfoleymx/AXOLOFIT: replica su lógica **exactamente**. Lee los archivos de la sección «Archivos fuente».

## Archivos fuente (léelos antes de empezar)
Repositorio: https://github.com/axelfoleymx/AXOLOFIT

**Datos para importar como entidades** (CSV ya limpios, con nutrientes por 100 g):
- Alimento: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/data/base44/Alimento.csv
- RecetaMexicana: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/data/base44/RecetaMexicana.csv
- BebidaMexicana: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/data/base44/BebidaMexicana.csv
- EnfermedadAlimento: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/data/base44/EnfermedadAlimento.csv
- EducacionAprende: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/data/base44/EducacionAprende.csv
- EducacionMetaNutricional: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/data/base44/EducacionMetaNutricional.csv
- Ejercicio: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/data/base44/Ejercicio.csv

**Imágenes de la mascota:**
- Logo: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/logo.webp
- Saludo: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/wave.png
- Levantando pesas: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/lift.png
- Con comida: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/food.png
- Con trofeo: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/trophy.png
- Entrenador: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/coach.png
- Descansando: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/rest.png
- Báscula: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/scale.png
- Iconos de la app: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/icon-192.png y https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/icon-512.png

**Lógica de cálculo** (cópiala tal cual; son funciones puras con pruebas):
- Nutrición y porciones: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/nutrition.ts
- Metabolismo y objetivos: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/energy.ts
- Peso y tendencias: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/weight.ts
- Ajuste adaptativo: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/adaptive.ts
- Progresión doble: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/progression.ts
- Rendimiento, volumen y récords: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/training.ts
- Generador de rutinas: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/routine.ts
- Planificador de menús: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/menu.ts
- Rachas y logros: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/habits.ts
- Herramientas del coach: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/coach/toolDefs.ts y https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/coach/tools.ts
- Base científica (texto de la pantalla): https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/features/profile/Science.tsx

## Regla principal
Las calorías, macros, promedios, tendencias y recomendaciones de carga se calculan con **código determinista** (las funciones de `src/lib/calc`). La IA solo explica resultados ya calculados. Nunca inventes datos que falten: un nutriente desconocido se queda como `null` y no cuenta como 0.

## Entidades
Todas llevan el ID del usuario propietario (no uses el correo como clave). Cada consulta y escritura se filtra por el usuario actual.
- **Profile**: displayName, age, birthDate?, sex (male/female/unspecified), heightCm, weightKg, bodyFatPct?, bodyFatOrigin (measured/estimated), timezone, consentAt, onboardingDone.
- **Preferences**: goal (fat_loss/maintenance/muscle_gain/recomposition), pace (slow/moderate/fast), experience, activity (sedentary/light/moderate/high/very_high), avgSteps, sleepHours, trainingDays, sessionMinutes, extraActivityMinPerWeek, equipment[], diet[], allergies[], intolerances[], dislikedFoods[], conditions[], snacksPerDay (0/1/2), budget, trackWater, trackFiber, restTimerSec, injuries.
- **NutritionTargets**: mode (calculated/manual), kcal, proteinG, carbsG, fatG, fiberG, waterMl, validFrom, rationale.
- **FoodLogItem**: date, meal (desayuno/colacion_am/comida/colacion_pm/cena), foodId, foodName, grams, per100g {kcal, protein, carbs, fat, fiber, satFat, sugar, sodiumMg}, source, quality, state (raw/cooked/as_sold), recipeId.
- **CustomFood**, **Recipe** (name, servings, ingredients[{foodId, foodName, grams, per100g}]), **FavoriteFood**.
- **WeightLog** (date, kg, conditions, note, origin), **BodyMeasurement**, **RecoveryLog** (sleepHours y escalas del 1 al 5 de fatiga, hambre, dolor y estrés), **WaterLog**, **StepLog**.
- **WorkoutPlan** (name, split, days[{id, name, focus, exercises[{exerciseId, order, warmupSets, config{repMin, repMax, sets, rirMin, rirMax, increment, restSec}}]}], active).
- **WorkoutSession** (planId, dayId, name, date, startedAt, endedAt, status active/completed/discarded, fatigue, exercises[{exerciseId, exerciseName, config, sets[{kind warmup/working, weightKg, reps, rir, rpe, done, pain}], techniqueOk, painNote, substitutedFrom}]).
- **PersonalRecord**, **CoachingRecommendation** (status pending/accepted/dismissed), **AchievementLog**.
- **Catálogos de solo lectura**: Alimento, RecetaMexicana, BebidaMexicana, EnfermedadAlimento, EducacionAprende, EducacionMetaNutricional y Ejercicio. Impórtalos desde los CSV listados en «Archivos fuente»: ya están deduplicados, sin datos personales y con los nutrientes expresados **por 100 g**. Reemplaza con ellos los catálogos actuales, que repiten cada alimento varias veces. Cada ejercicio (357 en total) enlaza a `https://musclewiki.com/es-es/exercise/{slug}` para la técnica y el vídeo.

## Cálculos (ver `src/lib/calc`)
- **TMB con Mifflin-St Jeor**: 10·kg + 6.25·cm − 5·edad, +5 para hombres y −161 para mujeres. Si el sexo no se indica, usa el promedio de ambas y muestra el rango. Usa Katch-McArdle solo si el % de grasa fue medido.
- **Gasto total** = TMB × factor de actividad cotidiana (1.2, 1.3, 1.4, 1.5 o 1.6) + gasto neto del ejercicio (sesiones × minutos × (5 − 1) × kg / 60 / 7). El factor de actividad no incluye el gimnasio, para no contarlo dos veces.
- **Calorías objetivo**:
  - Pérdida de grasa: −0.25, −0.5 o −0.75 % del peso por semana, con un déficit máximo del 25 %.
  - Ganancia muscular: +5, +10 o +15 % ajustado por experiencia.
  - Recomposición: −5 % (o −10 % si el IMC es ≥ 25).
  - Nunca por debajo de la TMB ni de 1 200 kcal. En menores de 18 años no se aplica déficit.
- **Proteína**: 1.8 g/kg en déficit o recomposición y 1.6 g/kg en los demás casos (rango 1.4–2.0). Si el IMC es ≥ 30, usa como referencia el peso con IMC 25. **Grasa**: 25 % de las kcal con un mínimo de 0.6 g/kg. **Carbohidratos**: el resto. Muestra el desglose completo y permite objetivos manuales con advertencias de seguridad.
- **Peso**: promedio móvil de 7 días naturales, pendiente por mínimos cuadrados sobre 21 días y clasificación de la tendencia como bajando, estable, subiendo o insuficiente.
- **Ajuste adaptativo**: requiere al menos 14 días, 8 pesajes y 10 días con registro completo. Cada ajuste es de 150 kcal como máximo y debe haber al menos 14 días entre ajustes. El usuario siempre lo acepta.
- **Progresión doble** (`progression.ts`): primero se suman repeticiones (por ejemplo, de 10/9/8 a 10/10/9). Con el máximo del rango en todas las series y el RIR correcto, se sube el incremento mínimo; si ese salto supera el 10 %, primero se consolida. Una caída aislada no reduce la carga. Tras dos sesiones por debajo del rango, se baja. Tras tres caídas seguidas, se sugiere una descarga. Con dolor no se progresa y se recomienda consultar a un profesional. Si faltan datos, se piden. La recomendación nunca se aplica sin revisión.
- **Menú**: distribución por colaciones: 0 → 30/40/30, 1 → 27/10/38/25, 2 → 25/10/35/10/20. Elige recetas reales cercanas al objetivo y escálalas entre 0.7× y 1.5×, sin escalar hierbas, salsas ni condimentos. Excluye alérgenos por nombre de ingrediente. Solo suma al diario lo que el usuario confirma que comió.

## Pantallas
Onboarding de 8 pasos con consentimiento, Dashboard (hoy, 7 días y 30 días), Nutrición (Diario, Recetas, Planificador, Aprende), Entrenar (Rutina, Ejercicios, Historial), sesión en vivo a pantalla completa con temporizador de descanso, Progreso (Peso, Medidas y fotos, Estadísticas), Coach, Perfil (editar datos, objetivos, logros, integraciones, exportar JSON, eliminar cuenta) y Base científica.

## Extras
- Escáner de código de barras con BarcodeDetector cuando el navegador lo soporte (en Safari/iOS no existe: ahí se escribe el código). Busca el producto en Open Food Facts (`https://world.openfoodfacts.org/api/v2/product/{code}.json`), que no requiere clave.
- Fotos de progreso privadas, solo visibles para su dueño.
- Que la app funcione sin conexión cuando sea posible, mostrando el estado de sincronización.

## Coach con IA
El coach usa herramientas que consultan los datos reales del usuario: perfil, nutrición del día, tendencia de peso, entrenamientos, recomendación por ejercicio, recuperación, sugerencias de comida, comparación de periodos y vista previa de rutina. No debe inventar entrenamientos ni consumos, debe decir cuando faltan datos y no puede diagnosticar.

## Honestidad
Muestra la fuente y la calidad de cada alimento. Advierte cuando las kcal no cuadran con los macros. El peso no equivale a grasa. Una correlación no implica causa. No prometas integraciones con HealthKit ni Google Fit desde la web.
