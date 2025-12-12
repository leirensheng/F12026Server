let puppeteer = require("puppeteer");
const fsExtra = require("fs-extra");
const path = require("path");
let { getCookieAndLocalStorage } = require("./utils");
let { login, sleep, checkIsNeedLogin, myClick } = require("../xingqiu/utils");

let start = async ({ phone, audience }) => {
  let browser;
  let userDataDir = path.resolve(
    __dirname,
    "./addOrRemoveAudience",
    phone.toString()
  );
  fsExtra.ensureDirSync(userDataDir);

  let init = async () => {
    browser = await puppeteer.launch({
      ignoreDefaultArgs: ["--enable-automation"],
      headless: false,
      isMobile: true,
      userDataDir,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--allow-running-insecure-content",
        "--disable-web-security",
      ],
    });
  };

  await init();
  let p1 = sleep(60000);
  let p2 = new Promise(async (resolve) => {
    let page = await browser.newPage();

    await getCookieAndLocalStorage(page, phone);
    let isInLoginPage = await checkIsNeedLogin(page, true);
    if (isInLoginPage) {
      console.log("==========需要登陆===============");

      await login(page, phone.toString(), browser);
    } else {
      await page.close();
    }

    page = await browser.newPage();
    await page.setViewport({
      width: 640,
      height: 480,
      deviceScaleFactor: 1,
    });

    let { audienceList, ids } = await new Promise(async (resolve) => {
      page.waitForResponse(async (response) => {
        let isOk = response.request().url().includes("user_audiences");
        if (isOk) {
          let body = await response.text();
          let { data } = JSON.parse(body);
          resolve({
            audienceList: data.map((one) => one.name),
            ids: data.map((one) => one.id),
          });
        }
        return isOk;
      });
      page.goto("https://m.piaoxingqiu.com/viewer");
    });

    console.log(audienceList);

    let index = audienceList.findIndex((one) => one === audience);
    let hasTarget = index !== -1;
    if (hasTarget) {
      audienceList.splice(index, 1);
      console.log(audienceList, index);
      await page.goto(
        `https://m.piaoxingqiu.com/package-user/pages/audience-modification/audience-modification?audienceId=${ids[index]}&pageSource=audienceList`
      );
      await myClick(page, ".delete-btn");
      await myClick(page, ".uni-modal .uni-modal__btn_primary");
      console.log("删除成功");
    } else {
      console.log("没有" + audience);
    }

    await sleep(1000);
    resolve({ index, audienceList });
  });

  let res = await Promise.race([p1, p2]);
  await browser.close();

  if (!res) {
    throw new Error("超时");
  }
  return res;
};

module.exports = start;
