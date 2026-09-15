import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Номера демо-заявок из backend/app/seed.py
const OVERDUE_REVIEW = "AUT-2026-000006"; // Ковалёв, на рассмотрении, срок просрочен
const CLARIFICATION = "AUT-2026-000007"; // Ахметова, требуется уточнение
const VIEWED_REVIEW = "AUT-2026-000008"; // Ахметова, на рассмотрении
const REJECTED = "AUT-2026-000004"; // Никитин, отклонена

async function loginAs(page: Page, login: string) {
  await page.addInitScript((value) => window.localStorage.setItem("zayavki.devUser", value), login);
}

async function openFromRegistry(page: Page, number: string) {
  await page.goto("/admin/registry");
  await page.getByRole("searchbox", { name: "Поиск" }).fill(number);
  await page.getByRole("link", { name: number, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(number);
}

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(serious.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("заявитель подаёт заявку с клавиатуры через пункт меню «Новая заявка»", async ({ page }) => {
  // Аудит БЛ-2 (пункт меню ронял приложение), A-1 (выбор типа и тематики был недоступен с клавиатуры), Л-3 (живой пересчёт).
  await loginAs(page, "o.smirnova");
  await page.goto("/");
  await expect(page).toHaveURL(/\/requests$/);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("link", { name: "Новая заявка" }).click();
  await expect(page.getByRole("heading", { name: "Новая заявка на автоматизацию" })).toBeVisible();

  await expect(page.getByLabel("ФИО")).toHaveValue("Смирнова Ольга Викторовна");
  await page.getByLabel("Телефон для связи").fill("+7 912 345-67-89 доб. 204");
  await page.getByLabel("Даю согласие на обработку").check();
  await page.getByLabel("Структурное подразделение").press("Enter"); // Enter переводит на следующий шаг
  await expect(page.getByText("Шаг 2 из 5: Тип и тематика")).toBeVisible();

  await page.getByRole("radio", { name: "Новая автоматизация", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Новая автоматизация", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Производство", exact: true }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Планирование", exact: true })).toBeChecked();
  await page.getByRole("button", { name: /Далее/ }).click();

  await page.getByLabel("Как процесс выполняется сейчас").fill("Планировщик раз в неделю вручную сводит графики смен трёх участков в одну таблицу.");
  await page.getByLabel("Что именно требует автоматизации и почему").fill("Сведение занимает полдня, часто теряются правки мастеров.");
  await page.getByLabel("Как процесс должен работать после автоматизации").fill("Мастера вносят смены в общую форму, сводный график собирается автоматически.");
  await page.getByLabel("Кто получит выгоду").fill("Планово-диспетчерский отдел, мастера участков");
  await page.getByLabel("Кто получает результат процесса").fill("Начальник производства");
  await page.getByRole("button", { name: /Далее/ }).click();

  await page.getByLabel("Как часто выполняется операция").selectOption("week");
  await page.getByLabel("Сколько длится одна операция").fill("1,5");
  await page.getByLabel("Сколько раз в неделю").fill("2");
  await page.getByLabel("Сколько сотрудников её выполняют").fill("3");
  await expect(page.getByText(/Около\s+39 ч/)).toBeVisible();
  await page.getByRole("button", { name: /Далее/ }).click();

  await expect(page.getByRole("heading", { name: "Проверьте заявку перед отправкой" })).toBeVisible();
  await expect(page.getByText("около 39 ч в месяц")).toBeVisible();
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page.getByRole("alert")).toContainText("Подтвердите, что данные указаны верно");
  await page.getByLabel("Подтверждаю, что данные указаны верно").check();
  await page.getByRole("button", { name: "Отправить заявку" }).click();

  await expect(page.getByText(/Заявка AUT-2026-\d{6} зарегистрирована/)).toBeVisible();
  await expect(page.getByText("На рассмотрении", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("+7 (912) 345-67-89 доб. 204")).toBeVisible();
});

test("поля в одном ряду выровнены по вертикали, даже если подсказки разной длины", async ({ page }) => {
  await loginAs(page, "o.smirnova");
  await page.goto("/requests/new");
  const top = async (label: string) => (await page.getByLabel(label).boundingBox())!.y;

  // Шаг 1: у телефона подсказка есть, у региона — нет
  expect(await top("Телефон для связи")).toBe(await top("Регион"));

  await page.getByLabel("Телефон для связи").fill("+7 912 345-67-89");
  await page.getByLabel("Даю согласие на обработку").check();
  await page.getByRole("button", { name: /Далее/ }).click();
  await page.getByRole("radio", { name: "Новая автоматизация", exact: true }).check();
  await page.getByRole("radio", { name: "Производство", exact: true }).check();
  await page.getByRole("button", { name: /Далее/ }).click();

  // Шаг 3: подсказки переносятся на разное число строк; счётчик символов под одним полем тоже ничего не сдвигает
  expect(await top("Кто получит выгоду")).toBe(await top("Кто получает результат процесса"));
  await page.getByLabel("Кто получит выгоду").fill("x".repeat(3500));
  await expect(page.getByText("3500 из 4000 символов")).toBeVisible();
  expect(await top("Кто получит выгоду")).toBe(await top("Кто получает результат процесса"));
  await expectNoSeriousA11yViolations(page);
});

test("ошибки показываются у полей и в сводке со ссылками", async ({ page }) => {
  await loginAs(page, "a.nikitin");
  await page.goto("/requests/new");
  await page.getByLabel("Телефон для связи").fill("0000000000");
  await page.getByRole("button", { name: /Далее/ }).click();
  const summary = page.getByRole("alert").filter({ hasText: "Проверьте" });
  await expect(summary).toBeFocused();
  await expect(page.getByLabel("Телефон для связи")).toHaveAttribute("aria-invalid", "true");
  await summary.getByRole("button", { name: "Телефон" }).click();
  await expect(page.getByLabel("Телефон для связи")).toBeFocused();
  await expectNoSeriousA11yViolations(page);
});

test("черновик хранится на сервере, а «Начать заново» действительно очищает форму", async ({ page }) => {
  // Аудит Д-5, Д-6.
  await loginAs(page, "d.kovalev");
  await page.goto("/requests/new");
  const phone = page.getByLabel("Телефон для связи");
  await expect(phone).toHaveValue("+7 (922) 111-22-33");
  await phone.fill("+7 900 000-11-22");
  await expect(page.getByText(/Черновик сохранён в/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Продолжаем черновик/)).toBeVisible();
  await expect(page.getByLabel("Телефон для связи")).toHaveValue("+7 900 000-11-22");

  await page.getByRole("button", { name: "Начать заново" }).click();
  const dialog = page.getByRole("dialog", { name: "Удалить черновик?" });
  await dialog.getByRole("button", { name: "Удалить черновик" }).click();
  await expect(page.getByLabel("Телефон для связи")).toHaveValue("+7 (922) 111-22-33");

  await page.reload();
  await expect(page.getByText(/Продолжаем черновик/)).toHaveCount(0);
  await expect(page.getByLabel("Телефон для связи")).toHaveValue("+7 (922) 111-22-33");
});

test("уход со страницы с несохранёнными изменениями требует решения", async ({ page }) => {
  // Аудит UX-13.
  await loginAs(page, "i.titov");
  await page.goto("/requests/new");
  await page.getByLabel("Структурное подразделение").fill("Отдел закупок, сектор тендеров");
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("link", { name: "Мои заявки" }).click();
  const dialog = page.getByRole("dialog", { name: "Изменения ещё не сохранены" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Сохранить и перейти" }).click();
  await expect(page.getByRole("heading", { name: "Мои заявки" })).toBeVisible();
  await expect(page.getByText("Есть незавершённая заявка")).toBeVisible();
});

test("файлы: имя с разметкой выводится как текст, запрещённый тип отклоняется", async ({ page }) => {
  // Аудит Д-3.
  await loginAs(page, "m.fedorova");
  await page.goto("/requests/new");
  await page.getByLabel("Структурное подразделение").fill("Отдел ПБОТОС");
  await page.getByLabel("Телефон для связи").fill("4417");
  await page.getByLabel("Регион").selectOption({ label: "Головной офис" });
  await page.getByLabel("Даю согласие на обработку").check();
  await page.getByRole("button", { name: /Далее/ }).click();
  await page.getByRole("radio", { name: "Новая автоматизация", exact: true }).check();
  await page.getByRole("radio", { name: "ПБОТОС", exact: true }).check();
  await page.getByRole("button", { name: /Далее/ }).click();
  for (const [label, value] of [
    ["Как процесс выполняется сейчас", "Журнал ведётся на бумаге"],
    ["Что именно требует автоматизации и почему", "Сроки не контролируются"],
    ["Как процесс должен работать после автоматизации", "Напоминания о сроках"],
    ["Кто получит выгоду", "Специалисты по охране труда"],
    ["Кто получает результат процесса", "Главный специалист"],
  ]) {
    await page.getByLabel(label).fill(value);
  }
  await page.getByRole("button", { name: /Далее/ }).click();

  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: "акт.<IFRAME SRC=//evil>", mimeType: "text/html", buffer: Buffer.from("x") });
  await expect(page.getByText("не загружен: такой тип файлов не принимается")).toBeVisible();

  await input.setInputFiles({ name: "журнал <img src=x onerror=alert(1)>.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("xlsx") });
  const file = page.getByRole("list", { name: "Приложенные файлы" }).getByRole("listitem");
  await expect(file).toContainText("журнал <img src=x onerror=alert(1)>.xlsx");
  await expect(page.locator(".files img")).toHaveCount(0);
});

test("поиск в «Моих заявках» находит заявку по словам из текста", async ({ page }) => {
  // Аудит БЛ-3 и Д-1.
  await loginAs(page, "o.smirnova");
  await page.goto("/requests");
  const search = page.getByRole("searchbox", { name: "Поиск" });
  await search.fill("корреспонденции");
  await expect(page.getByText("Найдено: 1 заявка")).toBeVisible();
  await expect(page).toHaveURL(/q=%D0%BA/);
  await expect(page.getByRole("link", { name: /AUT-2026-000001/ })).toBeVisible();

  await search.fill("путевые листы");
  await expect(page.getByRole("heading", { name: "Ничего не найдено" })).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(page.getByRole("link", { name: /AUT-2026-000006/ })).toHaveCount(0); // чужая заявка не видна
  await expectNoSeriousA11yViolations(page);
});

test("администратор сортирует реестр и выгружает его в Excel", async ({ page }) => {
  // Аудит БЛ-4, UX-9.
  await loginAs(page, "s.orlov");
  await page.goto("/admin/registry");
  const header = page.getByRole("columnheader", { name: "Номер" });
  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator("tbody tr").first()).toContainText("AUT-2026-000001");
  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator("tbody tr").first()).toContainText(/AUT-2026-0000(1[0-9]|[2-9][0-9])/);

  await page.getByLabel("Требуют внимания").selectOption("overdue");
  await expect(page.getByRole("link", { name: OVERDUE_REVIEW })).toBeVisible();
  await expect(page.getByText(/Срок истёк \d+ рабоч\S+ (день|дня|дней) назад/).first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Выгрузить в Excel" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  await expectNoSeriousA11yViolations(page);
});

test("метка просроченного срока не выходит за рамку блока «Сроки и ответственный»", async ({ page }) => {
  await loginAs(page, "s.orlov");
  await openFromRegistry(page, OVERDUE_REVIEW);
  const card = page.getByRole("region", { name: "Сроки и ответственный" });
  const chip = card.getByText(/Срок истёк/);
  await expect(chip).toBeVisible();
  const cardBox = (await card.boundingBox())!;
  const chipBox = (await chip.boundingBox())!;
  expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
});

test("администратор принимает заявку в работу через диалог", async ({ page }) => {
  // Аудит БЛ-1: кнопки в модальных окнах не работали.
  await loginAs(page, "s.orlov");
  await openFromRegistry(page, OVERDUE_REVIEW);
  await page.getByRole("button", { name: "Принять в работу" }).click();

  const dialog = page.getByRole("dialog", { name: "Принять в работу" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Принять в работу" }).click();
  await expect(dialog.getByText("Укажите ответственного сотрудника или команду")).toBeVisible();

  await dialog.getByLabel("Ответственный").fill("Группа развития ИС");
  await dialog.getByLabel("Срок реализации").fill("2026-12-15");
  await dialog.getByLabel("Комментарий для заявителя").fill("Реализуем вместе с модулем транспорта");
  await dialog.getByRole("button", { name: "Принять в работу" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Статус заявки ${OVERDUE_REVIEW} изменён на «Принята в работу»`)).toBeVisible();
  await expect(page.locator(".page-head .badge")).toHaveText("Принята в работу");
  await expect(page.getByText("Реализуем вместе с модулем транспорта")).toBeVisible();
  await expect(page.getByRole("button", { name: "Изменить срок или ответственного" })).toBeVisible();
});

test("диалог закрывается клавишей Escape и возвращает фокус", async ({ page }) => {
  // Аудит A-4.
  await loginAs(page, "s.orlov");
  await openFromRegistry(page, VIEWED_REVIEW);
  const trigger = page.getByRole("button", { name: "Запросить уточнение" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Запросить уточнение" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Что нужно уточнить")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("заявитель дополняет заявку по запросу, черновик переживает перезагрузку", async ({ page }) => {
  // Аудит Д-5, UX-14.
  await loginAs(page, "g.ahmetova");
  await page.goto("/requests");
  await page.getByRole("link", { name: new RegExp(CLARIFICATION) }).click();
  await expect(page.getByText("Срок рассмотрения остановлен до ответа заявителя")).toBeVisible();
  await page.getByRole("button", { name: "Дополнить заявку" }).click();

  await expect(page.getByText("Что просит уточнить администратор")).toBeVisible();
  await page.getByRole("button", { name: /Описание процесса/ }).click();
  const process = page.getByLabel("Как процесс выполняется сейчас");
  await process.fill(`${await process.inputValue()} Пример бумажного заявления приложен, согласует начальник отдела.`);
  await expect(page.getByText(/Черновик сохранён в/)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /Описание процесса/ }).click();
  await expect(page.getByLabel("Как процесс выполняется сейчас")).toHaveValue(/согласует начальник отдела/);

  await page.getByRole("button", { name: /Проверка и отправка/ }).click();
  await page.getByLabel("Подтверждаю, что данные указаны верно").check();
  await page.getByRole("button", { name: "Отправить повторно" }).click();
  await expect(page.getByText(`Заявка ${CLARIFICATION} дополнена и снова отправлена на рассмотрение`)).toBeVisible();
  await expect(page.getByText(/Изменено: Текущий процесс|изменено: Текущий процесс/)).toBeVisible();
});

test("путь отклонённой заявки показывает пройденные этапы", async ({ page }) => {
  // Аудит Л-10.
  await loginAs(page, "s.orlov");
  await openFromRegistry(page, REJECTED);
  const steps = page.getByRole("list", { name: "Путь заявки" }).getByRole("listitem");
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText("пройдено");
  await expect(steps.nth(1)).toContainText("На рассмотрении — пройдено");
  await expect(steps.nth(2)).toContainText("Отклонена — заявка остановлена");
  await expectNoSeriousA11yViolations(page);
});

test("плитки дашборда складываются в общее число", async ({ page }) => {
  // Аудит Л-9.
  await loginAs(page, "s.orlov");
  await page.goto("/admin");
  const subtitle = await page.getByText(/Всего \d+ заяв/).textContent();
  const total = Number(subtitle!.match(/Всего (\d+)/)![1]);
  const groups = page.getByRole("region", { name: "Заявки по статусам" }).locator(".tile__value");
  const values = (await groups.allTextContents()).map(Number);
  expect(values.reduce((sum, value) => sum + value, 0)).toBe(total);
  await expectNoSeriousA11yViolations(page);
});

test("заявитель не попадает в разделы администратора", async ({ page }) => {
  await loginAs(page, "o.smirnova");
  await page.goto("/admin/registry");
  await expect(page.getByRole("heading", { name: "Раздел доступен администраторам" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Разделы" }).getByRole("link", { name: "Реестр заявок" })).toHaveCount(0);
});

test("на телефоне у страниц нет горизонтальной прокрутки", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await loginAs(page, "s.orlov");
  for (const path of ["/admin", "/admin/registry", "/admin/calendar", "/requests/new", "/notifications"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `горизонтальная прокрутка на ${path}`).toBeLessThanOrEqual(0);
  }
  await openFromRegistry(page, REJECTED);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
