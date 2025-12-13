const Koa = require("koa");
const Router = require("koa-router");
let { createClient } = require("redis");
const { koaBody } = require("koa-body");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const eventEmitter = require("events");
const eventBus = new eventEmitter();
let cmd = require("./cmd");
let cmd2 = require("./cmd2");
const websocket = require("koa-easy-ws");
let sleep = (time) => new Promise((r) => setTimeout(r, time));
const schedule = require("node-schedule");
const env = require("./env.json");
let startNext = require("./startNext");
const mainHostWithoutPort = require(`../${env.fileName}/mainHost`);

// let checkZones = require("../" + env.fileName + "/checkZones");
const child_process = require("child_process");
let phoneToEmail = {
  15521373109: "leirensheng@163.com",
  18124935302: "1114242862@qq.com",
  19128713692: "lrswcq@163.com",
  18027645865: "leirensheng2@126.com",
  18029400937: "leirensheng3@126.com",
  13427487572: "leirensheng4@126.com",
  13432225257: "leirensheng5@126.com",
  13734675894: "leirensheng6@126.com",
  16773109616: "leirensheng7@126.com",
  16773109618: "leirensheng8@126.com",
  16773109617: "leirensheng9@126.com",
  16773109613: "leirensheng10@126.com",
  17170565049: "leirensheng11@126.com",
  17170565054: "leirensheng12@126.com",
  17170565064: "leirensheng13@126.com",
  17170565074: "leirensheng14@126.com",
  17170565084: "leirensheng15@126.com",
  16747521733: "leirensheng16@126.com",
  16747521734: "leirensheng17@126.com",
  16747521735: "leirensheng18@126.com",
  16747521736: "leirensheng19@126.com",
  16555982641: "leirensheng20@126.com",
};
let {
  removeAudience,
  login,
  getAudience,
  addAudience,
  slaveDamaiHost,
} = require("../" + env.fileName + "/f1Utils");

const {
  getUUID,
  recover,
  startCmdAngGetPic,
  startCmdWithPidInfo,
  syncActivityInfo,
  updateProxyWhiteIp,
  removeConfig,
  readFile,
  writeFile,
  sendMsgForCustomer,
  getTime,
  getRunningUsers,
  sendAppMsg,
} = require("./utils");
let dest = path.resolve("../" + env.fileName + "/userData");
const { getComputerName } = require("../damai/utils");
let computer = getComputerName();
const termMap = new Map();
let redisClient;
let isFirstWorker = false;
let successTimer;
let successInfo;

let lockKey = async (key) => {
  await new Promise((r) => {
    eventBus.once("lockKeyDone" + key, r);
    process.send({ type: "lockKey", key });
  });
};

let unlockKey = async (key) => {
  await new Promise((r) => {
    eventBus.once("unlockKeyDone" + key, r);
    process.send({ type: "unlockKey", key });
  });
};

let checkLockKey = async (key) => {
  let isLock = await new Promise((r) => {
    eventBus.once("checkLockKeyDone" + key, r);
    process.send({ type: "checkLockKey", key });
  });
  return isLock;
};

let waitUnlockKey = async (key) => {
  let isLock = await checkLockKey(key);
  if (isLock) {
    let index = await new Promise((r) => {
      eventBus.once("unlockKeyDone" + key, r);
    });
    await sleep(10 * (index + 1)); //保证每个进程都解锁后等待时间不一样
    let isLock = await checkLockKey(key);
    if (isLock) {
      return waitUnlockKey(key);
    }
  }
};

let addPidToCmd = async (pid, cmd) => {
  let key = "pidToCmd" + env.fileName;
  await waitUnlockKey(key);
  await lockKey(key);
  let pidToCmd = await redisClient.get(key);
  pidToCmd = JSON.parse(pidToCmd);
  pidToCmd[pid] = cmd.trim();
  // console.log("写入redis", pid, cmd);
  await redisClient.set(key, JSON.stringify(pidToCmd));
  await unlockKey(key);
};

// 删除记录termMap、pidToCmdHa
let removePidInfo = async ({ user, pid }) => {
  let key = "pidToCmd" + env.fileName;
  await waitUnlockKey(key);
  await lockKey(key);
  let pidToCmd = await redisClient.get(key);
  pidToCmd = JSON.parse(pidToCmd);
  if (!pid) {
    pid = Object.keys(pidToCmd).find((pid) =>
      pidToCmd[pid].includes(`npm run start ${user}`)
    );
  }
  delete pidToCmd[pid];
  await redisClient.set(key, JSON.stringify(pidToCmd));
  await unlockKey(key);
  if (
    (typeof pid === "string" && !pid.includes("slave")) ||
    typeof pid === "number"
  ) {
    process.send({ type: "deletePid", pid });
  }
};

let closeByPid = async (pid) => {
  try {
    await new Promise((resolve) => {
      cmd2("taskkill /T /F /PID " + pid, (val) => {
        if (val === "done") {
          resolve();
        }
      });
    });
  } catch (e) {
    console.log(e);
  }
  await removePidInfo({ pid });
};

process.on(
  "message",
  async ({ msg, type, pid, cmd, uuid, key, isLock, index, nickname }) => {
    if (type === "processMsg") {
      eventBus.emit("processMsg" + pid, msg);
    } else if (type === "startCmd") {
      termMap.get(pid).send({ type: "startCmd", cmd });
    } else if (type === "deletePid") {
      termMap.delete(pid);
    } else if (type === "toggleConsole") {
      termMap.get(pid).send({ type: "toggle" });
    } else if (type === "setFirstWorker") {
      isFirstWorker = true;
    } else if (type === "realOpenMiddle") {
      let childProcess = child_process.fork("./openMiddleProcess.js", []);
      let pid = childProcess.pid;
      termMap.set(pid, childProcess);
      process.send({
        type: "initProcess",
        pid,
        uuid,
      });
      childProcess.on("message", (data) => {
        process.send({
          type: "processMsg",
          pid,
          msg: data,
        });
      });
      // console.log("\r\n新增进程", pid);
    } else if (type === "hasOpenGetPid") {
      eventBus.emit("hasOpenGetPid" + uuid, pid);
    } else if (type === "lockKeyDone") {
      eventBus.emit("lockKeyDone" + key);
    } else if (type === "unlockKeyDone") {
      eventBus.emit("unlockKeyDone" + key, index);
    } else if (type === "checkLockKeyDone") {
      eventBus.emit("checkLockKeyDone" + key, isLock);
    } else if (type === "setSuccess") {
      await new Promise((resolve) => {
        clearTimeout(successTimer);
        successInfo.push({ nickname });
        successTimer = setTimeout(async () => {
          let allConfig = await readFile("config.json");
          allConfig = JSON.parse(allConfig);
          let successNicknames = successInfo.map((one) => one.nickname);

          successInfo.forEach((obj) => {
            let { nickname } = obj;
            let config = allConfig[nickname];
            config.hasSuccess = true;
            delete obj.nickname;
          });
          let runningUsers = await getRunningUsers(redisClient);
          startNext(successNicknames, allConfig, runningUsers);

          successInfo = [];
          await writeFile("config.json", JSON.stringify(allConfig, null, 4));
          // await syncActivityInfo("userConfigAndSuccessRecord");
          resolve();
        }, 2000);
      });
    }
  }
);

let startSchedule = async () => {
  console.log("启动定时");
  let prePidToCmd;

  let savePidToCmd = async () => {
    let hasRecover = await redisClient.get("hasRecover" + env.fileName);

    let noRecover = await redisClient.get("noRecover" + env.fileName);

    if (hasRecover || noRecover) {
      let pidToCmdStr = await redisClient.get("pidToCmd" + env.fileName);

      if (pidToCmdStr && prePidToCmd !== pidToCmdStr && pidToCmdStr !== "{}") {
        console.log("pid不一致写入");
        await fs.writeFileSync(
          path.resolve(__dirname, "toRecover.json"),
          pidToCmdStr
        );
        prePidToCmd = pidToCmdStr;
      }
    }
  };

  schedule.scheduleJob("40 * * * * *", async () => {
    await savePidToCmd();
    // await checkZones();
  });
};

setTimeout(() => {
  if (isFirstWorker) {
    startSchedule();
    successInfo = [];
  }
}, 10000);
const app = new Koa();
const router = new Router();

app
  .use(async (ctx, next) => {
    await next();
    let ignoreUrls = ["/startUserFromRemote"];
    let noHandle =
      ignoreUrls.some((one) => ctx.request.url.includes(one)) || ctx.ws;
    if (noHandle) {
      return;
    }
    let data = ctx.body;
    if (!ctx.body || ctx.body.code === undefined) {
      ctx.body = {
        code: 0,
        data,
      };
    } else {
      ctx.body = data;
    }
  })
  .use(async (ctx, next) => {
    ctx.set("Access-Control-Allow-Origin", "*");
    ctx.set("Access-Control-Allow-Headers", "Content-Type");
    ctx.set("Access-Control-Allow-Methods", "*");
    await next();
  })
  .use(websocket())
  .use(
    koaBody({
      uploadDir: dest,
      multipart: true,
    })
  )
  .use(router.routes())
  .use(router.allowedMethods());

router.post("/addInfo", async (ctx) => {
  let obj = { ...ctx.request.body };
  let username = obj.username;

  let allConfig = await readFile("config.json");
  allConfig = JSON.parse(allConfig);
  // let configs = Object.values(allConfig);

  if (allConfig[username]) {
    throw new Error("已经有了");
  }

  allConfig[username] = obj;
  delete allConfig[username].username;

  await writeFile("config.json", JSON.stringify(allConfig, null, 4));
  await syncActivityInfo("userConfig");
  ctx.body = {
    username,
  };
});

//服务端初始化
router.get("/terminal", async (ctx, next) => {
  let pid = await new Promise((resolve) => {
    let uuid = getUUID();
    eventBus.once("hasOpenGetPid" + uuid, resolve);
    process.send({
      type: "toGetRealWorkToOpenMiddle",
      uuid,
    });
  });
  ctx.body = pid;
});

router.get("/closeAll", async (ctx, next) => {
  let pidToCmd = await redisClient.get("pidToCmd" + env.fileName);

  pidToCmd = JSON.parse(pidToCmd);

  Object.keys(pidToCmd).forEach((pid) => {
    if (!String(pid).includes("slave")) {
      cmd2("taskkill /T /F /PID " + pid);
      process.send({ type: "deletePid", pid });
    }
  });
  console.log("清除所有终端");
  ctx.body = "";
});

router.get("/stopUser/:user", async (ctx, next) => {
  const user = decodeURIComponent(ctx.params.user);
  const { isUseSlave, noStopChild } = ctx.query;

  let pidToCmd = await redisClient.get("pidToCmd" + env.fileName);
  pidToCmd = JSON.parse(pidToCmd);

  let pid = Object.keys(pidToCmd).find((pid) =>
    pidToCmd[pid].includes(`npm run start ${user}`)
  );
  if (!pid) {
    ctx.body = "";
    return;
  }
  if (pid && !pid.includes("slave")) {
    pid = Number(pid);
  }

  if (isUseSlave === "true") {
    await axios({
      method: "get",
      url: slaveDamaiHost + "/stopUser/" + encodeURIComponent(user),
      params: {
        noStopChild,
      },
    });
  } else {
    try {
      let args = noStopChild ? "/F" : "/T /F";
      await new Promise((resolve) => {
        cmd2(`taskkill ${args} /PID ` + pid, (val) => {
          if (val === "done") {
            setTimeout(() => {
              resolve();
            }, 2000);
          }
        });
      });
    } catch (e) {
      console.log(e);
    }
  }
  await removePidInfo({ user, pid });
  ctx.body = "";
});

router.post("/removeAudience", async (ctx, next) => {
  let { audience, phone } = ctx.request.body;
  try {
    let email = phoneToEmail[phone];
    let password = "hik12345";
    let {
      data: { accessToken: token },
    } = await login({ email, password });

    let res = await getAudience(token);
    let audienceList = res.map((one) => one.name);
    let index = audienceList.indexOf(audience);
    if (index === -1) {
      ctx.body = {
        code: -1,
        msg: "没有找到观演人",
      };
      return;
    }

    await removeAudience({
      token,
      audienceId: res[index].id,
    });

    audienceList.splice(index, 1);
    let config = await readFile("config.json");
    config = JSON.parse(config);

    await axios({
      url: `${mainHostWithoutPort}:${env.port}/updateAudienceInfo`,
      method: "post",
      data: {
        phone,
        audienceList,
      },
    });
    for (let name of Object.keys(config)) {
      let userConfig = config[name];
      if (Number(userConfig.phone) === Number(phone)) {
        let orders = userConfig.orders.map((one) => Number(one));
        let newOrders = orders
          .map((one) => {
            if (index < Number(one)) {
              return one - 1;
            } else if (index === Number(one)) {
              return "";
            } else if (index > Number(one)) {
              return one;
            }
          })
          .filter((one) => one !== "");

        userConfig.orders = newOrders;
      }
    }

    await writeFile("config.json", JSON.stringify(config, null, 4));
    await syncActivityInfo("userConfig");

    ctx.status = 200;
  } catch (e) {
    console.log(e);
    sendAppMsg(
      "出错",
      `【F1】删除用户过程出错【${phone}】删除${audience}` + e.message,
      {
        type: "error",
      }
    );
    ctx.body = {
      code: -1,
      msg: e.message,
    };
  }
});

router.post("/addAudience", async (ctx, next) => {
  let { phone, audience, number } = ctx.request.body;

  try {
    let email = phoneToEmail[phone];
    let password = "hik12345";
    let {
      data: { accessToken: token },
    } = await login({ email, password });

    await addAudience({
      token,
      name: audience,
      idNo: number,
    });

    let res = await getAudience(token);
    let audienceList = res.map((one) => one.name);
    await axios({
      url: `${mainHostWithoutPort}:${env.port}/updateAudienceInfo`,
      method: "post",
      data: {
        phone,
        audienceList,
      },
    });
    ctx.status = 200;
  } catch (e) {
    sendAppMsg(
      "出错",
      `F1新增用户过程出错【${phone}】新增${audience}` + e.message,
      {
        type: "error",
      }
    );
    ctx.body = {
      code: -1,
      msg: e.message,
    };
  }
});

router.get("/close/:pid", async (ctx, next) => {
  const pid = parseInt(ctx.params.pid);
  await closeByPid(pid);
  ctx.body = "";
});

router.get("/getAllUserConfig", async (ctx, next) => {
  let config = await readFile("config.json");
  let pidToCmd = await redisClient.get("pidToCmd" + env.fileName);
  pidToCmd = JSON.parse(pidToCmd);
  let obj = { config: JSON.parse(config), pidToCmd: pidToCmd };
  ctx.body = obj;
});

router.get("/getOneUserConfig/:user", async (ctx, next) => {
  let config = await readFile("config.json");
  ctx.body = JSON.parse(config)[ctx.params.user];
});

router.post("/setSuccess", async (ctx) => {
  process.send({ type: "setSuccess", nickname: ctx.request.body.nickname });
  ctx.status = 200;
});

router.get("/getAgentConfig", async (ctx, next) => {
  let config = await readFile("config.json");
  config = JSON.parse(config);
  let { agent } = ctx.query;
  let agentMap = await axios("http://mticket.ddns.net:4000/getAgentMap").then(
    ({ data }) => data.data
  );
  Object.keys(config).forEach((user) => {
    let target = config[user].remark?.includes(
      "代" + agentMap[agent].shortName
    );
    if (!target) {
      delete config[user];
    } else {
      config[user].oldRemark = config[user].remark;
      config[user].remark = config[user].remark.slice(5);
    }
  });

  let pidToCmd = await redisClient.get("pidToCmd" + env.fileName);
  pidToCmd = JSON.parse(pidToCmd);

  let obj = { config, pidToCmd };
  ctx.body = obj;
});

// 所有的命令都是在这里生成
router.get("/socket/:pid", async (ctx, next) => {
  if (!ctx.request.params.pid.includes("slave")) {
    if (ctx.ws) {
      const ws = await ctx.ws();

      const pid = parseInt(ctx.request.params.pid);
      process.send({
        pid,
        type: "openConsole",
      });

      eventBus.on("processMsg" + pid, (data) => {
        ws.send(data);
      });

      ws.on("message", async (data) => {
        console.log("命令", data.toString().trim());
        if (data.toString().trim()) {
          await addPidToCmd(pid, data.toString());
          process.send({ type: "startCmd", cmd: data.toString(), pid });
        }
      });
      ws.on("close", () => {
        try {
          process.send({ type: "closeConsole", pid });
          eventBus.off("processMsg" + pid);
        } catch (e) {
          // console.log()
        }
      });
    }
  }
});

router.get("/ping", (ctx, next) => {
  ctx.body = Date.now().toString();
});

router.get("/getAllAudienceInfo", async (ctx) => {
  let obj = await redisClient.get("audienceInfoFor" + env.fileName);
  ctx.body = JSON.parse(obj);
});

router.post("/updateAudienceInfo", async (ctx) => {
  let { phone, audienceList } = ctx.request.body;
  let audienceInfo = await redisClient.get("audienceInfoFor" + env.fileName);

  audienceInfo = JSON.parse(audienceInfo);

  let old = audienceInfo[phone];
  let isChange = false;
  if (!old) {
    isChange = true;
  } else if (old.length !== audienceList.length) {
    isChange = true;
  } else if (old.join("_") !== audienceList.join("_")) {
    isChange = true;
  }
  if (isChange) {
    audienceInfo[phone] = audienceList;
    await writeFile("audienceInfo.json", JSON.stringify(audienceInfo));

    await redisClient.set(
      "audienceInfoFor" + env.fileName,
      JSON.stringify(audienceInfo)
    );
    await syncActivityInfo("audienceInfo");
  }
  ctx.status = 200;
});

router.get("/getDnsIp", async (ctx, next) => {
  let { data: ip } = await axios("https://ipinfo.io/ip");
  ctx.body = ip;
});

router.post("/startUserFromRemote", async (ctx, next) => {
  let users = await getRunningUsers(redisClient);
  let { cmd, isUseSlave } = ctx.request.body;
  let willStart = cmd.split(/\s/)[3];
  let pidToCmd = await redisClient.get("pidToCmd" + env.fileName);
  pidToCmd = JSON.parse(pidToCmd);

  if (users.includes(willStart)) {
    let pid = Object.keys(pidToCmd).find((one) => pidToCmd[one] === cmd);
    ctx.body = {
      code: -1,
      msg: "已经启动了" + willStart,
      pid,
    };
    return;
  }

  if (isUseSlave) {
    let { data } = await axios({
      method: "post",
      data: { cmd },
      url: slaveDamaiHost + "/startUserFromRemote",
    });
    ctx.body = data;
    let pid;
    if (data.msg) {
      sendAppMsg("启动用户", "启动从机出错" + data.msg, { type: "error" });
      if (data.msg.includes("已经启动")) {
        pid = data.pid;
      }
    } else {
      pid = data.data.pid;
    }
    if (pid) {
      await addPidToCmd(`slave${pid}`, cmd);
    }
  } else {
    let isSuccess = false;
    let msg;
    let pid;
    try {
      let res = await startCmdWithPidInfo({
        cmd,
        successMsg: "全部打开完成",
        isStopWhenLogin: false,
      });
      pid = res.pid;
      msg = res.msg;
      isSuccess = true;
    } catch (e) {
      msg = e.message;
      console.log(e);
    }

    if (ctx.request.body.uid && isSuccess) {
      sendMsgForCustomer(ctx.request.body.toUserMsg, ctx.request.body.uid);
    }
    ctx.body = {
      code: isSuccess ? 0 : -1,
      msg,
      data: {
        pid,
      },
    };
  }
});

router.post("/resStartUser", async (ctx) => {
  let { username, isUseSlave } = ctx.request.body;
  await axios({
    timeout: 60000,
    url: mainHostWithoutPort + `:${env.port}/stopUser/` + username,
    data: {
      isUseSlave,
    },
  });
  await sleep(4000);
  await axios({
    method: "post",
    timeout: 40000,
    url: mainHostWithoutPort + `:${env.port}/startUserFromRemote/`,
    data: {
      isUseSlave,
      cmd: `npm run start ${username}`,
    },
  });
});

router.post("/saveSlavePid", async (ctx, next) => {
  let { cmds, pidToCmd: slavePidToCmd } = ctx.request.body;
  let key = "pidToCmd" + env.fileName;
  await waitUnlockKey(key);
  await lockKey(key);
  let pidToCmd = await redisClient.get(key);
  pidToCmd = JSON.parse(pidToCmd);

  cmds.forEach((cmd) => {
    let pid = Object.keys(slavePidToCmd).find(
      (pid) => slavePidToCmd[pid] === cmd
    );
    pidToCmd[`slave${pid}`] = cmd;
  });
  await redisClient.set(key, JSON.stringify(pidToCmd));
  await unlockKey(key);
  ctx.status = 200;
});

// 多种配置同步, 从对方的服务器同步
router.get("/syncActivityInfo/:type", async (ctx) => {
  let type = ctx.params.type;
  if (type.includes("userConfig")) {
    let {
      data: {
        data: { config },
      },
    } = await axios(slaveDamaiHost + "/getAllUserConfig");
    await writeFile("config.json", JSON.stringify(config, null, 4));
  } else if (type === "audienceInfo") {
    let {
      data: { data: audienceInfoFromRemote },
    } = await axios(slaveDamaiHost + "/getAllAudienceInfo");
    audienceInfo = audienceInfoFromRemote;
    await writeFile("audienceInfo.json", JSON.stringify(audienceInfo, null, 4));
  }
  ctx.status = 200;
});

router.post("/removeConfig", async (ctx, next) => {
  let { username } = ctx.request.body;
  console.log("删除用户" + username);
  await removeConfig(username, false);
  await syncActivityInfo("userConfig");
  ctx.status = 200;
});

router.post("/editConfig", async (ctx) => {
  const { username, config, isRefresh } = ctx.request.body;
  let obj = await readFile("config.json");
  obj = JSON.parse(obj);
  let oldConfig = obj[username];
  delete config[username];

  if (config.showOrders !== undefined) {
    config.orders = String(config.showOrders)
      .split(",")
      .map((one) => Number(one));
    delete config.showOrders;
  }
  if (config.uid) {
    config.uid = config.uid.replace("尊敬的用户，你的UID是：", "");
  }
  obj[username] = { ...oldConfig, ...config };
  // if (!config.only) {
  //   delete obj[username].only;
  // }

  if (isRefresh) {
    delete obj[username].skuIdToTypeMap;
    delete obj[username].activityName;
    obj[username].targetTypes = [];
  }
  await writeFile("config.json", JSON.stringify(obj, null, 4));
  await syncActivityInfo("userConfig");
  ctx.body = "ok";
});

router.get("/recover", async (ctx) => {
  let isRecovering = await redisClient.get("isRecovering" + env.fileName);

  if (isRecovering) {
    sendAppMsg("恢复", "正在恢复中", { type: "error" });
    ctx.body = "正在恢复中";
  } else {
    await redisClient.set("isRecovering" + env.fileName, 1);

    let failCmds = await recover(redisClient);
    if (failCmds.length) {
      await sendAppMsg("info", "启动失败的" + failCmds.join("__"));
    }
    await redisClient.set("hasRecover" + env.fileName, "1");
    ctx.body = failCmds;
    await redisClient.set("isRecovering" + env.fileName, "");
  }
});

router.post("/checkIsRunningUser", async (ctx) => {
  let arr = await getRunningUsers(redisClient);
  ctx.body = arr.includes(ctx.request.body.nickname);
});

let connectToRedis = async () => {
  redisClient = createClient();
  // .on("error", (err) => console.log("Redis Client Error", err))
  await redisClient.connect();
};

connectToRedis();
app.listen(env.port, "0.0.0.0");
console.log("server listening " + env.port);
