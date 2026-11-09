import { expect, test, type Page } from '@playwright/test'

/** World point (sheet units) → page pixels, read from the canvas's viewBox. */
async function screen(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => {
      const svg = document.querySelector('svg[role=application]') as SVGSVGElement
      const r = svg.getBoundingClientRect()
      const vb = svg.viewBox.baseVal
      const z = r.width / vb.width
      return { x: r.left + (x! - vb.x) * z, y: r.top + (y! - vb.y) * z }
    },
    [x, y],
  )
}

async function press(page: Page, x: number, y: number, holdMs = 120) {
  const p = await screen(page, x, y)
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.waitForTimeout(holdMs)
  await page.mouse.up()
}

async function dragWorld(page: Page, from: [number, number], to: [number, number]) {
  const a = await screen(page, ...from)
  const b = await screen(page, ...to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 20 })
  await page.mouse.up()
}

const coilOn = (page: Page) => page.locator('.coil.on')
const lampOn = (page: Page) => page.locator('.lamp-body.on')

// Any error thrown in the page fails the test, even if the screen looks fine.
let pageErrors: string[] = []
test.afterEach(() => expect(pageErrors).toEqual([]))

test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('/')
  await expect(page.locator('svg[role=application]')).toBeVisible()
})

test('start/stop with self-holding works on the first visit', async ({ page }) => {
  await expect(coilOn(page)).toHaveCount(0)
  await press(page, 178, 300) // S1 head: start
  await expect(coilOn(page)).toHaveCount(1)
  await expect(lampOn(page)).toHaveCount(1) // still on after release: self-holding
  await press(page, 178, 180) // S2 head: stop
  await expect(coilOn(page)).toHaveCount(0)
})

test('adding a part from the palette, and undo takes it back', async ({ page }) => {
  const status = page.locator('footer.status')
  await expect(status).toContainText('Parts 6')
  await page.getByRole('button', { name: 'Pilot lamp' }).click()
  await expect(status).toContainText('Parts 7')
  await page.keyboard.press('Control+z')
  await expect(status).toContainText('Parts 6')
})

test('dragging a part moves it with its wires', async ({ page }) => {
  await dragWorld(page, [412, 445], [612, 445]) // H1 body, 200 to the right
  await expect(page.locator('.hist li.cur')).toHaveText('Move H1')
  await expect(page.locator('path.wire')).toHaveCount(8)
})

test('dragging on empty space selects an area; the middle button moves the view', async ({ page }) => {
  const viewBox = () => page.evaluate(() => (document.querySelector('svg[role=application]') as SVGSVGElement).viewBox.baseVal.x)
  const before = await viewBox()
  await dragWorld(page, [100, 120], [250, 345]) // around S2 and S1 only
  await expect(page.locator('.insp')).toContainText('Selected: parts 2, wires 1')
  expect(await viewBox()).toBe(before)

  const box = (await page.locator('svg[role=application]').boundingBox())!
  const a = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.5 } // inside the canvas, whatever the zoom
  await page.mouse.move(a.x, a.y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(a.x - 100, a.y, { steps: 10 })
  await page.mouse.up({ button: 'middle' })
  expect(await viewBox()).toBeGreaterThan(before)
})

test('drawing a wire by dragging between two terminals', async ({ page }) => {
  await page.locator('summary', { hasText: 'Examples' }).click()
  await page.getByRole('menuitem', { name: 'Lamp' }).click()
  const wires = page.locator('path.wire')
  await expect(wires).toHaveCount(3)
  await dragWorld(page, [460, 280], [262, 318]) // S2:2 → H1:X1
  await expect(wires).toHaveCount(4)
})

test('the sheet is saved in the browser and comes back after a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'New sheet' }).click()
  await page.getByRole('button', { name: 'Pushbutton, NO' }).click()
  await expect(page.locator('footer.status')).toContainText('Saved in this browser')
  await page.reload()
  await expect(page.locator('footer.status')).toContainText('Parts 1')
  await expect(page.locator('footer.status')).toContainText('Opened your last sheet')
})
