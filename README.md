# ATHLETIQ

React + TypeScript + Tailwind v4 + Dexie (IndexedDB). Supabase está preparado, pero no conectado.

```bash
npm install && npm run dev      # http://localhost:5173
npm test                        # 92 pruebas unitarias e integración
npm run test:e2e                # 6 pruebas de interfaz (Playwright, móvil Pixel 7 + escritorio)
npm run validate:schema         # aplica la migración SQL en PGlite y comprueba RLS
```

## Estado

**Implementado y probado en el navegador (localhost, móvil 375 px y escritorio 1360 px):** cuenta local, onboarding de 8 pasos, cálculo de objetivos transparente, diario de comidas (agregar/editar/borrar/deshacer/copiar de ayer), dashboard en tiempo real, rutina generada, sesión en vivo con temporizador, resumen y recomendación de progresión doble, peso con promedio de 7 días y tendencia, coach en modo datos y planificador de menús.

**Pruebas de interfaz automatizadas (Playwright, móvil y escritorio):** crear cuenta y onboarding (TMB verificada), registrar/editar/borrar comida con totales correctos y persistencia tras recargar, sesión en vivo con recomendación 10/10/9, navegación y coach.

**Instalable y sin conexión (PWA):** la app, los catálogos y las imágenes quedan en caché; se puede registrar sin internet (IndexedDB) y la cola se sincroniza al volver la conexión cuando hay backend.

**Implementado y probado solo con pruebas automáticas:** motores de cálculo, persistencia, aislamiento entre usuarios, cola de sincronización (sin conexión, errores, duplicados, conflictos) y esquema SQL con RLS en PGlite.

**Escrito pero sin probar:** sincronización real con Supabase, Edge Functions (`coach`, `delete-account`, `usda-search`) y coach con IA (falta `ANTHROPIC_API_KEY`). La búsqueda en USDA necesita `USDA_API_KEY`. Open Food Facts funciona sin clave. HealthKit y Health Connect requieren una app nativa.

**Escáner de código de barras con cámara:** usa BarcodeDetector (Chrome/Edge en Android y escritorio). Safari/iOS no lo soporta: ahí se escribe el código. No probado con cámara real en este entorno.

**Fotos de progreso:** se guardan en el dispositivo; con Supabase también se suben al bucket privado `progress-photos/{userId}/` (no probado contra un proyecto real).

**Pendiente:** conectar un proyecto Supabase real y probar la sincronización; configurar ANTHROPIC_API_KEY para el coach con IA; app nativa para HealthKit/Health Connect.

**Datos:** catálogo Nutrion deduplicado (364 alimentos, 224 recetas, 100 bebidas, 37 condiciones). Algunas recetas del origen tienen nombres que no coinciden con sus ingredientes. Los ejercicios vienen de MuscleWiki: se extrajeron 481 y quedaron 357 en la biblioteca, solo con datos factuales. La técnica se enlaza a la página de MuscleWiki.

## Datos para Base44
`data/base44/` contiene CSV listos para importar como entidades: Alimento (364), RecetaMexicana (224), BebidaMexicana (100), EnfermedadAlimento (6 945), EducacionAprende (21), EducacionMetaNutricional (480) y Ejercicio (357; 93 con foto de inicio y fin de Free Exercise DB, emparejadas a mano). Están deduplicados y sin correos. Los valores nutricionales vienen expresados por 100 g. Para regenerarlos: `python3 -I scripts/export_base44.py src/data data/base44` y luego `python3 -I scripts/match_exercise_images.py <exercises.json de Free Exercise DB> src/data/musclewiki.txt data/base44/Ejercicio.csv`.

Auditoría de la versión publicada en Base44: `AUDITORIA_UX.md`.
