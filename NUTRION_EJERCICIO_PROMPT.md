# Prompt para Base44 — Agregar el módulo de entrenamiento de AXOLOFIT a Nutrion

Copia en Base44, dentro de la app **Nutrion**, todo lo que está debajo de la línea.

---

Agrega a Nutrion un módulo de **entrenamiento de fuerza** igual al de la app AXOLOFIT, **sin romper nada de lo que ya funciona**: menús, expediente, aprende, estadísticas y puntos Nutrion. El código de referencia es público: https://github.com/axelfoleymx/AXOLOFIT. Lee estos archivos antes de empezar y replica su lógica tal cual (son funciones puras con pruebas):
- Catálogo de ejercicios: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/data/base44/Ejercicio.csv (357 ejercicios; 93 con foto de inicio y fin; incluye patrón de movimiento, rango de repeticiones, incremento de carga, claves técnicas, errores comunes y sustitutos).
- Progresión doble: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/progression.ts
- Rendimiento, volumen y récords: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/training.ts
- Generador de rutinas: https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/src/lib/calc/routine.ts

## 1. Entidades nuevas
Todas ligadas al usuario autenticado por su ID (no por correo). Cada consulta y escritura se filtra por el usuario actual.
- **Ejercicio** (catálogo de solo lectura): impórtalo del CSV anterior con todas sus columnas.
- **PlanEntrenamiento**: nombre, division, activo, generado, dias[{id, nombre, enfoque, targets[], ejercicios[{slug, orden, series_calentamiento, config{rep_min, rep_max, series, rir_min, rir_max, incremento_kg, descanso_seg}}]}]. Guarda siempre `targets` en cada día.
- **SesionEntrenamiento**: plan_id, dia_id, nombre, fecha, inicio, fin, estado (activa/completada/descartada), fatiga 1–5, nota, ejercicios[{slug, nombre, config, tecnica_ok, nota_molestia, sustituye_a, series[{tipo calentamiento/efectiva, peso_kg, reps, rir, hecha, dolor}]}].
- **RecordPersonal**: slug, tipo (e1rm/peso/reps_con_peso), valor, peso_kg, reps, fecha, sesion_id.

Agrega a **ExpedientePaciente**, sin borrar campos: dias_entreno (2–6), minutos_sesion, experiencia_entreno (sin_experiencia/principiante/intermedio/avanzado), lugar_entreno (gimnasio/casa_mancuernas/peso_corporal), equipo[], lesiones. Reutiliza peso_kg, sexo, edad y objetivo que ya existen.

## 2. Primera vez (sin alargar el onboarding)
**No agregues preguntas al onboarding actual.** La primera vez que el usuario abra Entrenar, muestra una tarjeta con el ajolote y tres preguntas:
- Días por semana: chips 2–6.
- Lugar: «Gimnasio completo», «Casa con mancuernas» o «Solo peso corporal». El lugar define el equipo automáticamente.
- Experiencia: 4 chips.

Al guardar, genera la rutina con el generador. Las lesiones se piden aparte, como campo opcional.

## 3. Pantallas
- **Navegación:**
  - Agrega la pestaña **Entrenar** (ícono de pesa).
  - Para no pasar de 5 pestañas: Inicio · Menú · Nutrion (centro) · Entrenar · Perfil.
  - **Aprende** pasa como acceso dentro de Inicio y de Perfil.
- **Entrenar:**
  - Rutina activa con sus días.
  - «Siguiente sesión», que es el día menos hecho esta semana.
  - Botones «Empezar», «Regenerar» y «Actualizar rutina con ejercicios con foto».
  - Biblioteca de ejercicios con filtros por músculo, equipo y dificultad.
  - Historial de sesiones.
- **Sesión en vivo** a pantalla completa:
  - Un ejercicio a la vez, con foto de inicio y fin y el crédito «Foto: Free Exercise DB». Si no hay foto, el ajolote y «Ver técnica en MuscleWiki».
  - Tabla de series con kg, reps y RIR, y botón de serie hecha. En peso corporal se ocultan los kg.
  - Temporizador de descanso con +30 s y saltar.
  - Interruptor «Técnica correcta», campo de molestia y botón de sustituir por los sustitutos del CSV.
  - Se guarda en cada cambio, para no perder datos si se cierra la app.
- **Resumen al terminar:**
  - Duración, series, volumen y récords.
  - La recomendación para la próxima sesión de cada ejercicio.
  - Ajolote con trofeo si hay récord.
- **Estadísticas:**
  - Agrega 1RM estimado por ejercicio en el tiempo (fórmula Epley con RIR, como en training.ts).
  - Series por músculo en la semana.
  - Sesiones por semana.

## 4. Lógica (código determinista, nunca IA)
- **Progresión doble**, como en progression.ts:
  - Sin historial → sesión de referencia.
  - Dentro del rango → suma repeticiones (10/9/8 → 10/10/9).
  - Máximo del rango en todas las series con el RIR objetivo → sube el incremento mínimo. Si ese salto supera el 10 %, primero consolida.
  - Una caída aislada → mantiene la carga.
  - Dos sesiones por debajo del rango → baja la carga.
  - Tres caídas seguidas → sugiere descarga.
  - Dolor → no progresa y sugiere consultar a un profesional.
  - Datos faltantes → los pide.
- **Revisión:** la recomendación se muestra con el mensaje, la evidencia («la última vez hiciste…») y la confianza, y **nunca se aplica sin que el usuario la vea**. Se usa como valor sugerido al abrir la siguiente sesión.
- **Generador de rutinas** (routine.ts):
  - División según los días: 2–3 cuerpo completo, 4 torso/pierna, 5 PPL más torso/pierna, 6 PPL ×2.
  - Filtra por equipo y dificultad.
  - **Prioriza ejercicios con foto**.
  - 2 series por ejercicio para principiantes y 3 para los demás.
  - Techo de series semanales por músculo de 10, 12, 16 o 20 según la experiencia.
  - Descanso de 150 s en compuestos y 90 s en aislamiento.
- **Récords**: se detectan al terminar la sesión comparando con el historial. La primera sesión de un ejercicio no cuenta como récord.

## 5. Integración con nutrición (sin romper los cálculos actuales)
- **No cambies la fórmula actual de kcal_objetivo.** El nivel de actividad de Nutrion ya incluye el ejercicio; sumar más sería contarlo dos veces.
- Los días con sesión completada, muestra en Inicio la sugerencia «Hoy entrenaste: incluye proteína en tu siguiente comida o colación». Ofrece del catálogo una colación alta en proteína (yogur griego, huevo, pollo, queso panela, frijoles) que respete alergias y gustos.
- **Puntos Nutrion:** suma 15 puntos por sesión completada y 10 por récord personal, igual que se suman al guardar un menú.
- **Logros nuevos:** primera sesión, 10 sesiones, primer récord y semana cumplida.

## 6. Diseño
- **Respeta el estilo actual de Nutrion** (pastel, kawaii, redondeado, mascota). No uses el tema oscuro de AXOLOFIT.
- El ajolote fuerte de AXOLOFIT puede aparecer en Entrenar como compañero de entrenamiento, con estas imágenes:
  - https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/lift.png
  - https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/trophy.png
  - https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/coach.png
  - https://raw.githubusercontent.com/axelfoleymx/AXOLOFIT/main/public/mascot/rest.png
- Primero para móvil, con botones grandes para registrar series rápido entre una serie y otra.
- Cada página dentro de un límite de errores con botón «Reintentar».
- **No conectes la API de GitHub.** Los enlaces raw son públicos y solo sirven para que tú leas los archivos.

## 7. Verificación antes de terminar
1. Con un usuario nuevo, abrir Entrenar → contestar las 3 preguntas → se genera la rutina y los ejercicios tienen foto cuando existe.
2. Hacer press de banca con 30 kg × 10, 9 y 8, RIR 2, y terminar. La recomendación debe decir «Mantén 30 kg… intenta 10, 10, 9».
3. Repetir con 12, 12 y 12. Debe recomendar subir a 32.5 kg.
4. Menú, Inicio, Aprende y Perfil siguen funcionando igual y no hay errores en consola.
