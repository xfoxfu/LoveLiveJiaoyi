/// <reference path="./typings/main.d.ts" />
"use strict";

process.env.LL_CLIENT_VERSION = "25.4";

import Client from "llsifclient";
import config = require("./config");
import crypto = require("crypto-promise");
import xmlParser = require("xml2js");
import bluebird = require("bluebird");
import fs = require("fs");
import merge = require("merge");
const inquirer = require("inquirer");
const parse = bluebird.promisify(xmlParser.parseString);
const readDir = bluebird.promisify(fs.readdir);
const readFile = bluebird.promisify(fs.readFile);
const writeFile: Function = bluebird.promisify(fs.writeFile);
const delay = (ms: number) => new Promise(r => setTimeout(r, ms * 1000));
import * as numeral from "numeral";

namespace Store {
  export let accounts: IAccount[] = [];
  export let fetch = async () => {
    try {
      accounts = JSON.parse((await readFile(`${__dirname}/store.json`)).toString());
    } catch (err) {
      await writeFile(`${__dirname}/store.json`, "[]");
    }
  };
  export let save = async () => {
    await writeFile(`${__dirname}/store.json`, JSON.stringify(accounts));
  }
}
namespace lib {
  export let randomDecimal = (min: number, max: number) => Math.random() * (max - min) + min;
  export let randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min)) + min;
}

interface IAccount {
  key: string;
  pass: string;
  transfer?: {
    id: string;
    password: string;
  };
  expire?: string;
}
interface IXmlResult {
  map: {
    string:
    {
      _?: string;
      $: {
        name: string;
      }
    }[]
  }
}
const getAccountsFromXml = async (accounts: IAccount[]): Promise<void> => {
  // get files list
  let filePaths = await readDir(`${__dirname}/files`);
  console.log("Loaded files:");
  console.log(`${JSON.stringify(filePaths)}\n`);
  // get contents parsed
  let fileContents: IXmlResult[] = [];
  for (let filePath of filePaths) {
    fileContents.push(<IXmlResult>(await parse((await readFile(`${__dirname}/files/${filePath}`)).toString(), {})));
  }
  console.log("Loaded contents:");
  console.log(`${JSON.stringify(fileContents)}\n`);
  // adapt content to IAccount
  for (let file of fileContents) {
    let key: string, pass: string;
    for (let data of file.map.string) {
      if (data.$.name === "[LOVELIVE_ID]user_id") {
        key = data._;
      } else if (data.$.name === "[LOVELIVE_PW]passwd") {
        pass = data._;
      }
    }
    if ((!key) || (!pass)) {
      throw new Error("invaid input");
    }
    console.log(`发现用户key=${key}，pass=${pass}`);
    accounts.push({ key: key, pass: pass });
  }
};
const performLogin = async (accounts: IAccount[]): Promise<void> => {
  for (let account of accounts) {
    try {
      let client = new Client(account.key, account.pass);
      await client.startGame();
      console.log(`账户key=${account.key}登陆成功`);
    } catch (err) {
      console.log(`账户key=${account.key}登录失败，请检查或操作移除`);
      throw err;
    }
    delay(config["script_config"]["login_delay"]); // delay some time
  }
};
const performPlaySong = async (accounts: IAccount[]): Promise<void> => {
  for (let account of accounts) {
    try {
      let client = new Client(account.key, account.pass);
      await client.startGame();
      const song = 3; // live_difficulty_id
      let partyUsers = await client.live.getPartyUsers(song);
      let partyUid = partyUsers.party_list[
        lib.randomInt(0, partyUsers.party_list.length - 1)
      ].user_info.user_id;
      let decks = await client.live.getDecks(partyUid);
      let deck = decks.unit_deck_list[
        lib.randomInt(0, decks.unit_deck_list.length)
      ];
      await client.live.getSongInfo(song, partyUid, deck.unit_deck_id);
      await client.live.getReward(song,
        100, 0, 0, 0, 0,
        50, 100,
        25000, 0, 0,
        0, 0); // song information:
      // perfect,great,good,bad,miss
      // 绊pt, combo
      // smile 歌曲的分数, pure 歌曲的分数 ,cool 歌曲的分数 这里的意思是红歌只有 smile 分数，绿、蓝同理
      // 0,0 无马拉松活动
      console.log(`账户key=${account.key}打歌成功`);
    } catch (err) {
      console.log(`账户key=${account.key}打歌失败，请检查或操作移除`);
      throw err;
    }
    delay(config["script_config"]["login_delay"]); // delay some time
  }
};
const fillTransferCode = async (accounts: IAccount[]): Promise<void> => {
  for (let id in accounts) {
    let account = accounts[id];
    if (!account.transfer) {
      try {
        let client = new Client(account.key, account.pass);
        await client.startGame(); // start first, for speed can remove
        let result = await client.generateTransferCode();
        console.log(`账户key=${account.key}已取得继承码 ID=${result.id} PASS=${result.password}`);
        accounts[id] = merge(account, { transfer: result });
        delay(config["script_config"]["transfer_delay"]); // delay
      } catch (err) {
        console.log(`账户key=${account.key}无法取得继承码，错误原因`);
        console.error(err);
      }
    } else {
      console.log(`账户key=${account.key}已存在继承码`);
    }
  }
}
const addFromTransferCode = async (accounts: IAccount[], code: string): Promise<void> => {
  let client = await Client.startFromTransferCode(code);
  accounts.push({
    key: client.user.loginKey,
    pass: client.user.loginPasswd
  });
  console.log(`添加成功key=${client.user.loginKey}`);
};
const addAccount = async (accounts: IAccount[]): Promise<void> => {
  let client = await Client.register();
  accounts.push({
    key: client.user.loginKey,
    pass: client.user.loginPasswd
  });
  console.log(`注册成功key=${client.user.loginKey}`);
};

(async () => {
  await Store.fetch();
  /* await <string>((await inquirer.prompt([{
    type: "input",
    name: "key",
    message: "请直接按下回车开始脚本"
  }]))["key"]); */
  switch (<string>((await inquirer.prompt([{
    type: "list",
    name: "mode",
    message: "你想进行哪项操作？",
    default: "list",
    choices: [{
      name: "列出当前所有账户",
      value: "list"
    }, {
      name: "领取所有账户每日奖励",
      value: "login"
    },/* {
      name: "给所有账户打歌",
      value: "playsong"
    }, */{
      name: "注册新账户",
      value: "reg"
    }, {
      name: "从继承码导入账户",
      value: "transfer"
    }, {
      name: "补全账户的继承码",
      value: "fill"
    },/* {
      name: "重新生成继承码",
      value: "renew"
    }, */{
      name: "删除账户",
      value: "delete"
    },/* {
      name: "导入XML数据",
      value: "import"
    }, */{
      name: "导出XML数据",
      value: "export"
    }, {
      name: "列出当前所有账户的详细信息",
      value: "list-full"
    }]
  }]))["mode"])) {
    case "list":
    default: {
      console.log("|  id  | transfer_id | transfer_password |");
      console.log("| ---- | ----------- | ----------------- |");
      for (let id in Store.accounts) {
        const account = Store.accounts[id];
        console.log(`| ${numeral(id).format("0000")} |  ${account.transfer ? account.transfer.id : " UNKNOWN  "}  | ${account.transfer ? account.transfer.password : "    UNKNOWN     "}  |`);
      }
      break;
    }
    case "list-full": {
      console.log("|  id  | transfer_id  | login_key                            | login_passwd                                                                                                                     |");
      console.log("| ---- | ------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |");
      for (let id in Store.accounts) {
        const account = Store.accounts[id];
        console.log(`| ${numeral(id).format("0000")} |  ${account.transfer ? account.transfer.id : " UNKNOWN  "}  | ${account.key} | ${account.pass} |`);
      }
      break;
    }
    case "import": {
      await getAccountsFromXml(Store.accounts);
      await fillTransferCode(Store.accounts);
      break;
    }
    case "login": {
      await performLogin(Store.accounts);
      break;
    }
    case "reg": {
      let count = await <number>((await inquirer.prompt([{
        type: "input",
        name: "count",
        message: "账户个数？"
      }]))["count"])
      for (let i = 1; i <= count; i++) {
        await addAccount(Store.accounts);
        await Store.save();
        if (i !== count) {
          await delay(config["script_config"]["account_add_delay"]); // delay
        }
      }
      break;
    }
    case "transfer": {
      let codes = <string>((await inquirer.prompt([{
        type: "input",
        name: "code",
        message: "转移码？多个请用一个空格隔开。"
      }]))["code"]);
      for (let code of codes.split(" ")) {
        try {
          await addFromTransferCode(Store.accounts, code);
          await Store.save();
          await delay(config["script_config"]["transfer_add_delay"]); // delay
        } catch (err) {
          console.log(`添加失败${code}，错误原因${JSON.stringify(err)}`);
        }
      }
      break;
    }
    case "export": {
      for (let id in Store.accounts) {
        let account = Store.accounts[id];
        await writeFile(`${__dirname}/out/${id}.xml`, `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
<string name="[assets]version">MD5 (AppAssets.zip) = 351d0376f384c004b275cc3f74c55461</string>
<string name="[LOVELIVE_ID]user_id">${account.key}</string>
<string name="[LOVELIVE_PW]passwd">${account.pass}</string>
<string name="[GCM]registration_id"></string>
</map>
`);
      }
      break;
    }
    case "fill": {
      await fillTransferCode(Store.accounts);
      break;
    }
    case "delete": {
      let id = await <string>((await inquirer.prompt([{
        type: "input",
        name: "id",
        message: "账户ID？"
      }]))["id"]);
      Store.accounts.splice(+id, 1);
      break;
    }
    case "playsong": {
      await performPlaySong(Store.accounts);
      break;
    }
  }
  await Store.save();
})()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("==================ERROR================");
    console.log(err.message);
    console.error(err);
    if (err.response.request.uri.host === "llmcg.xfox.pw") {
      if (err.statusCode === 403 && err.error.error === "Request Time Limit Exceeded") {
        console.log("-------------------DETAIL----------------");
        console.log("您在http://llmcg.xfox.pw 的授权次数已用完，请及时续费。");
      } else if (err.statusCode === 403 && err.options.url === "http://llmcg.xfox.pw/api") {
        console.log("-------------------DETAIL----------------");
        console.log("您配置的http://llmcg.xfox.pw 的 token 无效，请检查 config.json 和网站给出的 token 是否一致。");
      } else {
        console.log("-------------------DETAIL----------------");
        console.log("http://llmcg.xfox.pw 可能是挂了，请联系管理员 llmcg@xfox.pw。");
      }
    } else {
      if (err.statusCode === 503) {
        console.log("-------------------DETAIL----------------");
        console.log("Love Live! 的接口出现了问题，请重试。");
      } else {
        console.log("-------------------DETAIL----------------");
        console.log("Love Live! 的接口出现了问题，请注意检查。");
        console.log("可能的原因：");
        console.log("1. 继承码无效");
        console.log("2. 配置文件中的 Client-Version 和服务器不匹配，请增加");
      }
    }
    process.exit(1);
  });