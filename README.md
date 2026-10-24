# ATHLETIQ

React + TypeScript + Tailwind v4 + Dexie (IndexedDB). Supabase está preparado, pero no conectado.

```bash
npm install && npm run dev      # http://localhost:5173
npm test                        # 92 pruebas unitarias e integración
npm run validate:schema         # aplica la migración SQL en PGlite y comprueba RLS
```

## Estado

**Implementado y probado en el navegador (localhost, móvil 375 px y escritorio 1360 px):** cuenta local, onboarding de 8 pasos, cálculo de objetivos transparente, diario de comidas (agregar/editar/borrar/deshacer/copiar de ayer), dashboard en tiempo real, rutina generada, sesión en vivo con temporizador, resumen y recomendación de progresión doble, peso con promedio de 7 días y tendencia, coach en modo datos y planificador de menús.

**Implementado y probado solo con pruebas automáticas:** motores de cálculo, persistencia, aislamiento entre usuarios, cola de sincronización (sin conexión, errores, duplicados, conflictos) y esquema SQL con RLS en PGlite.

**Escrito pero sin probar:** sincronización real con Supabase, Edge Functions (`coach`, `delete-account`, `usda-search`) y coach con IA (falta `ANTHROPIC_API_KEY`). La búsqueda en USDA necesita `USDA_API_KEY`. Open Food Facts funciona sin clave. HealthKit y Health Connect requieren una app nativa.

**Pendiente:** pruebas de interfaz automatizadas (Playwright), escáner de cámara para el código de barras, PWA offline (service worker) y fotos en el almacenamiento de Supabase.

**Datos:** catálogo Nutrion deduplicado (364 alimentos, 224 recetas, 100 bebidas, 37 condiciones). Algunas recetas del origen tienen nombres que no coinciden con sus ingredientes. Los ejercicios vienen de MuscleWiki: se extrajeron 481 y quedaron 357 en la biblioteca, solo con datos factuales. La técnica se enlaza a la página de MuscleWiki.

## Datos para Base44
`data/base44/` contiene CSV listos para importar como entidades: Alimento (364), RecetaMexicana (224), BebidaMexicana (100), EnfermedadAlimento (6 945), EducacionAprende (21), EducacionMetaNutricional (480) y Ejercicio (357). Están deduplicados y sin correos. Los valores nutricionales vienen expresados por 100 g. Para regenerarlos: `python3 -I scripts/export_base44.py src/data data/base44`.
