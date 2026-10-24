import { expect, test, type Page } from '@playwright/test'

// Cuenta de prueba solo para el modo local; cada ejecución usa un correo distinto.
const email = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@athletiq.test`

async function signupAndOnboard(page: Page) {
  await page.goto('/')
  await page.getByLabel('Nombre').fill('Prueba')
  await page.getByLabel('Correo').fill(email())
  await page.getByLabel('Contraseña').fill('Prueba-Local-2026')
  await page.getByRole('button', { name: 'Crear cuenta' }).last().click()

  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.getByLabel('Edad').fill('30')
  await page.getByLabel('Estatura').fill('180')
  await page.getByLabel('Peso actual').fill('80')
  await page.getByRole('radio', { name: 'Masculino' }).click()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.getByRole('radio', { name: 'Mantenimiento' }).click()
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: /Continuar/ }).click()
  await page.getByRole('radio', { name: /Intermedio/ }).click() // 3 series por ejercicio
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Continuar/ }).click()
  // TMB Mifflin-St Jeor hombre 80 kg / 180 cm / 30 años = 1 780 kcal
  await expect(page.getByText('1,780 kcal')).toBeVisible()
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByText('Nutrición de hoy')).toBeVisible()
}

test('crear cuenta, registrar comida con cálculo correcto y editarla', async ({ page }) => {
  await signupAndOnboard(page)
  await page.goto('/nutricion?add=1')
  await page.getByLabel('Buscar alimento').fill('pechuga de pollo')
  await page.getByRole('button', { name: /^Pechuga de pollo por 100 g/ }).click()
  await page.getByLabel('Cantidad').fill('150')
  await expect(page.getByRole('dialog').getByText('46.5')).toBeVisible() // 31 g/100 g × 1.5
  await page.getByRole('button', { name: 'Añadir', exact: true }).click()
  await expect(page.getByText('Pechuga de pollo · 150 g')).toBeVisible()
  await expect(page.getByText('248 kcal · P 46.5')).toBeVisible()

  await page.getByRole('button', { name: 'Editar Pechuga de pollo' }).click()
  await page.getByLabel('Gramos').fill('200')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('330 kcal · P 62 · C 0')).toBeVisible()

  // Persistencia: tras recargar, el registro sigue ahí
  await page.reload()
  await expect(page.getByText('Pechuga de pollo · 200 g')).toBeVisible()

  await page.getByRole('button', { name: 'Eliminar Pechuga de pollo' }).click()
  await expect(page.getByText('Pechuga de pollo · 200 g')).toHaveCount(0)
})

test('entrenamiento en vivo y recomendación calculada con el historial', async ({ page }) => {
  await signupAndOnboard(page)
  await page.goto('/entrenar')
  await page.getByRole('button', { name: /^Empezar/ }).first().click()
  await expect(page.getByText('En vivo')).toBeVisible()
  const first = page.locator('section').first()
  const warmups = await first.getByText(/^C\d$/).count()
  const reps = [10, 9, 8]
  for (let i = 0; i < 3; i++) {
    const n = warmups + i + 1
    await first.getByLabel(`Peso serie ${n}`).fill('30')
    await first.getByLabel(`Repeticiones serie ${n}`).fill(String(reps[i]))
    await first.getByLabel(`RIR serie ${n}`).fill('2')
    await first.getByRole('button', { name: `Marcar serie ${n} como completada` }).click()
  }
  await expect(page.getByRole('timer')).toBeVisible()
  await page.getByRole('button', { name: 'Terminar' }).click()
  await page.getByRole('button', { name: 'Guardar y ver resumen' }).click()
  await expect(page.getByText('¡Sesión completada!')).toBeVisible()
  await expect(page.getByText(/Intenta 10, 10, 9/)).toBeVisible()
})

test('navegación principal accesible', async ({ page, isMobile }) => {
  await signupAndOnboard(page)
  const nav = isMobile ? page.getByRole('navigation', { name: 'Navegación principal' }) : page.locator('aside')
  for (const [label, heading] of [['Nutrición', 'Nutrición'], ['Entrenar', 'Entrenamiento'], ['Progreso', 'Progreso'], ['Perfil', 'Mis datos']] as const) {
    await nav.getByRole('link', { name: label }).click()
    await expect(page.getByRole('main').getByText(heading, { exact: true }).first()).toBeVisible()
  }
  await page.goto('/coach')
  await page.getByLabel('Pregunta para el coach').fill('¿Cuánta proteína me falta hoy?')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText(/Te faltan/)).toBeVisible()
})
