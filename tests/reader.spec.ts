import { test, expect } from '@playwright/test';

let runtimeErrors: string[] = [];
test.afterEach(() => { expect(runtimeErrors).toEqual([]); });
test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toHaveCount(3, { timeout: 30000 });
  await expect(page.getByTestId('mapping-status')).toContainText('Связано', { timeout: 15000 });
});

test('prepared PDF pairs render and select in both directions', async ({ page }, info) => {
  console.log('Mapping:', await page.getByTestId('mapping-status').textContent());
  await expect(page.getByTestId('mapping-status')).toHaveText('Связано 42 из 42 фрагментов');
  await page.screenshot({ path: info.outputPath('initial.png'), fullPage: true });
  await expect(page.locator('.pdf-page > canvas')).toHaveCount(3);
  await page.getByRole('button', { name: 'Выбрать фрагмент 1', exact: true }).click();
  await expect(page.locator('[data-region="0"].active').first()).toBeVisible();
  await expect(page.getByTestId('connector')).toBeVisible();
  const region = page.locator('[data-region="0"]').first();
  const box = await region.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.locator('[data-segment="0"]')).toHaveClass(/is-selected/);
  await page.screenshot({ path: info.outputPath('reader.png'), fullPage: true });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-segment="1"]')).toHaveClass(/is-selected/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.is-selected')).toHaveCount(0);
});

test('hover does not scroll; independent and linked scrolling differ', async ({ page }) => {
  const left = page.getByTestId('pdf-panel'), right = page.getByTestId('translation-panel');
  await page.getByRole('button', { name: 'Связанная прокрутка' }).click();
  const initialRight = await right.evaluate(e => e.scrollTop);
  await left.evaluate(e => { e.scrollTop = 350; });
  await page.waitForTimeout(150);
  expect(await right.evaluate(e => e.scrollTop)).toBe(initialRight);
  const before = await left.evaluate(e => e.scrollTop);
  await page.getByRole('button', { name: 'Выбрать фрагмент 2', exact: true }).hover();
  expect(await left.evaluate(e => e.scrollTop)).toBe(before);
  await page.getByRole('button', { name: 'Независимая прокрутка' }).click();
  await left.evaluate(e => { e.scrollTop += 400; });
  await expect.poll(() => right.evaluate(e => e.scrollTop)).not.toBe(initialRight);
  await page.waitForTimeout(300);
  const stable = await left.evaluate(e => e.scrollTop);
  await page.waitForTimeout(300);
  expect(await left.evaluate(e => e.scrollTop)).toBeCloseTo(stable, 0);
});

test('scaling keeps source coordinates and formula reading available', async ({ page }) => {
  await page.getByRole('button', { name: 'Выбрать фрагмент 10', exact: true }).click();
  const before = await page.locator('[data-region="9"]').first().evaluate(e => ({ x: (e as HTMLElement).style.left, y: (e as HTMLElement).style.top }));
  await page.getByLabel('Масштаб PDF').selectOption('1.5');
  await expect(page.locator('[data-ready="true"]')).toHaveCount(3);
  const after = await page.locator('[data-region="9"]').first().evaluate(e => ({ x: (e as HTMLElement).style.left, y: (e as HTMLElement).style.top }));
  expect(parseFloat(after.x)).toBeCloseTo(parseFloat(before.x), 1);
  expect(parseFloat(after.y)).toBeCloseTo(parseFloat(before.y), 1);
  await expect.poll(() => page.evaluate(() => Math.abs(
    document.querySelector('[data-region="9"]')!.getBoundingClientRect().top -
    document.querySelector('[data-segment="9"] .translation-body')!.getBoundingClientRect().top
  ))).toBeLessThan(2);
  await page.locator('[data-segment="9"] [data-formula="state"]').click();
  await expect(page.getByRole('dialog', { name: 'Чтение формулы' })).toContainText('s of t');
  await expect(page.getByRole('dialog').locator('svg')).toBeVisible();
});

test('manual region replacement applies only after confirmation and can reset', async ({ page }) => {
  await page.getByRole('button', { name: 'Выбрать фрагмент 1', exact: true }).click();
  const original = await page.locator('[data-region="0"]').count();
  await page.getByRole('button', { name: 'Исправить привязку', exact: true }).click();
  await page.getByTestId('pdf-panel').evaluate(e => { e.scrollTop = 0; });
  const pdf = page.locator('[data-page="3"]');
  const box = await pdf.boundingBox();
  await page.mouse.move(box!.x + 180, box!.y + 130);
  await page.mouse.down();
  await page.mouse.move(box!.x + 360, box!.y + 160);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Применить привязку' })).toBeEnabled();
  await page.getByRole('button', { name: 'Применить привязку' }).click();
  await expect(page.getByTestId('selection-status')).toContainText('исправлена вручную');
  await expect(page.locator('[data-region="0"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(page.locator('[data-region="0"]')).toHaveCount(original);
});

test('formula region edits survive scaling and a cancelled edit is discarded', async ({ page }) => {
  await page.getByRole('button', { name: 'Выбрать фрагмент 10', exact: true }).click();
  await page.locator('[data-segment="9"] [data-formula="state"]').click();
  await page.getByRole('button', { name: 'Исправить область формулы' }).click();
  const box = await page.locator('[data-region="9"]').first().boundingBox();
  await page.mouse.move(box!.x + 15, box!.y + 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 65, box!.y + 14);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Применить привязку' }).click();
  const pin = page.locator('.formula-hit[data-formula="state"]').first();
  const before = await pin.evaluate(e => ({ left: (e as HTMLElement).style.left, top: (e as HTMLElement).style.top }));
  await page.getByLabel('Масштаб PDF').selectOption('0.75');
  await expect(page.locator('[data-ready="true"]')).toHaveCount(3);
  const after = await pin.evaluate(e => ({ left: (e as HTMLElement).style.left, top: (e as HTMLElement).style.top }));
  expect(after).toEqual(before);
  await page.getByRole('button', { name: 'Выбрать фрагмент 1', exact: true }).click();
  const original = await page.locator('[data-region="0"]').count();
  await page.getByRole('button', { name: 'Исправить привязку', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-region="0"]')).toHaveCount(original);
  await expect(page.locator('.repair-bar')).toHaveCount(0);
});


test('every prepared formula has a direct PDF target and a translation target', async ({ page }) => {
  const pdf = await page.locator('.formula-hit').evaluateAll(es => [...new Set(es.map(e => e.getAttribute('data-formula')))].sort());
  const ru = await page.locator('.formula-inline').evaluateAll(es => [...new Set(es.map(e => e.getAttribute('data-formula')))].sort());
  expect(pdf).toEqual(ru);
  expect(pdf).toHaveLength(21);
  await expect(page.locator('[data-segment="9"] .formula-inline')).toHaveCount(4);
});

test('each formula in the example opens its own nearby reading on both sides', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Выбрать фрагмент 10', exact: true }).click();
  for (const [id, reading] of [['state', 's of t'], ['time', 't'], ['action', 'a of t'], ['next-state', 's of t plus one']]) {
    const token = page.locator('[data-side="ru"][data-formula="' + id + '"]');
    await token.click();
    const dialog = page.getByRole('dialog', { name: 'Чтение формулы' });
    await expect(dialog.locator('p')).toHaveText(reading);
    const a = await token.boundingBox(), b = await dialog.boundingBox();
    expect(Math.min(Math.abs(b!.y - a!.y - a!.height), Math.abs(a!.y - b!.y - b!.height))).toBeLessThanOrEqual(12);
  }
  await page.keyboard.press('Escape');
  for (const [id, reading] of [['state', 's of t'], ['time', 't'], ['action', 'a of t'], ['next-state', 's of t plus one']]) {
    const source = page.locator('.formula-hit[data-formula="' + id + '"]').first();
    await source.click();
    await expect(page.getByRole('dialog').locator('p')).toHaveText(reading);
    const a = await source.boundingBox(), b = await page.getByRole('dialog').boundingBox();
    expect(Math.min(Math.abs(b!.y - a!.y - a!.height), Math.abs(a!.y - b!.y - b!.height))).toBeLessThanOrEqual(12);
  }
  await page.screenshot({ path: info.outputPath('inline-formula.png'), fullPage: true });
});

test('linked selection and scrolling align the actual beginnings of the pair', async ({ page }, info) => {
  const difference = async (id: number) => page.evaluate(id => {
    const region = document.querySelector<HTMLElement>('[data-region="' + id + '"]')!;
    const body = document.querySelector<HTMLElement>('[data-segment="' + id + '"] .translation-body')!;
    return Math.abs(region.getBoundingClientRect().top - body.getBoundingClientRect().top);
  }, id);
  await page.getByRole('button', { name: 'Выбрать фрагмент 10', exact: true }).click();
  await expect.poll(() => difference(9)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Выбрать фрагмент 29', exact: true }).click();
  await expect.poll(() => difference(28)).toBeLessThan(2);
  const left = page.getByTestId('pdf-panel'), right = page.getByTestId('translation-panel');
  await left.evaluate(e => { e.scrollTop += 100; });
  await expect.poll(async () => {
    const id = Number(await page.locator('.reader').getAttribute('data-sync-anchor'));
    return difference(id);
  }).toBeLessThan(2);
  await right.evaluate(e => { e.scrollTop += 100; });
  await expect.poll(async () => {
    const id = Number(await page.locator('.reader').getAttribute('data-sync-anchor'));
    return difference(id);
  }).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath('aligned-pair.png'), fullPage: true });
});

test('selecting and escaping does not reflow text or leave hover and focus frames', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Связанная прокрутка' }).click();
  const metrics = () => page.getByTestId('translation-panel').evaluate(panel => ({
    height: panel.scrollHeight,
    positions: [...panel.querySelectorAll('.translation-body')].map(e => ({
      top: e.getBoundingClientRect().top + panel.scrollTop,
      height: e.getBoundingClientRect().height,
    })),
  }));
  const before = await metrics();
  await page.getByRole('button', { name: 'Выбрать фрагмент 1', exact: true }).click();
  expect(await metrics()).toEqual(before);
  const scrollTop = await page.getByTestId('translation-panel').evaluate(e => e.scrollTop);
  await page.keyboard.press('Escape');
  await expect(page.locator('.is-selected, .segment.is-active, .highlight.active')).toHaveCount(0);
  expect(await page.getByTestId('translation-panel').evaluate(e => e.scrollTop)).toBe(scrollTop);
  expect(await metrics()).toEqual(before);
  expect(await page.evaluate(() => !!document.activeElement?.closest('.segment'))).toBe(false);
  await expect(page.getByText('Совпадение по тексту')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('after-escape.png'), fullPage: true });
});
