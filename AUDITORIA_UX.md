# Auditoría de AXOLOFIT publicada (axolofit.base44.app) — 24 oct 2026

Versión revisada: `index-DAxKZ2ZI.js`, en móvil (375 px) y con la sesión de un usuario real.

## 1. Costo de IA
- La app hace **una sola llamada de IA**: la función de servidor `coachExplain`. Se usa en la pestaña Coach y solo se dispara cuando el usuario pulsa «Preguntar» o una pregunta sugerida.
- La llamada es de un solo turno: envía la pregunta y un resumen de datos ya calculados, sin historial, sin bucle de herramientas ni respuestas largas. Es la forma más barata posible.
- El menú, las calorías, la progresión y las estadísticas son código determinista y **no gastan IA**.
- **Recomendación:** no quitar el coach, pero limitarlo:
  - Máximo 5 preguntas por usuario al día, guardando el contador en una entidad.
  - Las preguntas sugeridas se contestan con plantillas sobre los datos, sin IA.
  - Respuestas de 120 palabras como máximo.
  - Respuesta guardada en caché si se repite la misma pregunta el mismo día.

## 2. Fallos
1. **Buscador de alimentos:** «pechuga de pollo» no da resultados y «pollo» sí. Falla cuando se buscan varias palabras.
2. **Diario:** no se puede editar la cantidad de un registro y el borrado no se puede deshacer.
3. **Ejercicios de peso corporal:** «Buenos días» (peso corporal) pide kilos; debería ocultar los kilos o permitir lastre opcional.
4. **Nombre ambiguo:** el ejercicio «Buenos días» se confunde con un saludo. Debe decir «Buenos días (good morning)» o «Bisagra de cadera "good morning"».
5. **Inicio con sesión en curso:** Hoy dice «Empezar sesión» aunque hay una sesión en curso; debe decir «Continuar sesión».
6. **Marca inconsistente:** la pestaña del navegador dice «ATHLETIQ» y la app dice «AXOLOFIT».
7. **Texto:** dice «1 día seguidos»; debe decir «1 día seguido».

## 3. Cálculos que no siguen el prompt
- **Factor de actividad:** usa 1.25 en vez de 1.3 para «ligera».
- **Entrenamiento:** suma 219 kcal en vez de unas 139 (MET 5).
- **Déficit:** 668 kcal, por encima del tope del 25 % del gasto.
- **Proteína:** 2.2 g/kg en vez de 1.8.
- **Reparto del menú:** 28/36/10/26 en vez de 27/38/10/25.
- **Menú:** porciones arriba de 1.5×, chiles y salsas escalados (157 g de chile serrano) y la colación omitida.

## 4. Registro inicial (onboarding)
Hoy son 5 pasos con unas 30 preguntas, entre ellas el descanso entre series, el seguimiento de fibra, el presupuesto, las intolerancias, el gimnasio y la actividad extra. Es demasiado para el primer minuto: la gente abandona antes de ver valor.

**Propuesta: 3 pantallas de unos 20 segundos cada una, y después la «revelación» de tus números.**
1. **Tú:** sexo, edad, estatura y peso, con selectores grandes y valores típicos ya puestos.
2. **Tu meta:** objetivo y ritmo como 4 tarjetas con ilustración del ajolote.
3. **Tu entreno:** días por semana (chips 2–6) y lugar: «Gimnasio completo», «Casa con mancuernas» o «Solo peso corporal». El lugar define el equipo automáticamente.
4. **Pantalla de resultado** con animación: «Tu plan: 1,750 kcal · 145 g de proteína» y el desglose desplegable.

Todo lo demás se pregunta **en contexto, cuando hace falta**:
- Alergias y gustos: al abrir Nutrición por primera vez.
- Condiciones de salud: tarjeta opcional en Perfil.
- Descanso entre series: ajuste del cronómetro.
- Agua y fibra: activados por defecto.
- Pasos y sueño: tarjeta en Hoy.

## 5. Hacerla más amigable y llamativa
- **Hoy:**
  - El anillo vacío y gris se ve apagado. Mejor que la mascota diga algo según la hora («¿Ya desayunaste? Registra en 10 s») y poner 3 botones grandes: comida, agua +250 y peso.
  - Las tarjetas de peso, racha, sesiones y agua repiten información: dejar 2, con mini gráficas.
- **Navegación:** 6 pestañas abajo es demasiado en móvil. Mejor 5: Hoy, Comida, Entrenar, Progreso y Perfil. El Coach pasa a un botón flotante con el ajolote.
- **Ejercicios:** foto de inicio y fin en cada ejercicio (93 ya emparejados, ver `data/base44/Ejercicio.csv`), además del enlace a MuscleWiki.
- **Celebraciones:**
  - Al terminar una sesión, al romper un récord y al cumplir la proteína: ajolote con trofeo, confeti breve y vibración.
  - Nada de castigos: perder una racha no muestra un mensaje negativo.
- **Comida mexicana como protagonista:** foto o emoji por platillo, tarjetas de recetas con tiempo y precio, y búsqueda por antojo («tacos», «chilaquiles»).
- **Microcopys cálidos y directos** con tono mexicano, sin regaños.

## 6. Prioridad: bebidas y refresco
El catálogo **BebidaMexicana (100 bebidas) y EnfermedadAlimento no se usan en la app publicada**, y para el usuario mexicano el refresco es la batalla principal.
- **Bebidas en el diario:**
  - Botón «+ Bebida» con las más comunes arriba (Coca-Cola, agua de horchata, café de olla…).
  - Cada una muestra kcal y **cucharaditas de azúcar** (azúcar_g ÷ 4).
- **Contador «Refresco»:**
  - Registrar refrescos con un toque.
  - Mostrar el azúcar en cucharaditas y el dinero gastado por semana.
  - Racha de «días sin refresco» y logros (3, 7, 30 días).
- **Cambios sugeridos**, sin prohibir:
  - Al registrar un refresco, ofrecer 2–3 alternativas del catálogo con perfil saludable: agua mineral con limón, jamaica sin azúcar, refresco sin azúcar como paso intermedio.
  - Mostrar cuánto azúcar te ahorras.
- **Meta de reducción gradual:** «De 3 a 2 refrescos al día esta semana». No de golpe.
- **Condiciones:** si el usuario marca diabetes, obesidad o hipertensión, mostrar las bebidas y alimentos «recomendados» y «moderados» de EnfermedadAlimento como guía educativa, con el aviso de que no sustituye al médico.
