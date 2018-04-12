/// <reference path="./typings/main.d.ts" />
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
process.env.LL_CLIENT_VERSION = "25.4";
const llsifclient_1 = require("llsifclient");
const config = require("./config");
const xmlParser = require("xml2js");
const bluebird = require("bluebird");
const fs = require("fs");
const merge = require("merge");
const inquirer = require("inquirer");
const parse = bluebird.promisify(xmlParser.parseString);
const readDir = bluebird.promisify(fs.readdir);
const readFile = bluebird.promisify(fs.readFile);
const writeFile = bluebird.promisify(fs.writeFile);
const delay = (ms) => new Promise(r => setTimeout(r, ms * 1000));
const numeral = require("numeral");
var Store;
(function (Store) {
    Store.accounts = [];
    Store.fetch = () => __awaiter(this, void 0, void 0, function* () {
        try {
            Store.accounts = JSON.parse((yield readFile(`${__dirname}/store.json`)).toString());
        }
        catch (err) {
            yield writeFile(`${__dirname}/store.json`, "[]");
        }
    });
    Store.save = () => __awaiter(this, void 0, void 0, function* () {
        yield writeFile(`${__dirname}/store.json`, JSON.stringify(Store.accounts));
    });
})(Store || (Store = {}));
var lib;
(function (lib) {
    lib.randomDecimal = (min, max) => Math.random() * (max - min) + min;
    lib.randomInt = (min, max) => Math.floor(Math.random() * (max - min)) + min;
})(lib || (lib = {}));
const getAccountsFromXml = (accounts) => __awaiter(this, void 0, void 0, function* () {
    // get files list
    let filePaths = yield readDir(`${__dirname}/files`);
    console.log("Loaded files:");
    console.log(`${JSON.stringify(filePaths)}\n`);
    // get contents parsed
    let fileContents = [];
    for (let filePath of filePaths) {
        fileContents.push((yield parse((yield readFile(`${__dirname}/files/${filePath}`)).toString(), {})));
    }
    console.log("Loaded contents:");
    console.log(`${JSON.stringify(fileContents)}\n`);
    // adapt content to IAccount
    for (let file of fileContents) {
        let key, pass;
        for (let data of file.map.string) {
            if (data.$.name === "[LOVELIVE_ID]user_id") {
                key = data._;
            }
            else if (data.$.name === "[LOVELIVE_PW]passwd") {
                pass = data._;
            }
        }
        if ((!key) || (!pass)) {
            throw new Error("invaid input");
        }
        console.log(`发现用户key=${key}，pass=${pass}`);
        accounts.push({ key: key, pass: pass });
    }
});
const performLogin = (accounts) => __awaiter(this, void 0, void 0, function* () {
    for (let account of accounts) {
        try {
            let client = new llsifclient_1.default(account.key, account.pass);
            yield client.startGame();
            console.log(`账户key=${account.key}登陆成功`);
        }
        catch (err) {
            console.log(`账户key=${account.key}登录失败，请检查或操作移除`);
            throw err;
        }
        delay(config["script_config"]["login_delay"]); // delay some time
    }
});
const performPlaySong = (accounts) => __awaiter(this, void 0, void 0, function* () {
    for (let account of accounts) {
        try {
            let client = new llsifclient_1.default(account.key, account.pass);
            yield client.startGame();
            const song = 3; // live_difficulty_id
            let partyUsers = yield client.live.getPartyUsers(song);
            let partyUid = partyUsers.party_list[lib.randomInt(0, partyUsers.party_list.length - 1)].user_info.user_id;
            let decks = yield client.live.getDecks(partyUid);
            let deck = decks.unit_deck_list[lib.randomInt(0, decks.unit_deck_list.length)];
            yield client.live.getSongInfo(song, partyUid, deck.unit_deck_id);
            yield client.live.getReward(song, 100, 0, 0, 0, 0, 50, 100, 25000, 0, 0, 0, 0); // song information:
            // perfect,great,good,bad,miss
            // 绊pt, combo
            // smile 歌曲的分数, pure 歌曲的分数 ,cool 歌曲的分数 这里的意思是红歌只有 smile 分数，绿、蓝同理
            // 0,0 无马拉松活动
            console.log(`账户key=${account.key}打歌成功`);
        }
        catch (err) {
            console.log(`账户key=${account.key}打歌失败，请检查或操作移除`);
            throw err;
        }
        delay(config["script_config"]["login_delay"]); // delay some time
    }
});
const fillTransferCode = (accounts) => __awaiter(this, void 0, void 0, function* () {
    for (let id in accounts) {
        let account = accounts[id];
        if (!account.transfer) {
            try {
                let client = new llsifclient_1.default(account.key, account.pass);
                yield client.startGame(); // start first, for speed can remove
                let result = yield client.generateTransferCode();
                console.log(`账户key=${account.key}已取得继承码 ID=${result.id} PASS=${result.password}`);
                accounts[id] = merge(account, { transfer: result });
                delay(config["script_config"]["transfer_delay"]); // delay
            }
            catch (err) {
                console.log(`账户key=${account.key}无法取得继承码，错误原因`);
                console.error(err);
            }
        }
        else {
            console.log(`账户key=${account.key}已存在继承码`);
        }
    }
});
const addFromTransferCode = (accounts, code) => __awaiter(this, void 0, void 0, function* () {
    let client = yield llsifclient_1.default.startFromTransferCode(code);
    accounts.push({
        key: client.user.loginKey,
        pass: client.user.loginPasswd
    });
    console.log(`添加成功key=${client.user.loginKey}`);
});
const addAccount = (accounts) => __awaiter(this, void 0, void 0, function* () {
    let client = yield llsifclient_1.default.register();
    accounts.push({
        key: client.user.loginKey,
        pass: client.user.loginPasswd
    });
    console.log(`注册成功key=${client.user.loginKey}`);
});
(() => __awaiter(this, void 0, void 0, function* () {
    yield Store.fetch();
    /* await <string>((await inquirer.prompt([{
      type: "input",
      name: "key",
      message: "请直接按下回车开始脚本"
    }]))["key"]); */
    switch (((yield inquirer.prompt([{
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
                },
                {
                    name: "注册新账户",
                    value: "reg"
                }, {
                    name: "从继承码导入账户",
                    value: "transfer"
                }, {
                    name: "补全账户的继承码",
                    value: "fill"
                },
                {
                    name: "删除账户",
                    value: "delete"
                },
                {
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
            yield getAccountsFromXml(Store.accounts);
            yield fillTransferCode(Store.accounts);
            break;
        }
        case "login": {
            yield performLogin(Store.accounts);
            break;
        }
        case "reg": {
            let count = yield ((yield inquirer.prompt([{
                    type: "input",
                    name: "count",
                    message: "账户个数？"
                }]))["count"]);
            for (let i = 1; i <= count; i++) {
                yield addAccount(Store.accounts);
                yield Store.save();
                if (i !== count) {
                    yield delay(config["script_config"]["account_add_delay"]); // delay
                }
            }
            break;
        }
        case "transfer": {
            let codes = ((yield inquirer.prompt([{
                    type: "input",
                    name: "code",
                    message: "转移码？多个请用一个空格隔开。"
                }]))["code"]);
            for (let code of codes.split(" ")) {
                try {
                    yield addFromTransferCode(Store.accounts, code);
                    yield Store.save();
                    yield delay(config["script_config"]["transfer_add_delay"]); // delay
                }
                catch (err) {
                    console.log(`添加失败${code}，错误原因${JSON.stringify(err)}`);
                }
            }
            break;
        }
        case "export": {
            for (let id in Store.accounts) {
                let account = Store.accounts[id];
                yield writeFile(`${__dirname}/out/${id}.xml`, `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
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
            yield fillTransferCode(Store.accounts);
            break;
        }
        case "delete": {
            let id = yield ((yield inquirer.prompt([{
                    type: "input",
                    name: "id",
                    message: "账户ID？"
                }]))["id"]);
            Store.accounts.splice(+id, 1);
            break;
        }
        case "playsong": {
            yield performPlaySong(Store.accounts);
            break;
        }
    }
    yield Store.save();
}))()
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
        }
        else if (err.statusCode === 403 && err.options.url === "http://llmcg.xfox.pw/api") {
            console.log("-------------------DETAIL----------------");
            console.log("您配置的http://llmcg.xfox.pw 的 token 无效，请检查 config.json 和网站给出的 token 是否一致。");
        }
        else {
            console.log("-------------------DETAIL----------------");
            console.log("http://llmcg.xfox.pw 可能是挂了，请联系管理员 llmcg@xfox.pw。");
        }
    }
    else {
        if (err.statusCode === 503) {
            console.log("-------------------DETAIL----------------");
            console.log("Love Live! 的接口出现了问题，请重试。");
        }
        else {
            console.log("-------------------DETAIL----------------");
            console.log("Love Live! 的接口出现了问题，请注意检查。");
            console.log("可能的原因：");
            console.log("1. 继承码无效");
            console.log("2. 配置文件中的 Client-Version 和服务器不匹配，请增加");
        }
    }
    process.exit(1);
});
