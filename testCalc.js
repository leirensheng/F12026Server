let calcActivity = require("./calcActivity.js");
let init = async () => {
  let res = await calcActivity("onlyOne", "all");
  console.log(res)
};
init()