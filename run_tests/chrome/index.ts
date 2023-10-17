import puppeteer, { Browser, BrowserContext, Page } from "puppeteer";
import { BrowserNames } from "../const";
import { BrowserDriver } from "../driver";
import assert from "assert";

let browser: Browser | null;
let browserContext: BrowserContext | null;
let mainPage: Page | null;

const assertNotNull = <T>(subject: T | null): T => {
  assert(subject !== null, `${typeof subject} was null`);
  return subject;
};

const operateEspruinoPage = async (page: Page, deviceName: string) => {
  // dismiss "welcome" modal
  await page.locator("#guiders_overlay").click();
  // have to wait for the overlay to transition out 😞
  await Promise.race([
    // should work based on page css
    page.waitForSelector(`#guiders_overlay[style*="display: none;"]`),
    // but in case not this might catch it
    new Promise((res) => setTimeout(res, 500)),
  ]);
  // click connect icon in top left
  await page.locator("#icon-connection").click();
  // click bluetooth button
  await page.locator('#portselector a[title="Web Bluetooth"]').click();
  //
  //
  // THIS CRASHES RIGHT NOW DUE TO https://github.com/puppeteer/puppeteer/issues/11072
  // -----------------------------------
  // click "Web Bluetooth" button in modal
  // const [devicePrompt] = await Promise.all([
  //   page.waitForDevicePrompt(),
  //   page.locator('#portselector a[title="Web Bluetooth"]').click(),
  // ]);
  // devicePrompt.select(
  //   await devicePrompt.waitForDevice(({ name }) => name.match(/puck/) !== null),
  // );
  // -----------------------------------
  //
  //

  // JS version
  // const device = await page.evaluate((deviceName) => {
  //   return new Promise((res) => {
  //     navigator.bluetooth
  //       .requestDevice({
  //         filters: [{ name: deviceName }],
  //       })
  //       .then(res);
  //   });
  // }, deviceName);
  // console.log(device);

  // wait for connection to finish
  await Promise.all([
    page.waitForFunction(
      () =>
        (document.querySelector(".status__message") as HTMLElement)?.innerText
          .toUpperCase()
          .startsWith("CONNECTED TO"),
    ),
    page.waitForSelector("#portselector", { hidden: true }),
  ]);
  // select "flash" upload destination
  await page.locator("#icon-deploy > .icon__more").click();
  await page.locator('#sendmethod a[title="Flash"]').click();
  // wait for modal to go away
  await page.waitForSelector("#sendmethod", { hidden: true });
  // click deploy button
  await page.locator("#icon-deploy").click();
  // wait for status to say 'done'
  await page.waitForFunction(
    () =>
      (
        document.querySelector(".status__message") as HTMLElement
      )?.innerText.toUpperCase() == "SENT",
  );
};

export const chromeDriver: BrowserDriver = {
  name: BrowserNames.CHROME,
  initialize: async () => {
    browser = await puppeteer.launch({
      headless: false,
      args: ["--no-startup-window"],
      waitForInitialPage: false,
    });
  },
  createSession: async (pageUrl: string) => {
    browserContext =
      await assertNotNull(browser).createIncognitoBrowserContext();
    mainPage = await browserContext.newPage();
    await mainPage.goto(pageUrl);
  },
  uploadDeviceCode: async (deviceName: string) => {
    // open espruino tab
    await assertNotNull(mainPage).locator("#btn_load_code").click();
    const target = await assertNotNull(browserContext).waitForTarget(
      (t) => t.url().match(/espruino\.com/) !== null,
    );
    const espruinoPage = await target?.page();
    if (!espruinoPage) {
      throw "couldn't find loaded espruino page";
    }
    await espruinoPage.bringToFront();
    await operateEspruinoPage(espruinoPage, deviceName);
    await espruinoPage.close();
  },
  runInBrowserTest: async () => {
    const page = assertNotNull(mainPage);
    await page.bringToFront();
    // press "start test" button
    await page.locator("#btn_start_test").click();
    // TODO: bluetooth prompt navigation

    // wait for result area to say PASS (or FAIL)
    await page.waitForFunction(
      () =>
        (document.querySelector("#test_result") as HTMLElement)?.innerText
          .length > 0,
    );
    // grab test output in page
    const result = await Promise.all([
      await page.$eval(
        "#test_result",
        (el): string => (el as HTMLElement).innerText,
      ),
      await page.$eval(
        "#status",
        (el): string => (el as HTMLElement).innerText,
      ),
    ]);
    return { result: result[0], logs: result[1] };
  },
  endSession: async () => {
    await assertNotNull(browserContext).close();
    browserContext = null;
  },
  shutdown: async () => {
    await assertNotNull(browser).close();
    browser = null;
  },
};
